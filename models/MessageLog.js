const mongoose = require('mongoose');

const messageLogSchema = new mongoose.Schema({
  campaignId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  phoneNumber: {
    type: String,
    required: true
  },
  message: {
    type: String
  },
  status: {
    type: String, // SENT, FAILED, DELIVERED
    required: true
  },
  sentAt: {
    type: Date,
    default: Date.now
  }
});

messageLogSchema.index({ userId: 1 });
messageLogSchema.index({ phoneNumber: 1 });
messageLogSchema.index({ sentAt: -1 });
messageLogSchema.index({ campaignId: 1 });

module.exports = mongoose.model('MessageLog', messageLogSchema);
