import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '@/lib/api/errors'
import { nairaFromBu } from '@/lib/bu-rate'
import { moveLiveWallet } from '@/lib/wallet/move'
import { REFERRAL_REWARD_BU, normalizeReferralCode } from '@/lib/referrals-shared'

export { REFERRAL_REWARD_BU, normalizeReferralCode as normalizeCode }

function makeCode(userId: string) {
  const compact = userId.replace(/-/g, '').toUpperCase()
  const chunk = (compact.slice(0, 4) + compact.slice(-4)).slice(0, 8)
  return `BU${chunk}`
}

export async function ensureReferralCode(db: SupabaseClient, userId: string) {
  const existing = await db.from('bu_referral_codes').select('code').eq('user_id', userId).maybeSingle()
  if (existing.data?.code) return String(existing.data.code)

  let code = makeCode(userId)
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const clash = await db.from('bu_referral_codes').select('user_id').eq('code', code).maybeSingle()
    if (!clash.data) {
      const inserted = await db.from('bu_referral_codes').insert({ user_id: userId, code }).select('code').maybeSingle()
      if (!inserted.error && inserted.data?.code) return String(inserted.data.code)
      if (inserted.error && !/duplicate|unique/i.test(inserted.error.message)) {
        throw new ApiError(500, 'REFERRAL_CODE_FAILED', inserted.error.message)
      }
    }
    code = `BU${Math.random().toString(36).slice(2, 8).toUpperCase()}`
  }
  throw new ApiError(500, 'REFERRAL_CODE_FAILED', 'Could not create a referral code.')
}

export async function findReferrerByCode(db: SupabaseClient, rawCode: string) {
  const code = normalizeReferralCode(rawCode)
  if (code.length < 4) return null
  const row = await db.from('bu_referral_codes').select('user_id, code').eq('code', code).maybeSingle()
  if (!row.data?.user_id) return null
  return { userId: String(row.data.user_id), code: String(row.data.code) }
}

export async function getReferralStats(db: SupabaseClient, userId: string) {
  const code = await ensureReferralCode(db, userId)
  const list = await db
    .from('bu_referrals')
    .select('id, referee_id, reward_bu, status, created_at, code')
    .eq('referrer_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)
  const rows = (list.data ?? []) as Array<Record<string, unknown>>
  const earnedBu = rows.reduce((sum, row) => sum + Number(row.reward_bu ?? 0), 0)
  const alreadyReferred = await db.from('bu_referrals').select('id').eq('referee_id', userId).maybeSingle()
  return {
    code,
    link_path: `/r/${code}`,
    reward_bu: REFERRAL_REWARD_BU,
    earned_bu: earnedBu,
    referral_count: rows.length,
    already_referred: Boolean(alreadyReferred.data?.id),
    referrals: rows.map((row) => ({
      id: String(row.id),
      reward_bu: Number(row.reward_bu ?? 0),
      status: String(row.status ?? 'paid'),
      created_at: String(row.created_at ?? ''),
    })),
  }
}

/** Credit referrer Ƀ1,000 when a new user applies a valid code (once). */
export async function applyReferralCode(db: SupabaseClient, refereeId: string, rawCode: string) {
  const referrer = await findReferrerByCode(db, rawCode)
  if (!referrer) {
    throw new ApiError(400, 'REFERRAL_INVALID', 'That referral code was not found.')
  }
  if (referrer.userId === refereeId) {
    throw new ApiError(400, 'REFERRAL_SELF', 'You cannot use your own referral code.')
  }

  const existing = await db.from('bu_referrals').select('id').eq('referee_id', refereeId).maybeSingle()
  if (existing.data?.id) {
    throw new ApiError(409, 'REFERRAL_USED', 'A referral code is already on this account.')
  }

  const rewardBu = REFERRAL_REWARD_BU
  const inserted = await db
    .from('bu_referrals')
    .insert({
      referrer_id: referrer.userId,
      referee_id: refereeId,
      code: referrer.code,
      reward_bu: rewardBu,
      status: 'paid',
    })
    .select('id')
    .maybeSingle()

  if (inserted.error) {
    if (/duplicate|unique/i.test(inserted.error.message)) {
      throw new ApiError(409, 'REFERRAL_USED', 'A referral code is already on this account.')
    }
    throw new ApiError(500, 'REFERRAL_FAILED', inserted.error.message)
  }

  await moveLiveWallet(db, {
    userId: referrer.userId,
    naira: nairaFromBu(rewardBu),
    direction: 'credit',
    type: 'referral_bonus',
    description: `Referral bonus · ${referrer.code}`,
    metadata: {
      kind: 'referral_bonus',
      referee_id: refereeId,
      code: referrer.code,
      bu: rewardBu,
    },
  })

  return { code: referrer.code, reward_bu: rewardBu }
}
