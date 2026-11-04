# Étape 38 — LE BANC DE LA COMBINAISON, DE LA CONFIANCE ET DU SEUIL : les règles du regard, ÉCRITES AVANT LE REGARD

Écrit le **04/11/2026** (heure de Paris, prise avec `date`), par l'agent d'écriture du lot 1a (Opus), dans le bac à sable,
AVANT le passage du banc. **NON SCELLÉ** à l'écriture : l'orchestrateur relit `avant-scellement.md`, puis le sha1 de ce
fichier est noté dans `SCR38\etat.md` et dans `banc-regles.sha1.txt` (temps 2). Ordre de priorité suivi :
`decisions-orchestrateur.md` > `decisions-pierre-02-11.md` > `conception.md` > `critique.md` > `propositions/*.md` >
`dossier.md`.

**Aucun résultat du banc n'a été lu avant ce fichier** : aucune issue, aucune perte, aucune valeur de clôture, aucun verdict
calculé sur la base du bac. Le code du banc n'a tourné que sur des MONDES TIRÉS AU HASARD (`test/aides/combinaisonMondes.mjs`)
et sur un football-data FABRIQUÉ (`test/aides/script-combinaison.mjs`, bases en mémoire des tests de fuite). La base du bac
n'a été ouverte, en lecture seule, que pour : les comptes de la partie 0 (`comptes-partie0.txt`, sans résultat) et
`--comptes` (§12), qui ne lit ni score, ni clôture (seule leur PRÉSENCE), ni perte.

**Modifié avant le regard le 04/11/2026 (vers 1 h), sur décision de l'orchestrateur** après relecture de
`avant-scellement.md` — aucun regard n'avait eu lieu, aucune perte n'avait été calculée sur la base du bac :
1. les variantes « non jugeable ici » sur la base du bac (confiance-v1, classe-regime, classe-accord, classe-couverture,
   classe-compo, poids-par-regime) : ACCEPTÉ ; la sortie le dit tel quel, le lot 1c les jugera sur P5-b ;
2. R24 (aucune décision « fraîche » à la coupure) : ACCEPTÉ ; la note le dit en mots simples (`LIMITES_DU_LOT_1A`) ;
3. E2 appris sur 2017-07 → 2019-06, signe vérifié saison par saison : ACCEPTÉ ;
4. le recalage par classe ramené vers le commun : ACCEPTÉ (décidé avant le regard, sur des mondes simulés) ;
5. **placebo-classe à deux permutations — ÉCART à la conception §3.2** (« Placebo : classes permutées dans une journée », bras A
   implicite = la règle en service) : ACCEPTÉ. **Raison** : face à seuil-v1, un seuil relevé sur des paris tirés au hasard
   retire des paris dont la valeur de clôture est positive en moyenne — un vrai coût, pas un faux positif — et le placebo sortait
   « moins bon » dans un monde NUL simulé à la taille réelle ; or un placebo doit être nul en attente (« fini quand » (b) : « pas
   prouvé »). Le bras A du placebo est donc la MÊME règle (3 % sur la cote haute) sur une SECONDE permutation (autre graine) des
   mêmes étiquettes parmi les paris du jour : deux tirages indépendants, rien ne doit sortir (répétition n° 2 : « pas prouvé ») ;
6. pas de clôture du 2,5 avant 2019 (classe-couverture ne peut pas apprendre face à la clôture) et 7. D et G des buts reportés au
   lot 1b : ACCEPTÉS ; la note les dit (`LIMITES_DU_LOT_1A`).
La note recopiée porte ces limites en mots simples (champ `limites`, ajouté au code avant le regard ; les modules du §2bis
recalculés).

## 1. La procédure exacte (un seul regard)

