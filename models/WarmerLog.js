const mongoose = require('mongoose');

const warmerLogSchema = new mongoose.Schema({
  warmerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InternalWarmer',
    required: true
  },
  senderSessionId: { type: String, required: true },
  receiverSessionId: { type: String, required: true },
  senderPhone: { type: String, required: true },
  receiverPhone: { type: String, required: true },
  senderName: { type: String, default: 'Account' },
  receiverName: { type: String, default: 'Account' },
  message: { type: String, required: true },
  messageType: { type: String, enum: ['INITIATION', 'REPLY'], required: true },
  sentAt: { type: Date, default: Date.now },
  deliveredAt: { type: Date },
  replyDelayMs: { type: Number },
  status: { type: String, enum: ['SENT', 'DELIVERED', 'FAILED'], default: 'SENT' },
  error: { type: String }
}, { timestamps: false });

warmerLogSchema.index({ warmerId: 1 });
warmerLogSchema.index({ sentAt: -1 });
warmerLogSchema.index({ warmerId: 1, sentAt: -1 });

module.exports = mongoose.model('WarmerLog', warmerLogSchema);
