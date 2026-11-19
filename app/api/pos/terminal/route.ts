import { z } from 'zod'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { requireUser } from '@/lib/api/session'
import { readBuSession } from '@/lib/auth/bu-session'
import { resolveLiveCelebrantId } from '@/lib/events/live'
import { canUseVendorMode, getAccountRolesForViewer } from '@/lib/account/roles'
import {
  linkVendorTerminal,
  listIntegrationTerminals,
  listVendorTerminals,
  unlinkVendorTerminal,
} from '@/lib/pos/terminal'
import { fetchPaystackTerminalPresence, isPaystackConfigured } from '@/lib/payments/paystack'

const postSchema = z.object({
  action: z.enum(['link', 'unlink']),
  terminal_id: z.string().min(1),
  label: z.string().max(120).optional().nullable(),
})

async function vendorLiveId(user: { id: string; email?: string | null }) {
  const session = await readBuSession()
  return (
    (await resolveLiveCelebrantId({
      id: user.id,
      email: user.email,
      phone: session?.phone_e164 || session?.phone || null,
    })) || user.id
  )
}

export async function GET() {
  try {
    const user = await requireUser()
    const session = await readBuSession()
    const liveId = await vendorLiveId(user)
    const roles = await getAccountRolesForViewer(liveId, session)
    if (!canUseVendorMode(roles)) {
      throw new ApiError(403, 'FORBIDDEN', 'Vendor role required.')
    }

    const [linked, available] = await Promise.all([
      listVendorTerminals(liveId),
      listIntegrationTerminals(),
    ])
    const active = linked.find((row) => row.active) ?? null
    let presence: { online: boolean; available: boolean } | null = null
    if (active && isPaystackConfigured()) {
      try {
        presence = await fetchPaystackTerminalPresence(active.terminal_id)
      } catch {
        presence = null
      }
    }

    return successResponse({
      linked,
      active,
      presence,
      available: available.map((row) => ({
        terminal_id: row.terminal_id,
        serial_number: row.serial_number ?? null,
        name: row.name ?? null,
        status: row.status ?? null,
      })),
      paystack_ready: isPaystackConfigured(),
    })
  } catch (error) {
    return handleRouteError(error)
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const session = await readBuSession()
    const liveId = await vendorLiveId(user)
    const roles = await getAccountRolesForViewer(liveId, session)
    if (!canUseVendorMode(roles)) {
      throw new ApiError(403, 'FORBIDDEN', 'Vendor role required.')
    }
    const body = postSchema.parse(await request.json())

    if (body.action === 'link') {
      const row = await linkVendorTerminal({
        vendorUserId: liveId,
        terminalId: body.terminal_id,
        label: body.label,
      })
      return successResponse(row, 'Terminal linked')
    }

    const row = await unlinkVendorTerminal(liveId, body.terminal_id)
    return successResponse(row, 'Terminal unlinked')
  } catch (error) {
    return handleRouteError(error)
  }
}
