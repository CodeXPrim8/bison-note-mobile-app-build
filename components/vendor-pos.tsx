'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle, AlertCircle } from 'lucide-react'

interface BUTransfer {
  id: string
  eventId: string
  eventName: string
  guestName: string
  amount: number
  timestamp: string
  status: 'pending' | 'confirmed' | 'notes_issued'
  noteIssued: boolean
}

export default function VendorPOS() {
  const [mode, setMode] = useState<'pending' | 'history'>('pending')
  const [selectedEvent, setSelectedEvent] = useState<string>('all')
  const [events, setEvents] = useState<Array<{ id: string; name: string }>>([])
  const [pendingTransfers, setPendingTransfers] = useState<BUTransfer[]>([])
  const [completedTransfers, setCompletedTransfers] = useState<BUTransfer[]>([])

  useEffect(() => {
    fetch('/api/events/mine', { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        if (!json.status) {
          setEvents([])
          return
        }
        const list = (json.data ?? []) as Array<Record<string, unknown>>
        setEvents(
          list.map((event) => ({
            id: String(event.id),
            name: String(event.title ?? event.name ?? 'Event'),
          })),
        )
      })
      .catch(() => undefined)
  }, [])

  const handleConfirmTransfer = (transferId: string) => {
    setPendingTransfers((prev) =>
      prev.map((transfer) =>
        transfer.id === transferId
          ? { ...transfer, status: 'confirmed' as const }
          : transfer
        )
      )
  }

  const handleIssueNotes = (transferId: string) => {
    const transfer = pendingTransfers.find((t) => t.id === transferId)
    if (transfer) {
      setPendingTransfers((prev) => prev.filter((t) => t.id !== transferId))
      setCompletedTransfers((prev) => [
        { ...transfer, status: 'notes_issued' as const, noteIssued: true },
        ...prev,
      ])
    }
    }

  const filteredPending = selectedEvent === 'all'
    ? pendingTransfers
    : pendingTransfers.filter((t) => t.eventId === selectedEvent)

  return (
    <div className="space-y-6 pb-24 pt-4">
      {/* Info Card */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
            <h3 className="font-semibold">Note Issuance System</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Confirm ɃU transfers from guests, then issue physical Bison Notes. Notes are ceremonial tokens with zero monetary value.
                </p>
              </div>
              </div>
            </Card>

      {/* Mode Tabs */}
      <div className="flex gap-2">
        <Button
          onClick={() => setMode('pending')}
          variant={mode === 'pending' ? 'default' : 'outline'}
          className="flex-1"
        >
          Pending ({pendingTransfers.length})
        </Button>
            <Button
          onClick={() => setMode('history')}
          variant={mode === 'history' ? 'default' : 'outline'}
          className="flex-1"
            >
          History
            </Button>
          </div>

      {mode === 'pending' && (
        <>
          {/* Event Filter */}
          <div>
            <label className="text-sm font-semibold mb-2 block">Filter by Event</label>
            <select
              value={selectedEvent}
              onChange={(e) => setSelectedEvent(e.target.value)}
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-foreground"
            >
              <option value="all">All Events</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name}
                </option>
              ))}
            </select>
          </div>

          <h3 className="font-semibold">Pending ɃU Transfers</h3>

          {filteredPending.length === 0 ? (
            <Card className="border-border/50 bg-card/50 p-8 text-center">
              <p className="text-muted-foreground">No pending transfers</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredPending.map((transfer) => (
                <Card
                  key={transfer.id}
                  className="border-yellow-400/30 bg-yellow-400/10 p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-semibold">{transfer.eventName}</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        Guest: {transfer.guestName}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {transfer.timestamp}
                      </p>
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

                  <div className="mt-4 flex gap-2">
                    {transfer.status === 'pending' && (
                      <>
                      <Button
                          onClick={() => handleConfirmTransfer(transfer.id)}
                          className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                          Confirm Transfer
                      </Button>
                      <Button
                          onClick={() => handleIssueNotes(transfer.id)}
                          variant="outline"
                          className="flex-1"
                          disabled
                      >
                          Issue Notes
                      </Button>
                      </>
                    )}
                    {transfer.status === 'confirmed' && (
                      <Button
                        onClick={() => handleIssueNotes(transfer.id)}
                        className="w-full bg-green-400 text-white hover:bg-green-400/90"
                      >
                        Issue Physical Notes
                      </Button>
                    )}
                  </div>
                </Card>
                ))}
              </div>
          )}
        </>
      )}

      {mode === 'history' && (
        <>
          <h3 className="font-semibold">Completed Note Issuances</h3>

          {completedTransfers.length === 0 ? (
            <Card className="border-border/50 bg-card/50 p-8 text-center">
              <p className="text-muted-foreground">No completed issuances yet</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {completedTransfers.map((transfer) => (
                <Card
                  key={transfer.id}
                  className="border-green-400/30 bg-green-400/10 p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-400" />
                        <h4 className="font-semibold">{transfer.eventName}</h4>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Guest: {transfer.guestName}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {transfer.timestamp}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-primary">
                        Ƀ {transfer.amount.toLocaleString()}
                      </p>
                      <span className="inline-block rounded-full bg-green-400/20 px-2 py-1 text-xs text-green-400 mt-1">
                        Notes Issued
                      </span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
