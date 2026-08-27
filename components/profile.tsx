'use client'

import { useEffect, useState } from 'react'
import { displayBuId } from '@/lib/phone'

interface ProfileProps {
  onNavigate?: (page: string) => void
}

export default function Profile({ onNavigate }: ProfileProps) {
  const [name, setName] = useState('Guest')
  const [initials, setInitials] = useState('ɃU')
  const [signedIn, setSignedIn] = useState(false)
  const [buId, setBuId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/me')
      .then(async (res) => {
        const json = await res.json()
        const profile = json.data?.profile
        if (json.status && json.data?.user) {
          setSignedIn(true)
          const display = profile?.display_name || json.data.user.email || 'ɃU member'
          setName(display)
          setInitials(display.slice(0, 2).toUpperCase())
          if (profile?.phone_e164) setBuId(displayBuId(profile.phone_e164))
        }
      })
      .catch(() => undefined)
  }, [])
  return (
    <div className="space-y-6 pb-24">
      {/* Profile Header */}
      <div className="space-y-4 bg-gradient-to-b from-primary to-primary/80 px-4 py-8 text-primary-foreground">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-foreground/20">
            <span className="text-2xl font-bold">{initials}</span>
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold">{name}</h2>
            {buId && <p className="text-sm opacity-90">ɃU ID {buId}</p>}
            {!signedIn && (
              <a href="/login?next=/app" className="mt-1 inline-block text-sm font-semibold underline">
                Sign in to sync tickets
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Feature Grid */}
      <div className="px-4">
        <div className="grid grid-cols-2 gap-4">
          {[
            {
              icon: '🎫',
              title: 'My Tickets',
              desc: 'QR codes and check-in backups',
              action: 'tickets',
            },
            {
              icon: '🎊',
              title: 'Upcoming events',
              desc: 'Same events as the website',
              action: 'events',
            },
            {
              icon: '📋',
              title: 'Transaction History',
              desc: 'View all your transactions',
              action: 'history',
            },
            {
              icon: '💳',
              title: 'My Accounts',
              desc: 'Account details, statement, e.t.c.',
            },
            {
              icon: '📱',
              title: 'Contactless Pay',
              desc: 'Setup your account for contactless pay',
            },
            {
              icon: '🎨',
              title: 'Customization',
              desc: 'Theme, dashboard customization, e.t.c.',
            },
            {
              icon: '⚙️',
              title: 'Settings',
              desc: 'Password, PIN, Security questions',
            },
            {
              icon: '🔐',
              title: 'Request PND',
              desc: 'Post no debit restriction',
            },
          ].map((item, idx) => (
            <button
              key={idx}
              onClick={() => item.action && onNavigate && onNavigate(item.action)}
              className="rounded-xl bg-card p-4 text-left transition hover:bg-card/80"
            >
              <div className="mb-3 text-3xl">{item.icon}</div>
              <h3 className="font-bold">{item.title}</h3>
              <p className="text-xs text-muted-foreground">{item.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Logout Button */}
      <div className="px-4">
        <a
          href="/organizer"
          className="mb-3 block w-full rounded-xl bg-card p-4 text-left transition hover:bg-card/80"
        >
          <div className="mb-3 text-3xl">📣</div>
          <h3 className="font-bold">Organiser tools</h3>
          <p className="text-xs text-muted-foreground">Create events, sales, and check-in — same as the website</p>
        </a>
        <button
          onClick={async () => {
            if (!signedIn) {
              window.location.href = '/login?next=/app'
              return
            }
            await fetch('/api/auth/logout', { method: 'POST' })
            window.location.href = '/login'
          }}
          className="w-full rounded-xl border-2 border-primary py-3 font-bold text-primary transition hover:bg-primary/10"
        >
          {signedIn ? 'Log Out' : 'Sign In'}
        </button>
      </div>
    </div>
  )
}
