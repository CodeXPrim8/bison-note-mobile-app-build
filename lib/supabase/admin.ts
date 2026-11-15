import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getServiceRoleKey, getSupabasePublicConfig, isServiceRoleConfigured, isSupabaseConfigured } from '@/lib/env'

let adminSingleton: SupabaseClient | null | undefined

/** Service-role client. Never import this into Client Components. Reuses one client per process. */
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
  if (adminSingleton === undefined) {
    try {
      adminSingleton = createAdminClient()
    } catch {
      adminSingleton = null
    }
  }
  return adminSingleton
}
