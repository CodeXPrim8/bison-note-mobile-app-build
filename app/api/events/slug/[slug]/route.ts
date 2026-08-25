import { ApiError, handleRouteError, successResponse } from '@/lib/api/errors'
import { canViewEvent } from '@/lib/events/access'
import { fetchEventRowBySlug, withLiveTiers } from '@/lib/events/live'

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params
    const row = await fetchEventRowBySlug(slug)
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Event not found')
    const packed = withLiveTiers(row)
    const allowed = await canViewEvent(packed)
    if (!allowed) {
      throw new ApiError(404, 'NOT_FOUND', 'Event not found')
    }
    return successResponse({
      ...packed,
      organizer_name: packed.organizer_name ?? packed.celebrant_name,
    })
  } catch (error) {
    return handleRouteError(error)
  }
}
