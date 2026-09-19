const sanitize = (req, res, next) => {
  // Remove script tags and dangerous content
  const sanitizeString = (str) => {
    if (typeof str !== 'string') return str;
    return str
      .replace(/<script>/gi, '')
      .replace(/<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .trim();
  };

  // Sanitize req.body
  if (req.body) {
    for (let key in req.body) {
      if (typeof req.body[key] === 'string') {
        req.body[key] = sanitizeString(req.body[key]);
      } else if (Array.isArray(req.body[key])) {
         req.body[key] = req.body[key].map(item => typeof item === 'string' ? sanitizeString(item) : item);
      }
    }
  }

  next();
};

module.exports = { sanitize };
