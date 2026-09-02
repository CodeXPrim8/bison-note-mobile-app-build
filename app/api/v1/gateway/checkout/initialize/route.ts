import { NextRequest } from 'next/server'
import { authenticateGatewayKey } from '@/lib/api/gateway-auth'
import { handleRouteError } from '@/lib/api/errors'
import { gatewayOptions, runGatewayInitialize } from '@/lib/gateway/initialize'

export async function OPTIONS(request: NextRequest) {
  return gatewayOptions(request)
}

export async function POST(request: NextRequest) {
  try {
    const merchant = await authenticateGatewayKey(request)
    return await runGatewayInitialize(request, merchant)
  } catch (error) {
    return handleRouteError(error)
  }
}
