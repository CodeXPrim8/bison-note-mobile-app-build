import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { getVendorProfile } from '@/lib/vendor-profile'

export async function GET(request: Request) {
  try {
    const userId = new URL(request.url).searchParams.get('user_id')?.trim()
    if (!userId) throw new ApiError(400, 'VENDOR_REQUIRED', 'Missing business.')
    const profile = await getVendorProfile(userId)
    const bankSettlement = profile.settlement === 'bank'
    return successResponse({
      user_id: profile.user_id,
      business_name: profile.business_name,
      account_number: profile.phone,
      bank_account_number: bankSettlement ? profile.bank_account_number : '',
      bank_code: bankSettlement ? profile.bank_code : '',
      bank_name: bankSettlement ? profile.bank_name : '',
      category: profile.category,
      settlement: profile.settlement,
    })
  } catch (error) {
    return handleRouteError(error)
  }
}
