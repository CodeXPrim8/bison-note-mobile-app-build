'use client'

import { User, Store, PartyPopper } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface ModeSwitcherProps {
  currentMode: 'user' | 'celebrant' | 'vendor'
  onModeChange: (mode: 'user' | 'celebrant' | 'vendor') => void
}

const MODES: Array<{ id: 'user' | 'celebrant' | 'vendor'; label: string; Icon: LucideIcon }> = [
  { id: 'user', label: 'Home', Icon: User },
  { id: 'celebrant', label: 'Celebrant', Icon: PartyPopper },
  { id: 'vendor', label: 'Vendor', Icon: Store },
]

export default function ModeSwitcher({ currentMode, onModeChange }: ModeSwitcherProps) {
  return (
    <div className="rounded-[24px] border border-neutral-200 bg-neutral-50 p-1.5">
      <p className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Mode</p>
      <div className="grid grid-cols-3 gap-1">
        {MODES.map(({ id, label, Icon }) => {
          const active = currentMode === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => onModeChange(id)}
              className={`bu-press flex flex-col items-center gap-1.5 rounded-[18px] px-2 py-3 transition ${
                active ? 'bg-neutral-950 text-white shadow-sm' : 'text-neutral-600 hover:bg-white'
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
