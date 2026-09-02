import { z } from 'zod'
import { createAdminClient, tryCreateAdminClient } from '@/lib/supabase/admin'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { requireUser } from '@/lib/api/session'
import { getBuNairaValue, quoteWithdrawBu, WalletAmountError } from '@/lib/bu-rate'
import { getPlatformSettings, getUserControl } from '@/lib/admin/platform'
import { createDataClient } from '@/lib/supabase/data'

const schema = z.object({
  amount: z.number().positive().optional(),
  bu: z.number().positive().optional(),
  bank_name: z.string().min(2),
  account_number: z.string().min(6),
  account_name: z.string().min(2),
}).refine((body) => body.bu != null || body.amount != null, {
  message: 'Enter ɃU to withdraw',
})

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const db = tryCreateAdminClient() ?? createDataClient()
    const control = await getUserControl(user.id, db)
    if (control.suspended || control.deleted_at) {
      throw new ApiError(403, 'ACCOUNT_SUSPENDED', 'This ɃU account is suspended.')
    }
    const settings = await getPlatformSettings(db)
    const body = schema.parse(await request.json())
    let quote
    try {
      quote = quoteWithdrawBu(body.bu ?? body.amount ?? 0)
    } catch (error) {
      if (error instanceof WalletAmountError) {
        throw new ApiError(400, error.code, error.message)
      }
      throw error
    }
    const admin = tryCreateAdminClient() ?? createAdminClient()
    const { error } = await admin.rpc('debit_wallet', {
      p_user_id: user.id,
      p_amount: quote.naira,
      p_type: 'withdrawal',
      p_description: `Withdrawal to ${body.bank_name}`,
      p_metadata: {
        bu: quote.bu,
        naira: quote.naira,
        bank_naira: quote.bankNaira,
        paystack_transfer_fee: quote.paystackFee,
        fee_absorbed: true,
        value_rate: getBuNairaValue(),
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
    const status = settings.withdrawal_mode === 'manual' ? 'pending' : 'approved'
    await db.from('bu_withdrawals').insert({
      user_id: user.id,
      bu: quote.bu,
      naira: quote.naira,
      bank_name: body.bank_name,
      account_number: body.account_number,
      account_name: body.account_name,
      status,
      mode: settings.withdrawal_mode,
      reviewed_at: status === 'approved' ? new Date().toISOString() : null,
    })
    return successResponse(
      {
        ok: true,
        bu: quote.bu,
        naira: quote.naira,
        bank_naira: quote.bankNaira,
        paystack_transfer_fee: quote.paystackFee,
        status,
      },
      status === 'pending' ? 'Withdrawal sent for Super Admin approval' : 'Withdrawal queued',
    )
  } catch (error) {
    return handleRouteError(error)
  }
}
