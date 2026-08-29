'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BarChart3, TrendingUp, DollarSign, Calendar } from 'lucide-react'
import Events from '@/components/events'
import { formatEventDateTime } from '@/lib/datetime'
import { buFromNaira, formatBu, formatNairaPlain } from '@/lib/bu-rate'
import { useAccount } from '@/components/account-store'
import { readSessionSnapshot, writeSessionSnapshot } from '@/lib/session-snapshot'

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

export default function VendorDashboard() {
  const { buBalance, nairaBalance } = useAccount()
  const cached = readSessionSnapshot<VendorCache>(CACHE_KEY)
  const [stats, setStats] = useState<VendorStats>(
    cached?.stats ?? {
      totalSales: 0,
      activeSessions: 0,
      totalBUInventory: 0,
      nairaAvailable: 0,
      todayEarnings: 0,
    },
  )
  const [sales, setSales] = useState<Sale[]>(cached?.sales ?? [])
  const [statsReady, setStatsReady] = useState(Boolean(cached))
  const [currentView, setCurrentView] = useState<'overview' | 'sales' | 'inventory' | 'events'>('overview')

  useEffect(() => {
    fetch('/api/events/mine', { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
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
        setStats((prev) => {
          const next = {
            ...prev,
            totalSales: received,
            todayEarnings: received,
            activeSessions: list.length,
          }
          writeSessionSnapshot(CACHE_KEY, { stats: next, sales: nextSales })
          return next
        })
        setSales(nextSales)
        setStatsReady(true)
      })
      .catch(() => setStatsReady(true))
    fetch('/api/wallet', { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        if (json.data?.wallet) {
          setStats((prev) => {
            const next = {
              ...prev,
              totalBUInventory: Number(json.data.wallet.bu_balance ?? 0),
              nairaAvailable: Number(json.data.wallet.naira_available ?? 0),
            }
            writeSessionSnapshot(CACHE_KEY, {
              stats: next,
              sales: readSessionSnapshot<VendorCache>(CACHE_KEY)?.sales ?? [],
            })
            return next
          })
        }
      })
      .catch(() => undefined)
  }, [])

  return (
    <div className="space-y-6 pb-24 pt-4">
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-primary/20 bg-card p-4">
          <p className="text-xs text-muted-foreground">ɃU received on events</p>
          <p className="mt-2 text-2xl font-bold text-primary">
            {statsReady ? `₦${stats.todayEarnings.toLocaleString()}` : '\u00a0'}
          </p>
          <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
            <TrendingUp className="h-3 w-3" />
            <span>From your live ɃU events</span>
          </div>
        </Card>

        <Card className="border-primary/20 bg-card p-4">
          <p className="text-xs text-muted-foreground">Wallet ɃU</p>
          <p className="mt-2 text-2xl font-bold text-primary">
            {buBalance == null ? '\u00a0' : `Ƀ ${formatBu(buBalance)}`}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {statsReady ? `${stats.activeSessions} events` : '\u00a0'}
          </p>
        </Card>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        <Button
          onClick={() => setCurrentView('overview')}
          variant={currentView === 'overview' ? 'default' : 'outline'}
          className="flex-shrink-0"
        >
          Overview
        </Button>
        <Button
          onClick={() => setCurrentView('events')}
          variant={currentView === 'events' ? 'default' : 'outline'}
          className="flex-shrink-0"
        >
          Events
        </Button>
        <Button
          onClick={() => setCurrentView('sales')}
          variant={currentView === 'sales' ? 'default' : 'outline'}
          className="flex-shrink-0"
        >
          Sales Log
        </Button>
        <Button
          onClick={() => setCurrentView('inventory')}
          variant={currentView === 'inventory' ? 'default' : 'outline'}
          className="flex-shrink-0"
        >
          Inventory
        </Button>
      </div>

      {currentView === 'overview' && (
        <>
          <div className="space-y-3">
            <h3 className="font-semibold">Key Metrics</h3>
            <Card className="border-border/50 bg-card/50 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-semibold">Total ɃU received</p>
                    <p className="text-xs text-muted-foreground">Across your events</p>
                  </div>
                </div>
                <p className="text-xl font-bold">{statsReady ? `₦${stats.totalSales.toLocaleString()}` : '\u00a0'}</p>
              </div>
            </Card>
            <Card className="border-border/50 bg-card/50 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <DollarSign className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-semibold">Wallet balance</p>
                    <p className="text-xs text-muted-foreground">Live ɃU wallet</p>
                  </div>
                </div>
                <p className="text-xl font-bold text-green-400">
                  {buBalance == null ? '\u00a0' : `Ƀ ${formatBu(buBalance)}`}
                </p>
              </div>
            </Card>
          </div>
        </>
      )}

      {currentView === 'sales' && (
        <>
          <h3 className="font-semibold">Events</h3>
          <div className="space-y-3">
            {sales.length === 0 && (
              <p className="text-sm text-muted-foreground">No event ɃU received yet.</p>
            )}
            {sales.map((sale) => (
              <Card key={sale.id} className="border-border/50 bg-card/50 p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-semibold">{sale.eventName}</h4>
                    <p className="text-xs text-muted-foreground mt-1">{sale.timestamp}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-primary">₦{formatNairaPlain(sale.amount)}</p>
                    <p className="text-xs text-muted-foreground">Ƀ {formatBu(buFromNaira(sale.buAmount))}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {currentView === 'inventory' && (
        <>
          <h3 className="font-semibold">ɃU Inventory</h3>
          <Card className="border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5 p-6">
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Wallet stock</p>
                <p className="mt-2 text-3xl font-bold text-primary">
                  {buBalance == null ? '\u00a0' : `Ƀ ${formatBu(buBalance)}`}
                </p>
              </div>
              <div className="rounded-lg bg-background/50 p-3">
                <p className="text-xs text-muted-foreground">Estimated Value</p>
                <p className="mt-1 font-bold">
                  {nairaBalance == null ? '\u00a0' : `₦${formatNairaPlain(nairaBalance)}`}
                </p>
              </div>
            </div>
          </Card>
        </>
      )}

      {currentView === 'events' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Event Management</h3>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </div>
          <Events mode="vendor" />
        </>
      )}
    </div>
  )
}
