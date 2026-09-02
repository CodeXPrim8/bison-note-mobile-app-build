import { z } from 'zod'
import { handleRouteError, successResponse } from '@/lib/api/errors'
import { requireAdmin } from '@/lib/admin/session'
import { getPlatformSettings, savePlatformSettings, writeAdminAudit } from '@/lib/admin/platform'
import { getBuNairaValue } from '@/lib/bu-rate'

const schema = z.object({
  bu_naira_value: z.number().positive().max(1000).optional(),
  withdrawal_mode: z.enum(['automatic', 'manual']).optional(),
})

export async function GET() {
  try {
    const { db } = await requireAdmin()
    const settings = await getPlatformSettings(db)
    return successResponse({ settings, rate: getBuNairaValue() })
  } catch (error) {
    return handleRouteError(error)
  }
}

export async function PATCH(request: Request) {
  try {
    const { db, liveId } = await requireAdmin()
    const body = schema.parse(await request.json())
    const settings = await savePlatformSettings(body, db)
    await writeAdminAudit(liveId, 'settings.update', null, body)
    return successResponse({ settings }, 'Settings saved')
  } catch (error) {
    return handleRouteError(error)
  }
}
