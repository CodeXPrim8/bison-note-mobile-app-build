import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { getProfile, requireUser } from '@/lib/api/session'
import { initializeDepositSchema } from '@/lib/schemas/ticket'
import { initializeDeposit } from '@/lib/payments/initialize-ticket'
import { fetchLiveWallet } from '@/lib/events/live'
import { publicBuRates } from '@/lib/bu-rate'
import { contactEmail } from '@/lib/auth/pin'
import { createDataClient } from '@/lib/supabase/data'

export async function GET() {
  try {
    const user = await requireUser()
    const wallet = await fetchLiveWallet(user.id)
    const db = createDataClient()
    const txs = await db
      .from('bu_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)
    return successResponse({
      wallet,
      rates: publicBuRates(),
      transactions: txs.error ? [] : (txs.data ?? []),
    })
  } catch (error) {
    return handleRouteError(error)
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const json: unknown = await request.json()
    const body = initializeDepositSchema.parse(json)
    const profile = await getProfile(user.id)
    const allowed = [contactEmail(profile?.email), contactEmail(user.email)].filter(
      (value): value is string => Boolean(value),
    )
    const payEmail = body.email.trim().toLowerCase()
    if (allowed.length > 0 && !allowed.includes(payEmail)) {
      throw new ApiError(400, 'EMAIL_MISMATCH', 'Use the email saved on your account')
    }
    const result = await initializeDeposit({
      email: body.email,
      bu: body.bu,
      amount: body.amount,
      user_id: user.id,
      callback_url: body.callback_url,
    })
    return successResponse(result, 'Deposit initialized')
  } catch (error) {
    return handleRouteError(error)
  }
}
