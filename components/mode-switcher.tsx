'use client'

import { User, Store, PartyPopper } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface ModeSwitcherProps {
  currentMode: 'user' | 'celebrant' | 'vendor'
  onModeChange: (mode: 'user' | 'celebrant' | 'vendor') => void
  canCelebrant?: boolean
  canVendor?: boolean
}

const MODES: Array<{ id: 'user' | 'celebrant' | 'vendor'; label: string; Icon: LucideIcon }> = [
  { id: 'user', label: 'Guest', Icon: User },
  { id: 'celebrant', label: 'Celebrant', Icon: PartyPopper },
  { id: 'vendor', label: 'Vendor', Icon: Store },
]

export default function ModeSwitcher({
  currentMode,
  onModeChange,
  canCelebrant = false,
  canVendor = false,
}: ModeSwitcherProps) {
  const visible = MODES.filter((mode) => {
    if (mode.id === 'user') return true
    // Always keep the active mode visible so you can still leave it.
    if (mode.id === currentMode) return true
    if (mode.id === 'celebrant') return canCelebrant
    if (mode.id === 'vendor') return canVendor
    return false
  })

  if (visible.length <= 1) return null

  return (
    <div className="bu-glass rounded-[24px] p-1.5">
      <p className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
        Switch mode
      </p>
      <div className={`grid gap-1 ${visible.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {visible.map(({ id, label, Icon }) => {
          const active = currentMode === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => onModeChange(id)}
              className={`bu-press flex flex-col items-center gap-1.5 rounded-[18px] px-2 py-3 transition ${
                active ? 'bu-nav-active' : 'text-neutral-600 hover:bg-white/45'
              }`}
            >
              <Icon className="h-4 w-4" strokeWidth={active ? 2.4 : 2} />
              <span className="text-[11px] font-semibold">{label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
