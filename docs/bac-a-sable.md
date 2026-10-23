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


## Étape 19 — corrections recopiées le 20/10/2026 à 21 h 47

### Étape 19 — corrections du 19-20/10/2026 (après la vérification Fable en ultracode : aucun bloquant, aucune fuite)

**Le « déjà vu » par PORTÉE et par version en service** (`src/bench/lancements.js`). `DONNEES_VUES` (les trois fenêtres du 23/09) vaut pour tout (`pour: ['tout']`) ; chaque fenêtre d'un lancement dit pour QUOI elle a été regardée (`pour` : `moteur`, `statistiques`, `marche`, `indice` — obligatoire, vérifié par `verifierLancements`). `fenetresDeclarees({ portee, declaration })` rend `DONNEES_VUES` + les fenêtres des lancements de cette portée + celles de la candidate rejouée (`candidate:<version>:<n>`). Le banc du moteur lit la portée `moteur` (et la déclaration de la candidate qu'il rejoue : option `declaration` du runner, passée par `bancCandidate`) ; la valeur des statistiques (18) lit `statistiques`, connaître le marché (22) `marche`, l'indice (29) `indice`. Le juge de preuve (`trialsRegistry.fenetresVues`, `jugerEtape`) écarte `DONNEES_VUES`, TOUTES les fenêtres de l'étape jugée (toutes versions, toutes portées) et les fenêtres `moteur` des lancements ENREGISTRÉS des autres étapes. L'étape 29 entre dans `LANCEMENTS` (`indice-v1`, `le: '2026-10-14'`, ses vues et celles de l'étape 18 en portée `indice`) : P2 reste « jamais vue » pour le banc du moteur. À l'écran : « déjà vues (étape 29, version indice-v1) », « (candidate) », « (fenêtre du rejeu) ».

**« Lancer le banc » hors du serveur** (`src/data/db/bancAPart.js` + `bancEnfant.js`, le patron de l'étape 18) : un processus enfant ouvre la base EN LECTURE SEULE, rejoue en rendant la main, envoie son avancement et son résultat ; le serveur tient le verrou « banc », attend, puis RANGE le rejeu dans `bench_runs` (un seul écrivain) avec sa propre mesure dans `bilan.serveur` (retard réel de sa boucle d'événements, `monitorEventLoopDelay` : max et p99 ; RSS avant, au plus haut, après) ; le bilan garde aussi `blocMaxMs` et le retard réel de la boucle du processus qui rejoue (`retardBoucleMaxMs`, `retardBoucleP99Ms`). Délai : 45 min, puis l'enfant est arrêté et le rejeu rangé « en erreur ». Un verrou pris par un autre processus entre la vérification et la pose : 409 dit simplement (plus jamais « lancé »). Mesure par la vraie route sur la base du bac, configuration de Pierre (P2 à P5, trois jeux de prix ; 107 512 rencontres rejouées, 128 809 analyses + 12 997 pour la reproduction, 10 min 47 s) : **le serveur retenu au plus 71 ms, p99 19 ms ; sa RSS 64,6 Mo avant, 72,5 Mo au plus haut, 72,5 Mo après** ; l'enfant au plus 1 109 Mo, rendus à sa sortie (son `blocMaxMs` 619 ms, retard de sa boucle au plus 619 ms, p99 40 ms).

**Un rejeu en erreur n'efface plus le dernier réussi** : `GET /api/bench` rend `dernierRejeu` (le dernier fini, sans résumé) et `dernierRejeuReussi` (avec son résumé, `depotBanc.dernierRejeuReussi`) ; la page (et la santé du moteur) lit le réussi ; l'erreur est rangée dans le bilan du rejeu arrêté.

**La reproduction du 23/09 par le bouton** : dès que P4b est rejouée, même sans le jeu « fd-cloture » (une analyse de plus par rencontre, comptée à part : `bilan.reproductionAnalyses`). Par la route sur la base du bac : 12 997 matchs, 50,26 % de justes, perte log 1,0034, Brier 0,6003, RPS 0,2043 = la référence ; le moteur 12 973 (24 cotes incohérentes refusées), écart 0.

**La note de départ et son commit** : `COMMIT_DU_MOTEUR_DE_DEPART = '2e602ea69ce5a905fbdee6d09c89d86ea626c137'` dans `noteDeDepart.js` — le dernier des cinq commits du 20/10 (`7c2034e` → `2e602ea`, tout ce qui était en service depuis le 03/10, faits et envoyés sur GitHub à la demande de Pierre) ; son contenu porte exactement le moteur de la note (`empreinteDuCode` sur `git archive 2e602ea` : `6ed7e010f507…`, vérifié deux fois, lecture seule). Sans commit (null), la note le dirait (`moteur.commitManquant`, et la page). La garde de l'étape 47 : `exigerLeCommitDeDepart` (40 caractères exigés) ; `bench.mjs --comparer a b --depart` refuse sans commit, et refuse un fichier A qui n'est pas ce moteur. `noteDepuisUnRejeu` recopie maintenant les fenêtres vues des cases (P4b, P2) au lieu de les écrire en dur, et l'écran les lit dans la note.

**Mineurs** : `loiDuCompte` sans loi pour un attendu infini ; les lignes football-data hors magasin d'après juin 2023 comptées par code (`bilan.fdHorsSourceParCode`) et nommées à l'écran (National League, J-League, Écosse) ; la coupure sans repli sur `odds_events.kickoff` dite (aucune rencontre concernée) ; les raisons d'un refus en clair (`raisonDite`).

**Tests** : `npm test` : **846 tests, 844 réussis + 2 constats « # TODO », 0 ignoré, 0 échec, ~244 s** (l'appli de Pierre tournait sur la même machine ; 843 avant) — +3 tests (`banc` 22, `registreMesure` 14), `santeMoteur` retouché (la page de santé lit le dernier rejeu réussi). Nouveaux ou retouchés : `banc` (portée, note, garde du commit, loi du compte, fil du juge fermé — un vrai processus —, candidate avec et sans déclaration), `bancCopies` (route : processus à part, mesure du serveur, course du verrou, rejeu en erreur ; script : `--depart`, l'ancienne borne « 2 s » retirée), `bancEcran` (dernier réussi, reproduction du bouton, refus en clair, vues lues dans la note, lignes hors magasin nommées), `registreMesure` (juge par portée), `indiceForce` (29 dans LANCEMENTS), `valeurStats`, `connaitreMarche`, `adoptionMoteur` (la déclaration passée). Bugs volontaires (copie du code dans le scratchpad, `node_modules` recopiés, 708 fichiers vérifiés par sha1 avant la série et après chaque bug, effacée à la fin) : **26 sur 26 détectés** au passage final — 23 nouveaux (53 à 75 : chemin d'erreur de la route, rejeu à part, mesure du serveur, dernier réussi, reproduction, portée du banc et du juge, déclaration de la candidate, garde du commit, course du verrou, raison en clair, vues de la note, loi du compte, lignes hors magasin) et 3 anciens adaptés (24b, 45b, 49b) ; au premier passage 22 sur 23 (le fil du juge jamais fermé passait : l'essai lançait son processus avec `--input-type=module`, hérité par le fil qui tombait au départ ; réparé). Les 54 du 13/10 rejoués sur le code corrigé : 51 détectés, les 3 autres (texte changé) adaptés et détectés. Vérifié aussi dans la copie : le jour où le commit est écrit dans la note, les essais restent verts. `verifier-interface --avant` : 135 composants compilés, construction ok ; six lignes de script de `BenchView.vue` signalées « disparues » — voulues : la page lit le dernier rejeu RÉUSSI (chacune remplacée par son équivalent).

