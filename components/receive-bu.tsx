'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { QrCode, Share2, Copy, CheckCircle } from 'lucide-react'
import QRCode from 'qrcode'
import { displayBuId } from '@/lib/phone'
import { formatEventDateTime } from '@/lib/datetime'
import { buFromNaira, formatBu } from '@/lib/bu-rate'
import { useAccount } from '@/components/account-store'

interface ReceivedTransfer {
  id: string
  senderUsername: string
  senderName: string
  amount: number
  type: 'transfer' | 'tip'
  message?: string
  date: string
}

export default function ReceiveBU() {
  const { displayName: accountName } = useAccount()
  const [mode, setMode] = useState<'menu' | 'qr' | 'history'>('menu')
  const [qrValue, setQrValue] = useState('')
  const [qrImage, setQrImage] = useState('')
  const [displayName, setDisplayName] = useState(accountName)
  const [buIdLabel, setBuIdLabel] = useState('')
  const [receivedTransfers, setReceivedTransfers] = useState<ReceivedTransfer[]>([])

  useEffect(() => {
    if (accountName) setDisplayName(accountName)
  }, [accountName])

  useEffect(() => {
    fetch('/api/me', { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        const user = json.data?.user
        const profile = json.data?.profile
        if (!user) return
        const name = String(profile?.display_name || accountName || '')
        if (name) setDisplayName(name)
        const phone = String(profile?.phone_e164 || profile?.phone || '')
        if (phone) setBuIdLabel(displayBuId(phone))
        const payload = JSON.stringify({
          type: 'receive_bu',
          userId: user.id,
          phone,
          username: phone || user.id,
        })
        setQrValue(payload)
        const image = await QRCode.toDataURL(payload, { width: 280, margin: 1 })
        setQrImage(image)
      })
      .catch(() => undefined)
    fetch('/api/wallet', { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        const txs = (json.data?.transactions ?? []) as Array<Record<string, unknown>>
        setReceivedTransfers(
          txs.map((tx) => ({
            id: String(tx.id),
            senderUsername: String(tx.counterparty ?? ''),
            senderName: String(tx.description ?? 'ɃU received'),
            amount: buFromNaira(Number(tx.amount ?? 0)),
            type: String(tx.metadata ?? '').includes('tip') ? 'tip' : 'transfer',
            date: tx.created_at ? formatEventDateTime(String(tx.created_at)) : '',
          })),
        )
      })
      .catch(() => undefined)
  }, [])

  const handleCopyQR = () => {
    if (qrValue) void navigator.clipboard.writeText(qrValue)
  }

  return (
    <div className="space-y-6 pb-24 pt-4">
      {mode === 'menu' && (
        <>
          <div className="px-4">
            <h2 className="text-xl font-bold mb-4">Receive ɃU</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Receive ɃU from other users or accept tips instantly via QR code scan
            </p>

            <div className="space-y-3 mb-6">
              <Card
                onClick={() => setMode('qr')}
                className="border-primary/20 cursor-pointer bg-gradient-to-br from-primary/10 to-primary/5 p-6 transition-all hover:border-primary/60 hover:shadow-lg"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20">
                    <QrCode className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold">Show QR Code</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Display your QR code for instant tips and transfers.
                    </p>
                  </div>
                </div>
              </Card>

              <Card className="border-border/50 bg-card/50 p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20">
                    <span className="text-2xl">💳</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold">{displayName}</h3>
                    <p className="mt-2 text-sm font-mono text-primary">
                      {buIdLabel || 'Sign in to show your ɃU ID'}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Share your ɃU ID (phone) for others to send ɃU directly
                    </p>
                  </div>
                </div>
              </Card>
            </div>

            {receivedTransfers.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">Recent Receipts</h3>
                  <Button onClick={() => setMode('history')} variant="outline" size="sm">
                    View All
                  </Button>
                </div>
                <div className="space-y-2">
                  {receivedTransfers.slice(0, 3).map((transfer) => (
                    <Card key={transfer.id} className="border-border/50 bg-card/50 p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="font-medium">{transfer.senderName}</p>
                          <p className="text-xs text-muted-foreground">{transfer.senderUsername}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-primary">+Ƀ {formatBu(transfer.amount)}</p>
                          <p className="text-xs text-muted-foreground">{transfer.date}</p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {mode === 'qr' && (
        <>
          <div className="px-4">
            <div className="mb-4">
              <Button onClick={() => setMode('menu')} variant="outline" className="w-full">
                ← Back
              </Button>
            </div>

            <h2 className="text-xl font-bold mb-4">Your Receive QR Code</h2>
            <Card className="border-primary/20 bg-card p-6 mb-4">
              <div className="flex flex-col items-center">
                <div className="mb-4 rounded-lg border-4 border-primary/20 bg-white p-6">
                  {qrImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={qrImage} alt="Receive ɃU QR" className="h-64 w-64" />
                  ) : (
                    <div className="flex h-64 w-64 items-center justify-center text-sm text-muted-foreground">
                      Sign in to generate your QR
                    </div>
                  )}
                </div>
                <p className="text-sm font-semibold mb-2">{buIdLabel || displayName}</p>
                <div className="flex gap-2 w-full">
                  <Button onClick={handleCopyQR} variant="outline" className="flex-1">
                    <Copy className="mr-2 h-4 w-4" />
                    Copy
                  </Button>
                  <Button
                    onClick={() => {
                      if (navigator.share) {
                        void navigator.share({ title: 'Receive ɃU', text: qrValue })
                      }
                    }}
                    variant="outline"
                    className="flex-1"
                  >
                    <Share2 className="mr-2 h-4 w-4" />
                    Share
                  </Button>
                </div>
              </div>
            </Card>
            <Card className="border-primary/20 bg-primary/5 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                <div className="text-sm text-muted-foreground">
                  <p className="font-semibold mb-1">How it works:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Show your QR code to the sender</li>
                    <li>They scan and enter the amount</li>
                    <li>ɃU is transferred from their live wallet</li>
                  </ul>
                </div>
              </div>
            </Card>
          </div>
        </>
      )}

      {mode === 'history' && (
        <>
          <div className="px-4">
            <div className="mb-4">
              <Button onClick={() => setMode('menu')} variant="outline" className="w-full">
                ← Back
              </Button>
            </div>
            <h2 className="text-xl font-bold mb-4">Receive History</h2>
            <div className="space-y-3">
              {receivedTransfers.length === 0 ? (
                <Card className="border-border/50 bg-card/50 p-8 text-center">
                  <p className="text-muted-foreground">No receipts yet</p>
                </Card>
              ) : (
                receivedTransfers.map((transfer) => (
                  <Card key={transfer.id} className="border-border/50 bg-card/50 p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold">{transfer.senderName}</h3>
                        <p className="text-sm text-muted-foreground mt-1">{transfer.senderUsername}</p>
                        <p className="text-xs text-muted-foreground mt-2">{transfer.date}</p>
                      </div>
                      <p className="font-bold text-primary">+Ƀ {formatBu(transfer.amount)}</p>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