1. `--comptes` (déjà fait, §12) : tailles, classes, décisions et paris des règles, étalonnage SANS résultat (décisions, paris,
   refus de la note de départ : **30 158 / 555 / refus identiques, à l'unité**), « jugeable ici » de chaque variante.
2. Relecture de l'orchestrateur ; les règles changent UNE fois au plus ; puis SCELLEMENT (sha1 de ce fichier).
3. UN SEUL `--banc` : `node scripts/etape38.mjs --banc --regles <ce fichier> --sha1-regles <sha1> --k 38 --verrou
   <SCR38\banc-passage-reel.lock> --passe <refresh-status.json du dépôt> --sortie <SCR38\banc-etape38.json>`, base du bac en
   LECTURE SEULE (processus à part), jamais entre 0 h 10 et 2 h 30. Le script refuse : K ≠ 38 ; un sha1 des règles faux ; un
   module du §2 dont le sha1 a changé ; sans verrou ; une sortie existante ; un second passage sans
   `--rejouer-apres-correction "<raison>"` (une FAUTE DE CODE, jamais un réglage ; les deux verdicts côte à côte). Le verrou
   est posé AVANT toute lecture d'un résultat et n'est jamais retiré.
4. **L'ÉTALONNAGE passe AVANT la première variante (T-B12)** (§4). Un écart ARRÊTE tout : aucune variante n'est jugée, la
   sortie le dit, l'écart s'explique ligne à ligne (le code du 1N2 a changé depuis la note) ; seul un second passage pour
   faute de code est permis ensuite.
5. `--recopier <sortie>` écrit `src/data/combinaison/noteDeLaCombinaison.js` PAR SCRIPT (UNE note, T-B7) et garde la sortie et
   ces règles dans `test/fixtures` (`banc-etape38.json`, `banc-regles-etape38.md`).

## 2. Les modules employés, SCELLÉS (T-B10 ; conception §4.6)

Le `--banc` vérifie, avant de lire quoi que ce soit, que chacun de ces fichiers a ENCORE ce sha1 (octets bruts) — les modules
du moteur et du banc lus par l'enfant, puis ceux de l'étape 38 (le code au moment du regard). La liste est recalculée par
`SCR38\partieB\sceller-modules.cjs` au moment du scellement ; ses lignes ont la forme « - <sha1> src/<chemin> ».

(liste ci-dessous, §2bis)

## 3. Les données et les fenêtres (`PERIODES_DU_BANC`, reglagesCombinaison.js)

- **football-data** (`fd_history`, lien = 0 pour les lignes calculées ; TOUTES les lignes nourrissent les forces) :
  - mise en route 2000-07-28 → 2005-07-28 : les forces s'accumulent, rien n'est appris ni jugé ;
  - **P1** 2005-07-29 → 2019-06-30 : APPRENDRE (β de E1, τ², recalage commun et par classe) ; **E2** appris sur
    2017-07-01 → 2019-06-30 (les deux saisons d'avant P2) ; dixièmes de la confiance appris sur **P1 ≥ 2012-07-27** ;
  - **P2** 2019-07-01 → 2023-06-30 : JUGER (apprentissage interdit : une ligne de P2 dans un apprentissage lève, T-F5) ;
    huis clos 2020-03-14 → 2021-05-31 rapporté à part ;
  - **le seuil** est jugé sur **P1 ≥ 2012-07-27 ∪ P2** (rien n'y est appris par une règle de seuil) ; P2 rapportée seule.
- **Une ligne** = un match avec une moyenne d'avant-match (`prixFd`, jeu « fd-avant-match » : aucune colonne de clôture lue,
  `colonne` lève) : le marché 1N2 **P_M = la cote juste des paliers** (fairFromBookmakers : Pinnacle → régime r1), sinon le
  repli du moteur (fairFromAllValid → r3) — la règle d'oddsEngine.js ; la moyenne dé-margée (G = max_i |p_Pinnacle − p_moyenne|) ;
  le marché du plus/moins 2,5 (moyenne d'avant-match, méthode puissance, `plusMoins25`) ; la partie STATISTIQUE (λS, μS,
  `modeleDeButs` sans cote, base statistique de la 32 `BASE_STATISTIQUE`, AccumulateurDesForces nourri de tout football-data
  depuis 2000, publié en fin de journée : jamais le jour J) et la même coupée à J−2 (sans la veille) ; les DÉCISIONS de pari
  aux seuils 1 ; 1,5 ; 2 ; 3 ; 4 ; 5 % (stakingDuMatch, règle de la note : `CONFIG_DE_LA_REGLE`, cote juste Pinnacle, prix
  William Hill) ; nMin (matchs du club le moins relevé). Au banc seulement : l'issue (bd/be) et la clôture (`clotureDe` :
  Pinnacle, sinon la moyenne, la même pour les issues d'un match ; 2,5 de même).
- **P5-a** (2026-10-06 → 2026-10-18, base du bac) : les pronostics 1N2 gelés (`engine_picks`) — la révision 1 de la nuit
  d'un côté, la dernière révision du coup d'envoi gelée AVANT le coup d'envoi de l'autre ; les analyses d'avance écartées ;
  le palier reconstruit sur les relevés payants ≤ `odds_at` ; la clôture gratuite dé-margée (moyenne des livres) ; l'issue à
  la 90e. Les lignes de buts du service (versions ≤ 5) ne sont PAS lues (biais connu : un « retenu » y redirait l'essai de
  la 27) ; `engine_candidate_picks` n'est jamais lue (elle n'est lue que par le dépôt, gelé).

## 4. L'étalonnage (T-B12) — `ETALONNAGE.P2`

Sur les lignes de P2, AVANT toute variante, à l'unité ou au nombre de décimales de la note de départ : **30 158 décisions,
555 paris** ; refus : pas_de_value 28 380, trop_peu_de_bookmakers 130, value_hors_limites 145, aucun_bookmaker_autorise 948 ;
valeur de clôture moyenne des paris **0,0466** (4 décimales) ; perte log du marché du 2,5 **0,677013** (6 décimales) sur
**30 157** matchs ; perte log du 1N2 du moteur (P_M) **1,0040** (4 décimales). Un seul écart → arrêt (aucune variante jugée).
Les trois premiers sont déjà vérifiés SANS résultat par `--comptes` (§12).

## 5. Les 38 variantes (K = 38, z = 3,2125 ; VARIANTES_DE_L_ETAPE_38 ; FORMES de bancDeLaCombinaison.js)

| Variante | Fenêtre | Bras A | Bras B | Juge |
|---|---|---|---|---|
| combinaison-v1 | — | — | — | définition (aucun résultat lu) |
| 1n2-recalage-marche | P2 | P_M | E2 à 3 issues (α_dom, α_ext, β) appris 2017-07 → 2019-06 | perte log ; signe par saison |
| 1n2-stats-residuel | P2 | P_M | E1, β du 1N2 statistique appris sur P1 (σ0 0,25) | perte log, J2 |
| 1n2-placebo | P2 | P_M | E1 avec le 1N2 statistique d'un AUTRE match du jour (FNV-1a) | perte log, J2 |
| horloge-j2 | P2 | P_M | E1 avec les statistiques coupées à J−2 | perte log, J2 |
| plusmoins25-recalage-marche | P2 | P_M(2,5) | σ(α + β ℓ(P_M)) appris 2017-07 → 2019-06 | perte log ; signe par saison |
| poids-par-regime | P2 si ≥ 2 000 lignes de repli, sinon P5 | P_M | β par régime (≥ 2 000 au pli d'apprentissage, sinon commun) | perte log, J2 |
| poids-par-championnat | P2 | E1 au β commun de P1 | β + δ du championnat rétréci (τ² des moments, championnats ≥ 50 matchs) | perte log, J2 |
| faux-championnat | P2 | idem | 40 pseudo-championnats (FNV-1a de la clé mod 40) | perte log, J2 |
| repos-court-residuel, enchainement-residuel, contexte-placebo, recalage-dixiemes | P5-b | — | — | non jugeable ici (lot 1c) |
| confiance-v1 | P5-a par origine | recalage commun par dixièmes | par étiquette (A, E, F, G du 1N2) | entropie croisée face à la clôture |
| classe-regime | P2 (si ≥ 2 000 repli) et P5-a par origine | idem | ancre Pinnacle/palier 2 contre le reste | idem |
| classe-compo | — | — | — | non jugeable ici (buts ≤ v5 écartés ; le 1N2 ne lit pas C) |
| classe-couverture | P2 (2,5) | idem | nMin ≥ 8 contre moins | idem |
| classe-a-verifier | P5-b | — | — | non jugeable ici |
| classe-accord | P2 (1N2) et P5-a par origine | idem | dispersé (> 3 points) contre serré | idem |
| confiance-placebo | P2 (1N2) | idem | FNV-1a(« confiance-placebo|clé ») mod 10 < 3 | idem |
| faux-ingredient | P2 (1N2) | idem | étiquette avec un faux ingrédient de degré 2 (FNV-1a(clé) mod 10 < 3) | idem |
| seuil-v1 | — | — | — | définition |
| pinnacle-1pc / -1-5pc / -3pc / -5pc | P1 ≥ 2012 ∪ P2 | seuil-v1 | 1 / 1,5 / 3 / 5 % pour Pinnacle | VC appariée |
| accord-disperse-4pc / -aucune | idem | seuil-v1 | dispersé : 4 % / aucune value | VC appariée |
| cote-haute-3pc | idem | seuil-v1 | 3 % quand le pari de la règle en service est à une cote > 3 | VC appariée |
| placebo-classe | idem | 3 % sur une PREMIÈRE permutation de l'étiquette « cote haute » entre les matchs du jour qui ont un pari | 3 % sur une SECONDE permutation (autre graine) | VC appariée |
| palier2-3pc, palier3-5pc, palier3-aucune, a-verifier-aucune, francais-aucune | P5-b (ombre) | — | — | non jugeable ici (lot 1c) |
| compo-avant-cote, ancre-gratuite, saisies-ancre | P5-b | — | — | non jugeable ici |

**Hors K** (rapportés, aucun verdict) : `classe-fraicheur`, `vieux-4pc`, `huis-clos-5pc` (critique, constats 1 et 5) ; β sans
a priori ; ρ par classe ; VC par bande ; Cox par classe d'accord ; le huis clos à 5 %.
**Les six placebos** : 1n2-placebo, faux-championnat, contexte-placebo (P5-b), confiance-placebo, faux-ingredient,
placebo-classe — un placebo « retenu » = un banc faux (la note n'est pas recopiée, l'orchestrateur décide).

## 6. Les juges (`comparer`, guard.js ; 1 000 tirages ; 200 blocs ; K = 38)

- **Combinaison** : par match, a = −ln P_A(issue), b = −ln P_B(issue) ; sens min ; bloc = la clé du match ; graine 38. **J1
  décide** ; un « retenu » exige (i) l'ampleur (écart moyen max_i |P_A − P_B|, en points) ≥ **0,5 point** (garde SECONDAIRE,
  jamais seule) et (ii) que **J2** (entropie croisée face à la clôture, mêmes lignes) ne dise pas « moins bon » ; J2 ne
  donne JAMAIS un « retenu » (T-B14). E2 : en plus, le gain moyen de CHAQUE saison de P2 doit être > 0 (T-B18), sinon « pas
  prouvé » ; le huis clos rapporté à part.
- **Confiance** : par ligne, les probabilités recalées par dixièmes (9 bornes fixes, 20 lignes fictives par dixième ;
  monotones) — bras A le recalage COMMUN (jamais Cox : monde courbe, T-B5), bras B le recalage PAR CLASSE ramené vers le
  commun (ses 20 lignes fictives à la fréquence commune) ; les issues renormalisées ; a, b = entropie croisée face à la
  CLÔTURE ; sens min ; bloc = match ; graine 38. Taille AVANT toute perte (T-B16) : la classe minoritaire doit avoir **300
  lignes avec clôture** dans la fenêtre jugée (sinon « non jugeable ici »). Un « retenu » exige l'ampleur (écart moyen des
  deux bras, en points) ≥ **1 point**. Sur P5-a : DANS chaque origine (nuit / coup d'envoi), l'origine dans les deux bras,
  deux plis (FNV-1a de la clé mod 2 ; chaque pli recalé sur l'autre), un verdict par origine, jamais réuni (critique,
  constat 1 ; T-C8).
- **Seuil** : par décision cotée de la fenêtre (une par match, TOUTES, 0 sans pari), a = VC sous seuil-v1 (pour le placebo :
  sous la seconde permutation), b = VC sous la règle (VC = cote prise × probabilité de clôture de l'issue − 1) ; sens max ; bloc = « jour|championnat » ; graine 1. Une
  décision qui parie sans clôture est écartée et comptée. **Utilité sur la variante SEULE** : des paris AJOUTÉS → leur VC jugée
  seule (comparer, a = 0) doit être « retenu » ; des paris RETIRÉS → leur VC moyenne ≤ 0, sinon « choix de prudence » (pas
  utile). **Règle des emboîtées** (T-B17) : parmi les « retenu » d'une même classe, la plus proche de 2 % (« aucune value »
  la plus loin). Aucune sortie « meilleur seuil » (T-B8). Le rendement est rapporté, jamais jugé.

## 7. Ce qui s'apprend, et où (jamais sur la fenêtre jugée)

- E1 : β̂ = argmax Σ ln P(i*) − Σ β²/(2 × 0,25²), Newton (au plus 30 itérations, arrêt 1e-10), sur P1 (tous les matchs de
  P1 qui ont le signal) ; le β sans a priori rapporté. Par régime : un β par régime si le pli d'apprentissage en a ≥ 2 000
  matchs. Par championnat : δ̂ par Newton avec l'offset du commun (championnats ≥ 50 matchs de P1), variance = 1/information,
  τ² = max(0, moyenne(δ̂²) − moyenne(variances)), δ = δ̂ · τ²/(τ² + variance).
- E2 : logit conditionnel sans a priori sur 2017-07-01 → 2019-06-30.
- Confiance : les tables par dixièmes sur P1 ≥ 2012-07-27 (P2) ; sur l'autre pli de la même origine (P5-a).

## 8. La règle de confiance (REGLE_DE_CONFIANCE ; conception §2.1-2.2)

Degrés 0/1/2 ; « fragile » si un degré vaut 2 ou si la somme vaut 2 ou plus ; « sur » sinon (le mot « sûr » n'est jamais
montré). A : Pinnacle, palier 2, buts plus/moins, corners relevés 0 ; palier 3, buts 1N2 1 ; repli, sans cote, buts
statistiques seules, buts du service 2. C : publiée / dernière alignée 0, sinon 1 (0 forcé pour le 1N2 ancré sur un prix).
D : nMin ≥ 8 0, 1-7 ou buts sans cote 1, 0 ou moyennes seules 2. E : rien 0, FotMob en panne 1, constat rouge 2, inconnu 0
(compté). F : le verdict de la case (version × marché × dixième), « trop-haut » / « trop-bas » 2. G : 1N2 dispersion > 3
points 1 ; buts |ln λM − ln λS| + |ln μM − ln μS| > 0,35 1. B (fraîcheur) : explication seulement, jamais un degré. Le 1N2
lit A, E, F, G ; les buts A, C, D, E, F, G ; corners/tirs A, C, D, E ; cartons A, C, E ; joueurs comme les buts.

## 9. Les mots de l'écran par verdict (`MOTS`)

retenu → « mesuré : retenu » ; pas prouvé → « mesuré : pas prouvé » ; moins bon → « mesuré : moins bon » ; non jugeable ici →
« non jugeable ici » ; définition → « définition » ; avant le banc → « pas encore mesuré ». Jamais « sûr », jamais une
pastille verte, jamais un seuil « conseillé ». Pied de l'encadré : « À blanc : rien de tout cela ne change le pourcentage ni
le conseil. »

## 10. Rapporté SANS verdict (hors K)

VC de la règle en service et des seuils 1-5 % (paris, VC moyenne) ; ρ (pente VC / avantage, au seuil 1 %) par classe (serré,
dispersé, cote haute, cote basse) ; le huis clos à 5 % (classe rétroactive, inactionnable) ; Cox par classe d'accord ; le β
sans a priori ; les gains par saison et du huis clos d'E2 ; τ² et le nombre de championnats.

## 11. Les sorties

`banc-etape38.json` (format 1) : l'étalonnage, les 38 variantes (verdict, raisons, gain, fourchette, z, ampleur, lignes,
blocs, strates ou fenêtres, utilité), les placebos, les emboîtées, le rôle de l'horloge, les rapports, les modules scellés,
les empreintes au passage ; `noteDeLaCombinaison.js` (recopie par script).

