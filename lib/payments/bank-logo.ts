/** Paystack / CBN bank codes → logo CDN (Nigerian-Bank-Logos). */
const BANK_LOGOS: Record<string, string> = {
  '011': 'https://cdn.jsdelivr.net/gh/Nigerian-Bank-Logos/ng-bank-logos@main/logos/ngn/png/commercial-banks/First%20Bank%20of%20Nigeria.png',
  '023': 'https://cdn.jsdelivr.net/gh/Nigerian-Bank-Logos/ng-bank-logos@main/logos/ngn/png/commercial-banks/Citibank.png',
  '030': 'https://cdn.jsdelivr.net/gh/Nigerian-Bank-Logos/ng-bank-logos@main/logos/ngn/png/commercial-banks/Heritage%20Bank.png',
  '032': 'https://cdn.jsdelivr.net/gh/Nigerian-Bank-Logos/ng-bank-logos@main/logos/ngn/png/commercial-banks/Union%20Bank.png',
  '033': 'https://cdn.jsdelivr.net/gh/Nigerian-Bank-Logos/ng-bank-logos@main/logos/ngn/png/commercial-banks/United%20Bank%20for%20Africa.png',
  '035': 'https://cdn.jsdelivr.net/gh/Nigerian-Bank-Logos/ng-bank-logos@main/logos/ngn/png/commercial-banks/Wema%20Bank.png',
  '044': 'https://cdn.jsdelivr.net/gh/Nigerian-Bank-Logos/ng-bank-logos@main/logos/ngn/png/commercial-banks/Access%20Bank%20Nigeria.png',
  '050': 'https://cdn.jsdelivr.net/gh/Nigerian-Bank-Logos/ng-bank-logos@main/logos/ngn/png/commercial-banks/Ecobank.png',
  '057': 'https://cdn.jsdelivr.net/gh/Nigerian-Bank-Logos/ng-bank-logos@main/logos/ngn/png/commercial-banks/Zenith%20Bank%20Plc.png',
  '058': 'https://cdn.jsdelivr.net/gh/Nigerian-Bank-Logos/ng-bank-logos@main/logos/ngn/png/commercial-banks/GTBank%20Plc.png',
  '068': 'https://cdn.jsdelivr.net/gh/Nigerian-Bank-Logos/ng-bank-logos@main/logos/ngn/png/commercial-banks/Standard%20Chartered%20Bank.png',
  '070': 'https://cdn.jsdelivr.net/gh/Nigerian-Bank-Logos/ng-bank-logos@main/logos/ngn/png/commercial-banks/Fidelity%20Bank.png',
  '076': 'https://cdn.jsdelivr.net/gh/Nigerian-Bank-Logos/ng-bank-logos@main/logos/ngn/png/commercial-banks/Polaris%20Bank.png',
  '082': 'https://cdn.jsdelivr.net/gh/Nigerian-Bank-Logos/ng-bank-logos@main/logos/ngn/png/commercial-banks/Keystone%20Bank.png',
  '101': 'https://cdn.jsdelivr.net/gh/Nigerian-Bank-Logos/ng-bank-logos@main/logos/ngn/png/commercial-banks/Providus%20Bank.png',
  '103': 'https://cdn.jsdelivr.net/gh/Nigerian-Bank-Logos/ng-bank-logos@main/logos/ngn/png/commercial-banks/Globus%20Bank.png',
  '214': 'https://cdn.jsdelivr.net/gh/Nigerian-Bank-Logos/ng-bank-logos@main/logos/ngn/png/commercial-banks/First%20City%20Monument%20Bank.png',
  '215': 'https://cdn.jsdelivr.net/gh/Nigerian-Bank-Logos/ng-bank-logos@main/logos/ngn/png/commercial-banks/Unity%20Bank.png',
  '221': 'https://cdn.jsdelivr.net/gh/Nigerian-Bank-Logos/ng-bank-logos@main/logos/ngn/png/commercial-banks/Stanbic%20IBTC%20Bank.png',
  '232': 'https://cdn.jsdelivr.net/gh/Nigerian-Bank-Logos/ng-bank-logos@main/logos/ngn/png/commercial-banks/Sterling%20Bank.png',
  '301': 'https://cdn.jsdelivr.net/gh/Nigerian-Bank-Logos/ng-bank-logos@main/logos/ngn/png/commercial-banks/Jaiz%20Bank.png',
  '305': 'https://cdn.jsdelivr.net/gh/Nigerian-Bank-Logos/ng-bank-logos@main/logos/ngn/png/mobile-money/OPay%20Digital%20Services%20Limited.png',
  '100004': 'https://cdn.jsdelivr.net/gh/Nigerian-Bank-Logos/ng-bank-logos@main/logos/ngn/png/mobile-money/OPay%20Digital%20Services%20Limited.png',
  '100033': 'https://cdn.jsdelivr.net/gh/Nigerian-Bank-Logos/ng-bank-logos@main/logos/ngn/png/mobile-money/Palmpay.png',
  '090267': 'https://cdn.jsdelivr.net/gh/Nigerian-Bank-Logos/ng-bank-logos@main/logos/ngn/png/microfinance-banks/Kuda.png',
  '090405': 'https://cdn.jsdelivr.net/gh/Nigerian-Bank-Logos/ng-bank-logos@main/logos/ngn/png/microfinance-banks/Moniepoint.png',
  '50211': 'https://cdn.jsdelivr.net/gh/Nigerian-Bank-Logos/ng-bank-logos@main/logos/ngn/png/microfinance-banks/Kuda.png',
  '50515': 'https://cdn.jsdelivr.net/gh/Nigerian-Bank-Logos/ng-bank-logos@main/logos/ngn/png/microfinance-banks/Moniepoint.png',
  '999991': 'https://cdn.jsdelivr.net/gh/Nigerian-Bank-Logos/ng-bank-logos@main/logos/ngn/png/mobile-money/Palmpay.png',
  '999992': 'https://cdn.jsdelivr.net/gh/Nigerian-Bank-Logos/ng-bank-logos@main/logos/ngn/png/mobile-money/OPay%20Digital%20Services%20Limited.png',
}

export function bankLogoUrl(bankCode: string | null | undefined) {
  const code = String(bankCode || '').trim()
  if (!code) return null
  return BANK_LOGOS[code] ?? BANK_LOGOS[code.replace(/^0+/, '')] ?? null
}
