import { createHmac, timingSafeEqual } from 'crypto'
import {
  getPaystackDvaPreferredBank,
  getPaystackSecret,
  getPaystackWebhookSecret,
  isPaystackConfigured,
} from '@/lib/env'

export { isPaystackConfigured, getPaystackDvaPreferredBank }

const PAYSTACK_BASE = 'https://api.paystack.co'

export interface PaystackInitializeInput {
  email: string
  amountKobo: number
  reference: string
  callbackUrl: string
  metadata: Record<string, unknown>
  subaccount?: string
  transactionCharge?: number
}

export interface PaystackInitializeResult {
  authorization_url: string
  access_code: string
  reference: string
}

interface PaystackEnvelope<T> {
  status: boolean
  message: string
  data: T
}

type PaystackMeta = { page?: number; pageCount?: number; next?: string | null; total?: number }

async function paystackRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<PaystackEnvelope<T> & { meta?: PaystackMeta }> {
  const response = await fetch(`${PAYSTACK_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getPaystackSecret()}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const json = (await response.json()) as PaystackEnvelope<T> & { meta?: PaystackMeta }
  if (!response.ok || !json.status) {
    throw new Error(json.message || `Paystack request failed: ${path}`)
  }
  return json
}

async function paystackFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const json = await paystackRequest<T>(path, init)
  return json.data
}

export async function initializeTransaction(
  input: PaystackInitializeInput,
): Promise<PaystackInitializeResult> {
  const body: Record<string, unknown> = {
    email: input.email,
    amount: input.amountKobo,
    reference: input.reference,
    callback_url: input.callbackUrl,
    metadata: input.metadata,
    currency: 'NGN',
  }
  if (input.subaccount) {
    body.subaccount = input.subaccount
    body.bearer = 'subaccount'
    if (typeof input.transactionCharge === 'number') {
      body.transaction_charge = input.transactionCharge
    }
  }
  return paystackFetch<PaystackInitializeResult>('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function verifyTransaction(reference: string): Promise<{
  status: string
  amount: number
  reference: string
  channel?: string
  fees?: number
  customer: { email: string; customer_code?: string; id?: number }
  metadata: Record<string, unknown>
  authorization?: {
    channel?: string
    receiver_bank_account_number?: string
    receiver_bank?: string
    account_number?: string
    bank?: string
  }
}> {
  return paystackFetch(`/transaction/verify/${encodeURIComponent(reference)}`)
}

export async function listPaystackTransactions(input?: {
  customer?: string | number
  perPage?: number
  page?: number
}): Promise<
  Array<{
    status: string
    amount: number
    reference: string
    channel?: string
    fees?: number
    paid_at?: string | null
    created_at?: string
    customer?: { email?: string; customer_code?: string; id?: number }
    metadata?: Record<string, unknown>
    authorization?: {
      channel?: string
      receiver_bank_account_number?: string
      receiver_bank?: string
      account_number?: string
      bank?: string
    }
  }>
> {
  const params = new URLSearchParams()
  params.set('perPage', String(input?.perPage ?? 25))
  params.set('page', String(input?.page ?? 1))
  if (input?.customer != null && String(input.customer).trim()) {
    params.set('customer', String(input.customer).trim())
  }
  return paystackFetch(`/transaction?${params.toString()}`)
}

export async function createSubaccount(input: {
  businessName: string
  settlementBank: string
  accountNumber: string
  percentageCharge: number
}): Promise<{ subaccount_code: string }> {
  return paystackFetch('/subaccount', {
    method: 'POST',
    body: JSON.stringify({
      business_name: input.businessName,
      settlement_bank: input.settlementBank,
      account_number: input.accountNumber,
      percentage_charge: input.percentageCharge,
    }),
  })
}

export function verifyPaystackSignature(rawBody: string, signature: string | null): boolean {
  if (!signature || !isPaystackConfigured()) return false
  const digest = createHmac('sha512', getPaystackWebhookSecret()).update(rawBody).digest('hex')
  const a = Buffer.from(digest)
  const b = Buffer.from(signature)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function nairaToKobo(naira: number): number {
  return Math.round(naira * 100)
}

export type PaystackCustomer = {
  id: number
  customer_code: string
  email: string
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
}

export type PaystackDedicatedAccount = {
  id?: number
  account_number: string
  account_name: string
  currency?: string
  active?: boolean
  assigned?: boolean
  bank: { name: string; id?: number; slug?: string }
  customer?: { id?: number; customer_code?: string; email?: string }
}

export async function createPaystackCustomer(input: {
  email: string
  firstName: string
  lastName: string
  phone: string
  metadata?: Record<string, unknown>
}): Promise<PaystackCustomer> {
  return paystackFetch<PaystackCustomer>('/customer', {
    method: 'POST',
    body: JSON.stringify({
      email: input.email,
      first_name: input.firstName,
      last_name: input.lastName,
      phone: input.phone,
      metadata: input.metadata,
    }),
  })
}

export async function fetchPaystackCustomer(emailOrCode: string): Promise<PaystackCustomer | null> {
  try {
    return await paystackFetch<PaystackCustomer>(`/customer/${encodeURIComponent(emailOrCode)}`)
  } catch {
    return null
  }
}

export async function createDedicatedVirtualAccount(input: {
  customer: string | number
  preferredBank?: string
  firstName?: string
  lastName?: string
  phone?: string
}): Promise<PaystackDedicatedAccount> {
  const body: Record<string, unknown> = {
    customer: input.customer,
    preferred_bank: input.preferredBank || getPaystackDvaPreferredBank(),
  }
  if (input.firstName) body.first_name = input.firstName
  if (input.lastName) body.last_name = input.lastName
  if (input.phone) body.phone = input.phone
  return paystackFetch<PaystackDedicatedAccount>('/dedicated_account', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function listDedicatedVirtualAccounts(customer: string | number): Promise<PaystackDedicatedAccount[]> {
  const data = await paystackFetch<PaystackDedicatedAccount[] | PaystackDedicatedAccount>(
    `/dedicated_account?customer=${encodeURIComponent(String(customer))}`,
  )
  if (Array.isArray(data)) return data
  return data ? [data] : []
}

const requeryCooldown = new Map<string, number>()

/** Ask Paystack to pull pending bank transfers into charge.success (max once / 10 min per account). */
export async function requeryDedicatedVirtualAccount(input: {
  accountNumber: string
  providerSlug: string
  date?: string
}): Promise<{ ok: boolean; message?: string; skipped?: boolean }> {
  const accountNumber = input.accountNumber.replace(/\D/g, '')
  const providerSlug = input.providerSlug.trim().toLowerCase()
  if (!accountNumber || !providerSlug) return { ok: false, message: 'Missing account or bank' }

  const key = `${accountNumber}:${providerSlug}`
  const last = requeryCooldown.get(key) ?? 0
  if (Date.now() - last < 10 * 60 * 1000) {
    return { ok: true, skipped: true, message: 'Requery recently sent' }
  }

  const date = input.date || new Date().toISOString().slice(0, 10)
  const path =
    `/dedicated_account/requery?account_number=${encodeURIComponent(accountNumber)}` +
    `&provider_slug=${encodeURIComponent(providerSlug)}` +
    `&date=${encodeURIComponent(date)}`
  try {
    const json = await paystackRequest<{ message?: string }>(path)
    requeryCooldown.set(key, Date.now())
    return { ok: true, message: json.message }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Requery failed'
    if (/once every|10 minute|rate/i.test(message)) {
      requeryCooldown.set(key, Date.now())
      return { ok: true, skipped: true, message }
    }
    return { ok: false, message }
  }
}

export async function createTransferRecipient(input: {
  name: string
  accountNumber: string
  bankCode: string
}): Promise<{ recipient_code: string }> {
  return paystackFetch<{ recipient_code: string }>('/transferrecipient', {
    method: 'POST',
    body: JSON.stringify({
      type: 'nuban',
      name: input.name,
      account_number: input.accountNumber.replace(/\s+/g, ''),
      bank_code: input.bankCode,
      currency: 'NGN',
    }),
  })
}

export async function resolveNuban(accountNumber: string, bankCode: string): Promise<{ account_name: string; account_number: string }> {
  const digits = accountNumber.replace(/\s+/g, '')
  return paystackFetch<{ account_name: string; account_number: string }>(
    `/bank/resolve?account_number=${encodeURIComponent(digits)}&bank_code=${encodeURIComponent(bankCode)}`,
  )
}

export type PaystackBank = { name: string; code: string; slug?: string }

let bankCache: { at: number; banks: PaystackBank[] } | null = null

export async function listPaystackNgnBanks(): Promise<PaystackBank[]> {
  if (bankCache && Date.now() - bankCache.at < 60 * 60 * 1000) return bankCache.banks
  const banks: PaystackBank[] = []
  const seen = new Set<string>()
  for (let page = 1; page <= 15; page++) {
    const json = await paystackRequest<
      Array<{ name?: string; code?: string; slug?: string; active?: boolean; is_deleted?: boolean }>
    >(`/bank?currency=NGN&country=nigeria&perPage=100&page=${page}`)
    const chunk = (json.data ?? [])
      .filter((row) => row.active !== false && !row.is_deleted && row.name && row.code)
      .map((row) => ({ name: String(row.name), code: String(row.code), slug: row.slug }))
    for (const bank of chunk) {
      if (seen.has(bank.code)) continue
      seen.add(bank.code)
      banks.push(bank)
    }
    const pageCount = Number(json.meta?.pageCount || 0)
    if (pageCount && page >= pageCount) break
    if (!chunk.length || chunk.length < 50) break
  }
  bankCache = { at: Date.now(), banks }
  return banks
}

export async function initiateTransfer(input: {
  amountKobo: number
  recipient: string
  reference: string
  reason: string
}): Promise<{ transfer_code: string; reference: string; status: string }> {
  return paystackFetch<{ transfer_code: string; reference: string; status: string }>('/transfer', {
    method: 'POST',
    body: JSON.stringify({
      source: 'balance',
      amount: input.amountKobo,
      recipient: input.recipient,
      reference: input.reference,
      reason: input.reason,
    }),
  })
}

export function commissionKobo(amountNaira: number, rate: number): number {
  return Math.round(amountNaira * rate * 100)
}

export type PaystackBalanceRow = {
  currency: string
  kobo: number
  naira: number
}

export type AdminPaystackSnapshot = {
  ready: boolean
  naira: number | null
  currency: string
  error: string | null
}

let balanceCache: { at: number; value: AdminPaystackSnapshot } | null = null

export async function getPaystackBalances(): Promise<PaystackBalanceRow[]> {
  const data = await paystackFetch<
    | Array<{ currency?: string; balance?: number; available_balance?: number }>
    | { currency?: string; balance?: number; available_balance?: number }
  >('/balance')
  const rows = Array.isArray(data) ? data : data ? [data] : []
  return rows.map((row) => {
    const kobo = Math.round(Number(row.balance ?? row.available_balance ?? 0))
    return {
      currency: String(row.currency || 'NGN').toUpperCase(),
      kobo,
      naira: kobo / 100,
    }
  })
}

export async function adminPaystackSnapshot(): Promise<AdminPaystackSnapshot> {
  if (balanceCache && Date.now() - balanceCache.at < 20_000) return balanceCache.value
  if (!isPaystackConfigured()) {
    const empty = { ready: false, naira: null, currency: 'NGN', error: 'Paystack is not configured' }
    balanceCache = { at: Date.now(), value: empty }
    return empty
  }
  try {
    const rows = await getPaystackBalances()
    const ngn = rows.find((row) => row.currency === 'NGN') ?? rows[0] ?? null
    const value: AdminPaystackSnapshot = ngn
      ? { ready: true, naira: ngn.naira, currency: ngn.currency, error: null }
      : { ready: true, naira: null, currency: 'NGN', error: 'Paystack did not return an NGN balance' }
    balanceCache = { at: Date.now(), value }
    return value
  } catch (error) {
    const value: AdminPaystackSnapshot = {
      ready: true,
      naira: null,
      currency: 'NGN',
      error: error instanceof Error ? error.message : 'Could not load Paystack balance',
    }
    balanceCache = { at: Date.now(), value }
    return value
  }
}
