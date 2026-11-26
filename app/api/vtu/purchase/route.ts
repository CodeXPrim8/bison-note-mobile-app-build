import { z } from 'zod'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { requireUser } from '@/lib/api/session'
import { readBuSession } from '@/lib/auth/bu-session'
import { pinSchema } from '@/lib/auth/pin'
import { verifySessionPin } from '@/lib/auth/verify-session-pin'
import { resolveLiveCelebrantId } from '@/lib/events/live'
import { isVtuPublicEnabled } from '@/lib/vtu/provider'
import { purchaseVtu } from '@/lib/vtu/purchase'

const schema = z.object({
  kind: z.enum(['airtime', 'data']),
  phone: z.string().min(7).max(20),
  product_id: z.string().min(3).max(80),
  custom_naira: z.number().int().min(50).max(50000).optional(),
  network: z.enum(['mtn', 'airtel', 'glo', '9mobile']).optional(),
  pin: pinSchema,
})

export async function POST(request: Request) {
  try {
    if (!isVtuPublicEnabled()) {
      throw new ApiError(503, 'VTU_COMING_SOON', 'Airtime and data are coming soon.')
    }
    const user = await requireUser()
    const [body, session] = await Promise.all([request.json().then((json) => schema.parse(json)), readBuSession()])
    const phone = session?.phone_e164 || session?.phone
    const userId =
      (await resolveLiveCelebrantId({
        id: user.id,
        email: user.email,
        phone: session?.phone_e164 || session?.phone || null,
      })) || user.id
    const pinCheck = await verifySessionPin({
      userId,
      phone,
      pin: body.pin,
    })
    if ('wrongPin' in pinCheck) {
      throw new ApiError(401, 'WRONG_PIN', 'Incorrect transaction PIN.')
    }
    if ('pinNotSet' in pinCheck) {
      throw new ApiError(400, 'PIN_NOT_SET', 'Create your transaction PIN at signup before buying airtime or data.')
    }

    const result = await purchaseVtu({
      userId,
      kind: body.kind,
      phone: body.phone,
      productId: body.product_id,
      customNaira: body.custom_naira,
      networkId: body.network,
    })

    return successResponse(result)
  } catch (error) {
    return handleRouteError(error)
  }
}
