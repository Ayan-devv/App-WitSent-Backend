const Campaign = require('../models/Campaign');
const User = require('../models/User');
const PromotionalMessage = require('../models/PromotionalMessage');
const SentPromotionalLog = require('../models/SentPromotionalLog');
const { executeCampaign, pauseCampaignExecution, cancelCampaignExecution } = require('../services/campaign.service');
const { log } = require('../services/logger');
const fs = require('fs');
const path = require('path');

const createCampaign = async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      name, numbers, message, mediaFile, mediaCaption, delay, sendMode, scheduledAt, timezone, whatsappSessionId,
      promotions, delayMode, minMessageDelay, maxMessageDelay, batchSize, batchDelay,
      minBatchDelay, maxBatchDelay, randomizeDelay, randomizeBatchSize, minRandomBatchSize, maxRandomBatchSize
    } = req.body;

    if (!whatsappSessionId) {
      return res.status(400).json({ success: false, error: 'Please select a WhatsApp account' });
    }

    const user = await User.findById(userId);
    
    // Check daily limit and reset if necessary
    const today = new Date().toDateString();
    const lastReset = new Date(user.lastMessageResetDate).toDateString();
    
    let totalSentToday = user.totalMessagesSentToday;
    if (today !== lastReset) {
      totalSentToday = 0;
      await User.updateOne(
        { _id: userId },
        { totalMessagesSentToday: 0, lastMessageResetDate: new Date() }
      );
    }
    
    const messageCount = numbers.length;
    if (totalSentToday + messageCount > user.dailyMessageLimit) {
      return res.status(429).json({
        success: false,
        error: 'Daily message limit exceeded',
        remaining: user.dailyMessageLimit - totalSentToday
      });
    }
    
    if (messageCount > 5000) {
      return res.status(400).json({
        success: false,
        error: 'Cannot send more than 5000 messages at once'
      });
    }
    
    if (promotions && promotions.length > 0 && promotions.length < 2) {
       return res.status(400).json({ success: false, error: 'At least 2 promotional messages required if using randomization' });
    }

    const isScheduled = sendMode === 'schedule';
    const parsedScheduledAt = isScheduled ? new Date(scheduledAt) : null;
    
    let mediaUrl = null;
    let mediaType = null;

    if (mediaFile && mediaFile.base64) {
      const uploadDir = path.join(__dirname, '..', 'uploads');
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
      
      const fileName = `${Date.now()}-${mediaFile.fileName}`;
      const filePath = path.join(uploadDir, fileName);
      const buffer = Buffer.from(mediaFile.base64.split(',')[1], 'base64');
      fs.writeFileSync(filePath, buffer);
      
      mediaUrl = fileName;
      mediaType = mediaFile.mimeType;
    }

    const campaign = await Campaign.create({
        userId,
        whatsappSessionId,
        name: name || (isScheduled ? `Campaign ${parsedScheduledAt.toLocaleString()}` : 'Bulk Message Campaign'),
        message: message || mediaCaption || (promotions && promotions.length > 1 ? '[Randomized Promotional Campaign]' : '[Media Campaign]'),
        mediaUrl,
        mediaType,
        mediaCaption,
        numbers,
        totalContacts: numbers.length,
        delay: parseInt(delay) || 10,
        isScheduled,
        scheduledAt: parsedScheduledAt,
        status: isScheduled ? 'SCHEDULED' : 'RUNNING',
        useRandomPromo: promotions && promotions.length > 1,
        delayMode: delayMode || 'fixed',
        minMessageDelay: minMessageDelay || 5,
        maxMessageDelay: maxMessageDelay || 10,
        batchSize: batchSize || 10,
        batchDelay: batchDelay || 60,
        minBatchDelay: minBatchDelay || 30,
        maxBatchDelay: maxBatchDelay || 120,
        randomizeDelay: randomizeDelay !== undefined ? randomizeDelay : true,
        randomizeBatchSize: randomizeBatchSize !== undefined ? randomizeBatchSize : false,
        minRandomBatchSize,
        maxRandomBatchSize
    });

    if (promotions && promotions.length > 1) {
      for (let i = 0; i < promotions.length; i++) {
        const promo = promotions[i];
        
        let pMediaUrl = null;
        let pMediaType = null;
        if (promo.mediaFile && promo.mediaFile.base64) {
          const pFileName = `${Date.now()}-${promo.mediaFile.fileName}`;
          const pFilePath = path.join(__dirname, '..', 'uploads', pFileName);
          const pBuffer = Buffer.from(promo.mediaFile.base64.split(',')[1], 'base64');
          fs.writeFileSync(pFilePath, pBuffer);
          pMediaUrl = pFileName;
          pMediaType = promo.mediaFile.mimeType;
        }

        await PromotionalMessage.create({
          campaignId: campaign._id,
          order: i + 1,
          message: promo.message || promo.mediaCaption || '[Media Campaign]',
          mediaUrl: pMediaUrl,
          mediaType: pMediaType,
          mediaCaption: promo.mediaCaption
        });
      }
    }

    if (!isScheduled) {
      // Execute asynchronously
      executeCampaign(campaign._id.toString());
    }

    log('campaign', {
      userId: req.user.id,
      campaignId: campaign._id,
      action: 'created',
      contactCount: numbers.length
    });

    res.status(200).json({ success: true, campaign });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Failed to create campaign' });
  }
};

