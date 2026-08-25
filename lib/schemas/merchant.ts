import { z } from 'zod'

export const registerMerchantSchema = z.object({
  business_name: z.string().min(2).max(160),
  email: z.string().email(),
  webhook_url: z.string().url().optional(),
  bank_account_name: z.string().min(2).max(160).optional(),
  bank_account_number: z.string().min(6).max(20).optional(),
  bank_code: z.string().min(2).max(10).optional(),
  cors_origins: z.array(z.string().url()).optional().default([]),
  settlement_schedule: z.string().optional().default('auto'),
})

export const registerWebhookSchema = z.object({
  webhook_url: z.string().url(),
})
