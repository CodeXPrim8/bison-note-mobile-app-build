'use client'

import { useEffect, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  CalendarDays,
  CreditCard,
  Gift,
  History,
  LifeBuoy,
  Lock,
  Megaphone,
  MessageCircle,
  Nfc,
  Palette,
  Radio,
  ScanFace,
  Settings,
  Sparkles,
  Ticket,
  WalletCards,
} from 'lucide-react'
import { displayBuId } from '@/lib/phone'
import ThemeSelector from '@/components/theme-selector'
import SupportChat from '@/components/support-chat'
import { useAccount } from '@/components/account-store'
import { clearAccountSnapshots } from '@/lib/session-snapshot'
import {
  clearBiometricCredentials,
  getBiometricAvailability,
  isFaceUnlockPreferred,
  saveBiometricCredentials,
  type BiometricAvailability,
} from '@/lib/auth/biometric'
import { PinPadModal } from '@/components/pin-pad-modal'

type MenuView = 'menu' | 'appearance' | 'settings' | 'pnd' | 'coming-soon' | 'support' | 'support-chat'

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
  const [phoneRaw, setPhoneRaw] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [emailDraft, setEmailDraft] = useState('')
  const [settingsBusy, setSettingsBusy] = useState(false)
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null)
  const [settingsError, setSettingsError] = useState(false)
  const [view, setView] = useState<MenuView>(initialView ?? 'menu')
  const [faceEnabled, setFaceEnabled] = useState(false)
  const [faceAvail, setFaceAvail] = useState<BiometricAvailability | null>(null)
  const [faceBusy, setFaceBusy] = useState(false)
  const [facePinOpen, setFacePinOpen] = useState(false)
  const [facePinError, setFacePinError] = useState<string | null>(null)

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
          if (profile?.phone_e164) {
            setBuId(displayBuId(profile.phone_e164))
            setPhoneRaw(String(profile.phone_e164))
            try {
              window.sessionStorage.setItem('bu_login_phone', String(profile.phone_e164))
            } catch {
              // ignore
            }
          }
        }
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    setFaceEnabled(isFaceUnlockPreferred())
    void getBiometricAvailability().then(setFaceAvail)
  }, [view])

  async function saveEmail() {
    const value = emailDraft.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setSettingsError(true)
      setSettingsMessage('Every ɃU account needs a real email. Enter yours to continue.')
      return
    }
    setSettingsBusy(true)
    setSettingsMessage(null)
    setSettingsError(false)
    try {
      const res = await fetch('/api/me', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value }),
      })
      const json = await res.json()
      setSettingsBusy(false)
      if (!json.status) {
        setSettingsError(true)
        setSettingsMessage(json.message ?? 'Could not update email')
        return
      }
      const saved = (json.data?.profile?.email as string | null | undefined) ?? value
      setEmail(saved || null)
      setEmailDraft(saved || '')
      setSettingsMessage(json.message ?? 'Email saved')
    } catch {
      setSettingsBusy(false)
      setSettingsError(true)
      setSettingsMessage('Could not reach ɃU.')
    }
  }

  const items: Array<{
    Icon: LucideIcon
    title: string
    desc: string
    onClick: () => void
  }> = [
    {
      Icon: Ticket,
      title: 'My Tickets',
      desc: 'QR codes and check-in backups',
      onClick: () => onNavigate('tickets'),
    },
    {
      Icon: CalendarDays,
      title: 'Upcoming events',
      desc: 'Same events as the website',
      onClick: () => onNavigate('events'),
    },
    {
      Icon: History,
      title: 'Transaction History',
      desc: 'View all your transactions',
      onClick: () => onNavigate('history'),
    },
    {
      Icon: Gift,
      title: 'Refer & earn',
      desc: 'Invite friends · earn Ƀ1,000 after they fund/spend Ƀ3,000',
      onClick: () => onNavigate('refer'),
    },
    {
      Icon: Nfc,
      title: 'Ƀucks Card',
      desc: 'Tap to pay · NFC + EMV contactless',
      onClick: () => onNavigate('bucks-card'),
    },
    {
      Icon: Palette,
      title: 'Customization',
      desc: 'Theme, dashboard customization, e.t.c.',
      onClick: () => setView('appearance'),
    },
    {
      Icon: Settings,
      title: 'Settings',
      desc: 'Email, PIN, face unlock',
      onClick: () => setView('settings'),
    },
    {
      Icon: LifeBuoy,
      title: 'Support',
      desc: 'In-app chat with Ƀucks',
      onClick: () => setView('support'),
    },
    {
      Icon: Lock,
      title: 'Request PND',
      desc: 'Post no debit restriction',
      onClick: () => setView('pnd'),
    },
    {
      Icon: Sparkles,
      title: 'Coming soon',
      desc: 'Data & airtime, overdraft',
      onClick: () => setView('coming-soon'),
    },
  ]

  const comingSoonItems: Array<{
    Icon: LucideIcon
    title: string
    desc: string
    onClick?: () => void
  }> = [
    {
      Icon: Radio,
      title: 'Data and Airtime',
      desc: 'Buy data and airtime from your ɃU wallet',
    },
    {
      Icon: CreditCard,
      title: 'Card',
      desc: 'Physical contactless card for POS tap',
      onClick: () => onNavigate('bucks-card'),
    },
    {
      Icon: WalletCards,
      title: 'Overdraft',
      desc: 'Short-term wallet overdraft when you need it',
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
            onClick={() => setView(view === 'support-chat' ? 'support' : 'menu')}
            className="w-full cursor-pointer rounded-xl border border-border px-4 py-3 text-sm font-semibold transition hover:bg-card"
          >
            {view === 'support-chat' ? '← Back to support' : '← Back to menu'}
          </button>
        </div>
      )}

      {view === 'menu' && (
        <>
          <div className="px-4">
            <div className="grid grid-cols-2 gap-4">
              {items.map(({ Icon, title, desc, onClick }) => (
                <button
                  key={title}
                  type="button"
                  onClick={onClick}
                  className="bu-press bu-glass-soft cursor-pointer rounded-2xl p-4 text-left transition active:scale-[0.98]"
                >
                  <span className="bu-well-navy mb-3 flex h-11 w-11 items-center justify-center rounded-2xl">
                    <Icon className="h-5 w-5" strokeWidth={2.2} />
                  </span>
                  <h3 className="font-bold text-neutral-950">{title}</h3>
                  <p className="text-xs text-neutral-500">{desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="px-4">
            <a
              href="/organizer"
              className="bu-press bu-glass-soft mb-3 block w-full cursor-pointer rounded-2xl p-4 text-left transition active:scale-[0.98]"
            >
              <span className="bu-well-magenta mb-3 flex h-11 w-11 items-center justify-center rounded-2xl">
                <Megaphone className="h-5 w-5" strokeWidth={2.2} />
              </span>
              <h3 className="font-bold text-neutral-950">Organiser tools</h3>
              <p className="text-xs text-neutral-500">Create events, sales, and check-in — same as the website</p>
            </a>
            <button
              type="button"
              onClick={async () => {
                if (!signedIn) {
                  window.location.href = '/login?next=/app'
                  return
                }
                await fetch('/api/auth/logout', { method: 'POST' })
                // Keep face-unlock preference on device; only clear the unlocked session flag.
                try {
                  window.sessionStorage.removeItem('bu_face_session_unlocked')
                } catch {
                  // ignore
                }
                clearAccountSnapshots()
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
                placeholder="Email"
                className="mt-1 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
              />
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
            </div>
          </div>

          <div className="rounded-xl bg-card p-4 space-y-3">
            <div className="flex items-start gap-3">
              <span className="bu-well-navy flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl">
                <ScanFace className="h-5 w-5" strokeWidth={2.2} />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-bold">{faceAvail?.label || 'Face unlock'}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Unlock the app and confirm sends with your face. Your PIN always remains a backup.
                </p>
              </div>
            </div>
            {!faceAvail?.available ? (
              <p className="text-sm text-muted-foreground">
                {faceAvail?.reason || 'Face unlock needs the Bucks phone app with Face ID / face unlock enrolled.'}
              </p>
            ) : null}
            <button
              type="button"
              disabled={faceBusy || (!faceEnabled && !faceAvail?.available)}
              onClick={() => {
                if (faceEnabled) {
                  setFaceBusy(true)
                  void clearBiometricCredentials().finally(() => {
                    setFaceEnabled(false)
                    setFaceBusy(false)
                    setSettingsError(false)
                    setSettingsMessage(`${faceAvail?.label || 'Face unlock'} turned off. PIN still works.`)
                  })
                  return
                }
                setFacePinError(null)
                setFacePinOpen(true)
              }}
              className="w-full cursor-pointer rounded-lg border border-border px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              {faceBusy
                ? 'Working…'
                : faceEnabled
                  ? `Turn off ${faceAvail?.label || 'Face unlock'}`
                  : `Turn on ${faceAvail?.label || 'Face unlock'}`}
            </button>
          </div>

          <PinPadModal
            open={facePinOpen}
            title="Confirm your PIN"
            subtitle="Saved only on this phone, protected by face unlock."
            busy={faceBusy}
            error={facePinError}
            biometric={false}
            onClose={() => {
              if (!faceBusy) setFacePinOpen(false)
            }}
            onSubmit={async (pin) => {
              const stored = String(window.sessionStorage.getItem('bu_login_phone') || '').trim()
              const phone = (phoneRaw || stored || buId || '').trim()
              if (!phone) {
                setFacePinError('Could not find your ɃU ID. Sign in once more, then try again.')
                return
              }
              setFaceBusy(true)
              setFacePinError(null)
              const saved = await saveBiometricCredentials(phone, pin)
              setFaceBusy(false)
              if (!saved.ok) {
                setFacePinError(saved.message || 'Could not enable face unlock.')
                return
              }
              setFaceEnabled(true)
              setFacePinOpen(false)
              setSettingsError(false)
              setSettingsMessage(`${faceAvail?.label || 'Face unlock'} is on.`)
            }}
          />
        </div>
      )}

      {view === 'support' && (
        <div className="space-y-3 px-4">
          <div className="bu-glass-soft rounded-2xl p-4 space-y-2">
            <h3 className="font-bold">Support</h3>
            <p className="text-sm text-muted-foreground">
              Need help with your wallet, a bank send, or a ticket? Chat with Ƀucks Assist and the team here
              {buId ? ` · ɃU ID ${buId}` : ''}.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setView('support-chat')}
            className="bu-press bu-glass-soft flex w-full items-start gap-3 rounded-2xl p-4 text-left"
          >
            <span className="bu-well-navy flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl">
              <MessageCircle className="h-5 w-5" strokeWidth={2.2} />
            </span>
            <div className="min-w-0 flex-1">
              <h4 className="font-bold text-neutral-950">Chat</h4>
              <p className="mt-0.5 text-xs text-neutral-500">Message the Ƀucks team in the app</p>
            </div>
          </button>
        </div>
      )}

      {view === 'support-chat' && (
        <div className="px-4">
          <SupportChat />
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

      {view === 'coming-soon' && (
        <div className="space-y-3 px-4">
          <div className="bu-glass-soft rounded-2xl p-4">
            <h3 className="font-bold">Coming soon</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              These features are on the way. We’ll unlock them in your wallet when ready.
            </p>
          </div>
          {comingSoonItems.map(({ Icon, title, desc, onClick }) => {
            const row = (
              <>
                <span className="bu-well-navy flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl">
                  <Icon className="h-5 w-5" strokeWidth={2.2} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-neutral-950">{title}</h4>
                    <span className="rounded-full bg-neutral-950/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                      Soon
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-neutral-500">{desc}</p>
                </div>
              </>
            )
            if (onClick) {
              return (
                <button
                  key={title}
                  type="button"
                  onClick={onClick}
                  className="bu-press bu-glass-soft flex w-full items-start gap-3 rounded-2xl p-4 text-left"
                >
                  {row}
                </button>
              )
            }
            return (
              <div key={title} className="bu-glass-soft flex items-start gap-3 rounded-2xl p-4">
                {row}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
