const mongoose = require('mongoose')

const whatsappSessionSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  phoneNumber: { 
    type: String, 
    required: true 
  },
  displayName: { 
    type: String,
    default: 'WhatsApp User'
  },
  isConnected: { 
    type: Boolean, 
    default: false 
  },
  sessionData: { 
    type: String
  },
  status: {
    type: String,
    enum: ['PENDING', 'CONNECTED', 'DISCONNECTED'],
    default: 'PENDING'
  },
  qrCode: {
    type: String
  },
  qrExpiry: {
    type: Date
  },
  connectedAt: {
    type: Date
  },
  lastActivityAt: {
    type: Date
  },
  isMultiDevice: {
    type: Boolean,
    default: true
  },
  clientType: {
    type: String,
    default: 'OPENWA'
  },
  lastError: {
    type: String
  },
  sessionId: {
    type: String,
  },
  lastActive: { 
    type: Date, 
    default: Date.now 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
})

// Update updatedAt on save
whatsappSessionSchema.pre('save', function() {
  this.updatedAt = new Date();
});

// unique constraint per user and phone number (but allow multiple 'Pending...' accounts)
whatsappSessionSchema.index(
  { userId: 1, phoneNumber: 1 }, 
  { unique: true, partialFilterExpression: { phoneNumber: { $ne: 'Pending...' } } }
);
whatsappSessionSchema.index({ userId: 1 });
whatsappSessionSchema.index({ phoneNumber: 1 });
whatsappSessionSchema.index({ isConnected: 1 });

module.exports = mongoose.model('WhatsAppSession', whatsappSessionSchema)
