import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'

export const ADMIN_COOKIE = 'admin_session'

function secret() {
  const s = process.env.CRON_SECRET ?? process.env.ADMIN_PASSWORD
  if (!s) throw new Error('CRON_SECRET manquant')
  return s
}

export function signToken(expiresAt: number) {
  const payload = String(expiresAt)
  const sig = createHmac('sha256', secret()).update(payload).digest('hex')
  return `${payload}.${sig}`
}

export function verifyToken(token: string | undefined) {
  if (!token) return false
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return false
  const expected = createHmac('sha256', secret()).update(payload).digest('hex')
  if (sig.length !== expected.length) return false
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false
  return Number(payload) > Date.now()
}

export async function isAdmin() {
  const jar = await cookies()
  return verifyToken(jar.get(ADMIN_COOKIE)?.value)
}

export function checkPassword(input: string) {
  const expected = process.env.ADMIN_PASSWORD ?? ''
  if (!expected) return false
  const a = Buffer.from(input)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
