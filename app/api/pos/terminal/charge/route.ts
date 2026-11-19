import { z } from 'zod'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { requireUser } from '@/lib/api/session'
import { readBuSession } from '@/lib/auth/bu-session'
import { resolveLiveCelebrantId } from '@/lib/events/live'
import { canUseVendorMode, getAccountRolesForViewer } from '@/lib/account/roles'
import { getTerminalCharge, startTerminalCharge } from '@/lib/pos/terminal'
import { BU_MIN_TRANSFER } from '@/lib/bu-rate'

const postSchema = z.object({
  amount: z.number().positive(),
  note: z.string().max(200).optional().nullable(),
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

export async function GET(request: Request) {
  try {
    const user = await requireUser()
    const liveId = await vendorLiveId(user)
    const reference = new URL(request.url).searchParams.get('reference')
    if (!reference) throw new ApiError(400, 'VALIDATION_ERROR', 'reference required')
    const charge = await getTerminalCharge(reference, liveId)
    if (!charge) throw new ApiError(404, 'NOT_FOUND', 'Charge not found')
    return successResponse({ charge })
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
    if (body.amount + 1e-9 < BU_MIN_TRANSFER) {
      throw new ApiError(
        400,
        'AMOUNT_TOO_SMALL',
        `Minimum charge is ${BU_MIN_TRANSFER.toLocaleString('en-NG')} ₦`,
      )
    }

    const result = await startTerminalCharge({
      vendorUserId: liveId,
      amountNaira: body.amount,
      note: body.note,
    })

    return successResponse(
      {
        reference: result.charge.reference,
        charge: result.charge,
        terminal_id: result.terminal.terminal_id,
        presence: result.presence,
      },
      'Sent to terminal — ask guest to tap card or phone',
    )
  } catch (error) {
    return handleRouteError(error)
  }
}
