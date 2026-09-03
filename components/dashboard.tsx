'use client';

import { useEffect, useState } from 'react'
import { Bell, Settings, Eye, EyeOff } from 'lucide-react'
import type { EventInvitation, EventRecord, EventWithTiers, TicketRecord, TicketTier } from '@/lib/types/database'
import { isEventUpcoming, isUpcomingListingEvent, listingRemaining } from '@/lib/events/sale'
import { formatEventDate } from '@/lib/datetime'
import { EventStatusBadge } from '@/components/event-status-badge'
import { TicketPass } from '@/components/ticket-pass'
import { useAccount } from '@/components/account-store'
import { formatBu, formatNairaPlain } from '@/lib/bu-rate'
import { countUnseenAlerts } from '@/components/notifications'
import { AdSlot } from '@/components/web/ad-slot'

interface OwnedTicket extends TicketRecord {
  event: EventRecord | null
  tier: TicketTier | null
  display_status: string
}

interface DashboardProps {
  onNavigate: (page: string, data?: any) => void
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  const [balanceVisible, setBalanceVisible] = useState(true)
  const [publicEvents, setPublicEvents] = useState<EventWithTiers[]>([])
  const [invites, setInvites] = useState<Array<EventInvitation & { event: EventRecord | null }>>([])
  const [myTickets, setMyTickets] = useState<OwnedTicket[]>([])
  const [ticketsLoaded, setTicketsLoaded] = useState(false)
  const [invitesLoaded, setInvitesLoaded] = useState(false)
  const [eventsLoaded, setEventsLoaded] = useState(false)
  const [unreadAlerts, setUnreadAlerts] = useState(0)
  const { greetingName, buBalance, nairaBalance, userId, refreshWallet } = useAccount()

  useEffect(() => {
    if (!userId) {
      setInvites([])
      setMyTickets([])
      setInvitesLoaded(false)
      setTicketsLoaded(false)
      setUnreadAlerts(0)
      return
    }
    fetch('/api/events', { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        if (json.status) {
          setPublicEvents(
            (json.data ?? [])
              .filter((event: EventWithTiers) => isUpcomingListingEvent(event))
              .slice(0, 2),
          )
        }
      })
      .catch(() => undefined)
      .finally(() => setEventsLoaded(true))
    fetch('/api/invites', { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        if (!json.status) {
          setInvites([])
          return
        }
        setInvites((json.data ?? []).slice(0, 2))
      })
      .catch(() => setInvites([]))
      .finally(() => setInvitesLoaded(true))
    fetch('/api/wallet', { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        if (!json.status) {
          setUnreadAlerts(0)
          return
        }
        setUnreadAlerts(countUnseenAlerts((json.data?.transactions ?? []) as Array<Record<string, unknown>>))
        void refreshWallet()
      })
      .catch(() => setUnreadAlerts(0))
    fetch('/api/tickets/mine', { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        if (!json.status) {
          setMyTickets([])
          return
        }
        const list = (json.data ?? []) as OwnedTicket[]
        setMyTickets(list.filter((ticket) => isEventUpcoming(ticket.event)).slice(0, 4))
      })
      .catch(() => setMyTickets([]))
      .finally(() => setTicketsLoaded(true))
  }, [userId, refreshWallet])

