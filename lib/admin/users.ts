import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '@/lib/api/errors'
import { isOwnerSuperAdmin } from '@/lib/account/roles'
import { displayNameFromUser, walletNaira } from '@/lib/admin/platform'
import { getBuNairaValue } from '@/lib/bu-rate'

export const ADMIN_USERS_SQL_HINT =
  'Run supabase/migrations/0019_admin_list_users.sql in the ɃU SQL editor so Super Admin can list every account.'

export type AdminUserRow = {
  id: string
  name: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  role: string
  roles: string[]
  is_organizer: boolean
  is_affiliate: boolean
  is_super_admin: boolean
  affiliate_code: string | null
  naira: number
  bu: number
  suspended: boolean
  organizer_suspended: boolean
  deleted: boolean
  deleted_at: string | null
  note: string | null
  created_at: string | null
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
    } catch {
      return null
    }
  }
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
}

export function accountRoleLabels(row: {
  is_super_admin?: boolean
  is_organizer?: boolean
  is_affiliate?: boolean
  role?: string | null
}) {
  const labels: string[] = []
  const live = String(row.role ?? '').toLowerCase()
  if (row.is_super_admin) labels.push('Super Admin')
  if (row.is_organizer || live === 'organizer' || live === 'celebrant') labels.push('Organiser')
  if (row.is_affiliate) labels.push('Affiliate')
  if (live === 'vendor') labels.push('Vendor')
  if (live === 'merchant') labels.push('Merchant')
  if (!labels.length) labels.push('Guest')
  return [...new Set(labels)]
}

export function mapAdminUser(raw: Record<string, unknown>): AdminUserRow {
  const id = String(raw.id ?? '')
  const phone = raw.phone_number == null && raw.phone == null ? null : String(raw.phone_number ?? raw.phone ?? '')
  const naira = Number(raw.naira ?? walletNaira(raw)) || 0
  const rate = getBuNairaValue() || 1
  const isOrganizer = Boolean(raw.is_organizer)
  const isAffiliate = Boolean(raw.is_affiliate)
  const isSuperAdmin = isOwnerSuperAdmin(id, phone)
  const role = String(raw.role ?? 'guest')
  return {
    id,
    name: displayNameFromUser(raw),
    first_name: String(raw.first_name ?? '').trim(),
    last_name: String(raw.last_name ?? '').trim(),
    email: raw.email == null ? null : String(raw.email),
    phone,
    role,
    roles: accountRoleLabels({
      is_super_admin: isSuperAdmin,
      is_organizer: isOrganizer,
      is_affiliate: isAffiliate,
      role,
    }),
    is_organizer: isOrganizer,
    is_affiliate: isAffiliate,
    is_super_admin: isSuperAdmin,
    affiliate_code: raw.affiliate_code ? String(raw.affiliate_code) : null,
    naira,
    bu: naira / rate,
    suspended: Boolean(raw.suspended),
    organizer_suspended: Boolean(raw.organizer_suspended),
    deleted: Boolean(raw.deleted_at || raw.deleted),
    deleted_at: raw.deleted_at ? String(raw.deleted_at) : null,
    note: raw.note == null ? null : String(raw.note),
    created_at: raw.created_at == null ? null : String(raw.created_at),
  }
}

function rpcMissing(message: string) {
  if (/column .* does not exist/i.test(message)) return false
  return /could not find the function|schema cache|function .* does not exist/i.test(message)
}

export async function listAdminUsers(
  db: SupabaseClient,
  input: { q?: string; role?: string; limit?: number; offset?: number } = {},
): Promise<{ total: number; users: AdminUserRow[] }> {
  const q = input.q?.trim() ?? ''
  const role = input.role?.trim() ?? ''
  const limit = Math.min(Math.max(input.limit ?? 500, 1), 2000)
  const offset = Math.max(input.offset ?? 0, 0)

  const rpc = await db.rpc('bu_admin_list_users', {
    p_query: q,
    p_role: role,
    p_limit: limit,
    p_offset: offset,
  })

  if (!rpc.error) {
    const payload = asRecord(rpc.data)
    const rows = Array.isArray(payload?.users) ? payload.users : Array.isArray(rpc.data) ? rpc.data : []
    const total = Number(payload?.total ?? rows.length) || 0
    return {
      total,
      users: (rows as Array<Record<string, unknown>>).map(mapAdminUser),
    }
  }

  const fallback = await db
    .from('users')
    .select('id, email, phone_number, first_name, last_name, account_name, role, created_at')
    .limit(2000)
  const rows = (fallback.data ?? []) as Array<Record<string, unknown>>
  if (fallback.error || rows.length === 0) {
    console.error('bu_admin_list_users', rpc.error, fallback.error)
    throw new ApiError(
      503,
      'USERS_SQL_REQUIRED',
      rpcMissing(rpc.error.message)
        ? `${ADMIN_USERS_SQL_HINT} If you already ran it, wait a few seconds or run: notify pgrst, 'reload schema';`
        : rpc.error.message,
    )
  }

  const needle = q.toLowerCase()
  const filtered = rows.filter((row) => {
    if (needle) {
      const blob = [row.phone_number, row.email, row.first_name, row.last_name, row.account_name, row.id, row.role]
        .map((value) => String(value ?? '').toLowerCase())
        .join(' ')
      if (!blob.includes(needle) && !String(row.phone_number ?? '').replace(/[^\d]/g, '').includes(needle.replace(/[^\d]/g, ''))) {
        return false
      }
    }
    return true
  })
  return {
    total: filtered.length,
    users: filtered.slice(offset, offset + limit).map(mapAdminUser),
  }
}

export async function getAdminUser(db: SupabaseClient, userId: string): Promise<AdminUserRow | null> {
  const rpc = await db.rpc('bu_admin_get_user', { p_user_id: userId })
  if (!rpc.error && rpc.data) {
    const row = asRecord(rpc.data)
    return row ? mapAdminUser(row) : null
  }
  const { data, error } = await db
    .from('users')
    .select('id, email, phone_number, first_name, last_name, account_name, role, created_at')
    .eq('id', userId)
    .maybeSingle()
  if (error || !data) return null
  return mapAdminUser(data as Record<string, unknown>)
}
