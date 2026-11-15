import fs from 'fs'

const env = fs.readFileSync('.env.local', 'utf8')
function get(k) {
  const m = env.match(new RegExp(`^${k}=(.*)$`, 'm'))
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''
}

const key = get('PAYSTACK_SECRET_KEY')
const res = await fetch('https://api.paystack.co/transaction?perPage=15', {
  headers: { Authorization: `Bearer ${key}` },
})
const json = await res.json()
const rows = (json.data || [])
  .filter((t) => t.channel === 'dedicated_nuban' || t.authorization?.channel === 'dedicated_nuban')
  .map((t) => ({
    ref: t.reference,
    status: t.status,
    amount: t.amount,
    naira: t.amount / 100,
    paid_at: t.paid_at,
    customer_code: t.customer?.customer_code,
    receiver: t.authorization?.receiver_bank_account_number || t.authorization?.account_number,
  }))
console.log(JSON.stringify(rows, null, 2))
