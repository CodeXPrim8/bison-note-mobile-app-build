import { createHmac, timingSafeEqual } from 'crypto'
import { getPaystackSecret, getPaystackWebhookSecret, isPaystackConfigured } from '@/lib/env'

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

async function paystackFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${PAYSTACK_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getPaystackSecret()}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const json = (await response.json()) as PaystackEnvelope<T>
  if (!response.ok || !json.status) {
    throw new Error(json.message || `Paystack request failed: ${path}`)
  }
  return json.data
}

/**
 * Money path: create a Paystack transaction.
 * Amount is always kobo. Split uses subaccount + transaction_charge (BU commission in kobo).
 */
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

export function commissionKobo(amountNaira: number, rate: number): number {
  return Math.round(amountNaira * rate * 100)
}
