# Plan de secours si FotMob coupe l'accès

Étape 14 du plan CôteMaster (07/10/2026). À ranger dans `docs/plan-secours-fotmob.md` du dépôt.

**La règle d'or : rien ne bascule sans l'accord de Pierre.** L'appli constate, prévient et
continue avec ce qu'elle a ; elle ne change jamais de source toute seule, ne dépense jamais un
crédit payant de plus, et n'emploie jamais une source interdite. Ce document dit quoi regarder,
quoi décider, et dans quel ordre.

---

## 1. Ce que FotMob fait pour l'appli aujourd'hui

FotMob est LA source de tout ce qui n'est pas une cote (règle des sources du 22/09/2026) :

| Ce qu'il fournit | Où dans l'appli | Rythme |
|---|---|---|
| Calendrier et résultats (liste du jour) | étape « Calendrier et résultats », règlement des pronostics et des paris | chaque passe (3 h) |
| Rencontres terminées et feuilles de match (score, déroulé, statistiques d'équipe et de joueurs, compositions, xG) | étapes « nouvelles », « feuilles », « feuilles en retard », le magasin SQLite | chaque passe |
| Rencontres omises par la liste du jour (pages de compétition) | étape « omissions », carnet de santé | chaque passe |
| Classements officiels | étape « classements », tables de l'appli, contrôles | chaque passe |
| Compositions avant le coup d'envoi, absents du jour | boucle des compositions (5 min), enregistreurs | en continu |
| Le direct (minute, score, rouges) | boucle du direct (étape E) | chaque minute pendant les matchs |
| Dates de naissance, nationalités, actualités d'équipe | fiches joueur, analyse IA | à la demande |

C'est une API **interne, non documentée, gratuite et sans clé** : elle peut changer de forme,
limiter, ou refuser l'appli du jour au lendemain, sans préavis.

## 2. Comment on le saura (étape 14, sans une requête de plus)

Chaque réponse que l'actualisation reçoit déjà est notée (`server/src/data/relevesDesSources.js`) :
réussie ou non, la nature d'un échec, et la **forme** du JSON (les champs que l'appli lit sont-ils là ?).
La santé de FotMob se lit dans ces notes (`server/src/data/sourceHealth.js`, `etatFotmob()`).

| Ce que Pierre voit | Ce que ça veut dire probablement |
|---|---|
| **Feu rouge** en haut de l'appli, ligne FotMob « En panne », « N réponses en échec de suite (accès refusé (401/403)…) » | FotMob refuse l'appli : accès coupé, ou un en-tête/jeton est devenu obligatoire |
| « … (trop de requêtes (429)) » | FotMob limite le rythme : l'appli lui en demande trop |
| « … (réponse illisible : pas du JSON…) » | une page de contrôle anti-robot ou de maintenance à la place des données |
| « … (serveur FotMob en panne (5xx)) » | panne chez FotMob, en général passagère |
| Ligne FotMob « À surveiller : forme des réponses inattendue (liste du jour : leagues[].matches[].home.id…) » | FotMob a changé la forme de ses réponses : l'appli lit encore, mais mal |
| Contrôle « Magasin à jour » orange : « Le magasin n'a rien reçu depuis le … » | plus rien n'arrive depuis plus de 36 h |
| Badge **« à vérifier »** sur les pronostics : « FotMob ne répond plus depuis le … » | les résultats et compositions récents peuvent manquer à ce pronostic |
| Carte « Santé des sources » de Réglages | la dernière réponse réussie, le dernier échec et sa nature, la forme de chaque sorte de réponse |

