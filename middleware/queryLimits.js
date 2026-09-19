const queryLimits = (req, res, next) => {
  // Limit pagination
  const maxLimit = parseInt(process.env.MAX_QUERY_LIMIT) || 100; // Never return more than 100 items
  const defaultLimit = parseInt(process.env.DEFAULT_QUERY_LIMIT) || 20;
  
  req.limit = Math.min(
    parseInt(req.query.limit) || defaultLimit,
    maxLimit
  );
  
  req.page = Math.max(parseInt(req.query.page) || 1, 1);
  
  const maxPage = parseInt(process.env.MAX_PAGE_NUMBER) || 10000;
  // Prevent offset attacks
  if (req.page > maxPage) {
    return res.status(400).json({
      success: false,
      error: 'Page number too high'
    });
  }
  
  next();
};

module.exports = { queryLimits };
