import { z } from 'zod'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { requireAdmin } from '@/lib/admin/session'
import { writeAdminAudit } from '@/lib/admin/platform'
import { AD_SLOTS } from '@/lib/admin/ad-slots'

const slotIds = AD_SLOTS.map((item) => item.id) as [string, ...string[]]

const adSchema = z.object({
  slot: z.enum(slotIds),
  title: z.string().min(1).max(80),
  body: z.string().max(240).optional().default(''),
  image_url: z.string().url().optional().or(z.literal('')),
  href: z.string().url().optional().or(z.literal('')),
  active: z.boolean().optional().default(true),
})

export async function GET() {
  try {
    const { db } = await requireAdmin()
    const { data, error } = await db.from('bu_ads').select('*').order('sort_order', { ascending: true }).limit(200)
    if (error) throw new ApiError(503, 'ADS_SQL_REQUIRED', 'Run supabase/migrations/0016_super_admin_control.sql in the live SQL editor.')
    return successResponse({ slots: AD_SLOTS, ads: data ?? [] })
  } catch (error) {
    return handleRouteError(error)
  }
}

export async function POST(request: Request) {
  try {
    const { db, liveId } = await requireAdmin()
    const body = adSchema.parse(await request.json())
    const { data, error } = await db
      .from('bu_ads')
      .insert({
        slot: body.slot,
        title: body.title,
        body: body.body ?? '',
        image_url: body.image_url || null,
        href: body.href || null,
        active: body.active ?? true,
      })
      .select('*')
      .maybeSingle()
    if (error || !data) throw new ApiError(503, 'ADS_SQL_REQUIRED', error?.message ?? 'Could not save advert')
    await writeAdminAudit(liveId, 'ads.create', String((data as { id: string }).id), body)
    return successResponse({ ad: data }, 'Advert published', 201)
  } catch (error) {
    return handleRouteError(error)
  }
}

export async function PATCH(request: Request) {
  try {
    const { db, liveId } = await requireAdmin()
    const json = z.object({ id: z.string().uuid() }).and(adSchema.partial()).parse(await request.json())
    const { id, ...patch } = json
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (patch.slot) updates.slot = patch.slot
    if (patch.title) updates.title = patch.title
    if (patch.body !== undefined) updates.body = patch.body
    if (patch.image_url !== undefined) updates.image_url = patch.image_url || null
    if (patch.href !== undefined) updates.href = patch.href || null
    if (patch.active !== undefined) updates.active = patch.active
    const { error } = await db.from('bu_ads').update(updates).eq('id', id)
    if (error) throw new ApiError(500, 'UPDATE_FAILED', error.message)
    await writeAdminAudit(liveId, 'ads.update', id, patch)
    return successResponse({ ok: true }, 'Advert saved')
  } catch (error) {
    return handleRouteError(error)
  }
}

export async function DELETE(request: Request) {
  try {
    const { db, liveId } = await requireAdmin()
    const { id } = z.object({ id: z.string().uuid() }).parse(await request.json())
    const { error } = await db.from('bu_ads').delete().eq('id', id)
    if (error) throw new ApiError(500, 'DELETE_FAILED', error.message)
    await writeAdminAudit(liveId, 'ads.delete', id)
    return successResponse({ ok: true }, 'Advert removed')
  } catch (error) {
    return handleRouteError(error)
  }
}
