# Étape 34 — LE BANC DES CHIFFRES DES JOUEURS : les règles du regard, ÉCRITES AVANT LE REGARD

Écrit le **03/11/2026** (heure de Paris, prise avec `date`), par l'agent d'écriture du lot 1a (Opus), dans le bac à sable,
AVANT le passage du banc et AVANT `--comptes`. **NON SCELLÉ** à l'écriture : l'orchestrateur relit `avant-scellement.md`,
puis le sha1 de ce fichier est noté dans `SCR34\etat.md` et dans `banc-regles.sha1.txt` (temps 2). Ordre de priorité suivi :
`decisions-orchestrateur.md` > `decisions-pierre-02-11.md` > `critique.md` > `conception.md` > `dossier.md`.

**Aucun résultat du banc n'a été lu avant ce fichier** : aucun attendu, aucune perte, aucun verdict calculé sur le magasin.
Le code du banc n'a tourné que sur des MONDES TIRÉS AU HASARD (`test/aides/joueursMondes.mjs`, tests `joueursBanc.test.mjs`)
et sur un magasin FABRIQUÉ (`test/aides/joueursFabrique.mjs`). La base du bac n'a été ouverte, en lecture seule, que pour :
compter ses rencontres et ses colonnes (partie 0) ; les comptes R1 à R4 de la critique (compositions, égalités de comptes,
règle des penalties : `comptes-critique.txt`) ; `--comptes` (§7), qui ne calcule ni attendu, ni perte, ni part de joueur.

**Modifié avant le regard le 03/11/2026 (vers 13 h), sur décision de l'orchestrateur (13 h 20)** après relecture de
`avant-scellement.md` — aucun regard n'avait eu lieu, aucune perte n'avait été calculée sur le magasin :
1. les GARDIENS ne sont pas jugés (§5, §8) — accepté ;
2. les tirs cadrés du pli A ne sont JUGÉS qu'à partir du 01/01/2024 (§3, §7, §8) — **décidé avant le regard, sur un compte de
   couverture seulement, aucun résultat lu** : la base S manquait (garde `baseCadresMin` à 79,4 % sur le pli A entier, sous
   ses 80 %) parce que les fenêtres f10 naissent avec le magasin (64,7 % des matchs du 2e semestre 2023) ; la garde n'est PAS
   relâchée (80 %), elle est comptée sur la fenêtre jugée : **84,6 %** (`--comptes` refait, `comptes-joueurs-2.json`, sha1
   8814bfe73ff10753b276ca628888268696cc0df0, aucune définition cassée) ;
3. les rapports « dernière alignée » et « remplaçants » restent hors du banc, avec leurs comptes seulement (§9) — accepté ;
4. C_T = la moyenne de la compétition par côté, sans la tendance, la même dans les deux bras (§5) — accepté pour le lot 1.

## 1. La procédure exacte (un seul regard)

Dans le bac, serveur du bac arrêté, base du bac **en lecture seule** (le calcul tourne dans le processus à part
`src/data/joueurs/joueursEnfant.js`, qui ouvre la base par `openDb({ readonly: true })`), **un calcul lourd à la fois**,
jamais entre 0 h 10 et 2 h 30, avec `CM_BAC_A_SABLE=1` et
`MATCH_STATS_DB=C:\Users\PC\CoteMaster\bac-a-sable\base\match-stats.db`, depuis `C:\Users\PC\CoteMaster\bac-a-sable\code\server`.
`SCR34` = `C:\Users\PC\AppData\Local\Temp\claude\C--Users-PC-OneDrive-Bureau-developement-ProjetBot\c4b41134-df35-4d3f-be49-63a4f15181fd\scratchpad\etape34`.

1. **`--comptes`** (avant le regard) :
   `node scripts/joueurs-a-blanc.mjs --comptes --sortie SCR34/comptes-joueurs.json --passe C:/Users/PC/OneDrive/Bureau/developement/ProjetBot/server/data/runtime/refresh-status.json`
   — son sha1 est noté dans `etat.md` ; le contrôle des définitions (§7) se fait sur lui.
