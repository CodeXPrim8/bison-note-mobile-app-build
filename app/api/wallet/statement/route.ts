import { z } from 'zod'
import { Resend } from 'resend'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { getProfile, requireUser } from '@/lib/api/session'
import { readBuSession } from '@/lib/auth/bu-session'
import { contactEmail } from '@/lib/auth/pin'
import { fetchLiveWallet, resolveLiveCelebrantId } from '@/lib/events/live'
import { getResendConfig, isResendConfigured } from '@/lib/env'
import { formatEventDateTime } from '@/lib/datetime'
import { listWalletHistory } from '@/lib/wallet/history'
import { historyLabel, walletDirection } from '@/lib/wallet/direction'
import {
  buildStatementPdf,
  statementEmailHtml,
  statementFileStamp,
  summarizeStatement,
  type StatementLine,
} from '@/lib/wallet/statement'

const bodySchema = z.object({
  email: z.string().email().optional(),
  limit: z.number().int().min(10).max(200).optional(),
})

function metaOf(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  return {}
}

function toStatementLine(tx: Record<string, unknown>): StatementLine {
  const type = String(tx.type ?? tx.kind ?? 'deposit')
  const meta = metaOf(tx.metadata)
  const rawDescription = String(tx.description ?? meta.description ?? type)
  const direction =
    tx.direction === 'credit' || tx.direction === 'debit'
      ? tx.direction
      : walletDirection({
          type,
          description: rawDescription,
          metadata: tx.metadata,
          direction: typeof tx.direction === 'string' ? tx.direction : null,
          amount: Number(tx.amount ?? 0),
        })
  const createdAt = new Date(String(tx.created_at ?? '')).getTime() || 0
  return {
    when: tx.created_at ? formatEventDateTime(String(tx.created_at)) : '',
    createdAt,
    description: historyLabel({ type, description: rawDescription, direction }),
    direction,
    amountNaira: Math.abs(Number(tx.amount ?? 0)),
    status: String(tx.status ?? 'completed'),
    reference: typeof tx.reference === 'string' ? tx.reference : null,
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = bodySchema.parse(await request.json().catch(() => ({})))
    if (!isResendConfigured()) {
      throw new ApiError(503, 'EMAIL_UNAVAILABLE', 'Email delivery is not configured right now.')
    }

    const session = await readBuSession()
    const profile = await getProfile(user.id)
    const liveId =
      (await resolveLiveCelebrantId({
        id: user.id,
        email: user.email,
        phone: session?.phone_e164 || session?.phone || profile?.phone_e164 || profile?.phone || null,
      })) || user.id

    const accountEmail =
      contactEmail(body.email) ||
      contactEmail(profile?.email) ||
      contactEmail(session?.email) ||
      contactEmail(user.email)
    if (!accountEmail) {
      throw new ApiError(
        400,
        'EMAIL_REQUIRED',
        'Add an email in Settings first, or enter one to receive this statement.',
      )
    }

    const limit = body.limit ?? 100
    const [history, wallet] = await Promise.all([
      listWalletHistory(liveId, limit, { full: true }),
      fetchLiveWallet(liveId),
    ])
    const lines = (history as Array<Record<string, unknown>>)
      .map(toStatementLine)
      .sort((a, b) => b.createdAt - a.createdAt)
    const closing = Number(wallet?.naira_available ?? wallet?.bu_balance ?? 0) || 0
    const summary = summarizeStatement(lines, closing)

    const name =
      String(profile?.display_name || profile?.username || session?.display_name || 'Bucks member').trim() ||
      'Bucks member'
    const phone = String(profile?.phone_e164 || profile?.phone || session?.phone_e164 || session?.phone || '').trim()
    const account = { name, email: accountEmail, phone, userId: liveId }
    const pdf = buildStatementPdf(account, lines, summary)
    const filename = `bucks-statement-${statementFileStamp()}.pdf`

    const { apiKey, from } = getResendConfig()
    const resend = new Resend(apiKey)
    const result = await resend.emails.send({
      from: from || 'Bucks <onboarding@resend.dev>',
      to: accountEmail,
      subject: `Your Bucks statement · ${statementFileStamp()}`,
      html: statementEmailHtml(account, lines, summary),
      attachments: [
        {
          filename,
          content: Buffer.from(pdf),
        },
      ],
    })

    if (result.error) {
      throw new ApiError(502, 'EMAIL_FAILED', result.error.message || 'Could not send statement email.')
    }

    return successResponse(
      {
        emailed: true,
        to: accountEmail,
        count: lines.length,
        filename,
      },
      `Statement sent to ${accountEmail}`,
    )
  } catch (error) {
    return handleRouteError(error)
  }
}
