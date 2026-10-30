# Étape 32 — LE BANC DU CONTEXTE DU MATCH : les règles du regard, ÉCRITES AVANT LE REGARD

Écrit le **29/10/2026 à 13 h 27** (heure de Paris, prise avec `date` : 12:26:51 UTC), par l'agent de la partie B (Opus),
dans le bac à sable, AVANT les comptes, avant le diagnostic de la météo et avant le passage du banc. Ordre de priorité
suivi : `decisions-orchestrateur.md` > `critique.md` > `conception.md` (§3, §3.8, §11) > `dossier.md`.

**Aucun résultat de match n'a été lu avant ce fichier** : ni score, ni but, ni carton, ni déroulé, ni la sortie d'un banc.
Le code du banc n'a tourné que sur des données SIMULÉES (tests T-B1 à T-B5, T-B9) et sur un magasin FABRIQUÉ (tests T-B6,
T-B8, T-B10 à T-B14). La base du bac n'a été ouverte (en lecture seule) que pour compter ses rencontres et ses dates
(`day_matches` : 2023-01-04 → 2026-10-18, 61 061 rencontres, 57 087 entre 2023-07-01 et 2026-09-23) et voir qu'aucune
table `contexte_*` n'y est.

## 1. La procédure exacte (un seul regard)

Dans le bac, serveur du bac arrêté, base du bac **en lecture seule** (le calcul tourne dans le processus à part
`src/data/contexte/contexteBancEnfant.js`, qui ouvre la base par `openDb({ readonly: true })`), **un calcul lourd à la
fois**, avec `CM_BAC_A_SABLE=1` et `MATCH_STATS_DB=C:\Users\PC\CoteMaster\bac-a-sable\base\match-stats.db`, depuis
`C:\Users\PC\CoteMaster\bac-a-sable\code\server`. `SCR32` = `C:\Users\PC\AppData\Local\Temp\claude\C--Users-PC-OneDrive-Bureau-developement-ProjetBot\c4b41134-df35-4d3f-be49-63a4f15181fd\scratchpad\etape32`.

1. Le sha1 de CE fichier est noté dans `SCR32\etat.md` avant toute autre chose.
2. **`--comptes`** (AUCUN résultat lu) :
   `node scripts/match-context.mjs --comptes --export C:/Users/PC/OneDrive/Bureau/developement/ProjetBot/server/data/runtime/match-stats --sortie SCR32/comptes-contexte.json --pelouses SCR32/pelouses-ecartees.json --passe C:/Users/PC/OneDrive/Bureau/developement/ProjetBot/server/data/runtime/refresh-status.json`
   — l'export gelé du 22/09 n'est lu que pour (date, club qui reçoit, pelouse). Le sha1 de `pelouses-ecartees.json` est
   noté dans `etat.md`.
3. **`--diagnostic-meteo`** (AUCUN résultat lu) :
   `node scripts/match-context.mjs --diagnostic-meteo --analyses C:/Users/PC/OneDrive/Bureau/developement/ProjetBot/server/data/runtime/match-ai-analyses.json --sortie SCR32/diagnostic-meteo.json --passe …/refresh-status.json`
   — seul l'instantané d'avant-match de chaque analyse est lu (identifiant FotMob, heure du relevé, météo prévue).
4. **Contrôle des définitions** (§6) sur `comptes-contexte.json`, AVANT le regard.
5. **`--banc`, UN passage** :
   `node scripts/match-context.mjs --banc --regles SCR32/banc-regles.md --sha1-regles <sha1 de ce fichier> --pelouses SCR32/pelouses-ecartees.json --sha1-pelouses <sha1 noté> --k 9 --verrou SCR32/banc-passage-reel.lock --passe …/refresh-status.json --sortie SCR32/banc-contexte.json`
   — le script refuse si K ≠ 9, si ce fichier ou la liste des pelouses ont changé (sha1), si la sortie existe ; il attend
   que `running` soit null dans `refresh-status.json` du dépôt (lecture seule) ; il pose le VERROU
   `SCR32\banc-passage-reel.lock` (heure, pid, sha1 de ces règles) AVANT de lancer le calcul, et ne le retire jamais.
