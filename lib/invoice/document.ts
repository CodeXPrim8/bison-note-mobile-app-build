export type BuInvoiceKind = 'transfer' | 'tip' | 'spray' | 'bank'

export type BuInvoice = {
  number: string
  issuedAt: string
  kind: BuInvoiceKind
  fromName: string
  toName: string
  toId?: string
  amountBu: number
  amountNaira: number
  note?: string
  status?: string
}

export function invoiceNumberFromId(id: string) {
  const compact = id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toUpperCase()
  return `BU-${compact || 'RECEIPT'}`
}

export function invoiceKindLabel(kind: BuInvoiceKind) {
  if (kind === 'tip') return 'Tip'
  if (kind === 'spray') return 'Event spray'
  if (kind === 'bank') return 'Send to bank'
  return 'BU transfer'
}

export function invoiceFileName(invoice: BuInvoice) {
  return `${invoice.number}.pdf`
}

export function invoiceShareText(invoice: BuInvoice) {
  const when = formatInvoiceWhen(invoice.issuedAt)
  const lines = [
    `Ƀucks invoice ${invoice.number}`,
    `Status: ${invoice.status || 'Paid'}`,
    `Type: ${invoiceKindLabel(invoice.kind)}`,
    `From: ${invoice.fromName || 'Ƀucks wallet'}`,
    `To: ${invoice.toName || 'Recipient'}`,
    `Amount: ${formatInvoiceBu(invoice.amountBu)} BU (N${formatInvoiceNaira(invoice.amountNaira)})`,
    `Date: ${when}`,
  ]
  if (invoice.note) lines.push(`Note: ${invoice.note}`)
  return lines.join('\n')
}

export function formatInvoiceWhen(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })
}

export function formatInvoiceBu(value: number) {
  return value.toLocaleString('en-NG', { maximumFractionDigits: 2 })
}

export function formatInvoiceNaira(value: number) {
  return value.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function pdfEscape(value: string) {
  return value.replace(/[^\x20-\x7E]/g, ' ').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

/** A one-page PDF receipt. Built without a PDF library so it downloads on the phone. */
export function buildInvoicePdf(invoice: BuInvoice): Uint8Array {
  const rows: Array<[string, string]> = [
    ['Invoice', invoice.number],
    ['Status', invoice.status || 'Paid'],
    ['Date', formatInvoiceWhen(invoice.issuedAt)],
    ['Type', invoiceKindLabel(invoice.kind)],
    ['From', invoice.fromName || 'Ƀucks wallet'],
    ['To', invoice.toId ? `${invoice.toName} (${invoice.toId})` : invoice.toName || 'Recipient'],
    ['Amount', `${formatInvoiceBu(invoice.amountBu)} BU`],
    ['Value', `NGN ${formatInvoiceNaira(invoice.amountNaira)}`],
  ]
  if (invoice.note) rows.push(['Note', invoice.note.slice(0, 140)])

  const commands: string[] = []
  // PDF core fonts are Latin-1 only — brand mark renders as BUCKS in the file.
  commands.push('BT /F2 22 Tf 48 790 Td (BUCKS) Tj ET')
  commands.push('BT /F1 11 Tf 48 768 Td (Wallet transfer invoice) Tj ET')
  commands.push('0.85 0.65 0.15 RG')
  commands.push('48 752 m 547 752 l S')
  commands.push('0 0 0 RG')

  let y = 720
  for (const [label, value] of rows) {
    commands.push(`BT /F1 11 Tf 48 ${y} Td (${pdfEscape(label)}) Tj ET`)
    commands.push(`BT /F2 12 Tf 180 ${y} Td (${pdfEscape(value)}) Tj ET`)
    y -= 28
  }

  y -= 12
  commands.push(`BT /F1 9 Tf 48 ${y} Td (1 BU = NGN 1. This confirms a completed vaucher transfer.) Tj ET`)

  const stream = commands.join('\n')
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >> endobj\n',
    `4 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream\nendobj\n`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n',
    '6 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj\n',
  ]
  let body = '%PDF-1.4\n'
  const offsets = [0]
  for (const object of objects) {
    offsets.push(body.length)
    body += object
  }
  const xrefAt = body.length
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let index = 1; index < offsets.length; index += 1) {
    xref += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`
  }
  body += xref
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`
  return new TextEncoder().encode(body)
}

export function invoicePdfBlob(invoice: BuInvoice) {
  const bytes = buildInvoicePdf(invoice)
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  return new Blob([buffer], { type: 'application/pdf' })
}
