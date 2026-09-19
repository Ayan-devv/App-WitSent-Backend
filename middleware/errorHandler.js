const fs = require('fs');
const path = require('path');
const { log } = require('../services/logger');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const errorHandler = (err, req, res, next) => {
  const timestamp = new Date().toISOString();
  const errorLog = {
    timestamp,
    message: err.message,
    stack: err.stack,
    method: req.method,
    url: req.url,
    ip: req.ip,
    userId: req.user?.id || 'anonymous'
  };

  // Log to file
  fs.appendFileSync(
    path.join(logsDir, 'errors.log'),
    JSON.stringify(errorLog) + '\n'
  );
  
  // Use custom logger service as requested
  log('error', {
    error: err.message,
    route: req.url,
    method: req.method,
    userId: req.user?.id || 'anonymous'
  });

  // Log to console in development
  if (process.env.NODE_ENV !== 'production') {
    console.error('❌ Error:', err);
  }

  // Response
  const status = err.status || err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message;

  res.status(status).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { 
      stack: err.stack 
    })
  });
};

module.exports = errorHandler;
