export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) }, ...init })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
