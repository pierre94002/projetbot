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
│                          (fusion calendrier/classements/statistiques, rattrapage ESPN)
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
- **Réglages** (`/reglages`) — seuils d'edge, fraction de Kelly, mise maximale, avantage terrain, corrélation du modèle, coupe-circuit manuel, génération de jeux de test, couverture des statistiques de match, connexion et analyse IA des pronostics (clé API Anthropic).

## Statistiques de match : mise à jour automatique

Les statistiques détaillées (équipe et joueurs, match par match) se complètent toutes seules.
Le serveur interroge périodiquement l'API JSON publique d'ESPN — gratuite, sans clé et sans
quota — pour les rencontres terminées dont les statistiques manquent, puis les fusionne dans
`server/data/runtime/match-stats/<AAAA-MM>.json`.

- **En fond** : `src/jobs/matchStatsAutoRefresh.js`, démarré par `server.js`. Réglages via
  `MATCH_STATS_AUTO_REFRESH`, `MATCH_STATS_REFRESH_INTERVAL_MIN` (défaut 180),
  `MATCH_STATS_REFRESH_BATCH` (défaut 300).
- **À la demande** : bouton « Compléter maintenant » dans *Réglages*, ou
  `POST /api/match-stats/refresh`. L'état se lit sur `GET /api/match-stats/coverage`.
- **En ligne de commande** : `node server/scripts/import-espn-match-stats.mjs`
  (`--coverage`, `--league`, `--since`, `--limit`, `--dry-run`).

Une rencontre déjà traitée porte l'URL ESPN dans ses `sources` : les passages suivants ne
regardent que les nouvelles. La fusion complète sans jamais écraser une valeur déjà
confirmée, et les champs qu'ESPN ne publie pas (xG, duels, grosses occasions) restent vides
plutôt que d'être estimés.

## Architecture "Sport"

Tout ce qui est spécifique au football (calcul des probabilités, marchés proposés, récupération des données) est isolé derrière l'interface `Sport` définie dans `server/src/sports/sportPort.js` — `core/engine/oddsEngine.js` orchestre l'analyse sans jamais importer directement de code football. Ajouter un sport revient à écrire un nouveau dossier `server/src/sports/<sport>/` qui remplit ce contrat, sans modifier `core/`.
