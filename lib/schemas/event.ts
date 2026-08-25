import { z } from 'zod'

export const EVENT_CATEGORIES = [
  'wedding',
  'birthday',
  'concert',
  'club',
  'night_party',
  'corporate',
  'festival',
  'church',
  'conference',
  'private',
  'other',
] as const

export const EVENT_CATEGORY_LABELS: Record<(typeof EVENT_CATEGORIES)[number], string> = {
  wedding: 'Wedding',
  birthday: 'Birthday',
  concert: 'Concert',
  club: 'Club',
  night_party: 'Night Party',
  corporate: 'Corporate',
  festival: 'Festival',
  church: 'Church',
  conference: 'Conference',
  private: 'Private',
  other: 'Other',
}

export function eventCategoryLabel(category: string | null | undefined) {
  if (!category) return null
  return EVENT_CATEGORY_LABELS[category as (typeof EVENT_CATEGORIES)[number]] ?? category
}

export const ticketTierInputSchema = z.object({
  name: z.string().min(1).max(80),
  price: z.number().min(0),
  quantity_total: z.number().int().min(0),
  description: z.string().max(500).optional().nullable(),
  benefits: z.string().max(1000).optional().nullable(),
  max_per_buyer: z.number().int().min(1).max(50).optional().default(10),
  sales_start: z.string().optional().nullable(),
  sales_end: z.string().optional().nullable(),
  is_active: z.boolean().optional().default(true),
  metadata: z.record(z.unknown()).optional().default({}),
})

const emptyToNull = (value: unknown) => (value === '' || value === undefined ? null : value)

export const createEventSchema = z.object({
  title: z.string().min(2).max(160),
  description: z.string().max(8000).optional().nullable(),
  cover_image_url: z.preprocess(emptyToNull, z.string().url().optional().nullable()),
  venue_name: z.string().max(200).optional().nullable(),
  venue_address: z.string().max(400).optional().nullable(),
  venue_lat: z.number().min(-90).max(90).optional().nullable(),
  venue_lng: z.number().min(-180).max(180).optional().nullable(),
  start_time: z.string().min(1),
  end_time: z.string().optional().nullable(),
  category: z.enum(EVENT_CATEGORIES).optional().nullable(),
  visibility: z.enum(['PUBLIC', 'PRIVATE']).optional().default('PUBLIC'),
  status: z.enum(['draft', 'published', 'cancelled', 'ended']).optional().default('draft'),
  capacity: z.number().int().min(0).optional().nullable(),
  contact_email: z.preprocess(emptyToNull, z.string().email().optional().nullable()),
  contact_phone: z.string().max(32).optional().nullable(),
  organizer_name: z.string().max(160).optional().nullable(),
  organizer_info: z.string().max(2000).optional().nullable(),
  ticket_sales_start: z.string().optional().nullable(),
  ticket_sales_end: z.string().optional().nullable(),
  spray_budget_bu: z.number().min(0).optional().default(0),
  celebrant_name: z.string().max(160).optional().nullable(),
  commission_rate: z.number().min(0).max(1).optional(),
  paystack_subaccount_code: z.string().optional().nullable(),
  ticket_tiers: z.array(ticketTierInputSchema).min(1),
})

export const gatewayCreateEventSchema = createEventSchema.extend({
  callback_base_url: z.string().url().optional(),
})

export const inviteGuestsSchema = z.object({
  bu_ids: z.array(z.string().min(7).max(32)).min(1).max(500),
  gate: z.string().max(80).optional(),
  seat: z.string().max(80).optional(),
})
