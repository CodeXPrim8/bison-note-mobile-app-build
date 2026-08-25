import { handleRouteError, successResponse } from '@/lib/api/errors'
import { requireUser } from '@/lib/api/session'
import { fetchOrganizerEventRows, withLiveTiers } from '@/lib/events/live'

export async function GET() {
  try {
    const user = await requireUser()
    const rows = await fetchOrganizerEventRows(user.id)
    return successResponse(rows.map(withLiveTiers))
  } catch (error) {
    return handleRouteError(error)
  }
}
