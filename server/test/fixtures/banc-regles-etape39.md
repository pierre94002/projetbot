# Banc de la mise — étape 39, lot 1b : les RÈGLES, écrites AVANT le regard

Écrites le 09/11/2026 au soir (heure de Paris) par l'agent d'écriture, AVANT tout regard : aucun `--banc` n'a tourné, aucune
issue ni aucune clôture de P2 n'a été lue (les comptes les retirent à la lecture). Relues par l'orchestrateur
(`avant-scellement.md`, vers 22 h 40) ; la règle de choix modifiée au temps 2 par une **fenêtre vue déclarée** (§6 bis),
toujours AVANT le passage du banc de la mise. Au scellement, leur sha1 est noté dans `etat.md` et `banc-regles.sha1.txt`.
Copiées telles quelles dans `test/fixtures/banc-regles-etape39.md` par `--recopier`.

## 1. Le passage, une seule fois

- Depuis `C:\Users\PC\CoteMaster\bac-a-sable\code\server`, avec `CM_BAC_A_SABLE=1` et `MATCH_STATS_DB` = la base du bac (le
  banc ne l'ouvre pas : il lit l'export) :
  `node scripts/etape39.mjs --banc --paris <SCR39>\p2-paris.jsonl --sha1-paris 3039cafafc56ffc65382ce658c0c8421516bf6bc
  --regles <SCR39>\banc-regles.md --sha1-regles <sha1 de ce fichier> --k 3 --verrou <SCR39>\banc-passage-reel.lock
  --passe <dépôt>\server\data\runtime\refresh-status.json --sortie <SCR39>\banc-etape39.json`.
- Jamais entre 0 h 10 et 2 h 30 (heure de Paris : la passe de nuit de Pierre) ; la passe de Pierre attendue à « null » ;
  le verrou posé AVANT la lecture des issues, jamais retiré ; la sortie jamais écrasée.
- Un second passage seulement pour une faute de CODE (`--rejouer-apres-correction "<raison>"`, les deux verdicts côte à
  côte), jamais pour un réglage ni un seuil.
- Puis `--recopier <SCR39>\banc-etape39.json` : la note `src/data/mise/noteDeLaMise.js` écrite par script (T-B7).

## 2. Ce qui est fixé AVANT la note de la 38 (le scellement de la conception, §2.5, T-B11)

Conception : c74c0cbb6c9fdd4c836bbc7ecbeb2707d7503741 écrite le 2026-11-03T18:10:13Z (le 03/11/2026 à 19 h 10, heure de
Paris), avant le premier regard du banc de la 38 (2026-11-04T01:35:13.412Z). Elle fixe K, la règle v1, la plate et le
placebo ; ces règles-ci n'en changent rien. Seule la LECTURE du placebo dans la règle de choix a changé après la note de la
38 : c'est la fenêtre vue déclarée du §6 bis.

## 3. L'export de P2 (les paris jugés)

- Export de P2 : `p2-paris.jsonl`, sha1 **3039cafafc56ffc65382ce658c0c8421516bf6bc** (47 063 lignes, 555 paris), produit
  le 09/11/2026 de 21 h 29 à 21 h 32 (heure de Paris) par
  `node scripts/bench.mjs --periodes P2 --prix fd-avant-match --marches result --lignes <SCR39>\p2-paris.jsonl` sur la base
  du bac (rejeu n° 12) ; moteur 16f2459db183a99576365047da98b7777687ef05, réglage 1/8 de Kelly, plafond 2 %.
- Ce rejeu a rangé sa ligne (n° 12) dans `bench_runs` de la base du BAC (`bench.mjs` range toujours son rejeu) : acceptée
  par l'orchestrateur (decisions-orchestrateur.md, point 10). Rien d'autre n'a été écrit ; la vraie base jamais.
- Les comptes (sans issue ni clôture) : `comptes-mise.json`, sha1 8f480e579939d40ab9ab67392fdfc6eb407cdb62.

## 4. L'étalonnage (un seul écart ARRÊTE tout : rien n'est jugé)

- Les mises : 555 sur 555 à l'octet, par la reproduction ARRONDIE `Number((1000 × f).toFixed(2))` de `miseKelly`
  (f = min(1/8 × avantage / (cote − 1), 2 %)) — déjà vérifié avant le regard par `--comptes`.
- Le carnet : 555 paris ; valeur de clôture moyenne 0,0466 (à 4 décimales) ; pire série 9 ; zone des séries 15
  (`seriesDuCarnet`, `zoneNormaleDesSeries`).

## 5. Les variantes, K et le juge

