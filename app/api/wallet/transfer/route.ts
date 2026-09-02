import { z } from 'zod'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { requireUser } from '@/lib/api/session'
import { readBuSession } from '@/lib/auth/bu-session'
import { BU_MIN_SPRAY, BU_MIN_TRANSFER, nairaFromBu } from '@/lib/bu-rate'
import { resolveLiveCelebrantId } from '@/lib/events/live'
import { transferBu } from '@/lib/wallet'
import { getPlatformSettings } from '@/lib/admin/platform'

const schema = z.object({
  to_user_id: z.string().uuid(),
  amount: z.number().positive(),
  event_id: z.string().uuid().optional(),
  is_tip: z.boolean().optional(),
})

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    await getPlatformSettings()
    const body = schema.parse(await request.json())
    const session = await readBuSession()
    const fromUserId =
      (await resolveLiveCelebrantId({
        id: user.id,
        email: user.email,
        phone: session?.phone_e164 || session?.phone || null,
      })) || user.id
    if (fromUserId === body.to_user_id) {
      throw new ApiError(400, 'SELF_TRANSFER', 'You cannot send ɃU to yourself')
    }
    const sprayLike = Boolean(body.event_id || body.is_tip)
    const minBu = sprayLike ? BU_MIN_SPRAY : BU_MIN_TRANSFER
    if (body.amount + 1e-9 < minBu) {
      throw new ApiError(
        400,
        'AMOUNT_TOO_SMALL',
        sprayLike
          ? `Minimum spray is ${BU_MIN_SPRAY.toLocaleString('en-NG')} ɃU (₦${BU_MIN_SPRAY.toLocaleString('en-NG')})`
          : `Minimum transfer is ${BU_MIN_TRANSFER.toLocaleString('en-NG')} ɃU`,
      )
    }
    const naira = nairaFromBu(body.amount)
    await transferBu({
      fromUserId,
      toUserId: body.to_user_id,
      amount: naira,
      eventId: body.event_id,
      isTip: body.is_tip,
    })
    return successResponse({ ok: true, bu: body.amount, naira }, 'Transferred')
  } catch (error) {
    return handleRouteError(error)
  }
}
