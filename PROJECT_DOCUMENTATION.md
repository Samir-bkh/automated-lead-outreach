# Documentation Complète du Projet: automated-lead-outreach

## 📋 Table des Matières
- Configuration du projet
- Application principale
- Pipeline de traitement
- Composants UI
- Base de données
- Authentification et paramètres

---

## 📁 Structure des fichiers

### Fichiers de configuration racine

#### `.gitignore`
Fichier de configuration Git pour ignorer les fichiers/dossiers lors des commits:
- Fichiers sandbox v0
- Variables d'environnement locales (.env*.local)
- Node modules
- Dossiers Next.js (.next/)
- Fichiers système (.DS_Store)

#### `package.json`
Gestionnaire de dépendances du projet:
- **Version**: 0.1.0
- **Scripts**: dev, build, start
- **Dépendances principales**:
  - Next.js 16.3.3
  - React 19
  - Drizzle ORM 0.45.2
  - AI SDK 7.0.90
  - Tailwind CSS 4.3.3
  - Zod 4.5.4
  - PG (PostgreSQL) 8.23.0
  - Lucide React (icônes)

#### `tsconfig.json`
Configuration TypeScript pour le projet:
- Target: ES6
- Module: ESNext
- Strict mode activé
- Path aliases: @/* pointe vers la racine du projet

#### `next.config.mjs`
Configuration Next.js:
- Ignore les erreurs TypeScript au build
- Images non optimisées

#### `postcss.config.mjs`
Configuration PostCSS:
- Plugin Tailwind CSS v4

#### `components.json`
Configuration Shadcn/UI:
- Style: base-nova
- Tailwind configuration avec couleur neutre
- Alias pour composants, utils, et lib

#### `pnpm-workspace.yaml`
Configuration de l'espace de travail PNPM:
- Exclusions minimales pour les packages Next.js

#### `vercel.json`
Configuration Vercel:
- Cron job daily: `/api/cron` à 06h00 chaque jour

#### `proxy.ts`
Middleware de proxy pour l'authentification admin:
- Redirige vers `/admin/login` si pas de cookie de session
- Vérifie les accès à `/admin/*`

---

## 🎨 Application principale (app/)

#### `app/layout.tsx`
Layout racine de l'application:
- Imports de polices Google (Bricolage Grotesque, IBM Plex Sans)
- Metadata pour SEO
- Import de styles globaux
- Analytics Vercel en production
- Support du mode sombre

#### `app/page.tsx`
Page d'accueil (placeholder v0):
- Affiche un SVG de chargement
- Message "Your v0 generation will show here"

#### `app/globals.css`
Fichier CSS global:
- Import de Tailwind CSS, tw-animate-css, shadcn/tailwind
- Définition des variables CSS (couleurs, rayons, fonts)
- Thème clair et sombre (light-dark)
- Utilise le color space OKLch
- Couleurs thématiques: primaire (bleu), accents, warnings, etc.

#### `app/actions/admin.ts`
Actions serveur pour l'administration:
- `login`: Authentification avec mot de passe
- `logout`: Déconnexion
- `triggerPipeline`: Déclenchement manuel du pipeline
- `setProspectStatus`: Mise à jour du statut d'un prospect
- `updateDraft`: Modification d'un brouillon d'email
- `regenerate`: Régénération d'un brouillon
- `updateProspectEmail`: Mise à jour de l'email d'un prospect
- `saveTargeting`: Sauvegarde des paramètres de ciblage
- `saveSender`: Sauvegarde des paramètres d'expéditeur
- `addUnsubscribe`: Ajout d'une adresse à la liste de désabonnement
- `getDashboardData`: Récupération des données du tableau de bord

#### `app/api/cron/route.ts`
API endpoint pour les tâches planifiées:
- GET `/api/cron`
- Vérification du Bearer token (CRON_SECRET)
- Déclenche le pipeline complet

---

## 🔧 Pipeline de traitement (lib/pipeline/)

#### `lib/pipeline/run.ts`
Orchestrateur principal du pipeline:
- `stepSource`: Import de nouvelles entreprises depuis OpenStreetMap
- `stepAnalyze`: Analyse des sites web des prospects
- `stepDraft`: Rédaction des brouillons d'email
- `runPipeline`: Fonction principale qui exécute les étapes
- `regenerateDraft`: Régénération du brouillon pour un prospect spécifique
- Stats: sourced, inserted, analyzed, drafted, errors

#### `lib/pipeline/analyze.ts`
Analyse des sites web:
- `analyzeWebsite`: Vérifie HTTPS, viewport, formulaires, liens légaux, traceurs, cookies, etc.
- `findEmail`: Recherche d'emails génériques sur le site
- Détecte: titre, meta description, copyright, jQuery, PageSpeed Insights
- Analyse du HTML pour des patterns spécifiques

#### `lib/pipeline/draft.ts`
Rédaction des emails avec IA (Google Gemini 2.5 Flash):
- `draftEmail`: Génère objet et corps d'email personnalisé
- Utilise les catégories de problèmes identifiées
- Offres spécifiques par type de problème
- Structure: contexte → constat → impact → proposition → question

#### `lib/pipeline/osm.ts`
Sourcing d'entreprises via OpenStreetMap (Overpass API):
- `fetchBusinesses`: Récupère les entreprises filtrées par catégorie et ville
- Catégories supportées: plombiers, électriciens, charpentiers, etc.
- Normalisation des URLs et adresses
- Support de 2 endpoints Overpass pour la redondance

#### `lib/pipeline/scoring.ts`
Système de scoring déterministe:
- `detectIssues`: Détecte 10 types de problèmes:
  - Pas de site web
  - Site inaccessible
  - HTTP non sécurisé
  - Non adapté au mobile
  - Mentions légales manquantes
  - Traceurs sans consentement
  - Pas de moyen de contact
  - Site lent
  - Site visiblement ancien
  - Balises SEO manquantes
- `computeScore`: Calcul du score de priorité (0-100)

---

## 🗄️ Base de données (lib/db/)

#### `lib/db/index.ts`
Configuration Drizzle ORM:
- Connection Pool PostgreSQL
- Cache global pour développement
- Configuration: max 5 connections

#### `lib/db/schema.ts`
Schéma de base de données:

**Table `prospects`**:
- id, osmId, name, category, city, address, phone, website, email
- status: new → analyzed → drafted → approved → sent → replied → won/rejected/skipped
- score, issues, analysis, analyzedAt, notes
- timestamps: createdAt, updatedAt

**Table `drafts`**:
- id, prospectId, subject, body, issueKey, status
- sentAt, createdAt

**Table `settings`**:
- key (PK), value (JSONB), updatedAt

**Table `unsubscribes`**:
- id, email (unique), createdAt

**Table `runs`**:
- id, trigger (manual/cron), startedAt, finishedAt, stats, error

---

## 🔐 Authentification et paramètres (lib/)

#### `lib/admin-auth.ts`
Système d'authentification admin:
- Token signé HMAC-SHA256
- Cookie HTTP-only sécurisé
- Vérification de timing-safe
- Password check avec timing-safe comparison

#### `lib/settings.ts`
Gestion des paramètres:

**Type `Targeting`**:
- city, country, categories, batchSize
- analyzePerRun, draftPerRun
- Défaut: Lyon, France, 10 catégories d'artisans

**Type `Sender`**:
- firstName, lastName, brand, email, phone, city, siteUrl

#### `lib/utils.ts`
Utilitaires:
- `cn()`: Fusion de classes Tailwind avec clsx et twMerge

---

## 🎨 Composants UI (components/ui/)

Ensemble de composants shadcn/ui customisés:

#### `components/ui/badge.tsx`
Badge avec variants: default, secondary, destructive, outline, ghost, link

#### `components/ui/button.tsx`
Bouton avec variants et sizes multiples

#### `components/ui/card.tsx`
Card avec Header, Title, Description, Action, Content, Footer

#### `components/ui/dialog.tsx`
Dialog/Modal avec portal et overlay

#### `components/ui/input.tsx`
Champ input texte

#### `components/ui/label.tsx`
Label pour les formulaires

#### `components/ui/select.tsx`
Select dropdown avec groupe, contenu et séparateur

#### `components/ui/switch.tsx`
Toggle switch avec sizes

#### `components/ui/tabs.tsx`
Tabs avec variants (default, line)

#### `components/ui/textarea.tsx`
Zone de texte multiligne

---

## 📋 Résumé du projet

**Nom**: automated-lead-outreach
**Description**: Plateforme d'automatisation de prospection B2B pour les artisans locaux

**Stack technologique**:
- Frontend: Next.js 16, React 19, TypeScript
- Styling: Tailwind CSS 4, shadcn/ui
- Backend: Next.js API routes, Actions serveur
- Database: PostgreSQL avec Drizzle ORM
- AI: Google Gemini 2.5 Flash (génération emails)
- Sourcing: OpenStreetMap Overpass API
- Hosting: Vercel

**Workflow principal**:
1. **Source**: Récupère les entreprises depuis OpenStreetMap
2. **Analyze**: Analyse les sites web (accessibilité, sécurité, mobile, etc.)
3. **Draft**: Génère les brouillons d'email personnalisés avec IA
4. **Cron**: Exécution automatique quotidienne à 06h00

**Langages**:
- TypeScript: 93.4%
- CSS: 6.1%
- JavaScript: 0.5%

---

*Documentation générée automatiquement*
