/**
 * Sourcing d'entreprises via OpenStreetMap (Overpass API).
 * 100 % gratuit, sans compte, sans carte bancaire.
 */

export type OsmBusiness = {
  osmId: string
  name: string
  category: string
  address: string | null
  phone: string | null
  website: string | null
  email: string | null
}

// Catégorie interne -> filtre Overpass (tag OSM)
export const CATEGORY_MAP: Record<string, { label: string; query: string }> = {
  plumber: { label: 'Plombier', query: '["craft"="plumber"]' },
  electrician: { label: 'Électricien', query: '["craft"="electrician"]' },
  carpenter: { label: 'Charpentier', query: '["craft"="carpenter"]' },
  joiner: { label: 'Menuisier', query: '["craft"="joiner"]' },
  painter: { label: 'Peintre en bâtiment', query: '["craft"="painter"]' },
  roofer: { label: 'Couvreur', query: '["craft"="roofer"]' },
  hvac: { label: 'Chauffagiste / Clim', query: '["craft"="hvac"]' },
  locksmith: { label: 'Serrurier', query: '["craft"="locksmith"]' },
  tiler: { label: 'Carreleur', query: '["craft"="tiler"]' },
  plasterer: { label: 'Plâtrier', query: '["craft"="plasterer"]' },
  glaziery: { label: 'Vitrier', query: '["craft"="glaziery"]' },
  gardener: { label: 'Paysagiste', query: '["craft"="gardener"]' },
  hairdresser: { label: 'Coiffeur', query: '["shop"="hairdresser"]' },
  restaurant: { label: 'Restaurant', query: '["amenity"="restaurant"]' },
  bakery: { label: 'Boulangerie', query: '["shop"="bakery"]' },
  dentist: { label: 'Dentiste', query: '["amenity"="dentist"]' },
  physiotherapist: { label: 'Kiné', query: '["healthcare"="physiotherapist"]' },
  lawyer: { label: 'Avocat', query: '["office"="lawyer"]' },
  car_repair: { label: 'Garage auto', query: '["shop"="car_repair"]' },
  florist: { label: 'Fleuriste', query: '["shop"="florist"]' },
}

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

function buildQuery(city: string, categories: string[]) {
  const filters = categories
    .map((c) => CATEGORY_MAP[c]?.query)
    .filter(Boolean)
    .flatMap((q) => [`node${q}(area.a);`, `way${q}(area.a);`])
    .join('\n')

  return `[out:json][timeout:60];
area["name"="${city.replace(/"/g, '')}"]["boundary"="administrative"]["admin_level"~"^(6|7|8)$"]->.a;
(
${filters}
);
out center tags;`
}

type OverpassElement = {
  type: string
  id: number
  tags?: Record<string, string>
}

function normalizeUrl(raw?: string) {
  if (!raw) return null
  let u = raw.trim().split(/[\s;,]/)[0]
  if (!u) return null
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`
  try {
    const parsed = new URL(u)
    return parsed.href
  } catch {
    return null
  }
}

function buildAddress(t: Record<string, string>) {
  const parts = [
    [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' '),
    [t['addr:postcode'], t['addr:city']].filter(Boolean).join(' '),
  ].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

function detectCategory(t: Record<string, string>) {
  for (const [key, def] of Object.entries(CATEGORY_MAP)) {
    const m = def.query.match(/\["(\w+)"="(\w+)"\]/)
    if (m && t[m[1]] === m[2]) return key
  }
  return 'other'
}

export async function fetchBusinesses(
  city: string,
  categories: string[],
): Promise<OsmBusiness[]> {
  const query = buildQuery(city, categories)
  let lastError: unknown

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(70_000),
      })
      if (!res.ok) throw new Error(`Overpass ${res.status}`)
      const json = (await res.json()) as { elements: OverpassElement[] }

      return json.elements
        .filter((e) => e.tags?.name)
        .map((e) => {
          const t = e.tags!
          return {
            osmId: `${e.type}/${e.id}`,
            name: t.name,
            category: detectCategory(t),
            address: buildAddress(t),
            phone: t.phone ?? t['contact:phone'] ?? t['contact:mobile'] ?? null,
            website: normalizeUrl(t.website ?? t['contact:website'] ?? t.url),
            email: (t.email ?? t['contact:email'] ?? null)?.toLowerCase() ?? null,
          }
        })
    } catch (err) {
      lastError = err
    }
  }
  throw new Error(`Sourcing OSM impossible: ${String(lastError)}`)
}
