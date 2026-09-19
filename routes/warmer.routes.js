const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const InternalWarmer = require('../models/InternalWarmer');
const WarmerLog = require('../models/WarmerLog');
const WhatsAppSession = require('../models/WhatsAppSession');
const { executeWarmer, pauseWarmer, resumeWarmer, stopWarmer } = require('../services/warmer.service');

// GET /api/warmers - List all warmers for the current user
router.get('/', authenticate, async (req, res) => {
  try {
    const warmers = await InternalWarmer.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .lean();

    // Attach session info for each warmer
    const enrichedWarmers = await Promise.all(warmers.map(async (w) => {
      const sessions = await WhatsAppSession.find({ _id: { $in: w.accountIds } })
        .select('phoneNumber displayName isConnected')
        .lean();
      return { ...w, accounts: sessions };
    }));

    res.json({ warmers: enrichedWarmers });
  } catch (err) {
    console.error('Get warmers error:', err);
    res.status(500).json({ error: 'Failed to fetch warmers' });
  }
});

// GET /api/warmers/:id - Get single warmer with logs
router.get('/:id', authenticate, async (req, res) => {
  try {
    const warmer = await InternalWarmer.findOne({ _id: req.params.id, userId: req.user.id }).lean();
    if (!warmer) return res.status(404).json({ error: 'Warmer not found' });

    const sessions = await WhatsAppSession.find({ _id: { $in: warmer.accountIds } })
      .select('phoneNumber displayName isConnected')
      .lean();

    const logs = await WarmerLog.find({ warmerId: req.params.id })
      .sort({ sentAt: -1 })
      .limit(50)
      .lean();

    res.json({ warmer: { ...warmer, accounts: sessions }, logs });
  } catch (err) {
    console.error('Get warmer error:', err);
    res.status(500).json({ error: 'Failed to fetch warmer' });
  }
});

// POST /api/warmers - Create and start new warmer
router.post('/', authenticate, async (req, res) => {
  try {
    const {
      accountIds,
      duration,
      minMessageDelay = 3,
      maxMessageDelay = 12,
      replyDelayMin = 5,
      replyDelayMax = 15,
      conversationStyle = 'friendly',
      randomizeDelays = true
    } = req.body;

    if (!accountIds || accountIds.length < 2) {
      return res.status(400).json({ error: 'At least 2 accounts required for warming' });
    }

    if (!duration || duration < 10) {
      return res.status(400).json({ error: 'Duration must be at least 10 minutes' });
    }

    // Verify all accounts belong to this user and are connected
    const sessions = await WhatsAppSession.find({
      _id: { $in: accountIds },
      userId: req.user.id,
      isConnected: true
    });

    if (sessions.length < 2) {
      return res.status(400).json({ error: 'At least 2 connected accounts required for warming' });
    }

    const validAccountIds = sessions.map(s => s._id.toString());

    const warmer = await InternalWarmer.create({
      userId: req.user.id,
      accountIds: validAccountIds,
      accountCount: validAccountIds.length,
      duration,
      minMessageDelay,
      maxMessageDelay,
      replyDelayMin,
      replyDelayMax,
      conversationStyle,
      randomizeDelays,
      status: 'RUNNING',
      startedAt: new Date()
    });

    // Start warmer engine in background (non-blocking)
    executeWarmer(warmer._id.toString()).catch(err => {
      console.error('Warmer execution error:', err);
    });

    res.status(201).json({ message: 'Warmer started successfully', warmer });
  } catch (err) {
    console.error('Create warmer error:', err);
    res.status(500).json({ error: 'Failed to create warmer' });
  }
});

// POST /api/warmers/:id/pause
router.post('/:id/pause', authenticate, async (req, res) => {
  try {
    const warmer = await InternalWarmer.findOne({ _id: req.params.id, userId: req.user.id });
    if (!warmer) return res.status(404).json({ error: 'Warmer not found' });
    if (warmer.status !== 'RUNNING') return res.status(400).json({ error: 'Warmer is not running' });

    await pauseWarmer(req.params.id);
    res.json({ message: 'Warmer paused' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to pause warmer' });
  }
});

// POST /api/warmers/:id/resume
router.post('/:id/resume', authenticate, async (req, res) => {
  try {
    const warmer = await InternalWarmer.findOne({ _id: req.params.id, userId: req.user.id });
    if (!warmer) return res.status(404).json({ error: 'Warmer not found' });
    if (warmer.status !== 'PAUSED') return res.status(400).json({ error: 'Warmer is not paused' });

    await resumeWarmer(req.params.id);
    res.json({ message: 'Warmer resumed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to resume warmer' });
  }
});

// POST /api/warmers/:id/stop
router.post('/:id/stop', authenticate, async (req, res) => {
  try {
    const warmer = await InternalWarmer.findOne({ _id: req.params.id, userId: req.user.id });
    if (!warmer) return res.status(404).json({ error: 'Warmer not found' });

    await stopWarmer(req.params.id);
    res.json({ message: 'Warmer stopped' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to stop warmer' });
  }
});

// DELETE /api/warmers/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const warmer = await InternalWarmer.findOne({ _id: req.params.id, userId: req.user.id });
    if (!warmer) return res.status(404).json({ error: 'Warmer not found' });

    await stopWarmer(req.params.id);
    await WarmerLog.deleteMany({ warmerId: req.params.id });
    await InternalWarmer.findByIdAndDelete(req.params.id);

    res.json({ message: 'Warmer deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete warmer' });
  }
});

// GET /api/warmers/:id/logs
router.get('/:id/logs', authenticate, async (req, res) => {
  try {
    const warmer = await InternalWarmer.findOne({ _id: req.params.id, userId: req.user.id });
    if (!warmer) return res.status(404).json({ error: 'Warmer not found' });

    const page = parseInt(req.query.page) || 1;
    const limit = 100;
    const skip = (page - 1) * limit;

    const logs = await WarmerLog.find({ warmerId: req.params.id })
      .sort({ sentAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch warmer logs' });
  }
});

module.exports = router;
