import { z } from 'zod'
import { handleRouteError, successResponse } from '@/lib/api/errors'
import { requireUser } from '@/lib/api/session'
import { transferBu } from '@/lib/wallet'

const schema = z.object({
  to_user_id: z.string().uuid(),
  amount: z.number().positive(),
  event_id: z.string().uuid().optional(),
  is_tip: z.boolean().optional(),
})

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = schema.parse(await request.json())
    await transferBu({
      fromUserId: user.id,
      toUserId: body.to_user_id,
      amount: body.amount,
      eventId: body.event_id,
      isTip: body.is_tip,
    })
    return successResponse({ ok: true }, 'Transferred')
  } catch (error) {
    return handleRouteError(error)
  }
}
