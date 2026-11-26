import { randomUUID } from 'crypto'
import { listScanValues, readScanValue, writeScanValue } from '@/lib/scan-store'

export type SupportSender = 'user' | 'support'

export type SupportMessage = {
  id: string
  body: string
  from: SupportSender
  at: string
  /** AI assist reply before a human Super Admin joins. */
  kind?: 'ai' | 'human'
}

export type SupportThread = {
  userId: string
  buId: string | null
  name: string | null
  updatedAt: string
  messages: SupportMessage[]
}

const PREFIX = 'support_thread:'

function threadKey(userId: string) {
  return `${PREFIX}${userId}`
}

export async function getSupportThread(userId: string): Promise<SupportThread | null> {
  return readScanValue<SupportThread>(threadKey(userId))
}

export async function listSupportThreads(): Promise<SupportThread[]> {
  const rows = await listScanValues<SupportThread>(PREFIX)
  return rows
    .map((row) => row.value)
    .filter((thread) => thread && Array.isArray(thread.messages))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
}

export async function appendSupportMessage(input: {
  userId: string
  body: string
  from: SupportSender
  buId?: string | null
  name?: string | null
  kind?: 'ai' | 'human'
}): Promise<SupportThread> {
  const body = input.body.trim().slice(0, 2000)
  if (!body) throw new Error('Write a message first.')
  const existing = (await getSupportThread(input.userId)) ?? {
    userId: input.userId,
    buId: input.buId ?? null,
    name: input.name ?? null,
    updatedAt: new Date().toISOString(),
    messages: [],
  }
  const kind =
    input.kind ??
    (input.from === 'support' ? ('human' as const) : undefined)
  const next: SupportThread = {
    ...existing,
    buId: input.buId ?? existing.buId,
    name: input.name ?? existing.name,
    updatedAt: new Date().toISOString(),
    messages: [
      ...existing.messages,
      {
        id: randomUUID(),
        body,
        from: input.from,
        at: new Date().toISOString(),
        ...(kind ? { kind } : {}),
      },
    ].slice(-200),
  }
  await writeScanValue(threadKey(input.userId), next)
  return next
}
