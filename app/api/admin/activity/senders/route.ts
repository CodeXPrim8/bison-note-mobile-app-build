import { handleRouteError, successResponse } from '@/lib/api/errors'
import { requireAdmin } from '@/lib/admin/session'
import { listTopSenders, type SendActivityWindow } from '@/lib/admin/send-activity'

const WINDOWS = new Set<SendActivityWindow>([7, 14, 30, 90])

export async function GET(request: Request) {
  try {
    const { db } = await requireAdmin()
    const url = new URL(request.url)
    const daysRaw = Number(url.searchParams.get('days') ?? 30)
    const limitRaw = Number(url.searchParams.get('limit') ?? 40)
    const days = (WINDOWS.has(daysRaw as SendActivityWindow) ? daysRaw : 30) as SendActivityWindow
    const limit = Math.min(100, Math.max(5, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 40))

    const result = await listTopSenders(db, { days, limit })

    return successResponse({
      window_days: result.window_days,
      scanned: result.scanned,
      senders: result.senders,
    })
  } catch (error) {
    return handleRouteError(error)
  }
}
