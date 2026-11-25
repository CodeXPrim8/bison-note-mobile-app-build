import type { SupabaseClient } from '@supabase/supabase-js'
import { walletNaira, writeAdminAudit } from '@/lib/admin/platform'
import { moveLiveWallet } from '@/lib/wallet/move'

const OPEN_WITHDRAWAL_STATUSES = ['pending', 'approved', 'payout_failed'] as const

function liveWalletNaira(row: Record<string, unknown>) {
  return Math.max(
    walletNaira(row),
    Number(row.naira) || 0,
    Number(row.naira_available) || 0,
    Number(row.naira_balance) || 0,
    Number(row.balance) || 0,
    Number(row.bu_balance) || 0,
  )
}

export type ResetCirculationResult = {
  cancelled_withdrawals: number
  wallets_zeroed: number
  naira_cleared: number
  failures: Array<{ user_id: string; error: string }>
}

/** Cancel open payouts without refunding wallets, then debit every positive balance to ₦0. */
export async function resetCirculation(
  db: SupabaseClient,
  actorId: string,
): Promise<ResetCirculationResult> {
  const note = 'Circulation reset by Super Admin — no refund (accounting wipe)'
  const now = new Date().toISOString()

  const open = await db
    .from('bu_withdrawals')
    .select('id, status')
    .in('status', [...OPEN_WITHDRAWAL_STATUSES])
    .limit(5000)

  let cancelled_withdrawals = 0
  if (!open.error) {
    const ids = ((open.data ?? []) as Array<{ id: string }>).map((row) => row.id).filter(Boolean)
    if (ids.length) {
      const updated = await db
        .from('bu_withdrawals')
        .update({
          status: 'rejected',
          note,
          transfer_error: null,
          reviewed_at: now,
        })
        .in('id', ids)
        .select('id')
      if (!updated.error) {
        cancelled_withdrawals = updated.data?.length ?? ids.length
      } else if (/column|schema cache/i.test(updated.error.message)) {
        const fallback = await db.from('bu_withdrawals').update({ status: 'rejected', note }).in('id', ids).select('id')
        cancelled_withdrawals = fallback.error ? 0 : (fallback.data?.length ?? ids.length)
      }
    }
  }

  const walletsRes = await db.from('wallets').select('*').limit(8000)
  const wallets = (walletsRes.error ? [] : (walletsRes.data ?? [])) as Array<Record<string, unknown>>

  let wallets_zeroed = 0
  let naira_cleared = 0
  const failures: Array<{ user_id: string; error: string }> = []

  for (const row of wallets) {
    const userId = String(row.user_id ?? '').trim()
    if (!userId) continue
    const amount = liveWalletNaira(row)
    if (!(amount > 0.0001)) continue
    try {
      await moveLiveWallet(db, {
        userId,
        naira: amount,
        direction: 'debit',
        type: 'withdrawal',
        description: 'Super Admin circulation reset',
        metadata: {
          kind: 'circulation_reset',
          admin: actorId,
          cleared_naira: amount,
        },
      })
      wallets_zeroed += 1
      naira_cleared += amount
    } catch (error) {
      failures.push({
        user_id: userId,
        error: error instanceof Error ? error.message : 'WALLET_ZERO_FAILED',
      })
    }
  }

  await writeAdminAudit(actorId, 'money.reset_circulation', null, {
    cancelled_withdrawals,
    wallets_zeroed,
    naira_cleared: Math.round(naira_cleared * 100) / 100,
    failure_count: failures.length,
  })

  return {
    cancelled_withdrawals,
    wallets_zeroed,
    naira_cleared: Math.round(naira_cleared * 100) / 100,
    failures,
  }
}
