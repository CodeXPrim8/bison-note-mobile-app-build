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
  counterparty?: string | null
  counterpartyUserId?: string | null
  note?: string | null
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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function looksLikeUserId(value: string) {
  return UUID_RE.test(value.trim())
}

function firstName(...values: unknown[]) {
  for (const value of values) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (!trimmed || looksLikeUserId(trimmed)) continue
    return trimmed
  }
  return null
}

function firstUserId(...values: unknown[]) {
  for (const value of values) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (looksLikeUserId(trimmed)) return trimmed
  }
  return null
}

function partyOf(meta: Record<string, unknown>, direction: WalletDirection) {
  if (direction === 'debit') {
    return firstName(meta.to_name, meta.recipient_name, meta.counterparty, meta.to)
  }
  return firstName(meta.from_name, meta.sender_name, meta.counterparty, meta.from)
}

function partyUserIdOf(meta: Record<string, unknown>, direction: WalletDirection) {
  if (direction === 'debit') {
    return firstUserId(meta.to, meta.counterparty_user_id, meta.recipient_id)
  }
  return firstUserId(meta.from, meta.counterparty_user_id, meta.sender_id)
}

function userDisplayName(row: Record<string, unknown> | null | undefined) {
  if (!row) return null
  const name = [row.first_name, row.last_name]
    .filter((part) => typeof part === 'string' && part.trim())
    .join(' ')
    .trim()
  if (name) return name
  if (typeof row.account_name === 'string' && row.account_name.trim()) return row.account_name.trim()
  if (typeof row.phone_number === 'string' && row.phone_number.trim()) return row.phone_number.trim()
  return null
}

async function enrichCounterparties(
  db: { from: (table: string) => any },
  items: WalletHistoryItem[],
) {
  const missingIds = Array.from(
    new Set(
      items
        .filter((item) => item.bucket === 'bu_transfer' && !item.counterparty && item.counterpartyUserId)
        .map((item) => String(item.counterpartyUserId)),
    ),
  )
  if (!missingIds.length) return items

  const { data, error } = await db
    .from('users')
    .select('id, first_name, last_name, account_name, phone_number')
    .in('id', missingIds)
  if (error || !data?.length) return items

  const byId = new Map<string, string>()
  for (const row of data as Array<Record<string, unknown>>) {
    const id = String(row.id ?? '')
    const label = userDisplayName(row)
    if (id && label) byId.set(id, label)
  }
  if (!byId.size) return items

  return items.map((item) => {
    if (item.counterparty || !item.counterpartyUserId) return item
    const label = byId.get(item.counterpartyUserId)
    if (!label) return item
    return { ...item, counterparty: label }
  })
}

function partyFromDescription(description: string, direction: WalletDirection) {
  const text = String(description ?? '').trim()
  if (!text) return null
  const received = text.match(/^(?:received Ƀu|received bu|bu received)(?: from)?\s+(.+)$/i)
  if (received?.[1]) return received[1].trim()
  const sent = text.match(/^(?:sent Ƀu|sent bu|bu transfer)(?: to)?\s+(.+)$/i)
  if (sent?.[1] && !/^bu transfer$/i.test(sent[1].trim())) return sent[1].trim()
  const tip = text.match(/^tip (?:sent to|to)\s+(.+)$/i)
  if (tip?.[1]) return tip[1].trim()
  if (direction === 'credit') {
    const from = text.match(/\bfrom\s+(.+)$/i)
    if (from?.[1]) return from[1].trim()
  }
  return null
}

function noteOf(meta: Record<string, unknown>) {
  const value = meta.note
  return typeof value === 'string' && value.trim() ? value.trim() : null
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
  if (kind === 'wallet_debit') {
    if (meta.kind === 'bank_send') {
      const bank = typeof meta.bank_name === 'string' && meta.bank_name.trim() ? meta.bank_name.trim() : 'bank'
      return `Sent to ${bank}`
    }
    return typeof meta.to_name === 'string' && meta.to_name ? `Sent ɃU to ${meta.to_name}` : 'Sent ɃU'
  }
  if (kind === 'wallet_credit') {
    return typeof meta.from_name === 'string' && meta.from_name
      ? `Received ɃU from ${meta.from_name}`
      : 'Received ɃU'
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
    reference: typeof rowMeta(row).move_id === 'string' ? String(rowMeta(row).move_id) : reference,
    direction,
    bucket: historyBucket({ type, description: rawDescription, metadata: row.metadata }),
    counterparty: partyOf(rowMeta(row), direction) || partyFromDescription(rawDescription, direction),
    counterpartyUserId: partyUserIdOf(rowMeta(row), direction),
    note: noteOf(rowMeta(row)),
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
    direction: typeof row.direction === 'string' ? row.direction : null,
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
    reference: typeof meta.move_id === 'string' ? String(meta.move_id) : reference,
    direction,
    bucket: historyBucket({ type, description: rawDescription, metadata: row.metadata }),
    counterparty: partyOf(meta, direction) || partyFromDescription(rawDescription, direction),
    counterpartyUserId:
      partyUserIdOf(meta, direction) ||
      firstUserId(row.counterparty_user_id, meta.counterparty_user_id),
    note: noteOf(meta),
  }
}

