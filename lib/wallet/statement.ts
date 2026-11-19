import { buFromNaira } from '@/lib/bu-rate'

export type StatementLine = {
  when: string
  createdAt: number
  description: string
  direction: 'credit' | 'debit'
  amountNaira: number
  status?: string
  reference?: string | null
}

export type StatementAccount = {
  name: string
  email?: string | null
  phone?: string | null
  userId?: string
}

/** Bank-style summary for the statement period. Amounts are Naira (= BU at 1:1). */
export type StatementSummary = {
  openingBalance: number
  closingBalance: number
  totalIn: number
  totalOut: number
  /** Total turnover = money in + money out for the period. */
  turnover: number
  netMovement: number
  count: number
}

function pdfEscape(value: string) {
  return value.replace(/[^\x20-\x7E]/g, ' ').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function money(naira: number) {
  return naira.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function buMoney(naira: number) {
  return buFromNaira(naira).toLocaleString('en-NG', { maximumFractionDigits: 2 })
}

function signedAmount(line: StatementLine) {
  const bu = buFromNaira(line.amountNaira)
  const sign = line.direction === 'credit' ? '+' : '-'
  return `${sign}${bu.toLocaleString('en-NG', { maximumFractionDigits: 2 })} BU`
}

export function statementFileStamp(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

/**
 * Build SOA totals. When `closingBalance` (current wallet) is known and lines are the
 * most recent activity ending now, opening = closing - net of those lines.
 */
export function summarizeStatement(
  lines: StatementLine[],
  closingBalanceNaira?: number | null,
): StatementSummary {
  let totalIn = 0
  let totalOut = 0
  for (const line of lines) {
    const amount = Math.abs(Number(line.amountNaira) || 0)
    if (line.direction === 'credit') totalIn += amount
    else totalOut += amount
  }
  const netMovement = totalIn - totalOut
  const turnover = totalIn + totalOut
  const closing =
    typeof closingBalanceNaira === 'number' && Number.isFinite(closingBalanceNaira)
      ? Math.max(0, closingBalanceNaira)
      : netMovement > 0
        ? netMovement
        : 0
  const opening =
    typeof closingBalanceNaira === 'number' && Number.isFinite(closingBalanceNaira)
      ? closingBalanceNaira - netMovement
      : 0
  return {
    openingBalance: opening,
    closingBalance: closing,
    totalIn,
    totalOut,
    turnover,
    netMovement,
    count: lines.length,
  }
}

function summaryCsvBlock(summary: StatementSummary) {
  return [
    `"Opening balance (BU)","${buMoney(summary.openingBalance)}"`,
    `"Total money in (BU)","${buMoney(summary.totalIn)}"`,
    `"Total money out (BU)","${buMoney(summary.totalOut)}"`,
    `"Total turnover (BU)","${buMoney(summary.turnover)}"`,
    `"Net movement (BU)","${buMoney(summary.netMovement)}"`,
    `"Closing balance (BU)","${buMoney(summary.closingBalance)}"`,
    `"Transactions","${summary.count}"`,
  ].join('\n')
}

export function buildStatementCsv(
  account: StatementAccount,
  lines: StatementLine[],
  summary?: StatementSummary,
) {
  const totals = summary ?? summarizeStatement(lines)
  const header = ['Date', 'Description', 'Direction', 'Amount (BU)', 'Amount (NGN)', 'Status', 'Reference']
  const rows = lines.map((line) => {
    const bu = buFromNaira(line.amountNaira)
    return [
      line.when,
      line.description,
      line.direction === 'credit' ? 'In' : 'Out',
      `${line.direction === 'credit' ? '' : '-'}${bu}`,
      money(line.amountNaira),
      line.status || 'completed',
      line.reference || '',
    ]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(',')
  })
  return [
    `"Account","${(account.name || 'Bucks wallet').replace(/"/g, '""')}"`,
    account.email ? `"Email","${account.email.replace(/"/g, '""')}"` : '',
    account.phone ? `"BU ID","${account.phone.replace(/"/g, '""')}"` : '',
    `"Generated","${new Date().toISOString()}"`,
    '',
    summaryCsvBlock(totals),
    '',
    header.map((h) => `"${h}"`).join(','),
    ...rows,
  ]
    .filter(Boolean)
    .join('\n')
}

function pushSummaryPdf(commands: string[], summary: StatementSummary, startY: number) {
  let y = startY
  const rows: Array<[string, string]> = [
    ['Opening balance', `${buMoney(summary.openingBalance)} BU`],
    ['Money in', `+${buMoney(summary.totalIn)} BU`],
    ['Money out', `-${buMoney(summary.totalOut)} BU`],
    ['Total turnover', `${buMoney(summary.turnover)} BU`],
    ['Net movement', `${summary.netMovement >= 0 ? '+' : ''}${buMoney(summary.netMovement)} BU`],
    ['Closing balance', `${buMoney(summary.closingBalance)} BU`],
  ]
  commands.push(`BT /F2 10 Tf 40 ${y} Td (Account summary) Tj ET`)
  y -= 16
  for (const [label, value] of rows) {
    commands.push(`BT /F1 9 Tf 40 ${y} Td (${pdfEscape(label)}) Tj ET`)
    commands.push(`BT /F2 9 Tf 200 ${y} Td (${pdfEscape(value)}) Tj ET`)
    y -= 14
  }
  return y - 8
}

/** Compact multi-page PDF statement (Helvetica only). */
export function buildStatementPdf(
  account: StatementAccount,
  lines: StatementLine[],
  summary?: StatementSummary,
): Uint8Array {
  const totals = summary ?? summarizeStatement(lines)
  const pageHeight = 842
  const pageWidth = 595
  const topY = 790
  const bottomY = 56
  const lineHeight = 14
  // First page reserves space for the summary block.
  const firstPageBodyTop = 560
  const maxFirst = Math.floor((firstPageBodyTop - bottomY) / lineHeight)
  const maxOther = Math.floor((topY - bottomY - 90) / lineHeight)

  const chunks: StatementLine[][] = []
  if (lines.length <= maxFirst) {
    chunks.push(lines)
  } else {
    chunks.push(lines.slice(0, maxFirst))
    for (let i = maxFirst; i < lines.length; i += maxOther) {
      chunks.push(lines.slice(i, i + maxOther))
    }
  }
  if (!chunks.length) chunks.push([])

  const pageStreams: string[] = []
  chunks.forEach((chunk, pageIndex) => {
    const commands: string[] = []
    commands.push('BT /F2 18 Tf 40 802 Td (BUCKS) Tj ET')
    commands.push('BT /F1 11 Tf 40 782 Td (Statement of account) Tj ET')
    commands.push('0.18 0.48 1 RG')
    commands.push('40 770 m 555 770 l S')
    commands.push('0 0 0 RG')
    commands.push(
      `BT /F1 9 Tf 40 752 Td (${pdfEscape(`Account: ${account.name || 'Bucks wallet'}`)}) Tj ET`,
    )
    if (account.email) {
      commands.push(`BT /F1 9 Tf 40 738 Td (${pdfEscape(`Email: ${account.email}`)}) Tj ET`)
    }
    commands.push(
      `BT /F1 9 Tf 40 724 Td (${pdfEscape(`Generated: ${new Date().toLocaleString('en-NG')}  |  Page ${pageIndex + 1}/${chunks.length}`)}) Tj ET`,
    )

    let y = 700
    if (pageIndex === 0) {
      y = pushSummaryPdf(commands, totals, 700)
      commands.push('0.85 0.85 0.9 RG')
      commands.push(`40 ${y + 4} m 555 ${y + 4} l S`)
      commands.push('0 0 0 RG')
      y -= 6
    }

    commands.push(`BT /F2 9 Tf 40 ${y} Td (Date) Tj ET`)
    commands.push(`BT /F2 9 Tf 150 ${y} Td (Description) Tj ET`)
    commands.push(`BT /F2 9 Tf 420 ${y} Td (Amount) Tj ET`)
    y -= 18

    if (!chunk.length && pageIndex === 0) {
      commands.push(`BT /F1 10 Tf 40 ${y} Td (No wallet activity in this period.) Tj ET`)
    } else {
      for (const line of chunk) {
        const when = pdfEscape(line.when.slice(0, 22))
        const desc = pdfEscape(line.description.slice(0, 38))
        const amt = pdfEscape(signedAmount(line))
        commands.push(`BT /F1 8 Tf 40 ${y} Td (${when}) Tj ET`)
        commands.push(`BT /F1 8 Tf 150 ${y} Td (${desc}) Tj ET`)
        commands.push(`BT /F1 8 Tf 420 ${y} Td (${amt}) Tj ET`)
        y -= lineHeight
        if (y < bottomY) break
      }
    }
    commands.push(
      `BT /F1 8 Tf 40 40 Td (1 BU = NGN 1. For personal records. Ceremonial notes hold no cash value.) Tj ET`,
    )
    pageStreams.push(commands.join('\n'))
  })

  const objects: string[] = []
  objects.push('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n')

  const pageObjectNumbers: number[] = []
  let nextId = 3
  const contentObjectNumbers: number[] = []
  for (let i = 0; i < pageStreams.length; i += 1) {
    pageObjectNumbers.push(nextId)
    nextId += 1
    contentObjectNumbers.push(nextId)
    nextId += 1
  }
  const fontRegular = nextId
  const fontBold = nextId + 1

  const kids = pageObjectNumbers.map((n) => `${n} 0 R`).join(' ')
  objects.push(`2 0 obj << /Type /Pages /Kids [${kids}] /Count ${pageObjectNumbers.length} >> endobj\n`)

  for (let i = 0; i < pageStreams.length; i += 1) {
    const pageId = pageObjectNumbers[i]
    const contentId = contentObjectNumbers[i]
    const stream = pageStreams[i]
    objects.push(
      `${pageId} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> >> endobj\n`,
    )
    objects.push(`${contentId} 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream\nendobj\n`)
  }
  objects.push(`${fontRegular} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n`)
  objects.push(`${fontBold} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj\n`)

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

export function statementPdfBlob(
  account: StatementAccount,
  lines: StatementLine[],
  summary?: StatementSummary,
) {
  const bytes = buildStatementPdf(account, lines, summary)
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  return new Blob([buffer], { type: 'application/pdf' })
}

export function statementCsvBlob(
  account: StatementAccount,
  lines: StatementLine[],
  summary?: StatementSummary,
) {
  return new Blob([buildStatementCsv(account, lines, summary)], { type: 'text/csv;charset=utf-8' })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function statementEmailHtml(
  account: StatementAccount,
  lines: StatementLine[],
  summary?: StatementSummary,
) {
  const totals = summary ?? summarizeStatement(lines)
  const rows = lines
    .slice(0, 80)
    .map(
      (line) => `<tr>
      <td style="padding:8px 0;border-bottom:1px solid #eef2f8;font-size:12px;color:#555">${escape(line.when)}</td>
      <td style="padding:8px 6px;border-bottom:1px solid #eef2f8;font-size:12px;color:#111">${escape(line.description)}</td>
      <td style="padding:8px 0;border-bottom:1px solid #eef2f8;font-size:12px;text-align:right;font-weight:600;color:${line.direction === 'credit' ? '#15803d' : '#b91c1c'}">${escape(signedAmount(line))}</td>
    </tr>`,
    )
    .join('')
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
    <p style="letter-spacing:0.18em;text-transform:uppercase;font-size:11px;font-weight:700;color:#2f7bff">BUCKS</p>
    <h1 style="font-size:22px;margin:8px 0 10px">Your statement of account</h1>
    <p style="margin:0 0 8px;color:#444">Hi ${escape(account.name || 'there')}, here is your wallet statement${account.email ? ` for <strong>${escape(account.email)}</strong>` : ''}.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 18px;background:#f7f9ff;border-radius:12px">
      <tr><td style="padding:10px 14px;font-size:12px;color:#555">Opening balance</td><td style="padding:10px 14px;font-size:13px;font-weight:700;text-align:right">${escape(buMoney(totals.openingBalance))} BU</td></tr>
      <tr><td style="padding:10px 14px;font-size:12px;color:#15803d">Money in</td><td style="padding:10px 14px;font-size:13px;font-weight:700;text-align:right;color:#15803d">+${escape(buMoney(totals.totalIn))} BU</td></tr>
      <tr><td style="padding:10px 14px;font-size:12px;color:#b91c1c">Money out</td><td style="padding:10px 14px;font-size:13px;font-weight:700;text-align:right;color:#b91c1c">-${escape(buMoney(totals.totalOut))} BU</td></tr>
      <tr><td style="padding:10px 14px;font-size:12px;color:#555">Total turnover</td><td style="padding:10px 14px;font-size:13px;font-weight:700;text-align:right">${escape(buMoney(totals.turnover))} BU</td></tr>
      <tr><td style="padding:10px 14px;font-size:12px;color:#111;border-top:1px solid #e5eaf3">Closing balance</td><td style="padding:10px 14px;font-size:14px;font-weight:800;text-align:right;border-top:1px solid #e5eaf3">${escape(buMoney(totals.closingBalance))} BU</td></tr>
    </table>
    <p style="margin:0 0 16px;color:#666;font-size:13px">${totals.count} transaction${totals.count === 1 ? '' : 's'} · generated ${escape(new Date().toLocaleString('en-NG'))}</p>
    <table width="100%" cellpadding="0" cellspacing="0">${rows || '<tr><td style="padding:12px 0;color:#666">No wallet activity in this period.</td></tr>'}</table>
    <p style="color:#888;font-size:12px;margin-top:20px">1 BU = NGN 1. A PDF copy is attached. Ceremonial notes hold no cash value.</p>
  </div>`
}

function escape(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
