const express = require('express');
const router = express.Router();
const {
    getDashboardStats,
    getWhatsAppStatus,
    getRecentCampaigns
} = require('../controllers/dashboard.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.use(authenticate);

router.get('/stats', getDashboardStats);
router.get('/whatsapp-status', getWhatsAppStatus);
router.get('/campaigns/recent', getRecentCampaigns);

module.exports = router;
