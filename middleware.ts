import { BU_CANONICAL_ORIGIN } from '@/lib/brand'
import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { rateLimit } from '@/lib/api/rate-limit'
import { isPublicApiPath, isPublicPagePath, safeNextPath } from '@/lib/auth/paths'

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => to.cookies.set(cookie))
  return to
}

function loginRedirect(request: NextRequest, sessionResponse: NextResponse) {
  const url = request.nextUrl.clone()
  const next = `${request.nextUrl.pathname}${request.nextUrl.search}`
  url.pathname = '/login'
  url.search = ''
  url.searchParams.set('next', safeNextPath(next))
  return copyCookies(sessionResponse, NextResponse.redirect(url))
}

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host')?.split(':')[0] ?? ''
  if (/bu-app\.vercel\.app$/i.test(host)) {
    const url = new URL(request.url)
    url.protocol = 'https:'
    url.host = new URL(BU_CANONICAL_ORIGIN).host
    url.port = ''
    return NextResponse.redirect(url, 308)
  }

  const { pathname } = request.nextUrl
  const { response, user } = await updateSession(request)

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
    const isCheckout = pathname.startsWith('/api/v1/gateway/checkout')
    if (request.method !== 'OPTIONS' && !isRegister && !request.headers.get('authorization') && !request.headers.get('x-bu-key')) {
      return NextResponse.json(
        { status: false, message: isCheckout ? 'Missing Bearer public_key' : 'Missing Bearer secret_key', code: 'UNAUTHORIZED' },
        { status: 401 },
      )
    }
  }

  if (pathname.startsWith('/api/')) {
    if (request.method === 'OPTIONS' || isPublicApiPath(pathname, request.method)) {
      return response
    }
    if (!user) {
      return NextResponse.json(
        { status: false, message: 'Sign in required', code: 'UNAUTHORIZED' },
        { status: 401 },
      )
    }
    return response
  }

  if (pathname === '/login' && user) {
    const next = safeNextPath(request.nextUrl.searchParams.get('next'))
    const url = request.nextUrl.clone()
    url.pathname = next
    url.search = ''
    return copyCookies(response, NextResponse.redirect(url))
  }

  if (!isPublicPagePath(pathname) && !user) {
    return loginRedirect(request, response)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|widget/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
