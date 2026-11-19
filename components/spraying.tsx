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
      <div className="pb-28">
        <div className="px-4 pt-3">
          <button
            type="button"
            onClick={() => setView('hub')}
            className="bu-press mb-1 inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-neutral-600 transition hover:bg-white/70 hover:text-neutral-950"
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
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8b5cf6]">Spray</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight">Spray & Tips</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Give or receive a tip, or spray ɃU at a live event.
        </p>
      </div>

      <button
        type="button"
        onClick={() => onNavigate?.('send-bu', { intent: 'tip' })}
        className="bu-press bu-glass flex w-full items-start gap-4 rounded-[24px] p-5 text-left"
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
        className="bu-press bu-glass flex w-full items-start gap-4 rounded-[24px] p-5 text-left"
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
        className="bu-press flex w-full items-start gap-4 rounded-[24px] p-5 text-left text-white"
        style={{
          background: 'linear-gradient(120deg, #2f7bff 0%, #8b5cf6 55%, #ff2d95 120%)',
          boxShadow: '0 16px 36px rgba(47,123,255,0.28)',
        }}
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-white/30">
          <QrCode className="h-6 w-6" />
        </span>
        <span>
          <span className="block text-base font-semibold">Scan Event QR Code</span>
          <span className="mt-1 block text-sm text-white/75">
            Scan a live event QR to spray ɃU to the celebrant.
          </span>
        </span>
      </button>
    </div>
  )
}
