import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json())
    const supabase = await createClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      email: body.email,
      password: body.password,
    })
    if (error) throw new ApiError(401, 'LOGIN_FAILED', error.message)
    return successResponse({ user: data.user }, 'Signed in')
  } catch (error) {
    return handleRouteError(error)
  }
}
