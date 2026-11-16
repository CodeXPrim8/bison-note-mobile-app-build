'use client'

type BuLoaderProps = {
  label?: string
  compact?: boolean
  fullScreen?: boolean
}

export function BuLoader({
  label = 'Opening Ƀucks…',
  compact = false,
  fullScreen = true,
}: BuLoaderProps) {
  if (compact) {
    return (
      <div className="bu-loader bu-loader-compact" role="status" aria-live="polite" aria-label={label}>
        <span className="bu-loader-orbit" aria-hidden>
          <span className="bu-loader-ring" />
          <span className="bu-loader-ring bu-loader-ring-2" />
          <span className="bu-loader-core">Ƀ</span>
        </span>
      </div>
    )
  }

  return (
    <div
      className={`bu-loader ${fullScreen ? 'bu-loader-screen' : 'bu-loader-panel'}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="bu-loader-glow" aria-hidden />
      <div className="bu-loader-disk bu-loader-disk-a" aria-hidden />
      <div className="bu-loader-disk bu-loader-disk-b" aria-hidden />
      <div className="bu-loader-stage">
        <span className="bu-loader-orbit" aria-hidden>
          <span className="bu-loader-ring" />
          <span className="bu-loader-ring bu-loader-ring-2" />
          <span className="bu-loader-spark" />
          <span className="bu-loader-core">Ƀ</span>
        </span>
        <p className="bu-loader-brand">Ƀucks</p>
        <p className="bu-loader-label">{label}</p>
        <span className="bu-loader-bar" aria-hidden>
          <span className="bu-loader-bar-fill" />
        </span>
      </div>
    </div>
  )
}

export default BuLoader
