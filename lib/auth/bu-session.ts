import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import type { Profile, UserRole } from '@/lib/types/database'
import {
  BU_SESSION_COOKIE,
  BU_SESSION_COOKIE_OPTIONS,
  decodeBuSession,
  encodeBuSession,
  type BuSession,
} from '@/lib/auth/bu-session-token'

export { BU_SESSION_COOKIE, decodeBuSession, type BuSession }

export async function readBuSession(): Promise<BuSession | null> {
  const jar = await cookies()
  return decodeBuSession(jar.get(BU_SESSION_COOKIE)?.value)
}

export async function writeBuSession(session: Omit<BuSession, 'exp'>) {
  const token = await encodeBuSession(session)
  try {
    const jar = await cookies()
    jar.set(BU_SESSION_COOKIE, token, BU_SESSION_COOKIE_OPTIONS)
  } catch {
    // Route handlers that return a custom NextResponse must also Set-Cookie on that response.
  }
  return token
}

export async function attachBuSession<T>(response: NextResponse<T>, session: Omit<BuSession, 'exp'>): Promise<NextResponse<T>> {
  const token = await writeBuSession(session)
  response.cookies.set(BU_SESSION_COOKIE, token, BU_SESSION_COOKIE_OPTIONS)
  return response
}

export async function clearBuSession() {
  const jar = await cookies()
  jar.set(BU_SESSION_COOKIE, '', { ...BU_SESSION_COOKIE_OPTIONS, maxAge: 0 })
}

export function clearBuSessionOn<T>(response: NextResponse<T>): NextResponse<T> {
  response.cookies.set(BU_SESSION_COOKIE, '', { ...BU_SESSION_COOKIE_OPTIONS, maxAge: 0 })
  return response
}

function asRole(role: string | null | undefined): UserRole {
  if (role === 'guest' || role === 'celebrant' || role === 'vendor' || role === 'merchant' || role === 'organizer') {
    return role
  }
  return 'guest'
}

export function profileFromBuSession(session: BuSession): Profile {
  const now = new Date().toISOString()
  return {
    id: session.id,
    role: asRole(session.role),
    display_name: session.display_name || 'ɃU member',
    username: null,
    phone: session.phone,
    phone_e164: session.phone_e164,
    email: session.email,
    avatar_url: null,
    created_at: now,
    updated_at: now,
  }
}
