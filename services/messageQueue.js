const MessageQueue = require('../models/MessageQueue');

class MessageQueueService {
  /**
   * Add message to queue
   */
  async addToQueue(campaignId, phoneNumber, message, promotion = null, mediaUrl = null, mediaType = null, mediaCaption = null) {
    try {
      const queueItem = await MessageQueue.create({
        campaignId,
        phoneNumber,
        promotionalId: promotion?._id ? promotion._id.toString() : (promotion?.id || null),
        message: (message || '').substring(0, 2000),
        mediaUrl: mediaUrl || promotion?.mediaUrl || null,
        mediaType: mediaType || promotion?.mediaType || null,
        mediaCaption: mediaCaption || promotion?.mediaCaption || null,
        status: 'PENDING',
        attempts: 0,
        maxAttempts: 5,
        nextRetryAt: new Date()
      });

      return queueItem;
    } catch (err) {
      console.error('Queue add error:', err);
      throw err;
    }
  }

  /**
   * Get pending messages ready to send for a specific campaign or across all campaigns
   */
  async getPendingMessages(campaignId = null, limit = 50) {
    try {
      const now = new Date();
      const filter = {
        status: { $in: ['PENDING', 'RETRY'] },
        nextRetryAt: { $lte: now },
        attempts: { $lt: 5 }
      };

      if (campaignId) {
        filter.campaignId = campaignId;
      }

      const messages = await MessageQueue.find(filter)
        .limit(limit)
        .sort({ nextRetryAt: 1 });

      return messages;
    } catch (err) {
      console.error('Get pending messages error:', err);
      return [];
    }
  }

  /**
   * Mark message as sent
   */
  async markAsSent(messageId) {
    try {
      await MessageQueue.updateOne(
        { _id: messageId },
        {
          status: 'SENT',
          sentAt: new Date()
        }
      );
    } catch (err) {
      console.error('Mark as sent error:', err);
    }
  }

  /**
   * Mark message as failed and schedule retry with exponential backoff
   */
  async markAsFailed(messageId, errorMsg) {
    try {
      const message = await MessageQueue.findById(messageId);
      if (!message) return;

      // Exponential backoff: 1min, 2min, 5min, 10min, 30min
      const backoffMinutes = [1, 2, 5, 10, 30];
      const nextDelay = backoffMinutes[message.attempts] || 60;
      const nextRetryAt = new Date(Date.now() + nextDelay * 60000);

      if (message.attempts >= 4) {
        // After 5 total attempts, mark permanently failed
        await MessageQueue.updateOne(
          { _id: messageId },
          {
            status: 'FAILED',
            attempts: message.attempts + 1,
            lastError: (errorMsg || 'Max retries reached').substring(0, 300)
          }
        );
      } else {
        // Schedule retry
        await MessageQueue.updateOne(
          { _id: messageId },
          {
            status: 'RETRY',
            attempts: message.attempts + 1,
            nextRetryAt,
            lastError: (errorMsg || 'Send failed').substring(0, 300)
          }
        );
      }
    } catch (err) {
      console.error('Mark as failed error:', err);
    }
  }

  /**
   * Get queue statistics for a campaign
   */
  async getQueueStats(campaignId) {
    try {
      const stats = {
        pending: await MessageQueue.countDocuments({ campaignId, status: 'PENDING' }),
        retry: await MessageQueue.countDocuments({ campaignId, status: 'RETRY' }),
        sent: await MessageQueue.countDocuments({ campaignId, status: 'SENT' }),
        failed: await MessageQueue.countDocuments({ campaignId, status: 'FAILED' })
      };
      return stats;
    } catch (err) {
      console.error('Get queue stats error:', err);
      return { pending: 0, retry: 0, sent: 0, failed: 0 };
    }
  }
}

module.exports = new MessageQueueService();
