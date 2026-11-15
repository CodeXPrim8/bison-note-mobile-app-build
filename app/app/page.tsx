'use client'

import { useState, useEffect } from 'react'
import Dashboard from '@/components/dashboard'
import Profile from '@/components/profile'
import Notifications from '@/components/notifications'
import Wallet from '@/components/wallet'
import Spraying from '@/components/spraying'
import Redemption from '@/components/redemption'
import VendorDashboard from '@/components/vendor-dashboard'
import VendorPOS from '@/components/vendor-pos'
import QRScanner from '@/components/qr-scanner'
import Navigation from '@/components/navigation'
import ModeSwitcher from '@/components/mode-switcher'
import CelebrantDashboard from '@/components/celebrant-dashboard'
import BuyBU from '@/components/buy-bu'
import History from '@/components/history'
import Invites from '@/components/invites'
import EventsTickets from '@/components/events-tickets'
import SendBU from '@/components/send-bu'
import ReceiveBU from '@/components/receive-bu'
import EventInfo from '@/components/event-info'
import MyTickets from '@/components/my-tickets'
import { AccountProvider } from '@/components/account-store'

function ticketIdFromPageData(pageData: unknown) {
  if (pageData && typeof pageData === 'object' && 'ticketId' in pageData) {
    return String((pageData as { ticketId?: string }).ticketId ?? '') || undefined
  }
  return undefined
}

function profileViewFromPageData(pageData: unknown) {
  if (!pageData || typeof pageData !== 'object' || !('view' in pageData)) return undefined
  const view = (pageData as { view?: string }).view
  if (view === 'settings' || view === 'appearance' || view === 'pnd' || view === 'menu') return view
  return undefined
}

function intentFromPageData(pageData: unknown): 'tip' | undefined {
  if (!pageData || typeof pageData !== 'object' || !('intent' in pageData)) return undefined
  return (pageData as { intent?: string }).intent === 'tip' ? 'tip' : undefined
}

export default function MobileApp() {
  return (
    <AccountProvider>
      <MobileAppShell />
    </AccountProvider>
  )
}

