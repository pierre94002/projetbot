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
   (Matchs émeraude, Mes paris or, Historique moteur violet, Feuille de route rose, Réglages cyan) : elle sert aux
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

Piège (06/10/2026) : `--cm-section-soft`, `--cm-section-glow` et `--cm-shadow-section` sont posés sur
`:root` avec `var(--cm-section-rgb)` : ils sont donc calculés à la racine (émeraude) et hérités tels
quels, quelle que soit la section — un fond « soft » reste vert dans Mes paris, Historique moteur et
Réglages. Une section nouvelle les REDÉCLARE dans son bloc `[data-section]` (c'est fait pour la
Feuille de route, rose) ; pour les quatre autres, une seule règle `[data-section]` qui les
redéclarerait corrigerait toute l'appli, à décider avec Pierre puisque tous les écrans changeraient de teinte.

## 3. Composants communs (`src/components/common`)

- **`AppCard`** — le conteneur de tout bloc : `title`, `subtitle`, `eyebrow` (sur-titre couleur
  de section), `icon` (carré teinté devant le titre), `tone` (`glass` | `plain` | `section`
  pour LA carte importante d'une page), emplacement `#actions` à droite du titre.
- **`AppButton`** — `primary` (couleur de section, dégradé, halo), `section` (vert de la marque,
  pour valider/enregistrer), `secondary`, `ghost`, `danger` ; `size` `sm` | `md` ; `#icon`.
- **`TabbedView`** — barre d'onglets segmentée, l'actif en couleur de section ; `count`
  facultatif par onglet.
- **`AppModal`** — panneau latéral droit ; `title`, `subtitle`.
- **`AppSelect`, `AppTextField`, `AppTextarea`, `AppNumberField`, `AppToggle`, `AppSlider`** — champs ; libellé
  en petites capitales, anneau de focus couleur de section. Les aligner dans une `.cm-toolbar`.
  `AppTextarea` (06/10/2026) : le champ sur plusieurs lignes d'une note libre (`rows`, redimensionnable à la
  verticale seulement), même dessin qu'`AppTextField` ; pas de `maxlength` quand une limite doit se SAVOIR
  plutôt que tronquer un texte collé : afficher un compteur et désactiver « Enregistrer ».
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
colonne Forme en pastilles). `FreeOddsPanel` (l'onglet « Cotes » d'un match : la probabilité que donnent les cotes relevées gratuitement, marge retirée ; chaque marché, bookmaker par bookmaker, ouverture → dernière cote d'avant-match → direct, argent misé des bourses ; la provenance de chaque ligne ; et le bloc « Ce qui manque pour ce match »), `FreeOddsCoveragePanel` (Réglages : les cotes de chaque compétition — passées, à venir, direct, volumes — et ce qui manque).
Depuis le 04/10/2026 : `ScreenerView` (onglet « Repérage » de la page Matchs : les matchs à venir classés
par marché — probabilité du moteur, cote du marché, écart, cote jouable, contexte de la saison avec le
nombre de matchs et l'estimation ramenée vers la moyenne ; un classement, donc les favoris sont marqués,
jamais remontés), `DroppingOddsView` (onglet « Chutes de cotes » : les issues dont la cote juste a le plus
baissé depuis l'ouverture, bookmaker par bookmaker), `ClosingValuePanel` (la valeur de clôture des
pronostics du moteur — Historique moteur — et des paris — Performance paris), `ExpectedPointsTable`
(le classement corrigé par les xG, dans `LeagueStandingsPanel`), et le bloc « Ce qui a bougé depuis
l'ouverture » de `FreeOddsPanel`.
Depuis le 06/10/2026 (étape 1 du plan) : `BackupStatusPanel` (Réglages, carte « Sauvegardes » : dernière
sauvegarde de nuit, copies gardées par rôle — quotidienne, hebdomadaire, mensuelle —, restaurations d'essai,
copie hors disque, place restante, copies faites à la main ; LIT `/api/backups`, un état préparé chaque nuit par
l'actualisation, sans rien lancer). Son alerte durable passe aussi par la puce d'actualisation du haut
(`AppTopbar` : « Sauvegarde à vérifier ») et par `RefreshStatusPanel`. Depuis le 05/10/2026, sa section « Copie hors
du disque » dit ce qui s'applique et d'où ça vient (choix enregistré avec son fichier et son heure, variable de
`server\.env`, ou OneDrive détecté par défaut), puis propose le choix en barre segmentée (même dessin que
`TabbedView`, `role="radiogroup"`) : « OneDrive (en ligne) », « Clé USB ou autre dossier » (champ `AppTextField` +
bouton « Vérifier »), « Aucune » ; « Enregistrer » en `variant="section"` (`PUT /api/backups/destination`). La
vérification (`POST /api/backups/destination/check`) est montrée en `.cm-note` : dossier, existence, place,
OneDrive détecté, problèmes — mesurée sans rien écrire. Seule écriture de la carte ; jamais `server\.env`.
Depuis le 05/10/2026 (étape E du plan) : `RecordersStatusPanel` (Réglages, carte « Enregistreurs » : absents du jour,
matchs en direct, cotes payantes archivées, pronostics du moteur gelés ; pour chacun ce qu'il garde, sa provenance —
fournisseur puis table de la base, chemin de la base au-dessus du tableau —, depuis quand, lignes gardées hier et
aujourd'hui, dernier relevé, état `actif` / `coupé` / `en erreur` en `.cm-chip` avec sa raison ; Σ et ⌀ au pied du
tableau ; puis les deux relevés déjà en place avant l'étape E). LIT `/api/recorders`, un état préparé, sans rien
lancer. Son alerte durable (`alerts.enregistreurs`) passe aussi par `AppTopbar` (« à vérifier ») et `RefreshStatusPanel`.
Depuis l'étape 27 (vérification du 21/10/2026) : les alertes durables des contrôles anti-fuite de la nuit (`alerts.tableJourJ`,
`alerts.forcesButs`) passent par `RefreshStatusPanel` (une `.cm-note` `is-warning`, icône `shield`, « Contrôle anti-fuite de la nuit : à
regarder », une ligne par contrôle en mots simples, `data-controle-anti-fuite`, rien pendant une passe) et par `AppTopbar` (le repère et
son survol) ; mots : `utils/controlesAntiFuite.js`.
Depuis l'étape 4 du plan : `ClaudeBudgetPanel` (Réglages, carte « Budget Claude ») — UN seul composant pour le budget
Claude, repris tel quel par la feuille de route, la santé du moteur et la page Bulletin. `variante="complete"` : le mode
(`.cm-chip` « Mode normal » / « Mode économe ») et sa raison, la puce « réglage provisoire, à confirmer » tant que rien
n'est enregistré, trois tuiles (tokens du jour et de la semaine face au budget, barre `.cm-bar` avec le repère des 80 %
en ambre, et le plafond quotidien de 150 rappelé), ce que l'appli voit (ses appels, jamais le pourcentage de
l'abonnement), l'accord entre le compteur du plafond et le journal, le tableau par type d'appel (six lignes toujours
affichées, Σ et ⌀ par appel au pied), l'API à la clé hors budget, les règles du mode économe et leur effet du jour, les
derniers appels (entrée, écriture et lecture en cache, sortie, équivalent API, issue), le réglage (`reglable` : deux
`AppNumberField`, mode en barre segmentée `role="radiogroup"`, « Enregistrer » en `variant="section"`,
`PUT /api/claude-budget/reglage`), la provenance (dossier du journal, fichier du réglage). `variante="compacte"` : le
mode et les trois tuiles seulement. LIT `/api/claude-budget`, un état préparé, sans rien lancer.
Depuis l'étape 5 du plan (06/10/2026) : `RoadmapView` (menu « Feuille de route », `/feuille-de-route`, section rose
`[data-section='roadmap']`) — le plan en 9 lots et 49 entrées (0, 1 à 5, E, 6 à 47). Bandeau (`.cm-hero`) : la semaine du plan
où l'on est, étapes terminées sur 49 en `.cm-chip`, barre d'avancement générale (`.cm-bar`) et ses quatre états en puces
(une puce à zéro reste neutre), puis la ligne « Tests : N réussis + M constats à suivre, aucun échec — dernier passage le … »
(verte, rouge si un test a cassé) tirée de l'historique du code. En tête, DEUX composants existants en variante courte, jamais
un doublon : `BackupStatusPanel variante="compacte"` (chiffres clés et alertes de `/api/backups`, lien vers le détail dans
Réglages) et `ClaudeBudgetPanel variante="compacte"`. Puis les 9 lots : `RoadmapLot` (une `AppCard` + `CollapsibleSection` : numéro,
nom, étapes terminées sur total en `.cm-pill` et `.cm-bar`, objectif chiffré du lot en `.cm-note`, ses étapes, et au pied la
PLACE du bilan de fin de lot — `.cm-block` en tirets, « pas encore fait » tant que BILANS_DE_LOT est vide) ; ouverts au
premier affichage : ceux où une étape est en cours ou prévue cette semaine. `RoadmapStep` (un `.cm-block` par étape :
numéro teinté selon l'état, nom exact du plan, pastille d'état — à faire / en cours / terminée en vert / mise de côté en
ambre —, réglage (lettre A, B, O, C, S et son nom), semaine prévue, durée prévue, date de fin, « Ce qui a changé » et « Gain
mesuré » côte à côte dès 640 px de large de la carte, « pas encore mesuré » tant qu'aucune mesure n'est écrite, et la note
de Pierre : `AppTextarea` + « Enregistrer » en `variant="section"`, un texte vide efface ; le brouillon vit dans
`composables/useBrouillonsNotes.js` : replier un lot ne le perd pas). Tout est LU sur `GET /api/roadmap` (le plan et
l'historique sont écrits dans le CODE du serveur, `data/roadmap/plan.js` et `historique.js`, parce que les données
d'exécution du bac ne sont jamais recopiées) ; seule écriture : `PUT /api/roadmap/etapes/:id/note` (idempotent),
dans `data/runtime/roadmap.json`. Fichier des notes illisible : la page le dit, garde le plan, désactive l'écriture. Pied de
page : la provenance réelle (fichiers du plan, de l'historique et des notes). Lisible dès 375 px de large : chaque bloc se règle
sur SA largeur (`container: rlot` et `rstep`), jamais sur celle de l'écran.
Depuis l'étape 16 du plan (07/10/2026) : dans `RoadmapStep`, sous « Ce qui a changé » / « Gain mesuré » (qui ne bougent pas),
le bloc **« Preuve après lancement »** (`HelpTip terme="preuve-apres-lancement"`), SEULEMENT quand l'étape a une `mesure` (les 15
étapes qui toucheront aux chiffres, ou une étape qui a une entrée au registre de la mesure) : un bloc teinté (`--cm-surface-alt`,
filet `--cm-border-soft`), cinq lignes en grille, deux colonnes dès 640 px de large de la carte, TOUJOURS les cinq — Lancement
(« 09/11/2026 · version … » ou « pas encore lancée : les matchs d'avant ne comptent pas »), Matchs jugés (« 1 240 matchs, du 10/11 au
24/11 (jugé le 25/11/2026) » ou « pas encore jugée »), Gain et fourchette (`HelpTip fourchette-du-hasard` ; le gain en gras,
« +0,4 % [−0,2 ; +1,0] de perte log en moins », une décimale, signe toujours écrit, vrai signe moins), Variantes essayées (`HelpTip
variantes-essayees` ; « 3 » ou « aucune déclarée »), Verdict sur toute la largeur : une `.cm-chip` — « retenu » `is-accent` + `check`
(le vert « validé » de la page, comme « Terminée » : PAS le vert des paris, ce n'est pas une value), « pas prouvé » neutre + `info`,
« moins bon » `is-danger` + `alert`, « pas assez de matchs » `is-warning` + `clock`, « pas encore jugée » neutre + `clock` —, puis la
raison du juge en petit. Registre illisible : chaque ligne dit « registre de la mesure illisible pour l'instant » et la pastille
« registre illisible » (ambre), jamais « pas encore lancée ». Ce qui manque est en gris (`rstep__manque`). Les règles sont dans
`utils/preuve.js` (pur, rejoué par `server/test/preuveEcran.test.mjs`) ; le nombre de matchs est celui du dernier jugement (la page
n'ouvre jamais la base). Le bloc n'emploie ni « Gain mesuré » ni « pas encore mesuré », que les tests d'écran comptent. Le
pied de page « D'où viennent ces données » de `RoadmapView` cite aussi le registre de la mesure (`provenance.registre`) : « pas encore
de fichier », « illisible pour l'instant » ou « N jugements, dernier enregistrement le … » — et rien quand le serveur n'est pas encore
relancé après la recopie (pas de `mesureRegistre` dans sa réponse : pas de ligne plutôt qu'une page cassée).
Depuis l'étape 6 du plan (06/10/2026) : les sept composants du **langage visuel des paris** — `ValueBadge`, `ConfidenceGauge`,
`OddsMoveArrow`, `LineupStateBadge`, `KickoffCountdown`, `ProvenanceChip`, `HelpTip` — décrits au § 3 bis. Une notion de pari
s'affiche avec eux, jamais avec un `.cm-chip` colorié à la main.
Depuis l'étape 8 du plan (06/10/2026) : `OpportunitiesView` (onglet « Opportunités » de la page Matchs, juste après « Matchs » ; l'adresse
`/opportunites` y mène, le clic sur une notification aussi). UN onglet plutôt qu'une entrée du menu : le menu garde ses cinq sections,
une couleur chacune (la section de couleur est celle de Matchs), et la page vit à côté du Repérage et des Chutes de cotes qu'elle réunit.
Bandeau (`.cm-hero`) : paris de la liste, « N values jouables » en `.cm-chip` NEUTRE (le vert reste celui des pastilles), chutes de
cote, prochain coup d'envoi (`KickoffCountdown`), « Recalculer » ; la provenance réelle en `ProvenanceChip` (moteur et heure du calcul,
« Cotes de vos bookmakers » The Odds API payant, « Mouvements » des relevés gratuits) ; l'interrupteur de la notification (`AppToggle`
dans un bloc `--cm-surface-alt`, avec ce qu'en dit le navigateur : bloquée, non prise en charge, activée et dernière vérification) ; la
`.cm-toolbar` des filtres (`AppSelect` : compétition avec favoris étoilés, marché, value minimale, période). Puis les notes (coupe-circuit
enclenché ; « Ce qui manque », avec `PaidOddsAdvicePanel variante="compacte"` quand aucune cote de vos bookmakers n'existe) et LE tableau
(`.cm-table`, en-tête collant) : rang, match (jour et heure, `LeagueBadge`, `TeamCrest`, étoiles des favoris, lien vers la page du
match), pari, moteur (probabilité et cote juste, `HelpTip cote-juste`), cote (celle que le moteur a jugée, son bookmaker, « relevée il y
a … », le bookmaker « juge et partie » écarté en italique), value (`ValueBadge :verdict`, `HelpTip value`), mouvement (`OddsMoveArrow`
de la cote juste, « chute · N sur M »), `LineupStateBadge`, `KickoffCountdown variante="texte"`, `ConfidenceGauge` (« pas encore
mesurée », `HelpTip sur-fragile`). Tri par value — la verte d'abord, à l'heure qu'il est — et FAVORIS EN TÊTE (la ligne garde son fond
doré) : contrairement au Repérage, ce n'est pas un classement mais une liste de paris à regarder. Les règles (filtres, tri, notifications)
sont dans `utils/opportunites.js` (pur, testé sans navigateur) ; la lecture est `GET /api/opportunities`, un état préparé.
Depuis l'étape 12 du plan (06/10/2026) : `DataHealthPanel` (Réglages, carte « Carnet de santé des données », juste après « Couverture des
statistiques ») — LIT `GET /api/match-stats/health`, un état préparé chaque nuit par l'étape « Contrôles et carnet de santé des données » de
l'actualisation (`server/scripts/data-health.mjs`), sans rien lancer ni corriger ; relue à la fin de chaque passe (`passe-terminee-le`). Quatre
`.cm-kpi` (dernier contrôle complet ou de nuit, rencontres au magasin, anomalies dont erreurs, complétude moyenne), la provenance réelle
(`ProvenanceChip` : « Magasin FotMob · base SQLite (lecture seule) », heure du contrôle, fichier du carnet ; ambre au-delà de 48 h), puis LE
carnet : `.cm-toolbar` (`AppSelect` du championnat, favoris étoilés d'abord ; barre segmentée `role="radiogroup"` « Saison en cours » / « Toutes les
saisons », même dessin que `TabbedView`), un `.cm-table` — championnat (`LeagueBadge`, et sous lui ce que la ligne ne peut pas avoir : « xG non
publiés par FotMob… », « sans feuille », « attribués, hors calcul », « saison partielle », « saison en cours »), saison et ses dates, Total (matchs
joués), les six parts (xG, tirs, corners, cartons, joueurs, compos) et la Moyenne de la ligne, chaque part en `--cm-accent` (≥ 90 %), `--cm-warning`
(≥ 50 %) ou `--cm-danger` — le code de couleur du tableau de couverture voisin, qui dit « donnée présente », jamais une value ; au pied, **Σ** (les
comptes des lignes affichées) et **⌀** (la part sur tous ces matchs réunis : jamais une somme ni une moyenne de pourcentages ; règle
`utils/carnetSante.js` = `totauxDuCarnet` du serveur, test à l'appui) ; la phrase du recoupement avec le tableau de couverture. Puis les
anomalies : barre segmentée des six sortes avec leurs comptes, `.cm-table` (match concerné — ou « saison entière » —, la sorte en `.cm-chip` avec
son icône et le constat, la gravité en `.cm-chip` rouge / ambre / neutre, la date du contrôle et celle de la découverte), « Voir N de plus » ; deux
`HelpTip` à phrase propre (`titre`/`texte`). Serveur en erreur, pas encore relancé, carnet illisible ou jamais contrôlé : la raison est dite et
les deux tableaux restent, vides.
Depuis l'étape 13 du plan (06/10/2026) : `FdHistoryPanel` (Réglages, carte « Historique football-data », juste après le carnet de santé, icône
`history`) — LIT `GET /api/match-stats/fd-history`, un résumé préparé à la fin de chaque passe par l'étape « Historique football-data » de
l'actualisation (`server/src/data/providers/footballDataHistory.js`), sans rien télécharger ni recompter ; relue à la fin de chaque passe
(`passe-terminee-le`). Cinq `.cm-kpi` (import : pas encore / en cours avec le reste en fichiers et en passes / complet ; saisons gardées ; part des matchs
depuis 2023 rattachés à FotMob avec le même score, en `--cm-accent` à l'objectif de 95 %, `--cm-warning` dès 80 %, `--cm-danger` en dessous — la
couleur du tableau de couverture, « donnée présente », jamais une value ; clubs reconnus ; taille ajoutée à la base), la provenance réelle
(`ProvenanceChip` : « football-data.co.uk · fichiers CSV gratuits », date du dernier relevé, dossier des fichiers gardés ; ambre au-delà de 8 jours),
une `.cm-note.is-info` qui dit ce que l'historique donne et ne donne pas (rien pour 1,5 ou 3,5 buts ni pour « les deux marquent »), puis quatre
tableaux `.cm-table` : les championnats (barre segmentée `role="radiogroup"` « Championnats suivis » / « Tous les fichiers », favoris d'abord ;
`LeagueBadge` pour un championnat du magasin, `PlayerFlag` du pays et le nom football-data sinon ; saisons, matchs, clubs reconnus, rattachés depuis
2023, écarts, dernier relevé ; au pied **Σ** des lignes affichées et **⌀** sur tous ces matchs et clubs réunis — règle `utils/historiqueFd.js`,
jamais une moyenne de pourcentages), les cotes gardées (une ligne par livre, une case par marché et moment : « 2005-06 → 2026-27 » et le nombre de
matchs, ou « pas publié par football-data »), saison par saison (William Hill, Pinnacle et la moyenne, 1 N 2 avant-match et clôture, en part des
matchs ; Σ et ⌀ au pied), les fichiers en échec (avec la raison, et « relecture de la semaine manquée » quand les matchs d'avant restent), les écarts de
score entre football-data et FotMob (le match, les deux scores, la rencontre FotMob ; « Voir N de plus »). Quatre `HelpTip` à phrase propre. Serveur
en erreur, pas encore relancé ou jamais importé : la raison est dite et les tableaux restent, vides.
Depuis l'étape 15 du plan (07/10/2026) : `LeagueBenchmarksPanel` (`components/team-stats`, onglet « Statistiques ligue », `AppCard` « Repères du
championnat », icône `history`, sur-titre « Source : FotMob et football-data.co.uk », posée APRÈS la carte « Domicile face à extérieur » et affichée dès
qu'un championnat est choisi, même si son classement manque) — LIT `GET /api/match-stats/benchmarks?league=…`, une table calculée chaque nuit par
l'étape « Repères de chaque championnat » de l'actualisation (`server/src/data/db/leagueBenchmarks.js`), sans rien recalculer ; un bouton « Relire ».
Quatre `.cm-kpi` (saisons et leurs sources, matchs de championnat, buts par match avec la valeur retenue et la moyenne des championnats, avantage du
terrain avec victoires / nuls / défaites), la provenance réelle (`ProvenanceChip` : « football-data.co.uk (fd_history) · FotMob (magasin) », date du
calcul, chemin de la base, et au survol les saisons et les matchs de chaque source ; ambre au-delà de 48 h), une `.cm-note.is-info` « Une saison, une
seule source ». Puis LA PETITE COURBE (`figure` sur `--cm-surface-alt`, SVG étiré, repères en HTML à gauche comme `GainCurvesChart`) : deux barres
segmentées `role="radiogroup"` (le repère : buts, nuls, +2,5, les deux marquent, corners, jaunes ; « Saison par saison » / « Mois par mois ») ; saison
par saison un point par saison, plein pour FotMob (`--cm-info`), creux pour football-data (`--cm-violet`), la saison en cours cerclée, la moyenne de
toutes les saisons en tirets ; mois par mois la forme d'une saison (toutes les saisons réunies, mois d'au moins 10 matchs, trait plein) et la saison
la plus récente (tirets violets), dans l'ordre de la saison (juillet → juin, ou janvier → décembre pour « 2026 ») — **jamais le vert ni le rouge** :
une tendance n'est ni bonne ni mauvaise. Puis trois `.cm-table` : saison par saison (la plus récente d'abord ; la source de CHAQUE saison en `.cm-chip`
— FotMob `is-info`, football-data.co.uk `is-violet` —, ses matchs, et sous elle « saison en cours », le fichier football-data, les écartés ; quinze
colonnes de repères, tirs cadrés, rouges et penalties tirés en petit sous leur colonne ; une case vide dit pourquoi — « non relevé par
football-data.co.uk », « pas dans le fichier par pays… », « aucune feuille FotMob avec ce relevé » — jamais un tiret ; les scores les plus fréquents ;
au pied « Toutes les saisons » (Σ matchs et saisons ; chaque repère pondéré par ses matchs, règle `utils/reperes.js` = celle du serveur, jamais une
somme ni une moyenne de pourcentages), « Valeur retenue » (au survol : le poids de la moyenne des championnats en matchs) et « Moyenne des N
championnats » (chacun compte pour un)) ; la dispersion et le facteur de terrain mesurés (corners, tirs, tirs cadrés × « ce championnat » / « tous les
championnats » : chaque mesure, son intervalle à 95 %, la valeur retenue et celle du moteur, « hors de l'intervalle » en ambre — à regarder, jamais un
verdict —, la dispersion brute pour comparaison ; « Mesuré seulement : le moteur garde 1,10 / 0,90… » au pied) ; le recoupement FotMob / football-data
sur les saisons qu'ils ont tous deux (repère, deux valeurs, écart signé, matchs de chaque côté). Quatre `HelpTip` à phrase propre. Jamais calculé, coupe
(« Les coupes sont tenues à part… »), serveur en erreur ou pas encore relancé : la raison est dite en `.cm-note` et les trois tableaux gardent leur
structure. Lisible en panneau étroit : `container: lbp` (repères de la courbe resserrés sous 560 px), les tableaux défilent dans leur cadre.
Depuis l'étape 14 du plan (07/10/2026) : le **contrôle quotidien** et la **santé des sources**. Deux cartes de Réglages, juste après
« Actualisation automatique » : `DailyChecksPanel` (« Contrôle quotidien des données », icône `activity`, sur-titre « Qualité des données ») — LIT
`GET /api/health/checks`, un état préparé à la fin de CHAQUE passe par l'étape « Contrôle quotidien des données et santé des sources »
(`server/src/data/db/dailyChecks.js`), constats re-datés et sources relues à la lecture, sans rien lancer ni corriger ; relue à la fin de chaque passe
(`passe-terminee-le`), et montrée (défilement) quand on arrive par la puce du haut (`?carte=controle-quotidien`, propriété `montrer`). Quatre `.cm-kpi`
(le FEU : une pastille ronde ET son mot — vert, orange, rouge ; les contrôles et leurs comptes par couleur ; la durée de la passe, ses rencontres et le
plus long moment où le serveur a été tenu ; les clubs et championnats « à vérifier » — ceux dont le prochain pari peut porter le badge : pas un club dont seules les données des joueurs sont douteuses, buteurs ou gardiens qui ne font pas le score, rouges dans la carte mais sans badge tant qu'aucun marché de joueur n'existe), la provenance réelle (`ProvenanceChip` : « Magasin FotMob · base
SQLite (lecture seule) et notes des sources », heure du contrôle, fichier ; ambre au-delà de 6 h), la règle des couleurs en une phrase. Puis les
contrôles EN ÉCHEC d'abord (rouge, en panne, orange), un `.cm-block` chacun : `.cm-chip` du statut (rouge `is-danger`, orange `is-warning`, en panne
ambre, pas fait neutre — icône ET mot), libellé, famille, la phrase du serveur, puis ses constats avec leur âge (« nouveau », « connu depuis le … »,
« vu depuis le … ») — un seul constat : la phrase le dit déjà, seul son âge s'ajoute —, cinq montrés puis « Voir les N autres ». Puis TOUS les
contrôles dans un `.cm-table` à un `tbody` par famille (sept, toujours là, même vides : « Aucun contrôle de cette famille dans l'état lu » ; serveur
muet : « Non lu ») : contrôle et ce qu'il regarde, état, ce qu'il a trouvé, constats ; au pied **Σ** des contrôles par couleur et des constats. Puis
les dernières passes (feu, rouges, orange, durée ; au pied Σ et **⌀** de la durée). Le vert d'ici dit « données vérifiées », jamais une value ; et
jamais « vert » sans contrôle : tant que le premier n'est pas fait, le feu dit « pas encore » (une source en difficulté, elle, se lit déjà).
`SourceHealthPanel` (« Santé des sources », icône `globe`) — LIT `GET /api/health/sources` : SIX lignes toujours (FotMob, football-data.co.uk, The Odds
API, API-Football, Claude, cotes gratuites ; serveur muet : six lignes « non lu ») — la source, son rôle, « payant » en `.cm-chip` (icône `euro`), son
état en `.cm-chip` (en bon état `is-accent`, à surveiller `is-warning`, en panne `is-danger`, coupée ou inconnue neutre) et la phrase du serveur, le
dernier relevé (heure et quoi), la limite (crédits, appels du jour sur 100, date d'expiration du jeton) et le détail (fichiers lus ; pour FotMob, depuis
le 07/10/2026 (lot 3), une ligne de plus sur le TEXTE MINUTE PAR MINUTE que lit la revue d'après-match — fichiers lus, langues absentes, échecs : un 403 y dit « ce
fichier n'existe pas dans cette langue », compté à part et jamais une panne ; trois échecs de suite mettent la ligne « à surveiller », jamais « en panne », ce mot ne
parlant que de l'API de FotMob dont les totaux et la série ne comptent pas ces fichiers ; rien de plus à dessiner : la carte affiche les lignes de détail du serveur) ; quatre `.cm-kpi`
de comptes, Σ au pied. Le seul réglage de la carte : la date d'expiration du jeton Claude (`AppTextField type="date"` et « Enregistrer » ; « à
confirmer » en `.cm-chip is-warning` tant que c'est la date notée à la création du jeton), `PUT /api/health/jeton-claude`. Le pied rappelle le plan
de secours FotMob et qu'aucune source payante n'est appelée pour lire ses crédits. La **puce du feu** dans `AppTopbar` (lue dans le champ
`controleQuotidien` de `GET /api/refresh`, déjà relu chaque minute) : un point de couleur ET un mot (« Données vérifiées », « Données : à regarder »,
« Données : à vérifier », « Contrôle : pas encore fait » ; sous 900 px, le mot court — vert, orange, rouge), les contrôles en échec au survol et pour les lecteurs d'écran
(`title` = `aria-label`), un clic mène à la carte ; absente quand l'API est hors ligne ou que le serveur ne connaît pas encore l'étape. Le badge
**« À vérifier »** (`AVerifierBadge`, voir 3 bis) là où un verdict est affiché. Règles d'écran (mots, tons, familles de marché) :
`utils/controleQuotidien.js`, rejouées par les tests du serveur (`familleDuMarche` = celle du serveur).
Depuis l'étape 25 du plan (07/10/2026, le socle des versions du moteur) : `EngineVersionsPanel` (Réglages, carte « Versions du moteur », icône
`history`, sur-titre « Moteur », juste SOUS « Paramètres du moteur » et avant « Gestion du risque ») — LIT `GET /api/config/versions`, un état du serveur
qui n'écrit rien ; relue après chaque enregistrement des réglages (`changement-le` = `configStore.derniereVersion.le`) et à la fin de chaque passe
(`passe-terminee-le`). Une phrase simple de ce qu'est une version ; quatre `.cm-kpi` (la version en service en `is-section` — « n° 3 », sa date à Paris
et ce qui l'a créée — ; les versions notées et la date de la première ; la candidate en essai — « aucune », « la première viendra de l'étape 27 » — ;
le retour arrière — « vers la n° 2 », ou « pas maintenant » et sa raison), la provenance réelle (`ProvenanceChip` : « Registre des versions du moteur,
sur ce PC », date de mise à jour, le fichier au survol) et « Relire ». Puis « Ce qui a changé avec la version en service » (une ligne par réglage : son
nom, avant → après, pourcentages en %, vrai signe moins, bookmakers par leur nom ; pour le code, les fichiers modifiés, ajoutés, retirés ; une version
sans changement le dit), le tableau des versions précédentes (`.cm-table` TOUJOURS là, même vide ou en erreur : n°, notée le, ce qui l'a créée, ce
qu'elle a changé, sa place dans le retour — « la prochaine si vous revenez en arrière », « plus loin en arrière », « défaite par un retour arrière »,
« avec un autre code : pas de retour d'un clic » — ; au pied **Σ** des versions), la candidate dans un `.cm-block` (sa fiche — identifiant, étape, marchés
calculés à blanc, en essai depuis — ou « Aucune version candidate en essai pour l'instant », et toujours « jamais montrés comme pronostic, jamais
pariés, jamais envoyés à l'IA »), le retour arrière dans un `.cm-block` (ce qu'il remettrait, ligne par ligne ; le bouton « Revenir à la version
précédente » en `variant="secondary"`, désactivé avec sa raison écrite quand il n'est pas possible — première version, passe en cours, autre code,
registre illisible — ; TOUJOURS une confirmation `window.confirm` qui dit exactement ce qui revient et que rien d'autre ne change ; la version vue à
l'écran est envoyée, un double clic ne recule jamais de deux versions ; `@retour` remet le formulaire des paramètres), puis la PLACE de ce qui viendra
après la calibration : deux blocs en tirets (« Adopter une candidate », « Alerte de dérive », `.cm-chip` « après la calibration (étape 20) »), AUCUN
bouton « Adopter ». Aucun vert : rien ici n'est une value. Les mots viennent de `utils/versionsMoteur.js` (pur, rejoué par
`server/test/versionsMoteurEcran.test.mjs`). Un enregistrement des réglages garde son message d'avant mot pour mot et dit la version dans un second
message (« Nouvelle version du moteur : n° 3. », « Retour à l'état de la version 1 du moteur. »). Lisible en panneau étroit : `container: ev`.
Depuis la SECONDE MOITIÉ de l'étape 25 (14/10/2026 : l'adoption « si meilleure » et l'alerte de dérive), la même carte : six `.cm-kpi` (deux de
plus : « Adoption » — « possible », « pas maintenant » et sa raison, « refusée » en `is-danger`, « pas prouvé » en `is-warn`, « rien à adopter » — et
« Dérive » — « alerte » en `is-danger`, « aucune », « pas encore jugée ») ; la fiche de la candidate dit aussi d'où elle vient et l'horizon de son
verdict, et la dernière candidate adoptée ; sous elle, SEULEMENT quand une candidate existe, `EngineCandidateTrial` (pur affichage, il émet
`adopter` et `banc`, n'appelle rien) : l'essai à blanc dans un `.cm-block` (`.cm-chip` de son état — « essai n° 1 depuis le 01/10/2026 », « jugée
le … » — ; matchs joués comparés et jours sur l'horizon ; un `.cm-table` TOUJOURS là — la version en service, la candidate, leur erreur de
prévision, l'écart au pied, « premiers chiffres : pas de verdict avant l'horizon ») ; les DEUX verdicts côte à côte dès 720 px du bloc (requête de
conteneur `ect`), jamais confondus : « Verdict de l'essai à blanc » avec la `.cm-chip is-section` « décide » et « Verdict du banc d'essai » avec son
étiquette « indicatif : l'essai à blanc n'a pas encore assez de matchs » puis « pour mémoire : l'essai à blanc a décidé », chacun avec sa pastille
(`.cm-chip` : « retenu » en `is-info`, « pas prouvé » en `is-warning`, « moins bon » en `is-danger` — JAMAIS le vert, rien ici n'est une value) et le
bouton « Passer au banc d'essai (matchs passés) » en `variant="secondary"` ; l'adoption dans un `.cm-block` (sa raison, en rouge pour un refus ; ce
qu'elle changerait, ligne par ligne ; le bouton « Adopter la candidate » en `variant="primary"` — la couleur de section, jamais `variant="section"`
qui est vert —, actif SEULEMENT quand le serveur dit `adoption.possible`, c'est-à-dire sur « retenu »). La carte confirme TOUJOURS l'adoption
(`window.confirm` : le verdict et son chiffre, ce qui change, comment revenir) et envoie la version ET la candidate vues à l'écran ; le formulaire des
paramètres reprend les réglages adoptés par le magasin de Réglages (`configStore.appliquerAdoption`, appelé seulement au clic : la carte n'a pas
d'événement de plus). Puis l'alerte de dérive dans un `.cm-note` (en `is-danger` quand l'alerte est posée : la phrase, ses signaux en liste, le
dernier mois figé jugé, la règle en trois phrases ; `HelpTip terme="calibration"`), et la place de l'étape 26 en tirets (« Le réglage refait chaque
mois »). La place d'avant (« après la calibration (étape 20) ») n'est plus montrée que par un serveur pas encore relancé. Termes du guide posés :
`preuve-apres-lancement`, `fourchette-du-hasard`, `banc-d-essai`, `variantes-essayees`, `calibration` — aucun terme nouveau. La feuille de route :
une `.cm-note is-danger` « Dérive du moteur » au-dessus des lots quand l'alerte est posée (`phraseDeLAlerteDerive`, la même phrase que la carte).
Rejoué par `server/test/adoptionMoteurEcran.test.mjs` sur les réponses du vrai serveur.
Depuis l'étape 27 du plan (21/10/2026, le modèle de buts unique) : sous la fiche de la candidate et AVANT son essai, SEULEMENT pour une candidate
au modèle de buts (`estUnModeleDeButs`), `EngineGoalModelTrial` (pur affichage, `.cm-block`, `container: egm`, icône `layers` en `is-violet`,
`HelpTip terme="modele-de-buts"`) : la porte 1 du banc d'essai (2019-2023) — ses critères en mots et la réserve ACCEPTÉE écrite telle quelle, en
ambre pointillé —, un `.cm-kpi` par famille (verdict de l'essai en mots, « pas encore » avant l'horizon, le chiffre du banc en détail, « +7,9 % d’erreur de prévision en moins, retenu », fourchettes signées comme
sur la feuille de route ; « pas
prouvé » en `is-warn` avec « normal à 800 matchs », « moins bon » en `is-danger`, jamais le vert), la phrase « Une famille « pas prouvé » à 800
matchs est l'issue normale ; seul « moins bon » est un échec. », la calibration de chaque version par famille (`HelpTip terme="calibration"`), les
régimes (« cotes + plus/moins 61 % · cotes 1N2 seule 34 % — … · sans cote 5 % : trop peu pour juger »), la porte de l'adoption et l'horizon
(« 412 matchs sur 800, jour 11 sur 21 »). La fiche dit les marchés et les témoins en mots (les identifiants au survol), et la phrase en mots simples de la candidate (`enMots`, le chiffre clé
aussi) : son « quoi » technique (celui du registre) n'est plus qu'au fond d'un `<details>` replié, « Détail technique ». Les mots viennent de
`utils/versionsMoteur.js`. « Paramètres du moteur » dit le modèle (« Modèle de buts unique : activé… » / « absent — ancien modèle de buts ») ;
quand il est en service, « Réinitialiser les valeurs par défaut » le dit dans une confirmation (`SettingsView`, `avertissementDeLaRemiseAZero`).
Les écrans de match ne changent qu'avec la clé `modeleDeButs` en service : `GoalModelProvenance` (une `ProvenanceChip variante="ligne"` : le mot
court du régime en violet en tête, le vrai fournisseur de chaque morceau, l'heure du relevé du plus/moins ou du calcul, la cote absente dite ;
`compacte` : le mot seul, le fournisseur au survol) sous « Buts » et sur « Les 2 équipes marquent » / « Résultat + total » (`MarketPicksBoard`,
prop `provenanceButs`) et sur la carte du score (avec « Ce que disent les xG » en `.cm-kpi` violets, « autre score » dès 0,5 %, la fiabilité du banc
et son périmètre selon le régime — « pas encore mesurée » pour un match calé sur la cote 1N2 seule) ; le Repérage (la pastille compacte par match, la bulle de la colonne 2,5) ; le verdict par marché (la phrase de la value sur
le 2,5 calé sur la cote). Mots : `utils/modeleDeButs.js` (le mot court et la phrase de chaque régime viennent du serveur, `core/engine/motsDuModeleDeButs.js`,
HORS de l'empreinte du moteur : corriger une phrase ne crée pas de version), rejoué par `server/test/modeleDeButsEcran.test.mjs` sur les analyses du vrai moteur ;
chaque élément porte `data-modele-de-buts`, et aucun ne paraît sans la clé (même test, et `pageMatchDecisionEcran.test.mjs`). La feuille de route :
le bloc « Banc d'essai sur des matchs jamais vus (2019-2023) : avant / après » de l'étape 27 (`RoadmapStep`, `.cm-table` toujours complet, en-têtes « Avant (ancien modèle) » / « Après (modèle de buts unique) » qui
restent justes après l'adoption, avant la preuve après lancement ; `utils/bancAvantApres.js`) ; une étape que l'historique ne raconte qu'en partie (lignes `partielle`) est « En cours » et
dit ce qui lui reste sous « pas encore terminée » (`etape.reste`, en couleur de section : « en essai à blanc, adoption à venir »).
Depuis l'étape 28 du plan (27/10/2026, la simulation complète, livrée à blanc) : dans la même carte, après le bloc du modèle de buts,
`EngineSimulationTrial` (`.cm-block`, `data-simulation-reglages`, `HelpTip terme="deroule-simule"`) — LIT lui-même `GET /api/simulation/etat`, un
état rangé par la nuit, sans rien calculer — : la PORTE 1 en mots simples (réussie, les combinés meilleurs que le produit des simples, avec
leur chiffre et sa fourchette ; les effets du score ; les deux marchés écartés et pourquoi — annoncé, arrivé — ; la date ; « ils restent éteints
en v1 »), la dernière nuit des fins de saison (combien, durée, mémoire, les championnats non calculés NOMMÉS derrière « Voir les N championnats
non calculés ») et celle des déroulés (rencontres, analyses, chemins à part, contrôle), l'avancement de la preuve sur vos matchs (« 312 matchs sur
800, 9 jours sur 21 », `HelpTip terme="preuve-apres-lancement"`), puis « Ce que l'appli montre » : les DEUX interrupteurs en `AppSelect`
(« Fins de saison et enjeu » : éteint / allumé ; « Combinés et déroulé » : éteint / combinés / tout), la valeur rangée ET ce qui est vraiment
montré, relu avec ses conditions à chaque lecture (« tout » rangé sans le modèle de buts en service ni la preuve « retenu » : montré éteint, la
raison en ambre, il se rallume de lui-même) et la liste de ce qui manque aux combinés. Un choix écrit `simulation_state` SEULEMENT (jamais les
réglages du moteur, aucune version) ; « combinés » et « tout » sont refusés avec leur phrase tant que les conditions manquent. Provenance réelle
et « Relire ». Aucun vert. Mots : `utils/simulation.js` ; rejoué par `server/test/simulationEcrans.test.mjs`.
Depuis l'étape 17 du plan (12/10/2026) : `DayTablePanel` (Réglages, carte « Table du jour J », icône `calendar`, sur-titre « Statistiques », juste après
« Historique football-data ») — LIT `GET /api/match-stats/day-table`, l'état noté à la fin de la dernière construction ou nuit par l'étape « Table du
jour J (ce qu’on savait la veille) » de l'actualisation (`server/src/data/db/dayTable.js`), sans rien calculer ni recompter ; relue à la fin de chaque
passe (`passe-terminee-le`) et par « Relire ». QUATRE lignes dans un `.cm-table`, toujours les quatre — pas encore lue (« non lu »), sans table (« pas
encore construite : la première passe d’actualisation la construit (une minute après le démarrage de l’appli, 1 à 2 min) », « jamais construite »,
« pas encore contrôlée »), en erreur, d'une autre version, passe commencée et pas finie, table en retard sur le magasin (« le magasin va jusqu'au … »),
rencontres refusées (identifiant de club mal formé, sous Équipes), contrôle « pas fait » avec sa raison (ambre, la raison écrite) : Équipes (lignes,
rencontres, journées de championnat), Joueurs (lignes,
joueurs), À jour (jour de la dernière rencontre, heure de la mise à jour à Paris, date de la construction), Contrôle anti-fuite (`HelpTip
terme="table-du-jour-j"`, le seul terme du guide de la carte ; une `.cm-chip` « 0 écart » `is-accent` avec « 40 lignes recalculées depuis les tables
sources, 0 écart », ou « N écarts : à regarder » `is-danger` et la liste des écarts — colonne, rencontre ou joueur, valeur de la table et valeur
recalculée, lecteur — dans une `.cm-note.is-danger` ; la graine du tirage, pour le rejouer). La provenance réelle (`ProvenanceChip` : « magasin SQLite, calculé chaque nuit par
l'actualisation », heure de la mise à jour, chemin de la base au survol ; ambre au-delà de 48 h) et un pied qui dit « Mesurée seulement : le moteur ne
lit pas encore cette table ». Jamais « Gain mesuré » ni « pas encore mesuré » ; aucun vert de value. Les textes viennent de `utils/tableJourJ.js` (pur,
rejoué par `server/test/tableJourJ.test.mjs` sur les vraies réponses de la route). Lisible en panneau étroit : `container: djj`.
Depuis l'étape 19 du plan (13/10/2026) : l'onglet **« Banc d’essai »** d'Historique moteur (section `history`, violet ; deuxième des
`TABS` de `PredictionsHistoryView`, juste après « Historique moteur » ; `/banc-d-essai` y mène) — `BenchView` LIT `GET /api/bench` (une seule lecture, rien calculé à l'écran ; relue toutes les
5 s pendant un rejeu, dans le navigateur seulement) et montre TOUJOURS ses sept blocs, dans cet ordre : (1) la **note de départ** (`.cm-hero`, `HelpTip
terme="note-de-depart"` ; quatre `.cm-kpi` — 1N2 sur 2019-2023 « jamais vus » avec 2025-26 « déjà vue » à côté en ambre, score exact, corners et tirs,
paris simulés « rendement (rapporté) », la pastille sur la valeur de clôture seule ; la reproduction du 23/09 en une phrase, coche ou alerte) ;
(2) **« Rejeu sur cette appli »** (`AppCard`, icône `play`) : l'état en `.cm-note` (« Aucun rejeu encore… », « En cours : football-data 12 400 / 30 204
(14/03/2021) », « Dernier rejeu le … », « Pas lancé : … », arrêté en `is-danger`), le bouton « Lancer le banc » (`AppButton` primaire, TOUJOURS
`window.confirm` : « environ 10 à 13 minutes… rien n’est changé dans vos chiffres, vos paris ou vos réglages », désactivé pendant un rejeu), la liste
repliée des derniers rejeux ; (3) **« Moteur, marché, repère »** (`BenchSummaryTable`, `.cm-table` : une ligne par ligne de marché, une colonne par
période ; dans la case : matchs, perte log du moteur en gras, du marché, du repère, l'écart « +0,4 % [−0,1 ; +0,9] » (deux décimales sous 0,1 %) et sa
`.cm-chip` de verdict — `is-accent` SEULEMENT « retenu », `is-danger` « moins bon », sans ton « pas prouvé », `is-warning` « pas assez de matchs » —,
Brier et RPS en témoins SANS pastille, « déjà vues (…) » en ambre ou « jamais vues » ; sous le 1N2 : « le moteur est Pinnacle… » ; sélecteurs
`AppSelect` du jeu de prix — la clôture marquée « témoin » — et des matchs — tous, coupes, P2 sans huis clos —, les jeux face à face « sur les N
matchs communs » et « Ce que le banc peut prouver » repliés ; `HelpTip` `fourchette-du-hasard` et `donnees-deja-vues`) ; (4) **la courbe annoncé /
réalisé** (`CalibrationChart`, SVG 260 × 260 : grille, diagonale en tirets, un point par tranche, rayon selon le nombre de matchs écrit dessous, jetons
seulement) avec la table « l’appli affiche (23/09) / le banc mesure » des tranches de FIABILITE ; (5) **les paris simulés** (`SimulatedBetsPanel` : la
règle du moteur d'abord — décisions, paris, rendement « (rapporté) » sans pastille avec « écart détectable ± x », valeur de clôture et sa pastille,
pire série et « normale jusqu’à N », raisons des refus ; le détail par tranche de cote et par championnat replié, Σ des paris et ⌀ du rendement —
jamais une somme de pourcentages — ; les variantes repliées, chacune avec la `.cm-chip is-warning` « pas le prix d’un de vos bookmakers » ; la phrase
des paris de P5 et du second jugement de fin mars 2027) ; (6) **la carte championnat × marché** (P2 ou P3, un groupe de marchés à la fois ; une
`.cm-chip` par case : le gain, ou « pas assez de matchs » en clair ; la valeur de clôture des paris du 1N2 par championnat repliée) ; (7) **d’où
viennent ces chiffres** (la provenance de la route, mot pour mot) et **les rencontres écartées** (le rejeu entier — attribuées, lien 4 dit même à
zéro, lien 3, hors grille — puis période par période, chaque raison comptée). Tant qu'aucun rejeu n'a tourné ici, les blocs 3 à 5 montrent la note
(P2 et P4b) et la carte dit qu'elle attend le premier rejeu ; une panne de lecture se dit (`.cm-note.is-danger`) sans retirer un bloc. Les composants
n'appellent rien (props) ; les mots viennent de `utils/banc.js` (pur, rejoué par `server/test/bancEcran.test.mjs` sur les vraies réponses de la route).
Retouche du 19/10/2026 (après la vérification en ultracode) : la route rend `dernierRejeu` (le dernier fini, sans son résumé — la ligne d'état dit
« arrêté » en `is-danger`) ET `dernierRejeuReussi` (avec son résumé) : les blocs 3 à 7 lisent le dernier rejeu RÉUSSI, jamais un rejeu arrêté, et la
légende du tableau nomme le n° plus récent qui s'est arrêté ; la reproduction du 23/09 est dite pour chaque rejeu du bouton (« non calculée par le
rejeu n° N » pour un rejeu d'avant) ; la confirmation dit « dans un processus à part : l’appli reste rapide et la mémoire du rejeu est rendue à la
fin » ; un lancement refusé se dit en clair (`raisonDite` : « une autre tâche tenait la base (un import ou une actualisation lancés à la main) »,
« banc tournait déjà »), jamais « verrou détenu par un autre processus » ; « déjà vues (étape 29, version indice-v1) », « (candidate) », « (fenêtre
du rejeu) » ; les lignes football-data hors magasin nommées par championnat (National League, J-League, Scottish Championship / League One / League
Two) ; la note dit si un commit du dépôt porte son moteur, et les « jamais vus / déjà vue » de ses tuiles et de sa phrase sont LUS dans la note
(`depart.P2.vues`, `depart.P4b.vues`), plus jamais écrits en dur.
Lisible en panneau étroit : `container: banc`, une colonne sous 760 px, les tableaux défilent dans leur cadre.
Depuis l'étape 20 du plan (13/10/2026) : le bloc **« Calibration du mois »** d'Historique moteur (`CalibrationPanel`, `AppCard` icône `target`,
sur-titre « Calibration », dans l'onglet « Historique moteur » juste après `ClosingValuePanel`) — LIT `GET /api/predictions/calibration` (une
lecture à l'ouverture, une par mois choisi ; « Relire » ; rien calculé à l'écran) et montre TOUJOURS ses huit parties, même vide ou en panne :
(0) le choix — `AppSelect` du mois (« octobre 2026 · en cours », « septembre 2026 · figé le 01/11 »), la lecture en barre segmentée
`role="radiogroup"` (« Première valeur » par défaut, « Dernière avant le coup d’envoi » ; même dessin que `TabbedView`), une `.cm-chip` d'état
(« Figé » avec `lock`, « En cours » `is-info`, « Pas encore figé » `is-warning`) et sa phrase (`.cm-note` : « Figé le … : ce bilan ne sera jamais
recalculé », ou « préparé par l’actualisation le …, il sera figé le 01/11/2026 à partir de 6 h »). Depuis l'étape 24 (14/10/2026) la route ne calcule plus
rien : un mois sans bilan (le mois en cours pas encore préparé par la nuit, un mois fini pas encore figé, un mois sans aucun pronostic gelé) montre la
`.cm-chip` « Pas encore mesuré » (`is-warning`) et, à part, une `.cm-note.is-info` (`data-raison-sans-bilan`) qui dit POURQUOI — les dix tranches et les
quatre tableaux restent là, vides ; (1) six `.cm-kpi` — pronostics réglés (sur N gelés,
M matchs), annoncé, réalisé, écart en points avec la pastille du juge, valeur de clôture des pronostics, de vos paris ; (2) la courbe annoncé /
réalisé (`CalibrationChart` du banc d'essai, RÉUTILISÉ, jamais recopié ; `AppSelect` du marché, « Tous les marchés » par défaut) et le tableau
des DIX tranches, toujours les dix (une tranche vide : « aucun pronostic »), chacune avec ses pronostics, ses matchs, annoncé, réalisé, écart et
le juge (`HelpTip terme="fourchette-du-hasard"`) ; (3) « Par marché » (`.cm-table`, perte log binaire, pied « Σ Tous les marchés ») ; (4) « Par
championnat » (`LeagueBadge`, favoris d'abord par `favoritesFirst`, pied « Σ Total » — les pourcentages de tous les pronostics, jamais une
somme — et « ⌀ Par championnat ») ; (5) la valeur de clôture du mois (deux `.cm-block` : pronostics et vos paris, `HelpTip
terme="valeur-de-cloture"`, et la `.cm-note.is-info` des trois seuls marchés cotés gratuitement) ; (6) les pronostics gelés qui n'entrent pas
dans la lecture, raison par raison, et les versions du moteur ; (7) les mois précédents (tous les mois figés, le mois regardé marqué, un clic
l'ouvre) ; (8) la provenance (`ProvenanceChip` « Pronostics gelés du moteur · magasin FotMob · cotes gratuites archivées », « figé » ou
« calculé », tables au survol) et les quatre phrases de la route. Les verdicts : `is-danger` « annonce trop haut / trop bas » (prouvé au-delà
du hasard), sans ton « dans le hasard », `is-warning` « trop peu de matchs (N sur 200) » — AUCUN vert, ni pour une valeur de clôture positive.
Le mois choisi est marqué en `rgba(var(--cm-section-rgb) / 0.12)`, jamais `--cm-section-soft` (émeraude dans cette section, § 2). Terme
`calibration` au guide de lecture (`HelpTip` du titre). Les mots viennent de `utils/calibration.js` (pur, rejoué par
`server/test/calibrationEcran.test.mjs` sur les vraies réponses de la route). Lisible en panneau étroit : `container: calib`, la courbe à côté
de ses tranches dès 760 px, les tableaux défilent dans leur cadre. « Santé du moteur » (étape 24) y fait un LIEN : les courbes
annoncé / réalisé n'ont qu'une place (la page de bord n'en montre qu'une, tous marchés, avec `CalibrationChart`).
Depuis l'étape 21 du plan (14/10/2026) : le bloc **« Carnet de l’IA »** d'Historique moteur (`AiScorecardPanel`, `AppCard` icône `sparkles`,
sur-titre « Carnet de l’IA », dans l'onglet « Historique moteur » juste après `CalibrationPanel`) — ici et nulle part ailleurs : c'est le
bilan de TOUTES les analyses de l'IA, pas d'un match (l'onglet Analyse IA d'un match l'aurait recopié sur chaque page), à côté de l'autre
bilan « annoncé face au réalisé ». Il LIT `GET /api/match-ai/scorecard` (une lecture à l'ouverture, « Relire » ; le carnet est refait chaque
nuit par l'actualisation, rien n'est calculé à l'écran) et montre TOUJOURS ses parties, même vide, pas encore calculé ou en panne : (0) une
`.cm-chip` d'état (« À jour », « Pas encore calculé » `is-info`, « À recalculer » `is-warning` quand le carnet a un autre seuil) et sa phrase ;
(1) cinq `.cm-kpi` — avis comptés (matchs, contredits), avis tenus (et le moteur seul sur les mêmes cas), avis nuancés (jamais comptés), la
cote dans son sens (valeur de clôture moyenne), marchés retirés — puis une `.cm-note` (`is-warning` s'il y a des marchés retirés, sinon
`is-info`) : les marchés retirés et la règle (au moins 200 matchs jugés, pas mieux que le moteur seul, ni sur l'issue ni à la clôture) ; (2)
« Par marché » (`.cm-table`) : TOUJOURS les onze types de marché, un type sans avis le dit (« aucun avis compté », ligne en `--cm-text-muted`),
chacun avec ses avis (confirme · nuance · contredit), ses matchs, ses avis tenus, le moteur seul sur les mêmes cas, la pastille « face au moteur
seul » du juge (`is-info` « mieux que le moteur seul », `is-danger` « moins bien », sans ton « pas mieux », `is-warning` « trop peu de matchs (N
sur 200) »), la clôture (« N dans son sens · M contre », « pas de cote gratuite » hors des trois marchés cotés) et l'ÉTAT : « l’IA n’apporte rien
ici, elle ne commente plus » en `.cm-chip.is-warning` (sa ligne en `--cm-text-secondary`), « l’IA fait mieux que le moteur seul : elle commente »
`is-info`, « trop tôt pour juger : elle commente » sans ton ; pied « Σ Tous les marchés » ; `HelpTip terme="valeur-de-cloture"` sous le tableau ;
(3) « Par championnat » (`AppSelect` du marché, « Tous les marchés » par défaut ; `LeagueBadge`, favoris d'abord par `favoritesFirst` ; l'état
du marché sur chaque ligne ; pied « Σ Total » — les comptes additionnés, le pourcentage de TOUS les avis, jamais une somme de pourcentages — et
« ⌀ Par ligne », chaque ligne pesant autant) ; (4) côte à côte (`.cm-grid-2`) « Par confiance annoncée » (toujours les trois niveaux) et « Par
forme de fiche » (toujours les deux) ; (5) « Par type d’argument » : une `.cm-note.is-info` « Type d’argument : à ajouter au prompt, décision de
Pierre. » et pourquoi ; (6) les pronostics commentés qui n'entrent pas dans le carnet, raison par raison ; (7) la provenance (`ProvenanceChip`
« Analyses de l’IA · magasin FotMob · cotes gratuites archivées », « calculé », fichiers et tables au survol) et ses quatre phrases. AUCUN vert
(ce n'est pas une value), jetons seulement. Terme `fourchette-du-hasard` au guide de lecture (`HelpTip` du titre). Les mots viennent de
`utils/carnetIA.js` (pur, rejoué par `server/test/aiScorecardEcran.test.mjs` sur les vraies réponses de la route ; il reprend `nombreDit`,
`pluriel`, `cloturePourcentDit`, `jourHeureDit` de `utils/calibration.js`). Lisible en panneau étroit : `container: carnetia`, les tableaux
défilent dans leur cadre. L'étape 45 (24/10/2026, « l'IA à l'écran ») a décidé : ce bloc reste le carnet COMPLET, à cette place ; la page « Bulletin » en montre
le RÉSUMÉ (marché par marché et championnat par championnat, `AiReliabilityTable`, aux mêmes mots, avec un lien vers ce bloc) et le « Bilan de l'IA » de l'onglet
Analyse IA d'un match (`MatchAiReviewPanel`, l'expérience redonnée à l'IA, lue dans ses revues) renvoie vers la page « Bulletin ».
Retouche du 14/10/2026 (le même jour) : **la coupure est désactivée tant que Pierre n'a pas décidé de la règle** (`COUPURE_ACTIVE` du
serveur, dite par la route : `coupureActive`, `decisionEnAttente`). La `.cm-note` dit alors, en premier, « Aucun marché n’est retiré pour
l’instant : c’est à vous de décider de la règle. » puis ce que la règle retirerait si elle était en service (« Même en service, la règle ne
retirerait aucun marché aujourd’hui. » sinon) ; la `.cm-kpi` « Marchés retirés » vaut 0, avec « règle en attente de votre décision : N marchés
à retirer si elle était en service » ; l'état d'un tel marché devient « serait retiré : l’IA n’apporte rien ici » (`.cm-chip.is-warning`, classe
`is-serait-retire` sur sa ligne, qui n'est PAS estompée : le marché est toujours commenté), sur « Par marché » comme sur « Par championnat ».
« l’IA n’apporte rien ici, elle ne commente plus » (ligne estompée, `is-coupe`) ne se voit que la coupure activée. Le tableau « Ce que disent
ses avis « nuance » » (après « Par forme de fiche », pour information : rien n'en dépend) se lit MARCHÉ PAR MARCHÉ en cinq colonnes — le
marché, « Quand elle confirme » (avis · annoncé → réalisé) et sa pastille de juge, « Quand elle nuance » et sa pastille — puis « Σ Tous les
marchés » ; le juge de l'étape 16 dit « arrive moins souvent qu’annoncé » (`is-warning`), « arrive plus souvent qu’annoncé » (`is-info`),
« dans le hasard » (sans ton) ou « trop peu de matchs (N sur 200) » (`is-warning`), la fourchette en points au survol — jamais de vert.
Depuis l'étape 24 du plan (14/10/2026) : la page **« Santé du moteur »** (`/sante-moteur`, `EngineHealthView`, entrée du menu juste après « Historique
moteur », icône `activity`, indice « Feux, note, à vérifier ») — le tableau de bord du moteur, une page qui RASSEMBLE ce que les autres étapes ont
préparé, sans rien recalculer. Même couleur de section que Historique moteur (`meta.section: 'history'`, violet : aucune couleur de plus, § 2) ;
`meta.nav: 'sante-moteur'` fait qu'UNE seule entrée du menu est active à la fois (`AppSidebar`, `estActive`). Elle LIT `GET /api/engine-health` (une lecture
à l'ouverture, « Relire » ; le serveur ne lit que des résumés déjà écrits : la page s'ouvre en quelques dizaines de millisecondes) et montre TOUJOURS
ses neuf cadres, dans cet ordre : (0) le bandeau `cm-hero` (titre, `.cm-chip` « Page lue le … » et « lue en N ms », « Relire ») ; (1) les TROIS FEUX
(`.cm-grid-3`, `HealthBlockCard compact`) : les données (le contrôle quotidien de l'étape 14, mêmes mots que la puce du haut), les sauvegardes
(étape 1), le budget Claude (étape 4) — le feu a SON vert, SON orange, SON rouge (« Données vérifiées », « Sauvegardes en ordre », « Budget en
ordre » : le contexte des données, jamais une value de pari) ; (2) en deux colonnes (`.cm-grid-2`) : la **note du moteur face au marché** (un petit
`.cm-table` : le 1N2 et le plus/moins 2,5 face au marché, perte du moteur, du marché, écart, pastille de verdict du banc d'essai — vert seulement
« retenu » —, la phrase « face au championnat seul », l'ÉVOLUTION mois par mois en pastilles de la calibration — jamais vertes —, le dernier rejeu du
banc) ; **annoncé face à réalisé** (UNE courbe, `CalibrationChart` RÉUTILISÉ, tous marchés, première valeur, et trois `.cm-kpi` annoncé / réalisé / écart
avec le juge) ; la **valeur de clôture** (deux `.cm-kpi`, pronostics et vos paris, juge de clôture — jamais vert) ; la liste **à vérifier** (les contrôles
en échec, du plus grave au moins grave, statut en `.cm-chip` rouge ou ambre, six au plus puis « … et N autres contrôles dans Réglages ») ; les
**versions du moteur** (la version en service, la candidate en essai, la dérive) ; les **corrections à accepter ou refuser** (la place est réservée à
l'étape 26 : « pas encore mesuré », lien vers la feuille de route).
**UNE SEULE PLACE PAR INFORMATION** : chaque cadre n'est qu'un RÉSUMÉ — un chiffre (`.sante-bloc__valeur`), une pastille d'état, une phrase — avec, en pied,
la source réelle et l'heure de la mesure (`ProvenanceChip variante="ligne"` ; un jour seul comme la date de la note de départ ne reçoit pas d'heure
inventée) et le LIEN vers sa vraie place (Historique moteur › Banc d'essai / Calibration du mois, Réglages › Contrôle quotidien / Sauvegardes / Budget
Claude / Versions du moteur, Feuille de route › étape 26) : les grands tableaux, les courbes par marché et le carnet de l'IA restent là-bas. Un cadre dont
la donnée manque RESTE affiché, avec « pas encore mesuré » (`.cm-chip` sans couleur) et pourquoi ; une lecture qui échoue donne « illisible »
(`is-warning`) sans toucher aux autres ; si le serveur ne répond pas, les neuf cadres restent (`structureParDefaut`, mêmes titres et mêmes liens que la
réponse, comparés par un test) avec l'erreur en `.cm-note.is-danger`. Le cadre commun est `components/analysis/HealthBlockCard.vue` (`AppCard` + pastille +
`ProvenanceChip` + lien) ; les mots viennent de `utils/santeMoteur.js` (pur, rejoué par `server/test/santeMoteurEcran.test.mjs` sur les vraies réponses de
la route) qui reprend ceux des vraies places (`utils/calibration.js`, `utils/preuve.js`, `utils/controleQuotidien.js`, `utils/banc.js`). Aucun appel hors la
route de la page, aucune écriture.
Depuis l'étape 9 du plan (06/10/2026) : la **page d'un match à venir** (`UpcomingMatchView`, onglet Résumé) se lit dans l'ordre d'une DÉCISION, sans
changer d'onglet : `MarketVerdictBoard` (le verdict par marché, LA carte importante de la page : `AppCard tone="section"`), `PercentageWhyCard`
(la place réservée du « pourquoi ce pourcentage »), les compositions et les absents, `OddsTimelineChart` (les cotes de l'ouverture à maintenant),
l'avis de l'IA, puis le détail. Voir « La page d'un match, pour décider » plus bas.
Depuis l'étape 31 du plan (22/10/2026) : **les fiches à l'écran** — des écrans qui LISENT des résultats déjà calculés par les étapes 15, 18, 22, 29 et 30,
sans rien recalculer à l'ouverture ni appeler le moindre service payant. Règles communes aux quatre écrans : chaque bloc dit sa SOURCE réelle et l'HEURE de
son calcul (`ProvenanceChip`, jamais « Cotes marché (Odds API) ») ; il reste TOUJOURS affiché, même vide (« pas encore calculé », « pas assez de matchs »,
« non relevé », « pas coté », jamais un tiret ni un zéro inventé) ; une lecture qui échoue garde ses tableaux (en-têtes, toutes les lignes, Σ et ⌀) avec la
raison en `.cm-note` (`data-raison`) ; Σ = des COMPTES (matchs, cotes, statistiques, livres), ⌀ = des moyennes, jamais une somme de pourcentages ; le vrai signe moins
« − » ; le logo du club sur chaque ligne qui nomme une équipe ou un joueur (`TeamCrest`, `PlayerFlag`) ; **un championnat se dit par le nom que l'appli lui donne** (celui du
badge de la compétition, `parseLeagueLabel` de `utils/leagueDisplay.js` : « EPL », « Bundesliga » pour « Bundesliga - Germany »), jamais par le libellé brut de l'API ni par un code
collé à une préposition : « devant 98 % des clubs du championnat (EPL) », « devant 99 % des milieux du championnat (EPL) » ; seule une ligne qui se lit SANS le badge (les cartes de la
page Bookmakers) emploie le libellé non ambigu des listes de l'appli, `formatLeagueOptionLabel` : « EPL (ENG) », « Besta deildin (ISL) ». Quatre endroits, UNE SEULE PLACE par information :
(1) **Page d'une équipe** (`TeamView`, onglet Résumé, après « Meilleures statistiques ») : `components/matches/TeamStrengthCard.vue`, « Indice de force » (étape 29),
LIT `GET /api/match-stats/team-strength?club=…&historique=oui` (une lecture, relue quand le club change : `watch` sur `clubId`) — cinq `.cm-kpi` (note de force
en buts d'écart avec un club moyen, place dans son championnat, à domicile / à l'extérieur, matchs en mémoire dont ceux avec xG), les POINTS FORTS (place ≥ 75 %,
bleu `is-info`) et les POINTS FAIBLES (≤ 25 %, ambre) — jamais le vert ni le rouge : une force n'est pas une value —, le tableau des TREIZE statistiques
(`data-tableau="statistiques"`, trois lieux : au total, à domicile, à l'extérieur ; chaque case = la valeur et SA PLACE en % des clubs du championnat, « non relevé »
quand FotMob ne publie pas le xG) avec **Σ** (statistiques relevées, forts, faibles) et **⌀** (place moyenne, entre 0 et 100), puis LA FORME : une petite courbe
de la note sur les 30 derniers matchs (le dernier cerclé), « Aujourd'hui / il y a 5 / 10 / 20 matchs » et une phrase (en hausse, en baisse, stable), et la mesure
au banc d'essai (« pas encore mesuré » ou le verdict). États : club non reconnu (aucune lecture ne part), chargement, jamais calculé, pas d'indice pour ce club,
erreur, serveur à relancer, calcul d'une autre version (lu, signalé).
(2) **Fiche d'un joueur** (`PlayerView`, entre la saison et « Match par match ») : `components/matches/PlayerRatingCard.vue`, « Note par poste » (étape 30), LIT
`GET /api/match-stats/player-ratings?player=…` (`watch` sur `playerId`) — le joueur (drapeau, club et logo, poste, « fiche établie » ou « peu joué »), les deux
APPORTS (offensif et défensif, en buts par match, et SA PLACE parmi les joueurs du même poste du championnat ; « sans objet » pour l'apport offensif d'un gardien ;
« pas de place : fiche pas encore établie » sous 270 minutes), les dix TUILES de composantes (celles qui comptent à SON poste d'abord, en couleur de section, avec
la mémoire derrière ; un gardien : les buts évités en tête, jamais des zéros de joueur de champ), la COURBE des vingt dernières apparitions (deux traits, un seul pour
un gardien, la ligne du zéro = la moyenne du poste) et le tableau `data-tableau="apparitions"` (la date, l'adversaire avec son logo quand la page connaît le match,
l'apport offensif et défensif) avec **Σ** (nombre d'apparitions, de … à …) et **⌀** (apport moyen). **Les notes des joueurs n'apparaissent JAMAIS sur le terrain des
compositions** (`LineupPitch`, `LineupBench`, `MatchLineups`, `AiLineupSnapshot` n'importent rien de la fiche : un test le garde) ; les « juste les notes » de match et de saison y restent.
(3) **Statistiques ligue** (`TeamStatsView`) : les repères du championnat et leur évolution sont ceux de l'étape 15 (`LeagueBenchmarksPanel`, plus haut) ; **sous eux**,
le tableau « Ce qui prédit, ce qui trompe » (`components/analysis/PredictorsTable.vue`, étape 18) — LE seul endroit de l'appli où il vit (aucune autre page
ne le copie, un test le garde : une information, une place ; c'est la page des statistiques, il n'appartient à aucun match ni à aucune équipe). Il LIT `GET /api/bench/stat-value` (calculé à la main, jamais chaque nuit : aucun bouton ne le lance d'ici)
et dit qu'il porte sur tous les championnats réunis, pas sur celui qu'on a choisi plus haut. Quatre tableaux toujours complets : les statistiques d'équipe FotMob
(26 lignes), d'équipe football-data (18), de joueur FotMob (16) et la fenêtre du moteur (6) ; par ligne la fiabilité, les matchs nécessaires, le pouvoir de prédiction,
la demi-vie, la bonne fenêtre et le VERDICT. **Exception à la règle d'or de « 3 bis »** (demande du cahier de l'étape 18) : ici le vert (`--cm-accent`) dit « cette statistique
COMPTE » (la borne basse de sa fourchette atteint au moins 1 %, jugée sur des matchs que le calcul n'a pas vus) et le rouge (`--cm-danger`) « elle TROMPE » (rien de prouvé) ; l'ambre
dit « trop peu de matchs », le gris « compte un peu ». Jamais pour autre chose qu'un verdict de ce tableau. Pied : **Σ** par verdict, **⌀** de la fiabilité.
(4) **La page « Bookmakers »** (`BookmakersView`, route `/bookmakers`, entrée du menu juste après « Mes paris », icône `euro`) : ce que l'étape 22 a mesuré du marché sur
toutes les cotes archivées. Même couleur de section que Mes paris (`meta.section: 'bets'`, la couleur de l'argent : aucune couleur de plus) et `meta.nav: 'bookmakers'`
pour qu'UNE seule entrée du menu soit active. LIT `GET /api/market-knowledge[?championnat=…]` (route de lecture ajoutée, hors des fichiers du moteur : un championnat
à la fois, 0,2 à 0,3 Mo, « * » = tous) ; le championnat vit dans l'adresse (`?championnat=`, `router.replace`, jamais un `push`), un lien le partage, une réponse tardive est ignorée,
une relecture ratée garde la dernière page avec l'erreur au-dessus. Le bandeau (`cm-hero`) : titre, `.cm-chip` « calcul n° N », « Relire », le sélecteur de championnat
(`AppSelect`, favoris d'abord et étoilés ; un lien vers un championnat inconnu garde son nom, « non mesuré »), la provenance (football-data.co.uk · ESPN · 365Scores · Kalshi ·
Smarkets · The Odds API, l'heure de la fin du calcul) et quatre `.cm-kpi`. Puis SIX cartes, toujours entières : `MarketMomentsCard` (quand parier ? la conclusion, la valeur de
clôture de chaque moment, « tôt contre tard » jugé par le hasard, championnat par championnat — un clic le choisit), `BookmakerRankingCard` ×2 (qui est le plus JUSTE : la perte log ;
qui bouge le PREMIER : l'avance ; un onglet par moment du prix ; le meneur est celui qui bat le plus d'autres livres sur leurs matchs communs), `BookmakerMarginsCard` (ce que
chaque bookmaker garde ; une bourse montre sa COMMISSION, jamais une marge), `BookmakerBiasCard` (ce qu'il se trompe à dire : l'écart signé « réalisé moins annoncé », en points)
et `MarketReproductionCard` (retrouve-t-on la mesure du 23/09 ?). **Aucun vert, aucun rouge** (rien ici n'est une value) : un écart prouvé est bleu `is-info`, « trop peu de matchs »
ambre. **Une case vide ne dit sa CAUSE que si le calcul est lu** (`calculLu` ; « pas de relevé daté à ce moment dans ce championnat ») : sans lecture elle dit ce qu'elle sait (« pas encore
mesuré », « serveur à relancer », « championnat non mesuré »), jamais une cause inventée. Un championnat où le calcul n'a comparé AUCUN match (n = 0) n'a pas de conclusion :
« Trop peu de matchs pour juger », jamais « pas de moment meilleur prouvé » (ce serait dire qu'on a comparé et rien trouvé). Σ = des cotes lues, des livres, des championnats
(victoires = défaites), ⌀ = des moyennes (« somme sans objet » pour une perte log). **Vos bookmakers (The Odds API) portent leur NOM, jamais leur clé** : « Winamax (FR) », « PMU »,
« Betclic », « Unibet (FR) », « Winamax (DE) », « Betfair Exchange (EU) » — suivi de « (vos bookmakers) », qui distingue le Pinnacle de vos relevés de celui de football-data. UNE seule liste,
`utils/vosBookmakers.js` : celle que Réglages › « Vos bookmakers » fait cocher (`EngineConfigForm` la lit, il n'en garde pas de copie), complétée pour les clés que Réglages ne propose pas
mais que vos relevés contiennent par le titre que The Odds API leur donne (`betfair_ex_eu` : l'API dit « Betfair », la bourse que l'appli nomme « Betfair Exchange » ailleurs) ; une clé jamais
vue reçoit un nom fabriqué lisible (« foo_bar_nl » donne « Foo Bar (NL) ») : un test vérifie qu'aucune clé « mot_mot » n'apparaît dans le texte de la page. Mots : `utils/bookmakers.js`,
`utils/vosBookmakers.js`, `utils/indiceDeForce.js`, `utils/ficheJoueur.js`, `utils/predicteurs.js` (purs, sans Vue : les tests les rejouent sur les vraies réponses du serveur ; ils ne
lisent que d'autres règles pures du même dossier).

Depuis l'étape 42 du plan (22/10/2026) : **le bulletin du jour et le bilan de la semaine** — deux textes écrits par l'IA (un appel à Claude Code le matin, un le lundi,
sur une fiche chiffrée que le code prépare sans token) ; la page « Bulletin » de l'étape 45 les reprend (voir plus bas). Ils se lisent dans Réglages, dans UNE carte,
`components/settings/BulletinsPanel.vue` (« Bulletin du jour et bilan de la semaine », juste sous « Actualisation automatique » : ce sont deux ÉTAPES de l'actualisation,
« Bulletin du jour » et « Bilan de la semaine », qui figurent aussi dans la liste de ses étapes — `RefreshStatusPanel` n'a pas changé ; une étape pas due y dit POURQUOI
(« le bulletin du 05/10/2026 est déjà écrit… »), jamais seulement « pas due à cette passe »). La carte LIT `GET /api/match-ai-analysis/bulletins` (une lecture à
l'ouverture et à chaque fin de passe, « Relire » ; une réponse tardive est ignorée ; une relecture ratée garde le dernier texte) et ne lance RIEN : son seul bouton est
« Relire » (un test le garde), aucune route n'écrit un bulletin. Règles de dessin : **deux blocs toujours là** (`data-bloc="bulletin"`, `data-bloc="bilan"`), texte écrit ou
non ; chacun dit son ÉTAT en une puce `.cm-chip` et une phrase (« Écrit », « Rien à commenter », « Attend le matin » avant 6 h, « Coupé » si les analyses automatiques le sont,
« Abandonné » après trois essais ratés, « Illisible », « Pas encore écrit » avec sa raison — jamais un texte inventé ni un bloc qui disparaît) ; le TEXTE de l'IA (titre, résumé,
une section par rubrique `data-section`, « à retenir ») ; sa **provenance réelle** (`ProvenanceChip` : Claude Sonnet, par Claude Code — le quota de l'abonnement —, l'heure d'écriture),
ses tokens et le mode du budget Claude (normal ou économe) ; **la preuve que ses chiffres sont ceux du code** : la phrase de la garde (« Chiffres vérifiés par le code : N nombres
cités, tous dans la fiche ») et la fiche chiffrée envoyée à l'IA, dépliable (`<details data-fiche>`) — un texte qui cite un nombre absent de la fiche est REFUSÉ et n'est jamais montré :
ses essais ratés sont dits (`data-essais`, « Essai 1 raté à 14 h 00 — texte refusé : chiffres absents de la fiche (4321,7) »). Le texte d'aujourd'hui pas encore écrit : le dernier
reste lisible, dit pour ce qu'il est (« Le dernier texte écrit, 04/10/2026 »). En dessous, le tableau des derniers textes (`data-tableau="textes"`, bulletins et bilans mêlés,
les plus récents d'abord) avec **Σ** (textes, dont appels à Claude, tokens) et **⌀** (tokens par texte QUI A COÛTÉ : un texte « rien à commenter » n'a pas d'appel, il ne tire pas la
moyenne vers zéro, et sans aucun appel la moyenne est « – »), puis la note « Comment ça tourne ». **Aucun vert ni rouge de value** (rien ici n'en est une) : l'état écrit est vert
`is-accent` comme tout ce qui est fait, l'abandon rouge, le « pas encore » bleu `is-info`. La carte « Budget Claude » montre les deux types d'appel dans son tableau par type
(« automatique · compté sur le plafond ») et dit combien de places des 150 ils ont prises (« dont 2 bulletin ou bilan »). Mots : `utils/bulletins.js` (pur, sans Vue : les tests le
rejouent sur les vraies réponses du serveur).

Depuis l'étape 37 du plan (22/10/2026) : **les styles de jeu** — deux blocs, chacun à UNE place. Sur la page d'une équipe, juste sous « Indice de force »,
`components/matches/TeamStyleCard.vue` (« Style de jeu », `data-bloc="style-de-jeu"`) ; sur la page d'un match à venir, juste avant « Meilleures statistiques »,
`components/matches/StyleDuelCard.vue` (« Duel de styles », `data-bloc="duel-de-styles"`). Ils LISENT `GET /api/match-stats/team-style?club=` et
`/style-duel` (les clubs par identifiant FotMob, ou par nom et championnat quand la page ne les connaît pas), ne calculent rien, n'écrivent rien ; une réponse tardive
(changement de club) est ignorée. Règles de dessin : l'étiquette en puce de section (`.cm-chip.is-section`, avec `data-style-id`), « provisoire » en puce ambre ; la
phrase qui la JUSTIFIE avec les chiffres du club ET ceux de son championnat (« part des longs ballons 7,4 % (moyenne du championnat (EPL) : 4,8 %) ») ; les prudences en
ambre (provisoire, début de saison, nouvel entraîneur, carte des tirs absente) ; la **vraie provenance** (« FotMob (magasin) · styles de jeu », l'heure du calcul) ; le tableau
des huit chiffres (`data-tableau="chiffres-du-style"` : le club, son championnat, l'écart DIT EN MOTS — « au-dessus », « dans la moyenne »…, jamais un écart-type à l'écran —,
en gras les chiffres qui portent l'étiquette) avec **Σ** (chiffres mesurés sur 8, matchs lus) et **⌀** (ce que sont les valeurs), toujours ses huit lignes même vide
(« pas encore calculé », « pas assez de matchs », « non mesuré (carte des tirs absente) », jamais 0) ; l'entraîneur (logo de chacun de ses clubs, son style, l'homonyme dit en
mots) ; le style mois par mois (`data-tableau="style-par-mois"`, Σ mois et changements, ⌀ matchs lus). Un style n'est ni bon ni mauvais : **ni vert ni rouge**, l'écart
au-dessus en bleu `--cm-info`, en dessous en ambre. Le duel : les deux clubs face à face (logo, style, possession), le scénario en une phrase, et la MENTION en pastille —
« Explication seulement » (gris) tant que le banc n'a rien prouvé, « Effet mesuré » en vert `--cm-accent` (la seule exception, comme « Prouvé » de l'étape 23) avec l'effet
en points ; sous le scénario, ce que le banc a mesuré en mots (matchs jugés, essais comptés, « pas prouvé »). Mots : `utils/stylesDeJeu.js` (pur, sans Vue : les tests le
rejouent sur les vraies réponses du serveur).

Depuis l'étape 44 du plan (23/10/2026) : **la mémoire de l'IA** — un bloc, sur la page d'une équipe, juste sous « Style de jeu »,
`components/analysis/AiDossierCard.vue` (« Mémoire de l'IA », `data-bloc="memoire-ia"`, icône `sparkles`) ; la page « Bulletin » de l'étape 45 le réutilise tel
quel pour une équipe, et en mode `portee="championnat"` (`GET …/dossiers?league=`) pour un championnat seul. Il LIT `GET /api/match-ai-analysis/dossiers?club=fotmob-…` (le club par son IDENTIFIANT FotMob, jamais
par son nom : sans identifiant, il le dit et ne lit rien), ne calcule rien, n'écrit rien ; une réponse tardive (changement de club) est ignorée. Ce qu'il montre, dans
l'ordre : le club (logo, championnat) ; la **vraie provenance** (« Écrit par le code · magasin FotMob et carnet de l'IA », « mis à jour le … », le fichier
`data/runtime/ai-dossiers.json` au survol) et « matchs pris en compte jusqu'au … » ; les faits du moment en phrases à icône (classement, séries, entraîneur, style,
carnet de l'IA sur ce club) — les phrases viennent du serveur, ce sont LES MÊMES MOTS que l'IA lit ; cinq tableaux toujours là, même vides, chacun avec **Σ** et **⌀** :
la forme (`data-tableau="forme"`, 10 matchs, logo de chaque adversaire), les absents connus (`absents`, lus avant quel match), les **leçons confirmées par le carnet**
(`lecons` : leur jour, le match d'origine avec ses deux logos, le marché et le pronostic, la leçon entre guillemets, ce que le carnet a vu en mots, « confirmée le »),
les leçons retirées (`retirees` : démenties ou jamais confirmées, et pourquoi), les leçons du championnat (`lecons-championnat`), sous le profil de la saison et la tête
du classement (logos) ; puis, repliable, « Ce que l'IA lit de ce dossier » (le texte exact, ses mots et ses tokens estimés comme le budget de l'étape 41) ; et la règle en
pied (écrit par le code, jamais un chiffre au moteur, la note manuscrite n'y entre pas). Une leçon n'est ni bonne ni mauvaise : **ni vert ni rouge** ; « le moteur s'y est
trompé » se lit en mots. Mots : `utils/dossiersIA.js` (pur, sans Vue : les tests le rejouent sur les vraies réponses du serveur).

Depuis l'étape 45 du plan (24/10/2026) : **l'IA à l'écran** — trois écrans qui LISENT ce que l'IA a déjà écrit (étapes 4, 21, 42, 43 et 44), sans rien calculer à l'ouverture
et sans appeler Claude ni une API payante.
**1. La page « Bulletin »** (`views/BulletinView.vue`, `/bulletin`, entrée du menu juste après « Santé du moteur », section `history` : la couleur d'Historique moteur, aucune
couleur de plus ; mots dans `utils/pageBulletin.js` et `utils/indexDesDossiers.js`, purs). Quatre lectures : `GET /api/match-ai-analysis/bulletins`, `GET /api/match-ai/scorecard`,
`GET /api/match-ai-analysis/dossiers/resume` (route de l'étape 45 : l'index des dossiers, au plus 80 leçons par liste, le total dit le reste) et `GET /api/claude-budget` (lue par
le composant du budget lui-même) ; une réponse tardive est ignorée, une lecture ratée garde la dernière réponse à l'écran, la page se relit sur le signal des données
(`dataVersion`). Dans l'ordre : le bandeau (titre, jour, « Tout relire », quatre chiffres clés — le bulletin, le bilan, les avis de l'IA tenus, les leçons confirmées —, toujours
quatre, « illisible » ou « pas encore calculé » quand une lecture manque) ; **le budget Claude**, en tête, du jour et de la semaine : `ClaudeBudgetPanel variante="compacte"`
dans une `AppCard` — UN SEUL composant du budget (feuille de route, Réglages, Bulletin ; aucune troisième version, un test garde qu'aucun autre fichier ne lit `claudeBudgetApi`) ;
**les deux textes** : la carte de Réglages `BulletinsPanel` reprise telle quelle, nourrie par la lecture de la page (propriété `lecture` : une seule lecture de la route pour les
deux, « Relire » la redemande à la page ; sans elle, Réglages lit seule comme avant) ; **la fiabilité de l'IA** (`AiReliabilityTable`) : le carnet en résumé, onze marchés TOUJOURS
là (un marché sans avis dit « aucun avis compté »), **Σ** des avis et **⌀** par marché (chaque marché pèse autant ; jamais une somme de pourcentages ; « — » quand aucun marché
n'a d'avis), puis championnat par championnat avec « Voir N lignes de plus » et le lien vers le carnet complet d'Historique moteur ; **la mémoire de l'IA** (`AiDossiersBoard`) :
les leçons confirmées et les leçons retirées de tous les dossiers, deux tableaux toujours là (le jour, le match d'origine avec ses deux logos, le marché et le pronostic, la
leçon, sa preuve en mots, la portée — le club ou le championnat qui la garde, un clic ouvre son dossier), avec **Σ** et **⌀** ; un choix du championnat (favoris d'abord, étoilés)
puis d'une équipe ouvre le dossier COMPLET : l'équipe par `AiDossierCard` (le bloc de la page d'une équipe, repris tel quel) ou « Le championnat seul » par
`AiDossierCard portee="championnat"` (le dossier du championnat sans les morceaux d'un club ; ses états sont dits : aucun choisi, pas de dossier, pas encore écrit, autre forme,
serveur à relancer, illisible) ; le dossier ouvert vit dans l'adresse (`?championnat=…&equipe=fotmob-…`, remplacée, jamais empilée) ; enfin « D'où viennent ces données » : les
quatre sources, leur fichier réel et leur heure. **Un texte refusé par la garde des chiffres n'est JAMAIS montré** : la route garde la phrase refusée (`refuses[].extrait`),
l'écran n'en dit que le motif (« chiffres absents de la fiche (4321,7) »), et un test cherche l'extrait dans le rendu.
**2. Les moments clés** d'un match joué (`components/analysis/KeyMomentsList.vue`, onglet Résumé de la page du match, juste avant « Meilleures statistiques ») :
`GET /api/match-stats/:matchId/deroule` (route de l'étape 45 : la fonction de l'IA, `lireDeroule`, sur les événements déjà rangés au magasin) ; quatre comptes toujours là
(buts, penalties manqués, expulsions, blessures) ; un tableau (minute, équipe avec son logo, moment avec le drapeau du joueur, score qui suit) avec **Σ** et **⌀** (la minute
moyenne, jamais une somme de minutes) ; ce qu'on ne sait pas se DIT (déroulé non publié, seuls les buts publiés — il ne faut pas en conclure « aucune expulsion » —, 0-0 sans moment,
liste vide publiée, match pas joué), jamais « aucun but » ; provenance réelle « FotMob · événements du match rangés au magasin », relevé le …, la table au survol. Mots :
`utils/momentsCles.js` et `utils/joueursDuMatch.js`.
**3. Le bilan d'après-match** (`MatchAiReviewPanel`, onglet « Analyse IA » d'un match joué) refait au dessin de l'onglet d'avant-match : les mêmes familles de marchés
(`utils/bilanApresMatch.js` reprend celles de `MatchAiAnalysisPanel`, un test les compare) et la MÊME carte de marché `AiMarketCard`, qui gagne — sans rien changer pour l'onglet
d'avant-match, un test le garde — l'issue du pronostic (liseré et « Pronostic juste / faux / pas encore réglé »), l'avis de l'IA tenu ou démenti, ce qui s'est passé, la leçon, la
cote (à la virgule, « 1,87 »), « conseillé » et « pas d'avis de l'IA » ; puis l'expérience de l'IA par type de marché (`data-tableau="experience-ia"`, onze types toujours là, **Σ** du
ratio de TOUS les cas, **⌀** des marchés qui ont des cas, l'avis tenu par confiance au survol, provenance réelle avec l'heure de lecture, lien vers la page « Bulletin »). Le bouton
« Lancer l'analyse après-match », qui existait déjà, reste le seul qui appelle quelque chose. **Le vert et le rouge n'y disent jamais « value »** : ils marquent l'état « écrit »
d'un texte et l'issue d'un pronostic ou d'un avis de l'IA (juste en vert, faux en rouge, toujours avec le mot et l'icône) ; jetons `--cm-*` seulement, aucune couleur en dur
(l'appli n'a qu'un thème, le sombre).

## 3 bis. Le langage visuel des paris (étape 6 du plan, 06/10/2026)

Une seule façon d'afficher une notion de pari, partout où l'on en parle. Sept composants communs
(`src/components/common`) qui ne font que **dessiner** ce que décide `src/utils/langageParis.js` : du JavaScript pur, sans Vue ni
navigateur, que les tests du serveur rejouent (`server/test/langageParis.test.mjs`). Aucun calcul de pari n'y est refait : on classe
et on dit ce que le serveur a calculé.

**La règle d'or : le vert dit « value ».** Dans un contexte de pari, `--cm-accent` n'est vert que pour une VRAIE value chez VOS
bookmakers (`ValueBadge`) ou un pari gagné. Une cote n'est une value que si, **ensemble** : elle vient d'un de vos bookmakers
(la règle `estJouable` de `valueFinder.js`, appliquée par le serveur : jamais une cote gratuite de référence, jamais un
bookmaker non coché dans Réglages, jamais une bourse non cochée) ; son avantage dépasse le seuil du moteur (`edgeThresholdMin`,
2 % par défaut) sans dépasser son maximum (`edgeThresholdMax`, 25 % : au-delà, cote périmée ou erreur) ; sa cote ne dépasse pas
`maxValueOdds` (5). C'est, dans le même ordre (cote trop haute, puis avantage invraisemblable, puis sous le seuil), ce que fait
`findValueBet` : le test compare les deux sur 900 lignes de bookmaker tirées au sort. Les seuils se lisent sur `/api/config` ;
tant qu'ils manquent la pastille dit « seuil inconnu » et reste neutre. Tout le reste est **neutre, grisé ou ambre** et se lit
sans la couleur (icône, mot, phrase complète au survol et dans `aria-label`). Les six autres composants n'emploient jamais
`--cm-accent` ni la couleur de section, et dans `ValueBadge` seule la règle `.is-value` est verte (test).

**L'exception de l'étape 23 (22/10/2026) : « Prouvé » sur la carte « où parier ».** Une case de la carte championnat ×
marché (`BettingMapChip`, le seul dessin d'une case : grille `BettingMapGrid`, page Opportunités, Repérage) prend le MÊME vert
(`--cm-accent`) quand le serveur l'a dite « Prouvé » : l'avantage du moteur AU PRIX (valeur de clôture) dépasse le hasard sur au
moins 200 matchs, juge de l'étape 16, K compté (décision de Pierre du 22/10/2026). Toujours avec le mot « Prouvé » et l'icône
coche ; jamais pour une probabilité, un écart, un repère ou un pari passé. Rouge (`--cm-danger`) « Moins bien que le marché »,
prouvé ; gris en pointillés : pas prouvé, trop peu de matchs (« 46 / 200 »), pas encore mesurée, contradictoire, suspendue (réglages
changés) ; gris hachuré : pas de cote archivée. La couleur vit dans `BettingMapChip` seul : les vues qui la posent n'écrivent
ni vert ni rouge de case (l'avertissement d'une case rouge sous le pari, dans Opportunités, est en `--cm-danger`).

| Notion | Composant | Ce qu'il dit | Couleur | Sans la couleur |
| --- | --- | --- | --- | --- |
| Value | `ValueBadge` | « Value +4,1 % » ; sinon « +0,4 % sous le seuil », « −3,2 % », « trop beau pour être vrai », « cote trop haute », « non jouable », « référence », « +6,2 % à rafraîchir » (étape 7), « seuil inconnu », « valeur inconnue » ; avec le verdict du moteur (étape 8) aussi « +3,0 % pas retenue », « +4,3 % juge et partie », « non cotée », « sans cote juste », « cotes incohérentes », « coupe-circuit » | vert = value ; ambre = à écarter ; ambre en pointillés = à rafraîchir ; gris, pointillés = rien à jouer | coche, tiret, alerte, cadenas, horloge, info, bouclier, pause + mot |
| Confiance | `ConfidenceGauge` | « sûr » ou « fragile » (du serveur) ; sans mesure : « pas encore mesurée », piste vide en pointillés | bleu = sûr, ambre = fragile ; jamais vert ni rouge | mot, `role="meter"` |
| Mouvement de cote | `OddsMoveArrow` | une flèche, un signe, l'ampleur : « −12,3 % » ; « stable » ; « inconnu » | bleu d'information (une cote qui baisse n'est ni bonne ni mauvaise : le marché joue davantage l'issue) | flèche, signe, « Cote en baisse de 12,3 % » |
| État de la composition | `LineupStateBadge` | Compo officielle, Compo probable, Dernière alignée, Compo non publiée | bleu = officielle ; ambre = peut encore changer | mot + icône |
| Coup d'envoi | `KickoffCountdown` | « dans 2 h 15 », « en cours », « terminé » ; un match du calendrier : « demain », « dans 4 jours » | neutre ; rouge, point qui pulse pour « en cours » | mots |
| Provenance | `ProvenanceChip` | le fournisseur RÉEL et l'heure du relevé ; ancien (24 h) : ambre ET « il y a 15 jours » | ambre = ancien, heure ou source inconnue | mots |
| Aide | `HelpTip` | la petite bulle « ? » : une phrase par notion | neutre | Tab, Échap, `aria-describedby` |
| Données à vérifier (étape 14) | `AVerifierBadge` | « À vérifier », et avec `avec-raison` la raison courte : « Score à vérifier : Millwall – Bolton du 05/09/2026 (FotMob 4-0, football-data 3-0) », « Cartons jaunes non relevés par FotMob en EPL… » (et N autres raisons) | ambre (`--cm-warning`) en pointillés ; jamais vert ni rouge : il ne touche ni au verdict ni à la pastille de value | icône alerte + mot, `role="note"`, toutes les raisons au survol et dans `aria-label` |
| Enjeu d'une rencontre (étape 28) | `EnjeuBadge` | « Gros enjeu », « Sans enjeu », « Enjeu non calculé » ; entre les deux seuils, pas de pastille (l'encadré de la page dit la phrase) | bleu d'information = gros enjeu ; gris = sans enjeu ; gris en pointillés = non calculé ; jamais vert ni rouge | icône + mot, `role="note"`, la phrase du serveur (arrondie à 5 points) et quand elle a été calculée au survol et dans `aria-label` |
| Case de la carte « où parier » (étape 23) | `BettingMapChip` | « Prouvé · 412 matchs », « Moins bien · 2 208 matchs », « Pas prouvé · 1 520 matchs », « Trop peu · 46 / 200 », « Pas mesurée », « Pas de cote », « Suspendue » ; avec `avec-ecart` l'écart (« −9,5 % ») ; `compacte` : le mot seul | vert = « Prouvé » seulement (l'exception ci-dessus) ; rouge = moins bien que le marché, prouvé ; gris en pointillés ; gris hachuré = pas de cote archivée | icône (coche, alerte, tiret, croix, horloge) + mot, `role="note"`, la phrase du serveur au survol et dans `aria-label` |

- **`ValueBadge`** : `pourcent` (l'avantage en %, tel que le serveur le donne), `jouable` (la cote vient de vos bookmakers),
  `reference` (cote gratuite), `cote` (nette de commission), `regle` `{ min, max, coteMax }` (min et max en %), `bookmaker`,
  `precision` (ce que la page ne voit pas, ajouté à la phrase d'une value seulement), `taille` (`sm`, `md`). L'emplacement par
  défaut remplace le texte visible (le Repérage garde son « valeur +19,6 % ») : la décision, la couleur et l'accessibilité
  restent celles de la pastille. Depuis l'étape 7 : `fraicheur` (la fraîcheur de la cote telle que le serveur l'a jugée,
  `fraicheurCote` de `server/src/core/engine/fraicheurCotes.js` : heure du relevé, coup d'envoi, réglage) et `maintenant`
  (facultatif ; sinon l'horloge partagée `liveClock.js`). La pastille la **réévalue à l'horloge** (`fraicheurVivante`) : une cote
  qui vieillit pendant que la page est ouverte passe d'elle-même à « à rafraîchir », et une cote que le serveur a dite à
  rafraîchir ne redevient jamais fraîche (horloge du poste en retard). Une value sur une cote à rafraîchir n'est **jamais verte** :
  « +6,2 % à rafraîchir », ambre en pointillés, icône horloge, la raison complète au survol (« Relevée il y a 4 h, au-delà du
  délai de 3 h… », « … avant l'annonce des compositions… »). Sans `fraicheur`, aucun contrôle de fraîcheur.
- **`ValueBadge :verdict`** (étape 8 du plan) : le VERDICT DU MOTEUR sur une issue, tel que le serveur le donne
  (`server/src/core/engine/verdictPari.js` : `verdicts` de `/api/analysis`, `verdict` des marchés 1N2 de `/api/screener` et des lignes
  de `/api/opportunities`). Avec lui, la pastille ne refait plus la règle de l'étape 6 : elle dit le verdict (`etatVerdict` de
  `langageParis.js`) et ne réévalue que la fraîcheur de SA cote à l'horloge. **Vert ⇔ `findValueBet` recommande ce pari ET sa cote est
  fraîche** : un seul pari par match (l'autre issue au-dessus du seuil : « pas retenue », neutre), jamais chez un bookmaker qui a fixé la
  cote juste (« juge et partie », gris en pointillés, bouclier). La phrase (survol, `aria-label`) est celle du serveur : elle nomme le
  bookmaker et, s'il y en a un, le « juge » écarté. Toute pastille qui reçoit un verdict reçoit aussi `:fraicheur` (test). Sans verdict
  (serveur d'avant l'étape 8), la règle de l'étape 6 s'applique comme avant.
- **`ConfidenceGauge`** (créée ICI ; l'étape 40 la **réutilise**, elle ne la recrée pas) : `valeur` de 0 (fragile) à 1 (sûr),
  `etiquette` (`sur`, `fragile`, donnée par le serveur : aucune n'est tirée du nombre), `variante` (`jauge`, `puce`). Une valeur
  absente ou impossible (72, −1, NaN) donne « pas encore mesurée », jamais un niveau par défaut. Le moteur ne mesure pas encore sa
  confiance (étape 38) : le Repérage porte une puce « Confiance : pas encore mesurée ».
- **`OddsMoveArrow`** : `pourcent` (variation de la cote, négatif = baisse) ou `de` et `vers`, `ampleur` (faux : la direction seule),
  `taille` (`sm`, `md`, `lg`), `sujet` (« Cote juste »), `titre`. Moins d'un dixième de point : « stable ».
- **`LineupStateBadge`** : `snapshot` (la composition renvoyée par `/match-stats/preview`) ou `etat`. FotMob ne dit jamais si sa
  composition est officielle : elle est dite **officielle** quand le serveur l'a lue moins d'une heure avant le coup d'envoi (ou
  après) et qu'aucun titulaire n'y est dit indisponible, **probable** sinon.
- **`KickoffCountdown`** : `coupDEnvoi` (un instant, ou « AAAA-MM-JJ »), `heureSure` (faux : le jour seul ; sans avis, le midi UTC
  pile est lu comme l'heure de repli du calendrier), `variante` (`pastille`, `texte`). Il lit l'horloge partagée (`liveClock.js`)
  et la règle de `matchStatus.js` : « en cours » (jusqu'à 130 min) et « terminé » sont **estimés** d'après l'heure, pas un direct ;
  le survol le dit.
- **`ProvenanceChip`** : `source` (le fournisseur réel : « The Odds API », « ESPN, football-data.co.uk », « Moteur CôteMaster ·
  magasin FotMob et cotes relevées »), `releveLe`, `action` (« relevé », « calculé »…), `fichier` (où c'est lu sur ce PC, au survol), `payant`,
  `vieuxApresHeures`, `variante` (`pastille`, `ligne`) ; emplacements `source` et `quand` pour garder ses propres mots. Une source
  absente ou une heure inconnue se **disent** (« source non indiquée », « heure du relevé inconnue ») — jamais un libellé vague
  (« Cotes marché (Odds API) ») ni un tiret. Son panneau complet reste `DataOriginMenu`.
- **`HelpTip`** : `terme` (une clé de `GUIDE_DE_LECTURE`), ou `titre` et `texte`. Le bouton est nommé (`aria-label`) et décrit
  (`aria-describedby`) par une phrase **toujours dans la page**, masquée à l'œil : un lecteur d'écran la lit dès le focus. La bulle
  s'ouvre au focus (Tab) ou au survol, se ferme avec Échap sans bouger le focus, un clic ou Entrée l'épingle, un clic ailleurs la
  ferme ; elle est posée dans `<body>` en position fixe (un tableau qui défile ne la coupe pas) et le clic n'atteint jamais ce qui
  entoure le « ? » (un en-tête de colonne triable). Son comportement vit dans `transitionInfobulle` (testé sans navigateur).

**Le guide de lecture** (`GUIDE_DE_LECTURE`, `utils/langageParis.js` — le seul endroit des phrases) : `value` (Repérage, colonne
Cote jouable ; Opportunités, colonne Value), `cote-juste` (Repérage colonne Moteur ; Chutes de cotes ; Opportunités), `sur-fragile`
(Repérage, bandeau ; Opportunités, colonne Confiance), `valeur-de-cloture` (carte de la valeur de clôture : Historique moteur et
Performance paris), `series-de-pertes` (coupe-circuit de Réglages), `a-rafraichir` (étape 7 : saisie express et carte « Value à
rafraîchir » de la page du match, carte « Cotes de vos bookmakers » de Réglages), `juge-et-partie` (étape 8 : la note de lecture de la
page Opportunités), `cote-minimale` (étape 10 : le comparateur de vos bookmakers, son titre sur la page du match, le ticket),
`modele-de-buts` (étape 27 : la provenance des pourcentages de buts, `GoalModelProvenance`, et la carte de la candidate du modèle de buts),
`fin-de-saison`, `enjeu`, `deroule-simule` et `prix-juste-combine` (étape 28 : l'onglet « Fin de saison », l'encadré « Enjeu » de la page du match, la
carte « Déroulé simulé » et celle de Réglages, le prix juste du ticket). Un terme de
plus : une entrée au guide (le test refuse un `<HelpTip terme>` qui n'y est pas).

**Où c'est posé** : Repérage (`ScreenerView` : pastille de value dans la colonne Cote jouable, bandeau avec le prochain coup d'envoi,
la confiance et trois pastilles de provenance — moteur et saison, marché, cote jouable —, trois bulles d'aide ; l'écart moteur –
marché et la probabilité triée ne sont plus verts) ; Chutes de cotes (`DroppingOddsView` : flèche de mouvement de chaque chute et de
chaque bookmaker, compte à rebours de chaque rencontre, provenance, l'accord des bookmakers en bleu) ; état de la composition
(`AiLineupSnapshot` : page du match, page d'équipe, panneau de l'IA) ; `ClosingValuePanel` et `RiskControlPanel` (une bulle chacun).
Depuis l'étape 14 : `AVerifierBadge` — `aVerifier` (les raisons que le serveur joint au pronostic, à l'analyse ou à la ligne : `{ raisons, texte }`),
`marche` (l'identifiant du marché de la ligne : seules les raisons de SA famille — buts, corners, tirs, cartons, joueurs — et celles qui touchent tout
comptent ; sans `marche`, toutes celles que le serveur a jointes : jamais celles de la famille « joueurs » au résumé d'un match, donc pas de bandeau
pour un écart de buteurs ou de gardiens, seulement un badge sur un futur marché de joueur — buteur, passeur… ; aucun aujourd'hui), `avec-raison` (la raison courte à côté du mot), `taille` (`sm`, `md`) ; rien n'est affiché sans raison. Posé à côté
du verdict, jamais à sa place : cartes de marchés de la page du match (`MarketVerdictBoard` : le résumé avec la raison, chaque ligne avec son
marché ; `MarketPicksBoard` : chaque carte et le titre de chaque famille — Buts, Corners, Tirs, Tirs cadrés —, qui reçoit l'IDENTIFIANT du marché du
total de SA famille (`idMarche`, une chaîne comme `totalCorners`), jamais l'objet de la carte du total, que Vue refuse (« Expected String ») et que le badge
range en « buts » : depuis la correction du 07/10/2026, un constat « corners » paraît sur le titre « Corners » et sur lui seul, même sans pronostic de total),
page Opportunités (la colonne du pari, avec le marché de la ligne), détail d'un
pronostic et journal des pronostics (le badge du groupe, avec sa raison). Le verdict et le vert de la value ne changent jamais (test : mêmes
pastilles, même tri, avec ou sans le badge).

**Les cotes de vos bookmakers (étape 7 du plan, 06/10/2026)** — fraîches, archivées, saisies :
- **La règle de fraîcheur** est décidée par le serveur (`fraicheurCote`, `server/src/core/engine/fraicheurCotes.js`) et rejouée à
  l'identique par `etatFraicheur` (`utils/langageParis.js`, un test les compare) : heure du relevé inconnue, match commencé, cote
  plus vieille que le délai (3 h par défaut, de 15 min à 24 h), ou relevée avant l'annonce des compositions (une heure avant le
  coup d'envoi, si le réglage le demande) → **à rafraîchir**. Le réglage vit dans `data/runtime/fraicheur-cotes.json`
  (`GET`/`PUT /api/odds/fraicheur`, idempotent). L'heure d'une cote est lue dans les archives (`odds_events` / `odds_quotes`,
  source `odds-api`) ou, faute d'archive identique, à l'heure du fichier du relevé payant ; une saisie porte la sienne.
- **`pariDuMoteur(staking, maintenant)`** lit le verdict du moteur (`staking` de `/api/analysis`) : `conseille` (une value fraîche),
  `aRafraichir` (la value n'existe que sur une cote à rafraîchir : `reason: 'a_rafraichir'`) et la `fraicheur` réévaluée. La page
  du match, `ResultPredictionCard` (« Cote relevée aujourd'hui à 13:00. », sinon la note ambre « Value à rafraîchir ») et
  `MyBetsView` (la note « N values à rafraîchir » en tête de l'onglet Value bets) s'en servent : une value périmée n'y est jamais montrée
  comme un pari conseillé.
- **`ManualOddsEntry`** (`components/analysis`, props `matchId`, `home`, `away`) : la saisie express sur la page d'un match à venir
  (onglet Marchés, carte « Saisir une cote de vos bookmakers ») — bookmaker (vos bookmakers cochés dans Réglages), marché (buts, les deux marquent, buts d'une
  équipe, corners, tirs, tirs cadrés, cartons, buteur), issue, ligne, cote. Le 1N2 ne s'y saisit pas (il se relève chez The Odds
  API). Le serveur (`PUT /api/odds/saisies`) calcule la value face à la probabilité du moteur pour ce marché et la garde dans les
  archives, source `saisie` ; la liste montre chaque saisie avec sa `ValueBadge` (fraîcheur comprise), son heure
  (`ProvenanceChip` « Saisie à la main »), « Corriger » (une nouvelle cote, l'ancienne reste archivée, « corrigée · avant 2.10 »)
  et « Retirer » (`PUT /api/odds/saisies/retrait`). Pas de probabilité du moteur (cartons, buteurs) : « valeur inconnue », jamais
  de vert. Écriture différée pendant une actualisation ou un import : « en attente d'écriture ».
- **`PaidOddsAdvicePanel`** (`components/settings`, prop `variante` `complete` ou `compacte`) : le **conseil de relevé payant**
  (`GET /api/odds/conseil-releve`) — s'il vaut la peine maintenant, plus tard ou pas du tout, pour quels championnats et quels
  matchs (compte à rebours, compositions déjà publiées ou non), son coût (une requête par compétition suivie, 1 crédit au plus
  chacune), les crédits restants lus au dernier relevé, et où est le bouton. **Une information seulement** : le panneau ne lance
  rien, le relevé reste le bouton « Actualiser » que Pierre clique. Variante complète dans la carte « Cotes de vos bookmakers »
  de Réglages, avec le réglage de fraîcheur ; variante compacte (une ligne et un lien vers Réglages) dans la carte « Value à
  rafraîchir » de la page du match.

**Limites connues, dites plutôt que cachées**
- Corrigé à l'étape 8 : le Repérage ne voyait pas quel bookmaker avait fixé la cote juste du match (« juge et partie ») et pouvait
  montrer en vert une cote que `findValueBet` écarte. Le serveur lui donne maintenant le verdict du moteur (`verdict` de chaque marché
  1N2, pris à la lecture) : la colonne Cote jouable montre la cote que le moteur a jugée et son bookmaker, le « juge » écarté en dessous,
  et la pastille dit le verdict. La phrase `precision` ne sert plus que si le serveur n'a pas encore été relancé (pas de verdict).
- La value du Repérage vient du relevé The Odds API fait à la main : depuis l'étape 7, chaque meilleure cote jouable porte
  l'heure de son relevé (`bestOddsAt`) et sa fraîcheur (`freshness`) ; au-delà du délai, ou relevée avant les compositions, la
  pastille dit « à rafraîchir » au lieu du vert. La pastille de provenance garde son ambre au-delà de 24 h.
- La value d'une saisie express (corners, tirs, buts…) se lit contre la probabilité du modèle de statistiques, qui n'est pas
  encore vérifiée sur un banc d'essai (lot 4) : la phrase de la pastille le dit.
- Dans Matchs, la couleur de section est un émeraude proche du vert de la value (décision de Pierre en attente sur
  `--cm-section-soft` et `--cm-section-glow`, `tokens.css` n'a pas été touché) : la pastille se reconnaît à son bord, sa coche et
  son mot ; les chiffres du Repérage ne prennent plus la couleur de section.
- À migrer vers ces composants : `FreeOddsPanel` (une cote qui baisse en vert, qui monte en rouge), `MyBetsView` (depuis l'étape 8,
  l'onglet Value bets porte la pastille du verdict — même source que la page Opportunités — et son avantage n'est plus vert ; restent la
  probabilité verte de `PicksSearchCard` et les autres onglets), `AiMarketCard`, `ResultPredictionCard` (note « value » en `is-accent`, qui ne
  sort plus que pour une cote fraîche), le compte à rebours de `FixtureCard` (en `hero`), et les
  fonctions `quand` / `ilYA` de `DataOriginMenu` (reprises dans `langageParis.js`).
- Pas de thème clair dans l'appli : `tokens.css` n'a qu'un jeu sombre. Les composants n'emploient que ses jetons.

**La page « Opportunités du jour » (étape 8 du plan, 06/10/2026)** — une seule source de verdict :
- **Le verdict** vient du serveur (`verdictPari.js` : `stakingDuMatch`, la décision de pari qu'`analyzeMatch` prenait déjà, et
  `verdictsDuMatch`, ce qu'elle dit de chaque issue). L'analyse d'un match (page du match, onglet Value bets de Mes paris), le Repérage et
  la page Opportunités appellent la même fonction sur les mêmes entrées ; l'écran ne fait que `etatVerdict`. Un pari vert ici est vert
  là-bas, au même instant ; une value qui vieillit passe « à rafraîchir » partout.
- **La notification Windows** d'une NOUVELLE value verte (`composables/useNotificationsOpportunites.js`, montée une fois dans
  `AppShell`) : interrupteur sur la page, permission demandée une seule fois par le navigateur et seulement au clic, choix gardé dans ce
  navigateur ; lecture légère toutes les 2 minutes (`GET /api/opportunities/vertes`), une notification par opportunité (match, issue,
  bookmaker, cote ; mémoire partagée par les onglets, 14 jours), au plus trois par vérification puis une qui résume, toujours `silent`,
  étiquette (`tag`) propre à l'opportunité ; un clic ouvre l'onglet Opportunités. Rien ne sort du PC.
- **« Paris les plus probables »** de Mes paris (`utils/safestPicks.js`) lit pour corners, tirs et tirs cadrés les cotes justes du
  moteur (`statLines` de l'analyse : la binomiale négative mesurée de `statMarkets.js`) ; le modèle Poisson de l'interface
  (`shotsModel.js`) est retiré, et « Qui fait le plus de… » (sans probabilité du moteur) n'est plus proposé.

**La page d'un match, pour décider (étape 9 du plan, 06/10/2026)** — la décision d'abord, rien de perdu :
- **L'ordre du Résumé** (le sommaire « Aller à » en tête, un lien d'ancre par bloc, `id="upcoming-<bloc>"`) : (a) `Verdict par marché`, (b) « Pourquoi ce pourcentage »,
  (c) « Compositions et absents » (le terrain de `AiLineupSnapshot`, puis `TeamNewsCard`), (d) « Les cotes, de l'ouverture à maintenant »,
  (e) « Avis de l'IA » (`MatchAiAnalysisPanel`), (f) « Le détail » — le pronostic du résultat et du score, les statistiques, le cadre du match, comme avant — et,
  au bas, un renvoi vers les onglets. **Les huit onglets d'avant restent là**, chacun avec son contenu (Compositions et Analyse IA aussi : le Résumé
  les montre en plus, jamais à la place). Le pari conseillé (ou la value « à rafraîchir ») est monté en tête du verdict ; l'onglet Marchés garde son tableau
  de pronostics et la saisie express, et renvoie vers le verdict.
- **`MarketVerdictBoard`** (props `result` = l'analyse, `match`, `saisies` = `GET /api/odds/saisies`) : une ligne par issue du résultat puis une par pronostic du
  moteur (« Le match », « Buts », « Corners », « Tirs », « Tirs cadrés », dans l'ordre de `MarketPicksBoard`), puis les cotes saisies sur une autre ligne ou
  un autre marché (cartons, buteur…). Chaque ligne : le pari (logo de l'équipe visée), le moteur (probabilité entière, cote juste ; « statistiques » quand
  il n'y a pas de cote), **la meilleure cote de vos bookmakers et l'heure de son relevé** (« relevée il y a 10 min », « saisie à l'instant », le « juge et partie »
  écarté en italique), la pastille de value (`ValueBadge :verdict` pour le 1 / N / 2 — le verdict du serveur, jamais refait —, `ValueBadge` d'une saisie pour les
  autres marchés) et `ConfidenceGauge` (« pas encore mesurée », étape 38). **Aucun calcul de pari** : `utils/verdictParMarche.js` assemble ce que le serveur donne.
  Une cote qui n'existe pas se DIT (« Pas de cote chez vos bookmakers · à saisir », « Pas de cote de marché pour ce match ») ; une cote gratuite de référence
  n'y paraît jamais. Le bouton « Saisir une cote » ne fait qu'ouvrir la carte de saisie de l'onglet Marchés (événement `saisir`).
- **`OddsTimelineChart`** (prop `etat` = `GET /api/odds/fixture`) : les MOUVEMENTS que le serveur mesure déjà (`movement`, le même chiffre que « Ce qui a bougé
  depuis l'ouverture » de l'onglet Cotes) — pour chaque issue, la cote JUSTE (marge retirée) à l'ouverture et au dernier relevé, l'ouverture à gauche, le
  dernier relevé à droite, une issue qui baisse descend. Une issue se reconnaît à son trait (plein, tirets, pointillés) autant qu'à sa couleur (bleu,
  violet, cyan : **jamais le vert ni le rouge**, une cote qui baisse n'est ni bonne ni mauvaise). La légende est une liste (une ligne par issue : ses deux cotes
  et `OddsMoveArrow`), lisible à 343 px. Provenance réelle en tête (`ProvenanceChip` : les sources et l'heure du dernier relevé) ; ce sont des cotes de
  référence gratuites, pas celles de vos bookmakers — la note du pied le dit. Sans relevé, avec un seul relevé ou avec un serveur d'avant les mouvements, la carte
  le dit (et liste ce qui manque, source par source) au lieu de rester vide.
- **`PercentageWhyCard`** : la place du « pourquoi ce pourcentage », en tirets, avec « à venir · étape 40 du plan ». Elle ne montre aucune explication tant que le
  moteur n'en calcule pas ; l'étape 40 la remplira par son emplacement par défaut.
- **À 375 px** : chaque ligne du verdict devient une petite fiche (le pari et le moteur, la cote, la value et la confiance), la légende de la courbe aussi ;
  `.upcoming__block :deep(.card__header)` laisse passer le bouton ou la provenance d'une carte sous son titre (240 px au moins pour le titre) — le terrain des
  compositions défile horizontalement, comme avant.

**Le comparateur de vos bookmakers et le ticket (étape 10 du plan, 06/10/2026)** — où parier, à quel prix minimum, puis « J'ai parié » :
- **`BookmakerComparator`** (`components/betting`, props `result` = l'analyse avec `comparateur`, `match`, `saisies`, `cotes` = `GET /api/odds/fixture`,
  `pris` = les sélections du ticket) : dans la carte du verdict, sous `MarketVerdictBoard` (ancre `upcoming-comparateur`, hors du sommaire). Un tableau par
  marché (le 1 / N / 2, puis « Le match », « Buts », « Corners », « Tirs », « Tirs cadrés », « Autres marchés ») : une ligne par issue, une colonne par
  bookmaker qui a une cote (relevé The Odds API pour le 1 / N / 2, cotes saisies pour le reste), et la colonne « À prendre ». Chaque case : la cote, son heure
  (« relevée il y a 10 min », ambre quand elle est à rafraîchir), `ValueBadge :verdict` (la case du serveur, `comparateurDuMatch`, jamais refaite ; pour une
  saisie, `ValueBadge` de la saisie), « pari du moteur » ou « meilleure cote » (seulement si deux de vos bookmakers au moins cotent la ligne — un filet, jamais
  une couleur), et « Prendre ». « À prendre » : la cote minimale (et « jusqu'à » la maximale) du serveur (`core/engine/coteMinimale.js`), et « Autre cote »
  (prendre la ligne à une cote à taper). **Le vert** d'une case = le moteur conseille l'issue ET ce prix est une value fraîche chez ce bookmaker : la case du pari
  du moteur, et une autre case de la même issue qui reste au-dessus de la cote minimale (le même pari, moins bien payé). À part, en bas : les cotes de
  RÉFÉRENCE (bookmakers du relevé qui ne sont pas à vous, comme Pinnacle, et cotes gratuites), « référence, non jouable », sans pastille ni bouton.
  **À 375 px** : chaque ligne devient une fiche (l'issue et le moteur, chaque case avec le nom de son bookmaker, puis la cote minimale) — rien ne défile de côté.
- **`TicketDuPari`** (`components/betting`, `v-model:edition` = `{ bookmaker, cotes, coteCombinee }`, `v-model:mise`, `v-model:memeMatch`, props `selections`,
  `bookmakers`, `avecValidation`, `enCours`, `origine` ; événements `jai-parie` (le corps de `POST /api/bets`), `retirer`, `vider`) : LE ticket, sous le
  comparateur et dans le bordereau de Mes paris (sans sa mise ni son bouton : ceux du bordereau d'avant, renommé « J'ai parié »). Pour chaque sélection : le
  moteur (probabilité, cote juste, d'où elle vient, quand il l'a calculée), la cote PRISE (préremplie, à corriger), son heure et la cote minimale, en mots
  (« 2,30 : au moins 2,09, encore une value au seuil du moteur » — jamais en vert). Pour le ticket : le bookmaker (un seul), la nature (simple, combiné de
  plusieurs matchs, combiné du même match — sa cote est à taper, jamais le produit), « Combiner les paris d'un même match » (désactivé : un seul pari par match,
  comme avant), la cote, le gain potentiel et le gain attendu (simple seulement ; un combiné attend l'étape 28, et le dit), ce qui manque en ambre. Le composant
  n'appelle rien : la page enregistre (`betsStore.createBet`, au clic seulement). Règles : `utils/ticket.js` ; assemblage du comparateur : `utils/comparateur.js`.
- **Mes paris** : le carnet dit, pour chaque pari, chez qui, la probabilité du moteur au moment du pari, l'heure de la cote prise et le gain attendu (« non
  noté » pour un pari d'avant l'étape 10).

**Le suivi des paris, les garde-fous et les comptes bookmakers (étape 11 du plan, 06/10/2026)** — séparer la chance de la méthode, et se
protéger sans jamais bloquer un pari :
- **Performance paris** (`BetsPerformanceView`, onglet de Historique moteur) lit `GET /api/bets/suivi` (`server/src/data/suiviParis.js`, tout calculé
  côté serveur) et ajoute, sans rien retirer : la carte « Gagné face à l'attendu » (les garde-fous qui alertent en `.cm-note`, cinq `.cm-kpi` — gagné du
  carnet, attendu, gagné sur les mêmes paris et l'écart, « avec leur probabilité N / M », valeur de clôture moyenne —, `GainCurvesChart`,
  `LossStreakBand`), puis la carte de la valeur de clôture (d'avant), la carte « Résultats par marché, championnat, bookmaker, cote et confiance » (cinq
  `BetBreakdownTable`) et la carte « Le carnet, pari par pari » (`BetLedgerTable`) ; jour par jour et le taux par marché restent dessous, tels quels.
  Sans réponse du serveur (pas encore relancé) : l'erreur en `.cm-note.is-danger` et les cinq tableaux VIDES (`tableauxVides`), jamais une page blanche.
- **`GainCurvesChart`** (props `courbe`, `attendu`) : un pas par pari réglé, dans l'ordre de règlement, départ à 0 ; trois traits qui se reconnaissent
  à leur dessin autant qu'à leur couleur — « Gagné · tout le carnet » (couleur de section, plein), « Gagné · paris avec leur probabilité » (cyan, épais),
  « Attendu · mêmes paris » (bleu d'information, tirets) — **jamais le vert ni le rouge** sur un trait ; repères ronds en euros à gauche (HTML, nets),
  légende en liste avec la valeur finale, la phrase de l'écart (« dans ce que le hasard donne avec ces cotes et ces mises, ±X € 95 fois sur 100 »).
  Une courbe qui n'existe pas encore le dit (« pas encore — aucun pari réglé n'a sa probabilité du moment »).
- **`LossStreakBand`** (prop `series`) : « Série de pertes normale jusqu'à N » (calcul exact du serveur, `core/risk/seriesDePertes.js`), `HelpTip
  series-de-pertes` ; une bande de 0 à l'échelle : la zone normale en bleu d'information, au-delà en ambre (rare avec ces cotes), trois repères
  (médiane du hasard, plus longue série, série en cours) ; les phrases : la zone, la série en cours (ambre et « au-delà de la zone normale » quand elle
  la dépasse), la plus longue (« presque à coup sûr » plutôt que « 100 % »), d'où viennent les probabilités (du moteur, sinon 1 / cote).
- **`BetBreakdownTable`** (prop `tableau`) : `.cm-table` à douze colonnes, dans l'ordre de lecture — paris, misé, gain réel, ROI, gain attendu « sur N paris »
  ou « non noté », valeur de clôture « +x % · n », réussite, cote moyenne, puis les comptes (gagnés, perdus, en attente, annulés), qui défilent à droite sur
  un écran étroit ; cellules un peu plus serrées que le tableau par défaut ; chaque pari dans UNE ligne (un combiné a la sienne) ; au pied
  **Total (Σ)** — comptes et montants, jamais un pourcentage ni une cote — et **Moyenne (⌀) par pari** — mise, gain, ROI, réussite, cote, valeur de clôture,
  pondérés par pari, jamais la moyenne des taux des lignes. Lignes fixes toujours là, même à zéro (vos bookmakers, les cinq tranches de cote, les trois
  niveaux de confiance), estompées quand elles sont vides. Le vert et le rouge seulement pour un gain et une perte (`cm-positive` / `cm-negative`).
- **`BetLedgerTable`** (prop `paris`) : 30 paris du plus récent au plus ancien, puis « Voir les N autres paris » ; pour chacun ce qui a été joué (logo
  `PickCrest`), la probabilité de gagner retenue (« 60,0 % (moteur, au pari) » ou « (1 / cote) »), chez qui, cote, mise, statut en `.cm-chip`, gain réel,
  gain attendu, valeur de clôture (« non mesurée », « 1/2 sélections » pour un combiné) ; ce qu'il faut signaler face aux réglages ACTUELS (mise
  maximale, mise acceptée, compte fermé) en ambre SOUS le pari (neuf colonnes : le tableau tient à 1280 px). Une date illisible du carnet : « — ».
- **Réglages** : la carte « Gestion du risque » garde le coupe-circuit (`RiskControlPanel`, qui reçoit en plus `manuel` — l'interrupteur seul — et
  `automatique` — le garde-fou qui l'a enclenché, dit en rouge sous l'interrupteur) et pose dessous **`GardeFousPanel`** : deux `AppNumberField` (mise
  maximale par pari, perte maximale par semaine ; vide = aucun plafond, AUCUN par défaut), « Retirer les plafonds » (`ghost`), « Enregistrer »
  (`section`, `PUT /api/config/garde-fous`, idempotent), l'état de la semaine en `.cm-kpis` (perte, mises en attente, reste, conseil de mise : sans plafond /
  ≤ X € / suspendu), les alertes en `.cm-note`, la zone normale en phrases, la provenance (fichier, date). Nouvelle carte « Comptes bookmakers » :
  **`BookmakerAccountsPanel`**, une fiche `.cm-block` par bookmaker (solde déclaré, mise maximale acceptée, limitation en `AppSelect`, « Enregistrer »
  par fiche, résumé et date), « Compte fermé » / « Compte limité » en `.cm-chip` ; la note « Jamais d'identifiant ni de mot de passe » en tête ; AUCUN
  champ de texte libre. Les deux panneaux lisent et écrivent par `stores/risqueStore.js` (relu au plus toutes les 2 min).
- **Le ticket** (`TicketDuPari`, props `gardeFous` et `comptes`) : les alertes des garde-fous et de la fiche du compte, en ambre (gras pour un compte fermé
  ou la perte de la semaine), les phrases du serveur mot pour mot (`utils/gardeFous.js`) ; elles ne vont JAMAIS dans « ce qui manque » : « J'ai parié »
  reste actif. La page du match lit garde-fous et fiches au premier clic sur une cote (jamais au chargement) ; Mes paris au montage ; après « J'ai
  parié », les alertes renvoyées par le serveur s'affichent (note sous le ticket, ou messages de Mes paris).
- **La barre du haut** (`AppTopbar`) : une puce « Garde-fou atteint » (rouge) ou « Garde-fou : à regarder » (ambre) quand le serveur signale une alerte
  (`gardeFous` de `GET /api/refresh`, sans route de plus) ; elle mène à Performance paris.
- **La note du pronostic** (`ResultPredictionCard`) dit une mise conseillée ramenée à un plafond et le garde-fou qui a enclenché le coupe-circuit ;
  l'onglet Value bets de Mes paris marque « · plafond » à côté de la mise Kelly (la raison au survol).

**La simulation complète (étape 28 du plan, 27/10/2026)** — fins de saison, enjeu des rencontres, déroulé simulé, prix juste d'un combiné. Calculée
à blanc chaque nuit, et **tout est ÉTEINT à la livraison** : deux interrupteurs de Réglages › Versions du moteur (`EngineSimulationTrial`, ci-dessus),
relus avec leurs conditions à chaque lecture (`effectif` de `GET /api/simulation/etat`) ; éteints, les classements, les cartes de rencontre et la page
du match sont rendus EXACTEMENT comme avant (test), seul le ticket d'un combiné dit en une ligne que le prix juste attend. Aucun calcul à l'ouverture
d'une page : tout est lu dans ce que la nuit a rangé, chaque chiffre avec son heure. Appels : `services/simulationApi.js` ; mots et règles :
`utils/simulation.js` (pur, sans Vue).
- **`EnjeuBadge`** (`components/common`, props `enjeu` — une ligne du serveur, `GET /api/simulation/enjeux` — et `compacte`) : le seul dessin d'un
  enjeu. « Gros enjeu » en bleu d'information (un club au moins voit une zone bouger d'au moins 20 points entre victoire et défaite, arrondis à 5
  comme à l'écran), « Sans enjeu » en gris (les deux à « 0 pt » une fois arrondis), « Enjeu non calculé » en gris pointillé (fin de saison non
  calculée, coupe, rencontre trop lointaine) ; entre les deux, pas de pastille. Jamais vert ni rouge : un enjeu n'est ni une value ni une perte, et il
  n'entre dans aucun pourcentage du moteur. Au survol et dans `aria-label` : « Arsenal joue la Ligue des champions : 60 % en cas de victoire, 40 % en
  cas de défaite ; Burnley joue sa survie : 45 % de descente en cas de victoire, 70 % en cas de défaite » — chaque chiffre dit s'il va avec la
  victoire ou avec la défaite ; arrondi à 5, jamais « 100 % » ni « 0 % » : aux extrêmes les seuils du tableau « Fin de saison », « ≥ 90 % » dès 90 %
  et « ≤ 10 % » dès 10 % ; deux chiffres arrondis égaux : « autour de 60 % quelle que soit l'issue » ; un club dont les chances ne changent presque
  pas entre une victoire et une défaite, dans toutes ses zones, « n'a presque rien à jouer », les deux : une seule phrase (jamais « points d'écart » :
  à côté d'un classement, on y lirait des points de classement) — et « Calculé la nuit du 26/10, refait chaque nuit jusqu'à la veille du match, puis
  gardé tel quel. » (la forme « gardé tel quel jusqu'au coup d'envoi » pour une rencontre du jour même de la nuit). Posée sur `MatchCard` (une rangée sous la carte,
  `compacte`), lue par `stores/enjeuxStore.js` — UNE requête par jour affiché, gardée 10 min, jamais une par carte —, et dans l'encadré
  **`EnjeuDuMatch`** de la page du match (`AppCard` « Enjeu », entre le verdict et « Pourquoi ce pourcentage » : la pastille ou « Un enjeu ni gros ni
  nul », la phrase, quand, la loi, `ProvenanceChip` « Simulation CôteMaster, classement FotMob »). Seulement avec « Fins de saison et enjeu » allumé.
- **`DerouleSimuleCard`** (`components/analysis`, page du match après les cartes du résultat et du score ; SEULEMENT en « tout ») : en tête
  « **Information, pas un pronostic.** » et la phrase de l'écart mesuré sur juillet 2025 – septembre 2026 (17 818 matchs jamais appris) avec les cotes de clôture, sur les marchés MONTRÉS ; une ligne
  par issue, par groupes (À la mi-temps, Mi-temps / fin, Le premier but, D'une mi-temps à l'autre), libellés avec les noms des clubs
  (`libelleDuDeroule` de `langageParis.js`), l'écart au réel mesuré au survol (`title` = `ecartMesureDit`, « Le hasard du tirage seul vaut ± 0,5
  point ») ; « Prendre » met la ligne au ticket comme une sélection qui « se lit, ne se parie pas » (`pariable: false` : « J'ai parié » reste refusé,
  ce pari ne se règle pas automatiquement). Les marchés écartés par la porte 1 (« un but dans chaque mi-temps », « au moins un rouge ») n'y
  paraissent JAMAIS : une phrase dit que deux marchés manquent et renvoie à Réglages. Un marché ou un combiné que la garde de sûreté du jugement
  principal a éteint (plus de 4 points d'écart sur vos matchs) s'éteint SEUL de la même façon — la phrase dit les deux sources, Réglages le nomme
  par son libellé — ; le reste du déroulé et des prix reste montré. « Ni pronostic ni règlement automatique. »
- **Le prix juste d'un combiné** (`TicketDuPari`, prop `prixJuste` fournie par `composables/usePrixJuste.js` : `POST /api/simulation/prix-combine`
  350 ms après le dernier changement d'un combiné, réponse tardive ignorée, la réponse d'un ticket d'avant retirée dès que le ticket change — jamais
  montrée ni enregistrée pendant le recalcul —, rien demandé par la page du match quand l'affichage est éteint (Mes paris demande, le serveur répond
  « éteint » sans rien calculer ; « calcul en cours » n'est dit que quand l'affichage est connu comme allumé) : « Prix juste : 4,10 (24,4 %)
  à 14 h 32 » (`HelpTip terme="prix-juste-combine"`) ; la cote tapée en écart NEUTRE (« Chez Winamax (cote tapée) : 3,60, soit 12 % sous le prix
  juste ») — jamais `ValueBadge`, jamais vert ; en gris « si les sélections étaient indépendantes : 5,30 » ; la précision (± 1 point ; ± 2 avec « les
  deux marquent » ; moins sûr au-delà de 65 %) ; la provenance (grille du moteur et son heure, déroulé de la nuit, « corners supposés indépendants des
  buts : non mesuré »). Éteint : « Prix juste : calculé à blanc chaque nuit, pas encore montré… » ; sélections contradictoires : « impossible » ; un
  marché écarté par la porte 1 : refusé, « ce marché a été écarté par la preuve sur 2019-2023 ». Le gain attendu d'un combiné n'existe qu'avec un prix
  juste montré ; « J'ai parié » enregistre alors ce prix avec son heure.

**Vérifier** : `server/test/langageParis.test.mjs` (les règles, dont le vert comparé à `findValueBet`) et
`server/test/langageParisEcran.test.mjs` (rendu des sept composants et des pages, sans navigateur : aucune couleur en dur, le vert
seulement dans la pastille de value, aucun appel hors liste), `server/test/cotesVosBookmakers.test.mjs` (étape 7 : la règle de
fraîcheur, la même à l'écran et au serveur, la value d'une saisie, les archives, aucune route qui déclenche un appel payant, le
conseil de relevé) et `server/test/cotesVosBookmakersEcran.test.mjs` (rendu de la pastille « à rafraîchir », de la saisie express,
du conseil de relevé et de la note du moteur), `server/test/opportunites.test.mjs` (étape 8 : même verdict page / Mes paris / moteur, le vert
comparé à `findValueBet` sur 3 000 matchs tirés au sort, filtres, tri, favoris, notifications, « Paris les plus probables » = moteur) et
`server/test/opportunitesEcran.test.mjs` (rendu de la page et du Repérage avec le verdict), `server/test/pageMatchDecision.test.mjs` (étape 9 : le verdict par marché et la
courbe, règles pures essayées sur les vraies réponses du serveur) et `server/test/pageMatchDecisionEcran.test.mjs` (rendu de la page d'un match : l'ordre des blocs, chaque
donnée d'avant, le match sans cotes), `server/test/comparateur.test.mjs` et `server/test/ticket.test.mjs` (étape 10 : la cote minimale au seuil exact, les cases
face au moteur, « J'ai parié » pour de vrai, sa valeur de clôture) et `server/test/comparateurEcran.test.mjs` (rendu du comparateur et du ticket),
`server/test/suiviParis.test.mjs` (étape 11 : la zone normale sur un cas connu, la somme des gains réels = le carnet, le gain attendu, les plafonds face au
moteur, le vrai serveur dans une copie, la fiche sans secret, l'écran = le serveur) et `server/test/suiviParisEcran.test.mjs` (rendu de Performance paris,
des garde-fous, des fiches, du coupe-circuit et du ticket), `server/test/reperes.test.mjs` et `server/test/reperesEcran.test.mjs` (étape 15 : la ligne
« toutes les saisons » de l'écran = celle du serveur, la courbe, la dispersion, le bloc rendu dans chacun de ses états),
`server/test/preuveEcran.test.mjs` (étape 16 : le bloc « Preuve après lancement » de la feuille de route, ses règles et son rendu
dans chacun de ses états), `server/test/versionsMoteurEcran.test.mjs` (étape 25 : la carte « Versions du moteur », ses règles et son rendu
dans chacun de ses états, avec les réponses du vrai serveur), `server/test/adoptionMoteurEcran.test.mjs` (étape 25, seconde moitié : l'essai de la
candidate, ses deux verdicts, le bouton « Adopter » et l'alerte de dérive, dans chacun de leurs états), `server/test/fichesEcran.test.mjs` (étape 31 : l'indice de force
d'une équipe, la note par poste d'un joueur et « ce qui prédit, ce qui trompe » — règles recomptées à la main, chaque bloc dans chacun de ses états, aucune note de joueur sur le terrain
des compositions), `server/test/bookmakers.test.mjs` (la route de lecture `GET /api/market-knowledge` : même forme avant et après le calcul, un championnat à la fois, lecture
seule, les règles de la page recomptées sur les vraies réponses) et `server/test/bookmakersEcran.test.mjs` (la page Bookmakers rendue dans ses états : prête, un championnat, inconnu,
jamais calculé, serveur en erreur ou pas à jour, autre version — huit tableaux toujours complets), `server/test/bulletins.test.mjs` (étape 42 : la garde des chiffres, les fiches du jour et de la semaine lues dans la base d'essai
et recomptées par un autre chemin, le service avec un faux Claude — une fois par jour et par semaine, le budget, le mode économe, les pannes — et la route) et `server/test/bulletinsEcran.test.mjs` (la carte rendue dans chacun
de ses états, les deux étapes dans la liste de l'actualisation, le tableau par type de la carte « Budget Claude »), puis `ui/scripts/verifier-interface.mjs --avant <src d'avant>`.

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
- **Fin de saison** (étape 28, 27/10/2026) → un onglet « Fin de saison » APRÈS « Classement » et
  « Corrigé par les xG » (`LeagueStandingsPanel`), seulement quand « Fins de saison et enjeu » est
  allumé et que le championnat est simulé — JAMAIS pour une coupe. `FinDeSaisonTable` : en tête la
  provenance réelle (`ProvenanceChip` « Simulation CôteMaster, classement FotMob », l'heure de la nuit ;
  dessous le détail : 10 000 fins de saison, l'heure du classement relevé, les rencontres restantes) et
  `HelpTip terme="fin-de-saison"` ; la LOI nommée dans ses trois cas — forces de buts du modèle en
  service, forces du modèle en essai, ou « classement officiel seul » en `.cm-note.is-warning` avec sa
  phrase « trop sûre d'elle… lisez les pourcentages comme des ordres de grandeur » et sa cause (le modèle de
  buts pas en service, ou ses forces qui manquent ou ne sont pas à jour), « Pourquoi : » la raison lue,
  et des cases arrondies à 10 — ; « Mesuré sur les saisons 2023-2026 … pas encore sur la saison en
  cours » ; les mentions en `.cm-chip` (« jusqu'à la scission : titre, Europe et descente se jouent
  ensuite », « départage simplifié (différence de buts) »). Puis un `.cm-table` par table (une par
  groupe d'un championnat scindé) dans l'ordre OFFICIEL, jamais réordonné : rang, `TeamCrest` sur
  chaque ligne, le favori en or à sa place (`FavoriteStar` non interactive), la pénalité (« −8 pts »),
  les points, puis UNE colonne par famille présente (titre, Europe, barrages, descente…) : au point
  près entre 10 et 90, « ≥ 90 % » / « ≤ 10 % » au-delà (jamais « 97 % », « 100 % » ni « 0 % »), en
  gris « acquis sauf surprise » quand 10 000 saisons sur 10 000 vont dans le même sens ; la légende
  des extrêmes et du gris au pied. Non calculée : `EmptyState` « Fin de saison non calculée » avec sa
  raison (« 2 clubs non reconnus : … », « rencontres en trop au calendrier… », « poules de fin de
  saison : … ne sont pas simulées »). Lue dans ce que la nuit a rangé, jamais calculée à l'ouverture.
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
- Pas de cote absente sans le dire : une cote, un marché, un volume ou un direct qui manque est affiché avec sa raison (source qui ne couvre pas la compétition, pas encore publié, match introuvable, connecteur indisponible…), jamais un simple tiret. Règle de Pierre du 04/10/2026.
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
- Pas de vert qui ne dit pas « value » (06/10/2026, § 3 bis) : un écart, une chute de cote, une probabilité triée, un accord de
  bookmakers, une confiance ne sont jamais verts — le vert d'un pari est la pastille `ValueBadge`, rien d'autre. Une notion de pari
  (value, confiance, mouvement de cote, composition, compte à rebours, provenance) s'affiche avec le composant du langage des paris,
  pas avec un `.cm-chip` colorié à la main.
- Pas de calcul lourd à l'ouverture d'une page (14/10/2026, étape 24) : un écran lit des résumés déjà écrits par l'actualisation ; ce qui n'est pas encore préparé
  s'affiche « pas encore mesuré » avec sa raison, il n'est jamais calculé à la volée (le bilan de calibration du mois en cours prenait 6 s au premier appel).
- Pas de chiffre sans son heure quand il vient d'un relevé : `ProvenanceChip` dit le fournisseur réel et l'heure, ou dit qu'il
  ne les a pas.
- Pas de vert pour un combiné : aucune value de combiné n'est prouvée (aucun prix de combiné relevé ; la grille est jugée contre le
  produit des simples, pas contre les bookmakers). Le prix juste d'un combiné et l'écart à la cote tapée restent neutres, jamais
  `ValueBadge` (27/10/2026, étape 28). Un enjeu non plus n'est ni vert ni rouge (`EnjeuBadge`).
- Pas de marché écarté par une preuve montré « pour information » : un marché que la porte 1 de l'étape 28 a écarté (« un but dans
  chaque mi-temps », « au moins un rouge ») n'apparaît ni dans le déroulé ni comme jambe d'un combiné ; la liste se lit dans
  `noteDeLaSimulation.js`, jamais recopiée à la main ; le rallumer demande une variante déclarée.

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

Depuis l'étape 45 (24/10/2026), les deux contrôles ci-dessus sont ceux de `node scripts/verifier-interface.mjs --avant <ancien src>` (compilation de chaque composant, construction
dans un dossier temporaire, rien de perdu face à l'ancien `src` : chaque ligne disparue est listée et se justifie), et les écrans de l'IA ont leurs essais de rendu côté serveur, sans
navigateur : `server/test/bulletinPageEcran.test.mjs` (la page « Bulletin »), `momentsClesEcran.test.mjs` (les moments clés), `bilanApresMatchEcran.test.mjs` (le bilan d'après-match et
la carte de marché commune) et `bulletinPage.test.mjs` (les deux routes de lecture). Une règle d'écran qui se teste dans le texte du composant (un « Relire » qui relit SA route, une adresse
remplacée et non empilée) se garde par une expression sur le source : un rendu côté serveur ne clique pas.

Depuis l'étape 28 (27/10/2026) : `server/test/simulationEcrans.test.mjs` rend côté serveur, sur les réponses du vrai serveur, l'onglet « Fin de
saison » (aux extrêmes, loi nommée dans ses trois cas, scission, non calculée, coupe), `EnjeuBadge`, le déroulé, le ticket dans chacun de ses
états et la carte de Réglages ; et il vérifie que TOUT ÉTEINT, la carte de rencontre, le classement et la page du match ne changent pas d'un
octet (serveur d'avant sans la route, réponse « éteint », « éteint » avec des données présentes : même HTML ; allumé, seuls les ajouts diffèrent).
À la livraison, ces trois écrans ont aussi été comparés une fois au code d'AVANT l'étape (ancien `src`, mêmes réponses) : identiques.
