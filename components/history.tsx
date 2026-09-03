'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { isEventPast } from '@/lib/events/sale'
import { formatEventDateTime } from '@/lib/datetime'
import { buFromNaira, formatBu, formatNairaPlain } from '@/lib/bu-rate'
import { TicketFeedbackForm } from '@/components/ticket-feedback'
import type { EventRecord, TicketRecord, TicketTier } from '@/lib/types/database'
import { useAccount } from '@/components/account-store'
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

export default function History() {
  const { userId } = useAccount()
  const [filter, setFilter] = useState<'all' | HistoryBucket>('all')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [pastTickets, setPastTickets] = useState<HistoryTicket[]>([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      bindAccountSnapshots(userId || null)
      const cached = readSessionSnapshot<{ transactions: Transaction[]; pastTickets: HistoryTicket[] }>('bu_history')
      if (cached?.transactions?.length || cached?.pastTickets?.length) {
        setTransactions(
          (cached.transactions ?? []).map((row) => {
            const direction = row.direction ?? walletDirection(row)
            return {
              ...row,
              direction,
              bucket: row.bucket ?? historyBucket(row),
              description: historyLabel({ ...row, direction }),
            }
          }),
        )
        setPastTickets(cached.pastTickets ?? [])
      }
      try {
        const [walletRes, ticketsRes] = await Promise.all([
          fetch('/api/wallet', { credentials: 'include' }),
          fetch('/api/tickets/mine', { credentials: 'include' }),
        ])
        const walletJson = await walletRes.json()
        const ticketsJson = await ticketsRes.json()
        if (cancelled) return

        let nextTx =
          cached?.transactions?.map((row) => {
            const direction = row.direction ?? walletDirection(row)
            return {
              ...row,
              direction,
              bucket: row.bucket ?? historyBucket(row),
              description: historyLabel({ ...row, direction }),
            }
          }) ?? []
        if (!walletJson.status) {
          setError(walletJson.message ?? 'Could not load wallet history')
        } else {
          nextTx = ((walletJson.data?.transactions ?? []) as Array<Record<string, unknown>>)
            .map(mapWalletTx)
            .sort((a, b) => b.createdAt - a.createdAt)
          setError(null)
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
        writeSessionSnapshot('bu_history', { transactions: nextTx, pastTickets: past })
        setReady(true)
      } catch {
        if (!cancelled) {
          setReady(true)
          setError('Could not load history')
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [userId])

  const filteredTransactions = (filter === 'all' ? transactions : transactions.filter((tx) => tx.bucket === filter))
    .slice()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))

  return (
    <div className="space-y-6 pb-24 pt-4">
      <div className="px-4">
        <h2 className="text-xl font-bold mb-4">History</h2>

        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Transaction history</h3>

        <div className="flex gap-2 overflow-x-auto mb-4 pb-2">
          {[
            { id: 'all', label: 'All' },
            { id: 'topup', label: 'Top-ups' },
            { id: 'purchase', label: 'Purchases' },
            { id: 'bu_transfer', label: 'Transfers' },
            { id: 'withdrawal', label: 'Withdrawals' },
          ].map((f) => (
            <Button
              key={f.id}
              onClick={() => setFilter(f.id as typeof filter)}
              variant={filter === f.id ? 'default' : 'outline'}
              size="sm"
              className="flex-shrink-0"
            >
              {f.label}
            </Button>
          ))}
        </div>

        <div className="space-y-3">
          {error && (
            <Card className="border-destructive/40 bg-card/50 p-4">
              <p className="text-sm text-destructive">{error}</p>
            </Card>
          )}
          {filteredTransactions.length === 0 ? (
            ready ? (
              <Card className="border-border/50 bg-card/50 p-8 text-center">
                <p className="text-muted-foreground">No transactions found</p>
              </Card>
            ) : (
              <p className="text-sm text-muted-foreground">Loading history…</p>
            )
          ) : (
            filteredTransactions.map((tx, index) => {
              const credit = tx.direction === 'credit'
              return (
                <Card key={`${tx.id}-${tx.createdAt}-${index}`} className="border-border/50 bg-card/50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className={`rounded-full p-2 ${amountIconTone(tx.direction)}`}>
                        {credit ? (
                          <ArrowDown className="h-4 w-4 text-green-500" />
                        ) : (
                          <ArrowUp className="h-4 w-4 text-red-500" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium">{tx.description}</p>
                        <p className="text-xs text-muted-foreground">{tx.date}</p>
                        {tx.status && tx.status !== 'completed' ? (
                          <span
                            className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              tx.status === 'pending'
                                ? 'bg-yellow-400/20 text-yellow-500'
                                : 'bg-red-500/20 text-red-500'
                            }`}
                          >
                            {tx.status}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <span className={`shrink-0 text-right font-semibold ${amountTone(tx.direction)}`}>
                      {credit ? '+' : '-'}Ƀ {formatBu(buFromNaira(tx.amount))}
                      <span className="block text-xs font-normal text-muted-foreground">
                        {credit ? '+' : '-'}₦{formatNairaPlain(tx.amount)}
                      </span>
                    </span>
                  </div>
                </Card>
              )
            })
          )}
        </div>

        <h3 className="mb-3 mt-10 text-sm font-semibold text-muted-foreground">Events you attended</h3>
        <div className="mb-8 space-y-3">
          {pastTickets.length === 0 ? (
            ready ? (
              <Card className="border-border/50 bg-card/50 p-6 text-center">
                <p className="text-sm text-muted-foreground">No past events yet. After a party date passes, paid tickets move here.</p>
              </Card>
            ) : null
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
      </div>
    </div>
  )
}
