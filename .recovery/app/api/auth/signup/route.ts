import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  display_name: z.string().min(2).max(80).optional(),
  role: z.enum(['guest', 'celebrant', 'vendor', 'merchant']).optional(),
})

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json())
    const supabase = await createClient()
    const { data, error } = await supabase.auth.signUp({
      email: body.email,
      password: body.password,
      options: {
        data: {
          display_name: body.display_name ?? body.email.split('@')[0],
          role: body.role ?? 'guest',
        },
      },
    })
    if (error) throw new ApiError(400, 'SIGNUP_FAILED', error.message)
    return successResponse({ user: data.user }, 'Signed up')
  } catch (error) {
    return handleRouteError(error)
  }
}
