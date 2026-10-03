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

export function resolveDbPath() {
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

const DDL = [
  MATCHES_DDL,
  teamDdl(),
  playerDdl(),
  UPCOMING_LINEUPS_DDL,
  ...BIRTHDATES_DDL,
  ...REGISTRY_DDL,
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
  ['team_squad_reads', 'version', 'INTEGER']
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
