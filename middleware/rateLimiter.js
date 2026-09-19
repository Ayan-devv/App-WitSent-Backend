const rateLimit = require('express-rate-limit');

// General API limiter
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes
  message: { success: false, error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// Signup limiter (strict)
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Max 5 signups per hour per IP
  message: { success: false, error: 'Too many signup attempts, try again later' },
  skipSuccessfulRequests: true // Don't count successful signups
});

// Login limiter (strict)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Max 10 login attempts
  message: { success: false, error: 'Too many login attempts, try again later' },
  skipSuccessfulRequests: true
});

// Campaign limiter
const campaignLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Max 10 campaigns per minute
  message: { success: false, error: 'Too many campaigns, slow down' },
  skipSuccessfulRequests: false
});

module.exports = {
  generalLimiter,
  signupLimiter,
  loginLimiter,
  campaignLimiter
};
