'use client'

import { useEffect, useState } from 'react'
import { CalendarDays, History, Package, ShoppingBag } from 'lucide-react'
import Events from '@/components/events'
import { formatEventDateTime } from '@/lib/datetime'
import { buFromNaira, formatBu, formatNairaPlain } from '@/lib/bu-rate'
import { useAccount } from '@/components/account-store'
import { bindAccountSnapshots, readSessionSnapshot, writeSessionSnapshot } from '@/lib/session-snapshot'
import {
  ModeHeroAction,
  ModeIconRow,
  ModeIconTile,
  ModeListRow,
  ModeSegmented,
  ModeWalletHero,
} from '@/components/mode-home-shell'
import ModeSwitcher from '@/components/mode-switcher'

interface VendorStats {
  totalSales: number
  activeSessions: number
  totalBUInventory: number
  nairaAvailable: number
  todayEarnings: number
}

interface Sale {
  id: string
  amount: number
  buAmount: number
  timestamp: string
  eventName: string
  status: 'completed' | 'pending'
}

const CACHE_KEY = 'bu_vendor_dashboard'

type VendorCache = {
  stats: VendorStats
  sales: Sale[]
}

const emptyStats: VendorStats = {
  totalSales: 0,
  activeSessions: 0,
  totalBUInventory: 0,
  nairaAvailable: 0,
  todayEarnings: 0,
}