## 12. Les comptes d'avant le regard (`--comptes`, aucun résultat)

`SCR38\comptes-38-essai3.json` (sha1 40c057b76ec7b36c5a14a1ad4acf720011dabc20 ; le dernier fait foi) : P1 108 742 lignes (r1
53 454, r3 55 288 ; E2 15 478) ; P1 ≥ 2012 : 54 489 (clôture 1N2 52 862 ; **clôture du 2,5 : 0** — football-data n'en a pas
avant 2019) ; P2 30 158 (r1 30 028, **repli 130**, clôture 30 158, 2,5 **30 157** — anomalies de marge comprises, comme la
note —, huis clos 8 692). Seuil (P1 ≥ 2012 ∪ P2) : 84 647 décisions ; seuil-v1 2 726 paris ; pinnacle-1pc +2 865,
pinnacle-1-5pc +1 208, pinnacle-3pc −1 404, pinnacle-5pc −2 300, accord-disperse −22 / −73, cote-haute-3pc −268,
placebo-classe (deux permutations parmi les paris du jour) +118 / −137 face à son bras A. Classes sur P2 (avec clôture) : accord dispersé
**22**, repli 130, couverture « peu couvert » **284**, confiance-placebo 9 068, faux-ingredient 9 118. P5-a : nuit 857
lignes (801 avec clôture ; ancre sûre 141), coup d'envoi 81 (4). **Jugeables ici** : 1n2-recalage-marche,
1n2-stats-residuel, 1n2-placebo, horloge-j2, plusmoins25-recalage-marche, poids-par-championnat, faux-championnat,
confiance-placebo, faux-ingredient, les 9 règles du seuil sur football-data ; **non jugeables ici** (tailles, avant toute
perte) : poids-par-regime, confiance-v1, classe-regime, classe-compo, classe-couverture, classe-accord, et les 16 de P5-b.

