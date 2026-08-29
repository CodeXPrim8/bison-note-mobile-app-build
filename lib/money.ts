import { SERVICE_FEE_RATE } from '@/lib/env'

/** Ticket checkout only. Wallet buy/withdraw rates live in `lib/bu-rate.ts`. */
export function ticketServiceFee(subtotal: number): number {
  if (subtotal <= 0) return 0
  return Math.round(subtotal * SERVICE_FEE_RATE)
}

export function quoteTicketTotal(price: number, quantity: number, sprayBu = 0) {
  const subtotal = Number(price) * quantity
  const serviceFee = ticketServiceFee(subtotal)
  return {
    subtotal,
    serviceFee,
    sprayBu,
    total: subtotal + serviceFee + sprayBu,
  }
}

export function formatNaira(amount: number): string {
  return `₦${Number(amount).toLocaleString('en-NG')}`
}
