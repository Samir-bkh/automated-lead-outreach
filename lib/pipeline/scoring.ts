import type { Analysis, Issue } from '@/lib/db/schema'

/**
 * Détection DÉTERMINISTE des problèmes. Aucune opinion, uniquement des faits vérifiables.
 * L'IA ne fait que rédiger à partir de ces faits.
 */
export function detectIssues(a: Analysis): Issue[] {
  const issues: Issue[] = []
  const year = new Date().getFullYear()

  if (!a.url) {
    issues.push({
      key: 'no_website',
      weight: 90,
      title: 'Aucun site web',
      evidence: "Votre entreprise est référencée sur les cartes mais aucun site web n'est indiqué.",
    })
    return issues
  }

  if (a.fetchError || (a.httpStatus && a.httpStatus >= 400)) {
    issues.push({
      key: 'site_down',
      weight: 95,
      title: 'Site inaccessible',
      evidence: a.httpStatus
        ? `L'adresse ${a.url} renvoie une erreur ${a.httpStatus}.`
        : `L'adresse ${a.url} ne répond pas (${a.fetchError ?? 'erreur réseau'}).`,
    })
    return issues
  }

  if (a.https === false) {
    issues.push({
      key: 'no_https',
      weight: 80,
      title: 'Site non sécurisé (HTTP)',
      evidence: `Le site se charge en http:// sans certificat : les navigateurs affichent « Non sécurisé » à côté de votre adresse.`,
    })
  }

  if (a.hasViewport === false || (a.psiMobileScore != null && a.psiMobileScore < 40)) {
    issues.push({
      key: 'not_mobile',
      weight: 75,
      title: 'Site non adapté au mobile',
      evidence:
        a.hasViewport === false
          ? "La page n'a pas de balise viewport : elle s'affiche en version ordinateur réduite sur téléphone."
          : `Score mobile Google PageSpeed : ${a.psiMobileScore}/100.`,
    })
  }

  if (!a.hasLegalPage) {
    issues.push({
      key: 'no_legal',
      weight: 70,
      title: 'Mentions légales introuvables',
      evidence:
        "Aucun lien « Mentions légales » détecté sur la page d'accueil (obligation légale, loi LCEN art. 6-III, amende jusqu'à 75 000 €).",
    })
  }

  if (a.hasTracking && !a.hasCookieBanner) {
    issues.push({
      key: 'tracking_no_consent',
      weight: 65,
      title: 'Traceurs sans bandeau cookies',
      evidence:
        'Google Analytics / Pixel détecté mais aucun outil de consentement aux cookies (exigence CNIL / RGPD).',
    })
  }

  if (!a.hasContactForm && !a.hasMailto && !a.hasTel) {
    issues.push({
      key: 'no_contact',
      weight: 60,
      title: 'Aucun moyen de contact cliquable',
      evidence:
        "Pas de formulaire, ni de lien téléphone, ni d'adresse email cliquable sur la page d'accueil : un visiteur sur mobile ne peut pas vous appeler en un clic.",
    })
  }

  if (a.psiLcpMs != null && a.psiLcpMs > 4000) {
    issues.push({
      key: 'slow',
      weight: 55,
      title: 'Site lent sur mobile',
      evidence: `Temps d'affichage principal mesuré par Google : ${(a.psiLcpMs / 1000).toFixed(1)} s (recommandé : moins de 2,5 s).`,
    })
  }

  const jq = a.jqueryVersion ? Number(a.jqueryVersion.split('.')[0]) : null
  if ((a.copyrightYear && a.copyrightYear <= year - 3) || (jq !== null && jq < 3)) {
    issues.push({
      key: 'outdated',
      weight: 50,
      title: 'Site visiblement ancien',
      evidence: a.copyrightYear && a.copyrightYear <= year - 3
        ? `Le pied de page indique © ${a.copyrightYear}.`
        : `Le site utilise jQuery ${a.jqueryVersion}, une bibliothèque obsolète depuis plusieurs années.`,
    })
  }

  if (!a.title || !a.metaDescription) {
    issues.push({
      key: 'seo_missing',
      weight: 35,
      title: 'Balises Google manquantes',
      evidence: !a.title
        ? "La page n'a pas de titre : Google affiche l'adresse brute dans ses résultats."
        : "Aucune meta description : Google choisit un extrait au hasard dans vos résultats.",
    })
  }

  return issues.sort((x, y) => y.weight - x.weight)
}

export function computeScore(issues: Issue[], hasEmail: boolean) {
  if (!issues.length) return 0
  const top = issues[0].weight
  const bonus = Math.min(issues.length - 1, 3) * 5
  return Math.min(100, top + bonus) + (hasEmail ? 0 : -30)
}
