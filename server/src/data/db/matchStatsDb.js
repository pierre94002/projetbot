/**
 * -----------------------------------------------------------------------
 * Magasin SQLite des statistiques de match.
 * -----------------------------------------------------------------------
 * Remplace les 41 fichiers <AAAA-MM>.json (482 Mo) par une base unique.
 * Ce qui change, et pourquoi :
 *
 *   - Compléter un seul champ d'un match d'octobre 2024 relisait et
 *     réécrivait les 21 Mo du mois. Ici, une ligne.
 *   - Trois lecteurs relisaient le dossier entier, chacun avec sa propre
 *     politique de cache ; l'un d'eux gardait tout le magasin en mémoire.
 *     Une requête indexée remplace le balayage.
 *   - Deux imports simultanés pouvaient se perdre un mois entier : le
 *     dernier à renommer le fichier gagnait. Les transactions sérialisent
 *     désormais les écrivains — à condition d'ouvrir en BEGIN IMMEDIATE,
 *     voir upsertMatches : le BEGIN différé par défaut fait perdre, mesure
 *     à l'appui, 69 % des transactions dès qu'un second écrivain travaille.
 *
 * Ce que cela ne résout PAS : node:sqlite est synchrone. Un écrivain qui
 * patiente bloque la boucle d'événements exactement comme le faisait
 * l'attente active de writeWithRetry. La granularité change — une ligne au
 * lieu d'un mois de 21 Mo — pas la nature de l'attente.
 *
 * EMPLACEMENT — la base vit HORS du dossier OneDrive. Un fichier SQLite dans
 * un dossier synchronisé est plus risqué que des fichiers JSON : verrous,
 * journal WAL et fichiers annexes se prêtent mal à la synchronisation, et
 * une corruption emporterait tout au lieu d'un seul mois. Elle vit dans le
 * dossier personnel (`C:\Users\<nom>\CoteMaster`), jamais sous AppData :
 * voir resolveDbPath. `MATCH_STATS_DB` permet d'en changer.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { slug, sharesNameToken } from '../../utils/nameIdentity.js';
import { TEAM_COLUMNS, PLAYER_COLUMNS, PERCENT_TEAM_KEYS, POSITIVE_TEAM_KEYS, POSITIONS } from './columns.js';
import { modeBacASable, cheminBaseDuBac, assertFichierDuBac } from '../../config/bacASable.js';

export function resolveDbPath() {
  // Bac à sable (cf. config/bacASable.js) : la copie du bac, jamais la vraie
  // base — même pour un script lancé depuis la copie sans MATCH_STATS_DB, qui
  // aurait sinon pris le chemin par défaut ci-dessous. Lève si la base
  // demandée sort du bac.
  if (modeBacASable()) return cheminBaseDuBac();
  if (process.env.MATCH_STATS_DB) return process.env.MATCH_STATS_DB;
  const home = os.homedir();
  // Une tâche planifiée lancée sous un autre compte (SYSTEM) a un autre
  // dossier personnel — C:\Windows\system32\config\systemprofile — et se
  // créerait SA PROPRE base, à côté, sans que rien ne le signale. Mieux
  // vaut s'arrêter et réclamer un chemin explicite que travailler des
  // semaines sur deux magasins qu'on croit n'en faire qu'un.
  if (/systemprofile|ServiceProfiles/i.test(home)) {
    throw new Error(
      "Le dossier personnel est celui d'un profil de service : la base serait créée à part. " +
      'Définissez MATCH_STATS_DB sur le chemin de la base à utiliser.'
    );
  }
  // Le dossier personnel, et SURTOUT pas %LOCALAPPDATA%. L'appli de bureau
  // Claude est empaquetée (MSIX) : Windows redirige tout ce que ses
  // processus écrivent sous AppData vers un dossier privé
  // (…\Packages\Claude_…\LocalCache\Local). L'appli lancée par
  // demarrer-cotemaster.bat et celle lancée depuis Claude lisaient donc deux
  // bases différentes au même chemin : 6 494 rencontres d'un côté, 60 055 de
  // l'autre, le 23/09/2026. Et déplacer les fichiers -wal/-shm d'un côté
  // faisait apparaître le journal de l'autre base : les « incidents de
  // journal » des 22 et 23/09. Le dossier personnel n'est pas redirigé.
  return path.join(home, 'CoteMaster', 'match-stats.db');
}

/**
 * Copie cohérente de la base, même pendant que l'application écrit. Les 41
 * fichiers JSON vivaient dans OneDrive, donc versionnés et restaurables ;
 * sortir la base de OneDrive était juste, mais la prive de ce filet. Tant
 * que la double écriture dure, le JSON reste ce filet — après, c'est ceci.
 */
export function backupTo(destination, { database = openDb() } = {}) {
  fs.mkdirSync(path.dirname(path.resolve(destination)), { recursive: true });
  fs.rmSync(destination, { force: true });
  database.prepare('VACUUM INTO ?').run(path.resolve(destination));
  return { file: path.resolve(destination), bytes: fs.statSync(destination).size };
}

const quote = (c) => `"${c}"`;

function teamDdl() {
  // Les clauses sont assemblées en liste puis jointes UNE fois : construire
  // le corps par morceaux déjà suffixés de virgules laissait une virgule
  // orpheline dès qu'une liste devenait vide — ce qui est arrivé le jour où
  // les contraintes « > 0 » ont été retirées (voir POSITIVE_TEAM_KEYS).
  const clauses = [
    '  match_key TEXT NOT NULL REFERENCES matches(match_key) ON DELETE CASCADE',
    "  side TEXT NOT NULL CHECK (side IN ('home','away'))",
    ...TEAM_COLUMNS.map((c) => `  ${quote(c.column)} ${c.type}`),
    '  PRIMARY KEY (match_key, side)',
    ...TEAM_COLUMNS.filter((c) => POSITIVE_TEAM_KEYS.has(c.key))
      .map((c) => `  CHECK (${quote(c.column)} IS NULL OR ${quote(c.column)} > 0)`)
  ];
  return `CREATE TABLE IF NOT EXISTS team_stats (\n${clauses.join(',\n')}\n) WITHOUT ROWID;`;
}

function playerDdl() {
  const cols = PLAYER_COLUMNS.map((c) => `  ${quote(c.column)} ${c.type}`);
  const positions = POSITIONS.map((p) => `'${p}'`).join(',');
  return [
    'CREATE TABLE IF NOT EXISTS players (',
    '  match_key TEXT NOT NULL REFERENCES matches(match_key) ON DELETE CASCADE,',
    "  side TEXT NOT NULL CHECK (side IN ('home','away')),",
    '  player_key TEXT NOT NULL,',
    "  -- Rang du joueur sur la feuille. Un tableau JSON porte son ordre",
    "  -- gratuitement ; une table SQL n'en a aucun. Sans cette colonne, la",
    '  -- composition reviendrait triée par clé — titulaires et remplaçants',
    '  -- mélangés — au lieu de l\'ordre publié par la source.',
    '  ord INTEGER NOT NULL DEFAULT 0,',
    cols.join(',\n') + ',',
    '  PRIMARY KEY (match_key, side, player_key),',
    "  CHECK (name IS NOT NULL AND name <> ''),",
    "  -- « Substitute » n'est pas un poste : entrer en jeu se lit dans subbed_in.",
    `  CHECK (position IS NULL OR position IN (${positions})),`,
    '  -- Les buts encaissés ne valent que pour un gardien ; le poste peut être',
    '  -- inconnu, mais jamais contredire. Rien n\'est exigé sur « a joué » : les',
    '  -- drapeaux manquent sur 7,8 % des lignes, et refuser l\'inconnu le',
    '  -- transformerait en « n\'a pas joué », ce qui fausserait les moyennes.',
    "  CHECK (goals_conceded IS NULL OR position IS NULL OR position = 'Goalkeeper')",
    ') WITHOUT ROWID;'
  ].join('\n');
}

const MATCHES_DDL = [
  'CREATE TABLE IF NOT EXISTS matches (',
  '  match_key TEXT PRIMARY KEY,',
  '  match_id TEXT NOT NULL,',
  "  date TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),",
  '  league TEXT NOT NULL,',
  "  home_name TEXT NOT NULL CHECK (home_name <> ''),",
  "  away_name TEXT NOT NULL CHECK (away_name <> ''),",
  '  -- Identifiants de la SOURCE, seule identité qui ne bouge pas. Le nom,',
  "  -- lui, s'écrit de plusieurs façons — « Atlético Madrid » et « Atletico",
  '  -- Madrid » désignaient deux clubs, et « Pedrinho » cinq joueurs. Ces',
  '  -- colonnes sont ajoutées aux bases existantes par migrateSchema().',
  '  home_id TEXT,',
  '  away_id TEXT,',
  '  fotmob_id TEXT,',
  '  home_goals INTEGER,',
  '  away_goals INTEGER,',
  '  updated_at TEXT,',
  '  -- Listes ORDONNÉES, publiées entières ou pas du tout : elles sont',
  '  -- remplacées en bloc et toujours relues en entier. Les éclater en tables',
  "  -- coûterait une matérialisation de l'ordre sans rien apporter.",
  '  events TEXT,',
  '  lineups TEXT,',
  '  meta TEXT,',
  '  shotmap TEXT,',
  '  sources TEXT',
  ') WITHOUT ROWID;'
].join('\n');

/**
 * Annuaires d'identités, reconstruits depuis les tables ci-dessus (voir
 * identityRegistry.js). Ce sont des INDEX, pas des sources : tout ce qu'ils
 * contiennent se recalcule à partir de `matches` et `players`.
 *
 * Les tables d'alias ont une clé composite (slug, identifiant), et non le
 * seul slug : « Pedrinho » désigne cinq joueurs distincts, et une clé sur le
 * seul nom aurait imposé d'en oublier quatre.
 */
const REGISTRY_DDL = [
  `CREATE TABLE IF NOT EXISTS teams (
  team_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  league TEXT,
  first_seen TEXT,
  last_seen TEXT,
  played INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT
) WITHOUT ROWID;`,
  `CREATE TABLE IF NOT EXISTS team_aliases (
  slug TEXT NOT NULL,
  team_id TEXT NOT NULL REFERENCES teams(team_id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  seen INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (team_id, alias)
) WITHOUT ROWID;`,
  `CREATE TABLE IF NOT EXISTS people (
  player_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  position TEXT,
  team_id TEXT,
  team_name TEXT,
  first_seen TEXT,
  last_seen TEXT,
  appearances INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT
) WITHOUT ROWID;`,
  `CREATE TABLE IF NOT EXISTS people_aliases (
  slug TEXT NOT NULL,
  player_id TEXT NOT NULL REFERENCES people(player_id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  seen INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (player_id, alias)
) WITHOUT ROWID;`,
  `CREATE TABLE IF NOT EXISTS team_source_names (
  team_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  updated_at TEXT
) WITHOUT ROWID;`,
  // Équivalences de joueurs : FotMob publie parfois le même homme sous DEUX
  // identifiants — l'un dans playerStats, l'autre dans la composition d'une
  // même feuille (Matheus Albino 1461840 / 1204392), ou l'un après l'autre
  // au fil des saisons (Luis Pavez 491925 / 50552, même club, même date de
  // naissance). L'annuaire scindait alors une carrière en deux fiches. Une
  // équivalence s'applique aux lignes existantes (player_id réécrit) et à
  // tout ce qui entre ensuite (upsertMatches). `evidence` dit pourquoi :
  // « meme-feuille » ou « meme-naissance ».
  `CREATE TABLE IF NOT EXISTS people_merges (
  from_id TEXT PRIMARY KEY,
  to_id TEXT NOT NULL,
  evidence TEXT NOT NULL,
  created_at TEXT NOT NULL
) WITHOUT ROWID;`,
  // Classements OFFICIELS, tels que FotMob les publie, par compétition,
  // saison et table — une compétition peut en avoir plusieurs pour une même
  // saison (conférences MLS, Apertura/Clausura). Les lignes sont gardées en
  // JSON : elles se lisent toujours entières, jamais colonne par colonne.
  // Ce n'est PAS un index dérivé des rencontres : c'est une donnée de la
  // source, que le calcul sur les résultats ne sait pas reproduire
  // (pénalités de points, points divisés par deux, départages).
  `CREATE TABLE IF NOT EXISTS standings_official (
  league TEXT NOT NULL,
  season INTEGER NOT NULL,
  table_name TEXT NOT NULL,
  ord INTEGER NOT NULL DEFAULT 0,
  fotmob_league_id INTEGER,
  fotmob_season TEXT,
  fetched_at TEXT NOT NULL,
  rows TEXT NOT NULL,
  PRIMARY KEY (league, season, table_name)
) WITHOUT ROWID;`,
  // Cotes d'AVANT-MATCH d'une rencontre du magasin (1X2, plus ou moins 2,5
  // buts). FotMob n'en publie pas : elles viennent de football-data.co.uk,
  // rattachées à la rencontre FotMob dont le score fait foi (voir
  // footballDataOdds.js). `basis` dit lesquelles : « moyenne clôture »,
  // « Pinnacle clôture »… Elles servent au profilage de cotes.
  `CREATE TABLE IF NOT EXISTS match_odds (
  match_key TEXT PRIMARY KEY REFERENCES matches(match_key) ON DELETE CASCADE,
  source TEXT NOT NULL,
  basis TEXT NOT NULL,
  home REAL NOT NULL,
  draw REAL,
  away REAL NOT NULL,
  over25 REAL,
  under25 REAL,
  fetched_at TEXT NOT NULL
) WITHOUT ROWID;`,
  'CREATE INDEX IF NOT EXISTS idx_teams_slug ON teams(slug);',
  'CREATE INDEX IF NOT EXISTS idx_team_aliases_slug ON team_aliases(slug);',
  'CREATE INDEX IF NOT EXISTS idx_people_slug ON people(slug);',
  'CREATE INDEX IF NOT EXISTS idx_people_team ON people(team_id) WHERE team_id IS NOT NULL;',
  'CREATE INDEX IF NOT EXISTS idx_people_aliases_slug ON people_aliases(slug);'
];

