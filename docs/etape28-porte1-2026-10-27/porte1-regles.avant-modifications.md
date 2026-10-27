# Étape 28 — PORTE 1 sur football-data P2 : le verdict, ÉCRIT AVANT DE REGARDER

Écrit le **27/10/2026 à 08 h 25** (heure de Paris, prise avec `date` : 07:25:48 UTC ; Paris = UTC + 1, heure d'hiver),
par l'agent de la partie C1 (Opus), dans le bac à sable. C'est l'étape 4 du §8 de la conception : UN SEUL regard sur
P2 (2019-07-01 → 2023-06-30), une fenêtre que l'étape 28 n'a jamais vue ; c'est le second regard sur P2 après la porte 1
de l'étape 27, déclaré (critique, point 2 ; `bench/lancements.js`, VUES_DE_L_ETAPE_28, ajouté le 27/10 à 08 h 22 :
« Étape 28 : porte 1 sur football-data P2, un seul passage le 27/10/2026, verdict écrit avant (SCR porte1-regles.md) ;
aucune mesure de 28 n'y sera refaite après le verdict », portée `simulation`).

**Aucune issue réelle de P2 n'a été lue avant ce fichier** : ni score final, ni mi-temps, ni rouges, ni le champ `juge`
du bilan du rejeu, ni les lignes de jugement de son journal (voir §9 pour ce qui a été vu d'autre).

## 1. L'échantillon (défini sur les entrées seules) — 30 149 rencontres

Script `echantillon.mjs` → `echantillon-p2.json` (sortie lisible : `echantillon-p2.txt`).

- Rejeu frais de la candidate 27 sur P2 : `SCR/rejeux/b-p2-28.jsonl`, **1 384 699 531 octets, modifié le 27/10/2026 à
  04 h 03 min 23 s (Paris)**, sha1 `d31555c7b3da3d64711730f357a2a934f3b45d25` ; 1 256 245 lignes ; 46 507 lignes
  `scoreExact` (une par rencontre, aucune en double, toutes à 81 cases). Champs lus : `type`, `marketKey`,
  `fixtureKey`, `date`, `prix`, `moteur.source`, `moteur.distribution` — rien d'autre.
- λ, μ par **moindres carrés** sur les 81 cases (écart n° 1, décision du 27/10 à 4 h 25), ρ = −0,05 (la candidate),
  garde : `casesRendues(grilleDesButs(λ, μ, ρ))` = les 81 cases à 2e-6 par case → **46 507 rejouables sur 46 507**
  (écart max 8,28e-7) ; le rapport de la conception §3.3, rapporté : 29 838.
- Régime « cotes-plusmoins-buts » : il n'est PAS écrit dans les lignes du rejeu (vérifié, `structure-lignes.mjs` : les
  lignes portent `moteur.source` = « cotes » / « statistiques », jamais le code du régime). Il est relu ainsi :
  `moteur.source` de la ligne scoreExact = « cotes » (grille calée sur le 1N2) ET l'ancre plus/moins 2,5 d'avant-match
  existe (`plusMoinsAvantMatch` de `bench/prix.js` sur `moy_p25`, `moy_m25` de fd_history — des cotes, des entrées ;
  pOver dans ]0 ; 1[, ligne 2,5 : la condition exacte de `modeleDeButs`) ; aucun régime « xg » dans ce rejeu, « buts »
  partout. **30 156 rencontres = `bilan.regimes['cotes-plusmoins-buts']` du rejeu, à l'unité** (et 2 « cotes-1n2-buts »
  = le bilan). Seul champ lu du bilan : `bilan.regimes`.
- Issues présentes : fd_history `bd`, `be`, `mtd`, `mte`, `rouges_d`, `rouges_e` NON NULLES, comptées en SQL avec
  `IS NOT NULL` (COUNT) : **30 167** lignes P2 (toutes `lien = 0`). La requête qui rend les clés complètes ne
  sélectionne que `code, date_fichier, date, dom, ext` (la complétude n'est qu'une condition WHERE).
