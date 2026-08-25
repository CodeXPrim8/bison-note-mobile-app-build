import { createAdminClient } from '@/lib/supabase/admin'
import { ApiError, handleRouteError, successResponse } from '@/lib/api/errors'
import type { EventRecord, TicketTier } from '@/lib/types/database'

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await context.params
    const admin = createAdminClient()
    const { data: event } = await admin.from('events').select('*').eq('slug', slug).maybeSingle()
    if (!event) throw new ApiError(404, 'NOT_FOUND', 'Event not found')
    const record = event as EventRecord
    const { data: tiers } = await admin.from('ticket_tiers').select('*').eq('event_id', record.id)
    let organizerName = record.celebrant_name
    if (record.organizer_id) {
      const { data: profile } = await admin
        .from('profiles')
        .select('display_name')
        .eq('id', record.organizer_id)
        .maybeSingle()
      organizerName = organizerName ?? (profile?.display_name as string | undefined) ?? null
    }
    return successResponse({
      ...record,
      organizer_name: organizerName,
      ticket_tiers: (tiers as TicketTier[]) ?? [],
    })
  } catch (error) {
    return handleRouteError(error)
  }
}
