import { createDataClient } from '@/lib/supabase/data'
import { tryCreateAdminClient } from '@/lib/supabase/admin'
import { listSaleCredits } from '@/lib/account/roles'
import { historyBucket, historyLabel, walletDirection, type HistoryBucket, type WalletDirection } from '@/lib/wallet/direction'

export const SALE_WALLET_SQL_HINT =
  'Run supabase/migrations/0020_sale_wallet_history.sql in the live ɃU Supabase SQL editor, then try again.'

export type WalletHistoryItem = {
  id: string
  type: string
  amount: number
  description: string
  created_at: string
  status: string
  reference: string | null
  direction: WalletDirection
  bucket: HistoryBucket
}

export function timeMs(value: unknown): number {
  if (value instanceof Date) {
    const t = value.getTime()
    return Number.isFinite(t) ? t : 0
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const t = new Date(value).getTime()
    return Number.isFinite(t) ? t : 0
  }
  return 0
}

export function sortNewestFirst<T extends { created_at?: unknown; id?: unknown }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const byTime = timeMs(b.created_at) - timeMs(a.created_at)
    if (byTime !== 0) return byTime
    return String(b.id ?? '').localeCompare(String(a.id ?? ''))
  })
}

function asRows(raw: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(raw)) return raw as Array<Record<string, unknown>>
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown
      return Array.isArray(parsed) ? (parsed as Array<Record<string, unknown>>) : []
    } catch {
      return []
    }
  }
  return []
}

function kindOf(row: Record<string, unknown>) {
  return String(row.kind ?? row.type ?? '')
}

function saleDescription(row: Record<string, unknown>) {
  const kind = kindOf(row)
  if (row.description) return String(row.description)
  if (kind === 'affiliate_commission') return 'Affiliate commission'
  if (kind === 'organiser_sale') return 'Ticket sale'
  return 'Ticket sale'
}

function saleType(row: Record<string, unknown>) {
  const kind = kindOf(row)
  if (kind === 'affiliate_commission' || kind === 'organiser_sale') return 'deposit'
  return kind || 'deposit'
}

function fromSale(row: Record<string, unknown>): WalletHistoryItem {
  const reference =
    typeof row.reference === 'string'
      ? row.reference
      : typeof row.paystack_reference === 'string'
        ? row.paystack_reference
        : null
  const type = saleType(row)
  const rawDescription = saleDescription(row)
  const direction = walletDirection({ type, description: rawDescription, metadata: row.metadata, direction: 'credit' })
  const description = historyLabel({ type, description: rawDescription, direction })
  return {
    id: String(row.id ?? `${reference ?? 'sale'}-${kindOf(row)}`),
    type,
    amount: Math.abs(Number(row.amount ?? row.naira ?? 0)),
    description,
    created_at: String(row.created_at ?? ''),
    status: 'completed',
    reference,
    direction,
    bucket: historyBucket({ type, description: rawDescription }),
  }
}

function fromTx(row: Record<string, unknown>): WalletHistoryItem {
  const reference =
    typeof row.paystack_reference === 'string'
      ? row.paystack_reference
      : typeof row.reference === 'string'
        ? row.reference
        : null
  const type = String(row.type ?? 'deposit')
  const rawDescription = String(row.description ?? row.type ?? 'ɃU movement')
  const direction = walletDirection({
    type,
    description: rawDescription,
    metadata: row.metadata,
    amount: Number(row.amount ?? 0),
  })
  const description = historyLabel({ type, description: rawDescription, direction })
  return {
    id: String(row.id ?? ''),
    type,
    amount: Math.abs(Number(row.amount ?? 0)),
    description,
    created_at: String(row.created_at ?? ''),
    status: String(row.status ?? 'completed'),
    reference,
    direction,
    bucket: historyBucket({ type, description: rawDescription }),
  }
}

