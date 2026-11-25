import { ApiError } from '@/lib/api/errors'
import { contactEmail } from '@/lib/auth/pin'
import { isPaystackConfigured, isSquadBankInEnabled } from '@/lib/env'
import {
  createDedicatedVirtualAccount,
  createPaystackCustomer,
  deactivateDedicatedVirtualAccount,
  fetchPaystackCustomer,
  listDedicatedVirtualAccounts,
  type PaystackDedicatedAccount,
} from '@/lib/payments/paystack'
import {
  createSquadCustomerVirtualAccount,
  getSquadVirtualAccountByCustomer,
  type CreateSquadCustomerVaInput,
} from '@/lib/payments/squad'
import { createDataClient } from '@/lib/supabase/data'

export type VirtualAccountRecord = {
  user_id: string
  customer_code: string
  customer_id: number | null
  account_number: string
  account_name: string | null
  bank_name: string | null
  bank_slug: string | null
  bank_id: number | null
  currency: string
  active: boolean
  provider?: 'paystack' | 'squad'
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, '')
}

function nigeriaLocalPhone(phone: string): string {
  const digits = digitsOnly(phone)
  if (digits.startsWith('234') && digits.length >= 13) return `0${digits.slice(3)}`
  if (digits.length === 10) return `0${digits}`
  if (digits.length === 11 && digits.startsWith('0')) return digits
  return digits
}

/** Paystack / bank rails are ASCII — never send Ƀucks or it becomes UCKS. */
const BRAND_ASCII = 'BUCKS'

