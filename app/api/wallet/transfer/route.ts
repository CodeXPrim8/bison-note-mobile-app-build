import { z } from 'zod'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { requireUser } from '@/lib/api/session'
import { readBuSession } from '@/lib/auth/bu-session'
import { BU_MIN_SPRAY, BU_MIN_TRANSFER, nairaFromBu } from '@/lib/bu-rate'
import { PURPOSE_IDS } from '@/lib/purpose'
import { resolveLiveCelebrantId } from '@/lib/events/live'
import { transferBu } from '@/lib/wallet'
import { pinSchema } from '@/lib/auth/pin'
import { verifySessionPin } from '@/lib/auth/verify-session-pin'
import { ensureLiveRecipientById } from '@/lib/auth/live-user'

const schema = z.object({
  to_user_id: z.string().uuid(),
  amount: z.number().positive(),
  event_id: z.string().uuid().optional(),
  is_tip: z.boolean().optional(),
  note: z.string().max(160).optional(),
  purpose: z.enum(PURPOSE_IDS).optional(),
  locked: z.boolean().optional(),
  gift_id: z.string().uuid().optional(),
  pin: pinSchema,
})

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const [body, session] = await Promise.all([
      request.json().then((json) => schema.parse(json)),
      readBuSession(),
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
    // Ensure recipient exists in live users (heavy sync only happens here, not on lookup).
    const toUserId = (await ensureLiveRecipientById(body.to_user_id)) || body.to_user_id
    if (fromUserId === toUserId) {
      throw new ApiError(400, 'SELF_TRANSFER', 'You cannot send ɃU to yourself')
    }
    const phone = session?.phone_e164 || session?.phone
    const pinCheck = await verifySessionPin({
      userId: fromUserId,
      phone,
      pin: body.pin,
    })
    if ('wrongPin' in pinCheck) {
      throw new ApiError(401, 'WRONG_PIN', 'Incorrect transaction PIN.')
    }
    if ('pinNotSet' in pinCheck) {
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
      toUserId,
      amount: naira,
      eventId: body.event_id,
      isTip: body.is_tip,
      note: body.note,
      purpose: body.purpose,
      locked: body.locked,
      giftId: body.gift_id,
    })
    return successResponse(
      {
        ok: true,
        bu: body.amount,
        naira,
        total_debit_bu: moved.totalDebitBu,
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
