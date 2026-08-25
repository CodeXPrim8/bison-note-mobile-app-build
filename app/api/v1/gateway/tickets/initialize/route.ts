import { NextRequest } from 'next/server'
import { initializeTicketSchema } from '@/lib/schemas/ticket'
import { initializeTicketPurchase } from '@/lib/payments/initialize-ticket'
import { authenticateMerchant } from '@/lib/api/gateway-auth'
import { handleRouteError, successResponse } from '@/lib/api/errors'
import { hashPayload, readIdempotency, writeIdempotency } from '@/lib/payments/idempotency'
import { corsHeaders } from '@/lib/api/cors'
import { auditFromRequest } from '@/lib/api/audit-request'

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin')
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin, origin ? [origin] : []),
  })
}

export async function POST(request: NextRequest) {
  try {
    const merchant = await authenticateMerchant(request)
    const headers = corsHeaders(request.headers.get('origin'), merchant.cors_origins)
    const json: unknown = await request.json()
    const body = initializeTicketSchema.parse(json)
    const idempotencyKey = request.headers.get('idempotency-key')
    const scope = `gw-init:${merchant.id}`

    if (idempotencyKey) {
      const existing = await readIdempotency(scope, idempotencyKey)
      if (existing) {
        if (existing.request_hash !== hashPayload(body)) {
          return Response.json(
            { status: false, message: 'Idempotency key reused with different payload', code: 'IDEMPOTENCY_CONFLICT' },
            { status: 409, headers },
          )
        }
        return Response.json(existing.response, { status: existing.status_code, headers })
      }
    }

    const result = await initializeTicketPurchase({
      email: body.email,
      amount: body.amount,
      ticket_tier_id: body.ticket_tier_id,
      quantity: body.quantity,
      callback_url: body.callback_url,
      spray_bu_amount: body.spray_bu_amount,
      buyer_name: body.metadata?.buyer_name,
      buyer_phone: body.metadata?.phone,
      custom: body.metadata?.custom,
      merchant,
    })

    const payload = { status: true, message: 'Initialized', data: result }
    if (idempotencyKey) {
      await writeIdempotency(scope, idempotencyKey, body, payload, 200)
    }
    await auditFromRequest(request, { merchantId: merchant.id, statusCode: 200 })
    const response = successResponse(
      {
        authorization_url: result.authorization_url,
        reference: result.reference,
      },
      'Initialized',
    )
    Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value))
    return response
  } catch (error) {
    return handleRouteError(error)
  }
}
