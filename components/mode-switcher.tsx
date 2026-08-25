'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { User, Store, PartyPopper } from 'lucide-react'

interface ModeSwitcherProps {
  currentMode: 'user' | 'celebrant' | 'vendor'
  onModeChange: (mode: 'user' | 'celebrant' | 'vendor') => void
}

export default function ModeSwitcher({
  currentMode,
  onModeChange,
}: ModeSwitcherProps) {
  return (
    <Card className="border-border bg-card p-4">
      <p className="mb-3 text-sm font-semibold text-muted-foreground">Select Mode</p>
      <div className="grid grid-cols-3 gap-2">
        <Button
          onClick={() => onModeChange('user')}
          variant={currentMode === 'user' ? 'default' : 'outline'}
          className="h-16 flex-col gap-2"
        >
          <User className="h-5 w-5" />
          <span className="text-xs">Guest</span>
        </Button>
        <Button
          onClick={() => onModeChange('celebrant')}
          variant={currentMode === 'celebrant' ? 'default' : 'outline'}
          className="h-16 flex-col gap-2"
        >
          <PartyPopper className="h-5 w-5" />
          <span className="text-xs">Celebrant</span>
        </Button>
        <Button
          onClick={() => onModeChange('vendor')}
          variant={currentMode === 'vendor' ? 'default' : 'outline'}
          className="h-16 flex-col gap-2"
        >
          <Store className="h-5 w-5" />
          <span className="text-xs">Vendor</span>
        </Button>
      </div>
    </Card>
  )
}
