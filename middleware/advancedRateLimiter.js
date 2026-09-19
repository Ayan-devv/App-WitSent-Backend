const rateLimit = require('express-rate-limit');

// Helper to safely extract client key (avoids IPv6 validation error)
const safeKey = (req) => req.user?.id || req.ip || 'anonymous';

// 1. General API Limiter
const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 10000,
  message: { success: false, error: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.user?.role === 'ADMIN',
  keyGenerator: safeKey,
  validate: false
});

// 2. Signup Limiter (STRICT)
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: parseInt(process.env.SIGNUP_LIMIT) || 5,
  message: { success: false, error: 'Too many signup attempts' },
  skipSuccessfulRequests: true,
  validate: false
});

// 3. Login Limiter (STRICT)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.LOGIN_LIMIT) || 10,
  message: { success: false, error: 'Too many login attempts. Try again later.' },
  skipSuccessfulRequests: true,
  keyGenerator: (req) => req.body?.email || safeKey(req),
  validate: false
});

// 4. Campaign Creation Limiter
const campaignLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: parseInt(process.env.CAMPAIGN_LIMIT) || 5,
  message: { success: false, error: 'Campaign creation rate limited' },
  keyGenerator: safeKey,
  validate: false
});

// 5. Message Sending Limiter (MOST CRITICAL)
const messageLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: parseInt(process.env.MESSAGE_LIMIT) || 3,
  message: { success: false, error: 'Message sending rate limited' },
  keyGenerator: safeKey,
  validate: false
});

// 6. Contact Upload Limiter
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: parseInt(process.env.UPLOAD_LIMIT) || 10,
  message: { success: false, error: 'Upload limit exceeded' },
  keyGenerator: safeKey,
  validate: false
});

// 7. API Query Limiter (expensive operations)
const queryLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 50,
  message: { success: false, error: 'Too many requests' },
  keyGenerator: safeKey,
  validate: false
});

module.exports = {
  generalLimiter,
  signupLimiter,
  loginLimiter,
  campaignLimiter,
  messageLimiter,
  uploadLimiter,
  queryLimiter
};
