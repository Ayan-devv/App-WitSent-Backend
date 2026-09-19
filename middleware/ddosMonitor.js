const { monitorDDoS } = require('../services/ddosMonitor');

const ddosAlert = (req, res, next) => {
  if (monitorDDoS(req)) {
    return res.status(429).json({
      success: false,
      error: 'Too many requests. IP temporarily blocked.'
    });
  }
  
  next();
};

module.exports = { ddosAlert };
