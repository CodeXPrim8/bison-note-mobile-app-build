import { ApiError } from '@/lib/api/errors'
import { createDataClient } from '@/lib/supabase/data'
import { tryCreateAdminClient } from '@/lib/supabase/admin'
import { fetchEventRowBySlug, withLiveTiers } from '@/lib/events/live'
import { normalizeEventRef } from '@/lib/pos/event-ref'

export { normalizeEventRef } from '@/lib/pos/event-ref'

export const EVENT_VENDOR_COMMISSION_PCT = 10

export type EventVendorRow = {
  id: string
  event_id: string
  vendor_user_id: string
  commission_pct: number
  status: 'pending' | 'approved' | 'revoked'
  created_at: string
  updated_at: string
}

function db() {
  return tryCreateAdminClient() ?? createDataClient()
}

function asRow(raw: unknown): EventVendorRow | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const status = String(row.status ?? 'pending')
  if (status !== 'pending' && status !== 'approved' && status !== 'revoked') return null
  return {
    id: String(row.id ?? ''),
    event_id: String(row.event_id ?? ''),
    vendor_user_id: String(row.vendor_user_id ?? ''),
    commission_pct: Number(row.commission_pct ?? EVENT_VENDOR_COMMISSION_PCT) || EVENT_VENDOR_COMMISSION_PCT,
    status,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

export async function assertEventOwner(eventId: string, userId: string) {
  const row = await fetchEventRowBySlug(eventId)
  if (!row) throw new ApiError(404, 'EVENT_NOT_FOUND', 'Event not found')
  const packed = withLiveTiers(row)
  const owner = String((row as { celebrant_id?: string }).celebrant_id || packed.organizer_id || '')
  if (owner !== userId) throw new ApiError(403, 'FORBIDDEN', 'Only the event organiser can manage vendors.')
  return { row, packed, ownerId: owner }
}

export async function listEventVendors(eventId: string) {
  const client = db()
  const { data, error } = await client
    .from('bu_event_vendors')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
  if (error) {
    if (/schema cache|does not exist/i.test(error.message)) return []
    throw new ApiError(500, 'VENDOR_LIST_FAILED', error.message)
  }
  return ((data ?? []) as unknown[]).map(asRow).filter(Boolean) as EventVendorRow[]
}

export async function listVendorEvents(vendorUserId: string, status: 'approved' | 'pending' | 'all' = 'approved') {
  const client = db()
  let query = client.from('bu_event_vendors').select('*').eq('vendor_user_id', vendorUserId)
  if (status !== 'all') query = query.eq('status', status)
  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) {
    if (/schema cache|does not exist/i.test(error.message)) return []
    throw new ApiError(500, 'VENDOR_LIST_FAILED', error.message)
  }
  return ((data ?? []) as unknown[]).map(asRow).filter(Boolean) as EventVendorRow[]
}

export async function requestEventVendor(eventIdRaw: string, vendorUserId: string) {
  const eventId = normalizeEventRef(eventIdRaw)
  if (!eventId) throw new ApiError(400, 'VALIDATION_ERROR', 'event_id required')
  await assertEventOwnerExists(eventId)
  const client = db()
  const payload = {
    event_id: eventId,
    vendor_user_id: vendorUserId,
    commission_pct: EVENT_VENDOR_COMMISSION_PCT,
    status: 'pending',
    updated_at: new Date().toISOString(),
  }
  const existing = await client
    .from('bu_event_vendors')
    .select('*')
    .eq('event_id', eventId)
    .eq('vendor_user_id', vendorUserId)
    .maybeSingle()
  if (existing.data) {
    const row = asRow(existing.data)
    if (row?.status === 'approved') return row
    const updated = await client
      .from('bu_event_vendors')
      .update({ status: 'pending', commission_pct: EVENT_VENDOR_COMMISSION_PCT, updated_at: payload.updated_at })
      .eq('id', String((existing.data as { id: string }).id))
      .select('*')
      .maybeSingle()
    if (updated.error) throw new ApiError(500, 'VENDOR_REQUEST_FAILED', updated.error.message)
    return asRow(updated.data) as EventVendorRow
  }
  const inserted = await client.from('bu_event_vendors').insert(payload).select('*').maybeSingle()
  if (inserted.error) {
    if (/schema cache|does not exist/i.test(inserted.error.message)) {
      throw new ApiError(503, 'VENDOR_SQL_REQUIRED', 'Run supabase/migrations/0034_vendor_pos.sql in Supabase.')
    }
    throw new ApiError(500, 'VENDOR_REQUEST_FAILED', inserted.error.message)
  }
  return asRow(inserted.data) as EventVendorRow
}

async function assertEventOwnerExists(eventId: string) {
  const row = await fetchEventRowBySlug(eventId)
  if (!row) throw new ApiError(404, 'EVENT_NOT_FOUND', 'Event not found')
}

export async function setEventVendorStatus(
  eventId: string,
  vendorUserId: string,
  status: 'approved' | 'revoked' | 'pending',
  actorUserId: string,
  options?: { adminOverride?: boolean },
) {
  if (!options?.adminOverride) {
    await assertEventOwner(eventId, actorUserId)
  } else {
    await assertEventOwnerExists(eventId)
  }
  const client = db()
  const updated = await client
    .from('bu_event_vendors')
    .update({ status, commission_pct: EVENT_VENDOR_COMMISSION_PCT, updated_at: new Date().toISOString() })
    .eq('event_id', eventId)
    .eq('vendor_user_id', vendorUserId)
    .select('*')
    .maybeSingle()
  if (updated.error) throw new ApiError(500, 'VENDOR_UPDATE_FAILED', updated.error.message)
  if (!updated.data) throw new ApiError(404, 'NOT_FOUND', 'Vendor request not found')
  return asRow(updated.data) as EventVendorRow
}

export async function getApprovedEventVendor(eventId: string, vendorUserId: string) {
  const client = db()
  const { data, error } = await client
    .from('bu_event_vendors')
    .select('*')
    .eq('event_id', eventId)
    .eq('vendor_user_id', vendorUserId)
    .eq('status', 'approved')
    .maybeSingle()
  if (error) {
    if (/schema cache|does not exist/i.test(error.message)) return null
    throw new ApiError(500, 'VENDOR_LOOKUP_FAILED', error.message)
  }
  return asRow(data)
}
