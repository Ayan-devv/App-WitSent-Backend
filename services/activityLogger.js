const ActivityLog = require('../models/ActivityLog');
const MessageLog = require('../models/MessageLog');

const logActivity = async (userId, action, details) => {
  try {
    await ActivityLog.create({
      userId,
      action,
      details: details ? JSON.stringify(details) : null
    });
  } catch (err) {
    console.error('Activity logging failed:', err);
  }
};

const logMessage = async (campaignId, userId, phoneNumber, status, messageText) => {
  try {
    await MessageLog.create({
      campaignId,
      userId,
      phoneNumber,
      message: messageText ? messageText.substring(0, 100) : null,
      status,
      sentAt: new Date()
    });
  } catch (err) {
    console.error('Message logging failed:', err);
  }
};

module.exports = { logActivity, logMessage };
