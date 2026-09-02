import type { Analysis } from '@/lib/db/schema'

const UA =
  'Mozilla/5.0 (compatible; SiteAuditBot/1.0; +https://example.com/bot) AppleWebKit/537.36 Chrome/120 Safari/537.36'

async function fetchHtml(url: string) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
  })
  const html = await res.text()
  return { res, html: html.slice(0, 600_000) }
}

const LEGAL_PATTERNS =
  /mentions?[\s-]?l[ée]gales?|legal[\s-]?notice|politique[\s-]de[\s-]confidentialit|cgv|conditions[\s-]g[ée]n[ée]rales|privacy/i

const TRACKING_PATTERNS =
  /googletagmanager\.com|google-analytics\.com|gtag\(|fbq\(|connect\.facebook\.net|hotjar|clarity\.ms|matomo/i

const CONSENT_PATTERNS =
  /tarteaucitron|axeptio|cookieconsent|cookie-consent|didomi|onetrust|cookiebot|klaro|orejime|complianz|cmp|consent/i

function extract(re: RegExp, html: string) {
  const m = html.match(re)
  return m ? m[1]?.trim() ?? null : null
}

export async function analyzeWebsite(url: string | null): Promise<Analysis> {
  if (!url) return { url: null }

  const a: Analysis = { url }
  try {
    const { res, html } = await fetchHtml(url)
    a.finalUrl = res.url
    a.httpStatus = res.status
    a.https = res.url.startsWith('https://')

    if (res.status >= 400) return a

    const lower = html.toLowerCase()
    a.hasViewport = /<meta[^>]+name=["']viewport["']/i.test(html)
    a.hasContactForm = /<form[\s>]/i.test(html) && /(contact|devis|message|email|mail|téléphone|telephone)/i.test(html)
    a.hasMailto = /href=["']mailto:/i.test(html)
    a.hasTel = /href=["']tel:/i.test(html)
    a.hasLegalPage = LEGAL_PATTERNS.test(lower)
    a.hasTracking = TRACKING_PATTERNS.test(html)
    a.hasCookieBanner = CONSENT_PATTERNS.test(lower)
    a.title = extract(/<title[^>]*>([^<]*)<\/title>/i, html)
    a.metaDescription = extract(
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
      html,
    )
    a.generator = extract(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']*)["']/i, html)
    a.jqueryVersion = extract(/jquery[.-](\d+\.\d+(?:\.\d+)?)(?:\.min)?\.js/i, html)

    const years = [...html.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(20\d{2})/gi)]
      .map((m) => Number(m[1]))
      .filter((y) => y >= 2000 && y <= new Date().getFullYear() + 1)
    a.copyrightYear = years.length ? Math.max(...years) : null

    // PageSpeed Insights: gratuit, sans clé pour un volume faible (quota limité), clé optionnelle
    try {
      const psiKey = process.env.PAGESPEED_API_KEY
      const psiUrl = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed')
      psiUrl.searchParams.set('url', res.url)
      psiUrl.searchParams.set('strategy', 'mobile')
      psiUrl.searchParams.set('category', 'performance')
      if (psiKey) psiUrl.searchParams.set('key', psiKey)
      const psi = await fetch(psiUrl, { signal: AbortSignal.timeout(45_000) })
      if (psi.ok) {
        const json = (await psi.json()) as {
          lighthouseResult?: {
            categories?: { performance?: { score?: number } }
            audits?: { 'largest-contentful-paint'?: { numericValue?: number } }
          }
        }
        const score = json.lighthouseResult?.categories?.performance?.score
        a.psiMobileScore = typeof score === 'number' ? Math.round(score * 100) : null
        a.psiLcpMs = json.lighthouseResult?.audits?.['largest-contentful-paint']?.numericValue ?? null
      }
    } catch {
      // PSI indisponible : on continue sans
    }
  } catch (err) {
    a.fetchError = err instanceof Error ? err.message : String(err)
  }
  return a
}

/** Cherche un email générique sur la page d'accueil puis les pages contact. */
export async function findEmail(website: string | null): Promise<{ email: string; source: string } | null> {
  if (!website) return null
  const base = new URL(website)
  const candidates = [
    website,
    `${base.origin}/contact`,
    `${base.origin}/contact.html`,
    `${base.origin}/nous-contacter`,
    `${base.origin}/mentions-legales`,
  ]
  const emailRe = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi
  const blacklist = /(sentry|wixpress|example|wordpress|w3\.org|schema\.org|\.png|\.jpg|\.svg|@2x|domain\.com)/i

  for (const url of candidates) {
    try {
      const { res, html } = await fetchHtml(url)
      if (!res.ok) continue
      const decoded = html.replace(/&#64;|&commat;/g, '@').replace(/\s?\[at\]\s?|\s?\(at\)\s?/gi, '@')
      const found = [...decoded.matchAll(emailRe)]
        .map((m) => m[0].toLowerCase())
        .filter((e) => !blacklist.test(e))
      if (found.length) {
        // Priorité au domaine du site
        const own = found.find((e) => e.endsWith(`@${base.hostname.replace(/^www\./, '')}`))
        return { email: own ?? found[0], source: url }
      }
    } catch {
      // page absente
    }
  }
  return null
}