2. **Le scellement** (temps 2, sur message de l'orchestrateur) : le sha1 de CE fichier noté dans `etat.md` et
   `banc-regles.sha1.txt` avant toute autre chose.
3. **`--banc`, UN passage** :
   `node scripts/joueurs-a-blanc.mjs --banc --regles SCR34/banc-regles.md --sha1-regles <sha1 de ce fichier> --k 11 --verrou SCR34/banc-passage-reel.lock --passe C:/Users/PC/OneDrive/Bureau/developement/ProjetBot/server/data/runtime/refresh-status.json --sortie SCR34/banc-joueurs.json`
   — le script refuse si K ≠ 11, si ce fichier a changé (sha1), si un fichier de `data/cartons/` n'a plus le sha1 scellé
   au §2, si la sortie existe ; il attend que `running` soit null dans `refresh-status.json` du dépôt (lecture seule) ; il
   pose le VERROU (heure, pid, sha1 de ces règles) AVANT de lancer le calcul, et ne le retire jamais.
4. **`--recopier`** : `node scripts/joueurs-a-blanc.mjs --recopier SCR34/banc-joueurs.json` écrit
   `src/data/joueurs/noteDesJoueurs.js` (JOUEURS_AU_BANC) PAR SCRIPT, et garde la sortie et ces règles dans
   `test/fixtures/banc-joueurs-etape34.json` et `test/fixtures/banc-regles-etape34.md` (T-B6 refait la note à l'octet).

Un second `--banc` est REFUSÉ sans `--rejouer-apres-correction "<raison>"` : seulement pour une faute technique découverte
APRÈS, jamais pour un réglage ; dite, la raison écrite dans le verrou, les deux verdicts côte à côte.

## 2. Le code de l'étape 33 employé, SCELLÉ (critique, constat 7)

Le banc lit les cartons par le code de l'étape 33 en service (lots 1a et 1b, `server/src/data/cartons/`), relevé en partie 0
(`SCR34\partie0\sha1-cartons-depart.txt`, identique au dépôt) :
- 72d4d13eb9e4c637015e9a730ace605b94887a05 data/cartons/formulesDesCartons.js
- ba074b67a7db971f9a02ad147ce35d8c73117097 data/cartons/cartonsAuJourJ.js
- 36fabc74c3c6d3547b578d24d03ce228b69cd109 data/cartons/lectureDesCartons.js
- 52a672fef7ca26b7aff1f12287929d09219a2903 data/cartons/reglagesCartons.js
- 2dd43653e0433a48fb66af63c8182943ee094478 data/cartons/noteDesCartons.js

Le flux des cartons est construit EN MÉMOIRE par la fonction même de l'enfant du banc de la 33 (`mettreAJourLeCache` jusqu'au
dernier jour lu, puis `rencontresChronologiques` de `lectureDesCartons.js` ; rien n'est rangé), et passé dans `CartonsAuJourJ`
journée par journée, à côté de la passe des joueurs (même registre, même ordre (jour, clé) : le script lève sinon). On en
lit, au jour J : le statut des cartons du match (relevé ou non, garde des vrais zéros comprise) et la moyenne de la
compétition pour chaque côté (365 jours, au moins 30 matchs relevés). `noteDesCartons.js` n'est pas lu par le banc ; son
sha1 est scellé pour que l'écran (lot 1b) dise la même étape 33.

## 3. Les données et les périodes (`PERIODES_DU_BANC`, reglagesJoueurs.js)

- Mise en route 2023-01-01 → 2023-06-30 : accumulée (sommes, repères, forces, cartons, dernières feuilles), rien d'appris
  ni de jugé.
- Pli « A » : juge 2023-07-01 → 2025-06-30 avec ce qui a été appris sur 2025-07-01 → 2026-09-23 ; pli « B » : juge
  2025-07-01 → 2026-09-23 avec ce qui a été appris sur 2023-07-01 → 2025-06-30. Les lignes des deux plis réunies dans UN
  `comparer` par variante. Rien après le 2026-09-23 (le banc lève).
- **Tirs cadrés** (`DEBUT_DES_CADRES_JUGES`) : les lignes « tirs cadrés » du pli A ne sont jugées qu'à partir du
  2024-01-01 (la base S naissante ; décidé avant le regard, sur un compte de couverture seulement, aucun résultat lu) ; celles
  du pli B, tout le pli. L'apprentissage (sur A pour juger B) garde tout ce qui a une base. Les autres familles : tout le pli.
- Matchs gardés : joués (score connu), ni attribués, ni prolongés ; la composition est la feuille OFFICIELLE (`starter`).
- Au jour J, publication en FIN de journée : un match ne voit jamais son jour. La feuille du jour J ne prête que la
  composition (titulaires, banc listé, postes, identifiants).

## 4. Les signaux et les relevés (par camp ; formulesDesJoueurs.relevesDUnCamp)

Une apparition = une ligne `players` d'un joueur IDENTIFIÉ (numéro FotMob après `people_merges`) avec minutes > 0, minutes
comptées jusqu'à 90 ; exposition e = total de l'équipe pour ce signal × minutes / 90 ; total = SOMME des lignes du camp.
- **xG des joueurs** (camp « à xG ») : au moins une ligne jouée avec un xG et AUCUNE ligne « inconnue » par la règle P.
- **Règle P** (v = 0,785, tolérance 0,016, seuil 0,70) : xG absent → 0 ; xGnp présent → k = arrondi((xG − xGnp)/v) si
  l'écart ≥ 0,70, sinon 0, hors penalty = xGnp ; xGnp absent et |xG − n·v| ≤ 0,016 (n ≥ 1) → k = n, hors penalty = 0 ; xGnp
  absent et xG < 0,70 → k = 0, hors penalty = xG ; sinon INCONNU (le camp perd np, pen et xa ; jamais un 0 fabriqué).
  **Repli écrit d'avance** : si un contrôle de la règle P est cassé pour UNE année (§7), tout « xGnp absent » de cette année
  devient inconnu.
- **Buteurs relevés** : le nombre de buts du camp au déroulé (csc crédités au camp compris) = le score du camp, ET chaque
  but non csc a un identifiant qui est une ligne jouée du camp.
- **np** : camp à xG → xG hors penalty ; sinon buteurs relevés → buts hors penalty et hors csc par identifiant ; sinon rien.
- **pen** : camp à xG → k de la règle P ; sinon buteurs relevés → buts sur penalty + penalties manqués par identifiant.
- **sot** (tirs cadrés relevés) : `team_stats.shots_on_goal` connu, Σ des `shots_on_target` des lignes jouées (NULL → 0) = lui,
  ET au moins une ligne jouée porte une statistique publiée (note, touches, passes, xG ou tirs cadrés).
- **av** : le statut des cartons du match est relevé (règle de la 33, garde du jour J) ; x = 1 si au moins un carton
  (`yellow`, `yellowred`, `red`) à son identifiant au déroulé, « not_on_pitch » compris (règle unique de la 33 pour le
  modèle) ; total = joueurs identifiés du camp qui ont joué et reçu un carton.
- **xa** : camp à xG → xA (NULL → 0) ; sinon **passes relevées** (critique, constat 4) : Σ `assists` des lignes jouées
  (NULL → 0) = le nombre de buts non csc du camp qui ont un passeur NOMMÉ au déroulé (seule sa présence : aucun nom
  rapproché), ET une statistique publiée.
- Jamais lus : `players.shots`, les cartons des lignes joueur, `player_day`, la carte des tirs, un nom.

## 5. Le modèle (la fiche `joueurs-v1`) et ses lois

- **Sommes amorties** par apparition relevée pour ce signal : X ← δX + x, E ← δE + e, δ = 2^(−1/h) ; h = 20 (np, xa, sot),
  30 (av), 40 (pen, PAR CLUB : remis à zéro au changement de club).
- **Repère du bras A** (critique, constat 8) : π0(poste, J) = Σx/Σe des apparitions de TITULAIRE de ce poste des 90 jours
  d'avant J, toutes compétitions, × r(compétition, poste) = (Σx + 40)/(Σ attendus + 40) sur les 365 jours d'avant J, les
  attendus = π0 du jour de chaque apparition × e. Poste inconnu (0) : les joueurs de champ. Le bloc des remplaçants : le
  même calcul sur les apparitions d'ENTRANTS (« R »).
- **Bras B** : π̃ = (X + κ·repère)/(E + κ), κ = κm × T̄ (T̄ : total moyen d'une équipe par match pour ce signal) ; κm sur la
  grille FINIE {0,25 ; 0,5 ; 1 ; 2 ; 4 ; 8 ; 16 ; 32 ; 64 ; 128 ; 256}. **Placebo** : le même rappel sur les sommes du faux
  joueur (emplacement FNV-1a de « clé du match:numéro » mod 1 000 / 4 400 / 4 800 / 2 700 selon le poste ; inconnu →
  milieux), crédité en fin de journée sous la même clé.
- **Minutes attendues** d'un titulaire : min(90, (Σδ min + 3·m0)/(Σδ 1 + 3)) sur ses titularisations (h = 10), m0 = minutes
  moyennes d'un titulaire du poste sur 90 jours.
- **Normalisation** (critique, constat 2) : Σ_L = les titulaires de la feuille (w = π̃ × m) + le bloc des remplaçants
  (w = repère R × R_T, R_T = max(0, 990 − Σ m)) ; le banc listé n'y entre jamais ; p = w/Σ_L ; un joueur sans identifiant
  ou sans apparition prend le repère de son poste.
- **Marque** : g = (1 − q_csc − q_pen)·p_np + q_pen·t (t : part des penalties, même normalisation) ; K ~ Poisson(λ_T·g)
  (critique, constat 9 : la marge de la grille de Dixon-Coles est Poisson(λ)) ; P(marque) = 1 − e^(−λ_T·g).
- **Tirs cadrés** : μ = S_T × p_sot ; binomiale négative de 1/k (binomiale de n = max(15, arrondi(−1/(1/k))) si 1/k < 0 ;
  Poisson si |1/k| ≤ 1e-6) : la loi de la 33 (loiDesCartons).
- **Averti** : P = min(0,95 ; κ_av × C_T × p_av), Bernoulli.
- **Passeur** : K ~ Poisson(λ_T·a·p_xa).
- **Les bases** : λ_T = borne([0,2 ; 6], e^(c_côté) × λS^β), λS la base statistique de la 32 au jour J (forces
  `AccumulateurDesForces` d'avant la journée, `modeleDeButs({ fair: null })`, `BASE_STATISTIQUE`), à l'octet de
  `passeDuBanc` (T-F5) ; S_T = e^(c_S,côté) × S^β_S, S = `statExpectations` du moteur sur les fenêtres f10 de `team_day`
  (6 matchs au moins de chaque côté) ; C_T = la moyenne de la compétition pour ce côté (CartonsAuJourJ de la 33, sans la
  tendance ni sa pente). La même base dans les deux bras.
- **Les gardiens ne sont pas jugés** (`GARDIENS_JUGES = false`, ajouté le 03/11 avant le regard, accepté par
  l'orchestrateur ; essai T-B11bis) : ils restent dans la composition et la normalisation. Raison : leurs parts sont
  minuscules et le rapport de leur poste par compétition n'a que quelques événements attendus par an (bien moins que les 40
  du rappel) ; dans des mondes tirés au hasard SANS écart propre au joueur mais avec un contexte compétition × poste de 0,15,
  le bras B « retenait » les tirs cadrés (z 3,5 / 1,8 / 0,9), tout le gain venant des gardiens (26 % de perte en moins sur
  leurs seules lignes) ; sans eux, z −0,6 / −1,2 / +0,9.

## 6. Ce qui s'apprend sur le pli d'apprentissage (jamais sur le pli jugé)

Dans l'ordre : le recalage de λ (régression de Poisson des buts de chaque camp sur ln λS, niveaux c_dom, c_ext et pente β,
Newton 30 pas, arrêt sous 1e-10) ; celui de S (tirs cadrés d'équipe sur ln S) ; q_csc et q_pen (camps à buteurs relevés :
Σ csc / Σ buts, Σ buts sur penalty / Σ buts) ; a (camps à passes relevées : Σ buts avec passeur / Σ buts) ; κ_av (camps aux
cartons relevés : Σ joueurs avertis / Σ C_T) ; T̄ de chaque signal ; 1/k du bras A des tirs cadrés (moments : Σ[(x − μ)² −
μ] / Σ μ²) ; puis la grille des κ, sur au plus 60 000 camps du pli (les plus petits FNV-1a(« 34:clé:côté »)), dans cet
ordre : np:B (marque, pénalties au poste), pen:B (marque, np:B), np:P, pen:P (np:B), sot:B et sot:P (1/k par les moments à
chaque κ), av:B, av:P, xa:B, xa:P — le κ qui minimise la perte totale de la famille ; enfin le **recalage par dixièmes**
(critique, constat 5) de chaque variante et de chaque bras : les 10 déciles à effectifs égaux des P du pli d'apprentissage,
leur centre et leur fréquence réalisée rendue monotone (moyennes groupées) ; P' interpolé linéairement entre les centres
((0, 0) et (1, 1) aux bords). Il sert à l'écran, à la cote juste et au critère « calibré » ; il ne change pas la perte.

## 7. Les contrôles « définition cassée » (sur `--comptes`, AVANT le regard ; COMPTES_CASSES)

Sur A ou sur B : moins de 300 000 titulaires jugeables pour « marque » ; buteurs relevés pour moins de 85 % des camps à
feuille ; moins de 95 % des buts (non csc) et cartons du déroulé à identifiant rattachés à une ligne jouée du camp ; tirs
cadrés relevés pour moins de 80 % des camps à feuille ; cartons relevés pour moins de 50 % des matchs ; passes relevées (xA,
sinon l'égalité des passes) pour moins de 80 % des camps à feuille ; base λ pour moins de 95 % des matchs, base S pour moins
de 80 % des matchs de la fenêtre où les tirs cadrés sont JUGÉS (pli A : à partir du 2024-01-01, §3), moyenne des cartons pour moins de 70 % des matchs aux cartons relevés. **Par année** (2023 à 2026) : règle P, cas 2
avec un but sur penalty du même identifiant sous 60 %, cas 1 à écart penalty sous 60 %, cas « k = 0 » au-dessus de 1 %, cas
4 au-dessus de 0,5 % des lignes à xG. Faux joueurs : médiane des apparitions par emplacement et par an hors de [10 ; 80].
Une définition cassée → corrigée AVANT le regard, sans compter de variante ; comptes refaits ; « Modifié avant le regard le
… » écrit ici, nouveau sha1. Le repli de la règle P (§4) s'applique sans autre décision.

## 8. Les variantes, K, le juge, « utile », « calibré »

- **K = 11** (`VARIANTES_DE_L_ETAPE_34`) : joueurs-v1 (la fiche, non jugée, comptée) ; buteur-parts (A : np A, pen A ; B :
  np B, pen A) ; buteur-tireur (A : np B, pen A ; B : np B, pen B) ; cadres-parts ; averti-parts ; passeur-parts (A : le
  repère ; B : le joueur) ; placebo-parts (B : np des faux joueurs), placebo-tireur (A : np B, pen A ; B : pen des faux
  joueurs), placebo-cadres, placebo-averti, placebo-passeur. **z = Φ⁻¹(1 − 0,05/22) = 2,8376.**
- **Lignes jugées** : un titulaire OFFICIEL identifié qui a joué (pas un gardien), base disponible, issue relevée au match
  jugé (buteurs relevés ; tirs cadrés relevés ; cartons relevés ; passes relevées) ; tirs cadrés du pli A à partir du
  2024-01-01 seulement (§3) ; `{ bloc: clé du match, date, a, b }`.
- **La perte** (plancher 1e-6) : −ln Poisson(k ; λ_T·g) (marque) ; perteDesComptes de la 33 (tirs cadrés) ; perteLogBinaire
  (averti) ; −ln Poisson(k ; λ_T·a·p_xa) (passeur).
- **Le juge** : `comparer` de l'étape 16 inchangé — moyenne, min, K = 11, 1 000 tirages, graine 34, 200 blocs au moins.
- **Utile** : « retenu », au moins 200 matchs jugés, ampleur (moyenne de |P_B − P_A| de l'issue binaire, sans résultat) ≥ 0,5
  point (0,3 pour buteur-tireur ; garde secondaire), et SON placebo pas « retenu » (sinon son banc est faux, et c'est dit).
- **Le modèle de l'écran** : par famille, le bras B si sa variante « parts » est utile, sinon le bras A (« chiffre du
  poste ») ; les penalties au tireur si buteur-tireur est utile.
- **Calibré** (le « fini quand » : marque et au moins un tir cadré ; averti et passeur rapportés) : sur toutes les lignes
  jugées, P recalé par les dixièmes appris sur l'autre pli, écart moyen pondéré des 10 déciles ≤ 1,0 point ET aucun décile
  au-delà de max(2,5 points ; 2,58 erreurs types).

## 9. Rapporté SANS verdict

Pour chaque variante : gain, fourchette, z observé, ampleur, calibration (brute et recalée) des deux bras, gain par poste
et (marque, passeur) par couverture ; la base (P(l'équipe marque) par déciles ; S par déciles) ; les minutes (minutes
attendues moyennes et écart moyen absolu aux minutes jouées, par poste) ; l'attribution seule (P(i marque | n buts de
l'équipe), bras B de buteur-parts) ; la part des buts sur penalty marqués par le titulaire au plus grand t (bras B de
buteur-tireur) ; les paramètres de chaque pli et les pertes de la grille. **Pas au banc** (critique, constat 17, et K = 11
fixé par l'orchestrateur) : les chiffres « dernière alignée » et « remplaçants s'il entre en jeu » — leurs seuls comptes de
compositions sont dans `--comptes` ; ils seront déclarés et jugés sur l'archive d'avant-match.

## 10. Les sorties

`SCR34\banc-joueurs.json` (jamais écrasée) : premierRegard, base (lecture seule), passe de Pierre, règles et leur sha1,
verrou, décisions de Pierre, sceau des cartons, empreinte du moteur et de la candidate, comptes du passage, durées et
mémoire du processus à part, le banc (§8, §9), les valeurs finales apprises sur A ∪ B, l'horizon de la preuve de chaque
variante utile (⌈n × ((z(11) + 0,8416)/z_banc)²⌉ matchs, 60 jours au moins). Puis la recopie (§1, 4).

## 11. Ce qui ne se fait pas après le regard

Aucune constante, aucun seuil, aucune forme, aucun relevé, aucune période ne change après le passage sans une variante de
plus déclarée avant son passage (et alors z(K + 1) pour toutes). Pas de second passage pour un réglage. Pas de lecture de
P5. Le verrou reste.
