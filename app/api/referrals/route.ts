import { z } from 'zod'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { requireUser } from '@/lib/api/session'
import { readBuSession } from '@/lib/auth/bu-session'
import { resolveLiveCelebrantId } from '@/lib/events/live'
import { tryCreateAdminClient } from '@/lib/supabase/admin'
import { createDataClient } from '@/lib/supabase/data'
import { applyReferralCode, ensureReferralCode, getReferralStats, normalizeCode } from '@/lib/referrals'

const claimSchema = z.object({
  code: z.string().min(4).max(24),
})

async function liveUserId() {
  const user = await requireUser()
  const session = await readBuSession()
  const liveId =
    (await resolveLiveCelebrantId({
      id: user.id,
      email: user.email,
      phone: session?.phone_e164 || session?.phone || null,
    })) || user.id
  return liveId
}

export async function GET() {
  try {
    const userId = await liveUserId()
    const db = tryCreateAdminClient() ?? createDataClient()
    await ensureReferralCode(db, userId)
    const stats = await getReferralStats(db, userId)
    return successResponse(stats)
  } catch (error) {
    return handleRouteError(error)
  }
}

export async function POST(request: Request) {
  try {
    const userId = await liveUserId()
    const body = claimSchema.parse(await request.json())
    const code = normalizeCode(body.code)
    if (!code) throw new ApiError(400, 'REFERRAL_INVALID', 'Enter a valid referral code.')
    const db = tryCreateAdminClient() ?? createDataClient()
    const result = await applyReferralCode(db, userId, code)
    const stats = await getReferralStats(db, userId)
    return successResponse(
      { ...stats, applied: result },
      'Referral applied. Your friend earns Ƀ1,000 after you fund or spend Ƀ3,000.',
    )
  } catch (error) {
    return handleRouteError(error)
  }
}
