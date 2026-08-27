import { z } from 'zod'

/** Live ɃU stores one General price per event. Website ticket IDs are `{eventId}:general`. */
export const ticketTierIdSchema = z
  .string()
  .min(1)
  .refine(
    (id) =>
      z.string().uuid().safeParse(id).success ||
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:general$/i.test(id),
    'Invalid ticket type',
  )

export const initializeTicketSchema = z.object({
  email: z.string().email(),
  amount: z.number().min(0).optional(),
  ticket_tier_id: ticketTierIdSchema,
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
