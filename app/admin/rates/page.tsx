'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { adminFetch } from '@/components/admin/api'

export default function AdminRatesPage() {
  const [rate, setRate] = useState('1')
  const [current, setCurrent] = useState(1)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    adminFetch<{ settings: { bu_naira_value: number } }>('/api/admin/settings')
      .then((data) => {
        setCurrent(data.settings.bu_naira_value)
        setRate(String(data.settings.bu_naira_value))
      })
      .catch((err: Error) => setError(err.message))
  }, [])

  async function save() {
    setError(null)
    try {
      const data = await adminFetch<{ settings: { bu_naira_value: number } }>('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify({ bu_naira_value: Number(rate) }),
      })
      setCurrent(data.settings.bu_naira_value)
      setMessage(`1 ɃU now equals ₦${data.settings.bu_naira_value}`)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-300">FX</p>
        <h1 className="mt-1 text-3xl font-bold">ɃU to naira</h1>
        <p className="text-sm text-muted-foreground">
          This is the spray / send / withdraw rate. Card buy still includes the collection spread on top.
        </p>
      </div>
      <Card className="space-y-4 p-6">
        <p className="text-4xl font-bold">1 ɃU = ₦{current.toLocaleString('en-NG')}</p>
        <Input value={rate} onChange={(e) => setRate(e.target.value)} />
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setRate(String(Math.max(0.01, Number(rate) - 0.1)))}>
            Reduce
          </Button>
          <Button variant="outline" onClick={() => setRate(String(Number(rate) + 0.1))}>
            Increase
          </Button>
          <Button onClick={() => void save()}>Save rate</Button>
        </div>
        {message && <p className="text-sm text-emerald-300">{message}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </Card>
    </div>
  )
}
