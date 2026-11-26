import { z } from 'zod'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { requireUser } from '@/lib/api/session'
import { readBuSession } from '@/lib/auth/bu-session'
import { resolveLiveCelebrantId } from '@/lib/events/live'
import { pinSchema } from '@/lib/auth/pin'
import { verifySessionPin } from '@/lib/auth/verify-session-pin'
import { ensureLiveRecipientById } from '@/lib/auth/live-user'
import { payPosSale } from '@/lib/pos/sales'
import { BU_MIN_TRANSFER } from '@/lib/bu-rate'

const schema = z.object({
  vendor_user_id: z.string().uuid(),
  event_id: z.string().uuid().optional().nullable(),
  amount: z.number().positive(),
  pin: pinSchema,
})

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const [body, session] = await Promise.all([request.json().then((json) => schema.parse(json)), readBuSession()])
    const guestId =
      (await resolveLiveCelebrantId({
        id: user.id,
        email: user.email,
        phone: session?.phone_e164 || session?.phone || null,
      })) || user.id

    if (body.amount + 1e-9 < BU_MIN_TRANSFER) {
      throw new ApiError(
        400,
        'AMOUNT_TOO_SMALL',
        `Minimum POS payment is ${BU_MIN_TRANSFER.toLocaleString('en-NG')} ɃU`,
      )
    }

    const phone = session?.phone_e164 || session?.phone
    const pinCheck = await verifySessionPin({
      userId: guestId,
      phone,
      pin: body.pin,
    })
    if ('wrongPin' in pinCheck) throw new ApiError(401, 'WRONG_PIN', 'Incorrect transaction PIN.')
    if ('pinNotSet' in pinCheck) {
      throw new ApiError(400, 'PIN_NOT_SET', 'Create your transaction PIN before paying at POS.')
    }

    const vendorId = (await ensureLiveRecipientById(body.vendor_user_id)) || body.vendor_user_id
    const result = await payPosSale({
      guestUserId: guestId,
      vendorUserId: vendorId,
      eventId: body.event_id,
      amountBu: body.amount,
    })

    return successResponse(
      {
        ok: true,
        reference: result.sale.reference,
        sale_id: result.sale.id,
        mode: result.sale.mode,
        amount_bu: result.amountBu,
        total_debit_bu: result.totalDebitBu,
        celebrant_bu: result.celebrantBu,
        vendor_bu: result.vendorBu,
        event_title: result.eventTitle,
        status: result.sale.status,
      },
      'Paid',
    )
  } catch (error) {
    return handleRouteError(error)
  }
}