/**
 * Compositions AVANT match, table à part de `matches`. Une rencontre non
 * encore jouée n'y entre JAMAIS : `matches`/`storedEntriesIndex` servent à
 * reconnaître les rencontres déjà en magasin (`known.has(matchKey)` dans
 * fotMobRefresh.js), et une ligne posée là avant le coup d'envoi ferait
 * croire au reste de l'import que la rencontre est déjà connue — elle ne
 * recevrait alors jamais son vrai score. `fotmob_id` seul identifie la
 * ligne : simple à écrire à chaque passage du pré-chargement (cf.
 * lineupPrefetch.js), une ligne remplace l'ancienne, purgée après le match.
 */
const UPCOMING_LINEUPS_DDL = `CREATE TABLE IF NOT EXISTS upcoming_lineups (
  fotmob_id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  kickoff TEXT,
  league TEXT,
  home_id TEXT,
  away_id TEXT,
  home_name TEXT NOT NULL,
  away_name TEXT NOT NULL,
  payload TEXT NOT NULL,
  fetched_at TEXT NOT NULL
) WITHOUT ROWID;`;

/**
 * Dates de naissance des joueurs (01/10/2026, pour leur âge), lues chez
 * FotMob (cf. playerBirthdates.js). Tables À PART : `people` est reconstruite
 * après chaque import et perdrait ce qu'on y ajouterait. `team_squad_reads`
 * date la dernière lecture de l'effectif de chaque club.
 */
const BIRTHDATES_DDL = [
  `CREATE TABLE IF NOT EXISTS player_birthdates (
  player_id TEXT PRIMARY KEY,
  birth_date TEXT,
  country_code TEXT,
  country_name TEXT,
  source TEXT,
  fetched_at TEXT NOT NULL
) WITHOUT ROWID;`,
  `CREATE TABLE IF NOT EXISTS team_squad_reads (
  team_id TEXT PRIMARY KEY,
  fetched_at TEXT NOT NULL,
  version INTEGER
) WITHOUT ROWID;`
];

/**
 * Cotes et prix de marché GRATUITS (03/10/2026, Pierre : « récupère les
 * cotes gratuitement, de la même façon que les données de match »). Sources :
 * football-data.co.uk (fichiers de saison et fixtures.csv), ESPN (DraftKings,
 * ESPN BET, Bet 365…), Kalshi (marché de prédiction : probabilité + volume),
 * Smarkets (bourse : carnet + volume), 365Scores (Bet365). Lecture et
 * écriture dans oddsQuotesRepository.js, par le seul processus serveur
 * (étapes de l'actualisation et boucle oddsWatch).
 *
 * DEUX tables, et non une : une rencontre vue par une source
 * (`odds_events` : compétition, jour, noms, identifiants FotMob, provenance)
 * et ses cotes (`odds_quotes` : bookmaker, marché, sélection, ligne, prix).
 * Une table unique répétait la rencontre sur chacune de ses dizaines de
 * cotes : plusieurs centaines de Mo de plus pour l'historique, dans une base
 * qui en fait déjà 1,6 Go.
 *
 * `match_key` se remplit APRÈS coup (rattachement par identifiants et jour
 * ± 1) : une rencontre à venir n'entre jamais dans `matches`, ses cotes
 * doivent pouvoir l'attendre.
 *
 * `kind` : open (première valeur connue, jamais écrasée), preclose (relevé
 * du vendredi/mardi de football-data), close (dernière valeur avant le coup
 * d'envoi, écrasée à chaque relevé), snapshot (série avant match), live
 * (série en match). `seq` porte cette politique dans la clé : vide pour les
 * trois premiers (une ligne par sélection), l'heure du relevé pour les deux
 * séries (une ligne par relevé). `line` vaut 0 quand le marché n'a pas de
 * ligne. `prob` est la probabilité implicite BRUTE d'un prix d'échange (mid
 * Kalshi/Smarkets) : les trois sélections d'un 1x2 ne font pas 100 %, on
 * normalise à la lecture, jamais en base.
 */
const ODDS_QUOTES_DDL = [
  `CREATE TABLE IF NOT EXISTS odds_events (
  id INTEGER PRIMARY KEY,
  source TEXT NOT NULL,
  source_event TEXT NOT NULL,
  league TEXT NOT NULL,
  date TEXT NOT NULL,
  kickoff TEXT,
  home_name TEXT NOT NULL,
  away_name TEXT NOT NULL,
  home_id TEXT,
  away_id TEXT,
  match_key TEXT,
  provenance TEXT,
  updated_at TEXT NOT NULL
);`,
  `CREATE TABLE IF NOT EXISTS odds_quotes (
  event_id INTEGER NOT NULL REFERENCES odds_events(id) ON DELETE CASCADE,
  bookmaker TEXT NOT NULL,
  market TEXT NOT NULL,
  selection TEXT NOT NULL,
  line REAL NOT NULL DEFAULT 0,
  kind TEXT NOT NULL,
  seq TEXT NOT NULL DEFAULT '',
  releve_at TEXT NOT NULL,
  price REAL,
  prob REAL,
  volume REAL,
  open_interest REAL,
  PRIMARY KEY (event_id, bookmaker, market, selection, line, kind, seq)
) WITHOUT ROWID;`,
  // Nom (ou « id:… », « uuid:… ») d'un club chez une source -> identifiant
  // FotMob. Appris par vote (jour ± 1 + score d'une rencontre jouée) ou par
  // l'annuaire strict ; jamais par ressemblance. Sert aux rencontres à
  // venir, qui n'ont pas de score à voter.
  `CREATE TABLE IF NOT EXISTS team_source_aliases (
  source TEXT NOT NULL,
  name TEXT NOT NULL,
  league TEXT NOT NULL,
  team_id TEXT NOT NULL,
  evidence TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (source, name, league)
) WITHOUT ROWID;`,
  // Ce qui MANQUE (04/10/2026, Pierre : « pour toutes les données que tu
  // n'as pas sur les cotes, il faut que tu le notifies, que je le voie dans
  // CôteMaster ») : pour chaque rencontre qu'une source couvre mais n'a pas
  // pu coter, la raison qu'elle a donnée (« match introuvable chez Kalshi »,
  // « nom d'équipe non reconnu : Man United »…) et l'heure de la vérification.
  // Les clubs par identifiant FotMob, sinon « nom:… ». Purgée après 30 jours.
  `CREATE TABLE IF NOT EXISTS odds_fixture_misses (
  source TEXT NOT NULL,
  date TEXT NOT NULL,
  home_key TEXT NOT NULL,
  away_key TEXT NOT NULL,
  league TEXT NOT NULL,
  home_name TEXT NOT NULL,
  away_name TEXT NOT NULL,
  reason TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  PRIMARY KEY (source, date, home_key, away_key)
) WITHOUT ROWID;`,
  // Curseur des rattrapages historiques (par source et par compétition),
  // pour reprendre où la passe précédente s'est arrêtée.
  `CREATE TABLE IF NOT EXISTS odds_source_state (
  source TEXT NOT NULL,
  scope TEXT NOT NULL,
  cursor TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  detail TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (source, scope)
) WITHOUT ROWID;`
];

/**
 * LES ENREGISTREURS (étape E du plan, 05/10/2026) : ce qui se perd si on ne
 * le note pas sur le moment, gardé sans un token Claude. Tables écrites par le
 * SEUL serveur (data/enregistreurs/), en petites tranches, jamais pendant un
 * import ni quand une autre tâche tient le verrou d'actualisation (cf.
 * data/enregistreurs/file.js). Rencontres, clubs et joueurs par identifiant
 * FotMob — jamais l'identifiant 0, partagé par tous les inconnus d'une feuille.
 *
 *   live_snapshots     l'état d'un match EN COURS, au plus toutes les cinq
 *                      minutes : score, minute, rouges, statistiques du
 *                      moment (xG compris quand FotMob les donne). `stats` :
 *                      JSON compact { clé: [domicile, extérieur] }, treize
 *                      clés de TEAM_STAT_MAP (STATS_DU_DIRECT, liveWatch.js).
 *                      Un champ que la source ne publie pas reste NULL.
 *   unavailable_reads  pour chaque jour (de Paris) et chaque match à venir
 *   unavailable_daily  sous 48 h : la lecture faite (ou reprise du cache des
 *                      compositions), puis un joueur indisponible par ligne
 *                      — blessé, suspendu, en sélection. `upcoming_lineups`
 *                      est purgée deux jours après le match : ceci reste.
 *   engine_picks       les pronostics de marché du moteur (marketPredictions),
 *                      gelés chaque nuit et à chaque analyse automatique.
 *                      Ajout seulement, JAMAIS de mise à jour : la version 1
 *                      est la PREMIÈRE valeur de chaque pronostic, et ne
 *                      change plus ; chaque changement ajoute une version
 *                      datée. Pas dans predictions.json (sous OneDrive,
 *                      alimenté par le seul scan de Mes paris, qui réécrit
 *                      predictedOdds). ATTENTION : `version` est le numéro de
 *                      RÉVISION du pronostic, pas une version du moteur.
 *                      Depuis l'étape 25 du plan (07/10/2026), deux colonnes
 *                      de plus : `engine_version` (le numéro de la VERSION DU
 *                      MOTEUR qui a calculé la valeur, cf.
 *                      core/engine/engineVersions.js) et `distribution`
 *                      (JSON : toutes les issues du marché et leur
 *                      probabilité, à la ligne du pronostic). Les lignes
 *                      gelées avant ne sont jamais réécrites : NULL, « sans
 *                      version ».
 *   engine_candidate_picks  (étape 25) les chiffres de la VERSION CANDIDATE,
 *                      calculée « à blanc » chaque nuit à côté de la version
 *                      en service, seulement pour les marchés qu'elle change :
 *                      les deux distributions (candidate et en service) sur
 *                      la même ligne, pour le juge de l'étape 16. Écrite par
 *                      le seul serveur (data/enregistreurs/moteurABlanc.js),
 *                      ajout seulement (`revision` comme `version` ci-dessus),
 *                      lue par AUCUN écran, aucun pari, aucune analyse IA.
 *   recorder_counts    lignes gardées par enregistreur et par jour de Paris,
 *   recorder_state     et depuis quand chacun tourne : l'état que lit la carte
 *                      « Enregistreurs » de Réglages sans rien recompter.
 *
 * Les cotes payantes (The Odds API) vont dans odds_events/odds_quotes, source
 * « odds-api » (cf. data/enregistreurs/cotesPayantes.js), écartées des
 * lectures des cotes GRATUITES (SOURCES_PAYANTES, oddsQuotesRepository.js).
 */
const ENREGISTREURS_DDL = [
  `CREATE TABLE IF NOT EXISTS live_snapshots (
  fotmob_id TEXT NOT NULL,
  taken_at TEXT NOT NULL,
  kind TEXT NOT NULL,
  date TEXT NOT NULL,
  kickoff TEXT,
  league TEXT,
  league_key TEXT,
  home_id TEXT,
  away_id TEXT,
  home_name TEXT,
  away_name TEXT,
  status TEXT NOT NULL,
  minute INTEGER,
  added_time INTEGER,
  minute_label TEXT,
  home_goals INTEGER,
  away_goals INTEGER,
  home_red INTEGER,
  away_red INTEGER,
  xg_home REAL,
  xg_away REAL,
  stats TEXT,
  coverage TEXT,
  detail_at TEXT,
  source TEXT NOT NULL,
  PRIMARY KEY (fotmob_id, taken_at)
) WITHOUT ROWID;`,
  `CREATE TABLE IF NOT EXISTS unavailable_reads (
  day TEXT NOT NULL,
  fotmob_id TEXT NOT NULL,
  date TEXT,
  kickoff TEXT,
  league TEXT,
  home_id TEXT,
  away_id TEXT,
  home_name TEXT,
  away_name TEXT,
  read_at TEXT NOT NULL,
  origin TEXT NOT NULL,
  status TEXT NOT NULL,
  home_count INTEGER,
  away_count INTEGER,
  PRIMARY KEY (day, fotmob_id)
) WITHOUT ROWID;`,
  `CREATE TABLE IF NOT EXISTS unavailable_daily (
  day TEXT NOT NULL,
  fotmob_id TEXT NOT NULL,
  side TEXT NOT NULL,
  player_key TEXT NOT NULL,
  player_id TEXT,
  player_name TEXT NOT NULL,
  team_id TEXT,
  reason TEXT,
  expected_return TEXT,
  read_at TEXT NOT NULL,
  PRIMARY KEY (day, fotmob_id, side, player_key)
) WITHOUT ROWID;`,
  `CREATE TABLE IF NOT EXISTS engine_picks (
  fixture_key TEXT NOT NULL,
  market_key TEXT NOT NULL,
  version INTEGER NOT NULL,
  recorded_at TEXT NOT NULL,
  origin TEXT NOT NULL,
  match_id TEXT,
  league TEXT,
  date TEXT NOT NULL,
  kickoff TEXT,
  home_name TEXT,
  away_name TEXT,
  home_id TEXT,
  away_id TEXT,
  market_id TEXT NOT NULL,
  market TEXT,
  params TEXT,
  choice TEXT,
  label TEXT,
  probability REAL,
  predicted_odds REAL,
  market_odds REAL,
  min_odds REAL,
  odds_source TEXT,
  odds_at TEXT,
  lineup_state TEXT,
  lineup_at TEXT,
  engine_hash TEXT,
  engine_version INTEGER,
  distribution TEXT,
  PRIMARY KEY (fixture_key, market_key, version)
) WITHOUT ROWID;`,
  `CREATE TABLE IF NOT EXISTS engine_candidate_picks (
  candidate_id TEXT NOT NULL,
  fixture_key TEXT NOT NULL,
  market_key TEXT NOT NULL,
  revision INTEGER NOT NULL,
  recorded_at TEXT NOT NULL,
  candidate_hash TEXT NOT NULL,
  service_version INTEGER,
  match_id TEXT,
  league TEXT,
  date TEXT NOT NULL,
  kickoff TEXT,
  home_name TEXT,
  away_name TEXT,
  home_id TEXT,
  away_id TEXT,
  market_id TEXT NOT NULL,
  market TEXT,
  params TEXT,
  choice TEXT,
  label TEXT,
  probability REAL,
  predicted_odds REAL,
  distribution TEXT,
  service_params TEXT,
  service_choice TEXT,
  service_probability REAL,
  service_predicted_odds REAL,
  service_distribution TEXT,
  odds_source TEXT,
  odds_at TEXT,
  lineup_state TEXT,
  PRIMARY KEY (candidate_id, fixture_key, market_key, revision)
) WITHOUT ROWID;`,
  `CREATE TABLE IF NOT EXISTS recorder_counts (
  recorder TEXT NOT NULL,
  day TEXT NOT NULL,
  rows INTEGER NOT NULL DEFAULT 0,
  last_at TEXT,
  PRIMARY KEY (recorder, day)
) WITHOUT ROWID;`,
  `CREATE TABLE IF NOT EXISTS recorder_state (
  recorder TEXT PRIMARY KEY,
  first_at TEXT,
  last_at TEXT,
  source_at TEXT,
  detail TEXT,
  updated_at TEXT NOT NULL
) WITHOUT ROWID;`
];

