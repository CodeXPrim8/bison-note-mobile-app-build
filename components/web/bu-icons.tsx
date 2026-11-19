/** Hand-drawn Ƀucks site icons — geometric strokes, no stock icon packs. */

import type { ReactNode } from 'react'

type IconProps = { className?: string; title?: string }

function frame(props: IconProps & { children: ReactNode }) {
  const { className, title, children } = props
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  )
}

export function IconBuMark({ className, title }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title ? <title>{title}</title> : null}
      <path
        d="M18 8h16c8.5 0 14 5.2 14 12.4 0 4.6-2.4 8.4-6.4 10.4 5.2 1.8 8.6 6.2 8.6 12.2C50.2 52.4 43.2 58 33.6 58H18V8zm10.2 8.2v11.6h5.4c4.1 0 6.6-2.1 6.6-5.8s-2.5-5.8-6.6-5.8h-5.4zm0 19.4V49h6.2c5 0 8-2.5 8-6.7s-3-6.7-8-6.7h-6.2z"
        fill="currentColor"
      />
    </svg>
  )
}

export function IconWallet({ className, title }: IconProps) {
  return frame({
    className,
    title,
    children: (
      <>
        <rect x="6" y="14" width="36" height="24" rx="5" stroke="currentColor" strokeWidth="2.2" />
        <path d="M6 22h36" stroke="currentColor" strokeWidth="2.2" />
        <circle cx="34" cy="30" r="2.4" fill="currentColor" />
        <path d="M14 10h16c2 0 3.5 1.2 4 3" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </>
    ),
  })
}

export function IconTicket({ className, title }: IconProps) {
  return frame({
    className,
    title,
    children: (
      <>
        <path
          d="M8 16h32a4 4 0 0 1 0 8 4 4 0 0 1 0 8H8a4 4 0 0 1 0-8 4 4 0 0 1 0-8z"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <path d="M20 16v24" stroke="currentColor" strokeWidth="2.2" strokeDasharray="3 4" />
      </>
    ),
  })
}

export function IconSpray({ className, title }: IconProps) {
  return frame({
    className,
    title,
    children: (
      <>
        <circle cx="24" cy="28" r="7" stroke="currentColor" strokeWidth="2.2" />
        <path d="M24 8v8M16 12l4 5M32 12l-4 5M10 22l6 2M38 22l-6 2" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M18 36c2 4 10 4 12 0" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </>
    ),
  })
}

export function IconQrGate({ className, title }: IconProps) {
  return frame({
    className,
    title,
    children: (
      <>
        <path d="M10 18V12h6M32 12h6v6M38 30v6h-6M16 36H10v-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <rect x="16" y="16" width="7" height="7" stroke="currentColor" strokeWidth="2" />
        <rect x="25" y="16" width="7" height="7" stroke="currentColor" strokeWidth="2" />
        <rect x="16" y="25" width="7" height="7" stroke="currentColor" strokeWidth="2" />
        <path d="M25 25h3v3h4v4h-7v-7z" fill="currentColor" />
      </>
    ),
  })
}

export function IconSend({ className, title }: IconProps) {
  return frame({
    className,
    title,
    children: (
      <>
        <path d="M10 24h22" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M26 14l12 10-12 10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="10" cy="24" r="3" fill="currentColor" />
      </>
    ),
  })
}

export function IconEvents({ className, title }: IconProps) {
  return frame({
    className,
    title,
    children: (
      <>
        <rect x="9" y="12" width="30" height="28" rx="4" stroke="currentColor" strokeWidth="2.2" />
        <path d="M9 20h30M17 8v8M31 8v8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="18" cy="28" r="2" fill="currentColor" />
        <circle cx="24" cy="28" r="2" fill="currentColor" />
        <circle cx="30" cy="28" r="2" fill="currentColor" />
      </>
    ),
  })
}

export function IconGift({ className, title }: IconProps) {
  return frame({
    className,
    title,
    children: (
      <>
        <path d="M8 22h32v18a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4V22z" stroke="currentColor" strokeWidth="2.2" />
        <path d="M6 22h36v-4a3 3 0 0 0-3-3H9a3 3 0 0 0-3 3v4z" stroke="currentColor" strokeWidth="2.2" />
        <path d="M24 15v29M24 15c-4-6-10-6-10-2s4 5 10 5c6 0 10-1 10-5s-6-4-10 2z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      </>
    ),
  })
}

export function IconGateway({ className, title }: IconProps) {
  return frame({
    className,
    title,
    children: (
      <>
        <rect x="8" y="12" width="32" height="24" rx="4" stroke="currentColor" strokeWidth="2.2" />
        <path d="M14 24h8M14 29h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M30 20l6 4-6 4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  })
}
