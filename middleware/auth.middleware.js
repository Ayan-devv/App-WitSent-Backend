const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authenticate = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '') || req.query.token;
  if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) throw new Error();
    
    if (user.status === 'PENDING') {
        return res.status(403).json({ success: false, error: 'Your account is pending admin approval' });
    }
    if (user.status === 'REJECTED') {
        return res.status(403).json({ success: false, error: 'Your account has been rejected. Please contact support.' });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ success: false, error: 'Invalid token' });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  next();
};

module.exports = { authenticate, requireAdmin };
