import { createAdminClient } from '@/lib/supabase/admin'
import { handleRouteError, successResponse } from '@/lib/api/errors'
import { requireUser } from '@/lib/api/session'
import type { EventRecord, TicketRecord } from '@/lib/types/database'

export async function GET() {
  try {
    const user = await requireUser()
    const admin = createAdminClient()
    const { data: tickets } = await admin
      .from('tickets')
      .select('*')
      .or(`buyer_user_id.eq.${user.id},buyer_email.eq.${user.email}`)
      .in('status', ['paid', 'checked_in'])
      .order('created_at', { ascending: false })

    const list = (tickets as TicketRecord[]) ?? []
    const eventIds = [...new Set(list.map((ticket) => ticket.event_id))]
    const { data: events } = eventIds.length
      ? await admin.from('events').select('*').in('id', eventIds)
      : { data: [] }
    const eventMap = new Map(((events as EventRecord[]) ?? []).map((event) => [event.id, event]))

    return successResponse(
      list.map((ticket) => ({
        ...ticket,
        event: eventMap.get(ticket.event_id) ?? null,
      })),
    )
  } catch (error) {
    return handleRouteError(error)
  }
}