- **K = 3** (`VARIANTES_DE_L_ETAPE_39`) : `mise-v1` (son verdict sur P2 = l'étalonnage), `forme-kelly`, `placebo-forme` ;
  z = 2,394 (zPour(0,05 ; 3)). Toute autre variante est refusée : 1/16, 1/4, ρ̂ et les plates sont RAPPORTÉES, jamais jugées.
- **J1 décide** : la croissance attendue à la clôture, g(f) = q × ln(1 + f(c − 1)) + (1 − q) × ln(1 − f), q = la probabilité
  de clôture du pari ; une ligne par pari qui a une clôture ; A = la plate, B = la règle jugée.
- **J2 qualifie** : le rendement réalisé ln(1 + f × R) (R = cote − 1 si gagné, −1 sinon), tous les paris, mêmes A et B.
- Le juge : `comparer` de `bench/guard.js`, mode « moyenne », sens « max », blocs = date × championnat, graine 39,
  1 000 tirages, au moins 200 blocs, 3 variantes, alpha 0,05.
- **La plate** : la moyenne des parts v1, calculée SANS issue (la cote et l'avantage seulement) : 0,005130926709375627 sur
  P2 (0,513 %). Jamais la plate à 1 %.
- **Le placebo** : les parts v1 permutées dans le MOIS civil (graine 39, mélange de Fisher et Yates du générateur du juge,
  les mois dans l'ordre) ; refusé s'il garde plus de la moitié des mises. Sur P2 : 41 mois, 34 mises gardées (6,1 %).
  Il ne doit jamais dire « retenu » ; un « moins bon » est RAPPORTÉ, sans annuler le passage (§6 bis).

## 6. La garde d'utilité et la règle de choix

- **La garde** : la valeur de clôture par bande d'avantage est LUE dans la note de la 38 (`rapports.vcParBandeDAvantage`),
  jamais recalculée ; elle n'est lisible que si une bande de 10 % et plus porte un verdict face à 0. « Confirmée » exige une
  garde lisible ET aucune bande de 10 % et plus « moins bonne » que 0. La note de la 38 ne porte pas cette table : la garde
  est illisible, la forme ne peut donc pas être « confirmée » à ce passage (avant-scellement.md, point 0.1).
- La valeur de clôture des paris plafonnés à 2 % (leur nombre, leur moyenne, leur avantage moyen) est rapportée à côté.
- **La règle de choix** (1/8 et 2 % restent dans tous les cas au lot 1 ; modifiée par la fenêtre vue déclarée, §6 bis) :
  - seul un placebo « retenu » → **règles fautives** : aucune conclusion ;
  - un placebo « moins bon » est **RAPPORTÉ** : la raison « le placebo dit « moins bon » : le coût de mises inégales, mesuré
    avant le regard ; rapporté, il n’annule pas le passage » s'ajoute aux raisons de la décision, qui suit la forme ;
  - forme « retenu » (J1), J2 pas « moins bon », garde qui le permet → **confirmée** (v1 reste) ;
  - forme « moins bon » (J1) → **mise égale proposée** à Pierre (lot 2, avec son accord ; v1 reste en attendant) ;
  - sinon → **pas prouvée** (v1 reste).

## 6 bis. Fenêtre vue (déclarée)

- **Quand, qui** : décidée le 09/11/2026 vers 22 h 40 (heure de Paris) par l'orchestrateur (`decisions-orchestrateur.md`,
  point 9), à la relecture d'`avant-scellement.md` (point 0.2) ; écrite au temps 2, AVANT le scellement et avant le passage
  du banc de la mise (aucune issue de P2 lue).
- **Ce qui change** : AVANT, un placebo « retenu » OU « moins bon » rendait les règles fautives. APRÈS, seul un placebo
  « retenu » les rend fautives ; un « moins bon » est rapporté (raisons de la décision, note), sans annuler le passage. Rien
  d'autre ne change : K, v1, la plate, le placebo lui-même, J1 / J2, le juge, la garde, les mots de l'écran.
- **Pourquoi** (la mesure faite AVANT le regard, `lot1b/marges-tb2-tb3.json`, sha1
  **f1fb84089cd2e89d8024554ea7def8405cf1f592**, par `lot1b/outils/marges-tb2-tb3.mjs` : mondes fabriqués sur les cotes et
  les avantages des 555 paris, 50 graines, 1 000 tirages) : le côté « retenu » du placebo est réglé (0 sur 50 quand
  l'avantage ne dit rien, ρ = 0, comme quand il dit vrai, ρ = 1) ; pas le côté « moins bon » (6 sur 50 à ρ = 0, sans
  aucune faute : le coût en croissance de mises inégales, le terme en f²). On ne lit un contrôle que du côté où il est
  réglé ; la règle de la 35 fait de même ; aucune conclusion n'en devient plus favorable à la forme (au plus « mise égale
  proposée », qui va CONTRE la règle en service) ; la note de la 38 ne dit rien de la mise.
- **Pourquoi c'est une fenêtre vue** : décidée APRÈS la lecture de la note du banc de la 38 — par l'écrivain (sa structure
  à 21 h 20 ; vers 22 h, une recherche a imprimé sa ligne entière, verdicts compris) et par l'orchestrateur, qui connaît ses
  verdicts depuis le 04/11.
- **Où elle est déclarée** : ici (sous scellement) ; dans la sortie du passage et dans la note recopiée (`fenetreVue` : le,
  par, quoi, pourquoi, mesure — `FENETRE_VUE` de `bancDeLaMise.js`, module scellé) ; dans `etat.md`. `bench/lancements.js`
  ne change pas : ses « vues » sont des fenêtres de DONNÉES, et P2 y est déjà vue pour la portée « mise ».

## 7. Les rapportés (jamais jugés)

- Six règles : 1/16, 1/8 (v1) et 1/4 de Kelly (plafond 2 %), la plate de même moyenne, la plate à 1 %, et 1/8 × ρ̂
  (ρ̂ par l'origine s'il est positif, sinon aucune mise).
- Quatre mondes, 1 000 tirages chacun, graine 39, capital COMPOSÉ jour par jour (le soir = le matin × (1 + Σ f × R)) :
  W-clôture (la référence : issues tirées avec la probabilité de clôture), W-moteur ((1 + avantage) / cote), W-zéro
  (1 / cote), W-réel (les vraies issues, l'ordre des jours tiré) ; et le chemin réel, à part (« la chance y pèse »).
- Pour chaque règle et chaque monde : le creux maximal sous le plus haut (50e, 95e, 99e centiles), le capital final
  (5e, 50e, 95e), le temps passé sous le plus haut, la part des chemins en perte ; la pire série (50e, 95e, 99e).
- Les zones : le 99e centile du creux de v1 (W-clôture) à 555, 1 110 et 1 665 paris, chacune avec son horizon ; les
  fausses coupures de la zone de 555 paris jusqu'à 2 775 (W-clôture et W-moteur) ; le délai de détection d'une panne (la
  valeur de clôture tombe à −5 % après le 300e pari, sur 1 110 paris). Elles éclairent Pierre ; jamais un seuil appliqué.
- ρ̂ (par l'origine et affine) ; la corrélation des issues d'un même jour × championnat et d'un même jour ; les jours où
  la somme des mises dépasse 4, 6 et 8 % ; la part plafonnée.
- Hors de ce lot : français zéro et demi, fragile demi et zéro (l'ombre P5, lot 1c) ; liés-grille (T-M5 au lot 1a ; P5
  après la porte 2 de l'étape 28). La part « fraîche » de P5 est le compte R24 de la 38 (0 relevé frais sur 197
  rencontres, pris dans `SCR\etape38\avant-scellement.md`, pas dans sa note), jamais calculée ici.

## 8. Les mots de l'écran (Historique moteur › Banc d'essai ; jamais « sûr », jamais un euro, jamais un seuil conseillé)

- Titre : « La mise conseillée, au banc d’essai ».
- Avant le passage : « Pas encore mesuré : le banc de la mise n’a pas encore tourné. La règle d’aujourd’hui (1/8 de Kelly,
  au plus 2 % du capital par pari) reste en service. »
- Les creux (monde de la clôture ; la moitié du temps = 50e centile, une fois sur cent = 99e) : « Avec 1/8 de Kelly, sur
  N paris comme ceux de 2019-2023 : la moitié du temps votre capital redescend au plus de X % sous son plus haut ; une fois
  sur cent, de Y %. Avec 1/16 : X′ % la moitié du temps, Y′ % une fois sur cent ; avec 1/4 : X″ % et Y″ %. »
- La forme :
  - confirmée : « Miser plus quand l’avantage est plus grand a été confirmé par la clôture (N paris). » ;
  - pas prouvée : « Miser plus quand l’avantage est plus grand : pas encore prouvé. La règle d’aujourd’hui est gardée. » ;
  - mise égale proposée : « Miser plus quand l’avantage est plus grand a fait moins bien qu’une mise égale sur chaque pari,
    à la clôture (N paris) : une mise égale vous sera proposée ; la règle d’aujourd’hui reste en attendant votre accord. » ;
  - règles fautives (seule phrase montrée) : « Le contrôle du banc de la mise n’a pas tenu : aucune conclusion n’est tirée.
    La règle d’aujourd’hui reste en service. »
- Provenance : « Mesuré une seule fois, au banc d’essai, sur les paris du moteur de 2019 à 2023 (cotes football-data d’avant
  match), dans le bac à sable. » ; puis « Mesuré le JJ/MM/AAAA. »
- La troisième phrase de la conception (« Vos N derniers conseils ont été pris en moyenne Z % sous / au-dessus de la
  clôture ») vient avec l'ombre P5 (lot 1c) : elle n'est pas montrée à ce lot.
- La place (Historique moteur › Banc d'essai, carte « 5 bis ») et les deux phrases neuves (« mise égale proposée », « règles
  fautives ») : validées par l'orchestrateur (points 11 et 13).

## 8 bis. « Fini quand » du lot 1 (conception §2.8 ; le (b) modifié par la fenêtre vue du §6 bis)

(a) `mise-v1` redonne `miseKelly` à l'octet sur 555 / 555 ; (b) le banc a tourné UNE fois, règles scellées (sha1 daté), note
recopiée, verdict de `forme-kelly` dit avec sa garde, **`placebo-forme` jamais « retenu »** ; (c) les creux (50e / 95e /
99e) et les capitaux finaux de 1/16, 1/8, 1/4 et des deux plates dans la note, capital composé, 1 000 tirages ; (d) à (f)
comme dans la conception (plafonds, capital de Pierre, empreintes, T-X7, `npm test` avec l'espion, `sandbox-diff`).

## 9. Les modules scellés (sha1 au moment de l'écriture ; le `--banc` refuse un module qui a changé)

<!-- modules : début -->
- 60551323d356d5502684ca32276793fcb946ef84 src/bench/guard.js
- db2ee326f8f88f09a5582c7e297cfd4bd7c9d51b src/bench/horizonEssai.js
- 056f91c188afa05c279ee2aaa9d00d84326d1d85 src/bench/lancements.js
- c40ebc02607830dec623d071c0d70778f26cf806 src/bench/metrics.js
- 0f33a6b56d5238057be45f5720f2050dac22bf6a src/bench/prix.js
- 523189cda6c82d77368f5b04e5877321d2d5f0d1 src/bench/simulateBets.js
- 3eca30850f4844f924ed1ec47b497606a68dec30 src/bench/trialsRegistry.js
- 51f4bf847f1bbb4a81d291a96566e3e9cb13af21 src/config/bacASable.js
- 87b6ac0fd2ebafa432c2adeb3beac591177a3dfa src/core/engine/engineConfig.js
- 5765ef8ea759a5413397e6b44aafb6c496fc674b src/core/engine/engineVersions.js
- 236a33d7f952b12d4596b02ecb7c6090afca137d src/core/engine/goalModel.js
- 1c81f14ce0e25e3af595318028234c565798eea0 src/core/engine/motsDuModeleDeButs.js
- 654e310c28e88de98c2f2ccf247b64ba5c3babaf src/core/engine/noteDuModeleDeButs.js
- 44bb6ed76ed724981de01b8d48b5a91ccb59dbed src/core/engine/scorePrediction.js
- 25e4757198fc09a1119de41cdef52eb553368e6a src/core/engine/valueFinder.js
- 368d73a39b081948dd6d49bfa9add6789c0490f3 src/core/engine/verdictPari.js
- 9abf1962a1c47d854cbc161624249a4df657279f src/core/engine/vosBookmakers.js
- b3deabcfcf1fe1d7f875d93a1b327b6efc0e883f src/core/market/marginRemoval.js
- 83c4cf5111c071ca7f95422f826125ecd464484f src/core/model/dixonColes.js
- 78be7262cce935f745491e220804da4e8e093aa8 src/core/model/poisson.js
- 84ad459c0c2794a2af3e89820f6ae8bbf98059ad src/core/risk/seriesDePertes.js
- 9e710bba2976c6b3a0363d44dc08217280c4273d src/data/combinaison/noteDeLaCombinaison.js
- d5183ad308453c22e944443450e1cdd228e6089b src/data/mise/bancDeLaMise.js
- 1a3424614bd9fc33fd80ffe95a0f49b9984eaf6c src/data/mise/regleDeMise.js
- c57a4c7b7ff14f598ada36a19c8e90b67ddcc4de src/data/providers/refreshLock.js
- 124d9c5086df25d06cb71b441d5f907570b21076 src/data/roadmap/plan.js
- c1296b56003be5cb170525d69047ea6745679424 src/sports/football/markets.js
- 86fe12b131b4315e9f9020659c93f2ed7461222d src/sports/football/statMarkets.js
- fbc39689e775107a6e987ef17ff01687fa8317e4 src/utils/atomicJson.js
<!-- modules : fin -->
