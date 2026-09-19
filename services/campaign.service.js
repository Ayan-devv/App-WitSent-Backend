const cron = require('node-cron');
const Campaign = require('../models/Campaign');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const PromotionalMessage = require('../models/PromotionalMessage');
const SentPromotionalLog = require('../models/SentPromotionalLog');
const MessageQueue = require('../models/MessageQueue');

const openwaService = require('./openwaService');
const { logMessage } = require('./activityLogger');
const { randomizePromotions } = require('./promotionRandomizer');
const { calculateDelays } = require('./delayCalculator');
const healthMonitor = require('./healthMonitor');
const messageQueueService = require('./messageQueue');
const progressTracker = require('./campaignProgress');
const path = require('path');
const fs = require('fs');

const delay = ms => new Promise(res => setTimeout(res, ms));

const activeExecutions = new Map();
const isExecutionActive = (campaignId) => activeExecutions.get(campaignId) === true;

// Auto-resume paused campaigns when network comes back online
healthMonitor.on('online', async () => {
  console.log('🔄 Network online: Checking for paused campaigns to resume...');
  try {
    const pausedCampaigns = await Campaign.find({ status: 'PAUSED' });
    for (const campaign of pausedCampaigns) {
      const progress = await progressTracker.getProgress(campaign._id);
      if (progress && progress.pausedReason === 'internet_error') {
        console.log(`▶️ Auto-resuming campaign ${campaign._id} after internet restoration`);
        await progressTracker.resumeCampaign(campaign._id);
        executeCampaign(campaign._id.toString());
      }
    }
  } catch (err) {
    console.error('Error auto-resuming campaigns on network restoration:', err);
  }
});

const populateQueueIfEmpty = async (campaign, numbers, promos, numberPromoMap) => {
  const existingCount = await MessageQueue.countDocuments({ campaignId: campaign._id });
  if (existingCount > 0) return;

  console.log(`📋 Populating MessageQueue for campaign ${campaign._id} (${numbers.length} numbers)...`);

  for (let i = 0; i < numbers.length; i++) {
    const numStr = numbers[i];
    let msgToSend = campaign.message;
    let promoUsed = null;
    let mUrl = campaign.mediaUrl;
    let mType = campaign.mediaType;
    let mCap = campaign.mediaCaption;

    if (campaign.useRandomPromo && promos.length > 0) {
      promoUsed = numberPromoMap.get(numStr);
      if (promoUsed) {
        msgToSend = promoUsed.message;
        mUrl = promoUsed.mediaUrl;
        mType = promoUsed.mediaType;
        mCap = promoUsed.mediaCaption;
      }
    }

    await messageQueueService.addToQueue(
      campaign._id,
      numStr,
      msgToSend,
      promoUsed,
      mUrl,
      mType,
      mCap
    );
  }
};

