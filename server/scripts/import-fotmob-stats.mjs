#!/usr/bin/env node
/**
 * import-fotmob-stats.mjs
 * -----------------------------------------------------------------------
 * Complète les statistiques déjà en base avec ce que FotMob publie en plus
 * d'ESPN : expected goals, xGOT, grosses occasions, duels, touches dans la
 * surface, tirs dedans/dehors — et, par joueur, la note, les minutes, les
 * passes et les duels.
 *
 * Usage :
 *   node import-fotmob-stats.mjs                        # tout le retard
 *   node import-fotmob-stats.mjs --league "EPL"         # un championnat
 *   node import-fotmob-stats.mjs --since 2024-07-01     # a partir d'une date
 *   node import-fotmob-stats.mjs --limit 50             # un echantillon
 *   node import-fotmob-stats.mjs --dry-run              # ce qui serait traite
 *
 * CONSTITUTION (--from/--to) : au lieu de completer des rencontres deja en
 * base, balaye les journees de la periode et CREE les entrees absentes,
 * directement depuis FotMob. C'est la voie a prendre pour un championnat
 * qu'ESPN ne couvre pas, ou dont on veut l'historique sans dependre de lui.
 *
 *   node import-fotmob-stats.mjs --from 2024-07-01 --to 2026-09-21 \
 *        --league "Dutch Eredivisie" --league "Primeira Liga - Portugal"
 *
 * Un seul appel par journee couvre TOUTES les competitions demandees, donc
 * ajouter des championnats a la meme commande ne coute presque rien de plus.
 *
 * Sans --from/--to, le script reste purement additif : rien n'est ecrase,
 * seules les cases vides se remplissent. Relancable sans risque — une entree
 * deja enrichie porte l'URL FotMob dans ses `sources` et est ignoree au
 * passage suivant.
 * -----------------------------------------------------------------------
 */

import { refreshFromFotMob, importMissingFromFotMob, listPending } from '../src/data/providers/fotMobRefresh.js';
import { withRefreshLock } from '../src/data/providers/espnMatchStatsRefresh.js';

function parseArgs(argv) {
  const options = { leagues: null, since: null, until: null, from: null, to: null, limit: null, concurrency: 3, dryRun: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === '--league') (options.leagues ??= []).push(next());
    else if (arg === '--from') options.from = next();
    else if (arg === '--to') options.to = next();
    else if (arg === '--since') options.since = next();
    else if (arg === '--until') options.until = next();
    else if (arg === '--limit') options.limit = Number(next());
    else if (arg === '--concurrency') options.concurrency = Number(next());
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--force') options.force = true;
    else {
      console.error(`Option inconnue : ${arg}`);
      process.exit(1);
    }
  }
  return options;
}

/** Constitution : cree les rencontres absentes du magasin sur une periode. */
async function backfill(options) {
  const started = Date.now();
  console.log(`Constitution depuis FotMob : ${options.from} -> ${options.to}${options.leagues ? ` (${options.leagues.join(', ')})` : ' (toutes competitions)'}.`);
  const report = await withRefreshLock(() => importMissingFromFotMob({
    from: options.from,
    to: options.to,
    leagues: options.leagues,
    concurrency: options.concurrency,
    onProgress: (info) => {
      if (info.phase === 'scanning') console.log(`  balayage ${info.done}/${info.total} journees — ${info.found} rencontre(s) a importer`);
      else if (info.phase === 'discovered') console.log(`${info.discovered} rencontre(s) reperee(s) : ${info.pending} a importer, ${info.skipped} deja en base.`);
      else if (info.phase === 'fetching') {
        const elapsed = (Date.now() - started) / 1000;
        const eta = Math.round((elapsed / info.done) * (info.total - info.done));
        console.log(`  ${info.done}/${info.total} — ${info.merged} fusionnes — reste ~${Math.floor(eta / 60)} min ${eta % 60} s`);
      }
    }
  }));

  if (report.skipped && !report.days) {
    console.error(`Rien lance : ${report.skipped}. Arrete le serveur ou attends la fin du passage en cours.`);
    process.exitCode = 1;
    return;
  }
  console.log(`\n${report.days} journee(s) balayee(s) | ${report.discovered} rencontre(s) reperee(s) | ${report.skipped} deja en base`);
  console.log(`Recuperes : ${report.fetched} | fusionnes : ${report.merged} | lignes joueur : ${report.playersMerged}`);
  console.log(`Sans releve chez FotMob : ${report.noStats} | echecs : ${report.failed}`);
  console.log(`Duree : ${Math.round((Date.now() - started) / 1000)} s`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.from || options.to) {
    if (!options.from || !options.to) {
      console.error('--from et --to vont ensemble (format AAAA-MM-JJ).');
      process.exit(1);
    }
    await backfill(options);
    return;
  }

  const pending = listPending(options);
  console.log(`${pending.length} rencontre(s) a enrichir depuis FotMob.`);

  if (options.dryRun) {
    const parLigue = {};
    for (const p of pending) parLigue[p.league] = (parLigue[p.league] ?? 0) + 1;
    for (const [l, n] of Object.entries(parLigue).sort((a, b) => b[1] - a[1])) console.log(`   ${l.padEnd(32)} ${n}`);
    return;
  }
  if (!pending.length) return;

  const started = Date.now();
  const report = await withRefreshLock(() => refreshFromFotMob({
    ...options,
    onProgress: (info) => {
      if (info.phase === 'matching') console.log(`  appariement ${info.done}/${info.total} journees — ${info.matched} rencontres`);
      else if (info.phase === 'matched') console.log(`Apparies : ${info.matched} (${info.unmatched} non apparies)`);
      else if (info.phase === 'fetching') {
        const elapsed = (Date.now() - started) / 1000;
        const eta = Math.round((elapsed / info.done) * (info.total - info.done));
        console.log(`  ${info.done}/${info.total} — ${info.merged} fusionnes — reste ~${Math.floor(eta / 60)} min ${eta % 60} s`);
      }
    }
  }));

  if (report.skipped) {
    console.error(`Rien lance : ${report.skipped}. Arrete le serveur ou attends la fin du passage en cours.`);
    process.exitCode = 1;
    return;
  }

  console.log(`\nRecuperes : ${report.fetched} | fusionnes : ${report.merged} | lignes joueur : ${report.playersMerged}`);
  console.log(`Non apparies : ${report.unmatched} | sans releve chez FotMob : ${report.noStats} | echecs : ${report.failed}`);
  for (const s of report.samples.unmatched) console.log(`  non apparie : ${s}`);
  for (const s of report.samples.failed) console.log(`  echec : ${s}`);
  console.log(`Duree : ${Math.round((Date.now() - started) / 1000)} s`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
