import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { requireUser } from '@/lib/api/session'
import { readBuSession } from '@/lib/auth/bu-session'
import { resolveLiveCelebrantId, submitLiveTicketFeedback } from '@/lib/events/live'
import { ticketFeedbackSchema } from '@/lib/schemas/ticket'

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const session = await readBuSession()
    const body = ticketFeedbackSchema.parse(await request.json())
    const guestId = await resolveLiveCelebrantId({
      id: user.id,
      email: user.email,
      phone: session?.phone_e164 || session?.phone,
    })
    if (!guestId) {
      throw new ApiError(403, 'NOT_LIVE_USER', 'Sign in with your ɃU ID to leave a comment.')
    }
    const result = await submitLiveTicketFeedback({
      ticketId: body.ticket_id,
      guestId,
      comment: body.comment,
    })
    if ('error' in result) {
      throw new ApiError(503, 'FEEDBACK_FAILED', result.error)
    }
    if (!result.ticket) {
      throw new ApiError(403, 'FORBIDDEN', 'You can only comment on a ticket you paid for.')
    }
    return successResponse(result.ticket, 'Thanks — your comment was sent to the organiser.')
  } catch (error) {
    return handleRouteError(error)
  }
}
