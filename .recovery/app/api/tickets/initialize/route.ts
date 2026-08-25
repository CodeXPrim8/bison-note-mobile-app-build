import { NextRequest } from 'next/server'
import { initializeTicketSchema } from '@/lib/schemas/ticket'
import { initializeTicketPurchase } from '@/lib/payments/initialize-ticket'
import { handleRouteError, successResponse } from '@/lib/api/errors'
import { getSessionUser } from '@/lib/api/session'
import { clientIp, rateLimit } from '@/lib/api/rate-limit'
import { hashPayload, readIdempotency, writeIdempotency } from '@/lib/payments/idempotency'

export async function POST(request: NextRequest) {
  try {
    const ip = clientIp(request)
    const limited = rateLimit(`tickets-init:${ip}`, 10, 60_000)
    if (!limited.ok) {
      return Response.json(
        { status: false, message: 'Rate limit exceeded', code: 'RATE_LIMITED' },
        { status: 429 },
      )
    }

    const json: unknown = await request.json()
    const body = initializeTicketSchema.parse(json)
    const idempotencyKey = request.headers.get('idempotency-key')
    const scope = `tickets-init:${body.email}`

    if (idempotencyKey) {
      const existing = await readIdempotency(scope, idempotencyKey)
      if (existing) {
        if (existing.request_hash !== hashPayload(body)) {
          return Response.json(
            { status: false, message: 'Idempotency key reused with different payload', code: 'IDEMPOTENCY_CONFLICT' },
            { status: 409 },
          )
        }
        return Response.json(existing.response, { status: existing.status_code })
      }
    }

    const user = await getSessionUser()
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
      user_id: user?.id ?? null,
    })

    const payload = { status: true, message: 'Initialized', data: result }
    if (idempotencyKey) {
      await writeIdempotency(scope, idempotencyKey, body, payload, 200)
    }
    return successResponse(result, 'Initialized')
  } catch (error) {
    return handleRouteError(error)
  }
}
