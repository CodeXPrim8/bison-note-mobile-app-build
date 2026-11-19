'use client'

import { useEffect, useState } from 'react'
import { Building2 } from 'lucide-react'
import { bankLogoUrl } from '@/lib/payments/bank-logo'

export function BankLogo({
  bankCode,
  bankName,
  className = 'h-8 w-8',
}: {
  bankCode?: string | null
  bankName?: string | null
  className?: string
}) {
  const src = bankLogoUrl(bankCode)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [src])

  if (!src || failed) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-xl bg-neutral-950 text-white shadow-[0_8px_18px_rgba(11,23,51,0.22)] ${className}`}
        aria-hidden
      >
        <Building2 className="h-[45%] w-[45%]" />
      </span>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={bankName || 'Bank'}
      onError={() => setFailed(true)}
      className={`shrink-0 rounded-xl bg-white object-contain shadow-[0_8px_18px_rgba(11,23,51,0.12)] ring-1 ring-black/5 ${className}`}
    />
  )
}
