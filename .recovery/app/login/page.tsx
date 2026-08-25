'use client'

import { useState } from 'react'
import { PublicShell } from '@/components/public-shell'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [message, setMessage] = useState<string | null>(null)

  async function submit() {
    const path = mode === 'login' ? '/api/auth/login' : '/api/auth/signup'
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, display_name: name, role: 'celebrant' }),
    })
    const json = (await res.json()) as { status: boolean; message: string }
    setMessage(json.message)
    if (json.status) window.location.href = '/dashboard/events'
  }

  return (
    <PublicShell title="Sign in">
      <div className="px-4 py-8 space-y-3">
        <Card className="p-4 space-y-3">
          {mode === 'signup' && (
            <Input placeholder="Display name" value={name} onChange={(e) => setName(e.target.value)} />
          )}
          <Input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {message && <p className="text-sm text-muted-foreground">{message}</p>}
          <Button className="w-full" onClick={submit}>
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
            {mode === 'login' ? 'Need an account?' : 'Have an account?'}
          </Button>
        </Card>
      </div>
    </PublicShell>
  )
}
