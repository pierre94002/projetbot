# Étape 35 — LE BANC DES DÉBUTS DE SAISON ET DES CHANGEMENTS D'EFFECTIF : les règles du regard, ÉCRITES AVANT LE REGARD

Écrit le **09/11/2026** (heure de Paris, prise avec `date`), par l'agent d'écriture du lot 1a (Opus), dans le bac à sable, AVANT
le passage du banc. **NON SCELLÉ** à l'écriture : l'orchestrateur relit `avant-scellement.md`, puis le sha1 de ce fichier est noté
dans `SCR35\etat.md` et dans `banc-regles.sha1.txt` (temps 2). Ordre de priorité suivi : `decisions-orchestrateur.md` (lot
allégé : 11 variantes jugées, seuil 2,8376, toutes « sans cote » ; « 1N2 seul » rapporté seulement ; la force de l'effectif
DEDANS, verdict « prudent ») > `scratchpad/decisions-pierre-02-11.md` (n° 1 : compositions « oui partout, à l'essai » ; n° 6 :
« qui compte » = 30 % des minutes, promu d'une division non suivie = promu moyen) > `critique.md` > `conception.md` > `dossier.md`.

**Aucun résultat du banc n'a été lu avant ce fichier** : aucune perte, aucun réglage, aucun verdict calculé sur la base du bac ni
sur football-data réel. Le code du banc n'a tourné que sur des MONDES TIRÉS AU HASARD (`test/aides/debutsMondes.mjs` ; la mesure
T-B2bis, §7) et sur un MAGASIN FABRIQUÉ (`test/aides/debutsFabrique.mjs`). La base du bac n'a été ouverte (en lecture seule) que
pour : la partie 0 (compter ses rencontres, ses championnats et leurs libellés, ses lignes de joueurs, ses lignes football-data —
`partie0\base-bac.txt` ; et la FORME de `standings_official`, trois lignes de fin de saison, aucune rencontre jugée) ; et
`--comptes` (§11), qui ne lit aucun score (seule la présence d'un score à la 90e), et dont la partie « effectif » laisse le rejeu
des fiches de l'étape 30 lire les feuilles d'avant J comme chaque nuit (aucun score comparé à une prévision, aucune perte) ; et le
diagnostic des deux contrôles cassés à l'essai 1 des comptes (§10 : les mêmes passes SANS résultat, puis les noms et les saisons
des clubs football-data, `fd_teams` et les libellés de `fd_history` ; aucun score).

## 1. La procédure exacte (un seul regard)

Dans le bac, serveur du bac arrêté, base du bac **en lecture seule** (le calcul tourne dans le processus à part
`src/data/debutsDeSaison/debutsBancEnfant.js`, qui ouvre la base par `openDb({ readonly: true })`), **un calcul lourd à la fois**,
jamais entre 0 h 10 et 2 h 30, avec `CM_BAC_A_SABLE=1` et `MATCH_STATS_DB=C:\Users\PC\CoteMaster\bac-a-sable\base\match-stats.db`,
depuis `C:\Users\PC\CoteMaster\bac-a-sable\code\server`. `SCR35` = `C:\Users\PC\AppData\Local\Temp\claude\C--Users-PC-OneDrive-Bureau-developement-ProjetBot\c4b41134-df35-4d3f-be49-63a4f15181fd\scratchpad\etape35`.

1. **`--comptes`** (avant le regard ; aucune perte, aucun réglage) :
   `node scripts/debuts-de-saison.mjs --comptes --sortie SCR35/comptes-debuts-2.json --passe C:/Users/PC/OneDrive/Bureau/developement/ProjetBot/server/data/runtime/refresh-status.json`
   — son sha1 est noté dans `etat.md` ; le contrôle des définitions (§10) se fait sur lui. Fait le 09/11/2026 : essai 1
   (`SCR35/comptes-debuts.json`, gardé) avec deux contrôles cassés, corrigés avant le regard (§10) ; **essai 2 retenu**
   (`SCR35/comptes-debuts-2.json`, §11).
