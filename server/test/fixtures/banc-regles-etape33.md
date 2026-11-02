# Étape 33 — LE BANC DES CARTONS ET DES RÉGLAGES PAR CHAMPIONNAT : les règles du regard, ÉCRITES AVANT LE REGARD

Écrit le **02/11/2026** (heure de Paris, prise avec `date`), par l'agent d'écriture du lot 1a (Opus), dans le bac à sable,
AVANT le passage du banc. **NON SCELLÉ** à l'écriture : l'orchestrateur relit `avant-scellement.md`, puis le sha1 de ce
fichier est noté dans `SCR33\etat.md` et le verrou de lecture est préparé (temps 2). Ordre de priorité suivi :
`decisions-orchestrateur.md` > `critique.md` > `conception.md` (§2-§4) > `dossier.md` ; Q1 : `reponse-Q1.md`.

**Aucun résultat du banc n'a été lu avant ce fichier** : aucun attendu, aucune perte, aucun verdict calculé sur le
magasin. Le code du banc n'a tourné que sur des MONDES TIRÉS AU HASARD (tests `cartonsBanc.test.mjs`) et sur un magasin
FABRIQUÉ (`cartonsFabrique.mjs`). La base du bac n'a été ouverte (en lecture seule) que pour : compter ses rencontres et
ses dates (partie 0 : `day_matches` 2023-01-04 → 2026-10-18, 60 059 rencontres jusqu'au 2026-09-23, 57 087 dans les plis) ;
la FORME de la ligne d'équipe et des cartons sur la mise en route 2023-01 → 2023-06 seulement (déjà déclarée vue :
« red_cards » jamais absent quand « yellow_cards » est là ; codes `yellow`, `yellowred`, `red`) ; et `--comptes` (§6), qui
lit des cartons pour les statuts mais ne calcule ni attendu, ni perte, ni moyenne par équipe ou par arbitre.

## 1. La procédure exacte (un seul regard)

Dans le bac, serveur du bac arrêté, base du bac **en lecture seule** (le calcul tourne dans le processus à part
`src/data/cartons/cartonsEnfant.js`, qui ouvre la base par `openDb({ readonly: true })`), **un calcul lourd à la fois**,
jamais entre 0 h 10 et 2 h 30, avec `CM_BAC_A_SABLE=1` et
`MATCH_STATS_DB=C:\Users\PC\CoteMaster\bac-a-sable\base\match-stats.db`, depuis `C:\Users\PC\CoteMaster\bac-a-sable\code\server`.
`SCR33` = `C:\Users\PC\AppData\Local\Temp\claude\C--Users-PC-OneDrive-Bureau-developement-ProjetBot\c4b41134-df35-4d3f-be49-63a4f15181fd\scratchpad\etape33`.

1. **`--comptes`** (avant le regard ; aucun attendu, aucune perte) :
   `node scripts/cartons-corners.mjs --comptes --sortie SCR33/comptes-cartons.json --passe C:/Users/PC/OneDrive/Bureau/developement/ProjetBot/server/data/runtime/refresh-status.json`
   — son sha1 est noté dans `etat.md` ; le contrôle des définitions (§6) se fait sur lui.