- Clé de jointure : `fd:<code>|<date_fichier ?? date>|<dom>|<ext>` (celle de `cleDuFd`, `bench/entrees.js`) ; 46 507 clés
  du rejeu trouvées, **0 clé en double** dans fd_history P2.
- **Échantillon = rejouables ∩ régime cotes-plusmoins-buts ∩ issues présentes = 30 149 rencontres** (la conception
  attendait ≈ 30 150), rangées par (date, clé) ; `echantillon-p2.json` ne contient que des clés, des dates, λ, μ et
  l'écart de la garde.

## 2. Le calcul : un seul passage, N = 4 000, graine écrite

- Script `porte1.mjs`, mode `--issues reelles`, l'échantillon entier (jamais de `--limite`), commande :
  `node porte1.mjs --issues reelles --echantillon echantillon-p2.json --rejeu-a C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC-OneDrive-Bureau-developement-ProjetBot/c4b41134-df35-4d3f-be49-63a4f15181fd/scratchpad/etape27/mesures/ecriture/rejeux/a1-p2.jsonl --n 4000 --sortie porte1-resultat.json --regles porte1-regles.md --sha1-regles <sha1 de ce fichier> --je-regarde-p2-une-seule-fois`
  (depuis `SCR/partieC`, `CM_BAC_A_SABLE=1`, `MATCH_STATS_DB=C:\Users\PC\CoteMaster\bac-a-sable\base\match-stats.db` ;
  serveur du bac arrêté ; passe de Pierre non en cours ; un seul calcul lourd).
  Avant toute lecture : sha1 de ce fichier, puis de chaque fichier du §8, vérifiés ; un verrou
  `porte1-passage-reel.lock` est posé AVANT de lire une seule issue et n'est jamais retiré : un second passage est refusé.
