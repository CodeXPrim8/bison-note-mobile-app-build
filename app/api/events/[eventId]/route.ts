import { ApiError, handleRouteError, successResponse } from '@/lib/api/errors'
import { requireUser } from '@/lib/api/session'
import { fetchLiveEventDashboard } from '@/lib/events/live'

export async function GET(_request: Request, context: { params: Promise<{ eventId: string }> }) {
  try {
    const user = await requireUser()
    const { eventId } = await context.params
    const dash = await fetchLiveEventDashboard(eventId, user.id)
    if (!dash) throw new ApiError(404, 'NOT_FOUND', 'Event not found')
    if ('forbidden' in dash) throw new ApiError(403, 'FORBIDDEN', 'Not the organizer')
    return successResponse(dash)
  } catch (error) {
    return handleRouteError(error)
  }
}
