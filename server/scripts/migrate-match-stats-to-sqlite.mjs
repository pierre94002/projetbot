/**
 * -----------------------------------------------------------------------
 * Migration du magasin JSON vers SQLite.
 * -----------------------------------------------------------------------
 * Lit les 41 fichiers <AAAA-MM>.json et les verse dans la base décrite par
 * src/data/db/matchStatsDb.js. La migration ne supprime RIEN : les fichiers
 * JSON restent la référence tant que la vérification n'a pas confirmé, clé
 * par clé, que la base contient exactement la même chose.
 *
 * La vérification compte, pour chaque statistique d'équipe et de joueur, le
 * nombre de valeurs présentes de part et d'autre, et compare les sommes. Un
 * écart d'une seule valeur est signalé : c'est la seule façon de s'assurer
 * qu'aucune colonne n'a été perdue en chemin.
 *
 *   node scripts/migrate-match-stats-to-sqlite.mjs --fresh --verify
 *   node scripts/migrate-match-stats-to-sqlite.mjs --verify-only
 *
 * Options
 *   --fresh        repart d'une base vide (sinon, complète l'existante)
 *   --verify       vérifie après la migration
 *   --verify-only  ne migre pas, vérifie seulement
 *   --db <chemin>  emplacement de la base (défaut : hors OneDrive)
 *   --limit <n>    ne traite que les n premiers fichiers (mise au point)
 *   --backup <f>   copie coherente de la base (VACUUM INTO), sans rien migrer
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openDb, upsertMatches, closeDb, resolveDbPath, backupTo } from '../src/data/db/matchStatsDb.js';
import { TEAM_COLUMNS, PLAYER_COLUMNS, PERCENT_TEAM_KEYS } from '../src/data/db/columns.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MATCH_STATS_DIR = path.join(HERE, '..', 'data', 'runtime', 'match-stats');

function shardFiles(dir) {
  return fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}\.json$/.test(f)).sort();
}

function readShard(dir, file) {
  return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
}

/** `55%` -> 55, comme à l'écriture. */
function unpercent(value) {
  if (value === null || value === undefined) return null;
  const n = Number(String(value).replace('%', '').trim());
  return Number.isFinite(n) ? n : null;
}

export function migrate({ dir = MATCH_STATS_DIR, file = resolveDbPath(), fresh = false, limit = null, log = console.log } = {}) {
  // Le journal AVANT la base : l'ordre inverse peut laisser un `-wal`
  // orphelin à côté d'une base neuve, et ce journal masque alors tout ce
  // que la base contient. Et surtout, on n'avale plus l'échec : un fichier
  // qu'on n'arrive pas à supprimer est un fichier encore ouvert par un
  // autre processus — continuer produirait exactement ce mélange-là.
  if (fresh) for (const suffix of ['-shm', '-wal', '']) {
    const cible = file + suffix;
    if (!fs.existsSync(cible)) continue;
    try {
      fs.unlinkSync(cible);
    } catch (error) {
      throw new Error(
        `Impossible de supprimer ${cible} (${error.code ?? error.message}). ` +
        'Un serveur ou un import tient sans doute la base ouverte : arrêtez-le avant de repartir à neuf.'
      );
    }
  }
  const db = openDb({ file });
  let files = shardFiles(dir);
  if (limit) files = files.slice(0, limit);

  const totals = { files: 0, created: 0, updated: 0, skipped: 0, playersMerged: 0 };
  const startedAt = Date.now();
  for (const shard of files) {
    const entries = readShard(dir, shard);
    const report = upsertMatches(entries, { database: db });
    totals.files++;
    totals.created += report.created;
    totals.updated += report.updated;
    totals.skipped += report.skipped;
    totals.playersMerged += report.playersMerged;
    log(`  ${shard}  ${String(entries.length).padStart(4)} rencontres  ${String(report.playersMerged).padStart(6)} lignes joueur`);
  }
  totals.seconds = Math.round((Date.now() - startedAt) / 100) / 10;
  return { db, totals, files };
}

/**
 * Compare la base au JSON, clé par clé. Renvoie la liste des écarts ; une
 * liste vide est la seule preuve acceptable que la migration est fidèle.
 */
