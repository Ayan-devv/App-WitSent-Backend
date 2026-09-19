const router = require('express').Router();
const mongoose = require('mongoose');

router.get('/', async (req, res) => {
  try {
    const dbConnected = mongoose.connection.readyState === 1;
    
    res.json({
      success: true,
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: dbConnected ? 'connected' : 'disconnected',
      uptime: process.uptime(),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
      }
    });
  } catch (err) {
    res.status(503).json({
      success: false,
      status: 'error',
      error: err.message
    });
  }
});

module.exports = router;
