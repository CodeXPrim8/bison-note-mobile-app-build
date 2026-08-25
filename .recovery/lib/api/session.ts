import { createClient } from '@/lib/supabase/server'
import { ApiError } from '@/lib/api/errors'
import type { Profile } from '@/lib/types/database'

export async function getSessionUser() {
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
  const supabase = await createClient()
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  return (data as Profile | null) ?? null
}
