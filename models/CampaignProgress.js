const mongoose = require('mongoose');

const campaignProgressSchema = new mongoose.Schema({
  campaignId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign',
    required: true,
    unique: true
  },
  lastSentIndex: {
    type: Number,
    default: 0
  },
  lastSentAt: {
    type: Date
  },
  totalSent: {
    type: Number,
    default: 0
  },
  totalFailed: {
    type: Number,
    default: 0
  },
  isPaused: {
    type: Boolean,
    default: false
  },
  pausedAt: {
    type: Date
  },
  pausedReason: {
    type: String
  },
  lastError: {
    type: String
  },
  errorCount: {
    type: Number,
    default: 0
  },
  recoveryAttempts: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

module.exports = mongoose.model('CampaignProgress', campaignProgressSchema);
