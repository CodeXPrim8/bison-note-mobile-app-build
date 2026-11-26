'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Dashboard from '@/components/dashboard'
import Navigation from '@/components/navigation'
import ModeSwitcher from '@/components/mode-switcher'
import { AccountProvider, useAccount } from '@/components/account-store'
import RequireEmailGate from '@/components/require-email-gate'
import { BuLoader } from '@/components/bu-loader'
import { BiometricAppGate } from '@/components/biometric-app-gate'

const pageFallback = <BuLoader compact />

const Profile = dynamic(() => import('@/components/profile'), { loading: () => pageFallback })
const Notifications = dynamic(() => import('@/components/notifications'), { loading: () => pageFallback })
const Wallet = dynamic(() => import('@/components/wallet'), { loading: () => pageFallback })
const Spraying = dynamic(() => import('@/components/spraying'), { loading: () => pageFallback })
const Redemption = dynamic(() => import('@/components/redemption'), { loading: () => pageFallback })
const VendorDashboard = dynamic(() => import('@/components/vendor-dashboard'), { loading: () => pageFallback })
const VendorPOS = dynamic(() => import('@/components/vendor-pos'), { loading: () => pageFallback })
const QRScanner = dynamic(() => import('@/components/qr-scanner'), { loading: () => pageFallback })
const CelebrantDashboard = dynamic(() => import('@/components/celebrant-dashboard'), { loading: () => pageFallback })
const BuyBU = dynamic(() => import('@/components/buy-bu'), { loading: () => pageFallback })
const BuyAirtimeData = dynamic(() => import('@/components/buy-airtime-data'), { loading: () => pageFallback })
const History = dynamic(() => import('@/components/history'), { loading: () => pageFallback })
const Invites = dynamic(() => import('@/components/invites'), { loading: () => pageFallback })
const EventsTickets = dynamic(() => import('@/components/events-tickets'), { loading: () => pageFallback })
const SendBU = dynamic(() => import('@/components/send-bu'), { loading: () => pageFallback })
const ReceiveBU = dynamic(() => import('@/components/receive-bu'), { loading: () => pageFallback })
const PosPay = dynamic(() => import('@/components/pos-pay'), { loading: () => pageFallback })
const EventInfo = dynamic(() => import('@/components/event-info'), { loading: () => pageFallback })
const MyTickets = dynamic(() => import('@/components/my-tickets'), { loading: () => pageFallback })
const Refer = dynamic(() => import('@/components/refer'), { loading: () => pageFallback })
const BucksCard = dynamic(() => import('@/components/bucks-card'), { loading: () => pageFallback })
const ReferCampaignPopup = dynamic(() => import('@/components/refer-campaign-popup'), { loading: () => null })

function ticketIdFromPageData(pageData: unknown) {
  if (pageData && typeof pageData === 'object' && 'ticketId' in pageData) {
    return String((pageData as { ticketId?: string }).ticketId ?? '') || undefined
  }
  return undefined
}

function profileViewFromPageData(pageData: unknown) {
  if (!pageData || typeof pageData !== 'object' || !('view' in pageData)) return undefined
  const view = (pageData as { view?: string }).view
  if (
    view === 'settings' ||
    view === 'appearance' ||
    view === 'pnd' ||
    view === 'support' ||
    view === 'support-chat' ||
    view === 'menu'
  ) {
    return view
  }
  return undefined
}

function intentFromPageData(pageData: unknown): 'tip' | undefined {
  if (!pageData || typeof pageData !== 'object' || !('intent' in pageData)) return undefined
  return (pageData as { intent?: string }).intent === 'tip' ? 'tip' : undefined
}

function eventPosFromPageData(pageData: unknown): { eventId?: string; eventTitle?: string } {
  if (!pageData || typeof pageData !== 'object') return {}
  const data = pageData as { eventId?: string; eventTitle?: string }
  const eventId = data.eventId ? String(data.eventId) : undefined
  const eventTitle = data.eventTitle ? String(data.eventTitle) : undefined
  return { eventId, eventTitle }
}

export default function MobileApp() {
  return (
    <AccountProvider>
      <RequireEmailGate>
        <MobileAppShell />
      </RequireEmailGate>
    </AccountProvider>
  )
}

