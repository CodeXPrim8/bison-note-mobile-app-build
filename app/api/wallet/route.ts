import { handleRouteError, successResponse } from '@/lib/api/errors'
import { getProfile, requireUser } from '@/lib/api/session'
import { initializeDepositSchema } from '@/lib/schemas/ticket'
import { initializeDeposit } from '@/lib/payments/initialize-ticket'
import { fetchLiveWallet, resolveLiveCelebrantId } from '@/lib/events/live'
import { publicBuRates } from '@/lib/bu-rate'
import { readBuSession } from '@/lib/auth/bu-session'
import { getPlatformSettings } from '@/lib/admin/platform'
import { listWalletHistory } from '@/lib/wallet/history'

export async function GET() {
  try {
    const user = await requireUser()
    await getPlatformSettings()
    const session = await readBuSession()
    const liveId =
      (await resolveLiveCelebrantId({
        id: user.id,
        email: user.email,
        phone: session?.phone_e164 || session?.phone || null,
      })) || user.id
    const wallet = await fetchLiveWallet(liveId)
    const transactions = await listWalletHistory(liveId, 200)
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
    const result = await initializeDeposit({
      email: body.email.trim().toLowerCase(),
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
