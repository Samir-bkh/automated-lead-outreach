import {
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

export type IssueKey =
  | 'no_website'
  | 'no_https'
  | 'not_mobile'
  | 'slow'
  | 'no_contact'
  | 'no_legal'
  | 'tracking_no_consent'
  | 'outdated'
  | 'seo_missing'
  | 'site_down'

export type Issue = {
  key: IssueKey
  weight: number
  title: string
  evidence: string
}

export type Analysis = {
  url: string | null
  finalUrl?: string
  httpStatus?: number
  https?: boolean
  hasViewport?: boolean
  hasContactForm?: boolean
  hasMailto?: boolean
  hasTel?: boolean
  hasLegalPage?: boolean
  hasTracking?: boolean
  hasCookieBanner?: boolean
  copyrightYear?: number | null
  generator?: string | null
  jqueryVersion?: string | null
  title?: string | null
  metaDescription?: string | null
  psiMobileScore?: number | null
  psiLcpMs?: number | null
  fetchError?: string
}

export type ProspectStatus =
  | 'new'
  | 'analyzed'
  | 'drafted'
  | 'approved'
  | 'sent'
  | 'replied'
  | 'won'
  | 'rejected'
  | 'skipped'

export const prospects = pgTable('prospects', {
  id: serial('id').primaryKey(),
  osmId: text('osm_id').unique(),
  name: text('name').notNull(),
  category: text('category'),
  city: text('city'),
  address: text('address'),
  phone: text('phone'),
  website: text('website'),
  email: text('email'),
  emailSource: text('email_source'),
  status: text('status').$type<ProspectStatus>().notNull().default('new'),
  score: integer('score').notNull().default(0),
  issues: jsonb('issues').$type<Issue[]>().notNull().default([]),
  analysis: jsonb('analysis').$type<Analysis>(),
  analyzedAt: timestamp('analyzed_at', { withTimezone: true }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const drafts = pgTable('drafts', {
  id: serial('id').primaryKey(),
  prospectId: integer('prospect_id').notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  issueKey: text('issue_key'),
  status: text('status').notNull().default('draft'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const unsubscribes = pgTable('unsubscribes', {
  id: serial('id').primaryKey(),
  email: text('email').unique().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const runs = pgTable('runs', {
  id: serial('id').primaryKey(),
  trigger: text('trigger').notNull().default('manual'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  stats: jsonb('stats').$type<Record<string, number | string>>().notNull().default({}),
  error: text('error'),
})

export type Prospect = typeof prospects.$inferSelect
export type Draft = typeof drafts.$inferSelect
export type Run = typeof runs.$inferSelect
