'use client'

import { useEffect, useState } from 'react'
import { ArrowDown, ArrowLeft, CalendarDays, History, Plus, Pencil } from 'lucide-react'
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
import { SignedBu } from '@/components/signed-bu'
import { EventVendorsManage } from '@/components/event-vendors-manage'
import { Button } from '@/components/ui/button'

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
  const { greetingName, userId, buBalance, nairaBalance, balanceMotion, canCelebrant, canVendor } = useAccount()
  const [balanceVisible, setBalanceVisible] = useState(true)
  const [events, setEvents] = useState<Event[]>([])
  const [recentTransfers, setRecentTransfers] = useState<BUTransfer[]>([])
  const [eventsReady, setEventsReady] = useState(false)
  const [activeEventId, setActiveEventId] = useState<string | null>(null)
  const [pendingByEvent, setPendingByEvent] = useState<Record<string, number>>({})

  async function loadPendingCounts(eventIds: string[]) {
    if (!eventIds.length) {
      setPendingByEvent({})
      return
    }
    const entries = await Promise.all(
      eventIds.map(async (eventId) => {
        try {
          const res = await fetch(`/api/pos/vendors?event_id=${encodeURIComponent(eventId)}`, {
            credentials: 'include',
          })
          const json = await res.json()
          if (!json.status) return [eventId, 0] as const
          const vendors = (json.data?.vendors ?? []) as Array<{ status?: string }>
          const pending = vendors.filter((row) => row.status === 'pending').length
          return [eventId, pending] as const
        } catch {
          return [eventId, 0] as const
        }
      }),
    )
    setPendingByEvent(Object.fromEntries(entries))
  }

  useEffect(() => {
    bindAccountSnapshots(userId || null)
    if (!userId) {
      setEvents([])
      setRecentTransfers([])
      setPendingByEvent({})
      setEventsReady(false)
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
      if (cache.events.length) void loadPendingCounts(cache.events.map((event) => event.id))
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
          setPendingByEvent({})
          setEventsReady(true)
          return
        }
        const next = mapEvents((json.data ?? []) as Array<Record<string, unknown>>)
        setEvents(next)
        persist({ events: next })
        setEventsReady(true)
        void loadPendingCounts(next.map((event) => event.id))
      })
      .catch(() => {
        setEvents([])
        persist({ events: [] })
        setPendingByEvent({})
        setEventsReady(true)
      })
    fetch('/api/wallet?history=1&limit=12', { credentials: 'include', cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json()
        if (!json.status) {
          setRecentTransfers([])
          persist({ recentTransfers: [] })
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
      })
      .catch(() => {
        setRecentTransfers([])
        persist({ recentTransfers: [] })
      })
  }, [userId])

  const totalBUReceived = events.reduce((sum, event) => sum + event.totalBUReceived, 0)
  const latest = recentTransfers[0]
  const activeEvent = activeEventId ? events.find((event) => event.id === activeEventId) : null

  if (activeEvent) {
    return (
      <div className="space-y-6 bg-transparent pb-28 pt-4 text-neutral-950">
        <div className="space-y-4 px-4">
          <button
            type="button"
            aria-label="Back"
            onClick={() => {
              setActiveEventId(null)
              void loadPendingCounts(events.map((event) => event.id))
            }}
            className="bu-press bu-back-chip"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          <div className="bu-event-detail p-5">
            <div className="relative z-[1] space-y-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/55">My event</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-white">{activeEvent.name}</h2>
                <p className="mt-2 text-sm text-white/70">
                  {[activeEvent.date, activeEvent.vendorName].filter(Boolean).join(' · ')}
                </p>
                <p className="mt-2 text-lg font-semibold tabular-nums text-white">
                  Ƀ {formatBu(buFromNaira(activeEvent.totalBUReceived))}
                </p>
              </div>
              <Button
                type="button"
                className="w-full bg-white text-neutral-950 hover:bg-white/90"
                onClick={() => {
                  window.location.href = `/organizer/events/${activeEvent.id}/edit`
                }}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Edit event
              </Button>
            </div>
          </div>

          <EventVendorsManage compact eventId={activeEvent.id} eventTitle={activeEvent.name} />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 bg-transparent pb-28 text-neutral-950">
      <ModeWalletHero
        title={greetingName ? `Celebrant · ${greetingName}` : 'Celebrant'}
        balanceValue={buBalance}
        balanceMotion={balanceMotion}
        balanceVisible={balanceVisible}
        onToggleBalance={() => setBalanceVisible((value) => !value)}
        subtitle={
          nairaBalance == null
            ? '\u00a0'
            : `≈ ₦${formatNairaPlain(nairaBalance)} · Events Ƀ\u2009${formatBu(buFromNaira(totalBUReceived))}`
        }
        actions={
          <>
            <ModeHeroAction label="Receive" Icon={ArrowDown} onClick={() => onNavigate?.('receive-bu')} />
            <ModeHeroAction
              label="Create"
              Icon={Plus}
              onClick={() => {
                window.location.href = '/organizer/events/create'
              }}
            />
            <ModeHeroAction label="History" Icon={History} onClick={() => onNavigate?.('history')} />
          </>
        }
        footer={
          <button
            type="button"
            onClick={() => onNavigate?.('history')}
            className="bu-press flex w-full items-center gap-3 border-t border-white/10 px-5 py-3.5 text-left"
            style={{ background: 'rgba(7, 16, 31, 0.72)' }}
          >
            <div className="min-w-0 flex-1 flex items-center gap-2">
              <p className="truncate text-sm font-medium text-white/90">
                {latest ? latest.eventName : 'No transfers yet'}
              </p>
              {latest ? (
                <SignedBu
                  amountBu={buFromNaira(latest.amount)}
                  direction={latest.direction}
                  className={`shrink-0 text-sm font-semibold ${
                    latest.direction === 'credit' ? 'bu-credit' : 'bu-debit'
                  }`}
                />
              ) : null}
            </div>
            <span className="shrink-0 text-xs font-medium text-white/55">Transactions ›</span>
          </button>
        }
      />

      <div className="bu-rise space-y-6 px-4" style={{ animationDelay: '80ms' }}>
        {onModeChange ? (
          <ModeSwitcher
            currentMode={currentMode}
            onModeChange={onModeChange}
            canCelebrant={canCelebrant}
            canVendor={canVendor}
          />
        ) : null}

        <ModeIconRow columns={2}>
          <ModeIconTile
            label="Create event"
            Icon={Plus}
            onClick={() => {
              window.location.href = '/organizer/events/create'
            }}
            tone="cyber"
          />
          <ModeIconTile
            label="My Events"
            Icon={CalendarDays}
            onClick={() => {
              const el = document.getElementById('celebrant-my-events')
              el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
            tone="purple"
          />
        </ModeIconRow>

        <div id="celebrant-my-events">
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
                amount={`Ƀ\u2009${formatBu(buFromNaira(event.totalBUReceived))}`}
                badgeCount={pendingByEvent[event.id] ?? 0}
                onClick={() => setActiveEventId(event.id)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
