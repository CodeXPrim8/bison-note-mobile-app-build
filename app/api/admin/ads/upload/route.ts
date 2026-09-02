import { z } from 'zod'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { requireAdmin } from '@/lib/admin/session'
import { AD_SLOTS } from '@/lib/admin/ad-slots'
import { createAdCreativeUpload } from '@/lib/uploads/ads'
import { rateLimit, clientIp } from '@/lib/api/rate-limit'

export const runtime = 'nodejs'

const slotIds = AD_SLOTS.map((item) => item.id) as [string, ...string[]]

const schema = z.object({
  slot: z.enum(slotIds),
  contentType: z.string().min(3).max(80),
  size: z.number().int().positive(),
  width: z.number().positive(),
  height: z.number().positive(),
  duration: z.number().positive().optional().nullable(),
})

export async function POST(request: Request) {
  try {
    const { db, liveId } = await requireAdmin()
    const limit = rateLimit(`ad-upload:${liveId}:${clientIp(request)}`, 20, 60_000)
    if (!limit.ok) throw new ApiError(429, 'RATE_LIMITED', 'Too many advert uploads. Wait a minute.')
    const body = schema.parse(await request.json())
    const upload = await createAdCreativeUpload(db, {
      ...body,
      actorId: liveId,
    })
    return successResponse(upload, 'Ready to upload')
  } catch (error) {
    return handleRouteError(error)
  }
}
