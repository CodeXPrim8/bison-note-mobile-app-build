import fs from 'node:fs'

function jwtish(value) {
  return value.startsWith('eyJ') && value.split('.').length === 3 && value.length > 80
}

function keyInfo(path, key) {
  if (!fs.existsSync(path)) return { missingFile: true }
  const text = fs.readFileSync(path, 'utf8')
  const match = text.match(new RegExp(`^${key}\\s*=\\s*(.*)$`, 'm'))
  const raw = match ? match[1].trim().replace(/^['"]|['"]$/g, '') : ''
  return {
    empty: !raw,
    length: raw.length,
    jwt: jwtish(raw),
  }
}

for (const file of ['.env.local', '.env']) {
  console.log(file, {
    url: keyInfo(file, 'NEXT_PUBLIC_SUPABASE_URL'),
    anon: keyInfo(file, 'NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    service: keyInfo(file, 'SUPABASE_SERVICE_ROLE_KEY'),
  })
}
