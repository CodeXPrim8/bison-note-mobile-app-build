import { z } from 'zod'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { requireUser } from '@/lib/api/session'
import { catalogFor } from '@/lib/vtu/catalog'
import { detectNetwork, localPhoneFromInput } from '@/lib/vtu/networks'
import { isVtuPublicEnabled } from '@/lib/vtu/provider'
import { isVtpassConfigured, vtpassDataPlans } from '@/lib/vtu/vtpass'

const schema = z.object({
  phone: z.string().min(7).max(20),
  kind: z.enum(['airtime', 'data']).default('airtime'),
})

export async function POST(request: Request) {
  try {
    if (!isVtuPublicEnabled()) {
      throw new ApiError(503, 'VTU_COMING_SOON', 'Airtime and data are coming soon.')
    }
    await requireUser()
    const body = schema.parse(await request.json())
    const phone = localPhoneFromInput(body.phone)
    if (!phone) {
      throw new ApiError(400, 'INVALID_PHONE', 'Enter a valid Nigerian mobile number.')
    }
    const network = detectNetwork(phone)
    if (!network) {
      throw new ApiError(400, 'UNKNOWN_NETWORK', 'Could not detect MTN, Airtel, Glo, or 9mobile for this number.')
    }
    let products = catalogFor(body.kind, network.id)
    if (body.kind === 'data' && isVtpassConfigured()) {
      const live = await vtpassDataPlans(network.id)
      if (live.length) products = live
    }
    return successResponse({
      phone,
      network,
      products,
    })
  } catch (error) {
    return handleRouteError(error)
  }
}
