'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

export function DeleteEventButton({
  eventId,
  title,
  ticketsSold = 0,
  redirectTo = '/organizer/events',
  onDeleted,
  size = 'sm',
  className,
}: {
  eventId: string
  title: string
  ticketsSold?: number
  redirectTo?: string | null
  onDeleted?: () => void
  size?: 'sm' | 'default'
  className?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remove(event: React.MouseEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const res = await fetch(`/api/events/${eventId}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    const json = await res.json().catch(() => null)
    setBusy(false)
    if (res.status === 401) {
      window.location.assign(`/login?next=${encodeURIComponent(`/organizer/events/${eventId}`)}`)
      return
    }
    if (!json?.status) {
      setError(json?.message ?? 'Could not delete this event')
      return
    }
    setOpen(false)
    onDeleted?.()
    if (redirectTo) router.push(redirectTo)
    else if (!onDeleted) router.refresh()
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return
        setOpen(next)
        if (!next) setError(null)
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          size={size}
          variant="destructive"
          className={className}
          onClick={(event) => event.stopPropagation()}
        >
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {title}?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the event from ɃU and cannot be undone.
            {ticketsSold > 0
              ? ` ${ticketsSold} ticket${ticketsSold === 1 ? '' : 's'} were sold. Guest tickets for this event will be removed.`
              : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Keep event</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={(event) => {
              void remove(event)
            }}
          >
            {busy ? 'Deleting…' : 'Delete event'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
