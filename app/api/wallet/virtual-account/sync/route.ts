import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { getProfile, requireUser } from '@/lib/api/session'
import { readBuSession } from '@/lib/auth/bu-session'
import { resolveLiveCelebrantId } from '@/lib/events/live'
import { syncUserDedicatedNubanCredits } from '@/lib/payments/dva-credit'
import { syncUserSquadCredits } from '@/lib/payments/squad-credit'
import { getStoredVirtualAccount } from '@/lib/payments/virtual-account'
import { isPaystackConfigured, isSquadBankInEnabled, isSquadConfigured } from '@/lib/env'

export async function POST(request: Request) {
  try {
    if (!isSquadConfigured() && !isPaystackConfigured()) {
      throw new ApiError(503, 'FUNDING_REQUIRED', 'Funding sync is not available right now.')
    }
    const user = await requireUser()
    const session = await readBuSession()
    const profile = await getProfile(user.id)
    const liveId =
      (await resolveLiveCelebrantId({
        id: user.id,
        email: user.email,
        phone: session?.phone_e164 || session?.phone || profile?.phone_e164 || profile?.phone || null,
      })) || user.id

    let requery = true
    try {
      const body = (await request.json()) as { requery?: boolean }
      if (typeof body?.requery === 'boolean') requery = body.requery
    } catch {
      requery = true
    }

    const stored = await getStoredVirtualAccount(liveId)
    const useSquad =
      isSquadBankInEnabled() &&
      (stored?.provider === 'squad' || stored?.bank_slug === 'squad-gtbank' || (!stored && isSquadConfigured()))

    if (useSquad && stored) {
      const result = await syncUserSquadCredits(liveId)
      return successResponse(result, result.credited.length ? 'Top-up credited' : 'No new bank transfers')
    }

    if (!isPaystackConfigured()) {
      return successResponse({ credited: [], checked: 0 }, 'No funding account yet')
    }

    const result = await syncUserDedicatedNubanCredits(liveId, { requery })
    return successResponse(result, result.credited.length ? 'Top-up credited' : 'No new bank transfers')
  } catch (error) {
    return handleRouteError(error)
  }
}
