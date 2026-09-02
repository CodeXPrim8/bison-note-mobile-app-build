import { createDataClient } from '@/lib/supabase/data'
import { tryCreateAdminClient } from '@/lib/supabase/admin'
import { listSaleCredits } from '@/lib/account/roles'

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
  return {
    id: String(row.id ?? `${reference ?? 'sale'}-${kindOf(row)}`),
    type: saleType(row),
    amount: Number(row.amount ?? row.naira ?? 0),
    description: saleDescription(row),
    created_at: String(row.created_at ?? ''),
    status: 'completed',
    reference,
  }
}

function fromTx(row: Record<string, unknown>): WalletHistoryItem {
  const reference =
    typeof row.paystack_reference === 'string'
      ? row.paystack_reference
      : typeof row.reference === 'string'
        ? row.reference
        : null
  return {
    id: String(row.id ?? ''),
    type: String(row.type ?? 'deposit'),
    amount: Number(row.amount ?? 0),
    description: String(row.description ?? row.type ?? 'ɃU movement'),
    created_at: String(row.created_at ?? ''),
    status: String(row.status ?? 'completed'),
    reference,
  }
}

function mergeHistory(items: WalletHistoryItem[]) {
  const seen = new Set<string>()
  const out: WalletHistoryItem[] = []
  for (const item of items) {
    const key = item.reference
      ? `${item.reference}|${item.description}|${item.amount}`
      : item.id
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  out.sort((a, b) => {
    const byTime = timeMs(b.created_at) - timeMs(a.created_at)
    if (byTime !== 0) return byTime
    return String(b.id).localeCompare(String(a.id))
  })
  return out
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
  return mergeHistory([...sales, ...extra]).slice(0, limit)
}
