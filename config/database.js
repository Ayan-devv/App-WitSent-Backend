const mongoose = require('mongoose')

async function connectDB() {
  try {
    await mongoose.connect(process.env.DATABASE_URL, {
      dbName: 'whatsapp_saas',
      maxPoolSize: 10,
      minPoolSize: 5,
      maxIdleTimeMS: 30000,
      serverSelectionTimeoutMS: 5000
    })
    console.log('✅ MongoDB connected')
  } catch (err) {
    console.error('❌ MongoDB connection error:', err)
    process.exit(1)
  }
}

module.exports = connectDB
