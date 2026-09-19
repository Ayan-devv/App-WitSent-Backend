const { z } = require('zod');

const createCampaignSchema = z.object({
  name: z.string().max(100, 'Campaign name too long').optional(),
  
  numbers: z.array(z.string()).min(1, 'At least 1 number required'),
  
  message: z.string().max(4000, 'Message too long').optional(), // Changed to optional to allow media-only campaigns
  
  delay: z.number()
    .min(2, 'Delay must be at least 2 seconds')
    .max(30, 'Delay must be less than 30 seconds')
    .default(5),
  
  sendMode: z.enum(['now', 'schedule']).default('now'),
  
  scheduledAt: z.string().nullable().optional(),
  
  timezone: z.string().optional(),
  
  whatsappSessionId: z.string().min(1, 'WhatsApp session ID required')
});

module.exports = { createCampaignSchema };
