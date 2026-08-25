import { authenticateMerchant } from '@/lib/api/gateway-auth'
import { handleRouteError, successResponse } from '@/lib/api/errors'
import { gatewayCreateEventSchema } from '@/lib/schemas/event'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAppUrl } from '@/lib/env'
import { slugify } from '@/lib/tickets/ids'

export async function POST(request: Request) {
  try {
    const merchant = await authenticateMerchant(request)
    const json: unknown = await request.json()
    const body = gatewayCreateEventSchema.parse(json)
    const admin = createAdminClient()
    const slug = slugify(body.title)

    const { data: event, error } = await admin
      .from('events')
      .insert({
        merchant_id: merchant.id,
        organizer_id: merchant.user_id,
        title: body.title,
        slug,
        description: body.description ?? null,
        venue_name: body.venue_name ?? null,
        venue_address: body.venue_address ?? null,
        venue_lat: body.venue_lat ?? null,
        venue_lng: body.venue_lng ?? null,
        start_time: body.start_time,
        end_time: body.end_time ?? null,
        cover_image_url: body.cover_image_url ?? null,
        status: body.status ?? 'published',
        visibility: body.visibility ?? 'PUBLIC',
        category: body.category ?? null,
        is_gateway_event: true,
        paystack_subaccount_code: body.paystack_subaccount_code ?? merchant.paystack_subaccount_code,
        commission_rate: body.commission_rate ?? merchant.commission_rate,
        spray_budget_bu: body.spray_budget_bu ?? 0,
        celebrant_name: body.celebrant_name ?? null,
        capacity: body.capacity ?? null,
      })
      .select('*')
      .single()

    if (error || !event) {
      throw error
    }

    await admin.from('ticket_tiers').insert(
      body.ticket_tiers.map((tier) => ({
        event_id: event.id as string,
        name: tier.name,
        price: tier.price,
        quantity_total: tier.quantity_total,
        description: tier.description ?? null,
        benefits: tier.benefits ?? null,
        max_per_buyer: tier.max_per_buyer ?? 10,
        sales_start: tier.sales_start ?? null,
        sales_end: tier.sales_end ?? null,
        is_active: tier.is_active ?? true,
        metadata: tier.metadata ?? {},
      })),
    )

    return successResponse(
      { event_id: event.id, slug, checkout_url: `${getAppUrl()}/events/${slug}` },
      'Event created',
      201,
    )
  } catch (error) {
    return handleRouteError(error)
  }
}
