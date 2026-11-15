'use client'

import { formatBu } from '@/lib/bu-rate'
import type { WalletDirection } from '@/lib/wallet/direction'

/** Sign + Ƀ + amount on one baseline with a tight gap. */
export function SignedBu({
  amountBu,
  direction,
  className = '',
}: {
  amountBu: number
  direction: WalletDirection
  className?: string
}) {
  const credit = direction === 'credit'
  return (
    <span className={`inline-flex items-baseline tabular-nums ${className}`}>
      <span className="shrink-0">{credit ? '+' : '−'}Ƀ</span>
      <span className="ml-[0.12em]">{formatBu(amountBu)}</span>
    </span>
  )
}
