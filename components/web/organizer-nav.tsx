'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { ORGANIZER_NAV, organizerCurrentLabel, organizerNavActive } from '@/lib/organizer-nav'
import { cn } from '@/lib/utils'

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  return (
    <nav className="space-y-1 text-sm">
      {ORGANIZER_NAV.map((item) => {
        const active = organizerNavActive(pathname, item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              'block rounded-lg px-3 py-2.5 transition',
              active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

export function OrganizerNav() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const current = organizerCurrentLabel(pathname)

  return (
    <>
      <aside className="hidden w-60 shrink-0 border-r border-border bg-card/40 p-4 md:block">
        <Link href="/" className="mb-6 block text-lg font-bold text-primary">
          ɃU Organiser
        </Link>
        <NavLinks />
      </aside>

      <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:hidden">
        <Link href="/organizer" className="shrink-0 font-bold text-primary">
          ɃU Organiser
        </Link>
        <p className="min-w-0 truncate text-sm text-muted-foreground">{current}</p>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="shrink-0 gap-2">
              <Menu className="h-4 w-4" />
              Menu
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[min(20rem,88vw)] bg-background p-0">
            <SheetHeader className="border-b border-border px-4 py-4 text-left">
              <SheetTitle className="text-primary">ɃU Organiser</SheetTitle>
            </SheetHeader>
            <div className="p-3">
              <NavLinks onNavigate={() => setOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
      </header>
    </>
  )
}
