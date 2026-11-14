'use client'

import { useEffect, useState } from 'react'
import { ArrowDown, Banknote, CalendarDays, History, Sparkles } from 'lucide-react'
import { historyLabel, walletDirection } from '@/lib/wallet/direction'
import { formatEventDateTime } from '@/lib/datetime'
import { buFromNaira, formatBu, formatNairaPlain } from '@/lib/bu-rate'
import { useAccount } from '@/components/account-store'
import { bindAccountSnapshots, readSessionSnapshot, writeSessionSnapshot } from '@/lib/session-snapshot'
import {
  ModeHeroAction,
  ModeIconRow,
  ModeIconTile,
  ModeListRow,
  ModeWalletHero,
} from '@/components/mode-home-shell'
import ModeSwitcher from '@/components/mode-switcher'

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
  direction: 'credit' | 'debit'
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

export default function CelebrantDashboard({
  onNavigate,
  onModeChange,
  currentMode = 'celebrant',
}: {
  onNavigate?: (page: string) => void
  onModeChange?: (mode: 'user' | 'celebrant' | 'vendor') => void
  currentMode?: 'user' | 'celebrant' | 'vendor'
} = {}) {
  const { greetingName, userId, buBalance, nairaBalance } = useAccount()
  const [balanceVisible, setBalanceVisible] = useState(true)
  const [events, setEvents] = useState<Event[]>([])
  const [recentTransfers, setRecentTransfers] = useState<BUTransfer[]>([])
  const [eventsReady, setEventsReady] = useState(false)
  const [transfersReady, setTransfersReady] = useState(false)

  useEffect(() => {
    bindAccountSnapshots(userId || null)
    if (!userId) {
      setEvents([])
      setRecentTransfers([])
      setEventsReady(false)
      setTransfersReady(false)
      return
    }
    const cached = readSessionSnapshot<CelebrantCache>(CACHE_KEY)
    const cache: CelebrantCache = {
      events: cached?.events ?? [],
      recentTransfers: cached?.recentTransfers ?? [],
    }
    if (cached) {
      setEvents(cache.events)
      setRecentTransfers(
        cache.recentTransfers.map((row) => ({
          ...row,
          direction: row.direction === 'debit' ? 'debit' : 'credit',
        })),
      )
      setEventsReady(true)
      setTransfersReady(true)
    }
    function persist(partial: Partial<CelebrantCache>) {
      if (partial.events !== undefined) cache.events = partial.events
      if (partial.recentTransfers !== undefined) cache.recentTransfers = partial.recentTransfers
      writeSessionSnapshot(CACHE_KEY, cache)
    }
    fetch('/api/events/mine', { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        if (!json.status) {
          setEvents([])
          persist({ events: [] })
          setEventsReady(true)
          return
        }
        const next = mapEvents((json.data ?? []) as Array<Record<string, unknown>>)
        setEvents(next)
        persist({ events: next })
        setEventsReady(true)
      })
      .catch(() => {
        setEvents([])
        persist({ events: [] })
        setEventsReady(true)
      })
    fetch('/api/wallet', { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        if (!json.status) {
          setRecentTransfers([])
          persist({ recentTransfers: [] })
          setTransfersReady(true)
          return
        }
        const txs = (json.data?.transactions ?? []) as Array<Record<string, unknown>>
        const next = txs
          .map((tx) => {
            const type = String(tx.type ?? '')
            const description = String(tx.description ?? 'ɃU received')
            const direction =
              tx.direction === 'credit' || tx.direction === 'debit'
                ? tx.direction
                : walletDirection({ type, description, metadata: tx.metadata, amount: Number(tx.amount ?? 0) })
            return {
              id: String(tx.id),
              eventId: String(tx.event_id ?? ''),
              eventName: historyLabel({ type, description, direction }),
              amount: Math.abs(Number(tx.amount ?? 0)),
              fromGuest: direction === 'credit' ? 'Incoming' : 'Outgoing',
              timestamp: tx.created_at ? formatEventDateTime(String(tx.created_at)) : '',
              direction,
            }
          })
          .slice(0, 8)
        setRecentTransfers(next)
        persist({ recentTransfers: next })
        setTransfersReady(true)
      })
      .catch(() => {
        setRecentTransfers([])
        persist({ recentTransfers: [] })
        setTransfersReady(true)
      })
  }, [userId])

  const totalBUReceived = events.reduce((sum, event) => sum + event.totalBUReceived, 0)
  const latest = recentTransfers[0]

  return (
    <div className="space-y-6 bg-white pb-28 text-neutral-950">
      <ModeWalletHero
        title={greetingName ? `Celebrant · ${greetingName}` : 'Celebrant'}
        balanceLabel={buBalance == null ? '\u00a0' : `Ƀ ${formatBu(buBalance)}`}
        balanceVisible={balanceVisible}
        onToggleBalance={() => setBalanceVisible((value) => !value)}
        subtitle={
          nairaBalance == null
            ? '\u00a0'
            : `≈ ₦${formatNairaPlain(nairaBalance)} · Events Ƀ ${formatBu(buFromNaira(totalBUReceived))}`
        }
        actions={
          <>
            <ModeHeroAction label="Receive" Icon={ArrowDown} onClick={() => onNavigate?.('receive-bu')} />
            <ModeHeroAction label="Send to bank" Icon={Banknote} onClick={() => onNavigate?.('redemption')} />
            <ModeHeroAction label="History" Icon={History} onClick={() => onNavigate?.('history')} />
          </>
        }
        footer={
          <button
            type="button"
            onClick={() => onNavigate?.('history')}
            className="bu-press flex w-full items-center gap-3 border-t border-white/10 bg-black px-5 py-3.5 text-left"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white/90">
                {latest ? latest.eventName : 'No transfers yet'}
              </p>
              {latest ? (
                <p
                  className={`mt-0.5 text-sm font-semibold tabular-nums ${
                    latest.direction === 'credit' ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {latest.direction === 'credit' ? '+' : '−'}Ƀ {formatBu(buFromNaira(latest.amount))}
                </p>
              ) : null}
            </div>
            <span className="shrink-0 text-xs font-medium text-white/55">Transactions ›</span>
          </button>
        }
      />

      <div className="bu-rise space-y-6 px-4" style={{ animationDelay: '80ms' }}>
        <ModeIconRow>
          <ModeIconTile label="To Bank" Icon={Banknote} onClick={() => onNavigate?.('redemption')} />
          <ModeIconTile label="My Events" Icon={CalendarDays} onClick={() => onNavigate?.('events')} />
          <ModeIconTile label="Receive tip" Icon={Sparkles} onClick={() => onNavigate?.('receive-bu')} />
        </ModeIconRow>

        {onModeChange ? <ModeSwitcher currentMode={currentMode} onModeChange={onModeChange} /> : null}

        <div>
          <h3 className="mb-3 text-sm font-semibold text-neutral-950">My events</h3>
          <div className="space-y-2">
            {eventsReady && events.length === 0 ? (
              <p className="text-sm text-neutral-500">No events yet.</p>
            ) : null}
            {events.map((event) => (
              <ModeListRow
                key={event.id}
                title={event.name}
                detail={[event.date, event.vendorName].filter(Boolean).join(' · ')}
                amount={`Ƀ ${formatBu(buFromNaira(event.totalBUReceived))}`}
                onClick={() => onNavigate?.('events')}
              />
            ))}
          </div>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold text-neutral-950">Recent ɃU</h3>
          <div className="space-y-2">
            {transfersReady && recentTransfers.length === 0 ? (
              <p className="text-sm text-neutral-500">No ɃU movements yet.</p>
            ) : null}
            {recentTransfers.map((transfer) => (
              <ModeListRow
                key={transfer.id}
                title={transfer.eventName}
                detail={[transfer.fromGuest, transfer.timestamp].filter(Boolean).join(' · ')}
                amount={`${transfer.direction === 'credit' ? '+' : '−'}Ƀ ${formatBu(buFromNaira(transfer.amount))}`}
                amountTone={transfer.direction === 'credit' ? 'credit' : 'debit'}
                onClick={() => onNavigate?.('history')}
              />
            ))}
          </div>
        </div>

        <p className="text-xs leading-relaxed text-neutral-500">
          Guests send ɃU to your wallet through events. Send to bank anytime at 1 ɃU = ₦1.
        </p>
      </div>
    </div>
  )
}
