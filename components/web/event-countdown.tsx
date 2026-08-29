'use client'

import { useEffect, useState } from 'react'
import { eventDateHasPassed } from '@/lib/events/sale'

export function EventCountdown({ start, end }: { start: string; end?: string | null }) {
  const [label, setLabel] = useState<string | null>(null)
  const [ended, setEnded] = useState(false)

  useEffect(() => {
    if (eventDateHasPassed({ start_time: start, end_time: end })) {
      setEnded(true)
      setLabel('This event has ended')
      return
    }
    setEnded(false)
    const startMs = new Date(start).getTime()
    const diff = startMs - Date.now()
    if (diff <= 0) {
      setLabel('Happening now')
      return
    }
    const days = Math.floor(diff / 86400000)
    const hours = Math.floor((diff % 86400000) / 3600000)
    setLabel(`${days}d ${hours}h to go`)
  }, [start, end])

  if (!label) return null
  if (ended) return <p className="mt-4 text-sm text-muted-foreground">{label}</p>
  return <p className="mt-4 text-sm font-semibold text-primary">{label}</p>
}