  return (
    <div className="space-y-6 pb-24">
      {/* Header Section */}
      <div className="space-y-4 bg-gradient-to-b from-primary to-primary/80 px-4 py-8 text-primary-foreground">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm opacity-90">Good Evening</p>
            <h2 className="text-2xl font-bold">{greetingName || '\u00a0'}</h2>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => onNavigate('notifications')}
              className="relative rounded-full bg-primary-foreground/20 p-2 backdrop-blur hover:bg-primary-foreground/30 transition"
            >
              <Bell size={20} />
              {unreadAlerts > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-green-500 px-1 text-center text-[10px] font-bold leading-[18px] text-white">
                  {unreadAlerts > 9 ? '9+' : unreadAlerts}
                </span>
              ) : null}
            </button>
            <button 
              onClick={() => onNavigate('profile', { view: 'settings' })}
              className="rounded-full bg-primary-foreground/20 p-2 backdrop-blur hover:bg-primary-foreground/30 transition"
            >
              <Settings size={20} />
            </button>
          </div>
        </div>

        {/* Account Balance */}
        <div className="space-y-3 rounded-2xl bg-primary-foreground/10 p-4 backdrop-blur">
          <p className="text-sm opacity-90">ɃU Balance</p>
          <div className="flex items-center justify-between">
            <div className="text-3xl font-bold">
              {balanceVisible
                ? buBalance == null
                  ? '\u00a0'
                  : `Ƀ ${formatBu(buBalance)}`
                : 'Ƀ ••••••'}
            </div>
            <button 
              onClick={() => setBalanceVisible(!balanceVisible)}
              className="rounded-full bg-primary-foreground/20 p-2 hover:bg-primary-foreground/30 transition"
            >
              {balanceVisible ? (
                <Eye className="h-5 w-5 text-foreground" />
              ) : (
                <EyeOff className="h-5 w-5 text-foreground" />
              )}
            </button>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="font-mono">
              {balanceVisible
                ? nairaBalance == null
                  ? '\u00a0'
                  : `≈ ₦${formatNairaPlain(nairaBalance)}`
                : '≈ ₦••••••'}
            </span>
            <button
              onClick={() => onNavigate('history')}
              className="rounded-full bg-green-400/20 px-3 py-1 text-green-300 hover:bg-green-400/30 transition"
            >
              History
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button 
            onClick={() => onNavigate('buy-bu')}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary-foreground/20 py-3 backdrop-blur transition hover:bg-primary-foreground/30"
          >
            <span>➕</span>
            <span className="font-semibold">Fund Wallet</span>
          </button>
          <button 
            onClick={() => onNavigate('send-bu')}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary-foreground/20 py-3 backdrop-blur transition hover:bg-primary-foreground/30"
          >
            <span>✨</span>
            <span className="font-semibold">Send ɃU</span>
          </button>
        </div>
      </div>

      <div className="px-4">
        <AdSlot slot="app_home" />
      </div>

      {/* Quick Access - Moved before events */}
      <div className="px-4">
        <h3 className="mb-4 text-lg font-bold">Quick Actions</h3>
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: '🎫', label: 'Tickets', action: 'tickets' },
            { icon: '✨', label: 'Spray', action: 'spraying' },
            { icon: '💰', label: 'Withdraw', action: 'redemption' },
          ].map((item, idx) => (
            <button
              key={idx}
              onClick={() => onNavigate(item.action)}
              className="flex flex-col items-center gap-2 rounded-xl bg-card p-4 transition hover:bg-card/80"
            >
              <div className="text-3xl">{item.icon}</div>
              <span className="text-xs font-medium text-center">{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="px-4">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">My tickets</h3>
          <button onClick={() => onNavigate('tickets')} className="text-sm font-semibold text-primary">
            View All
          </button>
        </div>
        <div className="space-y-3">
          {ticketsLoaded && myTickets.length === 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">No upcoming tickets. Past events you paid for are in History.</p>
              <button type="button" onClick={() => onNavigate('history')} className="text-sm font-semibold text-primary">
                Open history
              </button>
            </div>
          ) : null}
          {myTickets.map((ticket) => (
            <TicketPass
              key={ticket.id}
              ticket={ticket}
              variant="mini"
              onOpen={() => onNavigate('tickets', { ticketId: ticket.id })}
            />
          ))}
        </div>
      </div>

      {/* Invites Section */}
      <div className="px-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">Invites</h3>
          <button
            onClick={() => onNavigate('invites')}
            className="text-sm text-primary font-semibold"
          >
            View All
          </button>
        </div>
        <div className="space-y-3">
          {invitesLoaded && invites.length === 0 && (
            <p className="text-sm text-muted-foreground">No private invites yet.</p>
          )}
          {invites.map((item) => (
            <div
              key={item.id}
              onClick={() => (item.event_id ? onNavigate('event-info', item.event_id) : onNavigate('invites'))}
              className="flex cursor-pointer gap-3 rounded-xl bg-card p-3 transition hover:bg-card/80"
            >
              <div className="text-3xl">💌</div>
              <div className="flex-1">
                <div className="flex items-start justify-between">
                  <h4 className="font-semibold">{item.event?.title ?? 'Private event'}</h4>
                  <span className="rounded-full bg-primary/20 px-2 py-1 text-xs text-primary">
                    {item.event ? formatEventDate(item.event.start_time) : ''}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{item.event?.venue_name}</p>
                <span className="mt-2 inline-block rounded-full bg-yellow-400/20 px-2 py-1 text-xs font-semibold text-yellow-400">
                  {item.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Upcoming Events Section */}
      <div className="px-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">Upcoming Events</h3>
          <button
            onClick={() => onNavigate('events')}
            className="text-sm text-primary font-semibold"
          >
            View All
          </button>
        </div>
        <div className="space-y-3">
          {eventsLoaded && publicEvents.length === 0 && (
            <p className="text-sm text-muted-foreground">No public upcoming events yet.</p>
          )}
          {publicEvents.map((item) => (
            <div
              key={item.id}
              onClick={() => onNavigate('event-info', item.id)}
              className="flex cursor-pointer gap-3 rounded-xl bg-card p-3 transition hover:bg-card/80"
            >
              <div className="text-3xl">🎊</div>
              <div className="flex-1">
                <div className="flex items-start justify-between">
                  <h4 className="font-semibold">{item.title}</h4>
                  <span className="rounded-full bg-primary/20 px-2 py-1 text-xs text-primary">
                    {formatEventDate(item.start_time)}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    🎫 ₦{Number(item.starting_price ?? 0).toLocaleString()}
                  </p>
                  <EventStatusBadge event={item} remaining={listingRemaining(item)} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Updates Section */}
      <div className="px-4">
        <h3 className="mb-4 text-lg font-bold">Campaign Updates</h3>
        <div className="relative h-48 overflow-hidden rounded-xl bg-gradient-to-r from-primary to-primary/60 p-4">
          <div className="absolute inset-0 flex items-center justify-center opacity-20">
            <div className="text-6xl">🎉</div>
          </div>
          <div className="relative space-y-2">
            <h4 className="text-xl font-bold">Celebrate Better</h4>
            <p className="text-sm opacity-90">Send ɃU to events - Receive ceremonial notes for spraying</p>
            <div className="flex gap-2 pt-2">
              <span className="rounded-full bg-primary-foreground/30 px-3 py-1 text-xs">
                💚 Digital
              </span>
              <span className="rounded-full bg-primary-foreground/30 px-3 py-1 text-xs">
                📱 Mobile
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
