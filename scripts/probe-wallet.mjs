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
const id = '18b3e7e2-5a9d-4686-a233-d6555a0c6036'
const wallet = await db.rpc('bu_get_wallet', { p_user_id: id })
const move = await db.rpc('bu_move_wallet', {
  p_user_id: id,
  p_naira: 100,
  p_direction: 'debit',
  p_type: 'withdrawal',
  p_description: 'probe',
  p_metadata: { probe: true, move_id: `probe-${Date.now()}` },
})
console.log(JSON.stringify({ wallet: wallet.data ?? wallet.error, move: move.data ?? move.error }, null, 2))
if (move.data?.ok) {
  await db.rpc('bu_move_wallet', {
    p_user_id: id,
    p_naira: 100,
    p_direction: 'credit',
    p_type: 'refund',
    p_description: 'probe rollback',
    p_metadata: { probe: true, move_id: `probe-rb-${Date.now()}` },
  })
}
