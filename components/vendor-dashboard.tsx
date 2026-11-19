'use client'

import { useEffect, useState } from 'react'
import { CalendarDays, ShoppingBag } from 'lucide-react'
import VendorEvents from '@/components/vendor-events'
import { buFromNaira, formatBu, formatNairaPlain } from '@/lib/bu-rate'
import { useAccount } from '@/components/account-store'
import { bindAccountSnapshots, readSessionSnapshot, writeSessionSnapshot } from '@/lib/session-snapshot'
import {
  ModeHeroAction,
  ModeIconRow,
  ModeIconTile,
  ModeListRow,
  ModeWalletHero,
} from '@/components/mode-home-shell'
import ModeSwitcher from '@/components/mode-switcher'

interface VendorStats {
  totalSales: number
  activeSessions: number
  todayEarnings: number
}

const CACHE_KEY = 'bu_vendor_dashboard'

type VendorCache = {
  stats: VendorStats
}

const emptyStats: VendorStats = {
  totalSales: 0,
  activeSessions: 0,
  todayEarnings: 0,
}

export default function VendorDashboard({
  onNavigate,
  onModeChange,
  currentMode = 'vendor',
}: {
  onNavigate?: (page: string, data?: unknown) => void
  onModeChange?: (mode: 'user' | 'celebrant' | 'vendor') => void
  currentMode?: 'user' | 'celebrant' | 'vendor'
} = {}) {
  const { buBalance, nairaBalance, userId, balanceMotion, canCelebrant, canVendor } = useAccount()
  const [balanceVisible, setBalanceVisible] = useState(true)
  const [stats, setStats] = useState<VendorStats>(emptyStats)
  const [statsReady, setStatsReady] = useState(false)
  const [currentView, setCurrentView] = useState<'home' | 'events'>('home')

  useEffect(() => {
    bindAccountSnapshots(userId || null)
    if (!userId) {
      setStats(emptyStats)
      setStatsReady(false)
      return
    }
    const cached = readSessionSnapshot<VendorCache>(CACHE_KEY)
    const cache: VendorCache = {
      stats: cached?.stats ?? { ...emptyStats },
    }
    if (cached) {
      setStats(cache.stats)
      setStatsReady(true)
    }
    function persist(partial: Partial<VendorCache>) {
      if (partial.stats !== undefined) cache.stats = partial.stats
      writeSessionSnapshot(CACHE_KEY, cache)
    }

    Promise.all([
      fetch('/api/pos/vendors?mine=1', { credentials: 'include' }),
      fetch('/api/pos/sales', { credentials: 'include' }),
    ])
      .then(async ([linksRes, salesRes]) => {
        const linksJson = await linksRes.json()
        const salesJson = await salesRes.json()
        const links = linksJson.status
          ? ((linksJson.data?.links ?? []) as Array<{ event_id: string; status: string }>)
          : []
        const approved = links.filter((row) => row.status === 'approved')
        const posSales = salesJson.status
          ? ((salesJson.data?.sales ?? []) as Array<Record<string, unknown>>)
          : []
        const received = posSales.reduce((sum, sale) => sum + Number(sale.vendor_naira ?? 0), 0)
        const next = {
          totalSales: received,
          todayEarnings: received,
          activeSessions: approved.length,
        }
        setStats(next)
        persist({ stats: next })
        setStatsReady(true)
      })
      .catch(() => {
        setStatsReady(true)
      })
  }, [userId])

  return (
    <div className="space-y-6 bg-transparent pb-28 text-neutral-950">
      <ModeWalletHero
        title="Vendor"
        balanceValue={buBalance}
        balanceMotion={balanceMotion}
        balanceVisible={balanceVisible}
        onToggleBalance={() => setBalanceVisible((value) => !value)}
        subtitle={
          nairaBalance == null
            ? '\u00a0'
            : `≈ ₦${formatNairaPlain(nairaBalance)} · ${statsReady ? `${stats.activeSessions} linked` : '…'}`
        }
        actions={
          <>
            <ModeHeroAction label="POS" Icon={ShoppingBag} onClick={() => onNavigate?.('wallet')} />
            <ModeHeroAction label="Events" Icon={CalendarDays} onClick={() => setCurrentView('events')} />
          </>
        }
        footer={
          <div
            className="flex w-full items-center justify-between border-t border-white/10 px-5 py-3.5 text-left"
            style={{ background: 'rgba(7, 16, 31, 0.72)' }}
          >
            <div className="min-w-0 flex-1 flex items-center gap-2">
              <p className="truncate text-sm font-medium text-white/90">Vending commission</p>
              <p className="shrink-0 text-sm font-semibold tabular-nums bu-credit">
                {statsReady ? `Ƀ\u2009${formatBu(buFromNaira(stats.todayEarnings))}` : '…'}
              </p>
            </div>
          </div>
        }
      />

      <div className="bu-rise space-y-6 px-4" style={{ animationDelay: '80ms' }}>
        {onModeChange ? (
          <ModeSwitcher
            currentMode={currentMode}
            onModeChange={onModeChange}
            canCelebrant={canCelebrant}
            canVendor={canVendor}
          />
        ) : null}

        <ModeIconRow columns={2}>
          <ModeIconTile
            label="POS"
            Icon={ShoppingBag}
            onClick={() => onNavigate?.('wallet')}
            tone="cyber"
          />
          <ModeIconTile
            label="Events"
            Icon={CalendarDays}
            onClick={() => setCurrentView('events')}
            tone="purple"
          />
        </ModeIconRow>

        {currentView === 'home' && (
          <div className="space-y-2">
            <ModeListRow
              title="Vending commission"
              detail="Business POS + ceremonial cash"
              amount={statsReady ? `Ƀ\u2009${formatBu(buFromNaira(stats.totalSales))}` : '…'}
            />
            <ModeListRow
              title="Approved events"
              detail="Ready for ceremonial cash"
              amount={statsReady ? String(stats.activeSessions) : '…'}
            />
          </div>
        )}

        {currentView === 'events' && (
          <VendorEvents onBack={() => setCurrentView('home')} />
        )}
      </div>
    </div>
  )
}
