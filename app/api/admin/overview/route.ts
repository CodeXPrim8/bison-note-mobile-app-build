import { handleRouteError, successResponse } from '@/lib/api/errors'
import { requireAdmin } from '@/lib/admin/session'
import { foldPnL, pnlFromPayment, pnlFromWalletRow, type PnLPoint } from '@/lib/admin/pnl'
import { creditsByDay } from '@/lib/sales/credits'
import { listSaleCredits } from '@/lib/account/roles'
import {
  displayNameFromUser,
  getPlatformSettings,
  listUserControls,
  walletNaira,
} from '@/lib/admin/platform'
import { getBuNairaValue } from '@/lib/bu-rate'
import { adminPaystackSnapshot } from '@/lib/payments/paystack'

function dayKey(iso: string) {
  return iso.slice(0, 10)
}

function lastDays(n: number) {
  const days: string[] = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(now.getDate() - i)
    days.push(d.toISOString().slice(0, 10))
  }
  return days
}

export async function GET() {
  try {
    const { liveId, db, session } = await requireAdmin()
    const settings = await getPlatformSettings(db)
    const credits = await listSaleCredits(null, 500)
    const organiser = credits.filter((row) => row.kind === 'organiser_sale')
    const affiliate = credits.filter((row) => row.kind === 'affiliate_commission')

    const [usersRes, walletsRes, txRes, ledgerRes, paymentsRes, eventsRes, withdrawalsRes, adsRes, paystack] =
      await Promise.all([
        db.from('users').select('id, email, phone_number, first_name, last_name, account_name, role').limit(4000),
        db.from('wallets').select('*').limit(8000),
        db
          .from('bu_transactions')
          .select('id, user_id, type, amount, status, created_at, metadata')
          .order('created_at', { ascending: false })
          .limit(2000),
        db
          .from('bu_wallet_ledger')
          .select('id, user_id, type, naira, direction, created_at, reference, metadata')
          .order('created_at', { ascending: false })
          .limit(2000),
        db
          .from('payments')
          .select('id, kind, amount, status, created_at, fulfilled_at, metadata, reference')
          .in('status', ['success', 'settled', 'paid'])
          .order('created_at', { ascending: false })
          .limit(2000),
        db.from('events').select('id, name, is_public, celebrant_id, date, created_at').limit(2000),
        db.from('bu_withdrawals').select('*').order('created_at', { ascending: false }).limit(200),
        db.from('bu_ads').select('id, slot, active').limit(200),
        adminPaystackSnapshot(),
      ])

    const users = (usersRes.error ? [] : (usersRes.data ?? [])) as Array<Record<string, unknown>>
    const wallets = (walletsRes.error ? [] : (walletsRes.data ?? [])) as Array<Record<string, unknown>>
    const txs = (txRes.error ? [] : (txRes.data ?? [])) as Array<Record<string, unknown>>
    const ledger = (ledgerRes.error ? [] : (ledgerRes.data ?? [])) as Array<Record<string, unknown>>
    const payments = (paymentsRes.error ? [] : (paymentsRes.data ?? [])) as Array<Record<string, unknown>>
    const events = (eventsRes.error ? [] : (eventsRes.data ?? [])) as Array<Record<string, unknown>>
    const withdrawals = (withdrawalsRes.error ? [] : (withdrawalsRes.data ?? [])) as Array<Record<string, unknown>>
    const ads = (adsRes.error ? [] : (adsRes.data ?? [])) as Array<Record<string, unknown>>
    const controls = await listUserControls(db)

    const circulation = wallets.reduce((sum, row) => sum + walletNaira(row), 0)
    const pendingWithdrawals = withdrawals.filter((row) => {
      const status = String(row.status)
      return status === 'pending' || status === 'payout_failed' || status === 'approved'
    })
    const days = lastDays(14)

    // Cash movement: prefer ledger + payments + payouts. bu_transactions alone often misses live wallet rows.
    const depositByDay = days.map(() => 0)
    const withdrawByDay = days.map(() => 0)
    const seenCash = new Set<string>()

    const bump = (series: number[], day: string, amount: number, key: string) => {
      if (!(amount > 0) || seenCash.has(key)) return
      const idx = days.indexOf(day)
      if (idx < 0) return
      seenCash.add(key)
      series[idx] += amount
    }

    for (const row of ledger) {
      const day = dayKey(String(row.created_at ?? ''))
      const meta =
        row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : {}
      const type = String(row.type ?? '').toLowerCase()
      const kind = String(meta.kind ?? '').toLowerCase()
      const direction = String(row.direction ?? meta.direction ?? '').toLowerCase()
      const amount = Math.abs(Number(row.naira ?? 0))
      const ref = String(row.reference ?? meta.move_id ?? row.id ?? '')
      const paymentId = String(meta.payment_id ?? '')
      if (type === 'deposit' || kind === 'deposit' || kind === 'dedicated_nuban') {
        bump(
          depositByDay,
          day,
          amount,
          paymentId ? `dep:pay:${paymentId}` : `dep:ref:${ref || `${day}:${amount}`}`,
        )
      }
      if (
        direction === 'debit' &&
        (kind === 'bank_send' || meta.bank_naira != null || meta.platform_fee != null)
      ) {
        const face = Math.abs(Number(meta.naira ?? meta.bank_naira ?? amount))
        bump(withdrawByDay, day, face, `wd:${ref || `${day}:${face}`}`)
      }
    }

    for (const row of txs) {
      const day = dayKey(String(row.created_at ?? ''))
      const meta =
        row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : {}
      const type = String(row.type ?? '').toLowerCase()
      const kind = String(meta.kind ?? '').toLowerCase()
      const direction = String(meta.direction ?? '').toLowerCase()
      const amount = Math.abs(Number(row.amount ?? 0))
      const ref = String(meta.move_id ?? meta.reference ?? row.id ?? '')
      const paymentId = String(meta.payment_id ?? '')
      if (type === 'deposit' || kind === 'deposit') {
        bump(
          depositByDay,
          day,
          amount,
          paymentId ? `dep:pay:${paymentId}` : `dep:ref:${ref || `tx:${row.id}`}`,
        )
      }
      if (direction !== 'credit' && (kind === 'bank_send' || meta.bank_naira != null)) {
        const face = Math.abs(Number(meta.naira ?? meta.bank_naira ?? amount))
        bump(withdrawByDay, day, face, `wd:${ref || `tx:${row.id}`}`)
      }
    }

    for (const row of payments) {
      const day = dayKey(String(row.fulfilled_at ?? row.created_at ?? ''))
      const meta =
        row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : {}
      const kind = String(row.kind ?? meta.kind ?? '').toLowerCase()
      if (kind === 'settlement_topup' || meta.kind === 'settlement_topup') continue
      if (kind !== 'deposit' && kind !== 'topup' && meta.kind !== 'deposit') continue
      const amount = Math.abs(Number(meta.credit_naira ?? meta.bu ?? row.amount ?? 0))
      const paymentId = String(row.id ?? '')
      bump(
        depositByDay,
        day,
        amount,
        paymentId ? `dep:pay:${paymentId}` : `dep:ref:${String(row.reference ?? '')}`,
      )
    }

    // If wallet ledger/txs have no bank-send rows, fall back to bu_withdrawals once.
    if (withdrawByDay.every((n) => n === 0)) {
      for (const row of withdrawals) {
        const status = String(row.status ?? '').toLowerCase()
        if (!['paid', 'success', 'completed', 'approved', 'pending', 'payout_failed'].includes(status)) continue
        const day = dayKey(String(row.paid_at ?? row.created_at ?? ''))
        const amount = Math.abs(Number(row.naira ?? 0))
        bump(withdrawByDay, day, amount, `wd:payout:${String(row.id ?? '')}`)
      }
    }

    const depositsTotal = depositByDay.reduce((sum, n) => sum + n, 0)
    const withdrawalsTotal = withdrawByDay.reduce((sum, n) => sum + n, 0)

    const pnlPoints: PnLPoint[] = []
    for (const row of ledger) {
      const point = pnlFromWalletRow(row)
      if (point) pnlPoints.push(point)
    }
    for (const row of txs) {
      const point = pnlFromWalletRow(row)
      if (point) pnlPoints.push(point)
    }
    for (const row of payments) {
      const point = pnlFromPayment(row)
      if (point) pnlPoints.push(point)
    }
    const windowStart = days[0]
    const windowPoints = pnlPoints.filter((point) => point.day >= windowStart)
    const pnl = foldPnL(windowPoints, days)

    const viewer =
      users.find((row) => String(row.id) === liveId) ||
      users.find((row) => String(row.phone_number ?? '').includes(String(session?.phone ?? '').slice(-10)))

    return successResponse({
      viewer: displayNameFromUser(viewer ?? { account_name: 'Super Admin' }),
      settings,
      rate: getBuNairaValue(),
      paystack,
      totals: {
        users: users.length,
        wallets: wallets.length,
        circulation,
        circulation_bu: circulation / (getBuNairaValue() || 1),
        deposits: depositsTotal,
        withdrawals: withdrawalsTotal,
        pending_withdrawals: pendingWithdrawals.length,
        pending_naira: pendingWithdrawals.reduce((sum, row) => sum + Number(row.naira || 0), 0),
        events: events.length,
        public_events: events.filter((row) => row.is_public !== false).length,
        suspended: controls.filter((row) => row.suspended || row.deleted_at).length,
        ads_live: ads.filter((row) => row.active).length,
        organiser_naira: organiser.reduce((sum, row) => sum + Number(row.naira || 0), 0),
        affiliate_naira: affiliate.reduce((sum, row) => sum + Number(row.naira || 0), 0),
        ticket_naira:
          organiser.reduce((sum, row) => sum + Number(row.naira || 0), 0) +
          affiliate.reduce((sum, row) => sum + Number(row.naira || 0), 0),
        earned: pnl.earned,
        costs: pnl.costs,
        net: pnl.net,
      },
      series: {
        days,
        deposits: depositByDay,
        withdrawals: withdrawByDay,
        tickets: creditsByDay(credits, 14).map((item) => item.organiser + item.affiliate),
        organiser: creditsByDay(credits, 14).map((item) => item.organiser),
        affiliate: creditsByDay(credits, 14).map((item) => item.affiliate),
        earned: pnl.series.earned,
        costs: pnl.series.costs,
        net: pnl.series.net,
      },
      recent: {
        users: users.slice(0, 8).map((row) => ({
          id: row.id,
          name: displayNameFromUser(row),
          role: row.role,
          phone: row.phone_number,
        })),
        withdrawals: withdrawals.slice(0, 8),
        events: events.slice(0, 8),
      },
    })
  } catch (error) {
    return handleRouteError(error)
  }
}
