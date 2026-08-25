import { createAdminClient } from '@/lib/supabase/admin'
import { handleRouteError, successResponse } from '@/lib/api/errors'
import { createEventSchema } from '@/lib/schemas/event'
import { requireUser } from '@/lib/api/session'
import { slugify } from '@/lib/tickets/ids'
import type { EventRecord, TicketTier } from '@/lib/types/database'

export async function GET() {
  try {
    const admin = createAdminClient()
    const { data: events } = await admin
      .from('events')
      .select('*')
      .eq('status', 'published')
      .order('start_time', { ascending: true })

    const ids = ((events as EventRecord[]) ?? []).map((event) => event.id)
    const { data: tiers } = ids.length
      ? await admin.from('ticket_tiers').select('*').in('event_id', ids)
      : { data: [] }

    const grouped = new Map<string, TicketTier[]>()
    for (const tier of (tiers as TicketTier[]) ?? []) {
      const list = grouped.get(tier.event_id) ?? []
      list.push(tier)
      grouped.set(tier.event_id, list)
    }

    return successResponse(
      ((events as EventRecord[]) ?? []).map((event) => ({
        ...event,
        ticket_tiers: grouped.get(event.id) ?? [],
      })),
    )
  } catch (error) {
    return handleRouteError(error)
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const json: unknown = await request.json()
    const body = createEventSchema.parse(json)
    const admin = createAdminClient()
    const slug = slugify(body.title)

    const { data: event, error } = await admin
      .from('events')
      .insert({
        organizer_id: user.id,
        title: body.title,
        slug,
        description: body.description ?? null,
        venue_name: body.venue_name ?? null,
        venue_lat: body.venue_lat ?? null,
        venue_lng: body.venue_lng ?? null,
        start_time: body.start_time,
        end_time: body.end_time ?? null,
        cover_image_url: body.cover_image_url ?? null,
        status: body.status ?? 'draft',
        is_gateway_event: false,
        paystack_subaccount_code: body.paystack_subaccount_code ?? null,
        commission_rate: body.commission_rate ?? 0,
        spray_budget_bu: body.spray_budget_bu ?? 0,
        celebrant_name: body.celebrant_name ?? null,
        capacity: body.capacity ?? null,
      })
      .select('*')
      .single()

    if (error || !event) throw error

    await admin.from('ticket_tiers').insert(
      body.ticket_tiers.map((tier) => ({
        event_id: event.id as string,
        name: tier.name,
        price: tier.price,
        quantity_total: tier.quantity_total,
        sales_start: tier.sales_start ?? null,
        sales_end: tier.sales_end ?? null,
        is_active: tier.is_active ?? true,
        metadata: tier.metadata ?? {},
      })),
    )

    return successResponse({ event_id: event.id, slug }, 'Event created', 201)
  } catch (error) {
    return handleRouteError(error)
  }
}
