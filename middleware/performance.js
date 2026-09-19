const performance = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    if (duration > 5000) {
      console.warn(`⚠️ Slow request: ${req.method} ${req.url} took ${duration}ms`);
    }
  });
  
  next();
};

module.exports = { performance };
