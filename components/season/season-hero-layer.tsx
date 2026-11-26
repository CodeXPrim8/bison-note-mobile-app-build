'use client'

import { useEffect, useState } from 'react'
import { FloatingVouchers } from '@/components/web/floating-vouchers'
import { SeasonAtmosphere } from '@/components/season/season-atmosphere'
import { SeasonGiftPopup } from '@/components/season/season-gift-popup'
import { SEASON_COPY, shouldShowSeason } from '@/lib/season'

export function SeasonHeroLayer() {
  const [season, setSeason] = useState(false)

  useEffect(() => {
    setSeason(shouldShowSeason())
  }, [])

  return (
    <>
      <FloatingVouchers />
      <SeasonAtmosphere variant="marketing" />
      {season ? (
        <p className="bu-season-hero-eyebrow pointer-events-none absolute left-4 top-[4.75rem] z-[3] md:left-[max(1.25rem,calc((100%-72rem)/2+1.25rem))]">
          {SEASON_COPY.eyebrow}
        </p>
      ) : null}
      <SeasonGiftPopup mode="guest" />
    </>
  )
}
