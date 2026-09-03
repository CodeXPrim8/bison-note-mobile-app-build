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

function rowMeta(row: Record<string, unknown>): Record<string, unknown> {
  const value = row.metadata
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  return {}
}

function saleDescription(row: Record<string, unknown>) {
  const kind = kindOf(row)
  const meta = rowMeta(row)
  if (typeof meta.description === 'string' && meta.description.trim()) return meta.description.trim()
  if (kind === 'wallet_debit') return typeof meta.to_name === 'string' && meta.to_name ? `BU transfer to ${meta.to_name}` : 'BU transfer'
  if (kind === 'wallet_credit') {
    return typeof meta.from_name === 'string' && meta.from_name ? `BU received from ${meta.from_name}` : 'BU received'
  }
  if (row.description && kind !== 'wallet_debit' && kind !== 'wallet_credit') return String(row.description)
  if (kind === 'affiliate_commission') return 'Affiliate commission'
  if (kind === 'organiser_sale') return 'Ticket sale'
  return 'Ticket sale'
}

function saleType(row: Record<string, unknown>) {
  const kind = kindOf(row)
  if (kind === 'wallet_debit') return 'spray'
  if (kind === 'wallet_credit') return 'spray_credit'
  if (kind === 'affiliate_commission' || kind === 'organiser_sale') return 'deposit'
  return kind || 'deposit'
}

function saleForcedDirection(row: Record<string, unknown>): WalletDirection | undefined {
  const kind = kindOf(row)
  if (kind === 'wallet_debit') return 'debit'
  if (kind === 'wallet_credit' || kind === 'organiser_sale' || kind === 'affiliate_commission') return 'credit'
  return undefined
}

function fromSale(row: Record<string, unknown>): WalletHistoryItem {
  const reference =
    typeof row.reference === 'string'
      ? row.reference
      : typeof row.paystack_reference === 'string'
        ? row.paystack_reference
        : typeof rowMeta(row).move_id === 'string'
          ? String(rowMeta(row).move_id)
          : null
  const type = saleType(row)
  const rawDescription = saleDescription(row)
  const direction = walletDirection({
    type,
    description: rawDescription,
    metadata: row.metadata,
    direction: saleForcedDirection(row),
  })
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
  const meta = rowMeta(row)
  const reference =
    typeof row.paystack_reference === 'string'
      ? row.paystack_reference
      : typeof row.reference === 'string'
        ? row.reference
        : typeof meta.move_id === 'string'
          ? String(meta.move_id)
          : null
  const type = String(row.type ?? 'deposit')
  const rawDescription = String(row.description ?? meta.description ?? row.type ?? 'ɃU movement')
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

function fromLedger(row: Record<string, unknown>): WalletHistoryItem {
  const rawDescription = String(row.description ?? 'ɃU movement')
  const direction: WalletDirection = row.direction === 'debit' ? 'debit' : 'credit'
  const type = String(row.type ?? (direction === 'debit' ? 'spray' : 'spray_credit'))
  return {
    id: String(row.id ?? ''),
    type,
    amount: Math.abs(Number(row.naira ?? row.amount ?? 0)),
    description: historyLabel({ type, description: rawDescription, direction }),
    created_at: String(row.created_at ?? ''),
    status: 'completed',
    reference: typeof row.reference === 'string' ? row.reference : null,
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
  const saleTable = await db
    .from('bu_sale_credits')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  let sales = !saleTable.error ? ((saleTable.data ?? []) as Array<Record<string, unknown>>).map(fromSale) : []
  if (!sales.length) {
    const rpc = await db.rpc('bu_list_wallet_history', { p_user_id: userId, p_limit: limit })
    sales = !rpc.error ? asRows(rpc.data).map(fromSale) : []
    if (!sales.length) {
      sales = (await listSaleCredits(userId, limit)).map(fromSale)
    }
  }
  const txs = await db
    .from('bu_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  const extra = txs.error ? [] : ((txs.data ?? []) as Array<Record<string, unknown>>).map(fromTx)
  const ledger = await db
    .from('bu_wallet_ledger')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  const ledgers = ledger.error ? [] : ((ledger.data ?? []) as Array<Record<string, unknown>>).map(fromLedger)
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
  return mergeHistory([...sales, ...extra, ...ledgers, ...withdrawn, ...funded]).slice(0, limit)
}
