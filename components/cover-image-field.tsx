'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function CoverImageField({
  value,
  onChange,
}: {
  value: string
  onChange: (url: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState(value)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!busy) setPreview(value)
  }, [value, busy])

  async function onFile(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setMessage(null)
    const local = URL.createObjectURL(file)
    setPreview(local)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/uploads/cover', {
        method: 'POST',
        credentials: 'include',
        body,
      })
      const json = await res.json()
      if (res.status === 401) {
        window.location.assign(`/login?next=${encodeURIComponent('/organizer/events/create')}`)
        return
      }
      if (!json.status) {
        setPreview(value)
        setMessage(json.message ?? 'Could not upload this image')
        return
      }
      onChange(json.data.url)
      setPreview(json.data.url)
    } catch {
      setPreview(value)
      setMessage('Could not upload this image')
    } finally {
      setBusy(false)
      URL.revokeObjectURL(local)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold">Cover image</p>
      {preview ? (
        <div
          className="h-40 w-full rounded-xl bg-cover bg-center"
          style={{ backgroundImage: `url(${preview})` }}
        />
      ) : null}
      <div className="flex flex-wrap gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(event) => void onFile(event.target.files?.[0])}
        />
        <Button type="button" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? 'Uploading…' : 'Upload from device'}
        </Button>
        {value ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              onChange('')
              setPreview('')
              setMessage(null)
              if (inputRef.current) inputRef.current.value = ''
            }}
          >
            Remove
          </Button>
        ) : null}
      </div>
      <Input
        placeholder="Cover image URL"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setPreview(e.target.value)
        }}
      />
      <p className="text-xs text-muted-foreground">JPG, PNG, WEBP, or GIF up to 4MB — or paste a link.</p>
      {message && <p className="text-sm text-destructive">{message}</p>}
    </div>
  )
}
