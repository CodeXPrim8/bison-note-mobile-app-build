import { z } from 'zod'
import { handleRouteError, successResponse } from '@/lib/api/errors'
import { requireUser } from '@/lib/api/session'
import { transferBu } from '@/lib/wallet'
import { createAdminClient } from '@/lib/supabase/admin'
import { ApiError } from '@/lib/api/errors'

const schema = z.object({
  to_user_id: z.string().uuid().optional(),
  to_username: z.string().optional(),
  amount: z.number().positive(),
  event_id: z.string().uuid().optional(),
  is_tip: z.boolean().optional().default(false),
})

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = schema.parse(await request.json())
    const admin = createAdminClient()
    let toUserId = body.to_user_id
    if (!toUserId && body.to_username) {
      const { data } = await admin
        .from('profiles')
        .select('id')
        .eq('username', body.to_username.replace(/^@/, ''))
        .maybeSingle()
      toUserId = data?.id as string | undefined
    }
    if (!toUserId) {
      throw new ApiError(404, 'USER_NOT_FOUND', 'Recipient not found')
    }
    if (toUserId === user.id) {
      throw new ApiError(400, 'INVALID_RECIPIENT', 'Cannot send to yourself')
    }
    await transferBu({
      fromUserId: user.id,
      toUserId,
      amount: body.amount,
      eventId: body.event_id,
      isTip: body.is_tip,
    })
    return successResponse({ ok: true }, 'Transfer complete')
  } catch (error) {
    return handleRouteError(error)
  }
}
