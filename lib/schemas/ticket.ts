import { z } from 'zod'
import { LIVE_TIER_ID_RE } from '@/lib/events/ticket-types'

/** Live ticket IDs are `{eventId}:{typeKey}` (e.g. `{uuid}:vip`). Website UUIDs still work. */
export const ticketTierIdSchema = z
  .string()
  .min(1)
  .refine(
    (id) => z.string().uuid().safeParse(id).success || LIVE_TIER_ID_RE.test(id),
    'Invalid ticket type',
  )

export const initializeTicketSchema = z
  .object({
    email: z.string().email(),
    amount: z.number().min(0).optional(),
    ticket_tier_id: ticketTierIdSchema.optional(),
    event_id: z.string().min(1).max(80).optional(),
    ticket_type: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9_-]{1,40}$/)
      .optional(),
    quantity: z.number().int().min(1).max(20).optional().default(1),
    callback_url: z.string().url().optional(),
    spray_bu_amount: z.number().min(0).optional().default(0),
    metadata: z
      .object({
        buyer_name: z.string().max(160).optional(),
        phone: z.string().max(32).optional(),
        custom: z.record(z.unknown()).optional(),
        affiliate_code: z.string().max(32).optional(),
      })
      .optional(),
  })
  .refine((body) => Boolean(body.ticket_tier_id || body.event_id), {
    message: 'Pass event_id or ticket_tier_id',
  })

export const initializeDepositSchema = z
  .object({
    email: z.string().email(),
    bu: z.number().positive().optional(),
    amount: z.number().positive().optional(),
    callback_url: z.string().url().optional(),
  })
  .refine((body) => body.bu != null || body.amount != null, {
    message: 'Enter ɃU to buy, or the naira you will pay by card',
  })

export const checkinSchema = z
  .object({
    event_id: z.string().uuid(),
    checkin_code: z.string().min(3).max(80).optional(),
    qr_payload: z.string().min(1).max(8000).optional(),
    confirm: z.boolean().optional().default(false),
  })
  .refine((body) => Boolean(body.checkin_code || body.qr_payload), {
    message: 'Scan a ticket QR or enter the backup code',
  })

export const quoteTicketSchema = z.object({
  ticket_tier_id: ticketTierIdSchema,
  quantity: z.number().int().min(1).max(20),
})

export const ticketFeedbackSchema = z.object({
  ticket_id: z.string().uuid(),
  comment: z.string().trim().min(3).max(1000),
})
