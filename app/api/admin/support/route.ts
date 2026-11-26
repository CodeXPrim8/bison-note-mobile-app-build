import { z } from 'zod'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { requireAdmin } from '@/lib/admin/session'
import { appendSupportMessage, getSupportThread, listSupportThreads } from '@/lib/support-chat'

const replySchema = z.object({
  userId: z.string().min(1),
  body: z.string().trim().min(1).max(2000),
})

export async function GET(request: Request) {
  try {
    await requireAdmin()
    const userId = new URL(request.url).searchParams.get('userId')?.trim()
    if (userId) {
      const thread = await getSupportThread(userId)
      if (!thread) throw new ApiError(404, 'THREAD_NOT_FOUND', 'No chat yet for this user.')
      return successResponse({ thread })
    }
    const threads = await listSupportThreads()
    return successResponse({
      threads: threads.map((thread) => ({
        userId: thread.userId,
        buId: thread.buId,
        name: thread.name,
        updatedAt: thread.updatedAt,
        preview: thread.messages[thread.messages.length - 1]?.body?.slice(0, 120) ?? '',
        messageCount: thread.messages.length,
        waitingOnSupport: thread.messages[thread.messages.length - 1]?.from === 'user',
      })),
    })
  } catch (error) {
    return handleRouteError(error)
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin()
    const parsed = replySchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      throw new ApiError(400, 'INVALID_REPLY', 'Pick a chat and write a reply.')
    }
    const existing = await getSupportThread(parsed.data.userId)
    if (!existing) throw new ApiError(404, 'THREAD_NOT_FOUND', 'No chat yet for this user.')
    const thread = await appendSupportMessage({
      userId: parsed.data.userId,
      body: parsed.data.body,
      from: 'support',
      buId: existing.buId,
      name: existing.name,
      kind: 'human',
    })
    return successResponse({ thread }, 'Reply sent')
  } catch (error) {
    return handleRouteError(error)
  }
}
