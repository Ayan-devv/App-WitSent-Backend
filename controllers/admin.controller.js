const User = require('../models/User');
const Contact = require('../models/Contact');
const Campaign = require('../models/Campaign');
const ActivityLog = require('../models/ActivityLog');
const MessageLog = require('../models/MessageLog');
const PromotionalMessage = require('../models/PromotionalMessage');
const SentPromotionalLog = require('../models/SentPromotionalLog');
const WhatsAppSession = require('../models/WhatsAppSession');
const { logActivity } = require('../services/activityLogger');
const { log } = require('../services/logger');
const { getDDoSStats: getStatsFromMonitor } = require('../services/ddosMonitor');

const getDashboardStats = async (req, res) => {
  try {
    const usersCount = await User.countDocuments();
    const messagesCount = await MessageLog.countDocuments();
    const campaignsCount = await Campaign.countDocuments();

    res.json({
      success: true,
      stats: {
        users: usersCount,
        messages: messagesCount,
        campaigns: campaignsCount
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch dashboard stats' });
  }
};

const getUsers = async (req, res) => {
  try {
    const users = await User.find({}).select('-password').sort({ createdAt: -1 });

    const mappedUsers = await Promise.all(users.map(async u => {
      const sentCount = await MessageLog.countDocuments({ userId: u._id, status: 'SENT' });
      return {
        id: u._id,
        name: u.name,
        email: u.email,
        status: u.status,
        plan: u.plan,
        sent: sentCount,
        role: u.role,
        createdAt: u.createdAt
      };
    }));

    res.json({ success: true, users: mappedUsers });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch users' });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    
    await Contact.deleteMany({ userId: id });
    await Campaign.deleteMany({ userId: id });
    await MessageLog.deleteMany({ userId: id });
    await ActivityLog.deleteMany({ userId: id });
    await WhatsAppSession.deleteMany({ userId: id });
    
    await User.deleteOne({ _id: id });
    
    res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete user' });
  }
};

const setDailyLimit = async (req, res) => {
  try {
    const { id } = req.params;
    const { dailyLimit } = req.body;
    
    const user = await User.findByIdAndUpdate(
      id,
      { dailyMessageLimit: dailyLimit },
      { new: true }
    );
    res.json({ success: true, message: 'Daily limit updated', user: { id: user._id, dailyMessageLimit: user.dailyMessageLimit } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to set limit' });
  }
};

const upgradeUserPlan = async (req, res) => {
  try {
    const { plan, dailyMessageLimit } = req.body;
    const validPlans = ['FREEMIUM', 'PREMIUM'];
    
    if (!validPlans.includes(plan)) {
      return res.status(400).json({ success: false, error: 'Invalid plan' });
    }
    
    const admin = await User.findById(req.user.id);
    
    const user = await User.findByIdAndUpdate(
      req.params.id,
      {
        plan: plan,
        dailyMessageLimit: dailyMessageLimit || 50,
        planUpgradedAt: new Date(),
        planUpgradedBy: admin.email
      },
      { new: true }
    ).select('-password');
    
    log('admin_action', {
      action: 'upgrade_plan',
      admin: admin.email,
      userId: user._id,
      newPlan: plan
    });

    logActivity(admin._id, 'plan_upgraded', { userId: user._id, newPlan: plan });
    
    res.json({
      success: true,
      message: `User upgraded to ${plan}`,
      user
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to upgrade plan' });
  }
};

const getUserDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select('-password');
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const totalMessagesSent = await MessageLog.countDocuments({ userId: id, status: 'SENT' });
    const campaignsCreated = await Campaign.countDocuments({ userId: id });
    const contactsUploaded = await Contact.countDocuments({ userId: id });
    const accountsConnected = await WhatsAppSession.countDocuments({ userId: id });
    
    const accounts = await WhatsAppSession.find({ userId: id });
    const recentCampaigns = await Campaign.find({ userId: id }).sort({ createdAt: -1 }).limit(5);
    const activityLog = await ActivityLog.find({ userId: id }).sort({ createdAt: -1 }).limit(10);

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || 'N/A', // fallback if phone isn't tracked in User schema
        plan: user.plan,
        status: user.status,
        joinedAt: user.createdAt,
        lastActive: user.updatedAt,
        stats: {
          totalMessagesSent,
          campaignsCreated,
          contactsUploaded,
          accountsConnected,
          sentToday: user.totalMessagesSentToday,
          dailyLimit: user.dailyMessageLimit
        },
        accounts,
        recentCampaigns,
        activityLog
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch user details' });
  }
};

const getCampaignNumbers = async (req, res) => {
  try {
    const { id, campaignId } = req.params;
    const campaign = await Campaign.findOne({ _id: campaignId, userId: id });
    if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });

    const numbers = await MessageLog.find({ campaignId, userId: id }).sort({ sentAt: -1 });

    res.json({
      success: true,
      campaign,
      numbers: numbers.map(n => ({
        phone: n.phoneNumber,
        status: n.status,
        sentAt: n.sentAt
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch campaign numbers' });
  }
};

const getCampaignMessages = async (req, res) => {
  try {
    const { id, campaignId } = req.params;
    const campaign = await Campaign.findOne({ _id: campaignId, userId: id });
    if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });

    res.json({
      success: true,
      message: {
        text: campaign.message,
        mediaUrl: campaign.mediaUrl,
        mediaType: campaign.mediaType,
        caption: campaign.mediaCaption
      },
      stats: {
        totalSent: campaign.sent,
        failed: campaign.failed,
        successRate: campaign.successRate || 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch campaign messages' });
  }
};

const getActivityLog = async (req, res) => {
  try {
    const logs = await ActivityLog.find({})
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .limit(100);
    
    const formattedLogs = logs.map(log => ({
      id: log._id,
      timestamp: log.createdAt,
      userId: log.userId ? log.userId._id : null,
      userName: log.userId ? log.userId.name : 'Unknown',
      action: log.action,
      details: log.details
    }));
    
    res.json({ success: true, activities: formattedLogs });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch logs' });
  }
};

const getUserStats = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    
    const campaigns = await Campaign.find({ userId: id });
    const totalSent = campaigns.reduce((acc, c) => acc + c.sent, 0);
    const contactsCount = await Contact.countDocuments({ userId: id });
    const activeAccountsCount = await WhatsAppSession.countDocuments({ userId: id, isConnected: true });
    
    res.json({
      success: true,
      stats: {
        totalSent,
        sentToday: user.totalMessagesSentToday,
        dailyLimit: user.dailyMessageLimit,
        campaigns: campaigns.length,
        contacts: contactsCount,
        accounts: activeAccountsCount,
        lastActive: user.updatedAt
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch user stats' });
  }
};

const getCampaignPromoStats = async (req, res) => {
  try {
    const { id, campaignId } = req.params;
    
    const campaign = await Campaign.findOne({ _id: campaignId, userId: id });
    if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });
    
    if (!campaign.useRandomPromo) {
      return res.json({ success: true, isRandomPromo: false });
    }
    
    const promos = await PromotionalMessage.find({ campaignId });
    const logs = await SentPromotionalLog.find({ campaignId });
    
    const totalSent = logs.length;
    
    const promoStats = promos.map(p => {
      const pLogs = logs.filter(l => l.promotionalMessage === p.message.substring(0, 50));
      return {
        id: p._id,
        message: p.message,
        sentCount: pLogs.length,
        percentage: totalSent > 0 ? (pLogs.length / totalSent) * 100 : 0,
        status: pLogs.filter(l => l.status === 'SENT').length
      };
    });
    
    let avgMessageDelay = 0;
    if (totalSent > 0) {
       avgMessageDelay = logs.reduce((acc, curr) => acc + curr.delayUsed, 0) / totalSent;
    }
    
    const batches = new Set(logs.map(l => l.batchNumber)).size;
    
    res.json({
      success: true,
      isRandomPromo: true,
      campaignId: campaign._id,
      name: campaign.name,
      promotionalMessages: promoStats,
      delayStats: {
        mode: campaign.delayMode,
        avgMessageDelay,
        batches,
        effectiveness: "Very High"
      },
      totalSent
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch promo stats' });
  }
};

const getDDoSStats = async (req, res) => {
  try {
    const stats = getStatsFromMonitor();
    
    // We can also fetch some dummy or aggregated data for rate limiting hits since express-rate-limit 
    // stores them in memory by default. But as per requirement, we can just return stats.
    res.json({
      success: true,
      stats: {
        suspiciousIPs: stats.suspiciousIPs,
        blockedIPs: stats.blockedIPs,
        rateLimitHits: {
          signup: 0,
          login: 0,
          campaign: 0,
          message: 0
        },
        alertsLastHour: stats.suspiciousIPs.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch DDoS stats' });
  }
};

module.exports = {
  getDashboardStats,
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
  getDDoSStats
};
