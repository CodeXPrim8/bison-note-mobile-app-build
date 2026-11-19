import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '@/lib/api/errors'
import { buFromNaira, nairaFromBu } from '@/lib/bu-rate'
import { moveLiveWallet } from '@/lib/wallet/move'
import {
  REFERRAL_QUALIFY_BU,
  REFERRAL_REWARD_BU,
  normalizeReferralCode,
} from '@/lib/referrals-shared'

export { REFERRAL_REWARD_BU, REFERRAL_QUALIFY_BU, normalizeReferralCode as normalizeCode }

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
  const earnedBu = rows
    .filter((row) => String(row.status ?? '') === 'paid')
    .reduce((sum, row) => sum + Number(row.reward_bu ?? 0), 0)
  const alreadyReferred = await db.from('bu_referrals').select('id').eq('referee_id', userId).maybeSingle()
  return {
    code,
    link_path: `/r/${code}`,
    reward_bu: REFERRAL_REWARD_BU,
    qualify_bu: REFERRAL_QUALIFY_BU,
    earned_bu: earnedBu,
    referral_count: rows.length,
    already_referred: Boolean(alreadyReferred.data?.id),
    referrals: rows.map((row) => ({
      id: String(row.id),
      reward_bu: Number(row.reward_bu ?? 0),
      status: String(row.status ?? 'pending'),
      created_at: String(row.created_at ?? ''),
    })),
  }
}

async function refereeActivityBu(db: SupabaseClient, refereeId: string) {
  const ledger = await db
    .from('bu_wallet_ledger')
    .select('naira, direction, type, metadata')
    .eq('user_id', refereeId)
    .limit(400)

  if (!ledger.error && ledger.data) {
    let fundedBu = 0
    let spentBu = 0
    for (const row of ledger.data as Array<Record<string, unknown>>) {
      const naira = Number(row.naira ?? 0)
      if (!Number.isFinite(naira) || naira <= 0) continue
      const bu = buFromNaira(naira)
      const type = String(row.type ?? '')
      const direction = String(row.direction ?? '')
      const meta = (row.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as Record<
        string,
        unknown
      >
      const requested = String(meta.requested_type ?? '')
      if (direction === 'credit' && (type === 'deposit' || requested === 'deposit')) {
        fundedBu += bu
      }
      if (direction === 'debit') {
        spentBu += bu
      }
    }
    return { fundedBu, spentBu }
  }

  const txs = await db
    .from('bu_transactions')
    .select('amount, type, metadata')
    .eq('user_id', refereeId)
    .limit(400)
  let fundedBu = 0
  let spentBu = 0
  for (const row of (txs.data ?? []) as Array<Record<string, unknown>>) {
    const naira = Math.abs(Number(row.amount ?? 0))
    if (!Number.isFinite(naira) || naira <= 0) continue
    const bu = buFromNaira(naira)
    const type = String(row.type ?? '')
    const meta = (row.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as Record<
      string,
      unknown
    >
    const direction = String(meta.direction ?? '')
    if (type === 'deposit' || String(meta.requested_type ?? '') === 'deposit') {
      fundedBu += bu
      continue
    }
    if (direction === 'debit' || ['withdrawal', 'spray', 'purchase', 'ticket_purchase', 'pos_sale'].includes(type)) {
      spentBu += bu
    }
  }
  return { fundedBu, spentBu }
}

function qualifiesForReward(fundedBu: number, spentBu: number) {
  return fundedBu + 1e-9 >= REFERRAL_QUALIFY_BU || spentBu + 1e-9 >= REFERRAL_QUALIFY_BU
}

/** Credit referrer once the referee has funded or spent ≥ qualify threshold. */
export async function maybeSettleReferralReward(db: SupabaseClient, refereeId: string) {
  if (!refereeId) return null
  const pending = await db
    .from('bu_referrals')
    .select('id, referrer_id, referee_id, code, reward_bu, status')
    .eq('referee_id', refereeId)
    .eq('status', 'pending')
    .maybeSingle()

  if (pending.error || !pending.data?.id) return null

  const { fundedBu, spentBu } = await refereeActivityBu(db, refereeId)
  if (!qualifiesForReward(fundedBu, spentBu)) return null

  const rewardBu = Number(pending.data.reward_bu ?? REFERRAL_REWARD_BU) || REFERRAL_REWARD_BU
  const referrerId = String(pending.data.referrer_id)
  const code = String(pending.data.code ?? '')

  const claimed = await db
    .from('bu_referrals')
    .update({ status: 'paid' })
    .eq('id', pending.data.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()

  if (claimed.error || !claimed.data?.id) return null

  try {
    await moveLiveWallet(db, {
      userId: referrerId,
      naira: nairaFromBu(rewardBu),
      direction: 'credit',
      type: 'referral_bonus',
      description: `Referral bonus · ${code}`,
      metadata: {
        kind: 'referral_bonus',
        referee_id: refereeId,
        code,
        bu: rewardBu,
        funded_bu: fundedBu,
        spent_bu: spentBu,
      },
    })
  } catch (error) {
    // Roll status back so a later wallet move can retry payout.
    await db.from('bu_referrals').update({ status: 'pending' }).eq('id', pending.data.id).eq('status', 'paid')
    throw error
  }

  return { id: String(claimed.data.id), reward_bu: rewardBu, code }
}

/** Attach a referral code at signup — reward stays pending until friend qualifies. */
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
      status: 'pending',
    })
    .select('id')
    .maybeSingle()

  if (inserted.error) {
    if (/duplicate|unique/i.test(inserted.error.message)) {
      throw new ApiError(409, 'REFERRAL_USED', 'A referral code is already on this account.')
    }
    throw new ApiError(500, 'REFERRAL_FAILED', inserted.error.message)
  }

  // In case they already funded before claiming the code.
  await maybeSettleReferralReward(db, refereeId).catch(() => null)

  return { code: referrer.code, reward_bu: rewardBu, status: 'pending' as const, qualify_bu: REFERRAL_QUALIFY_BU }
}
