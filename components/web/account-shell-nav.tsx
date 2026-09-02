'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MobileNavDrawer } from '@/components/web/mobile-nav-drawer'
import { cn } from '@/lib/utils'

const AFFILIATE_LINKS = [
  { href: '/affiliate', label: 'Desk' },
  { href: '/app', label: 'ɃU wallet' },
  { href: '/organizer', label: 'Organiser' },
  { href: '/events', label: 'Events' },
]

const ADMIN_LINKS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/events', label: 'Events' },
  { href: '/admin/money', label: 'Money' },
  { href: '/admin/withdrawals', label: 'Withdrawals' },
  { href: '/admin/ads', label: 'Adverts' },
  { href: '/admin/rates', label: 'ɃU rate' },
]

function ShellNav({
  id,
  title,
  links,
}: {
  id: string
  title: string
  links: Array<{ href: string; label: string }>
}) {
  const pathname = usePathname()
  const current = links.find(
    (item) =>
      pathname === item.href || (item.href !== '/admin' && item.href !== '/affiliate' && pathname.startsWith(item.href)),
  )

  function Links({ onNavigate }: { onNavigate?: () => void }) {
    return (
      <nav className="space-y-1 text-sm">
        {links.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              'block rounded-lg px-3 py-2.5 transition',
              pathname === item.href || (item.href !== '/admin' && pathname.startsWith(`${item.href}/`))
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    )
  }

  return (
    <>
      <aside className="hidden w-60 shrink-0 border-r border-border bg-card/40 p-4 md:block">
        <Link href="/" className="mb-6 block text-lg font-bold text-primary">
          {title}
        </Link>
        <Links />
      </aside>
      <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:hidden">
        <Link href={links[0]?.href ?? '/'} className="font-bold text-primary">
          {title}
        </Link>
        <p className="truncate text-sm text-muted-foreground">{current?.label}</p>
        <MobileNavDrawer id={id} title={title}>
          {(close) => <Links onNavigate={close} />}
        </MobileNavDrawer>
      </header>
    </>
  )
}

export function AffiliateNav() {
  return <ShellNav id="affiliate-mobile-nav" title="ɃU Affiliate" links={AFFILIATE_LINKS} />
}

export function AdminNav() {
  return <ShellNav id="admin-mobile-nav" title="ɃU Super Admin" links={ADMIN_LINKS} />
}
