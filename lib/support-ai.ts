import { optionalEnv } from '@/lib/env'
import type { SupportMessage } from '@/lib/support-chat'

const HAND_OFF =
  'Customer care can still reply here if you need a person. Leave this chat open.'

function faqReply(text: string): string | null {
  const q = text.toLowerCase()

  if (/^(hi|hello|hey|good\s*(morning|afternoon|evening)|howdy)\b/.test(q.trim())) {
    return `Hello — I’m Ƀucks Assist. Ask about wallet, bank send, fees, tickets, or PIN. ${HAND_OFF}`
  }

  if (/bank send|send to bank|withdraw|payout|paystack|squad|paused transfer|automatic bank|third party/.test(q)) {
    return [
      'Bank sends go through Paystack first. If Paystack has paused transfers on the business account, the app tries Squad next.',
      'Squad can only pay out when the Squad payout wallet has been funded. Until Paystack lifts the pause or Squad is funded, bank sends will fail and your ɃU is returned.',
      HAND_OFF,
    ].join(' ')
  }

  if (/pay.?in|fund|top.?up|virtual account|dva|credit.*wallet|how.*(add|put).*money/.test(q)) {
    return [
      'To add ɃU, open Buy / Fund and transfer into your funding account.',
      'Under ₦10,000 is credited in full. From ₦10,000 the pay-in fee is ₦25 up to ₦20,000, then 0.3% up to ₦150.',
      HAND_OFF,
    ].join(' ')
  }

  if (/fee|charge|stamp duty|how much/.test(q) && /send|bank|out|transfer|withdraw/.test(q)) {
    return [
      'When you send ɃU to another bank, the receiver gets the full face amount. You pay the transfer fee + stamp duty (₦50 from ₦10,000) + ₦25 platform fee on top.',
      'Typical total charge: ₦35 (≤₦5,000), ₦50 (₦5,001–₦9,999), ₦100 (₦10,000–₦50,000), ₦125 (above ₦50,000).',
      HAND_OFF,
    ].join(' ')
  }

  if (/\bpin\b|forgot pin|reset pin|transaction pin/.test(q)) {
    return `Use Forgot PIN on the sign-in screen if you need a reset code by email. Keep your transaction PIN private. ${HAND_OFF}`
  }

  if (/ticket|event|check.?in|scan/.test(q)) {
    return `Tickets live under Tickets in the app. Open the event ticket QR for check-in. If a purchase did not show up, tell us the event name and time. ${HAND_OFF}`
  }

  if (/insufficient|balance|how much.*(have|left)/.test(q)) {
    return `Your Home balance is your spendable ɃU (1 ɃU = ₦1). Locked gifts are held until you spend them with a matching vendor. ${HAND_OFF}`
  }

  return null
}

async function openAiReply(userText: string, history: SupportMessage[]): Promise<string | null> {
  const key = optionalEnv('OPENAI_API_KEY')
  if (!key) return null
  const model = optionalEnv('OPENAI_SUPPORT_MODEL') || 'gpt-4o-mini'
  const recent = history.slice(-8).map((message) => ({
    role: message.from === 'user' ? ('user' as const) : ('assistant' as const),
    content: message.body,
  }))
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: 280,
        messages: [
          {
            role: 'system',
            content: [
              'You are Ƀucks Assist, the in-app support helper for Ƀucks (1 ɃU = ₦1).',
              'Be brief, clear, and accurate. Do not invent account balances, transfer statuses, or refunds.',
              'If money movement is stuck because Paystack paused third-party payouts, explain that Squad needs wallet funding or Paystack must lift the pause.',
              'Always end by saying customer care can still reply in this chat.',
              'Never ask for PIN, BVN, OTP, or full card numbers.',
            ].join(' '),
          },
          ...recent,
          { role: 'user', content: userText },
        ],
      }),
    })
    const json = (await response.json().catch(() => ({}))) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const text = json.choices?.[0]?.message?.content?.trim()
    return text ? text.slice(0, 1800) : null
  } catch {
    return null
  }
}

/** Instant reply before a human Super Admin joins the thread. */
export async function draftSupportAiReply(
  userText: string,
  history: SupportMessage[],
): Promise<string> {
  const fromModel = await openAiReply(userText, history)
  if (fromModel) return fromModel
  const fromFaq = faqReply(userText)
  if (fromFaq) return fromFaq
  return [
    'Thanks — I’ve noted your message.',
    'While you wait, check Home for your balance and History for the latest move.',
    HAND_OFF,
  ].join(' ')
}
