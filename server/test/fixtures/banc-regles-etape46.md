# Banc du direct — étape 46, lot 1 : les RÈGLES

> **RÈGLES SCELLÉES le 15/11/2026 à 12 h** (séance du verdict de l'étape 27, colonne `non-adoptee` : la version 5 reste en
> service). Les choix marqués « PROPOSITION » dans le PROJET (`SCR46\ecriture\banc-regles-etape46-PROJET.md`, sha1
> c662b283ca60ead42c238e706726906f662b9d20) sont tranchés par les décisions O9 à O12 de l'orchestrateur et marqués ici
> « DÉCIDÉ (O…) » ; ceux marqués « FIXÉ » viennent de la consigne d'écriture (P1 à P7). Le § 7 (R16), écrit AVANT
> `--libelles`, est gardé mot pour mot (P7) ; O10 le confirme, et `--libelles` du 15/11 sur la copie restaurée le dit non
> déclenché (`regleR16` false). Ce texte est
> `banc-regles-etape46.md` : il se suffit à lui-même (R18), il cite par sha1 les documents ci-dessous ; le script refuse s'il
> en manque un. Le sceau porte le sha1 de ce texte, des documents et des modules scellés ; c'est l'EXPORT qui cite le sceau (son
> en-tête, vérifié par le banc), et l'avenant du regard de preuve qui cite le second export — le premier export n'est cité que
> par son verrou et sa sortie (correctif C7 point 5 du 13/11 : ce texte, scellé AVANT l'export, ne peut pas le citer).

- **Écrit le** 11/11/2026 vers 21 h 15 (heure de Paris, `date` du Git Bash), par l'agent d'écriture « 0 et A », en partie 0,
  AVANT toute lecture de la base du bac (ni `--libelles`, ni `--mesurer-additionnel` n'ont tourné) et AVANT tout regard :
  aucun export, aucune issue de la période du banc lue, aucune performance d'une variante regardée (P7).
- **Cite** (les sept sha1 relevés de nouveau le 13/11 vers 6 h 40, correctif C6 ; à relever encore au § 3a de la manœuvre,
  juste avant le sceau : les décisions changeront avec O9 à O12, et la boucle « cité / MANQUE » refuse un sha1 périmé) :
  - `SCR46\conception.md` 7c2e4b5c94d9f26f472e74bad9fefee0b43c9137 (écrite le 10/11 de 22 h 43 à 23 h 30) ;
  - `SCR46\decisions-orchestrateur.md` 666925c3775051d8bf8ac33e30f6e17c4644a7d2 (O1 à O8 le 11/11 vers 11 h 35 ; O9 à O12 le
    14/11 vers 6 h 55 ; la colonne `non-adoptee` et l'heure du verdict inscrites le 15/11 à 12 h 13) ;
  - `SCR46\critique.md` bfbedd454c5592edfea7e73ec4a3303542043ed9 (R1 à R37, le 11/11 de 17 h 15 à 17 h 42) ;
  - `SCR46\consigne-ecriture-lot1.md` 921fcda8027faa507e059de3a6959146a0918153 (P1 à P7, le 11/11, fichier de 21 h 16 ; le
    sha1 c1a57521… écrit ici le 11/11 était celui d'avant sa dernière retouche) ;
  - `SCR\regle-gel-pendant-essai27.md` 8f680adecf164600094c7602bb8b21bd95715fe0 ;
  - `SCR46\consigne-partie-C.md` f92f94ef0ebc5428cac00854516405709677908f (le 12/11, fichier de 20 h 51) ;
  - le manifeste du gel `SCR46\ecriture\gel-46.json` a5b2fe5ce5815bbcf3a188e4ddeeb9c4f8db5fb6 (relevé le 11/11 à 21 h 05 ;
    moteur 16f2459db183a99576365047da98b7777687ef05, candidate f01dd8496f56a415).
- **Ordre de priorité** au scellement : ce texte, puis la critique, puis les décisions, puis la conception. Les restes périmés
  de la conception (`--k 7`, « K = 7 → z = 2,69 », `variantes: 56`, J6, `k: 7`, le « 7 » de T-B10, « figés la nuit d'avant »,
  « second regard quand l'export aura doublé ») ne valent PAS (R18).

## 1. Le modèle jugé (O9, R1) — DÉCIDÉ (O9)

1. **Le banc juge les lignes du modèle EN SERVICE le jour du scellement.** Une seule grille par jugement ; `--banc` refuse un
   export qui en mêle deux.
2. **27 adoptée** (version 6, lignes « modele-buts-441 ») : pour chaque rencontre, la dernière ligne d'avant le coup d'envoi à
   grille « modele-buts-441 » : rôle « service » s'il l'a, sinon rôle « candidate » dont `candidate_hash` est l'empreinte
   adoptée (le choix du juge de la 28). Variante plus simple si le banc passe tard : les seules lignes « service » 441
   d'après l'adoption, dès qu'il y en a assez. O3 et O4 sont re-décidés avant de sceller (§ 3, colonne de gauche).
3. **27 non adoptée** (version 5) : rôle « service », grille « ancien-81 ».
4. L'export porte pour chaque ligne `role`, `grille`, `engineVersion`, `candidateHash`, `oddsSource`, `oddsAt`, `kickoffConnu`,
   `version`, `graine` ; `--comptes` les compte avant le regard.
5. **La note porte le modèle jugé** (§ 10) ; l'écran ne l'applique qu'aux matchs dont la ligne a la même grille ET la même
   version — ou une version reconduite (point 7) —, sinon « pas encore jugé pour cette version du moteur » (`etatSimulation.js`
   l. 113-114 et 145 : la règle que la 28 s'applique). FIXÉ (P4), dans les deux branches.
6. **Une seule version du moteur par export** (correctifs C1 et C7 point 2 du 13/11). `--banc` et `--preuve` refusent, AVANT
   tout verrou, un export qui mêle deux versions (« versions du moteur mêlées ») — les versions reconduites réunies sous la
   version jugée par l'acte du second sceau (point 7) n'en font qu'une pour ce contrôle — ou dont la version est inconnue
   (« version du moteur inconnue » : aucune ligne « service » numérotée, ou une ligne « service » sans version) — la note
   n'en porte qu'une et ne s'appliquerait à aucune ligne. La version se compte sur les SEULES lignes « service » : pendant
   l'essai de la 27, une candidate est rangée sans version (`engine_version` NULL : une candidate n'est aucune version).
   Branche « 27 adoptée » : les candidates de l'empreinte adoptée sont jugées avec les lignes « service » 441, la note porte
   la version de celles-ci (la 6, rôle « service ») et ne s'applique qu'à elles ; un export de candidates seules (par exemple
   `--au` avant l'adoption) n'a aucune version et est refusé avant le verrou ; une candidate d'une AUTRE empreinte n'est
   jamais exportée (refusée si elle s'y trouvait, jamais comptée). Une ligne « service » sans version est exclue à l'export,
   comptée et nommée (§ 2).
7. **Reconduction (écrite avant le sceau).** Le banc juge le calcul en direct à partir des lignes d'avant-match (grille, λ,
   μ, ρ, `fair`). Une version du moteur qui ne change AUCUNE de ces lignes — elle ne change que ce qui vient après : le choix
   des paris, la mise, les bookmakers de la valeur, les textes — est, pour le direct, le même modèle. Une version N′ venue après
   la version jugée N « reconduit » la note si, et seulement si : (a) la grille est la même ; (b) une preuve à l'identité, sans
   aucune issue, le montre : sur au moins trois nuits complètes et 300 rencontres, les lignes calculées avec N et avec N′ sur
   les mêmes entrées ont les mêmes λ, μ, ρ et `fair` (écart nul à 1e-12 près) — lues côte à côte dans `simulation_matchs` quand
   N′ a tourné à blanc comme candidate, sinon recalculées dans le bac sur une même copie restaurée ; (c) aucun des modules
   scellés que l'écran emploie pour calculer n'a changé (`data/direct/`, `data/simulation/`, `core/model/`, et ceux de
   `core/engine/` et `core/market/` que le sceau liste) — sinon la preuve (b) porte aussi sur les LECTURES du direct : les
   mêmes probabilités à 1e-12 près pour chaque ligne aux états de l'étalonnage (0-0, 9-0, 4-4 à deux rouges, 12-1 ; créneaux 0,
   45, 46, 91) ; (d) l'inscription est faite PAR SCRIPT dans
   `server/src/data/direct/reconductionDuDirect.js` (hors du sceau) avec N, N′, la date, le nombre de lignes comparées et le
   sha1 de la sortie de la preuve, et elle est citée à l'historique. Une version qui change une seule ligne n'est jamais
   reconduite : « pas encore jugé pour cette version du moteur », jusqu'à un nouveau banc. À l'écran, une ligne d'une version
   reconduite est traitée comme une ligne de la version N, et l'écran le dit. Au banc, CE sceau ne juge qu'une version de
   lignes « service » (point 6) : si une version neuve arrive avant la taille T, le regard de preuve de ce sceau n'est pas
   pris ; il se prendra sous un second sceau, permis pour cette seule raison : les mêmes règles, K, les z, T et les jugements
   de celui-ci, les versions reconduites jugées ensemble, UN seul regard (celui de preuve), les matchs déjà vus au regard de
   sûreté déclarés « vus » au registre de la mesure.
   *[Correctif R1 du 13/11 après-midi (constat 1 de la seconde vérification, « rebanc », § 3.4), écrit mot pour mot. Les
   seuils de la preuve à l'identité — au moins trois nuits complètes et 300 rencontres ; écart nul à 1e-12 près sur λ, μ, ρ et
   `fair` ; aux états de l'étalonnage cités si un module du calcul en direct a changé — sont DÉCIDÉS par l'orchestrateur (13/11).
   Réunir plusieurs versions sous CE sceau (la « porte B » du rebanc, § 3.5 : du code scellé de plus) n'est PAS retenu : le
   second sceau annoncé ci-dessus est la seule voie. `reconductionDuDirect.js` et la lecture de l'écran
   (`lectureDuDirect.js`, `memeVersion`) s'écrivent APRÈS le sceau, avec la mise en service ; rien de ce point n'est dans le
   code scellé. La manière de poser ce second sceau s'écrit après celui-ci, hors du code scellé : un script à part, qui relit
   ce sceau sans le modifier et applique les règles ci-dessus ; `etape46.mjs` refuse tout second sceau (l. 896) et c'est
   voulu. Ce script passe une vérification avant d'être lancé. Hors du code scellé, il peut réunir les lignes des versions
   reconduites sous la version jugée : dans l'export réuni, le champ `engineVersion` — celui que lit le contrôle scellé
   (`controlerLExport`) — porte la version jugée N, et la version réelle de chaque ligne est gardée dans un champ à part
   et dans la pièce de la réunion. L'export réuni est l'export du `--exporter` scellé (lancé depuis la copie gelée,
   arrêté par `--au` la veille de la première version non reconduite) dans lequel SEUL ce champ a changé : aucun match
   ajouté ni retiré, aucune ligne ni aucune issue modifiée, aucune issue lue par ce script ; l'acte du second sceau cite
   le sha1 de l'export d'origine et celui de l'export réuni, et la vérification d'avant le lancement montre qu'ils ne
   diffèrent que par ce champ. Il peut aussi déclarer « vus » au registre de la mesure les matchs déjà vus au regard de
   sûreté. Le regard de preuve qu'il permet est lancé par le `--preuve` scellé, depuis la
   copie gelée, au même verrou : il est « pris sous le second sceau » parce que l'acte du second sceau, écrit et vérifié
   AVANT ce lancement, le déclare. Il ne change ni le code scellé, ni K, ni les z, ni T, ni les jugements de ce sceau.
   (Ajout de l'orchestrateur, 13/11 vers 19 h 55, corrigé vers 20 h 45 d'après la relecture sceptique : questions Q2 et Q3
   du brouillon du second sceau.)]*

## 2. Le champ et l'export (R19, R36) — DÉCIDÉ (O9, O10)

- Les matchs joués depuis le **2026-09-24** (P5, seuls neufs pour PARAMS), à chronologie complète
  (`issuesDuMagasin(...).complet` et au moins un remplacement au déroulé), non attribués, prolongés jugés au score de la 90e
  (`butsA90`) ; une ligne du modèle jugé (§ 1) d'avant le coup d'envoi.
- L'export passe par `lecteurDesRencontres` (`data/calibration.js` : jour exact, sinon ± 1 jour, ambiguës écartées) et
  `issuesDuMagasin`, jamais par une jointure neuve. Il exige `calcule_le < meta.kickoff` (l'heure RÉELLE du coup d'envoi) ;
  sans `meta.kickoff`, la ligne est gardée si `calcule_le` est avant minuit (Paris) du jour du MAGASIN, que `kickoff_connu`
  vaille 0 ou 1, sinon exclue. Exclus comptés par raison dans l'en-tête.
- La graine de chaque ligne est refaite à l'export sur la ligne lue (`fixture_key`, `role`, `version`, `graine` ; le contrôle
  de `controlerLesLignes`) : une ligne qui ne redonne pas sa graine est exclue et nommée.
- Une ligne « service » SANS version du moteur (`engine_version` NULL : registre illisible la nuit du calcul, ou version pas
  encore notée) est exclue, comptée dans l'en-tête comme les autres exclus (raison `sansVersionDuMoteur`) et nommée — sinon
  une seule de ces lignes ferait refuser tout l'export, sans issue sous sceau (correctif C3 du 13/11). Les candidates de
  l'empreinte adoptée, qui n'ont jamais de version, ne sont pas concernées (§ 1 point 6).
- Seules les lignes calculées au plus tard à la dernière nuit complète (`simulation_state`) sont lues : une ligne d'après
  elle n'est jamais exportée (la précédente l'est, s'il y en a une).
- Un rouge noté `not_on_pitch` compte comme un rouge (PARAMS a été appris ainsi) : dit et compté dans l'export (R36 point 7).
- L'en-tête de l'export porte `simulation_state.principal` lu dans la copie restaurée : le banc ne passe qu'APRÈS le principal
  de la 28 (R36 point 9).
- `--comptes`, AVANT le regard et sans aucun `resultat` : l'âge de la ligne au coup d'envoi (médiane, part au-delà de 24 h),
  la part `kickoff_connu = 0`, la répartition de λ + μ (part sous 1,6 ; part au-dessus de 4), la part trouvée de l'ancrage,
  λ′, μ′ et le nombre de matchs à la borne (R7, R14, R19).
- **Points d'évaluation** : le DÉBUT des créneaux (part 0) ; DÉCIDÉ (O10, R36 point 1) : un créneau sur trois, plus 45, 46 et
  91 (32 points par match), au lieu des 92.

## 3. Les variantes : les deux colonnes de O10, et ce que la consigne FIXE (P1, P2, P3)

**FIXÉ (P1) — les variantes CODÉES** (le surensemble des deux colonnes, 7) :

| Identifiant | Ce que c'est |
|---|---|
| `direct-v1` | la chaîne de la 28 (`PARAMS` : effets du score, rouges) partie de λ, μ de la ligne ; lecture brute (la grille conditionnelle) |
| `direct-sans-effets` | la même avec `PARAMS_SANS_EFFETS` (ni effet du score, ni rouge) |
| `temps-restant` | la règle simple (conception § 2.11) : 99 minutes-équivalent, Poisson indépendants sur le reste, partie de λ, μ |
| `direct-rouges-ignores` | `direct-v1` avec l'état des rouges forcé à 0-0 |
| `temps-restant-championnat` | la règle simple partie des buts moyens du championnat (domicile, extérieur), comptés par script sur la fenêtre DÉJÀ VUE 2023-07-01 → 2026-09-23, table scellée ; repli 1,45 / 1,15 (`LOI_TABLE`) (R14) |
| `direct-ancre` | la chaîne à (λ′, μ′), λ′ + μ′ = λ + μ, la répartition telle que `P(1) − P(2)` de la grille FERMÉE (`grilleDesEntrees` à λ′, μ′, ρ) égale `fair.home − fair.away` ; SANS résiduel ; λ′ et μ′ bornés dans [0,30 ; 4,0], ancrage ARRÊTÉ à la borne quand la cible est hors d'atteinte (`ancrage: { fait, borne, lambda, mu }`), jamais `direct-v1` pour cette seule raison ; sans `fair` : `direct-v1` (R7) ; quand λ + μ < 0,60 ou > 8,0, les deux bornes ne peuvent pas tenir ensemble : l'ancrage n'est PAS fait (`ancrage: { fait: false, raison: 'total-hors-bornes' }`) et la variante se lit comme `direct-v1` — `--comptes` compte ces lignes (`ancrage.raisons`) |
| `temps-restant-ancre` | la règle simple partie des MÊMES (λ′, μ′) ; sans `fair` : `temps-restant` ; total hors bornes : `temps-restant` |

Ni `aligne-1n2` ni `strate` (aucune n'est codée). Le filet de R22 point 2 reste (§ 6). `direct-rouges-exacts` n'est PAS codée :
elle s'ajoute en partie C si la règle du § 7 se déclenche.

**Les deux colonnes de O10** (DÉCIDÉ (O10) : les deux déclarations de la critique § 4.1, codées dans `declarationDuDirect.js`,
retenues telles quelles ; la colonne `non-adoptee` fixée par script le 15/11/2026 ; P3 : K, la liste déclarée, les z, les
tranches, le principal et T sont ceux de cette colonne) :

| | 27 adoptée (version 6, lignes « modele-buts-441 ») | 27 non adoptée (version 5, lignes « ancien-81 ») |
|---|---|---|
| Variante affichée (P2) | `direct-v1` — réglage `varianteAffichee: 'direct-v1'` (l'ancrage y est presque neutre ; l'écart restant à la minute 0, environ 1 point sur le 1N2 et jusqu'à 2,5 sur le plus de 2,5, est dit par R8) | `direct-ancre` quand la ligne a un `fair`, `direct-v1` sinon — réglage `varianteAffichee: 'ancre-si-fair'` ; `direct-ancre` cède à `direct-v1` si J4c la dit « moins bonne » (O3) |
| Variantes déclarées | 5 : `direct-v1`, `direct-sans-effets`, `temps-restant`, `direct-rouges-ignores`, `temps-restant-championnat` | 7 : les mêmes, plus `direct-ancre` et `temps-restant-ancre` |
| z (K) ; z des tranches (K × 8) | 2,576 (K = 5) ; 3,227 (40) | 2,690 (K = 7) ; 3,322 (56) |
| Si `direct-rouges-exacts` s'ajoute (§ 7) | 2,638 (K = 6) ; 3,279 (48) | 2,734 (K = 8) ; 3,359 (64) |
| Principal (à point de départ égal, R12) | `temps-restant` → `direct-v1` | `temps-restant-ancre` → `direct-ancre` (ligne sans `fair` : `temps-restant` → `direct-v1`) |
| Taille T du regard de preuve | 1 700 matchs (± 15 % : 1 250 à 2 400) | au moins 2 300, ou un « pas encore tranché » durable accepté par écrit |
| Codées mais non déclarées | `direct-ancre`, `temps-restant-ancre` (calculées, jamais jugées ni affichées) | aucune |

z = `zPour(0,05 ; K)` de `bench/guard.js` (relu le 11/11 : 5 → 2,576 ; 6 → 2,638 ; 7 → 2,690 ; 8 → 2,734 ; 40 → 3,227 ;
48 → 3,279 ; 56 → 3,322 ; 64 → 3,359).

**FIXÉ (P2) — la variante affichée est UN réglage** de `reglagesDirect.js`, `varianteAffichee`, à deux valeurs :
`'ancre-si-fair'` (défaut avant le verdict : la version 5 est en service) et `'direct-v1'` ; l'orchestrateur fixe la valeur à
la séance. Sans note, c'est elle que le calcul à blanc emploie ; avec une note, `note.variante` prime (elle porte le résultat
de J4c, § 4).

## 4. Les jugements (R12, R14, R17) — DÉCIDÉ (O10, O11)

Juge : `comparer` (`bench/guard.js`), `mode: 'moyenne'`, `sens: 'min'`, `bloc` = le match, `tirages: 2000`, `graine: 46`,
`variantes: K`, `minBlocs: 400`. Mesures : `perteLog` (1N2, trois issues) et `perteLogBinaire` (lignes de buts OUVERTES
seulement), écrêtées par `PROBA_MIN` (`metrics.js`).

| Jugement | A (référence) | B | Sur quoi | Rôle |
|---|---|---|---|---|
| **Principal** | à point de départ égal (§ 3) | la variante affichée | 1N2, tous les points | décide « meilleur que la simple règle du temps restant » |
| J1-O4 | `temps-restant` | la variante affichée | 1N2 | RAPPORTÉ, sous son vrai nom : « partir du 1N2 du pronostic d'avant-match plutôt que des buts attendus du moteur » |
| J2 | `temps-restant` | la variante affichée | buts (plus/moins 0,5 à 3,5, les deux marquent, buts par équipe ; lignes ouvertes) | exigé « pas moins bon », par famille |
| J2s | `temps-restant-championnat` | la variante affichée | buts, par famille | exigé « pas moins bon » ; sinon la famille n'est pas montrée en direct (« buts attendus du moteur pas assez sûrs pour ce marché ») (R14) |
| J3 | `direct-sans-effets` | `direct-v1` | 1N2 | rapporté |
| J4c | `direct-v1` | `direct-ancre` | 1N2 | colonne « 27 non adoptée » seulement : `direct-ancre` cède à `direct-v1` si « moins bonne » |
| J5 | `direct-rouges-ignores` | `direct-v1` | 1N2, points où un rouge est déjà tombé (`minBlocs: 50`) | rapporté ; nourrit « calcul fait à 11 contre 11 » |
| Rapporté | `temps-restant` | `direct-sans-effets` | 1N2 | ce que vaut le profil des minutes seul |
| Tranches | idem principal et J2 | idem | les 8 bandes de `PARAMS.bandes` | z des tranches (K × 8) ; une tranche « moins bon » → pas de pourcentage dans cette tranche, dit |

**Ordre des lectures** (R17 point 2) : J4c d'abord, puis le principal sur la variante qui en résulte ; les deux comptés.

**J1-O4 n'est pas jugé dans la colonne « adoptee »** (correctif C7 point 3 du 13/11) : sa variante affichée est `direct-v1`, qui
part déjà des buts attendus du moteur, et son principal est `temps-restant` → `direct-v1` — J1-O4 (`temps-restant` → la
variante affichée) y serait le principal, mot pour mot. Il n'est jugé que dans la colonne « non-adoptee », où la variante
affichée part du 1N2 du pronostic d'avant-match (`direct-ancre`, ou `direct-v1` après le repli de J4c).

## 5. Les regards (R15, O11) — DÉCIDÉ (O11)

1. **Sûreté**, dès 600 matchs : ne rend que « rien de moins bon : montré, pas encore jugé (N matchs rejoués sur les T
   prévus) » ou « moins bon : pas montré » (principal « moins bon », J2 ou J2s « moins bon », très gros écarts de calibration) ;
   jamais « retenu » ni « prouvé ».
2. **Preuve**, unique, à la taille T fixée AVANT le regard de sûreté, au z de K. Si l'export a déjà T au scellement, seul le
   regard de preuve est pris. Si une version neuve du moteur entre en service avant que la version jugée ait T matchs, le
   regard de preuve de ce sceau n'est pas pris (§ 1 point 7). T se compte sur l'export ; les matchs retirés par les tolérances
   nommées (§ 5 point 3 et § 6, 25 au plus) ne le remettent pas en cause (correctifs R1 et R10 du 13/11 après-midi).
3. Mode `--preuve` distinct : il exige le verrou de sûreté et un second export ; l'identité des LIGNES (λ, μ, ρ, `fair`,
   `calcule_le`) des matchs communs ; il compte et nomme sans refuser les écarts de résultat et les matchs apparus entre-temps
   (« Feuilles publiées en retard », « Feuilles de match manquantes ») ; avenant limité au sha1 du second export et à sa date ;
   verrou propre.
   **La tolérance nommée de l'identité des lignes** (correctif C12 du 13/11) : la ligne retenue dépend de `meta.kickoff`,
   qu'une feuille publiée en retard peut compléter entre les deux exports. Les matchs communs dont la ligne retenue a changé
   sont NOMMÉS, COMPTÉS et RETIRÉS DES DEUX CÔTÉS (ni jugés, ni dans les écarts entre les exports) s'ils sont au plus 5 ET au
   plus 0,5 % des matchs communs ; au-delà, refus, rien lu (le contrôle se fait AVANT le verrou, sans aucune issue). L'avenant
   du regard de preuve rappelle cette tolérance (modèle de l'avenant : manœuvre § 8b).
4. Variante plus simple : pas de regard de sûreté, « faits seuls » jusqu'au regard unique. Si un regard de sûreté a pourtant
   été pris (`banc46\verrou-surete.json` existe), le regard de preuve seul n'est pas refusé — c'est la seule issue quand
   l'identité des lignes est rompue au-delà de la tolérance —, mais il est DIT dans la sortie et dans la note : « regard de
   preuve seul alors qu'un regard de sûreté a été pris : identité des lignes non vérifiée » (correctif C4 point 3).
5. **Un seul regard de chaque nom** (correctif C4 du 13/11) : hors d'une copie d'essai, le verrou du regard de sûreté est
   `banc46\verrou-surete.json` et celui du regard de preuve `banc46\verrou-preuve.json`, eux seuls (contrôlé avant tout le
   reste : un autre nom de verrou ne fait pas un second regard) — le `banc46` de la RACINE du bac, où que soit rangé le code
   qui tourne (une piste, la copie gelée de `banc46\code-scelle` ; correctif R5 du 13/11 après-midi). Un rejeu « après correction » (`--rejouer-apres-correction
   "<raison>"`) rejoue le MÊME export que le dernier passage de son verrou ; un AUTRE export est un autre regard, refusé sauf
   avec `--autre-export`, décidé à la séance ; tout rejeu est noté dans le verrou (sa raison, et s'il porte sur un autre
   export).
6. **La note du regard de preuve est protégée** (correctif C9) : `--recopier` refuse de la remplacer par la sortie d'un regard
   de sûreté, sauf avec `--remplacer`.

## 6. Les gardes (R13, R20, R21, R22) — DÉCIDÉ (O10)

- **Étalonnage, deux étages** (R20) :
  1. dès `--comptes`, AVANT le verrou et sans aucun `resultat` : toutes les variantes sur les vraies lignes (λ, μ, ρ, `fair`) et
     une grille d'états fabriqués (0-0, 9-0, 4-4 à deux rouges de chaque côté, 12-1 ; créneaux 0, 45, 46, 91) — lectures finies,
     dans [0 ; 1], somme + masse négligée = 1 à 1e-9 près et Σ 1N2 = somme à 1e-9 près ; minute 0 de `direct-ancre` :
     `P(1) − P(2)` de la grille fermée à (λ′, μ′) = `fair.home − fair.away` hors borne ; masses négligée et plafonnée sous le
     seuil de F1 aux états 0-0 des quatre créneaux, COMPTÉES (la pire nommée) aux autres états fabriqués ;
     *[erreurs de fait corrigées le 13/11 par la partie C, mesurées le 12/11 sur des lignes fabriquées et notées au journal :
     (a) la grille de la chaîne n'est pas ramenée à 1 (les marchés se lisent dans ses cases, comme à l'écran) : aux coupes du
     banc la masse négligée vaut ~2 à 3,4·10⁻⁹ au créneau 0 sur toute ligne, « somme 1 à 1e-9 » lu à la lettre refuserait
     chaque match ; (b) à 9-0 et 12-1 le plafond de 20 buts par camp est atteint PAR CONSTRUCTION (masse plafonnée jusqu'à
     7,7·10⁻³ à 12-1 au créneau 0 pour λ = 3,2) : « sous le seuil de F1 » y refuserait tout export]*
  2. sous verrou, les mêmes contrôles sur les états réels AVANT toute perte ; un écart → sortie « étalonnage », rien n'est jugé.
  La relance après correction passe par le drapeau de correction avec sa raison (patron de la 39).
  **Les matchs hors de F1 à l'étage 2** (correctif C11 du 13/11, décision de l'orchestrateur : on exclut et on nomme, on ne
  bloque plus tout) : un match dont un état RÉEL sort de F1 pour une variante (masse négligée + plafonnée ≥ 1e-5, ou masse
  négligée au-delà de 1e-4) est RETIRÉ DE TOUS LES JUGEMENTS des deux regards, NOMMÉ dans la sortie (son pire état) et COMPTÉ
  (raison `horsF1`). Le critère ne lit que les masses des lectures du modèle aux états du rejeu, jamais une issue d'un pari ;
  toutes les variantes sont jugées sur les mêmes matchs. Si ces matchs dépassent 1 % des matchs du passage OU 20 matchs, c'est
  un problème systématique, qui ne se masque pas : écart de l'étalonnage, rien n'est jugé (code 3). Les autres écarts de
  l'étage 2 (lecture non finie, hors de [0 ; 1], somme, minute 0 de `direct-ancre`) arrêtent toujours le passage.
- **F1, exactitude** (R21) : le banc calcule aux coupes de la conception (`SEUIL_ETAT` 1e-12, `EPS_LOI` 1e-11) ; le direct aux
  siennes (O2 : 1e-9, 1e-8). F1 = `masseNegligee + massePlafonnee < 1e-5` sur tous les états du rejeu, le pire état nommé
  dans la sortie — sur les matchs JUGÉS, ceux de l'étage 2 retirés à part (ci-dessus). `massePlafonnee` est un majorant de la
  masse plafonnée (comptée à chaque créneau) : un état déjà plafonné qui marque encore est recompté ; F1 n'en est que plus
  sévère (correctif K7 du 13/11, constat 7 de la vérification du calcul). Garde-fou du direct :
  `masseNegligee > 1e-4` → `calcul.raison = 'erreur'`.
- **Le filet** (R22 point 2) : une lecture non finie ou hors [0 ; 1] d'une variante NON affichée devient une ligne écartée des
  DEUX côtés de la comparaison, comptée et nommée ; dans `direct-v1`, `temps-restant` ou la variante affichée, jamais écartée en
  silence : comptée, nommée, et elle fait dire « F1 non tenu ».
- **Garde de calibration** (R13) : l'unité = une issue (1, N, 2 séparément) ou une ligne (« plus de 2,5 »), côté annoncé fixe ;
  liste fermée, comptée dans la note. Une paire n'est « écartée » que si son écart dépasse 4 points ET 3 écarts-types (par
  blocs de matchs, le rééchantillonnage du juge) ; entre les deux : « à surveiller », MONTRÉE en ambre avec ses chiffres. Elle
  se juge au regard de PREUVE ; au regard de sûreté elle ne sert qu'aux très gros écarts. **Une paire portée par moins de 50
  matchs n'est pas jugée, et elle est comptée** (`minMatchsParPaire` 50, correctif C7 point 1) : sans ce plancher, un
  écart-type par blocs nul sur une poignée de matchs suffirait à « écarter » ; au regard de sûreté il n'écarte que les paires
  rares (« plus de 0,5 » encore ouvert à 0-0 dans les arrêts de jeu, environ 7 % des matchs), au regard de preuve aucune.
- **Le contrôle de la table du temps additionnel sur P5** (comptes de buts, aucune probabilité) se fait dans `--banc`, APRÈS
  le verrou (R36 point 6) ; son écart maximal va dans la note.
- **La passe de Pierre** : le script relit `refresh-status.json` toutes les 50 rencontres et attend (`running` à `null`) ; de
  même pour la restauration et l'export (R36 point 2). Jamais pendant la passe de nuit.

## 7. Les cartons rouges au banc (R16) — PROPOSITION écrite AVANT `--libelles`

- Dans tous les cas, `--libelles` compte, dans `live_snapshots`, la part des matchs suivis avec au moins un rouge lu, l'âge du
  dernier détail à chaque instantané (médiane, 75e, 90e centiles) et la part des instantanés de la liste seule ; la note dit
  « au banc, les cartons rouges sont connus à la minute ; en direct ils arrivent quelques minutes après », avec J5 et ces
  comptes.
- **Règle conditionnelle** (seuils PROPOSÉS par la critique, à confirmer par l'orchestrateur) : si le retard médian du dernier
  détail dépasse **2 créneaux**, OU si **plus d'un match suivi sur cinq** n'a aucun rouge lu, alors l'état du banc prend les
  rouges tels qu'ils étaient M créneaux plus tôt, M = la MÉDIANE mesurée par `--libelles` ; « rouges à la minute » devient une
  variante rapportée, `direct-rouges-exacts` (K + 1).
- Ces seuils sont écrits ici à 21 h 15 le 11/11, AVANT le premier `--libelles` (partie A). S'ils sont changés après la lecture
  de `libelles.txt`, c'est une **fenêtre vue**, à déclarer (patron du § 6 bis des règles de la 39).

## 8. La table du verdict (R17) — DÉCIDÉ (O11)

| Cas | Ce que l'écran montre |
|---|---|
| étalonnage en écart, ou F1 non tenu | faits seuls (score, minute, rouges), aucune probabilité |
| principal « moins bon » | faits seuls |
| une tranche « moins bon » | pas de pourcentage dans cette tranche, dit |
| J2 ou J2s « moins bon » pour une famille | la famille n'est pas montrée en direct, dit |
| paire écartée (§ 6) | la ligne dit pourquoi, avec ses chiffres |
| paire « à surveiller » | montrée, en ambre, avec ses chiffres |
| sinon, regard de sûreté | montré, phrase « pas encore tranché » (gris) |
| sinon, regard de preuve, principal « retenu » | montré, phrase « meilleur que la simple règle du temps restant » |
| sinon, regard de preuve, principal « pas prouvé » | montré, phrase « pas encore tranché » (gris, jamais ambre) |

Voie courte au lot 1 : résultat + total et score exact portent « non jugé au banc » en gris ; pendant les arrêts de jeu, la
carte ajoute « partie du match non jugée au banc ».

## 9. Les phrases (R12 point 3, R13 point 3, R17 point 4)

- « meilleur que la simple règle du temps restant » ne s'écrit QUE sur le principal à point de départ égal, au regard de
  preuve.
- « Pas encore tranché : sur N matchs rejoués, ce calcul fait entre x de moins bien et y de mieux que la simple règle du temps
  restant ; il en faut environ T » (gris) — « il en faut environ T » seulement si N < T (correctif C7 point 4 : au regard de
  preuve, N ≥ T, à ces matchs retirés près — les tolérances nommées du § 5 point 3 et du § 6, 25 au plus ; correctif R10).
- Au regard de sûreté, « Rien de moins bon : montré, pas encore jugé (N matchs rejoués sur les T prévus) », suivi de « ; non
  montré : <familles>, <tranches> » quand une famille ou une tranche est « moins bon » (correctif C7 point 4). Ces phrases
  restent dans la sortie et la note : l'écran a ses propres mots (partie D).
- « écarté par le banc d'essai (annoncé 41 %, arrivé 52 % sur 1 012 matchs) ».
- La note dit mot pour mot ce qui est prouvé (« perte log du 1N2 », « aucun écart de calibration prouvé »), jamais
  « meilleure calibration ».
- Aucun mot du banc à l'écran (« perte log », « créneau », « strate ») : l'écran le dit en mots simples (partie D).

## 10. La note (P4, R1, R18) — FORMAT FIXÉ en partie 0

`server/src/data/direct/noteDuDirect.js` exporte `NOTE_DU_DIRECT` : `null` tant que le banc n'est pas passé (tout le lot 1
avant la partie C), puis UN objet écrit PAR SCRIPT (`--recopier`), jamais à la main :

```
{
  format: 1,
  modele: 'ancien-81',                // la grille des lignes jugées : 'ancien-81' ou 'modele-buts-441' (R1)
  version: 5,                         // la version du moteur des lignes jugées (engine_version)
  role: 'service',                    // toujours 'service' depuis le correctif C1 (§ 1 point 6 ; correctif R12)
  candidateHash: null,                // toujours null depuis le correctif C1 (un export de candidates seules est refusé)
  variante: 'direct-ancre',           // la variante retenue pour l'écran (réglage P2, puis J4c)
  regard: 'surete',                   // 'surete' ou 'preuve' (R15)
  verdict: 'montre-non-tranche',      // une ligne de la table du § 8 : 'faits-seuls' | 'montre-non-tranche' | 'prouve' | 'pas-prouve'
  passeLe: '2026-11-22',              // la date du passage (jour de Paris)
  modules: { 'data/direct/calculDuDirect.js': '<sha1>', … },   // les sha1 des modules scellés (SCELLEMENT)
  regles: { sha1 }, export: { sha1, matchs, de, a }, k, n, t,
  jugements: [{ id, a, b, verdict, gain, fourchette, n }],
  tranchesNonMontrees: [...], famillesNonMontrees: [...],
  paires: { jugees, ecartees: [{ unite, tranche, annonce, realise, n }], aSurveiller: [...] },
  rouges: { auBanc: 'a-la-minute' | 'retardes', retardMedianCreneaux, partSansRouge },
  additionnelSurP5: { ecartMax },
  phrase
}
```

Règles d'application (partie B, `lectureDuDirect`) :
- **une note par grille** : la note s'applique à un match seulement si sa ligne a `grille === note.modele` et
  `engine_version === note.version`, ou une version reconduite (§ 1 point 7) (et, branche « candidate », le même
  `candidate_hash` — branche sans objet depuis le correctif C1 : la note porte toujours `role: 'service'` et
  `candidateHash: null`) ; sinon « pas encore jugé pour cette version du moteur » et les pourcentages restent à blanc ;
- **sans note** : les pourcentages sont calculés à blanc (`calcul.aBlanc: true`) et JAMAIS montrés ; l'écran montre les faits
  et la phrase « pas encore jugé » de la conception ;
- la note est le SEUL interrupteur (P5) : aucun fichier d'exécution lu à chaque requête, aucune écriture en base ; pour
  éteindre : `node scripts/etape46.mjs --note-nulle`, serveur arrêté, hors d'une passe, puis redémarrage.

## 11. Le scellement et le registre (R18) — DÉCIDÉ (O10, O11)

- `SCELLEMENT` (dans `bancDuDirect.js`, partie C) liste : ce texte scellé, les documents qu'il cite, et les 24 modules par
  sha1 (la liste exacte au § 13) — toute la fermeture des imports des quatre modules qui calculent les chiffres jugés
  (`bancDuDirect`, `rejeuDuDirect`, `calculDuDirect`, `declarationDuDirect`), dont sept modules de `core/` seulement LISTÉS
  pour leur sha1 (correctif C2 du 13/11), plus `scripts/etape46.mjs` ; hors du sceau, seulement `bench/trialsRegistry.js`,
  `bench/lancements.js`, `roadmap/plan.js` et `utils/atomicJson.js` (un essai refait la fermeture et l'exige).
- État, mémoire, libellé et entrées du direct ne sont pas scellés : le banc ne les importe pas ; leurs correctifs (rodage du
  lot 1b) ne rouvrent pas le sceau ; ils sont inscrits à l'historique avec leurs sha1 d'avant et d'après ; un essai de
  concordance, hors du sceau, rougit si le choix de ligne de `entreesDuDirect.js` s'écarte de celui de `ligneDuBanc`
  (`etatDuDirect.js`, `memoireDuDirect.js`, `libelleDuDirect.js`, `entreesDuDirect.js` : correctif K3 du 13/11, constat 3 de
  la vérification du calcul ; ils disent d'où part le calcul de l'écran, ils ne calculent aucun chiffre jugé — le banc rejoue
  depuis les événements du magasin ; `scripts/etape46.mjs` ne charge `libelleDuDirect.js` que DANS `--libelles`, qui se fait
  AVANT le sceau — un import dynamique depuis le correctif K11 du 13/11 soir, aucun des quatre dans la fermeture statique de
  ses imports : un correctif qui le casserait ne ferait refuser que `--libelles`, jamais un autre mode ni un chiffre ; l'essai
  de concordance est « K12 » de `directBanc.test.mjs`, celui du chargement « K11 » (correctifs K11 et K12 du 13/11 soir) ;
  l'essai T-X9 ne les relit pas).
- Les modes du banc se lancent depuis le code scellé du bac ou depuis une copie à l'octet de ce code rangée sous
  `banc46\code-scelle` : les sha1 du sceau la vérifient à chaque mode, ses verrous sont ceux de `banc46` (correctif R2 du 13/11
  après-midi, constat 2 du rebanc ; la manœuvre, pas 3d).
- Le tri des rencontres réglables (« attribué », « non réglable », le score de la 90e d'un match prolongé) passe par
  `bench/entrees.js`, hors du sceau ; le score retenu est recontrôlé contre le déroulé par `issuesDuMagasin`
  (`simulationNuit.js`, scellé) : un changement de `entrees.js` ne peut que retirer ou ajouter des rencontres (comptées par
  raison dans l'en-tête de l'export), jamais changer une issue jugée (correctif R11, constat 11 du rebanc ; avec la copie
  gelée du pas 3d, `entrees.js` est figé lui aussi).
- `declarationDuDirect.js` (partie C) : `VARIANTES_DE_L_ETAPE_46` (la liste déclarée, la principale en tête), `VUES_DE_L_ETAPE_46`
  (P5 de 2026-09-24 à la date de l'export, `pour: ['direct']` ; 2023-07-01 → 2026-09-23 pour la table du temps additionnel et
  celle des championnats ; le constat du 11/11 sur « moins de … buts » et « les deux marquent » déclaré « vu », R14 point 4),
  `JUGE`.
- `bench/lancements.js` est GELÉ jusqu'au verdict : l'entrée de la 46 (« direct » à la fin de `PORTEES`, les vues, les
  variantes, le lancement) se fait après le verdict, par ajout pur avec `test/aides/ajouts46.mjs`, AVANT le regard (R18
  point 2) ; le script lit K là.

## 12. Ce qui n'est pas dans ces règles

- Les variantes de continuité (`aligne-1n2`, `strate`) : lot 2, sur des matchs d'APRÈS le regard.
- Le résultat + total et le score exact : non jugés au lot 1 (« non jugé au banc »).
- L'intérieur du temps additionnel, la durée annoncée des arrêts de jeu : lot 2.
- Aucun réglage de la 46 n'est choisi sur les matchs de P5 (P7) : les seules lectures de la base avant le scellement sont
  `--libelles` (des faits sur `live_snapshots`) et `--mesurer-additionnel` (2023-07-01 → 2026-09-23).

## 13. Ce que le code attend au scellement (ajouté par la partie C, le 13/11/2026)

> Ajouté par l'agent « C » : ce n'est pas une règle de plus, c'est ce que le code écrit en partie C (bac seulement) exige au
> scellement. Rien n'y est tranché : O9 à O12 restent à la séance. La manœuvre pas à pas, avec les commandes :
> `SCR46\manoeuvre-scellement-et-passages.md`.

**Les blancs, chacun rempli PAR SCRIPT (jamais à la main), dans cet ordre.**

| Blanc | Où il vit | Rempli par | Tant qu'il est vide |
|---|---|---|---|
| **O10** — la colonne : `'adoptee'` ou `'non-adoptee'` | `server/src/data/direct/declarationDuDirect.js`, entre `// <COLONNE …>` et `// </COLONNE>` | `node scripts/etape46.mjs --fixer-colonne <colonne>` (relit le module ; `--remplacer` pour en changer, AVANT le sceau seulement) | `COLONNE = null` : `--sceller`, `--exporter`, `--comptes`, `--banc`, `--preuve` et `--recopier` refusent « colonne non fixée », rien écrit |
| **O9** — le modèle jugé (grille, rôles de R1 point 2, empreinte adoptée) | pas de blanc à part : `DECLARATIONS[colonne].modele` | la colonne | — |
| K, la liste déclarée (la retenue en tête), z, z des tranches, principal, repli de J4c, T, créneaux (R36 point 1) | pas de blanc à part : `DECLARATIONS[colonne]` (`CRENEAUX_PROPOSES` : 32 points) | la colonne | — |
| Le registre de la mesure (R18 point 2) | `server/src/bench/lancements.js` (GELÉ jusque-là) | `node SCR46\ecriture\registre46\poser-registre-46.mjs poser <colonne> <jour de l'export>` (et `retirer`, `verifier`) | 46 absente : `--sceller`, `--banc` et `--preuve` refusent |
| Le sceau (R18 point 1) | `server/src/data/direct/bancDuDirect.js`, entre `// <SCELLEMENT …>` et `// </SCELLEMENT>` | `node scripts/etape46.mjs --sceller --regles <banc-regles-etape46.md> --documents <f1,f2,…>` | `SCELLEMENT = null` : `--exporter`, `--comptes`, `--banc`, `--preuve` et `--recopier` refusent « pas scellé » |
| **O11** — le regard | pas de blanc : le MODE lancé | `--banc` (sûreté : au moins 600 matchs et moins que T) ; `--preuve` (à T : `--verrou-surete` du regard de sûreté, ou `--sans-surete` pour le regard unique) | le script refuse le regard qui ne correspond pas à la taille de l'export |
| **O12** — l'interrupteur | `server/src/data/direct/noteDuDirect.js` | `--recopier <sortie du passage>` (la note) ; `--note-nulle` (`NOTE_DU_DIRECT = null`) | dans le bac depuis le 13/11 à 0 h 38 : `null` (écrit par `--note-nulle`) ; l'écran et les réponses du serveur sont ceux d'un fichier absent |

**L'interrupteur chez Pierre.** `scripts/etape46.mjs` refuse de tourner sous OneDrive et hors du bac (tous ses modes,
`--note-nulle` compris) : la note s'écrit — ou s'éteint — DANS LE BAC, puis `noteDuDirect.js` se recopie dans le dépôt comme
tout fichier de la liste de déploiement, CôteMaster arrêté, hors d'une passe, puis redémarrage (c'est ainsi que se lit « pour
éteindre » au § 10). La note nulle a toujours le même texte : sha1 `afd11e8baa4497f69f669352648fc7754f683f23`, 1 200 octets.

**Les propositions SANS blanc** sont des constantes du code : `SEUILS` (sûreté 600, F1 1e-5, somme 1e-9, ancre 1e-6, calibration
4 points ET 3 écarts-types, `minMatchsParPaire` 50 — proposition de la partie C, écrite au § 6 —, les matchs hors de F1
tolérés au plus 1 % du passage et 20 matchs — C11, § 6 —, l'identité des lignes tolérée au plus 5 matchs et 0,5 % des matchs
communs — C12, § 5), `JUGE` (`tirages` 2000, `graine` 46,
`minBlocs` 400, 50 pour J5), `CRENEAUX_PROPOSES`, T et les z de chaque colonne. Les changer = modifier `declarationDuDirect.js`
AVANT `--fixer-colonne`, relancer `directBanc.test.mjs`, puis sceller (le sceau prend le sha1 du fichier). De même pour
`varianteAffichee` de `reglagesDirect.js` (P2) : aucun script ne le change ; avec une note, `note.variante` prime (la variante
affichée de la colonne, après J4c) ; sans note, il ne sert qu'au calcul à blanc, jamais montré.

**Ce qui entre dans `SCELLEMENT`** (le sceau = le sha1 du texte JSON de `SCELLEMENT` ; l'export, les comptes, les verrous, les
sorties et la note le citent) :
- `regles` : le nom et le sha1 du document des règles (`--regles`) ;
- `documents` : le nom et le sha1 de chaque document de `--documents` ; les règles doivent citer chacun de ces sha1 dans leur
  texte (sinon refus) — d'où l'ordre : les documents d'abord, les règles en dernier ;
- `modules` : le sha1 de 24 fichiers (chemins relatifs à `server/` ; 28 avant le correctif K3 du 13/11, qui retire l'état,
  la mémoire, le libellé et les entrées du direct — § 11) : `src/data/direct/{reglagesDirect, calculDuDirect, rejeuDuDirect,
  bancDuDirect, declarationDuDirect}.js`, `scripts/etape46.mjs`, `src/data/simulation/{reglages, simulationMatch, entreesSimulation, simulationNuit,
  simulationMatchsEnfant, simulationRead, etatSimulation}.js`, `src/data/calibration.js`, `src/data/db/dayTable.js`,
  `src/bench/{guard, metrics}.js`, et depuis le correctif C2 du 13/11 les sept modules de `core/` qui calculent les chiffres
  jugés (la règle simple du temps restant, la grille « ancien-81 », le modèle de buts…), seulement LISTÉS pour leur sha1 —
  jamais modifiés (le gel de l'essai 27 tient) : `src/core/model/{poisson, dixonColes}.js`, `src/core/engine/{goalModel,
  scorePrediction, noteDuModeleDeButs, motsDuModeleDeButs}.js`, `src/core/market/marginRemoval.js` — `bancDuDirect.js` pris
  « à scellement vide » (son bloc remis à `null` : un fichier ne porte pas son propre sha1) ; `declarationDuDirect.js` pris
  APRÈS `--fixer-colonne` (il porte la colonne). Toute la fermeture des imports de `bancDuDirect`, `rejeuDuDirect`,
  `calculDuDirect` et `declarationDuDirect` est ainsi scellée, sauf `bench/trialsRegistry.js`, `bench/lancements.js`,
  `roadmap/plan.js` et `utils/atomicJson.js` (l'essai C2 de `directBanc.test.mjs` refait la fermeture et l'exige) ;
- sans sha1 : la colonne, la déclaration (K, z, z des tranches, T, créneaux, variantes, affichée, principal, repli de J4c,
  modèle), le juge, les seuils, l'entrée 46 du registre (K, version, `le`, fin de la vue), l'heure du sceau ;
- **pas dans le sceau** : `bench/lancements.js` (reposé à la date du second export pour l'avenant ; K et les variantes y sont
  relus et comparés à la déclaration à chaque mode), `noteDuDirect.js`, `etatDuDirect.js`, `memoireDuDirect.js`,
  `libelleDuDirect.js` et `entreesDuDirect.js` (K3, § 11), `lectureDuDirect.js`, les pièces de `test/fixtures`, les exports
  (cités par les sorties, et par l'avenant du regard de preuve).

**Ce qui rend le script refusant** (code 2, rien écrit, une ligne JSON `{ refus }`) :
- **tous les modes** : zéro ou deux modes ; lancé sous OneDrive ; hors du bac (`CM_BAC_A_SABLE=1`) hors d'une copie d'essai ;
  un réglage d'essai (`CM_ESSAI_…`) hors d'une copie d'essai — une copie d'essai, c'est `CM_TEST_DOSSIER` posé ET le script
  rangé DANS ce dossier (correctif C5 du 13/11 : la variable seule, pointée ailleurs, n'ouvre plus rien), et depuis le
  correctif R4 (13/11 après-midi) ce dossier est une copie `cm-tests-…` d'`isolement.mjs` avec le script à SA place dedans
  (`<dossier>\code\server`) : un dossier parent du script (le bac lui-même, `C:\`) n'ouvre plus rien ; la vraie base ou
  une base hors du bac ; une sortie sous OneDrive, hors du bac ou qui existe déjà (jamais écrasée) ;
- `--fixer-colonne` : colonne inconnue ; déjà scellé ; déjà fixée sur l'autre sans `--remplacer` ; relecture ratée (fichier
  remis) ;
- `poser-registre-46.mjs poser` (et `retirer`, `verifier`) : le texte sans la 46 n'est pas le gel (056f91c1…) — après le
  verdict, si une autre étape a écrit au registre, `--sha1-sans-la-46 <le sha1 affiché par le refus>`, noté au journal
  (correctif R3 du 13/11 après-midi) ; 46 déjà posée (`retirer` d'abord) ;
  colonne inconnue ou autre que celle fixée ; date après aujourd'hui (Paris) ; relecture ratée (fichier remis) ;
- `--sceller` : colonne non fixée ; réglages d'essai ; déjà scellé (un sceau ne se refait pas : `etape46.mjs` refuse tout
  second sceau, l. 896, § 1 point 7) ; règles ou documents absents ;
  deux documents du même nom ; un sha1 de document absent du texte des règles ; registre absent, variantes autres que celles
  de la colonne, vue de la période du banc absente ; un module à sceller introuvable ; relecture ratée (fichier remis) ;
- `--exporter` : colonne ; pas scellé ou un module scellé changé ; colonne du sceau ≠ colonne du code ; `--de` avant le
  2026-09-24 ; `--au` absent ; `--passe` absent ; base sans `simulation_matchs`, `simulation_state` ou `matches` ; aucune nuit
  complète ; passe de Pierre en cours plus de 90 min (`--attente-minutes`) ;
- `--comptes` : colonne ; sceau ; entre 0 h 10 et 2 h 30 (Paris) ; export absent ou sha1 ≠ `--sha1-export` ; code 3 (sortie
  écrite) si l'étalonnage de l'étage 1 est en écart ;
- `--banc` / `--preuve`, AVANT TOUT LE RESTE (correctif C4 du 13/11) : hors d'une copie d'essai, un verrou qui n'est pas
  `banc46\verrou-surete.json` (sûreté, et `--verrou-surete` de la preuve) ou `banc46\verrou-preuve.json` (preuve) ;
- `--banc` / `--preuve`, AVANT le verrou : colonne ; sceau ; registre ; `--k` ≠ K ; entre 0 h 10 et 2 h 30 ; règles ≠ celles
  du sceau ; `--libelles-json` absent, sans règle de R16, ou R16 DÉCLENCHÉE ; sha1 de l'export ; contrôle de l'export
  (colonne, grilles mêlées, grille, une candidate d'une autre empreinte que l'adoptée, versions du moteur mêlées, version du
  moteur inconnue — aucune ligne « service » numérotée, ou une ligne « service » sans version —, sceau, principal de la 28 pas
  rendu) ; export au-delà de la vue du registre ; comptes absents, d'un autre export ou d'un autre sceau, étalonnage de
  l'étage 1 en écart ; moins de 600 matchs ; sûreté à T ou plus ; preuve sous T ; `--passe` absent ; verrou existant sans
  `--rejouer-apres-correction "<raison>"` (ou la raison sans verrou) ; un rejeu sur un AUTRE export que le dernier du verrou
  sans `--autre-export` (ou `--autre-export` sans verrou) ;
- `--preuve` en plus : `--avenant` absent, qui ne cite pas le sha1 et la date de l'export, ou qui est le fichier des règles ;
  `--sans-surete` avec `--verrou-surete` ; verrou de sûreté absent, égal à `--verrou`, d'un autre regard ou d'un autre sceau ;
  même export que la sûreté ; premier export changé ou absent ; identité des LIGNES rompue AU-DELÀ DE LA TOLÉRANCE (plus de 5
  matchs communs, ou plus de 0,5 % d'entre eux, avec une autre ligne : § 5 point 3) ;
- APRÈS le verrou : l'export changé pendant les contrôles (refus, le verrou reste) ; l'étalonnage de l'étage 2 en écart —
  dont des matchs hors de F1 au-delà de 1 % du passage ou de 20 matchs (§ 6) — → code 3, sortie « étalonnage » écrite, RIEN
  jugé, aucune note possible ; une exception en plein passage laisse le verrou posé : la relance passe par
  `--rejouer-apres-correction "<raison>"` ;
- `--recopier` : colonne ; sceau ; sortie absente, pas une sortie du banc ou arrêtée à l'étalonnage ; sortie d'essai hors
  copie d'essai ; colonne ou sceau de la sortie ≠ ceux du code ; une sortie de sûreté sur une note du regard de preuve sans
  `--remplacer` (correctif C9) ; règles du passage changées ou absentes ; avenant de la preuve changé ou absent ; une pièce de
  `test/fixtures` déjà là avec un autre contenu sans `--remplacer` (les règles : jamais remplacées) ; copie ou relecture
  ratée ;
- `--note-nulle` : relecture qui ne redonne pas `null`.
