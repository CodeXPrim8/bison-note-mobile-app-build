'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Sparkles, Heart, Zap } from 'lucide-react'

interface OnboardingProps {
  onComplete: () => void
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/20 to-background flex flex-col items-center justify-center px-4 py-8">
      <div className="max-w-sm space-y-8 text-center">
        {/* Animated Logo */}
        <div className="space-y-4">
          <div className="flex justify-center">
            <div className="text-6xl animate-bounce">💝</div>
          </div>
          <h1 className="text-4xl font-bold text-foreground">Bison Note</h1>
          <p className="text-lg text-muted-foreground">
            Celebrate Better Without Cash
          </p>
        </div>

        {/* Features */}
        <div className="space-y-4">
          <Card className="border-primary/20 bg-card/50 p-6 backdrop-blur">
            <div className="flex items-start gap-4">
              <Sparkles className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
              <div className="text-left">
                <h3 className="font-semibold">Spray Without Cash</h3>
                <p className="text-sm text-muted-foreground">
                  Send celebration vouchers digitally
                </p>
              </div>
            </div>
          </Card>

          <Card className="border-primary/20 bg-card/50 p-6 backdrop-blur">
            <div className="flex items-start gap-4">
              <Heart className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
              <div className="text-left">
                <h3 className="font-semibold">Secure & Instant</h3>
                <p className="text-sm text-muted-foreground">
                  Event-based ɃU transfers with wallet-first architecture
                </p>
              </div>
            </div>
          </Card>

          <Card className="border-primary/20 bg-card/50 p-6 backdrop-blur">
            <div className="flex items-start gap-4">
              <Zap className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
              <div className="text-left">
                <h3 className="font-semibold">Withdraw ɃU</h3>
                <p className="text-sm text-muted-foreground">
                  Withdraw ɃU from wallet to bank account
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Disclaimer */}
        <Card className="border-border/50 bg-background/50 p-4">
          <p className="text-xs text-muted-foreground italic">
            Physical Bison Notes are ceremonial tokens with zero monetary value. All value is transferred digitally via ɃU before notes are issued.
          </p>
        </Card>

        {/* CTA */}
        <Button
          onClick={onComplete}
          className="w-full bg-primary py-6 text-primary-foreground text-lg font-semibold hover:bg-primary/90"
        >
          Get Started
        </Button>

        {/* Features at bottom */}
        <div className="flex justify-center gap-8 pt-8 text-muted-foreground">
          <div className="text-center">
            <p className="text-2xl font-bold text-primary">1:1</p>
            <p className="text-xs">Rate</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-primary">QR</p>
            <p className="text-xs">Verified</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-primary">0</p>
            <p className="text-xs">Note Value</p>
          </div>
        </div>
      </div>
    </div>
  )
}
