import { z } from 'zod'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { requireUser, getProfile } from '@/lib/api/session'
import { readBuSession } from '@/lib/auth/bu-session'
import { resolveLiveCelebrantId } from '@/lib/events/live'
import { displayBuId } from '@/lib/phone'
import { draftSupportAiReply } from '@/lib/support-ai'
import { appendSupportMessage, getSupportThread } from '@/lib/support-chat'

const postSchema = z.object({
  body: z.string().trim().min(1).max(2000),
})

function phoneOf(profile: Awaited<ReturnType<typeof getProfile>>, session: Awaited<ReturnType<typeof readBuSession>>) {
  const raw =
    (typeof profile?.phone_e164 === 'string' && profile.phone_e164) ||
    (typeof profile?.phone === 'string' && profile.phone) ||
    session?.phone_e164 ||
    session?.phone ||
    ''
  return raw ? displayBuId(raw) : null
}

async function liveUser() {
  const user = await requireUser()
  const session = await readBuSession()
  const liveId =
    (await resolveLiveCelebrantId({
      id: user.id,
      email: user.email,
      phone: session?.phone_e164 || session?.phone || null,
    })) || user.id
  const profile = await getProfile(liveId)
  return { user, liveId, profile, session }
}

export async function GET() {
  try {
    const { liveId, profile, session } = await liveUser()
    const thread = await getSupportThread(liveId)
    return successResponse({
      thread: thread ?? {
        userId: liveId,
        buId: phoneOf(profile, session),
        name: profile?.display_name?.trim() || null,
        updatedAt: null,
        messages: [],
      },
    })
  } catch (error) {
    return handleRouteError(error)
  }
}

export async function POST(request: Request) {
  try {
    const { liveId, profile, session } = await liveUser()
    const parsed = postSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      throw new ApiError(400, 'INVALID_MESSAGE', 'Write a message first.')
    }
    const thread = await appendSupportMessage({
      userId: liveId,
      body: parsed.data.body,
      from: 'user',
      buId: phoneOf(profile, session),
      name: profile?.display_name?.trim() || null,
    })
    let withAssist = thread
    try {
      const assist = await draftSupportAiReply(parsed.data.body, thread.messages)
      withAssist = await appendSupportMessage({
        userId: liveId,
        body: assist,
        from: 'support',
        buId: thread.buId,
        name: thread.name,
        kind: 'ai',
      })
    } catch {
      /* guest still has their message; human can reply later */
    }
    return successResponse({ thread: withAssist }, 'Message sent')
  } catch (error) {
    return handleRouteError(error)
  }
}
