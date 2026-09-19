const planLimits = {
  FREEMIUM: {
    dailyMessages: 50,
    maxAccounts: 1,
    maxContacts: 50,
    campaignsPerDay: 1,
    supportLevel: 'community',
    description: 'Free trial - 50 messages/day'
  },
  
  BASIC: {
    dailyMessages: 1000,
    maxAccounts: 3,
    maxContacts: 500,
    campaignsPerDay: null, // Unlimited
    supportLevel: 'priority',
    description: 'Basic - 1000 messages/day - $15/month'
  },
  
  PRO: {
    dailyMessages: null, // Unlimited
    maxAccounts: 10,
    maxContacts: null, // Unlimited
    campaignsPerDay: null,
    supportLevel: 'premium',
    description: 'Professional - Unlimited - $30/month'
  },
  
  UNLIMITED: {
    dailyMessages: null,
    maxAccounts: null,
    maxContacts: null,
    campaignsPerDay: null,
    supportLevel: 'vip',
    description: 'VIP - Unlimited access'
  }
}

module.exports = planLimits;
