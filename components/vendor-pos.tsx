'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { CheckCircle } from 'lucide-react'
import { WalletPageSummary } from '@/components/wallet-summary'
import { ModeListRow, ModeSegmented } from '@/components/mode-home-shell'

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
        transfer.id === transferId ? { ...transfer, status: 'confirmed' as const } : transfer,
      ),
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

  const filteredPending =
    selectedEvent === 'all' ? pendingTransfers : pendingTransfers.filter((t) => t.eventId === selectedEvent)

  return (
    <div className="space-y-6 bg-white pb-28 pt-4 text-neutral-950">
      <div className="px-4">
        <WalletPageSummary
          kicker="Vendor"
          title="POS"
          detail="Confirm guest ɃU transfers, then issue ceremonial Bison Notes."
        />

        <div className="mt-6 space-y-4">
          <ModeSegmented
            value={mode}
            onChange={(id) => setMode(id as 'pending' | 'history')}
            options={[
              { id: 'pending', label: `Pending (${pendingTransfers.length})` },
              { id: 'history', label: 'History' },
            ]}
          />

          {mode === 'pending' && (
            <>
              <div>
                <label className="mb-2 block text-sm font-semibold">Filter by event</label>
                <select
                  value={selectedEvent}
                  onChange={(e) => setSelectedEvent(e.target.value)}
                  className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-3 text-sm text-neutral-950"
                >
                  <option value="all">All events</option>
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                {filteredPending.length === 0 ? (
                  <p className="rounded-2xl border border-neutral-200 bg-white px-4 py-8 text-center text-sm text-neutral-500">
                    No pending transfers
                  </p>
                ) : (
                  filteredPending.map((transfer) => (
                    <div key={transfer.id} className="rounded-2xl border border-neutral-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold">{transfer.eventName}</p>
                          <p className="mt-1 text-sm text-neutral-500">Guest: {transfer.guestName}</p>
                          <p className="text-xs text-neutral-400">{transfer.timestamp}</p>
                        </div>
                        <p className="font-bold tabular-nums">Ƀ {transfer.amount.toLocaleString()}</p>
                      </div>
                      <div className="mt-4 flex gap-2">
                        {transfer.status === 'pending' && (
                          <>
                            <Button
                              onClick={() => handleConfirmTransfer(transfer.id)}
                              className="flex-1 bg-neutral-950 text-white hover:bg-neutral-800"
                            >
                              Confirm
                            </Button>
                            <Button onClick={() => handleIssueNotes(transfer.id)} variant="outline" className="flex-1" disabled>
                              Issue notes
                            </Button>
                          </>
                        )}
                        {transfer.status === 'confirmed' && (
                          <Button
                            onClick={() => handleIssueNotes(transfer.id)}
                            className="w-full bg-neutral-950 text-white hover:bg-neutral-800"
                          >
                            Issue physical notes
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {mode === 'history' && (
            <div className="space-y-2">
              {completedTransfers.length === 0 ? (
                <p className="rounded-2xl border border-neutral-200 bg-white px-4 py-8 text-center text-sm text-neutral-500">
                  No completed issuances yet
                </p>
              ) : (
                completedTransfers.map((transfer) => (
                  <ModeListRow
                    key={transfer.id}
                    title={transfer.eventName}
                    detail={`Guest: ${transfer.guestName} · ${transfer.timestamp}`}
                    amount={`Ƀ ${transfer.amount.toLocaleString()}`}
                    amountTone="credit"
                  />
                ))
              )}
              {completedTransfers.length > 0 ? (
                <p className="flex items-center gap-2 text-xs text-neutral-500">
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                  Notes issued are ceremonial tokens with zero monetary value.
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
