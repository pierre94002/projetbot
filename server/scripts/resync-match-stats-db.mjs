/**
 * -----------------------------------------------------------------------
 * Resynchronise la base SQLite sur les fichiers JSON.
 * -----------------------------------------------------------------------
 * Tant que la double écriture dure, les deux magasins doivent contenir la
 * même chose. Ils peuvent diverger : une rencontre refusée par une
 * contrainte annulait autrefois tout son lot, et le JSON gardait seul ce que
 * la base n'avait jamais reçu — 4 952 rencontres, une fois.
 *
 * Ce script rattrape l'écart. Il ne recopie PAS bêtement le JSON : celui-ci
 * ne porte ni `homeId`, ni `awayId`, ni `fotmobId` (le vocabulaire de fusion
 * les écarte), alors que la base s'en sert pour tout son registre
 * d'identités. Les rencontres manquantes sont donc redemandées à FotMob,
 * dont le relevé porte ces identifiants ; le JSON ne sert que de repli pour
 * celles qu'aucune source FotMob ne désigne.
 *
 *   node scripts/resync-match-stats-db.mjs --dry-run
 *   node scripts/resync-match-stats-db.mjs --concurrency 4
 *
 * Options
 *   --dry-run          mesure l'écart sans rien écrire
 *   --concurrency <n>  requêtes FotMob simultanées (défaut : 4)
 *   --from-json        n'interroge pas FotMob, recopie le JSON tel quel
 *                      (rapide, mais les rencontres arrivent sans identité)
 *   --limit <n>        ne traite que les n premières (mise au point)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openDb, upsertMatches, closeDb, resolveDbPath } from '../src/data/db/matchStatsDb.js';
import { fetchMatchStats } from '../src/data/providers/fotMobProvider.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MATCH_STATS_DIR = path.join(HERE, '..', 'data', 'runtime', 'match-stats');

/** Lit tout le magasin JSON, indexé par matchKey. */
function readJsonStore(dir = MATCH_STATS_DIR) {
  const byKey = new Map();
  for (const f of fs.readdirSync(dir).filter((x) => /^\d{4}-\d{2}\.json$/.test(x)).sort()) {
    for (const m of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))) {
      if (m?.matchKey) byKey.set(m.matchKey, m);
    }
  }
  return byKey;
}

/** L'identifiant FotMob du match, tel que la source l'a laissé dans `sources`. */
export function fotMobIdFromSources(entry) {
  for (const s of entry?.sources ?? []) {
    const m = String(s).match(/matchDetails\?matchId=(\d+)/);
    if (m) return m[1];
  }
  return null;
}

/** Les rencontres présentes en JSON et absentes de la base. */
export function findGap({ dir = MATCH_STATS_DIR, database = openDb() } = {}) {
  const json = readJsonStore(dir);
  const enBase = new Set(database.prepare('SELECT match_key FROM matches').all().map((r) => r.match_key));
  const manquantes = [];
  for (const [key, entry] of json) if (!enBase.has(key)) manquantes.push(entry);
  return { json, enBase, manquantes };
}

async function pool(items, size, worker) {
  let i = 0;
  const runners = Array.from({ length: Math.max(1, size) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}

async function main() {
  const argv = process.argv.slice(2);
  const flag = (n) => argv.includes(n);
  const val = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  const concurrency = Number(val('--concurrency', '4'));
  const limit = val('--limit') ? Number(val('--limit')) : null;

  console.log(`Base : ${resolveDbPath()}`);
  const db = openDb();
  const { json, manquantes: toutes } = findGap({ database: db });
  const manquantes = limit ? toutes.slice(0, limit) : toutes;

  console.log(`JSON : ${json.size} rencontres | base : ${json.size - toutes.length} en commun`);
  console.log(`Écart : ${toutes.length} rencontre(s) absente(s) de la base${limit ? ` (on en traite ${manquantes.length})` : ''}.`);
  if (!manquantes.length) { closeDb(); return; }

  const parLigue = new Map();
  for (const m of toutes) parLigue.set(m.league, (parLigue.get(m.league) ?? 0) + 1);
  for (const [l, n] of [...parLigue].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`   ${String(l).padEnd(32)} ${n}`);
  if (flag('--dry-run')) { closeDb(); return; }

  const rapport = { fotmob: 0, depuisJson: 0, sansSource: 0, echecs: 0, inserees: 0, refusees: [] };
  const lot = [];
  const vider = () => {
    if (!lot.length) return;
    try {
      const r = upsertMatches(lot, { database: db });
      rapport.inserees += r.created + r.updated;
    } catch (error) {
      // Même règle qu'à la fusion : une mauvaise ligne ne doit pas emporter
      // ses voisines, et le refus doit se voir.
      for (const e of lot) {
        try { const r = upsertMatches([e], { database: db }); rapport.inserees += r.created + r.updated; }
        catch (err) { rapport.refusees.push({ matchKey: e.matchKey, reason: err.message }); }
      }
      console.error(`[resync] lot refusé en bloc (${error.message}) — repris une par une.`);
    }
    lot.length = 0;
  };

  let faits = 0;
  await pool(manquantes, flag('--from-json') ? 1 : concurrency, async (entry) => {
    let complet = null;
    const fotMobId = flag('--from-json') ? null : fotMobIdFromSources(entry);
    if (fotMobId) {
      try {
        const stats = await fetchMatchStats(fotMobId);
        if (stats) {
          // Les noms et le score DÉJÀ stockés font foi : FotMob ne sert ici
          // qu'à rendre les identifiants que le JSON ne porte pas.
          complet = {
            ...entry,
            homeId: stats.homeId,
            awayId: stats.awayId,
            fotmobId: stats.fotmobId,
            teamStats: stats.teamStats ?? entry.teamStats,
            players: stats.players ?? entry.players
          };
          rapport.fotmob++;
        }
      } catch { rapport.echecs++; }
    } else if (!flag('--from-json')) rapport.sansSource++;

    if (!complet) { complet = entry; rapport.depuisJson++; }
    lot.push(complet);
    if (lot.length >= 150) vider();
    if (++faits % 500 === 0) console.log(`   ${faits}/${manquantes.length}…`);
  });
  vider();

  console.log(`\nInsérées : ${rapport.inserees}`);
  console.log(`  dont relevé FotMob complet (avec identité) : ${rapport.fotmob}`);
  console.log(`  dont repli sur le JSON (sans identité)     : ${rapport.depuisJson}`);
  if (rapport.sansSource) console.log(`  sans source FotMob dans le JSON           : ${rapport.sansSource}`);
  if (rapport.echecs) console.log(`  échecs réseau                             : ${rapport.echecs}`);
  if (rapport.refusees.length) {
    console.log(`  REFUSÉES PAR LA BASE : ${rapport.refusees.length}`);
    for (const r of rapport.refusees.slice(0, 10)) console.log(`    ${r.matchKey} : ${r.reason}`);
  }

  const reste = findGap({ database: db }).manquantes.length;
  console.log(`\nÉcart restant : ${reste}${reste === 0 ? ' — les deux magasins coïncident.' : ''}`);
  closeDb();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
