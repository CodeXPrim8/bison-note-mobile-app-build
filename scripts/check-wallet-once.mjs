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
const wallet = await db.rpc('bu_get_wallet', { p_user_id: userId })
const hist = await db.rpc('bu_list_user_wallet_history', { p_user_id: userId, p_limit: 10 })
const ledger = await db.rpc('bu_find_virtual_account', { p_account_number: '9819403547', p_customer_code: null })
console.log(
  JSON.stringify(
    {
      wallet: wallet.data ?? wallet.error?.message,
      history: hist.data ?? hist.error?.message,
      va: ledger.data ?? ledger.error?.message,
    },
    null,
    2,
  ),
)
