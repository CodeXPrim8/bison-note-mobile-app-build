import { z } from 'zod'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { requireUser } from '@/lib/api/session'
import { readBuSession } from '@/lib/auth/bu-session'
import { BU_MIN_SPRAY, BU_MIN_TRANSFER, nairaFromBu } from '@/lib/bu-rate'
import { resolveLiveCelebrantId } from '@/lib/events/live'
import { transferBu } from '@/lib/wallet'
import { getPlatformSettings } from '@/lib/admin/platform'
import { pinSchema } from '@/lib/auth/pin'
import { verifyLegacyBuPin } from '@/lib/auth/legacy-login'

const schema = z.object({
  to_user_id: z.string().uuid(),
  amount: z.number().positive(),
  event_id: z.string().uuid().optional(),
  is_tip: z.boolean().optional(),
  note: z.string().max(160).optional(),
  pin: pinSchema,
})

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const [body, session] = await Promise.all([
      request.json().then((json) => schema.parse(json)),
      readBuSession(),
      getPlatformSettings(),
    ])
    const fromUserId =
      (await resolveLiveCelebrantId({
        id: user.id,
        email: user.email,
        phone: session?.phone_e164 || session?.phone || null,
      })) || user.id
    if (fromUserId === body.to_user_id) {
      throw new ApiError(400, 'SELF_TRANSFER', 'You cannot send ɃU to yourself')
    }
    const phone = session?.phone_e164 || session?.phone
    if (!phone) {
      throw new ApiError(400, 'PIN_REQUIRED', 'Enter the transaction PIN you created for this account.')
    }
    const pinCheck = await verifyLegacyBuPin(phone, body.pin)
    if ('wrongPin' in pinCheck) {
      throw new ApiError(401, 'WRONG_PIN', 'Incorrect transaction PIN.')
    }
    if (!('session' in pinCheck)) {
      throw new ApiError(400, 'PIN_NOT_SET', 'Create your transaction PIN at signup before sending ɃU.')
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
    const moved = await transferBu({
      fromUserId,
      toUserId: body.to_user_id,
      amount: naira,
      eventId: body.event_id,
      isTip: body.is_tip,
      note: body.note,
    })
    return successResponse(
      {
        ok: true,
        bu: body.amount,
        naira,
        invoice_number: moved.moveId,
        from_name: moved.fromName,
        to_name: moved.toName,
        kind: moved.kind,
      },
      'Transferred',
    )
  } catch (error) {
    return handleRouteError(error)
  }
}
