const express = require('express');
const { getAccounts, logoutAccount, createPendingAccount } = require('../controllers/whatsapp.controller');
const { authenticate } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authenticate);

router.get('/accounts', getAccounts);
router.post('/accounts/pending', createPendingAccount);
router.post('/logout/:sessionId', logoutAccount);

module.exports = router;
