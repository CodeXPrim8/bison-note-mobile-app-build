'use client'

import { useEffect, useState } from 'react'
import { displayBuId } from '@/lib/phone'
import ThemeSelector from '@/components/theme-selector'
import { useAccount } from '@/components/account-store'

type MenuView = 'menu' | 'appearance' | 'settings' | 'pnd'

interface ProfileProps {
  onNavigate: (page: string) => void
  theme: string
  onThemeChange: (theme: string) => void
  initialView?: MenuView
}

export default function Profile({ onNavigate, theme, onThemeChange, initialView }: ProfileProps) {
  const { displayName } = useAccount()
  const [name, setName] = useState(displayName)
  const [initials, setInitials] = useState(displayName ? displayName.slice(0, 2).toUpperCase() : 'ɃU')
  const [signedIn, setSignedIn] = useState(Boolean(displayName))
  const [buId, setBuId] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [emailDraft, setEmailDraft] = useState('')
  const [settingsBusy, setSettingsBusy] = useState(false)
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null)
  const [settingsError, setSettingsError] = useState(false)
  const [view, setView] = useState<MenuView>(initialView ?? 'menu')

  useEffect(() => {
    if (!displayName) return
    setName(displayName)
    setInitials(displayName.slice(0, 2).toUpperCase())
    setSignedIn(true)
  }, [displayName])

  useEffect(() => {
    fetch('/api/me', { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        const profile = json.data?.profile
        if (json.status && json.data?.user) {
          setSignedIn(true)
          const display = profile?.display_name || json.data.user.email || 'ɃU member'
          setName(display)
          setInitials(display.slice(0, 2).toUpperCase())
          const contact = json.data.profile?.email ?? json.data.user.email ?? null
          setEmail(contact)
          setEmailDraft(contact ?? '')
          if (profile?.phone_e164) setBuId(displayBuId(profile.phone_e164))
        }
      })
      .catch(() => undefined)
  }, [])

  async function patchEmail(next: string | null) {
    setSettingsBusy(true)
    setSettingsMessage(null)
    setSettingsError(false)
    try {
      const res = await fetch('/api/me', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: next ?? '' }),
      })
      const json = await res.json()
      setSettingsBusy(false)
      if (!json.status) {
        setSettingsError(true)
        setSettingsMessage(json.message ?? 'Could not update email')
        return
      }
      const saved = (json.data?.profile?.email as string | null | undefined) ?? next
      setEmail(saved || null)
      setEmailDraft(saved || '')
      setSettingsMessage(json.message ?? 'Saved')
    } catch {
      setSettingsBusy(false)
      setSettingsError(true)
      setSettingsMessage('Could not reach ɃU.')
    }
  }

  async function saveEmail() {
    const value = emailDraft.trim()
    if (!value) {
      setSettingsError(true)
      setSettingsMessage('Enter an email, or tap Remove email.')
      return
    }
    await patchEmail(value)
  }

  async function removeEmail() {
    await patchEmail(null)
  }

  const items: Array<{
    icon: string
    title: string
    desc: string
    onClick: () => void
  }> = [
    {
      icon: '🎫',
      title: 'My Tickets',
      desc: 'QR codes and check-in backups',
      onClick: () => onNavigate('tickets'),
    },
    {
      icon: '🎊',
      title: 'Upcoming events',
      desc: 'Same events as the website',
      onClick: () => onNavigate('events'),
    },
    {
      icon: '📋',
      title: 'Transaction History',
      desc: 'View all your transactions',
      onClick: () => onNavigate('history'),
    },
    {
      icon: '💳',
      title: 'My Accounts',
      desc: 'Account details, statement, e.t.c.',
      onClick: () => onNavigate('wallet'),
    },
    {
      icon: '📱',
      title: 'Contactless Pay',
      desc: 'Setup your account for contactless pay',
      onClick: () => onNavigate('receive-bu'),
    },
    {
      icon: '🎨',
      title: 'Customization',
      desc: 'Theme, dashboard customization, e.t.c.',
      onClick: () => setView('appearance'),
    },
    {
      icon: '⚙️',
      title: 'Settings',
      desc: 'Email, PIN, account details',
      onClick: () => setView('settings'),
    },
    {
      icon: '🔐',
      title: 'Request PND',
      desc: 'Post no debit restriction',
      onClick: () => setView('pnd'),
    },
  ]

  return (
    <div className="relative z-10 space-y-6 pb-24">
      <div className="space-y-4 bg-gradient-to-b from-primary to-primary/80 px-4 py-8 text-primary-foreground">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-foreground/20">
            <span className="text-2xl font-bold">{initials}</span>
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold">{name || '\u00a0'}</h2>
            {buId && <p className="text-sm opacity-90">ɃU ID {buId}</p>}
            {!signedIn && (
              <a href="/login?next=/app" className="mt-1 inline-block text-sm font-semibold underline">
                Sign in to sync tickets
              </a>
            )}
          </div>
        </div>
      </div>

      {view !== 'menu' && (
        <div className="px-4">
          <button
            type="button"
            onClick={() => setView('menu')}
            className="w-full cursor-pointer rounded-xl border border-border px-4 py-3 text-sm font-semibold transition hover:bg-card"
          >
            ← Back to menu
          </button>
        </div>
      )}

      {view === 'menu' && (
        <>
          <div className="px-4">
            <div className="grid grid-cols-2 gap-4">
              {items.map((item) => (
                <button
                  key={item.title}
                  type="button"
                  onClick={item.onClick}
                  className="cursor-pointer rounded-xl bg-card p-4 text-left transition hover:bg-card/80 active:scale-[0.98]"
                >
                  <div className="mb-3 text-3xl">{item.icon}</div>
                  <h3 className="font-bold">{item.title}</h3>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="px-4">
            <a
              href="/organizer"
              className="mb-3 block w-full cursor-pointer rounded-xl bg-card p-4 text-left transition hover:bg-card/80 active:scale-[0.98]"
            >
              <div className="mb-3 text-3xl">📣</div>
              <h3 className="font-bold">Organiser tools</h3>
              <p className="text-xs text-muted-foreground">Create events, sales, and check-in — same as the website</p>
            </a>
            <button
              type="button"
              onClick={async () => {
                if (!signedIn) {
                  window.location.href = '/login?next=/app'
                  return
                }
                await fetch('/api/auth/logout', { method: 'POST' })
                window.location.href = '/login'
              }}
              className="w-full cursor-pointer rounded-xl border-2 border-primary py-3 font-bold text-primary transition hover:bg-primary/10"
            >
              {signedIn ? 'Log Out' : 'Sign In'}
            </button>
          </div>
        </>
      )}

      {view === 'appearance' && (
        <div className="space-y-4 px-4">
          <div className="rounded-xl bg-card p-4">
            <h3 className="font-bold">Customization</h3>
            <p className="mt-1 text-sm text-muted-foreground">Tap the circle to cycle the app colour.</p>
            <div className="mt-4 flex items-center gap-3">
              <ThemeSelector theme={theme} onThemeChange={onThemeChange} />
              <p className="text-sm text-muted-foreground">Current theme</p>
            </div>
          </div>
        </div>
      )}

      {view === 'settings' && (
        <div className="space-y-4 px-4">
          <div className="rounded-xl bg-card p-4 space-y-3">
            <h3 className="font-bold">Settings</h3>
            <div>
              <p className="text-xs text-muted-foreground">Name</p>
              <p className="font-semibold">{name}</p>
            </div>
            {buId && (
              <div>
                <p className="text-xs text-muted-foreground">ɃU ID</p>
                <p className="font-mono font-semibold">{buId}</p>
              </div>
            )}
            <div>
              <label className="text-xs text-muted-foreground" htmlFor="account-email">
                Email
              </label>
              <input
                id="account-email"
                type="email"
                value={emailDraft}
                onChange={(e) => setEmailDraft(e.target.value)}
                placeholder="Add an email for receipts and Paystack"
                className="mt-1 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Used for ticket receipts and Fund Wallet. Sign-in stays your ɃU ID and PIN.
              </p>
            </div>
            {settingsMessage && (
              <p className={`text-sm ${settingsError ? 'text-destructive' : 'text-muted-foreground'}`}>
                {settingsMessage}
              </p>
            )}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={settingsBusy}
                onClick={() => void saveEmail()}
                className="w-full cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {settingsBusy ? 'Saving…' : email ? 'Save email' : 'Add email'}
              </button>
              {email && (
                <button
                  type="button"
                  disabled={settingsBusy}
                  onClick={() => void removeEmail()}
                  className="w-full cursor-pointer rounded-lg border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  Remove email
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {view === 'pnd' && (
        <div className="px-4">
          <div className="rounded-xl bg-card p-4 space-y-2">
            <h3 className="font-bold">Request PND</h3>
            <p className="text-sm text-muted-foreground">
              Post-no-debit is a bank restriction on a naira account. ɃU cannot place PND on your wallet from this app.
            </p>
            <p className="text-sm text-muted-foreground">
              To freeze a bank account, contact your bank. To stop ɃU spending, do not share your receive QR and keep your PIN private.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
