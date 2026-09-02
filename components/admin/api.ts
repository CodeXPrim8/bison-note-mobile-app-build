export async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const json = await res.json()
  if (res.status === 401) {
    window.location.assign('/login?next=/admin')
    throw new Error('Sign in required')
  }
  if (!json.status) throw new Error(json.message ?? 'Request failed')
  return json.data as T
}
