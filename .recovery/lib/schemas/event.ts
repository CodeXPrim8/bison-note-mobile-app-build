import { z } from 'zod'

export const ticketTierInputSchema = z.object({
  name: z.string().min(1).max(80),
  price: z.number().min(0),
  quantity_total: z.number().int().min(0),
  sales_start: z.string().datetime().optional().nullable(),
  sales_end: z.string().datetime().optional().nullable(),
  is_active: z.boolean().optional().default(true),
  metadata: z.record(z.unknown()).optional().default({}),
})

export const createEventSchema = z.object({
  title: z.string().min(2).max(160),
  description: z.string().max(8000).optional().nullable(),
  venue_name: z.string().max(200).optional().nullable(),
  venue_lat: z.number().min(-90).max(90).optional().nullable(),
  venue_lng: z.number().min(-180).max(180).optional().nullable(),
  start_time: z.string().datetime(),
  end_time: z.string().datetime().optional().nullable(),
  cover_image_url: z.string().url().optional().nullable(),
  status: z.enum(['draft', 'published', 'cancelled', 'ended']).optional().default('draft'),
  spray_budget_bu: z.number().min(0).optional().default(0),
  celebrant_name: z.string().max(160).optional().nullable(),
  capacity: z.number().int().min(0).optional().nullable(),
  commission_rate: z.number().min(0).max(1).optional(),
  paystack_subaccount_code: z.string().optional().nullable(),
  ticket_tiers: z.array(ticketTierInputSchema).min(1),
})

export const gatewayCreateEventSchema = createEventSchema.extend({
  callback_base_url: z.string().url().optional(),
})
