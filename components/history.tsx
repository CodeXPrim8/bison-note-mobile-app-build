'use client'

import { useCallback, useEffect, useState } from 'react'
import { History as HistoryIcon, RefreshCw, Ticket } from 'lucide-react'
import { isEventPast } from '@/lib/events/sale'
import { formatEventDateTime } from '@/lib/datetime'
import { buFromNaira, formatBu, formatNairaPlain } from '@/lib/bu-rate'
import { TicketFeedbackForm } from '@/components/ticket-feedback'
import type { EventRecord, TicketRecord, TicketTier } from '@/lib/types/database'
import { useAccount, useWalletPulse } from '@/components/account-store'
import { BuInvoiceDialog } from '@/components/bu-invoice'
import { invoiceNumberFromId, type BuInvoice, type BuInvoiceKind } from '@/lib/invoice/document'
import { bindAccountSnapshots, readSessionSnapshot, writeSessionSnapshot } from '@/lib/session-snapshot'
import {
  historyBucket,
  historyLabel,
  walletDirection,
  type HistoryBucket,
  type WalletDirection,
} from '@/lib/wallet/direction'

interface Transaction {
  id: string
  type: string
  amount: number
  date: string
  createdAt: number
  description: string
  status: 'completed' | 'pending' | 'failed' | string
  direction: WalletDirection
  bucket: HistoryBucket
  reference?: string | null
  counterparty?: string | null
  note?: string | null
}

interface HistoryTicket extends TicketRecord {
  event: EventRecord | null
  tier: TicketTier | null
  display_status: string
}

const FILTERS: Array<{ id: 'all' | HistoryBucket; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'bu_transfer', label: 'Transfers' },
  { id: 'topup', label: 'Top-ups' },
  { id: 'purchase', label: 'Tickets' },
  { id: 'withdrawal', label: 'Withdrawals' },
]

function metaOf(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  return {}
}

function isUserId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim())
}

function partyFromMeta(meta: Record<string, unknown>, direction: WalletDirection) {
  const keys =
    direction === 'debit'
      ? ['to_name', 'recipient_name', 'counterparty']
      : ['from_name', 'sender_name', 'counterparty']
  for (const key of keys) {
    const value = meta[key]
    if (typeof value === 'string' && value.trim() && !isUserId(value)) return value.trim()
  }
  return null
}

function partyFromLabel(description: string) {
  const text = String(description ?? '').trim()
  const from = text.match(/^(?:received Ƀu|received bu|bu received)(?: from)?\s+(.+)$/i)
  if (from?.[1]) return from[1].trim()
  const to = text.match(/^(?:sent Ƀu|sent bu|bu transfer)(?: to)?\s+(.+)$/i)
  if (to?.[1] && !/^bu transfer$/i.test(to[1].trim())) return to[1].trim()
  const tip = text.match(/^tip (?:sent to|to)\s+(.+)$/i)
  if (tip?.[1]) return tip[1].trim()
  return null
}

function mapWalletTx(tx: Record<string, unknown>): Transaction {
  const type = String(tx.type ?? tx.kind ?? 'deposit')
  const meta = metaOf(tx.metadata)
  const rawDescription = String(tx.description ?? meta.description ?? tx.type ?? 'ɃU movement')
  const direction =
    tx.direction === 'credit' || tx.direction === 'debit'
      ? tx.direction
      : walletDirection({
          type,
          description: rawDescription,
          metadata: tx.metadata,
          direction: typeof tx.direction === 'string' ? tx.direction : null,
          amount: Number(tx.amount ?? 0),
        })
  const createdAt = new Date(String(tx.created_at ?? '')).getTime() || 0
  const statusRaw = String(tx.status ?? 'completed')
  const labeled = historyLabel({ type, description: rawDescription, direction })
  const counterparty =
    (typeof tx.counterparty === 'string' && tx.counterparty.trim() ? tx.counterparty.trim() : null) ||
    partyFromMeta(meta, direction) ||
    partyFromLabel(rawDescription) ||
    partyFromLabel(labeled)
  return {
    id: String(tx.id ?? `${createdAt}-${rawDescription}`),
    type,
    amount: Math.abs(Number(tx.amount ?? 0)),
    date: tx.created_at ? formatEventDateTime(String(tx.created_at)) : '',
    createdAt,
    description: labeled,
    status: statusRaw,
    direction,
    bucket: (tx.bucket as HistoryBucket | undefined) || historyBucket({ type, description: rawDescription }),
    reference: typeof tx.reference === 'string' ? tx.reference : null,
    counterparty,
    note: typeof tx.note === 'string' ? tx.note : typeof meta.note === 'string' ? meta.note : null,
  }
}

