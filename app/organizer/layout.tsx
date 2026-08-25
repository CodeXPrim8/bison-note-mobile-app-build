import Link from 'next/link'

const NAV = [
  ['Dashboard', '/organizer'],
  ['Events', '/organizer/events'],
  ['Create Event', '/organizer/events/create'],
  ['Ticket Sales', '/organizer/sales'],
  ['Guests', '/organizer/guests'],
  ['Check-In', '/organizer/checkin'],
  ['Transactions', '/organizer/transactions'],
  ['Settlements', '/organizer/settlements'],
  ['Gateway', '/gateway/dashboard'],
  ['API Keys', '/organizer/api-keys'],
  ['Settings', '/organizer/settings'],
]

export default function OrganizerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="theme-pink min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <aside className="hidden w-60 shrink-0 border-r border-border bg-card/40 p-4 md:block">
          <Link href="/" className="mb-6 block text-lg font-bold text-primary">
            ɃU Organiser
          </Link>
          <nav className="space-y-1 text-sm">
            {NAV.map(([label, href]) => (
              <Link key={label} href={href} className="block rounded-md px-3 py-2 text-muted-foreground hover:bg-secondary hover:text-foreground">
                {label}
              </Link>
            ))}
          </nav>
        </aside>
        <div className="flex-1">
          <header className="flex items-center justify-between border-b border-border px-4 py-3 md:hidden">
            <Link href="/organizer" className="font-bold text-primary">
              ɃU Organiser
            </Link>
            <Link href="/organizer/events/create" className="text-sm">
              Create
            </Link>
          </header>
          <main className="p-4 md:p-8">{children}</main>
        </div>
      </div>
    </div>
  )
}
