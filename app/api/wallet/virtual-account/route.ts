import { z } from 'zod'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { getProfile, requireUser } from '@/lib/api/session'
import { readBuSession } from '@/lib/auth/bu-session'
import { contactEmail } from '@/lib/auth/pin'
import { clientIp, rateLimit } from '@/lib/api/rate-limit'
import { resolveLiveCelebrantId } from '@/lib/events/live'
import {
  getOrCreateVirtualAccount,
  getStoredVirtualAccount,
  recreateVirtualAccount,
  virtualAccountNeedsBrandRefresh,
} from '@/lib/payments/virtual-account'
import { isPaystackConfigured, isSquadBankInEnabled } from '@/lib/env'

async function resolveFundingIdentity() {
  const user = await requireUser()
  const session = await readBuSession()
  const profile = await getProfile(user.id)
  const liveId =
    (await resolveLiveCelebrantId({
      id: user.id,
      email: user.email,
      phone: session?.phone_e164 || session?.phone || profile?.phone_e164 || profile?.phone || null,
    })) || user.id

  const email =
    contactEmail(profile?.email) || contactEmail(session?.email) || contactEmail(user.email)
  const phone = profile?.phone_e164 || profile?.phone || session?.phone_e164 || session?.phone || null
  const displayName = profile?.display_name || session?.display_name || null

  return { liveId, email, phone, displayName }
}

function publicAccount(account: Awaited<ReturnType<typeof getOrCreateVirtualAccount>>) {
  return {
    bank_name: account.bank_name,
    bank_slug: account.bank_slug,
    account_number: account.account_number,
    account_name: account.account_name,
    currency: account.currency,
    active: account.active,
    provider: account.provider ?? (account.bank_slug === 'squad-gtbank' ? 'squad' : 'paystack'),
    needs_brand_refresh: virtualAccountNeedsBrandRefresh(account.account_name),
  }
}

export async function GET() {
  try {
    if (!isSquadBankInEnabled() && !isPaystackConfigured()) {
      throw new ApiError(503, 'FUNDING_REQUIRED', 'Funding is not available right now.')
    }
    const { liveId, email, phone, displayName } = await resolveFundingIdentity()

    if (isSquadBankInEnabled()) {
      const stored = await getStoredVirtualAccount(liveId)
      if (stored?.provider === 'squad' || stored?.bank_slug === 'squad-gtbank') {
        return successResponse(publicAccount({ ...stored, provider: 'squad' }), 'Virtual account ready')
      }
      // No Squad VA yet — ask the client for one-time BVN KYC (do not create Paystack by default).
      if (!stored) {
        return successResponse(
          {
            needs_kyc: true,
            provider: 'squad',
            bank_name: 'GTBank',
            bank_slug: 'squad-gtbank',
            account_number: null,
            account_name: null,
            currency: 'NGN',
            active: false,
          },
          'Squad KYC required',
        )
      }
      // Keep showing the existing Paystack number until they upgrade.
      return successResponse(
        {
          ...publicAccount({ ...stored, provider: stored.provider ?? 'paystack' }),
          upgrade_to_squad: true,
          needs_kyc: true,
        },
        'Virtual account ready',
      )
    }

    const account = await getOrCreateVirtualAccount({
      userId: liveId,
      email,
      phone,
      displayName,
    })
    return successResponse(publicAccount(account), 'Virtual account ready')
  } catch (error) {
    return handleRouteError(error)
  }
}

const postSchema = z.object({
  recreate: z.boolean().optional(),
  kyc: z
    .object({
      bvn: z.string().regex(/^\d{11}$/, 'BVN must be 11 digits'),
      dob: z.string().min(8, 'Enter date of birth as DD/MM/YYYY'),
      gender: z.enum(['1', '2']),
      address: z.string().min(5).max(200),
    })
    .optional(),
})

export async function POST(request: Request) {
  try {
    if (!isSquadBankInEnabled() && !isPaystackConfigured()) {
      throw new ApiError(503, 'FUNDING_REQUIRED', 'Funding is not available right now.')
    }
    const limited = rateLimit(`dva-recreate:${clientIp(request)}`, 5, 15 * 60_000)
    if (!limited.ok) {
      throw new ApiError(429, 'RATE_LIMITED', 'Wait a few minutes before requesting another account number.')
    }

    const body = postSchema.parse(await request.json().catch(() => ({})))
    const { liveId, email, phone, displayName } = await resolveFundingIdentity()

    if (isSquadBankInEnabled() && body.kyc) {
      const account = await getOrCreateVirtualAccount({
        userId: liveId,
        email,
        phone,
        displayName,
        kyc: body.kyc,
      })
      return successResponse(publicAccount(account), 'Squad bank account ready')
    }

    if (!body.recreate) {
      throw new ApiError(
        400,
        'INVALID_REQUEST',
        isSquadBankInEnabled()
          ? 'Pass kyc (bvn, dob, gender, address) to create a Squad funding account.'
          : 'Pass recreate: true to issue a new bank account number.',
      )
    }

    if (!isPaystackConfigured()) {
      throw new ApiError(503, 'PAYSTACK_REQUIRED', 'Funding is not available right now.')
    }

    const account = await recreateVirtualAccount({
      userId: liveId,
      email,
      phone,
      displayName,
    })
    return successResponse(
      publicAccount(account),
      'New bank account ready. Use this number for transfers going forward.',
    )
  } catch (error) {
    return handleRouteError(error)
  }
}
