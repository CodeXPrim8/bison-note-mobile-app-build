import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { rateLimit } from '@/lib/api/rate-limit'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/api/v1/gateway')) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    const keyHint = request.headers.get('authorization')?.slice(0, 24) ?? ip
    const limit = pathname.includes('/tickets/initialize') ? 10 : 100
    const windowKey = pathname.includes('/tickets/initialize') ? `init:${ip}` : `gw:${keyHint}`
    const result = rateLimit(windowKey, limit, 60_000)
    if (!result.ok) {
      return NextResponse.json(
        { status: false, message: 'Rate limit exceeded', code: 'RATE_LIMITED' },
        { status: 429, headers: { 'Retry-After': String(result.retryAfterSec) } },
      )
    }

    const isRegister = pathname === '/api/v1/gateway/merchants/register'
    if (!isRegister && !request.headers.get('authorization')) {
      return NextResponse.json(
        { status: false, message: 'Missing Bearer secret_key', code: 'UNAUTHORIZED' },
        { status: 401 },
      )
    }
  }

  return updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|widget/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
