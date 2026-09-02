import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { requireUser } from '@/lib/api/session'
import { readBuSession } from '@/lib/auth/bu-session'
import { fetchLiveWallet, fetchPublicEventRows, resolveLiveCelebrantId, withLiveTiers } from '@/lib/events/live'
import { getAccountRolesForViewer, listSaleCredits } from '@/lib/account/roles'
import { creditsByDay } from '@/lib/sales/credits'
import { getAppUrl } from '@/lib/env'
import { isEventUpcoming } from '@/lib/events/sale'
import { affiliateEventPath } from '@/lib/affiliate/track'

export async function GET() {
  try {
    const user = await requireUser()
    const session = await readBuSession()
    const liveId = await resolveLiveCelebrantId({
      id: user.id,
      email: user.email,
      phone: session?.phone_e164 || session?.phone || null,
    })
    if (!liveId) {
      throw new ApiError(403, 'NOT_LIVE_USER', 'Sign in with your ɃU ID and PIN. Affiliate uses that same wallet.')
    }
    const roles = await getAccountRolesForViewer(liveId, session)
    const wallet = await fetchLiveWallet(liveId)
    const credits = (await listSaleCredits(liveId, 300))
      .filter((row) => row.kind === 'affiliate_commission')
      .sort((a, b) => Date.parse(String(b.created_at || '')) - Date.parse(String(a.created_at || '')))
    const rows = await fetchPublicEventRows()
    const catalog = rows
      .map(withLiveTiers)
      .filter((event) => event.affiliate_enabled && event.visibility === 'PUBLIC' && isEventUpcoming(event))
      .map((event) => ({
        id: event.id,
        title: event.title,
        slug: event.slug,
        start_time: event.start_time,
        venue_name: event.venue_name,
        cover_image_url: event.cover_image_url,
        commission_pct: event.affiliate_commission_pct,
        share_path: roles.affiliate_code ? affiliateEventPath(event.slug, roles.affiliate_code) : `/events/${event.slug}`,
      }))

    const earned = credits.reduce((sum, row) => sum + Number(row.naira || 0), 0)
    return successResponse({
      roles: {
        is_affiliate: roles.is_affiliate,
        is_organizer: roles.is_organizer,
        affiliate_code: roles.affiliate_code,
      },
      wallet,
      earned,
      sales_count: credits.length,
      series: creditsByDay(credits, 14),
      credits: credits.slice(0, 40),
      catalog,
      origin: getAppUrl(),
    })
  } catch (error) {
    return handleRouteError(error)
  }
}