**Historique** : la retouche est une ligne À PART (étape 19, 20/10, « Retouche du 19-20/10… », comme celle de l'étape 21 le 14/10) — la ligne du 13/10 est inchangée.

**Après la recopie** : aucun fichier du moteur touché (pas de nouvelle version au démarrage) ; `bench_runs` inchangée. « Lancer le banc » tourne dans un processus à part : le serveur garde sa mémoire (~+8 Mo au lieu de ~+0,9 Go) ; le premier rejeu calcule aussi la reproduction du 23/09 (à ± 1 % de matchs et 0,001 de perte log chez Pierre). Le commit du moteur de départ est écrit dans la note (`2e602ea…`) ; la note entre dans le commit qui suit cette recopie. `server/data/runtime/jeton-claude.json`, entré dans `2e602ea`, ne contient PAS le jeton : seulement `version`, `expireLe` (une date) et `majLe` (vérifié par les noms et les longueurs des champs, sans afficher les valeurs) ; aucun secret de `server/.env` ni de `ai-config.json` dans les 504 versions de fichiers envoyées (contrôle avant l'envoi) — pas de réécriture d'historique.



## Mise en service du 22/10/2026 à 17 h 39 : étapes 27, 23 et 30 (une seule recopie, 119 fichiers ; versions précédentes dans bac-a-sable/recopies/2026-10-22_17h39m11/avant)

### Étape 27 — le modèle de buts unique, calé sur le marché (lot 5, écrite dans le bac le 21/10/2026 ; la première moitié : écrite, mesurée au banc, déclarée candidate à blanc — l'adoption viendra après l'essai)

**Un seul modèle pour tous les marchés de buts** (plus/moins 0,5 à 3,5, les deux équipes marquent, buts d'une équipe, résultat + total) **et le score** : une grille des scores (Poisson et Dixon-Coles, ρ −0,05, calculée sur 0-20 buts, 81 cases rendues 0-8 telles quelles, la masse au-delà dite « autre score ») **calée sur les cotes** — la référence 1N2 du moteur (les bookmakers de référence, Pinnacle d'abord) et, quand elle est relevée gratuitement, la cote plus/moins 2,5 (moyenne football-data, sinon les livres ESPN ; jamais Smarkets, une cote payante ni une saisie) —, mélangée aux **forces d'attaque et de défense** des deux équipes tirées de leurs xG (70 %) et de leurs buts, pondérées dans le temps (demi-vies 35/25 matchs, 8 matchs « moyens » ajoutés à chaque club, remise à zéro au premier match d'un nouveau championnat), face aux moyennes de leur championnat à la 90e minute. Le mélange : 10 % de statistiques sur le total et sur l'écart quand le plus/moins existe ; sinon 55 % sur le total, 10 % sur l'écart ; sans cote, les statistiques seules (le 1N2 reste alors l'ancien modèle statistique). Démarrage à froid (E6, retenu après la mesure m7) : sous 8 matchs connus, le total statistique s'appuie sur la moyenne du championnat à proportion. **Pendant l'essai, aucun chiffre ni aucun écran de match ne change** : la clé `modeleDeButs` n'est que dans la déclaration de la candidate, jamais dans les réglages en service.

**La preuve au banc (porte 1)** — P2 = 2019-07-01 → 2023-06-30, football-data, jamais vue, prix d'avant-match, juge de l'étape 16 à **K = 320** (la candidate et ses 319 variantes déclarées) : **30 158 matchs, en bloc +6,10 % [5,53 ; 6,67] d'erreur de prévision en moins, retenu** ; plus/moins +7,87 % [6,94 ; 8,81], buts d'une équipe +8,89 % [8,15 ; 9,64], les deux marquent +5,57 % [4,72 ; 6,43], résultat + total +3,19 % [2,80 ; 3,57] : les quatre familles et les 16 lignes « retenu », aucune moins bonne que le repère ; plus/moins 2,5 face au marché : −0,03 % [−0,07 ; +0,02], au niveau du marché (la version en service : −8,45 %, moins bon) ; ce que le moteur annonce pour son pronostic retenu du plus/moins 2,5 : −14,4 points (trop haut) en service, −0,5 point (dans le hasard) pour la candidate ; score exact (témoin) +0,146 % [0,063 ; 0,229], 13,25 → 13,33 % de scores justes, top 3 34,73 → 34,86 %. Sans cote (16 349 matchs, buts seuls) : +5,20 % [4,43 ; 5,96], mais le plus/moins 2,5 y annonce encore trop haut de 6,1 points (contre 14,8 pour la version en service). **Réserve acceptée** (décision de la coordination du 21/10/2026, écrite telle quelle dans `noteDuModeleDeButs.js`, sur la carte de la candidate et sur la feuille de route) : « Réserve acceptée : trop peu de pronostics pour juger la calibration de résultat + total 2,5 ; l'écart va du côté prudent » (avec sa majuscule partout où elle s'affiche) (+4,07 points pour 164 pronostics retenus contre +1,93 pour 90). Dans le code de la porte (`bancCandidate.porteDuBanc`) : le critère « l'écart de la candidate pas plus grand que celui de la version en service » ne vaut que sur les lignes que le juge peut trancher (200 pronostics ou plus des DEUX côtés, `JUGE.minBlocs`) ; ailleurs, la ligne est « non jugée » et, si l'écart y est plus grand, une réserve dit son sens (prudent / optimiste) — testé (`adoptionMoteur`).

**Où ça vit.** Nouveaux : `core/engine/goalModel.js` (le modèle, pur, que des CODES ; DANS l'empreinte du moteur), `core/engine/motsDuModeleDeButs.js` (TOUS les mots du modèle pour Pierre : mot court et phrase de chaque régime, nom des sources du plus/moins, messages d'un réglage fautif ou d'une erreur du calcul ; HORS de l'empreinte, comme la note : corriger une phrase ne crée pas de version et ne recommence pas l'essai), `data/db/entreesButs.js` (le lecteur du direct : forces « avant J », moyennes, plus/moins relevé avant `maintenant` ; dans l'empreinte), `data/db/forcesButs.js` + `forcesButsEnfant.js` (l'étape de nuit « forcesButs » : calcul dans un processus à part, en lecture seule, différence, rangement par tranches de 250 en rendant la main, contrôle anti-fuite par un second chemin ; hors empreinte), `utils/calculLourd.js` (un calcul lourd à la fois), `core/engine/noteDuModeleDeButs.js` (la note du banc P2 et la fiabilité du score, recopiées d'un rejeu ; hors empreinte), `bench/libellesDesCases.js`, `data/roadmap/bancEtape27.js`, `scripts/forces-buts.mjs`. Retouchés, tout sous la clé : `oddsEngine.js`, `scorePrediction.js`, `verdictPari.js`, `sports/football/{markets,model,index}.js` ; le banc (`entrees`, `prix`, `periodes`, `runner`, `bancCandidate`, `essaiCandidate`, `lancements` — les 320 `VARIANTES_DE_L_ETAPE_27`), `engineVersions.js` (`CANDIDATE_EN_ESSAI`, la porte de l'essai, `porte1DeLaCandidate`), `matchStatsDb.js` (trois tables neuves), l'actualisation (`matchStatsAutoRefresh.js` : l'étape « forcesButs » entre l'indice de force et le gel), le gel, l'essai à blanc, la dérive, le Repérage (`data/screener.js`), la feuille de route. Écrans : `components/analysis/GoalModelProvenance.vue` (neuf), `MarketPicksBoard`, `ScorePredictionCard`, `MarketVerdictBoard`, `views/UpcomingMatchView`, `views/ScreenerView`, `components/settings/EngineGoalModelTrial.vue` (neuf), `EngineVersionsPanel`, `EngineConfigForm`, `views/SettingsView`, `components/roadmap/RoadmapStep`, `utils/modeleDeButs.js` et `utils/bancAvantApres.js` (neufs), `utils/versionsMoteur.js`, `utils/langageParis.js` (le terme « modele-de-buts »), `ui/DESIGN.md`.

**L'empreinte du moteur** : code `16f2459db183a99576365047da98b7777687ef05` (37 fichiers ; en service chez Pierre : `6ed7e010…`). Elle a bougé une dernière fois après la vérification des écrans (21/10 au soir) : les mots du modèle de buts sont sortis de `goalModel.js` vers `motsDuModeleDeButs.js`, hors empreinte (avant : `a7d0f398…`) — un test le garde (changer une phrase de `motsDuModeleDeButs.js` ne change PAS l'empreinte, changer une formule de `goalModel.js` la change) ; les deux bancs P2 rejoués avec ce code (bench_runs n° 9 pour la candidate, n° 10 pour la version en service) sont identiques, ligne à ligne, aux rejeux d'avant (1 256 244 lignes chacun, 0 différente) : aucun chiffre ne bouge. Candidate `modele-buts-v1`, empreinte `f01dd8496f56a415` (avant : `7efbc829…`) ; la note (`noteDuModeleDeButs.js`) régénérée sur le rejeu n° 9 porte cette empreinte, la porte 1 reste sur la carte. Dès ce commit, plus rien ne bouge dans le moteur avant la mise à blanc.

**À l'écran.** Pendant l'essai, seulement Réglages, la santé du moteur et la feuille de route : la carte « Versions du moteur » dit la phrase en mots simples de la candidate (`enMots` de la déclaration, hors de son empreinte : « Un seul modèle pour tous les marchés de buts et le score : les pourcentages partent des cotes (1N2, et plus/moins 2,5 quand il est relevé) et sont ajustés par les xG des deux équipes ; sans cote, les xG (ou, à défaut, les buts) seuls. » ; son « quoi » technique reste au registre de la mesure, et sur la carte seulement dans « Détail technique », replié ; la page « Santé du moteur » dit la même phrase), ses marchés et son témoin en mots, puis, sous la fiche de la candidate, **« Le modèle de buts unique, famille par famille »** — la porte 1 du banc et sa réserve acceptée, un chiffre clé par famille (le verdict de l'essai en mots ; « pas encore » avant l'horizon, le chiffre du banc en détail : « au banc 2019-2023 : +7,9 % d'erreur de prévision en moins, retenu », fourchettes signées comme sur la feuille de route), « Une famille « pas prouvé » à 800 matchs est l'issue normale ; seul « moins bon » est un échec. », la calibration de chaque version, les régimes (« cotes + plus/moins 61 % · cotes 1N2 seule 34 % — sur ces 34 %, le plus/moins ne vient pas du marché · sans cote 5 % : trop peu pour juger »), la porte de l'adoption et l'horizon (« 412 matchs sur 800, jour 11 sur 21 ») ; « Paramètres du moteur » : « Modèle de buts unique : absent — ancien modèle de buts (son essai éventuel se lit dans la carte « Versions du moteur ») » — une phrase qui ne vieillit pas ; la feuille de route, étape 27 — « En cours » (« en essai à blanc, adoption à venir », sans date de fin ; la page dit 29 terminées et 1 en cours) : le tableau « Banc d'essai sur des matchs jamais vus (2019-2023) : avant / après » (17 lignes, « Avant (ancien modèle) » et « Après (modèle de buts unique) » — des en-têtes qui restent justes après l'adoption —, verdict en mots, calibration du pronostic retenu, Σ en bloc), la phrase « football-data n'a pas d'xG : ce banc juge le modèle « cotes + buts » ; les xG se jugent pendant l'essai à blanc », la réserve, où en est l'étape. **Après l'adoption seulement** (la clé en service) : sur la page du match, la provenance des pourcentages de buts (« cotes + xG · Moteur CôteMaster · cote 1N2 Pinnacle + plus/moins 2,5 football-data (moyenne du marché) + xG FotMob · plus/moins relevé … », ambre au-delà de 24 h ; sans plus/moins : « … · aucune cote plus/moins relevée pour ce match » ; sans cote : « … · aucune cote pour ce match · 1N2 : ancien modèle statistique » ; un championnat inconnu du magasin : « moyennes par défaut du moteur », jamais « magasin FotMob ») sous « Buts » et sur « Les 2 équipes marquent » / « Résultat + total », la bulle « Modèle de buts unique » ; la carte du score : la puce du régime, la provenance, « Ce que disent les xG » (par équipe « crée +18 % · concède −9 % », ses matchs connus ; « Ce que disent les buts » quand trop peu d'xG sont connus pour l'une des deux équipes — décidé club par club, jamais « pas d'xG pour ce championnat »), « autre score » dès 0,5 %, la fiabilité selon le régime : « mesurée sur 2019-2023, championnats européens, matchs avec une cote plus/moins 2,5, sans xG » (calé sur la cote 1N2 seule : « pas encore mesurée pour un match sans cote plus/moins relevée (le banc 2019-2023 n'en comptait que 2 sur 30 158) » ; sans cote : « championnats d'Europe, d'Amérique et d'Asie, matchs sans cote d'avant-match ») ; le verdict par marché : sur le 2,5 calé, « une value sur cette ligne ne vient que d'un écart entre votre bookmaker et ce marché » ; le Repérage : la pastille du régime par match (tous les bookmakers comptés : « et 9 autres » sur 12) et la bulle de la colonne 2,5 (« les xG des deux équipes ne comptent que pour 10 % dans le total de buts ») ; « Réinitialiser les valeurs par défaut » demande d'abord confirmation (« Cela retire le modèle de buts unique (étape 27) »).

**Mesures dans le bac** (base du 18/10). Avant tout changement du moteur : le rejeu P2 de la version en service = la note de départ (1 707 feuilles égales, les fourchettes seules suivent le K), le moteur entier figé sur 201 cibles × 4 variantes (`test-figer.mjs --complet`). Forces de la nuit, premier calcul : 122 006 lignes (3 060 clubs, 69 championnats, 61 005 rencontres) en 6,6 s (enfant 4,1 s, 123 Mo ; rangement 1,07 s, plus longue tranche 62 ms) ; contrôle anti-fuite 40 couples, 0 écart. Banc P2 : version en service 3 min 51 s (823 Mo), candidate 4 min 10 s (794 Mo), 46 507 rencontres ; le banc de la version en service identique, ligne à ligne, à celui de l'ancien code (1 256 244 lignes). P3a (2023-01 → 2023-06, rapporté, jamais une porte) : +9,6 % [7,2 ; 12,0] retenu. **La preuve « rien ne change »** : moteur — `moteurCleEteinte` (201 cibles × 4 variantes à l'octet face au calcul figé AVANT le premier changement) ; écrans — la page du match (huit onglets, un match à cotes et un sans cote, réponses du vrai serveur), la carte du score, la planche des pronostics et le verdict par marché sur 12 analyses en service, et le Repérage, rendus avec le code de l'interface du DÉPÔT et celui du bac : **55 rendus identiques** (les commentaires HTML invisibles mis à part : ceux que Vue pose pour un bloc absent, et ceux du gabarit), aucune marque de l'étape 27, aucun appel refusé ; en permanence : `modeleDeButsEcran` (aucune marque ni aucun mot sans la clé, tous avec) et `pageMatchDecisionEcran` (la page en service, ses huit onglets).

**Tests** : `npm test` : **914 tests, 912 réussis + 2 constats « # TODO », 0 échec, ~242 s** (846 avant l'étape) — quatre fichiers neufs (`moteurCleEteinte`, `modeleDeButs`, `forcesButs`, `modeleDeButsEcran`) et quinze complétés ou ajustés, puis, aux trois retouches du soir, `feuilleDeRoute` (+1 : une ligne partielle ne finit pas l'étape), `adoptionMoteur` (+1 : `enMots` hors de l'empreinte), `santeMoteur`, `feuilleDeRouteEcran`, `registreMesure`, puis, à la vérification des écrans, `gardeFou` (+1 : les mots du modèle hors de l'empreinte), `modeleDeButsEcran`, `adoptionMoteur`, `langageParis`, puis, aux retouches de la vérification Fable, `versionsMoteur` (+1), `registreMesure` (+1), `modeleDeButsEcran` (+1), `moteurABlanc` et `forcesButs` (voir `TESTS.md`). Bugs volontaires (copie du code dans le scratchpad, resynchronisée et vérifiée identique au bac, 496 fichiers, `node_modules` recopiés) : **32 sur 32 détectés**, 33 poses — le 23 en deux moitiés : l'import de l'indice de force (garde-fou) et, à l'étape 3, la lecture de stat_value avec les fenêtres de l'étape 18 déclarées par la candidate (23b), qui fait tomber le garde-fou ET « P2 jamais vue » ; le code du bac identique avant et après la série (731 fichiers, sha1 `74d80955…`) ; rejouée après les trois retouches du soir : 33 sur 33 (témoin : 119 tests verts), code identique avant et après (sha1 `a9211a9b…`) ; puis après la vérification des écrans : 33 sur 33 (témoin : 120 tests verts), code identique avant et après (732 fichiers, sha1 `4de113c1…`) ; enfin après les retouches de la vérification Fable, sur le code final : 33 sur 33 (témoin : 120 tests verts), code identique avant et après (733 fichiers, sha1 `bdebe772…`). `verifier-interface --avant` (le src du dépôt) : 137 composants compilés, construction ok ; une ligne signalée « disparue », voulue : les marchés de la candidate dits en mots (les identifiants gardés au survol).

**Écarts à la conception** (le détail dans l'état de l'étape) : sans plus/moins, le marché est rendu exact sur la grille 0-20 en partant de `tauxDuMarche` ; un match prolongé sans score de la 90e compte 0-0 (comme la mesure) ; départs de secours de l'ajustement ; « maintenant » obligatoire dans les forces ; la fiabilité du score dit son périmètre mesuré (« championnats européens » n'est vrai que pour les matchs à cotes : les 22 championnats principaux de football-data ; sans cote, des championnats d'Europe, d'Amérique et d'Asie) ; sans plus/moins, la pastille dit l'heure du calcul et la cote absente ; le 1N2 sans bookmaker de référence se dit par les livres relevés ; la ligne du Repérage porte les vrais fournisseurs ; la confirmation de la remise à zéro est posée dans Réglages (le bouton du formulaire émet comme avant) ; le détail du modèle de buts est un composant à part, posé avant l'essai et l'adoption ; le nom des cases dans un fichier léger, les phrases de la porte en mots ; l'état de l'étape sur la feuille de route : une ligne d'historique PARTIELLE (`partielle` : ce qui reste) ne finit pas l'étape — une étape qui n'a que des lignes partielles est « en cours », elle devient « terminée » à sa première ligne qui ne l'est pas (l'adoption) ; la candidate a sa phrase en mots (`enMots`, hors de son empreinte) ; les mots du modèle de buts dans un module hors empreinte (`motsDuModeleDeButs.js`) ; le régime « buts » se dit club par club (« trop peu d'xG connus pour l'une des deux équipes ») ; les essais des étapes 25-26 qui fabriquent leurs candidates tournent sans la candidate du code.

**Pièges** : un rendu côté serveur de Vite (`middlewareMode`) ouvre encore le port de rechargement à chaud sans `server.ws: false` (les essais d'écran d'avant affichent « Port is already in use » ; le nouveau le ferme) ; pour comparer deux rendus, retirer les commentaires HTML (Vue pose `<!---->` pour un bloc absent, le rendu de développement garde ceux du gabarit) ; `validerCandidate` refuse l'identifiant de la candidate parmi ses variantes : la déclaration les filtre (319 + elle = 320).

**Regardé en direct par la coordination dans le bac** (serveurs 4600/5600, le 21/10 au soir), d'où les trois retouches ; puis **la vérification des écrans** (relecture du code des écrans, 21/10 au soir) : 10 constats, tous corrigés le soir même (les phrases du régime « buts », la fiabilité selon le régime, « et N autres » compté sur la liste entière, le chiffre du banc qui dit ce qu'il mesure, la bulle du 2,5, deux phrases qui ne vieillissent pas, le 2,5 sans cote dans l'historique, « les xG (ou, à défaut, les buts) », les moyennes par défaut dites telles quelles) ; **pas encore regardé après elles** : le « Détail technique » replié de la carte de la candidate, la 27 « En cours » sur la feuille de route (à 375 px aussi) ; les éléments de la page du match, du Repérage et du verdict ne paraissent qu'avec la clé en service (après l'adoption) — pour les voir dans le bac, mettre la clé de la candidate dans les réglages du bac, jamais chez Pierre.

**Après la recopie** (CôteMaster fermé ; `sandbox-apply --appliquer`, puis `demarrer-cotemaster.bat`) : au démarrage, une version « code » de plus (n° 4 : le code du moteur passe de `6ed7e010…` à `16f2459d…`, les chiffres ne changent pas) ; la candidate est en essai dès ce redémarrage de l'appli (K = 320 au registre de la mesure, en une seule écriture), puis calculée à blanc chaque nuit : à la première passe d'actualisation, l'étape « forcesButs » construit les forces pour l'empreinte de la candidate (10 à 15 s chez Pierre) ; « moteurABlanc », une fois par nuit, la calcule à blanc (« en attente » et refait à la passe suivante tant que ses forces ne sont pas à jour) ; la carte de la candidate montre ses régimes et « pas prouvé est l'issue normale » dès le premier calcul à blanc ; l'adoption, d'un clic, après 800 matchs joués et 21 jours, seulement sur « retenu » et la porte de l'adoption franchie. Les trois tables neuves (`forces_buts`, `forces_buts_ligues`, `forces_buts_state`) se créent au démarrage.

**Retouches mineures après la vérification Fable en ultracode** (21/10 au soir ; quatre angles « prêt », aucun constat non mineur ; toutes HORS de l'empreinte : moteur `16f2459d…` et candidate `f01dd8496f56a415` inchangés, vérifiés) : la candidate au modèle de buts n'est pas calculée à blanc tant que SES forces de buts ne sont pas à jour (jamais calculées, rangement interrompu, autre version) — le bilan de la nuit dit « en attente : forces de buts pas à jour (…) — rien calculé à blanc cette fois, la passe suivante refera le calcul », et l'étape revient à la passe suivante (`moteurABlanc.js`, `matchStatsAutoRefresh.js`) ; `PUT /api/config` refuse (400) une clé `modeleDeButs` fautive, « Réglages du modèle de buts refusés, rien n’a changé : 1 réglage à revoir (rho). », sans rien écrire (`null` reste accepté : la sortie de secours ; `api/controllers/config.controller.js`) ; la candidate et ses 319 variantes sont comptées au registre de la mesure en UNE écriture (`declarerVariantes`, `trialsRegistry.js`) au lieu de 320 de suite sous OneDrive ; les écarts des contrôles anti-fuite de la nuit (table du jour J et forces de buts) se lisent enfin à l'écran — la carte « Actualisation automatique » de Réglages (« Contrôle anti-fuite de la nuit : à regarder », une ligne par contrôle, en mots simples ; `RefreshStatusPanel`) et la puce du haut (`AppTopbar`) — les mots dans `utils/controlesAntiFuite.js` (neuf) ; le contrôle anti-fuite de la nuit porte sur TOUTES les empreintes demandées (la version en service et la candidate, 40 couples chacune), chaque écart nomme son empreinte (`forcesButs.js`).

**Limites connues** (écrites, sans correctif avant la mise en service) : au banc et la nuit, les moyennes de championnat sont bornées « au jour près » — un coup d'envoi juste après minuit UTC voit, dans les moyennes de la veille, des matchs finis après sa coupure (5,1 % des rencontres du magasin, moyennes de ligue seulement ; jamais le direct ni P2) ; la décision m7 (démarrage à froid) a été mesurée, côté football-data, avec les forces retenues par m2 (35/35, k0 16, buts, 0,6), pas celles de la candidate — côté magasin, avec celles de la candidate ; la décision est la même ; un match prolongé sans score de la 90e compte 0-0, comme la mesure ; le banc de la candidate tourne dans le serveur, exclu des autres calculs lourds par le verrou de l'actualisation (pas par le jeton) : sa mémoire est à mesurer chez Pierre avant de l'offrir au clic sur un PC chargé.

**Pour la candidate suivante** (chacune change l'empreinte : K + 1, rejeux à refaire) : le lecteur du direct et le banc lisent le jour UTC de « coup d'envoi − 3 h » quand l'heure est sûre, et `coupureDuDirect` rend l'`heureSure` reçue au lieu de toujours vrai (fuites 1 et 3) ; un drapeau `borne` quand l'ancrage reste collé à une borne [0,05 ; 6], compté dans les analyses à blanc (modèle 1) ; un plancher de 0,05 dans `moyennesAvant` (modèle 2) ; la même précision (6 décimales) pour la grille du score de la version en service et pour celle de la candidate dans le témoin du banc (modèle 3) ; Smarkets et les autres lignes de plus/moins (1,5, 3,5) comme ancres du total. **À l'horizon de l'essai** (800 matchs, 21 jours), avant le clic d'adoption : exiger le verdict du juge (K = 320) sur les matchs « cote 1N2 seule » (régimes `cotes-1n2-xg` et `cotes-1n2-buts`), famille par famille ; « moins bon » → la candidate retourne au modèle (nouvelle candidate, K + 1), jamais d'adoption par morceaux (modèle 4).

**Historique** : une ligne pour l'étape 27 (21/10, « la première moitié de l'étape — l'étape n'est pas finie »), marquée `partielle: 'en essai à blanc, adoption à venir'` (elle dit « en essai dès le redémarrage de l’appli, puis calculé à blanc chaque nuit ») : la feuille de route compte la 27 « en cours » (29 terminées, 1 en cours), sans date de fin, et le dit sous « pas encore terminée » ; son bloc dit où elle en est (« En service comme candidate à blanc … Adoption à venir »). À l'adoption, une ligne qui n'est pas partielle la finira.


### Étape 23 — Où parier : la carte championnat × marché (lot 4, écrite dans le bac le 22/10/2026, par-dessus l'étape 27 ; mise en service avec les étapes 27 et 30)

**Ce que c'est.** Une carte, championnats en lignes, marchés en colonnes (13 : résultat 1N2, plus/moins 1,5 / 2,5 / 3,5, les deux équipes marquent, buts d'une équipe, résultat + total, corners, tirs, tirs cadrés — du match et d'une équipe). Chaque case dit si le moteur a un avantage **prouvé** à cet endroit, avec son nombre de matchs. **Verte** seulement si l'avantage AU PRIX est prouvé : la valeur de clôture (la cote a ensuite donné raison au moteur) dépasse le hasard sur au moins 200 matchs. **Rouge** si le moteur fait prouvé moins bien que le marché (ses probabilités se trompent plus que la cote, ou la cote part contre lui après ses choix). **Grise** sinon : pas prouvé, trop peu de matchs (« 46 / 200 »), pas encore mesurée, contradictoire, ou pas de cote archivée pour ce marché (corners, tirs, buts d'une équipe, résultat + total : impossible de mesurer un avantage contre le bookmaker). La carte ne change AUCUN chiffre du moteur : elle trie et avertit.

**D'où viennent les mesures (rien n'est rejoué, rien n'est re-jugé pour l'historique).**
- Le **banc d'essai** (étape 19) : sa carte championnat × marché sur 2019-2023 (football-data, jamais vue, prix d'avant-match), déjà jugée par le juge de l'étape 16 avec K' = toutes ses cases. La carte en relit deux épreuves : la perte log face au marché (1N2 et plus/moins 2,5 ; elle peut rendre une case ROUGE, jamais verte — être plus juste que la cote juste ne paie pas la marge) et la valeur de clôture des paris simulés (1N2 ; verte ou rouge). Le rejeu lu est le dernier du moteur EN SERVICE (même empreinte) ; à défaut, le dernier aux mêmes réglages (« version de code précédente », dit) ; aux réglages différents, aucun. 2023-2024 (déjà regardé) : indicatif seulement.
- La **valeur de clôture des pronostics gelés** du moteur (engine_picks, première valeur ; la mesure de la calibration de l'étape 20), depuis le 24/09/2026 ou la dernière ADOPTION qui touche la famille de marchés (une adoption du modèle de buts repart à zéro pour les buts et les deux équipes marquent ; un retour arrière, pour tout). Écartés ET comptés : avant la fenêtre, déjà vu, sans identifiant de club, mesures « à l'ouverture » (le prix du moment du gel inconnu : pour le 1N2, le moteur suit la cote, un mouvement d'avant le gel lui serait crédité).
- **Pour information seulement** (jamais une couleur) : vos vrais paris (nombre, valeur de clôture, rendement), la comparaison à la moyenne du championnat (repère), 2023-2024, le meilleur moment pour parier (étape 22).

**Le juge** : celui de l'étape 16 (`comparer`), jamais recodé (un test le garde). Pour la mesure en direct : une ligne par pronostic, bloc = le match, minimum 200 matchs (jamais baissé), et `variantes` = Kv × R — Kv = toutes les cases qui ont au moins une mesure, comptées avant le premier verdict ; R = max(24, cartes déjà calculées + 1) : chaque carte regarde à nouveau les mêmes données grossies, 24 regards prévus d'avance (deux ans de cartes). Une case maigre ne prend JAMAIS de couleur, même si on lui donnait un verdict (défense en profondeur dans la règle).

**Quand elle se calcule.** Étape « carteOuParier » de l'actualisation, juste après la calibration du mois et avant la sauvegarde : dès qu'un rejeu du banc existe et qu'aucune carte n'est faite ; à un nouveau rejeu ; quand les réglages du moteur ont changé (et qu'un rejeu les mesure) ; le 1er du mois à partir de 6 h (Paris). Un clic « Actualiser » ne la refait pas (chaque calcul rend le juge plus sévère). Le calcul tourne dans un processus à part (base en lecture seule, jeton du calcul lourd ; ~15 s sur la base du bac), le serveur range la carte UNE fois dans la table `betting_map` (jamais réécrite, toutes gardées, ~0,3 Mo chacune). **Le banc du mois** : après une passe (verrou rendu, jamais pendant), le 1er du mois à partir de 6 h, si un rejeu réussi existe mais qu'aucun ne mesure le moteur en service, et si le moteur a changé AVANT le 1er : un rejeu P2 + P3 au prix d'avant-match (~5 min, ~1,1 Go dans son processus, jeton du calcul lourd), une tentative par mois. Jamais le PREMIER rejeu : tant que le bouton « Lancer le banc » n'a jamais servi, rien ne part tout seul.

**Où ça se voit.**
- **Opportunités** : chaque ligne porte la puce de sa case (« Prouvé » en vert, « Moins bien » en rouge, « Pas prouvé » / « Trop peu » en gris) ; les paris des cases vertes en tête (à verdict égal), ceux des cases ROUGES à la fin de la liste — même un favori —, avec l'avertissement sous le pari (« Moins bien que le marché : ici le moteur se trompe plus que la cote (−9,5 % … sur 2 208 matchs, 2019-2023) — son écart avec la cote n'est pas une value. ») ; rien n'est retiré, le verdict et la pastille de value ne changent pas ; une notification d'une value en case rouge le dit. En bas de la page, la carte « Où parier — la carte du mois » : le résumé, et au clic « Afficher la carte » la grille (`BettingMapGrid` : sélecteur de groupe de marchés, « seulement les championnats jugés », favoris en tête, Σ par colonne, le détail d'une case au clic — ses épreuves et ses informations —, les championnats à ajouter, la règle en mots).
- **Repérage** : la puce sur le marché choisi (vert / rouge ; le gris au survol), et un tri « Carte « où parier » (cases vertes d'abord) » quand une carte existe.
- **Route** : `GET /api/betting-map` (lecture seule ; `?mois=AAAA-MM`, `?id=N`, `?resume=oui`). La page du banc d'essai dit aussi ce qu'a fait le banc du mois.
- **Couleur** : le MÊME vert que la value pour « Prouvé » (décision de Pierre du 22/10/2026), avec le mot et la coche ; l'exception est écrite dans `ui/DESIGN.md` § 3 bis.

**Où ça vit.** Neufs : `server/src/data/bettingMap.js` (léger : colonnes, règle de couleur, phrases, table, lecteurs), `bettingMapCalcul.js` (le calcul), `bettingMapEnfant.js` (le processus à part), `rejeuDuServeur.js` (la tâche de rejeu partagée avec le bouton, et le banc du mois), `api/controllers/bettingMap.controller.js`, `api/routes/bettingMap.routes.js` ; `ui/src/components/analysis/BettingMapGrid.vue`, `ui/src/components/common/BettingMapChip.vue`, `ui/src/utils/carteOuParier.js`, `ui/src/services/bettingMapApi.js`. Retouchés : `matchStatsDb.js` (table `betting_map` et son trigger), `matchStatsAutoRefresh.js` (l'étape, et le banc du mois après la passe), `bench.controller.js` (la tâche partagée ; `bancDuMois` dans GET /api/bench), `routes/index.js`, `opportunities.js`, `screener.js` (à la lecture seulement), `ui/src/utils/opportunites.js`, `ui/src/utils/langageParis.js` (le terme « carte-ou-parier »), `OpportunitiesView.vue`, `ScreenerView.vue`, `ui/DESIGN.md`, la feuille de route. Aucun fichier du moteur (empreinte inchangée : `16f2459d…`, candidate `f01dd8496f56a415`).

**Le chiffre attendu (base du bac, banc n° 10, moteur en service)** : 73 championnats × 13 colonnes = 949 cases — **0 verte, 19 rouges** (le plus/moins 2,5 dans 18 championnats suivis + la National League anglaise : le moteur en service y est prouvé moins juste que le marché, −6 à −12 % de perte log), **930 grises** (584 sans cote archivée, 244 pas encore mesurées, 77 trop peu de matchs — la plus remplie en direct : 47 matchs, MLS 1N2 —, 25 pas prouvé). Avec la candidate de l'étape 27 adoptée (banc n° 9) : il ne reste qu'une rouge (Bundesliga 2). Rien de vert, c'est une information : le moteur ne bat pas le marché là où on peut le mesurer ; il faudrait, à 200 matchs, une valeur de clôture d'au moins +2,6 % en 1N2 (+1,5 % plus/moins, +0,8 % les deux marquent) — elle est de −0,1 % tous championnats réunis.

**Après la recopie chez Pierre** (avec les étapes 27 et 30) : au premier démarrage, la table `betting_map` se crée, vide. **Aucun rejeu du banc n'existe chez lui** : la carte dit « Pas encore mesuré : la carte a besoin d'un premier rejeu du banc d'essai… », les lignes d'Opportunités n'ont pas de puce, le Repérage n'a pas le tri « carte », et rien ne part tout seul — ni le 01/11 (le banc du mois ne lance jamais le premier rejeu). **Pour avoir une carte tout de suite** : Historique moteur › Banc d'essai › « Lancer le banc » (10 à 13 minutes, P2 à P5) ; la carte se calcule à la passe d'actualisation qui suit (ou « Actualiser » dans Réglages, tant qu'aucune carte n'existe), puis le 1er de chaque mois ; le banc est relancé tout seul le 1er du mois quand le moteur a changé. La feuille de route compte la 23 « terminée » : le **lot 4 (Mesure) est complet, 9 / 9**, et son bilan de fin de lot reste à faire avec Pierre.

**Tests** : `carteOuParier.test.mjs` (25 tests : petit échantillon jamais vert ni rouge — 199 matchs à +20 %, 300 tirages au sort, deux lignes par match, verdict fabriqué sous 200 — ; K compté — Kv × max(24, regards + 1), réglages du juge par défaut, un vrai petit avantage « retenu » seul reste « pas prouvé » parmi 100 cases ; jamais recoder le juge ; rouge prouvée ; sans cote toujours grise ; contradictoire ; banc relu, K' insuffisant, rejeu exact / code précédent / aucun ; vos paris ne décident jamais ; fenêtre du direct et ses écarts comptés ; table jamais réécrite ; lecteurs et carte d'autres réglages ; colonnes ; quand la carte, quand le banc du mois ; l'étape de la passe ; Opportunités ; la route ; le bandeau honnête) et `carteOuParierEcran.test.mjs` (8 tests : règles de l'écran, rendu de la grille avec et sans carte, une case verte, hygiène du vert, câblage). Ajustés : `moteurABlanc` (l'ordre des étapes : la carte entre la calibration et la sauvegarde), `langageParis` (le terme « carte-ou-parier »), `feuilleDeRouteEcran` (le lot 4 désormais terminé). **`npm test` : 947 tests, 945 réussis + 2 constats « # TODO », 0 échec, ~228 s** (914 avant l'étape). **Bugs volontaires** : 25 sur 25 détectés (copie du code serveur + interface dans le scratchpad, `node_modules` en jonctions vers le dépôt), code du bac identique avant et après (745 fichiers, sha1 `8d046437…` sur le code final). La campagne de l'étape 27 rejouée : 33 poses (32 bugs), 33 tombent, code du bac identique avant et après (`93d1ef0f…`). `verifier-interface --avant` (le src du dépôt) : 139 composants, construction ok, seule la ligne « disparue » voulue de l'étape 27 (EngineVersionsPanel) — les ajouts du Repérage posés à côté des lignes d'origine, sans en changer une.

**Écarts à la conception** : le module du banc du mois est dans `src/data` et non `src/bench` (le garde-fou interdit toute base dans `src/bench`) ; la grille est sur la page Opportunités, lue au clic (aucune lecture au chargement de la page) ; une carte d'autres réglages suspend ses couleurs dans Opportunités et le Repérage au lieu d'être recalculée sans banc ; le banc du mois ne lance jamais le premier rejeu, et attend le 1er du mois suivant pour un moteur changé dans le mois ; la mesure en direct lit tous les pronostics gelés (le filtre de date se fait dans le code, pour compter ce qui est écarté).

**Limites** : les colonnes 1,5 et 3,5 se rempliront lentement (le gel ne garde qu'une ligne de buts par match, 2,5 le plus souvent) ; le 1N2 historique repose sur des prix disparus (William Hill, Pinnacle) : une case verte « paris simulés 2019-2023 » dit un avantage passé ; ouvrir la base du bac en lecture seule touche son fichier `-shm` (mémoire partagée du journal, normal en mode WAL).


### Étape 30 — Fiches des joueurs par poste et force du onze (lot 5, écrite dans le bac le 22/10/2026, par-dessus les étapes 27 et 23 ; mise en service avec elles)

**Ce que c'est.** Chaque nuit, une **fiche par joueur** : ce qu'il produit par 90 minutes, composante par composante, telle qu'elle vaut « au lendemain du dernier jour de la table du jour J ». Les composantes :
- xG hors penalty, xA, xG cadrés, tirs, passes clés ;
- récupérations et duels gagnés, corrigés de la possession ;
- xG concédés pendant qu'il est sur le terrain, d'après les cartes de tirs complètes, penalties retirés ;
- note FotMob ;
- buts évités pour les gardiens.

Chaque composante est :
- pondérée dans le temps (demi-vie en apparitions, remesurée) ;
- **corrigée** de l'adversaire (ses xG concédés ou produits d'avant le match, la formule de l'étape 27) et du niveau du championnat (28 facteurs appris) ;
- **ramenée vers la moyenne de son poste** dans son championnat (365 jours) : un joueur de 5 minutes ne vaut jamais 18 xG par 90.

Sous 270 minutes, la fiche est « peu jouée » et ramenée vers 0,85 × la moyenne. Elle donne deux **apports**, en buts par 90 :
- offensif : xG + xA au-dessus de la moyenne du poste (repli tirs / passes clés sans xG) ;
- défensif : la moyenne du poste moins ses xG concédés.

Chaque club a aussi son **équipe habituelle** : les parts de titularisation, demi-vie 5 feuilles, seulement sur les feuilles d'au moins 9 titulaires identifiés. La **force du onze** d'une composition compare, ligne par ligne, les apports des onze annoncés à ceux de l'équipe habituelle. Elle dit aussi :
- les inconnus (0,80 × la moyenne de la ligne) ;
- les non établis ;
- la part des habituels absents ;
- si le gardien habituel joue.

**Règle de Pierre : affichage seulement.** La force du onze n'entre JAMAIS dans les calculs du moteur. La règle tient à quatre gardes :
- aucun fichier de l'empreinte du moteur n'atteint ces modules (test) ;
- l'analyse IA ne la reçoit pas ;
- empreinte du moteur inchangée `16f2459d…`, candidate `f01dd8496f56a415` ;
- elle est **mesurée à blanc** depuis le lancement de l'étape.

Le banc de la construction (2023-07-01 → 2026-09-23, la seule fenêtre permise ; K = 19 variantes) dit :
- **1N2 : rien de prouvé** :
  - à la clôture, 0,00 % [−0,05 ; +0,04] ;
  - à la pré-clôture, 0,00 % [−0,12 ; +0,12] ;
  - la cote sait déjà qui joue ;
- **tirs d'équipe : +0,16 % [+0,11 ; +0,21], retenu**.

Le brancher un jour (tirs, corners, buteurs, aux étapes 33-34) est une **question posée à Pierre** ; rien n'est branché ici.

**Justesse des fiches face à la moyenne du poste** (apparitions d'au moins 20 minutes, 2024-07 → 2026-09-23, en unités corrigées) :

| Composante | Gain |
|---|---|
| xG hors penalty | 6,2 % |
| xA | 9,7 % |
| xG cadrés | 3,8 % |
| tirs | 9,8 % |
| passes clés | 11,5 % |
| récupérations | 11,2 % |
| duels | 12,3 % |
| xG concédés | 2,8 % |
| note | 5,4 % |
| buts évités | ≈ 0, jamais utilisés dans la force du onze |

**Quand ça se calcule.** L'étape de nuit « fichesJoueurs » :
- place : après « forcesButs », avant le gel des pronostics, la candidate à blanc et la sauvegarde ;
- fréquence : une fois par jour civil de Paris, au clic, quand la passe d'avant l'a reportée, ou quand les fiches ne sont pas à jour.

Le calcul se fait dans un **processus à part**, base en lecture seule, tas plafonné à 768 Mo, jeton du calcul lourd (un banc qui tourne → « reporté »). Il suit ces étapes :
1. l'empreinte de la table du jour J (rencontres, comptes, fusions ; jamais une heure) — rien de changé → « rien », 0,4 s ;
2. sinon, le rejeu complet ;
3. la différence avec ce qui est rangé ;
4. le **contrôle anti-fuite** : 40 joueurs recalculés « avant J » par un second chemin en SQL, tolérance 1e-9 ;
5. la mesure à blanc.

Le serveur range seul, par tranches de 250 lignes, une transaction chacune, jamais ouverte pendant qu'il rend la main. Un écart du contrôle pose l'alerte durable « Fiches des joueurs (force du onze) » (Réglages › Actualisation, puce du haut).

**Le premier calcul sur la base du bac** (serveur arrêté, `node scripts/player-ratings.mjs --banc`) :

| Mesure | Résultat |
|---|---|
| Fiches | 53 194 joueurs, dont 33 401 établies |
| Équipes habituelles | 1 678 |
| Lignes rangées | 54 872 |
| Durée totale | 41,6 s |
| Calcul à part | 39,1 s : lecture 12,0 s, rejeu 23,7 s, différence 1,5 s, contrôle 2,0 s |
| Mémoire de l'enfant | 479 Mo au plus |
| Rangement | 2,0 s, plus longue tranche 43 ms |
| Boucle du serveur | jamais tenue plus de 63 ms d'affilée |
| Journal (-wal) | 5,1 Mo au plus |
| Contrôle anti-fuite | 40 joueurs, 0 écart |
| Banc | 59 s, rangé dans `player_ratings_state` (« banc ») |
| Seconde passe | « rien » en 0,4 s |

En tête des apports offensifs : Olise, Messi, Raphinha, Lamine Yamal, Luis Díaz.

**Où ça se voit.**
- Pas encore d'écran (étape 31).
- La page du match à venir reçoit `forceDuOnze` pour chaque camp, dans la composition annoncée et dans la dernière alignée (`lineupContext.avecForceDuOnze`), lue dans les tables en quelques millisecondes ; null sans fiches ou sans équipe habituelle.
- Route `GET /api/match-stats/player-ratings`, en lecture seule. Elle prend :
  - `?player=fotmob-N` : la fiche et sa courbe des 20 dernières valeurs ;
  - `?club=N` : les fiches du club et son équipe habituelle ;
  - `?league=…&poste=1-4` : les fiches établies, des meilleurs aux moins bons.

  Toujours avec l'état, le bilan, le contrôle, la mesure à blanc et le banc.
- Réglages › Actualisation : la ligne de l'étape, et l'alerte anti-fuite s'il y a un écart.

**Où ça vit.**
- Neufs :
  - `server/src/data/db/playerRatings.js` : réglages versionnés, rejeu, force du onze pure, lecture en colonnes typées, différence, contrôle, rangement, état, lecteurs ;
  - `playerRatingsEnfant.js` : le processus à part ;
  - `playerRatingsBanc.js` : mesure à blanc, banc, facteurs, repli ;
  - `server/scripts/player-ratings.mjs` : bac seulement, serveur arrêté ;
  - `server/test/fichesJoueurs.test.mjs` et `test/aides/script-fiches-joueurs.mjs`.
- Retouchés :
  - `matchStatsDb.js` : les tables `player_ratings`, `player_ratings_teams`, `player_ratings_state` ;
  - `matchStatsAutoRefresh.js` : l'étape ;
  - `bench/lancements.js` : la portée « joueurs », l'étape 30 `fiches-v1`, 19 variantes, deux vues pour les joueurs seulement, datée au premier démarrage ;
  - `lineupContext.js` ;
  - `matchStats.controller.js` et `matchStats.routes.js` ;
  - `ui/src/utils/controlesAntiFuite.js` ;
  - la feuille de route.
- Aucun fichier du moteur.

**Après la recopie chez Pierre** (avec 27 et 23) :
1. Au premier démarrage, les trois tables se créent vides et l'étape 30 est datée au registre de la mesure (la mesure à blanc commence ce jour-là).
2. La première passe de nuit (ou « Actualiser ») fait le premier calcul :
   - ~40 s dans un processus à part, ~480 Mo chez lui ;
   - quelques secondes de rangement.

   Ensuite, une nuit sans rien de neuf : « rien ».
3. Aucun écran ne change avant l'étape 31, et aucun chiffre du moteur ne change.

**Tests** : `fichesJoueurs.test.mjs`, 17 tests :
- les pièges FotMob des postes ;
- l'identifiant 0 ;
- les feuilles de moins de 9 titulaires et les drapeaux manquants ;
- les minutes minimales (formule à la main) ;
- les xG concédés et le signe de l'apport défensif ;
- les dribbles jamais lus ;
- les corrections (adversaire, championnat, possession) ;
- l'ordre du temps (fuite refusée, 9-0 planté) ;
- le banc (inclinaison, tirs, fenêtre, date du lancement) ;
- la règle de Pierre (graphe des imports du moteur, analyse IA, enfant en lecture seule, aucune horloge) ;
- le lancement ;
- l'alerte à l'écran ;
- la nuit (à part, rien, tardive, fusion, interrompu, transactions, reporté, échec, ordre) ;
- **l'oracle de la copie tronquée** (fiches, équipes habituelles et force du onze lues = celles du rejeu avant J, 0 écart ; contrôle anti-fuite honnête 0 écart, fuite plantée trouvée) ;
- le lecteur de la page du match et la route.

Ajustés : `connaitreMarche`, `indiceForce` (l'ordre des étapes) et `registreMesure` (l'étape 30 aux lancements).

**`npm test` : 964 tests, 962 réussis + 2 constats « # TODO », 0 échec, ~216 s** (947 avant l'étape).

**Bugs volontaires** : 43 sur 43 détectés, chacun sur le test qu’il vise (copie du code serveur + interface dans le scratchpad, `node_modules` en jonctions vers le dépôt ; témoin : 17 tests verts) — au premier passage 42 sur 43 : « l’identifiant 0 lu » ne tombait que sur l’essai pur, l’essai de lecture plante désormais une ligne 0 dans la table ; code du bac identique avant et après (751 fichiers, sha1 `26c37865…` sur le code final).

**Campagnes rejouées** : 27 — témoin 120 verts, 33 poses (32 bugs, le 23 en deux moitiés), 33 tombent ; 23 — témoin 33 verts, 25 sur 25 ; code du bac identique avant et après chacune (`26c37865…`).

**`verifier-interface --avant`** : 139 composants, 0 erreur, construction ok (5,9 s, dossier temporaire, dossier de l’interface intact) ; seule la ligne « disparue » voulue de l’étape 27 (EngineVersionsPanel).

**Écarts à la conception** :
- La justesse des fiches est mesurée sur les apparitions d'au moins 20 minutes et en unités corrigées : l'adversaire du jour est retiré des deux côtés, la fiche est jugée seule. Au prototype, la correction était créditée à la fiche, d'où xG concédés 7,9 % → 2,8 % ici.
- L'empreinte « rien » est celle des rencontres de l'étape 29, plus les comptes de la table et le repère des fusions, jamais une heure.
- Sans part d'au moins 2 %, pas d'équipe habituelle.
- La force du onze du banc prend les moyennes du championnat du club, comme le lecteur.
- 43 bugs volontaires au lieu de 22.
- Le banc range son rapport dans `player_ratings_state`.
- Le script refuse la vraie base, OneDrive, une base occupée et un verrou tenu.

**Limites** :
- Les fiches suivent la table du jour J : un joueur sans identifiant FotMob n'en a pas.
- Les coupes n'entrent pas dans les moyennes de poste.
- Le libéro (poste 5) n'existe pas au magasin.
- Ouvrir la base du bac en lecture seule touche son `-shm` (normal en mode WAL).



## Mise en service du 23/10/2026 à 21 h 16 : étapes 31, 42, 37 et 44 (une seule recopie, 97 fichiers ; versions précédentes dans bac-a-sable/recopies/2026-10-23_21h16m37/avant)

### Étape 31 — Fiches à l'écran (lot 5, écrite dans le bac le 22/10/2026, par-dessus les étapes 27, 23 et 30 ; mise en service avec elles)

**Ce que c'est.** Des écrans qui **lisent** ce que les étapes 15, 18, 22, 29 et 30 ont déjà calculé. Rien ne se calcule en ouvrant une page, aucun appel payant ne part (ni `lineups-by-name`, ni `resolveTeamAverages`). Règles communes à tous les blocs :
- ils disent leur **source réelle** et l'**heure** de leur calcul (`ProvenanceChip` : « FotMob (magasin) · indice de force calculé le 18/10 à 21:16 », jamais « Cotes marché (Odds API) ») ;
- ils restent **affichés même vides** (« pas encore calculé », « pas assez de matchs », « non relevé », « pas coté ») et une lecture qui échoue garde leurs tableaux : en-têtes, toutes les lignes, Σ et ⌀ ;
- **Σ** compte (matchs, cotes, statistiques, livres), **⌀** moyenne, jamais une somme de pourcentages ; le vrai signe moins « − » ; le logo du club sur chaque ligne qui nomme une équipe ou un joueur ;
- un **championnat** se dit par le nom que l'appli lui donne (celui du badge de la compétition : « EPL », « Bundesliga » pour « Bundesliga - Germany »), jamais par un code collé à « de » : « devant 98 % des clubs du championnat (EPL) », comme la fiche du joueur dit « des milieux du championnat (EPL) ».

**Ce que voit Pierre, écran par écran.**
- **Page d'une équipe** (`/equipe/<nom>?league=<championnat>`, onglet Résumé, après « Meilleures statistiques ») : le bloc **Indice de force** (étape 29). Cinq chiffres (note de force en buts d'écart avec un club moyen, place dans son championnat, à domicile, à l'extérieur, matchs en mémoire dont ceux avec xG) ; les **points forts** (place ≥ 75 %, bleus) et **points faibles** (≤ 25 %, ambre) ; le tableau des **treize statistiques** au total, à domicile et à l'extérieur (valeur + place en %), avec Σ et ⌀ ; **la forme** (courbe des 30 derniers matchs, « aujourd'hui / il y a 5, 10, 20 matchs », une phrase) ; la mesure au banc d'essai (« pas encore mesuré » tant que le banc n'a pas jugé). Jamais de vert ni de rouge : une force n'est pas une value.
- **Fiche d'un joueur** (`/joueur/fotmob-<id>`, entre la saison et « Match par match ») : le bloc **Note par poste** (étape 30). Le joueur (drapeau, club et logo, poste, « fiche établie » ou « peu joué ») ; ses **deux apports** (offensif, défensif, en buts par match) et leur place parmi les joueurs du même poste du championnat (« sans objet » pour l'apport offensif d'un gardien ; « pas de place : fiche pas encore établie » sous 270 minutes) ; les **dix tuiles** de composantes, celles du poste d'abord (un gardien : les buts évités en tête, jamais de zéros de joueur de champ) avec la mémoire derrière ; la **courbe** des vingt dernières apparitions et son tableau (adversaire avec son logo), Σ et ⌀. **Les notes des joueurs n'apparaissent jamais sur le terrain des compositions** (un test le garde) ; les « juste les notes » de match et de saison y restent.
- **Statistiques ligue** (`/matches?onglet=stats`) : les **repères du championnat** et leur évolution sont ceux de l'étape 15 (déjà à l'écran, vérifiés, rien refait). **Sous eux**, le tableau **« Ce qui prédit, ce qui trompe »** (étape 18) : quatre tableaux toujours complets (équipes FotMob 26 lignes, équipes football-data 18, joueurs FotMob 16, fenêtre du moteur 6), avec fiabilité, matchs nécessaires, pouvoir de prédiction, demi-vie, bonne fenêtre et verdict. **Ce qui compte est vert, ce qui trompe est rouge**, trop peu de matchs est ambre (la demande du cahier de l'étape 18 ; exception à la règle d'or « le vert dit value » documentée dans `ui/DESIGN.md`). Il dit qu'il porte sur tous les championnats réunis, pas sur celui qu'on a choisi ; aucun bouton ne lance le calcul d'ici.
- **Nouvelle page Bookmakers** (`/bookmakers`, `/bookmakers?championnat=EPL`, entrée du menu juste après « Mes paris », même couleur : aucune couleur de plus) : ce que l'étape 22 a mesuré du marché. Un bandeau (calcul n° N, « Relire », le sélecteur de championnat — favoris d'abord et étoilés —, provenance et heure, quatre chiffres clés) puis six cartes toujours entières : **Quand parier ?** (conclusion, valeur de clôture de chaque moment, « tôt contre tard » jugé par le hasard, championnat par championnat, un clic le choisit) ; **Qui est le plus juste ?** et **Qui bouge le premier ?** (un onglet par moment du prix, le meneur est celui qui bat le plus d'autres livres sur leurs matchs communs) ; **Ce que chaque bookmaker garde** (marges ; une bourse montre sa commission) ; **Ce que chaque bookmaker se trompe à dire** (écart « réalisé moins annoncé », en points, un biais prouvé en bleu) ; **Retrouve-t-on la mesure du 23/09 ?** Aucun vert, aucun rouge. **Vos bookmakers (The Odds API) portent leur nom** — « Winamax (FR) », « PMU », « Betclic », « Unibet (FR) », « Winamax (DE) », « Betfair Exchange (EU) » — suivi de « (vos bookmakers) », jamais leur clé (« winamax_fr ») ; les lignes de cartes disent le championnat comme les listes de l'appli (« EPL (ENG) », « Besta deildin (ISL) »).

**Le tableau « ce qui prédit », à un seul endroit — Statistiques ligue, et pourquoi.** C'est la page des statistiques : il parle de tous les championnats et de toutes les équipes à la fois, il n'appartient à aucun match ni à aucune équipe. Le mettre sur la page d'une équipe ou d'un match l'aurait recopié ou fait croire qu'il dépend d'elle. Un test vérifie qu'aucune autre page ne l'emploie.

**Routes ajoutées** (une, en lecture seule, hors des fichiers du moteur) : `GET /api/market-knowledge[?championnat=…]`. Elle lit le dernier calcul fini de l'étape 22 et rend, pour **un** championnat à la fois (« * » = tous réunis), ses lignes de justesse, vitesse, biais, marge et moments, le résumé, la liste des livres et des championnats mesurés, et les mots du calcul. 341 Ko pour tous les championnats (au lieu des 5,6 Mo de toutes les lignes). Même forme avant tout calcul (`etat: 'jamais'`, lignes vides), pour un championnat inconnu (`championnat-inconnu`), pour un calcul d'une autre version (`pas-a-jour`, ses chiffres restent lus). 400 pour un paramètre en tableau, de plus de 120 caractères ou « 23-09 ». Aucune écriture (le test compte les changements de la base), aucun fichier d'exécution touché, POST refusé (404). Les trois autres blocs lisent des routes qui existaient (`/api/match-stats/team-strength`, `/api/match-stats/player-ratings`, `/api/bench/stat-value`).

**Trois choses trouvées en lisant la page sur la vraie base du bac (lecture seule), corrigées :**
1. Une case vide ne disait pas « pourquoi » juste : « pas de relevé daté à ce moment dans ce championnat » s'affichait aussi quand rien n'avait été calculé. Elle ne dit sa cause que si le calcul est lu ; sinon elle dit ce qu'elle sait (« pas encore mesuré », « serveur à relancer », « championnat non mesuré »).
2. **20 championnats sur 75** ont une conclusion à **0 match comparé** (« trop peu de matchs pour juger ») ; la page disait « pas de moment meilleur prouvé », c'est-à-dire « on a comparé et rien trouvé ». Elle dit maintenant « Trop peu de matchs pour juger » et les range avec les non mesurés (hors du Σ).
3. Le contrôle du 23/09 parlait de « ce championnat » alors qu'il n'en dépend pas ; un lien vers un championnat inconnu affichait « Choisir… » au lieu de son nom.

**Retouche du 22/10 au soir (après la vérification en direct de l'appelant) :**
1. **Les noms de vos bookmakers.** La page montrait six clés brutes de The Odds API (`winamax_de`, `pmu_fr`, `betclic_fr`, `unibet_fr`, `winamax_fr`, `betfair_ex_eu`) et neuf autres sans majuscule (`onexbet`, `marathonbet`, `pinnacle`, `mybookieag`, `betonlineag`, `everygame`, `betanysports`, `suprabets`, `gtbets`). Le calcul de l'étape 22 range la clé telle quelle quand elle n'est pas dans sa petite table (10 noms, `core/engine/vosBookmakers.js`, un fichier du moteur : non touché). La page nomme maintenant chaque livre de la famille « vos bookmakers » par **la liste de Réglages › Vos bookmakers** (16 clés : « Winamax (FR) », « PMU », « Betclic », « Unibet (FR) », « Tipico »…), **déplacée** dans `ui/src/utils/vosBookmakers.js` pour que Réglages (`EngineConfigForm`) et la page lisent **la même liste** (aucune copie) ; les clés que Réglages ne propose pas mais que vos relevés contiennent prennent **le titre que The Odds API leur donne** (son relevé du 21/09/2026, gardé dans les données d'essai) : « Winamax (DE) », « Pinnacle », « MyBookie.ag », « BetOnline.ag »… La seule exception : `betfair_ex_eu`, que l'API appelle « Betfair » et que la page dit « Betfair Exchange (EU) », le nom que l'appli donne à cette bourse partout ailleurs (football-data) avec la région de la clé. Une clé jamais vue reçoit un nom fabriqué lisible (« foo_bar_nl » donne « Foo Bar (NL) ») : **« mot_mot » ne s'affiche jamais**. Sur la vraie base du bac : les 25 bookmakers de vos relevés ont leur nom, aucune clé brute dans le texte de la page ni dans une infobulle.
2. **Le championnat dans une phrase.** « devant 98 % des clubs de EPL » devient « devant 98 % des clubs du championnat (EPL) » (indice de force) comme « des milieux du championnat (EPL) » (fiche du joueur) ; le nom est celui que l'appli donne à la compétition (« Bundesliga » pour « Bundesliga - Germany »). Il n'existe pas de nom plus long pour « EPL » dans l'appli (le badge dit « EPL »), c'est donc celui qui s'affiche.

**Où ça vit.**
- Neufs, serveur : `server/src/api/controllers/marketKnowledge.controller.js`, `server/src/api/routes/marketKnowledge.routes.js` (+ une ligne dans `routes/index.js`).
- Neufs, interface : `ui/src/utils/{indiceDeForce,ficheJoueur,predicteurs,bookmakers,vosBookmakers}.js` (règles pures, sans Vue ; elles ne lisent que d'autres règles pures du même dossier), `ui/src/services/marketKnowledgeApi.js`, `ui/src/components/matches/{TeamStrengthCard,PlayerRatingCard}.vue`, `ui/src/components/analysis/{PredictorsTable,MarketMomentsCard,BookmakerRankingCard,BookmakerMarginsCard,BookmakerBiasCard,MarketReproductionCard}.vue`, `ui/src/views/BookmakersView.vue`.
- Retouchés : `ui/src/router/index.js` (route `/bookmakers`), `components/layout/AppSidebar.vue` (entrée du menu), `components/settings/EngineConfigForm.vue` (la liste des bookmakers vient de `utils/vosBookmakers.js`), `views/{TeamView,PlayerView,TeamStatsView}.vue` (une ligne de câblage chacune), `services/{matchStatsApi,benchApi}.js` (trois lectures), `server/src/data/roadmap/historique.js` (la ligne de l'étape 31).
- Tests : `server/test/{fichesEcran,bookmakers,bookmakersEcran}.test.mjs`, `server/test/aides/{rendu,script-bookmakers,script-fiches-ecran}.mjs` ; ajustés : `opportunitesEcran.test.mjs` (le menu compte sept entrées), `feuilleDeRouteEcran.test.mjs` (au-delà de 999 tests, la page écrit « 1 009 »).
- **Aucun fichier du moteur.** Empreinte du code du moteur `16f2459db183a99576365047da98b7777687ef05` (37 fichiers), candidate `f01dd8496f56a415` : inchangées.

**Après la recopie chez Pierre** (avec 27, 23 et 30) : rien à lancer. Au redémarrage, la page Bookmakers et les trois blocs lisent ce que la nuit a déjà rangé : l'indice de force et les fiches (calculés par leur étape de nuit), le tableau « ce qui prédit » (dernier calcul de l'étape 18), la connaissance du marché (dernier calcul de l'étape 22, refait chaque nuit). Aucun chiffre du moteur ne change. Réglages › Vos bookmakers montre les mêmes seize puces qu'avant (la liste a seulement changé de fichier).

**Tests** :
- `fichesEcran.test.mjs`, 21 tests : les règles de l'indice, de la fiche et du tableau recomptées à la main sur les réponses du vrai serveur ; chaque bloc rendu dans chacun de ses états ; le championnat dit par son nom d'affichage ; la place unique ; l'hygiène ; aucune note de joueur sur le terrain ; le moteur de 37 fichiers non touché.
- `bookmakers.test.mjs`, 15 tests : la route (même forme avant et après le calcul, un championnat à la fois, refus, lecture seule, POST 404), les règles de la page (classement, marges, biais, meilleur moment, championnat sans match comparé, états, options du champ), les noms de vos bookmakers (Réglages, puis le titre de l'API pour les 25 clés de son relevé, puis un nom fabriqué ; une seule liste), le menu et le routeur.
- `bookmakersEcran.test.mjs`, 16 tests : la page rendue prête, un championnat, inconnu, jamais calculée, en erreur, serveur à relancer, autre version ; les huit tableaux toujours complets ; **vos bookmakers sous leur nom, aucune clé « mot_mot » dans le texte de la page** (neuf clés de The Odds API plantées dans la base d'essai, ni dans le texte ni dans une infobulle) ; le championnat dit comme l'appli le dit ; les favoris d'abord ; le moment proposé ; le câblage ; l'hygiène des six fichiers.

**`npm test` : 1 016 tests, 1 014 réussis + 2 constats « # TODO », 0 échec, ~279 s** (964 avant l'étape, 52 de plus).

**Bugs volontaires** : 72 sur 72 détectés, du premier passage, chacun sur le test qu'il vise (copie du code serveur + interface dans le scratchpad, `node_modules` en jonctions vers le dépôt ; témoin : 52 tests verts) ; 61 d'abord sur le code de l'après-midi, puis les 72 rejoués sur le code final (dont 11 pour la retouche du soir : la clé brute à l'écran, la bourse sans son nom, la copie de la liste dans Réglages, le nom fabriqué qui garde son « mot_mot », le plus juste dit avec le titre brut, « PMU (FR) », le libellé brut du championnat, « des clubs de MLS », la source de vos bookmakers non dite) ; code du bac identique avant et après la série (774 fichiers, sha1 `dd064525…`). Les campagnes des étapes 27, 23 et 30 n'ont pas été rejouées : aucun fichier qu'elles visent n'a été touché, et la suite entière est verte.

**`verifier-interface --avant`** : 148 composants, 0 erreur, construction ok (107 fichiers, dossier temporaire, dossier de l'interface intact). Une seule ligne « disparue » face au dépôt, voulue : les 17 lignes de la liste des bookmakers de `EngineConfigForm.vue`, déplacées dans `utils/vosBookmakers.js` (le contrôle les signale, d'où son `ok: false`) ; rien d'autre n'est perdu.

**`sandbox-diff`** (depuis le dépôt, lecture seule) : 36 fichiers source changés dans le bac (23 ajoutés, 13 modifiés dont `ui/DESIGN.md`), 0 conflit, 0 changement du dépôt seul.

**Limites** :
- « Matchs comparés » d'un championnat est le plus grand nombre de matchs réunis dans une de ses comparaisons : la somme des championnats n'est donc pas le chiffre de « Tous les championnats » (dit au survol).
- Le bloc de la page d'une équipe lit l'identifiant FotMob du club : un club sans identifiant garde ses tableaux et le dit.
- Le calcul de l'étape 22 range toujours la clé brute dans ses lignes (`titre: "winamax_fr (vos bookmakers)"`) : c'est la page qui la remplace par le nom, sans rien changer au calcul (le fichier qui le fait, `core/engine/vosBookmakers.js`, est du moteur).


### Étape 42 — Bulletin du jour + bilan de la semaine (lot 7, écrite dans le bac le 22/10/2026, par-dessus l'étape 31 ; mise en service avec elle)

**Ce que c'est.** Deux textes écrits par l'IA, rangés dans `data/runtime/ai-bulletins.json` et lisibles dans Réglages en attendant la page « Bulletin » de l'étape 45 :
- le **bulletin du jour**, chaque matin (pas avant 6 h, heure de Paris) : ce qui vaut le coup aujourd'hui et pourquoi ;
- le **bilan de la semaine**, une fois par semaine (celle qui vient de finir, du lundi au dimanche) : ce qui a marché, ce qui a perdu, où l'IA s'est trompée, la valeur de clôture, les championnats.

Chacun est **un seul appel** à Claude Code (Sonnet, effort bas, le quota de l'abonnement — jamais l'API à la clé, jamais l'ancien « audit par lot »). **Le code prépare d'abord une fiche chiffrée compacte, sans dépenser un token** ; l'IA ne fait que la résumer et la commenter.

**Ce que contient la fiche** (texte en petits tableaux `|`, avec « Ce sont les seuls chiffres que tu peux citer ») :
- **Du jour** : les value vertes du Repérage (la plus forte d'abord, avec la case de la carte « où parier », la fraîcheur de la cote et l'état de la composition), quelques chutes de cote sans value verte, les matchs de vos favoris (équipes et championnats, par identifiant FotMob), les compositions connues et les absents annoncés (dites comme l'écran : officielle dans l'heure d'avant le coup d'envoi, probable, dernière alignée, non publiée), le feu du contrôle quotidien et les contrôles en échec. Ce que le code ne sait pas lire (Repérage en calcul, favoris ou liste des matchs illisibles) est **dit à l'IA** (« ne dis rien de… »), jamais présenté comme « rien ».
- **De la semaine** : les pronostics du moteur réglés (par marché et par championnat), vos paris réglés (les règles de Performance paris : gain réel, gain attendu, ROI, meilleurs et pires paris), la valeur de clôture de ces paris, les avis de l'IA jugés cette semaine et **ses erreurs** (celles où elle se disait la plus sûre d'abord, une par match avant une seconde, deux au plus par match), son **carnet** depuis le 30/09 (les marchés d'au moins 20 avis, du moins fiable au plus fiable ; les marchés plus maigres sont comptés, jamais listés), les championnats rentables et perdants de vos paris, la carte « où parier ».
- **Taille** (estimation à 3 caractères par token ; la vraie mesure est celle du journal des appels) : jour ≈ 625 tokens sur la base d'essai (pleine : moins de 2 500) ; semaine ≈ 950 tokens sur la base d'essai, ≈ 1 135 sur les vraies données du bac (semaine du 28/09, mode économe ≈ 990) ; consignes fixes ≈ 806 tokens (identiques d'un appel à l'autre : relues depuis la mémoire cache de Claude).

**LA GARDE DES CHIFFRES (le point dur de l'étape).** L'IA n'écrit jamais un chiffre à elle : **tout nombre de son texte qui n'est pas dans la fiche fait REFUSER le texte entier** (`core/ai/gardeDesChiffres.js`, pure). Choix assumé : *refuser* plutôt que *signaler* — signaler mettrait la vérification sur Pierre à l'instant où il décide d'un pari ; refuser garantit que tout texte affiché a passé la garde. Le prix d'un refus est borné : le texte n'est pas écrit, le motif est dit à l'écran (« texte refusé : chiffres absents de la fiche (4321,7) »), l'appel a consommé du quota et il est **compté comme tel** (journal, plafond), un rappel sans nombre est ajouté après la fiche à l'essai suivant, et au plus **trois essais ratés par jour (ou par semaine)** avant l'abandon, dit à l'écran. Ce qui compte comme un nombre : tout nombre en chiffres (« 1,95 », « 1.95 », « 58 % », « 1 234 », « 21 h 30 », « 22/10/2026 », « 2-1 »), par sa **valeur** (« 2,2 » = « 2,20 », mais « 58 » n'est pas « 57,6 » : l'IA n'arrondit pas, elle reprend) ; un nombre écrit en lettres (trois à seize, les dizaines, cent, mille) doit valoir un nombre de la fiche ou être un mot de la fiche ; « un », « deux » et « pour cent » restent des mots ; « N2 », « U21 », « 1N2 » ne sont pas des nombres. Les nombres autorisés sont ceux du **texte de la fiche telle que l'IA l'a lue**, pas d'un objet plus riche gardé par le code.

**Le budget de l'étape 4 — comme les analyses automatiques, rien de plus, rien de moins.**
- Le **journal des appels** note chacun à son type (`bulletin`, `bilan-semaine`, automatiques) avec ses tokens et le mode du moment ; la carte « Budget Claude » de Réglages a deux lignes de plus (« automatique · compté sur le plafond »).
- Le **plafond de 150** les compte (`enregistrerUsage` : champs `bulletin`, `bilanSemaine`) : un appel réussi — ou un appel dont la garde a refusé le texte, qui a coûté du quota — prend une place ; sans place (`budgetRestant` à 0) rien ne part. Le plafond lui-même n'est pas touché ; le compteur reste égal aux appels automatiques réussis du journal (`coherence`).
- Le **mode économe** (80 % du budget du jour ou de la semaine, ou choisi dans Réglages) les **compacte** : moins de lignes par rubrique (`LIMITES.econome`), l'IA est priée d'être brève. Il ne les supprime jamais : un bulletin par jour, un bilan par semaine.
- Les **pannes** : une panne de Claude Code arrête l'étape sans rien écrire, et une panne que les analyses de la même passe viennent de constater (`ctx.claudeEnPanne`) l'empêche de partir ; la passe suivante recommence.
- **Jamais forcés** : ni un clic « Actualiser maintenant » ni `AUTO_AI_ANALYSIS=false` (l'interrupteur des analyses) ne les forcent, comme `iaAutoAvantMatch`.

**Une fois par jour, une fois par semaine.** La décision lit `data/runtime/ai-bulletins.json` (jamais l'historique de passes, qui ne dit pas si un texte a été écrit) : un texte déjà écrit pour la clé empêche tout appel, et le dépôt refuse de toute façon d'écraser (`deja-ecrit`). **Rattrapage** : le bulletin se fait à la première passe d'un jour à partir de 6 h (la passe « au démarrage » après une nuit d'arrêt le rattrape) ; le bilan à la première passe d'après la fin de la semaine — un seul, celui de la **dernière semaine complète**, jamais ceux des semaines manquées. Un **fichier illisible** (OneDrive, forme inattendue) empêche l'appel — un texte qu'on ne pourrait pas ranger aurait coûté du quota pour rien — et n'est jamais réécrit.

**Rien à dire = aucun appel.** Si le Repérage est prêt et ne trouve aucun pari ni aucune chute de cote et qu'aucun match de vos favoris ne se joue (ou si la semaine n'a ni pronostic réglé, ni pari réglé, ni avis de l'IA jugé), le jour (ou la semaine) est fait **sans appel, 0 token**, et l'écran le dit. Un Repérage pas prêt n'est PAS « rien » : le matin le bulletin attend la passe suivante ; passé 12 h il part avec ce qu'il y a (sa rubrique le dit) s'il reste des matchs de vos favoris.

**Écriture sans risque de perte.** `server/src/data/repositories/aiBulletinRepository.js` : tout passe par `utils/atomicJson.js` (lecture qui échoue plutôt que de passer pour vide, écriture d'un bloc par fichier temporaire renommé, `enregistrerSansPerdre` : un appel vient de coûter du quota, il n'est jamais jeté sur un blocage OneDrive — nouvelles tentatives pendant une vingtaine de secondes). 31 bulletins et 13 bilans gardés, les essais ratés d'une clé disparaissent avec elle.

**Ce que voit Pierre.**
- **Réglages › « Bulletin du jour et bilan de la semaine »** (juste sous « Actualisation automatique ») : deux blocs **toujours là**, texte écrit ou non, chacun avec son état en une puce (Écrit, Rien à commenter, Attend le matin, Coupé, Abandonné, Illisible, Pas encore écrit) et sa phrase ; le texte (titre, résumé, une section par rubrique, « à retenir ») avec sa **vraie provenance** (« Claude Sonnet, par Claude Code (quota de l'abonnement) », l'heure), ses tokens et le mode du budget ; **la preuve que les chiffres sont ceux du code** (« Chiffres vérifiés par le code : N nombres cités, tous dans la fiche ») et la fiche envoyée à l'IA, dépliable ; les essais ratés (« Essai 1 raté à 14 h 00 — texte refusé : chiffres absents de la fiche (4321,7) ») ; le tableau des derniers textes avec **Σ** (textes, dont appels à Claude, tokens) et **⌀** (tokens par texte qui a coûté) ; la note « Comment ça tourne ». Un texte refusé n'est **jamais montré**. Le texte d'aujourd'hui pas encore écrit : le dernier reste lisible, dit pour ce qu'il est (« Le dernier texte écrit, 04/10/2026 »). Seul bouton : « Relire » — aucun bouton n'appelle Claude.
- **Réglages › Actualisation automatique** : deux étapes de plus dans la liste de la passe, « Bulletin du jour » et « Bilan de la semaine » ; une étape pas due dit **pourquoi** (« Le bulletin du 22/10/2026 est déjà écrit », « Pas avant 6 h », « Abandonné pour aujourd'hui : 3 essais ratés… »).
- **Réglages › Budget Claude** : « Bulletin du jour » et « Bilan de la semaine » dans le tableau par type d'appel, « dont N bulletin ou bilan » dans le détail du plafond.

**Où ça vit.**
- Neufs, serveur : `core/ai/gardeDesChiffres.js`, `core/ai/bulletinFiches.js`, `core/ai/bulletinPrompt.js`, `core/ai/bulletinService.js`, `data/repositories/aiBulletinRepository.js`, `api/controllers/bulletins.controller.js`. **`core/ai` n'est pas dans la liste des fichiers du moteur** (`engineVersions.js`) : l'essai de la version candidate n'est pas touché.
- Retouchés, serveur : `jobs/matchStatsAutoRefresh.js` (les étapes `bulletin` et `bilanSemaine` entre `carnetIA` et `controleQuotidien`, qui reste la dernière ; `pourquoiPasDue` ; `ctx.claudeEnPanne` ; `__testing`), `api/routes/matchAiAnalysis.routes.js` (`GET /bulletins`), `data/repositories/claudeUsageLedger.js` (deux types d'appel), `data/repositories/autoAiAnalysisRepository.js` (le compteur du plafond), `core/ai/claudeBudget.js` (`plafond.bulletin`, `plafond.bilanSemaine`), `data/opportunities.js` (deux `export`, aucune ligne changée), `data/roadmap/historique.js` (la ligne de l'étape 42).
- Neufs, interface : `services/bulletinsApi.js`, `utils/bulletins.js` (règles pures), `components/settings/BulletinsPanel.vue`. Retouchés : `views/SettingsView.vue` (la carte), `components/settings/ClaudeBudgetPanel.vue` (deux types), `ui/DESIGN.md`.
- Tests : `server/test/{bulletins,bulletinsEcran}.test.mjs`, `server/test/aides/{decorBulletins,script-bulletins-fiches,script-bulletins-service}.mjs` ; ajustés : `aiScorecard.test.mjs` et `controleQuotidien.test.mjs` (l'ordre des étapes), `budgetClaude.test.mjs` (la liste des types).

**Après la recopie chez Pierre** (avec 31) : rien à lancer. Au redémarrage, la première passe d'une matinée (à partir de 6 h) écrit le bulletin ; la première passe d'après la fin d'une semaine écrit le bilan. **Le coût réel n'a pas été mesuré ici** (le bac coupe Claude et ce travail interdisait tout appel) : il se lit, après le premier bulletin, dans Réglages › Budget Claude (ligne « Bulletin du jour ») et dans le journal des appels (`data/runtime/journal-claude/AAAA-MM-JJ.json`, type `bulletin`) ; ce que le code envoie (fiche + consignes) est de l’ordre de 1 400 à 2 000 tokens estimés, le texte rendu de quelques centaines ; le total que le journal mesurera sera plus gros, Claude Code ajoutant ses propres instructions (les analyses de match, mesurées au journal, consomment de 5 000 à 24 000 tokens chacune). Le « fini quand » du cahier (un bulletin et un bilan réels, un seul appel chacun, coût noté) reste à constater sur la machine de Pierre, avec son accord pour deux appels.

**Exemple vérifié à la main** (base d'essai, lundi 05/10/2026) : la fiche du jour dit « Man City gagne — William Hill 2,30 — value +12,4 % » ; la route d'analyse d'un match de Mes paris rend 12,39 % pour la même ligne (arrondi à une décimale), la page Chutes de cotes rend la chute de « Plus de 2,5 buts » à 10,3 %, le SQL du cache donne les compositions à 45, 30 et 300 minutes du coup d'envoi ; pour la semaine du 28/09 : 13 pronostics réglés dont 6 justes et 5 paris réglés (mise 32 €, gain +1 €, ROI +3,1 %) recomptés par des boucles écrites à la main.

**Limites.**
- Le bulletin lit l'état PRÉPARÉ du Repérage ; si celui-ci a plus de 3 h, il le relance (l'ancien reste lu pendant le calcul) et attend au plus 4 minutes ; passé ce délai l'étape recommence à la passe suivante.
- Le carnet de l'IA montré au bilan est celui de la nuit (cumul depuis le 30/09), avec sa date de calcul : il peut dépasser la semaine commentée, c'est dit dans la fiche.
- La garde vérifie des **nombres**, pas des affirmations : une phrase fausse sans chiffre (« l'IA a eu raison sur les corners ») n'est pas détectée ; c'est pourquoi la fiche donne à l'IA les comptes et les taux déjà écrits et lui interdit de calculer.

**Deux défauts trouvés en lisant la fiche de la semaine sur les vraies données du bac (lecture seule), corrigés :**
1. **Cinq « erreurs de l'IA » étaient cinq lignes du même match.** Les erreurs sont maintenant choisies pour instruire : celles où l'IA se disait la plus sûre d'abord, **une par match avant une seconde, deux au plus par match** ; la fiche dit « 5 sur 369, celles où elle se disait la plus sûre d'abord, au plus 2 par match ».
2. **Le carnet de l'IA listait ses marchés par nombre d'avis, sans écarter ceux de moins de 20 avis.** Il va maintenant du **moins fiable au plus fiable**, sur les marchés d'au moins 20 avis ; quand ils sont plus nombreux que la place, les moins et les plus fiables sont montrés et le milieu est seulement compté ; les marchés plus maigres sont comptés (« 1 autre marché a moins de 20 avis : trop peu pour juger, ne les commente pas »), jamais listés.

**Tests.**
- `bulletins.test.mjs`, 30 tests (~64 s) : la garde des chiffres (la valeur compte, pas l'écriture ; « 57,6 » n'est pas « 58 » ; les nombres en lettres ; sur la vraie fiche chaque nombre du texte envoyé passe et un seul de plus la fait refuser) ; les fiches pures (tri, troncature, mode économe, « rien à dire » distinct de « on ne sait pas », la composition dite comme l'écran, les semaines lundi → dimanche, les erreurs et le carnet de l'IA) ; les fiches **lues dans la base d'essai et recomptées par un autre chemin** (voir l'exemple plus haut) ; le service avec un **faux Claude** (aucun réseau, aucun jeton : le test refuse de s'installer si un jeton ou l'exécutable existent) : une fois par jour et par semaine, le rattrapage, le journal des appels, le plafond de 150, le compteur d'accord avec le journal, le mode économe, les pannes et l'abandon, « rien à dire », l'écriture par atomicJson (un blocage OneDrive passager ne perd rien), les deux étapes de la liste (jamais forcées), la route (même forme avant et après le premier texte, lecture seule, POST refusé, 503 si le fichier est illisible) ; l'hygiène (jamais l'API payante) et **aucun fichier du moteur touché**.
- `bulletinsEcran.test.mjs`, 14 tests (~11 s) : les règles de `utils/bulletins.js`, la carte dans chacun de ses états (textes écrits, rien d'écrit, texte refusé, panne, abandon, rien à commenter, dernier texte seulement, fichier illisible), sa place dans Réglages, les deux étapes dans la liste de la passe, la carte « Budget Claude », l'hygiène.
- Ajustés : `aiScorecard.test.mjs` et `controleQuotidien.test.mjs` (le bulletin et le bilan s'intercalent entre le carnet de l'IA et le contrôle quotidien, qui reste le dernier — comme l'étape 21 avait intercalé le carnet), `budgetClaude.test.mjs` (la liste des types d'appel).
- Un test du jour dépendait de la machine (la ligne « Claude » de la santé des sources, orange sans jeton) : il l'écarte désormais ; vu dans la copie des bugs, qui n'a pas de jeton.

**`npm test` : 1 060 tests, 1 058 réussis + 2 constats « # TODO », 0 échec, ~306 s** (1 016 avant l'étape, 44 de plus).

**Bugs volontaires** : **83 sur 83 détectés** sur le code final, chacun sur le test qu'il vise (copie du code serveur + interface dans le scratchpad, `node_modules` en jonctions vers le dépôt ; témoin : 44 tests verts). Trois séries : la 1re en a laissé échapper 2 (n° 28, test non lancé par le motif ; n° 65, le `due` de l'ENTRÉE « Bilan de la semaine » de la liste n'était pas testé une fois le texte écrit) et en a mal compté 2 (n° 24 et 31, témoin rouge) ; la 2e en a laissé échapper 2 (n° 24 : un match coté déjà commencé gardé ; n° 31 : une lecture ratée prise pour « aucun ») ; tous quatre corrigés par des TESTS (une liste de matchs injectable dans `lireLesEntreesDuJour`, un cas « trois journaux illisibles »…) ; la 3e, sur le code final : 83 sur 83. Code du bac identique avant et après chaque série (788 fichiers, sha1 `78bb7218…`).

**`verifier-interface --avant`** : 149 composants, 0 erreur, construction ok (107 fichiers, dossier temporaire, dossier de l'interface intact). Deux lignes « disparues » voulues (le contrôle les signale, d'où son `ok: false`) : la ligne `detail:` du plafond de `ClaudeBudgetPanel.vue`, réécrite pour dire « dont N bulletin ou bilan », et les 17 lignes de la liste des bookmakers de `EngineConfigForm.vue` (étape 31).

**`sandbox-diff`** (depuis le dépôt, lecture seule) : 61 fichiers source changés dans le bac avec l'étape 31 (36 de la 31 + 25 de la 42 : 14 ajoutés, 11 modifiés), 0 conflit, 0 changement du dépôt seul.

**Empreintes du moteur** : code `16f2459db183a99576365047da98b7777687ef05` (37 fichiers), candidate `f01dd8496f56a415` — inchangées.


### Étape 37 — Styles de jeu et entraîneurs (lot 5, écrite dans le bac dans la nuit du 22 au 23/10/2026, par-dessus les étapes 31 et 42 ; à mettre en service avec elles)

**Ce que c'est.** Chaque nuit, chaque club reçoit une **étiquette de style**, lue sur ses **20 derniers matchs de championnat** (400 jours au plus, les coupes à part) et comparée aux autres clubs de son championnat :
- « possession » : possession et passes dans le dernier tiers au-dessus du championnat ;
- « jeu direct » : forte part de longs ballons ET peu de possession ;
- « contre-attaque » : forte part de tirs en contre (carte des tirs FotMob, `fastbreak`), sans plus de ballon que la moyenne ;
- « coups de pied arrêtés » : forte part de tirs sur corner, coup franc (direct ou indirect) ou touche ;
- « sans style marqué » : rien ne dépasse 0,75 écart-type (près d'un club sur deux).

Les chiffres qui justifient l'étiquette sont rangés avec elle, à côté de la moyenne du championnat. Le style est aussi rattaché à **chaque entraîneur** (ses 20 derniers matchs de championnat, tous clubs confondus, chaque club comparé à son championnat).

**Où.** `server/src/data/db/teamStyle.js` (+ `teamStyleEnfant.js`, `teamStyleBanc.js`) — HORS de `MODULES_DU_MOTEUR` (le cahier proposait `core/engine/teamStyle.js` : refusé, l'essai de 27 aurait recommencé). Tables `team_style_matches` (le cache), `team_style`, `coach_style`, `team_style_state`. Étape de nuit « stylesDeJeu » après « fichesJoueurs », avant le gel. Routes `GET /api/match-stats/team-style?club=` et `/style-duel?home=&away=` (ou `homeName`, `awayName`, `league`, reconnus par l'annuaire). Script du bac `scripts/team-style.mjs [--tout] [--banc]`.

**Les pièges (mesurés sur la base du bac).**
- `situation` : huit valeurs réelles (regularplay, fromcorner, fastbreak, setpiece, freekick, throwinsetpiece, penalty, individualplay), présentes sur 100 % des 899 574 tirs ; mais la carte n'existe que pour 34 674 matchs sur 61 061 : 0 % au Pérou, en Équateur, en Roumanie, en Serbie, en Chine, en Tchéquie…, 35-40 % en Colombie, Liga 2, Serie B, Ligue 2. Sans carte (moins de 6 matchs couverts), contre-attaque et coups de pied arrêtés sont « non mesurés », jamais zéro. Penalties et buts contre son camp retirés.
- Les zéros de longs ballons, centres et passes = « non publié ». Une possession hors de [5 ; 95], ou dont la somme des deux camps s'écarte de 100 de plus de 3 : absente.
- L'entraîneur n'était qu'un **nom** dans le magasin : l'import garde désormais son **identifiant FotMob** (`coachId`, jamais 0), préféré quand il est là. Un nom qui alterne entre deux clubs (A, B, A en moins de 120 jours) ou dirige deux clubs le même jour est un **homonyme** (15 noms, « Diego Martinez ») suivi club par club — à partir du jour où l'alternance est VUE (anti-fuite).
- Début de saison : la fenêtre enjambe la trêve ; « provisoire » sous 12 matchs ; « surtout lu sur la saison passée » sous 6 matchs depuis une trêve (45 jours sans match) ; « nouvel entraîneur » quand il a dirigé moins de la moitié de la fenêtre.

**Stabilité.** Un club garde son étiquette du mois d'avant tant que son score ne retombe pas sous 0,5 et qu'aucun autre style ne le dépasse de 0,25 (le « cran ») ; quitter « sans style marqué » demande 1. Mesuré (aucun résultat lu) : **92,7 %** des clubs établis gardent leur style d'un mois sur l'autre (86,5 % sans le cran ; 92,3 % en début de saison ; mois le plus bas 87,3 %, septembre 2025).

**La nuit, incrémentale.** Le processus à part (lecture seule) compare la signature courte de chaque rencontre (mise à jour, clubs, championnat, date) à son cache : seules les rencontres **nouvelles ou changées** sont relues avec leur carte des tirs ; les styles sont recalculés en mémoire depuis le cache (quelques secondes) ; contrôle anti-fuite : 20 styles refaits par un second chemin (SQL + JSON). Premier calcul du bac : 18,7 s (7,0 s à part, 286 Mo ; rangement 11 s par tranches, serveur jamais tenu plus de 84 ms) ; nuit sans rien de neuf : 2,5 s.

**Les duels de styles, au banc.** Sur le magasin 2023-07-01 → 2026-09-23 seulement (histoire ET cibles), un décalage par case « style du club qui reçoit × style du visiteur » (25 cases × 1N2 et plus/moins 2,5), appris sur 2023-07 → 2025-06 (17 584 matchs), jugé sur 2025-07 → 2026-09-23 (12 105) face à la cote de clôture football-data, juge de l'étape 16 avec **K = 53** (z ≈ 3,31). Résultat : **rien de prouvé** — 1N2 −0,08 % [−0,18 ; +0,02], plus/moins 2,5 +0,05 % [−0,14 ; +0,24] ; 29 cases « pas prouvé », 21 trop rares, 0 retenue. Recopié dans `DUELS_AU_BANC` (teamStyle.js) : tout duel est dit « Explication seulement » ; une case qui passerait un jour le seuil serait dite « Effet mesuré », avec l'effet en points — et resterait affichée, jamais calculée.

**Lancement.** `lancements.js` : portée « style » (nouvelle), étape 37 `style-v1`, `le: null`, 53 variantes, deux vues (2023-07 → 2026-09-23 pour les duels ; 2023-01 → 2026-10-18 pour les réglages choisis sur la stabilité).

**Pierre voit.**
- Page d'une équipe, sous l'indice de force : le bloc « Style de jeu » — l'étiquette (et une seconde tendance), la phrase qui la justifie avec ses chiffres et ceux du championnat, les prudences (provisoire, début de saison, nouvel entraîneur, carte des tirs absente), la provenance et l'heure, le tableau des huit chiffres (Σ et ⌀), l'entraîneur (logo de ses clubs, son style, homonyme dit en mots), le style mois par mois sur 13 mois (Σ et ⌀).
- Page d'un match : le bloc « Duel de styles », marqué « Explication seulement », les deux clubs (logo, style, possession), le scénario en une phrase, ce que le banc a mesuré.

**Règle capitale.** Le style n'entre dans aucun chiffre du moteur (test : aucun fichier de l'empreinte n'atteint ces modules ni ne nomme leurs tables) ; empreinte du moteur `16f2459db183a99576365047da98b7777687ef05` inchangée (37 fichiers), candidate `f01dd8496f56a415`.

**Exemples (base du bac, 19/10/2026).** Possession : Barcelone (68,8 %), PSG, Bayern, Manchester City, Inter, Arsenal, Bodø/Glimt ; jeu direct : Getafe (seconde tendance coups de pied arrêtés) ; coups de pied arrêtés : Brentford (41 % de ses tirs).


### Étape 44 — Mémoire de l'IA (lot 5, écrite dans le bac dans la nuit du 22 au 23/10/2026, par-dessus les étapes 31, 42 et 37 ; à mettre en service avec elles)

**Ce que c'est.** Par équipe et par championnat, un petit **dossier écrit par le code, jamais par l'IA** : les faits du moment (classement officiel FotMob, séries en cours), la forme (10 derniers matchs, tendance), les absents connus (relevés avant chaque match par les enregistreurs), l'entraîneur (et s'il est nouveau, son bilan, son prédécesseur), le style (étape 37), ce que le carnet de l'IA dit de ses avis sur ce club, et des **leçons** — seulement celles que le **carnet de l'IA (étape 21) confirme sur plusieurs matchs**. Chaque leçon garde sa date et son match d'origine ; une leçon que le carnet **dément est retirée pour de bon**. Le dossier d'un championnat : le profil de la saison (repères de l'étape 15, face à toutes les saisons), la tête du classement, les avis de l'IA dans ce championnat, ses leçons confirmées.

**Avant chaque analyse d'avant-match**, l'IA reçoit les **300 à 500 mots** utiles des deux équipes et du championnat (section « ## dossiers » de la fiche compacte), **à la place des « 3 dernières leçons »** de chaque type de marché, prises sans tri (dont, on l'a vu, des leçons démenties). Ses comptes par type de marché restent. L'ancienne fiche (AI_ANALYSIS_FICHE=ancienne) ne change pas ; sans fichier de dossiers (avant la première nuit), la fiche d'avant, à l'octet. L'IA ne se réentraîne pas : c'est du texte choisi par le code. **L'IA ne fournit jamais un chiffre au moteur, le moteur ne lit jamais les dossiers, la note manuscrite de Pierre n'y entre pas.**

**La règle des leçons (fixée d'avance, jamais réglée sur les résultats).** Une leçon = le texte que l'IA a écrit dans son bilan d'après-match sur UN pronostic du moteur. Son SENS est lu dans le **règlement du carnet** (le pronostic a échoué ou tenu), jamais dans le texte libre. Ses PORTÉES : le club concerné (les deux clubs pour un marché du match, le seul club d'un marché d'équipe), par **identifiant FotMob**, et son championnat. Pour chaque portée, les matchs SUIVANTS du carnet, même type de marché : l'écart entre ce qui s'est passé et ce que le moteur annonçait, corrigé de l'écart commun à tous les clubs pour ce type, compté dans le sens de la leçon. **Confirmée** : au moins 3 matchs suivants pour un club (10 pour un championnat), un écart moyen d'au moins 15 points (5 pour un championnat) ET au-delà du hasard (z ≥ 2). **Démentie** : les matchs suivants vont contre elle (z ≤ −1) → retirée pour de bon. **Jamais confirmée** en 120 jours ou sur toute sa fenêtre (12 matchs, 60 pour un championnat) → retirée. Seuls les derniers matchs comptent. Une leçon confirmée qui ne l'est plus sort du dossier (sans être retirée).

**Le rattachement**, par identifiant FotMob, comme le carnet : la composition lue pour l'analyse, le gel des pronostics du match, l'annuaire strict (même compétition) ; deux sources qui donnent deux clubs différents, ou le même club des deux côtés : aucun dossier (vérifié sur les deux « Nacional », Porto / Portsmouth / Port Vale / Shanghai Port, Leeds United / DC United). Jamais le rapprocheur de noms souple.

**Où.** `server/src/core/ai/aiMemory.js` (règles pures : leçons, faits, phrases, choix des 300-500 mots, mots et tokens) ; `server/src/data/aiDossiers.js` (la nuit, les lectures, le rattachement, la mémoire d'un match) ; `server/src/data/repositories/aiDossiersRepository.js` ; **`data/runtime/ai-dossiers.json`** par atomicJson. Pourquoi un fichier et pas une table du magasin : c'est du texte pour l'IA (même famille que carnet-ia.json et ai-bulletins.json), la base des chiffres n'a ainsi aucun écrivain de plus (la nuit des dossiers ne fait que LIRE la base : trois incidents du journal WAL), « le moteur ne lit pas les dossiers » se vérifie sur un nom de fichier, et il est à part de match-ai-analyses.json (23,6 Mo dans le bac, réécrit à chaque analyse). Un fichier illisible n'est jamais écrasé (l'étape le dit, les analyses partent avec la fiche d'avant).

**La nuit.** Étape « Mémoire de l'IA » (`dossiersIA`), juste après le carnet de l'IA (ses cas réglés de la nuit sont repris, rien n'est relu) et avant le bulletin ; une fois par jour ou au clic ; aucun appel à Claude, aucun réseau, la base seulement lue. **Seules les équipes qui ont joué sont refaites** (nouveau match dans l'annuaire, ou bilan d'un de leurs matchs arrivé en retard) ; les autres gardent leur dossier tel quel, leçons comprises. Routes de lecture : `GET /api/match-ai-analysis/dossiers?club=fotmob-…` (ou `?league=`) et `/dossiers/apercu?home=&away=&league=&matchId=`.

**Pierre voit.** Sur la page d'une équipe, sous « Style de jeu », le bloc « Mémoire de l'IA » : provenance réelle et heure, faits du moment, forme (logos), absents connus, **leçons confirmées** (date, match d'origine avec ses deux logos, marché, leçon, ce que le carnet a vu, « confirmée le »), leçons retirées (et pourquoi), le championnat (profil, tête, leçons), « Ce que l'IA lit de ce dossier » (le texte exact, mots, tokens). Tableaux toujours affichés, Σ et ⌀. La page « Bulletin » (étape 45) le réutilisera.

**Mesuré dans le bac** (base du bac en lecture seule, 0 écriture). Premier calcul : 1 936 clubs joués dans l’année et 72 championnats en 2,2 s avec les cas du carnet (serveur jamais tenu plus de 59 ms), une nuit sans match en 0,3 s, 2,9 s sans les cas du carnet ; ai-dossiers.json 4,3 Mo. Leçons : 5 579 écrites (30/09 → 17/10), 5 552 rattachées, **20 confirmées** (niveau championnat, 5 championnats) et **115 retirées** (démenties) ; au niveau d’un club, aucune encore : au plus 2 matchs analysés après une leçon. **Mots** (393 vraies analyses) : AVANT, les 3 dernières leçons × 11 types = 874 mots (~2 760 tokens au calibrage de l’étape 41) ; APRÈS, les dossiers = 395 mots en moyenne (~1 217 tokens, de 794 à 1 538), 392 sur 393 entre 300 et 500 : environ 1 540 tokens de moins par avant-match. Trouvés à la mesure et corrigés : une lecture d’activité qui tenait le serveur 11 s (colonne hors index), « Marcão » / « Marcao » pris pour deux entraîneurs (36 faux « nouvel entraîneur »). Tests : 1 109 (1 107 + 2 constats, 0 échec, ~264 s), dont 22 nouveaux ; 42 bugs volontaires sur 42 détectés ; empreinte du moteur 16f2459d… inchangée. Interface : 152 composants, construction ok, rien de perdu face au dépôt (hors les 2 pertes voulues des étapes 31 et 42).

**L'analyse réelle.** Impossible dans le bac (Claude coupé). Script pour Pierre, après la mise en service : `node scripts/essai-dossier-ia.mjs` (aperçu seulement, aucun appel) puis, **avec son accord**, `node scripts/essai-dossier-ia.mjs --accord-de-pierre` : UNE analyse d'un match à venir, demandée à l'appli qui tourne (le serveur reste le seul écrivain), puis ses tokens réels, la mémoire remise et si l'analyse cite une leçon.




## Correctif du 23/10/2026 à 23 h 25 : la garde des chiffres et les milliers (étape 42)

**Le défaut.** Le premier bilan de la semaine a été refusé à tort : « 1385 ; 1797 ; 4166 ; 5493 absents de la fiche ». Pourtant, ce sont de vrais chiffres du carnet de l'IA. `espacesSimples` (server/src/core/ai/gardeDesChiffres.js) devait ramener les espaces insécables et fines à l'espace simple. Mais sa classe contenait trois espaces ordinaires : les codes spéciaux avaient été perdus à l'écriture du fichier. Résultat : les milliers que `toLocaleString('fr-FR')` écrit avec une espace fine insécable (U+202F, « 1 385 ») n'étaient jamais réunis. La fiche donnait alors « 1 » et « 385 », jamais 1385.

**La correction.** La classe s'écrit maintenant en codes (`\u00A0\u2009\u202F`), vérifiés octet par octet. Un test de non-régression a été ajouté, en ASCII seul :
- il bâtit une fiche par `toLocaleString('fr-FR')` ;
- il vérifie que les vrais nombres passent et qu'un faux nombre est toujours refusé ;
- il vérifie que le fichier source garde bien les codes.

**À retenir** : les outils d'écriture changent les codes « \uXXXX » en vrais caractères. Pour une espace spéciale dans une expression régulière, il faut écrire le code et vérifier les octets.

**Mesures.** npm test dans le dépôt : 1 110 tests (1 105 réussis, 3 sautés, 2 à faire), 0 échec. 2 fichiers recopiés (versions précédentes dans bac-a-sable/recopies/2026-10-23_23h25m00/avant).
