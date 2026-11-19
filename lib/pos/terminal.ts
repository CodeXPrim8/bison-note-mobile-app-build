import { randomUUID } from 'crypto'
import { ApiError } from '@/lib/api/errors'
import { roundMoney } from '@/lib/bu-rate'
import {
  createPaystackCustomer,
  createPaystackPaymentRequest,
  fetchPaystackCustomer,
  fetchPaystackTerminal,
  fetchPaystackTerminalPresence,
  isPaystackConfigured,
  listPaystackTerminals,
  nairaToKobo,
  pushPaystackTerminalInvoice,
} from '@/lib/payments/paystack'
import { createDataClient } from '@/lib/supabase/data'
import { tryCreateAdminClient } from '@/lib/supabase/admin'
import { moveLiveWallet } from '@/lib/wallet/move'

export const POS_TERMINAL_SQL_HINT =
  'Run supabase/migrations/0035_vendor_terminals.sql in the live ɃU Supabase SQL editor.'

export type VendorTerminal = {
  id: string
  vendor_user_id: string
  terminal_id: string
  serial_number: string | null
  label: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export type TerminalCharge = {
  id: string
  reference: string
  vendor_user_id: string
  terminal_id: string
  amount_naira: number
  payment_request_id: number | null
  offline_reference: string | null
  paystack_event_id: string | null
  paystack_reference: string | null
  status: 'pending' | 'pushed' | 'paid' | 'failed' | 'cancelled'
  note: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

function db() {
  return tryCreateAdminClient() ?? createDataClient()
}

function asTerminal(raw: unknown): VendorTerminal | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  return {
    id: String(row.id ?? ''),
    vendor_user_id: String(row.vendor_user_id ?? ''),
    terminal_id: String(row.terminal_id ?? ''),
    serial_number: row.serial_number ? String(row.serial_number) : null,
    label: row.label ? String(row.label) : null,
    active: row.active !== false,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

function asCharge(raw: unknown): TerminalCharge | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const status = String(row.status ?? 'pending')
  if (!['pending', 'pushed', 'paid', 'failed', 'cancelled'].includes(status)) return null
  return {
    id: String(row.id ?? ''),
    reference: String(row.reference ?? ''),
    vendor_user_id: String(row.vendor_user_id ?? ''),
    terminal_id: String(row.terminal_id ?? ''),
    amount_naira: Number(row.amount_naira ?? 0),
    payment_request_id: row.payment_request_id != null ? Number(row.payment_request_id) : null,
    offline_reference: row.offline_reference ? String(row.offline_reference) : null,
    paystack_event_id: row.paystack_event_id ? String(row.paystack_event_id) : null,
    paystack_reference: row.paystack_reference ? String(row.paystack_reference) : null,
    status: status as TerminalCharge['status'],
    note: row.note ? String(row.note) : null,
    metadata:
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {},
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

function sqlMissing(message: string) {
  return /schema cache|does not exist|could not find the table/i.test(message)
}

export async function listVendorTerminals(vendorUserId: string) {
  const client = db()
  const { data, error } = await client
    .from('bu_vendor_terminals')
    .select('*')
    .eq('vendor_user_id', vendorUserId)
    .order('created_at', { ascending: false })
  if (error) {
    if (sqlMissing(error.message)) return []
    throw new ApiError(500, 'TERMINAL_LIST_FAILED', error.message)
  }
  return ((data ?? []) as unknown[]).map(asTerminal).filter(Boolean) as VendorTerminal[]
}

export async function getActiveVendorTerminal(vendorUserId: string) {
  const rows = await listVendorTerminals(vendorUserId)
  return rows.find((row) => row.active) ?? null
}

export async function linkVendorTerminal(input: {
  vendorUserId: string
  terminalId: string
  label?: string | null
}) {
  if (!isPaystackConfigured()) {
    throw new ApiError(503, 'PAYSTACK_REQUIRED', 'Paystack is not configured.')
  }
  const terminalId = input.terminalId.trim()
  if (!terminalId) throw new ApiError(400, 'VALIDATION_ERROR', 'terminal_id required')

  let serial: string | null = null
  let label = input.label?.trim() || null
  try {
    const remote = await fetchPaystackTerminal(terminalId)
    serial = remote.serial_number ? String(remote.serial_number) : null
    if (!label) label = remote.name ? String(remote.name) : null
  } catch (error) {
    // Allow linking by known id even if fetch fails (sandbox quirks).
    const message = error instanceof Error ? error.message : 'Terminal not found'
    if (/not found|404/i.test(message)) {
      throw new ApiError(404, 'TERMINAL_NOT_FOUND', 'Paystack Terminal not found on this integration.')
    }
  }

  const client = db()
  await client
    .from('bu_vendor_terminals')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('vendor_user_id', input.vendorUserId)

  const upsert = await client
    .from('bu_vendor_terminals')
    .upsert(
      {
        vendor_user_id: input.vendorUserId,
        terminal_id: terminalId,
        serial_number: serial,
        label,
        active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'vendor_user_id,terminal_id' },
    )
    .select('*')
    .maybeSingle()

  if (upsert.error) {
    if (sqlMissing(upsert.error.message)) {
      throw new ApiError(503, 'TERMINAL_SQL_REQUIRED', POS_TERMINAL_SQL_HINT)
    }
    throw new ApiError(500, 'TERMINAL_LINK_FAILED', upsert.error.message)
  }
  return asTerminal(upsert.data) as VendorTerminal
}

export async function unlinkVendorTerminal(vendorUserId: string, terminalId: string) {
  const client = db()
  const updated = await client
    .from('bu_vendor_terminals')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('vendor_user_id', vendorUserId)
    .eq('terminal_id', terminalId)
    .select('*')
    .maybeSingle()
  if (updated.error) {
    if (sqlMissing(updated.error.message)) {
      throw new ApiError(503, 'TERMINAL_SQL_REQUIRED', POS_TERMINAL_SQL_HINT)
    }
    throw new ApiError(500, 'TERMINAL_UNLINK_FAILED', updated.error.message)
  }
  if (!updated.data) throw new ApiError(404, 'NOT_FOUND', 'Terminal link not found')
  return asTerminal(updated.data) as VendorTerminal
}

async function ensurePosCustomer(vendorUserId: string) {
  const email = `pos+${vendorUserId.replace(/-/g, '').slice(0, 18)}@bucks.pos`
  const existing = await fetchPaystackCustomer(email)
  if (existing?.customer_code) return existing.customer_code
  const created = await createPaystackCustomer({
    email,
    firstName: 'Business',
    lastName: 'POS',
    phone: '08000000000',
    metadata: { kind: 'business_pos_terminal', vendor_user_id: vendorUserId },
  })
  return created.customer_code
}

export async function listIntegrationTerminals() {
  if (!isPaystackConfigured()) return []
  try {
    return await listPaystackTerminals()
  } catch {
    return []
  }
}

export async function startTerminalCharge(input: {
  vendorUserId: string
  amountNaira: number
  note?: string | null
}) {
  if (!isPaystackConfigured()) {
    throw new ApiError(503, 'PAYSTACK_REQUIRED', 'Paystack is not configured.')
  }
  const amountNaira = roundMoney(input.amountNaira, 2)
  if (!(amountNaira > 0)) throw new ApiError(400, 'INVALID_AMOUNT', 'Enter how much to charge.')

  const linked = await getActiveVendorTerminal(input.vendorUserId)
  if (!linked) {
    throw new ApiError(400, 'TERMINAL_REQUIRED', 'Link a Paystack Terminal before charging.')
  }

  let presence: { online: boolean; available: boolean } | null = null
  try {
    presence = await fetchPaystackTerminalPresence(linked.terminal_id)
  } catch {
    presence = null
  }
  if (presence && (!presence.online || !presence.available)) {
    throw new ApiError(
      409,
      'TERMINAL_BUSY',
      'Terminal is offline or busy. Finish any open payment on the device, then try again.',
    )
  }

  const reference = `POSTERM_${randomUUID().replace(/-/g, '').slice(0, 18)}`
  const customer = await ensurePosCustomer(input.vendorUserId)
  const paymentRequest = await createPaystackPaymentRequest({
    customer,
    description: input.note?.trim() || `Business POS · ${reference}`,
    amountKobo: nairaToKobo(amountNaira),
    lineItemName: 'Business POS contactless',
    metadata: {
      kind: 'business_pos_terminal',
      vendor_user_id: input.vendorUserId,
      bu_reference: reference,
      terminal_id: linked.terminal_id,
    },
  })

  const client = db()
  const insert = await client
    .from('bu_pos_terminal_charges')
    .insert({
      id: randomUUID(),
      reference,
      vendor_user_id: input.vendorUserId,
      terminal_id: linked.terminal_id,
      amount_naira: amountNaira,
      payment_request_id: paymentRequest.id,
      offline_reference: paymentRequest.offline_reference,
      status: 'pending',
      note: input.note?.trim() || null,
      metadata: {
        kind: 'business_pos_terminal',
        payment_request_code: paymentRequest.request_code ?? null,
      },
    })
    .select('*')
    .maybeSingle()

  if (insert.error) {
    if (sqlMissing(insert.error.message)) {
      throw new ApiError(503, 'TERMINAL_SQL_REQUIRED', POS_TERMINAL_SQL_HINT)
    }
    throw new ApiError(500, 'CHARGE_SAVE_FAILED', insert.error.message)
  }

  const pushed = await pushPaystackTerminalInvoice({
    terminalId: linked.terminal_id,
    paymentRequestId: paymentRequest.id,
    offlineReference: paymentRequest.offline_reference,
  })

  const updated = await client
    .from('bu_pos_terminal_charges')
    .update({
      status: 'pushed',
      paystack_event_id: pushed.id,
      updated_at: new Date().toISOString(),
    })
    .eq('reference', reference)
    .select('*')
    .maybeSingle()

  return {
    charge: asCharge(updated.data ?? insert.data) as TerminalCharge,
    terminal: linked,
    presence,
  }
}

export async function getTerminalCharge(reference: string, vendorUserId?: string) {
  const client = db()
  let query = client.from('bu_pos_terminal_charges').select('*').eq('reference', reference)
  if (vendorUserId) query = query.eq('vendor_user_id', vendorUserId)
  const { data, error } = await query.maybeSingle()
  if (error) {
    if (sqlMissing(error.message)) return null
    throw new ApiError(500, 'CHARGE_LOOKUP_FAILED', error.message)
  }
  return asCharge(data)
}

async function findChargeForWebhook(data: Record<string, unknown>) {
  const client = db()
  const reference = String(data.reference ?? '')
  const metadata =
    data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : {}
  const buRef = metadata.bu_reference ? String(metadata.bu_reference) : ''
  const offline =
    data.offline_reference
      ? String(data.offline_reference)
      : metadata.offline_reference
        ? String(metadata.offline_reference)
        : ''

  if (buRef) {
    const byBu = await client.from('bu_pos_terminal_charges').select('*').eq('reference', buRef).maybeSingle()
    if (byBu.data) return asCharge(byBu.data)
  }
  if (reference) {
    const byPaystack = await client
      .from('bu_pos_terminal_charges')
      .select('*')
      .eq('paystack_reference', reference)
      .maybeSingle()
    if (byPaystack.data) return asCharge(byPaystack.data)
    const byOurRef = await client.from('bu_pos_terminal_charges').select('*').eq('reference', reference).maybeSingle()
    if (byOurRef.data) return asCharge(byOurRef.data)
  }
  if (offline) {
    const byOffline = await client
      .from('bu_pos_terminal_charges')
      .select('*')
      .eq('offline_reference', offline)
      .maybeSingle()
    if (byOffline.data) return asCharge(byOffline.data)
  }
  // paymentrequest.success often includes id / offline_reference at top level
  const prId = data.id != null ? Number(data.id) : NaN
  if (Number.isFinite(prId) && prId > 0) {
    const byPr = await client
      .from('bu_pos_terminal_charges')
      .select('*')
      .eq('payment_request_id', prId)
      .maybeSingle()
    if (byPr.data) return asCharge(byPr.data)
  }
  return null
}

export function isBusinessPosTerminalCharge(data?: Record<string, unknown> | null) {
  if (!data) return false
  const metadata =
    data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : null
  if (metadata && String(metadata.kind ?? '') === 'business_pos_terminal') return true
  if (String(data.channel ?? '').toLowerCase() === 'pos') return true
  if (String((data as { source?: string }).source ?? '').toLowerCase() === 'pos') return true
  return false
}

export async function fulfillBusinessPosTerminalCharge(data: Record<string, unknown>) {
  const charge = await findChargeForWebhook(data)
  if (!charge) {
    // Not our POS terminal charge — let other handlers try.
    return { matched: false as const }
  }
  if (charge.status === 'paid') {
    return { matched: true as const, already_credited: true, charge }
  }

  const amountKobo = Number(data.amount ?? 0)
  const amountNaira =
    Number.isFinite(amountKobo) && amountKobo > 0 ? roundMoney(amountKobo / 100, 2) : charge.amount_naira
  const paystackReference = String(data.reference ?? charge.paystack_reference ?? charge.reference)
  const client = db()

  const claimed = await client
    .from('bu_pos_terminal_charges')
    .update({
      status: 'paid',
      paystack_reference: paystackReference,
      amount_naira: amountNaira,
      updated_at: new Date().toISOString(),
      metadata: {
        ...charge.metadata,
        channel: data.channel ?? 'pos',
        paid_at: data.paid_at ?? data.paidAt ?? null,
      },
    })
    .eq('id', charge.id)
    .neq('status', 'paid')
    .select('*')
    .maybeSingle()

  if (claimed.error) throw new ApiError(500, 'CHARGE_UPDATE_FAILED', claimed.error.message)
  if (!claimed.data) {
    return { matched: true as const, already_credited: true, charge }
  }

  await moveLiveWallet(client, {
    userId: charge.vendor_user_id,
    naira: amountNaira,
    direction: 'credit',
    type: 'pos_sale',
    description: 'Business POS · contactless',
    metadata: {
      kind: 'business_pos_terminal',
      mode: 'business',
      reference: charge.reference,
      paystack_reference: paystackReference,
      terminal_id: charge.terminal_id,
      move_id: charge.reference,
      share: 'vendor',
    },
  })

  const saleInsert = await client.from('bu_pos_sales').insert({
    id: randomUUID(),
    reference: charge.reference,
    vendor_user_id: charge.vendor_user_id,
    celebrant_user_id: null,
    guest_user_id: null,
    event_id: null,
    mode: 'business',
    amount_naira: amountNaira,
    celebrant_naira: 0,
    vendor_naira: amountNaira,
    commission_pct: 0,
    status: 'pending_notes',
    metadata: {
      kind: 'business_pos_terminal',
      paystack_reference: paystackReference,
      terminal_id: charge.terminal_id,
      channel: data.channel ?? 'pos',
    },
  })

  if (saleInsert.error && !/unique|duplicate/i.test(saleInsert.error.message)) {
    if (sqlMissing(saleInsert.error.message)) {
      throw new ApiError(503, 'POS_SQL_REQUIRED', 'Run supabase/migrations/0034_vendor_pos.sql and 0035_vendor_terminals.sql.')
    }
    // guest_user_id NOT NULL before 0035 — retry with vendor as placeholder guest
    if (/guest_user_id|null value/i.test(saleInsert.error.message)) {
      const retry = await client.from('bu_pos_sales').insert({
        id: randomUUID(),
        reference: charge.reference,
        vendor_user_id: charge.vendor_user_id,
        celebrant_user_id: null,
        guest_user_id: charge.vendor_user_id,
        event_id: null,
        mode: 'business',
        amount_naira: amountNaira,
        celebrant_naira: 0,
        vendor_naira: amountNaira,
        commission_pct: 0,
        status: 'pending_notes',
        metadata: {
          kind: 'business_pos_terminal',
          paystack_reference: paystackReference,
          terminal_id: charge.terminal_id,
          channel: data.channel ?? 'pos',
          guest_placeholder: true,
        },
      })
      if (retry.error && !/unique|duplicate/i.test(retry.error.message)) {
        throw new ApiError(500, 'POS_SAVE_FAILED', retry.error.message)
      }
    } else {
      throw new ApiError(500, 'POS_SAVE_FAILED', saleInsert.error.message)
    }
  }

  return {
    matched: true as const,
    already_credited: false,
    charge: asCharge(claimed.data) as TerminalCharge,
    amount_naira: amountNaira,
  }
}
