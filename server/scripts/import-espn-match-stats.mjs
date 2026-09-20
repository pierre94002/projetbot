#!/usr/bin/env node
/**
 * import-espn-match-stats.mjs
 * -----------------------------------------------------------------------
 * Comble les statistiques de match manquantes depuis l'API JSON publique
 * d'ESPN (gratuite, sans clé, sans quota).
 *
 * Usage :
 *   node import-espn-match-stats.mjs                      # tout le retard
 *   node import-espn-match-stats.mjs --limit 50           # un échantillon
 *   node import-espn-match-stats.mjs --league "EPL"       # un championnat
 *   node import-espn-match-stats.mjs --since 2026-08-01   # à partir d'une date
 *   node import-espn-match-stats.mjs --coverage           # état des lieux seul
 *   node import-espn-match-stats.mjs --force              # repasse sur tout
 *   node import-espn-match-stats.mjs --season 2024        # une saison passee
 *
 * Le même travail tourne tout seul dans le serveur (cf.
 * src/data/providers/espnMatchStatsRefresh.js) ; cette commande sert au
 * premier rattrapage et au dépannage.
 *
 * REPRISE — sur un très gros lot, Node peut s'arrêter net sur
 * `AssertionError: assert(!this.paused)` (analyseur HTTP d'undici, quand une
 * connexion se ferme pendant une pause). L'erreur naît dans un événement de
 * socket : aucun try/catch autour de fetch ne peut l'intercepter. Il suffit
 * de RELANCER la même commande — les rencontres déjà enregistrées sont
 * sautées, et les résultats sont écrits tous les 150 matchs, donc on ne perd
 * au pire que le lot en cours. Baisser --concurrency espace les connexions
 * et rend l'incident plus rare.
 * -----------------------------------------------------------------------
 */

import { refreshMatchStatsExclusive, importSeasons, getCoverage, listMissing } from '../src/data/providers/espnMatchStatsRefresh.js';

function parseArgs(argv) {
  const options = { leagues: null, since: null, until: null, limit: null, concurrency: 4, coverage: false, dryRun: false, force: false, seasons: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === '--league') (options.leagues ??= []).push(next());
    else if (arg === '--since') options.since = next();
    else if (arg === '--until') options.until = next();
    else if (arg === '--limit') options.limit = Number(next());
    else if (arg === '--concurrency') options.concurrency = Number(next());
    else if (arg === '--coverage') options.coverage = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--force') options.force = true;
    else if (arg === '--season') (options.seasons ??= []).push(Number(next()));
    else {
      console.error(`Option inconnue : ${arg}`);
      process.exit(1);
    }
  }
  return options;
}

