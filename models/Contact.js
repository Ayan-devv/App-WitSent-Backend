const mongoose = require('mongoose')

const contactSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  phone: { 
    type: String, 
    required: true,
    trim: true
  },
  name: { 
    type: String 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
})

// Unique index: userId + phone
contactSchema.index({ userId: 1, phone: 1 }, { unique: true })
contactSchema.index({ userId: 1 })
contactSchema.index({ phone: 1 })
contactSchema.index({ createdAt: -1 })

module.exports = mongoose.model('Contact', contactSchema)
