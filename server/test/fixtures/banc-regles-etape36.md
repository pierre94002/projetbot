# Étape 36 — LA CALIBRATION DE LA CHANCE DE QUALIFICATION : les règles du regard, ÉCRITES AVANT LE REGARD

Écrit le **09/11/2026 à 14 h 27** (heure de Paris, prise avec `date`), par l'agent d'écriture du lot 1 de l'étape 36,
dans le bac à sable, AVANT les comptes (`--comptes`) et avant le passage unique (`--calibration`). Ordre de priorité suivi :
`decisions-orchestrateur.md` > décisions de Pierre du 02/11 (n° 6) > `critique.md` > `conception.md` > `dossier.md`.

**Ce que ce lot regarde, et rien d'autre** (décisions 1 et 2 de l'orchestrateur, critique constat 1) : AUCUN banc de
pronostic (rien n'est comparé à rien, aucune variante, aucun placebo, aucun seuil « utile ») ; UN seul regard, la
calibration de la chance de qualification exigée par la fiche (« calibrée sur les matchs retour passés »), RAPPORTÉE avec
un mot dont les bornes sont fixées ici ; jamais de vert à l'écran sur la chance de la page. Le banc de la prolongation
n'est pas dans ce lot (Pierre ne joue pas « qualifié »).

**Ce qui a été lu avant ce fichier** : aucune chance de qualification, aucune probabilité, aucune force n'a été calculée
sur la base du bac. Le code a tourné sur des données SIMULÉES et sur un MAGASIN FABRIQUÉ (test/aides/coupesFabrique.mjs :
1 401 rencontres inventées). La base du bac n'a été ouverte (en lecture seule) que pour : les relevés de la partie 0
(intitulés des tours par coupe, forme des déroulés et des cartes de tirs de quelques matchs, forme de `team_day`) ; les
comptes des étapes de conception et de critique (`comptes-bac.txt`, `annexe-resultats.txt`, `critique\requetes-critique.txt` :
des fins, des paires, des séances — jamais un pronostic).

## 1. La procédure exacte (un seul regard)

Dans le bac, aucun serveur lancé, base du bac **en lecture seule** (le calcul tourne dans le processus à part
`src/data/coupes/coupesEnfant.js`, qui ouvre la base par `openDb({ file, readonly: true })`), **un calcul lourd à la
fois**, passe de Pierre à « null » avant chaque calcul, avec `CM_BAC_A_SABLE=1` et
`MATCH_STATS_DB=C:\Users\PC\CoteMaster\bac-a-sable\base\match-stats.db`, depuis `C:\Users\PC\CoteMaster\bac-a-sable\code\server`.
`SCR36` = `C:\Users\PC\AppData\Local\Temp\claude\C--Users-PC-OneDrive-Bureau-developement-ProjetBot\c4b41134-df35-4d3f-be49-63a4f15181fd\scratchpad\etape36` ;
`PASSE` = `C:\Users\PC\OneDrive\Bureau\developement\ProjetBot\server\data\runtime\refresh-status.json` (lu, jamais écrit).

1. Le sha1 de CE fichier est noté dans `SCR36\etat.md` avant toute autre chose.
2. **`--comptes`** (aucune force, aucune probabilité, aucune perte) :
   `node scripts/coupes.mjs --comptes --sortie SCR36/comptes-coupes.json --passe PASSE`
   — l'appariement des 24 coupes, les issues, les séances, la règle d'après 90 minutes, le lieu, les contrôles « définition
   cassée » (§ 6) et T-T1 bis (les blocs refaits = ceux de `cupBracket`, toutes coupes, toutes saisons). Sha1 noté.
3. Si une définition est cassée : § 6 (correction AVANT le regard, comptes refaits, ce fichier complété et re-scellé).
4. **`--calibration`, UN passage** :
   `node scripts/coupes.mjs --calibration --regles SCR36/banc-regles.md --sha1-regles <sha1 de ce fichier> --k 1 --verrou SCR36/calibration-passage-reel.lock --passe PASSE --sortie SCR36/calibration-coupes.json`
   — refusé si K ≠ `VARIANTES_DE_L_ETAPE_36.length` (1), si ce fichier a changé depuis son sha1, si la sortie existe ; la
   passe de Pierre attendue d'abord ; le VERROU posé AVANT toute lecture (heure, pid, sha1 de ce fichier), jamais retiré.
   Un second passage est refusé sans `--rejouer-apres-correction "<raison>"` : permis pour une FAUTE TECHNIQUE seulement
   (un plantage, une donnée mal lue), jamais pour un réglage ; il est dit, et les deux mots sont rapportés côte à côte.
5. **`--recopier`** : `node scripts/coupes.mjs --recopier SCR36/calibration-coupes.json` écrit
   `src/data/coupes/noteDesCoupes.js` PAR SCRIPT ; la sortie et ce fichier sont gardés tels quels dans
   `test/fixtures/calibration-coupes-etape36.json` et `test/fixtures/banc-regles-etape36.md` ; T-B7
   (`coupesCalibration.test.mjs`) refait la note à l'octet.

## 2. Les données et les périodes (PERIODES_DU_BANC, reglagesCoupes.js — celles de l'étape 32, inchangées)

- Mise en route des forces : 2023-01-01 → 2023-06-30 (aucune unité jugée).
- Pli 0 : appris 2023-07-01 → 2025-06-30, JUGÉ 2025-07-01 → 2026-09-23.
- Pli 1 : appris 2025-07-01 → 2026-09-23, JUGÉ 2023-07-01 → 2025-06-30.
- Dernier jour lu : 2026-09-23 (rien d'après n'est lu ; une unité d'après lève une erreur).
- Les 24 coupes du magasin (`COUPES`, lectureDesCoupes.js) : Canadian Championship, Copa Argentina, Copa Chile, Copa
  Libertadores, Copa Sudamericana, Copa del Rey - Spain, Copa do Brasil, Coppa Italia - Italy, Coupe de Belgique, Coupe de
  Chine, Coupe de France, Coupe de Grèce, DFB Pokal - Germany, EFL Cup, FA Cup - England, KNVB Cup - Netherlands, Leagues
  Cup, Taça da Liga - Portugal, Taça de Portugal, Türkiye Kupası, UEFA Champions League, UEFA Europa Conference League,
  UEFA Europa League, US Open Cup.
- Déclaré dans `bench/lancements.js` : `VUES_DE_L_ETAPE_36` (2023-07-01 → 2026-09-23 et 2023-01-01 → 2023-06-30, portée
  `coupes`), `VARIANTES_DE_L_ETAPE_36` = [`coupes-v1`] : K = 1.

## 3. Les règles des confrontations (toursDeCoupe.js, confrontations.js)

- **Couche 1** = `cupBracket` (matchStatsRead.js) refait à l'identique : l'intitulé brut du tour, la chaîne de 40 jours
  (`ECART_MAX_JOURS`) ; vérifiée par T-T1 (échantillon, magasin fabriqué) et T-T1 bis (`--comptes`, toutes coupes et saisons
  de la base du bac).
- **Couche 2** : le code normalisé du tour (table `TOURS` ci-dessous ; numérotés : « 3 », « Round 3 », « 3rd Round » →
  `tour-3` ; « Group Stage - Round 2 » → `groupe-2`) et la famille de la phase (`meta.leagueKey` : « Grp »/« Group » →
  groupes ; « Qualification »/« Preliminary » → qualification ; sinon autre) ; coupe par famille, fusion du même code et de
  la même famille.
- Table `TOURS` (code | libellé | intitulés exacts, sans casse ni accents) :
  1/64 Soixante-quatrièmes (1/64, 64th finals, round of 128) ; 1/32 Trente-deuxièmes (1/32, 32nd finals, round of 64) ;
  1/16 Seizièmes (1/16, 16th finals, round of 32, last 32) ; 1/8 Huitièmes (1/8, 8th finals, round of 16, last 16) ;
  1/4 Quarts (1/4, quarter-final(s), quarterfinal(s), quarter final(s)) ; 1/2 Demi-finales (1/2, semi-final(s),
  semifinal(s), semi final(s)) ; final Finale (final, finals ; libellé « Dernier tour de qualification » pour un bloc de
  plus de deux matchs) ; 3e-place (bronze, 3rd place, third place, third/3rd place play-off) ; preliminaire (preliminary
  round, preliminary, qualification, qualifying round) ; barrage (play-off(s), playoff(s), knockout round play-offs/playoffs).
- **Natures des blocs**, dans cet ordre : groupe → aller-retour (au moins 80 % des matchs en paires aller-retour) →
  un-match-rejouages (au moins 2 paires, tous les premiers matchs nuls : FA Cup) → troisieme-place → finale (le dernier bloc
  d'un match, hors qualification et 3e place, ses deux équipes ont joué le bloc précédent, saison terminée) → ambigu (part
  en paires > 50 % sans 80 %) → un bloc sans suite connue → ambigu / ambigu-fin-des-donnees → groupe (deux rencontres ou
  plus par paire d'équipes pour au moins la moitié) → un-match (au moins 80 % des équipes une seule fois) →
  ambigu-fin-des-donnees / ambigu. Le match pour la 3e place et les tours préliminaires de fin juin ne sont jamais la finale.
- **Unités** : le retour d'une paire aller-retour (l'avance = buts de l'aller du club qui reçoit le retour − ceux de
  l'adversaire), le match d'un bloc « un-match », la finale. Les blocs « un-match-rejouages » (FA Cup jusqu'en 2023-24) :
  reconnus, jamais pris pour des aller-retour, EXCLUS au lot 1 (conception § 3.4) ; la 3e place, les groupes et les blocs
  ambigus : jamais des unités.
- **Issue** (`issueDeLUnite`) : cumul ≠ 0 après 90 minutes → le meneur ; « afterextra » → le meneur du cumul (cumul nul =
  incohérent, exclu) ; « afterpenalties » → le vainqueur de la séance, par la CARTE DES TIRS (au moins 6 tirs après la durée
  de jeu, au moins 3 par camp, écart de tirs ≤ 1, buts différents) sinon par le TOUR SUIVANT (exactement une des deux équipes
  joue un bloc plus tardif dans les 120 jours, 3e place exclue) ; carte et tour suivant en désaccord → exclue ; aucun des
  deux → « séance inconnue », exclue ; cumul nul sans prolongation ni séance → exclue (« buts à l'extérieur » possible :
  compté, alerte à 3 cas par compétition-saison).
- **Le format** (prolongation puis séance, ou séance directe) : la fonction `quoiDeLaProlongation` du correctif du
  règlement EN SERVICE (`providers/settlementService.js`, IMPORTÉE, jamais recopiée), plus « direct » seulement quand le
  déroulé est complet ; la règle d'une compétition-saison = au moins 80 % d'au moins 3 observations, sinon « mixte ».
- Les natures vues par l'ÉCRAN au jour J viennent de la saison ANTÉRIEURE (calendrier d'abord, puis code du tour) ; la
  calibration, elle, prend la liste des unités de la saison entière — l'EXEMPTION NOMMÉE (« la forme de la compétition est
  connue d'avance en vrai », critique constat 6), vérifiée par T-F1 à nature égale : les entrées de chaque unité au jour J
  (aller, avance, nature visible, format, λS et μS) sont les mêmes, à l'octet, sur une copie coupée à J et sur le magasin
  entier.

## 4. La formule, la base et le recalage (qualification.js, calibrationDesCoupes.js)

- **La chance v1** (`chanceDeQualification`) : sur une grille des scores à 90 minutes (21 × 21), la part où le club qui
  reçoit se qualifie dans les 90 minutes avec l'avance au cumul, plus la MOITIÉ de la part à égalité de cumul (pile ou
  face : prolongation et tirs au but, décision de Pierre du 02/11) ; normalisée par la masse de la grille.
- **La base au jour J** (la même pour toutes les unités) : `BASE_STATISTIQUE` = les forces de la candidate 27 (étape 32 :
  demi-vies attaque 35, défense 25, a priori 8, statistique « mix » à 70 % d'xG, remise à zéro au changement de
  championnat, ρ = −0,05, bornes 0,2 – 6) SANS COTE (aucune cote de coupe au passé) ; empreinte `v1|35|25|remise-a-zero`.
  λS et μS : la passe des forces de l'étape 32 (`passeDesForces`) arrêtée à la veille de chaque unité.
- **Le recalage** : pour le pli f, deux niveaux appris sur l'AUTRE période (`plis[f].apprendre`) en forme fermée de Poisson,
  c_dom = ln(Σ buts à la 90e du club qui reçoit / Σ λS), c_ext de même, sur les unités dont le score à la 90e est connu ;
  λ = borne(λS · e^c_dom), μ = borne(μS · e^c_ext) ; grille de Dixon-Coles (ρ = −0,05) ; la chance v1.

## 5. La calibration et LE MOT (fixés ici)

- Points : une unité jugée = (p = la chance v1 du club qui reçoit le match décisif, y = 1 s'il s'est qualifié).
- **Cox** : logit(q) = α + β · logit(p), Newton depuis (0, 1), 25 itérations au plus, arrêt à 1e-10 ; p planché à
  [1e-6 ; 1 − 1e-6].
- **Fourchettes** : 1 000 tirages des points avec remise (graine 36, mulberry32) ; percentiles 2,5 % (indice ⌊0,025 B⌋) et
  97,5 % (indice ⌈0,975 B⌉ − 1).
- **Dixièmes** : les points rangés par p, dix groupes égaux à un près ; l'écart moyen = moyenne des |chance − fréquence|.
- **LE MOT**, sur TOUTES les unités jugées des deux plis :
  - « pas assez de matchs » si moins de 200 unités (ou une régression impossible) ;
  - « calibrée » si la fourchette de β est DANS [0,85 ; 1,15], celle de α DANS [−0,15 ; 0,15] et l'écart moyen ≤ 3 points ;
  - sinon « trop sûre d'elle » si β < 0,85 ; « pas assez sûre d'elle » si β > 1,15 ; sinon « non tranché ».
- **Rapportés à côté, SANS mot** : les retours seuls ; chaque nature (retour, match unique, finale) ; le 1N2 à
  90 minutes de la même base sur les mêmes matchs (dom, nul, ext : Cox et dixièmes) ; « annoncé / réalisé » (la chance
  moyenne de la favorite de chaque confrontation et la part qu'elle a gagnée) ; les recalages ; les exclusions par raison.
- Ce que le mot devient : une ligne GRISE sous la chance de l'encadré (« Formule vérifiée sur les matchs 2023-2026 avec les
  statistiques seules : annoncé x %, réalisé y % (mot) ») et la première ligne du tableau replié. Jamais un vert, jamais
  « mesuré » : la chance de la PAGE part de son 1N2 (pas de la base statistique) ; sa preuve viendra des fiches figées de
  la nuit, sur les matchs de Pierre, à partir de 2027.

## 6. Ce qui se passe si une définition est cassée (contrôlé sur les comptes, AVANT le regard)

Une définition est **cassée** si, sur un pli (COMPTES_CASSES) :
- les rencontres des blocs `ambigu` dépassent 5 % des rencontres de coupe ;
- le qualifié rejoue au tour suivant dans moins de 95 % des unités décidées par le score ;
- l'accord carte des tirs / tour suivant est sous 90 % ;
- les séances au vainqueur inconnu ou en désaccord (carte des tirs contre tour suivant) dépassent 15 % des séances ;
- les unités jugeables sont moins de 1 500 sur un pli ;
- une compétition-saison de l'UEFA a 3 cas ou plus de retour décidé à égalité de cumul sans prolongation.

Alors : correction AVANT le regard (aucune chance n'a été calculée), comptes refaits dans une NOUVELLE sortie, « Modifié
avant le regard le … » écrit à la fin de ce fichier, nouveau sha1 noté dans `etat.md`. Un compte surprenant mais non cassé
est seulement dit.

## 7. Les sorties

- `SCR36/comptes-coupes.json` (comptes, contrôles, T-T1 bis), sha1 noté.
- `SCR36/calibration-coupes.json` : `premierRegard` (= l'heure du verrou), la passe de Pierre, ce fichier (chemin, sha1),
  l'empreinte du moteur et de la candidate, les comptes du passage, les recalages, la calibration (toutes, retours, par
  nature, 1N2 à 90 minutes, annoncé/réalisé, dixièmes, exclusions), les durées et la mémoire du processus à part.
- `SCR36/calibration-passage-reel.lock` : le verrou (jamais retiré).
- `src/data/coupes/noteDesCoupes.js` (par script) ; `test/fixtures/calibration-coupes-etape36.json` et
  `test/fixtures/banc-regles-etape36.md`.

## 8. Ce qui ne se fait pas après le regard

- Aucune borne, aucune constante, aucune règle de ce fichier ne change ; aucune période ; aucune unité retirée ou ajoutée.
- Aucun second passage pour « voir mieux » ; un rejeu technique seulement, dit, les deux mots côte à côte.
- Le mot n'entre dans rien d'autre que la ligne grise et le tableau replié : ni le moteur, ni les pronostics, ni la value,
  ni le pari conseillé, ni l'analyse IA ; rien ne change à l'écran selon le mot (ni couleur, ni place).
- Un mot défavorable (« trop sûre d'elle », « pas assez sûre d'elle », « non tranché ») est rapporté tel quel ; la formule
  n'est pas retouchée au lot 1.

## 9. Le sha1 des fichiers de `data/coupes/` qui font la calibration (au moment du scellement)

- `server/src/data/coupes/reglagesCoupes.js` : `7ae19031fadeb792b872632c94d8bbdbc5924397`
- `server/src/data/coupes/toursDeCoupe.js` : `9731ccab29e362dd36c32f5d31643ef197682123`
- `server/src/data/coupes/confrontations.js` : `e5a3415f6e8867d1da17f1a04ab89647418ffac5`
- `server/src/data/coupes/qualification.js` : `56bce046d206bccab921b46f6bff3f3f7092e4a1`
- `server/src/data/coupes/terrainNeutre.js` : `a64d3ce0537161367c55141383707a257d37f480`
- `server/src/data/coupes/lectureDesCoupes.js` : `7b37f5ac0eb284a27674c00cde71d78b44534ce1`
- `server/src/data/coupes/comptesDesCoupes.js` : `ca13d7683604c049400b8707a3c45365b9272d6a`
- `server/src/data/coupes/calibrationDesCoupes.js` : `9b1017d778a36be9cb0293c5206449a30ef9ddd6`
- `server/src/data/coupes/coupesEnfant.js` : `0509207ed7984731006a053fb76262a3f072c147`
- `server/src/data/coupes/noteDesCoupes.js` : `7b5c7668780d337b6721dcecbfa7290253ac0400`
- `server/scripts/coupes.mjs` : `5943e946051a6a7ee96bde1664cd360a498277e2`
- `server/src/data/providers/settlementService.js` : `5ecd697b06cb755e72b9440b9e059eaf5ad52d0e`
- `server/src/bench/lancements.js` : `03e81ec202c04185ef22a2f665d2a090704b12ce`
- `server/src/core/engine/goalModel.js` : `236a33d7f952b12d4596b02ecb7c6090afca137d`

(noteDesCoupes.js : la note NULLE d’avant le regard, réécrite par --recopier ; settlementService.js : le correctif du règlement en service, dont la fonction quoiDeLaProlongation est importée ; goalModel.js : la grille des scores, gelée, lue seulement ; lancements.js : la déclaration du regard, K = 1.)
