# Bac à sable officiel de CôteMaster

Étape 2 du plan. Le bac à sable est l'endroit où chaque étape se construit et
s'essaie **sans jamais toucher l'appli de Pierre** : ni sa base, ni ses données
d'exécution, ni son code tant que les changements ne sont pas recopiés, ni ses
ports, ni son quota Claude, ni ses API payantes.

## Où il vit

```
C:\Users\PC\CoteMaster\
  match-stats.db (+ -wal, -shm)   LA VRAIE BASE : le bac ne l'ouvre jamais
  sauvegardes\                    copies VACUUM INTO (backup-db.mjs)
  bac-a-sable\                    LE BAC (hors OneDrive)
    code\server\                  copie du serveur
      node_modules                JONCTION vers ProjetBot\server\node_modules
      data\runtime\               ses propres données d'exécution (copiées)
    code\ui\                      copie de l'interface
      node_modules                JONCTION vers ProjetBot\ui\node_modules
      .vite-cache\                cache de Vite du bac (pas celui du dépôt)
    base\match-stats.db           copie de la base
    manifeste.json                sha1 de chaque fichier source copié + date
    recopies\<date>\              ce que sandbox-apply a remplacé dans le dépôt
    changements-abandonnes\       ce que --abandonner-changements a mis de côté
    compteur-ia.json              (étape 41) analyses IA réelles consommées
    pistes\<nom>\                 bac d'une piste parallèle, même disposition
```

Ce qui n'est **jamais** copié : `node_modules`, `dist`, tout `.env` (sauf
`.env.example`), `ai-config.json`, l'ancien miroir JSON
`server/data/runtime/match-stats/` (1,5 Go, plus lu par l'API depuis le
22/09/2026), le brut FlashScore, les tampons `_tmp-*`, `server/data/backups/`,
le verrou d'actualisation et les fichiers temporaires. Liste exacte :
`server/scripts/sandbox-commun.mjs`.

Deux classes de fichiers :

- **source** : tout sauf `server/data`. Empreinte au manifeste ; c'est ce que
  `sandbox-diff` compare et ce que `sandbox-apply` recopie.
- **donnée** : `server/data` (runtime, fixtures). Copiée pour que le bac tourne
  sur des données réelles, le bac y écrit librement, **jamais recopiée** vers
  le dépôt. Re-préparer la remet à l'état de l'appli.

## Pourquoi il ne peut pas toucher la vraie base

1. **Sa base est une copie** faite par `backup-db.mjs` (VACUUM INTO, base
   ouverte en lecture seule, prévue pour tourner pendant que l'appli écrit ;
   jamais les fichiers `-wal`/`-shm`), ou la copie d'une sauvegarde.
2. **Ses données d'exécution sont les siennes** : tous les chemins de
   `data/runtime` sont relatifs au code, et le code tourne depuis le bac.
