import { z } from 'zod'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { requireAdmin } from '@/lib/admin/session'
import { displayNameFromUser, getPlatformSettings, savePlatformSettings, writeAdminAudit } from '@/lib/admin/platform'

const actionSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(['approve', 'reject']),
  note: z.string().max(300).optional(),
})

const modeSchema = z.object({
  withdrawal_mode: z.enum(['automatic', 'manual']),
})

export async function GET() {
  try {
    const { db } = await requireAdmin()
    const settings = await getPlatformSettings(db)
    const { data, error } = await db.from('bu_withdrawals').select('*').order('created_at', { ascending: false }).limit(200)
    const rows = error ? [] : ((data ?? []) as Array<Record<string, unknown>>)
    const ids = [...new Set(rows.map((row) => String(row.user_id ?? '')).filter(Boolean))]
    const users =
      ids.length > 0
        ? await db.from('users').select('id, first_name, last_name, account_name, phone_number').in('id', ids)
        : { data: [] as unknown[] }
    const userMap = new Map<string, Record<string, unknown>>()
    for (const row of (users.data ?? []) as Array<Record<string, unknown>>) userMap.set(String(row.id), row)
    return successResponse({
      settings,
      withdrawals: rows.map((row) => ({
        ...row,
        user_name: userMap.get(String(row.user_id)) ? displayNameFromUser(userMap.get(String(row.user_id))!) : 'User',
        user_phone: userMap.get(String(row.user_id))?.phone_number ?? null,
      })),
    })
  } catch (error) {
    return handleRouteError(error)
  }
}

export async function PATCH(request: Request) {
  try {
    const { db, liveId } = await requireAdmin()
    const json = await request.json()
    if (json && typeof json === 'object' && 'withdrawal_mode' in json && !('id' in json)) {
      const body = modeSchema.parse(json)
      const settings = await savePlatformSettings({ withdrawal_mode: body.withdrawal_mode }, db)
      await writeAdminAudit(liveId, 'withdrawals.mode', null, body)
      return successResponse({ settings }, `Withdrawals set to ${body.withdrawal_mode}`)
    }
    const body = actionSchema.parse(json)
    const existing = await db.from('bu_withdrawals').select('*').eq('id', body.id).maybeSingle()
    if (!existing.data) throw new ApiError(404, 'NOT_FOUND', 'Withdrawal not found')
    const row = existing.data as Record<string, unknown>
    if (String(row.status) !== 'pending') throw new ApiError(400, 'NOT_PENDING', 'This withdrawal is already handled')
    if (body.action === 'reject') {
      const { error } = await db.rpc('credit_wallet', {
        p_user_id: row.user_id,
        p_amount: Number(row.naira),
        p_type: 'refund',
        p_description: 'Withdrawal rejected',
        p_metadata: { withdrawal_id: body.id, admin: liveId },
      })
      if (error) throw new ApiError(500, 'REFUND_FAILED', error.message)
    }
    const { error } = await db
      .from('bu_withdrawals')
      .update({
        status: body.action === 'approve' ? 'approved' : 'rejected',
        note: body.note ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', body.id)
    if (error) throw new ApiError(500, 'UPDATE_FAILED', error.message)
    await writeAdminAudit(liveId, `withdrawals.${body.action}`, body.id, body)
    return successResponse({ ok: true }, body.action === 'approve' ? 'Withdrawal approved' : 'Withdrawal rejected and refunded')
  } catch (error) {
    return handleRouteError(error)
  }
}
