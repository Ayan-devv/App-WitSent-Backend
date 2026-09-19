const cron = require('node-cron');
const messageQueueService = require('../services/messageQueue');
const healthMonitor = require('../services/healthMonitor');
const Campaign = require('../models/Campaign');
const { executeCampaign } = require('../services/campaign.service');

const startRetryWorker = () => {
  // Every minute, check for campaigns with pending retries and run recovery
  cron.schedule('* * * * *', async () => {
    if (!healthMonitor.isOnline) {
      console.log('⏳ Retry worker: Network offline, skipping retry pass');
      return;
    }

    try {
      const runningOrPausedCampaigns = await Campaign.find({
        status: { $in: ['RUNNING', 'PAUSED'] }
      });

      for (const campaign of runningOrPausedCampaigns) {
        const stats = await messageQueueService.getQueueStats(campaign._id);
        
        // If campaign has pending retries or un-sent queued messages while online, resume/continue execution
        if (stats.retry > 0 || (campaign.status === 'RUNNING' && stats.pending > 0)) {
          console.log(`🔄 Retry worker: Processing queued retries for campaign ${campaign._id}`);
          executeCampaign(campaign._id.toString());
        }
      }
    } catch (err) {
      console.error('Retry worker error:', err);
    }
  });
};

module.exports = { startRetryWorker };
