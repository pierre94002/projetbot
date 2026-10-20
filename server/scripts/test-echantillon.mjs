#!/usr/bin/env node
/**
 * test-echantillon.mjs — fabrique la base d'essai des tests automatiques.
 * -----------------------------------------------------------------------
 * Étape 3 du plan CôteMaster. Les tests tournent sur une PETITE base (quelques
 * Mo), jamais sur la vraie : test/fixtures/echantillon.db, tirée de la copie
 * du bac à sable, ouverte en LECTURE SEULE.
 *
 * Ce qu'elle contient :
 *   - environ 200 matchs « cibles », joués, choisis par des règles FIXES
 *     (CHOIX ci-dessous, jusqu'au JUSQU_AU inclus) : plusieurs championnats et
 *     deux coupes (EFL Cup, DFB Pokal, avec leurs matchs décidés aux tirs au
 *     but ou après prolongation), avec et sans xG, avec et sans cote dans
 *     match_odds, avec déroulé et composition ; les lignes joueurs et la
 *     carte des tirs pour une soixantaine d'entre eux (CHOIX.joueurs) ; plus
 *     les derniers matchs des clubs des pièges de noms (Leeds United / DC
 *     United, les « Nacional », Port Vale / Portsmouth / Porto / Shanghai
 *     Port, les « Libertad », les « Universidad Católica », Inter / Inter
 *     Miami) ;
 *   - l'HISTORIQUE dont le moteur a besoin pour les calculer : les 12 derniers
 *     matchs de chaque équipe avant chaque cible (toutes compétitions) et les
 *     matchs du championnat dans les 75 jours d'avant — sans déroulé, ni
 *     composition, ni carte des tirs (inutiles au moteur), avec leurs
 *     statistiques d'équipe ;
 *   - juste ce qu'il faut des autres tables : annuaires (clubs, joueurs) des
 *     seules équipes et des seuls joueurs présents, cotes passées
 *     (match_odds), classements officiels des championnats cibles, noms
 *     FotMob des clubs. Les autres tables existent (même schéma que l'appli,
 *     créé par openDb) mais restent vides. Les index sont retirés : openDb
 *     les recrée sur chaque copie de travail des tests.
 *
 * Jamais : la vraie base (refus, garde-fou du bac), data/runtime (paris,
 * pronostics, analyses de Pierre), un .env, ai-config.json.
 *
 * Sortie : test/fixtures/echantillon.db + test/fixtures/echantillon.json
 * (critères, comptes, taille, empreinte, liste des cibles). Une base déjà
 * là n'est remplacée qu'avec --remplacer : les pronostics figés
 * (test-figer.mjs) en dépendent et devront être refigés.
 *
 *   node scripts/test-echantillon.mjs [--source <copie du bac>] [--remplacer]
 *
 * Depuis la copie du bac seulement (bac-a-sable\code\server) : refus sous
 * OneDrive. Première fabrication le 05/10/2026 : 201 cibles, 2 156
 * rencontres, 4,17 Mo, 8 s.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { openDb, closeDb } from '../src/data/db/matchStatsDb.js';
import { verifierBaseDuBac, RACINE_BAC, VRAIE_BASE } from '../src/config/bacASable.js';

const SERVEUR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = path.join(SERVEUR, 'test', 'fixtures');
const CIBLE = path.join(FIXTURES, 'echantillon.db');
const MANIFESTE = path.join(FIXTURES, 'echantillon.json');
const SOURCE_PAR_DEFAUT = path.join(RACINE_BAC, 'base', 'match-stats.db');

/** Dernier jour des matchs retenus (inclus) : fixe, pour qu'une base plus récente redonne les mêmes cibles. */
export const JUSQU_AU = '2026-09-21';
/** Les N derniers matchs joués de chaque compétition, au plus tard le JUSQU_AU. */
// `joueurs` : ces cibles gardent leurs lignes joueurs et leur carte des tirs
// (une soixantaine de matchs suffit ; le moteur n'en lit aucune, et toutes
// les garder triplait la taille de la base).
export const CHOIX = [
  { league: 'EPL', n: 20, joueurs: true, pourquoi: 'xG, cotes moyennes de clôture (football-data), Leeds United' },
  { league: 'Championship', n: 12, pourquoi: 'Portsmouth' },
  { league: 'League 2', n: 8, pourquoi: 'Port Vale' },
  { league: 'Primeira Liga - Portugal', n: 18, pourquoi: 'Nacional (Portugal), FC Porto' },
  { league: 'División Profesional - Paraguay', n: 12, joueurs: true, pourquoi: 'sans xG ; Nacional et Libertad (Paraguay)' },
  { league: 'MLS', n: 18, pourquoi: 'DC United, Inter Miami' },
  { league: 'Serie A - Ecuador', n: 12, pourquoi: 'sans xG ; Libertad et Universidad Católica (Équateur)' },
  { league: 'Super League - China', n: 10, pourquoi: 'sans xG ; Shanghai Port' },
  { league: 'Serie A - Italy', n: 10, pourquoi: 'Inter' },
  { league: 'Premier League - Russia', n: 16, pourquoi: 'xG mais presque pas de cote passée' },
  { league: 'EFL Cup', n: 18, joueurs: true, pourquoi: 'coupe : avec et sans cote, tirs au but' },
  { league: 'DFB Pokal - Germany', n: 8, pourquoi: 'coupe : prolongations' },
  { league: 'Primera División - Chile', n: 8, pourquoi: 'sans xG ; Universidad Católica (Chili)' },
  { league: 'Virsliga - Latvia', n: 8, joueurs: true, pourquoi: 'couverture réduite (« lower »)' }
];
/** Coupes dont TOUS les matchs décidés après prolongation ou aux tirs au but (60 derniers jours) sont des cibles. */
export const COUPES_PROLONGATIONS = ['EFL Cup', 'DFB Pokal - Germany'];
/** Clubs des pièges de noms : leurs 2 derniers matchs sont des cibles. */
export const CLUBS_PIEGES = {
  'fotmob-8463': 'Leeds United',
  'fotmob-6602': 'DC United',
  'fotmob-10214': 'Nacional (Portugal)',
  'fotmob-49689': 'Nacional (Paraguay)',
  'fotmob-9799': 'Port Vale',
  'fotmob-8462': 'Portsmouth',
  'fotmob-9773': 'FC Porto',
  'fotmob-198616': 'Shanghai Port',
  'fotmob-6620': 'Libertad (Paraguay)',
  'fotmob-1345405': 'Libertad (Équateur)',
  'fotmob-113053': 'Universidad Católica (Équateur)',
  'fotmob-6458': 'Universidad Católica (Chili)',
  'fotmob-8636': 'Inter',
  'fotmob-960720': 'Inter Miami CF'
};
const HISTORIQUE_PAR_EQUIPE = 12;
const FENETRE_LIGUE_JOURS = 75;
const FENETRE_PROLONGATIONS_JOURS = 60;

