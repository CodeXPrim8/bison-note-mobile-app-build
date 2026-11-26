import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { getProfile, requireUser } from '@/lib/api/session'
import { initializeDepositSchema } from '@/lib/schemas/ticket'
import { initializeDeposit } from '@/lib/payments/initialize-ticket'
import { fetchLiveWallet, resolveLiveCelebrantId } from '@/lib/events/live'
import { publicBuRates } from '@/lib/bu-rate'
import { contactEmail } from '@/lib/auth/pin'
import { readBuSession } from '@/lib/auth/bu-session'
import { listWalletHistory } from '@/lib/wallet/history'
import { getPlatformSettings } from '@/lib/admin/platform'
import { createDataClient } from '@/lib/supabase/data'
import { tryCreateAdminClient } from '@/lib/supabase/admin'
import { freeUnderRemaining, sumUnderFreeBankVolumeToday } from '@/lib/wallet/free-quota'
import { isPaystackConfigured } from '@/lib/env'

export async function GET(request: Request) {
  try {
    const user = await requireUser()
    const url = new URL(request.url)
    const includeHistory = url.searchParams.get('history') !== '0'
    const lite = url.searchParams.get('lite') === '1'
    const rawLimit = Number(url.searchParams.get('limit') || (includeHistory ? 40 : 0))
    const limit = Math.min(200, Math.max(0, Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 40))
    // Always merge ledger sources so tips / sprays / event sprays / POS appear.
    const fullHistory = includeHistory

    const session = await readBuSession()
    const liveId =
      (await resolveLiveCelebrantId({
        id: user.id,
        email: user.email,
        phone: session?.phone_e164 || session?.phone || null,
      })) || user.id

    // Notifications / badge refreshes only need movement rows — skip wallet + fee settings.
    if (lite) {
      const transactions =
        includeHistory && limit > 0
          ? await listWalletHistory(liveId, limit, { full: fullHistory })
          : []
      return successResponse({
        user_id: liveId,
        transactions,
      })
    }

    const db = tryCreateAdminClient() ?? createDataClient()
    const [wallet, transactions, settings] = await Promise.all([
      fetchLiveWallet(liveId),
      includeHistory && limit > 0
        ? listWalletHistory(liveId, limit, { full: fullHistory })
        : Promise.resolve([]),
      getPlatformSettings(db),
    ])
    const freeUnderNaira = settings.squad_fee_rules.free_under_naira
    const freeUsed = await sumUnderFreeBankVolumeToday(db, liveId, freeUnderNaira)

    return successResponse({
      user_id: liveId,
      wallet,
      rates: {
        ...publicBuRates({
          free_under_used_today: freeUsed,
          free_under_remaining: freeUnderRemaining(freeUsed, freeUnderNaira),
          payout_provider: isPaystackConfigured() ? 'paystack' : 'squad',
        }),
        free_under_naira: freeUnderNaira,
        free_under_per_day: settings.squad_fee_rules.free_under_per_day,
        platform_fee_percent: settings.squad_fee_rules.pay_out.platform_percent,
      },
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
