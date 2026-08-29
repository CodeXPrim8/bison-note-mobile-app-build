'use client'

import { eventListingStatus } from '@/lib/events/sale'

export function EventStatusBadge({
  event,
  remaining,
}: {
  event: { start_time: string; end_time?: string | null } | null | undefined
  remaining?: number
}) {
  const status = eventListingStatus(event, remaining)
  const styles =
    status === 'ended'
      ? 'bg-muted text-muted-foreground'
      : status === 'sold_out'
        ? 'bg-destructive/20 text-destructive'
        : 'bg-green-400/20 text-green-400'
  const label = status === 'ended' ? 'Ended' : status === 'sold_out' ? 'Sold out' : 'Available'
  return (
    <span suppressHydrationWarning className={`rounded-full px-2 py-1 text-xs font-semibold ${styles}`}>
      {label}
    </span>
  )
}