6. **`--recopier`** : `node scripts/match-context.mjs --recopier SCR32/banc-contexte.json` écrit
   `src/data/contexte/noteDuContexte.js` (CONTEXTE_AU_BANC) PAR SCRIPT, et garde la sortie et ces règles telles quelles
   dans `test/fixtures/banc-contexte-etape32.json` et `test/fixtures/banc-regles-etape32.md` (test T-B7 : la note refaite
   à l'octet). Jamais une retouche à la main.

Un second `--banc` est REFUSÉ par le script sans `--rejouer-apres-correction "<raison>"` ; s'il est fait (seulement pour
une faute technique ou une définition cassée découverte APRÈS, jamais pour un réglage), il est dit, la raison est écrite
dans le verrou, et les deux verdicts sont rapportés côte à côte.

## 2. Les données et les périodes (PERIODES_DU_BANC, reglagesContexte.js, fixé au lot 1a)

- Magasin du bac, rencontres de `day_matches` × `team_day` (camp qui reçoit), lues jusqu'au **2026-09-23 inclus** (rien
  de P5 : la lecture SQL est bornée, et le juge lève sur une rencontre plus tardive).
- **Mise en route** : tout ce qui précède 2023-07-01 (le magasin commence le 2023-01-04) — forces, repos, entraîneurs,
  arbitres accumulés ; rien d'appris ni de jugé.
- **Deux plis** : pli 0 = apprendre sur **2023-07-01 → 2025-06-30** (période A), juger **2025-07-01 → 2026-09-23**
  (période B) ; pli 1 = l'inverse. Les lignes des deux plis sont réunies dans UN SEUL jugement ; chaque ligne est jugée
  avec des coefficients appris sur l'AUTRE période (T-B6).
- Une rencontre entre dans le banc si elle n'est pas attribuée, si elle a son score à la 90e (`bp90/bc90`, sinon le
  score si le match n'est pas prolongé ; sinon écartée et comptée) et si elle est dans A ou B.
- « Au jour J » : les faits d'un jour sont publiés en fin de journée ; la fiche du jour J ne lit que les jours d'avant
  (ContexteAuJourJ lève sinon). Le prochain match (enchaînement) est le « calendrier connu après coup », la petite fuite
  déclarée (le tour suivant d'une même coupe ignoré).

## 3. La base (la même pour les deux bras de chaque comparaison)

- λS, μS au jour J : `modeleDeButs({ fair: null, … })` (régime « sans cote ») avec les réglages de la candidate de
  l'étape 27, recopiés et figés dans `BASE_STATISTIQUE` (ρ −0,05, demi-vies 35/25, prior 8, mix xG 0,7, remise à zéro au
  changement de championnat, démarrage à froid 8 matchs, bornes [0,2 ; 6]) ; les forces par `AccumulateurDesForces`
  (empreinte `v1|35|25|remise-a-zero`), nourri dès le premier jour du magasin — la même base, à l'octet, que celle du banc
  de l'étape 27 (`ForcesCourantes`, test T-B11) ; `parties.statistiques` (avant les bornes).
- **Recalage par pli** (forme fermée de Poisson, sur la période d'apprentissage du pli) : c_dom = ln(Σ buts dom. à la 90e
  / Σ λS), c_ext de même. Les deux bras partent de borne(λS·e^c_dom), borne(μS·e^c_ext). **Niveaux FIXÉS** : seuls les
  coefficients du facteur sont appris ; le banc mesure le CONTRASTE « concerné / non concerné » sur une base juste en
  moyenne (constat 3 ; T-B1 : un « −4 % » sur 20 % des camps est vu à ≈ −3,2 %).

## 4. Les variantes et K

