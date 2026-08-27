'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { SiteHeader } from '@/components/web/site-chrome'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export default function PayPage({ params }: { params: Promise<{ reference: string }> }) {
  const [reference, setReference] = useState('')
  const [message, setMessage] = useState('Confirming payment…')
  const [ok, setOk] = useState(false)
  const [ticketsHref, setTicketsHref] = useState('/tickets')

  useEffect(() => {
    params.then(({ reference: value }) => setReference(value))
    if (new URLSearchParams(window.location.search).get('next') === '/app') {
      setTicketsHref('/app?page=tickets')
    }
  }, [params])

  useEffect(() => {
    if (!reference) return
    fetch(`/api/tickets/verify/${reference}`, { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        if (json.status) {
          const title = json.data?.event_title
          const count = Array.isArray(json.data?.tickets) ? json.data.tickets.length : 0
          setOk(true)
          setMessage(
            title
              ? `Payment confirmed. Your ticket${count === 1 ? '' : 's'} for ${title} ${count === 1 ? 'is' : 'are'} ready.`
              : 'Payment confirmed. Your tickets are ready.',
          )
        } else if (json.code === 'PAYMENT_PENDING') {
          setMessage('Payment is still pending. Complete Paystack checkout, then return here.')
        } else {
          setMessage(json.message ?? 'Payment not confirmed yet.')
        }
      })
      .catch(() => setMessage('Could not verify payment'))
  }, [reference])

  return (
    <div className="theme-pink min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-lg px-4 py-16">
        <Card className="p-8 text-center">
          <h1 className="text-2xl font-bold">{ok ? 'You are in' : 'Payment'}</h1>
          <p className="mt-3 text-muted-foreground">{message}</p>
          <p className="mt-2 font-mono text-xs">{reference}</p>
          <div className="mt-6 flex flex-col gap-2">
            <Button asChild>
              <Link href={ticketsHref}>View tickets</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/app?page=tickets">Open ɃU app</Link>
            </Button>
          </div>
        </Card>
      </main>
    </div>
  )
}
