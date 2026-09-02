import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { drafts, prospects, runs, unsubscribes } from '@/lib/db/schema'
import { getSender, getTargeting } from '@/lib/settings'
import { analyzeWebsite, findEmail } from './analyze'
import { draftEmail } from './draft'
import { fetchBusinesses } from './osm'
import { computeScore, detectIssues } from './scoring'

export type RunStats = {
  sourced: number
  inserted: number
  analyzed: number
  drafted: number
  errors: number
}

/** Étape 1 : importer de nouvelles entreprises depuis OpenStreetMap. */
export async function stepSource(stats: RunStats) {
  const t = await getTargeting()
  const businesses = await fetchBusinesses(t.city, t.categories)
  stats.sourced = businesses.length

  // Ne garder que les nouvelles fiches, par lot
  const existing = await db.select({ osmId: prospects.osmId }).from(prospects)
  const known = new Set(existing.map((e) => e.osmId))
  const fresh = businesses.filter((b) => !known.has(b.osmId)).slice(0, t.batchSize)

  if (fresh.length) {
    await db
      .insert(prospects)
      .values(
        fresh.map((b) => ({
          osmId: b.osmId,
          name: b.name,
          category: b.category,
          city: t.city,
          address: b.address,
          phone: b.phone,
          website: b.website,
          email: b.email,
          emailSource: b.email ? 'osm' : null,
        })),
      )
      .onConflictDoNothing()
    stats.inserted = fresh.length
  }
}

/** Étape 2 : analyser les sites des prospects "new". */
export async function stepAnalyze(stats: RunStats) {
  const t = await getTargeting()
  const todo = await db
    .select()
    .from(prospects)
    .where(eq(prospects.status, 'new'))
    .orderBy(prospects.createdAt)
    .limit(t.analyzePerRun)

  for (const p of todo) {
    try {
      const analysis = await analyzeWebsite(p.website)
      const issues = detectIssues(analysis)

      let email = p.email
      let emailSource = p.emailSource
      if (!email && p.website && !analysis.fetchError) {
        const found = await findEmail(p.website)
        if (found) {
          email = found.email
          emailSource = found.source
        }
      }

      const score = computeScore(issues, Boolean(email))
      await db
        .update(prospects)
        .set({
          analysis,
          issues,
          score,
          email,
          emailSource,
          status: issues.length ? 'analyzed' : 'skipped',
          notes: issues.length ? p.notes : 'Aucun problème détecté',
          analyzedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(prospects.id, p.id))
      stats.analyzed++
    } catch (err) {
      stats.errors++
      await db
        .update(prospects)
        .set({ notes: `Erreur analyse: ${String(err)}`, status: 'skipped', updatedAt: new Date() })
        .where(eq(prospects.id, p.id))
    }
  }
}

/** Étape 3 : rédiger les brouillons pour les meilleurs prospects analysés avec email. */
export async function stepDraft(stats: RunStats) {
  const t = await getTargeting()
  const sender = await getSender()
  const blocked = (await db.select({ email: unsubscribes.email }).from(unsubscribes)).map((u) => u.email)

  const todo = await db
    .select()
    .from(prospects)
    .where(and(eq(prospects.status, 'analyzed'), sql`${prospects.email} IS NOT NULL`))
    .orderBy(desc(prospects.score))
    .limit(t.draftPerRun)

  for (const p of todo) {
    if (!p.email || blocked.includes(p.email) || !p.issues.length) {
      await db.update(prospects).set({ status: 'skipped', updatedAt: new Date() }).where(eq(prospects.id, p.id))
      continue
    }
    try {
      const issue = p.issues[0]
      const out = await draftEmail(p, issue, sender)
      await db.insert(drafts).values({
        prospectId: p.id,
        subject: out.subject,
        body: out.body,
        issueKey: issue.key,
      })
      await db.update(prospects).set({ status: 'drafted', updatedAt: new Date() }).where(eq(prospects.id, p.id))
      stats.drafted++
    } catch (err) {
      stats.errors++
      await db
        .update(prospects)
        .set({ notes: `Erreur rédaction: ${String(err)}`, updatedAt: new Date() })
        .where(eq(prospects.id, p.id))
    }
  }
}

export async function runPipeline(trigger: 'cron' | 'manual', steps: Array<'source' | 'analyze' | 'draft'> = ['source', 'analyze', 'draft']) {
  const [run] = await db.insert(runs).values({ trigger }).returning()
  const stats: RunStats = { sourced: 0, inserted: 0, analyzed: 0, drafted: 0, errors: 0 }
  let error: string | null = null

  try {
    if (steps.includes('source')) await stepSource(stats)
    if (steps.includes('analyze')) await stepAnalyze(stats)
    if (steps.includes('draft')) await stepDraft(stats)
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  await db
    .update(runs)
    .set({ finishedAt: new Date(), stats, error })
    .where(eq(runs.id, run.id))

  return { runId: run.id, stats, error }
}

/** Regénère le brouillon d'un prospect précis. */
export async function regenerateDraft(prospectId: number) {
  const [p] = await db.select().from(prospects).where(eq(prospects.id, prospectId)).limit(1)
  if (!p || !p.issues.length) throw new Error('Prospect sans problème détecté')
  const sender = await getSender()
  const out = await draftEmail(p, p.issues[0], sender)
  await db.delete(drafts).where(and(eq(drafts.prospectId, p.id), eq(drafts.status, 'draft')))
  await db.insert(drafts).values({ prospectId: p.id, subject: out.subject, body: out.body, issueKey: p.issues[0].key })
  await db.update(prospects).set({ status: 'drafted', updatedAt: new Date() }).where(eq(prospects.id, p.id))
}
