export const NGN_BANKS = [
  { name: 'Access Bank', code: '044' },
  { name: 'Citibank Nigeria', code: '023' },
  { name: 'Ecobank Nigeria', code: '050' },
  { name: 'Fidelity Bank', code: '070' },
  { name: 'First Bank of Nigeria', code: '011' },
  { name: 'FCMB', code: '214' },
  { name: 'Globus Bank', code: '103' },
  { name: 'Guaranty Trust Bank', code: '058' },
  { name: 'Heritage Bank', code: '030' },
  { name: 'Jaiz Bank', code: '301' },
  { name: 'Keystone Bank', code: '082' },
  { name: 'Kuda Bank', code: '090267' },
  { name: 'Moniepoint MFB', code: '090405' },
  { name: 'OPay', code: '100004' },
  { name: 'PalmPay', code: '100033' },
  { name: 'Polaris Bank', code: '076' },
  { name: 'Providus Bank', code: '101' },
  { name: 'Stanbic IBTC Bank', code: '221' },
  { name: 'Standard Chartered Bank', code: '068' },
  { name: 'Sterling Bank', code: '232' },
  { name: 'Union Bank of Nigeria', code: '032' },
  { name: 'United Bank for Africa', code: '033' },
  { name: 'Unity Bank', code: '215' },
  { name: 'Wema Bank', code: '035' },
  { name: 'Zenith Bank', code: '057' },
] as const

const aliases: Record<string, string> = {
  gtbank: '058',
  gtb: '058',
  'guaranty trust bank': '058',
  access: '044',
  'access bank': '044',
  zenith: '057',
  'zenith bank': '057',
  uba: '033',
  'first bank': '011',
  firstbank: '011',
  kuda: '090267',
  opay: '100004',
  'opay digital': '100004',
  'opay digital services': '100004',
  paycom: '100004',
  palmpay: '100033',
  moniepoint: '090405',
}

export function bankCodeFromName(name: string) {
  const trimmed = name.trim()
  const exact = NGN_BANKS.find((bank) => bank.name.toLowerCase() === trimmed.toLowerCase())
  if (exact) return exact.code
  const compact = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  if (aliases[compact]) return aliases[compact]
  const partial = NGN_BANKS.find(
    (bank) =>
      bank.name.toLowerCase().includes(compact) || compact.includes(bank.name.toLowerCase().split(' ')[0] ?? ''),
  )
  return partial?.code ?? ''
}
