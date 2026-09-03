import { ApiError } from '@/lib/api/errors'
import { buFromNaira, getBuNairaValue } from '@/lib/bu-rate'
import { tryCreateAdminClient } from '@/lib/supabase/admin'
import { createDataClient } from '@/lib/supabase/data'
import { moveLiveWallet } from '@/lib/wallet/move'

export async function transferBu(input: {
  fromUserId: string
  toUserId: string
  amount: number
  eventId?: string
  isTip?: boolean
}) {
  if (input.fromUserId === input.toUserId) {
    throw new ApiError(400, 'SELF_TRANSFER', 'You cannot send ɃU to yourself')
  }
  const db = tryCreateAdminClient() ?? createDataClient()
  const bu = buFromNaira(input.amount)
  const meta = {
    kind: input.isTip ? 'tip' : 'transfer',
    bu,
    naira: input.amount,
    value_rate: getBuNairaValue(),
    event_id: input.eventId ?? null,
  }
  const debitType = 'spray'
  const creditType = 'spray_credit'
  await moveLiveWallet(db, {
    userId: input.fromUserId,
    naira: input.amount,
    direction: 'debit',
    type: debitType,
    description: input.isTip ? 'Tip' : 'BU transfer',
    metadata: { ...meta, to: input.toUserId },
  })
  await moveLiveWallet(db, {
    userId: input.toUserId,
    naira: input.amount,
    direction: 'credit',
    type: creditType,
    description: input.isTip ? 'Tip received' : 'BU received',
    metadata: { ...meta, from: input.fromUserId },
  })
}
