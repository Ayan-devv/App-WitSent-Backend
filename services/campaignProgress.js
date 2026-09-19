const CampaignProgress = require('../models/CampaignProgress');
const CampaignSnapshot = require('../models/CampaignSnapshot');
const Campaign = require('../models/Campaign');

class ProgressTracker {
  /**
   * Initialize progress tracking for a new campaign
   */
  async initProgress(campaignId) {
    try {
      let progress = await CampaignProgress.findOne({ campaignId });
      if (!progress) {
        progress = await CampaignProgress.create({
          campaignId,
          lastSentIndex: 0,
          totalSent: 0,
          totalFailed: 0,
          isPaused: false
        });
      }
      return progress;
    } catch (err) {
      console.error('Init progress error:', err);
      throw err;
    }
  }

  /**
   * Save progress checkpoint and snapshot periodically
   */
  async saveProgress(campaignId, lastSentIndex, sent, failed) {
    try {
      let progress = await CampaignProgress.findOne({ campaignId });
      if (!progress) {
        progress = await this.initProgress(campaignId);
      }

      await CampaignProgress.updateOne(
        { campaignId },
        {
          lastSentIndex,
          totalSent: sent,
          totalFailed: failed,
          lastSentAt: new Date()
        }
      );

      await Campaign.updateOne(
        { _id: campaignId },
        {
          sent,
          failed,
          lastProgressSave: new Date()
        }
      );

      // Save a snapshot every 10 messages
      if ((sent + failed) % 10 === 0 && (sent + failed) > 0) {
        await CampaignSnapshot.create({
          campaignId,
          status: 'RUNNING',
          sentCount: sent,
          failedCount: failed,
          snapshotAt: new Date(),
          timestamp: new Date()
        });
      }
    } catch (err) {
      console.error('Save progress error:', err);
    }
  }

  /**
   * Get last saved progress
   */
  async getProgress(campaignId) {
    try {
      const progress = await CampaignProgress.findOne({ campaignId });
      return progress || {
        lastSentIndex: 0,
        totalSent: 0,
        totalFailed: 0,
        isPaused: false
      };
    } catch (err) {
      console.error('Get progress error:', err);
      return { lastSentIndex: 0, totalSent: 0, totalFailed: 0, isPaused: false };
    }
  }

  /**
   * Pause campaign (on error or user request)
   */
  async pauseCampaign(campaignId, reason = 'Paused') {
    try {
      await CampaignProgress.updateOne(
        { campaignId },
        {
          isPaused: true,
          pausedAt: new Date(),
          pausedReason: reason
        }
      );

      await Campaign.updateOne(
        { _id: campaignId },
        { status: 'PAUSED' }
      );
    } catch (err) {
      console.error('Pause campaign error:', err);
    }
  }

  /**
   * Resume campaign from last stopped state
   */
  async resumeCampaign(campaignId) {
    try {
      const progress = await CampaignProgress.findOne({ campaignId });
      
      await CampaignProgress.updateOne(
        { campaignId },
        {
          isPaused: false,
          pausedAt: null,
          pausedReason: null,
          recoveryAttempts: (progress?.recoveryAttempts || 0) + 1
        }
      );

      await Campaign.updateOne(
        { _id: campaignId },
        { 
          status: 'RUNNING',
          isRecovering: true,
          recoveryStartedAt: new Date()
        }
      );

      return progress;
    } catch (err) {
      console.error('Resume campaign error:', err);
      throw err;
    }
  }
}

module.exports = new ProgressTracker();
