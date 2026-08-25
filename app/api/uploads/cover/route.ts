import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { requireUser } from '@/lib/api/session'
import { rateLimit, clientIp } from '@/lib/api/rate-limit'
import { uploadEventCover } from '@/lib/uploads/cover'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const limit = rateLimit(`cover:${user.id}:${clientIp(request)}`, 12, 60_000)
    if (!limit.ok) throw new ApiError(429, 'RATE_LIMITED', 'Too many image uploads. Wait a minute.')
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      throw new ApiError(400, 'INVALID_IMAGE', 'Choose an image file to upload')
    }
    const url = await uploadEventCover(file, user.id)
    return successResponse({ url }, 'Cover uploaded')
  } catch (error) {
    return handleRouteError(error)
  }
}
