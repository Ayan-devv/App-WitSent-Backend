const mongoose = require('mongoose');

const internalWarmerSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  accountIds: [{ type: String }],
  accountCount: { type: Number, required: true },

  // Configuration
  duration: { type: Number, required: true }, // minutes
  minMessageDelay: { type: Number, default: 3 }, // seconds
  maxMessageDelay: { type: Number, default: 12 }, // seconds
  replyDelayMin: { type: Number, default: 5 }, // seconds
  replyDelayMax: { type: Number, default: 15 }, // seconds
  conversationStyle: { type: String, enum: ['friendly', 'business', 'casual'], default: 'friendly' },
  randomizeDelays: { type: Boolean, default: true },

  // Status
  status: {
    type: String,
    enum: ['PENDING', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'STOPPED'],
    default: 'PENDING'
  },
  startedAt: { type: Date },
  completedAt: { type: Date },
  pausedAt: { type: Date },

  // Progress & Stats
  totalConversations: { type: Number, default: 0 },
  totalMessagesSent: { type: Number, default: 0 },
  totalMessagesReceived: { type: Number, default: 0 },
  totalMessagesFailed: { type: Number, default: 0 },
  successRate: { type: Number },

  // Per-account stats (stored as JSON string for simplicity with Mongoose)
  accountStats: { type: mongoose.Schema.Types.Mixed, default: {} },

}, { timestamps: true });

internalWarmerSchema.index({ userId: 1 });
internalWarmerSchema.index({ status: 1 });

module.exports = mongoose.model('InternalWarmer', internalWarmerSchema);
