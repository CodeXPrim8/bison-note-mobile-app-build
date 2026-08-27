import { createClient } from '@/lib/supabase/server'
import { ApiError } from '@/lib/api/errors'
import { isSupabaseConfigured } from '@/lib/env'
import type { Profile } from '@/lib/types/database'
import { profileFromBuSession, readBuSession } from '@/lib/auth/bu-session'

export async function getSessionUser() {
  const legacy = await readBuSession()
  if (legacy) {
    return {
      id: legacy.id,
      email: legacy.email ?? undefined,
      phone: legacy.phone ?? undefined,
      phone_e164: legacy.phone_e164 ?? undefined,
    }
  }
  if (!isSupabaseConfigured()) return null
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  return data.user
}

export async function requireUser() {
  const user = await getSessionUser()
  if (!user) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Sign in required')
  }
  return user
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const legacy = await readBuSession()
  if (legacy && legacy.id === userId) {
    return profileFromBuSession(legacy)
  }
  if (!isSupabaseConfigured()) return null
  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('id, role, display_name, username, phone, phone_e164, email, avatar_url, created_at, updated_at')
    .eq('id', userId)
    .maybeSingle()
  return (data as Profile | null) ?? null
}

export async function requireOrganizer() {
  const user = await requireUser()
  const profile = await getProfile(user.id)
  return { user, profile }
}
