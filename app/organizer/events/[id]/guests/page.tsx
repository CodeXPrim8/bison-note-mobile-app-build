'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { EventInvitation } from '@/lib/types/database'

export default function GuestsPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState('')
  const [invites, setInvites] = useState<EventInvitation[]>([])
  const [buIds, setBuIds] = useState('')
  const [lookup, setLookup] = useState('')
  const [lookupResult, setLookupResult] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    params.then(({ id: value }) => setId(value))
  }, [params])

  function load() {
    if (!id) return
    fetch(`/api/events/${id}/invites`)
      .then(async (res) => {
        const json = await res.json()
        if (json.status) setInvites(json.data)
      })
      .catch(() => undefined)
  }

  useEffect(load, [id])

  async function invite() {
    const list = buIds
      .split(/[\n,]+/)
      .map((value) => value.trim())
      .filter(Boolean)
    const res = await fetch(`/api/events/${id}/invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bu_ids: list }),
    })
    const json = await res.json()
    setMessage(json.message)
    load()
  }

  async function checkBuId() {
    const res = await fetch('/api/users/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bu_id: lookup }),
    })
    const json = await res.json()
    if (!json.status) {
      setLookupResult(json.message)
      return
    }
    setLookupResult(json.data.exists ? `Matched ${json.data.display_name} (${json.data.phone_hint})` : 'No ɃU account for that ID yet. Invite will wait until they register.')
  }

  return (
    <div>
      <h1 className="text-3xl font-bold">Guests</h1>
      <p className="mt-2 text-sm text-muted-foreground">Invite by exact ɃU ID (registered phone number). This is not a user directory.</p>
      <Card className="mt-6 space-y-3 p-6">
        <div className="flex gap-2">
          <Input placeholder="08012345678" value={lookup} onChange={(e) => setLookup(e.target.value)} />
          <Button type="button" variant="outline" onClick={checkBuId}>
            Confirm ɃU ID
          </Button>
        </div>
        {lookupResult && <p className="text-sm text-muted-foreground">{lookupResult}</p>}
        <Textarea placeholder="One ɃU ID per line, or comma-separated" value={buIds} onChange={(e) => setBuIds(e.target.value)} />
        <Button onClick={invite}>Send invitations</Button>
        {message && <p className="text-sm">{message}</p>}
      </Card>
      <div className="mt-6 space-y-2">
        {invites.map((invite) => (
          <Card key={invite.id} className="flex items-center justify-between p-4">
            <div>
              <p className="font-mono text-sm">{invite.invited_bu_id}</p>
              <p className="text-xs text-muted-foreground">{invite.invited_phone}</p>
            </div>
            <span className="text-xs uppercase text-primary">{invite.status}</span>
          </Card>
        ))}
      </div>
    </div>
  )
}
