'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  adMediaKind,
  getAdSlot,
  mediaFitsSlot,
  retinaSize,
  slotRatioLabel,
  slotSizeLabel,
} from '@/lib/admin/ad-slots'

function inferMime(file: File) {
  if (file.type) return file.type
  const name = file.name.toLowerCase()
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg'
  if (name.endsWith('.png')) return 'image/png'
  if (name.endsWith('.webp')) return 'image/webp'
  if (name.endsWith('.gif')) return 'image/gif'
  if (name.endsWith('.mp4')) return 'video/mp4'
  if (name.endsWith('.webm')) return 'video/webm'
  if (name.endsWith('.mov')) return 'video/quicktime'
  return ''
}

function measureFile(file: File): Promise<{ width: number; height: number; duration?: number }> {
  const mime = inferMime(file)
  const url = URL.createObjectURL(file)
  return new Promise((resolve, reject) => {
    const done = (value: { width: number; height: number; duration?: number }) => {
      URL.revokeObjectURL(url)
      resolve(value)
    }
    const fail = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read this file'))
    }
    if (mime.startsWith('video/')) {
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.onloadedmetadata = () =>
        done({ width: video.videoWidth, height: video.videoHeight, duration: video.duration })
      video.onerror = fail
      video.src = url
      return
    }
    const image = new Image()
    image.onload = () => done({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = fail
    image.src = url
  })
}

export function AdCreativeField({
  slotId,
  value,
  onChange,
}: {
  slotId: string
  value: string
  onChange: (url: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState(value)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const spec = getAdSlot(slotId)
  const kind = adMediaKind(preview)
  const retina = spec ? retinaSize(spec) : null

  useEffect(() => {
    if (!busy) setPreview(value)
  }, [value, busy])

  async function onFile(file: File | undefined) {
    if (!file || !spec) return
    setBusy(true)
    setMessage(null)
    const local = URL.createObjectURL(file)
    setPreview(local)
    try {
      const mime = inferMime(file)
      const measured = await measureFile(file)
      const fit = mediaFitsSlot(spec, measured.width, measured.height)
      if (!fit.ok) {
        setPreview(value)
        setMessage(fit.message)
        return
      }
      if (mime.startsWith('video/') && measured.duration && measured.duration > spec.maxSeconds + 0.35) {
        setPreview(value)
        setMessage(
          `This slot allows videos up to ${spec.maxSeconds} seconds. Yours is ${Math.round(measured.duration)}s.`,
        )
        return
      }

      const signRes = await fetch('/api/admin/ads/upload', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slot: spec.id,
          contentType: mime,
          size: file.size,
          width: measured.width,
          height: measured.height,
          duration: measured.duration ?? null,
        }),
      })
      const signJson = await signRes.json()
      if (signRes.status === 401) {
        window.location.assign('/login?next=/admin/ads')
        return
      }
      if (!signJson.status) {
        setPreview(value)
        setMessage(signJson.message ?? 'Could not start this upload')
        return
      }

      const put = await fetch(signJson.data.uploadUrl as string, {
        method: 'PUT',
        headers: {
          'Content-Type': mime,
          'x-upsert': 'false',
        },
        body: file,
      })
      if (!put.ok) {
        setPreview(value)
        setMessage('Upload failed. Run supabase/migrations/0017_ad_creatives.sql in the ɃU SQL editor, then try again.')
        return
      }

      const publicUrl = String(signJson.data.publicUrl)
      onChange(publicUrl)
      setPreview(publicUrl)
    } catch (err) {
      setPreview(value)
      setMessage(err instanceof Error ? err.message : 'Could not upload this file')
    } finally {
      setBusy(false)
      URL.revokeObjectURL(local)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  if (!spec) return null

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold">Creative for this slot</p>
        <p className="text-xs text-muted-foreground">
          {spec.hint} Upload an image or a short MP4/WEBM at <span className="font-medium text-foreground">{slotSizeLabel(spec)}</span>
          {' '}({slotRatioLabel(spec)}). {retina ? `${retina.width} \u00d7 ${retina.height} looks sharper.` : null} Videos up to {spec.maxSeconds}s.
        </p>
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="relative block overflow-hidden rounded-2xl border border-dashed border-amber-400/40 bg-black/40 text-left transition hover:border-amber-300/70 disabled:opacity-60"
        style={{
          width: spec.surface === 'App' ? Math.min(spec.width, 390) : '100%',
          maxWidth: '100%',
          aspectRatio: `${spec.width} / ${spec.height}`,
        }}
      >
        {preview ? (
          kind === 'video' ? (
            <video src={preview} className="h-full w-full object-cover" muted playsInline />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="h-full w-full object-cover" />
          )
        ) : (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-4 text-center">
            <span className="text-sm font-semibold text-amber-200">{slotSizeLabel(spec)}</span>
            <span className="text-xs text-muted-foreground">
              {busy ? 'Uploading…' : 'Click to upload image or video'}
            </span>
          </span>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
        className="hidden"
        onChange={(event) => void onFile(event.target.files?.[0])}
      />

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? 'Uploading…' : 'Upload image or video'}
        </Button>
        {value ? (
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
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
        placeholder="Or paste an image / video URL already in this size"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setPreview(e.target.value)
        }}
      />
      {message ? <p className="text-sm text-destructive">{message}</p> : null}
    </div>
  )
}
