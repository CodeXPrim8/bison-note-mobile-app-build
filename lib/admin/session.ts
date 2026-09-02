import { requireUser } from '@/lib/api/session'
import { readBuSession } from '@/lib/auth/bu-session'
import { resolveLiveCelebrantId } from '@/lib/events/live'
import { requireLiveSuperAdmin } from '@/lib/account/roles'
import { tryCreateAdminClient } from '@/lib/supabase/admin'
import { createDataClient } from '@/lib/supabase/data'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function requireAdmin(): Promise<{
  user: { id: string; email?: string | null }
  liveId: string
  session: Awaited<ReturnType<typeof readBuSession>>
  db: SupabaseClient
}> {
  const user = await requireUser()
  const session = await readBuSession()
  const liveId =
    (await resolveLiveCelebrantId({
      id: user.id,
      email: user.email,
      phone: session?.phone_e164 || session?.phone || null,
    })) || user.id
  await requireLiveSuperAdmin(liveId, session)
  const db = tryCreateAdminClient() ?? createDataClient()
  return { user, liveId, session, db }
}

export function adminDb(): SupabaseClient {
  return tryCreateAdminClient() ?? createDataClient()
}
