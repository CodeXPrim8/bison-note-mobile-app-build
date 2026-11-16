import Link from 'next/link'
import { SiteFooter, SiteHeader } from '@/components/web/site-chrome'
import { PublicEventsGrid } from '@/components/web/public-events-grid'
import { AdSlot } from '@/components/web/ad-slot'
import { FloatingVouchers } from '@/components/web/floating-vouchers'
import {
  IconEvents,
  IconGateway,
  IconGift,
  IconQrGate,
  IconSend,
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
        <FloatingVouchers />
        <div className="bu-site-hero-copy">
          <p className="bu-site-brand">Ƀucks</p>
          <h1 className="bu-site-headline">The digital voucher that moves with you.</h1>
          <p className="bu-site-lede">
            1 ɃU = ₦1. Gift it. Send it. Sell tickets. Take payments. Redeem anytime.
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
        <h2 className="bu-site-h2">Celebration money — anytime.</h2>
        <p className="bu-site-copy">
          Ƀucks is a digital voucher, not a bank. Fund with any bank, gift or send ɃU, spray when the moment hits, send
          to bank whenever you want.
        </p>
        <div className="bu-site-rail bu-site-rail-4">
          <div className="bu-site-rail-item bu-site-reveal">
            <span className="bu-site-icon bu-site-icon-cyber">
              <IconWallet className="h-7 w-7" />
            </span>
            <h3>Fund</h3>
            <p>Top up with any bank. Your ɃU balance updates when the transfer lands.</p>
          </div>
          <div className="bu-site-rail-item bu-site-reveal" style={{ animationDelay: '0.08s' }}>
            <span className="bu-site-icon bu-site-icon-magenta">
              <IconGift className="h-7 w-7" />
            </span>
            <h3>Gift</h3>
            <p>Send ɃU by phone or ɃU ID — seamless peer gifts and tips, no bank details shared.</p>
          </div>
          <div className="bu-site-rail-item bu-site-reveal" style={{ animationDelay: '0.16s' }}>
            <span className="bu-site-icon bu-site-icon-cyan">
              <IconSend className="h-7 w-7" />
            </span>
            <h3>Move</h3>
            <p>Peer sends, celebrant tips, live spray — money that matches the energy of the room.</p>
          </div>
          <div className="bu-site-rail-item bu-site-reveal" style={{ animationDelay: '0.24s' }}>
            <span className="bu-site-icon bu-site-icon-purple">
              <IconWallet className="h-7 w-7" />
            </span>
            <h3>Redeem</h3>
            <p>Cash out to your bank when you are ready — morning, noon, or after the party.</p>
          </div>
        </div>
      </section>

      <section className="bu-site-band">
        <div className="bu-site-section !py-16">
          <p className="bu-site-kicker">Tickets</p>
          <h2 className="bu-site-h2">Create events. Sell tickets. Check in.</h2>
          <p className="bu-site-copy">
            Organisers publish listings or private invites. Guests pay on Ƀucks, get a QR pass, and staff scan at the
            gate — weddings, concerts, shows, parties, and everything in between.
          </p>
          <div className="bu-site-rail mt-10">
            <div className="bu-site-rail-item bu-site-reveal">
              <span className="bu-site-icon bu-site-icon-purple">
                <IconEvents className="h-7 w-7" />
              </span>
              <h3>Publish</h3>
              <p>Set ticket types, go live in minutes. Public calendar or invite-only.</p>
            </div>
            <div className="bu-site-rail-item bu-site-reveal" style={{ animationDelay: '0.1s' }}>
              <span className="bu-site-icon bu-site-icon-cyber">
                <IconTicket className="h-7 w-7" />
              </span>
              <h3>Sell</h3>
              <p>Checkout on Ƀucks, or keep your own site and deliver tickets through Gateway.</p>
            </div>
            <div className="bu-site-rail-item bu-site-reveal" style={{ animationDelay: '0.2s' }}>
              <span className="bu-site-icon bu-site-icon-cyan">
                <IconQrGate className="h-7 w-7" />
              </span>
              <h3>Check in</h3>
              <p>Valid, used, or refunded — decided server-side the moment staff scan.</p>
            </div>
          </div>
          <div className="mt-8">
            <Link href="/organizer/events/create" className="bu-site-btn bu-site-btn-ghost">
              Create an event
            </Link>
          </div>
        </div>
      </section>

      <section className="bu-site-section">
        <p className="bu-site-kicker">Payment gateway</p>
        <h2 className="bu-site-h2">A gateway for your own checkout.</h2>
        <p className="bu-site-copy">
          Sell tickets and collect on your own site — guests pay through Ƀucks, tickets stay in Ƀucks.
        </p>
        <div className="bu-site-gateway-row bu-site-reveal">
          <span className="bu-site-icon bu-site-icon-cyber">
            <IconGateway className="h-7 w-7" />
          </span>
          <div>
            <h3 className="bu-site-display text-xl font-bold tracking-tight text-white">Built for developers</h3>
            <p className="bu-site-copy !mt-2">
              Plug Ƀucks Gateway into your website and keep your brand front and centre.
            </p>
            <Link href="/gateway" className="mt-4 inline-flex text-sm font-bold text-[color:var(--bu-cyan)] hover:underline">
              Explore Gateway →
            </Link>
          </div>
        </div>
      </section>

      <section className="bu-site-section bu-site-events !pt-2">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="bu-site-kicker">Upcoming</p>
            <h2 className="bu-site-h2">On the calendar</h2>
          </div>
          <Link href="/events" className="text-sm font-bold text-[color:var(--bu-cyan)] hover:underline">
            View all
          </Link>
        </div>
        <PublicEventsGrid limit={6} />
      </section>

      <section className="bu-site-section !pt-2">
        <p className="bu-site-kicker">Flow</p>
        <h2 className="bu-site-h2">How Ƀucks works</h2>
        <div className="bu-site-steps">
          <div className="bu-site-step">
            <h3>Fund</h3>
            <p>Top up ɃU whenever you need it.</p>
          </div>
          <div className="bu-site-step">
            <h3>Gift &amp; go</h3>
            <p>Send to a phone, buy a ticket, or open an invite. QR ready in the app.</p>
          </div>
          <div className="bu-site-step">
            <h3>Celebrate</h3>
            <p>Spray, tip, and gift — digital money that feels personal.</p>
          </div>
          <div className="bu-site-step">
            <h3>Redeem</h3>
            <p>Cash out to your bank anytime you are ready.</p>
          </div>
        </div>
      </section>

      <section className="bu-site-finale">
        <div className="bu-site-finale-inner">
          <p className="bu-site-display text-3xl font-bold tracking-tight text-white md:text-4xl">Ƀucks</p>
          <p className="mt-3 max-w-lg text-base text-white/75">
            Physical Bison Notes stay ceremonial. The digital voucher is what you gift, spend, and redeem — open Ƀucks
            and move.
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
