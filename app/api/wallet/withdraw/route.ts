import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { requireUser } from '@/lib/api/session'

const schema = z.object({
  amount: z.number().positive(),
  bank_name: z.string().min(2),
  account_number: z.string().min(6),
  account_name: z.string().min(2),
})

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = schema.parse(await request.json())
    const admin = createAdminClient()
    const { error } = await admin.rpc('debit_wallet', {
      p_user_id: user.id,
      p_amount: body.amount,
      p_type: 'withdrawal',
      p_description: `Withdrawal to ${body.bank_name}`,
      p_metadata: {
        bank_name: body.bank_name,
        account_number_last4: body.account_number.slice(-4),
        account_name: body.account_name,
      },
    })
    if (error) {
      if (error.message?.includes('INSUFFICIENT_FUNDS')) {
        throw new ApiError(400, 'INSUFFICIENT_FUNDS', 'Not enough ɃU')
      }
      throw new ApiError(500, 'WITHDRAW_FAILED', error.message)
    }
    return successResponse({ ok: true }, 'Withdrawal queued')
  } catch (error) {
    return handleRouteError(error)
  }
}
