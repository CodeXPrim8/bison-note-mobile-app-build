import Link from 'next/link'
import { SiteFooter, SiteHeader } from '@/components/web/site-chrome'
import { PublicEventsGrid } from '@/components/web/public-events-grid'
import { AdSlot } from '@/components/web/ad-slot'
import {
  IconEvents,
  IconQrGate,
  IconSend,
  IconSpray,
  IconTicket,
  IconWallet,
} from '@/components/web/bu-icons'

export default function WebsiteHome() {
  return (
    <div className="bu-site min-h-screen">
      <SiteHeader />

      <section className="bu-site-hero">
        <div className="bu-site-hero-plane" aria-hidden>
          <span>Ƀ</span>
        </div>
        <div className="bu-site-hero-copy">
          <p className="bu-site-brand">Ƀucks</p>
          <h1 className="bu-site-headline">The digital voucher for the night.</h1>
          <p className="bu-site-lede">
            1 ɃU = ₦1. Fund it, send it, spray it at the party, buy tickets, redeem to bank — celebration money that
            moves.
          </p>
          <div className="bu-site-cta-row">
            <Link href="/app" className="bu-site-btn bu-site-btn-primary">
              Open Ƀucks
            </Link>
            <Link href="/events" className="bu-site-btn bu-site-btn-ghost">
              Explore events
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 pt-8">
        <AdSlot slot="web_home" />
      </div>

      <section className="bu-site-section">
        <p className="bu-site-kicker">Digital voucher</p>
        <h2 className="bu-site-h2">1 ɃU = ₦1. Your phone is your ID.</h2>
        <p className="bu-site-copy">
          Ƀucks is a digital voucher, not a bank app. Bank-transfer in, send to any ɃU ID, spray at the event, redeem
          to bank — built for the dance floor.
        </p>
        <div className="bu-site-rail">
          <div className="bu-site-rail-item">
            <span className="bu-site-icon bu-site-icon-cyber">
              <IconWallet className="h-7 w-7" />
            </span>
            <h3>Fund</h3>
            <p>Paystack dedicated account. Transfer any amount; we credit the moment it confirms.</p>
          </div>
          <div className="bu-site-rail-item">
            <span className="bu-site-icon bu-site-icon-cyan">
              <IconSend className="h-7 w-7" />
            </span>
            <h3>Send</h3>
            <p>Move ɃU by phone number. Tips and peer sends without sharing bank details.</p>
          </div>
          <div className="bu-site-rail-item">
            <span className="bu-site-icon bu-site-icon-magenta">
              <IconSpray className="h-7 w-7" />
            </span>
            <h3>Spray</h3>
            <p>Live celebration spray and QR tips — digital money that feels like the night.</p>
          </div>
        </div>
      </section>

      <section className="bu-site-band">
        <div className="bu-site-section !py-16">
          <p className="bu-site-kicker">Events</p>
          <h2 className="bu-site-h2">Tickets that open the door.</h2>
          <p className="bu-site-copy">
            Public listings or private invites. Guests pay, get a QR, and you scan at the gate.
          </p>
          <div className="bu-site-rail mt-10">
            <div className="bu-site-rail-item">
              <span className="bu-site-icon bu-site-icon-purple">
                <IconEvents className="h-7 w-7" />
              </span>
              <h3>Publish</h3>
              <p>Weddings, concerts, club nights — set ticket types and go live in minutes.</p>
            </div>
            <div className="bu-site-rail-item">
              <span className="bu-site-icon bu-site-icon-cyber">
                <IconTicket className="h-7 w-7" />
              </span>
              <h3>Sell</h3>
              <p>Checkout on Ƀucks or keep your site and use Gateway for delivery.</p>
            </div>
            <div className="bu-site-rail-item">
              <span className="bu-site-icon bu-site-icon-cyan">
                <IconQrGate className="h-7 w-7" />
              </span>
              <h3>Check in</h3>
              <p>Valid, used, or refunded — decided server-side when staff scan.</p>
            </div>
          </div>
          <div className="mt-8">
            <Link href="/organizer/events/create" className="bu-site-btn bu-site-btn-ghost">
              Create an event
            </Link>
          </div>
        </div>
      </section>

      <section className="bu-site-section bu-site-events">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="bu-site-kicker">Upcoming</p>
            <h2 className="bu-site-h2">Nights on the calendar</h2>
          </div>
          <Link href="/events" className="text-sm font-bold text-[color:var(--bu-cyan)] hover:underline">
            View all
          </Link>
        </div>
        <PublicEventsGrid limit={6} />
      </section>

      <section className="bu-site-section !pt-2">
        <p className="bu-site-kicker">Flow</p>
        <h2 className="bu-site-h2">How a night runs on Ƀucks</h2>
        <div className="bu-site-steps">
          <div className="bu-site-step">
            <h3>Fund</h3>
            <p>Top up ɃU by bank transfer or card before you head out.</p>
          </div>
          <div className="bu-site-step">
            <h3>Show up</h3>
            <p>Buy a ticket or open your invite. QR is ready in the app.</p>
          </div>
          <div className="bu-site-step">
            <h3>Celebrate</h3>
            <p>Spray, tip, and send — money that matches the energy.</p>
          </div>
          <div className="bu-site-step">
            <h3>Redeem</h3>
            <p>Cash out to your bank when the night is done.</p>
          </div>
        </div>
      </section>

      <section className="bu-site-finale">
        <div className="bu-site-finale-inner">
          <p className="bu-site-display text-3xl font-bold tracking-tight text-white md:text-4xl">Ƀucks</p>
          <p className="mt-3 max-w-lg text-base text-white/75">
            Physical Bison Notes stay ceremonial. The digital voucher is what you spend — open Ƀucks and move.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/app" className="bu-site-btn bu-site-btn-primary">
              Open Ƀucks
            </Link>
            <Link href="/gateway" className="bu-site-btn bu-site-btn-ghost">
              Developer Gateway
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  )
}