const getCampaigns = async (req, res) => {
    try {
        const userId = req.user.id;
        const { status } = req.query;

        const where = { userId };
        if (status && status !== 'All') {
            where.status = status;
        }

        const campaigns = await Campaign.find(where)
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, campaigns });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to fetch campaigns' });
    }
};

const getCampaignDetails = async (req, res) => {
    try {
        const campaign = await Campaign.findOne({
            _id: req.params.id, userId: req.user.id
        }).lean();
        if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });
        
        if (campaign.useRandomPromo) {
           campaign.promotions = await PromotionalMessage.find({ campaignId: campaign._id }).sort('order').lean();
        }
        
        res.status(200).json({ success: true, campaign });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error fetching campaign' });
    }
};

const editCampaign = async (req, res) => {
    try {
        const campaign = await Campaign.findOne({
            _id: req.params.id, userId: req.user.id
        });
        if (!campaign) return res.status(404).json({ success: false, error: 'Not found' });
        if (campaign.status !== 'DRAFT' && campaign.status !== 'SCHEDULED') {
            return res.status(400).json({ success: false, error: 'Cannot edit running or completed campaign' });
        }

        const { 
          name, numbers, message, mediaFile, mediaCaption, delay, sendMode, scheduledAt, timezone, whatsappSessionId,
          promotions, delayMode, minMessageDelay, maxMessageDelay, batchSize, batchDelay,
          minBatchDelay, maxBatchDelay, randomizeDelay, randomizeBatchSize, minRandomBatchSize, maxRandomBatchSize
        } = req.body;

        const isScheduled = sendMode === 'schedule';
        const parsedScheduledAt = isScheduled ? new Date(scheduledAt) : null;
        
        let mediaUrl = campaign.mediaUrl;
        let mediaType = campaign.mediaType;

        if (mediaFile && mediaFile.base64) {
          const uploadDir = path.join(__dirname, '..', 'uploads');
          if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
          
          const fileName = `${Date.now()}-${mediaFile.fileName}`;
          const filePath = path.join(uploadDir, fileName);
          const buffer = Buffer.from(mediaFile.base64.split(',')[1], 'base64');
          fs.writeFileSync(filePath, buffer);
          
          mediaUrl = fileName;
          mediaType = mediaFile.mimeType;
        } else if (mediaFile === null) {
          // Cleared media
          mediaUrl = null;
          mediaType = null;
        }

        const updated = await Campaign.findOneAndUpdate(
            { _id: campaign._id },
            { 
                whatsappSessionId,
                name: name || (isScheduled ? `Campaign ${parsedScheduledAt.toLocaleString()}` : 'Bulk Message Campaign'),
                message: message || mediaCaption || (promotions && promotions.length > 1 ? '[Randomized Promotional Campaign]' : '[Media Campaign]'),
                mediaUrl,
                mediaType,
                mediaCaption,
                numbers: numbers || campaign.numbers,
                totalContacts: numbers ? numbers.length : campaign.totalContacts,
                delay: delay !== undefined ? parseInt(delay) : campaign.delay,
                isScheduled,
                scheduledAt: parsedScheduledAt,
                status: isScheduled ? 'SCHEDULED' : 'DRAFT',
                useRandomPromo: promotions && promotions.length > 1,
                delayMode: delayMode || campaign.delayMode,
                minMessageDelay: minMessageDelay !== undefined ? minMessageDelay : campaign.minMessageDelay,
                maxMessageDelay: maxMessageDelay !== undefined ? maxMessageDelay : campaign.maxMessageDelay,
                batchSize: batchSize !== undefined ? batchSize : campaign.batchSize,
                batchDelay: batchDelay !== undefined ? batchDelay : campaign.batchDelay,
                minBatchDelay: minBatchDelay !== undefined ? minBatchDelay : campaign.minBatchDelay,
                maxBatchDelay: maxBatchDelay !== undefined ? maxBatchDelay : campaign.maxBatchDelay,
                randomizeDelay: randomizeDelay !== undefined ? randomizeDelay : campaign.randomizeDelay,
                randomizeBatchSize: randomizeBatchSize !== undefined ? randomizeBatchSize : campaign.randomizeBatchSize,
                minRandomBatchSize: minRandomBatchSize !== undefined ? minRandomBatchSize : campaign.minRandomBatchSize,
                maxRandomBatchSize: maxRandomBatchSize !== undefined ? maxRandomBatchSize : campaign.maxRandomBatchSize
            },
            { new: true }
        );

        if (updated.useRandomPromo && promotions) {
          await PromotionalMessage.deleteMany({ campaignId: campaign._id });
          
          for (let i = 0; i < promotions.length; i++) {
            const promo = promotions[i];
            
            let pMediaUrl = null;
            let pMediaType = null;
            
            if (promo.mediaFile && promo.mediaFile.base64) {
              const pFileName = `${Date.now()}-${promo.mediaFile.fileName}`;
              const pFilePath = path.join(__dirname, '..', 'uploads', pFileName);
              const pBuffer = Buffer.from(promo.mediaFile.base64.split(',')[1], 'base64');
              fs.writeFileSync(pFilePath, pBuffer);
              pMediaUrl = pFileName;
              pMediaType = promo.mediaFile.mimeType;
            } else if (promo.mediaUrl) {
               // Existing media kept
               pMediaUrl = promo.mediaUrl;
               pMediaType = promo.mediaType;
            }

            await PromotionalMessage.create({
              campaignId: campaign._id,
              order: i + 1,
              message: promo.message || promo.mediaCaption || '[Media Campaign]',
              mediaUrl: pMediaUrl,
              mediaType: pMediaType,
              mediaCaption: promo.mediaCaption
            });
          }
        } else if (!updated.useRandomPromo) {
          await PromotionalMessage.deleteMany({ campaignId: campaign._id });
        }

        res.status(200).json({ success: true, campaign: updated });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error editing campaign' });
    }
};

