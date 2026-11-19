'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Copy } from 'lucide-react'

type VendorLink = {
  id: string
  event_id: string
  vendor_user_id: string
  commission_pct: number
  status: 'pending' | 'approved' | 'revoked'
}

export function EventVendorsManage({
  eventId,
  eventTitle,
  compact = false,
}: {
  eventId: string
  eventTitle?: string
  compact?: boolean
}) {
  const [vendors, setVendors] = useState<VendorLink[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!eventId) return
    try {
      const res = await fetch(`/api/pos/vendors?event_id=${encodeURIComponent(eventId)}`, {
        credentials: 'include',
      })
      const json = await res.json()
      if (json.status) setVendors((json.data?.vendors ?? []) as VendorLink[])
      else setMessage(json.message ?? 'Could not load vendors')
    } catch {
      setMessage('Could not load vendors')
    }
  }, [eventId])

  useEffect(() => {
    void load()
  }, [load])

  async function setStatus(vendorUserId: string, action: 'approve' | 'reject' | 'revoke') {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/pos/vendors', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          event_id: eventId,
          vendor_user_id: vendorUserId,
        }),
      })
      const json = await res.json()
      setBusy(false)
      if (!json.status) {
        setMessage(json.message ?? 'Update failed')
        return
      }
      setMessage(
        action === 'approve' ? 'Vendor approved' : action === 'reject' ? 'Vendor rejected' : 'Vendor revoked',
      )
      await load()
    } catch {
      setBusy(false)
      setMessage('Update failed')
    }
  }

  async function copyInvite() {
    const link =
      typeof window !== 'undefined'
        ? `${window.location.origin}/organizer/events/${eventId}`
        : eventId
    try {
      await navigator.clipboard.writeText(link)
      setMessage('Invite link copied. Vendors request from Events → Organiser invites.')
    } catch {
      setMessage(link)
    }
  }

  const pending = vendors.filter((row) => row.status === 'pending')
  const approved = vendors.filter((row) => row.status === 'approved')
  const rejected = vendors.filter((row) => row.status === 'revoked')

  return (
    <Card className={compact ? 'space-y-3 p-4' : 'mt-6 space-y-3 p-5'}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{compact ? 'Vendors' : 'Event vendors'}</h3>
          <p className="text-xs text-muted-foreground">
            {eventTitle ? `${eventTitle} · ` : ''}
            Approve or reject vendor requests. Approved vendors vend ceremonial cash (10%).
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => void copyInvite()}>
          <Copy className="mr-1 h-3.5 w-3.5" />
          Copy invite link
        </Button>
      </div>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}

      {pending.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
            New requests ({pending.length})
          </p>
          {pending.map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200/80 bg-amber-50/60 px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium">Vendor {row.vendor_user_id.slice(0, 8)}…</p>
                <p className="text-xs text-muted-foreground">Pending · {row.commission_pct}%</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" disabled={busy} onClick={() => void setStatus(row.vendor_user_id, 'approve')}>
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void setStatus(row.vendor_user_id, 'reject')}
                >
                  Reject
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {approved.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Approved</p>
          {approved.map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 py-2 last:border-0"
            >
              <div>
                <p className="text-sm font-medium">Vendor {row.vendor_user_id.slice(0, 8)}…</p>
                <p className="text-xs text-muted-foreground">Approved · {row.commission_pct}%</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void setStatus(row.vendor_user_id, 'revoke')}
              >
                Revoke
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      {rejected.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Rejected / revoked</p>
          {rejected.map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 py-2 last:border-0"
            >
              <div>
                <p className="text-sm font-medium">Vendor {row.vendor_user_id.slice(0, 8)}…</p>
                <p className="text-xs text-muted-foreground">Rejected</p>
              </div>
              <Button size="sm" disabled={busy} onClick={() => void setStatus(row.vendor_user_id, 'approve')}>
                Approve
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      {vendors.length === 0 && (
        <p className="text-sm text-muted-foreground">No vendor requests yet.</p>
      )}
    </Card>
  )
}
