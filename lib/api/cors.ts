export function corsHeaders(origin: string | null, allowed: string[] | null | undefined): Record<string, string> {
  if (!origin || !allowed?.length) return {}
  const ok = allowed.includes('*') || allowed.includes(origin)
  if (!ok) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    Vary: 'Origin',
  }
}

export function gatewayPreflight(request: Request, allowed: string[] | null | undefined): Response | null {
  if (request.method !== 'OPTIONS') return null
  const headers = corsHeaders(request.headers.get('origin'), allowed?.length ? allowed : ['*'])
  return new Response(null, { status: 204, headers })
}
