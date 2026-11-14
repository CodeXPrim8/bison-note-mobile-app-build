import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

const env = fs.readFileSync('.env.local', 'utf8')
function get(k) {
  const m = env.match(new RegExp(`^${k}=(.*)$`, 'm'))
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''
}

const paystackKey = get('PAYSTACK_SECRET_KEY')
const supabaseUrl = get('NEXT_PUBLIC_SUPABASE_URL')
const serviceKey = get('SUPABASE_SERVICE_ROLE_KEY')
const anonKey = get('NEXT_PUBLIC_SUPABASE_ANON_KEY')
const dbKey = serviceKey && serviceKey.startsWith('eyJ') ? serviceKey : anonKey
const reference = process.argv[2] || '100004261114013216177413611910'

if (!paystackKey || !supabaseUrl || !dbKey) {
  console.log('MISSING_ENV')
  process.exit(1)
}

const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
  headers: { Authorization: `Bearer ${paystackKey}` },
})
const verified = await verifyRes.json()
if (!verified.status || verified.data?.status !== 'success') {
  console.log(JSON.stringify({ ok: false, stage: 'verify', verified }, null, 2))
  process.exit(1)
}

const data = verified.data
const amountKobo = Number(data.amount || 0)
const creditNaira = amountKobo / 100
const accountNumber = String(
  data.authorization?.receiver_bank_account_number || data.authorization?.account_number || '',
).replace(/\D/g, '')
const customerCode = String(data.customer?.customer_code || '')

const db = createClient(supabaseUrl, dbKey, { auth: { persistSession: false, autoRefreshToken: false } })

let userId = null
const byAccount = await db.rpc('bu_find_virtual_account', {
  p_account_number: accountNumber || null,
  p_customer_code: customerCode || null,
})
if (byAccount.error) {
  console.log(JSON.stringify({ ok: false, stage: 'find_va', error: byAccount.error.message, accountNumber, customerCode }, null, 2))
} else if (byAccount.data?.user_id) {
  userId = byAccount.data.user_id
}

if (!userId) {
  console.log(
    JSON.stringify(
      {
        ok: false,
        stage: 'no_user',
        accountNumber,
        customerCode,
        email: data.customer?.email,
        amount: creditNaira,
        channel: data.channel,
        auth_channel: data.authorization?.channel,
        va: byAccount.data,
      },
      null,
      2,
    ),
  )
  process.exit(1)
}

const prior = await db.from('bu_wallet_ledger').select('id').eq('user_id', userId).eq('reference', reference).limit(1)
if (prior.data?.length) {
  console.log(JSON.stringify({ ok: true, already_credited: true, userId, reference, creditNaira }, null, 2))
  process.exit(0)
}

const move = await db.rpc('bu_move_wallet', {
  p_user_id: userId,
  p_naira: creditNaira,
  p_direction: 'credit',
  p_type: 'deposit',
  p_description: 'Bank transfer top-up',
  p_metadata: {
    reference,
    move_id: reference,
    kind: 'deposit',
    channel: 'dedicated_nuban',
    account_number: accountNumber || null,
    customer_code: customerCode || null,
    paystack_amount_kobo: amountKobo,
    manual_credit: true,
  },
})

if (move.error) {
  console.log(JSON.stringify({ ok: false, stage: 'move', error: move.error.message, userId, creditNaira }, null, 2))
  process.exit(1)
}

console.log(JSON.stringify({ ok: true, credited: true, userId, reference, creditNaira, accountNumber, customerCode }, null, 2))
