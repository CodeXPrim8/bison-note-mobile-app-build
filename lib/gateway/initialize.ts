import { NextRequest } from 'next/server'
import { initializeTicketSchema } from '@/lib/schemas/ticket'
import { initializeTicketPurchase } from '@/lib/payments/initialize-ticket'
import { assertMerchantOwnsEvent } from '@/lib/gateway/merchant'
import { resolveGatewayTicketTierId } from '@/lib/gateway/tier'
import { parseLiveTierId } from '@/lib/events/ticket-types'
import { successResponse } from '@/lib/api/errors'
import { hashPayload, readIdempotency, writeIdempotency } from '@/lib/payments/idempotency'
import { corsHeaders } from '@/lib/api/cors'
import { auditFromRequest } from '@/lib/api/audit-request'
import type { GatewayMerchant } from '@/lib/types/database'

export function applyGatewayCors(response: Response, request: Request, merchant?: GatewayMerchant | null) {
  const origin = request.headers.get('origin')
  const allowed = merchant?.cors_origins?.length ? merchant.cors_origins : ['*']
  const headers = corsHeaders(origin, allowed)
  Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value))
  return response
}

export function gatewayOptions(request: Request, merchant?: GatewayMerchant | null) {
  const origin = request.headers.get('origin')
  const allowed = merchant?.cors_origins?.length ? merchant.cors_origins : ['*']
  return new Response(null, { status: 204, headers: corsHeaders(origin, allowed) })
}

export async function runGatewayInitialize(request: NextRequest, merchant: GatewayMerchant) {
  const json: unknown = await request.json()
  const body = initializeTicketSchema.parse(json)
  const ticketTierId = await resolveGatewayTicketTierId({
    ticket_tier_id: body.ticket_tier_id,
    event_id: body.event_id,
    ticket_type: body.ticket_type,
  })
  const eventId = parseLiveTierId(ticketTierId)
  if (!eventId) {
    throw new Error('Could not resolve event from ticket type')
  }
  await assertMerchantOwnsEvent(merchant, eventId)

  const idempotencyKey = request.headers.get('idempotency-key')
  const scope = `gw-init:${merchant.id}`
  if (idempotencyKey) {
    const existing = await readIdempotency(scope, idempotencyKey)
    if (existing) {
      if (existing.request_hash !== hashPayload(body)) {
        const conflict = Response.json(
          { status: false, message: 'Idempotency key reused with different payload', code: 'IDEMPOTENCY_CONFLICT' },
          { status: 409 },
        )
        return applyGatewayCors(conflict, request, merchant)
      }
      const cached = Response.json(existing.response, { status: existing.status_code })
      return applyGatewayCors(cached, request, merchant)
    }
  }

  const result = await initializeTicketPurchase({
    email: body.email,
    amount: body.amount,
    ticket_tier_id: ticketTierId,
    quantity: body.quantity,
    callback_url: body.callback_url,
    spray_bu_amount: body.spray_bu_amount,
    buyer_name: body.metadata?.buyer_name,
    buyer_phone: body.metadata?.phone,
    custom: body.metadata?.custom,
    affiliate_code: body.metadata?.affiliate_code,
    merchant,
  })

  const data = {
    authorization_url: result.authorization_url,
    access_code: 'access_code' in result && result.access_code ? String(result.access_code) : result.reference,
    reference: result.reference,
  }
  const payload = { status: true, message: 'Authorization URL created', data }
  if (idempotencyKey) {
    await writeIdempotency(scope, idempotencyKey, body, payload, 200)
  }
  await auditFromRequest(request, { merchantId: merchant.id, statusCode: 200 })
  const response = successResponse(data, 'Authorization URL created')
  return applyGatewayCors(response, request, merchant)
}
