import fs from 'fs'

const env = fs.readFileSync('.env.local', 'utf8')
function get(k) {
  const m = env.match(new RegExp(`^${k}=(.*)$`, 'm'))
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''
}

const res = await fetch('https://api.paystack.co/balance', {
  headers: { Authorization: `Bearer ${get('PAYSTACK_SECRET_KEY')}` },
})
const json = await res.json()
const rows = (json.data || []).map((row) => ({
  currency: row.currency,
  naira: Number(row.balance || 0) / 100,
}))
console.log(JSON.stringify({ ok: json.status, message: json.message, rows }, null, 2))
