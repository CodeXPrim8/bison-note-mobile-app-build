'use client'

import { useEffect, useState } from 'react'
import { Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function MobileNavDrawer({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: React.ReactNode | ((close: () => void) => React.ReactNode)
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open])

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0 gap-2"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(true)}
      >
        <Menu className="h-4 w-4" />
        Menu
      </Button>
      {open ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 z-0 bg-black/50"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <div
            id={id}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="absolute inset-y-0 left-0 z-10 flex w-[min(20rem,88vw)] flex-col bg-background shadow-lg"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-4">
              <p className="font-semibold text-primary">{title}</p>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Close menu" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {typeof children === 'function' ? children(() => setOpen(false)) : children}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
