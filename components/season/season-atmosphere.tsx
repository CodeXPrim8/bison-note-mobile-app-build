'use client'

import { useEffect, useState } from 'react'
import { shouldShowSeason } from '@/lib/season'

/**
 * Sparse Christmas décor inspired by uploaded 3D clay concepts.
 * Photo assets are JPEG plates — use blend modes + CSS recreations so light
 * backgrounds dissolve into Midnight Mist.
 */
export function SeasonAtmosphere({
  variant = 'marketing',
  className = '',
}: {
  variant?: 'marketing' | 'app'
  className?: string
}) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    setShow(shouldShowSeason())
  }, [])

  if (!show) return null

  const flakes = variant === 'marketing' ? 20 : 10

  return (
    <div
      className={`bu-season-atmosphere bu-season-atmosphere-${variant} ${className}`.trim()}
      aria-hidden
    >
      <div className="bu-season-gold-glow" />

      {Array.from({ length: flakes }).map((_, i) => (
        <span
          key={`snow-${i}`}
          className="bu-season-flake bu-season-flake-snow"
          style={{
            left: `${(i * 9.1 + 3) % 97}%`,
            animationDuration: `${14 + (i % 8)}s`,
            animationDelay: `${-(i * 0.85)}s`,
            width: `${2 + (i % 3)}px`,
            height: `${2 + (i % 3)}px`,
          }}
        />
      ))}

      {variant === 'marketing' ? (
        <>
          <span className="bu-xmas-spark bu-xmas-spark-1" />
          <span className="bu-xmas-spark bu-xmas-spark-2" />
          <span className="bu-xmas-spark bu-xmas-spark-3" />
          <span className="bu-xmas-star-dot bu-xmas-star-dot-1" />
          <span className="bu-xmas-star-dot bu-xmas-star-dot-2" />
          <span className="bu-xmas-star-dot bu-xmas-star-dot-3" />

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/season/snowflake-cut.png" alt="" className="bu-season-photo bu-season-snowflake" />

          <div className="bu-clay-ticket bu-clay-ticket-a">
            <span className="bu-clay-ticket-mark">Ƀ</span>
            <span className="bu-clay-ticket-meta">VOUCHER</span>
          </div>
        </>
      ) : (
        <>
          <span className="bu-xmas-spark bu-xmas-spark-app" />
        </>
      )}
    </div>
  )
}
