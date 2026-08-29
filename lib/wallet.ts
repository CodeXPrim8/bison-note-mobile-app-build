import { createAdminClient } from '@/lib/supabase/admin'
import { ApiError } from '@/lib/api/errors'
import { BU_NAIRA_VALUE, buFromNaira } from '@/lib/bu-rate'

export async function transferBu(input: {
  fromUserId: string
  toUserId: string
  amount: number
  eventId?: string
  isTip?: boolean
}) {
  const admin = createAdminClient()
  const type = 'spray'
  const bu = buFromNaira(input.amount)
  const { error } = await admin.rpc('debit_wallet', {
    p_user_id: input.fromUserId,
    p_amount: input.amount,
    p_type: type,
    p_description: input.isTip ? 'Tip' : 'BU transfer',
    p_counterparty: input.toUserId,
    p_event_id: input.eventId ?? null,
    p_metadata: { kind: input.isTip ? 'tip' : 'transfer', bu, naira: input.amount, value_rate: BU_NAIRA_VALUE },
  })
  if (error) {
    if (error.message?.includes('INSUFFICIENT_FUNDS')) {
      throw new ApiError(400, 'INSUFFICIENT_FUNDS', 'Not enough ɃU')
    }
    throw new ApiError(500, 'TRANSFER_FAILED', error.message)
  }
  await admin.rpc('credit_wallet', {
    p_user_id: input.toUserId,
    p_amount: input.amount,
    p_type: type,
    p_description: input.isTip ? 'Tip received' : 'BU received',
    p_event_id: input.eventId ?? null,
    p_metadata: { from: input.fromUserId, bu, naira: input.amount, value_rate: BU_NAIRA_VALUE },
  })
}
