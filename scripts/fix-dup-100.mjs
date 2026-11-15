import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

const env = fs.readFileSync('.env.local', 'utf8')
function get(k) {
  const m = env.match(new RegExp(`^${k}=(.*)$`, 'm'))
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''
}

const db = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})
const userId = '18b3e7e2-5a9d-4686-a233-d6555a0c6036'
const ref = 'FIX_DUP_100004261114013629177413966268'

const has = await db.rpc('bu_wallet_has_reference', { p_user_id: userId, p_reference: ref })
if (!has.error && has.data) {
  console.log(JSON.stringify({ ok: true, already_fixed: true }))
  process.exit(0)
}

const move = await db.rpc('bu_move_wallet', {
  p_user_id: userId,
  p_naira: 100,
  p_direction: 'debit',
  p_type: 'refund',
  p_description: 'Reverse duplicate bank top-up',
  p_metadata: { reference: ref, move_id: ref, kind: 'correction', channel: 'dedicated_nuban' },
})
const wallet = await db.rpc('bu_get_wallet', { p_user_id: userId })
console.log(JSON.stringify({ move: move.data ?? move.error?.message, wallet: wallet.data }, null, 2))
