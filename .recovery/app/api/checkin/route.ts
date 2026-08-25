import { checkinSchema } from '@/lib/schemas/ticket'
import { checkInTicket } from '@/lib/tickets/checkin'
import { handleRouteError, successResponse } from '@/lib/api/errors'
import { getSessionUser } from '@/lib/api/session'

export async function POST(request: Request) {
  try {
    const json: unknown = await request.json()
    const body = checkinSchema.parse(json)
    const user = await getSessionUser()
    const result = await checkInTicket({
      eventId: body.event_id,
      checkinCode: body.checkin_code,
      qrPayload: body.qr_payload,
      gatekeeperId: user?.id ?? null,
    })
    return successResponse(result, result.message)
  } catch (error) {
    return handleRouteError(error)
  }
}