/**
 * L'HISTORIQUE FOOTBALL-DATA (étape 13 du plan, 06/10/2026) : les fichiers
 * gratuits de football-data.co.uk depuis 2000-01 — 22 divisions européennes
 * à fichier saisonnier et 16 fichiers par pays —, une ligne COMPACTE par
 * match (la base pèse déjà 1,8 Go). Écrit par footballDataHistory.js, dans
 * l'actualisation du serveur (ou, dans le bac à sable, par
 * scripts/import-fd-history.mjs) ; jamais dans match_odds.
 *
 *   fd_teams    l'identité d'un club chez football-data : son PAYS (ENG, SCO,
 *               GER… ou le code du fichier par pays) et son nom tel que le
 *               site l'écrit — stable d'une saison à l'autre, jamais
 *               rapproché d'un autre nom. `team_id` : l'identifiant FotMob que
 *               lui donne le VOTE (jour + score, sur les saisons communes avec
 *               le magasin, depuis 2023), quand il existe ; un club disparu
 *               avant 2023 garde sa seule identité football-data.
 *   fd_history  un match : division ou fichier par pays (`code`), saison,
 *               jour UTC du coup d'envoi (`date`) et jour écrit dans le fichier
 *               (`date_fichier`, la clé de la rencontre chez la source), heure
 *               UTC quand le fichier la donne, les deux clubs (fd_teams), la
 *               rencontre FotMob désignée (`match_key`) et l'issue du
 *               rattachement (`lien` : 0 hors de la période du magasin ou
 *               championnat non suivi, 1 même score, 2 score différent — la
 *               rencontre est gardée pour qu'on dise laquelle —, 3 club sans
 *               identifiant, 4 aucune rencontre de ces deux clubs) ; scores
 *               (fin, mi-temps), statistiques (tirs, cadrés, corners, fautes —
 *               ou coups francs concédés quand le fichier n'a qu'eux —,
 *               jaunes, rouges, xG), arbitre ; les COTES en centièmes
 *               (INTEGER : 2,25 -> 225, deux octets au lieu de huit) :
 *               moyenne (moy) et maximum (max) du marché, Pinnacle (pin),
 *               Bet365 (b365), William Hill (wh), d'avant-match (sans c) et de
 *               clôture (avec c) — 1X2 (1, n, 2), plus/moins 2,5 buts (p25,
 *               m25, sauf William Hill que le site ne donne pas) et handicap
 *               asiatique à la ligne du marché (ahd, ahe ; ligne en centièmes
 *               de but, côté domicile). Une case vide = la source ne la donne
 *               pas, jamais 0. Rien d'autre pour les buts : ni 1,5, ni 3,5,
 *               ni « les deux marquent ».
 *   fd_fichiers l'état de chaque fichier (importé, absent chez la source, en
 *               échec avec la raison), sa date de relevé, son empreinte : le
 *               curseur de reprise de l'import, qui s'étale sur plusieurs
 *               passes.
 */
const COTES_FD = [
  ...['moy', 'max', 'pin', 'b365', 'wh'].flatMap((l) => ['1', 'n', '2', 'c1', 'cn', 'c2'].map((s) => `${l}_${s}`)),
  ...['moy', 'max', 'pin', 'b365'].flatMap((l) => ['p25', 'm25', 'cp25', 'cm25'].map((s) => `${l}_${s}`)),
  'ah_ligne',
  'ah_cligne',
  ...['moy', 'max', 'pin', 'b365'].flatMap((l) => ['ahd', 'ahe', 'cahd', 'cahe'].map((s) => `${l}_${s}`))
];
/** Colonnes de cotes de fd_history (centièmes), dans l'ordre de la table. */
export const COLONNES_COTES_FD = Object.freeze(COTES_FD);

const FD_HISTORY_DDL = [
  `CREATE TABLE IF NOT EXISTS fd_teams (
  id INTEGER PRIMARY KEY,
  pays TEXT NOT NULL,
  nom TEXT NOT NULL,
  team_id TEXT,
  votes INTEGER,
  total INTEGER,
  etat TEXT,
  UNIQUE (pays, nom)
);`,
  `CREATE TABLE IF NOT EXISTS fd_history (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL,
  saison TEXT NOT NULL,
  date TEXT NOT NULL,
  date_fichier TEXT NOT NULL,
  heure TEXT,
  dom INTEGER NOT NULL REFERENCES fd_teams(id),
  ext INTEGER NOT NULL REFERENCES fd_teams(id),
  match_key TEXT,
  lien INTEGER NOT NULL DEFAULT 0,
  bd INTEGER NOT NULL,
  be INTEGER NOT NULL,
  mtd INTEGER,
  mte INTEGER,
  tirs_d INTEGER,
  tirs_e INTEGER,
  cadres_d INTEGER,
  cadres_e INTEGER,
  corners_d INTEGER,
  corners_e INTEGER,
  fautes_d INTEGER,
  fautes_e INTEGER,
  cf_d INTEGER,
  cf_e INTEGER,
  jaunes_d INTEGER,
  jaunes_e INTEGER,
  rouges_d INTEGER,
  rouges_e INTEGER,
  xg_d INTEGER,
  xg_e INTEGER,
  arbitre TEXT,
${COTES_FD.map((c) => `  ${c} INTEGER`).join(',\n')}
);`,
  `CREATE TABLE IF NOT EXISTS fd_fichiers (
  fichier TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  saison TEXT,
  statut TEXT NOT NULL,
  lu_le TEXT,
  version TEXT,
  sha1 TEXT,
  octets INTEGER,
  lignes INTEGER,
  ignorees INTEGER,
  encodage TEXT,
  erreur TEXT,
  essais INTEGER NOT NULL DEFAULT 0,
  importe_le TEXT,
  updated_at TEXT NOT NULL
) WITHOUT ROWID;`
];

/**
 * LES REPÈRES DE CHAQUE CHAMPIONNAT (étape 15 du plan, 07/10/2026) : ce
 * qu'est un match « normal » dans un championnat, saison par saison, calculé
 * chaque nuit par l'étape « reperes » de l'actualisation (leagueBenchmarks.js),
 * lu par GET /api/match-stats/benchmarks. Une ligne par championnat, saison
 * et repère : la valeur (moyenne par match, ou part de 0 à 1), le nombre de
 * matchs qui la portent, l'écart-type d'un match, la SOURCE de la saison
 * (« fotmob » ou « football-data » : une seule par saison), le détail (mois
 * par mois, scores, empreinte de ce qui a été lu) et la date du calcul.
 * Lignes spéciales : la saison « toutes » (toutes les saisons d'un
 * championnat réunies, la dispersion et le facteur de terrain mesurés) et le
 * championnat « * » (tous les championnats). Rien ici n'entre dans le moteur.
 * La clé primaire sert toutes les lectures (par championnat) : aucun index de
 * plus.
 */
const LEAGUE_BENCHMARKS_DDL = `CREATE TABLE IF NOT EXISTS league_benchmarks (
  league TEXT NOT NULL,
  saison TEXT NOT NULL,
  repere TEXT NOT NULL,
  debut INTEGER,
  valeur REAL,
  matchs INTEGER NOT NULL DEFAULT 0,
  ecart REAL,
  source TEXT NOT NULL,
  detail TEXT,
  calcule_le TEXT NOT NULL,
  PRIMARY KEY (league, saison, repere)
) WITHOUT ROWID;`;

/**
 * LA TABLE DU JOUR J (étape 17 du plan, 07/10/2026) : pour chaque rencontre
 * et chacun de ses deux camps, ce qui s'est passé (les faits du match) et ce
 * qu'on savait LA VEILLE (les entrées exactes que lit le moteur, calculées
 * avec les seuls matchs d'un jour UTC strictement antérieur) ; la même chose
 * pour chaque joueur identifié sur chaque feuille ; les moyennes de chaque
 * championnat avant chacun de ses jours de match. Calculée chaque nuit par
 * l'étape « tableJourJ » de l'actualisation (dayTable.js), mesurée
 * seulement : le moteur ne la lit pas encore (étape 19).
 *
 * Ce sont des tables DÉRIVÉES, reconstructibles en quelques minutes, comme les
 * annuaires : aucune clé étrangère vers `matches` (une suppression de
 * rencontre balaierait sinon deux millions de lignes joueur sans index) ; la
 * cohérence est refaite chaque nuit par le registre `day_matches`. Clubs et
 * joueurs par le NUMÉRO de leur identifiant FotMob (« fotmob-8456 » → 8456),
 * jamais par leur nom. Notes ×100, xG ×1000 : des entiers, que le lecteur
 * divise. L'état (version, repères de la nuit, contrôle anti-fuite) vit dans
 * la base, dans `day_state` : une base restaurée amène le sien.
 */
const DAY_TABLE_DDL = [
  `CREATE TABLE IF NOT EXISTS day_matches (
  rencontre INTEGER PRIMARY KEY AUTOINCREMENT,
  match_key TEXT NOT NULL UNIQUE,
  fotmob_id TEXT,
  date TEXT NOT NULL,
  league TEXT NOT NULL,
  saison INTEGER NOT NULL,
  home INTEGER NOT NULL,
  away INTEGER NOT NULL,
  updated_at TEXT
);`,
  `CREATE TABLE IF NOT EXISTS team_day (
  rencontre INTEGER NOT NULL,
  camp INTEGER NOT NULL,
  club INTEGER NOT NULL,
  adversaire INTEGER NOT NULL,
  date TEXT NOT NULL,
  league TEXT NOT NULL,
  saison INTEGER NOT NULL,
  attribue INTEGER NOT NULL,
  prolongation INTEGER NOT NULL,
  compte INTEGER NOT NULL,
  coupe INTEGER NOT NULL,
  releve INTEGER NOT NULL,
  bp INTEGER NOT NULL,
  bc INTEGER NOT NULL,
  bp90 INTEGER,
  bc90 INTEGER,
  xg_p REAL,
  xg_c REAL,
  tirs_p INTEGER,
  tirs_c INTEGER,
  cadres_p INTEGER,
  cadres_c INTEGER,
  corners_p INTEGER,
  corners_c INTEGER,
  jaunes_p INTEGER,
  jaunes_c INTEGER,
  rouges_p INTEGER,
  rouges_c INTEGER,
  fautes_p INTEGER,
  fautes_c INTEGER,
  occasions_p INTEGER,
  occasions_c INTEGER,
  possession_p REAL,
  f10_corners_p INTEGER,
  f10_corners_c INTEGER,
  f10_corners_n INTEGER,
  f10_tirs_p INTEGER,
  f10_tirs_c INTEGER,
  f10_tirs_n INTEGER,
  f10_cadres_p INTEGER,
  f10_cadres_c INTEGER,
  f10_cadres_n INTEGER,
  f5_1 INTEGER,
  f5_2 INTEGER,
  f5_3 INTEGER,
  f5_4 INTEGER,
  f5_5 INTEGER,
  s_bp_dom INTEGER,
  s_bc_dom INTEGER,
  s_n_dom INTEGER,
  s_bp_ext INTEGER,
  s_bc_ext INTEGER,
  s_n_ext INTEGER,
  s_en_saison INTEGER,
  g_saison INTEGER,
  g_bp_dom INTEGER,
  g_bc_dom INTEGER,
  g_n_dom INTEGER,
  g_bp_ext INTEGER,
  g_bc_ext INTEGER,
  g_n_ext INTEGER,
  PRIMARY KEY (rencontre, camp)
) WITHOUT ROWID;`,
  `CREATE TABLE IF NOT EXISTS league_day (
  league TEXT NOT NULL,
  date TEXT NOT NULL,
  l_source TEXT NOT NULL,
  l_n INTEGER NOT NULL,
  l_bd INTEGER NOT NULL,
  l_be INTEGER NOT NULL,
  l_xg_n INTEGER NOT NULL,
  l_xd REAL NOT NULL,
  l_xe REAL NOT NULL,
  l_cad_n INTEGER NOT NULL,
  l_cd INTEGER NOT NULL,
  l_ce INTEGER NOT NULL,
  c_saison INTEGER,
  c_n INTEGER NOT NULL,
  c_bd INTEGER NOT NULL,
  c_be INTEGER NOT NULL,
  PRIMARY KEY (league, date)
) WITHOUT ROWID;`,
  `CREATE TABLE IF NOT EXISTS player_day (
  joueur INTEGER NOT NULL,
  date TEXT NOT NULL,
  rencontre INTEGER NOT NULL,
  club INTEGER NOT NULL,
  camp INTEGER NOT NULL,
  joue INTEGER NOT NULL,
  titulaire INTEGER,
  entre INTEGER,
  poste INTEGER,
  minutes INTEGER,
  note INTEGER,
  buts INTEGER,
  passes_d INTEGER,
  tirs INTEGER,
  cadres INTEGER,
  xg INTEGER,
  xa INTEGER,
  xgnp INTEGER,
  xgot INTEGER,
  pc INTEGER,
  recup INTEGER,
  duels_g INTEGER,
  duels_t INTEGER,
  buts_evites INTEGER,
  buts_concedes INTEGER,
  jaunes INTEGER,
  rouges INTEGER,
  entre_min INTEGER,
  sorti_min INTEGER,
  csc INTEGER,
  a10_n INTEGER,
  a10_min INTEGER,
  a10_note_s INTEGER,
  a10_note_n INTEGER,
  a10_buts INTEGER,
  a10_xg INTEGER,
  PRIMARY KEY (joueur, date, rencontre)
) WITHOUT ROWID;`,
  `CREATE TABLE IF NOT EXISTS day_state (
  cle TEXT PRIMARY KEY,
  valeur TEXT NOT NULL
) WITHOUT ROWID;`,
  // Les faits d'un club dans le temps : la lecture « club par club » de la
  // nuit et de faitsEquipe. Aucun index sur player_day.rencontre (il coûterait
  // ~30 Mo) : la nuit balaie la table par tranches de joueurs quand une
  // rencontre disparaît ou change.
  'CREATE INDEX IF NOT EXISTS idx_team_day_club ON team_day(club, date);'
];