function printCoverage(title) {
  const { totals, leagues, seasons } = getCoverage();
  console.log(`\n${title}`);
  console.log(`${'championnat'.padEnd(32)}${'term.'.padStart(6)}${'stats'.padStart(7)}${'%'.padStart(5)}${'joueurs'.padStart(9)}${'champs'.padStart(8)}`);
  for (const row of leagues) {
    const flag = row.supported ? '' : '  (hors ESPN)';
    console.log(
      `${row.league.padEnd(32)}${String(row.finished).padStart(6)}${String(row.withStats).padStart(7)}${String(`${row.coverage}%`).padStart(5)}${String(row.withPlayers).padStart(9)}${String(row.averageFields).padStart(8)}${flag}`
    );
  }
  console.log(`${'TOTAL'.padEnd(32)}${String(totals.finished).padStart(6)}${String(totals.withStats).padStart(7)}${String(`${totals.coverage}%`).padStart(5)}${String(totals.withPlayers).padStart(9)}`);

  if (seasons?.length) {
    console.log('\nContenu du magasin, par saison (calendrier local ou non)');
    console.log(`${'saison'.padEnd(12)}${'matchs'.padStart(8)}${'joueurs'.padStart(9)}${'lignes'.padStart(10)}${'champ.'.padStart(8)}`);
    for (const s of seasons) {
      console.log(`${s.season.padEnd(12)}${String(s.matches).padStart(8)}${String(s.withPlayers).padStart(9)}${String(s.playerRows).padStart(10)}${String(s.leagues).padStart(8)}`);
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.coverage) {
    printCoverage('Couverture actuelle');
    return;
  }

  // Saisons passées : le calendrier local ne remonte pas au-delà de la saison
  // precedente, les journees sont donc decouvertes chez ESPN.
  if (options.seasons?.length) {
    const started = Date.now();
    const report = await importSeasons({
      seasons: options.seasons,
      leagues: options.leagues,
      concurrency: options.concurrency,
      onProgress: (info) => {
        if (info.phase === 'days') console.log(`${info.days} journee(s) de match a interroger.`);
        else if (info.phase === 'scanning') console.log(`  balayage ${info.done}/${info.total} — ${info.found} rencontre(s) reperee(s)`);
        else if (info.phase === 'discovered') console.log(`${info.discovered} rencontre(s) terminee(s) : ${info.pending} a importer, ${info.skipped} deja en base.`);
        else if (info.phase === 'fetching') {
          const elapsed = (Date.now() - started) / 1000;
          const eta = Math.round((elapsed / info.done) * (info.total - info.done));
          console.log(`  ${info.done}/${info.total} — ${info.merged} fusionnes — reste ~${Math.floor(eta / 60)} min ${eta % 60} s`);
        }
      }
    });
    console.log(`\nRecuperes : ${report.fetched} | fusionnes : ${report.merged} | joueurs : ${report.playersMerged}`);
    console.log(`Sans statistiques : ${report.noStats} | echecs : ${report.failed}`);
    if (report.unavailable.length) console.log(`Saisons non couvertes par la source : ${report.unavailable.join(', ')}`);
    for (const s of report.samples.failed) console.log(`  echec : ${s}`);
    console.log(`Duree : ${Math.round((Date.now() - started) / 1000)} s`);
    return;
  }

  const missing = listMissing(options);
  console.log(`${missing.length} rencontre(s) terminée(s) sans statistiques ESPN.`);
  if (options.dryRun) {
    for (const m of missing.slice(0, 40)) console.log(`  ${m.date}  ${m.league.padEnd(26)} ${m.homeName} - ${m.awayName}`);
    if (missing.length > 40) console.log(`  … ${missing.length - 40} autres`);
    return;
  }
  if (!missing.length) return;

  printCoverage('Avant');

  const started = Date.now();
  const report = await refreshMatchStatsExclusive({
    ...options,
    onProgress: (info) => {
      if (info.phase === 'matched') {
        console.log(`Appariés : ${info.matched}/${info.total} (${info.unmatched} non appariés)`);
      } else if (info.phase === 'fetching') {
        const pct = Math.round((100 * info.done) / info.total);
        const elapsed = (Date.now() - started) / 1000;
        const eta = Math.round((elapsed / info.done) * (info.total - info.done));
        console.log(`  ${info.done}/${info.total} (${pct}%) — ${info.merged} fusionnés — reste ~${Math.floor(eta / 60)} min ${eta % 60} s`);
      }
    }
  });

  if (report.skipped) {
    console.error(`Rien lancé : ${report.skipped}. Arrête le serveur ou attends la fin du passage en cours.`);
    process.exitCode = 1;
    return;
  }

  console.log(`\nRécupérés : ${report.fetched} | fusionnés : ${report.merged} | joueurs : ${report.playersMerged}`);
  console.log(`Non appariés : ${report.unmatched} | sans statistiques chez ESPN : ${report.noStats} | échecs : ${report.failed}`);
  for (const s of report.samples.unmatched) console.log(`  non apparié : ${s}`);
  for (const s of report.samples.failed) console.log(`  échec : ${s}`);
  console.log(`Durée : ${Math.round((Date.now() - started) / 1000)} s`);

  printCoverage('Après');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
