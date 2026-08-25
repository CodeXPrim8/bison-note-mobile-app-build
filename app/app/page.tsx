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
import ThemeSelector from '@/components/theme-selector'
import CelebrantDashboard from '@/components/celebrant-dashboard'
import BuyBU from '@/components/buy-bu'
import History from '@/components/history'
import Invites from '@/components/invites'
import EventsTickets from '@/components/events-tickets'
import SendBU from '@/components/send-bu'
import ReceiveBU from '@/components/receive-bu'
import EventInfo from '@/components/event-info'
import MyTickets from '@/components/my-tickets'

export default function MobileApp() {
  const [currentPage, setCurrentPage] = useState('dashboard')
  const [pageData, setPageData] = useState<unknown>(null)
  const [theme, setTheme] = useState('theme-pink')
  const [mode, setMode] = useState<'user' | 'celebrant' | 'vendor'>('user')
  const [mounted, setMounted] = useState(false)
  const [allowed, setAllowed] = useState(false)

  const handleNavigate = (page: string, data?: unknown) => {
    setCurrentPage(page)
    setPageData(data)
  }

  useEffect(() => {
    const savedTheme = localStorage.getItem('bison-theme') || 'theme-pink'
    setTheme(savedTheme)
    document.documentElement.className = savedTheme

    fetch('/api/me', { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        if (json.status && json.data?.user) {
          setAllowed(true)
          setMounted(true)
          return
        }
        if (json.status && !json.data?.user) {
          window.location.replace('/login?next=/app')
          return
        }
        setMounted(true)
      })
      .catch(() => {
        setMounted(true)
      })
  }, [])

  useEffect(() => {
    if (mounted) {
      localStorage.setItem('bison-theme', theme)
      document.documentElement.className = theme
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
            : currentPage

  return (
    <div className={`${theme} min-h-screen bg-background text-foreground`}>
      <div className="mx-auto max-w-md">
        <div className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
          {currentPage !== 'dashboard' ? (
            <button
              onClick={() => setCurrentPage('dashboard')}
              className="text-xl text-foreground transition hover:text-primary"
            >
              ←
            </button>
          ) : (
            <a href="/" className="text-xs font-semibold text-primary">
              ɃU
            </a>
          )}
          <h1 className="text-lg font-bold capitalize text-primary">{title}</h1>
          <ThemeSelector theme={theme} onThemeChange={setTheme} />
        </div>

        {currentPage === 'dashboard' && <ModeSwitcher currentMode={mode} onModeChange={setMode} />}

        <div>
          {mode === 'user' ? (
            <>
              {currentPage === 'dashboard' && <Dashboard onNavigate={handleNavigate} />}
              {currentPage === 'wallet' && <Wallet onNavigate={handleNavigate} />}
              {currentPage === 'spraying' && <Spraying />}
              {currentPage === 'redemption' && <Redemption />}
              {currentPage === 'profile' && <Profile onNavigate={handleNavigate} />}
              {currentPage === 'notifications' && <Notifications />}
              {currentPage === 'buy-bu' && <BuyBU />}
              {currentPage === 'history' && <History />}
              {currentPage === 'invites' && <Invites />}
              {currentPage === 'tickets' && <MyTickets onNavigate={handleNavigate} />}
              {currentPage === 'events' && (
                <EventsTickets onNavigate={handleNavigate} initialData={pageData as { action?: string; eventId?: string }} />
              )}
              {currentPage === 'event-info' && (
                <EventInfo eventId={typeof pageData === 'string' ? pageData : undefined} onNavigate={handleNavigate} />
              )}
              {currentPage === 'send-bu' && <SendBU />}
              {currentPage === 'receive-bu' && <ReceiveBU />}
            </>
          ) : mode === 'celebrant' ? (
            <>
              {currentPage === 'dashboard' && <CelebrantDashboard />}
              {currentPage === 'wallet' && <Wallet onNavigate={handleNavigate} />}
              {currentPage === 'redemption' && <Redemption />}
              {currentPage === 'tickets' && <MyTickets onNavigate={handleNavigate} />}
              {currentPage === 'profile' && <Profile onNavigate={handleNavigate} />}
            </>
          ) : (
            <>
              {currentPage === 'dashboard' && <VendorDashboard />}
              {currentPage === 'wallet' && <VendorPOS />}
              {currentPage === 'spraying' && <QRScanner />}
              {currentPage === 'profile' && <Profile onNavigate={handleNavigate} />}
            </>
          )}
        </div>

        <Navigation currentPage={currentPage} onNavigate={handleNavigate} mode={mode} />
      </div>
    </div>
  )
}
