'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { User, CheckCircle, AlertCircle, Search, QrCode, Sparkles } from 'lucide-react'
import { TicketQrScanner } from '@/components/web/ticket-qr-scanner'

interface UserProfile {
  id: string
  username: string
  fullName: string
  verified: boolean
}

interface BUTransfer {
  id: string
  recipientUsername: string
  recipientName: string
  amount: number
  message: string
  date: string
  status: 'completed' | 'pending' | 'failed'
  type: 'transfer' | 'tip'
}

export default function SendBU() {
  const [step, setStep] = useState<'menu' | 'search' | 'confirm' | 'tip-scan' | 'tip-confirm' | 'success' | 'history'>('menu')
  const [transferType, setTransferType] = useState<'transfer' | 'tip'>('transfer')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null)
  const [tipAmount, setTipAmount] = useState('')
  const [scannedQRData, setScannedQRData] = useState<{ userId: string; username: string } | null>(null)
  const [transfers, setTransfers] = useState<BUTransfer[]>([])
  const [searchResults, setSearchResults] = useState<UserProfile[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)
  const [pastedQr, setPastedQr] = useState('')

  const [transferForm, setTransferForm] = useState({
    amount: '',
    message: '',
  })

  useEffect(() => {
    fetch('/api/wallet', { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        const txs = (json.data?.transactions ?? []) as Array<Record<string, unknown>>
        setTransfers(
          txs.map((tx) => ({
            id: String(tx.id),
            recipientUsername: String(tx.counterparty ?? ''),
            recipientName: String(tx.description ?? 'ɃU transfer'),
            amount: Number(tx.amount ?? 0),
            message: '',
            date: tx.created_at ? new Date(String(tx.created_at)).toLocaleString() : '',
            status: 'completed',
            type: String(tx.metadata ?? '').includes('tip') ? 'tip' : 'transfer',
          })),
        )
      })
      .catch(() => undefined)
  }, [])

  async function handleSearch(query: string) {
    setSearchQuery(query)
    if (query.length < 7) {
      setSearchResults([])
      return
    }
    try {
      const res = await fetch('/api/users/lookup', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bu_id: query }),
      })
      const json = await res.json()
      if (json.status && json.data?.exists) {
        setSearchResults([
          {
            id: String(json.data.id),
            username: String(json.data.phone_hint ?? json.data.bu_id),
            fullName: String(json.data.display_name ?? 'ɃU member'),
            verified: true,
          },
        ])
      } else {
        setSearchResults([])
      }
    } catch {
      setSearchResults([])
    }
  }

  const handleSelectUser = (user: UserProfile) => {
    setSelectedUser(user)
    setStep('confirm')
    setSearchQuery('')
    setSearchResults([])
  }

  async function sendToUser(user: UserProfile, amount: number, isTip: boolean, note: string) {
    if (!user.id) {
      setMessage('This recipient has no live ɃU account id.')
      return false
    }
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/wallet/transfer', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_user_id: user.id, amount, is_tip: isTip }),
      })
      const json = await res.json()
      setBusy(false)
      if (!json.status) {
        setMessage(json.message ?? 'Transfer failed.')
        return false
      }
      setTransfers([
        {
          id: String(Date.now()),
          recipientUsername: user.username,
          recipientName: user.fullName,
          amount,
          message: note,
          date: new Date().toLocaleString(),
          status: 'completed',
          type: isTip ? 'tip' : 'transfer',
        },
        ...transfers,
      ])
      return true
    } catch {
      setBusy(false)
      setMessage('Could not reach ɃU.')
      return false
    }
  }

  const handleSendBU = async () => {
    if (
      selectedUser &&
      transferForm.amount &&
      !isNaN(Number(transferForm.amount)) &&
      Number(transferForm.amount) > 0
    ) {
      const ok = await sendToUser(selectedUser, Number(transferForm.amount), transferType === 'tip', transferForm.message)
      if (ok) {
        setTransferForm({ amount: '', message: '' })
        setStep('success')
      }
    }
  }

  function parseReceiveQr(raw: string) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const userId = String(parsed.userId ?? parsed.user_id ?? '')
      const username = String(parsed.phone ?? parsed.username ?? parsed.bu_id ?? '')
      if (!userId) return null
      return { userId, username: username || userId }
    } catch {
      return null
    }
  }

  const handleTipScan = (raw: string) => {
    const parsed = parseReceiveQr(raw)
    if (!parsed) {
      setMessage('Scan a live receive-ɃU QR, or paste the payload.')
      return
    }
    setScannedQRData(parsed)
    setStep('tip-confirm')
    setCameraActive(false)
    setMessage(null)
  }

  const handleTipSend = async () => {
    if (tipAmount && !isNaN(Number(tipAmount)) && Number(tipAmount) > 0 && scannedQRData) {
      const ok = await sendToUser(
        {
          id: scannedQRData.userId,
          username: scannedQRData.username,
          fullName: scannedQRData.username,
          verified: true,
        },
        Number(tipAmount),
        true,
        'Tip',
      )
      if (ok) {
        setTipAmount('')
        setScannedQRData(null)
        setStep('success')
      }
    }
  }

  return (
    <div className="space-y-6 pb-24 pt-4">
      {step === 'menu' && (
        <>
          <div className="px-4">
            <h2 className="text-xl font-bold mb-4">Send ɃU</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Send ɃU to other users or tip instantly via QR code scan
            </p>

            {/* Send Options */}
            <div className="space-y-3 mb-6">
              <Card
                onClick={() => {
                  setTransferType('transfer')
                  setStep('search')
                }}
                className="border-primary/20 cursor-pointer bg-gradient-to-br from-primary/10 to-primary/5 p-6 transition-all hover:border-primary/60 hover:shadow-lg"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20">
                    <User className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold">Send ɃU to User</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Send ɃU to another user using their ɃU ID (phone number).
                    </p>
                  </div>
                </div>
              </Card>

              <Card
                onClick={() => {
                  setTransferType('tip')
                  setStep('tip-scan')
                }}
                className="border-yellow-400/20 cursor-pointer bg-gradient-to-br from-yellow-400/10 to-yellow-400/5 p-6 transition-all hover:border-yellow-400/60 hover:shadow-lg"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-yellow-400/20">
                    <Sparkles className="h-6 w-6 text-yellow-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold">Give Tip</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Scan recipient's QR code, enter amount, and send tip instantly. Perfect for performers, and gifters - digital instead of cash!
                    </p>
                  </div>
                </div>
              </Card>
            </div>

            {/* Recent Transfers */}
            {transfers.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">Recent Transfers</h3>
                  <Button
                    onClick={() => setStep('history')}
                    variant="outline"
                    size="sm"
                  >
                    View All
                  </Button>
                </div>
                <div className="space-y-2">
                  {transfers.slice(0, 3).map((transfer) => (
                    <Card
                      key={transfer.id}
                      className="border-border/50 bg-card/50 p-3"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{transfer.recipientName}</p>
                            {transfer.type === 'tip' && (
                              <span className="rounded-full bg-yellow-400/20 px-2 py-1 text-xs text-yellow-400">
                                Tip
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{transfer.recipientUsername}</p>
                        </div>
                        <p className="font-bold text-primary">Ƀ {transfer.amount.toLocaleString()}</p>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {step === 'tip-scan' && (
        <>
          <div className="px-4">
            <div className="mb-4">
              <Button
                onClick={() => setStep('menu')}
                variant="outline"
                className="w-full"
              >
                ← Back
              </Button>
            </div>
            <h2 className="text-xl font-bold mb-4">Give Tip</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Scan the recipient's QR code to send a tip instantly. Perfect for performers, and gifters - digital instead of cash!
            </p>

            <Card className="border-yellow-400/20 bg-yellow-400/5 p-6 mb-4 space-y-4">
              {cameraActive ? (
                <TicketQrScanner
                  readerId="bu-tip-reader"
                  active={cameraActive}
                  onScan={handleTipScan}
                />
              ) : (
                <div className="flex flex-col items-center">
                  <QrCode className="h-24 w-24 text-yellow-400/30 mb-3" />
                  <p className="text-xs text-muted-foreground mb-3">Point the camera at a live receive-ɃU QR</p>
                </div>
              )}
              <Button
                onClick={() => setCameraActive((open) => !open)}
                className="w-full bg-yellow-400 text-yellow-900 hover:bg-yellow-400/90"
              >
                {cameraActive ? 'Stop scanner' : 'Scan QR Code'}
              </Button>
              <Input
                placeholder="Or paste receive QR payload"
                value={pastedQr}
                onChange={(e) => setPastedQr(e.target.value)}
                className="bg-secondary text-foreground placeholder:text-muted-foreground"
              />
              <Button variant="outline" className="w-full" onClick={() => handleTipScan(pastedQr)}>
                Load recipient
              </Button>
              {message && <p className="text-sm text-destructive">{message}</p>}
            </Card>

            <Card className="border-border/50 bg-card/50 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                <div className="text-sm text-muted-foreground">
                  <p className="font-semibold mb-1">How it works:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>You enter tip amount</li>
                    <li>Recipient shows their QR code</li>
                    <li>Tip is sent instantly</li>
                  </ul>
                </div>
              </div>
            </Card>
          </div>
        </>
      )}

      {step === 'tip-confirm' && scannedQRData && (
        <>
          <div className="px-4">
            <div className="mb-4">
              <Button
                onClick={() => {
                  setStep('tip-scan')
                  setScannedQRData(null)
                  setTipAmount('')
                }}
                variant="outline"
                className="w-full"
              >
                ← Back
              </Button>
            </div>

            <h2 className="text-xl font-bold mb-4">Confirm Tip</h2>

            <Card className="border-yellow-400/20 bg-yellow-400/5 p-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-yellow-400/20">
                  <Sparkles className="h-8 w-8 text-yellow-400" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">{scannedQRData.username}</h3>
                  <p className="text-sm text-muted-foreground mt-1">QR Code scanned successfully</p>
                </div>
              </div>
            </Card>

            <Card className="border-primary/20 space-y-4 bg-card p-6">
              <div>
                <label className="text-sm font-semibold">Tip Amount (Ƀ)</label>
                <Input
                  type="number"
                  placeholder="Enter tip amount"
                  value={tipAmount}
                  onChange={(e) => setTipAmount(e.target.value)}
                  className="mt-2 bg-secondary text-foreground placeholder:text-muted-foreground"
                />
                {tipAmount && !isNaN(Number(tipAmount)) && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Equivalent: ₦{Number(tipAmount).toLocaleString()}
                  </p>
                )}
              </div>

              <div className="rounded-lg border border-yellow-400/20 bg-yellow-400/5 p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    Tip will be sent instantly to {scannedQRData.username}'s wallet. This is a peer-to-peer tip transfer.
                  </p>
                </div>
              </div>

              {message && <p className="text-sm text-destructive">{message}</p>}
              <Button
                onClick={() => void handleTipSend()}
                disabled={busy || !tipAmount || isNaN(Number(tipAmount)) || Number(tipAmount) <= 0}
                className="w-full bg-yellow-400 py-3 text-yellow-900 hover:bg-yellow-400/90"
              >
                {busy ? 'Sending…' : 'Give Tip'}
              </Button>
            </Card>
          </div>
        </>
      )}

      {step === 'search' && (
        <>
          <div className="px-4">
            <div className="mb-4">
              <Button
                onClick={() => setStep('menu')}
                variant="outline"
                className="w-full"
              >
                ← Back
              </Button>
            </div>
            <h2 className="text-xl font-bold mb-4">Send ɃU to User</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Look up a live ɃU member by their ɃU ID (phone number).
            </p>

            {/* Search Input */}
            <Card className="border-primary/20 bg-card p-4 mb-4">
              <div className="flex items-center gap-3">
                <Search className="h-5 w-5 text-primary" />
                <Input
                  type="text"
                  placeholder="Enter ɃU ID (phone number)"
                  value={searchQuery}
                  onChange={(e) => void handleSearch(e.target.value)}
                  className="bg-secondary text-foreground placeholder:text-muted-foreground"
                />
              </div>
            </Card>

            {/* Search Results */}
            {searchQuery.length >= 7 && (
              <div className="space-y-2">
                {searchResults.length === 0 ? (
                  <Card className="border-border/50 bg-card/50 p-8 text-center">
                    <p className="text-muted-foreground">No matching ɃU ID</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Enter the full phone number used as their ɃU ID
                    </p>
                  </Card>
                ) : (
                  searchResults.map((user) => (
                    <Card
                      key={user.id}
                      onClick={() => handleSelectUser(user)}
                      className="border-primary/20 cursor-pointer bg-card p-4 transition hover:bg-card/80 hover:border-primary/40"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20">
                            <User className="h-6 w-6 text-primary" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold">{user.fullName}</h3>
                              {user.verified && (
                                <span className="text-xs text-green-400">✓</span>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">{user.username}</p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          className="bg-primary text-primary-foreground hover:bg-primary/90"
                        >
                          Select
                        </Button>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            )}

            {/* Recent Transfers */}
            {searchQuery.length < 7 && transfers.length > 0 && (
              <div className="mt-6">
                <h3 className="mb-4 font-semibold">Recent Transfers</h3>
                <div className="space-y-2">
                  {transfers.slice(0, 3).map((transfer) => (
                    <Card
                      key={transfer.id}
                      className="border-border/50 bg-card/50 p-3"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{transfer.recipientName}</p>
                          <p className="text-xs text-muted-foreground">{transfer.recipientUsername}</p>
                        </div>
                        <p className="font-bold text-primary">Ƀ {transfer.amount.toLocaleString()}</p>
                      </div>
                    </Card>
                  ))}
                </div>
                <Button
                  onClick={() => setStep('history')}
                  variant="outline"
                  className="w-full mt-4"
                >
                  View All Transfers
                </Button>
              </div>
            )}
          </div>
        </>
      )}

      {step === 'confirm' && selectedUser && (
        <>
          <div className="px-4">
            <div className="mb-4">
              <Button
                onClick={() => {
                  setStep('search')
                  setSelectedUser(null)
                  setTransferForm({ amount: '', message: '' })
                }}
                variant="outline"
                className="w-full"
              >
                ← Back to Search
              </Button>
            </div>

            <h2 className="text-xl font-bold mb-4">Send ɃU to User</h2>

            {/* Selected User Info */}
            <Card className="border-primary/20 bg-card p-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/20">
                  <User className="h-8 w-8 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{selectedUser.fullName}</h3>
                    {selectedUser.verified && (
                      <span className="rounded-full bg-green-400/20 px-2 py-1 text-xs text-green-400">
                        Verified
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{selectedUser.username}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Unique ɃU ID — live account
                  </p>
                </div>
              </div>
            </Card>

            {/* Transfer Form */}
            <Card className="border-primary/20 space-y-4 bg-card p-6">
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-semibold">Amount (Ƀ)</label>
                  <Input
                    type="number"
                    placeholder="Enter ɃU amount"
                    value={transferForm.amount}
                    onChange={(e) =>
                      setTransferForm({ ...transferForm, amount: e.target.value })
                    }
                    className="mt-2 bg-secondary text-foreground placeholder:text-muted-foreground"
                  />
                  {transferForm.amount && !isNaN(Number(transferForm.amount)) && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Equivalent: ₦{Number(transferForm.amount).toLocaleString()}
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-sm font-semibold">Message (Optional)</label>
                  <Input
                    placeholder="Add a message"
                    value={transferForm.message}
                    onChange={(e) =>
                      setTransferForm({ ...transferForm, message: e.target.value })
                    }
                    className="mt-2 bg-secondary text-foreground placeholder:text-muted-foreground"
                  />
                </div>

                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground">
                      ɃU will be transferred directly to {selectedUser.fullName}'s wallet ({selectedUser.username}). This is a peer-to-peer transfer, not related to events.
                    </p>
                  </div>
                </div>

                {message && <p className="text-sm text-destructive">{message}</p>}
                <Button
                  onClick={() => void handleSendBU()}
                  disabled={busy}
                  className="w-full bg-primary py-3 text-primary-foreground hover:bg-primary/90"
                >
                  {busy ? 'Sending…' : 'Send ɃU Now'}
                </Button>
              </div>
            </Card>
          </div>
        </>
      )}

      {step === 'success' && transfers.length > 0 && (
        <>
          <div className="px-4">
            <Card className={`${transfers[0].type === 'tip' ? 'border-yellow-400/30 bg-yellow-400/10' : 'border-green-400/30 bg-green-400/10'} p-6 mb-4`}>
              <div className="flex items-start gap-3">
                <CheckCircle className={`h-6 w-6 ${transfers[0].type === 'tip' ? 'text-yellow-400' : 'text-green-400'} flex-shrink-0 mt-0.5`} />
                <div className="flex-1">
                  <h3 className={`font-semibold mb-2 ${transfers[0].type === 'tip' ? 'text-yellow-400' : 'text-green-400'}`}>
                    {transfers[0].type === 'tip' ? 'Tip Sent Instantly!' : 'ɃU Sent Successfully!'}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {transfers[0].type === 'tip' 
                      ? 'Your tip has been transferred instantly to the recipient\'s wallet. No cash needed!'
                      : 'Your ɃU has been transferred to the recipient\'s wallet.'}
                  </p>
                </div>
              </div>
            </Card>

            <Card className="border-primary/20 bg-card p-4 mb-4">
              <h4 className="font-semibold mb-3">Transfer Details</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Recipient:</span>
                  <span className="font-semibold">{transfers[0].recipientName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Username:</span>
                  <span className="font-semibold">{transfers[0].recipientUsername}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type:</span>
                  <span className={`font-semibold ${transfers[0].type === 'tip' ? 'text-yellow-400' : 'text-primary'}`}>
                    {transfers[0].type === 'tip' ? 'Tip' : 'Transfer'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount:</span>
                  <span className="font-bold text-primary">Ƀ {transfers[0].amount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <span className="text-green-400">Completed</span>
                </div>
                {transfers[0].message && (
                  <div className="pt-2 border-t border-border">
                    <p className="text-muted-foreground">Message:</p>
                    <p className="font-medium">"{transfers[0].message}"</p>
                  </div>
                )}
              </div>
            </Card>

            <div className="flex gap-2">
              <Button
                onClick={() => {
                  setStep('menu')
                  setSelectedUser(null)
                  setTransferForm({ amount: '', message: '' })
                  setTipAmount('')
                  setScannedQRData(null)
                }}
                className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Send More ɃU
              </Button>
              <Button
                onClick={() => setStep('history')}
                variant="outline"
                className="flex-1"
              >
                View History
              </Button>
            </div>
          </div>
        </>
      )}

      {step === 'history' && (
        <>
          <div className="px-4">
            <div className="mb-4">
              <Button
                onClick={() => setStep('menu')}
                variant="outline"
                className="w-full"
              >
                ← Back
              </Button>
            </div>

            <h2 className="text-xl font-bold mb-4">Send ɃU History</h2>

            <div className="space-y-3">
              {transfers.length === 0 ? (
                <Card className="border-border/50 bg-card/50 p-8 text-center">
                  <p className="text-muted-foreground">No transfers yet</p>
                  <Button
                    onClick={() => setStep('menu')}
                    className="mt-4 bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    Send ɃU
                  </Button>
                </Card>
              ) : (
                transfers.map((transfer) => (
                  <Card
                    key={transfer.id}
                    className="border-border/50 bg-card/50 p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{transfer.recipientName}</h3>
                          {transfer.type === 'tip' && (
                            <span className="rounded-full bg-yellow-400/20 px-2 py-1 text-xs text-yellow-400">
                              Tip
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{transfer.recipientUsername}</p>
                        {transfer.message && (
                          <p className="mt-1 text-sm text-muted-foreground">
                            "{transfer.message}"
                          </p>
                        )}
                        <span
                          className={`mt-2 inline-block rounded-full px-2 py-1 text-xs font-semibold ${
                            transfer.status === 'completed'
                              ? 'bg-green-400/20 text-green-400'
                              : transfer.status === 'pending'
                                ? 'bg-yellow-400/20 text-yellow-400'
                                : 'bg-red-400/20 text-red-400'
                          }`}
                        >
                          {transfer.status}
                        </span>
                        <p className="text-xs text-muted-foreground mt-2">{transfer.date}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-primary">
                          Ƀ {transfer.amount.toLocaleString()}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          ₦{transfer.amount.toLocaleString()}
                        </p>
                      </div>
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
