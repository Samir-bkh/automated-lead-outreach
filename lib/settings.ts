import { eq } from 'drizzle-orm'
import { db } from './db'
import { settings } from './db/schema'

export type Targeting = {
  city: string
  country: string
  categories: string[]
  batchSize: number
  analyzePerRun: number
  draftPerRun: number
}

export type Sender = {
  firstName: string
  lastName: string
  brand: string
  email: string
  phone: string
  city: string
  siteUrl: string
}

export const DEFAULT_TARGETING: Targeting = {
  city: 'Lyon',
  country: 'France',
  categories: [
    'plumber',
    'electrician',
    'carpenter',
    'painter',
    'roofer',
    'hvac',
    'locksmith',
    'tiler',
    'joiner',
    'plasterer',
  ],
  batchSize: 40,
  analyzePerRun: 15,
  draftPerRun: 10,
}

export const DEFAULT_SENDER: Sender = {
  firstName: 'Prénom',
  lastName: 'Nom',
  brand: 'Atelier Web Lyon',
  email: '',
  phone: '',
  city: 'Lyon',
  siteUrl: '',
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.select().from(settings).where(eq(settings.key, key)).limit(1)
  if (!row[0]) return fallback
  return { ...fallback, ...(row[0].value as Partial<T>) }
}

export async function setSetting<T>(key: string, value: T) {
  await db
    .insert(settings)
    .values({ key, value: value as object, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: value as object, updatedAt: new Date() },
    })
}

export const getTargeting = () => getSetting<Targeting>('targeting', DEFAULT_TARGETING)
export const getSender = () => getSetting<Sender>('sender', DEFAULT_SENDER)