/**
 * LE BANC D'ESSAI (étape 19 du plan, 13/10/2026) : une ligne par rejeu, son
 * RÉSUMÉ seulement (les cases, leurs verdicts, les paris, la carte, la
 * reproduction du 23/09 ; quelques centaines de Ko) — jamais les lignes
 * détaillées (1,4 million par rejeu complet, que rien ne lit à l'écran ; elles
 * se refont en quelques minutes et s'exportent en JSON Lines). Écrite par le
 * banc seul (src/bench/depotBanc.js), sous le verrou d'actualisation : un
 * INSERT au lancement (fini_le, bilan et resume vides — un rejeu interrompu se
 * voit), un UPDATE à la fin, jamais deux, jamais sur une ligne finie.
 *   ou             'bac' (scripts/bench.mjs) ou 'serveur' (le bouton de l'appli) ;
 *   version_moteur le numéro de version du moteur rejoué, ou NULL (sans version) ;
 *   options        JSON : périodes, jeux de prix, marchés, bornes, graine, tirages, réglages, vues ;
 *   bilan          JSON : comptes, écartées, durées par partie, mémoire, plus long blocage, erreur ;
 *   resume         JSON : le résumé (src/bench/resume.js).
 */
const BENCH_DDL = [
  `CREATE TABLE IF NOT EXISTS bench_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lance_le TEXT NOT NULL,
  fini_le TEXT,
  ou TEXT NOT NULL,
  version_banc INTEGER NOT NULL,
  format_lignes INTEGER NOT NULL,
  empreinte_moteur TEXT NOT NULL,
  empreinte_code TEXT NOT NULL,
  version_moteur INTEGER,
  options TEXT NOT NULL,
  bilan TEXT,
  resume TEXT
);`
];

/**
 * LA VALEUR DE CHAQUE STATISTIQUE (étape 18 du plan, 13/10/2026) : fiabilité,
 * stabilisation, pouvoir prédictif, demi-vie et fenêtre conseillée de chaque
 * statistique d'équipe et de joueur, mesurées sur la table du jour J
 * (src/bench/statValue.js). Écrites par ce calcul seul, sous le verrou
 * d'actualisation (nom « valeur-des-stats » ; le script du bac, ou le serveur
 * au clic) : un INSERT dans stat_value_runs au lancement (un calcul
 * interrompu se voit), puis les lignes de stat_value et l'UPDATE du calcul
 * dans UNE transaction, jamais sur un calcul fini. Lues par la route
 * GET /api/bench/stat-value et par les étapes 27, 29, 30
 * (lireParametresStatistique). Quelques dizaines de lignes par calcul.
 *   stat_value_runs  ou : 'bac' | 'serveur' | 'essai' ; options et bilan en JSON ;
 *   stat_value       une ligne par (calcul, statistique, échelle, source) : les
 *                    mesures et leurs fourchettes en colonnes, tout le détail
 *                    (courbes, jugements, étiquettes « déjà vu ») en JSON.
 */
const STAT_VALUE_DDL = [
  `CREATE TABLE IF NOT EXISTS stat_value_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lance_le TEXT NOT NULL,
  fini_le TEXT,
  ou TEXT NOT NULL,
  version INTEGER NOT NULL,
  options TEXT NOT NULL,
  bilan TEXT
);`,
  `CREATE TABLE IF NOT EXISTS stat_value (
  calcul INTEGER NOT NULL,
  statistique TEXT NOT NULL,
  echelle TEXT NOT NULL,
  source TEXT NOT NULL,
  cible TEXT NOT NULL,
  fiabilite REAL,
  fiabilite_bas REAL,
  fiabilite_haut REAL,
  fiabilite_n INTEGER,
  fiabilite_10 REAL,
  stabilisation REAL,
  stabilisation_bas REAL,
  stabilisation_haut REAL,
  pouvoir REAL,
  pouvoir_bas REAL,
  pouvoir_haut REAL,
  pouvoir_n INTEGER,
  demi_vie REAL,
  demi_vie_bas REAL,
  demi_vie_haut REAL,
  fenetre_actuelle INTEGER NOT NULL,
  fenetre_conseillee INTEGER,
  fenetre_bas INTEGER,
  fenetre_haut INTEGER,
  verdict_fenetre TEXT NOT NULL,
  verdict TEXT,
  detail TEXT NOT NULL,
  PRIMARY KEY (calcul, statistique, echelle, source)
) WITHOUT ROWID;`
];

/**
 * LA CALIBRATION MENSUELLE (étape 20 du plan, 13/10/2026) : le bilan FIGÉ de
 * chaque mois écoulé — ce que le moteur avait annoncé (pronostics gelés,
 * engine_picks) face à ce qui s'est passé, tranche par tranche, par marché et
 * par championnat, la valeur de clôture des pronostics et des paris de Pierre
 * (src/data/calibration.js). Une ligne par mois, écrite UNE fois par le
 * serveur seul (étape « calibrationMensuelle » de l'actualisation, sous son
 * verrou), jamais réécrite : le déclencheur refuse tout UPDATE — un mois figé
 * reste comparable aux suivants, même si le calcul change (sa `version` le
 * dit). Le mois en cours n'y est jamais : il se calcule à la demande.
 *   bilan   JSON : le bilan complet (les deux lectures, première valeur et
 *           dernière avant le coup d'envoi ; les juges ; les comptes écartés) ;
 *   resume  JSON : ses chiffres clés, pour la liste des mois (sans relire
 *           chaque bilan).
 */
const CALIBRATION_DDL = [
  `CREATE TABLE IF NOT EXISTS calibration_monthly (
  mois TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  fige_le TEXT NOT NULL,
  du TEXT NOT NULL,
  au TEXT NOT NULL,
  pronostics INTEGER NOT NULL,
  paris INTEGER NOT NULL,
  resume TEXT NOT NULL,
  bilan TEXT NOT NULL
) WITHOUT ROWID;`,
  `CREATE TRIGGER IF NOT EXISTS calibration_monthly_jamais_reecrit BEFORE UPDATE ON calibration_monthly
BEGIN
  SELECT RAISE(ABORT, 'calibration_monthly : un mois figé ne se réécrit jamais');
END;`
];

/**
 * LA CARTE « OÙ PARIER » (étape 23 du plan, 22/10/2026) : championnat × marché, l'avantage du moteur jugé
 * par le juge de l'étape 16 (src/data/bettingMap.js). Une ligne par carte calculée (le 1er du mois, à un
 * nouveau rejeu du banc, à un changement de réglages), écrite UNE fois par le serveur seul (étape
 * « carteOuParier » de l'actualisation, sous son verrou ; le calcul a tourné dans un processus à part en
 * lecture seule), jamais réécrite (la base refuse un UPDATE) ; toutes gardées (~0,3 Mo chacune) : l'évolution
 * se relit, et les REGARDS de la mesure en direct se comptent dessus.
 *   mois             'AAAA-MM' (heure de Paris) du calcul ;
 *   raison           'premiere' | 'nouveau-banc' | 'reglages' | 'mensuelle' ;
 *   empreinte_*      le moteur mesuré (code + réglages ; réglages seuls) : une carte d'autres réglages ne
 *                    colore plus rien ;
 *   banc_*, k_banc   le rejeu du banc relu, son étiquette ('exact' | 'code-precedent' | 'k-insuffisant' |
 *                    'aucun') et son K' (le nombre de cases de SA carte) ;
 *   k_vivant, regards  le K de la mesure en direct (cases jugées) et ses regards (max(24, cartes + 1)) ;
 *   fenetre, resume, contenu   JSON : la fenêtre du direct, les comptes, les championnats et les cases.
 */
const BETTING_MAP_DDL = [
  `CREATE TABLE IF NOT EXISTS betting_map (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mois TEXT NOT NULL,
  calcule_le TEXT NOT NULL,
  raison TEXT NOT NULL,
  version_carte INTEGER NOT NULL,
  moteur_version INTEGER,
  empreinte_moteur TEXT NOT NULL,
  empreinte_reglages TEXT NOT NULL,
  banc_id INTEGER,
  banc_etiquette TEXT,
  k_banc INTEGER,
  k_vivant INTEGER NOT NULL,
  regards INTEGER NOT NULL,
  fenetre TEXT NOT NULL,
  resume TEXT NOT NULL,
  contenu TEXT NOT NULL
);`,
  'CREATE INDEX IF NOT EXISTS idx_betting_map_mois ON betting_map(mois, id);',
  `CREATE TRIGGER IF NOT EXISTS betting_map_jamais_reecrit BEFORE UPDATE ON betting_map
BEGIN
  SELECT RAISE(ABORT, 'betting_map : une carte calculée ne se réécrit jamais');
END;`
];

/**
 * CONNAÎTRE LE MARCHÉ (étape 22 du plan, 13/10/2026) : la justesse, la vitesse, les biais et la marge de
 * chaque bookmaker, et le meilleur moment pour parier de chaque championnat, mesurés sur les cotes
 * archivées (src/data/marketKnowledge.js). Écrites par le serveur seul (étape « connaitreMarche » de
 * l'actualisation, sous son verrou ; scripts/market-knowledge.mjs dans le bac), le calcul ayant tourné
 * dans un processus à part en lecture seule. Lues par les étapes 23 et 31 (lireConnaissanceDuMarche).
 *   market_knowledge_runs  une ligne par calcul : INSERT au lancement (fini_le vide : un calcul
 *                          interrompu se voit), `fini_le` posé dans la dernière transaction du rangement
 *                          — les lecteurs ne lisent que le dernier calcul FINI ; `empreinte` (JSON) : les
 *                          sources lues (rien de neuf : rien recalculé) ; `bilan`, `resume` (JSON) ;
 *   market_knowledge       le résumé chiffré du DERNIER calcul fini (les autres sont retirés par
 *                          tranches après lui) : une ligne par mesure × portée (« * » = tous les
 *                          championnats) × moment × livre × clé, avec son nombre de matchs `n`, sa
 *                          valeur, sa fourchette et le verdict du juge de l'étape 16 ; le détail en JSON.
 *                          Une table à rowid : le ménage retire par tranches (rowid IN … LIMIT).
 */
const MARKET_KNOWLEDGE_DDL = [
  `CREATE TABLE IF NOT EXISTS market_knowledge_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lance_le TEXT NOT NULL,
  fini_le TEXT,
  ou TEXT NOT NULL,
  version INTEGER NOT NULL,
  empreinte TEXT NOT NULL,
  bilan TEXT,
  resume TEXT
);`,
  `CREATE TABLE IF NOT EXISTS market_knowledge (
  calcul INTEGER NOT NULL,
  mesure TEXT NOT NULL,
  portee TEXT NOT NULL,
  moment TEXT NOT NULL,
  livre TEXT NOT NULL,
  cle TEXT NOT NULL,
  n INTEGER NOT NULL,
  valeur REAL,
  bas REAL,
  haut REAL,
  verdict TEXT,
  detail TEXT NOT NULL,
  PRIMARY KEY (calcul, mesure, portee, moment, livre, cle)
);`
];

/**
 * L'INDICE DE FORCE DES ÉQUIPES (étape 29 du plan, 14/10/2026 ; data/db/teamStrength.js) : pour chaque club
 * et chaque jour où il joue, sa force « avant ce jour » (rien du jour même ni d'après), et sa ligne ACTUELLE
 * (actuel = 1 ; jour = le premier jour où elle vaut, le lendemain du dernier jour pris en compte), au total,
 * à domicile et à l'extérieur (lieu). Clubs par le NUMÉRO de leur identifiant FotMob, jamais par leur nom ;
 * league = son championnat ce jour-là. Entiers : valeurs par match ×100, note (force, buts d'écart attendus
 * face à une équipe moyenne du championnat) ×1000, percentiles 0-100 dans le championnat (plus haut = mieux,
 * même pour ce qu'on concède). formule : 'xg', ou 'sans-xg' (le repli sur les buts et les tirs). Table
 * DÉRIVÉE, refaite en quelques minutes ; écrite par le serveur seul (étape « indiceForce » de
 * l'actualisation ; scripts/team-strength.mjs dans le bac), sous le verrou de la passe. L'état (version,
 * réglages, empreinte des rencontres, bilan, mesure au banc) vit dans team_strength_state.
 */