const executeCampaign = async (campaignId) => {
  try {
    const campaign = await Campaign.findById(campaignId);
    if (!campaign || campaign.status === 'CANCELLED') return;

    const io = openwaService.io;

    // 1. Internet Health Check
    if (!healthMonitor.isOnline) {
      console.log(`⏳ Internet offline: Pausing campaign ${campaignId}`);
      await progressTracker.pauseCampaign(campaignId, 'internet_error');
      if (io) {
        io.to(`user-${campaign.userId}`).emit('campaign-paused', {
          campaignId,
          reason: 'No internet connection',
          canResume: true
        });
      }
      return;
    }

    // 2. WhatsApp Client Setup & Connection Check
    const stateRes = await openwaService.getSessionStatus(campaign.whatsappSessionId);
    if (!stateRes.success || !['CONNECTED', 'connected', 'ready', 'READY'].includes(stateRes.status)) {
      console.log(`Cannot execute campaign ${campaignId}: WhatsApp not connected`);
      await progressTracker.pauseCampaign(campaignId, 'wa_disconnected');
      if (io) {
        io.to(`user-${campaign.userId}`).emit('campaign-paused', {
          campaignId,
          reason: 'WhatsApp connection lost',
          canResume: true
        });
      }
      return;
    }

    // Mark active and initialize progress
    activeExecutions.set(campaignId, true);
    await Campaign.findByIdAndUpdate(campaignId, { status: 'RUNNING', startedAt: campaign.startedAt || new Date() });
    
    let progress = await progressTracker.getProgress(campaignId);
    if (!progress) {
      progress = await progressTracker.initProgress(campaignId);
    }

    const numbers = campaign.numbers;
    let promos = [];
    let numberPromoMap = new Map();

    if (campaign.useRandomPromo) {
      promos = await PromotionalMessage.find({ campaignId });
      if (promos.length > 0) {
        const result = randomizePromotions(promos, numbers);
        numberPromoMap = result.numberPromotionMap;
      }
    }

    // Ensure queue is populated
    await populateQueueIfEmpty(campaign, numbers, promos, numberPromoMap);

    let defaultMediaPath = null;
    let defaultMediaType = 'image';
    let defaultCaption = campaign.mediaCaption || '';
    if (!campaign.useRandomPromo && campaign.mediaUrl) {
      const filePath = path.join(__dirname, '..', 'uploads', campaign.mediaUrl);
      if (fs.existsSync(filePath)) {
        defaultMediaPath = filePath;
        defaultMediaType = campaign.mediaType?.includes('video') ? 'video' : (campaign.mediaType?.includes('audio') ? 'audio' : 'image');
      }
    }

    const delaySettings = calculateDelays({
      delayMode: campaign.delayMode || 'fixed',
      minMessageDelay: campaign.minMessageDelay || campaign.delay || 5,
      maxMessageDelay: campaign.maxMessageDelay || 10,
      batchSize: campaign.batchSize || 10,
      batchDelay: campaign.batchDelay || 60,
      minBatchDelay: campaign.minBatchDelay || 30,
      maxBatchDelay: campaign.maxBatchDelay || 120,
      randomizeDelay: campaign.randomizeDelay !== undefined ? campaign.randomizeDelay : true,
      randomizeBatchSize: campaign.randomizeBatchSize !== undefined ? campaign.randomizeBatchSize : false,
      minRandomBatchSize: campaign.minRandomBatchSize,
      maxRandomBatchSize: campaign.maxRandomBatchSize
    });

    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 5;
    let batchNumber = 1;
    let currentBatchProcessed = 0;
    const currentBatchSize = delaySettings.type === 'batch' ? delaySettings.getBatchSize() : 50;

    let sent = campaign.sent || 0;
    let failed = campaign.failed || 0;

    while (isExecutionActive(campaignId)) {
      // Check network health during execution loop
      if (!healthMonitor.isOnline) {
        console.log(`⏳ Internet dropped during execution for campaign ${campaignId}`);
        await progressTracker.pauseCampaign(campaignId, 'internet_error');
        if (io) {
          io.to(`user-${campaign.userId}`).emit('campaign-paused', {
            campaignId,
            reason: 'No internet connection',
            sent,
            failed
          });
        }
        break;
      }

      // Check daily limit
      const user = await User.findById(campaign.userId);
      const today = new Date().toDateString();
      const lastReset = user.lastMessageResetDate.toDateString();
      if (today !== lastReset) {
        user.totalMessagesSentToday = 0;
        user.lastMessageResetDate = new Date();
      }

      if (user.totalMessagesSentToday >= user.dailyMessageLimit) {
        if (io) io.to(`user-${campaign.userId}`).emit('daily-limit-reached', { message: 'Daily limit reached' });
        await progressTracker.pauseCampaign(campaignId, 'daily_limit_reached');
        break;
      }

      // Fetch next pending or retry messages from queue
      const pendingMessages = await messageQueueService.getPendingMessages(campaignId, 1);
      
      if (pendingMessages.length === 0) {
        // Check queue stats to see if completed
        const stats = await messageQueueService.getQueueStats(campaignId);
        if (stats.pending === 0 && stats.retry === 0) {
          console.log(`✅ Campaign ${campaignId} queue completed!`);
          break;
        } else {
          // All current items are scheduled for future retries
          await delay(5000);
          continue;
        }
      }

      const queueItem = pendingMessages[0];
      let number = queueItem.phoneNumber.replace(/[^0-9]/g, '');
      if (!number.endsWith('@c.us')) number = `${number}@c.us`;

      let messageToSend = queueItem.message;
      let mediaPath = defaultMediaPath;
      let mediaType = defaultMediaType;
      let captionToSend = queueItem.mediaCaption || defaultCaption;

      if (queueItem.mediaUrl) {
        const pPath = path.join(__dirname, '..', 'uploads', queueItem.mediaUrl);
        if (fs.existsSync(pPath)) {
          mediaPath = pPath;
          mediaType = queueItem.mediaType?.includes('video') ? 'video' : (queueItem.mediaType?.includes('audio') ? 'audio' : 'image');
        }
      }

      // Calculate delay before sending message
      let waitTime = 0;
      if (sent + failed > 0) {
        if (delaySettings.type === 'fixed') {
          waitTime = delaySettings.messageDelay;
        } else if (delaySettings.type === 'random') {
          waitTime = delaySettings.getDelay();
        } else if (delaySettings.type === 'batch') {
          waitTime = delaySettings.getMessageDelay();
        }
        await delay(waitTime);
      }

      try {
        if (mediaPath) {
          const res = await openwaService.sendMessageWithMedia(campaign.whatsappSessionId, number, captionToSend, mediaPath, mediaType);
          if (!res.success) throw new Error(res.error || 'Failed media send');
          if (messageToSend && messageToSend !== captionToSend && messageToSend !== '[Randomized Promotional Campaign]' && messageToSend !== '[Media Campaign]') {
             await delay(1500);
             const res2 = await openwaService.sendMessage(campaign.whatsappSessionId, number, messageToSend);
             if (!res2.success) throw new Error(res2.error || 'Failed text send after media');
          }
        } else {
          const res = await openwaService.sendMessage(campaign.whatsappSessionId, number, messageToSend);
          if (!res.success) throw new Error(res.error || 'Failed text send');
        }

        sent++;
        consecutiveErrors = 0;

        await messageQueueService.markAsSent(queueItem._id);
        
        if (campaign.useRandomPromo) {
           await SentPromotionalLog.create({
             campaignId,
             phoneNumber: number,
             promotionalMessage: (messageToSend || captionToSend || '').substring(0, 50),
             delayUsed: Math.floor(waitTime / 1000),
             batchNumber,
             status: 'SENT'
           });
        }
        await logMessage(campaignId, campaign.userId, number, 'SENT', messageToSend || captionToSend);
        
        user.totalMessagesSentToday += 1;
        await user.save();

      } catch (err) {
        console.error(`Failed to send to ${number}: ${err.message}`);
        failed++;
        consecutiveErrors++;

        await messageQueueService.markAsFailed(queueItem._id, err.message);

        if (campaign.useRandomPromo) {
           await SentPromotionalLog.create({
             campaignId,
             phoneNumber: number,
             promotionalMessage: (messageToSend || captionToSend || '').substring(0, 50),
             delayUsed: Math.floor(waitTime / 1000),
             batchNumber,
             status: 'FAILED'
           });
        }
        await logMessage(campaignId, campaign.userId, number, 'FAILED', messageToSend || captionToSend);

        if (consecutiveErrors >= maxConsecutiveErrors) {
          console.error(`Too many consecutive errors (${consecutiveErrors}). Pausing campaign ${campaignId}`);
          await progressTracker.pauseCampaign(campaignId, 'too_many_errors');
          if (io) {
            io.to(`user-${campaign.userId}`).emit('campaign-paused', {
              campaignId,
              reason: 'Too many consecutive sending errors',
              sent,
              failed
            });
          }
          break;
        }
      }

      // Save progress snapshot
      const totalProcessed = sent + failed;
      await progressTracker.saveProgress(campaignId, totalProcessed, sent, failed);

      if (io) {
        io.to(`user-${campaign.userId}`).emit('campaign-progress', { 
            campaignId,
            sent,
            total: numbers.length,
            failed,
            progress: Math.round((sent / numbers.length) * 100)
        });
      }

      currentBatchProcessed++;
      if (delaySettings.type === 'batch' && currentBatchProcessed >= currentBatchSize) {
         const batchWait = delaySettings.getBatchDelay();
         console.log(`⏳ Batch ${batchNumber} completed. Waiting ${Math.floor(batchWait / 1000)}s...`);
         await delay(batchWait);
         batchNumber++;
         currentBatchProcessed = 0;
      }
    }

    if (isExecutionActive(campaignId)) {
        const stats = await messageQueueService.getQueueStats(campaignId);
        if (stats.pending === 0 && stats.retry === 0) {
          const totalProcessed = sent + failed;
          const successRate = totalProcessed > 0 ? (sent / totalProcessed) * 100 : 0;
          
          await Campaign.findByIdAndUpdate(campaignId, { 
              status: 'COMPLETED', 
              completedAt: new Date(),
              sent,
              failed,
              successRate
          });
          
          if (io) io.to(`user-${campaign.userId}`).emit('campaign-completed', { campaignId, sent, total: numbers.length, failed });
          
          await ActivityLog.create({ userId: campaign.userId, action: 'Campaign Completed', details: `Sent ${sent} messages` });
          activeExecutions.delete(campaignId);
        }
    }

  } catch (error) {
    console.error('Error executing resilient campaign:', error);
    await progressTracker.pauseCampaign(campaignId, 'execution_error');
    activeExecutions.delete(campaignId);
  }
};

const pauseCampaignExecution = async (campaignId) => {
    activeExecutions.set(campaignId, false);
    await progressTracker.pauseCampaign(campaignId, 'user_paused');
};

const resumeCampaignExecution = async (campaignId) => {
    await progressTracker.resumeCampaign(campaignId);
    executeCampaign(campaignId);
};

const cancelCampaignExecution = async (campaignId) => {
    activeExecutions.set(campaignId, false);
    await Campaign.findByIdAndUpdate(campaignId, { status: 'CANCELLED' });
};

const startScheduler = () => {
    cron.schedule('* * * * *', async () => {
        try {
            const now = new Date();
            const campaigns = await Campaign.find({
                status: 'SCHEDULED',
                scheduledAt: { $lte: now }
            });
            for (const campaign of campaigns) {
                executeCampaign(campaign._id.toString());
            }
        } catch (error) {
            console.error('Scheduler error:', error);
        }
    });
};

module.exports = {
    executeCampaign,
    pauseCampaignExecution,
    resumeCampaignExecution,
    cancelCampaignExecution,
    startScheduler
};
