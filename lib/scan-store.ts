import { tryCreateAdminClient } from '@/lib/supabase/admin'
import { createDataClient } from '@/lib/supabase/data'

function db() {
  return tryCreateAdminClient() ?? createDataClient()
}

export async function readScanValue<T>(key: string): Promise<T | null> {
  const { data, error } = await db().from('bu_platform_settings').select('value').eq('key', key).maybeSingle()
  if (error || !data) return null
  return (data as { value?: T }).value ?? null
}

export async function writeScanValue(key: string, value: unknown) {
  const saved = await db()
    .from('bu_platform_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (saved.error) throw new Error(saved.error.message)
}

export async function listScanValues<T>(prefix: string): Promise<Array<{ key: string; value: T }>> {
  const { data, error } = await db()
    .from('bu_platform_settings')
    .select('key, value')
    .like('key', `${prefix}%`)
  if (error || !data) return []
  return (data as Array<{ key: string; value: T }>).filter((row) => row && row.value)
}
