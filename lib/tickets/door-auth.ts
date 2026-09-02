import { requireUser } from '@/lib/api/session'
import { ApiError } from '@/lib/api/errors'
import { readBuSession } from '@/lib/auth/bu-session'
import { resolveLiveCelebrantId } from '@/lib/events/live'
import { createDataClient } from '@/lib/supabase/data'

const cache = new Map<string, { liveId: string; expires: number }>()
const TTL_MS = 10 * 60 * 1000

export async function requireDoorOrganizer(eventId: string) {
  const user = await requireUser()
  const key = `${user.id}:${eventId}`
  const hit = cache.get(key)
  if (hit && hit.expires > Date.now()) {
    return { user, liveId: hit.liveId }
  }

  const session = await readBuSession()
  const liveId =
    (await resolveLiveCelebrantId({
      id: user.id,
      email: user.email,
      phone: session?.phone_e164 || session?.phone || null,
    })) || user.id

  const db = createDataClient()
  const { data, error } = await db.from('events').select('id, celebrant_id').eq('id', eventId).maybeSingle()
  const row = (!error && data ? data : null) as Record<string, unknown> | null
  const organizerId = String(row?.celebrant_id || '')
  if (!row || (organizerId !== user.id && organizerId !== liveId)) {
    throw new ApiError(403, 'FORBIDDEN', 'Not the organizer for this event')
  }

  cache.set(key, { liveId, expires: Date.now() + TTL_MS })
  return { user, liveId }
}
