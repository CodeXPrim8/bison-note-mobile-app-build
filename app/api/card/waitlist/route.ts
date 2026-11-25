import { z } from 'zod'
import { handleRouteError, successResponse } from '@/lib/api/errors'
import { requireUser } from '@/lib/api/session'
import { readBuSession } from '@/lib/auth/bu-session'
import { resolveLiveCelebrantId } from '@/lib/events/live'
import { tryCreateAdminClient } from '@/lib/supabase/admin'
import { createDataClient } from '@/lib/supabase/data'

const joinSchema = z.object({
  source: z.string().max(64).optional(),
})

async function liveUserId() {
  const user = await requireUser()
  const session = await readBuSession()
  const liveId =
    (await resolveLiveCelebrantId({
      id: user.id,
      email: user.email,
      phone: session?.phone_e164 || session?.phone || null,
    })) || user.id
  return liveId
}

export async function GET() {
  try {
    const userId = await liveUserId()
    const db = tryCreateAdminClient() ?? createDataClient()
    const { data, error } = await db
      .from('bu_card_waitlist')
      .select('user_id, source, created_at')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw error
    return successResponse({
      joined: Boolean(data?.user_id),
      source: data?.source ?? null,
      created_at: data?.created_at ?? null,
    })
  } catch (error) {
    return handleRouteError(error)
  }
}

export async function POST(request: Request) {
  try {
    const userId = await liveUserId()
    const body = joinSchema.parse(await request.json().catch(() => ({})))
    const source = body.source?.trim() || 'app'
    const db = tryCreateAdminClient() ?? createDataClient()
    const { data, error } = await db
      .from('bu_card_waitlist')
      .upsert(
        { user_id: userId, source },
        { onConflict: 'user_id', ignoreDuplicates: true },
      )
      .select('user_id, source, created_at')
      .maybeSingle()
    if (error) throw error

    if (!data?.user_id) {
      const existing = await db
        .from('bu_card_waitlist')
        .select('user_id, source, created_at')
        .eq('user_id', userId)
        .maybeSingle()
      if (existing.error) throw existing.error
      return successResponse(
        {
          joined: Boolean(existing.data?.user_id),
          source: existing.data?.source ?? source,
          created_at: existing.data?.created_at ?? null,
        },
        'You’re on the list',
      )
    }

    return successResponse(
      {
        joined: true,
        source: data.source ?? source,
        created_at: data.created_at ?? null,
      },
      'You’re on the list',
    )
  } catch (error) {
    return handleRouteError(error)
  }
}