## 13. Ce qui ne se fait pas après le regard

Aucune règle, taille, fenêtre, variante ni mot ne change après le premier `--banc` ; un second passage ne corrige qu'une
faute de code (les deux sorties gardées, côte à côte) ; aucune variante n'est ajoutée sans un identifiant neuf déclaré avant
son passage ; aucun seuil n'est « choisi » au meilleur gain ; rien n'est adopté (le seuil attend sa porte et 2027 ; la
combinaison attend le lot 2, le verdict de la 27 et Pierre).

## 2bis. Les modules scellés (recalculés au scellement)

Les modules du moteur et du banc lus par l’enfant :
- 236a33d7f952b12d4596b02ecb7c6090afca137d src/core/engine/goalModel.js
- 4ecda40200d8da352bc8c51adefb1152de4af916 src/data/db/forcesButs.js
- 368d73a39b081948dd6d49bfa9add6789c0490f3 src/core/engine/verdictPari.js
- 25e4757198fc09a1119de41cdef52eb553368e6a src/core/engine/valueFinder.js
- 0f33a6b56d5238057be45f5720f2050dac22bf6a src/bench/prix.js
- 523189cda6c82d77368f5b04e5877321d2d5f0d1 src/bench/simulateBets.js
- c40ebc02607830dec623d071c0d70778f26cf806 src/bench/metrics.js
- 60551323d356d5502684ca32276793fcb946ef84 src/bench/guard.js
- 1c5c192ce3ba261f884c37541dd46b14736746c7 src/data/db/leagueBenchmarks.js
- d7f4bf125d8b7902d86767b2d8344f457f5c9094 src/core/engine/fraicheurCotes.js
- d8b5264a88fd7ef241fb16bd209f3928c53ac628 src/bench/periodes.js
- b3deabcfcf1fe1d7f875d93a1b327b6efc0e883f src/core/market/marginRemoval.js
- afc8d42ccc9028531da8d9efc2700ece449d6a97 src/data/db/dayTable.js
- beaee6f2ae7064b46fb599e9a588e398e3fce229 src/data/contexte/bancDuContexte.js
- c2db82b68168b877603e3f18d3d0203121906ac4 src/bench/lancements.js
- 2edd957379facdb0915308f8404114d0786a70f5 src/core/risk/gardeFous.js

