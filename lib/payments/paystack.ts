import { createHmac, timingSafeEqual } from 'crypto'
import { getPaystackSecret, getPaystackWebhookSecret, isPaystackConfigured } from '@/lib/env'

export { isPaystackConfigured }

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
  customer: { email: string }
  metadata: Record<string, unknown>
}> {
  return paystackFetch(`/transaction/verify/${encodeURIComponent(reference)}`)
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
