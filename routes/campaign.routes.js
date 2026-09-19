const express = require('express');
const router = express.Router();
const {
    createCampaign,
    getCampaigns,
    getCampaignDetails,
    editCampaign,
    pauseCampaign,
    resumeCampaign,
    cancelCampaign,
    deleteCampaign,
    duplicateCampaign,
    exportCampaign,
    getSentPromotions
} = require('../controllers/campaign.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate');
const { createCampaignSchema } = require('../validators/campaign');
const { campaignLimiter } = require('../middleware/advancedRateLimiter');
const { queryLimits } = require('../middleware/queryLimits');

router.use(authenticate);

router.post('/', campaignLimiter, validate(createCampaignSchema), createCampaign);
router.get('/', queryLimits, getCampaigns);
router.get('/:id', getCampaignDetails);
router.put('/:id', editCampaign);
router.post('/:id/pause', pauseCampaign);
router.post('/:id/resume', resumeCampaign);
router.post('/:id/cancel', cancelCampaign);
router.delete('/:id', deleteCampaign);
router.post('/:id/duplicate', duplicateCampaign);
router.get('/:id/export', exportCampaign);
router.get('/:id/sent-promotions', getSentPromotions);

module.exports = router;
