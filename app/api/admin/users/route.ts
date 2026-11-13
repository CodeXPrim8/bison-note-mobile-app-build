import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { requireAdmin } from '@/lib/admin/session'
import { writeAdminAudit } from '@/lib/admin/platform'
import { listAdminUsers } from '@/lib/admin/users'
import { ensureLiveBuUser } from '@/lib/auth/live-user'
import { normalizePhone } from '@/lib/phone'
import { pinSchema } from '@/lib/auth/pin'

const createSchema = z.object({
  phone: z.string().min(7),
  first_name: z.string().min(1).max(80),
  last_name: z.string().max(80).optional(),
  email: z.string().email().optional().or(z.literal('')),
  role: z.enum(['guest', 'celebrant', 'vendor', 'merchant', 'organizer']).default('guest'),
  pin: pinSchema,
})

export async function GET(request: Request) {
  try {
    const { db } = await requireAdmin()
    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.trim() ?? ''
    const role = url.searchParams.get('role')?.trim() ?? ''
    const limit = Number(url.searchParams.get('limit') ?? 500)
    const offset = Number(url.searchParams.get('offset') ?? 0)
    const listed = await listAdminUsers(db, {
      q,
      role: ['guest', 'organizer', 'affiliate'].includes(role) ? role : '',
      limit: Number.isFinite(limit) ? limit : 500,
      offset: Number.isFinite(offset) ? offset : 0,
    })
    return successResponse({
      query: q,
      role,
      total: listed.total,
      users: listed.users,
    })
  } catch (error) {
    return handleRouteError(error)
  }
}

export async function POST(request: Request) {
  try {
    const { db, liveId } = await requireAdmin()
    const body = createSchema.parse(await request.json())
    const phone = normalizePhone(body.phone)
    if (!phone) throw new ApiError(400, 'INVALID_BU_ID', 'Enter a valid ɃU ID (phone number)')
    const pin_hash = await bcrypt.hash(body.pin, 10)
    const displayName = [body.first_name.trim(), body.last_name?.trim()].filter(Boolean).join(' ')
    const synced = await ensureLiveBuUser({
      id: crypto.randomUUID(),
      displayName,
      phone,
      email: body.email || null,
      pinHash: pin_hash,
      role: body.role,
    })
    if (!synced.ok) {
      throw new ApiError(
        500,
        'CREATE_FAILED',
        synced.reason.includes('row-level security')
          ? 'Could not create user. Run supabase/migrations/0028_ensure_live_user_rpc.sql in the live Supabase SQL editor, or set SUPABASE_SERVICE_ROLE_KEY in .env.local.'
          : synced.reason,
      )
    }
    const { data: created } = await db
      .from('users')
      .select('id, email, phone_number, first_name, last_name, account_name, role')
      .eq('id', synced.userId)
      .maybeSingle()
    await writeAdminAudit(liveId, 'user.create', synced.userId, { phone, role: body.role })
    return successResponse({ user: created ?? { id: synced.userId, phone_number: phone } }, 'User created', 201)
  } catch (error) {
    return handleRouteError(error)
  }
}
