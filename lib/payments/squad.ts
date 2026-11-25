import { createHmac, timingSafeEqual } from 'crypto'
import { ApiError } from '@/lib/api/errors'
import {
  getSquadApiBase,
  getSquadBeneficiaryAccount,
  getSquadSecret,
  isSquadConfigured,
} from '@/lib/env'

export { isSquadConfigured, getSquadBeneficiaryAccount }

type SquadEnvelope<T> = {
  status?: number | boolean
  success?: boolean
  message?: string
  data?: T
}

export type SquadVirtualAccount = {
  first_name?: string
  last_name?: string
  bank_code?: string
  virtual_account_number?: string
  beneficiary_account?: string | null
  customer_identifier?: string
  account_name?: string
  bank_name?: string
  created_at?: string
  updated_at?: string
}

export type SquadVaWebhookPayload = {
  transaction_reference?: string
  virtual_account_number?: string
  principal_amount?: string | number
  settled_amount?: string | number
  fee_charged?: string | number
  transaction_date?: string
  customer_identifier?: string
  transaction_indicator?: string
  remarks?: string
  currency?: string
  channel?: string
  VersionNumber?: string | number
  encrypted_body?: string
  meta?: Record<string, unknown> | null
}

export type CreateSquadCustomerVaInput = {
  customerIdentifier: string
  firstName: string
  lastName: string
  mobileNum: string
  email?: string | null
  bvn: string
  dob: string
  gender: '1' | '2'
  address: string
  middleName?: string | null
}

async function squadRequest<T>(path: string, init?: RequestInit): Promise<SquadEnvelope<T>> {
  const response = await fetch(`${getSquadApiBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getSquadSecret()}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const json = (await response.json().catch(() => ({}))) as SquadEnvelope<T>
  const ok = response.ok && (json.success === true || json.status === 200 || json.status === true)
  if (!ok) {
    const message = String(json.message || `Squad request failed (${response.status})`)
    throw new ApiError(response.status >= 400 && response.status < 600 ? response.status : 502, 'SQUAD_ERROR', message, json)
  }
  return json
}

function nigeriaMobile11(phone: string) {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('234') && digits.length >= 13) return `0${digits.slice(3, 13)}`
  if (digits.length === 10) return `0${digits}`
  if (digits.length === 11 && digits.startsWith('0')) return digits
  return digits.slice(0, 11)
}

/** Create a permanent customer virtual account (BVN-validated). */
export async function createSquadCustomerVirtualAccount(
  input: CreateSquadCustomerVaInput,
): Promise<SquadVirtualAccount> {
  const beneficiary = getSquadBeneficiaryAccount()
  if (!beneficiary) {
    throw new ApiError(
      503,
      'SQUAD_BENEFICIARY_REQUIRED',
      'Add SQUAD_BENEFICIARY_ACCOUNT (your 10-digit GTBank settlement account) before creating Squad funding accounts.',
    )
  }

  const body = {
    customer_identifier: input.customerIdentifier,
    first_name: input.firstName,
    last_name: input.lastName,
    mobile_num: nigeriaMobile11(input.mobileNum),
    email: input.email || undefined,
    middle_name: input.middleName || undefined,
    bvn: input.bvn.replace(/\D/g, ''),
    dob: input.dob,
    gender: input.gender,
    address: input.address,
    beneficiary_account: beneficiary,
  }

  const json = await squadRequest<SquadVirtualAccount>('/virtual-account', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (!json.data?.virtual_account_number) {
    throw new ApiError(502, 'SQUAD_VA_CREATE_FAILED', json.message || 'Could not create Squad virtual account')
  }
  return json.data
}

export async function getSquadVirtualAccountByCustomer(
  customerIdentifier: string,
): Promise<SquadVirtualAccount | null> {
  try {
    const json = await squadRequest<SquadVirtualAccount>(
      `/virtual-account/${encodeURIComponent(customerIdentifier)}`,
    )
    return json.data ?? null
  } catch (error) {
    if (error instanceof ApiError && (error.httpStatus === 404 || error.httpStatus === 400)) return null
    throw error
  }
}

export async function getSquadVirtualAccountByNumber(
  accountNumber: string,
): Promise<SquadVirtualAccount | null> {
  const digits = accountNumber.replace(/\D/g, '')
  if (!digits) return null
  try {
    const json = await squadRequest<SquadVirtualAccount>(
      `/virtual-account/customer/${encodeURIComponent(digits)}`,
    )
    return json.data ?? null
  } catch (error) {
    if (error instanceof ApiError && (error.httpStatus === 404 || error.httpStatus === 400)) return null
    throw error
  }
}

export type SquadCustomerTx = {
  transaction_reference?: string
  principal_amount?: string | number
  settled_amount?: string | number
  fee_charged?: string | number
  transaction_date?: string
  virtual_account_number?: string
  customer_identifier?: string
  currency?: string
}

export async function listSquadCustomerTransactions(
  customerIdentifier: string,
): Promise<SquadCustomerTx[]> {
  try {
    const json = await squadRequest<SquadCustomerTx[] | { rows?: SquadCustomerTx[] }>(
      `/virtual-account/customer/transactions/${encodeURIComponent(customerIdentifier)}`,
    )
    if (Array.isArray(json.data)) return json.data
    if (json.data && typeof json.data === 'object' && Array.isArray((json.data as { rows?: SquadCustomerTx[] }).rows)) {
      return (json.data as { rows: SquadCustomerTx[] }).rows
    }
    return []
  } catch {
    return []
  }
}

function safeEqualHex(a: string, b: string) {
  try {
    const left = Buffer.from(a)
    const right = Buffer.from(b)
    if (left.length !== right.length) return false
    return timingSafeEqual(left, right)
  } catch {
    return false
  }
}

/** Validate Squad webhook. Supports body HMAC and v2/v3 pipe hash. */
export function verifySquadWebhookSignature(rawBody: string, headerValue: string | null, payload?: SquadVaWebhookPayload) {
  if (!isSquadConfigured() || !headerValue) return false
  const secret = getSquadSecret()
  const expectedHeader = headerValue.trim()

  const fullHash = createHmac('sha512', secret).update(rawBody).digest('hex')
  if (safeEqualHex(fullHash, expectedHeader) || safeEqualHex(fullHash.toUpperCase(), expectedHeader.toUpperCase())) {
    return true
  }

  if (payload) {
    const pipe = [
      payload.transaction_reference,
      payload.virtual_account_number,
      payload.currency,
      payload.principal_amount,
      payload.settled_amount,
      payload.customer_identifier,
    ]
      .map((part) => String(part ?? ''))
      .join('|')
    const pipeHash = createHmac('sha512', secret).update(pipe).digest('hex')
    if (safeEqualHex(pipeHash, expectedHeader) || safeEqualHex(pipeHash.toUpperCase(), expectedHeader.toUpperCase())) {
      return true
    }
  }

  return false
}
