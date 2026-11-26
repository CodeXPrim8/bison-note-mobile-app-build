'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AffiliateCapture } from '@/components/web/affiliate-capture'
import { AdSlot } from '@/components/web/ad-slot'
import { BucksBrandMark } from '@/components/season/brand-mark'
import { SeasonStrip } from '@/components/season/season-strip'
import { clearAccountSnapshots } from '@/lib/session-snapshot'

interface MeResponse {
  status: boolean
  data?: {
    user: { id: string; email?: string | null } | null
    profile: { display_name?: string | null } | null
    roles?: { is_affiliate?: boolean; is_organizer?: boolean } | null
  }
}

export function SiteHeader() {
  const [signedIn, setSignedIn] = useState(false)
  const [name, setName] = useState<string | null>(null)
  const [isAffiliate, setIsAffiliate] = useState(false)

  useEffect(() => {
    fetch('/api/me', { credentials: 'include' })
      .then(async (res) => {
        const json = (await res.json()) as MeResponse
        if (json.status && json.data?.user) {
          setSignedIn(true)
          setName(json.data.profile?.display_name ?? json.data.user.email ?? 'Account')
          setIsAffiliate(Boolean(json.data.roles?.is_affiliate))
        }
      })
      .catch(() => undefined)
  }, [])

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    clearAccountSnapshots()
    window.location.href = '/'
  }

  return (
    <header className="bu-site-header">
      <AffiliateCapture />
      <SeasonStrip />
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="bu-site-display text-lg font-bold tracking-tight text-white">
          <BucksBrandMark />
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-white/65 md:flex">
          <Link href="/events" className="transition-colors hover:text-white">
            Events
          </Link>
          <Link href="/organizer" className="transition-colors hover:text-white">
            Organisers
          </Link>
          <Link href="/affiliate" className="transition-colors hover:text-white">
            {isAffiliate ? 'Affiliate desk' : 'Affiliate'}
          </Link>
          <Link href="/gateway" className="transition-colors hover:text-white">
            Gateway
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          {signedIn ? (
            <>
              <span className="hidden max-w-[10rem] truncate text-sm text-white/55 sm:inline">{name}</span>
              <Link href="/app" className="bu-site-btn bu-site-btn-primary !px-3.5 !py-2 text-sm">
                Open Ƀucks
              </Link>
              <button
                type="button"
                onClick={logout}
                className="bu-site-btn bu-site-btn-ghost !px-3.5 !py-2 text-sm"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="hidden text-sm font-semibold text-white/70 sm:inline hover:text-white">
                Sign in
              </Link>
              <Link href="/login?next=/app" className="bu-site-btn bu-site-btn-primary !px-3.5 !py-2 text-sm">
                Open Ƀucks
              </Link>
            </>
          )}
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 pb-2">
        <AdSlot slot="web_header" />
      </div>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="bu-site-footer">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="bu-site-display text-2xl font-bold tracking-tight text-white">
            <BucksBrandMark />
          </p>
          <p className="mt-2 max-w-sm text-sm text-white/55">
            The digital voucher that moves with you — gift, send, sell tickets, take payments, redeem anytime. Coming to
            App Store and Google Play.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-white/55">
          <Link href="/events" className="hover:text-white">
            Events
          </Link>
          <Link href="/organizer/events/create" className="hover:text-white">
            Create event
          </Link>
          <Link href="/affiliate" className="hover:text-white">
            Affiliate
          </Link>
          <Link href="/gateway" className="hover:text-white">
            Gateway
          </Link>
          <Link href="/app" className="hover:text-white">
            App
          </Link>
        </div>
      </div>
    </footer>
  )
}
