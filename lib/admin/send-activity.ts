import type { SupabaseClient } from '@supabase/supabase-js'
import { buFromNaira } from '@/lib/bu-rate'
import { displayNameFromUser } from '@/lib/admin/platform'
import { historyBucket, walletDirection } from '@/lib/wallet/direction'

export type SendActivityWindow = 7 | 14 | 30 | 90

export type SenderActivityRow = {
  user_id: string
  name: string
  phone: string | null
  email: string | null
  send_count: number
  total_bu: number
  total_naira: number
  active_days: number
  last_sent_at: string | null
}

type LedgerLike = {
  id?: string
  user_id?: string
  type?: string | null
  naira?: number | null
  amount?: number | null
  direction?: string | null
  description?: string | null
  created_at?: string | null
  reference?: string | null
  metadata?: unknown
}

function asMeta(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  return {}
}

function dayKey(iso: string) {
  return iso.slice(0, 10)
}

/** Peer ɃU sends only — not bank withdrawals or POS. */
export function isPeerSendDebit(row: LedgerLike) {
  const direction = walletDirection({
    type: row.type,
    description: row.description,
    metadata: row.metadata,
    direction: row.direction,
    amount: row.naira ?? row.amount,
  })
  if (direction !== 'debit') return false
  if (historyBucket(row) !== 'bu_transfer') return false

  const meta = asMeta(row.metadata)
  const kind = String(meta.kind ?? meta.requested_type ?? '').toLowerCase()
  if (kind === 'bank_send' || kind === 'withdrawal') return false
  if (kind === 'pos_sale' || kind === 'business_pos_terminal') return false

  const type = String(row.type ?? '').toLowerCase()
  if (type === 'pos_sale' || type === 'vendor_commission') return false

  return true
}

function faceNaira(row: LedgerLike) {
  const meta = asMeta(row.metadata)
  const fromMeta = Number(meta.naira ?? meta.amount_naira)
  if (Number.isFinite(fromMeta) && fromMeta > 0) return fromMeta
  const raw = Number(row.naira ?? row.amount ?? 0)
  return Number.isFinite(raw) && raw > 0 ? Math.abs(raw) : 0
}

function faceBu(row: LedgerLike, naira: number) {
  const meta = asMeta(row.metadata)
  const fromMeta = Number(meta.bu ?? meta.amount_bu)
  if (Number.isFinite(fromMeta) && fromMeta > 0) return fromMeta
  return buFromNaira(naira)
}

function dedupeKey(row: LedgerLike) {
  const meta = asMeta(row.metadata)
  const move = String(meta.move_id ?? row.reference ?? '').trim()
  if (move) return `move:${move}:${row.user_id ?? ''}`
  return `row:${row.id ?? `${row.user_id}-${row.created_at}-${row.naira ?? row.amount}`}`
}

type Acc = {
  send_count: number
  total_bu: number
  total_naira: number
  days: Set<string>
  last_sent_at: string | null
}

function bump(map: Map<string, Acc>, row: LedgerLike) {
  const userId = String(row.user_id ?? '').trim()
  if (!userId || !isPeerSendDebit(row)) return

  const created = String(row.created_at ?? '')
  const naira = faceNaira(row)
  const bu = faceBu(row, naira)
  const current = map.get(userId) ?? {
    send_count: 0,
    total_bu: 0,
    total_naira: 0,
    days: new Set<string>(),
    last_sent_at: null,
  }

  current.send_count += 1
  current.total_bu += bu
  current.total_naira += naira
  if (created) {
    current.days.add(dayKey(created))
    if (!current.last_sent_at || created > current.last_sent_at) current.last_sent_at = created
  }
  map.set(userId, current)
}

export async function listTopSenders(
  db: SupabaseClient,
  options: { days: SendActivityWindow; limit: number },
): Promise<{ senders: SenderActivityRow[]; scanned: number; window_days: SendActivityWindow }> {
  const since = new Date()
  since.setDate(since.getDate() - options.days)
  const sinceIso = since.toISOString()

  const [ledgerRes, txRes, usersRes] = await Promise.all([
    db
      .from('bu_wallet_ledger')
      .select('id, user_id, type, naira, direction, created_at, reference, metadata, description')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(8000),
    db
      .from('bu_transactions')
      .select('id, user_id, type, amount, status, created_at, metadata, description')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(8000),
    db.from('users').select('id, email, phone_number, first_name, last_name, account_name').limit(8000),
  ])

  const ledger = (ledgerRes.error ? [] : (ledgerRes.data ?? [])) as LedgerLike[]
  const txs = (txRes.error ? [] : (txRes.data ?? [])) as LedgerLike[]
  const users = (usersRes.error ? [] : (usersRes.data ?? [])) as Array<Record<string, unknown>>
  const byId = new Map(users.map((row) => [String(row.id), row]))

  const seen = new Set<string>()
  const byUser = new Map<string, Acc>()

  for (const row of ledger) {
    const key = dedupeKey(row)
    if (seen.has(key)) continue
    seen.add(key)
    bump(byUser, row)
  }

  for (const row of txs) {
    const key = dedupeKey({
      ...row,
      naira: row.amount,
      direction: walletDirection({
        type: row.type,
        description: row.description,
        metadata: row.metadata,
        amount: row.amount,
      }),
    })
    if (seen.has(key)) continue
    seen.add(key)
    bump(byUser, {
      ...row,
      naira: row.amount,
      direction: walletDirection({
        type: row.type,
        description: row.description,
        metadata: row.metadata,
        amount: row.amount,
      }),
    })
  }

  const senders = Array.from(byUser.entries())
    .map(([user_id, acc]) => {
      const profile = byId.get(user_id) ?? {}
      return {
        user_id,
        name: displayNameFromUser(profile),
        phone:
          profile.phone_number == null && profile.phone == null
            ? null
            : String(profile.phone_number ?? profile.phone ?? '') || null,
        email: profile.email == null ? null : String(profile.email) || null,
        send_count: acc.send_count,
        total_bu: Math.round(acc.total_bu * 100) / 100,
        total_naira: Math.round(acc.total_naira * 100) / 100,
        active_days: acc.days.size,
        last_sent_at: acc.last_sent_at,
      } satisfies SenderActivityRow
    })
    .sort((a, b) => {
      if (b.send_count !== a.send_count) return b.send_count - a.send_count
      if (b.active_days !== a.active_days) return b.active_days - a.active_days
      return b.total_bu - a.total_bu
    })
    .slice(0, options.limit)

  return {
    senders,
    scanned: seen.size,
    window_days: options.days,
  }
}
