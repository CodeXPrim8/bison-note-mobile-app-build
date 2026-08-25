import { z } from 'zod'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { getProfile, requireUser } from '@/lib/api/session'
import { createDataClient } from '@/lib/supabase/data'
import { fetchLiveInvites } from '@/lib/events/live'

export async function GET() {
  try {
    const user = await requireUser()
    const profile = await getProfile(user.id)
    const invites = await fetchLiveInvites(user.id, profile?.phone_e164 ?? profile?.phone)
    return successResponse(invites)
  } catch (error) {
    return handleRouteError(error)
  }
}

const patchSchema = z.object({
  invitation_id: z.string().uuid(),
  status: z.enum(['accepted', 'declined', 'viewed']),
})

export async function PATCH(request: Request) {
  try {
    const user = await requireUser()
    const body = patchSchema.parse(await request.json())
    const db = createDataClient()
    const live = await db.from('invites').update({ status: body.status }).eq('id', body.invitation_id).eq('guest_id', user.id).select('*').maybeSingle()
    if (!live.error && live.data) return successResponse(live.data)
    const next = await db
      .from('event_invitations')
      .update({ status: body.status, invited_user_id: user.id })
      .eq('id', body.invitation_id)
      .select('*')
      .maybeSingle()
    if (next.error || !next.data) throw new ApiError(404, 'NOT_FOUND', 'Invitation not found')
    return successResponse(next.data)
  } catch (error) {
    return handleRouteError(error)
  }
}
