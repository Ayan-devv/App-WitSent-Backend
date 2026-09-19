const mongoose = require('mongoose');

const messageQueueSchema = new mongoose.Schema({
  campaignId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign',
    required: true
  },
  phoneNumber: {
    type: String,
    required: true
  },
  promotionalId: {
    type: String
  },
  message: {
    type: String,
    required: true
  },
  mediaUrl: {
    type: String
  },
  mediaType: {
    type: String
  },
  mediaCaption: {
    type: String
  },
  status: {
    type: String,
    enum: ['PENDING', 'SENT', 'FAILED', 'RETRY'],
    default: 'PENDING'
  },
  attempts: {
    type: Number,
    default: 0
  },
  maxAttempts: {
    type: Number,
    default: 5
  },
  nextRetryAt: {
    type: Date,
    default: Date.now
  },
  lastError: {
    type: String
  },
  sentAt: {
    type: Date
  }
}, { timestamps: true });

messageQueueSchema.index({ campaignId: 1 });
messageQueueSchema.index({ status: 1 });
messageQueueSchema.index({ nextRetryAt: 1 });
messageQueueSchema.index({ campaignId: 1, status: 1 });

module.exports = mongoose.model('MessageQueue', messageQueueSchema);
