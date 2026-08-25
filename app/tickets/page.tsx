import { Suspense } from 'react'
import TicketsClient from '@/components/web/tickets-client'

export default function TicketsPage() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-muted-foreground">Loading tickets…</p>}>
      <TicketsClient />
    </Suspense>
  )
}
