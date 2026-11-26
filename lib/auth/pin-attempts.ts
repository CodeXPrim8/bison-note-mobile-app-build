import { ApiError } from '@/lib/api/errors'
import { tryCreateAdminClient } from '@/lib/supabase/admin'

const WINDOW_MS = 15 * 60_000
const MAX_FAILURES = 8

export const LOGIN_IP_LIMIT = 30
export const LOGIN_IP_WINDOW_MS = 15 * 60_000

const memory = new Map<string, { count: number; resetAt: number }>()
let remoteTable: 'unknown' | 'ready' | 'missing' = 'unknown'

function retryAfterSec(resetAt: number): number {
  return Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))
}

function lockedError(retryAfterSec: number): ApiError {
  const minutes = Math.max(1, Math.ceil(retryAfterSec / 60))
  return new ApiError(
    429,
    'PIN_LOCKED',
    `Too many incorrect PIN attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
  )
}

function memoryState(key: string): { count: number; resetAt: number } | null {
  const current = memory.get(key)
  if (!current || current.resetAt < Date.now()) return null
  return current
}

async function remoteState(key: string): Promise<{ count: number; resetAt: number } | null> {
  if (remoteTable === 'missing') return null
  const admin = tryCreateAdminClient()
  if (!admin) return null
  const { data, error } = await admin
    .from('bu_pin_attempts')
    .select('count, reset_at')
    .eq('bucket', key)
    .maybeSingle()
  if (error) {
    if (/does not exist|schema cache|relation/i.test(error.message)) remoteTable = 'missing'
    return null
  }
  remoteTable = 'ready'
  if (!data) return null
  const resetAt = new Date(String(data.reset_at)).getTime()
  if (!Number.isFinite(resetAt) || resetAt < Date.now()) return null
  return { count: Number(data.count) || 0, resetAt }
}

async function writeRemote(key: string, count: number, resetAt: number) {
  if (remoteTable === 'missing') return
  const admin = tryCreateAdminClient()
  if (!admin) return
  const { error } = await admin.from('bu_pin_attempts').upsert({
    bucket: key,
    count,
    reset_at: new Date(resetAt).toISOString(),
  })
  if (error) {
    if (/does not exist|schema cache|relation/i.test(error.message)) remoteTable = 'missing'
    return
  }
  remoteTable = 'ready'
}

async function deleteRemote(key: string) {
  if (remoteTable === 'missing') return
  const admin = tryCreateAdminClient()
  if (!admin) return
  const { error } = await admin.from('bu_pin_attempts').delete().eq('bucket', key)
  if (error && /does not exist|schema cache|relation/i.test(error.message)) remoteTable = 'missing'
}

/** Stop online PIN guessing. A correct PIN clears the counter. Missing table does not block payments. */
export async function assertPinOpen(keys: string[], limit = MAX_FAILURES) {
  for (const key of keys.filter(Boolean)) {
    const local = memoryState(key)
    if (local && local.count >= limit) throw lockedError(retryAfterSec(local.resetAt))
    const remote = await remoteState(key)
    if (remote && remote.count >= limit) {
      memory.set(key, remote)
      throw lockedError(retryAfterSec(remote.resetAt))
    }
  }
}

export async function notePinFailure(keys: string[], limit = MAX_FAILURES, windowMs = WINDOW_MS) {
  for (const key of keys.filter(Boolean)) {
    const now = Date.now()
    const local = memoryState(key)
    const remote = await remoteState(key)
    const base = remote && (!local || remote.count > local.count) ? remote : local
    const count = (base?.count ?? 0) + 1
    const resetAt = base?.resetAt ?? now + windowMs
    memory.set(key, { count, resetAt })
    await writeRemote(key, count, resetAt)
    if (count >= limit) throw lockedError(retryAfterSec(resetAt))
  }
}

export async function clearPinFailures(keys: string[]) {
  for (const key of keys.filter(Boolean)) {
    memory.delete(key)
    await deleteRemote(key)
  }
}

export function pinAttemptKeys(input: { userId?: string | null; phone?: string | null; email?: string | null }): string[] {
  const keys: string[] = []
  const userId = String(input.userId || '').trim()
  if (userId) keys.push(`pin-user:${userId}`)
  const digits = String(input.phone || '').replace(/\D/g, '')
  if (digits.length >= 10) keys.push(`pin-phone:${digits.slice(-10)}`)
  const email = String(input.email || '').trim().toLowerCase()
  if (email) keys.push(`pin-email:${email}`)
  return keys
}
