'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
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
  title,
  links,
}: {
  title: string
  links: Array<{ href: string; label: string }>
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const current = links.find((item) => pathname === item.href || (item.href !== '/admin' && item.href !== '/affiliate' && pathname.startsWith(item.href)))

  return (
    <>
      <aside className="hidden w-60 shrink-0 border-r border-border bg-card/40 p-4 md:block">
        <Link href="/" className="mb-6 block text-lg font-bold text-primary">
          {title}
        </Link>
        <nav className="space-y-1 text-sm">
          {links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
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
      </aside>
      <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:hidden">
        <Link href={links[0]?.href ?? '/'} className="font-bold text-primary">
          {title}
        </Link>
        <p className="truncate text-sm text-muted-foreground">{current?.label}</p>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="gap-2">
              <Menu className="h-4 w-4" />
              Menu
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[min(20rem,88vw)] bg-background p-0">
            <SheetHeader className="border-b border-border px-4 py-4 text-left">
              <SheetTitle className="text-primary">{title}</SheetTitle>
            </SheetHeader>
            <nav className="space-y-1 p-3 text-sm">
              {links.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
      </header>
    </>
  )
}

export function AffiliateNav() {
  return <ShellNav title="ɃU Affiliate" links={AFFILIATE_LINKS} />
}

export function AdminNav() {
  return <ShellNav title="ɃU Super Admin" links={ADMIN_LINKS} />
}
