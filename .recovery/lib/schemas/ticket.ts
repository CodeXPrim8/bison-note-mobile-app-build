import { z } from 'zod'

export const initializeTicketSchema = z.object({
  email: z.string().email(),
  amount: z.number().min(0),
  ticket_tier_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(20).optional().default(1),
  callback_url: z.string().url().optional(),
  spray_bu_amount: z.number().min(0).optional().default(0),
  metadata: z
    .object({
      buyer_name: z.string().max(160).optional(),
      phone: z.string().max(32).optional(),
      custom: z.record(z.unknown()).optional(),
    })
    .optional(),
})

export const initializeDepositSchema = z.object({
  email: z.string().email(),
  amount: z.number().positive(),
  callback_url: z.string().url().optional(),
})

export const checkinSchema = z.object({
  event_id: z.string().uuid(),
  checkin_code: z.string().min(4).max(32).optional(),
  qr_payload: z.string().optional(),
})
