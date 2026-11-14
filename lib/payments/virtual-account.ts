import { ApiError } from '@/lib/api/errors'
import { contactEmail } from '@/lib/auth/pin'
import { isPaystackConfigured } from '@/lib/env'
import {
  createDedicatedVirtualAccount,
  createPaystackCustomer,
  fetchPaystackCustomer,
  listDedicatedVirtualAccounts,
  type PaystackDedicatedAccount,
} from '@/lib/payments/paystack'
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

function splitName(displayName: string): { firstName: string; lastName: string } {
  const parts = displayName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: 'Bucks', lastName: 'User' }
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
    p_raw: raw ?? {},
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

export async function getOrCreateVirtualAccount(input: {
  userId: string
  email?: string | null
  phone?: string | null
  displayName?: string | null
}): Promise<VirtualAccountRecord> {
  if (!isPaystackConfigured()) {
    throw new ApiError(503, 'PAYSTACK_REQUIRED', 'Paystack is not configured.')
  }

  const stored = await getStoredVirtualAccount(input.userId)
  if (stored) return stored

  const existingProbe = await createDataClient().rpc('bu_get_virtual_account', { p_user_id: input.userId })
  if (existingProbe.error && rpcMissing(existingProbe.error.message)) {
    throw new ApiError(
      503,
      'VIRTUAL_ACCOUNT_RPC_MISSING',
      'Bank transfer funding needs a Supabase update. Run supabase/run_once_virtual_accounts_rpc.sql in the SQL editor.',
    )
  }

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
  const { firstName, lastName } = splitName(input.displayName || 'Bucks User')

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
              error instanceof Error ? error.message : 'Could not create Paystack customer',
            )
      }
    }
  }

  const customerCode = customer.customer_code
  const customerId = customer.id != null ? Number(customer.id) : null

  const listed = await listDedicatedVirtualAccounts(customerCode).catch(() => [] as PaystackDedicatedAccount[])
  const reusable = listed.find((row) => row.account_number && row.active !== false)
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
    throw new ApiError(502, 'VIRTUAL_ACCOUNT_CREATE_FAILED', 'Paystack did not return a dedicated account number')
  }
  return persistVirtualAccount(fromPaystackAccount(input.userId, created, customerCode, customerId), created)
}