const pauseCampaign = async (req, res) => {
    try {
        const campaign = await Campaign.findOne({ _id: req.params.id, userId: req.user.id });
        if (!campaign || campaign.status !== 'RUNNING') return res.status(400).json({ success: false, error: 'Cannot pause' });
        
        await pauseCampaignExecution(campaign._id.toString());
        res.status(200).json({ success: true, message: 'Paused' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error' });
    }
};

const resumeCampaign = async (req, res) => {
    try {
        const campaign = await Campaign.findOne({ _id: req.params.id, userId: req.user.id });
        if (!campaign || campaign.status !== 'PAUSED') return res.status(400).json({ success: false, error: 'Cannot resume' });
        
        await Campaign.updateOne({ _id: campaign._id }, { status: 'RUNNING' });
        executeCampaign(campaign._id.toString());
        res.status(200).json({ success: true, message: 'Resumed' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error' });
    }
};

const cancelCampaign = async (req, res) => {
    try {
        const campaign = await Campaign.findOne({ _id: req.params.id, userId: req.user.id });
        if (!campaign) return res.status(404).json({ success: false, error: 'Not found' });
        
        await cancelCampaignExecution(campaign._id.toString());
        res.status(200).json({ success: true, message: 'Cancelled' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error' });
    }
};

const deleteCampaign = async (req, res) => {
    try {
        const campaign = await Campaign.findOne({ _id: req.params.id, userId: req.user.id });
        if (!campaign) return res.status(404).json({ success: false, error: 'Not found' });
        
        await cancelCampaignExecution(campaign._id.toString());
        await Campaign.deleteOne({ _id: campaign._id });
        res.status(200).json({ success: true, message: 'Deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error' });
    }
};

const duplicateCampaign = async (req, res) => {
    try {
        const campaign = await Campaign.findOne({ _id: req.params.id, userId: req.user.id });
        if (!campaign) return res.status(404).json({ success: false, error: 'Not found' });
        
        const duplicated = await Campaign.create({
            userId: req.user.id,
            whatsappSessionId: campaign.whatsappSessionId,
            name: `${campaign.name} (Copy)`,
            message: campaign.message,
            mediaUrl: campaign.mediaUrl,
            mediaType: campaign.mediaType,
            mediaCaption: campaign.mediaCaption,
            numbers: campaign.numbers,
            totalContacts: campaign.totalContacts,
            delay: campaign.delay,
            status: 'DRAFT'
        });
        res.status(200).json({ success: true, campaign: duplicated });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error' });
    }
};

const exportCampaign = async (req, res) => {
    try {
        const campaign = await Campaign.findOne({ _id: req.params.id, userId: req.user.id });
        if (!campaign) return res.status(404).json({ success: false, error: 'Not found' });
        
        const header = "Phone,Status\n";
        // To simplify, we just generate basic CSV from numbers since we aren't tracking individual message status in DB
        const sentNumbers = campaign.numbers.slice(0, campaign.sent);
        const failedNumbers = campaign.numbers.slice(campaign.sent, campaign.sent + campaign.failed);
        
        let csv = header;
        sentNumbers.forEach(n => csv += `${n},Sent\n`);
        failedNumbers.forEach(n => csv += `${n},Failed\n`);
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=campaign-${campaign._id}.csv`);
        res.status(200).send(csv);
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error' });
    }
};

const getSentPromotions = async (req, res) => {
  try {
    const logs = await SentPromotionalLog.find({
      campaignId: req.params.id
    });
    
    const summary = {
      totalSent: logs.length,
      promoDistribution: {},
      batchBreakdown: {}
    };
    
    logs.forEach(log => {
      summary.promoDistribution[log.promotionalMessage] = 
        (summary.promoDistribution[log.promotionalMessage] || 0) + 1;
      
      summary.batchBreakdown[log.batchNumber] = 
        (summary.batchBreakdown[log.batchNumber] || 0) + 1;
    });
    
    res.json({
      success: true,
      summary,
      logs: logs.slice(0, 100) // First 100
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Error fetching sent promotions' });
  }
};

module.exports = {
    createCampaign,
    getCampaigns,
    getCampaignDetails,
    editCampaign,
    pauseCampaign,
    resumeCampaign,
    cancelCampaign,
    deleteCampaign,
    duplicateCampaign,
    exportCampaign,
    getSentPromotions
};
