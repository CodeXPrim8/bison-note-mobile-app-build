'use client'

import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Bell } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { formatEventDateTime } from '@/lib/datetime'
import { buFromNaira, formatBu, formatNairaPlain } from '@/lib/bu-rate'
import { useAccount } from '@/components/account-store'
import {
  amountIconTone,
  amountTone,
  historyBucket,
  historyLabel,
  walletDirection,
  type WalletDirection,
} from '@/lib/wallet/direction'

const SEEN_KEY = 'bu_alerts_seen_at'

type AlertRow = {
  id: string
  description: string
  amount: number
  date: string
  createdAt: number
  direction: WalletDirection
}

function mapAlert(tx: Record<string, unknown>): AlertRow {
  const type = String(tx.type ?? tx.kind ?? 'deposit')
  const rawDescription = String(tx.description ?? 'ɃU movement')
  const direction =
    tx.direction === 'credit' || tx.direction === 'debit'
      ? tx.direction
      : walletDirection({ type, description: rawDescription, metadata: tx.metadata, amount: Number(tx.amount ?? 0) })
  const createdAt = new Date(String(tx.created_at ?? '')).getTime() || 0
  return {
    id: String(tx.id ?? `${createdAt}-${rawDescription}`),
    description: historyLabel({ type, description: rawDescription, direction }),
    amount: Math.abs(Number(tx.amount ?? 0)),
    date: tx.created_at ? formatEventDateTime(String(tx.created_at)) : '',
    createdAt,
    direction,
  }
}

export default function Notifications() {
  const { userId, refreshWallet } = useAccount()
  const [alerts, setAlerts] = useState<AlertRow[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/wallet', { credentials: 'include' })
        const json = await res.json()
        if (cancelled) return
        if (!json.status) {
          setAlerts([])
          setReady(true)
          return
        }
        const next = ((json.data?.transactions ?? []) as Array<Record<string, unknown>>)
          .map(mapAlert)
          .sort((a, b) => b.createdAt - a.createdAt)
        setAlerts(next)
        setReady(true)
        try {
          window.localStorage.setItem(SEEN_KEY, String(Date.now()))
        } catch {
          // Private mode can block localStorage.
        }
        void refreshWallet()
      } catch {
        if (!cancelled) setReady(true)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [userId, refreshWallet])

  return (
    <div className="space-y-6 pb-24 pt-4">
      <div className="px-4">
        <h2 className="mb-4 text-xl font-bold">Notifications</h2>
        <div className="space-y-3">
          {alerts.length === 0 ? (
            ready ? (
              <Card className="border-border/50 bg-card/50 p-8 text-center">
                <Bell className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
                <p className="text-lg font-semibold text-foreground">No notifications yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Incoming ɃU, sends, ticket sales, and withdrawals will show up here.
                </p>
              </Card>
            ) : (
              <p className="text-sm text-muted-foreground">Loading notifications…</p>
            )
          ) : (
            alerts.map((alert) => {
              const credit = alert.direction === 'credit'
              return (
                <Card key={`${alert.id}-${alert.createdAt}`} className="border-border/50 bg-card/50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className={`rounded-full p-2 ${amountIconTone(alert.direction)}`}>
                        {credit ? (
                          <ArrowDown className="h-4 w-4 text-green-500" />
                        ) : (
                          <ArrowUp className="h-4 w-4 text-red-500" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium">{alert.description}</p>
                        <p className="text-xs text-muted-foreground">{alert.date}</p>
                      </div>
                    </div>
                    <span className={`shrink-0 text-right font-semibold ${amountTone(alert.direction)}`}>
                      {credit ? '+' : '-'}Ƀ {formatBu(buFromNaira(alert.amount))}
                      <span className="block text-xs font-normal text-muted-foreground">
                        {credit ? '+' : '-'}₦{formatNairaPlain(alert.amount)}
                      </span>
                    </span>
                  </div>
                </Card>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

export function countUnseenAlerts(txs: Array<Record<string, unknown>>) {
  let seenAt = 0
  try {
    seenAt = Number(window.localStorage.getItem(SEEN_KEY) || 0) || 0
  } catch {
    seenAt = 0
  }
  return txs.filter((tx) => {
    const type = String(tx.type ?? tx.kind ?? '')
    const description = String(tx.description ?? '')
    const direction =
      tx.direction === 'credit' || tx.direction === 'debit'
        ? tx.direction
        : walletDirection({ type, description, metadata: tx.metadata })
    const created = new Date(String(tx.created_at ?? '')).getTime() || 0
    if (!created || created <= seenAt) return false
    return direction === 'credit' && historyBucket({ type, description }) === 'bu_transfer'
  }).length
}
