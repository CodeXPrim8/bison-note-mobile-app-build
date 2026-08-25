import { ApiError, handleRouteError, successResponse } from '@/lib/api/errors'
import { requireUser } from '@/lib/api/session'
import { inviteGuestsSchema } from '@/lib/schemas/event'
import { maskPhone, normalizePhone } from '@/lib/phone'
import { createDataClient } from '@/lib/supabase/data'
import { fetchLiveEventDashboard, fetchLiveEventInvites, lookupLiveUser } from '@/lib/events/live'

export async function GET(_request: Request, context: { params: Promise<{ eventId: string }> }) {
  try {
    const user = await requireUser()
    const { eventId } = await context.params
    const dash = await fetchLiveEventDashboard(eventId, user.id)
    if (!dash) throw new ApiError(404, 'NOT_FOUND', 'Event not found')
    if ('forbidden' in dash) throw new ApiError(403, 'FORBIDDEN', 'Not the organizer')
    return successResponse(dash.invitations)
  } catch (error) {
    return handleRouteError(error)
  }
}

export async function POST(request: Request, context: { params: Promise<{ eventId: string }> }) {
  try {
    const user = await requireUser()
    const { eventId } = await context.params
    const body = inviteGuestsSchema.parse(await request.json())
    const dash = await fetchLiveEventDashboard(eventId, user.id)
    if (!dash) throw new ApiError(404, 'NOT_FOUND', 'Event not found')
    if ('forbidden' in dash) throw new ApiError(403, 'FORBIDDEN', 'Not the organizer')

    const db = createDataClient()
    const results: Array<{ bu_id: string; matched: boolean; status: string }> = []
    for (const raw of body.bu_ids) {
      const buId = normalizePhone(raw)
      if (!buId) {
        results.push({ bu_id: raw, matched: false, status: 'invalid' })
        continue
      }
      const found = await lookupLiveUser(buId)
      const live = await db.from('invites').insert({
        event_id: eventId,
        celebrant_id: user.id,
        guest_id: found?.id ?? null,
        guest_phone: buId,
        guest_name: found?.display_name ?? null,
        status: 'pending',
      })
      if (live.error) {
        const next = await db.from('event_invitations').upsert(
          {
            event_id: eventId,
            invited_user_id: found?.id ?? null,
            invited_bu_id: buId,
            invited_phone: maskPhone(buId),
            invited_by: user.id,
            gate: body.gate ?? null,
            seat: body.seat ?? null,
            status: 'pending',
          },
          { onConflict: 'event_id,invited_bu_id' },
        )
        results.push({
          bu_id: buId,
          matched: Boolean(found),
          status: next.error ? 'failed' : found ? 'invited' : 'pending_unregistered',
        })
        continue
      }
      results.push({
        bu_id: buId,
        matched: Boolean(found),
        status: found ? 'invited' : 'pending_unregistered',
      })
    }

    const invitations = await fetchLiveEventInvites(eventId)
    return successResponse({ results, invitations }, 'Invitations processed')
  } catch (error) {
    return handleRouteError(error)
  }
}
