'use client'

import { Calendar, MapPin } from 'lucide-react'
import { formatEventDay, formatEventTime } from '@/lib/datetime'
import { eventVenueLabel } from '@/lib/events/event-details'
import { eventWelcomeLine, isCheckedInTicket } from '@/lib/events/sale'
import { formatNaira } from '@/lib/money'
import { publicTicketStatus } from '@/lib/types/database'
import type { EventRecord, TicketRecord, TicketTier } from '@/lib/types/database'

export type TicketPassTicket = TicketRecord & {
  event?: EventRecord | null
  tier?: TicketTier | null
  display_status?: string
}

function isPremiumTier(name?: string | null) {
  return /vvip|vip|table|platinum|gold|early/i.test(name ?? '')
}

function spacedCode(code?: string | null) {
  if (!code) return ''
  return code.replace(/\s+/g, '').split('').join(' ')
}

function statusLabel(ticket: TicketPassTicket) {
  if (isCheckedInTicket(ticket)) return 'CHECKED IN'
  return ticket.display_status ?? publicTicketStatus(ticket.status, ticket.event?.end_time)
}

function TicketNotch() {
  return (
    <div className="relative my-1 h-0">
      <div className="absolute -left-4 top-1/2 h-7 w-7 -translate-y-1/2 rounded-full bg-background shadow-[inset_-6px_0_8px_rgba(0,0,0,0.35)]" />
      <div className="absolute -right-4 top-1/2 h-7 w-7 -translate-y-1/2 rounded-full bg-background shadow-[inset_6px_0_8px_rgba(0,0,0,0.35)]" />
      <div className="border-t border-dashed border-white/20" />
    </div>
  )
}

export function TicketPass({
  ticket,
  qr,
  variant = 'list',
  onOpen,
}: {
  ticket: TicketPassTicket
  qr?: string
  variant?: 'mini' | 'list' | 'full'
  onOpen?: () => void
}) {
  const event = ticket.event
  const tierName = ticket.tier?.name || 'General'
  const premium = isPremiumTier(tierName)
  const admitted = isCheckedInTicket(ticket)
  const status = statusLabel(ticket)
  const venue = eventVenueLabel(event)
  const when = event?.start_time
    ? `${formatEventDay(event.start_time)}${formatEventTime(event.start_time) ? ` · ${formatEventTime(event.start_time)}` : ''}${event.end_time ? ` – ${formatEventTime(event.end_time)}` : ''}`
    : ''
  const cover = event?.cover_image_url
  const accent = premium ? 'from-amber-200/90 via-yellow-400/40 to-transparent' : 'from-primary/80 via-primary/25 to-transparent'
  const ring = premium ? 'ring-amber-300/50' : 'ring-primary/40'
  const pill = premium
    ? 'bg-amber-300 text-black'
    : admitted
      ? 'bg-emerald-400 text-black'
      : 'bg-primary text-primary-foreground'

  const body = (
    <article
      className={`relative overflow-hidden rounded-[1.35rem] bg-[#111] text-white shadow-[0_18px_50px_rgba(0,0,0,0.45)] ring-1 ${ring} ${
        variant === 'mini' ? '' : 'animate-[ticket-in_420ms_ease-out]'
      }`}
    >
      <div className={`relative overflow-hidden ${variant === 'mini' ? 'h-16' : variant === 'full' ? 'h-44' : 'h-32'}`}>
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className={`h-full w-full bg-gradient-to-br ${premium ? 'from-amber-900 via-stone-900 to-black' : 'from-primary/70 via-zinc-900 to-black'}`} />
        )}
        <div className={`absolute inset-0 bg-gradient-to-t ${accent}`} />
        <div className="absolute inset-0 bg-gradient-to-t from-[#111] via-[#111]/20 to-transparent" />
        {premium && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-70" style={{ animation: 'ticket-shimmer 3.6s ease-in-out infinite' }} />
          </div>
        )}
        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3">
          <p className="text-[10px] font-semibold tracking-[0.35em] text-white/80">ɃU</p>
          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-widest ${pill}`}>{status}</span>
        </div>
        {variant !== 'mini' && (
          <div className="absolute inset-x-0 bottom-0 px-4 pb-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/70">{tierName}</p>
            <h3 className="mt-0.5 text-xl font-bold uppercase leading-tight tracking-wide drop-shadow">{event?.title ?? 'Event ticket'}</h3>
          </div>
        )}
      </div>

      {variant !== 'mini' && <TicketNotch />}

      <div className={variant === 'mini' ? 'px-4 pb-3 pt-1' : 'px-4 pb-4 pt-1'}>
        {variant === 'mini' ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold uppercase">{event?.title ?? 'Event ticket'}</p>
              <p className="truncate text-xs text-white/60">{tierName}{when ? ` · ${when}` : ''}</p>
            </div>
            <span className="text-[10px] font-semibold tracking-widest text-white/50">OPEN</span>
          </div>
        ) : (
          <>
            <div className="grid gap-2 text-sm text-white/80">
              {when && (
                <p className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5 text-white/50" />
                  {when}
                </p>
              )}
              {venue && (
                <p className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 text-white/50" />
                  <span className="leading-snug">{venue}</span>
                </p>
              )}
            </div>

            {variant === 'full' && (
              <div className="mt-4">
                {admitted ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-8 text-center">
                    <p className="text-lg font-semibold">{eventWelcomeLine(event)}</p>
                    <p className="mt-2 text-sm text-white/60">This QR is closed so it cannot be used twice.</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className={`rounded-2xl bg-white p-3 shadow-[0_0_40px_rgba(255,255,255,0.12)] ${premium ? 'ring-2 ring-amber-300/70' : 'ring-2 ring-primary/50'}`}>
                      {qr ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={qr} alt="Ticket QR" className="h-52 w-52" />
                      ) : (
                        <div className="flex h-52 w-52 items-center justify-center bg-zinc-100 text-xs text-zinc-500">Preparing QR…</div>
                      )}
                    </div>
                    {ticket.checkin_code && (
                      <>
                        <p className="mt-4 font-mono text-2xl font-semibold tracking-[0.35em] text-white">{spacedCode(ticket.checkin_code)}</p>
                        <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-white/45">Backup check-in code</p>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 flex items-end justify-between gap-3 border-t border-white/10 pt-3 text-[11px] uppercase tracking-[0.16em] text-white/50">
              <div>
                <p>Guest</p>
                <p className="mt-0.5 text-sm font-medium normal-case tracking-normal text-white/90">{ticket.buyer_name || ticket.buyer_email || 'ɃU guest'}</p>
              </div>
              <div className="text-right">
                {ticket.amount_paid > 0 && <p className="normal-case tracking-normal text-white/80">{formatNaira(ticket.amount_paid)}</p>}
                {ticket.ticket_number && <p className="mt-0.5 font-mono tracking-wider">{ticket.ticket_number}</p>}
              </div>
            </div>
            {variant === 'list' && (
              <p className="mt-3 text-center text-[11px] font-medium tracking-[0.22em] text-white/40">TAP TO OPEN GATE PASS</p>
            )}
          </>
        )}
      </div>
    </article>
  )

  if (!onOpen) return body

  return (
    <button type="button" className="block w-full text-left" onClick={onOpen}>
      {body}
    </button>
  )
}
