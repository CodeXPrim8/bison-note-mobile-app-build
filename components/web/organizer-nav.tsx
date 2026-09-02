'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ORGANIZER_NAV, organizerCurrentLabel, organizerNavActive } from '@/lib/organizer-nav'
import { MobileNavDrawer } from '@/components/web/mobile-nav-drawer'
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
        <MobileNavDrawer id="organizer-mobile-nav" title="ɃU Organiser">
          {(close) => <NavLinks onNavigate={close} />}
        </MobileNavDrawer>
      </header>
    </>
  )
}
