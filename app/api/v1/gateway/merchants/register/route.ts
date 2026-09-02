import { randomBytes } from 'crypto'
import { registerMerchantSchema } from '@/lib/schemas/merchant'
import { tryCreateAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/api/session'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { hashSecretKey } from '@/lib/api/gateway-auth'
import { encryptBankAccount } from '@/lib/crypto/bank'
import { uniquePublicKey, uniqueSecretKey } from '@/lib/tickets/ids'
import { isPaystackConfigured } from '@/lib/env'
import { createSubaccount } from '@/lib/payments/paystack'
import { resolveLiveCelebrantId } from '@/lib/events/live'
import { readBuSession } from '@/lib/auth/bu-session'
import { gatewayTableError } from '@/lib/gateway/merchant'
import { GATEWAY_SQL_HINT } from '@/lib/gateway/sql'

export async function POST(request: Request) {
  try {
    const json: unknown = await request.json()
    const body = registerMerchantSchema.parse(json)
    const user = await requireUser()
    const session = await readBuSession()
    const liveUserId = await resolveLiveCelebrantId({
      id: user.id,
      email: user.email ?? body.email,
      phone: session?.phone_e164 || session?.phone || ('phone' in user ? String(user.phone || '') : null),
    })
    if (!liveUserId) {
      throw new ApiError(
        403,
        'NOT_LIVE_USER',
        'Sign in with your ɃU ID (phone number) and PIN so these keys can sell your live events.',
      )
    }

    const live = process.env.NODE_ENV === 'production'
    const publicKey = uniquePublicKey(live)
    const secretKey = uniqueSecretKey(live)
    const secretHash = await hashSecretKey(secretKey)
    const webhookSecret = randomBytes(24).toString('hex')

    let subaccount: string | null = null
    if (isPaystackConfigured() && body.bank_account_number && body.bank_code) {
      try {
        const created = await createSubaccount({
          businessName: body.business_name,
          settlementBank: body.bank_code,
          accountNumber: body.bank_account_number,
          percentageCharge: 4,
        })
        subaccount = created.subaccount_code
      } catch (error) {
        console.error('subaccount create failed', error)
      }
    }

    const admin = tryCreateAdminClient()
    if (!admin) {
      throw new ApiError(503, 'GATEWAY_UNAVAILABLE', GATEWAY_SQL_HINT)
    }

    const { data, error } = await admin
      .from('gateway_merchants')
      .insert({
        user_id: liveUserId,
        business_name: body.business_name,
        email: body.email,
        public_key: publicKey,
        secret_key_prefix: secretKey.slice(0, 20),
        secret_key_hash: secretHash,
        webhook_url: body.webhook_url ?? null,
        webhook_secret: webhookSecret,
        bank_account_name: body.bank_account_name ?? null,
        bank_account_number_encrypted: body.bank_account_number
          ? encryptBankAccount(body.bank_account_number)
          : null,
        bank_code: body.bank_code ?? null,
        paystack_subaccount_code: subaccount,
        cors_origins: body.cors_origins,
        settlement_schedule: body.settlement_schedule,
        commission_rate: 0.04,
        live_mode: live,
      })
      .select('id, public_key, business_name, email, webhook_url')
      .single()

    if (error || !data) {
      gatewayTableError(error)
      throw new ApiError(500, 'REGISTER_FAILED', error?.message ?? 'Could not create Gateway keys')
    }

    return successResponse(
      {
        merchant_id: data.id,
        public_key: publicKey,
        secret_key: secretKey,
        webhook_secret: webhookSecret,
        live_mode: live,
        note: 'Store secret_key now. It is shown once. Put it on your server only — never in browser JavaScript.',
      },
      'Merchant registered',
      201,
    )
  } catch (error) {
    return handleRouteError(error)
  }
}
