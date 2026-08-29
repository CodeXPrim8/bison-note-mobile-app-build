import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { requireUser } from '@/lib/api/session'
import { BU_NAIRA_VALUE, quoteWithdrawBu, WalletAmountError } from '@/lib/bu-rate'

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
    const admin = createAdminClient()
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
        value_rate: BU_NAIRA_VALUE,
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
    return successResponse(
      {
        ok: true,
        bu: quote.bu,
        naira: quote.naira,
        bank_naira: quote.bankNaira,
        paystack_transfer_fee: quote.paystackFee,
      },
      'Withdrawal queued',
    )
  } catch (error) {
    return handleRouteError(error)
  }
}