function invoiceFromActivity(tx: Transaction, senderName: string): BuInvoice {
  const credit = tx.direction === 'credit'
  const kind: BuInvoiceKind = /tip/i.test(`${tx.type} ${tx.description}`)
    ? 'tip'
    : /spray/i.test(tx.type) && tx.direction === 'debit'
      ? 'spray'
      : 'transfer'
  return {
    number: invoiceNumberFromId(tx.reference || tx.id),
    issuedAt: new Date(tx.createdAt || Date.now()).toISOString(),
    kind,
    fromName: credit ? tx.counterparty || 'Sender' : senderName || 'You',
    toName: credit ? senderName || 'You' : tx.counterparty || tx.description,
    amountBu: buFromNaira(tx.amount),
    amountNaira: tx.amount,
    note: tx.note || undefined,
    status: tx.status === 'completed' ? 'Paid' : tx.status,
  }
}

function activityTitle(tx: Transaction) {
  const party = tx.counterparty?.trim() || partyFromLabel(tx.description)
  if (tx.bucket === 'bu_transfer' && party) {
    return party
  }
  return tx.description
}

function normalizeRows(rows: Transaction[]) {
  return rows.map((row) => {
    const direction = row.direction ?? walletDirection(row)
    return {
      ...row,
      direction,
      bucket: row.bucket ?? historyBucket(row),
      description: historyLabel({ ...row, direction }),
    }
  })
}