function MobileAppShell() {
  const { canCelebrant, canVendor } = useAccount()
  const [currentPage, setCurrentPage] = useState('dashboard')
  const [pageData, setPageData] = useState<unknown>(null)
  const [theme, setTheme] = useState('theme-pink')
  const [mode, setMode] = useState<'user' | 'celebrant' | 'vendor'>('user')
  const [mounted, setMounted] = useState(false)
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    if (mode === 'celebrant' && !canCelebrant) {
      setMode('user')
      setCurrentPage('dashboard')
    } else if (mode === 'vendor' && !canVendor) {
      setMode('user')
      setCurrentPage('dashboard')
    }
  }, [mode, canCelebrant, canVendor])

  const handleNavigate = (page: string, data?: unknown) => {
    // User home already covers wallet tools; drop the separate Wallet page.
    if (mode === 'user' && page === 'wallet') {
      setCurrentPage('dashboard')
      setPageData(null)
      return
    }
    // Bottom-nav / hero POS opens business till — clear any Event POS context.
    if (mode === 'vendor' && page === 'wallet' && data == null) {
      setCurrentPage('wallet')
      setPageData(null)
      return
    }
    setCurrentPage(page)
    setPageData(data ?? null)
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

    // Lite boot endpoint skips role resolution for a faster first paint.
    const boot = fetch('/api/me?boot=1', { credentials: 'include', cache: 'no-store' })
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

    // Never leave users staring at the splash longer than needed.
    const maxWait = window.setTimeout(() => setMounted(true), 2200)
    void boot.finally(() => window.clearTimeout(maxWait))
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
    } else if (
      page === 'buy-bu' ||
      page === 'redemption' ||
      page === 'history' ||
      page === 'send-bu' ||
      page === 'pos-pay' ||
      page === 'refer'
    ) {
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
    return <BuLoader label="Opening your wallet…" />
  }

  if (!allowed) {
    return (
      <div className="relative">
        <BuLoader label="Could not reach Ƀucks" />
        <div className="pointer-events-none absolute inset-x-0 bottom-16 z-[2] flex justify-center px-4">
          <button
            type="button"
            className="pointer-events-auto rounded-full bg-gradient-to-r from-[#2f7bff] to-[#8b5cf6] px-5 py-2.5 text-sm font-bold text-white"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
        </div>
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
              : currentPage === 'airtime'
                ? 'Airtime'
                : currentPage === 'data'
                  ? 'Data'
              : currentPage === 'send-bu'
                ? 'Send ɃU'
              : currentPage === 'pos-pay'
                ? 'Pay POS'
              : currentPage === 'receive-bu'
                ? 'Receive ɃU'
                : currentPage === 'history'
                  ? 'History'
                  : currentPage === 'refer'
                    ? 'Refer & earn'
                  : currentPage

  const guestChrome = true
  const hideTopBar = currentPage === 'dashboard'

  return (
    <BiometricAppGate>
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
                  <ModeSwitcher
                    currentMode={mode}
                    onModeChange={setMode}
                    canCelebrant={canCelebrant}
                    canVendor={canVendor}
                  />
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
              {currentPage === 'airtime' && (
                <BuyAirtimeData kind="airtime" onBack={() => handleNavigate('dashboard')} />
              )}
              {currentPage === 'data' && (
                <BuyAirtimeData kind="data" onBack={() => handleNavigate('dashboard')} />
              )}
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
              {currentPage === 'send-bu' && (
                <SendBU
                  key={`send-${intentFromPageData(pageData) || 'menu'}`}
                  initialIntent={intentFromPageData(pageData)}
                  onNavigate={handleNavigate}
                />
              )}
              {currentPage === 'pos-pay' && (
                <PosPay onBack={() => handleNavigate('dashboard')} />
              )}
              {currentPage === 'receive-bu' && (
                <ReceiveBU key={`receive-${intentFromPageData(pageData) || 'menu'}`} initialIntent={intentFromPageData(pageData)} />
              )}
              {currentPage === 'refer' && <Refer />}
              {currentPage === 'bucks-card' && (
                <BucksCard onBack={() => handleNavigate('dashboard')} />
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
              {currentPage === 'wallet' && (
                <VendorPOS
                  key={`pos-${eventPosFromPageData(pageData).eventId || 'business'}`}
                  eventId={eventPosFromPageData(pageData).eventId}
                  eventTitle={eventPosFromPageData(pageData).eventTitle}
                  onBack={
                    eventPosFromPageData(pageData).eventId
                      ? () => handleNavigate('dashboard')
                      : undefined
                  }
                />
              )}
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

        <Navigation
          currentPage={currentPage}
          onNavigate={handleNavigate}
          mode={mode}
          tipFlow={
            (currentPage === 'send-bu' || currentPage === 'receive-bu') &&
            intentFromPageData(pageData) === 'tip'
          }
        />
        <ReferCampaignPopup onOpenRefer={() => handleNavigate('refer')} />
      </div>
    </div>
    </BiometricAppGate>
  )
}
