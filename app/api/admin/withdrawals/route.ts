import { z } from 'zod'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { requireAdmin } from '@/lib/admin/session'
import { displayNameFromUser, getPlatformSettings, savePlatformSettings, writeAdminAudit } from '@/lib/admin/platform'
import { isPaystackConfigured } from '@/lib/env'
import { moveLiveWallet } from '@/lib/wallet/move'
import { markWithdrawalFailed, paystackPayoutMessage, publicWithdrawalLabel, sendWithdrawalPayout } from '@/lib/wallet/payout'

const actionSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(['approve', 'reject', 'retry']),
  note: z.string().max(300).optional(),
})

const modeSchema = z.object({
  withdrawal_mode: z.enum(['automatic', 'manual']),
})

function canPayout(status: string, row: Record<string, unknown>) {
  if (status === 'payout_failed') return true
  if (status === 'pending') return true
  if (status === 'approved' && !row.paid_at && !row.paystack_reference) return true
  return false
}

function canReject(status: string, row: Record<string, unknown>) {
  if (status === 'pending' || status === 'payout_failed') return true
  if (status === 'approved' && !row.paid_at && !row.paystack_reference) return true
  return false
}

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
      paystack_ready: isPaystackConfigured(),
      withdrawals: rows.map((row) => ({
        ...row,
        label: publicWithdrawalLabel(String(row.status ?? '')),
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
    const status = String(row.status)
    if (status === 'paid') throw new ApiError(400, 'ALREADY_PAID', 'This withdrawal is already paid')
    if (status === 'rejected' || status === 'failed') {
      throw new ApiError(400, 'ALREADY_HANDLED', 'This withdrawal is already closed')
    }

    if (body.action === 'reject') {
      if (!canReject(status, row)) throw new ApiError(400, 'NOT_PENDING', 'This withdrawal cannot be refunded')
      await moveLiveWallet(db, {
        userId: String(row.user_id),
        naira: Number(row.naira),
        direction: 'credit',
        type: 'refund',
        description: 'Withdrawal rejected',
        metadata: { withdrawal_id: body.id, admin: liveId, note: body.note ?? null },
      })
      const { error } = await db
        .from('bu_withdrawals')
        .update({
          status: 'rejected',
          note: body.note ?? null,
          transfer_error: null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', body.id)
      if (error && !/column|schema cache/i.test(error.message)) throw new ApiError(500, 'UPDATE_FAILED', error.message)
      if (error) {
        await db
          .from('bu_withdrawals')
          .update({ status: 'rejected', note: body.note ?? null, reviewed_at: new Date().toISOString() })
          .eq('id', body.id)
      }
      await writeAdminAudit(liveId, 'withdrawals.reject', body.id, body)
      return successResponse({ ok: true }, 'Withdrawal rejected and refunded')
    }

    if (!canPayout(status, row)) throw new ApiError(400, 'NOT_PENDING', 'This withdrawal is already handled')
    if (!isPaystackConfigured()) {
      throw new ApiError(503, 'PAYSTACK_REQUIRED', 'Add the live Paystack secret and enable Transfers, then retry.')
    }
    try {
      const payout = await sendWithdrawalPayout(row, db)
      await writeAdminAudit(liveId, `withdrawals.${body.action}`, body.id, { ...body, reference: payout.reference })
      return successResponse(
        { ok: true, status: payout.status, reference: payout.reference },
        payout.status === 'paid' ? 'Naira sent to the guest bank' : 'Paystack transfer started',
      )
    } catch (error) {
      const message = paystackPayoutMessage(error)
      await markWithdrawalFailed(body.id, message, db)
      throw new ApiError(502, 'PAYOUT_FAILED', message)
    }
  } catch (error) {
    return handleRouteError(error)
  }
}
