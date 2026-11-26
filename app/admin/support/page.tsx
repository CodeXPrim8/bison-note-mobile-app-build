'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { adminFetch } from '@/components/admin/api'
import type { SupportThread } from '@/lib/support-chat'

type ThreadSummary = {
  userId: string
  buId: string | null
  name: string | null
  updatedAt: string
  preview: string
  messageCount: number
  waitingOnSupport: boolean
}

export default function AdminSupportPage() {
  const [threads, setThreads] = useState<ThreadSummary[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [thread, setThread] = useState<SupportThread | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadList() {
    const data = await adminFetch<{ threads: ThreadSummary[] }>('/api/admin/support')
    setThreads(data.threads)
  }

  async function openThread(userId: string) {
    setActiveId(userId)
    setError(null)
    const data = await adminFetch<{ thread: SupportThread }>(
      `/api/admin/support?userId=${encodeURIComponent(userId)}`,
    )
    setThread(data.thread)
  }

  useEffect(() => {
    loadList().catch((err: Error) => setError(err.message))
  }, [])

  async function reply() {
    if (!activeId || !draft.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const data = await adminFetch<{ thread: SupportThread }>('/api/admin/support', {
        method: 'POST',
        body: JSON.stringify({ userId: activeId, body: draft.trim() }),
      })
      setThread(data.thread)
      setDraft('')
      await loadList()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reply')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Support chat</h1>
        <p className="text-sm text-muted-foreground">Reply to guests who message from Menu → Support → Chat.</p>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="overflow-hidden p-0">
          <div className="border-b px-4 py-3 text-sm font-semibold">Conversations</div>
          <div className="max-h-[70vh] overflow-y-auto">
            {threads.length === 0 && (
              <p className="px-4 py-6 text-sm text-muted-foreground">No chats yet.</p>
            )}
            {threads.map((item) => (
              <button
                key={item.userId}
                type="button"
                onClick={() => void openThread(item.userId).catch((err: Error) => setError(err.message))}
                className={`flex w-full flex-col gap-1 border-b px-4 py-3 text-left hover:bg-muted/50 ${
                  activeId === item.userId ? 'bg-muted/60' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold">{item.name || item.buId || 'Guest'}</span>
                  {item.waitingOnSupport && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-800">
                      New
                    </span>
                  )}
                </div>
                <span className="truncate text-xs text-muted-foreground">
                  {item.buId ? `ɃU ID ${item.buId} · ` : ''}
                  {item.preview || `${item.messageCount} messages`}
                </span>
              </button>
            ))}
          </div>
        </Card>
        <Card className="flex min-h-[70vh] flex-col overflow-hidden p-0">
          {!thread ? (
            <p className="m-auto px-4 text-sm text-muted-foreground">Select a conversation.</p>
          ) : (
            <>
              <div className="border-b px-4 py-3">
                <h2 className="font-semibold">{thread.name || 'Guest'}</h2>
                <p className="text-xs text-muted-foreground">
                  {thread.buId ? `ɃU ID ${thread.buId}` : thread.userId}
                </p>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {thread.messages.map((message) => {
                  const support = message.from === 'support'
                  return (
                    <div key={message.id} className={`flex ${support ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                          support
                            ? 'rounded-br-md bg-primary text-primary-foreground'
                            : 'rounded-bl-md bg-muted'
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{message.body}</p>
                        <p className={`mt-1 text-[10px] ${support ? 'opacity-80' : 'text-muted-foreground'}`}>
                          {support
                            ? message.kind === 'ai'
                              ? 'Assist'
                              : 'You'
                            : 'Guest'}{' '}
                          · {new Date(message.at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="flex gap-2 border-t p-3">
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      void reply()
                    }
                  }}
                  placeholder="Reply to guest"
                  className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <Button disabled={busy || !draft.trim()} onClick={() => void reply()}>
                  {busy ? 'Sending…' : 'Send'}
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
