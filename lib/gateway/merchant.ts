import { ApiError } from '@/lib/api/errors'
import { getAppUrl } from '@/lib/env'
import {
  fetchEventRowBySlug,
  fetchOrganizerEventRows,
  liveRemaining,
  resolveLiveCelebrantId,
  withLiveTiers,
} from '@/lib/events/live'
import { parseLiveTierKey } from '@/lib/events/ticket-types'
import { GATEWAY_SQL_HINT, isMissingGatewayRelation } from '@/lib/gateway/sql'
import { tryCreateAdminClient } from '@/lib/supabase/admin'
import type { EventRecord, GatewayMerchant, TicketTier } from '@/lib/types/database'

export async function merchantLiveUserId(merchant: GatewayMerchant): Promise<string> {
  if (!merchant.user_id) {
    throw new ApiError(
      403,
      'MERCHANT_NOT_LINKED',
      'This key is not linked to a ɃU organiser. Sign in with your ɃU ID, then register Gateway again.',
    )
  }
  const live = await resolveLiveCelebrantId({
    id: merchant.user_id,
    email: merchant.email,
  })
  return live ?? merchant.user_id
}

export async function assertMerchantOwnsEvent(merchant: GatewayMerchant, eventRef: string) {
  const ownerId = await merchantLiveUserId(merchant)
  const row = await fetchEventRowBySlug(eventRef)
  if (!row) throw new ApiError(404, 'EVENT_NOT_FOUND', 'Event not found')
  const packed = withLiveTiers(row)
  if (packed.organizer_id !== ownerId) {
    throw new ApiError(403, 'FORBIDDEN', 'This event does not belong to this API key')
  }
  return packed
}

export function serializeGatewayEvent(
  packed: EventRecord & { ticket_tiers: TicketTier[]; starting_price?: number; tickets_available?: number; sold_out?: boolean },
) {
  const app = getAppUrl()
  return {
    id: packed.id,
    event_id: packed.id,
    title: packed.title,
    slug: packed.slug,
    description: packed.description,
    venue: packed.venue_name,
    venue_address: packed.venue_address,
    date: packed.start_time,
    end_time: packed.end_time,
    status: packed.status,
    visibility: packed.visibility,
    cover_image_url: packed.cover_image_url,
    ticket_types: packed.ticket_tiers.map((tier) => ({
      id: tier.id,
      ticket_type: parseLiveTierKey(tier.id),
      name: tier.name,
      price: Number(tier.price),
      currency: 'NGN',
      quantity_total: Number(tier.quantity_total),
      quantity_sold: Number(tier.quantity_sold),
      quantity_available: liveRemaining(tier),
    })),
    checkout_url: `${app}/g/${packed.id}`,
    public_url: `${app}/events/${packed.slug || packed.id}`,
  }
}

export async function listMerchantEvents(merchant: GatewayMerchant) {
  const ownerId = await merchantLiveUserId(merchant)
  const rows = await fetchOrganizerEventRows(ownerId)
  return rows.map((row) => serializeGatewayEvent(withLiveTiers(row)))
}

export async function findMerchantsForOrganizer(userId: string): Promise<GatewayMerchant[]> {
  const admin = tryCreateAdminClient()
  if (!admin) return []
  const { data, error } = await admin.from('gateway_merchants').select('*').eq('user_id', userId)
  if (error) {
    if (isMissingGatewayRelation(error.message)) return []
    return []
  }
  return (data as GatewayMerchant[]) ?? []
}

export async function findMerchantById(id: string): Promise<GatewayMerchant | null> {
  const admin = tryCreateAdminClient()
  if (!admin) return null
  const { data, error } = await admin.from('gateway_merchants').select('*').eq('id', id).maybeSingle()
  if (error || !data) return null
  return data as GatewayMerchant
}

export function gatewayTableError(error: { message?: string } | null | undefined): never | void {
  if (error && isMissingGatewayRelation(error.message)) {
    throw new ApiError(503, 'GATEWAY_SQL_REQUIRED', GATEWAY_SQL_HINT)
  }
}
