'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { displayBuId } from '@/lib/phone'

export default function SettingsPage() {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [buId, setBuId] = useState<string | null>(null)
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/me')
      .then(async (res) => {
        const json = await res.json()
        if (json.status && json.data?.profile) {
          setName(json.data.profile.display_name ?? '')
          setPhone(json.data.profile.phone ?? '')
          setEmail(json.data.profile.email ?? json.data.user?.email ?? '')
          setBuId(json.data.profile.phone_e164)
        }
      })
      .catch(() => undefined)
  }, [])

  async function save() {
    const res = await fetch('/api/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        display_name: name,
        phone,
        ...(newPin ? { current_pin: currentPin, new_pin: newPin } : {}),
      }),
    })
    const json = await res.json()
    setMessage(json.message)
    if (json.status) setBuId(json.data?.profile?.phone_e164 ?? buId)
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-3xl font-bold">Settings</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Same ɃU account as the mobile app. Sign in with your phone number (ɃU ID) and PIN.
      </p>
      <Card className="mt-6 space-y-3 p-6">
        <Input placeholder="Display name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Email" value={email} disabled />
        <Input placeholder="Phone / ɃU ID" value={phone} onChange={(e) => setPhone(e.target.value)} />
        {buId && <p className="text-xs text-muted-foreground">Normalised ɃU ID: {displayBuId(buId)}</p>}
        <Input
          placeholder="Current PIN"
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={currentPin}
          onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
        />
        <Input
          placeholder="New PIN (4–6 digits)"
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={newPin}
          onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
        />
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
        <Button onClick={save}>Save</Button>
      </Card>
    </div>
  )
}
