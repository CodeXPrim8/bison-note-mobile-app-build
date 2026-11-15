import { z } from 'zod'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { clientIp, rateLimit } from '@/lib/api/rate-limit'
import { pinSchema } from '@/lib/auth/pin'
import { completePinReset } from '@/lib/auth/pin-reset'

const schema = z.object({
  challenge: z.string().min(20).max(2000),
  otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  new_pin: pinSchema,
  confirm_pin: pinSchema,
})

export async function POST(request: Request) {
  try {
    const limited = rateLimit(`reset-pin:${clientIp(request)}`, 8, 15 * 60_000)
    if (!limited.ok) throw new ApiError(429, 'RATE_LIMITED', 'Too many attempts. Request a new code.')

    const body = schema.parse(await request.json())
    if (body.new_pin !== body.confirm_pin) {
      throw new ApiError(400, 'PIN_MISMATCH', 'New PINs do not match.')
    }

    const result = await completePinReset({
      challenge: body.challenge,
      otp: body.otp,
      newPin: body.new_pin,
    })
    return successResponse(result, result.message)
  } catch (error) {
    return handleRouteError(error)
  }
}
