# Sources de cotes pour CôteMaster — dossier du 03/10/2026

Demande de Pierre : « récupérer toutes les cotes historiques, les cotes des matchs (à venir), les cotes en live, plus les mises sur le marché ; elles serviront à un calcul de probabilité ».

Méthode : six familles de sources étudiées en parallèle (documentation officielle, sondes réelles depuis ce PC, lecture du magasin en lecture seule), puis chaque fiche contre-vérifiée par un agent chargé de la réfuter, puis une critique de complétude. 699 consultations, 13 agents. Les affirmations marquées « sondé » ont été observées le 03/10/2026 depuis ce PC. Aucune clé n'a été affichée ; 3 crédits The Odds API consommés (497 restants).

## 1. Point de départ

| Donnée | État au 03/10/2026 |
|---|---|
| Magasin SQLite | 60 173 rencontres (04/01/2023 → 03/10/2026), 72 compétitions, résultats et statistiques FotMob |
| Cotes historiques | 36 264 rencontres, table `match_odds`, « moyenne de clôture » 1X2 (+ plus/moins 2,5 sur 22 divisions), source football-data.co.uk, 32 championnats (la Russie s'arrête à 2025-26) |
| Cotes des matchs à venir | relevé manuel The Odds API (forfait Starter gratuit, 500 crédits/mois), 1X2, région eu, 14 compétitions |
| Compétitions sans aucune cote | 40 : UEFA (C1, C2, C3), Libertadores, Sudamericana, Colombie, Pérou, Équateur, Paraguay, Bolivie, Venezuela, Chili, Serbie, Tchéquie, Israël, Slovaquie, Lettonie, Islande, Croatie, Canada, Russie (dès 2026-27) et toutes les coupes |
| Live, volumes | rien |

FotMob ne publie aucune cote : confirmé par sonde sur deux rencontres et six variantes de pays et de langue. Son bloc « oddspoll » est un sondage d'internautes sans aucun nombre.

## 2. Ce que chaque source donne réellement

Légende des quatre besoins : H = historique, A = avant-match, L = live, V = volumes misés.

### Gratuit, sans clé, lisible depuis la France

**football-data.co.uk** (H, A partiel). Déjà utilisé, mais exploité à 20 %. Sondé : les fichiers de saison des 22 divisions européennes contiennent pour chaque match DEUX relevés (pré-clôture du vendredi/mardi, clôture) de la moyenne et du maximum du marché, de 6 à 8 bookmakers (Bet365, Betfred, BetVictor, bwin, Paddy Power, Sky Bet…), de **Betfair Exchange (BFE/BFEC)**, sur 1X2, plus/moins 2,5 et handicap asiatique. Les 16 fichiers « pays » (Brésil, Argentine, MLS…) : clôture 1X2 seule. `fixtures.csv` : cotes des matchs à venir des 22 divisions, publié le vendredi et le mardi, non lu par le projet. Pinnacle a disparu (le site l'exclut depuis le 23/07/2025, colonnes absentes en 2026-27). La Russie est abandonnée. Aucune coupe, aucune compétition UEFA ni sud-américaine hors Brésil/Argentine ne sera jamais couverte. Pas de volumes (BFE = prix d'échange, sans montant). Usage par un particulier explicitement autorisé.

**ESPN** (H, A, L) — la découverte du dossier. L'API JSON non documentée (`site.api.espn.com`, `sports.core.api.espn.com`), déjà utilisée par le projet pour les statistiques, porte des cotes : ouverture, clôture et cote courante de DraftKings depuis le 01/12/2025 (ESPN BET de 11/2023 à 11/2025 ; 9 à 12 bookmakers dont Unibet, Bet365, Betfair Sportsbook en 2023-2024), 1X2, plus/moins (une ligne), handicap, double chance. Les cotes restent attachées aux matchs terminés depuis au moins janvier 2023, soit toute la profondeur du magasin. Sondé avec cotes : UEFA (C1, C2, C3), Libertadores, Sudamericana, Colombie, Pérou, Équateur, Paraguay, Bolivie, Venezuela, Chili, Israël, FA Cup, Copa del Rey, DFB-Pokal, Coppa Italia, Coupe de France, Taça de Portugal, Copa Argentina, Copa do Brasil, Copa Chile, US Open Cup, Leagues Cup, KNVB, Suisse, Roumanie, Irlande, Russie. Les cotes apparaissent dès l'entrée au calendrier (Premier League cotée 7 semaines à l'avance). Live : le champ `current` bouge pendant le match (polling, cadence à mesurer). Absents : Pologne, Serbie, Slovaquie, Lettonie, Islande, Croatie, Canada, Tchéquie (sans événement), coupes belge, grecque, chinoise, turque, Taça da Liga. Pièges : format américain sur l'API « site » (décimal sur l'API « core ») ; chez « Bet 365 » (fournisseur 2000) les champs `homeTeamOdds` contiennent la cote LIVE finale, le pré-match est dans `preMatchFullTimeResult*` ; conditions d'utilisation Disney qui interdisent l'accès automatisé (déjà le cas pour les statistiques).

**Kalshi** (H depuis 2025-26, A, L, **V**). Marché de prédiction réglementé aux États-Unis. API publique sans clé, sondée depuis ce PC : prix acheteur/vendeur (probabilité implicite en cents), carnet d'ordres, volume, intérêt ouvert, chaque transaction, bougies par minute/heure. 140 séries de matchs de football, dont UEFA (C1, C2, C3), Libertadores, Sudamericana, Colombie, Pérou, Chili, Bolivie, Venezuela, Israël, Tchéquie, Croatie, Lettonie, Canada, Équateur, Coupe de France, KNVB, Leagues Cup, Coupe de Grèce, Coupe de Slovaquie ; marchés annexes (handicap, total, BTTS, mi-temps). Historique : les points d'entrée `/historical/*` donnent la saison 2025-26 complète (Premier League depuis le 11/05/2025, Ligue des champions depuis le 29/04/2025, Ligue 1 depuis le 15/08/2025, Colombie depuis le 12/02/2026). Volumes : médiane 325 000 contrats par marché Premier League sur 2025-26, ~150 000 en Ligue 1 ; nuls à J-5 sur Colombie, Canada, Lettonie (à mesurer au coup d'envoi). Trading interdit aux résidents français, lecture libre. Risque : l'ANJ a qualifié Kalshi de jeu non autorisé (25/02/2026) et neuf régulateurs européens se sont coordonnés (18/06/2026) : l'API peut subir le sort de Polymarket. Collecter et archiver localement dès maintenant, sans en faire une dépendance critique.

**Smarkets** (A, L, V partiel). API publique sans clé, 60 requêtes par minute, sondée : carnets complets back/lay et volumes en livres par marché, marchés annexes (score exact, BTTS, plus/moins 0,5 à 6,5, handicaps), Amérique du Sud bien couverte (Colombie, Pérou, Paraguay, Chili, Copa Chile). Aucun historique : échantillonner soi-même. Volumes modestes (centaines à milliers de livres par marché). Compte interdit aux Français, lecture libre. Unités à verrouiller par un test (prix en centièmes de pour cent, quantités en dix-millièmes de livre).

**365Scores / bet365 Scores** (A, L, H 2 ans). API publique du site, sondée : 1X2 Bet365 avec cote d'ouverture, cote courante et tendance, en direct aussi (TTL 10 s), archive glissante de deux ans, couvre Canada, Chili, Colombie, Bolivie, Paraguay, Coupe de Croatie. La clôture pré-match est perdue après le coup d'envoi (à relever soi-même avant). Bet365 est agréé ANJ depuis le 16/04/2026 (bet365.fr ouvert le 26/05/2026) : reste à vérifier dans un navigateur si les prix affichés sont ceux de bet365.fr.

### Avec une clé déjà en place

**The Odds API** (A, L, H payant). Sondé le 03/10 : la région « fr » existe (winamax_fr, betclic_fr, unibet_fr, pmu_fr, netbet_fr) et coûte 1 crédit par marché et par compétition. Le 1X2 est publié par les cinq ; les totaux (plus/moins) seulement par PMU (ligne variable, 3,5 sur Lens-Lyon) et NetBet, jamais par Winamax, Betclic ni Unibet. Les marchés additionnels football (BTTS, double chance, corners…) sont réservés aux bookmakers américains. L'historique (instantanés toutes les 5 min depuis septembre 2022, 10 min depuis juin 2020, 10 crédits par instantané) est **refusé sur le forfait gratuit** (sondé : erreur 401 « HISTORICAL_UNAVAILABLE_ON_FREE_USAGE_PLAN ») ; il s'ouvre dès le forfait 20K à 30 $/mois (100K à 59 $, 5M à 119 $). Live : même point d'entrée, cadence 40 s. Couvre UEFA (C1, C2, C3), Libertadores, Sudamericana, Chili, Russie, Leagues Cup, coupes de France, d'Angleterre (FA Cup, EFL Cup), d'Espagne, d'Allemagne, d'Italie ; pas Colombie, Pérou, Équateur, Serbie, Tchéquie, Paraguay, Bolivie, Venezuela, Israël, Slovaquie, Lettonie, Islande, Croatie, Canada, Roumanie ni coupes secondaires. Pas de volumes.

**API-Football** : le forfait gratuit refuse la saison 2026 pour les cotes (sondé : « try from 2022 to 2024 »), aucun bookmaker français, rétention d'environ 7 jours, `/odds/live` répond (27 matchs, bookmaker anonyme) mais 100 requêtes par jour. Forfait Pro 19 $/mois (chiffre de sources secondaires, page officielle inaccessible). Règle du projet maintenue : jamais de repli automatique.

**football-data.org** : add-on Cotes 15 €/mois pour une cote 1X2 anonyme sur 33 compétitions, rien d'autre. Sans intérêt.

**SportMonks** : la clé de `server/.env` est invalide (sondé : 401 sur deux points d'entrée). Forfaits 29 à 249 €/mois plus add-on cotes ; historique « Premium » limité à 7 jours. Écarté.

### Payant, accessible depuis la France

| Source | Prix | Apporte | Réserve |
|---|---|---|---|
| The Odds API 20K | 30 $/mois | 2-3 passes/jour aux prix français + Pinnacle + Betfair Exchange, live 40 s, historique 10 crédits/instantané | rien pour 15 petites ligues ni coupes secondaires |
| BetsAPI « Soccer Events » | 30 $/mois (essai 1-2 $/jour) | bet365 en direct sur quasi toutes les compétitions, 1X2/handicap/plus-moins, séries horodatées | collecte non autorisée par bet365 (zone grise), rétention non documentée |
| API-Football Pro | 19 $/mois | pré-match sur coupes et petites ligues, 33 bookmakers internationaux | pas de prix français |
| OddsPapi | gratuit 250 req/mois, payant non public (~49 $) | Winamax, Unibet, PMU, Pinnacle, bet365 FR ; historique depuis janvier 2026 seulement, 3 bookmakers par appel | Betclic absent, jeune, à sonder avec un compte |
| Enetpulse (Marc Lyster) | sur devis (estimé 500 à 1 000 $/mois) | flux pré-match 25+ bookmakers et live (par bookmaker + moyenne) | liste des bookmakers, cadence et archive à demander |
| GoalServe, OddsMatrix, LSports, FeedConstruct, Sportradar, OpticOdds, SportsDataIO, TheStatsAPI, odds-api.io | 50 $ à plusieurs milliers €/mois | — | hors budget ou centrés États-Unis |

### Impossible ou à proscrire depuis la France

- **Betfair** (API, flux, Historical Data) : compte obligatoire, refusé aux résidents français depuis le 14/05/2010 (les échanges de paris sont interdits par la loi de 2010). C'était la seule vraie source de volumes misés. Clé Live à 499 £. Pas de contournement par compte étranger.
- **Matchbook** : compte requis, France restreinte. **Pinnacle** : API fermée au public depuis le 23/07/2025 ; ses prix passent par The Odds API (avec délai).
- **Polymarket** : bloqué par l'ANJ depuis le 16/07/2026 (sondé : le DNS du fournisseur d'accès renvoie la page « Inaccessibilité ANJ »). Pas de contournement DNS.
- **OddsPortal, BetExplorer** : archives les plus profondes (toutes compétitions, ouverture/clôture par bookmaker), mais leurs conditions d'utilisation interdisent explicitement le scraping (lues le 03/10), anti-robot actif, et le droit des bases de données (art. L342-1 du code de la propriété intellectuelle) interdit l'extraction substantielle. Pas en automatique. Un acteur Apify (0,003 à 0,008 $ par match) reste un recours manuel discutable.
- **« % des mises » affichés par Winamax, Unibet, Betclic, PMU** : à l'écran seulement, pas d'API, pourcentage sans montant, scraping contraire aux conditions. Ne pas automatiser.
- Sofascore (403 Cloudflare), Flashscore (flux de cotes verrouillé, l'acteur Apify ne rend qu'un 1X2 anonyme), LiveScore, Goal.com, OneFootball, Oddspedia, Oddschecker : rien d'exploitable.

## 3. Architecture proposée

Principe : tout ce qui est gratuit est relevé et **archivé localement dès maintenant** (l'historique live ne se rachète pas, et une source gratuite peut disparaître du jour au lendemain) ; une seule clé payante utile, The Odds API, réservée aux prix français ; aucun scraping automatisé ; chaque cote porte sa source, son bookmaker, son marché et l'heure exacte du relevé.

| Besoin | Niveau A : gratuit sans quota | Niveau B : clé existante (quota) | Niveau C : payant | Impossible |
|---|---|---|---|---|
| Historique | football-data élargi (pré-clôture + clôture, Max, BFE/BFEC, handicap) ; ESPN pour les ~24 000 rencontres sans cote (1 requête par match, rythme lent) ; Kalshi `/historical` 2025-26 (prix + volumes + transactions) | — (historique refusé sur le Starter) | The Odds API, un mois à 59-119 $, pour les clôtures aux prix français 2022-2026 sur UEFA, coupes et grands championnats | Betfair Historical Data |
| Avant-match | ESPN (DraftKings ouverture/clôture) : relevé quotidien, puis H-2 et H-15 min via la boucle de pré-chargement des compositions ; `fixtures.csv` archivé le vendredi et le mardi ; 365Scores (Bet365) ; Kalshi (prix pondéré par volume) | The Odds API région fr, 1X2 : 1 crédit par compétition et par passe, soit une passe par jour sur les compétitions à matchs (~16 crédits/jour) | The Odds API 20K (30 $/mois) : fr + eu, 2-3 passes/jour ; API-Football Pro pour les petites ligues | prix Winamax/Betclic sur plus/moins et BTTS (aucune source) |
| Live | ESPN `current` toutes les 1-2 min sur les matchs suivis ; 365Scores ; Kalshi transactions sur les grandes affiches | rien (500 crédits = 2 h de suivi) | The Odds API 20K/100K : live 40 s aux prix français, si Pierre parie en direct ; BetsAPI Soccer 30 $ pour bet365 partout | — |
| Volumes | Kalshi (volume, intérêt ouvert, carnet, transactions) toutes les 15-30 min, archive après match ; Smarkets (volumes £, carnets) toutes les 30-60 min | — | aucun achat légal | Betfair, Matchbook, Polymarket, % des mises |

### Stockage et rattachement

- Nouvelle table `odds_quotes` dans `match-stats.db` (hors OneDrive, écrite par le seul processus serveur, comme l'actualisation en 11 étapes) : `match_key, source, bookmaker, market, selection, price, point, releve_at, kind (open | preclose | close | live | snapshot)`, plus la provenance exacte (fournisseur, fichier ou point d'entrée, date) exigée par la règle de provenance. Le schéma actuel `match_odds` (une ligne par match et par source) ne peut pas porter plusieurs bookmakers, instantanés et marchés.
- Registre d'alias par source (slugs et équipes ESPN, tickers Kalshi, identifiants Smarkets, noms football-data) vers l'identifiant FotMob : construit par le vote date ± 1 jour + score sur les matchs joués (méthode de `footballDataOdds.rattacher`), puis **persisté** pour servir aux matchs à venir, qui n'ont pas de score. Jamais de rapprochement souple des noms.
- Conversions testées : format américain (ESPN site), fractionnaire (Bet 365 chez ESPN), centièmes de pour cent (Smarkets), cents (Kalshi), décimal.
- Chaque cote porte `releve_at` ; le moteur n'utilise que ce qui existait à l'heure du pronostic (pas de fuite de la clôture dans un pronostic fait à J-2).
- Les fuseaux diffèrent (Kalshi en heure américaine, ESPN en UTC, football-data en date britannique, FotMob en UTC) : le vote date ± 1 jour reste nécessaire.

### Mesures à faire avant d'écrire le code

1. Calibration gratuite dans le magasin : clôture ESPN (DraftKings) et ouverture 365Scores (Bet365) contre AvgC et BFEC de football-data sur Premier League, Ligue 1, Liga 2024-2026 : on saura si « close » veut dire clôture au coup d'envoi.
2. Écart BFEC contre Pinnacle (PSC) sur 2019-2025, où les deux existent : BFEC devient la référence « sharp » si l'écart est faible.
3. Latence du live : 5 matchs, ESPN, 365Scores, Kalshi, horodatage local contre la minute FotMob.
4. Kalshi au coup d'envoi sur trois petites ligues (volume réel) ; premier refus 429 en polling anonyme.
5. Dans le navigateur de Pierre : un même match sur bet365.fr, 365Scores (fournisseur 14) et ESPN (fournisseur Bet 365 2000) : si les prix sont identiques, le 1X2 bet365 devient la seule cote ANJ gratuite.
6. Test unitaire des unités Smarkets.

## 4. Ce que cela vaut pour le calcul de probabilité

- La clôture d'un marché liquide reste le meilleur prédicteur connu. Hiérarchie des prix : Pinnacle (jusqu'en 2025) > Betfair Exchange de clôture (BFEC, marge 2-5 %) > moyenne/maximum de clôture de 6-10 bookmakers > clôture DraftKings (ESPN) ≈ Bet365 seul > moyenne OddsPortal de 1-4 bookmakers > prix Kalshi loin de l'échéance.
- Au coup d'envoi sur les grandes affiches, le prix médian Kalshi (centaines de milliers de contrats) vaut un prix d'échange : second estimateur, à normaliser (trois marchés binaires ne font pas 100 %) et à pondérer par le volume. Sur Colombie, Canada ou Lettonie, il ne vaut rien tant que le volume au coup d'envoi n'est pas mesuré.
- Les prix des bookmakers français (marge 11-15 %) servent à la « value » et au plancher 1,20, pas à estimer la probabilité : la méthode de la puissance sur 12 % de marge est plus bruitée que sur BFEC à 3 %.
- Le mouvement de ligne (pré-clôture → clôture ; ouverture → courante) est un signal réel mais faible : la clôture l'intègre déjà. Son usage principal : mesurer la valeur face à la clôture (CLV) des pronostics de Pierre. Attendre 0,5 à 1 point de précision, pas plus.
- Les volumes servent de poids de confiance et de filtre de liquidité, et à repérer l'argent tardif. Les « % des mises » des bookmakers n'ont de valeur que si l'on sait s'ils comptent des euros ou des tickets ; personne ne le dit.
- Le live n'améliore pas une probabilité pré-match. Il sert si Pierre parie en direct, et à l'analyse après-match.
- Corners, tirs, tirs cadrés : aucune source de marché accessible aux prix français. Le modèle binomial négatif reste sans référence de marché.
- À présenter comme une amélioration de la calibration, de la couverture (40 compétitions) et de la mesure, pas comme une promesse de gain.

## 5. Risques

- Conditions d'utilisation : ESPN (Disney) interdit explicitement l'accès automatisé, déjà pratiqué par le projet pour les statistiques ; 365Scores, Kalshi, Smarkets non lues. Tolérance de fait, pas un droit. Lecture sobre, jamais de rafale.
- Blocage ANJ possible de Kalshi (comme Polymarket) : archiver, ne pas dépendre.
- Jamais de contournement DNS ou de proxy pour une source bloquée.
- Jamais de cotes d'opérateurs non agréés (Pinnacle, Betfair, bet365.com, Kalshi) dans un commit si le dépôt GitHub est public (promotion d'une offre non autorisée, loi de 2010).
- Un seul écrivain sur la base : les collecteurs vivent dans le processus serveur, jamais en scripts séparés pendant que le serveur tourne (trois incidents de journal WAL).
- Les grilles changent sans préavis : bookmakers de football-data chaque saison (collision des préfixes BFD Betfair et BFDH Betfred), fournisseur ESPN le 01/12/2025, Pinnacle disparu. Lire les en-têtes dynamiquement, dater les ruptures.
- Coûts qui dérapent : crédits The Odds API multipliés par marchés × régions ; Apify au résultat.

## 6. Questions pour Pierre

1. « Mises sur le marché » : l'argent misé par le public (volumes), ou le dimensionnement de vos propres mises ? Le dossier a pris la première lecture.
2. Pariez-vous en direct ? Cela décide du niveau d'effort sur le live.
3. Acceptez-vous que le serveur lise ESPN, 365Scores, Kalshi et Smarkets (API publiques non officielles, comme ESPN pour les statistiques aujourd'hui) ? Lecture quotidienne oui, scraping OddsPortal/BetExplorer non ?
4. Le dépôt GitHub est-il public ?
5. Passer The Odds API au forfait 20K (30 $/mois) pour les prix français plusieurs fois par jour, le live et un rattrapage d'historique ?

## 7. Ordre de travail proposé

1. Table `odds_quotes`, registre d'alias persistant, provenance par cote (DataOriginMenu).
2. football-data élargi : pré-clôture et clôture, Max, BFE/BFEC, handicap asiatique, `fixtures.csv` archivé, lecture dynamique des en-têtes, BFEC en référence.
3. ESPN : fournisseur `espnOdds` (lecture seule, tolérant), rattrapage historique match par match sur les 40 compétitions sans cote, relevé quotidien + H-2 + H-15 min, live sobre sur les matchs suivis.
4. Kalshi : rattrapage `/historical` 2025-26, collecteur 15-30 min, archive des transactions après match.
5. The Odds API région fr : une passe quotidienne 1X2 sur les compétitions du jour (forfait gratuit), plus si forfait 20K.
6. Smarkets et 365Scores en compléments.
7. Mesures : calibration des références, CLV des pronostics, latence live.

## 8. Ce qui a été construit (04/10/2026)

Demande de Pierre : « il faut que tu me récupères ça gratuitement, de la même façon que les données des matchs », puis « pour toutes les données que tu n'as pas sur les cotes, il faut que tu le notifies, que je le voie dans CôteMaster ». The Odds API reste un relevé manuel ; tout le reste est gratuit, sans clé, et tourne dans le serveur.

### Les cinq sources gratuites

| Source | Compétitions | Ce qu'elle donne | Limites principales |
| --- | --- | --- | --- |
| ESPN | 57 | DraftKings (et Bet365 avant match) : 1N2, plus/moins, handicap ; ouverture et clôture ; historique depuis 2023 ; direct | pas de volumes ; cotes publiées quelques jours avant seulement |
| football-data.co.uk | 33 | ouverture (pré-clôture) et clôture de nombreux bookmakers, Max du marché, Betfair Exchange | clôture publiée après le match ; championnats par pays : 1N2 de clôture seulement ; pas de direct |
| 365Scores | 71 | Bet365, 1N2 ouverture et dernière cote, direct | un seul bookmaker, un seul marché ; football russe jamais coté |
| Kalshi | 57 | prix d'échange et volumes en dollars, 1N2 au temps réglementaire | ouvert quelques jours avant ; liquidité très inégale ; peut être bloqué depuis la France |
| Smarkets | 66 | prix d'échange et volumes en livres : 1N2, plus/moins 2,5, les deux marquent | aucun historique (seulement ce que CôteMaster relève) ; volumes souvent nuls loin du match |

Couverture mesurée sur une copie de la base (04/10) : 72 compétitions suivies, 0 sans source avant match, 0 sans direct, 2 sans argent misé (Coupe de Chine, Premier League russe). Toujours absents, quelle que soit la compétition : Winamax, Betclic, Unibet, PMU (seul le relevé The Odds API les donne), les volumes Betfair (fermé aux résidents français), les cotes de corners, tirs, cartons et score exact.

### Stockage et rattachement

- Base locale `match-stats.db` (hors dépôt) : `odds_events` (une ligne par rencontre et par source), `odds_quotes` (une cote = bookmaker × marché × issue × ligne × nature), `team_source_aliases`, `odds_fixture_misses` (les manques constatés), `odds_source_state` (curseurs de rattrapage).
- Natures : `open` (jamais réécrite), `preclose` / `close` (remplacées seulement par un relevé plus récent), `snapshot` / `live` (séries, un point par changement).
- Rattachement aux rencontres par identifiants FotMob : alias connu, sinon nom exact de l'annuaire (abréviations développées) parmi les clubs de la compétition, sinon rapprochement souple seulement si non ambigu — jamais mémorisé. Les matchs joués sont rattachés par vote (date ± 1 jour et score).
- Les cotes d'opérateurs non agréés (Bet365, DraftKings, Kalshi, Smarkets…) restent dans la base locale, jamais dans un fichier du dépôt.

### Boucles

- Boucle des cotes (`jobs/oddsWatch.js`, toutes les 5 min) : avant match dans les 2 h (toutes les 30 min, puis 5 min dans les 20 dernières), direct toutes les 10 min pendant 2 h 30, rattrapage de l'historique quand l'actualisation complète ne tourne pas (200 s par passe, partagées entre les sources ; football-data 4 fichiers par passe ; écriture par tranches de 5 000 cotes, jamais plus d'un quart de seconde de blocage mesuré).
- Actualisation complète : étape « cotes gratuites » (14 jours une fois par jour, sinon 3 jours), alerte « cotes » si une source tombe.
- Rattrapage : ESPN ≈ 65 000 requêtes (deux jours environ), football-data une centaine de fichiers depuis 2023 (deux heures environ). Croissance de la base attendue : +300 à 400 Mo.

### Dans le moteur

- Les rencontres du calendrier (sans cote The Odds API) reçoivent la moyenne des bookmakers gratuits (marge retirée, méthode puissance), hors « Maximum du marché » et hors échanges peu liquides.
- Toutes ces cotes sont marquées « référence seulement » : aucun pari conseillé ne peut porter sur un bookmaker non jouable depuis la France (`valueFinder`).
- L'heure de coup d'envoi n'est considérée comme connue que si une source la donne exactement.

### Ce qui est notifié dans CôteMaster

- Onglet « Cotes » de chaque match à venir : « Ce qui manque pour ce match », par source (pas couverte, pas encore publiée, match introuvable, connecteur indisponible), bookmakers français, marchés sans source, volumes, direct, historique.
- Réglages › « Cotes gratuites » : chiffres clés, état de chaque source (dernier relevé, rattrapage), tableau par compétition avec ce qui manque, bouton « Relever maintenant ».
- Alerte en haut de l'appli et dans « Actualisation » quand une source est en panne.
- API : `GET /api/odds/fixture`, `/status`, `/coverage` ; `POST /api/odds/refresh` (gratuit, donc permis à la demande).
