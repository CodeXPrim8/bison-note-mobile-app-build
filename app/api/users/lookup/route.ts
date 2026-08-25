import { z } from 'zod'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { requireUser } from '@/lib/api/session'
import { maskPhone, normalizePhone } from '@/lib/phone'
import { rateLimit, clientIp } from '@/lib/api/rate-limit'
import { lookupLiveUser } from '@/lib/events/live'

const schema = z.object({
  bu_id: z.string().min(7).max(32),
})

/** Exact ɃU ID lookup against the live users table. Never returns PIN data. */
export async function POST(request: Request) {
  try {
    const limit = rateLimit(`lookup:${clientIp(request)}`, 30, 60_000)
    if (!limit.ok) throw new ApiError(429, 'RATE_LIMITED', 'Too many lookups')
    await requireUser()
    const body = schema.parse(await request.json())
    const buId = normalizePhone(body.bu_id)
    if (!buId) throw new ApiError(400, 'INVALID_BU_ID', 'Enter a valid ɃU ID (phone number)')

    const found = await lookupLiveUser(body.bu_id)
    if (!found) {
      return successResponse({ exists: false, bu_id: buId })
    }

    return successResponse({
      exists: true,
      id: found.id,
      bu_id: buId,
      display_name: found.display_name,
      phone_hint: found.phone ? maskPhone(found.phone) : null,
    })
  } catch (error) {
    return handleRouteError(error)
  }
}
