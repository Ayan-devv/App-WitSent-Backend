const Campaign = require('../models/Campaign');
const Contact = require('../models/Contact');
const WhatsAppSession = require('../models/WhatsAppSession');

const getDashboardStats = async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Total campaigns
        const totalCampaigns = await Campaign.countDocuments({ userId });
        
        // Scheduled campaigns
        const scheduledCount = await Campaign.countDocuments({ userId, status: 'SCHEDULED' });
        
        // Total contacts
        const totalContacts = await Contact.countDocuments({ userId }).catch(() => 0);
        
        // Get all campaigns to aggregate stats
        const campaigns = await Campaign.find({ userId });
        let totalMessagesSent = 0;
        let totalSuccessRate = 0;
        let campaignsWithRate = 0;

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        let sentThisMonth = 0;
        let campaignsThisMonth = 0;

        campaigns.forEach(c => {
            totalMessagesSent += (c.sent || 0);
            if (c.successRate !== null && c.successRate !== undefined) {
                totalSuccessRate += c.successRate;
                campaignsWithRate++;
            }
            
            if (c.createdAt >= startOfMonth) {
                sentThisMonth += (c.sent || 0);
                campaignsThisMonth++;
            }
        });

        const successRate = campaignsWithRate > 0 ? parseFloat((totalSuccessRate / campaignsWithRate).toFixed(1)) : 0;

        res.status(200).json({
            success: true,
            stats: {
                totalMessagesSent,
                totalCampaigns,
                totalContacts,
                successRate,
                sentThisMonth,
                contactsThisMonth: 0, // Placeholder if no Contacts creation date tracking
                scheduledCount
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Failed to fetch dashboard stats' });
    }
};

const getWhatsAppStatus = async (req, res) => {
    try {
        const userId = req.user.id;
        const session = await WhatsAppSession.findOne({ userId, isConnected: true }).sort({ updatedAt: -1 });
        
        if (!session) {
            return res.status(200).json({ success: true, status: { connected: false } });
        }

        return res.status(200).json({
            success: true,
            status: {
                connected: true,
                phoneNumber: session.phoneNumber,
                connectedSince: session.connectedAt || session.updatedAt
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to fetch WhatsApp status' });
    }
};

const getRecentCampaigns = async (req, res) => {
    try {
        const userId = req.user.id;
        const campaigns = await Campaign.find({ userId })
            .sort({ createdAt: -1 })
            .limit(3);
        res.status(200).json({ success: true, campaigns });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to fetch recent campaigns' });
    }
};

module.exports = {
    getDashboardStats,
    getWhatsAppStatus,
    getRecentCampaigns
};
