import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { requireAdmin } from '@/lib/admin/session'
import { writeAdminAudit } from '@/lib/admin/platform'
import { listAdminUsers } from '@/lib/admin/users'
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
    const existing = await db.from('users').select('id').eq('phone_number', phone).maybeSingle()
    if (existing.data) throw new ApiError(409, 'BU_ID_TAKEN', 'That ɃU ID is already registered')
    const pin_hash = await bcrypt.hash(body.pin, 10)
    const insert = await db
      .from('users')
      .insert({
        id: crypto.randomUUID(),
        phone_number: phone,
        first_name: body.first_name.trim(),
        last_name: body.last_name?.trim() || null,
        account_name: [body.first_name.trim(), body.last_name?.trim()].filter(Boolean).join(' '),
        email: body.email || null,
        role: body.role,
        pin_hash,
      })
      .select('id, email, phone_number, first_name, last_name, account_name, role')
      .maybeSingle()
    if (insert.error || !insert.data) {
      throw new ApiError(500, 'CREATE_FAILED', insert.error?.message ?? 'Could not create user')
    }
    const id = String((insert.data as { id: string }).id)
    await db.from('wallets').upsert({ user_id: id, bu_balance: 0, naira_available: 0 }, { onConflict: 'user_id' })
    await writeAdminAudit(liveId, 'user.create', id, { phone, role: body.role })
    return successResponse({ user: insert.data }, 'User created', 201)
  } catch (error) {
    return handleRouteError(error)
  }
}
