import Link from 'next/link'
import { SiteFooter, SiteHeader } from '@/components/web/site-chrome'
import { BU_SUPPORT_EMAIL } from '@/lib/brand'

export const metadata = {
  title: 'Delete account · Bucks',
  description: 'Request deletion of your Bucks account and associated data.',
}

export default function DeleteAccountPage() {
  return (
    <div className="bu-site min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-12 text-white/90">
        <p className="bu-site-kicker">Account</p>
        <h1 className="bu-site-h2 mt-2">Delete your Bucks account</h1>
        <p className="bu-site-copy mt-3">
          You can request that we delete your Bucks account and associated personal data. This page
          explains how.
        </p>

        <section className="mt-10 space-y-3">
          <h2 className="text-xl font-semibold text-white">How to request deletion</h2>
          <ol className="bu-site-copy list-decimal space-y-2 pl-5">
            <li>
              Email{' '}
              <a className="underline" href={`mailto:${BU_SUPPORT_EMAIL}?subject=Delete%20my%20Bucks%20account`}>
                {BU_SUPPORT_EMAIL}
              </a>{' '}
              from the email linked to your Bucks account.
            </li>
            <li>Use the subject line: <strong>Delete my Bucks account</strong>.</li>
            <li>
              Include your Bucks ID or registered phone number so we can find the correct account.
            </li>
          </ol>
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-xl font-semibold text-white">What gets deleted</h2>
          <p className="bu-site-copy">
            When your request is approved, we delete or anonymize account profile data and remove
            access to the app. Some transaction records may be kept where required by law, fraud
            prevention, or accounting rules.
          </p>
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-xl font-semibold text-white">How long it takes</h2>
          <p className="bu-site-copy">
            We aim to process deletion requests within 30 days of verifying account ownership. We may
            contact you if we need more information.
          </p>
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-xl font-semibold text-white">Before you delete</h2>
          <ul className="bu-site-copy list-disc space-y-2 pl-5">
            <li>Withdraw or spend any remaining wallet balance if possible.</li>
            <li>Download any tickets or receipts you still need.</li>
            <li>Cancel ongoing organizer or merchant activity tied to the account.</li>
          </ul>
        </section>

        <p className="bu-site-copy mt-10">
          Questions:{' '}
          <a className="underline" href={`mailto:${BU_SUPPORT_EMAIL}`}>
            {BU_SUPPORT_EMAIL}
          </a>
        </p>
        <p className="bu-site-copy mt-4">
          <Link href="/privacy" className="underline">
            Privacy Policy
          </Link>
          {' · '}
          <Link href="/" className="underline">
            Back to Bucks
          </Link>
        </p>
      </main>
      <SiteFooter />
    </div>
  )
}