/** Tables recopiées (le reste du schéma reste vide). */
export const TABLES_RECOPIEES = ['matches', 'team_stats', 'players', 'match_odds', 'teams', 'team_aliases', 'team_source_names', 'people', 'people_aliases', 'standings_official'];

const JOUE = 'home_goals IS NOT NULL AND away_goals IS NOT NULL';
const IDENTIFIE = 'home_id IS NOT NULL AND away_id IS NOT NULL AND fotmob_id IS NOT NULL';
const PROLONGATION = "json_extract(meta, '$.reason') IN ('afterextra', 'afterpenalties')";

function lireArgs(argv) {
  const args = { source: SOURCE_PAR_DEFAUT, remplacer: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--source') {
      const v = argv[++i];
      if (!v || v.startsWith('--')) throw new Error("L'option --source attend un chemin.");
      args.source = v;
    } else if (a === '--remplacer') args.remplacer = true;
    else throw new Error(`Option inconnue : ${a}. Options : --source <copie du bac>, --remplacer.`);
  }
  return args;
}

const plusJours = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const sha1 = (fichier) => crypto.createHash('sha1').update(fs.readFileSync(fichier)).digest('hex');

function par500(liste) {
  const out = [];
  for (let i = 0; i < liste.length; i += 500) out.push(liste.slice(i, i + 500));
  return out;
}