const TEAM_STRENGTH_DDL = [
  `CREATE TABLE IF NOT EXISTS team_strength (
  club INTEGER NOT NULL,
  jour TEXT NOT NULL,
  lieu TEXT NOT NULL,
  actuel INTEGER NOT NULL,
  league TEXT NOT NULL,
  saison INTEGER NOT NULL,
  formule TEXT,
  n INTEGER,
  n_xg INTEGER,
  force INTEGER,
  rang INTEGER,
  equipes INTEGER,
  pct_force INTEGER,
  xg_p INTEGER,
  xg_c INTEGER,
  tirs_p INTEGER,
  tirs_c INTEGER,
  cadres_p INTEGER,
  cadres_c INTEGER,
  occasions_p INTEGER,
  occasions_c INTEGER,
  buts_p INTEGER,
  buts_c INTEGER,
  corners_p INTEGER,
  corners_c INTEGER,
  possession INTEGER,
  pct_xg_p INTEGER,
  pct_xg_c INTEGER,
  pct_tirs_p INTEGER,
  pct_tirs_c INTEGER,
  pct_cadres_p INTEGER,
  pct_cadres_c INTEGER,
  pct_occasions_p INTEGER,
  pct_occasions_c INTEGER,
  pct_buts_p INTEGER,
  pct_buts_c INTEGER,
  pct_corners_p INTEGER,
  pct_corners_c INTEGER,
  pct_possession INTEGER,
  PRIMARY KEY (club, jour, lieu)
) WITHOUT ROWID;`,
  `CREATE TABLE IF NOT EXISTS team_strength_state (
  cle TEXT PRIMARY KEY,
  valeur TEXT NOT NULL
) WITHOUT ROWID;`,
  // Les lignes d'un championnat à partir d'un jour (la nuit les réécrit) ; ses lignes actuelles (l'écran).
  'CREATE INDEX IF NOT EXISTS idx_team_strength_ligue ON team_strength(league, jour);',
  'CREATE INDEX IF NOT EXISTS idx_team_strength_actuel ON team_strength(league, lieu) WHERE actuel = 1;'
];

/**
 * LES FORCES DE BUTS (étape 27 du plan, 21/10/2026) : ce que le modèle de buts unique (core/engine/goalModel.js)
 * lit de chaque club et de chaque championnat, « avant le jour J ». Tables DÉRIVÉES de la table du jour J, refaites
 * en quelques secondes ; écrites par le serveur seul (étape « forcesButs » de l'actualisation ;
 * scripts/forces-buts.mjs dans le bac), sous le verrou de la passe ; calculées dans un processus à part en lecture
 * seule (data/db/forcesButs.js).
 *   forces_buts         l'état d'un club APRÈS ses matchs du jour `jour` (huit sommes pondérées dans le temps, n,
 *                       nx, dernier championnat) : il vaut pour tout jour > `jour` ; `reglages` = empreinteDesForces
 *                       (version des forces, demi-vies, remise à zéro) ; `club` = numéro FotMob ;
 *   forces_buts_ligues  les sommes QUOTIDIENNES d'un championnat à la 90e minute (matchs qui comptent au
 *                       classement, ni attribués ; xG retirés d'un match prolongé) ;
 *   forces_buts_state   version, empreintes servies, empreinte des rencontres, jusqua, calcule_le, bilan, en_cours,
 *                       controle.
 * Tant que `en_cours` est posé (rangement interrompu), le lecteur du moteur les ignore.
 */
const FORCES_BUTS_DDL = [
  `CREATE TABLE IF NOT EXISTS forces_buts (
  reglages TEXT NOT NULL,
  club INTEGER NOT NULL,
  jour TEXT NOT NULL,
  ligue TEXT,
  n INTEGER NOT NULL,
  nx INTEGER NOT NULL,
  sa REAL NOT NULL,
  wa REAL NOT NULL,
  sd REAL NOT NULL,
  wd REAL NOT NULL,
  sga REAL NOT NULL,
  wga REAL NOT NULL,
  sgd REAL NOT NULL,
  wgd REAL NOT NULL,
  PRIMARY KEY (reglages, club, jour)
) WITHOUT ROWID;`,
  `CREATE TABLE IF NOT EXISTS forces_buts_ligues (
  league TEXT NOT NULL,
  jour TEXT NOT NULL,
  saison INTEGER NOT NULL,
  n INTEGER NOT NULL,
  bd INTEGER NOT NULL,
  be INTEGER NOT NULL,
  nx INTEGER NOT NULL,
  xd REAL NOT NULL,
  xe REAL NOT NULL,
  PRIMARY KEY (league, jour)
) WITHOUT ROWID;`,
  `CREATE TABLE IF NOT EXISTS forces_buts_state (
  cle TEXT PRIMARY KEY,
  valeur TEXT NOT NULL
) WITHOUT ROWID;`
];

/**
 * LES FICHES DES JOUEURS (étape 30 du plan, 22/10/2026 ; data/db/playerRatings.js) : ce qu'on sait de chaque joueur
 * et de l'équipe habituelle de chaque club « au lendemain du dernier jour de la table du jour J » — rien du jour
 * même ni d'après. Tables DÉRIVÉES de la table du jour J, refaites en ~1 min ; écrites par le serveur seul (étape
 * « fichesJoueurs » de l'actualisation ; scripts/player-ratings.mjs dans le bac), sous le verrou de la passe ;
 * calculées dans un processus à part en lecture seule. JAMAIS lues par le moteur (règle de Pierre) : la page du
 * match (lineupContext.js, force du onze) et l'écran de l'étape 31.
 *   player_ratings        une ligne par joueur (numéro FotMob, jamais 0) : jour (1er jour où la fiche vaut),
 *                         poste dominant (1 gardien … 4 attaquant), minutes, `etablie` (≥ 270 min), `formule`
 *                         ('xg' ou 'tirs', le repli sans xG), `facteur` du championnat (×1000) ; les composantes
 *                         par 90 min rétrécies et corrigées (×1000 ; la note FotMob par apparition) ; les poids de
 *                         leur histoire (matchs de 90 min ×100) ; les APPORTS offensif et défensif (buts par 90 au-
 *                         dessus de la moyenne du poste, ×1000) et leurs percentiles dans championnat × poste ; la
 *                         courbe (JSON, 20 derniers points) ; l'empreinte des réglages ;
 *   player_ratings_teams  une ligne par club : l'équipe habituelle (JSON [[joueur, part ×1000, part gardien ×1000,
 *                         ligne]]), les moyennes offensives de chaque ligne dans son championnat (titulaires
 *                         inconnus), ses apports habituels, son gardien habituel ;
 *   player_ratings_state  version, réglages, empreinte, jusqua, calcule_le, en_cours, bilan, contrôle, mesure à
 *                         blanc, banc.
 */
const PLAYER_RATINGS_DDL = [
  `CREATE TABLE IF NOT EXISTS player_ratings (
  joueur INTEGER PRIMARY KEY,
  jour TEXT NOT NULL,
  dernier_match TEXT,
  club INTEGER,
  league TEXT,
  poste INTEGER,
  part_poste INTEGER,
  apparitions INTEGER NOT NULL,
  minutes INTEGER NOT NULL,
  etablie INTEGER NOT NULL,
  formule TEXT NOT NULL,
  facteur INTEGER NOT NULL,
  xgnp INTEGER,
  xa INTEGER,
  xgot INTEGER,
  tirs INTEGER,
  pc INTEGER,
  recup INTEGER,
  duels INTEGER,
  xga INTEGER,
  note INTEGER,
  buts_evites INTEGER,
  w_xg INTEGER,
  w_tirs INTEGER,
  w_def INTEGER,
  w_xga INTEGER,
  w_note INTEGER,
  w_gardien INTEGER,
  apport_off INTEGER NOT NULL,
  apport_def INTEGER,
  pct_off INTEGER,
  pct_def INTEGER,
  courbe TEXT,
  reglages TEXT NOT NULL
) WITHOUT ROWID;`,
  `CREATE TABLE IF NOT EXISTS player_ratings_teams (
  club INTEGER PRIMARY KEY,
  jour TEXT NOT NULL,
  league TEXT,
  feuilles INTEGER NOT NULL,
  habituels TEXT NOT NULL,
  moy_off TEXT NOT NULL,
  hab_off INTEGER,
  hab_def INTEGER,
  gardien INTEGER,
  reglages TEXT NOT NULL
) WITHOUT ROWID;`,
  `CREATE TABLE IF NOT EXISTS player_ratings_state (
  cle TEXT PRIMARY KEY,
  valeur TEXT NOT NULL
) WITHOUT ROWID;`,
  // Les fiches d'un club (l'écran de l'étape 31) ; celles d'un championnat × poste (percentiles, écran).
  'CREATE INDEX IF NOT EXISTS idx_player_ratings_club ON player_ratings(club);',
  'CREATE INDEX IF NOT EXISTS idx_player_ratings_ligue ON player_ratings(league, poste);'
];

/**
 * LES STYLES DE JEU (étape 37 du plan, 22/10/2026 ; data/db/teamStyle.js) : le style de chaque club au 1er de chaque
 * mois et au lendemain de son dernier match, et celui de chaque entraîneur. Tables DÉRIVÉES de `matches` et
 * `team_stats` (FotMob), refaites en quelques secondes ; écrites par le serveur seul (étape « stylesDeJeu » de
 * l'actualisation ; scripts/team-style.mjs dans le bac), sous le verrou de la passe ; calculées dans un processus à
 * part en lecture seule. JAMAIS lues par le moteur : la page de l'équipe et la page du match (explication seulement).
 *   team_style_matches  le CACHE de la lecture incrémentale : les ingrédients de chaque camp de chaque rencontre
 *                       (possession, passes, longs ballons, centres, passes dans le dernier tiers ; tirs hors
 *                       penalties de la carte des tirs, par situation ; entraîneur, nom et identifiant) et la
 *                       signature de la rencontre (`sig`) : seules les rencontres dont la signature change sont
 *                       relues ;
 *   team_style          un club × un jour (le 1er du mois, ou l'actuel : `actuel` = 1) : son style, sa seconde
 *                       tendance, ses chiffres (taux bruts, z face à son championnat, scores), ceux de son championnat
 *                       (l_*), son entraîneur (clé) et le nombre de ses matchs dans la fenêtre ;
 *   coach_style         un entraîneur (clé : « id:… », « nom:… », ou « nom:…|club:… » pour un homonyme) à l'instantané
 *                       actuel : son style sur ses 20 derniers matchs de championnat, ses clubs (JSON) ;
 *   team_style_state    version, réglages, jusqua, jour_actuel, calcule_le, en_cours, bilan, contrôle.
 */
const TEAM_STYLE_DDL = [
  `CREATE TABLE IF NOT EXISTS team_style_matches (
  match_key TEXT NOT NULL,
  camp INTEGER NOT NULL,
  club INTEGER NOT NULL,
  adversaire INTEGER NOT NULL,
  date TEXT NOT NULL,
  league TEXT NOT NULL,
  coupe INTEGER NOT NULL,
  sig TEXT NOT NULL,
  coach TEXT,
  coach_id INTEGER,
  poss REAL,
  passes INTEGER,
  longs INTEGER,
  centres INTEGER,
  tiers INTEGER,
  carte INTEGER NOT NULL,
  tirs INTEGER,
  contre INTEGER,
  corner INTEGER,
  coup_franc INTEGER,
  touche INTEGER,
  autres INTEGER,
  PRIMARY KEY (match_key, camp)
) WITHOUT ROWID;`,
  `CREATE TABLE IF NOT EXISTS team_style (
  club INTEGER NOT NULL,
  jour TEXT NOT NULL,
  actuel INTEGER NOT NULL,
  league TEXT NOT NULL,
  n INTEGER NOT NULL,
  n_carte INTEGER NOT NULL,
  n_saison INTEGER,
  dernier_match TEXT,
  style TEXT NOT NULL,
  second TEXT,
  provisoire INTEGER NOT NULL,
  entraineur TEXT,
  sous_lui INTEGER,
  poss REAL,
  longs REAL,
  longs_match REAL,
  centres REAL,
  tiers REAL,
  contre REAL,
  cpa REAL,
  corner REAL,
  coup_franc REAL,
  tirs INTEGER,
  z_poss REAL,
  z_longs REAL,
  z_centres REAL,
  z_tiers REAL,
  z_contre REAL,
  z_cpa REAL,
  s_possession REAL,
  s_direct REAL,
  s_contre REAL,
  s_cpa REAL,
  l_poss REAL,
  l_longs REAL,
  l_centres REAL,
  l_tiers REAL,
  l_contre REAL,
  l_cpa REAL,
  l_corner REAL,
  l_coup_franc REAL,
  l_equipes INTEGER,
  reglages TEXT NOT NULL,
  PRIMARY KEY (club, jour)
) WITHOUT ROWID;`,
  `CREATE TABLE IF NOT EXISTS coach_style (
  entraineur TEXT NOT NULL,
  jour TEXT NOT NULL,
  nom TEXT,
  coach_id INTEGER,
  homonyme INTEGER NOT NULL,
  club INTEGER,
  clubs TEXT,
  n INTEGER NOT NULL,
  n_carte INTEGER NOT NULL,
  style TEXT NOT NULL,
  second TEXT,
  provisoire INTEGER NOT NULL,
  poss REAL,
  longs REAL,
  centres REAL,
  tiers REAL,
  contre REAL,
  cpa REAL,
  z_poss REAL,
  z_longs REAL,
  z_centres REAL,
  z_tiers REAL,
  z_contre REAL,
  z_cpa REAL,
  s_possession REAL,
  s_direct REAL,
  s_contre REAL,
  s_cpa REAL,
  reglages TEXT NOT NULL,
  PRIMARY KEY (entraineur, jour)
) WITHOUT ROWID;`,
  `CREATE TABLE IF NOT EXISTS team_style_state (
  cle TEXT PRIMARY KEY,
  valeur TEXT NOT NULL
) WITHOUT ROWID;`,
  // Le style actuel d'un club (la page de l'équipe, la page du match) ; le cache d'un club (depuis quand l'entraîneur).
  'CREATE INDEX IF NOT EXISTS idx_team_style_actuel ON team_style(club) WHERE actuel = 1;',
  'CREATE INDEX IF NOT EXISTS idx_team_style_matches_club ON team_style_matches(club, date);'
];

