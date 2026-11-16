import { ApiError } from '@/lib/api/errors'
import { createDataClient } from '@/lib/supabase/data'
import { tryCreateAdminClient } from '@/lib/supabase/admin'
import { moveLiveWallet } from '@/lib/wallet/move'
import { reverseFailedDebit } from '@/lib/wallet/reverse'
import { findCatalogItem, type VtuProductKind } from '@/lib/vtu/catalog'
import { detectNetwork, localPhoneFromInput, type VtuNetworkId } from '@/lib/vtu/networks'
import { isVtuProviderConfigured } from '@/lib/vtu/provider'
import { isVtpassConfigured, makeVtpassRequestId, vtpassDataPlans, vtpassPayAirtime, vtpassPayData } from '@/lib/vtu/vtpass'

export { isVtuProviderConfigured } from '@/lib/vtu/provider'

async function resolveProduct(
  kind: VtuProductKind,
  networkId: VtuNetworkId,
  productId: string,
  customNaira?: number,
) {
  if (kind === 'data' && isVtpassConfigured()) {
    const plans = await vtpassDataPlans(networkId)
    const hit = plans.find((p) => p.id === productId || p.variationCode === productId)
    if (hit) return hit
  }
  return findCatalogItem(kind, networkId, productId, customNaira)
}

/**
 * Buy airtime/data.
 * Debits only when a provider is configured. If debit succeeds and fulfillment fails,
 * reverseFailedDebit runs immediately (and cron sweeps any leftovers).
 */
export async function purchaseVtu(input: {
  userId: string
  kind: VtuProductKind
  phone: string
  productId: string
  customNaira?: number
  networkId?: VtuNetworkId
}) {
  const phone = localPhoneFromInput(input.phone)
  if (!phone) {
    throw new ApiError(400, 'INVALID_PHONE', 'Enter a valid Nigerian mobile number.')
  }
  const detected = detectNetwork(phone)
  const networkId = input.networkId || detected?.id
  if (!networkId) {
    throw new ApiError(400, 'UNKNOWN_NETWORK', 'Could not detect the network for this number.')
  }
  if (detected && input.networkId && detected.id !== input.networkId) {
    throw new ApiError(400, 'NETWORK_MISMATCH', `This number looks like ${detected.name}.`)
  }

  const product = await resolveProduct(input.kind, networkId, input.productId, input.customNaira)
  if (!product) {
    throw new ApiError(400, 'INVALID_PRODUCT', 'Choose a valid airtime amount or data plan.')
  }

  if (!isVtuProviderConfigured()) {
    throw new ApiError(
      503,
      'VTU_NOT_CONFIGURED',
      'Airtime and data are not connected to a network provider yet. Your ɃU was not charged.',
    )
  }

  if (!isVtpassConfigured()) {
    throw new ApiError(
      503,
      'VTU_PROVIDER_PENDING',
      'Airtime/data provider fulfillment is not wired yet. Your ɃU was not charged.',
    )
  }

  const reference = makeVtpassRequestId(input.kind === 'airtime' ? 'air' : 'data')
  const db = tryCreateAdminClient() ?? createDataClient()
  const description =
    product.kind === 'airtime'
      ? `Airtime ${product.label} · ${phone}`
      : `Data ${product.label} · ${phone}`

  const metadata: Record<string, unknown> = {
    kind: product.kind,
    network: networkId,
    phone,
    product_id: product.id,
    product_label: product.label,
    data_label: product.kind === 'data' ? product.dataLabel : null,
    validity: product.kind === 'data' ? product.validity : null,
    variation_code: product.kind === 'data' ? product.variationCode || product.id : null,
    naira: product.naira,
    reference,
    move_id: reference,
    provider: 'vtpass',
    fulfillment: 'queued' as const,
  }

  let debited = false
  try {
    await moveLiveWallet(db, {
      userId: input.userId,
      naira: product.naira,
      direction: 'debit',
      type: 'purchase',
      description,
      metadata,
    })
    debited = true

    const pay =
      product.kind === 'airtime'
        ? await vtpassPayAirtime({
            network: networkId,
            phone,
            amount: product.naira,
            requestId: reference,
          })
        : await vtpassPayData({
            network: networkId,
            phone,
            variationCode: product.variationCode || product.id,
            amount: product.naira,
            requestId: reference,
          })

    if (pay.ok) {
      return {
        label: product.label,
        phone,
        network: networkId,
        naira: product.naira,
        bu: product.naira,
        reference: pay.requestId || reference,
        provider_status: pay.status || 'delivered',
        transaction_id: pay.transactionId,
      }
    }

    if (pay.pending) {
      throw new ApiError(
        502,
        'VTU_PENDING',
        'Top-up is still pending with the network. Your ɃU was returned — try again in a moment.',
      )
    }

    throw new ApiError(502, 'VTU_FULFILLMENT_FAILED', pay.message || 'Top-up failed. Your ɃU was returned automatically.')
  } catch (error) {
    if (debited) {
      await reverseFailedDebit(db, {
        userId: input.userId,
        originalReference: reference,
        naira: product.naira,
        reason: 'fulfillment failed',
        originalDescription: description,
      })
    }
    if (error instanceof ApiError) throw error
    throw new ApiError(502, 'VTU_FULFILLMENT_FAILED', 'Top-up failed. Your ɃU was returned automatically.')
  }
}
