import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { BU_SESSION_COOKIE, decodeBuSession } from '@/lib/auth/bu-session-token'

/** Single session helper for Edge middleware: ɃU PIN cookie, then Supabase. */
export async function updateSession(request: NextRequest): Promise<{
  response: NextResponse
  user: User | null
}> {
  let supabaseResponse = NextResponse.next({ request })

  const legacy = await decodeBuSession(request.cookies.get(BU_SESSION_COOKIE)?.value)
  if (legacy) {
    return {
      response: supabaseResponse,
      user: { id: legacy.id, email: legacy.email ?? undefined } as User,
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    return { response: supabaseResponse, user: null }
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options)
        })
      },
    },
  })

  const { data } = await supabase.auth.getUser()
  return { response: supabaseResponse, user: data.user }
}
