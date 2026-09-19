const mongoose = require('mongoose')

const campaignSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  whatsappSessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WhatsAppSession',
    required: true
  },
  name: { 
    type: String, 
    required: true 
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
  scheduledAt: { 
    type: Date 
  },
  isScheduled: { 
    type: Boolean, 
    default: false 
  },
  totalContacts: { 
    type: Number, 
    default: 0 
  },
  sent: { 
    type: Number, 
    default: 0 
  },
  failed: { 
    type: Number, 
    default: 0 
  },
  status: { 
    type: String, 
    enum: ['DRAFT', 'SCHEDULED', 'RUNNING', 'COMPLETED', 'FAILED', 'PAUSED', 'CANCELLED'], 
    default: 'DRAFT' 
  },
  successRate: { 
    type: Number 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  },
  startedAt: { 
    type: Date 
  },
  completedAt: { 
    type: Date 
  },
  delay: {
    type: Number,
    default: 10
  },
  useRandomPromo: {
    type: Boolean,
    default: false
  },
  delayMode: {
    type: String,
    enum: ['fixed', 'random', 'batch'],
    default: 'fixed'
  },
  minMessageDelay: {
    type: Number,
    default: 5
  },
  maxMessageDelay: {
    type: Number,
    default: 10
  },
  batchSize: {
    type: Number,
    default: 10
  },
  batchDelay: {
    type: Number,
    default: 60
  },
  minBatchDelay: {
    type: Number,
    default: 30
  },
  maxBatchDelay: {
    type: Number,
    default: 120
  },
  randomizeDelay: {
    type: Boolean,
    default: true
  },
  randomizeBatchSize: {
    type: Boolean,
    default: false
  },
  minRandomBatchSize: {
    type: Number
  },
  maxRandomBatchSize: {
    type: Number
  },
  numbers: [{ type: String }],
  lastProgressSave: {
    type: Date
  },
  lastStatusCheck: {
    type: Date
  },
  isRecovering: {
    type: Boolean,
    default: false
  },
  recoveryStartedAt: {
    type: Date
  }
})

campaignSchema.index({ userId: 1 })
campaignSchema.index({ status: 1 })
campaignSchema.index({ createdAt: -1 })
campaignSchema.index({ userId: 1, createdAt: -1 })

module.exports = mongoose.model('Campaign', campaignSchema)
