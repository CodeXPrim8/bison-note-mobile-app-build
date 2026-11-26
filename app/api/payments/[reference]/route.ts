import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { requireUser } from '@/lib/api/session'
import { readBuSession } from '@/lib/auth/bu-session'
import { resolveLiveCelebrantId } from '@/lib/events/live'
import { isServiceRoleConfigured } from '@/lib/env'
import { loadLivePaymentByReference } from '@/lib/payments/live-ticket'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Payment } from '@/lib/types/database'

function sameEmail(left?: string | null, right?: string | null) {
  const a = left?.trim().toLowerCase()
  const b = right?.trim().toLowerCase()
  return Boolean(a && b && a === b)
}

async function viewer() {
  const user = await requireUser()
  const session = await readBuSession()
  const liveId =
    (await resolveLiveCelebrantId({
      id: user.id,
      email: user.email,
      phone: session?.phone_e164 || session?.phone || null,
    })) || user.id
  return { id: user.id, liveId, email: session?.email || user.email || null }
}

function ownsPayment(
  viewerIds: { id: string; liveId: string; email: string | null },
  payment: { user_id?: string | null; buyer_email?: string | null },
) {
  return (
    payment.user_id === viewerIds.id ||
    payment.user_id === viewerIds.liveId ||
    sameEmail(payment.buyer_email, viewerIds.email)
  )
}

export async function GET(_request: Request, context: { params: Promise<{ reference: string }> }) {
  try {
    const { reference } = await context.params
    const who = await viewer()
    const live = await loadLivePaymentByReference(reference)
    if (live) {
      if (!ownsPayment(who, live.payment)) throw new ApiError(404, 'NOT_FOUND', 'Payment not found')
      return successResponse(live)
    }
    if (!isServiceRoleConfigured()) {
      throw new ApiError(404, 'NOT_FOUND', 'Payment not found')
    }
    const admin = createAdminClient()
    const { data } = await admin.from('payments').select('*').eq('reference', reference).maybeSingle()
    if (!data) throw new ApiError(404, 'NOT_FOUND', 'Payment not found')
    const payment = data as Payment
    if (!ownsPayment(who, payment)) throw new ApiError(404, 'NOT_FOUND', 'Payment not found')
    const { data: tickets } = await admin.from('tickets').select('*').eq('payment_id', payment.id)
    return successResponse({ payment, tickets: tickets ?? [] })
  } catch (error) {
    return handleRouteError(error)
  }
}