/** Colonnes communes à la source et à la base d'essai, dans l'ordre de la base d'essai. */
function colonnesCommunes(src, dst, table) {
  const s = new Set(src.prepare('SELECT name FROM pragma_table_info(?)').all(table).map((r) => r.name));
  return dst.prepare('SELECT name FROM pragma_table_info(?)').all(table).map((r) => r.name).filter((c) => s.has(c));
}

/** Recopie les lignes de `table` dont `colonne` est dans `valeurs` (ordre fixe), en vidant `sansColonnes` si demandé. */
function recopier(src, dst, table, colonne, valeurs, { sansColonnes = [], ordre = null } = {}) {
  const cols = colonnesCommunes(src, dst, table);
  const liste = cols.map((c) => `"${c}"`).join(', ');
  const ins = dst.prepare(`INSERT OR IGNORE INTO ${table} (${liste}) VALUES (${cols.map(() => '?').join(', ')})`);
  let n = 0;
  for (const lot of par500([...valeurs].sort())) {
    const rows = src
      .prepare(`SELECT ${liste} FROM ${table} WHERE "${colonne}" IN (${lot.map(() => '?').join(', ')})${ordre ? ` ORDER BY ${ordre}` : ''}`)
      .all(...lot);
    for (const r of rows) {
      for (const c of sansColonnes) r[c] = null;
      n += Number(ins.run(...cols.map((c) => r[c])).changes);
    }
  }
  return n;
}