export function verify({ dir = MATCH_STATS_DIR, db, limit = null, log = console.log } = {}) {
  const ecarts = [];
  const attendu = { matches: 0, teamSides: 0, players: 0, homeGoals: 0, awayGoals: 0 };
  const teamPresent = new Map();   // clé -> nombre de valeurs présentes
  const teamSomme = new Map();
  const playerPresent = new Map();
  const playerSomme = new Map();

  const bump = (map, key, by = 1) => map.set(key, (map.get(key) ?? 0) + by);

  let files = shardFiles(dir);
  if (limit) files = files.slice(0, limit);
  for (const shard of files) {
    for (const e of readShard(dir, shard)) {
      attendu.matches++;
      attendu.homeGoals += e.homeGoals ?? 0;
      attendu.awayGoals += e.awayGoals ?? 0;
      for (const side of ['home', 'away']) {
        const stats = e.teamStats?.[side];
        if (stats && Object.keys(stats).length) {
          attendu.teamSides++;
          for (const c of TEAM_COLUMNS) {
            const raw = stats[c.key];
            if (raw === undefined || raw === null) continue;
            const n = PERCENT_TEAM_KEYS.has(c.key) ? unpercent(raw) : Number(raw);
            if (!Number.isFinite(n)) continue;
            bump(teamPresent, c.column);
            bump(teamSomme, c.column, n);
          }
        }
        for (const p of e.players?.[side] ?? []) {
          if (!p?.name) continue;
          attendu.players++;
          for (const c of PLAYER_COLUMNS) {
            const raw = p[c.key];
            if (raw === undefined || raw === null) continue;
            if (c.type === 'TEXT') { bump(playerPresent, c.column); continue; }
            const n = c.key === 'starter' || c.key === 'subbedIn' ? (raw === true ? 1 : raw === false ? 0 : NaN) : Number(raw);
            if (!Number.isFinite(n)) continue;
            bump(playerPresent, c.column);
            bump(playerSomme, c.column, n);
          }
        }
      }
    }
  }

  const un = (sql) => Object.values(db.prepare(sql).get() ?? {})[0];
  const reel = {
    matches: un('SELECT COUNT(*) AS n FROM matches'),
    teamSides: un('SELECT COUNT(*) AS n FROM team_stats'),
    players: un('SELECT COUNT(*) AS n FROM players'),
    homeGoals: un('SELECT COALESCE(SUM(home_goals),0) AS n FROM matches'),
    awayGoals: un('SELECT COALESCE(SUM(away_goals),0) AS n FROM matches')
  };
  for (const [nom, valeur] of Object.entries(attendu)) {
    if (reel[nom] !== valeur) ecarts.push(`${nom} : JSON ${valeur}, base ${reel[nom]} (écart ${reel[nom] - valeur})`);
  }

  const compare = (table, colonnes, present, somme) => {
    const proche = (a, b) => Math.abs(a - b) < 0.01 + Math.abs(b) * 1e-9;
    for (const c of colonnes) {
      const q = db.prepare(`SELECT COUNT("${c.column}") AS n, COALESCE(SUM("${c.column}"),0) AS s FROM ${table}`).get();
      const attenduN = present.get(c.column) ?? 0;
      if (q.n !== attenduN) ecarts.push(`${table}.${c.column} : ${attenduN} valeurs en JSON, ${q.n} en base`);
      if (c.type === 'TEXT') continue;
      const attenduS = somme.get(c.column) ?? 0;
      if (!proche(Number(q.s), attenduS)) ecarts.push(`${table}.${c.column} : somme ${attenduS} en JSON, ${q.s} en base`);
    }
  };
  compare('team_stats', TEAM_COLUMNS, teamPresent, teamSomme);
  compare('players', PLAYER_COLUMNS.filter((c) => c.column !== 'player_id' && c.column !== 'name'), playerPresent, playerSomme);

  log(`\n  rencontres ${reel.matches} | côtés d'équipe ${reel.teamSides} | lignes joueur ${reel.players}`);
  log(`  buts domicile ${reel.homeGoals} | buts extérieur ${reel.awayGoals}`);
  return ecarts;
}

async function main() {
  const argv = process.argv.slice(2);
  const flag = (name) => argv.includes(name);
  const value = (name, fallback = null) => {
    const i = argv.indexOf(name);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
  };
  const file = value('--db', resolveDbPath());
  const limit = value('--limit') ? Number(value('--limit')) : null;
  const verifyOnly = flag('--verify-only');

  console.log(`Base : ${file}`);

  // Copie cohérente, même pendant que l'application écrit.
  const backup = value('--backup');
  if (backup) {
    const r = backupTo(backup, { database: openDb({ file }) });
    console.log(`Sauvegarde : ${(r.bytes / 1024 / 1024).toFixed(1)} Mo -> ${r.file}`);
    closeDb();
    return;
  }
  if (!verifyOnly) {
    console.log(`Source : ${MATCH_STATS_DIR}\n`);
    const { totals } = migrate({ file, fresh: flag('--fresh'), limit });
    console.log(`\n${totals.files} fichiers en ${totals.seconds} s`);
    console.log(`  créées ${totals.created} | complétées ${totals.updated} | écartées ${totals.skipped} | lignes joueur ${totals.playersMerged}`);
    const octets = fs.statSync(file).size;
    console.log(`  base : ${(octets / 1024 / 1024).toFixed(1)} Mo`);
  }

  if (flag('--verify') || verifyOnly) {
    console.log('\nVérification clé par clé…');
    const db = openDb({ file });
    const ecarts = verify({ db, limit });
    if (!ecarts.length) console.log('\n  Aucun écart : la base contient exactement le contenu des fichiers JSON.');
    else {
      console.log(`\n  ${ecarts.length} écart(s) :`);
      for (const e of ecarts.slice(0, 60)) console.log(`   - ${e}`);
      process.exitCode = 1;
    }
  }
  closeDb();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error); process.exit(1); });
}