function fromWithdrawal(row: Record<string, unknown>): WalletHistoryItem {
  const bank = String(row.bank_name ?? 'bank')
  const statusRaw = String(row.status ?? 'completed')
  const description = `Withdrawal to ${bank}`
  const status =
    statusRaw === 'paid' || statusRaw === 'completed'
      ? 'completed'
      : statusRaw === 'pending' || statusRaw === 'approved'
        ? 'pending'
        : statusRaw
  return {
    id: String(row.id ?? ''),
    type: 'withdrawal',
    amount: Math.abs(Number(row.naira ?? row.bu ?? 0)),
    description,
    created_at: String(row.created_at ?? row.reviewed_at ?? ''),
    status,
    reference: typeof row.paystack_reference === 'string' ? row.paystack_reference : null,
    direction: 'debit',
    bucket: 'withdrawal',
  }
}

function nearDuplicate(a: WalletHistoryItem, b: WalletHistoryItem) {
  if (a.direction !== b.direction || a.bucket !== b.bucket) return false
  if (Math.abs(a.amount - b.amount) > 0.05) return false
  return Math.abs(timeMs(a.created_at) - timeMs(b.created_at)) < 3 * 60 * 1000
}

function mergeHistory(items: WalletHistoryItem[]) {
  const seen = new Set<string>()
  const out: WalletHistoryItem[] = []
  const sorted = [...items].sort((a, b) => {
    const byTime = timeMs(b.created_at) - timeMs(a.created_at)
    if (byTime !== 0) return byTime
    return String(b.id).localeCompare(String(a.id))
  })
  for (const item of sorted) {
    const key = item.reference
      ? `${item.reference}|${item.direction}|${item.amount}|${item.bucket}`
      : item.id || `${item.created_at}|${item.description}|${item.amount}|${item.direction}`
    if (seen.has(key)) continue
    if (
      item.bucket === 'withdrawal' &&
      out.some((existing) => existing.bucket === 'withdrawal' && nearDuplicate(existing, item))
    ) {
      continue
    }
    seen.add(key)
    out.push(item)
  }
  return out
}

function fromPayment(row: Record<string, unknown>): WalletHistoryItem | null {
  const status = String(row.status ?? '').toLowerCase()
  if (!['success', 'settled', 'paid', 'completed'].includes(status)) return null
  const kind = String(row.kind ?? row.type ?? '').toLowerCase()
  if (kind !== 'deposit' && kind !== 'topup') return null
  const meta =
    row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {}
  const amount = Math.abs(Number(meta.credit_naira ?? meta.bu ?? row.amount ?? 0))
  if (!amount) return null
  const description = 'Wallet top-up'
  return {
    id: String(row.id ?? row.reference ?? ''),
    type: 'deposit',
    amount,
    description,
    created_at: String(row.fulfilled_at ?? row.created_at ?? ''),
    status: 'completed',
    reference: typeof row.reference === 'string' ? row.reference : null,
    direction: 'credit',
    bucket: 'topup',
  }
}

export async function listWalletHistory(userId: string, limit = 200): Promise<WalletHistoryItem[]> {
  if (!userId) return []
  const db = tryCreateAdminClient() ?? createDataClient()
  const rpc = await db.rpc('bu_list_wallet_history', { p_user_id: userId, p_limit: limit })
  let sales = !rpc.error ? asRows(rpc.data).map(fromSale) : []
  if (!sales.length) {
    sales = (await listSaleCredits(userId, limit)).map(fromSale)
  }
  const txs = await db
    .from('bu_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  const extra = txs.error ? [] : ((txs.data ?? []) as Array<Record<string, unknown>>).map(fromTx)
  const withdrawals = await db
    .from('bu_withdrawals')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  const withdrawn = withdrawals.error
    ? []
    : ((withdrawals.data ?? []) as Array<Record<string, unknown>>).map(fromWithdrawal)
  const pays = await db
    .from('payments')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  const funded = pays.error
    ? []
    : ((pays.data ?? []) as Array<Record<string, unknown>>).map(fromPayment).filter((row): row is WalletHistoryItem => Boolean(row))
  return mergeHistory([...sales, ...extra, ...withdrawn, ...funded]).slice(0, limit)
}
