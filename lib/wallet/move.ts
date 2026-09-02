import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '@/lib/api/errors'

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
  const rpc = await db.rpc('bu_move_wallet', {
    p_user_id: input.userId,
    p_naira: input.naira,
    p_direction: input.direction,
    p_type: input.type,
    p_description: input.description,
    p_metadata: input.metadata ?? {},
  })
  if (!rpc.error) {
    const payload = asRecord(rpc.data)
    if (payload?.ok === false) {
      throwMoveError(String(payload.reason ?? 'WALLET_MOVE_FAILED'))
    }
    if (payload?.ok === true) return
  } else if (!/could not find|schema cache|does not exist/i.test(rpc.error.message)) {
    throwMoveError(rpc.error.message)
  }

  const fallbackName = input.direction === 'debit' ? 'debit_wallet' : 'credit_wallet'
  const fallback = await db.rpc(fallbackName, {
    p_user_id: input.userId,
    p_amount: input.naira,
    p_type: input.type,
    p_description: input.description,
    p_metadata: input.metadata ?? {},
  })
  if (!fallback.error) return
  if (/INSUFFICIENT_FUNDS/i.test(fallback.error.message)) {
    throw new ApiError(400, 'INSUFFICIENT_FUNDS', 'Not enough ɃU')
  }
  if (!/could not find|schema cache|does not exist/i.test(fallback.error.message)) {
    throwMoveError(fallback.error.message)
  }

  await applyDirect(db, input.userId, input.naira, input.direction)
}
