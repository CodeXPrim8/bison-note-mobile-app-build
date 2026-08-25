import { createAdminClient } from '@/lib/supabase/admin'

export async function writeAudit(input: {
  merchantId?: string | null
  actorUserId?: string | null
  method: string
  path: string
  statusCode?: number
  ip?: string | null
}) {
  try {
    const admin = createAdminClient()
    await admin.from('api_audit_logs').insert({
      merchant_id: input.merchantId ?? null,
      actor_user_id: input.actorUserId ?? null,
      method: input.method,
      path: input.path,
      status_code: input.statusCode ?? null,
      ip: input.ip ?? null,
    })
  } catch (error) {
    console.error('audit log failed', error)
  }
}
