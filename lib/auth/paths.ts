/** Paths anyone can open without a ɃU session. Everything else requires login. */
export function isPublicPagePath(pathname: string): boolean {
  if (pathname === '/') return true
  if (pathname === '/login') return true
  if (pathname === '/events' || pathname.startsWith('/events/')) return true
  if (pathname.startsWith('/checkout')) return true
  if (pathname.startsWith('/pay')) return true
  if (pathname.startsWith('/t/')) return true
  if (pathname === '/gateway') return true
  if (pathname === '/gateway/docs') return true
  if (
    pathname === '/icon' ||
    pathname === '/apple-icon' ||
    pathname.startsWith('/icon/') ||
    pathname.startsWith('/apple-icon') ||
    pathname.startsWith('/opengraph-image') ||
    pathname.startsWith('/twitter-image')
  ) {
    return true
  }
  return false
}

export function isPublicApiPath(pathname: string, method: string): boolean {
  if (pathname.startsWith('/api/auth/')) return true
  if (pathname.startsWith('/api/webhooks/')) return true
  if (pathname.startsWith('/api/cron/')) return true
  if (pathname.startsWith('/api/v1/gateway')) return true
  if (pathname === '/api/me' && method === 'GET') return true
  if (pathname === '/api/events' && method === 'GET') return true
  if (pathname.startsWith('/api/events/slug/') && method === 'GET') return true
  if (pathname === '/api/tickets/quote' && method === 'POST') return true
  return false
}

/** Block open-redirects after login. */
export function safeNextPath(next: string | null | undefined, fallback = '/app'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return fallback
  }
  return next
}
