'use client'

export function EventCountdown({ start }: { start: string }) {
  const startMs = new Date(start).getTime()
  const diff = startMs - Date.now()
  if (diff <= 0) return <p className="mt-4 text-sm text-primary">Happening now</p>
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  return (
    <p className="mt-4 text-sm font-semibold text-primary">
      {days}d {hours}h to go
    </p>
  )
}
