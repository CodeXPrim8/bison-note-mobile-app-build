import { z } from 'zod'
import { handleRouteError, successResponse } from '@/lib/api/errors'
import { requireUser } from '@/lib/api/session'
import { readBuSession } from '@/lib/auth/bu-session'
import { resolveLiveCelebrantId } from '@/lib/events/live'
import { PURPOSE_IDS } from '@/lib/purpose'
import { getVendorProfile, listVendorPlaces, saveVendorProfile } from '@/lib/vendor-profile'

const patchSchema = z.object({
  business_name: z.string().max(80).optional(),
  category: z.enum(PURPOSE_IDS).nullable().optional(),
  logo_data_url: z.string().max(400_000).optional(),
  settlement: z.enum(['wallet', 'bank']).optional(),
  bank_name: z.string().max(80).optional(),
  bank_code: z.string().max(12).optional(),
  bank_account_number: z.string().max(20).optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
})

async function liveId() {
  const user = await requireUser()
  const session = await readBuSession()
  return (
    (await resolveLiveCelebrantId({
      id: user.id,
      email: user.email,
      phone: session?.phone_e164 || session?.phone || null,
    })) || user.id
  )
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    if (url.searchParams.get('places') === '1') {
      const places = await listVendorPlaces()
      return successResponse({ places })
    }
    const userId = await liveId()
    const profile = await getVendorProfile(userId)
    if (url.searchParams.get('logo') === '1') {
      return successResponse(profile)
    }
    return successResponse({
      ...profile,
      logo_data_url: profile.logo_data_url ? 'set' : '',
      has_logo: Boolean(profile.logo_data_url),
    })
  } catch (error) {
    return handleRouteError(error)
  }
}

export async function PUT(request: Request) {
  try {
    const userId = await liveId()
    const body = patchSchema.parse(await request.json())
    const profile = await saveVendorProfile(userId, {
      ...body,
      bank_account_number: body.bank_account_number?.replace(/\D/g, '').slice(0, 10),
    })
    return successResponse({
      ...profile,
      logo_data_url: profile.logo_data_url ? 'set' : '',
      has_logo: Boolean(profile.logo_data_url),
    })
  } catch (error) {
    return handleRouteError(error)
  }
}
