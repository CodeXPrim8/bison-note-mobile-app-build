export const ORGANIZER_NAV = [
  { label: 'Dashboard', href: '/organizer' },
  { label: 'Events', href: '/organizer/events' },
  { label: 'Create Event', href: '/organizer/events/create' },
  { label: 'Ticket Sales', href: '/organizer/sales' },
  { label: 'Affiliate', href: '/affiliate' },
  { label: 'Guests', href: '/organizer/guests' },
  { label: 'Access', href: '/organizer/checkin' },
  { label: 'Transactions', href: '/organizer/transactions' },
  { label: 'Gateway', href: '/gateway/dashboard' },
  { label: 'API Keys', href: '/organizer/api-keys' },
  { label: 'Settings', href: '/organizer/settings' },
] as const

export function organizerNavActive(pathname: string, href: string) {
  if (href === '/organizer') return pathname === '/organizer'
  if (href === '/organizer/checkin') {
    return pathname === href || pathname.startsWith(`${href}/`) || /\/organizer\/events\/[^/]+\/checkin/.test(pathname)
  }
  const matches = pathname === href || pathname.startsWith(`${href}/`)
  if (!matches) return false
  return !ORGANIZER_NAV.some(
    (item) =>
      item.href !== href &&
      item.href.startsWith(`${href}/`) &&
      (pathname === item.href || pathname.startsWith(`${item.href}/`)),
  )
}

export function organizerCurrentLabel(pathname: string) {
  if (/\/organizer\/events\/[^/]+\/checkin/.test(pathname)) return 'Access'
  const exact = ORGANIZER_NAV.find((item) => item.href === pathname)
  if (exact) return exact.label
  const nested = [...ORGANIZER_NAV].reverse().find((item) => item.href !== '/organizer' && pathname.startsWith(item.href))
  return nested?.label ?? 'Organiser'
}
