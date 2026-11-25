import { tryCreateAdminClient } from '@/lib/supabase/admin'
import { createDataClient } from '@/lib/supabase/data'
import { isPurposeId, type PurposeId } from '@/lib/purpose'
import { listScanValues, readScanValue, writeScanValue } from '@/lib/scan-store'

export type VendorProfile = {
  user_id: string
  business_name: string
  category: PurposeId | null
  logo_data_url: string
  settlement: 'wallet' | 'bank'
  bank_name: string
  bank_code: string
  bank_account_number: string
  latitude: number | null
  longitude: number | null
  phone: string
}

function db() {
  return tryCreateAdminClient() ?? createDataClient()
}

function asProfile(row: Record<string, unknown> | null, userId: string, phone = ''): VendorProfile {
  const category = isPurposeId(row?.category) ? row.category : null
  const settlement = row?.settlement === 'bank' ? 'bank' : 'wallet'
  return {
    user_id: userId,
    business_name: String(row?.business_name ?? ''),
    category,
    logo_data_url: String(row?.logo_data_url ?? ''),
    settlement,
    bank_name: String(row?.bank_name ?? ''),
    bank_code: String(row?.bank_code ?? ''),
    bank_account_number: String(row?.bank_account_number ?? '').replace(/\D/g, '').slice(0, 10),
    latitude: row?.latitude == null ? null : Number(row.latitude),
    longitude: row?.longitude == null ? null : Number(row.longitude),
    phone,
  }
}

async function phoneFor(userId: string) {
  const client = db()
  const { data } = await client.from('users').select('phone_number').eq('id', userId).maybeSingle()
  const row = data as { phone_number?: string } | null
  return String(row?.phone_number ?? '').replace(/[^\d]/g, '')
}

function vendorKey(userId: string) {
  return `scan_vendor:${userId}`
}

export async function getVendorProfile(userId: string): Promise<VendorProfile> {
  const [stored, phone] = await Promise.all([
    readScanValue<Record<string, unknown>>(vendorKey(userId)),
    phoneFor(userId),
  ])
  return asProfile(stored, userId, phone)
}

export async function saveVendorProfile(
  userId: string,
  patch: Partial<Omit<VendorProfile, 'user_id' | 'phone'>>,
) {
  const current = await getVendorProfile(userId)
  const next = {
    user_id: userId,
    business_name: patch.business_name ?? current.business_name,
    category: patch.category === undefined ? current.category : patch.category,
    logo_data_url: patch.logo_data_url ?? current.logo_data_url,
    settlement: patch.settlement ?? current.settlement,
    bank_name: patch.bank_name ?? current.bank_name,
    bank_code: patch.bank_code ?? current.bank_code,
    bank_account_number: patch.bank_account_number ?? current.bank_account_number,
    latitude: patch.latitude === undefined ? current.latitude : patch.latitude,
    longitude: patch.longitude === undefined ? current.longitude : patch.longitude,
    updated_at: new Date().toISOString(),
  }
  await writeScanValue(vendorKey(userId), next)
  return asProfile(next, userId, current.phone)
}

export async function listVendorPlaces() {
  const rows = await listScanValues<Record<string, unknown>>('scan_vendor:')
  return rows
    .map((row) => row.value)
    .map((row) => ({
      user_id: String(row.user_id),
      business_name: String(row.business_name ?? ''),
      category: isPurposeId(row.category) ? row.category : null,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
    }))
    .filter((row) => row.category && Number.isFinite(row.latitude) && Number.isFinite(row.longitude))
}
