import { createDataClient } from '@/lib/supabase/data'
import { ApiError } from '@/lib/api/errors'
import { isServiceRoleConfigured } from '@/lib/env'

const BUCKET = 'event-covers'
const MAX_BYTES = 4 * 1024 * 1024

function detectImage(bytes: Buffer) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return { mime: 'image/jpeg', ext: 'jpg' }
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { mime: 'image/png', ext: 'png' }
  }
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return { mime: 'image/gif', ext: 'gif' }
  if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { mime: 'image/webp', ext: 'webp' }
  }
  return null
}

function needsCoverSql(message: string) {
  return /row-level security|policy|bucket not found/i.test(message)
}

export async function uploadEventCover(file: File, userId: string) {
  if (file.size <= 0 || file.size > MAX_BYTES) {
    throw new ApiError(400, 'IMAGE_TOO_LARGE', 'Cover image must be 4MB or smaller')
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  const kind = detectImage(bytes)
  if (!kind) {
    throw new ApiError(400, 'INVALID_IMAGE', 'Use a JPG, PNG, WEBP, or GIF image')
  }

  const pathName = `${userId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${kind.ext}`
  const db = createDataClient()

  let uploaded = await db.storage.from(BUCKET).upload(pathName, bytes, {
    contentType: kind.mime,
    upsert: false,
  })

  if (uploaded.error && /bucket not found/i.test(uploaded.error.message) && isServiceRoleConfigured()) {
    await db.storage.createBucket(BUCKET, { public: true, fileSizeLimit: MAX_BYTES })
    uploaded = await db.storage.from(BUCKET).upload(pathName, bytes, {
      contentType: kind.mime,
      upsert: false,
    })
  }

  if (uploaded.error) {
    throw new ApiError(
      503,
      'UPLOAD_FAILED',
      needsCoverSql(uploaded.error.message)
        ? 'Image upload is not enabled on live ɃU storage yet. Run supabase/migrations/0009_event_covers.sql in the ɃU Supabase SQL editor, then try again.'
        : uploaded.error.message,
    )
  }

  const { data } = db.storage.from(BUCKET).getPublicUrl(pathName)
  if (!data?.publicUrl) {
    throw new ApiError(500, 'UPLOAD_FAILED', 'Image uploaded but no public URL was returned')
  }
  return data.publicUrl
}
