import { z } from 'zod'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { requireAdmin } from '@/lib/admin/session'
import { displayNameFromUser, listUserControls, upsertUserControl, writeAdminAudit } from '@/lib/admin/platform'

const patchSchema = z.object({
  public: z.boolean().optional(),
  suspend_organizer: z.boolean().optional(),
})

export async function GET() {
  try {
    const { db } = await requireAdmin()
    const { data, error } = await db
      .from('events')
      .select('id, name, is_public, celebrant_id, date, location, image_url, created_at')
      .order('date', { ascending: false })
      .limit(400)
    if (error) throw new ApiError(503, 'EVENTS_UNAVAILABLE', error.message)
    const events = (data ?? []) as Array<Record<string, unknown>>
    const ownerIds = [...new Set(events.map((row) => String(row.celebrant_id || row.organizer_id || '')).filter(Boolean))]
    const users =
      ownerIds.length > 0
        ? await db.from('users').select('id, first_name, last_name, account_name, phone_number, role').in('id', ownerIds)
        : { data: [] as unknown[], error: null }
    const userMap = new Map<string, Record<string, unknown>>()
    for (const row of (users.data ?? []) as Array<Record<string, unknown>>) {
      userMap.set(String(row.id), row)
    }
    const controls = await listUserControls(db)
    const controlMap = new Map(controls.map((row) => [row.user_id, row]))
    return successResponse({
      events: events.map((row) => {
        const ownerId = String(row.celebrant_id || row.organizer_id || '')
        const owner = userMap.get(ownerId)
        const control = controlMap.get(ownerId)
        return {
          id: row.id,
          title: row.name,
          is_public: row.is_public !== false,
          date: row.date,
          location: row.location,
          cover: row.image_url,
          organizer_id: ownerId,
          organizer_name: owner ? displayNameFromUser(owner) : 'Unknown',
          organizer_phone: owner?.phone_number ?? null,
          organizer_suspended: Boolean(control?.organizer_suspended),
        }
      }),
    })
  } catch (error) {
    return handleRouteError(error)
  }
}

export async function PATCH(request: Request) {
  try {
    const { db, liveId } = await requireAdmin()
    const body = z.object({ event_id: z.string().uuid(), ...patchSchema.shape }).parse(await request.json())
    const existing = await db.from('events').select('*').eq('id', body.event_id).maybeSingle()
    if (!existing.data) throw new ApiError(404, 'NOT_FOUND', 'Event not found')
    const row = existing.data as Record<string, unknown>
    const ownerId = String(row.celebrant_id || row.organizer_id || '')
    if (body.public !== undefined) {
      const { error } = await db
        .from('events')
        .update({
          is_public: body.public,
          strictly_by_invitation: !body.public,
        })
        .eq('id', body.event_id)
      if (error) throw new ApiError(500, 'UPDATE_FAILED', error.message)
    }
    if (body.suspend_organizer !== undefined && ownerId) {
      await upsertUserControl(ownerId, { organizer_suspended: body.suspend_organizer }, db)
    }
    await writeAdminAudit(liveId, 'event.update', body.event_id, body)
    return successResponse({ ok: true }, body.public === false ? 'Removed from public' : 'Saved')
  } catch (error) {
    return handleRouteError(error)
  }
}
