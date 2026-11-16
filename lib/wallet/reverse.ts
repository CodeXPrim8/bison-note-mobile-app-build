import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '@/lib/api/errors'
import { tryCreateAdminClient } from '@/lib/supabase/admin'
import { createDataClient } from '@/lib/supabase/data'
import { moveLiveWallet } from '@/lib/wallet/move'

function asMeta(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  return {}
}

function missingTable(message?: string) {
  return /schema cache|does not exist|could not find the table/i.test(message ?? '')
}

export function reverseReferenceFor(originalReference: string) {
  const base = String(originalReference || '').trim()
  if (!base) throw new ApiError(400, 'INVALID_REFERENCE', 'Missing debit reference to reverse.')
  return base.startsWith('REV_') ? base : `REV_${base}`
}

async function ledgerHasReference(db: SupabaseClient, userId: string, reference: string) {
  const row = await db
    .from('bu_wallet_ledger')
    .select('id, metadata, naira, direction')
    .eq('user_id', userId)
    .eq('reference', reference)
    .maybeSingle()
  if (row.error && !missingTable(row.error.message)) {
    throw new ApiError(500, 'LEDGER_LOOKUP_FAILED', row.error.message)
  }
  return row.data
}

async function markOriginalReversed(
  db: SupabaseClient,
  userId: string,
  originalReference: string,
  reverseRef: string,
) {
  const original = await ledgerHasReference(db, userId, originalReference)
  if (!original) return
  const meta = asMeta(original.metadata)
  if (meta.reversed_by === reverseRef && meta.fulfillment === 'reversed') return
  await db
    .from('bu_wallet_ledger')
    .update({
      metadata: {
        ...meta,
        fulfillment: 'reversed',
        reversed: true,
        reversed_by: reverseRef,
        reversed_at: new Date().toISOString(),
      },
    })
    .eq('user_id', userId)
    .eq('reference', originalReference)
}

/**
 * Credit the sender exactly once for a failed debit.
 * Idempotent via unique (user_id, REV_<originalReference>) on bu_wallet_ledger.
 * If the claim insert wins but the credit fails, the claim is deleted so a later pass can retry.
 */
export async function reverseFailedDebit(
  db: SupabaseClient,
  input: {
    userId: string
    originalReference: string
    naira: number
    reason: string
    originalDescription?: string | null
  },
) {
  const naira = Math.round(Number(input.naira) * 100) / 100
  if (!Number.isFinite(naira) || naira <= 0) {
    throw new ApiError(400, 'INVALID_AMOUNT', 'Reverse amount must be positive.')
  }
  const originalReference = String(input.originalReference).trim()
  const reverseRef = reverseReferenceFor(originalReference)

  const existing = await ledgerHasReference(db, input.userId, reverseRef)
  if (existing) {
    await markOriginalReversed(db, input.userId, originalReference, reverseRef)
    return {
      ok: true as const,
      already_reversed: true as const,
      reference: reverseRef,
      original_reference: originalReference,
      naira: Number(existing.naira) || naira,
      userId: input.userId,
    }
  }

  const original = await ledgerHasReference(db, input.userId, originalReference)
  if (original) {
    const meta = asMeta(original.metadata)
    if (meta.reversed === true || meta.fulfillment === 'reversed' || String(meta.reversed_by || '')) {
      const prior = String(meta.reversed_by || reverseRef)
      return {
        ok: true as const,
        already_reversed: true as const,
        reference: prior,
        original_reference: originalReference,
        naira,
        userId: input.userId,
      }
    }
    if (String(original.direction) !== 'debit') {
      throw new ApiError(400, 'NOT_A_DEBIT', 'Only debit movements can be auto-reversed.')
    }
  }

  const description = `Auto reverse · ${input.reason}`.slice(0, 180)
  const claimMeta = {
    kind: 'auto_reverse',
    reverse_of: originalReference,
    direction: 'credit' as const,
    applied: false,
    reason: input.reason,
    original_description: input.originalDescription ?? null,
  }

  const claim = await db
    .from('bu_wallet_ledger')
    .insert({
      user_id: input.userId,
      direction: 'credit',
      type: 'refund',
      naira,
      description,
      reference: reverseRef,
      metadata: claimMeta,
    })
    .select('id')
    .maybeSingle()

  if (claim.error) {
    if (/unique|duplicate/i.test(claim.error.message)) {
      return {
        ok: true as const,
        already_reversed: true as const,
        reference: reverseRef,
        original_reference: originalReference,
        naira,
        userId: input.userId,
      }
    }
    if (!missingTable(claim.error.message)) {
      throw new ApiError(500, 'REVERSE_CLAIM_FAILED', claim.error.message)
    }
  } else if (!claim.data) {
    const again = await ledgerHasReference(db, input.userId, reverseRef)
    if (again) {
      return {
        ok: true as const,
        already_reversed: true as const,
        reference: reverseRef,
        original_reference: originalReference,
        naira: Number(again.naira) || naira,
        userId: input.userId,
      }
    }
  }

  try {
    await moveLiveWallet(db, {
      userId: input.userId,
      naira,
      direction: 'credit',
      type: 'refund',
      description,
      metadata: {
        ...claimMeta,
        applied: true,
        move_id: reverseRef,
        requested_type: 'refund',
      },
    })
  } catch (error) {
    // Release the claim so a later cron/admin pass can retry safely.
    await db.from('bu_wallet_ledger').delete().eq('user_id', input.userId).eq('reference', reverseRef)
    throw error
  }

  await db
    .from('bu_wallet_ledger')
    .update({
      metadata: {
        ...claimMeta,
        applied: true,
        completed_at: new Date().toISOString(),
      },
    })
    .eq('user_id', input.userId)
    .eq('reference', reverseRef)

  await markOriginalReversed(db, input.userId, originalReference, reverseRef)

  return {
    ok: true as const,
    already_reversed: false as const,
    reference: reverseRef,
    original_reference: originalReference,
    naira,
    userId: input.userId,
  }
}

