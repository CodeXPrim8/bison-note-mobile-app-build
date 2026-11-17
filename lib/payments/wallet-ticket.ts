import { ApiError } from '@/lib/api/errors'
import { verifyLegacyBuPin } from '@/lib/auth/legacy-login'
import { createDataClient } from '@/lib/supabase/data'
import { tryCreateAdminClient } from '@/lib/supabase/admin'
import { moveLiveWallet } from '@/lib/wallet/move'
import { reverseFailedDebit } from '@/lib/wallet/reverse'

export async function requireTicketWalletPin(phone: string | null | undefined, pin: string | undefined) {
  if (!pin) throw new ApiError(400, 'PIN_REQUIRED', 'Enter your PIN to pay with ɃU.')
  if (!phone) {
    throw new ApiError(400, 'PIN_REQUIRED', 'Sign in with your ɃU ID to pay from your wallet.')
  }
  const check = await verifyLegacyBuPin(phone, pin)
  if ('wrongPin' in check) throw new ApiError(401, 'WRONG_PIN', 'Incorrect PIN.')
  if ('invalid' in check) throw new ApiError(401, 'LOGIN_FAILED', 'Could not verify this ɃU account.')
  if ('missingVerifier' in check || !('session' in check)) {
    throw new ApiError(400, 'PIN_NOT_SET', 'Create your transaction PIN before paying with ɃU.')
  }
  return check.session
}

export async function debitTicketWallet(input: {
  userId: string
  naira: number
  reference: string
  eventId: string
  eventTitle: string
  quantity: number
  metadata?: Record<string, unknown>
}) {
  if (input.naira <= 0) return { debited: false as const }
  const db = tryCreateAdminClient() ?? createDataClient()
  await moveLiveWallet(db, {
    userId: input.userId,
    naira: input.naira,
    direction: 'debit',
    type: 'ticket_purchase',
    description: `Bought ticket · ${input.eventTitle}`,
    metadata: {
      kind: 'ticket_purchase',
      payment_method: 'wallet',
      event_id: input.eventId,
      quantity: input.quantity,
      reference: input.reference,
      move_id: input.reference,
      fulfillment: 'pending',
      ...(input.metadata ?? {}),
    },
  })
  return { debited: true as const }
}

export async function reverseTicketWalletDebit(input: {
  userId: string
  naira: number
  reference: string
  reason: string
}) {
  if (input.naira <= 0) return
  const db = tryCreateAdminClient() ?? createDataClient()
  await reverseFailedDebit(db, {
    userId: input.userId,
    naira: input.naira,
    originalReference: input.reference,
    reason: input.reason,
  })
}