export default function VendorDashboard({
  onNavigate,
  onModeChange,
  currentMode = 'vendor',
}: {
  onNavigate?: (page: string) => void
  onModeChange?: (mode: 'user' | 'celebrant' | 'vendor') => void
  currentMode?: 'user' | 'celebrant' | 'vendor'
} = {}) {
  const { buBalance, nairaBalance, userId, balanceMotion } = useAccount()
  const [balanceVisible, setBalanceVisible] = useState(true)
  const [stats, setStats] = useState<VendorStats>(emptyStats)
  const [sales, setSales] = useState<Sale[]>([])
  const [statsReady, setStatsReady] = useState(false)
  const [currentView, setCurrentView] = useState<'overview' | 'sales' | 'inventory' | 'events'>('overview')

  useEffect(() => {
    bindAccountSnapshots(userId || null)
    if (!userId) {
      setStats(emptyStats)
      setSales([])
      setStatsReady(false)
      return
    }
    const cached = readSessionSnapshot<VendorCache>(CACHE_KEY)
    const cache: VendorCache = {
      stats: cached?.stats ?? { ...emptyStats },
      sales: cached?.sales ?? [],
    }
    if (cached) {
      setStats(cache.stats)
      setSales(cache.sales)
      setStatsReady(true)
    }
    function persist(partial: Partial<VendorCache>) {
      if (partial.stats !== undefined) cache.stats = partial.stats
      if (partial.sales !== undefined) cache.sales = partial.sales
      writeSessionSnapshot(CACHE_KEY, cache)
    }
    fetch('/api/events/mine', { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        if (!json.status) {
          setSales([])
          const next = { ...cache.stats, totalSales: 0, todayEarnings: 0, activeSessions: 0 }
          setStats(next)
          persist({ stats: next, sales: [] })
          setStatsReady(true)
          return
        }
        const list = (json.data ?? []) as Array<Record<string, unknown>>
        const received = list.reduce((sum, event) => sum + Number(event.spray_budget_bu ?? 0), 0)
        const nextSales = list.map((event) => ({
          id: String(event.id),
          amount: Number(event.spray_budget_bu ?? 0),
          buAmount: Number(event.spray_budget_bu ?? 0),
          timestamp: event.start_time ? formatEventDateTime(String(event.start_time)) : '',
          eventName: String(event.title ?? event.name ?? 'Event'),
          status: 'completed' as const,
        }))
        const next = {
          ...cache.stats,
          totalSales: received,
          todayEarnings: received,
          activeSessions: list.length,
        }
        setStats(next)
        setSales(nextSales)
        persist({ stats: next, sales: nextSales })
        setStatsReady(true)
      })
      .catch(() => {
        setSales([])
        persist({ sales: [] })
        setStatsReady(true)
      })
    fetch('/api/wallet?history=1&limit=12', { credentials: 'include', cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json()
        if (!json.status || !json.data?.wallet) return
        const next = {
          ...cache.stats,
          totalBUInventory: Number(json.data.wallet.bu_balance ?? 0),
          nairaAvailable: Number(json.data.wallet.naira_available ?? 0),
        }
        setStats(next)
        persist({ stats: next })
      })
      .catch(() => undefined)
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
            : `≈ ₦${formatNairaPlain(nairaBalance)} · ${statsReady ? `${stats.activeSessions} events` : '…'}`
        }
        actions={
          <>
            <ModeHeroAction label="POS" Icon={ShoppingBag} onClick={() => onNavigate?.('wallet')} />
            <ModeHeroAction label="Events" Icon={CalendarDays} onClick={() => setCurrentView('events')} />
            <ModeHeroAction label="Sales" Icon={History} onClick={() => setCurrentView('sales')} />
          </>
        }
        footer={
          <button
            type="button"
            onClick={() => setCurrentView('sales')}
            className="bu-press flex w-full items-center justify-between border-t border-white/10 px-5 py-3.5 text-left"
            style={{ background: 'rgba(7, 16, 31, 0.72)' }}
          >
            <div className="min-w-0 flex-1 flex items-center gap-2">
              <p className="truncate text-sm font-medium text-white/90">ɃU on events</p>
              <p className="shrink-0 text-sm font-semibold tabular-nums bu-credit">
                {statsReady ? `Ƀ\u2009${formatBu(buFromNaira(stats.todayEarnings))}` : '…'}
              </p>
            </div>
            <span className="text-xs font-medium text-white/55">Sales ›</span>
          </button>
        }
      />

      <div className="bu-rise space-y-6 px-4" style={{ animationDelay: '80ms' }}>
        <ModeIconRow columns={2}>
          <ModeIconTile label="POS" Icon={ShoppingBag} onClick={() => onNavigate?.('wallet')} tone="cyber" />
          <ModeIconTile label="Events" Icon={CalendarDays} onClick={() => setCurrentView('events')} tone="purple" />
          <ModeIconTile label="Sales" Icon={History} onClick={() => setCurrentView('sales')} />
          <ModeIconTile label="Inventory" Icon={Package} onClick={() => setCurrentView('inventory')} tone="light" />
        </ModeIconRow>

        {onModeChange ? <ModeSwitcher currentMode={currentMode} onModeChange={onModeChange} /> : null}

        <ModeSegmented
          value={currentView}
          onChange={(id) => setCurrentView(id as typeof currentView)}
          options={[
            { id: 'overview', label: 'Overview' },
            { id: 'sales', label: 'Sales' },
            { id: 'inventory', label: 'Stock' },
            { id: 'events', label: 'Events' },
          ]}
        />

        {currentView === 'overview' && (
          <div className="space-y-2">
            <ModeListRow
              title="Total ɃU received"
              detail="Across your events"
              amount={statsReady ? `Ƀ\u2009${formatBu(buFromNaira(stats.totalSales))}` : '…'}
            />
            <ModeListRow
              title="Wallet balance"
              detail="Live ɃU wallet"
              amount={buBalance == null ? '…' : `Ƀ\u2009${formatBu(buBalance)}`}
              amountTone="credit"
            />
            <ModeListRow
              title="Active events"
              detail="Sessions you manage"
              amount={statsReady ? String(stats.activeSessions) : '…'}
            />
          </div>
        )}

        {currentView === 'sales' && (
          <div className="space-y-2">
            {sales.length === 0 ? <p className="text-sm text-neutral-500">No event ɃU received yet.</p> : null}
            {sales.map((sale) => (
              <ModeListRow
                key={sale.id}
                title={sale.eventName}
                detail={sale.timestamp}
                amount={`Ƀ\u2009${formatBu(buFromNaira(sale.buAmount))}`}
              />
            ))}
          </div>
        )}

        {currentView === 'inventory' && (
          <div className="space-y-2">
            <ModeListRow
              title="Wallet stock"
              detail="Available to use at events"
              amount={buBalance == null ? '…' : `Ƀ\u2009${formatBu(buBalance)}`}
            />
            <ModeListRow
              title="Estimated value"
              detail="1 ɃU = ₦1"
              amount={nairaBalance == null ? '…' : `₦${formatNairaPlain(nairaBalance)}`}
            />
          </div>
        )}

        {currentView === 'events' && (
          <div className="rounded-[24px] border border-neutral-200 bg-white p-3">
            <Events mode="vendor" />
          </div>
        )}
      </div>
    </div>
  )
}