function needsAutoReverse(
  meta: Record<string, unknown>,
  createdAt?: string | null,
  options?: { immediate?: boolean },
) {
  if (meta.reversed === true || meta.fulfillment === 'reversed' || meta.reversed_by) return false
  const fulfillment = String(meta.fulfillment ?? '').toLowerCase()
  if (fulfillment === 'failed') return true
  if (fulfillment === 'queued' || fulfillment === 'pending') {
    if (options?.immediate) return true
    // Give fulfillment a short window; then reverse so the sender is never stuck debited.
    const created = createdAt ? Date.parse(createdAt) : NaN
    if (!Number.isFinite(created)) return true
    return Date.now() - created >= 20_000
  }
  return false
}

/**
 * Scan recent debit purchases that never fulfilled and reverse them once.
 */
export async function autoReverseFailedDebits(options?: { limit?: number; immediate?: boolean }) {
  const db = tryCreateAdminClient() ?? createDataClient()
  const limit = Math.max(1, Math.min(options?.limit ?? 100, 300))

  const { data, error } = await db
    .from('bu_wallet_ledger')
    .select('id, user_id, naira, reference, description, metadata, created_at, direction, type')
    .eq('direction', 'debit')
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) {
    if (missingTable(error.message)) {
      return { scanned: 0, reversed: 0, skipped: 0, errors: [] as string[] }
    }
    throw new ApiError(500, 'REVERSE_SCAN_FAILED', error.message)
  }

  const rows = data ?? []
  let reversed = 0
  let skipped = 0
  const errors: string[] = []
  const results: Array<Record<string, unknown>> = []

  for (const row of rows) {
    const meta = asMeta(row.metadata)
    const kind = String(meta.kind ?? meta.requested_type ?? row.type ?? '').toLowerCase()
    const isPurchaseLike =
      kind === 'airtime' ||
      kind === 'data' ||
      kind === 'purchase' ||
      String(row.type).toLowerCase() === 'purchase' ||
      /^airtime |^data /i.test(String(row.description ?? ''))

    if (!isPurchaseLike) {
      skipped += 1
      continue
    }
    if (!needsAutoReverse(meta, row.created_at as string | null, { immediate: options?.immediate })) {
      skipped += 1
      continue
    }

    const reference = String(row.reference || meta.move_id || '').trim()
    if (!reference) {
      skipped += 1
      continue
    }

    try {
      const result = await reverseFailedDebit(db, {
        userId: String(row.user_id),
        originalReference: reference,
        naira: Number(row.naira),
        reason: String(meta.fulfillment || 'unfulfilled') === 'failed' ? 'fulfillment failed' : 'fulfillment not completed',
        originalDescription: row.description as string | null,
      })
      if (!result.already_reversed) reversed += 1
      else skipped += 1
      results.push(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`${reference}: ${message}`)
    }
  }

  return { scanned: rows.length, reversed, skipped, errors, results }
}

export async function reverseDebitByReference(originalReference: string) {
  const db = tryCreateAdminClient() ?? createDataClient()
  const reference = String(originalReference || '').trim()
  if (!reference) throw new ApiError(400, 'INVALID_REFERENCE', 'Reference required.')

  const { data, error } = await db
    .from('bu_wallet_ledger')
    .select('user_id, naira, reference, description, metadata, direction')
    .eq('reference', reference)
    .maybeSingle()

  if (error && !missingTable(error.message)) {
    throw new ApiError(500, 'LEDGER_LOOKUP_FAILED', error.message)
  }
  if (!data) throw new ApiError(404, 'NOT_FOUND', 'Debit not found.')
  if (String(data.direction) !== 'debit') {
    throw new ApiError(400, 'NOT_A_DEBIT', 'Only debit movements can be reversed.')
  }

  return reverseFailedDebit(db, {
    userId: String(data.user_id),
    originalReference: String(data.reference),
    naira: Number(data.naira),
    reason: 'manual reverse',
    originalDescription: data.description as string | null,
  })
}
