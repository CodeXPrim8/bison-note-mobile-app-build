import type { VtuNetworkId } from '@/lib/vtu/networks'

export type VtuProductKind = 'airtime' | 'data'

export type VtuAirtimeOption = {
  id: string
  kind: 'airtime'
  network: VtuNetworkId
  naira: number
  label: string
}

export type VtuDataPlan = {
  id: string
  kind: 'data'
  network: VtuNetworkId
  naira: number
  label: string
  dataLabel: string
  validity: string
  /** VTpass variation_code when loaded from the provider catalog. */
  variationCode?: string
}

export type VtuCatalogItem = VtuAirtimeOption | VtuDataPlan

const AIRTIME_AMOUNTS = [100, 200, 500, 1000, 2000, 5000, 10000] as const

const DATA_PLANS: Record<VtuNetworkId, Array<{ dataLabel: string; validity: string; naira: number }>> = {
  mtn: [
    { dataLabel: '750MB', validity: '1 day', naira: 500 },
    { dataLabel: '1.5GB', validity: '2 days', naira: 1000 },
    { dataLabel: '2GB', validity: '30 days', naira: 1500 },
    { dataLabel: '3GB', validity: '30 days', naira: 2000 },
    { dataLabel: '5GB', validity: '30 days', naira: 3500 },
    { dataLabel: '10GB', validity: '30 days', naira: 5500 },
  ],
  airtel: [
    { dataLabel: '1GB', validity: '1 day', naira: 500 },
    { dataLabel: '1.5GB', validity: '2 days', naira: 1000 },
    { dataLabel: '2GB', validity: '30 days', naira: 1500 },
    { dataLabel: '3GB', validity: '30 days', naira: 2000 },
    { dataLabel: '6GB', validity: '30 days', naira: 3500 },
    { dataLabel: '10GB', validity: '30 days', naira: 5000 },
  ],
  glo: [
    { dataLabel: '1.1GB', validity: '1 day', naira: 500 },
    { dataLabel: '2.5GB', validity: '2 days', naira: 1000 },
    { dataLabel: '2.6GB', validity: '30 days', naira: 1500 },
    { dataLabel: '4.1GB', validity: '30 days', naira: 2000 },
    { dataLabel: '7.7GB', validity: '30 days', naira: 3000 },
    { dataLabel: '10.8GB', validity: '30 days', naira: 4000 },
  ],
  '9mobile': [
    { dataLabel: '1GB', validity: '1 day', naira: 500 },
    { dataLabel: '1.5GB', validity: '2 days', naira: 1000 },
    { dataLabel: '2GB', validity: '30 days', naira: 1500 },
    { dataLabel: '3GB', validity: '30 days', naira: 2000 },
    { dataLabel: '4.5GB', validity: '30 days', naira: 3000 },
    { dataLabel: '11GB', validity: '30 days', naira: 5000 },
  ],
}

export function airtimeOptions(network: VtuNetworkId): VtuAirtimeOption[] {
  return AIRTIME_AMOUNTS.map((naira) => ({
    id: `airtime-${network}-${naira}`,
    kind: 'airtime' as const,
    network,
    naira,
    label: `₦${naira.toLocaleString('en-NG')}`,
  }))
}

export function dataPlans(network: VtuNetworkId): VtuDataPlan[] {
  return DATA_PLANS[network].map((plan, index) => ({
    id: `data-${network}-${plan.naira}-${index}`,
    kind: 'data' as const,
    network,
    naira: plan.naira,
    dataLabel: plan.dataLabel,
    validity: plan.validity,
    label: `${plan.dataLabel} · ${plan.validity}`,
  }))
}

export function catalogFor(kind: VtuProductKind, network: VtuNetworkId): VtuCatalogItem[] {
  return kind === 'airtime' ? airtimeOptions(network) : dataPlans(network)
}

export function findCatalogItem(kind: VtuProductKind, network: VtuNetworkId, productId: string, customNaira?: number) {
  if (kind === 'airtime' && customNaira != null) {
    const naira = Math.round(customNaira)
    if (naira < 50 || naira > 50000) return null
    return {
      id: `airtime-${network}-custom-${naira}`,
      kind: 'airtime' as const,
      network,
      naira,
      label: `₦${naira.toLocaleString('en-NG')}`,
    } satisfies VtuAirtimeOption
  }
  return catalogFor(kind, network).find((item) => item.id === productId) ?? null
}
