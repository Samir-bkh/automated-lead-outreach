'use server'

import { and, desc, eq, sql } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { ADMIN_COOKIE, checkPassword, isAdmin, signToken } from '@/lib/admin-auth'
import { db } from '@/lib/db'
import { drafts, prospects, runs, unsubscribes, type ProspectStatus } from '@/lib/db/schema'
import { regenerateDraft, runPipeline } from '@/lib/pipeline/run'
import { setSetting, type Sender, type Targeting } from '@/lib/settings'

async function requireAdmin() {
  if (!(await isAdmin())) throw new Error('Non autorisé')
}

export async function login(_: unknown, formData: FormData) {
  const password = String(formData.get('password') ?? '')
  if (!checkPassword(password)) return { error: 'Mot de passe incorrect' }
  const jar = await cookies()
  const expires = Date.now() + 1000 * 60 * 60 * 24 * 14
  jar.set(ADMIN_COOKIE, signToken(expires), {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'development' ? 'none' : 'lax',
    secure: true,
    expires: new Date(expires),
    path: '/',
  })
  redirect('/admin')
}

export async function logout() {
  const jar = await cookies()
  jar.delete(ADMIN_COOKIE)
  redirect('/admin/login')
}

export async function triggerPipeline(steps: Array<'source' | 'analyze' | 'draft'>) {
  await requireAdmin()
  const result = await runPipeline('manual', steps)
  revalidatePath('/admin')
  return result
}

export async function setProspectStatus(id: number, status: ProspectStatus) {
  await requireAdmin()
  await db.update(prospects).set({ status, updatedAt: new Date() }).where(eq(prospects.id, id))
  if (status === 'sent') {
    await db
      .update(drafts)
      .set({ status: 'sent', sentAt: new Date() })
      .where(and(eq(drafts.prospectId, id), eq(drafts.status, 'draft')))
  }
  revalidatePath('/admin')
}

export async function updateDraft(draftId: number, subject: string, body: string) {
  await requireAdmin()
  await db.update(drafts).set({ subject, body }).where(eq(drafts.id, draftId))
  revalidatePath('/admin')
}

export async function regenerate(prospectId: number) {
  await requireAdmin()
  await regenerateDraft(prospectId)
  revalidatePath('/admin')
}

export async function updateProspectEmail(id: number, email: string) {
  await requireAdmin()
  const clean = email.trim().toLowerCase()
  await db
    .update(prospects)
    .set({ email: clean || null, emailSource: clean ? 'manual' : null, updatedAt: new Date() })
    .where(eq(prospects.id, id))
  revalidatePath('/admin')
}

export async function saveTargeting(t: Targeting) {
  await requireAdmin()
  await setSetting('targeting', t)
  revalidatePath('/admin')
}

export async function saveSender(s: Sender) {
  await requireAdmin()
  await setSetting('sender', s)
  revalidatePath('/admin')
}

export async function addUnsubscribe(email: string) {
  const clean = email.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) return { error: 'Adresse invalide' }
  await db.insert(unsubscribes).values({ email: clean }).onConflictDoNothing()
  await db
    .update(prospects)
    .set({ status: 'rejected', notes: 'Désinscrit', updatedAt: new Date() })
    .where(eq(prospects.email, clean))
  return { ok: true }
}

export async function getDashboardData() {
  await requireAdmin()
  const [list, lastRuns, counts] = await Promise.all([
    db.select().from(prospects).orderBy(desc(prospects.score), desc(prospects.createdAt)).limit(300),
    db.select().from(runs).orderBy(desc(runs.startedAt)).limit(5),
    db
      .select({ status: prospects.status, n: sql<number>`count(*)::int` })
      .from(prospects)
      .groupBy(prospects.status),
  ])
  const ids = list.map((p) => p.id)
  const draftRows = ids.length
    ? await db.select().from(drafts).where(sql`${drafts.prospectId} = ANY(${ids})`).orderBy(desc(drafts.createdAt))
    : []
  const draftByProspect = new Map<number, (typeof draftRows)[number]>()
  for (const d of draftRows) if (!draftByProspect.has(d.prospectId)) draftByProspect.set(d.prospectId, d)

  return {
    prospects: list.map((p) => ({ ...p, draft: draftByProspect.get(p.id) ?? null })),
    runs: lastRuns,
    counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) as Record<string, number>,
  }
}
