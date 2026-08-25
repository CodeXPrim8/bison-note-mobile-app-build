'use client'

import { useEffect, useState } from 'react'
import { SiteHeader } from '@/components/web/site-chrome'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { safeNextPath } from '@/lib/auth/paths'
import { loadDraft, saveDraft } from '@/lib/forms/draft'

const LOGIN_DRAFT_KEY = 'bu-login-draft'

export default function LoginPage() {
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [name, setName] = useState('')
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [message, setMessage] = useState<string | null>(null)
  const [nextPath, setNextPath] = useState('/app')
  const [busy, setBusy] = useState(false)
  const [draftReady, setDraftReady] = useState(false)

  useEffect(() => {
    const next = safeNextPath(new URLSearchParams(window.location.search).get('next'))
    setNextPath(next)
    const draft = loadDraft<{ phone?: string; name?: string; mode?: 'login' | 'signup' }>(LOGIN_DRAFT_KEY)
    if (draft?.phone) setPhone(draft.phone)
    if (draft?.name) setName(draft.name)
    if (draft?.mode) setMode(draft.mode)
    setDraftReady(true)
  }, [])

  useEffect(() => {
    if (!draftReady) return
    saveDraft(LOGIN_DRAFT_KEY, { phone, name, mode })
  }, [draftReady, phone, name, mode])

  async function submit() {
    if (mode === 'signup') {
      if (!name.trim()) {
        setMessage('Enter your name.')
        return
      }
      if (!phone.trim()) {
        setMessage('Phone number is required. It is your ɃU ID.')
        return
      }
      if (!/^\d{4,6}$/.test(pin)) {
        setMessage('PIN must be 4–6 digits.')
        return
      }
      if (pin !== confirmPin) {
        setMessage('PINs do not match.')
        return
      }
    } else if (!phone.trim()) {
      setMessage('Enter your phone number.')
      return
    } else if (!/^\d{4,6}$/.test(pin)) {
      setMessage('PIN must be 4–6 digits.')
      return
    }

    setBusy(true)
    setMessage(null)
    const path = mode === 'login' ? '/api/auth/login' : '/api/auth/signup'
    try {
      const res = await fetch(path, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mode === 'login'
            ? { pin, phone }
            : { display_name: name, phone, pin, role: 'guest' },
        ),
      })
      const json = (await res.json()) as { status: boolean; message: string }
      setBusy(false)
      setMessage(json.message || (res.ok ? 'Signed in' : 'Could not sign in'))
      if (json.status) {
        window.location.assign(nextPath)
      }
    } catch {
      setBusy(false)
      setMessage('Could not reach ɃU. Check that the server is running, then try again.')
    }
  }

  return (
    <div className="theme-pink min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto flex max-w-md flex-col justify-center px-4 py-16">
        <Card className="space-y-4 p-6">
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            <h1 className="text-center text-2xl font-bold">{mode === 'login' ? 'Login' : 'Register'}</h1>
            {mode === 'signup' && (
              <div className="space-y-1">
                <p className="text-sm font-medium">Full name *</p>
                <Input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            )}
            <div className="space-y-1">
              <p className="text-sm font-medium">Phone Number *</p>
              <Input
                placeholder="08123456789 or +2348123456789"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">PIN *</p>
              <Input
                placeholder="Enter your PIN"
                type="password"
                inputMode="numeric"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
            </div>
            {mode === 'signup' && (
              <div className="space-y-1">
                <p className="text-sm font-medium">Confirm PIN *</p>
                <Input
                  placeholder="Confirm PIN"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                />
              </div>
            )}
            {message && <p className="text-sm text-destructive">{message}</p>}
            <Button className="w-full" disabled={busy} type="submit">
              {busy ? 'Please wait…' : mode === 'login' ? 'Login' : 'Register'}
            </Button>
          </form>
          <button
            type="button"
            className="w-full text-center text-sm font-medium text-primary"
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login')
              setMessage(null)
            }}
          >
            {mode === 'login' ? "Don't have an account? Register" : 'Have an account? Login'}
          </button>
        </Card>
      </main>
    </div>
  )
}
