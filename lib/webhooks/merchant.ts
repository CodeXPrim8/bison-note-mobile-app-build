import { createHmac } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import type { GatewayMerchant } from '@/lib/types/database'

export type MerchantWebhookEvent =
  | 'ticket.purchased'
  | 'ticket.refunded'
  | 'ticket.cancelled'
  | 'event.sold_out'
  | 'payment.failed'
  | 'ticket.checked_in'

export function signMerchantPayload(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('hex')
}

export async function enqueueMerchantWebhook(
  merchant: Pick<GatewayMerchant, 'id' | 'webhook_url'>,
  eventType: MerchantWebhookEvent,
  payload: Record<string, unknown>,
) {
  if (!merchant.webhook_url) return
  const admin = createAdminClient()
  const { error } = await admin.from('webhook_deliveries').insert({
    merchant_id: merchant.id,
    event_type: eventType,
    payload: { event: eventType, data: payload },
    attempts: 0,
    last_status: 'pending',
    next_retry_at: new Date().toISOString(),
  })
  if (error) {
    console.error('enqueueMerchantWebhook', error.message)
  }
}

/** Queue then try to deliver immediately (Paystack-style), cron retries the rest. */
export async function notifyMerchant(
  merchant: Pick<GatewayMerchant, 'id' | 'webhook_url'>,
  eventType: MerchantWebhookEvent,
  payload: Record<string, unknown>,
) {
  await enqueueMerchantWebhook(merchant, eventType, payload)
  try {
    await deliverPendingWebhooks(8)
  } catch (error) {
    console.error('notifyMerchant deliver', error)
  }
}

function backoffMs(attempts: number): number {
  return Math.min(5 * 60 * 1000, 1000 * 2 ** attempts)
}

export async function deliverPendingWebhooks(limit = 20): Promise<number> {
  const admin = createAdminClient()
  const { data: jobs } = await admin
    .from('webhook_deliveries')
    .select('id, merchant_id, event_type, payload, attempts, max_attempts')
    .in('last_status', ['pending', 'retrying', 'failed'])
    .lte('next_retry_at', new Date().toISOString())
    .lt('attempts', 5)
    .limit(limit)

  if (!jobs?.length) return 0

  let delivered = 0
  for (const job of jobs) {
    const { data: merchant } = await admin
      .from('gateway_merchants')
      .select('webhook_url, webhook_secret')
      .eq('id', job.merchant_id)
      .maybeSingle()

    const url = merchant?.webhook_url as string | undefined
    if (!url) continue

    const body = JSON.stringify(job.payload)
    const signature = signMerchantPayload((merchant?.webhook_secret as string | null) ?? 'bu-webhook', body)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-BU-Signature': signature,
        },
        body,
      })
      const attempts = (job.attempts as number) + 1
      if (response.ok) {
        await admin
          .from('webhook_deliveries')
          .update({
            attempts,
            last_status: 'delivered',
            last_http_status: response.status,
            last_error: null,
          })
          .eq('id', job.id)
        delivered += 1
      } else {
        const max = (job.max_attempts as number) ?? 5
        await admin
          .from('webhook_deliveries')
          .update({
            attempts,
            last_status: attempts >= max ? 'failed' : 'retrying',
            last_http_status: response.status,
            last_error: `HTTP ${response.status}`,
            next_retry_at: new Date(Date.now() + backoffMs(attempts)).toISOString(),
          })
          .eq('id', job.id)
      }
    } catch (error) {
      const attempts = (job.attempts as number) + 1
      const max = (job.max_attempts as number) ?? 5
      await admin
        .from('webhook_deliveries')
        .update({
          attempts,
          last_status: attempts >= max ? 'failed' : 'retrying',
          last_error: error instanceof Error ? error.message : 'network error',
          next_retry_at: new Date(Date.now() + backoffMs(attempts)).toISOString(),
        })
        .eq('id', job.id)
    }
  }
  return delivered
}
