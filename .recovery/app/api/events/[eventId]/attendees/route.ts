import { createAdminClient } from '@/lib/supabase/admin'
import { ApiError, handleRouteError, successResponse } from '@/lib/api/errors'
import { requireUser } from '@/lib/api/session'
import type { EventRecord, TicketRecord } from '@/lib/types/database'

export async function GET(
  _request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  try {
    const user = await requireUser()
    const { eventId } = await context.params
    const admin = createAdminClient()
    const { data: event } = await admin.from('events').select('*').eq('id', eventId).maybeSingle()
    if (!event || (event as EventRecord).organizer_id !== user.id) {
      throw new ApiError(404, 'NOT_FOUND', 'Event not found')
    }
    const { data: tickets } = await admin
      .from('tickets')
      .select('*')
      .eq('event_id', eventId)
      .in('status', ['paid', 'checked_in', 'refunded'])
      .order('created_at', { ascending: false })

    return successResponse({ event, attendees: (tickets as TicketRecord[]) ?? [] })
  } catch (error) {
    return handleRouteError(error)
  }
}
