import { displayBuId, normalizePhone } from '@/lib/phone'

export type VtuNetworkId = 'mtn' | 'airtel' | 'glo' | '9mobile'

export type VtuNetwork = {
  id: VtuNetworkId
  name: string
  color: string
}

export const VTU_NETWORKS: Record<VtuNetworkId, VtuNetwork> = {
  mtn: { id: 'mtn', name: 'MTN', color: '#ffcc00' },
  airtel: { id: 'airtel', name: 'Airtel', color: '#ed1c24' },
  glo: { id: 'glo', name: 'Glo', color: '#00a651' },
  '9mobile': { id: '9mobile', name: '9mobile', color: '#006F3C' },
}

/**
 * VTpass sandbox simulation numbers (not real prefixes).
 * Docs use 08011111111 for successful airtime/data delivery tests.
 */
const SANDBOX_TEST_NUMBERS: Record<string, VtuNetworkId> = {
  '08011111111': 'mtn',
}

/** Nigerian mobile prefixes → network (local 0xxxxxxxxxx form). */
const PREFIX_MAP: Array<{ prefixes: string[]; network: VtuNetworkId }> = [
  {
    network: 'mtn',
    prefixes: [
      '0803',
      '0806',
      '0703',
      '0706',
      '0813',
      '0816',
      '0810',
      '0814',
      '0903',
      '0906',
      '0913',
      '0916',
      '07025',
      '07026',
      '0704',
    ],
  },
  {
    network: 'airtel',
    prefixes: ['0802', '0808', '0708', '0812', '0701', '0902', '0901', '0904', '0907', '0912', '0911'],
  },
  {
    network: 'glo',
    prefixes: ['0805', '0807', '0705', '0815', '0811', '0905', '0915'],
  },
  {
    network: '9mobile',
    prefixes: ['0809', '0817', '0818', '0908', '0909'],
  },
]

export function localPhoneFromInput(input: string): string | null {
  const e164 = normalizePhone(input.trim())
  if (!e164) return null
  const local = displayBuId(e164)
  if (!/^0[789]\d{9}$/.test(local)) return null
  return local
}

export function detectNetwork(phoneInput: string): VtuNetwork | null {
  const local = localPhoneFromInput(phoneInput)
  if (!local) return null
  const sandbox = SANDBOX_TEST_NUMBERS[local]
  if (sandbox) return VTU_NETWORKS[sandbox]
  for (const row of PREFIX_MAP) {
    if (row.prefixes.some((prefix) => local.startsWith(prefix))) {
      return VTU_NETWORKS[row.network]
    }
  }
  return null
}
