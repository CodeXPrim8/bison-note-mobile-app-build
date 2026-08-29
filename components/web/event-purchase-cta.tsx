'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { EventShare } from '@/components/web/event-share'
import { eventListingStatus } from '@/lib/events/sale'

export function EventPurchaseCta({
  startTime,
  endTime,
  remaining,
  slug,
  title,
  hasTiers,
}: {
  startTime: string
  endTime?: string | null
  remaining?: number
  slug: string
  title: string
  hasTiers: boolean
}) {
  const status = eventListingStatus({ start_time: startTime, end_time: endTime }, remaining)

  return (
    <div className="mt-6 flex flex-wrap gap-3">
      {status === 'ended' ? (
        <Button type="button" disabled>
          This event has ended
        </Button>
      ) : status === 'sold_out' ? (
        <Button type="button" disabled>
          {hasTiers ? 'Sold out' : 'Tickets not on sale'}
        </Button>
      ) : hasTiers ? (
        <Button asChild>
          <Link href={`/checkout/${slug}`}>Buy ticket</Link>
        </Button>
      ) : (
        <Button type="button" disabled>
          Tickets not on sale
        </Button>
      )}
      <EventShare title={title} slug={slug} />
    </div>
  )
}
