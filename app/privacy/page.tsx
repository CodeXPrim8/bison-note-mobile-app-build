import Link from 'next/link'
import { SiteFooter, SiteHeader } from '@/components/web/site-chrome'
import { BU_SUPPORT_EMAIL } from '@/lib/brand'

export const metadata = {
  title: 'Privacy Policy · Bucks',
  description: 'How Bucks collects, uses, and shares information in the Bucks app and website.',
}

export default function PrivacyPolicyPage() {
  return (
    <div className="bu-site min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-12 text-white/90">
        <p className="bu-site-kicker">Legal</p>
        <h1 className="bu-site-h2 mt-2">Privacy Policy</h1>
        <p className="bu-site-copy mt-3">
          This Privacy Policy explains how Bucks (“we”, “us”) handles information when you use the Bucks
          mobile app and website. Last updated: 27 November 2026.
        </p>

        <section className="mt-10 space-y-3">
          <h2 className="text-xl font-semibold text-white">Who we are</h2>
          <p className="bu-site-copy">
            Bucks is a digital voucher and payments product operated for users in Nigeria and other
            supported regions. Contact:{' '}
            <a className="underline" href={`mailto:${BU_SUPPORT_EMAIL}`}>
              {BU_SUPPORT_EMAIL}
            </a>
            .
          </p>
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-xl font-semibold text-white">Information we collect</h2>
          <ul className="bu-site-copy list-disc space-y-2 pl-5">
            <li>Account details such as name, email, phone number, and Bucks ID.</li>
            <li>Security data such as PIN hashes and optional biometric unlock preference on your device.</li>
            <li>Wallet and transaction data, including top-ups, transfers, withdrawals, tickets, and POS sales.</li>
            <li>Payment details processed by our payment partners (for example Paystack). We do not store full card numbers on our servers.</li>
            <li>Device and usage data such as app version, crash logs, and basic diagnostics needed to keep the service working.</li>
            <li>Support messages you send to us.</li>
          </ul>
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-xl font-semibold text-white">How we use information</h2>
          <ul className="bu-site-copy list-disc space-y-2 pl-5">
            <li>To create and secure your account.</li>
            <li>To process payments, vouchers, tickets, withdrawals, and related services.</li>
            <li>To prevent fraud, abuse, and unauthorized access.</li>
            <li>To provide customer support and important service notices.</li>
            <li>To improve app performance and reliability.</li>
            <li>To meet legal and regulatory obligations.</li>
          </ul>
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-xl font-semibold text-white">How we share information</h2>
          <p className="bu-site-copy">
            We share information only when needed to run the service: payment processors, hosting and
            infrastructure providers, fraud-prevention tools, and when required by law. We do not sell
            your personal information.
          </p>
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-xl font-semibold text-white">Data retention and security</h2>
          <p className="bu-site-copy">
            We keep account and transaction records for as long as needed to provide the service and
            meet legal requirements. We use industry-standard safeguards, but no method of transmission
            or storage is 100% secure.
          </p>
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-xl font-semibold text-white">Your choices</h2>
          <p className="bu-site-copy">
            You can update profile details in the app, turn biometric unlock on or off on your device,
            and contact support to ask about access, correction, or deletion where applicable by law.
          </p>
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-xl font-semibold text-white">Children</h2>
          <p className="bu-site-copy">
            Bucks is not directed at children under 13. If you believe a child provided us personal
            information, contact us and we will take appropriate steps.
          </p>
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-xl font-semibold text-white">Changes</h2>
          <p className="bu-site-copy">
            We may update this policy from time to time. The updated version will be posted on this
            page with a new “Last updated” date.
          </p>
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-xl font-semibold text-white">Contact</h2>
          <p className="bu-site-copy">
            Questions about privacy:{' '}
            <a className="underline" href={`mailto:${BU_SUPPORT_EMAIL}`}>
              {BU_SUPPORT_EMAIL}
            </a>
          </p>
          <p className="bu-site-copy">
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
