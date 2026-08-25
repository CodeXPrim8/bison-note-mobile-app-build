import { createClient } from '@supabase/supabase-js'
import { getServiceRoleKey, getSupabasePublicConfig, isServiceRoleConfigured, isSupabaseConfigured } from '@/lib/env'

/** Service-role client. Never import this into Client Components. */
export function createAdminClient() {
  const { url } = getSupabasePublicConfig()
  return createClient(url, getServiceRoleKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

export function tryCreateAdminClient() {
  if (!isSupabaseConfigured() || !isServiceRoleConfigured()) return null
  return createAdminClient()
}