export default function History() {
  const { userId, displayName, refreshWallet } = useAccount()
  const [tab, setTab] = useState<'activity' | 'events'>('activity')
  const [filter, setFilter] = useState<'all' | HistoryBucket>('all')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [pastTickets, setPastTickets] = useState<HistoryTicket[]>([])
  const [ready, setReady] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openInvoice, setOpenInvoice] = useState<BuInvoice | null>(null)

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    bindAccountSnapshots(userId || null)
    if (!opts?.silent) setRefreshing(true)

    const cached = readSessionSnapshot<{ transactions: Transaction[]; pastTickets: HistoryTicket[] }>('bu_history')
    const cachedHasNames = Boolean(
      cached?.transactions?.some((row) => row.bucket === 'bu_transfer' && Boolean(row.counterparty?.trim())),
    )
    if (cached?.transactions?.length && cachedHasNames) {
      setTransactions(normalizeRows(cached.transactions))
    }
    if (cached?.pastTickets?.length) {
      setPastTickets(cached.pastTickets)
    }

    try {
      const [walletRes, ticketsRes] = await Promise.all([
        fetch('/api/wallet', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/tickets/mine', { credentials: 'include', cache: 'no-store' }),
      ])
      const walletJson = await walletRes.json()
      const ticketsJson = await ticketsRes.json()

      let nextTx = cached?.transactions?.length ? normalizeRows(cached.transactions) : []
      if (!walletJson.status) {
        setError(walletJson.message ?? 'Could not load wallet history')
      } else {
        const fetched = ((walletJson.data?.transactions ?? []) as Array<Record<string, unknown>>)
          .map(mapWalletTx)
          .sort((a, b) => b.createdAt - a.createdAt)
        if (fetched.length || !cached?.transactions?.length) {
          nextTx = fetched
        }
        setError(null)
        void refreshWallet()
      }
      setTransactions(nextTx)

      let past = cached?.pastTickets ?? []
      if (ticketsJson.status) {
        past = ((ticketsJson.data ?? []) as HistoryTicket[])
          .filter(
            (ticket) =>
              isEventPast(ticket.event) && ticket.status !== 'refunded' && ticket.status !== 'cancelled',
          )
          .sort((a, b) => Date.parse(b.created_at || '') - Date.parse(a.created_at || ''))
      }
      setPastTickets(past)
      if (nextTx.length || past.length) {
        writeSessionSnapshot('bu_history', { transactions: nextTx, pastTickets: past })
      }
      setReady(true)
    } catch {
      setReady(true)
      setError('Could not load history')
    } finally {
      setRefreshing(false)
    }
  }, [userId, refreshWallet])

  useWalletPulse(() => {
    void load({ silent: true })
  })

  useEffect(() => {
    void load()
    function onVisible() {
      if (document.visibilityState === 'visible') void load({ silent: true })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  const filteredTransactions = (filter === 'all' ? transactions : transactions.filter((tx) => tx.bucket === filter))
    .slice()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))

  return (
    <div className="pb-24 pt-2">
      <div className="border-b border-border/60 bg-background/95 px-4 pb-4 pt-2 backdrop-blur">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex rounded-xl bg-muted/40 p-1">
            <button
              type="button"
              onClick={() => setTab('activity')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                tab === 'activity' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              Activity
            </button>
            <button
              type="button"
              onClick={() => setTab('events')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                tab === 'events' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              Events
            </button>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={refreshing}
            className="inline-flex items-center gap-1 rounded-full border border-border/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {tab === 'activity' && (
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  filter === f.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 pt-4">
        {tab === 'activity' ? (
          <div className="space-y-2">
            {error && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {!ready && filteredTransactions.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Loading activity…</p>
            ) : filteredTransactions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/70 px-6 py-10 text-center">
                <HistoryIcon className="mx-auto mb-3 h-8 w-8 text-muted-foreground/70" />
                <p className="font-medium">No activity yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Transfers, top-ups, ticket sales, and withdrawals show here.
                </p>
              </div>
            ) : (
              filteredTransactions.map((tx, index) => {
                const credit = tx.direction === 'credit'
                const canOpenInvoice = tx.bucket === 'bu_transfer'
                const rowClass = credit
                  ? 'bg-neutral-100 text-neutral-950'
                  : 'bg-neutral-950 text-white'
                const amountClass = credit ? 'text-emerald-600' : 'text-rose-400'
                const subClass = credit ? 'text-neutral-500' : 'text-white/50'
                const badgeClass = credit ? 'bg-white text-neutral-950' : 'bg-white/15 text-white'
                const content = (
                  <>
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${badgeClass}`}>
                      {credit ? 'In' : 'Out'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{activityTitle(tx)}</p>
                      <p className={`text-xs ${subClass}`}>{tx.date}</p>
                    </div>
                    <div className={`shrink-0 text-right text-sm font-semibold tabular-nums ${amountClass}`}>
                      {credit ? '+' : '−'}Ƀ {formatBu(buFromNaira(tx.amount))}
                      <p className={`text-xs font-normal ${subClass}`}>
                        {credit ? '+' : '−'}₦{formatNairaPlain(tx.amount)}
                      </p>
                    </div>
                  </>
                )
                return canOpenInvoice ? (
                  <button
                    key={`${tx.id}-${tx.createdAt}-${index}`}
                    type="button"
                    onClick={() => setOpenInvoice(invoiceFromActivity(tx, displayName))}
                    className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition active:scale-[0.99] ${rowClass}`}
                  >
                    {content}
                  </button>
                ) : (
                  <div
                    key={`${tx.id}-${tx.createdAt}-${index}`}
                    className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 ${rowClass}`}
                  >
                    {content}
                  </div>
                )
              })
            )}
            <BuInvoiceDialog
              invoice={openInvoice}
              open={Boolean(openInvoice)}
              onOpenChange={(open) => {
                if (!open) setOpenInvoice(null)
              }}
            />
          </div>
        ) : (
          <div className="space-y-3">
            {pastTickets.length === 0 ? (
              ready ? (
                <div className="rounded-2xl border border-dashed border-border/70 px-6 py-10 text-center">
                  <Ticket className="mx-auto mb-3 h-8 w-8 text-muted-foreground/70" />
                  <p className="font-medium">No past events</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    After a party date passes, paid tickets move here.
                  </p>
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">Loading events…</p>
              )
            ) : (
              pastTickets.map((ticket) => (
                <TicketFeedbackForm
                  key={ticket.id}
                  ticket={ticket}
                  onSaved={(updated) =>
                    setPastTickets((list) => list.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)))
                  }
                />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