- **N = 4 000 chemins par rencontre** (≥ 1 000, V C5). Pourquoi 4 000 : la stratification retire la masse des cases
  jamais atteintes ; mesuré sur les entrées seules (`artefact-n.mjs` → `artefact-n.txt`, 300 rencontres de
  l'échantillon, référence 40 000 chemins), le biais du banc sur le marché le plus touché (mi-temps plus de 1,5) vaut
  −0,36 pt à N = 1 000, −0,19 à 2 000, −0,13 à 3 000, **−0,10 à 4 000**, −0,04 à 10 000 (la nuit) ; un but dans chaque
  mi-temps −0,28 / −0,15 / −0,10 / **−0,07** / −0,03 ; masse non couverte attendue 0,68 / 0,35 / 0,24 / **0,18** /
  0,08 %. Ce biais est rapporté, jamais retranché.
- Grille BRUTE `grilleDesButs(λ, μ, −0,05)` (jamais alignée sur un 1N2). Deux simulations par rencontre, `simulerMatch`
  du module : **avec effets** (`PARAMS`, la version retenue) et **sans effets** (`PARAMS_SANS_EFFETS` de
  `simulationMatchsEnfant.js` : multiplicateurs à 1, rouges à 0), **même graine** :
  `graineDuMatch({ cle: fixtureKey, role: 'porte1-p2', lambda, mu, rho: -0.05 })` = FNV-1a de
  « `<fixtureKey>|porte1-p2|1|<λ à 3 déc.>|<μ à 3 déc.>|-0.05` » → xoshiro128** amorcé par splitmix32.
  Marchés lus par `marchesDesChemins` (valeurs brutes, sans arrondi).
- Issues : `bd`, `be` (score à la 90e), `mtd`, `mte` (mi-temps), rouges = `rouges_d + rouges_e` ; `issuesDuMatch` du banc
  avec `buts: null` : premier but et « avant la 30e » restent inconnus, donc non jugés.
- Juge : `comparer` de `bench/guard.js`, mode « moyenne », sens « min » (perte log), **K = 27 variantes**, 1 000 tirages,
  graine 28, α = 0,05, blocs = la rencontre (`fixtureKey`), date = jour du match, lignes dans l'ordre de l'échantillon.
  « Retenu » = borne basse de la fourchette > 0 ; « moins bon » = borne haute < 0.
- Pertes log : déroulé, p bornée à [1e-6 ; 1 − 1e-6] (`ligneDuMatch`, forme de v1) ; combinés, probabilité de l'issue
  bornée à 1e-9 (`lignesDesCombines`, forme de v2).
- Écart annoncé − réalisé (en points) d'un marché = 100 × (Σ annoncé − Σ réalisé) / n, sur l'échantillon.

## 3. F3a — les combinés (porte)

- **Les 14 combinés de `COMBINES_DU_BANC`, aucun écarté** : toutes leurs jambes sont du score final (résultat, total
  de buts, les deux marquent, buts d'une équipe, double chance), réglées par le score à la 90e de football-data ; aucune
  ne demande les minutes. Deux paires sont le même événement écrit autrement (« 1 & plus de 2,5 & les deux marquent » =
  « 1 & les deux marquent » ; « 1 & dom. plus de 1,5 » = « 1 & plus de 1,5 ») : jugées telles quelles, comme v2.
- **Bloc** : une ligne par rencontre × combiné, a = perte log du **produit des simples** (pI, la même grille), b = perte
  log de la **grille** (pG). Le bloc F3a est « retenu » si la borne basse de la fourchette > 0 à K = 27.
- **Par combiné** : brut = écart annoncé (grille) − réalisé. Le biais hérité des jambes : chaque jambe simple j a son
  écart e_j (points) et son annoncé moyen a_j (sommes de cases de la même grille) ; l'excès que ces biais impliquent pour
  le combiné, au premier ordre (chaque jambe ramenée à son réalisé par un facteur sur ses propres cases), est
  **hérité = (annoncé moyen du combiné) × Σ_j (e_j / a_j)** ; **net = brut − hérité**.
  **Règle : |net| ≤ 1,5 pt** (net arrondi au centième de point) ; au-delà, le combiné est NOMMÉ et ÉTEINT SEUL. Le brut
  à côté. Rapporté, jamais une porte : le net additif (brut − Σ_j e_j).

## 4. F2c — les effets du score (porte) et les marchés de mi-temps

- **Bloc** : les 15 marchés de `BLOC_DEROULE` moins ce qui demande les minutes (premier but domicile, premier but
  extérieur, premier but avant la 30e) : mi-temps 1 / N / 2, mi-temps plus de 0,5 et de 1,5, les 9 cases mi-temps/fin,
  un but dans chaque mi-temps. Une ligne par rencontre × marché, a = perte log **sans effets**, b = perte log **avec
  effets**. « Pas moins bon » = borne haute de la fourchette > 0 à K = 27 ; **prouvé moins bon = borne haute ≤ 0**.
- **Par marché de mi-temps (16 : les 15 du bloc + au moins un rouge)** : brut = écart annoncé (avec effets) − réalisé ;
  **net = brut − écart de la grille sur le marché du score dont il hérite** ; **règle : |net| ≤ 1 pt** (net arrondi
  au centième de point) ; au-delà, le marché est NOMMÉ et ÉTEINT SEUL. Le brut à côté. Le marché hérité (preuve.md
  F2c : nul, les deux marquent, plus de 1,5 ; le « nul » est lu comme le résultat final de même sens pour les marchés
  de résultat) :

  | Marché de mi-temps | Marché du score hérité (écart de la grille) |
  |---|---|
  | mi-temps : domicile mène (htH) | 1 (domicile gagne) |
  | mi-temps nul (htD) | N (nul) |
  | mi-temps : extérieur mène (htA) | 2 (extérieur gagne) |
  | mi-temps plus de 0,5 (htO05), plus de 1,5 (htO15) | plus de 1,5 buts |
  | 1/1, N/1, 2/1 (htFt0, htFt3, htFt6) | 1 |
  | 1/N, N/N, 2/N (htFt1, htFt4, htFt7) | N |
  | 1/2, N/2, 2/2 (htFt2, htFt5, htFt8) | 2 |
  | un but dans chaque mi-temps (deuxMiTemps05) | les deux marquent |
  | au moins un rouge (rougeAuMoinsUn) | rien : net = brut |

## 5. La règle de la porte (décision de l'orchestrateur, recopiée telle quelle)

« La porte est FERMÉE si le bloc F3a n'est pas « retenu » (borne basse ≤ 0) ou si le bloc F2c est prouvé moins bon
(borne haute ≤ 0). Porte fermée : on s'arrête et rien n'est recopié chez Pierre. Un marché ou un combiné au-delà de son
seuil est NOMMÉ et ÉTEINT SEUL (jamais montré, écrit dans la note), et la porte reste ouverte. »

Précision (aucun cas attendu à 30 149 rencontres) : un bloc « pas assez de matchs » du juge (moins de 200 rencontres)
compte comme « pas retenu » pour F3a et comme « non vérifié » pour F2c → porte fermée.

## 6. Seulement rapportés, jamais une porte

- Les écarts bruts de tout ce qui se juge (les 16 marchés, les 14 combinés, leurs jambes, les marchés du score hérités) ;
  « 2e mi-temps plus de buts » (h2plusQueH1), « domicile gagne mené à la MT » (= 2/1) et « extérieur gagne mené à la MT »
  (= 1/2) : bruts, hors des règles (non nommés par la décision).
- **ρ −0,05 contre ρ = 0** (F3c) : les 14 combinés en bloc, a = perte log de la grille ρ = 0, b = grille ρ −0,05, K = 27.
- **La grille de l'ancien modèle** (rejeu A `a1-p2.jsonl` de l'étape 27, la version en service sans la clé
  `modeleDeButs`) : **combinés seulement** — les 81 cases de sa ligne scoreExact, renormalisées, posées dans 21 × 21 ;
  grille ancienne contre produit des simples anciens (bloc, K = 27), brut et net (même définition qu'au §3). Ses marchés
  de mi-temps NE SONT PAS faits : il faudrait reconstituer λ, μ de l'ancien modèle par sa propre formule et une
  troisième simulation par rencontre — pas simple, dit.
- La décomposition exacte de chaque marché de mi-temps : « net exact » = moyenne de P_avec effets(marché | case du score
  final réel) − réalisé, sur les rencontres dont la case réelle a au moins un chemin (les autres comptées).
- Les déciles (tranches de 300 rencontres ou plus), la masse non couverte, la taille effective, le biais du banc dû à N.

## 7. Après le passage

- Les résultats vont dans `src/data/simulation/noteDeLaSimulation.js` (objet figé : verdicts, nombres, fourchettes,
  marchés et combinés éteints, date, sha1 de ce fichier ; hors empreinte), avec un petit test de forme.
- Porte fermée : on s'arrête, rien n'est recopié chez Pierre.
- Défaut soupçonné APRÈS le regard : rien n'est relancé (un second passage serait un second regard) ; on s'arrête et
  on le dit. Aucune mesure de l'étape 28 ne sera refaite sur P2 après ce verdict.

## 8. Empreintes (vérifiées par le script avant toute lecture d'issue)

- `C:/Users/PC/CoteMaster/bac-a-sable/code/server/src/data/simulation/simulationBanc.js` : d02b56566d9129d1874d22725731c920e2d22e6c
- `C:/Users/PC/CoteMaster/bac-a-sable/code/server/src/data/simulation/simulationMatch.js` : a429d807e19399403887f74cf866a630a3b95b29
- `C:/Users/PC/CoteMaster/bac-a-sable/code/server/src/data/simulation/jambes.js` : 2bf25041052215ca588be63dd0f128162f0500a0
- `C:/Users/PC/CoteMaster/bac-a-sable/code/server/src/data/simulation/reglages.js` : a61b139a9d8904bfa09d09a0080f96972b79f554
- `C:/Users/PC/CoteMaster/bac-a-sable/code/server/src/data/simulation/simulationMatchsEnfant.js` : 4e93366ba4af35cb81eddcbb2e287c35663a844f
- `C:/Users/PC/CoteMaster/bac-a-sable/code/server/src/core/engine/goalModel.js` : 236a33d7f952b12d4596b02ecb7c6090afca137d
- `C:/Users/PC/CoteMaster/bac-a-sable/code/server/src/bench/guard.js` : 60551323d356d5502684ca32276793fcb946ef84
- `C:/Users/PC/CoteMaster/bac-a-sable/code/server/src/bench/periodes.js` : d8b5264a88fd7ef241fb16bd209f3928c53ac628
- `C:/Users/PC/CoteMaster/bac-a-sable/code/server/src/bench/lancements.js` : 819cc3d2f4b27357e6d62080b555ddda6c44de20
- `echantillon-p2.json` : 659271bac17f1298384fcf78e80fed896a9fa099
- `porte1.mjs` : 165c29bcf9a36cd9d919c310ab2fbeb7b36f36b8
- `C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC-OneDrive-Bureau-developement-ProjetBot/c4b41134-df35-4d3f-be49-63a4f15181fd/scratchpad/etape28/partieA/candidate-modele-buts-essai2.json` : 6c0cb1a6d8b83905b49a5db9b78e0ae165ee019c
- `C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC-OneDrive-Bureau-developement-ProjetBot/c4b41134-df35-4d3f-be49-63a4f15181fd/scratchpad/etape27/mesures/ecriture/rejeux/a1-p2.jsonl` : 3123337dc7957ad0954094aeadf186fb8657b352
- `C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC-OneDrive-Bureau-developement-ProjetBot/c4b41134-df35-4d3f-be49-63a4f15181fd/scratchpad/etape28/rejeux/b-p2-28.jsonl` : d31555c7b3da3d64711730f357a2a934f3b45d25

Rejeu A : 1 384 569 154 octets, modifié le 21/10/2026 à 14 h 36 (Paris).

Mise à jour des empreintes le 27/10/2026 à 10 h 10 (Paris, `date`), AVANT tout regard, sans changer une règle de fond :
`porte1.mjs` complété après l’écriture de ce fichier (mode « reelles-essai » sur une base d’essai aux issues tirées,
`--verifier-seulement`, porte décidée sur le verdict du juge — au moins 200 rencontres —, nets arrondis au centième de
point avant la comparaison au seuil, fourchettes notées à 6 décimales) ; la version de la répétition générale
(817c7a965d624a704bcd5ab8ebee705a8fe1b328) et la version finale ci-dessus rendent les mêmes nombres sur 300 rencontres
(`comparer-sorties.mjs` : aucune différence). Empreinte du moteur du bac au moment de ce
fichier : 16f2459db183a99576365047da98b7777687ef05 (37 fichiers, deux calculs concordants).

## 9. Ce que l'auteur a vu de P2 avant ce fichier (déclaration)

- Des COMPTES et des ENTRÉES : les comptes ci-dessus, `bilan.regimes` du rejeu, les clés, λ, μ, les cotes d'avant-match
  plus/moins 2,5 (pour le régime).
- Par mégarde, en cherchant le code du régime (grep) : un extrait de 2 Ko de `core/engine/noteDuModeleDeButs.js` (la
  note de la porte 1 de l'étape 27 sur P2 : le marché « plus de 0,5 buts », n, perte log, part de justes, deux déciles) ;
  en lisant l'état de l'étape 27 : le résumé de sa porte 1 (gains de perte log par famille de marchés de buts, le
  plus/moins 2,5 face au marché, le biais du plus/moins 2,5 de la version en service) ; des textes de tests de l'étape 27
  dans la copie des bugs (fiabilité du score exact, gain en bloc). Tous sont des résultats de l'étape 27 déjà déclarés
  (P2 vue une fois par 27) ; **aucun ne porte sur la mi-temps, les rouges ni la calibration des combinés** ; aucune règle
  de ce fichier n'en dépend (les seuils, K et les marchés viennent de la décision de l'orchestrateur et de preuve.md).
- La répétition générale (issues synthétiques tirées du modèle) n'est pas un regard sur P2.