Seuils : **en panne** à 5 réponses en échec de suite (la règle de la boucle du direct), ou quand
toutes les étapes FotMob d'une passe sont en échec ; **à surveiller** dès un échec, un accès
refusé dans les dernières 24 h, une réponse de forme inattendue (la dernière d'une sorte, ou
10 % d'une sorte sur 20 réponses au moins), ou aucune réussite depuis deux passes et une heure.

## 3. Ce qui continue sans FotMob, et ce qui s'arrête

**Continue** (rien à faire) :
- le magasin et tout ce qui s'en sert : 60 000 rencontres depuis 2023, formes, moyennes, repères,
  pronostics du moteur sur les matchs déjà connus ;
- l'historique football-data.co.uk (étape 13) et les cotes passées ;
- les cotes de vos bookmakers (The Odds API, au clic) et les cotes gratuites de référence ;
- les analyses IA (elles lisent le magasin) — avec des données qui vieillissent.

**S'arrête** : les nouveaux résultats et feuilles de match, le règlement automatique des pronostics
et des paris (rien de nouveau à régler), les compositions et absents, le direct, les classements
officiels, le calendrier des matchs à venir (la page Matchs se vide peu à peu de ses nouveaux
matchs). L'étape 46 (prédiction en direct) devra s'arrêter d'elle-même : `etatFotmob().enPanne`.

## 4. Les remplaçants possibles — autorisés seulement

| Source | Statut | Ce qu'elle donnerait | Limites et pièges | Coût |
|---|---|---|---|---|
| **football-data.co.uk** | autorisée, **déjà branchée** (étape 13) | résultats, score à la mi-temps, tirs, tirs cadrés, corners, fautes, cartons, arbitre : 22 divisions européennes ; score final seul pour 16 pays | mis à jour 2 fois par semaine (2 à 4 jours de retard) ; ni compositions, ni joueurs, ni direct, ni Amérique du Sud détaillée ; clubs reliés par le vote jour + score (jamais par les noms) | gratuit |
| **ESPN** (données de match) | **hors de la boucle automatique depuis le 22/09/2026 — seulement avec l'accord de Pierre** ; le code existe (`espnMatchStatsRefresh.js`, `espnScheduleRefresh.js`, `scripts/import-espn-match-stats.mjs`) | calendrier, scores, statistiques d'équipe (18 champs sur 34), compositions | **son rapprochement des rencontres se fait par le NOM des clubs** (`teamNamesLikelyMatch`) : à remplacer par les identifiants (table d'alias, vote jour + score) AVANT tout rebranchement ; les cinq pièges connus (zéro = absent, postes « Substitute », gardiens, buts encaissés, effectif contre déroulé) ; pas d'xG | gratuit, sans clé |
| **API-Football** | autorisée, payante | résultats, statistiques, compositions | plan gratuit : **100 appels par jour et saisons 2022 à 2024 seulement** — inutile pour la saison en cours sans abonnement payant ; aujourd'hui réservée au clic | abonnement à décider par Pierre |
| **The Odds API** (scores) | autorisée pour les cotes ; ses scores seraient une **exception à la règle des sources**, à décider par Pierre | les scores des matchs des 37 compétitions suivies (route des scores) | des crédits sur les 500 du mois ; score final seulement | crédits |
| **FlashScore via Apify** | autorisée, payante, **à la main seulement** | résultats et statistiques d'une journée | ~2 à 3 $ par journée de football | à chaque lancement, accord de Pierre |
| **Fournisseur payant consolidé** (Enetpulse, discussion en cours) | à décider | tout, d'une seule source | contrat, correspondance des champs, prix | à négocier |

**Jamais** (sources interdites) : **OddsPortal, BetExplorer, Packball, Understat, Oddspedia**.
Pas davantage de contournement d'une protection de FotMob (robot qui se fait passer pour un
navigateur, résolution de défi anti-robot) : si FotMob refuse l'appli, on en prend acte.

## 5. La marche à suivre

**J0 — le feu passe au rouge (automatique).** L'appli prévient (feu, carte, badge « à vérifier »)
et continue avec le magasin. Rien d'autre ne se passe tout seul.

**J0 — le diagnostic (Pierre, 5 minutes, carte « Santé des sources » de Réglages).**
1. **429, trop de requêtes** : ralentir. Le réglage existe déjà : `MATCH_STATS_REFRESH_CONCURRENCY=1`
   (au lieu de 4), et au besoin `MATCH_STATS_REFRESH_INTERVAL_MIN=360`, dans `server/.env`, puis
   relancer l'appli. Revoir le feu à la passe suivante.
2. **5xx, serveur en panne** : attendre. L'actualisation rattrape seule l'absence au retour (jusqu'à
   60 jours en arrière, et l'étape « omissions » reprend les rencontres manquantes de la saison).
3. **Forme inattendue** : FotMob a changé ses réponses. C'est une **adaptation du code** (la lecture
   dans `fotMobProvider.js`), à construire dans le bac à sable — pas un changement de source.
4. **401/403 ou réponse illisible** : ouvrir fotmob.com dans le navigateur. Si le site marche et
   l'appli non, FotMob exige peut-être un en-tête ou un jeton nouveau : adaptation du code, dans le
   bac à sable. Si le site lui-même ne répond plus, attendre 24 à 48 h.

**J+1 à J+2 — si la coupure dure (décision de Pierre, rien avant).** Lui présenter, chiffres à
l'appui (ce qui manque, depuis quand, pour quels championnats) :
1. **Rien de plus** : vivre sur le magasin et football-data (résultats européens avec retard) le
   temps que FotMob revienne. Les pronostics des championnats hors football-data portent « à vérifier ».
2. **ESPN pour les données de match**, après remplacement de son rapprochement par les noms
   (identifiants, vote jour + score) — à construire et essayer dans le bac à sable d'abord.
3. **Une source payante** (API-Football payant, FlashScore à la main, fournisseur consolidé) :
   budget et accord explicites de Pierre, à chaque fois.

**Le retour de FotMob.** Dès que les réponses reviennent, le feu repasse au vert ; la passe suivante
rattrape les journées manquées et les feuilles en retard ; l'étape « omissions » réimporte les
rencontres absentes de la saison en cours ; le contrôle quotidien vérifie le magasin (doublons,
matchs manquants, classements). Une source de secours éventuellement branchée se **débranche avec
l'accord de Pierre**, et ce qu'elle a écrit reste reconnaissable par sa provenance.

## 6. Ce qui ne doit jamais arriver

- Une bascule automatique vers une autre source, même gratuite.
- Un crédit payant dépensé sans le clic ou l'accord de Pierre.
- Des rencontres d'une autre source mêlées au magasin **par le nom des clubs** (« Port »,
  « Portsmouth » et « Porto » ont déjà trompé le projet) : uniquement par identifiants.
- Une source interdite, ou un contournement des protections de FotMob.
- Une donnée « corrigée » automatiquement : le contrôle quotidien constate, Pierre décide.
