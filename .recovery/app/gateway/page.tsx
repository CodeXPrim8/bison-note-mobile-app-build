'use client'

import { useState } from 'react'
import { PublicShell } from '@/components/public-shell'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { getAppUrl } from '@/lib/env'

export default function GatewayPortalPage() {
  const [business, setBusiness] = useState('')
  const [email, setEmail] = useState('')
  const [webhook, setWebhook] = useState('')
  const [keys, setKeys] = useState<{ public_key: string; secret_key: string; webhook_secret: string } | null>(null)
  const [secretInput, setSecretInput] = useState('')
  const [stats, setStats] = useState<string>('')
  const [docsLang, setDocsLang] = useState<'js' | 'php' | 'python'>('js')
  const appUrl = typeof window !== 'undefined' ? window.location.origin : ''

  async function register() {
    const res = await fetch('/api/v1/gateway/merchants/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_name: business, email, webhook_url: webhook || undefined }),
    })
    const json = (await res.json()) as {
      status: boolean
      message: string
      data?: { public_key: string; secret_key: string; webhook_secret: string }
    }
    if (json.data) {
      setKeys(json.data)
      setSecretInput(json.data.secret_key)
    } else {
      setStats(json.message)
    }
  }

  async function loadWebhooks() {
    const res = await fetch('/api/v1/gateway/webhooks', {
      headers: { Authorization: `Bearer ${secretInput}` },
    })
    const json = await res.json()
    setStats(JSON.stringify(json, null, 2))
  }

  const jsSnippet = `const res = await fetch('${appUrl}/api/v1/gateway/tickets/initialize', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer sk_live_YOUR_SECRET',
    'Content-Type': 'application/json',
    'Idempotency-Key': crypto.randomUUID(),
  },
  body: JSON.stringify({
    email: 'guest@email.com',
    amount: 5000,
    ticket_tier_id: 'TIER_UUID',
    callback_url: 'https://yoursite.com/thanks',
    metadata: { buyer_name: 'Ada' },
  }),
});`

  const phpSnippet = `<?php
$ch = curl_init('${appUrl}/api/v1/gateway/tickets/initialize');
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_HTTPHEADER => [
    'Authorization: Bearer sk_live_YOUR_SECRET',
    'Content-Type: application/json',
    'Idempotency-Key: ' . uniqid('bu_', true),
  ],
  CURLOPT_POSTFIELDS => json_encode([
    'email' => 'guest@email.com',
    'amount' => 5000,
    'ticket_tier_id' => 'TIER_UUID',
  ]),
  CURLOPT_RETURNTRANSFER => true,
]);
echo curl_exec($ch);`

  const pySnippet = `import requests, uuid
r = requests.post(
  '${appUrl}/api/v1/gateway/tickets/initialize',
  headers={
    'Authorization': 'Bearer sk_live_YOUR_SECRET',
    'Idempotency-Key': str(uuid.uuid4()),
  },
  json={'email': 'guest@email.com', 'amount': 5000, 'ticket_tier_id': 'TIER_UUID'},
)
print(r.json())`

  return (
    <PublicShell title="Gateway">
      <div className="px-4 py-6 space-y-4 pb-16">
        <Card className="p-4 space-y-3">
          <h2 className="font-bold">Register as a merchant</h2>
          <Input placeholder="Business name" value={business} onChange={(e) => setBusiness(e.target.value)} />
          <Input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input placeholder="Webhook URL" value={webhook} onChange={(e) => setWebhook(e.target.value)} />
          <Button onClick={register}>Create keys</Button>
          {keys && (
            <div className="text-xs space-y-2 break-all">
              <p>public_key: {keys.public_key}</p>
              <p>secret_key (shown once): {keys.secret_key}</p>
              <p>webhook_secret: {keys.webhook_secret}</p>
            </div>
          )}
        </Card>

        <Card className="p-4 space-y-3">
          <h2 className="font-bold">Dashboard</h2>
          <Input
            placeholder="Paste secret_key to inspect webhooks"
            value={secretInput}
            onChange={(e) => setSecretInput(e.target.value)}
          />
          <Button variant="outline" onClick={loadWebhooks}>
            Load webhook log
          </Button>
          {stats && <pre className="text-[10px] overflow-x-auto bg-secondary p-2 rounded">{stats}</pre>}
        </Card>

        <Card className="p-4 space-y-3">
          <h2 className="font-bold">Integration docs</h2>
          <div className="flex gap-2">
            {(['js', 'php', 'python'] as const).map((lang) => (
              <Button key={lang} size="sm" variant={docsLang === lang ? 'default' : 'outline'} onClick={() => setDocsLang(lang)}>
                {lang}
              </Button>
            ))}
          </div>
          <pre className="text-[10px] overflow-x-auto bg-secondary p-2 rounded whitespace-pre-wrap">
            {docsLang === 'js' ? jsSnippet : docsLang === 'php' ? phpSnippet : pySnippet}
          </pre>
          <p className="text-xs text-muted-foreground">
            Widget: {`<script src="${appUrl}/widget/bu-widget.js" data-event-slug="your-slug" async></script>`}
          </p>
        </Card>
      </div>
    </PublicShell>
  )
}
