import { createClient } from '@/lib/supabase/server'
import { ApiError } from '@/lib/api/errors'
import { isSupabaseConfigured } from '@/lib/env'
import type { Profile } from '@/lib/types/database'
import { profileFromBuSession, readBuSession } from '@/lib/auth/bu-session'
import { contactEmail } from '@/lib/auth/pin'
import { createDataClient } from '@/lib/supabase/data'
import { isOwnerSuperAdmin } from '@/lib/account/roles'

export async function getSessionUser() {
  const legacy = await readBuSession()
  if (legacy) {
    return {
      id: legacy.id,
      email: legacy.email ?? undefined,
      phone: legacy.phone ?? undefined,
      phone_e164: legacy.phone_e164 ?? undefined,
    }
  }
  if (!isSupabaseConfigured()) return null
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  return data.user
}

export async function requireUser() {
  const user = await getSessionUser()
  if (!user) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Sign in required')
  }
  return user
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const legacy = await readBuSession()
  let profile: Profile | null = null
  if (legacy && legacy.id === userId) {
    profile = profileFromBuSession(legacy)
  }
  if (isSupabaseConfigured()) {
    const supabase = await createClient()
    const { data } = await supabase
      .from('profiles')
      .select('id, role, display_name, username, phone, phone_e164, email, avatar_url, created_at, updated_at')
      .eq('id', userId)
      .maybeSingle()
    if (data) profile = { ...(profile ?? (data as Profile)), ...(data as Profile) }
    try {
      const live = await createDataClient()
        .from('users')
        .select('email, phone_number, first_name, last_name, account_name, role')
        .eq('id', userId)
        .maybeSingle()
      const row = live.data as Record<string, unknown> | null
      const liveRole = asOptionalString(row?.role)
      const phone = asOptionalString(row?.phone_number) ?? profile?.phone_e164 ?? profile?.phone ?? legacy?.phone_e164 ?? legacy?.phone
      const resolvedRole: Profile['role'] | null = isOwnerSuperAdmin(userId, phone)
        ? 'super_admin'
        : liveRole === 'guest' ||
            liveRole === 'celebrant' ||
            liveRole === 'vendor' ||
            liveRole === 'merchant' ||
            liveRole === 'organizer' ||
            liveRole === 'admin'
          ? liveRole
          : liveRole === 'superadmin' || liveRole === 'super_admin'
            ? 'guest'
            : null
      if (row && profile) {
        profile = {
          ...profile,
          email: contactEmail(asOptionalString(row.email)) ?? contactEmail(profile.email),
          phone: asOptionalString(row.phone_number) ?? profile.phone,
          role: resolvedRole ?? profile.role,
        }
      } else if (row && !profile) {
        const display =
          [asOptionalString(row.first_name), asOptionalString(row.last_name)].filter(Boolean).join(' ').trim() ||
          asOptionalString(row.account_name) ||
          'ɃU member'
        const now = new Date().toISOString()
        profile = {
          id: userId,
          role: resolvedRole ?? 'guest',
          display_name: display,
          username: null,
          phone: asOptionalString(row.phone_number),
          phone_e164: asOptionalString(row.phone_number),
          email: contactEmail(asOptionalString(row.email)),
          avatar_url: null,
          created_at: now,
          updated_at: now,
        }
      }
    } catch {
      // Live users table is optional for website-only accounts.
    }
  }
  if (profile) {
    const phone = profile.phone_e164 || profile.phone || legacy?.phone_e164 || legacy?.phone
    profile = {
      ...profile,
      email: contactEmail(profile.email),
      role: isOwnerSuperAdmin(userId, phone) ? 'super_admin' : profile.role === 'super_admin' ? 'guest' : profile.role,
    }
  }
  return profile
}

function asOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length ? value : null
}

export async function requireOrganizer() {
  const user = await requireUser()
  const profile = await getProfile(user.id)
  return { user, profile }
}
