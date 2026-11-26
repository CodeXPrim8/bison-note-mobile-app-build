import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '@/lib/api/errors'
import { roundMoney } from '@/lib/bu-rate'
import { recordWalletLedger } from '@/lib/wallet/ledger'

export const INSUFFICIENT_ACCOUNT = 'Insufficient account'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function walletNaira(row: Record<string, unknown>) {
  return Math.max(
    Number(row.naira) || 0,
    Number(row.naira_available) || 0,
    Number(row.naira_balance) || 0,
    Number(row.balance) || 0,
    Number(row.bu_balance) || 0,
  )
}

function throwMoveError(message: string): never {
  if (/INSUFFICIENT_FUNDS/i.test(message)) {
    throw new ApiError(400, 'INSUFFICIENT_FUNDS', 'Not enough ɃU')
  }
  throw new ApiError(500, 'WALLET_MOVE_FAILED', message || 'Could not update wallet')
}

async function applyDirect(
  db: SupabaseClient,
  userId: string,
  naira: number,
  direction: 'debit' | 'credit',
) {
  const existing = await db.from('wallets').select('*').eq('user_id', userId).maybeSingle()
  if (existing.error && !/schema cache|does not exist/i.test(existing.error.message)) {
    throwMoveError(existing.error.message)
  }
  const row = asRecord(existing.data)
  const current = row ? walletNaira(row) : 0
  if (direction === 'debit' && (!row || current + 1e-9 < naira)) {
    throw new ApiError(400, 'INSUFFICIENT_FUNDS', 'Not enough ɃU')
  }
  const next = direction === 'debit' ? current - naira : current + naira
  if (!row) {
    const inserted = await db.from('wallets').insert({ user_id: userId, balance: naira })
    if (inserted.error) throwMoveError(inserted.error.message)
    return
  }
  const patch: Record<string, unknown> = {}
  if ('balance' in row) patch.balance = next
  if ('bu_balance' in row) patch.bu_balance = next
  if ('naira_available' in row) patch.naira_available = next
  if ('naira_balance' in row) patch.naira_balance = next
  if ('updated_at' in row) patch.updated_at = new Date().toISOString()
  if (!Object.keys(patch).length) patch.balance = next
  const updated = await db.from('wallets').update(patch).eq('user_id', userId)
  if (updated.error) throwMoveError(updated.error.message)
}

export async function moveLiveWallet(
  db: SupabaseClient,
  input: {
    userId: string
    naira: number
    direction: 'debit' | 'credit'
    type: string
    description: string
    metadata?: Record<string, unknown>
  },
) {
  const moveId = String(input.metadata?.move_id ?? crypto.randomUUID())
  const metadata = { ...(input.metadata ?? {}), direction: input.direction, move_id: moveId }
  const stamped = { ...input, metadata, reference: moveId }
  const rpc = await db.rpc('bu_move_wallet', {
    p_user_id: input.userId,
    p_naira: input.naira,
    p_direction: input.direction,
    p_type: input.type,
    p_description: input.description,
    p_metadata: metadata,
  })
  if (!rpc.error) {
    const payload = asRecord(rpc.data)
    if (payload?.ok === false) {
      throwMoveError(String(payload.reason ?? 'WALLET_MOVE_FAILED'))
    }
    if (payload?.ok === true) {
      await recordWalletLedger(db, stamped)
      await settleReferralAfterMove(db, input)
      return
    }
  } else if (!/could not find|schema cache|does not exist/i.test(rpc.error.message)) {
    throwMoveError(rpc.error.message)
  }

  const fallbackName = input.direction === 'debit' ? 'debit_wallet' : 'credit_wallet'
  const fallback = await db.rpc(fallbackName, {
    p_user_id: input.userId,
    p_amount: input.naira,
    p_type: input.type,
    p_description: input.description,
    p_metadata: metadata,
  })
  if (!fallback.error) {
    await recordWalletLedger(db, stamped)
    await settleReferralAfterMove(db, input)
    return
  }
  if (/INSUFFICIENT_FUNDS/i.test(fallback.error.message)) {
    throw new ApiError(400, 'INSUFFICIENT_FUNDS', 'Not enough ɃU')
  }
  if (!/could not find|schema cache|does not exist/i.test(fallback.error.message)) {
    throwMoveError(fallback.error.message)
  }

  await applyDirect(db, input.userId, input.naira, input.direction)
  await recordWalletLedger(db, stamped)
  await settleReferralAfterMove(db, input)
}