function fromLedger(row: Record<string, unknown>): WalletHistoryItem {
  const rawDescription = String(row.description ?? 'ɃU movement')
  const meta = rowMeta(row)
  const type = String(row.type ?? '')
  const direction = walletDirection({
    type: type || null,
    description: rawDescription,
    metadata: meta,
    direction: typeof row.direction === 'string' ? row.direction : null,
    amount: Number(row.naira ?? row.amount ?? 0),
  })
  const resolvedType = type || (direction === 'debit' ? 'spray' : 'spray_credit')
  const reference =
    typeof meta.move_id === 'string'
      ? String(meta.move_id)
      : typeof row.reference === 'string'
        ? row.reference
        : null
  return {
    id: String(row.id ?? ''),
    type: resolvedType,
    amount: Math.abs(Number(row.naira ?? row.amount ?? 0)),
    description: historyLabel({ type: resolvedType, description: rawDescription, direction }),
    created_at: String(row.created_at ?? ''),
    status: 'completed',
    reference,
    direction,
    bucket: historyBucket({ type: resolvedType, description: rawDescription, metadata: meta }),
    counterparty: partyOf(meta, direction) || partyFromDescription(rawDescription, direction),
    counterpartyUserId: partyUserIdOf(meta, direction),
    note: noteOf(meta),
  }
}

function fromWithdrawal(row: Record<string, unknown>): WalletHistoryItem {
  const bank = String(row.bank_name ?? 'bank').trim() || 'bank'
  const statusRaw = String(row.status ?? 'completed')
  const description = `Sent to ${bank}`
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
    reference:
      typeof row.paystack_reference === 'string'
        ? row.paystack_reference
        : typeof row.id === 'string'
          ? row.id
          : null,
    direction: 'debit',
    bucket: 'withdrawal',
    counterparty: bank,
    note: null,
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

function fromRpcRow(row: Record<string, unknown>): WalletHistoryItem {
  const type = String(row.type ?? 'deposit')
  const meta = rowMeta(row)
  const rawDescription = String(row.description ?? meta.description ?? type)
  const direction =
    row.direction === 'credit' || row.direction === 'debit'
      ? row.direction
      : walletDirection({
          type,
          description: rawDescription,
          metadata: row.metadata,
          amount: Number(row.amount ?? row.naira ?? 0),
        })
  const reference =
    typeof row.reference === 'string' && row.reference ? row.reference : null
  const counterparty =
    firstName(row.counterparty) ||
    partyOf(meta, direction) ||
    partyFromDescription(rawDescription, direction)
  return {
    id: String(row.id ?? reference ?? `${rawDescription}-${row.created_at}`),
    type,
    amount: Math.abs(Number(row.amount ?? row.naira ?? 0)),
    description: historyLabel({ type, description: rawDescription, direction }),
    created_at: String(row.created_at ?? ''),
    status: String(row.status ?? 'completed'),
    reference,
    direction,
    bucket: historyBucket({ type, description: rawDescription, metadata: row.metadata }),
    counterparty,
    counterpartyUserId:
      partyUserIdOf(meta, direction) ||
      firstUserId(row.counterparty_user_id, meta.counterparty_user_id),
    note: noteOf(meta),
  }
}

export async function listWalletHistory(
  userId: string,
  limit = 200,
  opts?: { full?: boolean },
): Promise<WalletHistoryItem[]> {
  if (!userId) return []
  const db = tryCreateAdminClient() ?? createDataClient()
  const full = Boolean(opts?.full)

  const rpc = await db.rpc('bu_list_user_wallet_history', { p_user_id: userId, p_limit: limit })
  const rpcRows = !rpc.error ? asRows(rpc.data).map(fromRpcRow) : []

  // Fast path for dashboards / beneficiaries: trust the RPC when it returns rows.
  if (!full && rpcRows.length) {
    return enrichCounterparties(db, mergeHistory(rpcRows).slice(0, limit))
  }

  const [saleTable, txs, ledger, withdrawals, pays] = await Promise.all([
    db.from('bu_sale_credits').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(limit),
    db.from('bu_transactions').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(limit),
    db.from('bu_wallet_ledger').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(limit),
    db.from('bu_withdrawals').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(limit),
    db.from('payments').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(limit),
  ])

  let sales = !saleTable.error ? ((saleTable.data ?? []) as Array<Record<string, unknown>>).map(fromSale) : []
  if (!sales.length && full) {
    const saleRpc = await db.rpc('bu_list_wallet_history', { p_user_id: userId, p_limit: limit })
    sales = !saleRpc.error ? asRows(saleRpc.data).map(fromSale) : []
    if (!sales.length) {
      sales = (await listSaleCredits(userId, limit)).map(fromSale)
    }
  }

  const extra = txs.error ? [] : ((txs.data ?? []) as Array<Record<string, unknown>>).map(fromTx)
  const ledgers = ledger.error ? [] : ((ledger.data ?? []) as Array<Record<string, unknown>>).map(fromLedger)
  const withdrawn = withdrawals.error
    ? []
    : ((withdrawals.data ?? []) as Array<Record<string, unknown>>).map(fromWithdrawal)
  const funded = pays.error
    ? []
    : ((pays.data ?? []) as Array<Record<string, unknown>>)
        .map(fromPayment)
        .filter((row): row is WalletHistoryItem => Boolean(row))

  const merged = mergeHistory([...rpcRows, ...sales, ...extra, ...ledgers, ...withdrawn, ...funded]).slice(
    0,
    limit,
  )
  return enrichCounterparties(db, merged)
}
