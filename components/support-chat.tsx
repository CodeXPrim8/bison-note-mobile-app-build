'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { SupportMessage, SupportThread } from '@/lib/support-chat'

export default function SupportChat() {
  const [thread, setThread] = useState<SupportThread | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/support/chat', { credentials: 'include' })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.status) {
      throw new Error(json.message || 'Could not load chat')
    }
    setThread(json.data.thread as SupportThread)
  }, [])

  useEffect(() => {
    load().catch((err: Error) => setError(err.message))
    const timer = window.setInterval(() => {
      load().catch(() => undefined)
    }, 12000)
    return () => window.clearInterval(timer)
  }, [load])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [thread?.messages.length])

  async function send() {
    const body = draft.trim()
    if (!body || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/support/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.status) {
        throw new Error(json.message || 'Could not send')
      }
      setThread(json.data.thread as SupportThread)
      setDraft('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-[min(70vh,560px)] flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="font-bold">Chat with Ƀucks</h3>
        <p className="text-xs text-muted-foreground">
          Messages stay in the app. Customer care replies here.
          {thread?.buId ? ` · ɃU ID ${thread.buId}` : ''}
        </p>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4">
        {(thread?.messages ?? []).length === 0 && (
          <p className="px-1 text-sm text-muted-foreground">
            Say hello with your question. Include what went wrong if you can.
          </p>
        )}
        {(thread?.messages ?? []).map((message: SupportMessage) => {
          const mine = message.from === 'user'
          return (
            <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  mine
                    ? 'rounded-br-md bg-primary text-primary-foreground'
                    : 'rounded-bl-md bg-muted text-foreground'
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{message.body}</p>
                <p className={`mt-1 text-[10px] ${mine ? 'opacity-80' : 'text-muted-foreground'}`}>
                  {mine ? 'You' : message.kind === 'ai' ? 'Ƀucks Assist' : 'Ƀucks'} ·{' '}
                  {new Date(message.at).toLocaleString(undefined, {
                    hour: '2-digit',
                    minute: '2-digit',
                    day: 'numeric',
                    month: 'short',
                  })}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
      {error && <p className="px-4 pb-2 text-sm text-destructive">{error}</p>}
      <div className="flex gap-2 border-t border-border p-3">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void send()
            }
          }}
          maxLength={2000}
          placeholder="Type a message"
          className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          type="button"
          disabled={busy || !draft.trim()}
          onClick={() => void send()}
          className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy ? '…' : 'Send'}
        </button>
      </div>
    </div>
  )
}
