import { createDataClient } from '@/lib/supabase/data'
import { ApiError } from '@/lib/api/errors'
import { normalizePhone } from '@/lib/phone'

export const ACCOUNT_ROLES_SQL_HINT =
  'Run supabase/migrations/0015_account_roles_sales.sql in the live ɃU Supabase SQL editor, then try again.'

export type AccountRoles = {
  user_id: string
  is_organizer: boolean
  is_affiliate: boolean
  is_super_admin: boolean
  affiliate_code: string | null
  live_role: string | null
}

export type RoleViewer = {
  role?: string | null
  phone?: string | null
  phone_e164?: string | null
}

function emptyRoles(userId: string): AccountRoles {
  return {
    user_id: userId,
    is_organizer: false,
    is_affiliate: false,
    is_super_admin: false,
    affiliate_code: null,
    live_role: null,
  }
}

function asRoles(raw: unknown, userId: string): AccountRoles {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    user_id: typeof row.user_id === 'string' ? row.user_id : userId,
    is_organizer: Boolean(row.is_organizer),
    is_affiliate: Boolean(row.is_affiliate),
    is_super_admin: false,
    affiliate_code: typeof row.affiliate_code === 'string' && row.affiliate_code ? row.affiliate_code : null,
    live_role: null,
  }
}

function envList(name: string) {
  return String(process.env[name] ?? '')
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function phoneKey(value?: string | null) {
  const digits = String(value ?? '').replace(/[^\d]/g, '')
  if (digits.length >= 10) return digits.slice(-10)
  const normalised = value ? normalizePhone(value) : null
  return normalised && normalised.length >= 10 ? normalised.slice(-10) : ''
}

/** Platform owner only. Organiser / affiliate registration never grants this. */
export function isOwnerSuperAdmin(userId?: string | null, phone?: string | null) {
  const ids = envList('BU_SUPER_ADMIN_USER_IDS')
  if (userId && ids.includes(userId)) return true
  const allowed = envList('BU_SUPER_ADMIN_PHONES').map(phoneKey).filter(Boolean)
  const got = phoneKey(phone)
  return Boolean(got && allowed.includes(got))
}

export async function fetchLiveUserRole(userId: string): Promise<string | null> {
  if (!userId) return null
  const db = createDataClient()
  const { data, error } = await db.from('users').select('role').eq('id', userId).maybeSingle()
  if (error || !data) return null
  const role = (data as { role?: unknown }).role
  return typeof role === 'string' && role.trim() ? role : null
}

export async function getAccountRoles(userId: string): Promise<AccountRoles> {
  const db = createDataClient()
  const rpc = await db.rpc('bu_get_account_role', { p_user_id: userId })
  if (!rpc.error) return asRoles(rpc.data, userId)
  const table = await db.from('bu_account_roles').select('*').eq('user_id', userId).maybeSingle()
  if (!table.error && table.data) return asRoles(table.data, userId)
  return emptyRoles(userId)
}

export async function getAccountRolesForViewer(userId: string, viewer?: RoleViewer | null): Promise<AccountRoles> {
  const roles = await getAccountRoles(userId)
  const liveRole = (await fetchLiveUserRole(userId)) || viewer?.role?.trim() || null
  return {
    ...roles,
    live_role: liveRole,
    is_organizer: roles.is_organizer,
    is_affiliate: roles.is_affiliate,
    is_super_admin: isOwnerSuperAdmin(userId, viewer?.phone_e164 || viewer?.phone),
  }
}

export async function requireLiveSuperAdmin(userId: string, viewer?: RoleViewer | null) {
  const roles = await getAccountRolesForViewer(userId, viewer)
  if (!roles.is_super_admin) {
    throw new ApiError(403, 'FORBIDDEN', 'Super Admin only. Organisers and affiliates cannot open this.')
  }
  return roles
}

export async function enableAccountRole(userId: string, flag: 'organizer' | 'affiliate') {
  const db = createDataClient()
  const rpc = await db.rpc('bu_upsert_account_role', { p_user_id: userId, p_flag: flag })
  if (!rpc.error) return asRoles(rpc.data, userId)

  const missing = /could not find|schema cache|does not exist/i.test(rpc.error.message)
  if (!missing) {
    throw new ApiError(503, 'ROLES_SQL_REQUIRED', rpc.error.message)
  }

  const patch: Record<string, unknown> = {
    user_id: userId,
    updated_at: new Date().toISOString(),
  }
  if (flag === 'organizer') patch.is_organizer = true
  if (flag === 'affiliate') {
    patch.is_affiliate = true
    patch.affiliate_code = `bua${userId.replace(/-/g, '').slice(0, 8)}`
  }
  const upsert = await db.from('bu_account_roles').upsert(patch, { onConflict: 'user_id' }).select('*').maybeSingle()
  if (upsert.error || !upsert.data) {
    throw new ApiError(503, 'ROLES_SQL_REQUIRED', ACCOUNT_ROLES_SQL_HINT)
  }
  return asRoles(upsert.data, userId)
}

export async function lookupAffiliateByCode(code?: string | null) {
  const trimmed = code?.trim()
  if (!trimmed) return null
  const db = createDataClient()
  const rpc = await db.rpc('bu_lookup_affiliate', { p_code: trimmed })
  if (rpc.error || !rpc.data) return null
  const row = rpc.data as Record<string, unknown>
  const userId = typeof row.user_id === 'string' ? row.user_id : ''
  if (!userId) return null
  return {
    user_id: userId,
    affiliate_code: typeof row.affiliate_code === 'string' ? row.affiliate_code : trimmed,
  }
}

function asRows(raw: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(raw)) return raw as Array<Record<string, unknown>>
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown
      return Array.isArray(parsed) ? (parsed as Array<Record<string, unknown>>) : []
    } catch {
      return []
    }
  }
  if (raw && typeof raw === 'object' && Array.isArray((raw as { users?: unknown }).users)) {
    return (raw as { users: Array<Record<string, unknown>> }).users
  }
  return []
}

export async function listSaleCredits(userId?: string | null, limit = 200) {
  const db = createDataClient()
  const rpc = await db.rpc('bu_list_sale_credits', {
    p_user_id: userId ?? null,
    p_limit: limit,
  })
  if (rpc.error) return []
  return asRows(rpc.data)
}