const FD_HISTORY_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_fd_history_code_date ON fd_history(code, date);',
  'CREATE INDEX IF NOT EXISTS idx_fd_history_dom ON fd_history(dom);',
  'CREATE INDEX IF NOT EXISTS idx_fd_history_ext ON fd_history(ext);',
  'CREATE INDEX IF NOT EXISTS idx_fd_history_match ON fd_history(match_key) WHERE match_key IS NOT NULL;',
  'CREATE INDEX IF NOT EXISTS idx_fd_teams_team ON fd_teams(team_id) WHERE team_id IS NOT NULL;'
];

const ENREGISTREURS_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_live_snapshots_date ON live_snapshots(date);',
  'CREATE INDEX IF NOT EXISTS idx_unavailable_daily_match ON unavailable_daily(fotmob_id);',
  'CREATE INDEX IF NOT EXISTS idx_unavailable_daily_player ON unavailable_daily(player_id) WHERE player_id IS NOT NULL;',
  'CREATE INDEX IF NOT EXISTS idx_engine_picks_date ON engine_picks(date);',
  'CREATE INDEX IF NOT EXISTS idx_engine_picks_match ON engine_picks(match_id) WHERE match_id IS NOT NULL;'
];

const ODDS_QUOTES_INDEXES = [
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_oe_source_event ON odds_events(source, source_event);',
  'CREATE INDEX IF NOT EXISTS idx_oe_match ON odds_events(match_key) WHERE match_key IS NOT NULL;',
  'CREATE INDEX IF NOT EXISTS idx_oe_fixture ON odds_events(home_id, away_id, date);',
  'CREATE INDEX IF NOT EXISTS idx_oe_league_date ON odds_events(league, date);',
  'CREATE INDEX IF NOT EXISTS idx_oe_date ON odds_events(date);',
  'CREATE INDEX IF NOT EXISTS idx_ofm_fixture ON odds_fixture_misses(home_key, away_key, date);'
];

const DDL = [
  MATCHES_DDL,
  teamDdl(),
  playerDdl(),
  UPCOMING_LINEUPS_DDL,
  ...BIRTHDATES_DDL,
  ...REGISTRY_DDL,
  ...ODDS_QUOTES_DDL,
  ...ODDS_QUOTES_INDEXES,
  ...ENREGISTREURS_DDL,
  ...ENREGISTREURS_INDEXES,
  ...FD_HISTORY_DDL,
  ...FD_HISTORY_INDEXES,
  LEAGUE_BENCHMARKS_DDL,
  ...DAY_TABLE_DDL,
  ...BENCH_DDL,
  ...STAT_VALUE_DDL,
  ...CALIBRATION_DDL,
  ...BETTING_MAP_DDL,
  ...MARKET_KNOWLEDGE_DDL,
  ...TEAM_STRENGTH_DDL,
  ...FORCES_BUTS_DDL,
  ...PLAYER_RATINGS_DDL,
  ...TEAM_STYLE_DDL,
  'CREATE INDEX IF NOT EXISTS idx_matches_date ON matches(date);',
  'CREATE INDEX IF NOT EXISTS idx_matches_league_date ON matches(league, date);',
  'CREATE INDEX IF NOT EXISTS idx_matches_home ON matches(home_name);',
  'CREATE INDEX IF NOT EXISTS idx_matches_away ON matches(away_name);',
  // Index ÉTROIT pour compter les joueurs par rencontre : la table est
  // WITHOUT ROWID, donc la parcourir lit ses 72 colonnes. Compter depuis
  // cet index a ramené le calcul de couverture de 6 s à moins d'une.
  'CREATE INDEX IF NOT EXISTS idx_players_match_side ON players(match_key, side);',
  'CREATE INDEX IF NOT EXISTS idx_players_name ON players(name);',
  'CREATE INDEX IF NOT EXISTS idx_players_id ON players(player_id) WHERE player_id IS NOT NULL;',
  // Index COUVRANT pour le poste d'un joueur (cf. playerSeasonStats) : le
  // poste n'étant tagué que sur la moitié des lignes, on le déduit de tout
  // l'historique du joueur, ce qui balayait les 810 000 lignes à chaque
  // classement — 12 s par écran. Avec cet index, SQLite lit l'index seul.
  'CREATE INDEX IF NOT EXISTS idx_players_name_position ON players(name, position) WHERE position IS NOT NULL;',
  'CREATE INDEX IF NOT EXISTS idx_matches_home_id ON matches(home_id) WHERE home_id IS NOT NULL;',
  'CREATE INDEX IF NOT EXISTS idx_matches_away_id ON matches(away_id) WHERE away_id IS NOT NULL;',
  // L'identifiant FotMob est la PREMIÈRE clé consultée par resolveMatchKey,
  // pour chaque rencontre de chaque lot. Sans cet index, chaque consultation
  // balayait la table entière — 55 000 lignes dont les colonnes JSON
  // (déroulé, composition, carte des tirs) font 1,3 Go — et l'import
  // plafonnait à une rencontre toutes les trois secondes au lieu de dix par
  // seconde. Mesuré le 2026-09-22 ; c'était aussi ce qui faisait durer
  // quatre minutes vingt recherches de doublons.
  'CREATE INDEX IF NOT EXISTS idx_matches_fotmob_id ON matches(fotmob_id) WHERE fotmob_id IS NOT NULL;',
  'CREATE INDEX IF NOT EXISTS idx_upcoming_lineups_date ON upcoming_lineups(date);',
  'CREATE INDEX IF NOT EXISTS idx_upcoming_lineups_home ON upcoming_lineups(home_id, date);'
];

/**
 * Noms des index que ce code crée à chaque ouverture en écriture. La
 * restauration d'essai (scripts/restore-test-db.mjs) vérifie qu'une copie les
 * a tous : un index absent ne fausse rien, mais rend une requête lente.
 */
export function indexAttendus() {
  return [...new Set(DDL.flatMap((sql) => [...String(sql).matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\s+(\w+)/gi)].map((m) => m[1])))].sort();
}

/**
 * Colonnes ajoutées après coup. `CREATE TABLE IF NOT EXISTS` ne voit rien
 * d'une table déjà créée : sans ceci, une base existante garderait à jamais
 * l'ancienne forme, et le DDL ci-dessus ne vaudrait que pour une base neuve.
 *
 * Élargir seulement, jamais rétrécir : une colonne ajoutée ne casse aucun
 * lecteur en place, et une base plus récente que le code reste lisible.
 */
const ADDED_COLUMNS = [
  ['matches', 'home_id', 'TEXT'],
  ['matches', 'away_id', 'TEXT'],
  ['matches', 'fotmob_id', 'TEXT'],
  // Dribbles tentés (01/10/2026), à côté des réussis (dribbles_won).
  ['players', 'dribbles_attempted', 'INTEGER'],
  // Nationalité des joueurs (01/10/2026), à côté de leur date de naissance.
  ['player_birthdates', 'country_code', 'TEXT'],
  ['player_birthdates', 'country_name', 'TEXT'],
  ['team_squad_reads', 'version', 'INTEGER'],
  // Étape 25 du plan (07/10/2026) : la version du moteur et la distribution
  // complète de chaque pronostic gelé ; NULL pour les lignes d'avant.
  ['engine_picks', 'engine_version', 'INTEGER'],
  ['engine_picks', 'distribution', 'TEXT']
];

function migrateSchema(db) {
  for (const [table, column, type] of ADDED_COLUMNS) {
    const existe = db.prepare(`SELECT COUNT(*) n FROM pragma_table_info(?) WHERE name = ?`).get(table, column).n;
    if (existe) continue;
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type};`);
    } catch (error) {
      // Un autre processus (serveur, import) l'a ajoutée entre-temps.
      if (!/duplicate column name/i.test(error.message)) throw error;
    }
  }
  dropPositiveChecks(db);
  migrateOddsQuotes(db);
}

/**
 * La table des cotes a changé de forme pendant sa construction (04/10/2026) :
 * une première version, à plat (une ligne par cote avec la rencontre
 * répétée), a été créée dans la base de Pierre par un serveur lancé entre
 * deux étapes. `CREATE TABLE IF NOT EXISTS` la laissait en place et chaque
 * écriture de la nouvelle forme échouait (« no column named event_id ») :
 * plus aucune cote gratuite. Vide, elle est recréée ; non vide (jamais vu),
 * elle est mise de côté sous un autre nom, jamais supprimée.
 */
function migrateOddsQuotes(db) {
  const colonnes = db.prepare('SELECT name FROM pragma_table_info(?)').all('odds_quotes').map((r) => r.name);
  if (!colonnes.length || colonnes.includes('event_id')) return;
  const ddl = ODDS_QUOTES_DDL.find((sql) => sql.startsWith('CREATE TABLE IF NOT EXISTS odds_quotes'));
  const lignes = db.prepare('SELECT COUNT(*) n FROM odds_quotes').get().n;
  db.exec('BEGIN IMMEDIATE');
  try {
    if (lignes === 0) db.exec('DROP TABLE odds_quotes;');
    else db.exec(`ALTER TABLE odds_quotes RENAME TO odds_quotes_ancienne_forme_${new Date().toISOString().slice(0, 10).replace(/-/g, '')};`);
    db.exec(ddl);
    db.exec('COMMIT');
    console.error(`[base] table odds_quotes remise à la forme actuelle (${lignes === 0 ? 'ancienne table vide supprimée' : `${lignes} ligne(s) de l'ancienne forme mises de côté`}).`);
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* déjà annulée */ }
    throw error;
  }
}

/**
 * Retire les contraintes « > 0 » des bases créées avant qu'on sache qu'elles
 * étaient fausses (voir POSITIVE_TEAM_KEYS). SQLite ne sait pas supprimer un
 * CHECK : il faut reconstruire la table. Sans cela, corriger le DDL ne change
 * rien aux bases existantes — et c'est précisément là que 334 rencontres
 * lettones continuaient d'être refusées.
 */
function dropPositiveChecks(db) {
  const ligne = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'team_stats'").get();
  if (!ligne?.sql || !/IS NULL OR "[a-z_]+" > 0/.test(ligne.sql)) return;

  const colonnes = db.prepare('SELECT name FROM pragma_table_info(?)').all('team_stats').map((r) => `"${r.name}"`).join(', ');
  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(teamDdl().replace('CREATE TABLE IF NOT EXISTS team_stats', 'CREATE TABLE team_stats_migr'));
    db.exec(`INSERT INTO team_stats_migr (${colonnes}) SELECT ${colonnes} FROM team_stats;`);
    db.exec('DROP TABLE team_stats;');
    db.exec('ALTER TABLE team_stats_migr RENAME TO team_stats;');
    db.exec('COMMIT');
    console.error('[base] contraintes « > 0 » retirées de team_stats : un zéro authentique ne fait plus rejeter son lot.');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* déjà annulée */ }
    throw error;
  } finally {
    db.exec('PRAGMA foreign_keys = ON;');
  }
}

/**
 * Une connexion par fichier. Un simple `let db` renvoyait la connexion déjà
 * ouverte SANS regarder le fichier demandé : `openDb({file: B})` après un
 * `openDb({file: A})` rendait A, B n'était jamais créé, et tout ce qu'on
 * croyait écrire dans B atterrissait dans A. L'option `--db` du script de
 * migration était donc un piège silencieux.
 */
const connexions = new Map();

export function openDb({ file = resolveDbPath(), readonly = false } = {}) {
  const chemin = path.resolve(file);
  const ouverte = connexions.get(chemin);
  if (ouverte) return ouverte;
  // Bac à sable : un fichier passé explicitement (option --db d'un script)
  // passe le même contrôle que resolveDbPath, avant tout accès au disque.
  if (modeBacASable()) assertFichierDuBac(chemin);
  fs.mkdirSync(path.dirname(chemin), { recursive: true });
  // Avant toute ouverture : ouvrir puis fermer une base masquée suffit à la
  // vider pour de bon.
  assertNotMasked(chemin);
  const db = new DatabaseSync(chemin, { readOnly: readonly });
  // WAL : un lecteur n'attend plus un écrivain. busy_timeout : deux imports
  // simultanés patientent au lieu d'échouer.
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 15000;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA synchronous = NORMAL;');
  // Un lecteur qui tient une transaction empêche la troncature du journal,
  // et /api/match-stats/coverage est réinterrogé toutes les 5 secondes : sans
  // plafond, le -wal grossit sans jamais redescendre. La limite le fait
  // retailler à chaque occasion où la troncature devient possible.
  db.exec('PRAGMA journal_size_limit = 67108864;');
  // AVANT le DDL, impérativement : sur une base masquée, `CREATE TABLE IF
  // NOT EXISTS` ne voit aucune table, recrée le schéma vide, et la fermeture
  // du processus reporte ce schéma dans le fichier. Le garde-fou arriverait
  // alors après la destruction qu'il est censé empêcher.
  // Tables, PUIS colonnes ajoutées après coup, PUIS index. L'ordre compte :
  // `idx_matches_home_id` porte sur une colonne que migrateSchema vient
  // d'ajouter, et le créer avant l'aurait fait échouer sur une base existante.
  if (!readonly) {
    for (const sql of DDL) if (sql.startsWith('CREATE TABLE')) db.exec(sql);
    migrateSchema(db);
    for (const sql of DDL) if (!sql.startsWith('CREATE TABLE')) db.exec(sql);
  }
  connexions.set(chemin, db);
  return db;
}

