import type { SupabaseClient } from '@supabase/supabase-js'
import { FREE_UNDER_NAIRA, roundMoney } from '@/lib/bu-rate'

/** Midnight Africa/Lagos as UTC Date for the calendar day containing `now`. */
export function startOfDayWAT(now = new Date()): Date {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = fmt.formatToParts(now)
  const year = parts.find((p) => p.type === 'year')?.value ?? '1970'
  const month = parts.find((p) => p.type === 'month')?.value ?? '01'
  const day = parts.find((p) => p.type === 'day')?.value ?? '01'
  // WAT is UTC+1 year-round (no DST).
  return new Date(`${year}-${month}-${day}T00:00:00+01:00`)
}

function metaGross(row: Record<string, unknown>): number | null {
  const meta = (row.metadata ?? {}) as Record<string, unknown>
  const gross = Number(meta.gross_naira)
  if (Number.isFinite(gross) && gross > 0) return roundMoney(gross)
  const naira = Number(row.naira)
  if (Number.isFinite(naira) && naira > 0) return roundMoney(naira)
  return null
}

function isBankDepositRow(row: Record<string, unknown>): boolean {
  const type = String(row.type ?? '').toLowerCase()
  if (type !== 'deposit') return false
  const meta = (row.metadata ?? {}) as Record<string, unknown>
  const channel = String(meta.channel ?? '').toLowerCase()
  if (channel === 'dedicated_nuban' || channel === 'squad_virtual_account') return true
  const provider = String(meta.provider ?? '').toLowerCase()
  if (provider === 'squad' || provider === 'paystack') return true
  const desc = String(row.description ?? meta.description ?? '').toLowerCase()
  return /bank transfer top-up/.test(desc)
}

/**
 * Sum under-threshold bank pay-ins + pay-outs for this wallet since midnight WAT.
 * Shared daily free volume (₦) — not a transaction count.
 */
export async function sumUnderFreeBankVolumeToday(
  db: SupabaseClient,
  userId: string,
  freeUnderNaira: number = FREE_UNDER_NAIRA,
): Promise<number> {
  if (!userId) return 0
  const since = startOfDayWAT().toISOString()
  const threshold = freeUnderNaira

  const [ledger, withdrawals] = await Promise.all([
    db
      .from('bu_wallet_ledger')
      .select('naira, type, description, metadata, created_at')
      .eq('user_id', userId)
      .eq('direction', 'credit')
      .eq('type', 'deposit')
      .gte('created_at', since)
      .limit(500),
    db
      .from('bu_withdrawals')
      .select('naira, status, created_at')
      .eq('user_id', userId)
      .gte('created_at', since)
      .limit(500),
  ])

  let volume = 0
  for (const row of (ledger.data ?? []) as Array<Record<string, unknown>>) {
    if (!isBankDepositRow(row)) continue
    const gross = metaGross(row)
    if (gross == null) continue
    if (gross + 1e-9 < threshold) volume = roundMoney(volume + gross)
  }

  for (const row of (withdrawals.data ?? []) as Array<Record<string, unknown>>) {
    const status = String(row.status ?? '').toLowerCase()
    if (status === 'rejected' || status === 'cancelled') continue
    const face = Number(row.naira)
    if (!Number.isFinite(face) || !(face > 0)) continue
    if (face + 1e-9 < threshold) volume = roundMoney(volume + face)
  }

  return volume
}

/** @deprecated Use sumUnderFreeBankVolumeToday — name kept for older imports. */
export async function countUnderFreeBankTransfersToday(
  db: SupabaseClient,
  userId: string,
  freeUnderNaira: number = FREE_UNDER_NAIRA,
): Promise<number> {
  return sumUnderFreeBankVolumeToday(db, userId, freeUnderNaira)
}

/** Remaining free bank volume (₦) for today. */
export function freeUnderRemaining(
  usedVolumeToday: number,
  freeUnderNaira: number = FREE_UNDER_NAIRA,
): number {
  return roundMoney(Math.max(0, freeUnderNaira - Math.max(0, usedVolumeToday)))
}
