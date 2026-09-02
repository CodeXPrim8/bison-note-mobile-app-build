import { handleRouteError, successResponse } from '@/lib/api/errors'
import { requireAdmin } from '@/lib/admin/session'
import { creditsByDay } from '@/lib/sales/credits'
import { listSaleCredits } from '@/lib/account/roles'
import {
  displayNameFromUser,
  getPlatformSettings,
  listUserControls,
  walletNaira,
} from '@/lib/admin/platform'
import { getBuNairaValue } from '@/lib/bu-rate'

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

    const [usersRes, walletsRes, txRes, eventsRes, withdrawalsRes, adsRes] = await Promise.all([
      db.from('users').select('id, email, phone_number, first_name, last_name, account_name, role').limit(4000),
      db.from('wallets').select('*').limit(8000),
      db.from('bu_transactions').select('id, user_id, type, amount, status, created_at').order('created_at', { ascending: false }).limit(2000),
      db.from('events').select('id, name, is_public, celebrant_id, date, created_at').limit(2000),
      db.from('bu_withdrawals').select('*').order('created_at', { ascending: false }).limit(200),
      db.from('bu_ads').select('id, slot, active').limit(200),
    ])

    const users = (usersRes.error ? [] : (usersRes.data ?? [])) as Array<Record<string, unknown>>
    const wallets = (walletsRes.error ? [] : (walletsRes.data ?? [])) as Array<Record<string, unknown>>
    const txs = (txRes.error ? [] : (txRes.data ?? [])) as Array<Record<string, unknown>>
    const events = (eventsRes.error ? [] : (eventsRes.data ?? [])) as Array<Record<string, unknown>>
    const withdrawals = (withdrawalsRes.error ? [] : (withdrawalsRes.data ?? [])) as Array<Record<string, unknown>>
    const ads = (adsRes.error ? [] : (adsRes.data ?? [])) as Array<Record<string, unknown>>
    const controls = await listUserControls(db)

    const circulation = wallets.reduce((sum, row) => sum + walletNaira(row), 0)
    const deposits = txs.filter((row) => String(row.type) === 'deposit')
    const withdrawTx = txs.filter((row) => String(row.type) === 'withdrawal')
    const pendingWithdrawals = withdrawals.filter((row) => String(row.status) === 'pending')
    const days = lastDays(14)
    const byDay = (kind: string) =>
      days.map((day) =>
        txs
          .filter((row) => String(row.type) === kind && dayKey(String(row.created_at ?? '')) === day)
          .reduce((sum, row) => sum + Number(row.amount || 0), 0),
      )

    const viewer =
      users.find((row) => String(row.id) === liveId) ||
      users.find((row) => String(row.phone_number ?? '').includes(String(session?.phone ?? '').slice(-10)))

    return successResponse({
      viewer: displayNameFromUser(viewer ?? { account_name: 'Super Admin' }),
      settings,
      rate: getBuNairaValue(),
      totals: {
        users: users.length,
        wallets: wallets.length,
        circulation,
        circulation_bu: circulation / (getBuNairaValue() || 1),
        deposits: deposits.reduce((sum, row) => sum + Number(row.amount || 0), 0),
        withdrawals: withdrawTx.reduce((sum, row) => sum + Number(row.amount || 0), 0),
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
      },
      series: {
        days,
        deposits: byDay('deposit'),
        withdrawals: byDay('withdrawal'),
        tickets: creditsByDay(credits, 14).map((item) => item.organiser + item.affiliate),
        organiser: creditsByDay(credits, 14).map((item) => item.organiser),
        affiliate: creditsByDay(credits, 14).map((item) => item.affiliate),
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
