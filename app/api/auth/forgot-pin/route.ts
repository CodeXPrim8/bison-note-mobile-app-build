import { z } from 'zod'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { clientIp, rateLimit } from '@/lib/api/rate-limit'
import { requestPinReset } from '@/lib/auth/pin-reset'

const schema = z.object({
  phone: z.string().min(7).max(40),
})

export async function POST(request: Request) {
  try {
    const limited = rateLimit(`forgot-pin:${clientIp(request)}`, 5, 15 * 60_000)
    if (!limited.ok) throw new ApiError(429, 'RATE_LIMITED', 'Too many reset requests. Try again later.')

    const body = schema.parse(await request.json())
    const result = await requestPinReset(body.phone)
    return successResponse(result, result.message)
  } catch (error) {
    return handleRouteError(error)
  }
}
