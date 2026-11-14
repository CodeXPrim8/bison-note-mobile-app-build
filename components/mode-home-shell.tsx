'use client'

import type { LucideIcon } from 'lucide-react'
import { Eye, EyeOff } from 'lucide-react'
import type { ReactNode } from 'react'

export function ModeIconTile({
  label,
  Icon,
  onClick,
  tone = 'dark',
}: {
  label: string
  Icon: LucideIcon
  onClick: () => void
  tone?: 'dark' | 'light'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bu-press flex flex-col items-center gap-2 rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-4"
    >
      <span
        className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
          tone === 'dark' ? 'bg-neutral-950 text-white' : 'bg-neutral-100 text-neutral-800'
        }`}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="text-xs font-semibold text-neutral-950">{label}</span>
    </button>
  )
}

export function ModeIconRow({
  columns = 3,
  children,
}: {
  columns?: 2 | 3
  children: ReactNode
}) {
  return <div className={`grid gap-3 ${columns === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>{children}</div>
}

export function ModeWalletHero({
  title,
  balanceLabel,
  balanceVisible,
  onToggleBalance,
  subtitle,
  actions,
  footer,
  children,
}: {
  title: string
  balanceLabel: string
  balanceVisible: boolean
  onToggleBalance: () => void
  subtitle?: string
  actions?: ReactNode
  footer?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="sticky top-0 z-30 bg-white px-4 pb-3 pt-4">
      <div className="bu-rise overflow-hidden rounded-[32px] bg-neutral-950 text-white shadow-[0_16px_40px_rgba(0,0,0,0.12)]">
        <div className="px-5 pb-5 pt-5">
          <p className="text-center text-sm font-medium text-white/80">{title}</p>
          <div className="mt-6 flex flex-col items-center">
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium">ɃU</span>
            <div className="mt-3 flex items-center gap-2">
              <p className="bu-balance text-4xl font-semibold tracking-tight">
                {balanceVisible ? balanceLabel : 'Ƀ ••••••'}
              </p>
              <button
                type="button"
                onClick={onToggleBalance}
                className="rounded-full p-1 text-white/70"
                aria-label={balanceVisible ? 'Hide balance' : 'Show balance'}
              >
                {balanceVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </button>
            </div>
            {subtitle ? (
              <p className="mt-1 text-sm text-white/60">{balanceVisible ? subtitle : '≈ ₦••••••'}</p>
            ) : null}
          </div>
          {actions ? <div className="mt-6 flex items-center justify-center gap-3">{actions}</div> : null}
          {children}
        </div>
        {footer}
      </div>
    </div>
  )
}

export function ModeHeroAction({
  label,
  Icon,
  onClick,
}: {
  label: string
  Icon: LucideIcon
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bu-press flex h-12 w-12 items-center justify-center rounded-full bg-white/10"
      aria-label={label}
    >
      <Icon className="h-5 w-5" />
    </button>
  )
}

export function ModeListRow({
  title,
  detail,
  amount,
  amountTone,
  onClick,
}: {
  title: string
  detail?: string
  amount?: string
  amountTone?: 'credit' | 'debit' | 'neutral'
  onClick?: () => void
}) {
  const tone =
    amountTone === 'credit' ? 'text-emerald-600' : amountTone === 'debit' ? 'text-rose-600' : 'text-neutral-950'
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`flex w-full items-start justify-between gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-left ${
        onClick ? 'bu-press' : ''
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-neutral-950">{title}</p>
        {detail ? <p className="mt-0.5 truncate text-xs text-neutral-500">{detail}</p> : null}
      </div>
      {amount ? <p className={`shrink-0 text-sm font-semibold tabular-nums ${tone}`}>{amount}</p> : null}
    </Comp>
  )
}

export function ModeSegmented({
  options,
  value,
  onChange,
}: {
  options: Array<{ id: string; label: string }>
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div className="flex gap-1 rounded-[20px] border border-neutral-200 bg-neutral-100 p-1">
      {options.map((option) => {
        const active = option.id === value
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={`bu-press flex-1 rounded-[16px] px-3 py-2.5 text-xs font-semibold transition ${
              active ? 'bg-neutral-950 text-white shadow-sm' : 'text-neutral-600'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
