'use client'

import { useEffect, useRef, useState } from 'react'
import { formatBu } from '@/lib/bu-rate'

export function RollingBalance({
  value,
  visible = true,
  prefix = 'Ƀ',
  className = '',
  size = 'lg',
}: {
  value: number | null
  visible?: boolean
  prefix?: string
  className?: string
  size?: 'lg' | 'md'
}) {
  const prev = useRef<number | null>(null)
  const prevText = useRef('')
  const [direction, setDirection] = useState<'up' | 'down'>('up')
  const [display, setDisplay] = useState(value)
  const [tick, setTick] = useState(0)
  const [outgoing, setOutgoing] = useState('')

  useEffect(() => {
    if (value == null) {
      setDisplay(null)
      prev.current = null
      prevText.current = ''
      return
    }
    const before = prev.current
    const nextText = formatBu(value)
    if (before != null && Math.abs(value - before) >= 0.005) {
      setDirection(value > before ? 'up' : 'down')
      setOutgoing(prevText.current || formatBu(before))
      setTick((n) => n + 1)
    }
    setDisplay(value)
    prev.current = value
    prevText.current = nextText
  }, [value])

  if (!visible) {
    return (
      <span className={`inline-flex items-center leading-none ${className}`}>
        <span className="shrink-0">{prefix.trimEnd()}</span>
        <span className="ml-[0.15em]">••••••</span>
      </span>
    )
  }
  if (display == null) {
    return <span className={className}>{'\u00a0'}</span>
  }

  const text = formatBu(display)
  const oldText = outgoing || text
  const maxLen = Math.max(text.length, oldText.length)
  const paddedNew = text.padStart(maxLen, ' ')
  const paddedOld = oldText.padStart(maxLen, ' ')
  const slotH = size === 'lg' ? '1em' : '1em'
  const slotW = size === 'lg' ? '0.6em' : '0.55em'

  return (
    <span
      className={`inline-flex items-center leading-none tabular-nums ${className}`}
      aria-label={`${prefix} ${text}`}
      style={{ lineHeight: 1 }}
    >
      <span className="shrink-0 leading-none" style={{ lineHeight: 1 }}>
        {prefix.trimEnd()}
      </span>
      <span className="ml-[0.15em] inline-flex items-center leading-none" style={{ lineHeight: 1 }}>
        {paddedNew.split('').map((ch, i) => {
          const prevCh = paddedOld[i] ?? ch
          const changed = prevCh !== ch && tick > 0 && /\d/.test(ch)

          if (ch === ' ') {
            return <span key={`sp-${i}`} className="inline-block w-[0.25em]" />
          }

          if (!/\d/.test(ch)) {
            // commas / decimals sit on the same center line as digits
            return (
              <span
                key={`s-${i}-${ch}`}
                className="inline-flex items-center justify-center leading-none"
                style={{ height: slotH, lineHeight: 1 }}
              >
                {ch}
              </span>
            )
          }

          return (
            <span
              key={`d-${i}`}
              className="relative inline-block overflow-hidden align-middle"
              style={{ height: slotH, width: slotW, lineHeight: 1 }}
            >
              {changed ? (
                <>
                  <span
                    key={`old-${tick}-${i}`}
                    className="absolute inset-0 flex items-center justify-center leading-none"
                    style={{
                      lineHeight: 1,
                      animation: 'bu-roll-out 700ms cubic-bezier(0.22, 1, 0.36, 1) both',
                      ['--bu-roll-to' as string]: direction === 'up' ? '110%' : '-110%',
                    }}
                    aria-hidden
                  >
                    {prevCh}
                  </span>
                  <span
                    key={`new-${tick}-${i}`}
                    className="absolute inset-0 flex items-center justify-center leading-none"
                    style={{
                      lineHeight: 1,
                      animation: 'bu-roll-in 700ms cubic-bezier(0.22, 1, 0.36, 1) both',
                      ['--bu-roll-from' as string]: direction === 'up' ? '-110%' : '110%',
                    }}
                  >
                    {ch}
                  </span>
                </>
              ) : (
                <span className="absolute inset-0 flex items-center justify-center leading-none" style={{ lineHeight: 1 }}>
                  {ch}
                </span>
              )}
            </span>
          )
        })}
      </span>
    </span>
  )
}