/**
 * Refuse d'ouvrir une base que son journal masque.
 *
 * Un `-wal` périmé peut se retrouver à côté d'un fichier plein et décrire
 * une base BEAUCOUP plus petite. Tout lecteur voit alors une base vide
 * pendant que les données dorment intactes dans le fichier. C'est arrivé :
 * l'API a servi `count: 0` sans un mot pendant que 366 Mo de statistiques
 * attendaient à côté.
 *
 * Le contrôle se fait sur les OCTETS, sans jamais ouvrir la base — parce
 * qu'ouvrir en écriture puis fermer suffit à reporter le journal dans le
 * fichier, c'est-à-dire à consommer pour de bon la destruction qu'on veut
 * empêcher. Mesuré : une base de 15 737 rencontres tombe à 0 par la seule
 * ouverture-fermeture.
 *
 * L'en-tête d'une base SQLite annonce son nombre de pages (octets 28-31) ;
 * la dernière trame de validation d'un journal annonce la taille de base
 * après ce commit. Quand les deux divergent d'un ordre de grandeur, le
 * journal ne décrit pas cette base-là.
 */
function assertNotMasked(chemin) {
  let entete;
  try {
    const fd = fs.openSync(chemin, 'r');
    entete = Buffer.alloc(100);
    const lus = fs.readSync(fd, entete, 0, 100, 0);
    fs.closeSync(fd);
    if (lus < 100) return; // base neuve : rien à masquer
  } catch { return; } // fichier absent : openDb va le créer
  if (entete.toString('latin1', 0, 15) !== 'SQLite format 3') return;
  const taillePage = entete.readUInt16BE(16) || 65536;
  const pagesBase = entete.readUInt32BE(28);
  if (pagesBase < 256) return; // base petite : rien qui vaille d'être masqué

  const journal = `${chemin}-wal`;
  let wal;
  try { wal = fs.readFileSync(journal); } catch { return; }
  if (wal.length < 32 || (wal.readUInt32BE(0) !== 0x377f0682 && wal.readUInt32BE(0) !== 0x377f0683)) return;
  const taillePageWal = wal.readUInt32BE(8) || taillePage;
  // Les deux sels de l'en-tête signent les trames VALIDES du journal. Après
  // un point de reprise, SQLite réécrit l'en-tête avec de nouveaux sels et
  // repart du début du fichier, sans le tronquer : au-delà de la dernière
  // trame valide restent des trames PÉRIMÉES d'une vie antérieure du
  // journal, aux anciens sels. Les lire comme si elles comptaient donnait un
  // faux positif — « le journal ne décrit que 29 pages » sur une base de
  // 1,7 Go — qui a refusé d'ouvrir une base parfaitement saine pendant que
  // le serveur, connecté avant, la servait sans peine.
  const sel1 = wal.readUInt32BE(16);
  const sel2 = wal.readUInt32BE(20);

  // Dernière trame de validation VALIDE : celle qui fixe la taille vue par un
  // lecteur. Une trame aux sels étrangers clôt la lecture.
  let pagesJournal = null;
  for (let pos = 32; pos + 24 + taillePageWal <= wal.length; pos += 24 + taillePageWal) {
    if (wal.readUInt32BE(pos + 8) !== sel1 || wal.readUInt32BE(pos + 12) !== sel2) break;
    const apres = wal.readUInt32BE(pos + 4);
    if (apres > 0) pagesJournal = apres;
  }
  if (pagesJournal === null || pagesJournal * 8 >= pagesBase) return;

  throw new Error(
    `Base masquée par son journal : ${chemin} contient ${pagesBase} pages ` +
    `(${((pagesBase * taillePage) / 1048576).toFixed(0)} Mo), mais ${journal} n'en décrit que ${pagesJournal}. ` +
    "Les données sont intactes dans le fichier. Arrêtez ce qui utilise la base, DÉPLACEZ " +
    `${journal} et ${chemin}-shm ailleurs (ne les laissez pas en place), puis rouvrez : le contenu réapparaît. ` +
    "N'ouvrez surtout pas la base en écriture avant de les avoir écartés."
  );
}

export function closeDb(file = null) {
  const cibles = file ? [path.resolve(file)] : [...connexions.keys()];
  for (const chemin of cibles) {
    const db = connexions.get(chemin);
    if (!db) continue;
    statements.delete(db);
    db.close();
    connexions.delete(chemin);
  }
}

/** `55%` -> 55. Le pourcentage est un nombre ; le signe relève de l'affichage. */
function unpercent(value) {
  if (value === null || value === undefined) return null;
  const n = Number(String(value).replace('%', '').trim());
  return Number.isFinite(n) ? n : null;
}

const toBit = (value) => (typeof value === 'boolean' ? (value ? 1 : 0) : null);

/** Identité d'un joueur dans une feuille : l'identifiant de la source, sinon le nom. */
/**
 * Les mots du nom, sans diacritiques ni ordre : « Zhang Hui » (ESPN) et
 * « Hui Zhang » (FotMob), « Alvaro Valles » et « Álvaro Vallés » — le même
 * homme, que le slug seul ne rapprochait pas.
 */
function jetonsDuNom(name) {
  return String(name ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean).sort().join(' ');
}

export function playerKeyOf(player) {
  return player.playerId != null ? String(player.playerId) : `name:${slug(player.name)}`;
}

/**
 * Reproduit mergePlayers() : l'identifiant de la source d'abord, puis le
 * numéro de maillot corroboré par un mot du nom, puis le nom seul. Le numéro
 * seul ne suffit pas — en League 1 et League 2 la source attribue parfois le
 * même numéro à deux joueurs d'une même feuille.
 */
function resolvePlayerKey(player, existing) {
  if (player.playerId != null) {
    const id = String(player.playerId);
    // La ligne qui porte cet identifiant pour CLÉ d'abord : c'est son
    // identité d'origine. Puis une ligne identifiée ensuite sous cet
    // identifiant à partir d'une clé sans identité (ligne ESPN « name: »).
    // Jamais une ligne dont la clé est un AUTRE identifiant FotMob : deux
    // homonymes d'une même équipe s'écrivaient l'un sur l'autre.
    const byKey = existing.find((e) => String(e.player_key) === id);
    if (byKey) return byKey.player_key;
    const byId = existing.find((e) => e.player_id != null && String(e.player_id) === id && !/^fotmob-/.test(String(e.player_key)));
    if (byId) return byId.player_key;
  }
  // Les rapprochements par numéro ou par nom ne valent que pour une ligne
  // qui n'a pas encore d'identité, ou qui porte déjà celle-ci.
  const memeIdentite = (e) => e.player_id == null || player.playerId == null || String(e.player_id) === String(player.playerId);
  if (player.number != null) {
    const byNumber = existing.find((e) => memeIdentite(e) && e.shirt_number === player.number && sharesNameToken(e.name, player.name));
    if (byNumber) return byNumber.player_key;
  }
  const jetons = jetonsDuNom(player.name);
  const byTokens = existing.find((e) => memeIdentite(e) && jetonsDuNom(e.name) === jetons);
  if (byTokens) return byTokens.player_key;
  const wanted = slug(player.name);
  const byName = existing.find((e) => memeIdentite(e) && slug(e.name) === wanted);
  if (byName) return byName.player_key;
  return playerKeyOf(player);
}

/**
 * `insertOnly` désigne les colonnes posées à la création et jamais rejouées :
 * le rang sur la feuille en fait partie, un joueur déjà connu gardant sa
 * place même si une seconde source le republie ailleurs dans sa liste.
 */
function buildUpsert(table, columns, keyColumns, insertOnly = []) {
  const all = [...keyColumns, ...insertOnly, ...columns.map((c) => c.column)];
  const set = columns.map((c) => {
    // Le nom déjà stocké fait foi : c'est celui auquel le reste des données
    // fait référence, et l'orthographe varie d'une source à l'autre
    // (Wu Xi / Xi Wu, Pepe Carmona / José Ángel Carmona). Partout ailleurs,
    // un chiffre n'est remplacé que par un chiffre, jamais par une absence.
    if (c.column === 'name') return `${quote(c.column)} = COALESCE(${quote(c.column)}, excluded.${quote(c.column)})`;
    // EXCEPTION aux buts encaissés : ils ne valent que pour un gardien (CHECK
    // de la table). Quand la source dit d'un homme qu'il est milieu là où
    // une lecture antérieure l'avait pris pour un gardien — ESPN tenait onze
    // joueurs de Derby pour des gardiens à deux buts encaissés — garder
    // l'ancien chiffre violait la contrainte, et le lot ENTIER était refusé :
    // 384 feuilles sont restées à la révision précédente pour cette raison.
    if (c.column === 'goals_conceded') {
      return `"goals_conceded" = CASE WHEN excluded."position" IS NOT NULL AND excluded."position" <> 'Goalkeeper' THEN NULL ELSE COALESCE(excluded."goals_conceded", "goals_conceded") END`;
    }
    return `${quote(c.column)} = COALESCE(excluded.${quote(c.column)}, ${quote(c.column)})`;
  });
  return [
    `INSERT INTO ${table} (${all.map(quote).join(', ')})`,
    `VALUES (${all.map(() => '?').join(', ')})`,
    `ON CONFLICT (${keyColumns.map(quote).join(', ')}) DO UPDATE SET`,
    set.join(',\n')
  ].join('\n');
}

const MATCH_UPSERT = [
  'INSERT INTO matches (match_key, match_id, date, league, home_name, away_name, home_id, away_id, fotmob_id, home_goals, away_goals, updated_at, events, lineups, meta, shotmap, sources)',
  'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  'ON CONFLICT (match_key) DO UPDATE SET',
  '  home_id   = COALESCE(excluded.home_id, home_id),',
  '  away_id   = COALESCE(excluded.away_id, away_id),',
  '  fotmob_id = COALESCE(excluded.fotmob_id, fotmob_id),',
  '  home_goals = COALESCE(excluded.home_goals, home_goals),',
  '  away_goals = COALESCE(excluded.away_goals, away_goals),',
  '  updated_at = excluded.updated_at,',
  '  events   = COALESCE(excluded.events, events),',
  '  lineups  = COALESCE(excluded.lineups, lineups),',
  '  meta     = COALESCE(excluded.meta, meta),',
  '  shotmap  = COALESCE(excluded.shotmap, shotmap),',
  '  sources  = excluded.sources'
].join('\n');

// Les requêtes préparées appartiennent à UNE connexion : les garder dans une
// variable unique les aurait rejouées contre la mauvaise base dès qu'une
// seconde s'ouvre (migration avec --db, tests en bac à sable).
const statements = new Map();
function prepared(database) {
  const connu = statements.get(database);
  if (connu) return connu;
  const jeu = {
    match: database.prepare(MATCH_UPSERT),
    team: database.prepare(buildUpsert('team_stats', TEAM_COLUMNS, ['match_key', 'side'])),
    player: database.prepare(buildUpsert('players', PLAYER_COLUMNS, ['match_key', 'side', 'player_key'], ['ord'])),
    existingPlayers: database.prepare('SELECT player_key, player_id, name, shirt_number, ord FROM players WHERE match_key = ? AND side = ?'),
    existingSources: database.prepare('SELECT sources FROM matches WHERE match_key = ?'),
    // Une rencontre déjà connue, retrouvée par l'IDENTITÉ de ses deux clubs
    // plutôt que par l'orthographe de leur nom. Voir resolveMatchKey.
    byIdentity: database.prepare('SELECT match_key FROM matches WHERE date = ? AND home_id = ? AND away_id = ? LIMIT 1'),
    byFotmobId: database.prepare('SELECT match_key, date FROM matches WHERE fotmob_id = ? LIMIT 1'),
    deleteMatch: database.prepare('DELETE FROM matches WHERE match_key = ?'),
    // Les lignes joueur d'un camp que la feuille relue ne porte plus (cf.
    // `replacePlayers`, fotMobRefresh.js).
    prunePlayers: database.prepare('DELETE FROM players WHERE match_key = ? AND side = ? AND player_key NOT IN (SELECT value FROM json_each(?))'),
    // Un poste que la feuille relue ne confirme plus. COALESCE ne remplace
    // jamais une valeur par une absence — juste pour une statistique, faux
    // pour un poste que la lecture précédente avait inventé : seize
    // « gardiens » de Copa Chile 2023 restaient gardiens, avec leurs buts
    // encaissés, alors que la relecture ne leur trouvait plus de poste.
    clearPosition: database.prepare('UPDATE players SET position = NULL, goals_conceded = NULL WHERE match_key = ? AND side = ? AND player_key = ? AND position IS NOT NULL'),
    standings: database.prepare(
      `INSERT INTO standings_official (league, season, table_name, ord, fotmob_league_id, fotmob_season, fetched_at, rows)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (league, season, table_name) DO UPDATE SET
         ord = excluded.ord, fotmob_league_id = excluded.fotmob_league_id, fotmob_season = excluded.fotmob_season,
         fetched_at = excluded.fetched_at, rows = excluded.rows`
    )
  };
  statements.set(database, jeu);
  return jeu;
}

/**
 * Insère ou complète un lot de rencontres. Même contrat que mergeMatchStats :
 * un chiffre déjà confirmé n'est jamais remplacé par une absence, et une
 * rencontre déjà connue est complétée, jamais dupliquée.
 */
/**
 * Clé d'une rencontre : l'identité de ses deux clubs d'abord, leur nom
 * seulement à défaut.
 *
 * LA CAUSE DES DOUBLONS ÉTAIT ICI. La clé se fabriquait à partir du NOM des
 * équipes, si bien qu'une source écrivant « Alavés » là où une autre écrit
 * « Deportivo Alavés » créait une SECONDE rencontre, même date, même score,
 * même adversaire. Toute la saison 2026-27 d'Alavés existait ainsi en
 * double : quatorze matchs joués au classement au lieu de sept.
 *
 * Ce n'était pas un incident : le nom change d'un import à l'autre, donc les
 * doublons revenaient à chaque passe. Les 311 déjà fusionnés n'étaient que
 * la récolte du moment.
 *
 * L'identifiant de la rencontre chez la source tranche en premier ; à
 * défaut, le triplet date + club à domicile + club à l'extérieur, qui
 * désigne une rencontre sans ambiguïté. Le repli sur les noms ne sert plus
 * qu'aux entrées sans identité — celles qu'aucune source moderne ne produit.
 */