function main() {
  const args = lireArgs(process.argv.slice(2));
  // Une base SQLite (et son journal) ne se fabrique jamais sous OneDrive :
  // verrous de synchronisation, fichiers annexes. On la fait dans le bac, puis
  // sandbox-apply la recopie comme un fichier ordinaire.
  if (/onedrive/i.test(SERVEUR)) throw new Error(`À lancer depuis la copie du bac (${path.join(RACINE_BAC, 'code', 'server')}), pas depuis le dépôt sous OneDrive.`);
  const source = path.resolve(args.source);
  // La source : une copie DANS le bac, jamais la vraie base (ni par un autre
  // nom, une jonction, un lien physique) — même contrôle que le serveur du bac.
  const v = verifierBaseDuBac(source);
  if (!v.ok) throw new Error(`Source refusée : ${v.raison}.`);
  if (path.resolve(source).toLowerCase() === path.resolve(VRAIE_BASE).toLowerCase()) throw new Error('Source refusée : la vraie base.');
  if (!fs.existsSync(source)) throw new Error(`Source introuvable : ${source}.`);
  if (fs.existsSync(CIBLE) && !args.remplacer) {
    throw new Error(`${CIBLE} existe déjà. Les pronostics figés en dépendent : relancez avec --remplacer, puis refigez (node scripts/test-figer.mjs --refiger).`);
  }

  const debut = Date.now();
  const src = new DatabaseSync(source, { readOnly: true });
  const q = (sql, ...a) => src.prepare(sql).all(...a);

  // ------------------------------------------------------------ cibles
  const cibles = new Map(); // match_key -> raisons
  const avecJoueurs = new Set();
  const ajouterCible = (cle, raison) => {
    if (!cibles.has(cle)) cibles.set(cle, []);
    if (!cibles.get(cle).includes(raison)) cibles.get(cle).push(raison);
  };
  for (const { league, n, joueurs } of CHOIX) {
    const rows = q(`SELECT match_key FROM matches WHERE league = ? AND date <= ? AND ${JOUE} AND ${IDENTIFIE} ORDER BY date DESC, match_key DESC LIMIT ?`, league, JUSQU_AU, n);
    if (rows.length < n) throw new Error(`${league} : ${rows.length} matchs au lieu de ${n} — la source a-t-elle changé ?`);
    for (const r of rows) {
      ajouterCible(r.match_key, league);
      if (joueurs) avecJoueurs.add(r.match_key);
    }
  }
  for (const league of COUPES_PROLONGATIONS) {
    for (const r of q(`SELECT match_key FROM matches WHERE league = ? AND date <= ? AND date > ? AND ${JOUE} AND ${IDENTIFIE} AND ${PROLONGATION} ORDER BY date DESC, match_key DESC`, league, JUSQU_AU, plusJours(JUSQU_AU, -FENETRE_PROLONGATIONS_JOURS))) {
      ajouterCible(r.match_key, `${league} : prolongation ou tirs au but`);
    }
  }
  for (const [id, nom] of Object.entries(CLUBS_PIEGES)) {
    const rows = q(
      `SELECT match_key, date FROM (
         SELECT match_key, date FROM matches WHERE home_id = ? AND date <= ? AND ${JOUE} AND ${IDENTIFIE}
         UNION ALL SELECT match_key, date FROM matches WHERE away_id = ? AND date <= ? AND ${JOUE} AND ${IDENTIFIE})
       ORDER BY date DESC, match_key DESC LIMIT 2`,
      id, JUSQU_AU, id, JUSQU_AU
    );
    if (rows.length < 2) throw new Error(`Club piège ${nom} (${id}) : ${rows.length} match(s) seulement.`);
    for (const r of rows) ajouterCible(r.match_key, `club piège : ${nom}`);
  }

  const detailCible = new Map();
  for (const lot of par500([...cibles.keys()])) {
    for (const r of q(`SELECT match_key, date, league, home_id, away_id, home_name, away_name FROM matches WHERE match_key IN (${lot.map(() => '?').join(', ')})`, ...lot)) {
      detailCible.set(r.match_key, r);
    }
  }

  // --------------------------------------------------------- historique
  const historique = new Set();
  const avantParEquipe = src.prepare(
    `SELECT match_key FROM (
       SELECT match_key, date FROM matches WHERE home_id = ? AND date < ? AND ${JOUE}
       UNION ALL SELECT match_key, date FROM matches WHERE away_id = ? AND date < ? AND ${JOUE})
     ORDER BY date DESC, match_key DESC LIMIT ?`
  );
  const fenetres = new Map(); // league -> [min, max]
  for (const t of detailCible.values()) {
    for (const id of [t.home_id, t.away_id]) {
      for (const r of avantParEquipe.all(id, t.date, id, t.date, HISTORIQUE_PAR_EQUIPE)) historique.add(r.match_key);
    }
    const f = fenetres.get(t.league) ?? [t.date, t.date];
    fenetres.set(t.league, [t.date < f[0] ? t.date : f[0], t.date > f[1] ? t.date : f[1]]);
  }
  for (const [league, [min, max]] of [...fenetres].sort()) {
    for (const r of q(`SELECT match_key FROM matches WHERE league = ? AND date >= ? AND date < ? AND ${JOUE}`, league, plusJours(min, -FENETRE_LIGUE_JOURS), max)) {
      historique.add(r.match_key);
    }
  }
  for (const cle of cibles.keys()) historique.delete(cle);

  // ------------------------------------------------------------ écriture
  fs.mkdirSync(FIXTURES, { recursive: true });
  const travail = path.join(FIXTURES, `echantillon.db.${process.pid}.en-cours`);
  for (const suffixe of ['', '-wal', '-shm']) fs.rmSync(travail + suffixe, { force: true });
  // Le schéma de l'appli, tel que le code le crée (tables, colonnes ajoutées, index).
  const dst = openDb({ file: travail });
  const comptes = {};
  dst.exec('BEGIN IMMEDIATE');
  try {
    // Cibles : entières ; la carte des tirs seulement avec les joueurs.
    comptes.cibles =
      recopier(src, dst, 'matches', 'match_key', avecJoueurs) +
      recopier(src, dst, 'matches', 'match_key', [...cibles.keys()].filter((c) => !avecJoueurs.has(c)), { sansColonnes: ['shotmap'] });
    // Historique : sans déroulé, composition, carte des tirs ni liens des sources.
    comptes.historique = recopier(src, dst, 'matches', 'match_key', historique, { sansColonnes: ['events', 'lineups', 'shotmap', 'sources'] });
    const toutes = new Set([...cibles.keys(), ...historique]);
    comptes.team_stats = recopier(src, dst, 'team_stats', 'match_key', toutes, { ordre: 'match_key, side' });
    comptes.players = recopier(src, dst, 'players', 'match_key', avecJoueurs, { ordre: 'match_key, side, ord, player_key' });
    comptes.match_odds = recopier(src, dst, 'match_odds', 'match_key', toutes);
    const equipes = new Set(dst.prepare('SELECT home_id AS id FROM matches WHERE home_id IS NOT NULL UNION SELECT away_id FROM matches WHERE away_id IS NOT NULL').all().map((r) => r.id));
    comptes.teams = recopier(src, dst, 'teams', 'team_id', equipes);
    comptes.team_aliases = recopier(src, dst, 'team_aliases', 'team_id', equipes, { ordre: 'team_id, alias' });
    comptes.team_source_names = recopier(src, dst, 'team_source_names', 'team_id', equipes);
    const joueurs = new Set(dst.prepare('SELECT DISTINCT COALESCE(player_id, player_key) AS id FROM players').all().map((r) => r.id));
    comptes.people = recopier(src, dst, 'people', 'player_id', joueurs);
    comptes.people_aliases = recopier(src, dst, 'people_aliases', 'player_id', joueurs, { ordre: 'player_id, alias' });
    // Classements officiels : la dernière saison relevée de chaque compétition cible.
    let n = 0;
    const colsClassement = colonnesCommunes(src, dst, 'standings_official');
    const insClassement = dst.prepare(`INSERT INTO standings_official (${colsClassement.join(', ')}) VALUES (${colsClassement.map(() => '?').join(', ')})`);
    for (const league of [...fenetres.keys()].sort()) {
      const saison = src.prepare('SELECT MAX(season) AS s FROM standings_official WHERE league = ?').get(league)?.s;
      if (saison === null || saison === undefined) continue;
      for (const r of src.prepare(`SELECT ${colsClassement.join(', ')} FROM standings_official WHERE league = ? AND season = ? ORDER BY ord, table_name`).all(league, saison)) {
        n += Number(insClassement.run(...colsClassement.map((c) => r[c])).changes);
      }
    }
    comptes.standings_official = n;
    dst.exec('COMMIT');
  } catch (error) {
    try { dst.exec('ROLLBACK'); } catch { /* déjà annulée */ }
    closeDb(travail);
    for (const suffixe of ['', '-wal', '-shm']) fs.rmSync(travail + suffixe, { force: true });
    throw error;
  }
  comptes.rencontres = comptes.cibles + comptes.historique;

  // Description des cibles (lue dans la base d'essai elle-même).
  const descr = dst
    .prepare(
      `SELECT m.match_key AS cle, m.date, m.league, m.home_name AS home, m.away_name AS away, m.home_goals AS hg, m.away_goals AS ag,
              json_extract(m.meta, '$.reason') AS fin, json_extract(m.meta, '$.coverage') AS couverture,
              th.expected_goals IS NOT NULL AS xg, o.basis AS cotes,
              (SELECT COUNT(*) FROM players p WHERE p.match_key = m.match_key) AS joueurs
       FROM matches m
       LEFT JOIN team_stats th ON th.match_key = m.match_key AND th.side = 'home'
       LEFT JOIN match_odds o ON o.match_key = m.match_key
       WHERE m.match_key IN (${[...cibles.keys()].map(() => '?').join(', ')})
       ORDER BY m.league, m.date, m.match_key`
    )
    .all(...cibles.keys())
    .map((r) => ({
      cle: r.cle,
      date: r.date,
      league: r.league,
      home: r.home,
      away: r.away,
      score: `${r.hg}-${r.ag}`,
      fin: r.fin ?? null,
      couverture: r.couverture ?? null,
      xg: Boolean(r.xg),
      cotes: r.cotes ?? null,
      joueurs: r.joueurs,
      pourquoi: cibles.get(r.cle)
    }));

  // Les index de l'appli sont retirés : openDb les recrée à l'ouverture de
  // chaque copie de travail (CREATE INDEX IF NOT EXISTS), en quelques
  // millisecondes sur une base de cette taille ; gardés, ils pesaient autant
  // que les données.
  const index = dst.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx\\_%' ESCAPE '\\' ORDER BY name").all().map((r) => r.name);
  for (const nom of index) dst.exec(`DROP INDEX "${nom}";`);
  comptes.indexRetires = index.length;

  // Un seul fichier, compact : journal remis en mode classique, puis VACUUM.
  dst.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  closeDb(travail);
  const compact = new DatabaseSync(travail);
  compact.exec('PRAGMA journal_mode = DELETE;');
  compact.exec('VACUUM;');
  const integrite = compact.prepare('PRAGMA integrity_check').get();
  compact.close();
  src.close();
  if (Object.values(integrite)[0] !== 'ok') throw new Error(`Base d'essai abîmée : ${JSON.stringify(integrite)}`);
  for (const suffixe of ['-wal', '-shm']) fs.rmSync(travail + suffixe, { force: true });
  fs.rmSync(CIBLE, { force: true });
  fs.renameSync(travail, CIBLE);

  const octets = fs.statSync(CIBLE).size;
  const manifeste = {
    version: 1,
    fabriqueLe: new Date().toISOString(),
    source: path.basename(path.dirname(path.dirname(source))) === 'bac-a-sable' ? 'copie du bac à sable (base\\match-stats.db)' : source,
    criteres: {
      jusquAu: JUSQU_AU,
      choix: CHOIX,
      coupesProlongations: COUPES_PROLONGATIONS,
      fenetreProlongationsJours: FENETRE_PROLONGATIONS_JOURS,
      clubsPieges: CLUBS_PIEGES,
      historiqueParEquipe: HISTORIQUE_PAR_EQUIPE,
      fenetreLigueJours: FENETRE_LIGUE_JOURS,
      tables: TABLES_RECOPIEES
    },
    comptes,
    variete: {
      competitions: new Set(descr.map((d) => d.league)).size,
      avecXg: descr.filter((d) => d.xg).length,
      sansXg: descr.filter((d) => !d.xg).length,
      avecCotes: descr.filter((d) => d.cotes).length,
      sansCotes: descr.filter((d) => !d.cotes).length,
      avecJoueurs: descr.filter((d) => d.joueurs > 0).length,
      prolongations: descr.filter((d) => d.fin === 'afterextra').length,
      tirsAuBut: descr.filter((d) => d.fin === 'afterpenalties').length
    },
    octets,
    mo: Number((octets / 1048576).toFixed(2)),
    sha1: sha1(CIBLE),
    dureeMs: Date.now() - debut,
    cibles: descr
  };
  fs.writeFileSync(MANIFESTE, `${JSON.stringify(manifeste, null, 1)}\n`);
  const { cibles: _liste, criteres: _criteres, ...resume } = manifeste;
  console.log(JSON.stringify({ ok: true, fichier: CIBLE, ...resume }));
}

// Lancé directement seulement : les tests importent les critères ci-dessus
// (TABLES_RECOPIEES…) sans jamais refaire la base.
const lanceDirectement = Boolean(process.argv[1]) && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (lanceDirectement) {
  try {
    main();
  } catch (error) {
    console.log(JSON.stringify({ ok: false, reason: error.message }));
    process.exitCode = 1;
  }
}
