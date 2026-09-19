const mongoose = require('mongoose');

const sentPromotionalLogSchema = new mongoose.Schema({
  campaignId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Campaign', 
    required: true 
  },
  phoneNumber: { 
    type: String, 
    required: true 
  },
  promotionalMessage: { 
    type: String,
    required: true
  },
  delayUsed: { 
    type: Number,
    required: true
  },
  batchNumber: { 
    type: Number,
    required: true
  },
  sentAt: { 
    type: Date, 
    default: Date.now 
  },
  status: { 
    type: String,
    enum: ['SENT', 'FAILED'],
    required: true
  }
});

sentPromotionalLogSchema.index({ campaignId: 1 });
sentPromotionalLogSchema.index({ phoneNumber: 1 });

module.exports = mongoose.model('SentPromotionalLog', sentPromotionalLogSchema);
