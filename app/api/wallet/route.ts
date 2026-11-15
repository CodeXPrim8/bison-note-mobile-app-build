import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { getProfile, requireUser } from '@/lib/api/session'
import { initializeDepositSchema } from '@/lib/schemas/ticket'
import { initializeDeposit } from '@/lib/payments/initialize-ticket'
import { fetchLiveWallet, resolveLiveCelebrantId } from '@/lib/events/live'
import { publicBuRates } from '@/lib/bu-rate'
import { contactEmail } from '@/lib/auth/pin'
import { readBuSession } from '@/lib/auth/bu-session'
import { listWalletHistory } from '@/lib/wallet/history'

export async function GET(request: Request) {
  try {
    const user = await requireUser()
    const url = new URL(request.url)
    const includeHistory = url.searchParams.get('history') !== '0'
    const rawLimit = Number(url.searchParams.get('limit') || (includeHistory ? 40 : 0))
    const limit = Math.min(200, Math.max(0, Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 40))
    const fullHistory = url.searchParams.get('full') === '1' || limit >= 100

    const session = await readBuSession()
    const liveId =
      (await resolveLiveCelebrantId({
        id: user.id,
        email: user.email,
        phone: session?.phone_e164 || session?.phone || null,
      })) || user.id

    const [wallet, transactions] = await Promise.all([
      fetchLiveWallet(liveId),
      includeHistory && limit > 0
        ? listWalletHistory(liveId, limit, { full: fullHistory })
        : Promise.resolve([]),
    ])

    return successResponse({
      user_id: liveId,
      wallet,
      rates: publicBuRates(),
      transactions,
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
    const session = await readBuSession()
    const profile = await getProfile(user.id)
    const liveId =
      (await resolveLiveCelebrantId({
        id: user.id,
        email: user.email,
        phone: session?.phone_e164 || session?.phone || profile?.phone_e164 || profile?.phone || null,
      })) || user.id
    const savedEmail = contactEmail(profile?.email) || contactEmail(session?.email) || contactEmail(user.email)
    if (!savedEmail) {
      throw new ApiError(
        400,
        'EMAIL_REQUIRED',
        'This account has no email yet. Add your own email in Settings. New accounts set it when they register.',
      )
    }
    const result = await initializeDeposit({
      email: savedEmail,
      bu: body.bu,
      amount: body.amount,
      user_id: liveId,
      callback_url: body.callback_url,
    })
    return successResponse(result, 'Deposit initialized')
  } catch (error) {
    return handleRouteError(error)
  }
}
