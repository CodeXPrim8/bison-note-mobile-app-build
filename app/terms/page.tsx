import Link from 'next/link'
import { SiteFooter, SiteHeader } from '@/components/web/site-chrome'
import { BU_SUPPORT_EMAIL } from '@/lib/brand'

export const metadata = {
  title: 'Terms of Service · Bucks',
  description: 'Terms of Service for the Bucks app and website.',
}

export default function TermsOfServicePage() {
  return (
    <div className="bu-site min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-12 text-white/90">
        <p className="bu-site-kicker">Legal</p>
        <h1 className="bu-site-h2 mt-2">Terms of Service</h1>
        <p className="bu-site-copy mt-3">
          These Terms of Service (“Terms”) govern your use of the Bucks mobile app and website. By
          creating an account or using Bucks, you agree to these Terms. Last updated: 27 November 2026.
        </p>

        <section className="mt-10 space-y-3">
          <h2 className="text-xl font-semibold text-white">The service</h2>
          <p className="bu-site-copy">
            Bucks provides digital voucher, wallet, ticket, and related payment features. Some features
            may require identity checks, a funded balance, or approval before use.
          </p>
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-xl font-semibold text-white">Accounts</h2>
          <ul className="bu-site-copy list-disc space-y-2 pl-5">
            <li>You must provide accurate information and keep your login details safe.</li>
            <li>You are responsible for activity on your account.</li>
            <li>We may suspend or close accounts that break these Terms, look fraudulent, or create risk.</li>
          </ul>
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-xl font-semibold text-white">Payments and balances</h2>
          <ul className="bu-site-copy list-disc space-y-2 pl-5">
            <li>Top-ups, transfers, withdrawals, tickets, and POS payments are processed through Bucks and payment partners.</li>
            <li>Fees may apply. Fee details are shown in the app before you confirm a transaction when applicable.</li>
            <li>Transactions may be delayed, reversed, or declined for security, compliance, or partner reasons.</li>
            <li>You should only send money to people and merchants you trust.</li>
          </ul>
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-xl font-semibold text-white">Acceptable use</h2>
          <p className="bu-site-copy">
            Do not use Bucks for illegal activity, fraud, money laundering, abuse of promotions, or
            attempts to harm other users or the service. We may investigate and take action when we
            detect misuse.
          </p>
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-xl font-semibold text-white">Privacy</h2>
          <p className="bu-site-copy">
            How we handle personal data is explained in our{' '}
            <Link href="/privacy" className="underline">
              Privacy Policy
            </Link>
            .
          </p>
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-xl font-semibold text-white">Availability</h2>
          <p className="bu-site-copy">
            We work to keep Bucks available, but we do not guarantee uninterrupted service. Features
            may change, and maintenance or outages can happen.
          </p>
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-xl font-semibold text-white">Limitation of liability</h2>
          <p className="bu-site-copy">
            To the fullest extent allowed by law, Bucks is not liable for indirect losses, lost profits,
            or losses caused by unauthorized access to your device, incorrect recipient details, or
            events outside our reasonable control.
          </p>
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-xl font-semibold text-white">Changes</h2>
          <p className="bu-site-copy">
            We may update these Terms. Continued use of Bucks after changes means you accept the
            updated Terms.
          </p>
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-xl font-semibold text-white">Contact</h2>
          <p className="bu-site-copy">
            Questions:{' '}
            <a className="underline" href={`mailto:${BU_SUPPORT_EMAIL}`}>
              {BU_SUPPORT_EMAIL}
            </a>
          </p>
          <p className="bu-site-copy">
            <Link href="/privacy" className="underline">
              Privacy Policy
            </Link>
            {' · '}
            <Link href="/delete-account" className="underline">
              Delete account
            </Link>
            {' · '}
            <Link href="/" className="underline">
              Back to Bucks
            </Link>
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
