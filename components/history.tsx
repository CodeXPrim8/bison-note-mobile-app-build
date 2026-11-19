'use client'

import { useCallback, useEffect, useState } from 'react'
import { History as HistoryIcon, RefreshCw, Ticket } from 'lucide-react'
import { isEventPast } from '@/lib/events/sale'
import { formatEventDateTime } from '@/lib/datetime'
import { buFromNaira, formatNairaPlain } from '@/lib/bu-rate'
import { SignedBu } from '@/components/signed-bu'
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
  { id: 'bu_transfer', label: 'Transfers & tips' },
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
  if (/^tip received/i.test(text)) return null
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
  const tipCredit = direction === 'credit' && (/^tip received/i.test(rawDescription) || meta.kind === 'tip')
  const counterparty = tipCredit
    ? null
    : (typeof tx.counterparty === 'string' && tx.counterparty.trim() ? tx.counterparty.trim() : null) ||
      partyFromMeta(meta, direction) ||
      partyFromLabel(rawDescription) ||
      partyFromLabel(labeled)
  return {
    id: String(tx.id ?? `${createdAt}-${rawDescription}`),
    type,
    amount: Math.abs(Number(tx.amount ?? 0)),
    date: tx.created_at ? formatEventDateTime(String(tx.created_at)) : '',
    createdAt,
    description: tipCredit ? 'Tip received' : labeled,
    status: statusRaw,
    direction,
    bucket:
      (tx.bucket as HistoryBucket | undefined) ||
      historyBucket({ type, description: rawDescription, metadata: tx.metadata }),
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
  const tipCredit = kind === 'tip' && credit
  return {
    number: invoiceNumberFromId(tx.reference || tx.id),
    issuedAt: new Date(tx.createdAt || Date.now()).toISOString(),
    kind,
    fromName: tipCredit ? 'Anonymous' : credit ? tx.counterparty || 'Sender' : senderName || 'You',
    toName: credit ? senderName || 'You' : tx.counterparty || tx.description,
    amountBu: buFromNaira(tx.amount),
    amountNaira: tx.amount,
    note: tx.note || undefined,
    status: tx.status === 'completed' ? 'Paid' : tx.status,
  }
}

function activityTitle(tx: Transaction) {
  const desc = String(tx.description || '')
  if (tx.bucket === 'withdrawal' && !/tip|spray|sent Ƀu|received Ƀu|pos|commission/i.test(desc)) {
    return desc || (tx.counterparty ? `Sent to ${tx.counterparty}` : 'Send to bank')
  }
  // Keep tip / spray / event spray / POS labels intact.
  if (/^tip received|^tip to |^tip sent|^event spray|^pos\b|^business pos|vendor commission|pos sale|pos payment/i.test(desc)) {
    return desc
  }
  if (tx.direction === 'credit' && /^tip received/i.test(desc)) {
    return 'Tip received'
  }
  if (tx.counterparty) {
    if (tx.direction === 'credit') {
      if (/^received Ƀu|^tip received|^event spray/i.test(desc)) return desc
      return `Received ɃU from ${tx.counterparty}`
    }
    if (/^sent Ƀu|^tip (sent )?to|^event spray/i.test(desc)) return desc
    return `Sent ɃU to ${tx.counterparty}`
  }
  return desc || 'ɃU movement'
}

function normalizeRows(rows: Transaction[]) {
  return rows.map((row) => {
    const direction = row.direction ?? walletDirection(row)
    const bucket = row.bucket ?? historyBucket(row)
    return {
      ...row,
      direction,
      bucket,
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
        fetch('/api/wallet?history=1&limit=100&full=1', { credentials: 'include', cache: 'no-store' }),
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
                  Tips, sprays, event sprays, transfers, POS, top-ups, tickets, and withdrawals show here.
                </p>
              </div>
            ) : (
              filteredTransactions.map((tx, index) => {
                const credit = tx.direction === 'credit'
                const canOpenInvoice = tx.bucket === 'bu_transfer'
                const amountClass = credit ? 'bu-credit' : 'bu-debit'
                const badgeClass = credit
                  ? 'bg-green-500/15 text-green-700'
                  : 'bg-red-500/15 text-red-700'
                const content = (
                  <>
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold sm:h-9 sm:w-9 sm:text-xs ${badgeClass}`}
                    >
                      {credit ? 'In' : 'Out'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-neutral-950 sm:text-sm">
                        {activityTitle(tx)}
                      </p>
                      <p className="text-[10px] text-neutral-500 sm:text-xs">{tx.date}</p>
                    </div>
                    <div className={`shrink-0 text-right text-xs font-semibold sm:text-sm ${amountClass}`}>
                      <SignedBu amountBu={buFromNaira(tx.amount)} direction={tx.direction} />
                      <p className="text-[10px] font-normal text-neutral-500 sm:text-xs">
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
                    className="bu-press bu-glass-soft flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left transition active:scale-[0.99] sm:gap-3 sm:rounded-2xl sm:px-4 sm:py-3"
                  >
                    {content}
                  </button>
                ) : (
                  <div
                    key={`${tx.id}-${tx.createdAt}-${index}`}
                    className="bu-glass-soft flex w-full items-center gap-2 rounded-xl px-3 py-2.5 sm:gap-3 sm:rounded-2xl sm:px-4 sm:py-3"
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
