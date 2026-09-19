const express = require('express');
const router = express.Router();
const {
    getContacts,
    uploadContacts,
    exportContacts,
    deleteAllContacts,
    getAllContactNumbers
} = require('../controllers/contact.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { upload } = require('../middleware/uploadLimits');
const { uploadLimiter } = require('../middleware/advancedRateLimiter');
const { queryLimits } = require('../middleware/queryLimits');

router.use(authenticate);

router.get('/', queryLimits, getContacts);
router.post('/upload', uploadLimiter, upload.single('file'), uploadContacts);
router.get('/export', exportContacts);
router.delete('/all', deleteAllContacts);
router.get('/all-numbers', getAllContactNumbers);

module.exports = router;
