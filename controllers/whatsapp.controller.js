const WhatsAppSession = require('../models/WhatsAppSession');
const ActivityLog = require('../models/ActivityLog');
const openwaService = require('../services/openwaService');
const fs = require('fs');
const path = require('path');

const getAccounts = async (req, res) => {
  try {
    // Auto-cleanup stale pending/disconnected sessions older than 3 minutes
    const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
    await WhatsAppSession.deleteMany({
      userId: req.user.id,
      isConnected: false,
      createdAt: { $lt: threeMinutesAgo }
    });

    const accounts = await WhatsAppSession.find({ userId: req.user.id }).sort({ createdAt: -1 });
    // Only return accounts that are connected (or valid existing accounts)
    const visibleAccounts = accounts.filter(a => a.isConnected);
    res.json({ success: true, accounts: visibleAccounts });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch accounts' });
  }
};

const createPendingAccount = async (req, res) => {
  try {
    // Clean up any existing unlinked pending sessions for this user first
    await WhatsAppSession.deleteMany({
      userId: req.user.id,
      isConnected: false
    });

    const uniquePendingId = `pending_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const session = await WhatsAppSession.create({
      userId: req.user.id,
      phoneNumber: uniquePendingId,
      displayName: 'New Account',
      isConnected: false
    });
    res.json({ success: true, session });
  } catch (error) {
    console.error('Failed to create pending account:', error);
    res.status(500).json({ success: false, error: 'Failed to create pending account: ' + error.message });
  }
};

const logoutAccount = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await WhatsAppSession.findOne({ _id: sessionId, userId: req.user.id });
    
    if (!session) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }

    await openwaService.disconnectSession(sessionId);

    // Delete session from DB
    await WhatsAppSession.findByIdAndDelete(sessionId);

    const { logActivity } = require('../services/activityLogger');
    await logActivity(req.user.id, 'whatsapp_disconnected', { phone: `+${session.phoneNumber}`, name: session.displayName });

    // Delete LocalAuth folder if exists
    const authPath = path.join(__dirname, '..', '.wwebjs_auth', `session-session-${sessionId}`);
    if (fs.existsSync(authPath)) {
        fs.rmSync(authPath, { recursive: true, force: true });
    }

    res.json({ success: true, message: 'Account disconnected' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ success: false, error: 'Failed to disconnect account' });
  }
};

module.exports = { getAccounts, logoutAccount, createPendingAccount };
