'use client'

import { useState } from 'react'
import { Download, Eye, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  formatInvoiceBu,
  formatInvoiceNaira,
  formatInvoiceWhen,
  invoiceFileName,
  invoiceKindLabel,
  invoicePdfBlob,
  invoiceShareText,
  type BuInvoice,
} from '@/lib/invoice/document'

const VAUCHER_FOOTER = '1 ɃU = ₦1. This confirms a completed vaucher transfer.'

function downloadInvoice(invoice: BuInvoice) {
  const blob = invoicePdfBlob(invoice)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = invoiceFileName(invoice)
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}

async function shareInvoice(invoice: BuInvoice) {
  const text = invoiceShareText(invoice)
  const file = new File([invoicePdfBlob(invoice)], invoiceFileName(invoice), { type: 'application/pdf' })
  if (typeof navigator.share === 'function' && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
    await navigator.share({ title: `Ƀucks invoice ${invoice.number}`, text, files: [file] })
    return
  }
  if (typeof navigator.share === 'function') {
    await navigator.share({ title: `Ƀucks invoice ${invoice.number}`, text })
    return
  }
  downloadInvoice(invoice)
}

function InvoiceCard({ invoice }: { invoice: BuInvoice }) {
  const metaRows: Array<[string, string]> = [
    ['Invoice', invoice.number],
    ['Date', formatInvoiceWhen(invoice.issuedAt)],
    ['Type', invoiceKindLabel(invoice.kind)],
    ['From', invoice.fromName || 'Ƀucks wallet'],
    ['To', invoice.toId ? `${invoice.toName} (${invoice.toId})` : invoice.toName || 'Recipient'],
  ]

  return (
    <div
      className="overflow-hidden rounded-[28px] text-white shadow-[0_20px_50px_rgba(11,23,51,0.45)]"
      style={{
        background:
          'radial-gradient(120% 80% at 90% -10%, rgba(47,123,255,0.32) 0%, transparent 55%), radial-gradient(90% 60% at 0% 110%, rgba(34,224,255,0.16) 0%, transparent 50%), linear-gradient(165deg, #142a56 0%, #0b1733 48%, #07101f 100%)',
        boxShadow: '0 20px 50px rgba(11,23,51,0.45), 0 0 0 1px rgba(47,123,255,0.28), inset 0 1px 0 rgba(255,255,255,0.1)',
      }}
    >
      <div className="border-b border-white/10 px-5 pb-5 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.28em]" style={{ color: 'var(--bu-cyan, #22e0ff)' }}>
              Ƀucks
            </p>
            <h3 className="mt-2 text-xl font-semibold tracking-tight">Transfer invoice</h3>
          </div>
          <span
            className="rounded-full px-3 py-1 text-xs font-semibold"
            style={{
              background: 'rgba(34, 224, 255, 0.14)',
              color: '#7eecff',
              boxShadow: 'inset 0 0 0 1px rgba(34,224,255,0.28)',
            }}
          >
            {invoice.status || 'Paid'}
          </span>
        </div>
        <div
          className="mt-5 rounded-2xl px-4 py-4"
          style={{
            background: 'linear-gradient(165deg, rgba(255,255,255,0.12), rgba(255,255,255,0.05))',
            border: '1px solid rgba(255,255,255,0.14)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)',
          }}
        >
          <p className="text-xs text-white/55">Amount</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
            Ƀ&nbsp;{formatInvoiceBu(invoice.amountBu)}
          </p>
          <p className="mt-1 text-sm tabular-nums" style={{ color: 'rgba(126, 236, 255, 0.85)' }}>
            ₦{formatInvoiceNaira(invoice.amountNaira)}
          </p>
        </div>
      </div>

      <div className="space-y-3 px-5 py-5 text-sm">
        {metaRows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-start justify-between gap-4 border-b border-white/8 pb-3 last:border-b-0 last:pb-0"
            style={{ borderColor: 'rgba(255,255,255,0.08)' }}
          >
            <span className="text-white/45">{label}</span>
            <span className="max-w-[60%] text-right font-medium text-white/95">{value}</span>
          </div>
        ))}
        {invoice.note ? (
          <div
            className="rounded-2xl px-3 py-3"
            style={{
              background: 'rgba(47,123,255,0.12)',
              border: '1px solid rgba(47,123,255,0.22)',
            }}
          >
            <p className="text-xs text-white/50">Note</p>
            <p className="mt-1 font-medium text-white/90">{invoice.note}</p>
          </div>
        ) : null}
        <p className="pt-1 text-xs leading-relaxed text-white/40">{VAUCHER_FOOTER}</p>
      </div>
    </div>
  )
}

export function BuInvoiceDialog({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: BuInvoice | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [notice, setNotice] = useState<string | null>(null)
  if (!invoice) return null

  async function onShare() {
    setNotice(null)
    try {
      await shareInvoice(invoice!)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      downloadInvoice(invoice!)
      setNotice('Sharing is not available here, so the invoice was downloaded.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[92vh] overflow-y-auto border sm:max-w-md"
        style={{
          background: 'linear-gradient(180deg, #0f1f42 0%, #07101f 100%)',
          borderColor: 'rgba(47,123,255,0.28)',
          color: '#fff',
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-white">Invoice {invoice.number}</DialogTitle>
          <DialogDescription className="text-white/55">
            Receipt for this transfer. Share or download the PDF.
          </DialogDescription>
        </DialogHeader>
        <InvoiceCard invoice={invoice} />
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void onShare()}
            className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
          >
            <Share2 className="h-4 w-4" />
            Share
          </Button>
          <Button
            type="button"
            onClick={() => downloadInvoice(invoice)}
            className="border-0 text-white hover:opacity-95"
            style={{
              background: 'linear-gradient(160deg, #4d8fff, #2f7bff)',
              boxShadow: '0 10px 24px rgba(47,123,255,0.35)',
            }}
          >
            <Download className="h-4 w-4" />
            Download PDF
          </Button>
        </div>
        {notice ? <p className="text-xs text-white/50">{notice}</p> : null}
      </DialogContent>
    </Dialog>
  )
}

export function BuInvoiceActions({
  invoice,
  compact = false,
  showView = true,
}: {
  invoice: BuInvoice
  compact?: boolean
  showView?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  async function onShare() {
    setNotice(null)
    try {
      await shareInvoice(invoice)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      downloadInvoice(invoice)
      setNotice('Sharing is not available here, so the invoice was downloaded.')
    }
  }

  return (
    <div className="space-y-2">
      <div
        className={`grid gap-2 ${compact ? (showView ? 'grid-cols-3' : 'grid-cols-2') : showView ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}
      >
        {showView ? (
          <Button type="button" variant="outline" onClick={() => setOpen(true)} className={compact ? 'px-2' : undefined}>
            <Eye className="h-4 w-4" />
            View
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={() => void onShare()} className={compact ? 'px-2' : undefined}>
          <Share2 className="h-4 w-4" />
          Share
        </Button>
        <Button
          type="button"
          onClick={() => downloadInvoice(invoice)}
          className={`border-0 text-white hover:opacity-95 ${compact ? 'px-2' : ''}`}
          style={{ background: 'linear-gradient(160deg, #4d8fff, #2f7bff)' }}
        >
          <Download className="h-4 w-4" />
          Download
        </Button>
      </div>
      {notice && <p className="text-xs text-muted-foreground">{notice}</p>}
      <BuInvoiceDialog invoice={invoice} open={open} onOpenChange={setOpen} />
    </div>
  )
}
