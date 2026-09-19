const express = require('express');
const { 
  getUsers, 
  deleteUser, 
  setDailyLimit, 
  getActivityLog, 
  getUserStats,
  upgradeUserPlan,
  getUserDetails,
  getCampaignNumbers,
  getCampaignMessages,
  getCampaignPromoStats,
  getDashboardStats,
  getDDoSStats
} = require('../controllers/admin.controller.js');
const { authenticate, requireAdmin } = require('../middleware/auth.middleware.js');

const router = express.Router();

router.use(authenticate, requireAdmin);

router.get('/dashboard-stats', getDashboardStats);
router.get('/security/ddos-stats', getDDoSStats);
router.get('/users', getUsers);
router.delete('/users/:id', deleteUser);
router.put('/users/:id/daily-limit', setDailyLimit);
router.get('/activity-log', getActivityLog);
router.get('/user-stats/:id', getUserStats);

router.put('/users/:id/plan', upgradeUserPlan); // Upgrade plan
router.get('/users/:id/details', getUserDetails); // User details view
router.get('/users/:id/campaigns/:campaignId/numbers', getCampaignNumbers); // View numbers for a campaign
router.get('/users/:id/campaigns/:campaignId/messages', getCampaignMessages); // View messages for a campaign
router.get('/users/:id/campaigns/:campaignId/promo-stats', getCampaignPromoStats); // View promo stats for a campaign

module.exports = router;