function MobileAppShell() {
  const [currentPage, setCurrentPage] = useState('dashboard')
  const [pageData, setPageData] = useState<unknown>(null)
  const [theme, setTheme] = useState('theme-pink')
  const [mode, setMode] = useState<'user' | 'celebrant' | 'vendor'>('user')
  const [mounted, setMounted] = useState(false)
  const [allowed, setAllowed] = useState(false)

  const handleNavigate = (page: string, data?: unknown) => {
    // User home already covers wallet tools; drop the separate Wallet page.
    if (mode === 'user' && page === 'wallet') {
      setCurrentPage('dashboard')
      setPageData(null)
      return
    }
    setCurrentPage(page)
    setPageData(data)
  }

  useEffect(() => {
    const savedTheme = localStorage.getItem('bison-theme') || 'theme-pink'
    setTheme(savedTheme)
    document.documentElement.className = savedTheme
    document.documentElement.style.backgroundColor = '#ffffff'
    document.body.style.backgroundColor = '#ffffff'

    // Paint immediately when we already know this device has a session snapshot.
    try {
      const raw = sessionStorage.getItem('bu_account_snapshot_v2')
      if (raw) {
        const parsed = JSON.parse(raw) as { userId?: string }
        if (parsed?.userId) {
          setAllowed(true)
          setMounted(true)
        }
      }
    } catch {
      // Ignore private-mode storage failures.
    }

    fetch('/api/me', { credentials: 'include', cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json()
        if (json.status && json.data?.user) {
          setAllowed(true)
          setMounted(true)
          return
        }
        if (json.status && !json.data?.user) {
          const next = `${window.location.pathname}${window.location.search}`
          window.location.replace(`/login?next=${encodeURIComponent(next.startsWith('/app') ? next : '/app')}`)
          return
        }
        setMounted(true)
      })
      .catch(() => {
        setMounted(true)
      })
  }, [])

  useEffect(() => {
    if (!allowed) return
    const query = new URLSearchParams(window.location.search)
    const page = query.get('page')
    const ticketId = query.get('id')
    const event = query.get('event')
    if (page === 'tickets') {
      setCurrentPage('tickets')
      if (ticketId) setPageData({ ticketId })
    } else if (page === 'events') {
      setCurrentPage('events')
    } else if ((page === 'event-info' || page === 'event') && event) {
      setCurrentPage('event-info')
      setPageData(event)
    } else if (page === 'buy-bu' || page === 'redemption' || page === 'history' || page === 'send-bu') {
      setCurrentPage(page)
    } else if (page === 'wallet') {
      setCurrentPage(mode === 'user' ? 'dashboard' : 'wallet')
    }
  }, [allowed])

  useEffect(() => {
    if (mounted) {
      localStorage.setItem('bison-theme', theme)
      document.documentElement.className = theme
      document.documentElement.style.backgroundColor = '#ffffff'
      document.body.style.backgroundColor = '#ffffff'
    }
  }, [theme, mounted])

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Checking your ɃU account…
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-center text-sm text-muted-foreground">
        Could not reach ɃU. Keep this tab open and try again in a moment.
      </div>
    )
  }

  const title =
    currentPage === 'dashboard' && mode === 'user'
      ? 'Celebrate'
      : currentPage === 'dashboard' && mode === 'celebrant'
        ? 'Celebrant'
        : currentPage === 'dashboard' && mode === 'vendor'
          ? 'Vendor'
          : currentPage === 'tickets'
            ? 'Tickets'
            : currentPage === 'buy-bu'
              ? 'Buy ɃU'
              : currentPage === 'send-bu'
                ? 'Send ɃU'
              : currentPage === 'receive-bu'
                ? 'Receive ɃU'
                : currentPage === 'history'
                  ? 'History'
                  : currentPage

  const guestChrome = true
  const hideTopBar = currentPage === 'dashboard'

  return (
    <div className={guestChrome ? 'bu-user-shell min-h-screen' : `${theme} min-h-screen bg-background text-foreground`}>
      <div className="mx-auto max-w-md">
        {!hideTopBar && (
        <div className="sticky top-0 z-40 flex items-center justify-center border-b border-white/70 bg-white/55 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,1)] backdrop-blur-2xl">
          <h1 className="text-lg font-bold capitalize text-neutral-950">{title}</h1>
        </div>
        )}

        <div>
          {mode === 'user' ? (
            <>
              <div hidden={currentPage !== 'dashboard'}>
                <Dashboard onNavigate={handleNavigate} />
                <div className="px-4 pb-28">
                  <ModeSwitcher currentMode={mode} onModeChange={setMode} />
                </div>
              </div>
              {currentPage === 'spraying' && <Spraying onNavigate={handleNavigate} />}
              {currentPage === 'redemption' && <Redemption />}
              {currentPage === 'profile' && (
                <Profile
                  onNavigate={handleNavigate}
                  theme={theme}
                  onThemeChange={setTheme}
                  initialView={profileViewFromPageData(pageData)}
                />
              )}
              {currentPage === 'notifications' && <Notifications />}
              {currentPage === 'buy-bu' && <BuyBU />}
              {currentPage === 'history' && <History />}
              {currentPage === 'invites' && <Invites onNavigate={handleNavigate} />}
              {currentPage === 'tickets' && (
                <MyTickets onNavigate={handleNavigate} ticketId={ticketIdFromPageData(pageData)} />
              )}
              {currentPage === 'events' && (
                <EventsTickets onNavigate={handleNavigate} initialData={pageData as { action?: string; eventId?: string }} />
              )}
              {currentPage === 'event-info' && (
                <EventInfo eventId={typeof pageData === 'string' ? pageData : undefined} onNavigate={handleNavigate} />
              )}
              {currentPage === 'send-bu' && <SendBU key={`send-${intentFromPageData(pageData) || 'menu'}`} initialIntent={intentFromPageData(pageData)} />}
              {currentPage === 'receive-bu' && (
                <ReceiveBU key={`receive-${intentFromPageData(pageData) || 'menu'}`} initialIntent={intentFromPageData(pageData)} />
              )}
            </>
          ) : mode === 'celebrant' ? (
            <>
              <div hidden={currentPage !== 'dashboard'}>
                <CelebrantDashboard
                  onNavigate={handleNavigate}
                  onModeChange={setMode}
                  currentMode={mode}
                />
              </div>
              {currentPage === 'wallet' && <Wallet onNavigate={handleNavigate} />}
              {currentPage === 'redemption' && <Redemption />}
              {currentPage === 'history' && <History />}
              {currentPage === 'receive-bu' && (
                <ReceiveBU key={`receive-${intentFromPageData(pageData) || 'menu'}`} initialIntent={intentFromPageData(pageData)} />
              )}
              {currentPage === 'tickets' && (
                <MyTickets onNavigate={handleNavigate} ticketId={ticketIdFromPageData(pageData)} />
              )}
              {currentPage === 'events' && (
                <EventsTickets onNavigate={handleNavigate} initialData={pageData as { action?: string; eventId?: string }} />
              )}
              {currentPage === 'event-info' && (
                <EventInfo eventId={typeof pageData === 'string' ? pageData : undefined} onNavigate={handleNavigate} />
              )}
              {currentPage === 'invites' && <Invites onNavigate={handleNavigate} />}
              {currentPage === 'profile' && (
                <Profile
                  onNavigate={handleNavigate}
                  theme={theme}
                  onThemeChange={setTheme}
                  initialView={profileViewFromPageData(pageData)}
                />
              )}
            </>
          ) : (
            <>
              <div hidden={currentPage !== 'dashboard'}>
                <VendorDashboard
                  onNavigate={handleNavigate}
                  onModeChange={setMode}
                  currentMode={mode}
                />
              </div>
              {currentPage === 'wallet' && <VendorPOS />}
              {currentPage === 'spraying' && <QRScanner />}
              {currentPage === 'history' && <History />}
              {currentPage === 'profile' && (
                <Profile
                  onNavigate={handleNavigate}
                  theme={theme}
                  onThemeChange={setTheme}
                  initialView={profileViewFromPageData(pageData)}
                />
              )}
            </>
          )}
        </div>

        <Navigation currentPage={currentPage} onNavigate={handleNavigate} mode={mode} />
      </div>
    </div>
  )
}
