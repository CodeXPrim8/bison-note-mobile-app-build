import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '@/lib/api/errors'
import { setRuntimeBuNairaValue } from '@/lib/bu-rate'
import { adminDb } from '@/lib/admin/session'
import { isServiceRoleConfigured } from '@/lib/env'

export { AD_SLOTS, type AdSlotId } from '@/lib/admin/ad-slots'

function asDbError(error: unknown): { message: string; code?: string } | null {
  if (!error || typeof error !== 'object' || !('message' in error)) return null
  const message = String((error as { message?: unknown }).message ?? '')
  if (!message) return null
  const code = (error as { code?: unknown }).code
  return { message, code: typeof code === 'string' ? code : undefined }
}

function isRlsError(error: { message: string; code?: string }) {
  return error.code === '42501' || /row-level security|permission denied/i.test(error.message)
}

function throwSettingsWriteError(error: unknown): never {
  const dbError = asDbError(error)
  if (dbError && isRlsError(dbError)) {
    throw new ApiError(
      503,
      'ADMIN_SQL_REQUIRED',
      isServiceRoleConfigured()
        ? dbError.message
        : 'Run supabase/migrations/0018_super_admin_writes.sql in the ɃU SQL editor so Super Admin can save the ɃU rate and withdrawal mode.',
    )
  }
  throw new ApiError(500, 'SETTINGS_SAVE_FAILED', dbError?.message ?? 'Could not save Super Admin settings')
}

export type PlatformSettings = {
  bu_naira_value: number
  withdrawal_mode: 'automatic' | 'manual'
}

const DEFAULT_SETTINGS: PlatformSettings = {
  bu_naira_value: 1,
  withdrawal_mode: 'automatic',
}

function asSettings(rows: Array<{ key?: string; value?: unknown }> | null | undefined): PlatformSettings {
  const map = new Map<string, unknown>()
  for (const row of rows ?? []) {
    if (row.key) map.set(row.key, row.value)
  }
  const rate = Number(map.get('bu_naira_value') ?? DEFAULT_SETTINGS.bu_naira_value)
  const mode = String(map.get('withdrawal_mode') ?? DEFAULT_SETTINGS.withdrawal_mode)
    .replace(/^"+|"+$/g, '')
    .toLowerCase()
  return {
    bu_naira_value: Number.isFinite(rate) && rate > 0 ? rate : 1,
    withdrawal_mode: mode === 'manual' ? 'manual' : 'automatic',
  }
}

export async function getPlatformSettings(db: SupabaseClient = adminDb()): Promise<PlatformSettings> {
  const { data, error } = await db.from('bu_platform_settings').select('key, value')
  if (error) return DEFAULT_SETTINGS
  const settings = asSettings(data as Array<{ key?: string; value?: unknown }>)
  setRuntimeBuNairaValue(settings.bu_naira_value)
  return settings
}

export async function savePlatformSettings(
  patch: Partial<PlatformSettings>,
  db: SupabaseClient = adminDb(),
) {
  const current = await getPlatformSettings(db)
  const next: PlatformSettings = {
    bu_naira_value: patch.bu_naira_value ?? current.bu_naira_value,
    withdrawal_mode: patch.withdrawal_mode ?? current.withdrawal_mode,
  }
  if (!(next.bu_naira_value > 0) || next.bu_naira_value > 1000) {
    throw new ApiError(400, 'INVALID_RATE', 'ɃU rate must be between 0 and 1000 naira')
  }
  const rows = [
    { key: 'bu_naira_value', value: next.bu_naira_value, updated_at: new Date().toISOString() },
    { key: 'withdrawal_mode', value: next.withdrawal_mode, updated_at: new Date().toISOString() },
  ]
  const { error } = await db.from('bu_platform_settings').upsert(rows, { onConflict: 'key' })
  if (error) {
    const viaRpc = await db.rpc('bu_save_platform_settings', {
      p_rate: next.bu_naira_value,
      p_mode: next.withdrawal_mode,
    })
    if (viaRpc.error) throwSettingsWriteError(viaRpc.error)
  }
  setRuntimeBuNairaValue(next.bu_naira_value)
  return next
}

export type UserControl = {
  user_id: string
  suspended: boolean
  organizer_suspended: boolean
  deleted_at: string | null
  note: string | null
}

export async function getUserControl(userId: string, db: SupabaseClient = adminDb()): Promise<UserControl> {
  const empty: UserControl = {
    user_id: userId,
    suspended: false,
    organizer_suspended: false,
    deleted_at: null,
    note: null,
  }
  if (!userId) return empty
  const { data, error } = await db.from('bu_user_control').select('*').eq('user_id', userId).maybeSingle()
  if (error || !data) return empty
  const row = data as Record<string, unknown>
  return {
    user_id: userId,
    suspended: Boolean(row.suspended),
    organizer_suspended: Boolean(row.organizer_suspended),
    deleted_at: typeof row.deleted_at === 'string' ? row.deleted_at : null,
    note: typeof row.note === 'string' ? row.note : null,
  }
}

export async function listUserControls(db: SupabaseClient = adminDb()) {
  const { data, error } = await db.from('bu_user_control').select('*').limit(2000)
  if (error || !data) return [] as UserControl[]
  return (data as Array<Record<string, unknown>>).map((row) => ({
    user_id: String(row.user_id ?? ''),
    suspended: Boolean(row.suspended),
    organizer_suspended: Boolean(row.organizer_suspended),
    deleted_at: typeof row.deleted_at === 'string' ? row.deleted_at : null,
    note: typeof row.note === 'string' ? row.note : null,
  }))
}

export async function upsertUserControl(
  userId: string,
  patch: Partial<Omit<UserControl, 'user_id'>>,
  db: SupabaseClient = adminDb(),
) {
  const current = await getUserControl(userId, db)
  const next = {
    user_id: userId,
    suspended: patch.suspended ?? current.suspended,
    organizer_suspended: patch.organizer_suspended ?? current.organizer_suspended,
    deleted_at: patch.deleted_at === undefined ? current.deleted_at : patch.deleted_at,
    note: patch.note === undefined ? current.note : patch.note,
    updated_at: new Date().toISOString(),
  }
  const { error } = await db.from('bu_user_control').upsert(next, { onConflict: 'user_id' })
  if (error) throw error
  return next
}

export async function writeAdminAudit(
  actorId: string,
  action: string,
  target?: string | null,
  payload: Record<string, unknown> = {},
  db: SupabaseClient = adminDb(),
) {
  const inserted = await db.from('bu_admin_audit').insert({
    actor_id: actorId,
    action,
    target: target ?? null,
    payload,
  })
  if (!inserted.error) return
  await db.rpc('bu_write_admin_audit', {
    p_actor_id: actorId,
    p_action: action,
    p_target: target ?? null,
    p_payload: payload,
  })
}

export function displayNameFromUser(row: Record<string, unknown>) {
  const first = String(row.first_name ?? '').trim()
  const last = String(row.last_name ?? '').trim()
  const joined = [first, last].filter(Boolean).join(' ')
  return joined || String(row.account_name ?? '').trim() || String(row.email ?? '').trim() || 'ɃU member'
}

export function walletNaira(row: Record<string, unknown> | null | undefined) {
  if (!row) return 0
  return Number(row.balance || row.naira_balance || row.naira_available || row.bu_balance || 0) || 0
}
