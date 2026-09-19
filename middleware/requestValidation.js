const validateRequest = (req, res, next) => {
  // Check Content-Length
  const maxBodySize = parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024; // 10MB default
  const contentLength = parseInt(req.get('content-length')) || 0;
  
  if (contentLength > maxBodySize) {
    return res.status(413).json({
      success: false,
      error: 'Request body too large'
    });
  }
  
  // Check for suspicious patterns if it's JSON
  if (req.is('json')) {
      const bodyStr = JSON.stringify(req.body);
      
      // Alert if request is very large (1MB+)
      if (bodyStr.length > 1000000) {
        console.warn('⚠️ Large request detected:', {
          user: req.user?.id,
          size: bodyStr.length,
          endpoint: req.path
        });
      }
  }
  
  next();
};

module.exports = { validateRequest };
