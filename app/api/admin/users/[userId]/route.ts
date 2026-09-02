import { z } from 'zod'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { requireAdmin } from '@/lib/admin/session'
import { upsertUserControl, writeAdminAudit } from '@/lib/admin/platform'
import { getAccountRoles, enableAccountRole } from '@/lib/account/roles'
import { getAdminUser } from '@/lib/admin/users'
import { getBuNairaValue } from '@/lib/bu-rate'
import { normalizePhone } from '@/lib/phone'

const patchSchema = z.object({
  first_name: z.string().min(1).max(80).optional(),
  last_name: z.string().max(80).optional(),
  account_name: z.string().max(120).optional(),
  email: z.union([z.string().email(), z.literal(''), z.null()]).optional(),
  phone: z.string().min(7).optional(),
  role: z.enum(['guest', 'celebrant', 'vendor', 'merchant', 'organizer']).optional(),
  organizer: z.boolean().optional(),
  affiliate: z.boolean().optional(),
  suspended: z.boolean().optional(),
  organizer_suspended: z.boolean().optional(),
  note: z.string().max(500).optional(),
  credit_naira: z.number().optional(),
})

export async function GET(_request: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    const { db } = await requireAdmin()
    const { userId } = await context.params
    const listed = await getAdminUser(db, userId)
    if (!listed) throw new ApiError(404, 'NOT_FOUND', 'User not found')
    const [txRes, roles] = await Promise.all([
      db.from('bu_transactions').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(80),
      getAccountRoles(userId),
    ])
    const naira = listed.naira
    const rate = getBuNairaValue()
    return successResponse({
      user: {
        id: listed.id,
        name: listed.name,
        first_name: listed.first_name,
        last_name: listed.last_name,
        account_name: listed.name,
        email: listed.email,
        phone_number: listed.phone,
        role: listed.role,
        roles: listed.roles,
      },
      wallet: {
        naira,
        bu: naira / (rate || 1),
      },
      roles: {
        ...roles,
        is_organizer: listed.is_organizer || roles.is_organizer,
        is_affiliate: listed.is_affiliate || roles.is_affiliate,
        is_super_admin: listed.is_super_admin || roles.is_super_admin,
        affiliate_code: listed.affiliate_code || roles.affiliate_code,
      },
      control: {
        user_id: userId,
        suspended: listed.suspended,
        organizer_suspended: listed.organizer_suspended,
        deleted_at: listed.deleted_at,
        note: listed.note,
      },
      transactions: txRes.error ? [] : (txRes.data ?? []),
    })
  } catch (error) {
    return handleRouteError(error)
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    const { db, liveId } = await requireAdmin()
    const { userId } = await context.params
    const body = patchSchema.parse(await request.json())
    const updates: Record<string, unknown> = {}
    if (body.first_name) updates.first_name = body.first_name.trim()
    if (body.last_name !== undefined) updates.last_name = body.last_name.trim() || null
    if (body.account_name) updates.account_name = body.account_name.trim()
    if (body.email !== undefined) updates.email = body.email || null
    if (body.role) updates.role = body.role
    if (body.phone) {
      const phone = normalizePhone(body.phone)
      if (!phone) throw new ApiError(400, 'INVALID_BU_ID', 'Enter a valid ɃU ID')
      updates.phone_number = phone
    }
    if (body.first_name || body.last_name !== undefined) {
      const current = await db.from('users').select('first_name, last_name').eq('id', userId).maybeSingle()
      const first = body.first_name ?? String((current.data as { first_name?: string } | null)?.first_name ?? '')
      const last = body.last_name ?? String((current.data as { last_name?: string } | null)?.last_name ?? '')
      updates.account_name = [first, last].filter(Boolean).join(' ')
    }
    if (Object.keys(updates).length) {
      const { error } = await db.from('users').update(updates).eq('id', userId)
      if (error) throw new ApiError(500, 'UPDATE_FAILED', error.message)
    }
    if (body.organizer) await enableAccountRole(userId, 'organizer')
    if (body.affiliate) await enableAccountRole(userId, 'affiliate')
    if (
      body.suspended !== undefined ||
      body.organizer_suspended !== undefined ||
      body.note !== undefined
    ) {
      await upsertUserControl(
        userId,
        {
          suspended: body.suspended,
          organizer_suspended: body.organizer_suspended,
          note: body.note,
        },
        db,
      )
    }
    if (typeof body.credit_naira === 'number' && body.credit_naira !== 0) {
      const amount = Math.abs(body.credit_naira)
      const rpc = body.credit_naira > 0 ? 'credit_wallet' : 'debit_wallet'
      const { error } = await db.rpc(rpc, {
        p_user_id: userId,
        p_amount: amount,
        p_type: body.credit_naira > 0 ? 'deposit' : 'withdrawal',
        p_description: 'Super Admin adjustment',
        p_metadata: { admin: liveId },
      })
      if (error) throw new ApiError(500, 'WALLET_ADJUST_FAILED', error.message)
    }
    await writeAdminAudit(liveId, 'user.update', userId, body as Record<string, unknown>)
    return successResponse({ ok: true }, 'Saved')
  } catch (error) {
    return handleRouteError(error)
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    const { db, liveId } = await requireAdmin()
    const { userId } = await context.params
    if (userId === liveId) throw new ApiError(400, 'CANNOT_DELETE_SELF', 'You cannot delete your own Super Admin account')
    await upsertUserControl(
      userId,
      {
        suspended: true,
        organizer_suspended: true,
        deleted_at: new Date().toISOString(),
        note: 'Removed from ɃU by Super Admin',
      },
      db,
    )
    await db.from('users').update({ role: 'guest' }).eq('id', userId)
    await writeAdminAudit(liveId, 'user.delete', userId)
    return successResponse({ ok: true }, 'User removed from ɃU')
  } catch (error) {
    return handleRouteError(error)
  }
}
