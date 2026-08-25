import { createAdminClient } from '@/lib/supabase/admin'
import { ApiError, handleRouteError, successResponse } from '@/lib/api/errors'
import { requireUser } from '@/lib/api/session'
import { initializeDepositSchema } from '@/lib/schemas/ticket'
import { initializeDeposit } from '@/lib/payments/initialize-ticket'
import type { Wallet } from '@/lib/types/database'

export async function GET() {
  try {
    const user = await requireUser()
    const admin = createAdminClient()
    const { data: wallet } = await admin.from('wallets').select('*').eq('user_id', user.id).maybeSingle()
    const { data: txs } = await admin
      .from('bu_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)
    return successResponse({ wallet: (wallet as Wallet | null) ?? null, transactions: txs ?? [] })
  } catch (error) {
    return handleRouteError(error)
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const json: unknown = await request.json()
    const body = initializeDepositSchema.parse(json)
    if (body.email !== user.email) {
      throw new ApiError(400, 'EMAIL_MISMATCH', 'Use the signed-in email')
    }
    const result = await initializeDeposit({
      email: body.email,
      amount: body.amount,
      user_id: user.id,
      callback_url: body.callback_url,
    })
    return successResponse(result, 'Deposit initialized')
  } catch (error) {
    return handleRouteError(error)
  }
}
