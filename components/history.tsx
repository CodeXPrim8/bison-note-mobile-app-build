'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { isEventPast } from '@/lib/events/sale'
import type { EventRecord, TicketRecord, TicketTier } from '@/lib/types/database'

interface Transaction {
  id: string
  type: 'topup' | 'purchase' | 'withdrawal' | 'bu_transfer' | 'ticket_purchase'
  amount: number
  date: string
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

  useEffect(() => {
    fetch('/api/wallet', { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        const txs = (json.data?.transactions ?? []) as Array<Record<string, unknown>>
        setTransactions(
          txs.map((tx) => ({
            id: String(tx.id),
            type: (String(tx.type ?? 'bu_transfer') as Transaction['type']),
            amount: Number(tx.amount ?? 0),
            date: tx.created_at ? new Date(String(tx.created_at)).toLocaleString() : '',
            description: String(tx.description ?? 'ɃU movement'),
            status: 'completed' as const,
          })),
        )
      })
      .catch(() => undefined)
    fetch('/api/tickets/mine', { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        if (!json.status) return
        const list = (json.data ?? []) as HistoryTicket[]
        setPastTickets(
          list.filter(
            (ticket) =>
              isEventPast(ticket.event) &&
              ticket.status !== 'refunded' &&
              ticket.status !== 'cancelled',
          ),
        )
      })
      .catch(() => undefined)
  }, [])

  const filteredTransactions = filter === 'all'
    ? transactions
    : transactions.filter((tx) => tx.type === filter)

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

        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Events you attended</h3>
        <div className="mb-8 space-y-3">
          {pastTickets.length === 0 ? (
            <Card className="border-border/50 bg-card/50 p-6 text-center">
              <p className="text-sm text-muted-foreground">No past events yet. After a party date passes, paid tickets move here.</p>
            </Card>
          ) : (
            pastTickets.map((ticket) => (
              <Card key={ticket.id} className="border-border/50 bg-card/50 p-4">
                <p className="font-medium">{ticket.event?.title ?? 'Event'}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {ticket.tier?.name ?? 'General'}
                  {ticket.event?.start_time ? ` · ${new Date(ticket.event.start_time).toLocaleDateString()}` : ''}
                  {ticket.event?.venue_name ? ` · ${ticket.event.venue_name}` : ''}
                </p>
                <span className="mt-2 inline-block rounded-full bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
                  {ticket.status === 'checked_in' ? 'Attended' : 'Ended'}
                </span>
              </Card>
            ))
          )}
        </div>

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
          {filteredTransactions.length === 0 ? (
            <Card className="border-border/50 bg-card/50 p-8 text-center">
              <p className="text-muted-foreground">No transactions found</p>
            </Card>
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
                    {tx.type === 'topup' || tx.type === 'purchase' || tx.type === 'bu_transfer' ? '+' : '-'}₦
                    {tx.amount.toLocaleString()}
                  </span>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
