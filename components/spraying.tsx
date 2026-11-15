'use client'

import { useState } from 'react'
import { Gift, HandCoins, QrCode } from 'lucide-react'
import SprayingQR from '@/components/spraying-qr'

interface SprayingProps {
  onNavigate?: (page: string, data?: unknown) => void
}

export default function Spraying({ onNavigate }: SprayingProps) {
  const [view, setView] = useState<'hub' | 'spray'>('hub')

  if (view === 'spray') {
    return (
      <div className="pb-24">
        <div className="px-4 pt-4">
          <button
            type="button"
            onClick={() => setView('hub')}
            className="mb-2 text-sm font-medium text-neutral-500 transition hover:text-neutral-950"
          >
            ← Back to Spray
          </button>
        </div>
        <SprayingQR />
      </div>
    )
  }

  return (
    <div className="space-y-4 bg-transparent px-4 pb-28 pt-4 text-neutral-950">
      <div>
        <h2 className="text-xl font-bold">Spray & Tips</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Give or receive a tip, or spray ɃU at a live event.
        </p>
      </div>

      <button
        type="button"
        onClick={() => onNavigate?.('send-bu', { intent: 'tip' })}
        className="bu-press flex w-full items-start gap-4 rounded-2xl border border-yellow-400/30 bg-gradient-to-br from-yellow-400/15 to-yellow-400/5 p-5 text-left transition hover:border-yellow-400/60"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-yellow-400/20 text-yellow-700">
          <Gift className="h-6 w-6" />
        </span>
        <span>
          <span className="block text-base font-semibold">Give Tip</span>
          <span className="mt-1 block text-sm text-neutral-500">
            Scan someone’s QR and send a tip instantly.
          </span>
        </span>
      </button>

      <button
        type="button"
        onClick={() => onNavigate?.('receive-bu', { intent: 'tip' })}
        className="bu-press flex w-full items-start gap-4 rounded-2xl border border-emerald-400/30 bg-gradient-to-br from-emerald-400/15 to-emerald-400/5 p-5 text-left transition hover:border-emerald-400/60"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-400/20 text-emerald-700">
          <HandCoins className="h-6 w-6" />
        </span>
        <span>
          <span className="block text-base font-semibold">Receive Tip</span>
          <span className="mt-1 block text-sm text-neutral-500">
            Show your QR so people can tip you.
          </span>
        </span>
      </button>

      <button
        type="button"
        onClick={() => setView('spray')}
        className="bu-press flex w-full items-start gap-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-left transition hover:border-neutral-400"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-neutral-950 text-white">
          <QrCode className="h-6 w-6" />
        </span>
        <span>
          <span className="block text-base font-semibold">Scan Event QR Code</span>
          <span className="mt-1 block text-sm text-neutral-500">
            Scan a live event QR to spray ɃU to the celebrant.
          </span>
        </span>
      </button>
    </div>
  )
}