function resolveMatchKey(st, entry, date, homeName, awayName, report) {
  if (entry.fotmobId) {
    const parId = st.byFotmobId.get(String(entry.fotmobId));
    // Même rencontre, autre DATE : un match reporté ou interrompu puis
    // rejoué. La clé porte la date, donc la ligne existante est fausse dans
    // sa clé même, et la garder en créant la nouvelle à côté comptait la
    // rencontre deux fois — parfois avec deux scores, Fiorentina - Inter
    // valant 0-0 en décembre et 3-0 en février. La ligne périmée s'efface
    // (ses joueurs et relevés suivent, par cascade) et la rencontre
    // reprend sa place à sa vraie date.
    if (parId && parId.date === date) return parId.match_key;
    if (parId) {
      st.deleteMatch.run(parId.match_key);
      if (report) report.rekeyed++;
    }
  }
  if (entry.homeId && entry.awayId) {
    const parClubs = st.byIdentity.get(date, entry.homeId, entry.awayId);
    if (parClubs) return parClubs.match_key;
  }
  return `${date}-${slug(homeName)}-${slug(awayName)}`;
}

/**
 * Enregistre des classements officiels (cf. fotMobStandingsRefresh.js).
 * Chaque entrée : { league, season, tableName, ord, fotmobLeagueId,
 * fotmobSeason, rows }. Une table déjà connue est remplacée entière : un
 * classement n'a pas de « cases vides » à préserver, il est vrai ou périmé.
 */
export function upsertOfficialStandings(entries, { database = openDb() } = {}) {
  const st = prepared(database);
  const now = new Date().toISOString();
  let count = 0;
  database.exec('BEGIN IMMEDIATE');
  try {
    for (const e of entries) {
      if (!e?.league || !Number.isInteger(Number(e.season)) || !Array.isArray(e.rows)) continue;
      st.standings.run(e.league, Number(e.season), String(e.tableName ?? ''), Number(e.ord ?? 0),
        e.fotmobLeagueId ?? null, e.fotmobSeason ?? null, now, JSON.stringify(e.rows));
      count++;
    }
    database.exec('COMMIT');
  } catch (error) {
    try { database.exec('ROLLBACK'); } catch { /* déjà annulée */ }
    throw error;
  }
  return { tables: count };
}

/**
 * Marque des rencontres comme SANS FEUILLE chez la source, à la révision de
 * lecture courante. Sans cette marque, une rencontre que FotMob publie sans
 * relevé — 5 462 au 2026-09-22, Israël et Serbie 2023-25, tours préliminaires
 * de coupes — restait « à compléter » pour toujours, et chaque passe
 * automatique dépensait son budget de 300 feuilles à les redemander. Le
 * reste de `meta` est conservé (json_set), et la marque tombe d'elle-même
 * à la prochaine révision de la table de correspondance.
 */
/**
 * Retire des rencontres du magasin (les lignes joueur et les statistiques
 * d'équipe suivent, par la clé étrangère en cascade) : ce que FotMob a
 * ANNULÉ après coup — résultats effacés par une fédération — n'est plus un
 * résultat.
 */
export function deleteMatches(matchKeys, { database = openDb() } = {}) {
  const st = prepared(database);
  let retirees = 0;
  database.exec('BEGIN IMMEDIATE');
  try {
    for (const key of matchKeys) retirees += st.deleteMatch.run(key).changes;
    database.exec('COMMIT');
  } catch (error) {
    try { database.exec('ROLLBACK'); } catch { /* déjà annulée */ }
    throw error;
  }
  return retirees;
}

export function markNoSheet(matchKeys, rev, { database = openDb() } = {}) {
  if (!matchKeys.length) return 0;
  const st = database.prepare("UPDATE matches SET meta = json_set(COALESCE(meta, '{}'), '$.rev', ?, '$.noSheet', 1) WHERE match_key = ?");
  let n = 0;
  database.exec('BEGIN IMMEDIATE');
  try {
    for (const key of matchKeys) n += st.run(rev, key).changes;
    database.exec('COMMIT');
  } catch (error) {
    try { database.exec('ROLLBACK'); } catch { /* déjà annulée */ }
    throw error;
  }
  return n;
}

/**
 * Rencontres récentes marquées « sans feuille » qu'on peut redemander à la
 * source par leur identifiant : une feuille publiée par FotMob quelques
 * heures APRÈS notre relevé n'était jamais relue (39 rencontres de septembre
 * 2026 dans ce cas). L'identifiant 0, partagé par plusieurs rencontres chez
 * FotMob, n'identifie rien : exclu.
 *
 * @returns {{ fotmobId: string, league: string }[]}
 */
export function recentNoSheet({ since, database = openDb() }) {
  return database
    .prepare(`SELECT fotmob_id AS fotmobId, league FROM matches
              WHERE date >= ? AND json_extract(meta, '$.noSheet') = 1
                AND fotmob_id IS NOT NULL AND fotmob_id <> '' AND fotmob_id <> '0'`)
    .all(since)
    .map((r) => ({ fotmobId: String(r.fotmobId), league: r.league }));
}

/**
 * Rencontres terminées récemment (score connu), pour l'analyse IA après-match
 * automatique (cf. autoMatchAiTrigger.js) — équipes, championnat, jour et
 * score : de quoi retrouver l'analyse avant-match par équipes (jamais par
 * matchId, cf. matchAiAnalysisRepository.findPreMatchAnalysisByTeams) et
 * construire la revue sans passer par match-results.json.
 */
export function recentlyFinished({ since, database = openDb() }) {
  return database
    .prepare(
      `SELECT date, league, home_name AS homeName, away_name AS awayName, home_goals AS homeGoals, away_goals AS awayGoals
       FROM matches
       WHERE date >= ? AND home_goals IS NOT NULL AND away_goals IS NOT NULL
       ORDER BY date ASC`
    )
    .all(since);
}

/**
 * Enregistre la composition d'un match à venir (cf. lineupPrefetch.js).
 * Une ligne par match, remplacée entière à chaque passage — jamais fusionnée
 * avec l'ancienne : une composition qui change avant le coup d'envoi doit
 * effacer la précédente, pas s'y mélanger.
 */
export function upsertUpcomingLineup(entry, { database = openDb() } = {}) {
  database
    .prepare(`INSERT INTO upcoming_lineups (fotmob_id, date, kickoff, league, home_id, away_id, home_name, away_name, payload, fetched_at)
              VALUES (@fotmobId, @date, @kickoff, @league, @homeId, @awayId, @homeName, @awayName, @payload, @fetchedAt)
              ON CONFLICT(fotmob_id) DO UPDATE SET
                date = excluded.date, kickoff = excluded.kickoff, league = excluded.league,
                home_id = excluded.home_id, away_id = excluded.away_id,
                home_name = excluded.home_name, away_name = excluded.away_name,
                payload = excluded.payload, fetched_at = excluded.fetched_at`)
    .run({
      fotmobId: String(entry.fotmobId),
      date: entry.date,
      kickoff: entry.kickoff ?? null,
      league: entry.league ?? null,
      homeId: entry.homeId ?? null,
      awayId: entry.awayId ?? null,
      homeName: entry.homeName,
      awayName: entry.awayName,
      payload: JSON.stringify(entry.payload),
      fetchedAt: entry.fetchedAt ?? new Date().toISOString()
    });
}

/** La composition déjà enregistrée pour ce match, `null` si aucune. */
export function upcomingLineupByFotmobId(fotmobId, { database = openDb() } = {}) {
  const row = database.prepare('SELECT payload, fetched_at AS fetchedAt FROM upcoming_lineups WHERE fotmob_id = ?').get(String(fotmobId));
  return row ? { ...JSON.parse(row.payload), fetchedAt: row.fetchedAt } : null;
}

/** La composition déjà enregistrée pour l'équipe qui reçoit, à cette date (jour). */
export function upcomingLineupByHome(homeId, date, { database = openDb() } = {}) {
  const row = database
    .prepare('SELECT payload, fetched_at AS fetchedAt FROM upcoming_lineups WHERE home_id = ? AND date = ?')
    .get(homeId, date);
  return row ? { ...JSON.parse(row.payload), fetchedAt: row.fetchedAt } : null;
}

/** Retire les lignes dont le jour est trop ancien pour compter encore. */
export function pruneUpcomingLineups(before, { database = openDb() } = {}) {
  return database.prepare('DELETE FROM upcoming_lineups WHERE date < ?').run(before).changes;
}

export function upsertMatches(entries, { database = openDb() } = {}) {
  const st = prepared(database);
  const report = { created: 0, updated: 0, skipped: 0, rekeyed: 0, playersMerged: 0, playersPruned: 0, warnings: [] };
  // Un identifiant fusionné (people_merges) est remplacé à l'entrée : une
  // équivalence décidée une fois vaut pour toutes les lectures suivantes.
  const fusions = new Map(database.prepare('SELECT from_id, to_id FROM people_merges').all().map((r) => [r.from_id, r.to_id]));
  const now = new Date().toISOString();

  // IMMEDIATE, et non le BEGIN différé par défaut. upsertMatches lit
  // l'existant avant d'écrire ; une transaction différée prend d'abord un
  // instantané de lecture, et si un autre écrivain valide entre-temps, le
  // passage en écriture échoue AUSSITÔT sur SQLITE_BUSY_SNAPSHOT (517) —
  // erreur sur laquelle busy_timeout n'a, par construction, aucun effet.
  // Mesuré à trois processus concurrents : 249 transactions perdues sur 360
  // en différé, aucune en IMMEDIATE. IMMEDIATE prend le verrou d'écriture
  // dès le départ, ce qui rend l'attente réellement gouvernée par
  // busy_timeout. Contrepartie assumée : node:sqlite étant synchrone, cette
  // attente bloque la boucle d'événements, comme le faisait writeWithRetry.
  database.exec('BEGIN IMMEDIATE');
  try {
    for (const entry of entries) {
      const { date, homeName, awayName } = entry;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || !homeName || !awayName) { report.skipped++; continue; }
      const matchKey = entry.matchKey ?? resolveMatchKey(st, entry, date, homeName, awayName, report);

      const before = st.existingSources.get(matchKey);
      if (before) report.updated++; else report.created++;
      const previous = before?.sources ? JSON.parse(before.sources) : [];
      const sources = [...new Set([...previous, ...(entry.sources ?? [])])];

      const json = (value) => {
        if (!value) return null;
        const size = Array.isArray(value) ? value.length : Object.keys(value).length;
        return size ? JSON.stringify(value) : null;
      };
      st.match.run(matchKey, entry.matchId ?? `stats-${matchKey}`, date, entry.league ?? '', homeName, awayName,
        entry.homeId ?? null, entry.awayId ?? null, entry.fotmobId ?? null,
        entry.homeGoals ?? null, entry.awayGoals ?? null, entry.updatedAt ?? now,
        json(entry.events), json(entry.lineups), json(entry.meta), json(entry.shotmap), JSON.stringify(sources));

      for (const side of ['home', 'away']) {
        const stats = entry.teamStats?.[side];
        if (stats && Object.keys(stats).length) {
          const values = TEAM_COLUMNS.map((c) => {
            const raw = stats[c.key];
            if (raw === undefined || raw === null) return null;
            if (PERCENT_TEAM_KEYS.has(c.key)) return unpercent(raw);
            return Number.isFinite(Number(raw)) ? Number(raw) : null;
          });
          st.team.run(matchKey, side, ...values);
        }

        const incoming = entry.players?.[side] ?? [];
        if (!incoming.length) continue;
        const existing = st.existingPlayers.all(matchKey, side);
        const used = new Set(existing.map((e) => e.player_key));
        const ecrits = new Set();
        // Un joueur déjà présent garde son rang ; un nouveau venu se range à
        // la suite, comme mergePlayers ajoutait en fin de tableau.
        let prochainRang = existing.reduce((max, e) => Math.max(max, e.ord ?? 0), -1) + 1;
        for (const player of incoming) {
          if (!player?.name) continue;
          if (player.playerId != null && fusions.has(String(player.playerId))) player.playerId = fusions.get(String(player.playerId));
          let key = resolvePlayerKey(player, existing);
          // Deux inconnus d'une même feuille ne doivent pas se confondre : si
          // la clé est déjà prise par un autre homme du même lot, on la suffixe.
          const known = existing.some((e) => e.player_key === key);
          if (!known && used.has(key)) {
            let n = 2;
            while (used.has(`${key}#${n}`)) n++;
            key = `${key}#${n}`;
          }
          used.add(key);
          const rang = existing.find((e) => e.player_key === key)?.ord ?? prochainRang++;
          const values = PLAYER_COLUMNS.map((c) => {
            const raw = player[c.key];
            if (raw === undefined || raw === null) return null;
            if (c.key === 'starter' || c.key === 'subbedIn') return toBit(raw);
            if (c.type === 'TEXT') return String(raw);
            return Number.isFinite(Number(raw)) ? Number(raw) : null;
          });
          st.player.run(matchKey, side, key, rang, ...values);
          report.playersMerged++;
          ecrits.add(key);
          if (entry.replacePlayers && player.position == null) st.clearPosition.run(matchKey, side, key);
        }
        // Une feuille qui fait foi retire ce qu'elle ne porte plus.
        if (entry.replacePlayers && ecrits.size) report.playersPruned += st.prunePlayers.run(matchKey, side, JSON.stringify([...ecrits])).changes;
      }
    }
    database.exec('COMMIT');
  } catch (error) {
    // Sur disque plein ou erreur d'E/S, SQLite a déjà annulé la transaction
    // tout seul : le ROLLBACK explicite échoue alors à son tour et
    // remplacerait la vraie cause par un « cannot rollback » sans intérêt.
    try { database.exec('ROLLBACK'); } catch { /* déjà annulée */ }
    throw error;
  }
  return report;
}

export const __testing = { resolvePlayerKey, unpercent, teamDdl, playerDdl, DDL };
