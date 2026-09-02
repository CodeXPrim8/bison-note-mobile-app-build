'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowDown, Banknote, TrendingUp, Calendar } from 'lucide-react'
import { formatEventDateTime } from '@/lib/datetime'
import { buFromNaira, formatBu, formatNairaPlain, BU_MIN_WITHDRAW } from '@/lib/bu-rate'
import { useAccount } from '@/components/account-store'
import { readSessionSnapshot, writeSessionSnapshot } from '@/lib/session-snapshot'

interface Event {
  id: string
  name: string
  date: string
  totalBUReceived: number
  vendorName: string
}

interface BUTransfer {
  id: string
  eventId: string
  eventName: string
  amount: number
  fromGuest: string
  timestamp: string
}

const CACHE_KEY = 'bu_celebrant_dashboard'

type CelebrantCache = {
  events: Event[]
  recentTransfers: BUTransfer[]
}

function mapEvents(list: Array<Record<string, unknown>>): Event[] {
  return list.map((event) => ({
    id: String(event.id),
    name: String(event.title ?? event.name ?? 'Event'),
    date: event.start_time ? formatEventDateTime(String(event.start_time)) : '',
    totalBUReceived: Number(event.spray_budget_bu ?? 0),
    vendorName: String(event.venue_name ?? ''),
  }))
}

export default function CelebrantDashboard({ onNavigate }: { onNavigate?: (page: string) => void } = {}) {
  const { greetingName } = useAccount()
  const cached = readSessionSnapshot<CelebrantCache>(CACHE_KEY)
  const [events, setEvents] = useState<Event[]>(cached?.events ?? [])
  const [recentTransfers, setRecentTransfers] = useState<BUTransfer[]>(cached?.recentTransfers ?? [])
  const [eventsReady, setEventsReady] = useState(Boolean(cached))
  const [transfersReady, setTransfersReady] = useState(Boolean(cached))

  useEffect(() => {
    fetch('/api/events/mine', { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        const next = mapEvents((json.data ?? []) as Array<Record<string, unknown>>)
        setEvents(next)
        setEventsReady(true)
        writeSessionSnapshot(CACHE_KEY, {
          events: next,
          recentTransfers: readSessionSnapshot<CelebrantCache>(CACHE_KEY)?.recentTransfers ?? [],
        })
      })
      .catch(() => setEventsReady(true))
    fetch('/api/wallet', { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        const txs = (json.data?.transactions ?? []) as Array<Record<string, unknown>>
        const next = txs.slice(0, 8).map((tx) => ({
          id: String(tx.id),
          eventId: String(tx.event_id ?? ''),
          eventName: String(tx.description ?? 'ɃU received'),
          amount: Number(tx.amount ?? 0),
          fromGuest: 'Guest',
          timestamp: tx.created_at ? formatEventDateTime(String(tx.created_at)) : '',
        }))
        setRecentTransfers(next)
        setTransfersReady(true)
        writeSessionSnapshot(CACHE_KEY, {
          events: readSessionSnapshot<CelebrantCache>(CACHE_KEY)?.events ?? [],
          recentTransfers: next,
        })
      })
      .catch(() => setTransfersReady(true))
  }, [])

  const totalBUReceived = events.reduce((sum, event) => sum + event.totalBUReceived, 0)

  return (
    <div className="space-y-6 pb-24 pt-4">
      <div className="space-y-4 bg-gradient-to-b from-primary to-primary/80 px-4 py-8 text-primary-foreground">
        <div>
          <p className="text-sm opacity-90">Welcome Back</p>
          <h2 className="text-2xl font-bold">{greetingName || '\u00a0'}</h2>
        </div>

        <div className="space-y-3 rounded-2xl bg-primary-foreground/10 p-4 backdrop-blur">
          <p className="text-sm opacity-90">Total ɃU Received</p>
          <div className="flex items-center justify-between">
            <div className="text-3xl font-bold">
              {eventsReady ? `Ƀ ${formatBu(buFromNaira(totalBUReceived))}` : '\u00a0'}
            </div>
            <div className="rounded-full bg-primary-foreground/20 p-2">
              <TrendingUp size={20} />
            </div>
          </div>
          <div className="text-sm opacity-90">
            {eventsReady ? `≈ ₦${formatNairaPlain(totalBUReceived)}` : '\u00a0'}
          </div>
        </div>
      </div>

      <div className="px-4">
        <div className="grid grid-cols-2 gap-3">
          <Button
            className="h-20 flex-col gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => onNavigate?.('redemption')}
          >
            <Banknote className="h-5 w-5" />
            <span>Withdraw ɃU</span>
          </Button>
          <Button variant="outline" className="h-20 flex-col gap-2" onClick={() => onNavigate?.('events')}>
            <Calendar className="h-5 w-5" />
            <span>My Events</span>
          </Button>
        </div>
      </div>

      <div className="px-4">
        <h3 className="mb-4 text-lg font-bold">My Events</h3>
        <div className="space-y-3">
          {eventsReady && events.length === 0 && <p className="text-sm text-muted-foreground">No events yet.</p>}
          {events.map((event) => (
            <Card key={event.id} className="border-primary/20 bg-card p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="font-semibold">{event.name}</h4>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {event.date} · {event.vendorName}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="rounded-full bg-green-400/20 px-2 py-1 text-xs text-green-400">Active</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-primary">Ƀ {formatBu(buFromNaira(event.totalBUReceived))}</p>
                  <p className="text-xs text-muted-foreground">Received</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div className="px-4">
        <h3 className="mb-4 text-lg font-bold">Recent ɃU Transfers</h3>
        <div className="space-y-3">
          {transfersReady && recentTransfers.length === 0 && (
            <p className="text-sm text-muted-foreground">No ɃU received yet.</p>
          )}
          {recentTransfers.map((transfer) => (
            <Card key={transfer.id} className="border-border/50 bg-card/50 p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-primary/20 p-2">
                    <ArrowDown className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold">{transfer.eventName}</h4>
                    <p className="mt-1 text-xs text-muted-foreground">From: {transfer.fromGuest}</p>
                    <p className="text-xs text-muted-foreground">{transfer.timestamp}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-primary">+Ƀ {formatBu(buFromNaira(transfer.amount))}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div className="px-4">
        <Card className="border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5 p-6">
          <div className="space-y-2">
            <h3 className="font-semibold">How It Works</h3>
            <p className="text-sm text-muted-foreground">
              Guests send ɃU directly to your wallet through events. All value is transferred digitally before physical
              notes are issued. You can withdraw {BU_MIN_WITHDRAW.toLocaleString('en-NG')} ɃU or more to your bank at 1 ɃU = ₦1.
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}
