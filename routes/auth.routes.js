const express = require('express');
const { signup, login, getMe, changePassword, googleLogin, addWhatsApp } = require('../controllers/auth.controller.js');
const { authenticate } = require('../middleware/auth.middleware.js');

const { validate } = require('../middleware/validate');
const { signupSchema, loginSchema } = require('../validators/auth');
const { signupLimiter, loginLimiter } = require('../middleware/advancedRateLimiter');

const router = express.Router();

router.post('/signup', signupLimiter, validate(signupSchema), signup);
router.post('/login', loginLimiter, validate(loginSchema), login);
router.get('/me', authenticate, getMe);
router.put('/password', authenticate, changePassword);
router.post('/google-login', loginLimiter, googleLogin);
router.post('/add-whatsapp', authenticate, addWhatsApp);

module.exports = router;
