import { generateText, Output } from 'ai'
import { z } from 'zod'
import type { Issue, Prospect } from '@/lib/db/schema'
import type { Sender } from '@/lib/settings'
import { CATEGORY_MAP } from './osm'

const MODEL = 'google/gemini-2.5-flash'

const OFFER_BY_ISSUE: Record<string, string> = {
  no_website: 'un site vitrine simple (une page, vos services, votre zone, un bouton appel/devis), livré en une semaine',
  site_down: 'remettre votre site en ligne ou le remplacer par une version moderne qui fonctionne',
  no_https: 'passer votre site en HTTPS (certificat gratuit) et supprimer le message « Non sécurisé »',
  not_mobile: 'rendre votre site lisible et cliquable sur téléphone, là où arrivent la majorité de vos clients',
  no_legal: 'ajouter les mentions légales et la politique de confidentialité conformes, en quelques jours',
  tracking_no_consent: 'installer un bandeau cookies conforme CNIL sans toucher au reste du site',
  no_contact: 'ajouter un bouton appel direct et un formulaire de demande de devis',
  slow: 'accélérer le chargement (images, hébergement) pour ne plus perdre de visiteurs',
  outdated: 'moderniser le site en gardant votre contenu, avec une version plus rapide et lisible sur mobile',
  seo_missing: 'corriger les balises Google pour que votre entreprise apparaisse proprement dans les résultats',
}

export async function draftEmail(prospect: Prospect, issue: Issue, sender: Sender) {
  const category = CATEGORY_MAP[prospect.category ?? '']?.label ?? 'artisan'
  const signature = [
    `${sender.firstName} ${sender.lastName}`.trim(),
    sender.brand,
    sender.phone,
    sender.siteUrl,
  ]
    .filter(Boolean)
    .join(' · ')

  const { output } = await generateText({
    model: MODEL,
    output: Output.object({
      schema: z.object({
        subject: z.string().describe('Objet court, sans majuscules abusives, sans point final, 4 à 8 mots'),
        body: z.string().describe('Corps du mail en texte brut, 90 à 140 mots, avec la signature à la fin'),
      }),
    }),
    instructions: `Tu écris des emails de prospection B2B en français pour un indépendant du web qui aide les artisans locaux.
Règles absolues :
- Tutoiement interdit, vouvoiement sobre. Pas de flatterie, pas de superlatifs, pas de jargon technique.
- Tu n'inventes RIEN. Tu cites uniquement le fait fourni dans "Constat" tel quel, reformulé simplement.
- Une seule idée, un seul problème, une seule proposition.
- Structure : 1) une phrase de contexte concret (où tu as vu l'entreprise), 2) le constat factuel, 3) ce que ça change pour ses clients, 4) la proposition en une phrase, 5) une question fermée simple pour obtenir une réponse ("Souhaitez-vous que je vous envoie un aperçu gratuit ?"), 6) signature.
- Pas de pièce jointe, pas de lien autre que ceux de la signature, pas de "j'espère que vous allez bien".
- Termine par une ligne vide puis exactement : "Si vous ne souhaitez plus recevoir de message de ma part, répondez simplement « stop »."
- Ne mets pas de placeholders entre crochets.`,
    prompt: `Entreprise : ${prospect.name}
Activité : ${category}
Ville : ${prospect.city ?? sender.city}
Site : ${prospect.website ?? 'aucun'}
Constat (fait vérifié) : ${issue.title} — ${issue.evidence}
Proposition à faire : ${OFFER_BY_ISSUE[issue.key] ?? 'une amélioration ciblée de sa présence en ligne'}
Signature à utiliser : ${signature}`,
  })

  return output
}
