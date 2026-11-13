'use client'

import { useCallback, useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, History as HistoryIcon, RefreshCw, Ticket } from 'lucide-react'
import { isEventPast } from '@/lib/events/sale'
import { formatEventDateTime } from '@/lib/datetime'
import { buFromNaira, formatBu, formatNairaPlain } from '@/lib/bu-rate'
import { TicketFeedbackForm } from '@/components/ticket-feedback'
import type { EventRecord, TicketRecord, TicketTier } from '@/lib/types/database'
import { useAccount, useWalletPulse } from '@/components/account-store'
import { bindAccountSnapshots, readSessionSnapshot, writeSessionSnapshot } from '@/lib/session-snapshot'
import {
  amountIconTone,
  amountTone,
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

function mapWalletTx(tx: Record<string, unknown>): Transaction {
  const type = String(tx.type ?? tx.kind ?? 'deposit')
  const rawDescription = String(tx.description ?? tx.type ?? 'ɃU movement')
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
  return {
    id: String(tx.id ?? `${createdAt}-${rawDescription}`),
    type,
    amount: Math.abs(Number(tx.amount ?? 0)),
    date: tx.created_at ? formatEventDateTime(String(tx.created_at)) : '',
    createdAt,
    description: historyLabel({ type, description: rawDescription, direction }),
    status: statusRaw,
    direction,
    bucket: (tx.bucket as HistoryBucket | undefined) || historyBucket({ type, description: rawDescription }),
  }
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
  const { userId, refreshWallet } = useAccount()
  const [tab, setTab] = useState<'activity' | 'events'>('activity')
  const [filter, setFilter] = useState<'all' | HistoryBucket>('all')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [pastTickets, setPastTickets] = useState<HistoryTicket[]>([])
  const [ready, setReady] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    bindAccountSnapshots(userId || null)
    if (!opts?.silent) setRefreshing(true)

    const cached = readSessionSnapshot<{ transactions: Transaction[]; pastTickets: HistoryTicket[] }>('bu_history')
    if (cached?.transactions?.length) {
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
                return (
                  <div
                    key={`${tx.id}-${tx.createdAt}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-border/50 bg-card/40 px-4 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className={`rounded-full p-2.5 ${amountIconTone(tx.direction)}`}>
                        {credit ? (
                          <ArrowDown className="h-4 w-4 text-green-500" />
                        ) : (
                          <ArrowUp className="h-4 w-4 text-red-500" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{tx.description}</p>
                        <p className="text-xs text-muted-foreground">{tx.date}</p>
                      </div>
                    </div>
                    <div className={`shrink-0 text-right font-semibold ${amountTone(tx.direction)}`}>
                      {credit ? '+' : '-'}Ƀ {formatBu(buFromNaira(tx.amount))}
                      <p className="text-xs font-normal text-muted-foreground">
                        {credit ? '+' : '-'}₦{formatNairaPlain(tx.amount)}
                      </p>
                    </div>
                  </div>
                )
              })
            )}
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