**K = 9**, le nombre de variantes DÉCLARÉES dans `bench/lancements.js` (`VARIANTES_DE_L_ETAPE_32`), le faux facteur
compris, la fiche retenue `contexte-v1` comprise (elle ne lit aucun résultat ; elle n'est pas jugée) — exigé par le
script (`--k 9`) et par le juge. **z = Φ⁻¹(1 − 0,05/18) = 2,7729.** (La décision 2 disait « K = 8 » ; retirer
`repos-ecart` et `arbitre-penalties` de 11 en laisse 9 — la classe « long » n'était pas une variante — : écart dit au lot
1a, gardé, le côté prudent.)

Les 8 variantes jugées (formes fixées dans `bancDuContexte.js`, `FORMES`) :

| variante | ce qui est « concerné » | multiplicateurs (coefficients appris) |
|---|---|---|
| `repos-court` | un camp dont le repos est « court » : moins de 96 h entre les deux coups d'envoi (le dernier match JOUÉ avant J, toutes compétitions suivies, un match attribué ne compte pas) | ses buts × e^a, ceux de l'adversaire × e^b |
| `enchainement-serre` | un camp qui rejoue moins de 96 h après le coup d'envoi de J | ses buts × e^a, ceux de l'adversaire × e^b |
| `deplacement-distance` | tout match dont la distance entre les stades habituels est connue (`venues.json`, clé « fotmob-N » ; un match joué ailleurs est écarté) ; x = ln(1 + km/100) − la moyenne de x sur la période d'apprentissage du pli | buts du visiteur × e^(a·x), du club qui reçoit × e^(b·x) |
| `deplacement-altitude` | stade du club qui reçoit à 2 000 m ou plus (liste faite à la main) et visiteur sans altitude listée ou 1 500 m plus bas | buts du club qui reçoit × e^a, du visiteur × e^b |
| `pelouse-synthetique` | pelouse du match synthétique (`meta.surface`, sinon le stade habituel ; hybride = naturelle), SAUF les clubs écartés (§5) | buts du club qui reçoit × e^a, du visiteur × e^b |
| `arbitre-buts` | arbitre connu (clé « nom exact|pays ») avec au moins un match d'avant J : z = ln((G + 10·ē)/(E + 10·ē)), G = buts à la 90e de ses matchs d'avant J, E = Σ(λS·e^c_dom + μS·e^c_ext) de ces matchs avec le recalage DU PLI, ē = E/n (constat 9) | les buts des deux équipes × e^(β·z) |
| `entraineur-nouveau` | un camp dont l'entraîneur (celui de son dernier match avant J) est là depuis 5 matchs au plus, avec un autre avant lui, sans l'avoir dirigé dans les 365 jours d'avant | ses buts × e^a, ceux de l'adversaire × e^b |
| `placebo` | un camp tiré : FNV-1a 32 bits des octets UTF-8 de « clé du match:camp » (camp 1 = qui reçoit, 0 = visiteur), mod 100, de 0 à 14 (≈ 15 %) | ses buts × e^a, ceux de l'adversaire × e^b |

Apprentissage : régression de Poisson pénalisée (a priori gaussien d'écart-type **0,1** sur chaque coefficient), méthode
de Newton (au plus 25 itérations, arrêt quand le plus grand pas est sous 1e-10), buts à la 90e, ρ ignoré ; seuls les
matchs concernés comptent (niveaux fixés). Les seuils (96 h, 2 000 m / 1 500 m, 5 matchs / 365 jours, 10 matchs moyens,
15 %, 0,1) sont fixés AVANT le regard ; en changer un après = une variante de plus, déclarée avant son passage, et le seuil
de toutes devient z(K + 1).

## 5. La pelouse : les clubs écartés (constat 6), fixés par `--comptes` avant le regard

Un club qui reçoit vu sur **plus d'une pelouse** (synthétique / naturelle ; hybride = naturelle) parmi : ses matchs à
domicile de la base (jusqu'au 2026-09-23), ses matchs à domicile de l'export gelé du 22/09 (mois 2023-01 → 2026-09), son
stade habituel de `venues.json` — est **écarté** : sa pelouse vaut null au banc (jamais « concerné »). La liste est écrite
par `--comptes` (`pelouses-ecartees.json`), son sha1 noté dans `etat.md`, vérifié par le script au passage.

**Modifié avant le regard le 29/10/2026 à 13 h 31** (définition cassée, trouvée par le premier `--comptes`, aucun
résultat lu, aucune variante comptée) : l'export gelé n'a PAS l'identifiant du club (seulement ses noms) ; le premier
`--comptes` n'y reconnaissait donc aucun club (« 0 clubs avec une pelouse »). Les matchs à domicile de l'export sont
désormais rattachés au club qui reçoit par la CLÉ de la même rencontre au magasin (`day_matches.match_key`), jamais par un
nom ; une rencontre de l'export absente du magasin est comptée et laissée de côté. La règle elle-même ne change pas.

## 6. Ce qui se passe si une définition est cassée (contrôlé sur les comptes, AVANT le regard)

Une définition est tenue pour **cassée** (contrôles fixés ici, sur chacune des périodes A et B des comptes) si :
- plus de 20 % des camps sont en repos « inconnu » ;
- la distance est connue pour moins de 60 % des matchs en période B, ou moins de 40 % en période A (attendu ≈ 94 % et
  80 %, critique constat 15 : le piège des identifiants) ;
- aucun camp « serré », aucun match en altitude, aucun match synthétique, aucun nouvel entraîneur ;
- l'arbitre est connu au jour J sur moins de 10 % des matchs ;
- l'entraîneur est connu pour moins de 50 % des camps ;
- le faux facteur concerne moins de 13 % ou plus de 17 % des camps ;
- plus de 10 % des rencontres non attribuées n'ont pas de score à la 90e ;
- les rencontres jugeables d'une période sont moins de 15 000.

Alors : la cause est cherchée dans le code et corrigée AVANT le regard, **sans compter de variante** (aucun résultat n'a
été lu), les comptes sont refaits, la correction est dite dans `etat.md` et au rapport ; si elle touche une règle écrite
ici, ce fichier est corrigé (« Modifié avant le regard le … »), son nouveau sha1 noté. Un compte surprenant mais non cassé
(une part différente de la conception) est seulement dit.

## 7. Le juge et les seuils « utile »

- **Mesure** : la perte log du **score exact** à la 90e, −ln p(score), sur la grille 0-20 de `grilleDesButs(λ, μ, −0,05)`,
  plancher 1e-6 (un score au-delà de 20 buts a la probabilité 0) ; UNE ligne par match CONCERNÉ, `{ bloc: clé du match,
  date, a: perte de la base recalée, b: perte de la base recalée × multiplicateurs }` ; bloc = le match.
- **Juge** : `comparer` de l'étape 16 inchangé (`guard.js`) : `mode: 'moyenne'`, `sens: 'min'`, `variantes: 9`,
  `tirages: 1000`, `graine: 32`, `minBlocs: 200`, alpha 0,05 ; les lignes des DEUX plis dans un seul appel par variante.
  Verdicts : « retenu » (fourchette entièrement au-dessus de 0), « pas prouvé », « moins bon », « pas assez de matchs ».
- **Gain** rapporté en part de la perte de la base (gain / perte moyenne de la base), avec sa fourchette.
- **Témoins** (rapportés, JAMAIS jugés) : les 13 marchés binaires de buts (plus de 0,5 à 3,5, les deux marquent, buts du
  club qui reçoit +0,5 à +3,5, buts du visiteur +0,5 à +3,5), leurs pertes log moyennes.
- **Utile** si TOUT est vrai : (1) « retenu » à K = 9 ; (2) au moins **200 matchs concernés** jugés ; (3) **ampleur ≥ 0,5
  point** : la plus grande, parmi les 13 marchés témoins, des moyennes absolues du changement de probabilité sur les
  matchs jugés concernés (sans résultat) ; (4) le **faux facteur n'est pas « retenu »** — sinon LE BANC EST FAUX : aucune
  variante n'est utile, l'étape le dit et s'arrête là pour les chiffres.
- **Statut à l'écran** : « Effet mesuré » pour un facteur dont la variante est utile ; sinon « Explication seulement » ;
  la météo et l'enjeu : « non mesurable au banc ». (La conception prévoyait une « autre variante » par facteur : avec K = 9,
  chaque facteur n'en a plus qu'une.)

## 8. Les sorties

- `SCR32\comptes-contexte.json`, `SCR32\pelouses-ecartees.json`, `SCR32\diagnostic-meteo.json` (sans résultat) ;
- `SCR32\banc-passage-reel.lock` (posé avant le calcul, jamais retiré) ;
- `SCR32\banc-contexte.json` (format 1 : `premierRegard`, règles et pelouses avec leurs sha1, empreinte du moteur, comptes,
  durées et mémoire du processus à part, `banc` : K, z, recalages, centres, chaque variante — coefficients par pli,
  matchs concernés, verdict, gain et fourchette, ampleur, témoins, utile et raisons —, le faux facteur, banc faux ou non,
  les utiles) ;
- après `--recopier` : `server/src/data/contexte/noteDuContexte.js`, `server/test/fixtures/banc-contexte-etape32.json`,
  `server/test/fixtures/banc-regles-etape32.md`.
- Le verdict de CHAQUE variante (retenu / pas prouvé / moins bon / pas assez de matchs, gain et fourchette, placebo
  compris) est rapporté tel quel, sans tri ni relecture choisie.

## 9. Ce qui ne se fait pas après le regard

Aucun seuil, aucune forme, aucune période n'est retouché pour « voir mieux ». Aucun second passage sans la clé
`--rejouer-apres-correction` et sa raison écrite. Les fenêtres 2023-01 → 2026-09-23 restent déclarées vues pour la portée
« contexte » (`VUES_DE_L_ETAPE_32`) ; la preuve neuve reste celle d'après le lancement.
