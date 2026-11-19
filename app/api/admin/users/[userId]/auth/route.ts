import { z } from 'zod'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { requireAdmin } from '@/lib/admin/session'
import { writeAdminAudit } from '@/lib/admin/platform'
import { adminSetUserPin, readUserAuthSummary, requireAdminPin } from '@/lib/admin/user-auth'
import { pinSchema } from '@/lib/auth/pin'

const unlockSchema = z.object({
  action: z.literal('unlock'),
  admin_pin: pinSchema,
})

const changePasswordFields = {
  admin_pin: pinSchema,
  new_pin: pinSchema,
  confirm_pin: pinSchema.optional(),
}

const setPinSchema = z.object({
  action: z.literal('set_pin'),
  ...changePasswordFields,
})

const changePasswordSchema = z.object({
  action: z.literal('change_password'),
  admin_pin: pinSchema,
  new_pin: pinSchema,
  confirm_pin: pinSchema,
})

const bodySchema = z.discriminatedUnion('action', [unlockSchema, setPinSchema, changePasswordSchema])

export async function POST(request: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    const { db, liveId, session } = await requireAdmin()
    const { userId } = await context.params
    if (!userId) throw new ApiError(400, 'INVALID_USER', 'Missing user id')
    const body = bodySchema.parse(await request.json())
    const adminPhone = session?.phone_e164 || session?.phone || null
    await requireAdminPin(adminPhone, body.admin_pin)

    if (body.action === 'unlock') {
      const summary = await readUserAuthSummary(db, userId)
      await writeAdminAudit(liveId, 'user.auth.unlock', userId, { pin_set: summary.pin_set })
      return successResponse(
        {
          unlocked: true,
          ...summary,
        },
        'Auth unlocked',
      )
    }

    if (body.confirm_pin != null && body.confirm_pin !== body.new_pin) {
      throw new ApiError(400, 'PIN_MISMATCH', 'New password and confirmation do not match.')
    }

    const summary = await readUserAuthSummary(db, userId)
    const result = await adminSetUserPin({
      db,
      userId,
      phone: summary.phone,
      email: summary.email,
      newPin: body.new_pin,
    })
    await writeAdminAudit(liveId, 'user.auth.change_password', userId, {
      pin_set: true,
      auth_updated: result.auth_updated,
    })
    const next = await readUserAuthSummary(db, userId)
    return successResponse(
      {
        unlocked: true,
        ...next,
        pin_updated: true,
        password_updated: true,
        auth_updated: result.auth_updated,
      },
      'Password updated',
    )
  } catch (error) {
    return handleRouteError(error)
  }
}
