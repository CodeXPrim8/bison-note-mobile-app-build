import { checkinSchema } from '@/lib/schemas/ticket'
import { checkInTicket } from '@/lib/tickets/checkin'
import { ApiError, handleRouteError, successResponse } from '@/lib/api/errors'
import { requireDoorOrganizer } from '@/lib/tickets/door-auth'
import { auditFromRequest } from '@/lib/api/audit-request'
import { rateLimit, clientIp } from '@/lib/api/rate-limit'

export async function POST(request: Request) {
  try {
    const limit = rateLimit(`checkin:${clientIp(request)}`, 240, 60_000)
    if (!limit.ok) {
      throw new ApiError(429, 'RATE_LIMITED', 'Too many check-in attempts')
    }
    const json: unknown = await request.json()
    const body = checkinSchema.parse(json)
    const { user } = await requireDoorOrganizer(body.event_id)
    const result = await checkInTicket({
      eventId: body.event_id,
      checkinCode: body.checkin_code,
      qrPayload: body.qr_payload,
      gatekeeperId: user.id,
      confirm: body.confirm,
    })
    void auditFromRequest(request, { actorUserId: user.id, statusCode: 200 })
    return successResponse(result, result.message)
  } catch (error) {
    return handleRouteError(error)
  }
}
