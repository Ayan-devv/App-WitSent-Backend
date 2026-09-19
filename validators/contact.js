const { z } = require('zod');

const createContactSchema = z.object({
  phone: z.string()
    .min(10, 'Invalid phone number')
    .max(15, 'Invalid phone number')
    .regex(/^[0-9+]+$/, 'Phone must contain only digits and +'),
  
  name: z.string().max(100).optional(),
  tags: z.array(z.string()).optional()
});

module.exports = { createContactSchema };
