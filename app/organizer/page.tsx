'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface Stats {
  total_events: number
  tickets_sold: number
  total_revenue: number
  upcoming_events: number
  total_guests: number
  checked_in: number
}

export default function OrganizerHome() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/organizer/stats', { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        if (json.status) setStats(json.data)
        else setError(json.message)
      })
      .catch(() => setError('Sign in as an organiser to load this dashboard.'))
  }, [])

  const cards = [
    ['Total Events', stats?.total_events ?? '—'],
    ['Tickets Sold', stats?.tickets_sold ?? '—'],
    ['Total Revenue', stats ? `₦${stats.total_revenue.toLocaleString()}` : '—'],
    ['Upcoming Events', stats?.upcoming_events ?? '—'],
    ['Total Guests', stats?.total_guests ?? '—'],
    ['Checked In', stats?.checked_in ?? '—'],
  ]

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <Button asChild>
          <Link href="/organizer/events/create">Create event</Link>
        </Button>
      </div>
      {error && (
        <p className="mt-4 text-sm text-muted-foreground">
          {error} <Link href="/login" className="text-primary">Sign in</Link>
        </p>
      )}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(([label, value]) => (
          <Card key={label} className="p-5">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-bold">{value}</p>
          </Card>
        ))}
      </div>
    </div>
  )
}
