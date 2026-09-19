const mongoose = require('mongoose');

const promotionalMessageSchema = new mongoose.Schema({
  campaignId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Campaign', 
    required: true 
  },
  order: { 
    type: Number 
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
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

promotionalMessageSchema.index({ campaignId: 1 });

module.exports = mongoose.model('PromotionalMessage', promotionalMessageSchema);
