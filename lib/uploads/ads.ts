import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '@/lib/api/errors'
import { getAdSlot, mediaFitsSlot, slotSizeLabel, type AdSlotSpec } from '@/lib/admin/ad-slots'
import { isServiceRoleConfigured } from '@/lib/env'

export const ADS_BUCKET = 'bu-ads'
export const AD_IMAGE_MAX_BYTES = 6 * 1024 * 1024
export const AD_VIDEO_MAX_BYTES = 20 * 1024 * 1024

const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

const VIDEO_TYPES: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
}

export type AdMediaKind = 'image' | 'video'

export function adContentKind(contentType: string): { kind: AdMediaKind; ext: string } | null {
  const mime = contentType.split(';')[0]?.trim().toLowerCase() ?? ''
  if (IMAGE_TYPES[mime]) return { kind: 'image', ext: IMAGE_TYPES[mime] }
  if (VIDEO_TYPES[mime]) return { kind: 'video', ext: VIDEO_TYPES[mime] }
  return null
}

export function assertAdCreativeFits(input: {
  slot: string
  contentType: string
  size: number
  width: number
  height: number
  duration?: number | null
}): { spec: AdSlotSpec; kind: AdMediaKind; ext: string } {
  const spec = getAdSlot(input.slot)
  if (!spec) throw new ApiError(400, 'INVALID_SLOT', 'Choose an advert placement first.')

  const parsed = adContentKind(input.contentType)
  if (!parsed) {
    throw new ApiError(400, 'INVALID_MEDIA', 'Use a JPG, PNG, WEBP, GIF, MP4, or WEBM file.')
  }

  const maxBytes = parsed.kind === 'video' ? AD_VIDEO_MAX_BYTES : AD_IMAGE_MAX_BYTES
  if (!(input.size > 0) || input.size > maxBytes) {
    throw new ApiError(
      400,
      'FILE_TOO_LARGE',
      parsed.kind === 'video'
        ? 'Video must be 20MB or smaller.'
        : 'Image must be 6MB or smaller.',
    )
  }

  const fit = mediaFitsSlot(spec, input.width, input.height)
  if (!fit.ok) throw new ApiError(400, 'WRONG_SIZE', fit.message)

  if (parsed.kind === 'video') {
    const seconds = Number(input.duration)
    if (Number.isFinite(seconds) && seconds > spec.maxSeconds + 0.35) {
      throw new ApiError(
        400,
        'VIDEO_TOO_LONG',
        `This slot allows videos up to ${spec.maxSeconds} seconds. Yours is ${Math.round(seconds)}s.`,
      )
    }
  }

  return { spec, kind: parsed.kind, ext: parsed.ext }
}

function needsAdsSql(message: string) {
  return /row-level security|policy|bucket not found|not found/i.test(message)
}

export async function ensureAdsBucket(db: SupabaseClient) {
  const existing = await db.storage.getBucket(ADS_BUCKET)
  if (existing.data) return
  const created = await db.storage.createBucket(ADS_BUCKET, {
    public: true,
    fileSizeLimit: AD_VIDEO_MAX_BYTES,
    allowedMimeTypes: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'video/mp4',
      'video/webm',
      'video/quicktime',
    ],
  })
  if (created.error && !/already exists/i.test(created.error.message)) {
    throw new ApiError(
      503,
      'ADS_STORAGE_REQUIRED',
      isServiceRoleConfigured()
        ? created.error.message
        : 'Run supabase/migrations/0017_ad_creatives.sql in the ɃU Supabase SQL editor so advert uploads can be stored.',
    )
  }
}

export async function createAdCreativeUpload(
  db: SupabaseClient,
  input: {
    slot: string
    contentType: string
    size: number
    width: number
    height: number
    duration?: number | null
    actorId: string
  },
) {
  const { spec, kind, ext } = assertAdCreativeFits(input)
  await ensureAdsBucket(db)

  const pathName = `${spec.id}/${input.actorId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`
  let signed = await db.storage.from(ADS_BUCKET).createSignedUploadUrl(pathName)

  if (signed.error && /bucket not found/i.test(signed.error.message) && isServiceRoleConfigured()) {
    await ensureAdsBucket(db)
    signed = await db.storage.from(ADS_BUCKET).createSignedUploadUrl(pathName)
  }

  if (signed.error || !signed.data?.signedUrl) {
    throw new ApiError(
      503,
      'UPLOAD_FAILED',
      signed.error && needsAdsSql(signed.error.message)
        ? 'Advert upload is not enabled on live ɃU storage yet. Run supabase/migrations/0017_ad_creatives.sql in the ɃU Supabase SQL editor, then try again.'
        : signed.error?.message ?? 'Could not start the upload.',
    )
  }

  const { data: publicData } = db.storage.from(ADS_BUCKET).getPublicUrl(pathName)
  if (!publicData?.publicUrl) {
    throw new ApiError(500, 'UPLOAD_FAILED', 'Upload started but no public URL was returned.')
  }

  return {
    slot: spec.id,
    kind,
    path: signed.data.path,
    token: signed.data.token,
    uploadUrl: signed.data.signedUrl,
    publicUrl: publicData.publicUrl,
    width: spec.width,
    height: spec.height,
    sizeLabel: slotSizeLabel(spec),
  }
}
