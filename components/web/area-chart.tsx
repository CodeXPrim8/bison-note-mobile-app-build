export function AreaChart({
  points,
  accent = '#34d399',
  secondary,
  secondaryAccent = '#f59e0b',
}: {
  points: number[]
  accent?: string
  secondary?: number[]
  secondaryAccent?: string
}) {
  const width = 640
  const height = 180
  const series = secondary?.length ? [...points, ...secondary] : points
  const max = Math.max(...series, 1)

  function path(values: number[]) {
    const step = values.length > 1 ? width / (values.length - 1) : width
    const coords = values.map((value, index) => {
      const x = index * step
      const y = height - (value / max) * (height - 16) - 8
      return `${x},${y}`
    })
    return { line: coords.join(' '), area: `0,${height} ${coords.join(' ')} ${width},${height}` }
  }

  const primary = path(points.length ? points : [0, 0])
  const next = secondary ? path(secondary) : null
  const fillId = `fill-${accent.replace('#', '')}`
  const fillId2 = `fill-${secondaryAccent.replace('#', '')}`

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.45" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={fillId2} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={secondaryAccent} stopOpacity="0.35" />
          <stop offset="100%" stopColor={secondaryAccent} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={primary.area} fill={`url(#${fillId})`} />
      {next && <polygon points={next.area} fill={`url(#${fillId2})`} />}
      <polyline points={primary.line} fill="none" stroke={accent} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {next && (
        <polyline
          points={next.line}
          fill="none"
          stroke={secondaryAccent}
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
    </svg>
  )
}

export function BarChart({
  values,
  accent = '#34d399',
}: {
  values: number[]
  accent?: string
}) {
  const max = Math.max(...values, 1)
  return (
    <div className="flex h-28 items-end gap-1">
      {values.map((value, index) => (
        <div
          key={index}
          className="min-w-0 flex-1 rounded-t-sm"
          style={{
            height: `${Math.max(6, (value / max) * 100)}%`,
            background: accent,
            opacity: 0.35 + (value / max) * 0.65,
          }}
        />
      ))}
    </div>
  )
}
