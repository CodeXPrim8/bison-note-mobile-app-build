import { z } from 'zod'
import { handleRouteError, successResponse } from '@/lib/api/errors'
import { requireAdmin } from '@/lib/admin/session'
import { getPlatformSettings, savePlatformSettings, writeAdminAudit } from '@/lib/admin/platform'
import { getBuNairaValue, normalizeSquadFeeRules } from '@/lib/bu-rate'

const squadFeeSchema = z
  .object({
    free_under_naira: z.number().min(0).optional(),
    free_under_per_day: z.number().int().min(0).max(100).optional(),
    pay_in: z
      .object({
        partner_percent: z.number().min(0).max(100).optional(),
        partner_cap_naira: z.number().min(0).nullable().optional(),
        platform_percent: z.number().min(0).max(100).optional(),
      })
      .optional(),
    pay_out: z
      .object({
        partner_percent: z.number().min(0).max(100).optional(),
        partner_cap_naira: z.number().min(0).nullable().optional(),
        platform_percent: z.number().min(0).max(100).optional(),
        stamp_from_naira: z.number().min(0).optional(),
        stamp_naira: z.number().min(0).optional(),
      })
      .optional(),
  })
  .optional()

const schema = z.object({
  bu_naira_value: z.number().positive().max(1000).optional(),
  withdrawal_mode: z.enum(['automatic', 'manual']).optional(),
  squad_fee_rules: squadFeeSchema,
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
    const current = await getPlatformSettings(db)
    const patch = {
      bu_naira_value: body.bu_naira_value,
      withdrawal_mode: body.withdrawal_mode,
      squad_fee_rules: body.squad_fee_rules
        ? normalizeSquadFeeRules({
            ...current.squad_fee_rules,
            ...body.squad_fee_rules,
            pay_in: {
              ...current.squad_fee_rules.pay_in,
              ...(body.squad_fee_rules.pay_in ?? {}),
            },
            pay_out: {
              ...current.squad_fee_rules.pay_out,
              ...(body.squad_fee_rules.pay_out ?? {}),
            },
          })
        : undefined,
    }
    const settings = await savePlatformSettings(patch, db)
    await writeAdminAudit(liveId, 'settings.update', null, body)
    return successResponse({ settings }, 'Settings saved')
  } catch (error) {
    return handleRouteError(error)
  }
}
