'use client'

import { useEffect, useRef, useState } from 'react'

export function balanceSeriesFromHistory(
  currentBu: number,
  txs: Array<{ amount: number; direction: string }>,
) {
  let cursor = Math.max(0, currentBu)
  const newestFirst = [cursor]
  for (const tx of txs.slice(0, 18)) {
    const amount = Math.abs(Number(tx.amount) || 0)
    if (!amount) continue
    if (tx.direction === 'credit') cursor = Math.max(0, cursor - amount)
    else cursor += amount
    newestFirst.push(cursor)
  }
  // Oldest → newest. No padding — padding made a fake flat green line.
  return newestFirst.reverse().map((value) => Math.max(0, value))
}

export function BalanceSparkline({
  values,
  gradientId = 'bu-balance-fill',
  ready = true,
}: {
  values: number[]
  gradientId?: string
  ready?: boolean
}) {
  const width = 220
  const height = 56
  const pad = 4

  if (!ready) {
    return (
      <div className="flex h-14 w-full items-center" aria-hidden>
        <div className="h-[2px] w-full rounded-full bg-white/15" />
      </div>
    )
  }

  if (values.length < 2) {
    return (
      <div className="flex h-14 w-full items-center" aria-hidden>
        <div className="h-[2px] w-full rounded-full bg-white/20" />
      </div>
    )
  }

  const points = values
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = Math.max(1, max - min)
  const coords = points.map((value, index) => {
    const x = pad + (index / Math.max(1, points.length - 1)) * (width - pad * 2)
    const y = height - pad - ((value - min) / span) * (height - pad * 2)
    return { x, y }
  })
  const line = coords.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ')
  const area = `${line} L${coords[coords.length - 1]?.x ?? width} ${height} L${coords[0]?.x ?? 0} ${height} Z`
  const rising = points[points.length - 1]! >= points[0]!
  const stroke = rising ? '#6ee7b7' : '#fda4af'

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-14 w-full" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.45" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round" />
      <circle
        cx={coords[coords.length - 1]!.x}
        cy={coords[coords.length - 1]!.y}
        r="2.1"
        fill="#fff"
        stroke={stroke}
        strokeWidth="1"
      />
    </svg>
  )
}

/** Live balance points from wallet history; stays empty until history loads. */
export function useBalanceSpark(userId: string | null | undefined, buBalance: number | null | undefined) {
  const [sparkValues, setSparkValues] = useState<number[]>([])
  const [ready, setReady] = useState(false)
  const seeded = useRef(false)
  const lastBalance = useRef<number | null>(null)

  useEffect(() => {
    seeded.current = false
    lastBalance.current = null
    setReady(false)
    setSparkValues([])
  }, [userId])

  useEffect(() => {
    if (!userId) {
      setReady(false)
      setSparkValues([])
      return
    }
    let cancelled = false
    setReady(false)
    fetch('/api/wallet?limit=24', { credentials: 'include', cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json()
        if (cancelled) return
        if (!json.status) {
          setSparkValues([])
          setReady(true)
          seeded.current = true
          return
        }
        const walletBu = Number(json.data?.wallet?.bu_balance ?? buBalance ?? 0)
        const txs = Array.isArray(json.data?.transactions)
          ? (json.data.transactions as Array<{ amount?: unknown; direction?: unknown }>).map((row) => ({
              amount: Math.abs(Number(row.amount ?? 0)),
              direction: String(row.direction ?? 'debit'),
            }))
          : []
        const series = balanceSeriesFromHistory(Number.isFinite(walletBu) ? walletBu : 0, txs)
        setSparkValues(series)
        lastBalance.current = Number.isFinite(walletBu) ? walletBu : null
        seeded.current = true
        setReady(true)
      })
      .catch(() => {
        if (cancelled) return
        // No fake flat series — wait for a real balance change after load failure.
        setSparkValues([])
        seeded.current = true
        setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    if (!seeded.current || buBalance == null) return
    if (lastBalance.current != null && Math.abs(lastBalance.current - buBalance) < 1e-6) return
    lastBalance.current = buBalance
    setSparkValues((current) => {
      if (current.length === 0) return [buBalance]
      const last = current[current.length - 1]
      if (last != null && Math.abs(last - buBalance) < 1e-6) return current
      return [...current, buBalance].slice(-24)
    })
  }, [buBalance])

  return { values: sparkValues, ready }
}
