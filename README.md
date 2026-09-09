# CôteMaster

Application de récupération de données sportives, d'analyse et de calcul de cotes. Le projet est séparé en deux applications indépendantes qui communiquent via une API HTTP :

```
CôteMaster/
├── server/     API Node.js / Express — moteur de calcul et données
├── ui/         Interface Vue 3 — pilotage et visualisation
└── legacy/     Anciens scripts du prototype (conservés à titre de référence, non utilisés)
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
│   └── runtime/          Configuration du moteur modifiée à chaud (persistée)
└── src/
    ├── core/             Logique métier pure, sans dépendance HTTP
    │   ├── model/         Distribution de Poisson, correction Dixon-Coles, matrice des scores
    │   ├── market/        Consensus bookmakers, retrait de marge
    │   ├── xg/             Estimation et lissage des Expected Goals
    │   ├── risk/           Facteurs structurels/exogènes, décision de mise (Kelly)
    │   └── engine/         Orchestrateur (oddsEngine.js) + configuration du moteur
    ├── data/               Accès aux données : repositories (lecture disque) + adapters (normalisation)
    ├── pipelines/          Exécution du moteur sur un jeu de données complet + génération de matchs de test
    ├── api/                Couche HTTP : routes, contrôleurs, middlewares
    ├── config/             Variables d'environnement
    └── server.js           Point d'entrée
```

Le dossier `core/` ne connaît rien d'Express : c'est le moteur de calcul, testable indépendamment. La couche `api/` l'expose via HTTP.

## `ui/` — Interface

```
ui/src/
├── views/          Une vue par page (Dashboard, Matchs, Simulateur, Pipeline, Rapports, Réglages)
├── components/      Composants réutilisables, groupés par contexte (common, matches, analysis, pipeline, settings, layout)
├── stores/          État applicatif (Pinia), un store par domaine
├── services/         Appels à l'API (fetch + flux temps réel SSE)
├── composables/      Logique réactive réutilisable (ex. statut de connexion à l'API)
└── router/            Déclaration des routes
```

## Fonctionnalités

- **Tableau de bord** : résumé du dernier run, configuration active, disponibilité des sources de données.
- **Matchs** : parcourir les rencontres d'une source de données et lancer l'analyse du moteur sur l'une d'elles.
- **Simulateur libre** : composer un match hypothétique (xG, cotes, facteurs) pour tester l'impact de chaque paramètre.
- **Pipeline temps réel** : lancer une analyse complète sur un jeu de données, avec suivi match par match en direct (Server-Sent Events).
- **Rapports** : historique de toutes les exécutions, consultable a posteriori.
- **Réglages** : seuils d'edge, fraction de Kelly, mise maximale, avantage terrain, corrélation du modèle, coupe-circuit manuel, génération de nouveaux jeux de test.
