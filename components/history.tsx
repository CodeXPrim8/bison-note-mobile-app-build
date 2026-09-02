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
import { readSessionSnapshot, writeSessionSnapshot, bindAccountSnapshots } from '@/lib/session-snapshot'

interface Transaction {
  id: string
  type: 'topup' | 'purchase' | 'withdrawal' | 'bu_transfer' | 'ticket_purchase'
  amount: number
  date: string
  createdAt: number
  description: string
  status: 'completed' | 'pending' | 'failed'
}

interface HistoryTicket extends TicketRecord {
  event: EventRecord | null
  tier: TicketTier | null
  display_status: string
}

export default function History() {
  const [filter, setFilter] = useState<'all' | 'topup' | 'purchase' | 'withdrawal' | 'bu_transfer'>('all')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [pastTickets, setPastTickets] = useState<HistoryTicket[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const meRes = await fetch('/api/me', { credentials: 'include' })
        const me = await meRes.json()
        const userId = me.status ? String(me.data?.user?.id || '') : ''
        bindAccountSnapshots(userId || null)
        if (cancelled) return
        if (!userId) {
          setTransactions([])
          setPastTickets([])
          setReady(true)
          return
        }
        const cached = readSessionSnapshot<{ transactions: Transaction[]; pastTickets: HistoryTicket[] }>('bu_history')
        if (cached) {
          setTransactions(cached.transactions ?? [])
          setPastTickets(cached.pastTickets ?? [])
        }

        const [walletRes, ticketsRes] = await Promise.all([
          fetch('/api/wallet', { credentials: 'include' }),
          fetch('/api/tickets/mine', { credentials: 'include' }),
        ])
        const walletJson = await walletRes.json()
        const ticketsJson = await ticketsRes.json()
        if (cancelled) return

        const nextTx: Transaction[] = walletJson.status
          ? ((walletJson.data?.transactions ?? []) as Array<Record<string, unknown>>).map((tx) => {
              const raw = String(tx.type ?? 'bu_transfer')
              const type: Transaction['type'] =
                raw === 'organiser_sale' ||
                raw === 'affiliate_commission' ||
                raw === 'deposit' ||
                raw === 'topup' ||
                raw === 'spray_credit' ||
                raw === 'refund'
                  ? 'topup'
                  : raw === 'withdrawal'
                    ? 'withdrawal'
                    : raw === 'ticket_purchase' || raw === 'purchase'
                      ? 'purchase'
                      : 'bu_transfer'
              return {
                id: String(tx.id),
                type,
                amount: Number(tx.amount ?? 0),
                date: tx.created_at ? formatEventDateTime(String(tx.created_at)) : '',
                createdAt: new Date(String(tx.created_at ?? '')).getTime() || 0,
                description: String(tx.description ?? 'ɃU movement'),
                status: 'completed' as const,
              }
            })
          : []
        nextTx.sort((a, b) => b.createdAt - a.createdAt)

        const past = ticketsJson.status
          ? ((ticketsJson.data ?? []) as HistoryTicket[])
              .filter(
                (ticket) =>
                  isEventPast(ticket.event) && ticket.status !== 'refunded' && ticket.status !== 'cancelled',
              )
              .sort((a, b) => Date.parse(b.created_at || '') - Date.parse(a.created_at || ''))
          : []

        setTransactions(nextTx)
        setPastTickets(past)
        setReady(true)
        writeSessionSnapshot('bu_history', { transactions: nextTx, pastTickets: past })
      } catch {
        if (!cancelled) setReady(true)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const filteredTransactions = (filter === 'all' ? transactions : transactions.filter((tx) => tx.type === filter))
    .slice()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))

  const getTransactionIcon = (type: string) => {
    return type === 'topup' || type === 'refund' || type === 'bu_transfer' || type === 'purchase'
      ? <ArrowDown className="h-4 w-4 text-primary" />
      : <ArrowUp className="h-4 w-4 text-destructive" />
  }

  const getTransactionColor = (type: string) => {
    return type === 'topup' || type === 'refund' || type === 'bu_transfer' || type === 'purchase'
      ? 'bg-primary/20'
      : 'bg-destructive/20'
  }

  return (
    <div className="space-y-6 pb-24 pt-4">
      <div className="px-4">
        <h2 className="text-xl font-bold mb-4">History</h2>

        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Transaction history</h3>
        <p className="mb-3 text-xs text-muted-foreground">Newest first. Scroll down for older movements.</p>

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
          {filteredTransactions.length === 0 ? (
            ready ? (
              <Card className="border-border/50 bg-card/50 p-8 text-center">
                <p className="text-muted-foreground">No transactions found</p>
              </Card>
            ) : null
          ) : (
            filteredTransactions.map((tx) => (
              <Card
                key={tx.id}
                className="border-border/50 bg-card/50 p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`rounded-full p-2 ${getTransactionColor(tx.type)}`}>
                      {getTransactionIcon(tx.type)}
                    </div>
                    <div>
                      <p className="font-medium">{tx.description}</p>
                      <p className="text-xs text-muted-foreground">{tx.date}</p>
                      <span
                        className={`mt-1 inline-block rounded-full px-2 py-1 text-xs font-semibold ${
                          tx.status === 'completed'
                            ? 'bg-green-400/20 text-green-400'
                            : tx.status === 'pending'
                              ? 'bg-yellow-400/20 text-yellow-400'
                              : 'bg-red-400/20 text-red-400'
                        }`}
                      >
                        {tx.status}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`font-semibold ${
                      tx.type === 'topup' || tx.type === 'purchase' || tx.type === 'bu_transfer'
                        ? 'text-primary'
                        : 'text-foreground'
                    }`}
                  >
                    {tx.type === 'topup' || tx.type === 'purchase' || tx.type === 'bu_transfer' ? '+' : '-'}
                    Ƀ {formatBu(buFromNaira(tx.amount))}
                    <span className="block text-xs font-normal text-muted-foreground">
                      ₦{formatNairaPlain(tx.amount)}
                    </span>
                  </span>
                </div>
              </Card>
            ))
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