Les modules de l’étape 38 (le code au moment du regard) :
- cb96ae8cdaf98acf647636d3779946365dca5af2 src/data/combinaison/bancDeLaCombinaison.js
- f0d6201a10681e8281715bdd37d54e497eb4a82f src/data/combinaison/bancFd.js
- 257e0c75c17b70270953e6c1540d160ceb3f7315 src/data/combinaison/combinaisonEnfant.js
- 9b15d2252a3e6e0729f5d56decbb4dca23e4248c src/data/combinaison/comptesDeLaCombinaison.js
- f3b51be33ddb62bfc352e5962c22f2f6a29361dd src/data/combinaison/formulesDeLaCombinaison.js
- 8a21b2b138253f5c2444a9d79c95c75e06b77dc1 src/data/combinaison/ingredientsDUneLigne.js
- 9a9faa5863a1f699e1643c0b4b77089e3a57256e src/data/combinaison/lecteurP5.js
- c415fc616f243b5cc8a1faecc2d60ac7ef5be870 src/data/combinaison/reglagesCombinaison.js
- 180c3df704ebf989d68c5495d365c4bdcb6c22c6 src/data/combinaison/reglesDeConfiance.js
- 8e6764ffdc068da883a94756144f361ff7d338dc src/data/combinaison/reglesDeSeuil.js