2. **Le scellement** (temps 2, sur message de l'orchestrateur) : le sha1 de CE fichier est noté dans `etat.md` et dans
   `banc-regles.sha1.txt` avant toute autre chose ; les modules du §2bis sont recalculés juste avant.
3. **`--banc`, UN passage** :
   `node scripts/debuts-de-saison.mjs --banc --regles SCR35/banc-regles.md --sha1-regles <sha1 de ce fichier> --k 11 --verrou SCR35/banc-passage-reel.lock --passe C:/Users/PC/OneDrive/Bureau/developement/ProjetBot/server/data/runtime/refresh-status.json --sortie SCR35/banc-debuts.json`
   — le script refuse si K ≠ 11, si ce fichier a changé (sha1), si un module scellé (§2bis) a un autre sha1, si la sortie existe ;
   il attend que `running` soit null dans `refresh-status.json` du dépôt (lecture seule) ; il pose le VERROU
   `SCR35\banc-passage-reel.lock` (heure, pid, sha1 de ces règles, K) AVANT de lancer le calcul, et ne le retire jamais.
4. **`--recopier`** : `node scripts/debuts-de-saison.mjs --recopier SCR35/banc-debuts.json` écrit
   `src/data/debutsDeSaison/noteDesDebuts.js` (DEBUTS_AU_BANC) PAR SCRIPT, et garde la sortie et ces règles telles quelles dans
   `test/fixtures/banc-debuts-etape35.json` et `test/fixtures/banc-regles-etape35.md` (T-B7 refait la note à l'octet). Jamais une
   retouche à la main.

Un second `--banc` est REFUSÉ par le script sans `--rejouer-apres-correction "<raison>"` ; s'il est fait (seulement pour une faute
technique découverte APRÈS, jamais pour un réglage), il est dit, la raison est écrite dans le verrou, et les deux verdicts sont
montrés côte à côte.

## 2. Les modules employés

Le passage lit, et n'emploie que : `data/debutsDeSaison/` (réglages, formules, accumulateur, passe, lecture, banc, enfant),
`data/db/squadChanges.js`, et, importés jamais modifiés (gelés pendant l'essai de la 27, sha1 de la partie 0) : `goalModel.js`
(forces, grille, démarrage à froid, mélange du 1N2 rapporté), `forcesButs.js` (AccumulateurDesForces : le bras A À L'OCTET),
`seasonWindows.js`, `dayTable.js` (faitsDepuisFd), `playerRatings.js` (le rejeu des fiches de l'étape 30 : la force de l'effectif),
`bench/guard.js` (comparer, zPour), `bench/lancements.js` (VARIANTES_DE_L_ETAPE_35), `bench/prix.js` et `bench/periodes.js` (le 1N2
d'avant-match rapporté), `marginRemoval.js`. Au §2bis, ce ne sont pas ceux-là seulement qui sont SCELLÉS mais **tout ce que
charge le processus à part** : la fermeture des imports de `debutsBancEnfant.js` dans src/ (57 modules : 9 de l'étape 35, 48
importés jamais modifiés ; `partieB\sceller-modules-35.cjs`, recalculée au scellement) ; le script refuse le passage si l'un a
changé (`- <sha1> src/<chemin>`, T-B10). La note `noteDesDebuts.js`, écrite par la recopie APRÈS le passage, n'en fait pas
partie (l'enfant ne l'importe pas).

## 3. Les données et les fenêtres (`PERIODES_DU_BANC`, reglagesDebuts.js)

| Fenêtre | Dates | Rôle | Déjà vue ? |
|---|---|---|---|
| magasin, mise en route | 2023-01-01 → 2023-06-30 | états accumulés, rien d'appris ni de jugé | la conception et la critique y ont lu les minutes (export du 22/09) |
| magasin, période A | 2023-07-01 → 2025-06-30 | pli 0 : apprend ; pli 1 : est jugée | oui (27, 29, 30, 32…) : jugement **prudent** |
| magasin, période B | 2025-07-01 → **2026-09-23** (dernier jour lu) | pli 0 : est jugée ; pli 1 : apprend | idem |
| football-data, forces | depuis 2000-07-01 | les forces de la candidate s'accumulent (buts seuls) | — |
| football-data P1 | 2005-07-01 → 2019-06-30 | APPREND (k0 du commun fd, centres, déplacement du faux promu) | vue par la 18, la 27 (m5, m7) : apprentissage déclaré |
| football-data P2 | 2019-07-01 → 2023-06-30 | JUGÉE, rien n'y est appris | jamais pour cette question : jugement **neuf** (la 18 et la porte 1 de la 27 l'ont regardée pour d'autres questions) |
| P5 | depuis le 24/09/2026 | jamais lue par le banc (la preuve après lancement) | — |

Au magasin, les lignes des deux plis sont réunies dans UN juge par variante, chaque ligne jugée avec ce qui a été appris sur
l'AUTRE période (T-B6). À football-data, P2 est jugée avec ce qui a été appris sur P1 seulement ; le banc LÈVE si une rencontre du
magasin est après le 23/09/2026 ou si P2 entre dans l'apprentissage (T-B6). football-data : les 22 divisions de NIVEAUX_FD
seulement (les 16 fichiers par pays ne sont jamais lus) ; aucun xG (les forces y sont celles des buts) ; des championnats
seulement.

## 4. Les définitions (conception §2.1-2.4, §2.7-2.8 ; fixées dans `reglagesDebuts.js` et `formulesDebuts.js`)

- **Club** : son numéro FotMob (team_day.club) ; à football-data, fd_teams.id (identité dans son pays), **corrigé par ALIAS_FD**
  (`reglagesDebuts.js` : quatre clubs écrits sous deux noms d'une saison à la suivante, réunis à la main par leur numéro — §10,
  modifié avant le regard ; la clé de la rencontre reste celle de la ligne). Jamais un nom ; un numéro mal formé (0, texte) n'a ni
  rang ni statut (T-R7).
- **Match de championnat** : ni coupe, compté au classement, non attribué. **Saison du club** pour un match : celle de son
  championnat (seasonOf) ; pour une coupe, celle du championnat du club (son dernier match de championnat), sinon celle de la
  coupe ; à football-data, le libellé du fichier.
- **Trêve** : le premier match du club (toute compétition, non attribué) d'une saison plus récente que celle de son match d'avant
  (un tour préliminaire de juillet ouvre la saison d'un club européen ; le Clausura n'ouvre rien — Liga MX juillet-juin ; Q3 :
  le second tournoi n'est PAS un début de saison).
- **Rang** : 1 + ses matchs de championnat de la même compétition et de la même saison joués AVANT le jour J (un match reporté
  prend le rang du jour où il se joue ; `meta.round` jamais lu).
- **Statut**, fixé à son premier match de championnat de la saison : `premier-au-magasin` (son championnat n'avait aucun match la
  saison d'avant), `nouveau` (lui n'en avait aucun), `debut` (même championnat), `promu` / `relegue` (deux championnats de la
  table NIVEAUX d'un même pays : EPL 1, Championship 2, League 1 3, League 2 4 ; La Liga - Spain / La Liga 2 - Spain ; Serie A -
  Italy / Serie B - Italy ; Bundesliga - Germany / Bundesliga 2 - Germany ; Ligue 1 - France / Ligue 2 - France — LIBELLÉS EXACTS
  de la base ; à football-data NIVEAUX_FD : E0-EC, SC0-SC3, D1/D2, I1/I2, SP1/SP2, F1/F2 et N1, B1, P1, T1, G1 seuls), sinon
  `autre-changement`. Le championnat de la saison d'avant : celui où il a joué le plus de matchs de championnat (égalité : le plus
  récent). Le classement officiel n'entre dans AUCUN chiffre (un compte de contrôle seulement, §10).
- **L'état scindé** : les huit sommes de la candidate tenues en « cette saison » / « avant » ; la trêve verse « cette saison »
  dans « avant » ; la remise à zéro de la candidate (changement de championnat) vide les seize ; chaque case vieillit comme la
  candidate (demi-vies 35 / 25), seule « cette saison » reçoit le match. `avant + saison` = la candidate à 1e-12 (T-R4).
- **La lecture au jour J** (tout est publié en fin de journée ; un match ne voit jamais son jour) : la trêve du match du jour est
  appliquée À LA LECTURE (sans effet sur la candidate) ; `tot` = les sommes de la candidate À L'OCTET (AccumulateurDesForces).
  **La remise à zéro du 1er match d'un club qui change de championnat** : la candidate, elle, lit encore à ce match les forces de
  l'ancien championnat (sa remise se fait après lui) ; les familles « promus », « nouveaux venus » et leur contrôle lisent leurs
  DEUX bras avec la remise faite AVANT ce 1er match (le commun et le dirigé partagent ce choix ; ni la candidate, ni le rappel, ni
  la force de l'effectif ne la font). Écart à la conception : elle ne disait pas quand la remise se fait ; dit à l'orchestrateur.
- **Les forces lues** (réglages p) : `S = sai + δ·(tot − sai)`, δ = 2^(−d/35) (attaque), 2^(−d/25) (défense) ; attaque xG =
  (SA + k0·c_A)/(WA + k0), buts de même, mélange en log w = 0,7 ; d = 0, c = 1 : forcesDe de la candidate À L'OCTET (T-R4). Le
  faux point : `S = dep + δ_F·(S − dep)` (dep : les sommes depuis le faux point). Le faux promu : × (W_saison + 8m)/(W_saison + 8)
  (attaque et défense, W de la saison en cours). La force de l'effectif : ln A' = ln A + β_off·x_off, ln D' = ln D − β_def·x_def.
- **Les buts attendus « sans cote »** : λ = L_dom·A_h·D_a, μ = L_ext·A_a·D_h, puis le démarrage à froid de la candidate (n0 = 8) ;
  L = moyennesAvant du championnat du match au jour J, celle de la candidate, LA MÊME dans tous les bras (T-B11).
- **La force de l'effectif** (conception §2.8 ; Pierre n° 1) : E = Σ_j (minutes_j / (90 × M)) × apport_j, cette saison (avant J, M
  ≥ 2 matchs avec feuille, toutes compétitions) face à la saison d'avant entière, avec les MÊMES fiches (le rejeu de la 30 publié
  à la fin de la veille) ; sans fiche = 0 (compté) ; Δ = E − E_avant (offensif, défensif). **x = Δ ÷ l'écart-type des Δ** des
  clubs concernés des deux plis (calculé sans résultat ; critique, constat 6). Écart à la conception : la division par L_lieu /
  L_adverse de la conception §5.9 n'est pas faite — L se lit sur des buts, que `--comptes` ne lit pas ; le coefficient appris
  absorbe l'échelle, et les fiches sont déjà ramenées au niveau du championnat.
- **Continuité, arrivées et départs** : calculés (squadChanges.js) et MONTRÉS (lot 1b), jamais jugés (le lot allégé).

## 5. Les ensembles (une rencontre de championnat d'une fenêtre du banc, avec un score à la 90e)

| Ensemble | Une rencontre en fait partie si… |
|---|---|
| E_rappel | au moins un club `debut` de rang 1 à 10 |
| E_promus | au moins un club `promu` ou `relegue` de rang 1 à 10 |
| E_nouveaux | au moins un club `nouveau` de rang 1 à 10 |
| E_fausse | au moins un club à 10 matchs de championnat ou moins de son faux point (magasin) |
| E_fauxPromu | au moins un faux promu (club `debut` tiré) de rang 1 à 10 |
| E_effectif | une rencontre de E_rappel avec un club `debut` de rang 3 à 10 qui a un Δ |

Le faux point (FAUSSE_RENTREE) : juillet-juin, le 1er mars de la seconde année ; année civile, le 1er septembre ; + (FNV-1a de
« club:saison:f » mod 45) jours ; le premier match de championnat du club à ce jour ou après ; une remise à zéro après lui
l'abandonne. Le faux promu (FAUX_PROMU) : FNV-1a de « club:saison:p » mod 1000 sous le seuil de SA fenêtre = arrondi(1000 ×
promus et relégués suivis ÷ clubs `debut`) (magasin : A ∪ B ; football-data : P1 ∪ P2), compté par la passe sans résultat. Le faux
effectif : les Δ du club suivant dans l'ordre FNV-1a de « club:saison:m » parmi les clubs `debut` du même championnat-saison.

## 6. Les 11 variantes (K = 11, z = Φ⁻¹(1 − 0,05/22) = **2,8376** ; VARIANTES_DE_L_ETAPE_35 ; FORMES de bancDesDebuts.js)

| n° | identifiant | ensemble | bras A | bras B |
|---|---|---|---|---|
| 1 | `debuts-de-saison-v1` | — | la définition retenue, ne lit aucun résultat : comptée, jamais jugée | — |
| 2 | `magasin-rappel-sans-cote` | E_rappel | la candidate | + l'oubli d (grille GRILLE_D 0 à 64, a priori gaussien d'écart-type 1,5 sur ln(1 + d), égalité : le plus petit) |
| 3 | `magasin-placebo-fausse-rentree` | E_fausse | la candidate | + l'oubli d_F au faux point (même grille, même a priori) |
| 4 | `magasin-promus-sans-cote` | E_promus | **le commun des remis à zéro** : UN centre (c0_A, c0_D) pour les promus ET les relégués (Newton, a priori 0,5) | **les centres dirigés** : (θ_A, θ_D) pour un promu, (−θ_A, −θ_D) pour un relégué (Newton, a priori 0,5) |
| 5 | `magasin-nouveaux-sans-cote` | E_nouveaux | le commun c0 du pli (appris sur E_promus) posé sur les nouveaux venus | le centre des promus θ du pli posé sur eux (Pierre n° 6 : un promu moyen ; rien n'est appris sur eux) |
| 6 | `magasin-placebo-faux-promu` | E_fauxPromu | la candidate + le commun c0 du pli sur les promus et relégués | + le déplacement d'un promu (m_A, m_D) posé sur les faux promus, Newton, a priori 0,5, SANS remise à zéro |
| 7 | `magasin-force-effectif-sans-cote` | E_effectif | le rappel du pli (son d appris sur E_rappel) | + β·x (β_off, β_def ; Newton, a priori **0,05** sur le coefficient standardisé) |
| 8 | `magasin-placebo-faux-effectif` | E_effectif (avec un faux Δ) | le rappel du pli | + β·x du faux effectif |
| 9 | `fd-promus-sans-cote` | E_promus de P2 | le commun des remis à zéro, appris sur P1 | les centres dirigés, appris sur P1 |
| 10 | `fd-nouveaux-sans-cote` | E_nouveaux de P2 | le commun c0 de P1 sur les nouveaux venus | le centre des promus θ de P1 sur eux |
| 11 | `fd-placebo-faux-promu` | E_fauxPromu de P2 | le commun c0 de P1 | + le déplacement du faux promu appris sur P1 |

Les familles promus (4, 9), nouveaux venus (5, 10) et le faux promu (6, 11) lisent leurs deux bras avec la remise à zéro faite
avant le 1er match (§4). Les centres valent pendant la saison du changement seulement (le statut est celui de la saison).
Écart à la conception : le constat 4 de la critique (deux paramètres dirigés) est appliqué AUX DEUX FENÊTRES, comme l'écrit sa
correction (« aux deux fenêtres ») ; les décisions de l'orchestrateur le résument « au magasin ». À confirmer.
**Retirés du jugé** (lot allégé) : les quatre « 1N2 seul » (rapportés, §9), « avec cotes » (pas calculé au lot 1 : l'essai de la
candidate du lot 2 le jugera avec les vraies cotes), la continuité et le faux mercato (montrés, jamais jugés), le rappel et la
fausse rentrée à football-data (le k0 y confondait le signal : critique, constat 2). Pas de « second tournoi » (Q3), pas de poids
par championnat (une ou deux rentrées par championnat et par pli).

## 7. Le recalage, l'apprentissage, le commun fd

- **Le recalage** : chaque bras reçoit SES deux niveaux c_dom = ln(Σ buts dom. ÷ Σ λ), c_ext de même, en forme fermée de Poisson,
  sur l'ensemble concerné de la période d'apprentissage — LE MÊME ensemble pour les deux bras (T-B11) ; puis les bornes [0,2 ; 6].
- **L'apprentissage** : maximum de la vraisemblance de Poisson des buts à la 90e (les deux équipes ; niveaux du bras profilés),
  moins la pénalité de l'a priori ; grille pour d et d_F ; Newton (gradient et hessien numériques, pas 1e-4, 25 itérations au plus,
  arrêt sous 1e-7) pour les centres, les déplacements et les β. Réglages neutres → le bras B prend le chemin du bras A, gain
  exactement 0 (T-B12). Un pli dégénéré (recalage impossible) est sauté et DIT, jamais un arrêt.
- **Le commun fd** (critique, constats 1 et 2) : à football-data, TOUS les bras lisent le même k0 — `FORME_FD` = `remis-a-zero-seul`,
  fixée par la mesure de T-B2bis AVANT ce fichier (§7bis). Avec « k0-commun » : le k0 de la candidate réappris sur P1 (toutes les
  rencontres de championnat de P1 avec un score) dans {8, 11, 16, 24}, le plus vraisemblable (égalité : le plus petit) ; avec
  « remis-a-zero-seul » : k0 = 8 (celui de la base). « P2 juge la méthode avec le réglage des buts seuls. »

### 7bis. La mesure de T-B2bis (football-data FABRIQUÉ, taille réelle, SANS AUCUN effet de promu ; règle écrite avant elle)

Règle écrite AVANT la mesure (critique, constats 1 et 2 ; `reglagesDebuts.js`, FORMES_FD) : forme complète > 5 % de faux « retenu » (promus ou nouveaux venus) sur les graines → commun des remis à zéro seul. Mesure :
`partieB\t-b2bis-mesure.mjs` (aucune donnée réelle, aucune base) — football-data FABRIQUÉ à taille réelle (la structure des 22
divisions de NIVEAUX_FD, 2000 → 2023, `test/aides/debutsMondes.mjs`), ρ = 1, promus, relégués et nouveaux venus à la moyenne
de leur nouveau championnat (AUCUN effet), 50 graines par monde (3500 + 101 × g), deux mondes : « NUL » (forces couplées entre
divisions, 0,35) et « nul pur » (couplage 0) ; les trois variantes de football-data jugées par le vrai juge (K = 11) avec
chacune des deux formes. Fixture relue par T-B2bis : `test/fixtures/t-b2bis-etape35.json`
(sha1 5f8d9222c253ed0c9570d837da6166939491edac).

| Monde | Forme | promus « retenu » à tort | nouveaux venus « retenu » à tort | faux promu « retenu » | « moins bon » sur 50 (promus / nouveaux / faux) | z moyen (promus / nouveaux / faux) |
|---|---|---|---|---|---|---|
| NUL (couplage 0,35) | complète (k0 appris : 11 × 7, 16 × 43) | 6 % (graines 2, 23, 28) | 4 % (graines 23, 42) | 0 % | 0 / 0 / 0 | 1,10 / 0,98 / -0,20 |
| NUL (couplage 0,35) | remis à zéro seul (k0 = 8) | 0 % | 0 % | 0 % | 0 / 0 / 0 | 0,27 / -0,16 / -0,22 |
| nul pur (couplage 0) | complète (k0 appris : 16 × 50) | 2 % (graines 20) | 2 % (graines 34) | 0 % | 0 / 1 / 2 | -0,10 / -0,09 / -0,40 |
| nul pur (couplage 0) | remis à zéro seul (k0 = 8) | 0 % | 0 % | 0 % | 1 / 3 / 2 | -0,92 / -0,82 / -0,42 |

**Décision (la règle appliquée, pas un choix)** : `FORME_FD = 'remis-a-zero-seul'` — la forme complète dépasse 5 % de faux « retenu » (promus ou nouveaux venus) dans au moins un monde : la règle écrite avant garde le commun des remis à zéro seul.
Sous un effet nul, le z moyen d’une forme honnête est proche de 0. La forme complète est décalée vers le HAUT dans le monde
NUL (des « retenu » à tort). Le commun des remis à zéro seul est proche de 0 dans le monde NUL, mais décalé vers le BAS dans
le nul pur (des « moins bon » à tort : 1 promus, 3 nouveaux venus, 2 faux promu sur 50) : une erreur PRUDENTE (jamais une utilité à tort), mais un
« moins bon » à football-data empêche sa famille d’être utile (§8). La règle écrite avant ne portait que sur « retenu » : elle
s’applique telle quelle. Les quatre graines nulles de T-B2bis (2301-2304) sont rejouées à chaque suite avec la forme retenue :
jamais « retenu ».

## 8. Le juge, l'ampleur, « utile »

- **Le juge** : `comparer` de l'étape 16, inchangé (`guard.js`) : la perte log du **score exact à la 90e**, −ln p(score), sur la
  grille 0-20 de grilleDesButs (ρ −0,05), plancher 1e-6 (= perteDuScore de la 32, à l'octet : T-B5) ; une ligne par match, bloc =
  le match ; mode moyenne, sens min, `variantes: 11`, 1 000 tirages, graine 35, 200 blocs au moins, α 0,05 → z = 2,8376.
  Verdicts : « retenu », « pas prouvé », « moins bon », « pas assez de matchs ». Le gain en part de la perte du bras A, avec sa
  fourchette.
- **L'ampleur** (sans résultat) : la plus grande, parmi les 13 marchés témoins (plus de 0,5 à 3,5, les deux marquent, chaque équipe
  +0,5 à +3,5), des moyennes de |P_B − P_A| sur les matchs jugés ; seuil 0,5 point (T-B8 : les scores jugés changés, même ampleur).
- **Utile** (§5.5 de la conception ; contrôles PAR FENÊTRE : critique, constat 2) : une famille (rappel ; promus ; nouveaux venus ;
  force de l'effectif) est utile si, sur au moins UNE fenêtre où elle est jugée, sa variante est « retenu » avec au moins 200
  matchs jugés et une ampleur ≥ 0,5 point, ET que le contrôle de CETTE fenêtre n'est pas « retenu » ; ET si sa variante n'est
  « moins bon » sur AUCUNE fenêtre. Un contrôle « retenu » rend le banc FAUX pour sa famille sur SA fenêtre seulement (un contrôle
  retenu à football-data ne tue pas le verdict du magasin, et inversement). Contrôles : rappel → fausse rentrée ; promus et
  nouveaux venus → faux promu ; force de l'effectif → faux effectif.
- **Prudent** : un effet retenu sur le magasin (déjà vu) est dit « prudent » ; la force de l'effectif l'est TOUJOURS (ses fiches
  ont été réglées sur la fenêtre jugée : critique, constat 6). Les mots de l'écran : la valeur montrée n'est dite « effet
  mesuré » qu'avec le sens du bras B (jamais le commun des remis à zéro) ; « ce qui prédit le mieux un promu », jamais « les
  promus sont plus faibles de… » ; la valeur vient du magasin, la méthode a été mesurée sur football-data (critique, mineur 10).

## 9. Rapporté SANS verdict (hors K)

Les 13 marchés témoins (perte et gain) ; les tranches de rang 1-5 et 6-10 ; la tranche 11-20 du rappel (la même variante sur plus
de matchs : critique, mineur 8 — la preuve et l'essai du lot 2 jugeront le rappel sur toute la saison) ; P2 saison par saison et
le huis clos (2020-03-14 → 2021-05-31) ; le **« 1N2 seul »** : les mêmes bras, le mélange de la candidate (wT 0,55, wS 0,1) avec le
1N2 d'avant-match football-data (lecture directe de la moyenne ; au magasin, les rencontres rattachées), recalés dans ce régime
sur la période d'apprentissage, ses lignes seulement là où le 1N2 existe — un gain, jamais un verdict. Les valeurs finales du
magasin apprises sur A ∪ B (d, c0, θ, β) et celles de P1 (pour information) ; l'horizon de la preuve des familles utiles :
⌈n_banc × ((z(11) + 0,84) ÷ z_banc)²⌉ matchs concernés.

## 10. Les contrôles « définition cassée » (sur `--comptes`, AVANT le regard ; COMPTES_CASSES)

Une définition est **cassée** si : au magasin, E_rappel compte moins de 2 500 matchs sur une période, ou les promus et relégués
suivis moins de 20 clubs-saisons ; les nouveaux venus font plus de 25 % des clubs d'un championnat-saison ; plus de 10 % des
montées et descentes ont une zone officielle de la saison d'avant de sens contraire (« Promotion » / « Relegation » ; un barrage
gagné reste « Promotion playoff » : d'accord) ; le faux point manque à plus de 20 % des clubs-saisons qui jouent dans la fenêtre ;
le faux promu s'écarte de plus de 20 % du nombre de vrais promus et relégués de sa fenêtre ; plus de 25 % des clubs `debut` de
rang 3 à 10 n'ont pas de Δ ; à P2, les promus et relégués font moins de 100 clubs-saisons ; P1 compte moins de 10 000 matchs ; un
club football-data apparaît dans deux pays. Alors : correction AVANT le regard, sans compter de variante, comptes refaits,
« Modifié avant le regard le … » ici, nouveau sha1. Un compte surprenant mais non cassé est seulement dit.

**Modifié avant le regard le 09/11/2026** (aucune perte, aucun réglage, aucun verdict calculé ; les règles n'étaient pas
scellées). L'essai 1 de `--comptes` (`SCR35/comptes-debuts.json`, sha1 e1cbc50938c0ef58eae276bf2da5d0acf1f34031) a cassé deux
contrôles ; le diagnostic, sans aucun score (`partieB\diagnostic-comptes.txt`, `partieB\audit-identites-fd*.txt`) :
1. **Le faux point manquait à 22,2 % des clubs-saisons** (717 / 3 227) : 655 sont des saisons COUPÉES par la fin de la fenêtre
   (le jour de leur faux point tombe après le 23/09/2026 : saisons 2026-27, saisons civiles 2026), 62 des saisons finies avant
   leur jour (l'Argentine 2023, dont le championnat finit fin juillet), **0 autre** (parmi les clubs-saisons dont le jour est lu
   et dont la saison continue après lui, aucun ne manque). La définition n'est pas cassée ; le contrôle comptait des saisons qui
   ne peuvent pas avoir de faux point. **Correction du contrôle** : le faux point manque à plus de 20 % des clubs-saisons qui
   jouent dans la fenêtre ET dont le jour du faux point est lu (au plus le dernier jour lu) ; les saisons coupées sont montrées
   à part (T-B18).
2. **Les nouveaux venus de G1 2005-06 faisaient 31,25 %** (5 / 16) : l'un d'eux, « Kallithea » (#1213), jouait en G1 la
   saison d'avant sous le nom « Kalithea » (#1223) — **un même club sous deux numéros** : un faux nouveau venu, ses forces
   reparties de rien. L'audit de tous les numéros de football-data (même pays, noms voisins, jamais la même saison ; 31
   candidats jugés UN PAR UN à la main, jamais par un rapprochement souple) en trouve trois autres d'une saison à la suivante
   dans la même division : Roda JC / Roda (N1 2009-10 → 2010-11), AFC Telford United / Telford United (EC 2011-12 → 2012-13),
   Mouscron-Peruwelz / Mouscron (B1 2015-16 → 2016-17 ; le Mouscron de 2000-09, un autre club, garde son numéro). **Correction
   de la définition** : `ALIAS_FD` (reglagesDebuts.js : quatre alias PAR NUMÉRO, celui de Mouscron à partir du 2010-07-01),
   appliqué aux deux camps et au fait des forces (`numeroFd`, lectureDesDebuts.js ; la clé reste celle de la ligne ; T-R7).
   Les autres candidats sont des clubs différents (Cesena / Cosenza, Farense / Feirense, Granada / Granada 74, Wimbledon /
   AFC Wimbledon…) ou séparés par des années hors des divisions suivies : laissés à part. Restait **G1 2011-12 : 5 / 16**, cinq
   clubs distincts montés d'une division non suivie (Levadeiakos, Panetolikos, Giannina, OFI, Doxa Dramas ; cinq autres partis) :
   pas un problème d'identifiants. **Correction du contrôle** : une division-saison football-data vérifiée nom par nom
   (`NOUVEAUX_VERIFIES_FD`) est montrée à part, SEULEMENT si ses nouveaux venus sont exactement les numéros listés (T-B18).
Comptes refaits : essai 2 (§11), aucune définition cassée. Six bugs volontaires de plus (C-alias, C-alias-jour, C-cle, C-fait,
C-faux-point, C-verifiee).

## 11. Les comptes d'avant le regard (`--comptes`, aucune perte, aucun réglage)

`SCR35/comptes-debuts-2.json` (sha1 2eeced660d9e117c22b39c32c619211e7281589d ; 2026-11-09T18:31:31.759Z → 2026-11-09T18:32:33.524Z ; processus à part pid 11300, mémoire max 683 Mo ; passe de Pierre « null » vérifiée (attente 0 s)). Aucun résultat lu : oui ; la force de l’effectif par le rejeu des fiches de la 30 : oui. Durées : magasin 56 s (lecture 18 s, passe et rejeu des fiches 37 s), football-data 5 s.

| Fenêtre | matchs de championnat | sans score 90e | E_rappel | E_promus | E_nouveaux | E_fausse | E_fauxPromu | 11-20 (témoin) | promus+relégués (clubs-saisons) | nouveaux venus | `debut` |
|---|---|---|---|---|---|---|---|---|---|---|---|
| magasin A | 28 713 | 0 | 5 434 | 391 | 1 105 | 7 008 | 507 | 4 761 | 42 | 116 | 939 |
| magasin B | 17 683 | 0 | 5 715 | 626 | 1 123 | 3 703 | 610 | 4 575 | 84 | 130 | 1 106 |
| football-data P1 | 108 886 | 0 | 26 986 | 7 194 | 3 941 | — | 7 301 | 26 954 | 781 | 419 | 4 422 |
| football-data P2 | 30 204 | 0 | 7 817 | 1 921 | 1 063 | — | 1 969 | 7 738 | 207 | 112 | 1 290 |

- **Statuts** (clubs-saisons, au premier match de championnat) : magasin A {"premier-au-magasin":518,"debut":939,"nouveau":116,"relegue":21,"promu":21} ; B {"nouveau":130,"debut":1106,"relegue":42,"promu":42} ; football-data P1 {"debut":4422,"relegue":385,"nouveau":419,"promu":396,"premier-au-magasin":22} ; P2 {"relegue":103,"debut":1290,"nouveau":112,"promu":104}.
- **Montées et descentes du magasin** : League 2 → League 1 (promu, A 4, B 8) ; League 1 → League 2 (relegue, A 4, B 8) ; League 1 → Championship (promu, A 3, B 6) ; EPL → Championship (relegue, A 3, B 6) ; Championship → League 1 (relegue, A 3, B 6) ; La Liga - Spain → La Liga 2 - Spain (relegue, A 3, B 6) ; Championship → EPL (promu, A 3, B 6) ; La Liga 2 - Spain → La Liga - Spain (promu, A 3, B 6) ; Serie B - Italy → Serie A - Italy (promu, A 3, B 6) ; Serie A - Italy → Serie B - Italy (relegue, A 3, B 6) ; Ligue 1 - France → Ligue 2 - France (relegue, A 3, B 5) ; Ligue 2 - France → Ligue 1 - France (promu, A 3, B 5) ; Bundesliga - Germany → Bundesliga 2 - Germany (relegue, A 2, B 5) ; Bundesliga 2 - Germany → Bundesliga - Germany (promu, A 2, B 5).
- **Football-data, frontières** (24) : E3 → E2 (promu, P1 56, P2 15) ; E2 → E3 (relegue, P1 56, P2 15) ; E0 → E1 (relegue, P1 42, P2 12) ; E2 → E1 (promu, P1 42, P2 12) ; E1 → E2 (relegue, P1 42, P2 12) ; E1 → E0 (promu, P1 42, P2 12) ; SP2 → SP1 (promu, P1 42, P2 12) ; SP1 → SP2 (relegue, P1 42, P2 12) ; I2 → I1 (promu, P1 42, P2 12) ; I1 → I2 (relegue, P1 40, P2 12) ; F2 → F1 (promu, P1 41, P2 9) ; F1 → F2 (relegue, P1 40, P2 9) ; ….
- **Zones officielles de la saison d’avant** (contrôle seulement) : 123 lues, 3 absentes, 0 de sens contraire (0,0 %).
- **Nouveaux venus**, championnat-saison le plus touché : magasin Liga 1 - Peru 2025 4/19 (21,1 %), Brazil Série A 2024 4/20 (20,0 %), Brazil Série A 2025 4/20 (20,0 %) ; football-data G1 2011 5/16 (31,3 %, vérifiée une par une), G1 2005 4/16 (25,0 %), I2 2019 5/20 (25,0 %), I2 2014 5/22 (22,7 %) (vérifiées : G1 2011, numéros 901, 902, 982, 1107, 1142).
- **Faux point** (magasin) : 3 227 clubs-saisons qui jouent dans A ∪ B, 717 sans faux point (22,2 %) ; dont 655 saisons coupées par la fin de la fenêtre (jour du faux point après le 2026-09-23) ; parmi les 2 572 dont le jour est lu : 62 sans (2,41 % : des saisons finies avant leur jour, dont l’Argentine 2023).
- **Faux promu** : magasin seuil 62 ‰ (126 promus et relégués ÷ 2045 clubs `debut`) → 124 faux promus (écart -1,6 %) ; football-data seuil 173 ‰ (988 ÷ 5712) → 994 (écart 0,6 %).
- **Continuité** (montrée, jamais jugée), A : 8 451 clubs-matchs de rang 2 à 10, 857 sans valeur ; médiane 71,3 % (q10 45,6 %, q90 89,4 %).
- **Force de l’effectif**, A : 7 512 clubs-matchs `debut` de rang 3 à 10, 6 704 avec un Δ ; couverture des minutes par une fiche : médiane 100,0 % (q10 100,0 %).
- **Continuité** (montrée, jamais jugée), B : 8 680 clubs-matchs de rang 2 à 10, 162 sans valeur ; médiane 72,0 % (q10 47,3 %, q90 90,0 %).
- **Force de l’effectif**, B : 7 574 clubs-matchs `debut` de rang 3 à 10, 7 430 avec un Δ ; couverture des minutes par une fiche : médiane 100,0 % (q10 100,0 %).
- **Écart-type des Δ** (A ∪ B, la standardisation de x ; sans résultat) : offensif 0,1745, défensif 0,3125 (14 134 clubs-matchs ; faux effectif : 13 878).
- **Football-data, un club dans deux pays** : 0.

**Les contrôles « définition cassée »** (§10) :

| contrôle | fenêtre | valeur | seuil | cassé ? |
|---|---|---|---|---|
| rappel-min — matchs du rappel (au moins un club « debut » de rang ≤ 10) | A | 5 434 | 2 500 | non |
| promus-min — clubs-saisons promus ou relégués suivis | A | 42 | 20 | non |
| effectif-manquant — part des clubs « debut » de rang 3 à 10 sans Δ de la force de l’effectif | A | 10,76 % | 25 % | non |
| rappel-min — matchs du rappel (au moins un club « debut » de rang ≤ 10) | B | 5 715 | 2 500 | non |
| promus-min — clubs-saisons promus ou relégués suivis | B | 84 | 20 | non |
| effectif-manquant — part des clubs « debut » de rang 3 à 10 sans Δ de la force de l’effectif | B | 1,90 % | 25 % | non |
| nouveaux-max — part des nouveaux venus du championnat-saison le plus touché (Liga 1 - Peru 2025) | A∪B | 21,05 % | 25 % | non |
| zones-contraires — montées et descentes dont la zone officielle de la saison d’avant dit le sens contraire | A∪B | 0 | 10 % | non |
| faux-point-manquant — clubs-saisons qui jouent dans la fenêtre sans faux point, parmi ceux dont le jour du faux point est lu (655 saisons coupées par la fin de la fenêtre à part) | A∪B | 2,41 % | 20 % | non |
| faux-promu-taille — écart du nombre de faux promus au nombre de vrais promus et relégués | A∪B | -1,59 % | 20 % | non |
| p2-promus-min — clubs-saisons promus ou relégués de P2 | P2 | 207 | 100 | non |
| p1-min — matchs de championnat de P1 (le k0 du commun fd s’y apprend) | P1 | 108 886 | 10 000 | non |
| faux-promu-taille-fd — écart du nombre de faux promus au nombre de vrais promus et relégués | P1∪P2 | 0,61 % | 20 % | non |
| club-deux-pays — clubs football-data rangés dans des divisions de deux pays | fd | 0 | 0 | non |
| nouveaux-max-fd — part des nouveaux venus de la division-saison la plus touchée (G1 2005) ; vérifiées une par une, à part : G1 2011 | P1∪P2 | 25,00 % | 25 % | non |

**Aucune définition cassée.**

## 12. Ce qu'on peut attendre, honnêtement (critique, constats 3 et 5 ; les chiffres de la critique, à K = 17)

- Le rappel est incertain : invisible si les forces persistent à 0,9 d'une saison à l'autre, visible une fois sur trois à 0,8,
  presque sûr à 0,7 (au magasin). La candidate ramène DÉJÀ de 15 à 19 % vers la moyenne à chaque début (ses 8 matchs fictifs).
- Les promus : mesurables sur football-data P2 environ une fois sur deux à l'effet de la mesure m5 de la 27 (une fois sur trois
  avec le commun des remis à zéro) ; au magasin, non.
- Les nouveaux venus : une chance sur cinq.
- La limite de la forme retenue à football-data (§7bis, FORME_FD = `remis-a-zero-seul`) : sous un effet nul, environ 6 % de
  chances qu'un « moins bon » à football-data bloque les nouveaux venus (§8) — une erreur prudente, jamais une utilité à tort.
  Dite aussi dans la note (`limites`, LIMITES_DU_LOT_1A).
- La force de l'effectif : une puissance suspendue à une inconnue (r, le lien entre le changement d'effectif et le vrai saut) —
  forte à r = 0,5, faible à r = 0,25 ; son verdict est toujours « prudent ».
- Avec des cotes, rien ne se voit (le marché sait déjà) : rapporté.
- L'exemple de Pierre (« si tous les joueurs majeurs ne sont pas titulaires ») relève de la force du ONZE du jour (étapes 30 et 34),
  connue une heure avant le match, pas de l'effectif de la saison mesuré ici.
- Le coût de P2 : la future v2 du modèle de buts recopiera ces vues ; son banc de candidate tourne par défaut sur P2 et y dira
  « 100 % des lignes déjà vues » — la v2 perd son seul contrôle historique neuf (critique, mineur 9).

## 13. Les sorties

`SCR35\banc-debuts.json` (jamais écrasée) : `premierRegard` (= l'heure du verrou), les règles (fichier, sha1), les modules scellés,
la passe de Pierre, l'empreinte du moteur et celle de la candidate, les comptes du passage (records, seuils du faux promu,
écart-type des Δ, rencontres rattachées au 1N2), les durées et la mémoire du processus à part, et `banc` : K, z, la forme du commun
fd et son k0, les contextes des plis (d du rappel, c0 et θ des promus), pour chaque variante (appris par pli, recalages, matchs
jugés, verdict, gain, fourchette, z observé, ampleur, témoins, rapportés), les familles (utile, fenêtre, prudent, banc faux par
fenêtre) ; `final` (valeurs apprises sur A ∪ B et P1) ; `horizons`. Puis `--recopier` (§1).

## 14. Ce qui ne se fait pas après le regard

Aucun seuil, aucune grille, aucun a priori, aucune forme, aucun ensemble, aucune fenêtre n'est changé après le passage ; une variante
corrigée = un identifiant de plus, déclaré avant son passage, et le seuil de TOUTES devient z(K + 1). Aucun second passage sans
`--rejouer-apres-correction` (une faute technique seulement). La note n'est écrite que par `--recopier`.

## 2bis. Les modules scellés (recalculés au scellement)

Tout ce que charge le processus à part (la fermeture des imports de `src/data/debutsDeSaison/debutsBancEnfant.js` dans src/,
57 modules ; `partieB\sceller-modules-35.cjs`). Les modules de l’étape 35 (le code au moment du regard) :
- b93e19eccb49320b0315eec21c8e27588dfd8274 src/data/db/squadChanges.js
- 7a5539f7eb5a473f7658444d2a47b13dc973536c src/data/debutsDeSaison/bancDesDebuts.js
- 229392a0415571e45782aa81cc76903896164b79 src/data/debutsDeSaison/comptesDesDebuts.js
- b063df8cf65c2fa70988c49c308a68467c3f968d src/data/debutsDeSaison/debutsAuJourJ.js
- 63d90ad167e4d2d1cbfca19d90ec8403bc2ba6d4 src/data/debutsDeSaison/debutsBancEnfant.js
- 15c12e1e2bfb1909576b03ef99d3914af3fb4eab src/data/debutsDeSaison/formulesDebuts.js
- ced6a19853c829a04adfba87a2c18c6ddf05c686 src/data/debutsDeSaison/lectureDesDebuts.js
- a5a9967d028afcf6a819f5dd2fbc44546c8a18fa src/data/debutsDeSaison/passeDesDebuts.js
- 1961cf732ecc955d223e4eb46021656bd537e57f src/data/debutsDeSaison/reglagesDebuts.js

Les modules du moteur, du banc et des lectures, importés jamais modifiés :
- 60551323d356d5502684ca32276793fcb946ef84 src/bench/guard.js
- 2c1434cefe5b21055c313750ce0a1c2c8f6abc12 src/bench/jugeAPart.js
- 24757023bc7b80ec7bb8d092d990a257e5efa6ab src/bench/lancements.js
- c40ebc02607830dec623d071c0d70778f26cf806 src/bench/metrics.js
- d8b5264a88fd7ef241fb16bd209f3928c53ac628 src/bench/periodes.js
- 0f33a6b56d5238057be45f5720f2050dac22bf6a src/bench/prix.js
- d08c78df17760083f8d9d649d448598db52e5ec4 src/bench/statValue.js
- 3eca30850f4844f924ed1ec47b497606a68dec30 src/bench/trialsRegistry.js
- 51f4bf847f1bbb4a81d291a96566e3e9cb13af21 src/config/bacASable.js
- 236a33d7f952b12d4596b02ecb7c6090afca137d src/core/engine/goalModel.js
- 1c81f14ce0e25e3af595318028234c565798eea0 src/core/engine/motsDuModeleDeButs.js
- 654e310c28e88de98c2f2ccf247b64ba5c3babaf src/core/engine/noteDuModeleDeButs.js
- 44bb6ed76ed724981de01b8d48b5a91ccb59dbed src/core/engine/scorePrediction.js
- 9abf1962a1c47d854cbc161624249a4df657279f src/core/engine/vosBookmakers.js
- b3deabcfcf1fe1d7f875d93a1b327b6efc0e883f src/core/market/marginRemoval.js
- 83c4cf5111c071ca7f95422f826125ecd464484f src/core/model/dixonColes.js
- 78be7262cce935f745491e220804da4e8e093aa8 src/core/model/poisson.js
- 325d985101ae32bab53546e68eff1a437afc341b src/data/db/columns.js
- afc8d42ccc9028531da8d9efc2700ece449d6a97 src/data/db/dayTable.js
- 4ecda40200d8da352bc8c51adefb1152de4af916 src/data/db/forcesButs.js
- 6a5bcdd1d85e10909de81a9174b6d3fa8afbccdf src/data/db/identityRegistry.js
- 1c5c192ce3ba261f884c37541dd46b14736746c7 src/data/db/leagueBenchmarks.js
- fbc5b5f71cd1ffc0d54772a7a9386c9ed8d4a0a2 src/data/db/matchStatsDb.js
- 7dc674629218dc5434ec97e421de3467ba440a0b src/data/db/matchStatsRead.js
- 454e6b98f288b62eca9f945ca8940dc1301df1d4 src/data/db/oddsProfileRead.js
- d9c661abf573b9b22569f78b93c9d3e5d643d826 src/data/db/oddsQuotesRepository.js
- 86bf49658a97a61a2eda62ed72ebb600e7fc9b75 src/data/db/playerRatings.js
- 46e2c8b26c722becce3192e7fa157ce4738ec21c src/data/db/scoreFormRead.js
- 45470ac1777308c673eea1d2a127b956aeac1240 src/data/db/statInputsRead.js
- 558e33d3441a33cd4b6106cc64edc7e7cd68b297 src/data/db/teamStrength.js
- 136fb6439e630a059a1bdcc832dbfa70bc9618b1 src/data/db/verrouEcriture.js
- 039a2790369cacf5958ff66dab413d96fb873b93 src/data/freeMarketOdds.js
- 747209bf76c3cb667d0d8bb17c9135a2547fdf80 src/data/providers/footballDataCache.js
- c918adfbd3efea3c95531f7ac14291374b336e9f src/data/providers/footballDataOdds.js
- 5888cfc4c6df99ce91c956a7dc3376ecdf724b0e src/data/providers/fotMobProvider.js
- f729d74147c8f0b59a74045056ac71040b71c923 src/data/providers/leagueCups.js
- b4bcebaeea43ea10a0b10ac13b87e7c447d232b8 src/data/providers/seasonWindows.js
- 5aaba6a9d8f5c2d0e4c3159255d96d5c7123b67f src/data/providers/sourceMatching.js
- f18141322bb026f5a1a1ad32c9b9894be1c34092 src/data/relevesDesSources.js
- 124d9c5086df25d06cb71b441d5f907570b21076 src/data/roadmap/plan.js
- 70ee1711b3040108d54ded41131606b81ff256eb src/sports/football/bookmakerConsensus.js
- 86fe12b131b4315e9f9020659c93f2ed7461222d src/sports/football/statMarkets.js
- fbc39689e775107a6e987ef17ff01687fa8317e4 src/utils/atomicJson.js
- b8bf077054354c18d813fb6d05b29f704facccb0 src/utils/calculLourd.js
- 4d0a4b28500ab2fde0d02bbfca1ba2ab01e17d48 src/utils/nameIdentity.js
- fa33e8aec2826a2fa05f7c815a1f4006bcb1cc56 src/utils/statVocabulary.js
- 8f7c2242321185c041b0c535d79d048cc61bc9db src/utils/teamNameMatch.js
- 9a07336ed530f1e47d4d7642969be02a5f96907d src/utils/travailCooperatif.js
