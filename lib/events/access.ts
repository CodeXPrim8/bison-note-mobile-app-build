import { createDataClient } from '@/lib/supabase/data'
import { getProfile, getSessionUser } from '@/lib/api/session'
import { ApiError } from '@/lib/api/errors'
import type { EventRecord } from '@/lib/types/database'
import { fetchEventRowBySlug, mapLiveEvent, resolveLiveCelebrantId } from '@/lib/events/live'
import { isEventUpcoming } from '@/lib/events/sale'

export function isPublicCatalogEvent(
  event: Pick<EventRecord, 'status' | 'visibility' | 'start_time' | 'end_time'>,
) {
  return event.status === 'published' && event.visibility === 'PUBLIC' && isEventUpcoming(event)
}

export async function canViewEvent(event: EventRecord): Promise<boolean> {
  if (event.status === 'published' && event.visibility === 'PUBLIC') return true
  if (!isEventUpcoming(event)) return false
  const user = await getSessionUser()
  if (!user) return false
  const profile = await getProfile(user.id)
  const liveUserId = await resolveLiveCelebrantId({
    id: user.id,
    email: user.email,
    phone: profile?.phone_e164 || profile?.phone,
  })
  if (event.organizer_id === user.id || (liveUserId && event.organizer_id === liveUserId)) return true
  if (event.visibility !== 'PRIVATE') return false
  const db = createDataClient()
  const invited = await db
    .from('invites')
    .select('id')
    .eq('event_id', event.id)
    .or(
      [
        `guest_id.eq.${user.id}`,
        liveUserId ? `guest_id.eq.${liveUserId}` : null,
        profile?.phone_e164 ? `guest_phone.eq.${profile.phone_e164}` : null,
        profile?.phone ? `guest_phone.eq.${profile.phone}` : null,
      ]
        .filter(Boolean)
        .join(','),
    )
    .limit(1)
    .maybeSingle()
  if (invited.data) return true
  const nextInvites = await db
    .from('event_invitations')
    .select('id')
    .eq('event_id', event.id)
    .neq('status', 'declined')
    .or(
      profile?.phone_e164
        ? `invited_user_id.eq.${user.id},invited_bu_id.eq.${profile.phone_e164}`
        : `invited_user_id.eq.${user.id}`,
    )
    .limit(1)
    .maybeSingle()
  return Boolean(nextInvites.data)
}

export async function requireEventOrganizer(eventId: string) {
  const user = await getSessionUser()
  if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Sign in required')
  const db = createDataClient()
  const row = (await fetchEventRowBySlug(eventId, db)) ?? null
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Event not found')
  const event = mapLiveEvent(row)
  const profile = await getProfile(user.id)
  const liveUserId = await resolveLiveCelebrantId({
    id: user.id,
    email: user.email,
    phone: profile?.phone_e164 || profile?.phone,
  })
  if (event.organizer_id !== user.id && event.organizer_id !== liveUserId) {
    throw new ApiError(403, 'FORBIDDEN', 'Not the organizer for this event')
  }
  return { user, event, admin: db }
}