3. **Le garde-fou** (`server/src/config/bacASable.js`), actif dès que
   `CM_BAC_A_SABLE=1` est posé **ou** que le code tourne depuis le dossier du
   bac (même lancé sans la variable) :
   - au démarrage du serveur (`config/demarrageBac.js`, premier import de
     `server.js`, avant toute lecture d'environnement ou ouverture de base) :
     refus immédiat si la base est la vraie base, n'est pas dans le bac,
     en sort par une jonction, en est un lien physique, n'existe pas, ou si
     le code tourne hors du bac ;
   - dans `resolveDbPath()` et `openDb()` (`matchStatsDb.js`) : même contrôle
     pour tout point d'entrée, scripts compris ; sans `MATCH_STATS_DB`, un
     script lancé depuis la copie prend la base du bac, jamais la vraie ;
   - dans l'environnement du processus (`env.js`) : clés des API payantes,
     jeton Claude et toute variable qui y ressemble vidés (y compris
     `ANTHROPIC_BASE_URL` hérité d'une session Claude Code), exécutable Claude
     remplacé par un chemin inexistant, analyses IA automatiques coupées,
     actualisation automatique et cotes gratuites coupées ;
   - aux deux points de passage de l'IA (`claudeCodeClient.js`,
     `anthropicClient.js`) : refus avant tout appel.
   Hors de ces deux cas, **rien ne change** : le serveur de Pierre n'est pas
   concerné.
4. **Preuve** : `node --test test/bacASable.test.mjs` (depuis `code\server`,
   14 vérifications, sans serveur ni ouverture de base). Message réel de refus :
   `[bac à sable] DÉMARRAGE REFUSÉ — base refusée : C:\Users\PC\CoteMaster\match-stats.db est la VRAIE base de l'appli …`

## Préparer (ou re-préparer) le bac

Depuis le dépôt (`ProjetBot`), jamais depuis la copie :

```
node server/scripts/sandbox-prepare.mjs
```

| Option | Effet |
|---|---|
| *(aucune)* | copie neuve de la vraie base par `backup-db.mjs` (≈ 1 min 20 pour 1,7 Go) |
| `--depuis-sauvegarde` | base = la dernière sauvegarde de `CoteMaster\sauvegardes` (copie + `quick_check`) |
| `--garder-base` | ne touche pas à la base du bac, recopie seulement le code et les données |
| `--abandonner-changements` | re-prépare même avec des changements non recopiés, après les avoir mis de côté |
| `--piste <nom>` | bac d'une piste parallèle : `bac-a-sable\pistes\<nom>` |

Ce que fait la préparation : refuse si le bac a des changements de code non
recopiés ; refuse si sa base est ouverte (serveur du bac lancé) ; vérifie qu'il
reste **2 × la taille de la base + 2 Go** ; copie la base à côté
(`base\nouvelle\`), puis recopie code et données **en miroir** (ce qui a disparu
du dépôt disparaît du bac), pose les jonctions `node_modules` (`cmd /c mklink
/J`), remplace l'ancienne copie (et son journal — ceux du bac seulement), écrit
le manifeste. Rythme prévu : une fois par semaine. Première préparation : le
05/10/2026, 1 min 24 s, base de 1 684 Mo, 60 200 rencontres.

## Lancer

Avec les outils d'aperçu (configurations de `.claude/launch.json`) :

1. `preview_start cotemaster-bac-serveur` — API du bac sur **http://localhost:4600**
2. `preview_start cotemaster-bac-interface` — interface du bac sur **http://localhost:5600**

Le journal du serveur commence par `[bac à sable] MODE BAC À SABLE — base :
…\bac-a-sable\base\match-stats.db`. Sans cette ligne, ce n'est pas le bac.

Rallumer pour un essai (dans la ligne de commande de la configuration) :
`set CM_BAC_ACTUALISATION=1&&` rallume l'actualisation automatique (et les
compositions) ; `set CM_BAC_COTES_GRATUITES=1&&` les cotes gratuites, qui ne
tournent qu'avec l'actualisation. Les analyses IA restent coupées.

## Arrêter

`preview_stop` sur les deux serveurs du bac. **Jamais** les processus de
l'appli de Pierre (ports 4000 et 5173). Ne pas lancer l'interface du bac par
une commande à part qu'on couperait ensuite : couper le `cmd` parent laisse
Vite orphelin sur le port 5600 (vécu le 05/10/2026). La base du bac doit être
fermée (serveur du bac arrêté) avant de re-préparer.

## Recopier les changements dans le dépôt

```
node server/scripts/sandbox-diff.mjs              liste modifiés / ajoutés / supprimés, signale les CONFLITS
node server/scripts/sandbox-apply.mjs             essai : montre ce qui serait fait, n'écrit RIEN
node server/scripts/sandbox-apply.mjs --appliquer recopie
```

- Seuls les fichiers **source** changés passent ; jamais `server/data` (donc
  jamais `data/runtime`), jamais un `.env` ni `ai-config.json`, jamais
  `node_modules` : chaque chemin est re-contrôlé avant d'écrire.
- **Conflit** = le même fichier a aussi changé dans le dépôt depuis la
  préparation. `--appliquer` refuse tant qu'il en reste ; on reporte à la main
  jusqu'à ce que `sandbox-diff` ne le signale plus.
- `--appliquer` refuse aussi pendant une passe d'actualisation ou un import de
  l'appli (état « en cours » ou verrou d'un processus vivant) si des fichiers
  serveur sont en jeu.
- Avant d'écrire, la version du dépôt de chaque fichier touché est gardée dans
  `recopies\<date>\avant\` avec `journal.json` (retour arrière à la main). Le
  manifeste est ensuite mis à jour.
- Le code serveur recopié ne prend effet qu'au **redémarrage de l'appli par
  Pierre** (`demarrer-cotemaster.bat`), hors d'une passe d'actualisation ;
  l'interface de Pierre se recharge d'elle-même.

## Pistes parallèles

Chaque piste a **son propre bac** : sa copie du code **et** sa copie de la base
(`--piste <nom>`), ses propres ports (une paire de configurations à ajouter à
`launch.json`, autre que 4000/5173, 4001/5174, 4300/5190, 4600/5600). Une piste
sans bac à elle **ne modifie aucun fichier serveur** pendant un import ou un
calcul complet de la piste principale (règle WAL : trois incidents en
septembre 2026). Deux serveurs ne s'ouvrent jamais sur la même copie de base.
Les étapes qui ajoutent une ligne au tableau `ETAPES` de
`matchStatsAutoRefresh.js` se recopient une à la fois.

## Supprimer le bac (ou une piste)

Arrêter d'abord tout serveur et toute interface du bac. Puis **retirer les
jonctions avant toute suppression** — une suppression récursive à travers une
jonction viderait les `node_modules` du dépôt :

```
cmd /c rmdir C:\Users\PC\CoteMaster\bac-a-sable\code\server\node_modules
cmd /c rmdir C:\Users\PC\CoteMaster\bac-a-sable\code\ui\node_modules
```

Vérifier qu'elles ont disparu (et que `ProjetBot\server\node_modules` et
`ProjetBot\ui\node_modules` sont intacts), puis seulement supprimer le dossier.

## Autorisation comptée d'analyses IA (prévue, pas branchée)

Les étapes 41 à 44 (et le résumé mensuel de la 26) se jugent sur de vraies
analyses faites dans le bac : environ 10 à 15 appels (~250 000 tokens). La
place est prête dans `bacASable.js` : `CM_BAC_IA_MAX=12` donnerait au plus 12
appels Claude réels sur la vie du bac, comptés dans `bac-a-sable\compteur-ia.json`
(hors de `code\`, gardé quand on re-prépare). Aujourd'hui
`IA_COMPTEE_BRANCHEE = false` : toute analyse est refusée, et il n'y a pas de
jeton dans le bac. **Son branchement (comment le jeton arrive, quel budget —
étape 4) se décide avec Pierre à l'étape 41.**

## Interdits

- `npm install` dans le bac : il écrirait dans les `node_modules` du dépôt.
- Copier `server/.env` ou `ai-config.json` dans le bac (le garde-fou viderait
  les clés quand même, mais elles n'ont rien à y faire).
- Ouvrir la vraie base depuis le bac, même en lecture ; copier ses `-wal`/`-shm`.
- Les anciennes configurations `cotemaster-server-test` / `cotemaster-ui-test`,
  qui ouvraient la vraie base : retirées de `launch.json` le 05/10/2026.

## État au 05/10/2026

Le garde-fou n'existe encore **que dans la copie du bac** ; il sera recopié dans
le dépôt en fin de semaine (`sandbox-apply --appliquer`). Fichiers concernés :
`server/src/config/bacASable.js` et `server/src/config/demarrageBac.js`
(nouveaux), `server/src/server.js`, `server/src/config/env.js`,
`server/src/data/db/matchStatsDb.js`, `server/src/core/ai/claudeCodeClient.js`,
`server/src/core/ai/anthropicClient.js`, `ui/vite.config.js` (cache de Vite
dans le bac quand `node_modules` est une jonction) et
`server/test/bacASable.test.mjs` (nouveau). Tant qu'ils ne sont pas recopiés,
`sandbox-prepare` refuse de re-préparer le bac (c'est voulu).


## Lot 1 du plan, construit dans le bac les 05-06/10/2026

Les tests et leur mode d'emploi sont dans [docs/tests.md](tests.md) (copie de code/TESTS.md du bac) : `npm test` depuis server/, 145 tests (143 + 2 constats TODO connus), ~20 s.

### Copie hors disque (complément de l'étape 1)
La copie hebdomadaire hors du disque part vers la destination choisie dans Réglages › Sauvegardes : « OneDrive (en ligne) », « Clé USB ou autre dossier » ou « Aucune », enregistrée dans `server/data/runtime/sauvegarde-hors-disque.json`. Ordre : choix enregistré, sinon `CM_SAUVEGARDE_HORS_DISQUE`, sinon OneDrive s'il est détecté (`OneDriveConsumer` puis `OneDrive`), sinon rien (`server/src/data/sauvegardes/destinationHorsDisque.js`). OneDrive : `%OneDrive%\CoteMaster-sauvegardes`, une copie ; dossier ou clé : deux copies, dossier jamais créé, place vérifiée. Dans le bac, le vrai OneDrive est refusé comme toute écriture hors du bac ; pour un essai : `set CM_TEST_ONEDRIVE=<dossier du bac>&&`.

### Étape E — les enregistreurs
Gardés sans token Claude ni appel payant : absents du jour (`unavailable_reads`, `unavailable_daily`) ; matchs en direct (`jobs/liveWatch.js` : liste du jour au plus une fois par minute, partagée par un cache d'une minute dans `fetchMatchesByDate` ; détail d'un match au plus toutes les 5 min, 6 par minute au plus ; rotation favoris → pronostics → moteur → autres ; arrêt 30 min et alerte après 5 erreurs FotMob) → `live_snapshots` ; chaque cote payante relevée (`odds_events` / `odds_quotes`, source « odds-api », écartée des écrans des cotes gratuites) ; pronostics du moteur gelés chaque nuit (étape « gelPronostics ») et à chaque analyse automatique → `engine_picks` (version 1 = première valeur, jamais réécrite). État : `recorder_counts`, `recorder_state`, carte « Enregistreurs » (`GET /api/recorders`). Les enregistreurs n'écrivent jamais pendant un import ni une passe d'actualisation (file d'attente, tranches). Dans le bac, ils sont coupés avec l'actualisation (essai : `set CM_BAC_ACTUALISATION=1&&`). `ENREGISTREURS=false` les coupe, `ENREGISTREURS_DIRECT=false` coupe le direct seul.

### Étape 4 — budget Claude
Journal de chaque appel Claude au point de passage (`callClaudeCode`, `callAnthropicMessages`) dans `server/data/runtime/journal-claude/AAAA-MM-JJ.json` (+ `.api-anthropic.json`) ; réglage dans `server/data/runtime/budget-claude.json` (`GET /api/claude-budget`, `PUT /api/claude-budget/reglage`). Provisoire tant que Pierre n'a pas confirmé : 1 200 000 tokens par jour, 6 000 000 par semaine ; mode économe à 80 % du budget de l'APPLI (jamais le % de l'abonnement). Dans le bac, aucun appel ne part : le journal reste vide. Les tests simulent la réponse du CLI (`test/aides/claudeSimule.mjs`). Le jour de la relance, la carte signale un écart compteur/journal : normal, il disparaît le lendemain.

### Étape 5 — feuille de route
Page « Feuille de route » (`/feuille-de-route`, section rose). Le plan (9 lots, 49 entrées) et l'historique des étapes terminées sont dans le CODE (`server/src/data/roadmap/plan.js`, `historique.js`) ; seules les notes de Pierre sont des données d'exécution (`server/data/runtime/roadmap.json`). `GET /api/roadmap` (lecture seule), `PUT /api/roadmap/etapes/:id/note` (idempotent). À la fin de chaque étape : ajouter UNE ligne à `HISTORIQUE` (date, ce qui a changé, ce qui a été mesuré, résultat de `npm test`), puis relancer `npm test`.


## Lot 2 du plan (design des paris), construit dans le bac le 06/10/2026

Tests : `npm test` depuis server/, 366 tests (364 + 2 constats TODO connus), ~60 s. Détail dans [docs/tests.md](tests.md).

### Étapes 6 à 9 (résumé)
- **6 — langage visuel des paris** : `ui/src/utils/langageParis.js` + composants communs ValueBadge, ConfidenceGauge (créée ici, réutilisée par l’étape 40), OddsMoveArrow, LineupStateBadge, KickoffCountdown, ProvenanceChip, HelpTip ; vert = value jouable seulement.
- **7 — cotes de vos bookmakers** : fraîcheur (`core/engine/fraicheurCotes.js`, « à rafraîchir »), conseil de relevé payant (information seulement), saisie express (source « saisie ») ; 37 compétitions suivies = jusqu’à 37 crédits par clic « Actualiser ».
- **8 — opportunités du jour** : `core/engine/verdictPari.js` = une seule source de verdict ; onglet Opportunités de Matchs ; notifications Windows (désactivées par défaut) ; « Meilleures chances » en binomiale négative du moteur, `ui/src/utils/shotsModel.js` supprimé.
- **9 — page du match pour décider** : Résumé dans l’ordre verdict → pourquoi (étape 40) → compos → courbe des cotes → IA → détail ; 8 onglets gardés.

### Étape 10 — comparateur de vos bookmakers et ticket « J'ai parié »
Sur la page d'un match à venir, dans la carte du verdict, sous le tableau des marchés : le **comparateur** (`ui/src/components/betting/BookmakerComparator.vue`, assemblage pur `ui/src/utils/comparateur.js`). Un tableau par marché, une ligne par issue, une colonne par bookmaker qui a une cote — le relevé The Odds API pour le 1 / N / 2, les cotes saisies à la main pour les autres marchés —, l'heure de chaque cote, la pastille de value et, au bout de chaque ligne, la **cote minimale à prendre** (et la maximale, au-delà de laquelle elle serait trop belle). Tout est calculé par le serveur, dans l'analyse du match (`comparateur`, `comparateurDuMatch` de `server/src/core/engine/verdictPari.js`) et dans les saisies (`bornes`) : la case d'un bookmaker = `findValueBet` appliqué à ce seul bookmaker + la décision du moteur ; vert ⇔ le moteur conseille l'issue ET ce prix est une value fraîche chez ce bookmaker (la case du pari du moteur est « pari du moteur » ; une autre case verte de la même issue est le même pari, moins bien payé). Les bornes : `server/src/core/engine/coteMinimale.js`, la règle exacte au centième (1 / N / 2 : celle de `findValueBet`, virgule flottante comprise ; autres marchés : `verdictValue` sur l'avantage arrondi au centième). Les cotes de référence (Pinnacle, Betclic, cotes gratuites) sont à part, « référence, non jouable ».

Le **ticket** : un seul composant (`ui/src/components/betting/TicketDuPari.vue`, règles `ui/src/utils/ticket.js`), sous le comparateur et dans le bordereau de Mes paris — simple, combiné de plusieurs matchs (produit des cotes), combiné du même match (la cote du bookmaker est à taper ; « Combiner les paris d'un même match » est désactivé par défaut : un seul pari par match, comme avant). Aucun prix juste ni gain attendu pour un combiné (étape 28). **« J'ai parié »** (`POST /api/bets`, au clic seulement) ajoute au format d'avant, sur chaque sélection : `bookmaker`, `bookmakerTitle`, `probabiliteMoteur` (au moment du pari), `probabiliteSource`, `probabiliteLueA`, `coteReleveeA`, `coteSource` (`the-odds-api`, `saisie` ou `au-pari`) ; sur le pari : `nature`, `bookmaker`, `bookmakerTitle`, `origine` et, pour un combiné, `cotePrise` (+ `produitDesCotes`). Un champ absent n'est pas écrit : les anciens paris restent lus tels quels (« non noté »). Le gain attendu (pari simple) est calculé à la lecture (`gainAttendu` de `GET /api/bets`), jamais écrit ; la valeur de clôture des paris porte le bookmaker et la probabilité du moment. Corrigé en route : la pastille d'une cote saisie et le verdict du serveur lisent le même avantage, arrondi au centième (avant, à quelques millièmes du seuil, ils pouvaient se contredire).


### Étape 11 — suivi des paris, garde-fous, comptes bookmakers
**Performance paris** (onglet de Historique moteur, `ui/src/views/BetsPerformanceView.vue`) lit `GET /api/bets/suivi` (lecture seule, `server/src/data/suiviParis.js`) et ajoute, sans rien retirer des blocs d'avant : le **gain réel** du carnet (la règle de `betsStore` : gagné = mise × cote − mise, perdu = − mise ; la somme retombe sur le profit net du carnet) face au **gain attendu** au moment du pari, mise × (probabilité du moteur × cote prise − 1) (`gainAttenduDuPari`) — seulement pour les paris simples qui ont leur probabilité du moment (« J'ai parié », étape 10 ; la page dit combien l'ont : 0 sur 91 dans la copie du carnet au 06/10), comparés SUR LES MÊMES PARIS, avec l'écart-type que donne le hasard ; les **courbes** dans le temps (paris réglés dans l'ordre où ils se sont réglés : gagné du carnet, gagné et attendu des paris qui ont leur probabilité) ; la **valeur de clôture de chaque pari** (`closingValue.js`, qui garde maintenant toutes ses mesures dans une propriété non rendue par sa route) ; les **résultats par marché, championnat, bookmaker, tranche de cote et confiance** (pas encore mesurée, étape 38) — chaque pari dans une seule ligne, lignes fixes même vides, **total** (Σ, jamais une somme de pourcentages) et **moyenne par pari** (⌀) ; le carnet pari par pari ; la **zone normale des séries de pertes** (`server/src/core/risk/seriesDePertes.js` : calcul EXACT, par programmation dynamique, de la loi de la plus longue série de pertes avec la probabilité de gagner de chaque pari — celle du moteur, sinon 1 / cote ; « série de pertes normale jusqu'à N » = ce que le hasard ne dépasse pas 95 fois sur 100).

**Les garde-fous de Pierre** (`server/src/core/risk/gardeFous.js`, réglage `server/data/runtime/garde-fous.json`, `GET`/`PUT /api/config/garde-fous`, idempotent) : **mise maximale par pari** et **perte maximale par semaine** (lundi → dimanche, jours de Paris ; perte nette des paris réglés dans la semaine, mises en attente comprises), **AUCUN par défaut** (fichier absent = aucun plafond). Ils s'appuient sur le **coupe-circuit existant** (`server/src/core/engine/tiltState.js`), sans le doubler : `getTiltState()` rend l'état effectif (l'interrupteur manuel, OU la perte maximale atteinte / engagée, OU un réglage ou un carnet illisible alors qu'un plafond doit être vérifié) et le plafond du conseil ; la décision de pari unique (`verdictPari.stakingDuMatch`) passe par `plafonnerLeConseil` : la mise conseillée ne dépasse jamais un plafond (`misePlafonnee` le dit), et un coupe-circuit enclenché dit pourquoi (`coupeCircuit`). Ils ne bloquent JAMAIS l'enregistrement d'un pari : `POST /api/bets` écrit d'abord, puis renvoie ses `alertes` (mise maximale, mise acceptée, solde, compte fermé ou limité, perte de la semaine) — jamais écrites dans le carnet, `GET /api/bets` inchangé. Alertes : en haut de l'appli (puce « Garde-fou », champ `gardeFous` de `GET /api/refresh`, calculé à la lecture), dans Performance paris, dans Réglages et dans le ticket (`ui/src/utils/gardeFous.js`, les phrases du serveur mot pour mot). Réglages › Gestion du risque : `RiskControlPanel` (l'interrupteur manuel reste le sien, le garde-fou qui l'enclenche est dit) et `GardeFousPanel` dessous.

**Une fiche par compte bookmaker** (`server/data/runtime/comptes-bookmakers.json`, `GET /api/bookmaker-accounts`, `PUT /api/bookmaker-accounts/:cle`, carte « Comptes bookmakers » de Réglages, `BookmakerAccountsPanel`) : solde déclaré, mise maximale acceptée connue, limitation (aucune / limité / fermé), date de mise à jour posée par l'appli. **Jamais d'identifiant, de mot de passe ni de note libre** : tout autre champ est refusé (400, rien d'écrit) ; un champ ajouté à la main dans le fichier n'est jamais rendu et s'efface à l'écriture suivante ; un fichier illisible n'est jamais pris pour vide ni écrasé (503). La fiche sert à signaler un pari au-delà de la mise acceptée (ticket, réponse de « J'ai parié », carnet de Performance paris), jamais à le refuser ni à agir sur le compte.

Après la recopie et la relance : aucun plafond n'est réglé, rien ne change pour le moteur tant que Pierre n'en fixe pas ; la page Performance paris montre le suivi dès la relance (avant, une page sans suivi dit « le serveur n'est pas à jour » et garde ses tableaux vides). Les tests : `server/test/suiviParis.test.mjs` (19) et `server/test/suiviParisEcran.test.mjs` (10) — voir docs/tests.md. `npm test` : 343 tests, 341 réussis + 2 constats, ~49 s.


### Étape 41 — analyse IA de chaque match, compacte
**Ce qu'on envoie à l'IA** pour l'analyse d'avant-match et pour la revue d'après-match devient une **fiche compacte** (`server/src/core/ai/compactContext.js`, fonctions pures) au lieu de gros blocs JSON : en tête la rencontre, la compétition, le coup d'envoi et le moment de l'analyse ; le moteur en quelques lignes (buts attendus, 1N2 juste et du marché, edge, mise et cotes jugées, attendus de corners et de tirs) ; **les pronostics du moteur à cote juste d'au moins 1,20** (`marchesPourIA`, plancher `COTE_MINIMALE`) en un tableau `market | predictedLabel | probability | cote juste`, un par ligne dans l'ordre du moteur ; classement, forme et moyennes (« produit / concédé ») en lignes courtes ; les **compositions réduites à l'essentiel** : onze (poste abrégé, joués/titularisations, buts+passes, xG, note), banc qui a compté (la règle d'avant), titulaires habituels absents (avec motif et retour), absents annoncés — ceux qui ont joué cette saison d'abord, avec leurs chiffres (`lineupContext.js` lit maintenant le poste et les chiffres de chaque absent par son identifiant FotMob, jamais l'identifiant 0), chacun écrit une seule fois (rapprochés par identifiant, sinon par le nom ; une graphie différente de FotMob est écrite à côté) ; les actualités que la composition ne dit pas (changement d'entraîneur, absents qu'elle n'a pas) ; la note de Pierre ; les sources secondaires d'une équipe inconnue du magasin ; l'expérience de l'IA (comptes par type de marché, leçons avec le repère de leur match). Revue : la lecture d'avant-match, le moteur de ce moment-là, chaque marché joué avec son issue, l'avis d'avant-match, son explication et son raisonnement, les avis restés sans marché, les faits du match.

**Rien d'utile n'est perdu** : chaque valeur de l'ancien message se retrouve dans la fiche, sauf les champs déclarés non recopiés (`NON_RECOPIES`, `NON_RECOPIES_REVUE`, chacun avec sa raison : identifiants internes, codes d'issue, plancher de cote constant, image du club…) ; un champ de forme inconnue n'est jamais jeté (ligne « clé valeur »). Vérifié sur les 47 vraies analyses d'avant-match et les 31 vraies revues de la copie du bac (02-05/10) : 0 valeur manquante. **Le rattachement des avis** (`rattacherAuxMarches`, déplacé dans `compactContext.js`) : par libellé (tiret, accents, casse près), puis libellé sans numéro de ligne ni ponctuation, puis position — seulement un avis encore libre dont le libellé ne désigne pas un AUTRE marché (avant, un doublon pouvait prendre la place d'un avis manquant) —, puis pronostic recopié ; jamais un avis pour deux marchés.

**Consignes FIXES** (`CONSIGNES_AVANT_MATCH`, `CONSIGNES_APRES_MATCH` dans `matchAiAnalysisPrompt.js`) : plus rien de propre au match (le nom des équipes et la compétition sont passés dans la fiche), identiques à chaque appel, donc relues depuis la mémoire cache de Claude au lieu d'être réécrites (les reprises du 03-04/10 montrent la lecture en cache de 4 907 à 4 916 tokens = schéma 1 701 + consignes ~3 210). Toutes les règles d'avant y sont (un test les liste). La phrase finale ne nomme plus l'outil `submit_pre_match_analysis` de l'API à la clé, que Claude Code ne connaît pas (il ne reçoit que le schéma) : « Réponds exclusivement par la sortie structurée demandée ». **Schémas de sortie inchangés**, champ pour champ et dans l'ordre ; même modèle (`sonnet`, effort `low`), même plafond de 150.

**Le drapeau « compactage » de l'étape 4 est branché** (`claudeBudget.politiqueBudget`) : la fiche compacte est la forme NORMALE, en mode normal comme en mode économe. **L'ancienne forme reste disponible** : `AI_ANALYSIS_FICHE=ancienne` dans `server/.env` (documenté dans `server/.env.example`), puis relancer — pour comparer, ou revenir en arrière si la qualité des avis baissait ; un appel peut aussi la demander (paramètre `fiche` de `runPreMatchAnalysis` / `runPostMatchAnalysis`). L'**essai sans mise en cache** reste prévu, pas activé. Chaque appel note au **journal des appels Claude** sa forme (`fiche`) et la taille de ce qui est parti (`taille.consignes`, `taille.message`, en caractères) ; chaque analyse et chaque revue enregistrent leur `fiche`. Nouvelles fonctions sans appel : `preparerAnalyseAvantMatch`, `preparerRevueApresMatch` (ce qu'on enverrait, pour les essais et l'estimation).

**Réglages › Budget Claude** : un bloc « Fiche envoyée à l'IA et coût moyen d'une analyse » — la forme en vigueur, l'essai sans cache (prévu), et pour l'avant-match et la revue : la référence mesurée le 04/10 (24 400 et 10 800), l'objectif (17 000 et 7 000), le coût moyen par appel de la semaine en **ancienne fiche** (appels d'avant l'étape 41 compris) et en **fiche compacte**, lu dans le journal (`coutMoyenParForme`, échecs compris quand leurs tokens sont connus). La règle « compacter » n'est plus listée parmi les règles du mode économe.

**Estimation hors ligne** (aucun appel à Claude ; base = copie de la copie du bac, réseau coupé ; scripts de la session, non livrés) : sur les 47 vraies analyses d'avant-match des 02-05/10, le message du match passe de 24 306 à 13 423 caractères en moyenne (−45 %), consignes 7 480 → 6 612 ; sur les 31 revues, 15 190 → 8 459 (−44 %). En tokens, ESTIMÉS en partant des tokens mesurés de ces mêmes appels (caractères par token calés sur ces appels : consignes 2,33, message 1,92) : avant-match ≈ 24 264 → ≈ 17 461 en moyenne (≈ 15 107 pour un appel en un seul tour ; 6 appels sur 47 ont pris deux tours, ~45 000 tokens chacun), revue ≈ 13 078 → ≈ 9 680 (≈ 9 270 en un tour) — objectifs du plan 17 000 et 7 000 : l'avant-match est autour de l'objectif, la revue au-dessus (la sortie, ~3 000 tokens, et le schéma, 1 036, ne changent pas ; le reste est le texte de l'IA elle-même, gardé en entier). NB : la référence de 10 800 du 04/10 mêlait des revues d'anciennes analyses à 6 marchés ; sur les revues d'analyses à 14-15 marchés, la moyenne mesurée est 13 078.

**À vérifier en vrai après la mise en service** : le journal des appels Claude (carte « Budget Claude ») — tokens moyens par forme sur une dizaine de vraies analyses ; la lecture en cache des consignes (lecture en cache ≈ schéma + consignes dès le 2e appel de l'heure) ; la part d'appels en deux tours (« entrée » à 4 au lieu de 2) ; la qualité des avis (onglet Analyse IA, puis le carnet de l'étape 21 avant tout changement de modèle).

Tests : `server/test/ficheCompacte.test.mjs` (21) et `ficheCompacteEcran.test.mjs` (2), avec `test/aides/ficheSansPerte.mjs`, `script-fiche-compacte.mjs`, `script-fiche-reglage.mjs`, `script-fiche-absents.mjs`, `script-fiche-etat.mjs` et la référence `test/fixtures/fiche-ia-etape-41.json` (181 Ko, produite par le code d'AVANT l'étape : ne pas la regénérer) ; `budgetClaude.test.mjs` retouché pour le drapeau branché. `npm test` : 366 tests, 364 réussis + 2 constats, 0 échec, ~56 s ; 74 bugs volontaires, tous détectés au passage final (71 sur 72 au premier : un trou des tests du rattachement, comblé). Détail dans `docs/tests.md` (copie de `code/TESTS.md`).


## Lot 3 du plan (données) et étapes 16 et 43, construits dans le bac les 06-07/10/2026

Tests : `npm test` depuis server/, 537 tests (535 + 2 constats TODO connus), ~85 s. Détail dans [docs/tests.md](tests.md).

### Étape 12 — contrôles des données et carnet de santé
Un contrôle passe le magasin en revue et ne **corrige jamais** rien. Il écrit des anomalies et un carnet de santé dans `server/data/runtime/carnet-sante.json`, que lit la carte « Carnet de santé des données » de Réglages (`GET /api/match-stats/health`). Logique : `server/src/data/db/dataHealth.js`, base ouverte en lecture seule. Six familles : doublons, mauvaise compétition, manquants, chiffres impossibles, zéros « non relevé » (`ZERO_MEANS_ABSENT`, déplacée dans `db/columns.js`), clubs et joueurs mal identifiés. Le carnet : part des matchs qui ont leurs xG, tirs, corners, cartons, joueurs et compositions, par championnat et saison.

Chaque nuit, l'étape « Contrôles et carnet de santé des données » (`carnetSante`, dans `matchStatsAutoRefresh.js`, après le contrôle des scores) lance `node scripts/data-health.mjs --dans-la-passe` dans un processus à part, sans prendre le verrou. Elle ne relit que les rencontres modifiées depuis le dernier contrôle. Au-delà de 1 000 rencontres modifiées, sans carnet ou avec un carnet d'une autre version : contrôle complet.

**À la main**, depuis `server/`, jamais pendant un import (sans verrou libre, le script ne fait rien) :
- `node scripts/data-health.mjs` : passe de nuit ;
- `node scripts/data-health.mjs --complet` : tout le magasin, ~80 s ;
- `node scripts/data-health.mjs --complet --calendrier-fotmob` : plus les pages de compétition FotMob de toutes les saisons (~340 requêtes gratuites ; sans l'option, aucun réseau) ;
- `--sans-ecrire` : sans écrire le carnet.

### Étape 13 — historique football-data depuis 2000, données de référence
Les CSV gratuits de football-data.co.uk depuis 2000-01 (22 divisions européennes ; 16 fichiers par pays depuis 2012, clôture 1X2 seulement) : **605 fichiers**. Une ligne par match dans `fd_history` (`server/src/data/db/matchStatsDb.js`) : scores, tirs, corners, cartons, arbitre, cotes en centièmes (marché, Pinnacle, Bet365, William Hill ; avant-match et clôture ; 1X2, plus/moins 2,5 buts, handicap asiatique), mais ni 1,5 ni 3,5 buts, ni « les deux marquent ». Rien n'entre dans `match_odds`. Le nom football-data → identifiant FotMob vient du **vote** déjà utilisé pour les cotes, jamais d'une ressemblance de nom ; un score différent est gardé (`lien = 2`) pour l'étape 14.

**Un seul écrivain, le serveur** : l'étape « Historique football-data (depuis 2000) » (`historiqueFd`, après les cotes passées) est due à chaque passe tant que l'import n'est pas fini (150 requêtes au plus par passe), puis une fois par jour. Fichiers gardés dans `%USERPROFILE%\CoteMaster\football-data\`. Dans le bac : `node scripts/import-fd-history.mjs` depuis `code\server` (options `--budget N`, `--sans-reseau`, `--reimporter`, `--relier`, `--resume`). Carte « Historique football-data » de Réglages : `GET /api/match-stats/fd-history`.

**Limites** : aucune cote William Hill en 2025-26 ni 2026-27 ; Pinnacle jusqu'en 2025-26 (38 %), puis plus rien.

L'ancien historique (`server/data/fixtures/historique`) n'est plus lu : `historicalMatchesProvider.js` lit `fd_history`. **Données de référence** (`server/src/data/reference/`) : `venues.json` (1 044 clubs ; altitude : liste faite à la main, non vérifiée) et `derbies.json` (74 derbies).

### Étape 15 — repères de chaque championnat
Ce qu'est un match « normal » dans chaque championnat, saison par saison et mois par mois : buts, avantage du terrain, victoires et nuls, plus de 1,5 / 2,5 / 3,5 buts, les deux équipes marquent, corners, tirs, cartons, penalties. Module `server/src/data/db/leagueBenchmarks.js`, table `league_benchmarks`, `GET /api/match-stats/benchmarks?league=…`, bloc « Repères du championnat » de l'onglet « Statistiques ligue ». **Une saison = une seule source**, écrite sur chaque ligne : FotMob si la saison est entière au magasin (commencée depuis janvier 2023), sinon football-data.co.uk (`fd_history`), sans minute des buts ni penalties. Chez FotMob, ne comptent pas : résultat attribué, match annulé ou reporté, hors classement, prolongé ; un 0 des deux côtés est « non relevé ». Pas de repère pour les coupes.

Dispersion et facteur de terrain (corners, tirs, tirs cadrés) : **mesurés seulement**, le moteur garde 1,10 / 0,90 ; l'étape 33 les branchera après le banc d'essai (étape 19). La nuit, l'étape `reperes` (après `historiqueFd`, avant les cotes gratuites ; une fois par jour de Paris ou au clic) ne recalcule que les saisons changées.

### Étape 14 — contrôle quotidien, santé des sources, plan de secours FotMob
**Contrôle quotidien** (`server/src/data/db/dailyChecks.js`) : dernière étape de chaque passe, après la sauvegarde (`controleQuotidien`). Il relit les rencontres des 30 derniers jours et donne un **feu vert, orange ou rouge** en 35 contrôles rapides. Il réutilise les étapes 12, 13 et 15 (`valeursAttendues`) et **constate sans jamais réparer**. Rouge = données impossibles ou contradictoires, FotMob en panne (5 échecs de suite) ou jeton Claude expiré, trouvés depuis moins de 24 h (ensuite « connu », orange) ; orange = à regarder (zéros « non relevé », hors repères — jamais rouge —, identité incomplète).

**Santé des sources** (`server/src/data/sourceHealth.js`) : FotMob, football-data, The Odds API, API-Football, Claude, cotes gratuites, **lues dans ce que l'appli a noté lors de ses vrais appels, jamais un appel de plus**. Pour Claude, la **date d'expiration du jeton est un réglage** (`server/data/runtime/jeton-claude.json`, jamais lu dans `server/.env` ; sans réglage : 30/09/2027 « à confirmer »). Un pronostic touché par un constat porte `aVerifier`, calculé à la lecture : **informatif, le verdict ne change jamais**.

Routes : `GET /api/health/checks`, `GET /api/health/sources`, `PUT /api/health/jeton-claude` (`{ expireLe: 'AAAA-MM-JJ' }`, idempotent). Écran : deux cartes de Réglages, puce du feu en haut, badge « à vérifier ». **Plan de secours FotMob** : `docs/plan-secours-fotmob.md` ; rien ne bascule sans l'accord de Pierre.

### Étape 16 — garde-fou de la mesure (lot 4)
Un juge (`server/src/bench/guard.js`) dit si une nouvelle version des chiffres fait mieux que l'ancienne **au-delà de ce que le hasard explique**. `comparer(lignes, options)` (pur ; l'étape 19 l'appellera) compare des lignes appariées (perte log, gain à mise fixe, valeur de clôture), rééchantillonnées par match, avec une fourchette élargie selon le nombre de variantes essayées. `jugerEtape` ne garde que les matchs postérieurs au lancement et hors des données déjà vues, et répond « retenu », « pas prouvé », « moins bon » ou « pas assez de matchs ».

**Données** : `server/src/bench/lancements.js`, écrit dans le code (les 15 étapes à juger : 26 à 30, 32 à 39, 46, 47, à confirmer avec Pierre ; `LANCEMENTS`, vide à l'étape 16) ; `server/data/runtime/registre-mesure.json`, écrit par le serveur (dates de lancement, variantes, **tous** les jugements). Au démarrage, `enregistrerLancements()` date toute version déclarée absente du registre : **la mise en service est datée au premier démarrage de l'appli de Pierre avec le code de l'étape**.

**À la fin d'une étape qui touche aux chiffres (26, 27, 28…)** : ajouter son entrée à `LANCEMENTS` — `{ etape, version, quoi, le: null, variantes: [{ id, quoi }], vues: [{ de, a, quoi }] }` — avec **toutes** les variantes regardées face à des matchs joués, la retenue comprise. Le jugement final se prend à l'horizon prévu (`principal: true`), pas chaque nuit. **Limite** : `lignesEnginePicks.js` ne voit que la probabilité de l'issue choisie (l'étape 25 devrait geler celles de toutes les issues et le numéro de version du moteur).

### Étape 43 — commentaires des matchs : le vrai déroulé dans la revue d'après-match
La revue d'après-match reçoit (`server/src/core/ai/derouleDuMatch.js`) le score, la mi-temps, puis un **déroulé en 10 à 20 lignes courtes** : buts avec le score qui suit, penalties manqués, cartons, remplacements. Ce qu'on ne sait pas est **dit, jamais écrit « aucun »** ; un 0 des deux côtés est « non relevé ». Corrige quatre erreurs de la revue d'avant : penalty, deuxième jaune, « aucun », but contre son camp.

**Lecture FotMob** (`mapEvents`, dans `fotMobProvider.js`) : les matchs lus après la mise en service gagnent `penalty: true`, le type `missedpenalty`, `injured: true`, `reason` et `note` d'un carton. **Les matchs déjà au magasin ne les ont pas et rien n'est redemandé à FotMob** : le déroulé les lit quand même.

**Texte minute par minute** (`server/src/data/providers/fotMobCommentaire.js`) : pas la page du match, mais un fichier du CDN de FotMob, un par langue : `https://data.fotmob.com/webcl/ltc/gsm/<identifiant du match>_<langue>.json.gz` (gratuit, sans clé ; 403 si le fichier n'existe pas). On n'en garde que ce que les événements ne disent pas (décisions VAR, penalties concédés, arrêts de jeu pour blessure, grosses occasions) : **5 lignes de 130 caractères au plus**, seulement si le match a un texte. Lu par la revue (`runPostMatchAnalysis`) ; **toute erreur laisse partir la revue sans cette section**. Une à deux petites requêtes FotMob par revue, non notées dans « Santé des sources ».

**Coût** (estimé hors ligne) : **+702 tokens en moyenne** par revue pour le déroulé seul, +905 à +1 103 avec le texte, au pire ≈ +2 000. L'objectif du plan pour la revue (7 000) est dépassé de ≈ 3 400 ; retirer l'explication des pourcentages ne suffit pas : **Pierre décide**.

### Après la recopie du lot 3
1. Recopier (`sandbox-diff`, puis `sandbox-apply --appliquer`), puis relancer `demarrer-cotemaster.bat` **hors d'une passe d'actualisation**. Étape 43 : rien à réimporter.
2. **AVANT la relance**, copier le dossier `bac-a-sable\base\football-data` (605 fichiers, 66 Mo) vers `%USERPROFILE%\CoteMaster\football-data` : jamais la base ni ses `-wal`/`-shm`. Avec la copie, tout s'importe en une passe (≈ 1 min) ; sans, il faut 4 à 5 passes (≈ 12 à 15 h de serveur allumé).
3. Tables créées à la première ouverture de la base : `fd_history`, `fd_teams`, `fd_fichiers` (13), `league_benchmarks` (15).
4. La première passe fait le **premier contrôle complet du carnet** (~80 s, sans les pages de compétition de toutes les saisons) et le premier contrôle quotidien (rouge dans le bac : Córdoba – Tenerife du 05/10). Les repères se calculent à la première passe de nuit ou au clic « Actualiser » (15 à 20 s ; avant, « Pas encore calculés »).
5. Une fois, à la main, depuis `server/`, hors d'une passe (le script prend le verrou) : `node scripts/data-health.mjs --complet --calendrier-fotmob` (~2 min).
6. **Confirmer la date d'expiration du jeton Claude** (Réglages › Santé des sources ; sans réglage : 30/09/2027 « à confirmer »). Ranger le plan de secours FotMob dans `docs/plan-secours-fotmob.md`.
7. **Vérifier le coût réel des revues** dans le journal des appels Claude (carte « Budget Claude »), sur une dizaine de vraies revues : caractères envoyés (≈ +900 de message, +470 de consignes), tokens moyens, lecture en cache des consignes, `deroule` dans les revues. Replis dans `server/.env`, puis relance : `AI_COMMENTAIRE_MATCH=non` (retire le texte, le déroulé reste) ; `AI_ANALYSIS_FICHE=ancienne` (ancienne forme à l'octet).
8. Étape 16 : rien ne change dans les chiffres ni le moteur ; `registre-mesure.json` n'existe qu'après le premier lancement déclaré (étape 26 ou 27). Regarder le bloc « Preuve après lancement » de la feuille de route à 1280 px et 375 px.
9. À dire à Pierre : constats de l'étape 12 (doublon Copa Chile du 27/09, zéros lettons et vénézuéliens) ; jaunes argentins à 0 chez FotMob depuis janvier 2026. Facultatif : supprimer `server/data/fixtures/historique` si `scripts/csv-to-season-data.mjs` ne sert plus.


### Étape 25 — mise à jour sans risque : le SOCLE des versions du moteur (lot 5, construit dans le bac le 07/10/2026)

**Seule la première moitié de l'étape est faite.** L'étape a été coupée en deux : le socle (ici) n'a besoin ni du banc d'essai (19) ni de la calibration (20). L'adoption d'une candidate « si elle fait mieux » (avec le juge de l'étape 16) et l'alerte de dérive viendront après l'étape 20 : leur place est réservée dans le code (`A_VENIR` de `engineVersions.js`) et annoncée sur la carte, rien n'est branché. Le format de la feuille de route n'a pas d'état « à moitié faite » : la ligne ajoutée à `historique.js` fait passer la 25 à « terminée » ; la seconde moitié sera une ligne de complément (même `etape`, avec un `titre`).

**Ce qui fait une version** (`server/src/core/engine/engineVersions.js`) — deux empreintes, rien d'autre :
- les **réglages effectifs** de chaque sport (`engine-config.json` complété par les valeurs par défaut du code) : sha1 d'une écriture stable (clés triées ; nombres à 12 chiffres significatifs, pour qu'un curseur qui revient à 0,02 retrouve l'état 0,02 ; la liste des bookmakers triée et sans doublon, son ordre ne changeant aucun chiffre) ;
- le **code du moteur** : le sha1 du texte de chaque fichier qui calcule les chiffres ou prépare ses entrées (`MODULES_DU_MOTEUR` : les dossiers `core/engine` — sauf le registre lui-même —, `core/market`, `core/model`, `core/risk`, `core/signals`, `core/xg`, `sports`, et `data/providers/matchEnrichment.js`, `data/db/statInputsRead.js`, `data/db/scoreFormRead.js`, `data/db/matchStatsRead.js`, `data/providers/standingsService.js`), fins de ligne et marque d'ordre des octets normalisées. Le texte plutôt que les constantes exportées : la logique d'une fonction ne s'exporte pas. Un commentaire retouché fait donc une version de plus — voulu : une version de trop ne fausse rien, un changement de chiffres sans nouvelle version fausserait le juge.
Même état = même numéro (revenir à des réglages déjà vus reprend leur numéro). Ne font PAS partie d'une version : les données, et les réglages de risque de Pierre (coupe-circuit, garde-fous, délai de fraîcheur des cotes, comptes bookmakers).

**Où vivent les données.**
- `server/data/runtime/engine-versions.json`, écrit par le SERVEUR seul, toujours par `utils/atomicJson.js` (illisible = jamais pris pour vide ni réécrit ; hors de l'empreinte des données) : les versions (réglages, empreintes, fichiers du code, lancements de l'étape 16 déclarés à ce moment, ce qui a changé), la version en service, la PILE du retour arrière, le journal, la candidate en essai et l'historique des candidates. Écrit : au démarrage (`demarrerVersions`, dans `server.js`, AVANT d'écouter le port, dans un `try` — la toute première fois, la version 1 = l'état du moteur, sans rien changer aux chiffres : `engine-config.json` n'est ni créé ni réécrit ; ensuite, un code ou des réglages changés depuis la dernière fois font une version) ; à chaque enregistrement dans Réglages (`PUT /api/config`, `POST /api/config/reset` : une version avec ce qui a changé, ou le numéro d'un état déjà vu ; registre illisible → 503 et rien d'écrit) ; au retour arrière ; et quand un calcul du moteur, dans le serveur, rencontre des réglages en service jamais notés (fichier modifié à la main). Les autres processus ne font que lire.
- Le **numéro** est posé par `analyzeMatch` (`engineVersion` ; `null` = « sans version ») et gardé avec chaque pronostic : journal des pronostics (`predictions.json`, passé par le scan de Mes paris ; écrit seulement s'il est connu ; un rescan le remplace ou le retire), pronostics gelés (`engine_picks.engine_version`) et `engineSnapshot` des analyses IA — jamais dans ce que lit l'IA (retiré du message de la revue ; l'ancienne fiche revient à l'octet).
- Les **pronostics gelés** gardent aussi la **distribution complète** de leur marché (`engine_picks.distribution`, JSON à 4 décimales : les trois probabilités du 1N2, la ligne et ses deux probabilités d'un plus/moins, les six issues du combiné, l'attendu des corners et des tirs), lue dans les probabilités exactes du moteur (`distributions` du résultat d'`analyzeMatch`, `distributionDuMarche` de `sports/football/markets.js`). Une nouvelle version du moteur, ou une probabilité qui bouge d'un dixième de point ou plus, fait une révision ; la première nuit après la mise en service, chaque pronostic à venir reçoit donc une révision avec sa version et sa distribution. Les lignes gelées avant restent telles quelles (« sans version », sans distribution). Rappel : la colonne `version` de `engine_picks` reste le numéro de RÉVISION du pronostic.
- La **candidate**, déclarée dans le CODE (`CANDIDATE_EN_ESSAI`, `null` à l'étape 25 ; la première viendra de l'étape 27) : `{ id, etape (une étape à juger), quoi, modifications: { football: {…} } posées sur les réglages en service, marches: [familles qu'elle change] }`. Mise en essai au démarrage : sa variante est déclarée au registre de la mesure (`declarerVariante(etape, { id, quoi, ou: 'a-blanc' })` — une candidate qui ne peut pas y être comptée n'est pas calculée). Chaque nuit, l'étape **« moteurABlanc »** de l'actualisation (`server/src/data/enregistreurs/moteurABlanc.js`, juste après le gel, avant la sauvegarde, une fois par jour, interrupteur des enregistreurs) la calcule à côté de la version en service sur les matchs à venir, mêmes entrées, la main rendue au serveur entre deux matchs et deux tranches, et écrit dans la table à part **`engine_candidate_picks`** (par le seul serveur, sous le verrou de sa passe) les deux pronostics et les deux distributions, sur la même ligne, des seuls marchés qu'elle déclare ; un marché qu'elle change sans l'avoir déclaré est compté dans le bilan (« à regarder »), jamais gardé. Sans candidate : rien, ni calcul, ni écriture.

**Le retour arrière** (`POST /api/config/versions/retour`, `{ depuis }` = la version vue à l'écran) remet d'un bloc les réglages de la version précédente (le haut de la pile), donc exactement ses chiffres et son numéro. Refusé (rien ne bouge) : pendant une passe d'actualisation ou un import (le verrou), quand la version vue n'est plus en service (double clic, autre onglet), quand rien n'est avant, vers une version au code différent (un clic remet des réglages, pas du code : il faudrait annuler la mise à jour de l'appli).

**À l'écran.** Réglages, juste sous « Paramètres du moteur » : la carte **« Versions du moteur »** (`ui/src/components/settings/EngineVersionsPanel.vue`, règles `ui/src/utils/versionsMoteur.js`) — la version en service (date, ce qui l'a créée, ce qu'elle a changé), les versions précédentes, la candidate (« aucune »), le bouton « Revenir à la version précédente » avec sa confirmation (désactivé avec sa raison quand il n'est pas possible), la place de l'adoption et de l'alerte de dérive « après la calibration (étape 20) », aucun bouton « Adopter ». Un enregistrement des réglages garde son message d'avant et dit la version dans un second message.

**Tests** : `server/test/versionsMoteur.test.mjs` (20), `moteurABlanc.test.mjs` (7), `versionsMoteurEcran.test.mjs` (7), scripts `test/aides/script-versions-moteur.mjs`, `script-moteur-a-blanc.mjs`, aide `versionsMoteurCommun.mjs` — détail dans [docs/tests.md](tests.md). Sur 12 vrais matchs de la base d'essai : version 1 sans aucun chiffre changé ; deux enregistrements puis deux retours arrière : les résultats du moteur redeviennent ceux d'avant, champ pour champ, numéro compris. Une candidate d'essai (corrélation de Dixon-Coles à −0,15) sur 2 matchs à venir : 4 chiffres à blanc sur ses deux marchés ; la page du match, le verdict, le Repérage, les opportunités, le message de l'IA, les journaux et les pronostics gelés identiques avant et après la nuit, et la candidate jamais notée comme une version du moteur. `npm test` : 594 tests, 592 réussis + 2 constats, 0 échec, ~118 s. 88 bugs volontaires sur 88 détectés au passage final (83 sur 88 au premier : trois trous des tests comblés — l'attente sur un registre tronqué masquée par la minute entre deux tentatives, la règle d'un dixième de point jamais vérifiée dans une révision, la carte qu'on pouvait cacher dans Réglages — et deux bugs équivalents, une garde doublée par une autre, remplacés par leur vrai bug), joués dans une copie hors du bac (scratchpad, `node_modules` recopiés, aucune jonction, effacée ensuite) — qui a aussi montré deux pièges du dépôt corrigés avant la recopie : un exécutable Claude existant hors du bac (les essais passent maintenant un `CLAUDE_CODE_BIN` qui n'existe pas) et un chemin d'essai écrit pour le seul bac. Test d'avant retouché : le nombre de « pas encore mesuré » du lot 5 (`preuveEcran.test.mjs`), désormais tiré de l'historique. Un garde refuse tout fichier de test qui appellerait dans son processus une fonction qui écrit les versions ou les réglages (dans le dépôt, ceux de Pierre).

**Pas encore regardé dans un navigateur** : la carte à 1280 px et à 375 px (le tableau des versions précédentes, les deux blocs en tirets côte à côte dès 720 px de large de la carte), la boîte de confirmation, les deux messages après un enregistrement.

**Après la recopie** (`sandbox-apply --appliquer`, puis relancer l'appli par `demarrer-cotemaster.bat`, hors d'une passe d'actualisation). L'étape ajoute une ligne au tableau `ETAPES` de `matchStatsAutoRefresh.js` (« moteurABlanc », entre « gelPronostics » et « sauvegarde ») ; le fichier du bac porte déjà les quatre lignes des étapes en attente (« carnetSante », « historiqueFd », « reperes », « controleQuotidien ») : il est recopié entier, en une fois, avec elles.
1. Au premier démarrage, le journal du serveur dit « [versions du moteur] version 1 en service (nouvelle). » : `engine-versions.json` est créé avec la version 1 = l'état du moteur à ce moment ; aucun chiffre ne change, `engine-config.json` n'est pas touché. La base reçoit deux colonnes de plus dans `engine_picks` (`engine_version`, `distribution`) et la table vide `engine_candidate_picks` (ajouts instantanés, rien de réécrit).
2. La carte « Versions du moteur » montre « n° 1 », « aucune » candidate, « pas de version précédente ».
3. La nuit suivante, le gel écrit une révision de chaque pronostic à venir avec la version 1 et sa distribution (≈ 1 révision par pronostic, une fois) ; l'étape « Version candidate du moteur, calculée à blanc » dit « Aucune version candidate du moteur en essai : rien calculé à blanc. »
4. Chaque enregistrement de Paramètres du moteur fait ensuite une version (deuxième message : « Nouvelle version du moteur : n° 2. ») ; chaque recopie qui touche un fichier du moteur en fait une au démarrage (« mise à jour du code du moteur »).


### Retouches du 07/10/2026 (dans le même lot)

- **Badge « à vérifier »** : les écarts de buteurs et de gardiens sont de la famille « joueurs » (`FAMILLES_SANS_MARCHE`) ; aucun marché actuel ne les porte, ni le bandeau du match (décision de Pierre). Le vert n'est jamais retiré par le badge.
- **MarketPicksBoard.vue** : le badge du titre de chaque famille reçoit `idMarche` (totalGoals, totalCorners, totalShots, totalShotsOnTarget) au lieu de l'objet `fam.total`.
- **Test instable du budget Claude** : les scripts d'essai réécrivaient `match-ai-analyses.json` sans changer sa date (horloge de fichiers de 15,6 ms) ; aide `test/aides/dateDeFichierFigee.mjs`.
- **Santé des sources** : le texte minute par minute de FotMob (data.fotmob.com) est noté à part ; un 403 = langue absente ; trois échecs de suite = « à surveiller », jamais « en panne ».
- **Recopie du 07/10 à 18 h 05** : 145 fichiers ; les 605 fichiers football-data copiés de `bac-a-sable\base\football-data` vers `%USERPROFILE%\CoteMaster\football-data` avant la relance. Dans le dépôt, 4 tests du contrôle quotidien et de la santé des sources échouent parce qu’ils supposent le bac (clés coupées) : à rendre indépendants de l’endroit où ils tournent.

## Étape 17 et corrections des 07 (soir), 12 et 13/10/2026 — recopie du 13/10 à 07 h 43

### Étape 17 — la table du jour J (lot 4, construite dans le bac les 07 et 12/10/2026)

Pour chaque match passé, **ce que l'appli savait la veille** de chaque équipe et de chaque joueur — jamais le match lui-même ni ceux d'après —, calculé une fois, par identifiants FotMob, et vérifié chaque nuit. Les étapes 18 (valeur des statistiques), 19 (banc d'essai), 27 (modèle de score), 29 (indice de force) et 30 (fiches joueurs) la liront au lieu de refaire chacune leurs lectures « avant le match » (des heures de calcul, et une seule lecture « du moment » glissée dans un rejeu fait fuiter l'avenir). **Mesurée seulement : le moteur ne la lit pas** ; aucun chiffre de l'appli ne change.

**La règle du jour J** : J = `matches.date` (jour UTC du coup d'envoi) ; « avant » = un jour **strictement** antérieur, jamais le même jour, même fini plus tôt. Les fonctions pures lèvent (« fuite refusée ») si un fait du jour J ou d'après leur parvient — une garde gardée en production.

**Les cinq entrées du moteur, à l'identique, divergences comprises** (le tableau est en tête de `dayTable.js`) : (a) la fenêtre 10/6 des corners, tirs et tirs cadrés (`statInputsRead`, 30 + 30 candidats relevés, règle 0-0), (b) la forme sur 5 (`scoreFormRead`, attribués exclus, gardée en références de rencontres), (c) la saison du club dans le championnat (saison de J, au moins 6, sinon tout l'historique), (d) les buts de la saison (`teamGoalsFromStore` : la saison la plus RÉCENTE du championnat avec un match avant J, attribués comptés), (e1) les moyennes du championnat (`leagueAveragesBefore` : saison de J, moins de 30 → les 365 jours, J − 365 compris, moins de 10 → 1,45 / 1,15 ; hors classement exclus), (e2) le classement calculé (`getLeagueGoalAverages`). Différence assumée : (d) et (e2) lisent aujourd'hui « maintenant », sans borne ; la table, non.

**Où ça vit.** `server/src/data/db/dayTable.js` (règles pures, lecteurs, construction et nuit, contrôle), `server/src/data/db/dayTableControle.js` (le contrôle de la nuit dans un processus à part), cinq tables dans le `DDL` de `matchStatsDb.js` : `day_matches` (le registre : un numéro par rencontre, son repère `updated_at`), `team_day` (une ligne par camp : les faits du match — buts, buts à 90 minutes, xG, tirs, cadrés, corners, cartons, fautes, grosses occasions, possession, et cinq indicateurs : attribué, prolongation, compte au classement, coupe, relevé — puis les colonnes « avant » (a) à (d)), `league_day` (une ligne par championnat et par jour de match : (e1) et (e2)), `player_day` (une ligne par joueur identifié et par feuille : ses faits, entiers — note ×100, xG ×1000 —, et ses dix dernières apparitions jouées), `day_state` (l'état : version, repères, comptes, dernier contrôle). Pas de clé étrangère : la cohérence est le travail du registre. `statInputsRead.js` : `moyennesEquipe` exporté (une ligne, pour le contrôle).

**Un seul écrivain.** Dans l'appli : le serveur, étape **« tableJourJ »** de l'actualisation (`matchStatsAutoRefresh.js`, après « reperes », avant « cotesGratuites », donc dans la sauvegarde de la nuit ; une fois par jour de Paris, au clic, ou quand la table n'est pas à jour — absente, autre version, passe interrompue), en rendant la main toutes les ~25 ms, transactions de 20 ms au plus, jamais une transaction ouverte pendant qu'il la rend. La nuit : seulement les rencontres nouvelles, modifiées (date de mise à jour DIFFÉRENTE, pas seulement plus récente : une base restaurée recule), retirées, et les fusions d'identité (lignes des deux identifiants supprimées puis relues) ; les colonnes « avant » des équipes toutes recalculées, celles des joueurs touchés seulement. Rien de neuf : rien d'écrit, pas même l'état. Le repère de chaque rencontre et l'état n'avancent qu'à la fin ; une passe interrompue (trace `en_cours`) est reprise entière la nuit suivante, en comparant. Puis le **contrôle anti-fuite** : 20 lignes équipe et 20 lignes joueur tirées au hasard, recalculées par un SECOND chemin — les lecteurs du moteur eux-mêmes et des requêtes SQL écrites à part —, dans un **processus à part, base en lecture seule** (ces lecteurs tiennent 0,1 à 0,5 s par ligne sur la vraie base, jusqu'à 6 s à froid : dans le serveur, ce serait autant de secondes sans répondre). Écarts → étape « à regarder » et alerte durable `tableJourJ`. La route (`GET /api/match-stats/day-table`), `due` et la carte ne font que LIRE `day_state`.

**Dans le bac** : `node scripts/build-day-table.mjs` (serveur du bac ARRÊTÉ ; refuse sous OneDrive, hors du bac, sur la vraie base, base ouverte par un autre processus, verrou d'actualisation tenu), sous le même verrou ; par défaut il rend la main EXACTEMENT comme le serveur (ses mesures sont celles de la première nuit chez Pierre). Options : `--tout` (refait tous les faits et compte ce qui change : 0 attendu), `--reconstruire` (vide les cinq tables par tranches et refait tout), `--d-une-traite` (sans rendre la main), `--controle 600 [--graine N]` (le contrôle seul, lecture seule), `--json`. Sortie : le bilan, les durées par partie, le plus long moment sans rendre la main, le RSS, le `-wal`, la taille de chaque table (`dbstat`).

**À l'écran.** Réglages, juste après « Historique football-data » : la carte **« Table du jour J »** (`ui/src/components/settings/DayTablePanel.vue`, règles `ui/src/utils/tableJourJ.js`) — quatre lignes, toujours les quatre (Équipes, Joueurs, À jour, Contrôle anti-fuite avec son `?` : terme `table-du-jour-j` du guide de lecture), « 0 écart » en vert ou « N écarts : à regarder » en rouge avec la liste, provenance « magasin SQLite, calculé chaque nuit par l'actualisation ».

**Mesures dans le bac** (base du 07/10, 60 211 rencontres) : construction complète 96 à 103 s, RSS +240 à +285 Mo (au plus haut 297 à 343 Mo), `-wal` 7,1 Mo au plus haut, tables 202,4 Mo (`player_day` 168,1, `team_day` 19,6, `day_matches` 7,1, index des clubs 2,9, index unique 2,8, `league_day` 1,8) ; 120 422 lignes équipe, 2 203 162 lignes joueur (61 694 joueurs ; 23 729 lignes « name: » sans identifiant ignorées), 20 369 journées de championnat ; contrôle de fin 40 lignes, 0 écart (processus à part, 2,7 à 6,5 s, 67 Mo). Nuit « rien à faire » 0,9 à 1,3 s. Nuit ordinaire sur une COPIE de la base du bac (40 rencontres modifiées, 5 retirées, 5 en retard) : 14,4 s, RSS +154 Mo, `-wal` 16,6 Mo, contrôle 0 écart. `--tout` : 0 changement en 80 s (RSS +314 Mo, le seul au-dessus de +300 : un outil du bac, jamais lancé par le serveur). Le serveur rendu la main toutes les ~25 ms ; des blocs isolés de 0,4 à 1,2 s restent possibles à froid ou au point de contrôle du journal (écriture d'une page du fichier de 2 Go). Contrôle seul sur 600 + 600 lignes (`--controle 600 --graine 17`) : 1 200 lignes recalculées, 0 écart, en 111 s (lecture seule ; elle laisse un `-wal` vide et un `-shm` que la prochaine ouverture normale range — ne jamais les effacer à la main).

**Tests** : `server/test/tableJourJ.test.mjs` (28 tests), script `test/aides/script-table-jour-j.mjs` (phases `construction`, `nuit`, `etape`, et `exactitude [graine] [lignes]` / `pieges` pour les relancer à part) ; `langageParis.test.mjs` (le terme), `reperes.test.mjs` (l'ordre des étapes : la 17 s'intercale entre les repères et les cotes gratuites). Exactitude : 201 cibles + 150 lignes tirées, 0 écart face aux lecteurs du moteur. Pièges de la nuit : match tardif, deux matchs le même jour, changement de date, annulée, attribuée après coup, fusion (et deux coéquipiers d'une même feuille), feuille relue sans un joueur, base restaurée, rien ne change — puis « tout » : 0 changement. Panne au milieu (une écriture refusée DANS une transaction, par des déclencheurs temporaires) : erreur rendue, repère pas avancé, reprise complète. `npm test` : 663 tests (661 réussis + 2 constats), 0 échec, ~153 s (+28 tests, +~14 s ; le fichier seul ~18 s). 28 bugs volontaires sur 28 détectés au passage final (27 au premier : une panne posée par une base en lecture seule échouait dès le BEGIN et cachait un ROLLBACK oublié), dans une copie du code hors du bac (scratchpad, `node_modules` recopiés, effacée ensuite). Tests d'avant retouchés : `reperes.test.mjs` (l'étape 17 s'intercale entre les repères et les cotes gratuites) et `langageParis.test.mjs` (le terme dans les deux listes figées).

**Pas encore regardé dans un navigateur** : la carte à 1280 px et à 375 px (les quatre lignes, la pastille, la liste des écarts), la bulle du `?`.

**Après la recopie** (`sandbox-apply --appliquer`, puis relancer l'appli par `demarrer-cotemaster.bat`, hors d'une passe d'actualisation).
1. Au démarrage, `openDb` crée les cinq tables vides (instantané). `statInputsRead.js` faisant partie de l'empreinte du code du moteur (étape 25), le journal du serveur dit une version n° 2 « mise à jour du code du moteur » — aucun chiffre ne change.
2. La première passe d'actualisation (une minute après le démarrage) fait la **première construction** dans l'étape « Table du jour J » : ~1 min 40 s à ~2 min sur la base de Pierre, le serveur jamais tenu plus de ~25 ms d'affilée en temps normal (des blocs isolés jusqu'à ~1 s possibles au point de contrôle du journal), RSS du serveur +~250-300 Mo pendant la construction ; puis le contrôle dans un processus à part (quelques secondes, ~70 Mo). Résumé attendu : « Première construction : 60 2xx rencontres, 120 4xx lignes équipe, 2 20x xxx lignes joueur, 20 3xx journées de championnat, en … ; contrôle anti-fuite : 40 lignes recalculées depuis les tables sources, 0 écart. Mesuré seulement : le moteur ne lit pas encore cette table. »
3. La base grossit de ~205 Mo (2,07 Go dans le bac) ; les sauvegardes de la nuit aussi (tables dérivées, refaites si elles manquent).
4. Les nuits suivantes : quelques secondes (rien à faire ~1 s ; une nuit ordinaire ~10-15 s), un contrôle de 40 lignes chaque fois. La carte de Réglages se remplit après la première passe.

### Corrections recopiées avec l'étape 17

- **Tests indépendants de l'endroit (07/10 au soir)** : le code reconnaît le bac à son emplacement ; l'aide `test/aides/bacSimule.mjs` fabrique un faux dossier personnel contenant `CoteMaster\bac-a-sable\essais-tests` ; `isolement.mjs` accepte `racine` et exporte `nettoyer`.
- **Le carnet rend la main (07/10 au soir)** : lectures et contrôles écrits une fois en générateurs (`…ParMorceaux`) avec `utils/travailCooperatif.js` ; plus long blocage du contrôle complet ~0,1 s au lieu de 72 s (l'étape tournait déjà dans un processus enfant : l'appli n'était pas figée).
- **« database is locked » des annuaires (12/10)** : cause = `attachQuotesToMatches` (boucle des cotes gratuites, 2 min après le démarrage) qui tenait le verrou d'écriture 27 à 35 s ; désormais recherche sans verrou puis écriture courte (18 ms). Le script des annuaires patiente (`src/data/db/verrouEcriture.js` : essais espacés, ~3 min) et le résumé de l'étape dit le nombre d'essais.
- **Classement officiel et matchs en cours (12/10)** : un écart de « joués » expliqué par des matchs du calendrier non terminés, d'aujourd'hui ou d'hier, est une information (jamais rouge) ; même règle dans le carnet, le contrôle quotidien et `verify-standings.mjs`.

**Après cette recopie** : npm test dans le dépôt = 663 tests (658 + 3 sautés propres au bac + 2 TODO, 0 échec) ; la première passe construit la table du jour J (~2 min, +200 Mo de base) ; version n° 2 du moteur au démarrage (empreinte du code, aucun chiffre changé).

## Lot 4 (mesure) — étapes 18, 19, 20, 22, 25 (seconde moitié), 29 et retouche de 17, construits dans le bac les 13-14/10/2026

Les étapes 18, 19, 20, 22 et 29 sont **mesurées ou proposées seulement** : le moteur ne lit rien d'elles, aucun chiffre de l'appli ne change ; la 25 (seconde moitié) ne change rien tant qu'aucune candidate n'est déclarée. Tests : `npm test` depuis server/, 793 tests à l'étape 25 (791 réussis + 2 constats TODO connus), 0 échec ([docs/tests.md](tests.md)). Les scripts `stat-value.mjs`, `bench.mjs`, `market-knowledge.mjs` et `team-strength.mjs` se lancent depuis `code\server`, serveur du bac **arrêté**, et refusent sous OneDrive, hors du bac, sur la vraie base ou verrou d'actualisation tenu.

### Retouche de l'étape 17 (13/10, après la vérification en ultracode : aucun bloquant)

**Blocages raccourcis** : les bornes MIN et MAX d'une colonne se lisent en deux sous-requêtes (`bornesDe`) — ensemble, SQLite balayait `player_day` entière, 0,4 à 5 s d'un bloc dans le serveur. Nuit de 50 rencontres : 14,3 s, plus long blocage 194 ms (380-400 avant). **Contrôle anti-fuite** : compare TOUTES les colonnes de faits et le contenu des cinq rencontres de la forme, par des règles écrites à la main (600 + 600 lignes, 0 écart, 92 s). Délai de 10 min ; sans réponse ou en échec : « pas fait » avec sa raison, JAMAIS refait dans le serveur. Sa graine change chaque nuit (AAAAMMJJ) : `--controle N --graine AAAAMMJJ` le rejoue. **Limite** : mémoire non rendue à la fin de la passe (réserve du tas de V8), pas corrigé.

### Étape 18 — la valeur de chaque statistique (13/10)

Pour chaque statistique d'équipe et de joueur : **fiabilité**, **point de stabilisation**, **pouvoir prédictif** (jugé par l'étape 16), **demi-vie** et **fenêtre conseillée** face aux 10 derniers matchs. Données et route seulement (affichage : étape 31) ; `STAT_SAMPLE` reste à 10.

**Où.** `server/src/bench/statValue.js`, `server/src/data/db/valeurStatsAPart.js` + `valeurStatsEnfant.js` ; tables `stat_value_runs`, `stat_value`. **À la main, jamais chaque nuit** (demi-vie et fenêtre deviennent des paramètres de 27, 29, 30 : un calcul automatique les changerait sans nouvelle version du moteur) : `POST /api/bench/stat-value/run` (processus à part ; verrou « valeur-des-stats » : 409 pendant une passe, un import ou un rejeu du banc), `GET /api/bench/stat-value`. Bac : `node scripts/stat-value.mjs` (refuse aussi si la table du jour J n'est pas à jour) ; options `--echelles`, `--sources`, `--statistiques`, `--graine`, `--tirages`, `--sans-ecrire`, `--sur-place`, `--juge-sur-place`, `--json`.

**Pièges.** On calcule sur une période, on juge sur des matchs POSTÉRIEURS : magasin, calcul 2024-07-01 → 2025-06-30, jugement depuis 2025-07-01 (déjà vue : fenêtres **indicatives**) ; football-data, calcul jusqu'au 2019-06-30, jugement 2019-07-01 → 2023-06-30 (jamais vue : la preuve propre). `VUES_DE_L_ETAPE_18` : à recopier dans les `vues` de 27, 29, 30.

**Résultats** (calcul n° 1, 66 lignes, 3 min 0 s). Comptent : tirs, tirs cadrés, xG, grosses occasions, buts, points (r ≈ 0,19-0,21) ; trompent : cartons rouges, « buts encaissés moins xG concédés », buts évités des gardiens (r ≈ 0,01). Fenêtre du moteur : corners 30 proposée, tirs 10 confirmée, tirs cadrés 20 à 30 proposée (rien de branché).

### Étape 19 — le banc d'essai (13/10)

On **rejoue le moteur d'aujourd'hui, sans le retoucher, sur les matchs passés, jour après jour**, avec ce qu'on savait la veille (table du jour J, ou football-data reconstruit pour 2000-2023) et les cotes d'avant le coup d'envoi ; la clôture ne sert qu'à mesurer. Chaque marché est noté par le juge de l'étape 16 face au marché et à un **repère** (le championnat seul) ; les paris de la règle du moteur sont simulés à mise fixe.

**Où.** `server/src/bench/` : `periodes.js` (périodes, `DECISIONS_DE_PIERRE`), `runner.js`, `jugeAPart.js` + `jugeAPartFil.js`, `simulateBets.js`, `depotBanc.js` (table `bench_runs`), `noteDeDepart.js`. Routes `GET /api/bench` et `POST /api/bench/run` (rejeu DANS le serveur, verrou « banc » : une passe déclenchée pendant ce temps est reportée).

**Dans le bac** : `node scripts/bench.mjs` ; options `--periodes P1,P2,P3,P4,P5` (défaut P2 à P5), `--prix fd-avant-match,fd-cloture,gratuites-avant-match,vos-bookmakers` (défaut : sans la clôture), `--de/--a AAAA-MM-JJ`, `--config reglages.json [--vues AAAA-MM-JJ:AAAA-MM-JJ,…]`, `--lignes fichier.jsonl`, `--comparer a.jsonl b.jsonl --mesure perte-log (--variantes N | --etapes 27,28)`, `--json`.

**Pièges.** **La preuve** : P2 = 07/2019 → 06/2023 (football-data, jamais vue). P4a (2024-25) et P4b (2025-26) sont **déjà vues** : jamais une preuve. P5 = depuis le 24/09/2026 (vos paris), second jugement fin mars 2027 (~46 paris par mois). Le rendement des paris est **rapporté** (±8 % pour 1 000 paris), la **valeur de clôture prouve** ; paris possibles du 27/07/2012 au 27/03/2025.

**Résultats.** Configuration de Pierre (P2 à P5, 10 à 13 min acceptées) : 11 min 6 s. **Référence du 23/09 retrouvée à l'identique** (12 997 matchs, 50,26 % de justes, perte log 1,0034). Note de départ (2019-2023) : 1N2 perte log 1,0040 contre 1,0041 pour le marché (pas prouvé) ; 555 paris, rendement +6,8 % [−16,5 ; +30,2] (rapporté), valeur de clôture +4,7 % [+2,5 ; +6,9] retenue.

### Étape 20 — la calibration et le suivi mensuel (13/10)

Chaque mois, **ce que le moteur avait annoncé face à ce qui est arrivé**, par marché et par championnat, tranche de probabilité par tranche, plus la **valeur de clôture** de ses pronostics et des vrais paris de Pierre. Le bilan d'un mois écoulé est **figé une fois et gardé**, jamais recalculé ; le mois en cours se calcule à la demande, le dit, et se garde 10 minutes.

**Où.** `server/src/data/calibration.js`, table `calibration_monthly` (une ligne par mois ; un déclencheur refuse tout UPDATE), `GET /api/predictions/calibration[?mois=AAAA-MM]`. Étape **« calibrationMensuelle »** (entre « moteurABlanc » et « sauvegarde ») : fige chaque mois écoulé **le 1er du mois suivant à partir de 6 h (Paris)** ou à la première passe d'après ; un clic ne refige rien. Écran : bloc « Calibration du mois » de Historique moteur (`CalibrationPanel.vue`).

**Pièges.** Source = la table `engine_picks`, **jamais `predictions.json`** (son `predictedOdds` est réécrit à chaque scan de Mes paris), en deux lectures : la **première valeur** (révision 1, la principale) et la **dernière avant le coup d'envoi**. **Jamais de verdict sous 200 matchs** : les premiers mois, la plupart des tranches et tous les championnats diront « trop peu de matchs » (voulu). Seuls le 1N2, le plus/moins de buts et « les deux équipes marquent » ont une clôture gratuite.

**Résultats.** Base du 07/10 : octobre en cours, 8 808 pronostics gelés sur 664 matchs dont **45 réglés sur 3 matchs** ; septembre : **19 paris mesurés, valeur de clôture moyenne +1,2 %**. Premier mois figé : **octobre 2026, le 01/11/2026 à partir de 6 h**.

### Étape 22 — connaître le marché et le meilleur moment pour parier (13-14/10)

Chaque nuit, sur toutes les cotes archivées, pour chaque **livre** (source + bookmaker : « Bet365 (ESPN) » et « Bet365 (football-data) » sont deux livres) : **justesse** (perte log, marge retirée par la méthode puissance), **vitesse** (qui bouge le premier vers la clôture), **biais** et **marge** ; et, par championnat, le **meilleur moment** pour parier (tôt, après les compositions, juste avant le coup d'envoi).

**Où.** `server/src/data/marketKnowledge.js` + `marketKnowledgeEnfant.js` (processus à part, tas plafonné à 384 Mo : `OPTIONS_DE_L_ENFANT`) ; tables `market_knowledge_runs`, `market_knowledge`. Étape **« connaitreMarche »** (entre « cotesGratuites » et « gelPronostics »), une fois par jour de Paris, au clic, ou si le dernier calcul est d'une autre version ; sources inchangées : rien d'écrit. Lecture pour 23 et 31 : `lireConnaissanceDuMarche`. Bac : `node scripts/market-knowledge.mjs` (la passe de nuit, recalcul forcé) ; `--nuit` (exactement l'étape), `--sur-place`, `--tirages N`, `--graine N`, `--json`.

**Pièges.** Deux livres ne se comparent que sur les matchs que les DEUX cotent ; **moins de 200 matchs communs : pas jugé** ; chaque jugement dit sa part de lignes **déjà vues** (`fenetresDeclarees`). **Bourses** : probabilités ramenées à 100 %, jamais la méthode puissance, commission de `valueFinder.js` ; un prix « milieu du carnet » n'est jamais jouable.

**Résultats.** Le 23/09 retrouvé (Pinnacle 0,9925 sur 15 878 matchs). **Le plus juste : Pinnacle** ; **bouge le premier : la bourse Betfair**, de +1 à +3 % d'un mouvement moyen de 3,5 points. **Meilleur moment** : juste avant (+0,18 point de valeur de clôture face au relevé du vendredi/mardi), mais sur le favori mieux vaut parier tôt (−0,99 point) ; « après les compos » : 77 matchs seulement avec un relevé daté.

### Étape 25, seconde moitié — l'adoption « si meilleure » et l'alerte de dérive (14/10)

L'étape 25 est finie : une candidate de moteur est **jugée à blanc**, puis **adoptée** si elle fait mieux que la version en service ; une **alerte de dérive** surveille le moteur. Aucun fichier qui calcule les chiffres n'est touché : **pas de nouvelle version du moteur à la recopie** (sauf celle que font déjà les étapes en attente, la 19).

**L'essai** (`jugerLEssai` dans `server/src/data/enregistreurs/moteurABlanc.js` ; règles pures `server/src/bench/essaiCandidate.js`, `horizonEssai.js`) : chaque nuit, pour chaque match × marché, la dernière révision gelée avant le coup d'envoi de CETTE candidate face à CETTE version en service, notée par la perte log ; le juge de l'étape 16 décide. **Le jugement qui décide est pris UNE fois**, à l'horizon : 600 matchs joués et 14 jours par défaut (jamais moins de 200 ni 7) ; l'essai recommence si la candidate ou la version en service change.

**Adoption** : `POST /api/config/versions/adopter { depuis, candidate }`, seulement sur « retenu » (sinon 409 avec la raison), jamais pendant une passe, un import ou un banc ; puis `engine-config.json` écrit une fois, une version de plus (origine « adoption »), lancement déclaré au registre de la mesure. **Banc avant l'essai** : `POST /api/config/versions/candidate/banc` (202, `server/src/bench/bancCandidate.js`) : verdict **indicatif**, il ne décide jamais.

**Dérive** (`server/src/data/deriveMoteur.js`, `alerteDerive.js`) : sur le dernier mois figé de la calibration, l'écart de départ d'un marché sort de la fourchette du juge ET le mois est plus loin de zéro, ou la valeur de clôture est négative au-delà du hasard (jamais sous 200 matchs). Posée ou levée quand « calibrationMensuelle » fige un mois ; lue par `GET /api/config/versions` (`derive`) et `GET /api/roadmap` (`alerteDerive`).

**Pour 26 et 27.** `proposerUneCandidate(declaration, { origine })` (étape 26 ; rien ne propose encore). **Une étape livrée comme candidate (la 27) déclare `CANDIDATE_EN_ESSAI` et n'ajoute PAS d'entrée à `LANCEMENTS`** : c'est l'adoption qui déclare le lancement (sinon la date serait celle du premier démarrage).

### Étape 29 — l'indice de force des équipes (14/10)

Chaque nuit, pour chaque club et chaque jour où il joue, **ce qu'on savait de sa force la veille**, plus sa **force actuelle** : une **note** (buts d'écart attendus par match face à une équipe moyenne de son championnat, au total, à domicile et à l'extérieur), ses statistiques **corrigées de la force des adversaires** et leurs **percentiles**. **Proposé seulement : le moteur ne lit pas l'indice.**

**Où.** `server/src/data/db/teamStrength.js`, `teamStrengthEnfant.js` (processus à part, tas plafonné à 512 Mo), `teamStrengthBanc.js` ; tables `team_strength`, `team_strength_state`. Étape **« indiceForce »** (entre « connaitreMarche » et « gelPronostics »), une fois par jour de Paris, au clic, ou si l'indice n'est pas à jour ; sources inchangées : rien ; sinon rejeu des seuls championnats touchés. Lecture : `lireIndiceDeForce` ; `GET /api/match-stats/team-strength?club=…|league=…[&lieu=dom|ext][&jour=AAAA-MM-JJ][&historique=oui]`. Bac : `node scripts/team-strength.mjs` (la passe de nuit) ; `--tout`, `--sur-place`, `--banc` (`--sans-declarer`, `--tirages N`), `--classements`, `--json`.

**Pièges.** Demi-vies de l'étape 18 **recopiées** dans `REGLAGES_INDICE_FORCE`. Une **coupe ou un barrage entre deux divisions est écarté** (3 085 dans le bac) ; 17 championnats n'ont aucun xG chez FotMob : repli « sans-xg ». **Écart voulu : la déclaration de lancement n'est PAS dans `LANCEMENTS`** (`VUES_DE_L_ETAPE_29`, `VARIANTES_INDICE` prêtes) : y mettre les vues de l'étape 18 ferait passer en « déjà vu » la note de départ du banc et les jugements des étapes 22 et 18, alors que l'indice ne lit aucune donnée football-data. À décider avec Pierre : étiqueter par étape (`jugerEtape` le fait déjà) ou accepter ces étiquettes.

**Résultats.** 335 898 lignes. **L'indice bat le classement corrigé xG** : sur P3 (6 939 matchs, rien de l'indice n'y a été appris) perte log 1,0046 contre 1,0111, **+0,63 % [+0,18 ; +1,09]**, retenu ; face au classement réel +1,80 % [+1,29 ; +2,31].

### Après la recopie du lot 4

1. Recopier (`sandbox-diff`, puis `sandbox-apply --appliquer`) et relancer `demarrer-cotemaster.bat` **hors d'une passe d'actualisation**. `matchStatsAutoRefresh.js` est recopié **entier, en une fois** : il porte les lignes « calibrationMensuelle » (20), « connaitreMarche » (22), « indiceForce » (29) de `ETAPES` et les changements en attente des étapes 17 (retouche), 18 et 19.
2. Au démarrage, `openDb` crée huit tables vides : `stat_value_runs`, `stat_value` (18), `bench_runs` (19), `calibration_monthly` et son déclencheur (20), `market_knowledge_runs`, `market_knowledge` (22), `team_strength`, `team_strength_state` (29).
3. **Nouvelle version du moteur** au démarrage (« mise à jour du code du moteur ») : l'étape 19 change trois fichiers de l'empreinte du code (`sports/football/model.js`, `core/engine/scorePrediction.js`, `sports/football/statMarkets.js`), aucun chiffre ne change (0 écart sur 2 000 vrais matchs) ; les autres étapes du lot n'en font pas. Le commit de ce code se note à la recopie suivante dans la note de départ du banc (`moteur.commit`, `null` dans le bac), avec ce numéro de version.
4. La première passe d'actualisation (une minute après le démarrage) fait les premiers calculs des étapes 22 (~2 min, processus à part) et 29 (~30 s en processus à part, puis ~50 s de rangement).
5. **À la main, une fois**, hors d'une passe : `POST /api/bench/stat-value/run` (202, ~3 min ; 409 si une passe tourne), puis `GET /api/bench/stat-value` : `dernier.ou = 'serveur'`, 66 lignes et `bilan.controleF10` à 0 écart attendus. Et, depuis `server/`, `node scripts/team-strength.mjs --banc --classements` (~1 min, jusqu'à ~700 Mo dans ce script ; déclare 4 variantes au registre de la mesure) pour avoir la mesure chez Pierre : « Poids du code à jour : true » attendu, sinon les poids de sa base diffèrent de ceux du code.
6. **À vérifier** : « Lancer le banc » (10 à 13 min, RSS du serveur jusqu'à ~+0,9 Go, aucune actualisation pendant ce temps) retrouve la référence du 23/09 à ± 1 % de matchs et 0,001 de perte log ; l'étape 22 dit « référence du 23/09 retrouvée » ; la carte « Versions du moteur » dit « Adoption : rien à adopter », « Dérive : pas encore jugée » ; le 01/11/2026 à partir de 6 h, la première passe fige octobre (étape 20) et dit s'il y a dérive.
7. **Pas encore regardé dans un navigateur** (1280 px et 375 px) : « Banc d'essai » (dont « Lancer le banc » de bout en bout), « Calibration du mois », « Versions du moteur » avec une candidate (dont la confirmation de l'adoption).
8. **À décider avec Pierre** : la déclaration de lancement de l'étape 29 ; la place du lien de l'étape 24 vers « Calibration du mois ». **Vérification de l'étape 19 par Fable en ultracode prévue le lundi 19/10.**

**Recopie du 14/10 à 07 h 24** : 105 fichiers.

## Étapes 21 et 24, recopiées le 14/10/2026 à 13 h 43

### Étape 21 — le carnet de notes de l'IA (lot 4, construite dans le bac le 14/10/2026, retouchée le même jour)

Chaque nuit, **toutes les analyses d'avant-match de l'IA sont relues** et chacun de ses avis par marché (confirme / nuance / contredit, avec sa confiance) est noté : **a-t-il tenu au coup de sifflet final ?** et, pour le 1N2, le plus/moins de buts et « les deux équipes marquent » (les seuls marchés à cotes gratuites), **la cote a-t-elle ensuite bougé dans son sens ?** D'où la fiabilité de l'IA par type de marché, par championnat, par confiance annoncée et par forme de fiche, avec le nombre de cas. La règle « l'IA ne fait pas mieux que le moteur seul sur assez de matchs → le marché sort de sa liste » est calculée, mais **la coupure est DÉSACTIVÉE tant que Pierre n'a pas décidé de la règle** (retouche du 14/10) : le carnet dit ce qu'elle ferait, rien n'est retiré. Aucun appel à Claude : 0 token. Aucun fichier du moteur touché.

**Où.** `server/src/data/aiScorecard.js` (le calcul, en générateur qui rend la main ; le fichier ; les marchés coupés ; la réponse de la route) ; étape **« carnetIA »** de l'actualisation (`matchStatsAutoRefresh.js`, entre « sauvegarde » et « controleQuotidien », une fois par jour de Paris ou au clic) ; fichier `server/data/runtime/carnet-ia.json`, écrit par le SERVEUR seul, d'un bloc, par `utils/atomicJson.js`, refait en entier chaque fois (la base n'est que lue) ; `GET /api/match-ai/scorecard` (lecture seule ; pas encore calculé : 200 avec `carnet: null` ; illisible : 503) ; écran : bloc **« Carnet de l'IA »** d'Historique moteur, juste après « Calibration du mois » (`AiScorecardPanel.vue`, règles `ui/src/utils/carnetIA.js`).

**Étend aiMarketExperience sans la doubler** (`matchAiAnalysisRepository.js`) : mêmes types de marché, mêmes comptes (`bilanVide`, `compterAuBilan`), une seule règle de l'avis tenu (`avisTenu`, que la revue d'après-match suit aussi), même redémarrage au 30/09 (seuls les pronostics qui portent `minOdds`). L'expérience redonnée à l'IA ne change pas (l'ancienne forme revient à l'octet).

**Le rattachement** (correction 3) : l'analyse se retrouve au magasin par les **identifiants FotMob** des clubs — ceux de la composition gardée avec l'analyse, puis ceux du gel des pronostics (`engine_picks.match_id`), puis l'annuaire strict (`clubDuMagasin`) — et le jour (exact, sinon à un jour près, jamais deux). **Jamais le rapprocheur de noms souple** (un test le prouve avec « Leeds United », que `teamNamesLikelyMatch` confond avec DC United). Deux sources qui donnent deux clubs différents : avis écarté et compté. Deux analyses d'un même match : seule la plus récente avant le coup d'envoi compte. **Le règlement** : celui de la calibration (étape 20), donc du banc d'essai (score de la 90e minute d'un match prolongé, match attribué écarté, 0-0 de corners ou de tirs non relevé). Le pronostic jugé est celui gardé avec l'analyse (`engineSnapshot.marketPredictions`), jamais `predictions.json`. **La clôture** : `closingValue.mesurerUneEntree`, prix de l'heure de l'analyse face à la clôture.

**Mieux que le moteur seul** (correction 4) : sur les MÊMES avis, à mise fixe et à la cote juste du moteur, le moteur seul joue toujours son pronostic, suivre l'IA joue l'issue contraire quand elle contredit ; le juge de l'étape 16 (lignes tirées par match, fourchette élargie pour les types jugés ensemble). La règle retirerait un type seulement s'il a au moins **`SEUIL_MATCHS_POUR_COUPER` = 200 matchs jugés** et que le juge dit « pas prouvé » (sans apport) ou « moins bon », sans que la clôture prouve le contraire. **`COUPURE_ACTIVE = false`** (juste à côté du seuil, en tête de `aiScorecard.js`) : tant qu'elle vaut false, `etat: 'coupe'` reste le verdict de la règle (« serait retiré : l'IA n'apporte rien ici », liste `seraientRetires`), mais `coupes` est vide et `lireLesMarchesCoupes` rend toujours un ensemble vide ; un carnet calculé interrupteur coupé ne retire jamais rien, même une fois l'interrupteur remis. La page le dit en tête : « Aucun marché n'est retiré pour l'instant : c'est à vous de décider de la règle. » Les avis « nuance » ne sont jamais comptés comme avis tenus.

**Les « nuance », pour information** (retouche du 14/10) : marché par marché, pour les avis « confirme » ET « nuance », le taux annoncé par le moteur face au taux réalisé, avec le juge de l'étape 16 dès 200 matchs (a = la probabilité du moteur, b = 1 si le pronostic arrive ; les matchs tirés ensemble ; la fourchette élargie pour les cases jugées ensemble). Rien n'en dépend : ni l'avis tenu, ni la règle.

**Le filtre** (correction 5) : `curateEngineSummary(engineResult, { sansApport })`, appelé pour la **fiche compacte seulement**. Coupure désactivée (aujourd'hui) : rien n'est retiré, **la fiche compacte est celle d'avant, à l'octet** (0 token de différence), même avec un carnet qui liste des marchés à couper. Coupure activée : les marchés coupés ne sont plus dans sa liste, ni leur bilan d'expérience, et UNE ligne de la fiche le dit (« Retirés de ta liste : … ») ; les **consignes fixes ne changent pas** ; l'`engineSnapshot` gardé reste complet ; les types retirés sont gardés avec l'analyse (`marchesRetires`) et la revue ne les redonne pas à juger. **L'ancienne forme (`AI_ANALYSIS_FICHE=ancienne`) revient à l'octet** dans tous les cas. Un carnet absent, illisible ou d'un autre seuil ne coupe rien.

**Le type d'argument** (correction 2) : il n'existe pas dans les avis (pas de thème par marché ; les facteurs clés ne sont rattachés à aucun marché). **À ajouter au prompt, décision de Pierre** (un champ de plus dans la sortie et les consignes : autre cache, autre coût). Le carnet et l'écran le disent.

**Résultats sur le bac** (analyses du 12/09 au 11/10, base du 07/10) : 59 matchs réglés, 739 pronostics commentés, 533 avis comptés, **381 tenus (71,5 %)**, 206 nuancés, **6 contredits seulement** ; confiance forte 37/46, moyenne 335/469, faible 9/18 ; fiche compacte 26/31, ancienne 355/502. **Rien n'est retiré, et la règle n'en retirerait aucun aujourd'hui** (aucun type à 200 matchs). Les « nuance », pour information : quand l'IA confirme, le pronostic arrive 71,5 % du temps pour 76,7 % annoncés ; quand elle nuance, 45,6 % pour 59,6 % (résultat : 30,0 % pour 44,2 % ; total buts : 36,4 % pour 70,3 % ; buts d'une équipe : 38,1 % pour 65,0 %) — le juge ne conclut pas encore (59 matchs sur 200). **Vérifié à la main** sur 12 vrais matchs (108 pronostics), par un second chemin écrit à part : 0 écart.

**Coût en tokens** (estimé hors ligne, sans appel à Claude, sur les 27 vraies analyses en fiche compacte du bac, rapports caractères/token mesurés sur ces appels) : aujourd'hui, coupure désactivée, **0 token de différence**. Si la règle était mise en service : un marché retiré épargnerait ≈ 180 à 240 tokens par analyse d'avant-match (≈ 400 à 435 pour un marché d'équipe, deux lignes), surtout de la SORTIE écrite par l'IA, et ≈ 250 à 640 à la revue ; les six types corners/tirs : ≈ 1 800 + 2 500 tokens par match ; tous : ≈ 3 100 + 4 400.

**Tests** : `server/test/aiScorecard.test.mjs` (12), `aiScorecardEcran.test.mjs` (6), script `test/aides/script-carnet-ia.mjs` (les phases qui coupent sont rejouées dans une copie où le TEST active `COUPURE_ACTIVE`, jamais le code du bac), référence `test/fixtures/fiche-ia-etape-21.json` (produite par le code d'AVANT l'étape : ne pas la regénérer) ; test d'avant retouché : `controleQuotidien.test.mjs` (l'étape « carnetIA » s'intercale entre la sauvegarde et le contrôle quotidien). `npm test` : 811 tests, 809 réussis + 2 constats, 0 échec, ~214 s (18 nouveaux pour l’étape). Bugs volontaires : 65 sur 65 à l'étape (57 sur 60 au premier passage : deux trous des tests comblés, un bug équivalent remplacé), puis 19 sur 19, plus un témoin resté non détecté comme prévu, pour la retouche (l'interrupteur ignoré, la fiche qui change, les « nuance » mal comptées, l'écran), chaque série dans une copie du code hors du bac (scratchpad, node_modules recopiés, effacée ensuite) — qui a aussi montré que la simulation de Claude exige un `CLAUDE_CODE_BIN` inexistant hors du bac (les deux fichiers le passent). Interface : 133 composants, aucune perte (verifier-interface --avant).

**Pas encore regardé dans un navigateur** : le bloc « Carnet de l'IA » à 1280 px et à 375 px (la phrase de la décision en tête, les onze marchés et leurs « serait retiré », le tableau par championnat et son choix du marché, les deux petits tableaux côte à côte, le tableau des « nuance » à cinq colonnes et ses pastilles).

**Après la recopie** (`sandbox-apply --appliquer`, puis relancer `demarrer-cotemaster.bat` hors d'une passe d'actualisation). `matchStatsAutoRefresh.js` porte une ligne de plus dans `ETAPES` (« carnetIA ») : il se recopie entier, en une fois. Aucune table, aucune colonne, aucune nouvelle version du moteur.
1. La première passe (ou un clic « Actualiser ») écrit `server/data/runtime/carnet-ia.json` : quelques secondes, le serveur rendu toutes les ~25 ms (le plus long, la lecture du fichier des analyses à froid, ~50 ms sur le bac).
2. **Rien n'est retiré de la liste de l'IA** (coupure désactivée) : la fiche et le coût des analyses ne bougent pas. Le carnet dit, pour chaque marché, ce que la règle ferait ; chez Pierre, plusieurs marchés peuvent déjà compter 200 matchs depuis le 30/09 et apparaître « serait retiré », l'IA ne contredisant presque jamais le moteur (6 avis sur 533 dans le bac).
3. **À décider avec Pierre** : la règle de la coupure (et alors seulement `COUPURE_ACTIVE = true`, puis relancer : le carnet de la nuit suivante, calculé coupure active, retire les marchés à l'analyse d'après) ; la place des « nuance » (le tableau d'information montre déjà ce qu'elles disent) ; le type d'argument (un champ du prompt) ; le « Bilan de l'IA » de l'onglet Analyse IA d'un match, qui reste lu dans les revues (l'étape 45 dira s'il renvoie au carnet).


### Étape 24 — « Santé du moteur » et la correction des 6 s de la calibration (lot 4, construite dans le bac le 14/10/2026)

Une nouvelle page du menu, **« Santé du moteur »** (`/sante-moteur`, juste après Historique moteur), qui **rassemble sans rien recalculer** ce que les autres étapes ont préparé : en tête **trois feux** (les données — le contrôle quotidien de l'étape 14 —, les sauvegardes — étape 1 —, le budget Claude — étape 4) ; puis **la note du moteur face au marché** (le 1N2 et le plus/moins 2,5 face au marché, les autres marchés face au championnat seul) et son évolution mois par mois, **ce qu'il annonçait face à ce qui est arrivé** (une seule courbe, celle du banc d'essai), **la valeur de clôture**, **la liste « à vérifier »**, **la version du moteur** avec l'essai d'une candidate et l'alerte de dérive (étape 25), et **la place des corrections de l'étape 26** (vide : « pas encore mesuré »). **Une seule place par information** : chaque cadre n'est qu'un résumé — un chiffre, une phrase, sa **vraie source** et l'**heure de sa mesure** (`ProvenanceChip`), un **lien vers la vraie place** (Historique moteur › Banc d'essai / Calibration du mois, Réglages › Contrôle quotidien / Sauvegardes / Budget Claude / Versions du moteur, Feuille de route › étape 26) ; une donnée qui manque laisse le cadre affiché avec « pas encore mesuré » et pourquoi, une lecture qui échoue n'emporte que son cadre. **Et la correction qui allait avec** : le bilan de calibration du mois en cours (6,2 s au premier appel chez Pierre le 14/10) n'est plus calculé quand on ouvre une page : l'étape de nuit le prépare. Aucun chiffre du moteur ne change, aucun fichier du moteur (`MODULES_DU_MOTEUR`) touché : pas de nouvelle version du moteur à la recopie.

**Où.** `server/src/data/santeDuMoteur.js` (l'assembleur : sept lectures, chacune gardée par un `try`, neuf cadres ; `LIENS` = la vraie place de chaque information) ; `server/src/api/controllers/engineHealth.controller.js` et `routes/engineHealth.routes.js` : `GET /api/engine-health` (lecture seule, répond toujours 200). Écran : `ui/src/views/EngineHealthView.vue`, le cadre commun `components/analysis/HealthBlockCard.vue`, les mots dans `utils/santeMoteur.js` (qui reprennent ceux des vraies places : `calibration.js`, `preuve.js`, `controleQuotidien.js`, `banc.js`), `services/engineHealthApi.js` ; route `/sante-moteur` (même couleur de section qu'Historique moteur — violet — ; `meta.nav` : une seule entrée du menu active à la fois) et entrée de `AppSidebar.vue`. L'emplacement des corrections (étape 26) est la lecture `LECTEURS.corrections` : l'étape 26 la remplace par la lecture de ses propositions (`{ disponible: true, aAccepter: [...] }`).

**La cause des 6,2 s (mesurée sur la base du bac, ouverte en lecture seule, aucun serveur).** La réponse de Pierre du 14/10 le disait déjà : `dureeMs` 6 167, mais `blocMaxMs` **51** — le calcul de la calibration **ne figeait pas** le serveur, il rendait déjà la main toutes les ~25 ms (générateur + `travailCooperatif`). Ce qui coûtait, c'était **qui attendait** : le bilan du mois en cours se calculait DANS la requête (15 259 pronostics gelés, 6 469 réglés par lecture sur 434 matchs, 55 cases au juge, 6 478 mesures de clôture), à la première ouverture puis **toutes les dix minutes** (`GARDE_MS`). Reproduit sur la base du bac avec le même volume (6 456 réglés sur 434 matchs, les 15 pronostics d'un vrai match du bac, ses vraies cotes archivées, dans une table TEMPORAIRE qui masque `engine_picks` pour la connexion seule — la base n'est jamais écrite) : **1,75 s à chaud** (clôture des pronostics 0,73 s, lecture des rencontres 0,28 s, juge 0,28 s, pronostics gelés 0,19 s, règlement 0,11 s), **3,97 s à la première lecture** (pages de la base pas encore en mémoire du système), plus long moment sans rendre la main 53 ms. **Un seul vrai blocage** : quand un pari du carnet tombe dans le mois, le premier club reconnu par son nom (`clubDuMagasin`, annuaire) tient le serveur **0,3 s à chaud, 1,8 s à froid** — non corrigé, mais il n'a plus lieu que dans l'étape de nuit.

**La correction.** `data/calibration.js` : `preparerLeMoisEnCours` (le même `travailDuBilan`, en rendant la main, écrit **d'un bloc** `server/data/runtime/calibration-en-cours.json` par `utils/atomicJson.js`, ~90 Ko), `lireLeMoisPrepare`, `preparationAFaire` (oui si pas de fichier lisible, autre forme ou version du calcul, autre mois, ou calculé un autre **jour de Paris**), `bilanPourLaRoute` (figé, préparé, ou `bilan: null` avec la raison : `absente`, `illisible`, `ancienne`, `a-figer`, `sans-pronostic`), `resumeDeLaCalibration` (le résumé de la page : l'essentiel du bilan, repli sur le dernier mois figé). **`bilanDuMois`, `GARDE_MS` et `oublierLeMois` n'existent plus** : `GET /api/predictions/calibration` ne calcule JAMAIS un bilan. L'étape **« calibrationMensuelle »** (`matchStatsAutoRefresh.js`, entre « moteurABlanc » et « sauvegarde », rien d'ajouté à `ETAPES`) fige le mois écoulé comme avant PUIS prépare le mois en cours : due si un mois attend son gel, si le mois en cours n'est pas préparé aujourd'hui, ou au clic « Actualiser » ; une préparation qui échoue ne fait jamais échouer le gel — l'étape passe à « warn », le dit dans sa phrase, la passe suivante reprend. Écran de la calibration (étape 20) : un mois sans bilan montre « Pas encore mesuré » et, à part, pourquoi ; les dix tranches et les quatre tableaux restent (`CalibrationPanel.vue` : changement ADDITIF, `verifier-interface --avant` ok).

**Pièges.** (1) **La route n'écrit rien et ne calcule rien** : un test lit le code de `bilanPourLaRoute`, `calibrationPourLaRoute`, `resumeDeLaCalibration` et `lireLeMoisPrepare` (ni `travailDuBilan`, ni `calculerBilan`, ni `executer…`, ni `writeJsonAtomic`) et celui de l'assembleur (ses seules importations sont des lectures). (2) **Le jour est celui de Paris** : un bilan calculé la veille à 22 h 30 UTC est du même jour qu'à 0 h 30 à Paris — rien à refaire. (3) **Un fichier d'une autre forme ou d'une autre version du calcul est « ancien »**, jamais lu de travers. (4) **La page ne dit une heure que quand elle la connaît** : la note de départ n'est datée que du jour (« noté le 13/10/2026 »), un rejeu rangé dans la base donne l'heure. (5) **Une lecture qui renvoie n'importe quoi** (`null`) est un cadre « illisible », pas une page cassée. (6) Le bac n'a pas de `data/runtime/calibration-en-cours.json` (aucune passe n'y a tourné : les essais l'écrivent dans leurs copies isolées) ; chez Pierre il sera écrit par la première passe d'après la recopie (jusque-là, la page dit « pas encore mesuré »).

**Résultats.** Copie isolée de la base d'essai, volume de Pierre (6 540 pronostics réglés sur 436 matchs, août figé, septembre préparé) : avant la nuit, la route de la calibration répond en **3,5 ms** (bilan nul, `absente`) et la page en 48 ms ; après, **7 ms** et **20 ms** (13 Ko de page, le bilan entier en fait 93) ; l'étape de nuit fige août en 550 ms (**34 ms** au plus d'affilée) et prépare septembre en 721 ms (**71 ms** au plus d'affilée), la boucle d'événements n'étant **jamais retardée de plus de 66 ms** — le même calcul d'une traite tient 649 ms ; le bilan préparé est **exactement** celui d'une traite. Sur la base du bac, la page entière s'assemble en 34 ms (156 ms à froid). **117 bugs volontaires sur 117 détectés** au passage final (114 au premier : trois trous des tests comblés — le résumé lu par la page, un feu de contrôle inconnu devenu vert, des chiffres sur un bilan sans pronostic réglé), plus deux témoins sans effet restés non détectés comme prévu, un à la fois dans une copie du code du bac (sha1 vérifiée après chaque bug, aucune jonction). `npm test` : **843 tests (841 réussis + 2 constats « # TODO »), 0 échec, ~224 s**, dont 32 nouveaux ([docs/tests.md](tests.md)) ; quatre fichiers d'essai d'avant ajustés (`calibration.test.mjs`, `calibrationEcran.test.mjs`, `aides/script-calibration.mjs` pour la route de la calibration qui lit au lieu de calculer ; `opportunitesEcran.test.mjs` pour un menu à six entrées). `verifier-interface --avant` : ok, 135 composants, aucune perte.

**Pas encore regardé dans un navigateur** (1280 px et 375 px) : la page « Santé du moteur » (les trois feux, la grille de deux colonnes qui passe à une, le petit tableau de deux marchés qui défile, les pastilles d'évolution qui passent à la ligne, la courbe à côté de ses trois chiffres, la liste « à vérifier », les liens de pied), l'entrée du menu et son seul état actif, le fil « Historique moteur › Santé du moteur », et le bloc « Calibration du mois » sans bilan (la note à part).

**Après la recopie** (`sandbox-diff`, puis `sandbox-apply --appliquer`, puis relancer `demarrer-cotemaster.bat` hors d'une passe d'actualisation). `matchStatsAutoRefresh.js` est recopié **entier, en une fois** (il porte aussi la ligne « carnetIA » de l'étape 21 en attente). Aucune table, aucune colonne, aucune nouvelle version du moteur. Fichiers : `server/src/data/calibration.js`, `santeDuMoteur.js` (nouveau), `server/src/api/controllers/engineHealth.controller.js` et `routes/engineHealth.routes.js` (nouveaux), `routes/index.js`, `controllers/calibration.controller.js` (commentaire), `server/src/jobs/matchStatsAutoRefresh.js`, `server/src/data/roadmap/historique.js`, `ui/src/views/EngineHealthView.vue`, `components/analysis/HealthBlockCard.vue`, `utils/santeMoteur.js`, `services/engineHealthApi.js` (nouveaux), `router/index.js`, `components/layout/AppSidebar.vue`, `components/analysis/CalibrationPanel.vue`, `utils/calibration.js`, `services/predictionsApi.js` (commentaire), `ui/DESIGN.md`, `TESTS.md`, et les tests (`santeMoteur.test.mjs`, `santeMoteurEcran.test.mjs`, `aides/script-sante-moteur.mjs` nouveaux ; `calibration.test.mjs`, `calibrationEcran.test.mjs`, `aides/script-calibration.mjs`, `opportunitesEcran.test.mjs` ajustés).
1. **La première passe d'après le démarrage** (ou un clic « Actualiser ») prépare le mois en cours : quelques secondes, le serveur rendu toutes les ~25 ms (jusqu'à ~0,3 s d'affilée, 1,8 s à froid, si un pari du carnet tombe dans le mois). **Jusque-là**, la page Santé du moteur et le bloc « Calibration du mois » disent « pas encore mesuré » pour le mois en cours (le dernier mois figé, s'il y en a un, reste montré par la page) : ce n'est pas une panne.
2. **À ajouter au `.gitignore` du dépôt** (Pierre ou la prochaine session, rien n'a été touché ici) : `server/data/runtime/calibration-en-cours.json` — un instantané réécrit en entier chaque jour (~90 Ko), sans valeur d'historique, comme `team-stats-cache.json` ; même question pour `carnet-ia.json` de l'étape 21.
3. **À vérifier à l'écran** (liste ci-dessus), puis, quand la première passe a tourné : la page affiche le mois en cours (« Octobre 2026 (en cours) », annoncé / réalisé, la courbe), la clôture, « À vérifier » avec les contrôles en échec de la nuit, et le feu des données.
4. **À décider avec Pierre** : la couleur de la page (aujourd'hui celle d'Historique moteur ; une section de plus se règle dans `tokens.css`, § 2 de `DESIGN.md`) ; un bouton « Actualiser » sur la page elle-même (aujourd'hui « Relire » relit seulement) ; le premier club reconnu par son nom, qui tient le serveur jusqu'à 1,8 s à froid dans l'étape de nuit (l'annuaire d'identités, hors périmètre) ; pour l'étape 26, la lecture `LECTEURS.corrections`.

