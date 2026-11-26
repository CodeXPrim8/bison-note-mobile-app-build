import { handleRouteError, successResponse } from '@/lib/api/errors'
import { verifyReference } from '@/lib/payments/verify'

export async function GET(_request: Request, context: { params: Promise<{ reference: string }> }) {
  try {
    const { reference } = await context.params
    const result = (await verifyReference(reference)) as {
      payment?: { status?: string; callback_url?: string | null }
      tickets?: unknown[]
      event_title?: string
      callback_url?: string | null
    }
    const payment = result.payment
    const tickets = Array.isArray(result.tickets) ? result.tickets : []
    return successResponse({
      reference,
      status: payment?.status ?? 'success',
      event_title: result.event_title,
      callback_url: result.callback_url ?? payment?.callback_url ?? null,
      payment: { callback_url: payment?.callback_url ?? null, status: payment?.status ?? 'success' },
      tickets: tickets.map(() => ({})),
    })
  } catch (error) {
    return handleRouteError(error)
  }
}
