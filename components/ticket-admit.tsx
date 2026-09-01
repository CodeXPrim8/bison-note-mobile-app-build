'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { TicketPass, type TicketPassTicket } from '@/components/ticket-pass'

export function TicketAdmitCard({
  ticket,
  qr,
  onClose,
}: {
  ticket: TicketPassTicket
  qr?: string
  onClose?: () => void
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-black/80 backdrop-blur-md">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close ticket" onClick={onClose} />
      <div className="relative mx-auto flex min-h-full max-w-sm flex-col justify-center px-4 py-10">
        <TicketPass ticket={ticket} qr={qr} variant="full" />
        {onClose && (
          <Button className="relative z-10 mt-5" variant="secondary" onClick={onClose}>
            Close
          </Button>
        )}
      </div>
    </div>
  )
}
