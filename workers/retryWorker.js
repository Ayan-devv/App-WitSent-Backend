const cron = require('node-cron');
const messageQueueService = require('../services/messageQueue');
const healthMonitor = require('../services/healthMonitor');
const Campaign = require('../models/Campaign');
const { executeCampaign, isExecutionActive } = require('../services/campaign.service');

const startRetryWorker = () => {
  // Every minute, check for campaigns with pending retries and run recovery
  cron.schedule('* * * * *', async () => {
    if (!healthMonitor.isOnline) {
      console.log('⏳ Retry worker: Network offline, skipping retry pass');
      return;
    }

    try {
      // Only process campaigns that are marked RUNNING (paused/completed/cancelled are handled explicitly)
      const runningCampaigns = await Campaign.find({
        status: 'RUNNING'
      });

      for (const campaign of runningCampaigns) {
        const cId = campaign._id.toString();

        // Concurrency guard: Skip if campaign is actively executing right now
        if (isExecutionActive(cId)) {
          continue;
        }

        const stats = await messageQueueService.getQueueStats(campaign._id);
        
        // If campaign has pending retries or un-sent queued messages while online, resume/continue execution
        if (stats.retry > 0 || stats.pending > 0) {
          console.log(`🔄 Retry worker: Resuming stalled/queued campaign ${cId}`);
          executeCampaign(cId);
        }
      }
    } catch (err) {
      console.error('Retry worker error:', err);
    }
  });
};

module.exports = { startRetryWorker };
