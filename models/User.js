const mongoose = require('mongoose')

const userSchema = new mongoose.Schema({
  email: { 
    type: String, 
    unique: true, 
    required: true,
    lowercase: true,
    trim: true
  },
  name: { 
    type: String, 
    required: true 
  },
  password: { 
    type: String,
    required: false
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true
  },
  googleEmail: {
    type: String
  },
  whatsappNumber: {
    type: String
  },
  countryCode: {
    type: String
  },
  countryName: {
    type: String
  },
  phoneVerified: {
    type: Boolean,
    default: false
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  role: { 
    type: String, 
    enum: ['USER', 'ADMIN'], 
    default: 'USER' 
  },
  status: { 
    type: String, 
    enum: ['PENDING', 'APPROVED', 'REJECTED'], 
    default: 'APPROVED' 
  },
  plan: {
    type: String,
    enum: ['FREEMIUM', 'PREMIUM'],
    default: 'FREEMIUM'
  },
  approvedAt: {
    type: Date,
    default: Date.now
  },
  approvedBy: {
    type: String,
    default: null
  },
  planUpgradedAt: {
    type: Date,
    default: null
  },
  planUpgradedBy: {
    type: String,
    default: null
  },
  dailyMessageLimit: {
    type: Number,
    default: 50
  },
  totalMessagesSentToday: {
    type: Number,
    default: 0
  },
  lastMessageResetDate: {
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

userSchema.index({ status: 1 });
userSchema.index({ createdAt: -1 });

module.exports = mongoose.model('User', userSchema)
