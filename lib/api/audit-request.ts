import { clientIp } from '@/lib/api/rate-limit'
import { writeAudit } from '@/lib/api/audit'

export function auditFromRequest(
  request: Request,
  input: { merchantId?: string | null; actorUserId?: string | null; statusCode?: number },
) {
  const url = new URL(request.url)
  return writeAudit({
    merchantId: input.merchantId,
    actorUserId: input.actorUserId,
    method: request.method,
    path: url.pathname,
    statusCode: input.statusCode,
    ip: clientIp(request),
  })
}
