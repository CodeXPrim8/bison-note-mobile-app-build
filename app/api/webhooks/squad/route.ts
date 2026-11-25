import { errorResponse, successResponse } from '@/lib/api/errors'
import { isSquadConfigured } from '@/lib/env'
import { fulfillSquadVirtualAccountCredit } from '@/lib/payments/squad-credit'
import { verifySquadWebhookSignature, type SquadVaWebhookPayload } from '@/lib/payments/squad'

export async function POST(request: Request) {
  if (!isSquadConfigured()) {
    return errorResponse(503, 'SQUAD_REQUIRED', 'Squad is not configured')
  }

  const raw = await request.text()
  const signature =
    request.headers.get('x-squad-encrypted-body') ||
    request.headers.get('x-squad-signature') ||
    request.headers.get('X-Squad-Encrypted-Body')

  let payload: SquadVaWebhookPayload
  try {
    payload = JSON.parse(raw) as SquadVaWebhookPayload
  } catch {
    return errorResponse(400, 'INVALID_JSON', 'Invalid webhook body')
  }

  if (!verifySquadWebhookSignature(raw, signature, payload)) {
    return errorResponse(401, 'INVALID_SIGNATURE', 'Invalid Squad webhook signature')
  }

  // Permanent customer VA credits look like channel=virtual-account.
  const channel = String(payload.channel ?? '').toLowerCase()
  if (channel && channel !== 'virtual-account' && !payload.virtual_account_number) {
    return successResponse({ ignored: true, channel }, 'Ignored')
  }

  try {
    const result = await fulfillSquadVirtualAccountCredit(payload)
    if (result.ignored) {
      return successResponse(result, 'Ignored')
    }
    return successResponse(
      {
        reference: result.reference,
        amount: result.amount,
        user_id: result.userId,
        already_credited: result.already_credited,
        channel: 'squad_virtual_account',
      },
      'Fulfilled',
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Squad webhook failed'
    console.error('squad webhook', message)
    // Still 200 for unknown-user style misses so Squad does not infinite-retry forever after we log.
    if (error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'VIRTUAL_ACCOUNT_USER_NOT_FOUND') {
      return successResponse({ queued: false, error: message }, 'Unmatched account')
    }
    return errorResponse(500, 'SQUAD_WEBHOOK_FAILED', message)
  }
}