function splitName(displayName: string): { firstName: string; lastName: string } {
  const parts = displayName
    .trim()
    .replace(/Ƀucks/gi, BRAND_ASCII)
    .replace(/efucks/gi, BRAND_ASCII)
    .replace(/[^\x00-\x7F]+ucks/gi, BRAND_ASCII)
    .replace(/^ucks\b/gi, BRAND_ASCII)
    .replace(/[^\x20-\x7E]/g, '')
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return { firstName: BRAND_ASCII, lastName: 'User' }
  if (parts.length === 1) return { firstName: parts[0], lastName: 'User' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value) return null
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null
    } catch {
      return null
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function rpcMissing(message: string) {
  return /schema cache|does not exist|Could not find the function/i.test(message)
}

function providerFromRaw(raw: unknown): 'paystack' | 'squad' | undefined {
  const meta = asRecord(raw)
  const provider = String(meta?.provider ?? '').toLowerCase()
  if (provider === 'squad') return 'squad'
  if (provider === 'paystack') return 'paystack'
  return undefined
}

function mapRow(row: Record<string, unknown>): VirtualAccountRecord {
  return {
    user_id: String(row.user_id),
    customer_code: String(row.customer_code),
    customer_id: row.customer_id == null ? null : Number(row.customer_id),
    account_number: String(row.account_number),
    account_name: row.account_name == null ? null : String(row.account_name),
    bank_name: row.bank_name == null ? null : String(row.bank_name),
    bank_slug: row.bank_slug == null ? null : String(row.bank_slug),
    bank_id: row.bank_id == null ? null : Number(row.bank_id),
    currency: String(row.currency || 'NGN'),
    active: row.active !== false,
    provider: providerFromRaw(row.raw) ?? (String(row.bank_slug || '').includes('squad') ? 'squad' : undefined),
  }
}

function squadCustomerId(userId: string) {
  return `BU${userId.replace(/-/g, '').slice(0, 18).toUpperCase()}`
}

function fromSquadAccount(
  userId: string,
  account: {
    virtual_account_number?: string
    customer_identifier?: string
    first_name?: string
    last_name?: string
    bank_code?: string
    account_name?: string
    bank_name?: string
  },
): VirtualAccountRecord {
  const first = String(account.first_name ?? '').trim()
  const last = String(account.last_name ?? '').trim()
  const name = [first, last].filter(Boolean).join(' ') || account.account_name || 'BUCKS'
  return {
    user_id: userId,
    customer_code: String(account.customer_identifier || squadCustomerId(userId)),
    customer_id: null,
    account_number: String(account.virtual_account_number),
    account_name: name,
    bank_name: account.bank_name || 'GTBank',
    bank_slug: 'squad-gtbank',
    bank_id: account.bank_code ? Number(account.bank_code) : 58,
    currency: 'NGN',
    active: true,
    provider: 'squad',
  }
}

function fromPaystackAccount(
  userId: string,
  account: PaystackDedicatedAccount,
  customerCode: string,
  customerId: number | null,
): VirtualAccountRecord {
  return {
    user_id: userId,
    customer_code: customerCode,
    customer_id: customerId ?? (account.customer?.id != null ? Number(account.customer.id) : null),
    account_number: String(account.account_number),
    account_name: account.account_name ? String(account.account_name) : null,
    bank_name: account.bank?.name ? String(account.bank.name) : null,
    bank_slug: account.bank?.slug ? String(account.bank.slug) : null,
    bank_id: account.bank?.id != null ? Number(account.bank.id) : null,
    currency: String(account.currency || 'NGN'),
    active: account.active !== false,
  }
}

async function persistVirtualAccount(record: VirtualAccountRecord, raw: unknown) {
  const db = createDataClient()
  const rawObj = asRecord(raw) ?? {}
  const stamped = {
    ...rawObj,
    provider: record.provider ?? rawObj.provider ?? 'paystack',
  }
  const { data, error } = await db.rpc('bu_upsert_virtual_account', {
    p_user_id: record.user_id,
    p_customer_code: record.customer_code,
    p_account_number: record.account_number,
    p_customer_id: record.customer_id,
    p_account_name: record.account_name,
    p_bank_name: record.bank_name,
    p_bank_slug: record.bank_slug,
    p_bank_id: record.bank_id,
    p_currency: record.currency,
    p_active: record.active,
    p_raw: stamped,
  })
  if (error) {
    if (rpcMissing(error.message)) {
      throw new ApiError(
        503,
        'VIRTUAL_ACCOUNT_RPC_MISSING',
        'Bank transfer funding needs a Supabase update. Run supabase/run_once_virtual_accounts_rpc.sql in the SQL editor.',
      )
    }
    throw new ApiError(500, 'VIRTUAL_ACCOUNT_SAVE_FAILED', error.message || 'Could not save virtual account')
  }
  const row = asRecord(data)
  if (row) return mapRow(row)
  return record
}

export async function findVirtualAccountByAccountNumber(accountNumber: string): Promise<VirtualAccountRecord | null> {
  const digits = digitsOnly(accountNumber)
  if (!digits) return null
  const db = createDataClient()
  const { data, error } = await db.rpc('bu_find_virtual_account', {
    p_account_number: digits,
    p_customer_code: null,
  })
  if (error) {
    if (rpcMissing(error.message)) return null
    throw new ApiError(500, 'VIRTUAL_ACCOUNT_LOOKUP_FAILED', error.message)
  }
  const row = asRecord(data)
  return row ? mapRow(row) : null
}

export async function findVirtualAccountByCustomerCode(customerCode: string): Promise<VirtualAccountRecord | null> {
  if (!customerCode) return null
  const db = createDataClient()
  const { data, error } = await db.rpc('bu_find_virtual_account', {
    p_account_number: null,
    p_customer_code: customerCode,
  })
  if (error) {
    if (rpcMissing(error.message)) return null
    throw new ApiError(500, 'VIRTUAL_ACCOUNT_LOOKUP_FAILED', error.message)
  }
  const row = asRecord(data)
  return row ? mapRow(row) : null
}

export async function getStoredVirtualAccount(userId: string): Promise<VirtualAccountRecord | null> {
  const db = createDataClient()
  const existing = await db.rpc('bu_get_virtual_account', { p_user_id: userId })
  if (existing.error) {
    if (rpcMissing(existing.error.message)) return null
    throw new ApiError(500, 'VIRTUAL_ACCOUNT_LOOKUP_FAILED', existing.error.message)
  }
  const existingRow = asRecord(existing.data)
  if (existingRow?.account_number) return mapRow(existingRow)
  return null
}

export function virtualAccountNeedsBrandRefresh(accountName: string | null | undefined) {
  const name = (accountName || '').trim()
  if (!name) return false
  // Old trading name, or Ƀ mangled/stripped by banks from "Ƀucks" → "UCKS" / "EFUCKS" / "ÉƒUCKS"
  return (
    /protectorng/i.test(name) ||
    /^ucks(\s*\/|\b)/i.test(name) ||
    /\befucks\b/i.test(name) ||
    /[^\x00-\x7F].*ucks/i.test(name) ||
    /^[^b]*ucks\b/i.test(name)
  )
}

async function resolvePaystackCustomerForUser(input: {
  userId: string
  email?: string | null
  phone?: string | null
  displayName?: string | null
}) {
  const email = contactEmail(input.email)
  if (!email) {
    throw new ApiError(
      400,
      'EMAIL_REQUIRED',
      'This account has no email yet. Add your own email in Settings before using bank transfer funding.',
    )
  }
  const phoneRaw = input.phone?.trim()
  if (!phoneRaw) {
    throw new ApiError(400, 'PHONE_REQUIRED', 'This account has no phone number. Complete signup before bank transfer funding.')
  }
  const phone = nigeriaLocalPhone(phoneRaw)
  const { firstName, lastName } = splitName(input.displayName || `${BRAND_ASCII} User`)

  let customer = await fetchPaystackCustomer(email)
  if (!customer) {
    try {
      customer = await createPaystackCustomer({
        email,
        firstName,
        lastName,
        phone,
        metadata: { user_id: input.userId, source: 'bucks_dva' },
      })
    } catch (error) {
      customer = await fetchPaystackCustomer(email)
      if (!customer) {
        throw error instanceof ApiError
          ? error
          : new ApiError(
              502,
              'PAYSTACK_CUSTOMER_FAILED',
              error instanceof Error ? error.message : 'Could not set up funding profile',
            )
      }
    }
  }

  return { customer, email, phone, firstName, lastName }
}

export type SquadFundingKyc = {
  bvn: string
  dob: string
  gender: '1' | '2'
  address: string
}

/** Create or return a Squad permanent VA. Requires one-time BVN KYC (Squad rule). */
export async function getOrCreateSquadVirtualAccount(input: {
  userId: string
  email?: string | null
  phone?: string | null
  displayName?: string | null
  kyc?: SquadFundingKyc | null
}): Promise<VirtualAccountRecord> {
  if (!isSquadBankInEnabled()) {
    throw new ApiError(503, 'SQUAD_REQUIRED', 'Squad bank-in is not configured yet.')
  }

  const stored = await getStoredVirtualAccount(input.userId)
  if (stored?.provider === 'squad' || stored?.bank_slug === 'squad-gtbank') {
    return { ...stored, provider: 'squad' }
  }

  const customerIdentifier = squadCustomerId(input.userId)
  const existingRemote = await getSquadVirtualAccountByCustomer(customerIdentifier).catch(() => null)
  if (existingRemote?.virtual_account_number) {
    return persistVirtualAccount(fromSquadAccount(input.userId, existingRemote), existingRemote)
  }

  if (!input.kyc) {
    throw new ApiError(
      428,
      'SQUAD_KYC_REQUIRED',
      'Bank transfer on Squad needs a one-time BVN check (name, date of birth, phone must match BVN).',
      { needs_kyc: true, provider: 'squad' },
    )
  }

  const phoneRaw = input.phone?.trim()
  if (!phoneRaw) {
    throw new ApiError(400, 'PHONE_REQUIRED', 'This account has no phone number. Complete signup before bank transfer funding.')
  }
  const { firstName, lastName } = splitName(input.displayName || `${BRAND_ASCII} User`)
  const created = await createSquadCustomerVirtualAccount({
    customerIdentifier,
    firstName,
    lastName,
    mobileNum: phoneRaw,
    email: contactEmail(input.email),
    bvn: input.kyc.bvn,
    dob: input.kyc.dob,
    gender: input.kyc.gender,
    address: input.kyc.address,
  } satisfies CreateSquadCustomerVaInput)

  return persistVirtualAccount(fromSquadAccount(input.userId, created), created)
}

export async function getOrCreateVirtualAccount(input: {
  userId: string
  email?: string | null
  phone?: string | null
  displayName?: string | null
  kyc?: SquadFundingKyc | null
}): Promise<VirtualAccountRecord> {
  // Squad bank-in when enabled — cheaper VA fees than Paystack DVA for typical top-ups.
  if (isSquadBankInEnabled()) {
    const stored = await getStoredVirtualAccount(input.userId)
    if (stored?.provider === 'squad' || stored?.bank_slug === 'squad-gtbank') {
      return { ...stored, provider: 'squad' }
    }
    // Existing Paystack DVA stays usable until the user completes Squad KYC.
    if (stored && !input.kyc) return stored
    return getOrCreateSquadVirtualAccount(input)
  }

  if (!isPaystackConfigured()) {
    throw new ApiError(503, 'PAYSTACK_REQUIRED', 'Funding is not available right now.')
  }

  const stored = await getStoredVirtualAccount(input.userId)
  if (stored) {
    // Upgrade off PROTECTORNG or "UCKS/..." (Ƀucks stripped by banks). Trading name must be ASCII BUCKS.
    if (virtualAccountNeedsBrandRefresh(stored.account_name)) {
      try {
        return await recreateVirtualAccount(input)
      } catch (error) {
        console.error('dva brand refresh failed', error instanceof Error ? error.message : error)
        return stored
      }
    }
    return { ...stored, provider: stored.provider ?? 'paystack' }
  }

  const existingProbe = await createDataClient().rpc('bu_get_virtual_account', { p_user_id: input.userId })
  if (existingProbe.error && rpcMissing(existingProbe.error.message)) {
    throw new ApiError(
      503,
      'VIRTUAL_ACCOUNT_RPC_MISSING',
      'Bank transfer funding needs a Supabase update. Run supabase/run_once_virtual_accounts_rpc.sql in the SQL editor.',
    )
  }

  const { customer, phone, firstName, lastName } = await resolvePaystackCustomerForUser(input)
  const customerCode = customer.customer_code
  const customerId = customer.id != null ? Number(customer.id) : null

  const listed = await listDedicatedVirtualAccounts(customerCode).catch(() => [] as PaystackDedicatedAccount[])
  const reusable = listed.find(
    (row) =>
      row.account_number &&
      row.active !== false &&
      !virtualAccountNeedsBrandRefresh(row.account_name ? String(row.account_name) : null),
  )
  if (reusable) {
    return persistVirtualAccount(fromPaystackAccount(input.userId, reusable, customerCode, customerId), reusable)
  }

  const created = await createDedicatedVirtualAccount({
    customer: customerCode,
    firstName,
    lastName,
    phone,
  })
  if (!created?.account_number) {
    throw new ApiError(502, 'VIRTUAL_ACCOUNT_CREATE_FAILED', 'Could not create a funding account number')
  }
  return persistVirtualAccount(fromPaystackAccount(input.userId, created, customerCode, customerId), created)
}

/**
 * Deactivate the current dedicated virtual account and issue a new one so the account name
 * picks up the latest trading name (e.g. BUCKS instead of PROTECTORNG).
 */
export async function recreateVirtualAccount(input: {
  userId: string
  email?: string | null
  phone?: string | null
  displayName?: string | null
}): Promise<VirtualAccountRecord> {
  if (!isPaystackConfigured()) {
    throw new ApiError(503, 'PAYSTACK_REQUIRED', 'Funding is not available right now.')
  }

  const { customer, phone, firstName, lastName } = await resolvePaystackCustomerForUser(input)
  const customerCode = customer.customer_code
  const customerId = customer.id != null ? Number(customer.id) : null
  const stored = await getStoredVirtualAccount(input.userId)

  const listed = await listDedicatedVirtualAccounts(customerCode).catch(() => [] as PaystackDedicatedAccount[])
  const toDeactivate = listed.filter((row) => {
    if (!row.id) return false
    if (row.active === false || row.assigned === false) return false
    if (stored?.account_number && String(row.account_number) === stored.account_number) return true
    return Boolean(row.account_number)
  })

  for (const row of toDeactivate) {
    try {
      await deactivateDedicatedVirtualAccount(Number(row.id))
    } catch (error) {
      console.error('dva deactivate failed', row.id, error instanceof Error ? error.message : error)
    }
  }

  const created = await createDedicatedVirtualAccount({
    customer: customerCode,
    firstName,
    lastName,
    phone,
  })
  if (!created?.account_number) {
    throw new ApiError(502, 'VIRTUAL_ACCOUNT_CREATE_FAILED', 'Could not create a new funding account number')
  }

  return persistVirtualAccount(fromPaystackAccount(input.userId, created, customerCode, customerId), created)
}
