# CôteMaster

Application de récupération de données sportives, d'analyse et de calcul de cotes. Le foot est aujourd'hui le seul sport implémenté, mais l'architecture serveur traite "le sport" comme une interface (`Sport`) plutôt qu'une notion câblée en dur, pour qu'un futur sport s'ajoute sans réécrire le cœur du moteur (voir [Architecture "Sport"](#architecture-sport)).

Le projet est séparé en deux applications indépendantes qui communiquent via une API HTTP :

```
CôteMaster/
├── server/     API Node.js / Express — moteur de calcul et données
└── ui/         Interface Vue 3 — pilotage et visualisation
```

## Démarrage rapide

Deux terminaux, un pour chaque application :

```bash
cd server && npm install && npm run dev
```

```bash
cd ui && npm install && npm run dev
```

- API disponible sur `http://localhost:4000`
- Interface disponible sur `http://localhost:5173`

Copiez `server/.env.example` vers `server/.env` (et `ui/.env.example` vers `ui/.env`) si vous voulez changer les ports ou l'URL de l'API par défaut.

## `server/` — API

```
server/
├── data/
│   ├── fixtures/       Jeux de données source (cotes, compétitions, matchs de test)
│   ├── reports/         Rapports générés par chaque exécution du pipeline
│   ├── backups/         Sauvegardes ponctuelles des scripts de migration (non versionné)
│   └── runtime/          Données et configuration vivantes de l'appli — paris, pronostics,
│                          résultats saisis, config moteur... Versionné dans git comme filet
│                          de sécurité, SAUF ai-config.json (clé API en clair, jamais commité)
├── scripts/             Scripts de migration ponctuels, plus les imports de données
│                          (imports FotMob : calendrier, feuilles de match, classements
│                          officiels ; contrôles verify-*.mjs et audit-score-consistency.mjs)
└── src/
    ├── core/             Logique métier pure — sans dépendance HTTP, sans notion de sport
    │   ├── model/         Distribution de Poisson, correction Dixon-Coles
    │   ├── market/        Retrait de marge bookmaker
    │   ├── xg/             Lissage des Expected Goals
    │   ├── risk/           Facteurs structurels/exogènes, décision de mise (Kelly)
    │   ├── signals/        Signaux complémentaires (ex. corners)
    │   ├── ai/             Analyse IA des pronostics (client Anthropic, prompts, dataset)
    │   ├── engine/         Orchestrateur (oddsEngine.js) + configuration/état du moteur, par sport
    │   └── errors.js       Erreur métier générique (DomainError)
    ├── sports/           Abstraction "Sport" — un sport = un dossier qui remplit le contrat
    │   │                   de sportPort.js ; football est la seule implémentation à ce jour
    │   ├── sportPort.js    Registre + contrat qu'un sport doit remplir
    │   └── football/       Modèle, marchés, cotes et consensus bookmakers propres au foot
    ├── data/              Providers (API externes), adapters (normalisation), repositories (disque)
    ├── pipelines/         Génération de jeux de données de test
    ├── jobs/             Tâches de fond démarrées avec le serveur (rafraîchissement
    │                       automatique des statistiques de match)
    ├── api/               Couche HTTP : routes, contrôleurs, middlewares
    ├── config/            Variables d'environnement
    └── server.js          Point d'entrée
```

Le dossier `core/` ne connaît ni Express ni le football : `sports/` est le seul endroit où le football est câblé en dur. La couche `api/` expose le tout via HTTP.

## `ui/` — Interface

```
ui/src/
├── views/          Une vue par route, plus les sous-vues intégrées comme onglets
│                     (Performance paris, Mes tickets, Statistiques ligue, Compo & joueurs)
├── components/      Composants réutilisables, groupés par contexte
│                     (common, matches, betting, analysis, settings, layout)
├── stores/          État applicatif (Pinia), un store par domaine
├── services/        Appels à l'API
├── composables/     Logique réactive réutilisable (statut API, statut d'un match)
├── constants/       Tables statiques (championnats, schéma des statistiques d'un match)
└── router/          Déclaration des routes
```

Thème sombre "flat glass blur" : flou et transparence ajoutés par-dessus l'esthétique plate existante (pas de glassmorphism glossy à bordures/ombres marquées), défini dans `assets/styles/tokens.css`.

## Fonctionnalités

- **Matchs** (`/matches`) — parcourir les rencontres d'une source de données (Odds API ou jeu de test), lancer l'analyse du moteur sur l'une d'elles, comparer les moyennes des deux équipes, consulter le classement. Deux onglets complémentaires : **Statistiques ligue** (moyennes par équipe d'un championnat) et **Compo & joueurs** (composition en direct, effectif détaillé).
- **Mes paris** (`/paris`) — scanner les matchs pour détecter les value bets et paris les plus probables selon le moteur, gérer le carnet de paris (simples et combinés), suivre bankroll, mise, retours et ROI.
- **Historique moteur** (`/historique-moteur`) — taux de réussite du moteur par marché (résultat, total buts, etc.), avec deux onglets : **Performance paris** (rentabilité réelle des paris placés) et **Mes tickets** (paris déjà réglés, gagnés/perdus).
- **Réglages** (`/reglages`) — seuils d'edge, fraction de Kelly, mise maximale, cote maximale, bookmakers où parier, avantage terrain, corrélation du modèle, coupe-circuit manuel, génération de jeux de test, couverture des statistiques de match, connexion et analyse IA des pronostics (clé API Anthropic).

## Le moteur : pronostic du résultat et paris value

Refondu le 23/09/2026 après un test sur 24 000 matchs passés, dans 33 championnats, où chaque
match n'était analysé qu'avec les cotes et les statistiques connues avant lui.

- **Pronostic du résultat** (`src/core/engine/resultPrediction.js`) : les cotes du marché,
  marge retirée par la méthode puissance (`src/core/market/marginRemoval.js`), prédisent le
  mieux : 50,7 % de résultats justes, avec des pourcentages exacts dans chaque tranche de
  confiance. Sans cote, le modèle de buts corrigé et tempéré prend le relais, avec 46,4 % de
  résultats justes. Chaque pronostic affiche sa source et la fiabilité mesurée.
- **Poids** : 100 % cotes pour le 1N2. La forme, les statistiques et xG des cinq derniers
  matchs, l'arbitre ou un 80/20 n'amélioraient rien sur les matchs de vérification.
- **Cote juste** (`src/core/engine/valueFinder.js`) : tirée des bookmakers les plus justes,
  par paliers. Pinnacle seul s'il cote le match : c'est le plus juste de tous sur 15 885
  matchs. Sinon Marathon Bet, 1xBet, Codere, puis Suprabets et Everygame, qui ne comptent
  que pour un avis. Sinon, au moins deux avis parmi Tipico, William Hill, Coolbet, Betsson
  et la famille Kambi. Les clones ne comptent qu'une fois. La bourse Betfair n'est retenue
  que si sa marge est plausible. Les bookmakers français n'entrent jamais dans ce calcul.
- **Paris value** : un pari n'est recommandé que si l'un de VOS bookmakers paie au-dessus de
  la cote juste, et jamais chez un bookmaker qui l'a fixée. Par défaut : les bookmakers
  étrangers réglementés par une autorité européenne et fiables, choix de Pierre du
  23/09/2026. Aucun n'est agréé en France. Les bookmakers français, avec leur marge de 11 à
  15 % sur le 1N2, n'offraient aucune value. Testé sur l'historique avec des bookmakers
  grand public : +5,0 % de retour sur mise et des cotes supérieures à la clôture de 0,66 %,
  seul chiffre significatif.
- **Modèle de buts** (`src/core/xg/xgStructural.js`) : corrigé. Il comptait deux fois
  l'avantage du terrain et donnait 55,5 % de victoires à domicile pour 43,9 % réelles.
- **Pronostic du score** (`src/core/engine/scorePrediction.js`, entrées lues par
  `src/data/db/scoreFormRead.js`) : les cotes justes fixent les buts attendus, mélangés à la
  forme des cinq derniers matchs de chaque équipe (buts, xG, toutes compétitions) et à la
  saison, avec des poids appris sur 2024-25. Sans cote : la forme (buts, xG, tirs cadrés) et
  la saison seules. Rejoué sur 13 050 matchs joués depuis juillet 2025 : score exact 13,4 %
  avec les cotes, 12,6 % sans, contre 12,2 % en annonçant toujours 1-1 ; bon score parmi les
  trois premiers 34,1 %. Avec les cotes, la forme ne pèse que 0 à 4 % : les cotes la
  contiennent déjà. Une forme brute non pondérée faisait pire que le repère (9 %). Le score
  le plus probable est 1-1 dans 68 % des matchs cotés, d'où l'affichage aussi du meilleur
  score de l'issue pronostiquée.

## Données de match : une seule source, FotMob

Hors cotes (The Odds API), tout vient de FotMob — API publique, gratuite, sans clé — et vit
dans une base SQLite hors du dépôt (`%USERPROFILE%\CoteMaster\match-stats.db`, jamais sous
AppData, que Windows cloisonne pour les processus lancés depuis Claude) : rencontres
et scores, statistiques d'équipe et de joueurs match par match, déroulé, compositions,
annuaires d'identités (clubs et joueurs par identifiant FotMob), et **classements officiels**
saison par saison (table `standings_official`, avec pénalités de points, conférences et
tournois Apertura/Clausura). Le classement calculé sur les résultats ne sert que de repli et
de contrôle.

- **Actualisation complète, en fond** (`src/jobs/matchStatsAutoRefresh.js`, démarrée par
  `server.js`). Elle remplace depuis le 24/09/2026 la tâche planifiée Claude « actualisation
  quotidienne », supprimée : plus de quota Claude, plus d'écritures concurrentes. Une passe une
  minute après le démarrage, puis toutes les 180 min, sous un seul verrou partagé avec la ligne
  de commande (`refreshLock.js` : battement toutes les minutes, jeton, reprise vérifiée) :
  1. calendrier et résultats ; 2. classements officiels ; 3. nouvelles rencontres ;
  4. rencontres omises par la liste du jour ; 5. feuilles publiées en retard, redemandées par
  identifiant (une fois par jour) ; 6. feuilles manquantes ; 7. annuaires d'identités,
  reconstruits une fois, dans un processus à part ; 8. **règlement des pronostics et des
  paris** (`settlementService.js`) ; 9. contrôle de cohérence des scores sur 30 jours (une fois
  par jour, processus à part) ; 10. cotes passées football-data (toutes les 12 h) ;
  11. **sauvegarde** de la base (une fois par semaine, `scripts/backup-db.mjs`, deux copies
  `auto-AAAA-MM-JJ.db` gardées dans `CoteMaster\sauvegardes`, copies manuelles jamais touchées).
  Au démarrage, la passe **rattrape** tout depuis la dernière réussite (jusqu'à 60 jours) ; une
  journée FotMob en échec est relue à la passe suivante. Chaque passe est consignée étape par
  étape dans `data/runtime/refresh-status.json`, avec les alertes en cours (contradictions de
  règlement, anomalies du contrôle). Réglages via `MATCH_STATS_AUTO_REFRESH`,
  `MATCH_STATS_REFRESH_INTERVAL_MIN`, `MATCH_STATS_REFRESH_DELAY_MIN`, `MATCH_STATS_REFRESH_BATCH`.
- **Règlement automatique** : mêmes règles que l'interface (`core/settlement/settlementRules.js`),
  plus les corners et les tirs d'après la base. Le match est cherché par coup d'envoi, sinon au
  calendrier, toujours dans la même compétition. Un match décidé après prolongation ou aux tirs
  au but n'est pas réglé (le score final n'est pas celui des 90 minutes). Un statut posé à la main
  n'est jamais touché ; s'il contredit un score sûr, il est signalé et corrigé seulement sur
  demande, ligne par ligne.
- **Suivi et lancement** : cadre « Actualisation automatique » de *Réglages* et repère dans la
  barre du haut ; `GET /api/refresh`, `POST /api/refresh`, `POST /api/refresh/resettle`.
  Les cotes À VENIR (The Odds API, payantes) ne se relèvent jamais seules : le cadre montre leur âge.
- **Compositions avant le coup d'envoi** (`data/providers/lineupPrefetch.js`), boucle à part,
  toutes les 5 min : surveille les 2 heures qui précèdent le coup d'envoi de chaque match suivi,
  et met en cache la composition FotMob dès qu'elle paraît — parfois près d'un jour à l'avance
  pour une grande affiche, souvent dans l'heure pour un match ordinaire ; jamais garanti, FotMob
  ne dit pas si c'est la feuille officielle ou une prévision. Ne fait JAMAIS d'appel payant (API-
  Football, recherche web IA) : uniquement FotMob, gratuit. L'écran « Compo & joueurs » et la
  fiche d'un match la lisent en premier, avant les recours payants existants. Réglages via
  `LINEUP_PREFETCH_INTERVAL_MIN` (5), `LINEUP_PREFETCH_WINDOW_MIN` (120).
- **Actualités d'équipe et note manuscrite** (`data/providers/teamNewsResolver.js`,
  `data/repositories/matchNotesRepository.js`) : réservées au commentaire IA, jamais au moteur
  chiffré (le marché intègre déjà ces informations plus vite qu'aucun flux d'actualité).
  Gratuites et automatiques via FotMob : blessures et suspensions longue durée (`unavailable`,
  hors joueurs simplement partis en sélection), et changement d'entraîneur, déduit — pas un
  flux dédié — des compositions déjà importées, donc jamais garanti. Pour ce qu'aucune donnée
  mesurée ne capture (vestiaire, rumeur, finances du club), une note libre par match, écrite à
  la main dans l'onglet *Analyse mathématique* et relue par l'IA avec sa date. Routes
  `GET /api/team-stats/team-news`, `GET`/`PUT /api/match-notes/:matchId`.
- **Analyse IA automatique, avant et après-match** (`core/ai/autoMatchAiTrigger.js`, deux étapes
  de la boucle ci-dessus) : décision explicite de Pierre le 26/09/2026 — chaque rencontre à venir
  sous 48 h reçoit un pronostic IA sans clic, et chaque rencontre terminée une revue comparant le
  pronostic au résultat réel (lu directement dans le magasin FotMob, jamais une ressaisie
  manuelle). Passe par **Claude Code en mode headless** (`core/ai/claudeCodeClient.js`,
  `claude -p --output-format json --json-schema ...`), pas l'API Anthropic à la clé : consomme le
  quota de l'abonnement Claude déjà payé, jamais de coût en dollars. Même mécanisme pour le
  déclenchement manuel (un match à la fois, depuis l'analyse d'un match). **Préalable, une fois** :
  `npm install -g @anthropic-ai/claude-code`, puis `claude setup-token` dans un terminal, et le
  jeton affiché dans `server/.env` sous `CLAUDE_CODE_OAUTH_TOKEN` (valable un an). Le `claude.exe`
  embarqué par l'app de bureau ne sert pas : il n'existe que dans la vue virtualisée de l'app.
  Garde-fous : jamais de repli sur API-Football (payant) dans la chaîne automatique ; arrêt de la
  série après trois pannes de Claude Code d'affilée (quota, jeton, réseau). Un samedi chargé peut
  produire 180+ matchs terminés en quelques heures sur les 60+ championnats suivis :
  `AUTO_AI_ANALYSIS_DAILY_LIMIT` (défaut 50, les deux types confondus) protège ce quota par jour
  civil (Paris) — au-delà, le reste attend le lendemain, jamais reporté sur la passe suivante du
  même jour. `AUTO_AI_ANALYSIS=false` coupe tout instantanément.
- **En ligne de commande**, depuis `server/` : `node scripts/fotmob-season-calendar.mjs`,
  `node scripts/import-fotmob-stats.mjs` (`--from/--to` pour constituer, sans argument pour
  compléter), `node scripts/fotmob-standings.mjs` (`--all` pour l'historique),
  `node scripts/fotmob-fixtures-gaps.mjs --apply` (ce que la liste du jour a omis, depuis 2023).
  `node scripts/merge-player-identities.mjs --apply` fusionne les joueurs que FotMob publie sous
  deux identifiants, sur preuve (même date de naissance chez la source).
- **Contrôles** : `verify-standings.mjs` (table officielle contre calcul), `verify-sample.mjs`
  (relecture d'un échantillon chez la source), `verify-leaders.mjs` (buteurs, passeurs et
  clean sheets contre les listes officielles), `audit-score-consistency.mjs` (`--since
  AAAA-MM-JJ`, base en lecture seule). `settle-pending-outcomes.mjs` (`--dry-run`) règle à la
  main ce que l'actualisation règle d'elle-même.

Les saisons sont bornées par compétition (`seasonWindows.js`) : juillet-juin en Europe,
année civile pour les pays nordiques, les Amériques (sauf Liga MX) et la Chine.

### Profilage de cotes

Dans *Matchs*, le panneau d'analyse d'un match propose deux vues : **Analyse mathématique**
(le moteur) et **Profilage de cotes**. Le profilage retrouve les matchs passés dont la cote
domicile et la cote extérieur étaient proches de celles du match, à l'écart choisi près, et
montre comment ils ont fini : 1N2, doubles chances, plus ou moins de buts, les deux équipes
marquent. Un voyant vert signale la value : pourcentage observé × cote du jour > 1. Portées :
championnat (saison en cours, plus la précédente, ou toutes), ou l'équipe elle-même, à
domicile ou à l'extérieur ; segments : match entier ou l'une des mi-temps.

- **Cotes passées** : FotMob n'en publie pas. Elles viennent de football-data.co.uk (CSV
  gratuits, cote moyenne du marché à la clôture) pour 33 championnats, dans la table
  `match_odds`, rattachées aux rencontres FotMob par identifiant de club et score vérifié
  (`src/data/providers/footballDataOdds.js`). Les résultats restent ceux de FotMob.
- **Import** : `node scripts/import-odds-history.mjs --apply` (sans `--apply` : à blanc) ; la
  boucle de fond relève ensuite la saison en cours deux fois par jour au plus.
- **Cotes du jour** : celles de The Odds API (1X2). Les doubles chances en sont déduites ; les
  paris sur les buts affichent la cote juste du profil, faute de cote du marché relevée.
- **Route** : `GET /api/match-stats/odds-profile` (`src/data/db/oddsProfileRead.js`).

## Architecture "Sport"

Tout ce qui est spécifique au football (calcul des probabilités, marchés proposés, récupération des données) est isolé derrière l'interface `Sport` définie dans `server/src/sports/sportPort.js` — `core/engine/oddsEngine.js` orchestre l'analyse sans jamais importer directement de code football. Ajouter un sport revient à écrire un nouveau dossier `server/src/sports/<sport>/` qui remplit ce contrat, sans modifier `core/`.