export async function readWalletNaira(db: SupabaseClient, userId: string) {
  const existing = await db.from('wallets').select('*').eq('user_id', userId).maybeSingle()
  if (existing.error && !/schema cache|does not exist/i.test(existing.error.message)) {
    throwMoveError(existing.error.message)
  }
  const row = asRecord(existing.data)
  return row ? walletNaira(row) : 0
}

/**
 * Debit the amount being sent, then the charge.
 * If the balance cannot cover both, nothing is taken.
 */
export async function debitFaceThenCharge(
  db: SupabaseClient,
  input: {
    userId: string
    faceNaira: number
    chargeNaira: number
    type: string
    faceDescription: string
    metadata?: Record<string, unknown>
  },
) {
  const face = roundMoney(input.faceNaira)
  const charge = roundMoney(Math.max(0, input.chargeNaira))
  if (!(face > 0)) {
    throw new ApiError(400, 'INVALID_AMOUNT', 'Enter an amount to send')
  }
  const total = roundMoney(face + charge)
  const balance = await readWalletNaira(db, input.userId)
  if (balance + 1e-9 < total) {
    throw new ApiError(400, 'INSUFFICIENT_FUNDS', INSUFFICIENT_ACCOUNT)
  }

  const faceMoveId = crypto.randomUUID()
  const baseMeta = { ...(input.metadata ?? {}) }
  await moveLiveWallet(db, {
    userId: input.userId,
    naira: face,
    direction: 'debit',
    type: input.type,
    description: input.faceDescription,
    metadata: { ...baseMeta, move_id: faceMoveId, leg: 'principal' },
  })

  if (!(charge > 0.004)) {
    return { faceMoveId, chargeMoveId: null as string | null, face, charge }
  }

  const chargeMoveId = crypto.randomUUID()
  try {
    await moveLiveWallet(db, {
      userId: input.userId,
      naira: charge,
      direction: 'debit',
      type: input.type,
      description: 'Fee',
      metadata: {
        ...baseMeta,
        kind: 'charge',
        move_id: chargeMoveId,
        parent_move_id: faceMoveId,
        leg: 'charge',
        charge_naira: charge,
      },
    })
  } catch {
    await moveLiveWallet(db, {
      userId: input.userId,
      naira: face,
      direction: 'credit',
      type: 'refund',
      description: 'Send refunded',
      metadata: { ...baseMeta, move_id: crypto.randomUUID(), refund_of: faceMoveId, reason: 'charge_failed' },
    }).catch(() => undefined)
    throw new ApiError(400, 'INSUFFICIENT_FUNDS', INSUFFICIENT_ACCOUNT)
  }

  return { faceMoveId, chargeMoveId, face, charge }
}

/**
 * Credit the face amount, then the charge — same split as debitFaceThenCharge.
 * History shows Ƀ100 then Ƀ35, never a single Ƀ135 line next to a separate charge.
 */
export async function creditFaceThenCharge(
  db: SupabaseClient,
  input: {
    userId: string
    faceNaira: number
    chargeNaira: number
    faceDescription: string
    chargeDescription?: string
    metadata?: Record<string, unknown>
  },
) {
  const face = roundMoney(input.faceNaira)
  const charge = roundMoney(Math.max(0, input.chargeNaira))
  const baseMeta = { ...(input.metadata ?? {}) }
  const faceMoveId = crypto.randomUUID()

  if (face > 0.004) {
    await moveLiveWallet(db, {
      userId: input.userId,
      naira: face,
      direction: 'credit',
      type: 'refund',
      description: input.faceDescription,
      metadata: { ...baseMeta, move_id: faceMoveId, leg: 'principal', kind: 'refund' },
    })
  }

  if (!(charge > 0.004)) {
    return { faceMoveId, chargeMoveId: null as string | null, face, charge }
  }

  const chargeMoveId = crypto.randomUUID()
  await moveLiveWallet(db, {
    userId: input.userId,
    naira: charge,
    direction: 'credit',
    type: 'refund',
    description: input.chargeDescription ?? 'Fee refunded',
    metadata: {
      ...baseMeta,
      kind: 'charge_refund',
      move_id: chargeMoveId,
      parent_move_id: faceMoveId,
      leg: 'charge',
      charge_naira: charge,
    },
  })
  return { faceMoveId, chargeMoveId, face, charge }
}

async function settleReferralAfterMove(
  db: SupabaseClient,
  input: { userId: string; type: string },
) {
  // Avoid re-entry while crediting the referrer bonus itself.
  if (input.type === 'referral_bonus') return
  try {
    const { maybeSettleReferralReward } = await import('@/lib/referrals')
    await maybeSettleReferralReward(db, input.userId)
  } catch (error) {
    console.error('referral settle after wallet move failed', error)
  }
}