2. **Le scellement** (temps 2, sur message de l'orchestrateur) : le sha1 de CE fichier est noté dans `etat.md` et dans
   `banc-regles.sha1.txt` avant toute autre chose.
3. **`--banc`, UN passage** :
   `node scripts/cartons-corners.mjs --banc --regles SCR33/banc-regles.md --sha1-regles <sha1 de ce fichier> --k 8 --verrou SCR33/banc-passage-reel.lock --passe C:/Users/PC/OneDrive/Bureau/developement/ProjetBot/server/data/runtime/refresh-status.json --sortie SCR33/banc-cartons-corners.json`
   — le script refuse si K ≠ 8, si ce fichier a changé (sha1), si la sortie existe ; il attend que `running` soit null
   dans `refresh-status.json` du dépôt (lecture seule) ; il pose le VERROU `SCR33\banc-passage-reel.lock` (heure, pid,
   sha1 de ces règles) AVANT de lancer le calcul, et ne le retire jamais.
4. **`--recopier`** : `node scripts/cartons-corners.mjs --recopier SCR33/banc-cartons-corners.json` écrit
   `src/data/cartons/noteDesCartons.js` (CARTONS_AU_BANC) PAR SCRIPT, et garde la sortie et ces règles telles quelles dans
   `test/fixtures/banc-cartons-etape33.json` et `test/fixtures/banc-regles-etape33.md` (test T-B7 : la note refaite à
   l'octet). Jamais une retouche à la main.

Un second `--banc` est REFUSÉ par le script sans `--rejouer-apres-correction "<raison>"` ; s'il est fait (seulement pour une
faute technique découverte APRÈS, jamais pour un réglage), il est dit, la raison est écrite dans le verrou, et les deux
verdicts sont rapportés côte à côte.

## 2. Les données et les périodes (PERIODES_DU_BANC, reglagesCartons.js)

- Magasin du bac : `day_matches` × `team_day` (les deux camps) × le cache des cartons relu EN MÉMOIRE (déroulé,
  `team_stats` jaunes et rouges, `meta.referee` nom et pays, `meta.reason`, `meta.awarded`), lu jusqu'au **2026-09-23
  inclus** (signatures et flux bornés en SQL ; une rencontre plus tardive fait LEVER le banc).
- **Mise en route** : tout ce qui précède 2023-07-01 (le magasin commence le 2023-01-04) — moyennes, tendances, gardes,
  fenêtres d'équipe et arbitres accumulés ; rien d'appris ni de jugé.
- **Deux plis** : pli 0 = apprendre sur **2023-07-01 → 2025-06-30** (A), juger **2025-07-01 → 2026-09-23** (B) ; pli 1 =
  l'inverse. Les lignes des deux plis sont réunies dans UN SEUL jugement par variante ; chaque ligne est jugée avec ce
  qui a été appris sur l'AUTRE pli (T-B6). Le pli inverse apprend sur l'avenir des matchs qu'il juge : ce n'est pas une
  fuite de résultat (aucun match jugé n'est appris ; fenêtres et sommes d'arbitre restent « au jour J ») mais une
  hypothèse de stabilité des réglages, celle de l'étape 32. C'est dit.
- **« Au jour J »** : les faits d'un jour sont publiés en FIN DE JOURNÉE (`CartonsAuJourJ.finDeJournee`) ; l'instantané
  d'un match est pris AVANT la publication de sa journée ; l'accumulateur lève sur un désordre ou une fuite.

## 3. Ce qu'on compte : la convention C de Pierre, la règle des cartons relevés

- **Convention C** (Q1, réponse de Pierre du 02/11/2026, `DECISION_DE_PIERRE.convention` = { valeur: 'C', date:
  '2026-11-02', ses mots }) : compté **joueur par joueur** sur le déroulé FotMob (critique, constat 8) — un joueur qui a
  un « yellowred » compte **2** (que son premier jaune soit listé ou non) plus ses rouges directs ; sinon ses jaunes plus
  ses rouges ; un carton sans joueur nommé compte seul ; le total d'un match = la somme des deux camps.
- **Les cartons du banc et du staff COMPTENT comme les autres, partout** (critique, constat 4 : `note` n'est lue que
  depuis le 20/10/2026, la ligne d'équipe les compte) ; ils sont comptés à part (`horsTerrain`).
- Les conventions **1** (un exclu après deux jaunes = 1) et **3** (= 3) sont seulement MESURÉES (§8), jamais jugées.
- **Les statuts** (`statutDesCartons`, formulesDesCartons.js ; une seule fonction pour le banc, la nuit, la preuve et le
  règlement) : déroulé COMPLET = au moins un remplacement de CHAQUE camp ; ligne = jaunes et rouges des deux lignes
  `team_stats` (absente si l'un des quatre comptes manque) ; écart = Σ par camp |ligne (jaunes + rouges) − déroulé
  (jaunes + rouges)| (critique, constat 9) :

| statut | quand | relevé ? |
|---|---|---|
| `attribue` | résultat attribué (`meta.awarded`, `awarded_win`, `id_reused`, ou `team_day.attribue`) | non |
| `prolonge` | prolongation ou tirs au but (`afterextra`, `afterpenalties`, `team_day.prolongation`) | non |
| `non-joue` | `cancelled`, `abandoned`, `postponed` (critique, constat 9) | non |
| `non-releve` | déroulé absent ou incomplet (même avec une ligne) | non |
| `accord` | complet, cartons au déroulé, écart 0 | **oui** |
| `ecart-1` | complet, cartons au déroulé, écart 1 | **oui** |
| `desaccord` | complet, cartons au déroulé, écart 2 ou plus | non (douteux) |
| `ligne-a-zero` | complet, jaunes au déroulé, ligne à 0-0 aux jaunes | **oui** (le déroulé gagne) |
| `sans-ligne` | complet, cartons au déroulé, ligne absente | **oui** |
| `vrai-zero` | complet, aucun carton au déroulé, ligne 0-0 aux jaunes ET aux rouges | **oui** (0 et 0) |
| `zero-non-confirme` | complet, aucun carton au déroulé, ligne absente ou non nulle ; ou vrai zéro sous la garde | non |

- **La garde des vrais zéros, AU JOUR J, glissante** (critique, constat 9) : parmi les **60** derniers matchs relevés
  (statut de base) de la compétition AVANT J, saisons confondues, s'il y en a au moins **30** et plus de **10 %** de vrais
  zéros, les vrais zéros du jour J deviennent `zero-non-confirme`.
- La valeur d'un match relevé = les comptes du déroulé (convention C) ; la ligne ne sert qu'au contrôle.

## 4. Le modèle des cartons (trois bras) et sa loi

Notations : match du jour J entre h et a, compétition L, arbitre r ; tout est pris dans l'état d'AVANT la journée J.
- **Moyennes de la compétition** m_dom, m_ext : cartons par équipe à domicile et à l'extérieur, sur ses matchs relevés des
  **365** jours d'avant J ; **30** matchs au moins, sinon pas de moyenne et le match n'entre pas au banc.
- **Tendance récente** (critique, constat 2) : r̄_L = (Σ des rapports C_total / (m_dom + m_ext) de ses **60** derniers
  matchs relevés ayant une moyenne + **30**) / (n + **30**).
- **Équipes** : ses **20** derniers matchs relevés, toutes compétitions ayant une moyenne ce jour-là ; r_k = cartons pris /
  m du côté de l'équipe dans SA compétition ce jour-là, p_k = cartons de l'adversaire / m du côté adverse ;
  ρ̃ = (Σ r + **5**) / (n + 5), π̃ = (Σ p + 5) / (n + 5).
- **Arbitre** (clé « nom exact|pays », aucun rapprochement ; nom de la page d'après-match, proxy du désigné) : O = Σ
  cartons réels de ses matchs relevés d'avant J, E = Σ attendus « équipes » de ces matchs (exposants 1, tendance avec
  λ = 1 : m_dom·r̄·ρ̃_h·π̃_a + m_ext·r̄·ρ̃_a·π̃_h, au jour de chacun), n ; **z = ln((O + 10·ē) / (E + 10·ē))**, ē = E/n ;
  sans match d'avant : pas de z. Jamais les moyennes que FotMob affiche.
- **Faux arbitre** (placebo) : clé « faux:<compétition>:<n> », n = FNV-1a 32 bits (octets UTF-8 de la clé du match) mod
  **20** (un nombre FIXE : critique, constat 15) ; accumulé comme un vrai.
- **Les trois bras** : log μ_dom = log m_dom + c_dom + λ·log r̄ [+ α·log ρ̃_h + γ·log π̃_a] [+ β·z], et de même à
  l'extérieur (m_ext, c_ext, ρ̃_a, π̃_h) : **repère** (c_dom, c_ext, λ) ; **équipes** (+ α, γ) ; **complet** (+ β).
- **Apprentissage** : régression de Poisson, méthode de Newton (au plus **30** itérations, arrêt quand le plus grand pas
  est sous **1e-10**), c_dom et c_ext libres, a priori gaussien centré sur 0 d'écart-type **1** sur λ, α, γ, β.
- **Dispersions** : 1/k équipe et 1/k total par les moments (la méthode d'`ajouterALaMesure` / `dispersionMesuree`), le
  match comme unité, autour des attendus de CHAQUE bras, sur son pli d'apprentissage ; valeurs brutes gardées.
- **Loi** (décision 2 de l'orchestrateur) : 1/k > 0 → binomiale négative de `loiDesComptes` (statMarkets.js, importée) ;
  **1/k < 0 → BINOMIALE** de n = max(**15**, arrondi(−1/(1/k))) essais et de moyenne μ, jamais Poisson ; 1/k ≈ 0 →
  Poisson. Le total suit SA dispersion (jamais la convolution de deux équipes).

## 5. Corners, tirs et tirs cadrés par championnat

- **Lignes** : matchs de CHAMPIONNAT (pas de coupe), non attribués, non prolongés, joués, la statistique relevée
  (`paireRelevee` : ni absente, ni 0-0), les deux fenêtres `f10` du moteur à **6** matchs au moins ; attendus NEUTRES
  e_h = (pour_h + contre_a)/2, e_a = (pour_a + contre_h)/2 (la formule de statExpectations, sans facteur).
- **Bras A = le COMMUN DU PLI** (critique, constat 1, BLOQUANT) : facteur domicile / extérieur F = Σ réalisé / Σ neutre
  (estimateur de ratio, `facteurMesure`), puis 1/k équipe et total par les moments autour de F × neutre, sur le pli
  d'apprentissage, **sans championnat**. Jamais les constantes du moteur.
- **Bras B = par championnat** : facteurs mesurés par championnat (au moins **30** matchs au pli d'apprentissage),
  ramenés vers le commun par le bayésien empirique de `retenirLesMesures` (τ² mesuré sur les championnats d'au moins
  **100** matchs, = MINIMUM_DISPERSION de leagueBenchmarks.js, testé) ; puis 1/k équipe et total remesurés autour des
  attendus du championnat, ramenés de même vers la valeur de tous les championnats remesurée ainsi. Un championnat sous 30
  matchs, ou absent du pli d'apprentissage, reçoit EXACTEMENT le bras A.
- **Loi** : celle du moteur (`loiDesComptes` ; un 1/k négatif y est Poisson), comme au lot 2.

## 6. Les contrôles « définition cassée » (sur `--comptes`, AVANT le regard ; COMPTES_CASSES)

Sur A ou sur B, une définition est **cassée** si :
- moins de **50 %** des matchs non prolongés, non attribués et joués sont relevés ;
- l'accord est sous **80 %** des matchs comparés (accord + écart-1 + désaccord) ;
- le désaccord dépasse **3 %** des matchs comparés ;
- les vrais zéros dépassent **5 %** des relevés ;
- l'arbitre est nommé pour moins de **50 %** des relevés ;
- moins de **70 %** des relevés ayant une moyenne ont deux fenêtres d'équipe d'au moins **5** matchs ;
- un pli a moins de **15 000** lignes jugeables pour les corners ;
- le faux arbitre (un match d'avant) couvre moins de **90 %** des relevés dont l'arbitre réel a un match d'avant.

Alors : correction AVANT le regard, sans compter de variante (aucune perte n'a été calculée) — par exemple une autre
lecture de la ligne pour le contrôle d'accord ; la cible (convention C, déroulé) ne change pas. Les comptes sont refaits ;
« Modifié avant le regard le … » est écrit ici ; nouveau sha1. Un compte surprenant mais non cassé est seulement dit.

## 7. Les variantes, K, le juge, « utile »

**K = 8** (`VARIANTES_DE_L_ETAPE_33`, déclarées avant le regard), **z = Φ⁻¹(1 − 0,05/16) = 2,7344**.

| n° | variante | bras A | bras B | lignes |
|---|---|---|---|---|
| 1 | `cartons-corners-v1` | — (la définition retenue, ne lit aucun résultat, comptée par prudence) | — | — |
| 2 | `cartons-equipes` | repère | équipes | tous les matchs relevés ayant une moyenne |
| 3 | `cartons-arbitre` | équipes | complet (β·z de l'arbitre) | arbitre avec un match d'avant ; les DEUX bras appris sur ces seuls matchs (critique, constat 10) |
| 4 | `cartons-placebo` | équipes | complet (β·z du FAUX arbitre) | faux arbitre avec un match d'avant ; les deux bras sur ces matchs |
| 5 | `corners-championnat` | commun du pli | par championnat | corners (§5) |
| 6 | `tirs-championnat` | commun du pli | par championnat | tirs |
| 7 | `cadres-championnat` | commun du pli | par championnat | tirs cadrés |
| 8 | `championnat-placebo` | commun du pli | par pseudo-championnat (FNV-1a de la clé du match mod **40**) | corners |

- **Mesure** : la perte log de la LOI ENTIÈRE des comptes, une ligne par match jugé `{ bloc: clé du match, date, a, b }` :
  −ln p_équipe(C_h) − ln p_équipe(C_a) − ln p_total(C_h + C_a), chaque probabilité planchée à **1e-6**, N = max(41, ⌈4μ⌉)
  cases puis la queue. Seule la somme est jugée ; ses trois parts sont rapportées.
- **Juge** : `comparer` de l'étape 16 inchangé : `mode: 'moyenne'`, `sens: 'min'`, `variantes: 8`, `tirages: 1000`,
  `graine: 33`, `minBlocs: 200`, alpha 0,05 ; les lignes des DEUX plis dans un seul appel par variante. Verdicts :
  « retenu », « pas prouvé », « moins bon », « pas assez de matchs ». Gain en part de la perte du bras A, avec sa
  fourchette, et le z observé (gain / écart-type).
- **Utile** si TOUT est vrai : (1) « retenu » à K = 8 ; (2) au moins **200** matchs jugés ; (3) ampleur ≥ **0,5 point** —
  la plus grande, parmi le total et les deux équipes, des moyennes de |P_B(plus de ℓ) − P_A(plus de ℓ)| pour ℓ ∈ {ℓ* − 1,
  ℓ*, ℓ* + 1}, ℓ* = ⌊μ_A⌋ + 0,5, sans aucun résultat (une garde SECONDAIRE : critique, constat 15) ; (4) le placebo de SA
  famille (cartons : `cartons-placebo` ; championnat : `championnat-placebo`) n'est pas « retenu » — sinon LE BANC DE CETTE
  FAMILLE EST FAUX : aucune variante de la famille n'est utile, c'est dit.
- **Statut à l'écran** : « Effet mesuré · pas encore un marché » (cartons) / « pas encore dans le pourcentage »
  (championnat) pour une variante utile ; « Explication seulement » sinon ; l'enjeu « non mesurable au banc d'essai ».

## 8. Rapporté SANS verdict

- **Calibration** (un seul rapport : critique, recommandation 4) : toutes les demi-lignes de 0,4 à 1,8 fois l'attendu du
  bras A, du total et des deux équipes ; P(plus de) annoncée par chaque bras rangée en dix tranches face à la fréquence
  réalisée ; écart moyen pondéré en points, A puis B.
- **Les deux autres conventions** (critique, constat 6) : sur les lignes de `cartons-equipes`, les attendus du bras B remis
  à l'échelle de chaque convention (Σ comptes de la convention / Σ comptes C, par camp), leurs 1/k équipe et total par les
  moments, et leurs cartons par match.
- **Le recentrage commun** (critique, constat 1) : pour chaque statistique, les constantes du moteur (A) face au commun du
  pli (B), gain et fourchette — une mesure, pas une variante.
- **La sous-fenêtre 2023-07-01 → 2024-06-30**, jamais vue par STAT_KINDS ni FACTEUR_TERRAIN : la même comparaison
  (par championnat face au commun ; commun face aux constantes) sur ses seules lignes, sans variante de plus.
- Ces mesures passent par le même `comparer` et les mêmes options que le juge (K = 8, 1 000 tirages, graine 33, 200 blocs
  au moins) ; leur verdict est seulement INDICATIF (`verdictIndicatif`), jamais un « utile ».
- **Le détail par championnat** (réglages, matchs, poids) : sans verdict ; un championnat n'est pas une variante.
- **L'effet de l'arbitre** se lit avec la désignation non aléatoire (critique, constat 3) : un « Effet mesuré · arbitre »
  voudra dire que son passé prédit les cartons au-delà des équipes — sa sévérité ET les matchs qu'on lui confie, que le
  banc ne sépare pas.

## 9. Les sorties

- `SCR33\comptes-cartons.json` (avant le regard ; sha1 noté) ;
- `SCR33\banc-passage-reel.lock` (posé avant le calcul, jamais retiré) ;
- `SCR33\banc-cartons-corners.json` (format 1 : `premierRegard`, règles et leur sha1, convention de Pierre, empreinte du
  moteur et de la candidate, comptes du passage, durées et mémoire du processus à part, `banc` — K, z, matchs, chaque
  variante : bras et paramètres par pli, matchs jugés, verdict, gain et fourchette, z observé, parts de la perte, ampleur,
  calibration, utile et raisons —, placebos, banc faux par famille, utiles, conventions, recentrage commun, sous-fenêtre ;
  `final` : les valeurs apprises sur A ∪ B — les trois bras des cartons et leurs dispersions, et pour chaque statistique
  le commun et la table par championnat ; `horizons` : l'horizon de la preuve de chaque variante utile, n = ⌈n_banc ×
  ((2,7344 + 0,8416) / z_banc)²⌉ matchs, en jours au rythme mesuré des lignes jugeables de B, 60 jours au moins) ;
- après `--recopier` : `server/src/data/cartons/noteDesCartons.js`, `server/test/fixtures/banc-cartons-etape33.json`,
  `server/test/fixtures/banc-regles-etape33.md`.
- Le verdict de CHAQUE variante (placebos compris) est rapporté tel quel, sans tri ni relecture choisie.

## 10. Ce qui ne se fait pas après le regard

Aucun seuil (20, 5, 10, 30, 365, 60 et 30 de la tendance, 60 / 30 / 10 % de la garde, 1 de l'a priori, 30 et 100 matchs par
championnat, 20 faux arbitres, 40 pseudo-championnats, 15 essais de la binomiale, 0,5 point, 200 matchs), aucune forme,
aucune période n'est retouché pour « voir mieux ». Aucun second passage sans `--rejouer-apres-correction` et sa raison
écrite. Les fenêtres 2023-01 → 2026-09-23 restent déclarées vues pour la portée « cartons-corners » (`VUES_DE_L_ETAPE_33`) ;
la preuve neuve reste celle d'après le lancement (reportée).
