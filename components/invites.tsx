'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { EventInvitation, EventRecord } from '@/lib/types/database'

interface InviteRow extends EventInvitation {
  event: EventRecord | null
}

export default function Invites() {
  const [invites, setInvites] = useState<InviteRow[]>([])
  const [message, setMessage] = useState<string | null>(null)

  function load() {
    fetch('/api/invites')
      .then(async (res) => {
        const json = await res.json()
        if (!json.status) {
          setMessage(json.message ?? 'Sign in to see private invitations.')
          return
        }
        setInvites(json.data ?? [])
      })
      .catch(() => setMessage('Could not load invites'))
  }

  useEffect(load, [])

  async function respond(id: string, status: 'accepted' | 'declined') {
    await fetch('/api/invites', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invitation_id: id, status }),
    })
    load()
  }

  return (
    <div className="space-y-6 pb-24 pt-4">
      <div className="px-4">
        <h2 className="mb-2 text-xl font-bold">Invites</h2>
        <p className="mb-4 text-sm text-muted-foreground">You&apos;re invited — private events only you can see.</p>
        {message && (
          <Card className="p-4 text-sm text-muted-foreground">
            {message}{' '}
            <a className="text-primary" href="/login">
              Sign in
            </a>
          </Card>
        )}
        <div className="space-y-3">
          {invites.map((invite) => (
            <Card key={invite.id} className="border-primary/20 p-4">
              <h3 className="font-semibold">{invite.event?.title ?? 'Private event'}</h3>
              <p className="text-sm text-muted-foreground">
                {invite.event ? new Date(invite.event.start_time).toLocaleDateString() : ''} · {invite.event?.venue_name}
              </p>
              {(invite.gate || invite.seat) && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {invite.gate} {invite.seat}
                </p>
              )}
              <p className="mt-2 text-xs uppercase text-primary">{invite.status}</p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => respond(invite.id, 'accepted')}>
                  Accept
                </Button>
                <Button size="sm" variant="outline" onClick={() => respond(invite.id, 'declined')}>
                  Decline
                </Button>
                {invite.event?.slug && (
                  <Button size="sm" variant="ghost" onClick={() => (window.location.href = `/events/${invite.event?.slug}`)}>
                    View invitation
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
