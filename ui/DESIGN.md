# CôteMaster — guide de design de l'interface

Refonte visuelle du 01/10/2026 (demande de Pierre : « une appli digne d'un ingénieur web,
aussi jolie que l'onglet Analyse IA, en gardant toutes les données »). Ce guide dit **comment
dessiner** une page ou un composant pour qu'il ressemble au reste de l'appli. Il ne dit jamais
quoi afficher : toutes les données déjà affichées restent affichées.

## 1. Principes

1. **Aucune donnée ne disparaît.** Chaque chiffre, libellé, lien, bouton, info-bulle (`title`),
   état (chargement, erreur, vide), condition (`v-if`) et action (`@click`) d'avant la refonte
   existe toujours après. On réorganise, on hiérarchise, on n'enlève rien. Le script
   `check-data.cjs` (voir § 7) le vérifie expression par expression.
2. **Hiérarchie avant décoration.** Une page se lit en trois niveaux : le bandeau (ce qu'on
   regarde), les cartes (les blocs), les lignes (le détail). Les gros chiffres sont gros, les
   sources et précisions sont petites et grises.
3. **La couleur de section, pas la couleur de marque.** `--cm-section` est la couleur de la page
   (Matchs émeraude, Mes paris or, Historique moteur violet, Réglages cyan) : elle sert aux
   bandeaux, onglets, boutons principaux, liens, focus, icônes de carte. Les couleurs
   **sémantiques** restent fixes : `--cm-accent` (vert = positif, gagné, validé, confirmé),
   `--cm-danger` (rouge = perdu, faux, contredit, en direct), `--cm-warning` (ambre = nuancé, à
   vérifier), `--cm-info` (bleu = IA, information), `--cm-violet` (statistiques). Un badge
   « Gagné » est vert dans toutes les sections.
4. **Un seul dessin par chose.** Une rencontre = `MatchCard`. Un classement = `StandingsTable`.
   Un logo = `TeamCrest`. Une nationalité = `PlayerFlag`. Une probabilité = `ProbabilityRing`.
   Un tableau = `.cm-table`. On réutilise, on ne réinvente pas.
5. **Tout respire.** Espacement vertical 16–22 px entre blocs, 10–12 px entre cartes d'une
   liste, 14–16 px de marge intérieure. Rayons 12–18 px. Jamais de bordure claire épaisse.
6. **Ça s'adapte.** Deux colonnes dès que la place existe, une seule en dessous ; on préfère les
   requêtes de conteneur (`container: nom / inline-size` + `@container`) aux media queries,
   parce qu'un même composant vit dans une page large et dans un panneau latéral étroit.

## 2. Jetons (`src/assets/styles/tokens.css`)

| Jeton | Usage |
| --- | --- |
| `--cm-bg`, `--cm-surface`, `--cm-surface-alt`, `--cm-surface-hover`, `--cm-surface-raised` | fond, carte, bloc dans une carte, survol, en-tête de tableau |
| `--cm-border-soft`, `--cm-border`, `--cm-border-strong` | filets (du plus discret au plus visible) |
| `--cm-text-primary`, `--cm-text-secondary`, `--cm-text-muted` | texte, texte secondaire, libellés/sources |
| `--cm-section`, `--cm-section-rgb`, `--cm-section-soft`, `--cm-section-on` | couleur de la page, son triplet RGB (pour `rgba(var(--cm-section-rgb) / 0.2)`), son fond teinté, le texte posé dessus |
| `--cm-accent`/`-danger`/`-warning`/`-info`/`-violet`/`-cyan`/`-gold` + `-soft` + `-rgb` | couleurs sémantiques, leur fond teinté, leur triplet |
| `--cm-radius-xs` 6 · `-sm` 9 · `--cm-radius` 12 · `-md` 14 · `-lg` 18 · `-xl` 24 | rayons |
| `--cm-shadow-sm`, `--cm-shadow`, `--cm-shadow-lg`, `--cm-shadow-section` | ombres (rares : cartes principales, éléments flottants) |
| `--cm-transition` 160 ms, `--cm-transition-slow` 420 ms | transitions |

Jamais de couleur en dur (`#34d399`, `rgba(52, 211, 153, …)`) dans un composant : toujours un
jeton. Pour une teinte avec transparence : `rgba(var(--cm-section-rgb) / 0.2)`.

## 3. Composants communs (`src/components/common`)

- **`AppCard`** — le conteneur de tout bloc : `title`, `subtitle`, `eyebrow` (sur-titre couleur
  de section), `icon` (carré teinté devant le titre), `tone` (`glass` | `plain` | `section`
  pour LA carte importante d'une page), emplacement `#actions` à droite du titre.
- **`AppButton`** — `primary` (couleur de section, dégradé, halo), `section` (vert de la marque,
  pour valider/enregistrer), `secondary`, `ghost`, `danger` ; `size` `sm` | `md` ; `#icon`.
- **`TabbedView`** — barre d'onglets segmentée, l'actif en couleur de section ; `count`
  facultatif par onglet.
- **`AppModal`** — panneau latéral droit ; `title`, `subtitle`.
- **`AppSelect`, `AppTextField`, `AppNumberField`, `AppToggle`, `AppSlider`** — champs ; libellé
  en petites capitales, anneau de focus couleur de section. Les aligner dans une `.cm-toolbar`.
- **`AppSelect`** (03/10/2026) — une liste DESSINÉE, jamais la liste native du navigateur : panneau
  sombre posé dans `<body>` (il passe par-dessus cartes et fenêtres), recherche dès 9 options,
  clavier complet, option choisie en couleur de section avec sa coche. Champs d'option facultatifs :
  `league` (drapeau + nom), `favorite` (étoile dorée), `group` (sous-titre à chaque changement),
  `hint` (précision grise à droite : une date, un compte ; dans le champ, c'est elle qui se
  raccourcit quand la place manque, jamais la valeur choisie), `icon`. Un sélecteur de compétitions
  passe `league` et `favorite`, avec les groupes « Favoris » / « Toutes les compétitions ».
- **`EmptyState`** (icône ronde teintée, titre, description, `#action`), **`LoadingSpinner`**,
  **`StatusBadge`**, **`MatchStatusBadge`**, **`BackButton`**, **`CollapsibleSection`**.
- **`AppIcon`** — traits fins. Noms disponibles : matches settings play pause refresh check x
  alert trendUp trendDown search chevronRight chevronDown chevronLeft target bolt info clock
  database activity award barChart users userX cpu sparkles minus wallet history sliders
  calendar trophy flag shield star arrowRight arrowLeft filter list grid external trash plus
  edit lock globe percent euro eye download layers pieChart mapPin thermometer wind droplet
  whistle swap cards ball folder file.

Composants métier à réutiliser : `MatchCard` (toute rencontre), `FixtureCard`, `TeamCrest`
(logo), `PlayerFlag` (drapeau), `PickCrest` (logo de l'équipe visée par un pronostic),
`LeagueBadge` (drapeau + nom de la compétition), `FormBadges` (V/N/D), `MatchupHeader` (les deux
clubs en tête d'un comparatif), `MatchStatBars` (barres face à face), `ProbabilityRing`
(pourcentage en anneau), `AiMarketCard`, `MarketPicksBoard`, `StandingsTable`, `LeagueLeaders`,
`MatchesToolbar` (la barre de commande qui coiffe une liste : champs-pilules à icône pour la
recherche, la provenance des données, bouton principal en pilule, puis une seconde rangée
pour les filtres ; **pas de carte-formulaire à libellés au-dessus d'une liste**),
`DataOriginMenu` (la provenance : une pilule qui dit le vrai fournisseur et la date du dernier
relevé, et un panneau qui détaille chaque donnée — fournisseur, fichier exact sur ce PC, date,
nombre de rencontres fournies — avec le choix du jeu de données),
`FavoriteStar` (l'étoile des favoris, un seul dessin : bouton contour gris → plein doré, ou simple
marque dorée avec `:interactive="false"` ; `variant="pill"` avec son texte), `MatchListCard` (une
ligne de la liste des matchs : carte + forme + badge IA + cotes), `LeagueStandingsPanel` (le
classement d'une compétition et ses tuiles clés — en tête, saison, attaque, défense, forme,
maintien — à côté du calendrier saison ; `StandingsTable` y reçoit `formOf`, qui ajoute la
colonne Forme en pastilles).

## 4. Utilitaires (`src/assets/styles/utilities.css`, préfixe `cm-`)

Composer avec ces classes AVANT d'écrire du CSS propre :

- Page : `.cm-page` (colonne, gap 20).
- Bandeau d'ouverture : `.cm-hero` > `.cm-hero__top` (`.cm-hero__title`, `.cm-hero__chips`),
  `.cm-hero__subtitle`. Teinté couleur de section. **Une page ou un onglet commence par un
  bandeau** : son titre, ce qu'elle montre en une phrase, et ses chiffres clés ou puces.
- Titres : `.cm-section-title` (+ `.cm-section-title__hint`), `.cm-group-title` (avec filet),
  `.cm-eyebrow`.
- Puces : `.cm-chip` (+ `.is-section`, `.is-accent`, `.is-warning`, `.is-danger`, `.is-info`,
  `.is-violet`) ; pastilles chiffrées `.cm-pill` (+ `.is-accent`, `.is-section`, `.is-strong`).
- Carré d'icône : `.cm-icon-box` (+ `.is-accent/.is-info/.is-warning/.is-danger/.is-violet/
  .is-muted`, `.is-sm`).
- Chiffres clés : `.cm-kpis` > `.cm-kpi` (`.cm-kpi__label`, `.cm-kpi__value`, `.cm-kpi__detail`,
  `.is-section` pour le chiffre vedette). **Remplace tout « libellé : valeur » aligné en grille.**
- Blocs : `.cm-block` (+ `.is-hover`), `.cm-note` (+ `.is-warning/.is-danger/.is-info` ;
  `.cm-note__title`, `.cm-note__text`) pour un avertissement ou une explication.
- Grilles : `.cm-grid-2`, `.cm-grid-3` (une colonne sous 900 px) ; `.cm-toolbar` pour une
  rangée de commandes.
- Tableaux : `.cm-table-wrap` > `table.cm-table` (en-tête petites capitales collant en haut,
  chiffres à droite, première colonne à gauche, `.is-left`, `.is-center`, `.is-strong`).
  **Tout tableau de la page adopte ce dessin** (on garde ses colonnes et son tri).
- Divers : `.cm-link`, `.cm-bar` > `.cm-bar__fill`, `.cm-live-dot`, `.cm-stagger` (apparition
  décalée des enfants d'une liste), `.cm-numeric`, `.cm-truncate`, `.cm-text-secondary`,
  `.cm-text-muted`, `.cm-positive`, `.cm-negative`, `.cm-team-link`.

## 5. Motifs par type de contenu

- **Liste de rencontres** → `MatchCard` dans une colonne (`gap: 8px`), en-têtes de groupe
  (compétition : `LeagueBadge` ; jour : `.cm-group-title`).
- **Chiffres de synthèse** (misé, retours, ROI, taux de réussite, matchs, points) → `.cm-kpis`.
- **Comparatif de deux équipes** → `MatchupHeader` puis `MatchStatBars`.
- **Classement / liste chiffrée** → `.cm-table`, le rang en gris, le nom en gras avec `TeamCrest`
  ou `PlayerFlag`, les totaux en `.is-strong`, la colonne décisive colorée.
- **Formulaire / réglages** → champs dans `.cm-toolbar` ou `.cm-grid-2`, un `.cm-note` pour
  l'explication, le bouton d'enregistrement `variant="section"`.
- **Statut d'un traitement** (actualisation, import, IA) → `.cm-chip` colorée + `.cm-bar`,
  les étapes en liste avec `.cm-icon-box.is-sm`.
- **Favoris** → toute liste de matchs ou de championnats passe par `favoritesStore.favoritesFirst`
  (équipes favorites, puis championnats favoris dans l'ordre d'ajout, puis le reste, ordre gardé dans
  chaque bloc) ; un sélecteur préfixe ses favoris de « ★ ». Un CLASSEMENT ne se réordonne jamais : il
  marque la ligne (fond doré léger + `FavoriteStar` non interactive). Couleur des favoris :
  `--cm-gold`, jamais `--cm-section`.
- **Pronostic / avis** → `AiMarketCard` ou le dessin de `MarketPicksBoard` (anneau, pronostic
  en gras, logo, pastilles).
- **Erreur** → `.cm-note.is-danger` ; **avertissement** → `.cm-note.is-warning` ; **vide** →
  `EmptyState` avec une description qui dit quoi faire.

## 6. Ce qu'on ne fait pas

- Pas de nouvelle dépendance npm, pas d'image externe autre que FotMob, pas de police autre
  qu'Inter (déjà chargée).
- Pas de changement de logique : les `computed`, fonctions, appels d'API, stores, props,
  `emit` et noms de routes restent. On peut ajouter un `computed` de présentation (regrouper,
  formater), jamais en retirer un.
- Pas de texte en moins : on peut raccourcir un libellé d'en-tête de tableau si l'info-bulle
  (`title`) garde la version longue.
- Pas de `!important`, pas de couleur en dur, pas de `px` de police sous 10 px.
- Pas de `<select>` natif : toujours `AppSelect` (la liste native s'ouvre en blanc et bleu Windows).
- Pas de classement pour une coupe à élimination directe : une compétition choisie librement
  n'affiche sa table que si elle figure dans `standingsApi.listLeagues()` — sinon `/standings`
  en calcule une fausse (l'EFL Cup en 90 lignes). Et pas de « sur N journées » tiré du
  calendrier sans contrôle : il est souvent incomplet (voir `LeagueStandingsPanel`).
- Les commentaires de code restent en français, dans le ton du projet (ils disent pourquoi).
- Pas de source de données nommée par une API seule (« Cotes marché (Odds API) ») : on dit la
  vraie provenance — fournisseur, fichier sur ce PC, date du relevé (03/10/2026, Pierre : « le
  vrai endroit des données »).
- Pas de voile `position: fixed` pour fermer un menu : dans une carte au fond flouté
  (`backdrop-filter`), il ne couvre que la carte. Écouter `pointerdown` et Échap sur le document.
- Une requête de conteneur ne règle que les DESCENDANTS du conteneur, jamais le conteneur
  lui-même.

## 7. Vérifier

Depuis `ui/src` :

```bash
node <scratchpad>/check-vue.cjs views/MaPage.vue components/…/MonComposant.vue
node <scratchpad>/check-data.cjs views/MaPage.vue components/…/MonComposant.vue
```

Le premier compile (script, gabarit, styles) et signale les composants utilisés sans import.
Le second compare au code d'avant la refonte : toute expression du gabarit ou ligne de script
disparue est listée et doit être justifiée (seule une ligne de pure présentation peut
disparaître). Le rendu se contrôle ensuite dans un bac à sable (jamais sur les serveurs de
Pierre, ports 4000/5173).
