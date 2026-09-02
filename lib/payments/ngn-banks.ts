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
  { name: 'Kuda Bank', code: '50211' },
  { name: 'Moniepoint MFB', code: '50515' },
  { name: 'OPay', code: '999992' },
  { name: 'PalmPay', code: '999991' },
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
  kuda: '50211',
  'kuda bank': '50211',
  opay: '999992',
  'opay digital': '999992',
  'opay digital services': '999992',
  'opay digital services limited': '999992',
  paycom: '999992',
  palmpay: '999991',
  moniepoint: '50515',
  'moniepoint mfb': '50515',
}

const extraCodes: Record<string, string[]> = {
  '999992': ['999992', '305', '100004'],
  '305': ['999992', '305', '100004'],
  '100004': ['999992', '305', '100004'],
  '999991': ['999991', '100033'],
  '100033': ['999991', '100033'],
  '50211': ['50211', '090267'],
  '090267': ['50211', '090267'],
  '50515': ['50515', '090405'],
  '090405': ['50515', '090405'],
}

export function bankCodeFromName(name: string) {
  const trimmed = name.trim()
  const exact = NGN_BANKS.find((bank) => bank.name.toLowerCase() === trimmed.toLowerCase())
  if (exact) return exact.code
  const compact = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  if (aliases[compact]) return aliases[compact]
  if (/opay|paycom/i.test(compact)) return '999992'
  if (/palmpay/i.test(compact)) return '999991'
  const partial = NGN_BANKS.find(
    (bank) =>
      bank.name.toLowerCase().includes(compact) || compact.includes(bank.name.toLowerCase().split(' ')[0] ?? ''),
  )
  return partial?.code ?? ''
}

export function payoutBankCodes(bankCode: string, bankName: string) {
  const primary = (bankCode || bankCodeFromName(bankName)).trim()
  const extras = extraCodes[primary] ?? extraCodes[bankCodeFromName(bankName)] ?? []
  const liveFirst = extras.filter(
    (code) => code === '999992' || code === '999991' || code === '50211' || code === '50515',
  )
  return [...new Set([...liveFirst, primary, ...extras].filter(Boolean))]
}

export function displayBankName(name: string, code?: string) {
  if (/paycom|opay/i.test(name) || code === '999992' || code === '305' || code === '100004') return 'OPay'
  if (/palmpay/i.test(name) || code === '999991' || code === '100033') return 'PalmPay'
  return name
}
