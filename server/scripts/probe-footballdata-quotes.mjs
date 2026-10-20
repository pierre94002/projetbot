#!/usr/bin/env node
/**
 * probe-footballdata-quotes.mjs — sonde du fournisseur de cotes football-data.co.uk.
 * -----------------------------------------------------------------------
 * Montre, en chiffres réels, ce que footballDataOdds.js rend pour odds_quotes :
 *   1. les bookmakers reconnus dans quatre fichiers (E0 2025-26, E0 2026-27,
 *      Brésil, fixtures.csv) et le nombre de cotes par ligne ;
 *   2. les matchs À VENIR du calendrier CôteMaster (season-calendar.json,
 *      matchs « scheduled » des N prochains jours) passés à collectFixturesCsv :
 *      lignes, rattachées, noms non résolus, manques et leur raison ;
 *   3. l'effet des noms appris par le vote (backfillQuotes) sur ces matchs ;
 *   4. collectLive (football-data n'a pas de direct) ;
 *   5. backfillQuotes sur E0 2026-27 avec un budget de 2 requêtes, et un match
 *      joué vérifié de bout en bout contre le magasin ;
 *   6. le rattrapage d'une compétition comme l'appelle l'orchestrateur, sa
 *      reprise au curseur (attente de 12 h, puis requête conditionnelle) ;
 *   7. un fichier par pays (Brésil), et le coup d'envoi UTC de chaque rencontre
 *      rattachée comparé à celui du magasin (heure britannique -> UTC).
 *
 * LECTURE SEULE : la base est ouverte en lecture seule, sourceMatching ne
 * garde les alias qu'en mémoire (ODDS_MATCHING_READONLY=1), le vote est
 * appelé avec apply: false, rien n'est passé au dépôt des cotes.
 *
 * Usage (depuis server/) :
 *   MATCH_STATS_DB=<copie de la base> ODDS_MATCHING_READONLY=1 node scripts/probe-footballdata-quotes.mjs
 *   options : --jours 7 --ligue EPL --budget 40 --pays "Brazil Série A"
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import { openDb } from '../src/data/db/matchStatsDb.js';

const args = process.argv.slice(2);
const option = (nom, defaut) => {
  const i = args.indexOf(`--${nom}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : defaut;
};
const JOURS = Number(option('jours', 7));
const LIGUE = option('ligue', 'EPL');
const BUDGET = Number(option('budget', 40));
const PAYS = option('pays', 'Brazil Série A');

if (process.env.ODDS_MATCHING_READONLY !== '1' || !process.env.MATCH_STATS_DB) {
  console.error('Sonde en lecture seule : lancez-la avec MATCH_STATS_DB=<copie de la base> et ODDS_MATCHING_READONLY=1.');
  process.exit(1);
}
// Ouverte en lecture seule AVANT tout autre module : openDb rend ensuite cette même connexion.
const database = openDb({ file: process.env.MATCH_STATS_DB, readonly: true });
const fd = await import('../src/data/providers/footballDataOdds.js');
const { apprendreAlias } = await import('../src/data/providers/sourceMatching.js');
const { clubDuMagasin } = await import('../src/data/db/oddsProfileRead.js');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const titre = (t) => console.log(`\n=== ${t} ===`);
const compter = (liste, cle) => liste.reduce((m, x) => m.set(cle(x), (m.get(cle(x)) ?? 0) + 1), new Map());
const enLigne = (m) => [...m].map(([k, v]) => `${k} ${v}`).join(' | ');
let requetesSonde = 0;
const debutSonde = Date.now();

const comptes = () =>
  Object.fromEntries(
    ['odds_events', 'odds_quotes', 'team_source_aliases', 'odds_source_state', 'match_odds'].map((t) => {
      try {
        return [t, database.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n];
      } catch {
        return [t, 'absente'];
      }
    })
  );
const avant = comptes();
console.log('Base (lecture seule) :', process.env.MATCH_STATS_DB);
console.log('Lignes avant la sonde :', JSON.stringify(avant));

const lireCsv = (texte) => {
  const lignes = texte.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const entetes = lignes[0].split(',').map((h) => h.trim());
  return { entetes, rows: lignes.slice(1).map((l) => Object.fromEntries(entetes.map((h, i) => [h, (l.split(',')[i] ?? '').trim()]))) };
};

/* 1. Bookmakers reconnus par fichier ----------------------------------- */
titre('1. Bookmakers reconnus par fichier (lecture dynamique des en-têtes)');
const echantillons = [
  ['E0 2025-26', 'https://www.football-data.co.uk/mmz4281/2526/E0.csv', 'E0'],
  ['E0 2026-27', 'https://www.football-data.co.uk/mmz4281/2627/E0.csv', 'E0'],
  ['Brésil (new/BRA)', 'https://www.football-data.co.uk/new/BRA.csv', 'BRA'],
  ['fixtures.csv', 'https://www.football-data.co.uk/fixtures.csv', null]
];
for (const [nom, url, code] of echantillons) {
  await sleep(700); // la sonde respecte le même rythme que le module
  requetesSonde++;
  let r;
  try {
    r = await fetch(url, { headers: { 'User-Agent': UA } });
  } catch (error) {
    console.log(`${nom} : échec réseau ${error.message}`);
    continue;
  }
  if (!r.ok) {
    console.log(`${nom} : HTTP ${r.status}`);
    continue;
  }
  const { entetes, rows } = lireCsv(await r.text());
  console.log(`\n${nom} — ${entetes.length} colonnes, ${rows.length} lignes, mis en ligne ${r.headers.get('last-modified')}`);
  for (const l of fd.livresDuFichier(entetes)) {
    const marches = Object.entries(l.marches).map(([m, k]) => `${m} [${Object.entries(k).map(([kind, p]) => `${kind} ${p}`).join(', ')}]`);
    console.log(`  ${l.actif ? 'rendu  ' : 'ignoré '} ${l.bookmaker.padEnd(18)} ${marches.join(' ; ')}`);
  }
  const dansLeMagasin = rows.filter((x) => {
    const m = String(x.Date ?? '').match(/(\d{2}|\d{4})$/);
    return m && Number(m[1].length === 2 ? `20${m[1]}` : m[1]) >= 2023 && (code || fd.LIGUES.has(fd.FD_SAISONNIERS[x.Div]));
  });
  const n = dansLeMagasin.map((x) => fd.quotesFromRow(x, { code: code ?? x.Div }).length).sort((a, b) => a - b);
  if (n.length) {
    console.log(`  cotes rendues par ligne (${n.length} lignes depuis 2023${code ? '' : ', compétitions du magasin'}) : min ${n[0]}, médiane ${n[Math.floor(n.length / 2)]}, max ${n.at(-1)} ; total ${n.reduce((a, b) => a + b, 0)}`);
  }
  if (!code) console.log(`  lignes par division : ${enLigne(compter(rows, (x) => `${x.Div}${fd.LIGUES.has(fd.FD_SAISONNIERS[x.Div]) ? '' : ' (hors magasin)'}`))}`);
}
await sleep(700);

/* 2. Matchs à venir ----------------------------------------------------- */
titre(`2. collectFixturesCsv : matchs « scheduled » du calendrier, ${JOURS} prochains jours`);
const aujourdhui = new Date().toISOString().slice(0, 10);
const fin = new Date(Date.now() + JOURS * 86_400_000).toISOString().slice(0, 10);
const calendrier = JSON.parse(fs.readFileSync(new URL('../data/runtime/season-calendar.json', import.meta.url), 'utf8'));
const club = (nom, league) => {
  try {
    return clubDuMagasin(nom, league, database) ?? null;
  } catch {
    return null;
  }
};
// Comme freeOdds.upcomingFixtures : identifiants des clubs par l'annuaire strict (noms FotMob).
const fixtures = calendrier
  .filter((e) => e.status === 'scheduled' && e.date >= aujourdhui && e.date <= fin && e.league && e.homeName && e.awayName)
  .map((e) => ({ league: e.league, date: e.date, homeName: e.homeName, awayName: e.awayName, homeId: club(e.homeName, e.league), awayId: club(e.awayName, e.league), kickoff: null }));
const couvertes = fixtures.filter((f) => fd.LIGUES.has(f.league));
console.log(`Calendrier : ${fixtures.length} matchs à venir du ${aujourdhui} au ${fin}, dont ${couvertes.length} dans les ${fd.LIGUES.size} compétitions couvertes.`);
let t0 = Date.now();
const avenir = await fd.collectFixturesCsv({ fixtures, database });
const dureeAvenir = Date.now() - t0;
const resumeAvenir = (r) =>
  `requêtes ${r.requests} | lignes couvertes ${r.rows} | événements ${r.events.length} | cotes ${r.quotes.length} | rattachées ${r.attached} | noms non résolus ${r.unresolved.length} | manques ${r.missing.length} | erreurs ${r.errors.length}`;
console.log(`${resumeAvenir(avenir)} | ${dureeAvenir} ms`);
if (avenir.errors.length) console.log('  erreurs :', avenir.errors.join(' ; '));
console.log('  cotes par kind :', enLigne(compter(avenir.quotes, (q) => q.kind)));
console.log('  cotes par bookmaker :', enLigne(compter(avenir.quotes, (q) => q.bookmaker)));
console.log('  cotes par marché :', enLigne(compter(avenir.quotes, (q) => `${q.market}${q.market === '1x2' ? '' : ` ${q.line}`}`)));
console.log('  événements par compétition :', enLigne(compter(avenir.events, (e) => e.league)));
console.log('  noms non résolus :', avenir.unresolved.map((u) => `${u.name} (${u.league})`).join(', ') || 'aucun');
console.log('  manques par raison :');
for (const [raison, n] of [...compter(avenir.missing, (m) => m.reason.replace(/ : .*/, ' : …'))].sort((a, b) => b[1] - a[1])) console.log(`    ${String(n).padStart(4)}  ${raison}`);
for (const m of avenir.missing.filter((x) => /non reconnu|différente|absent/.test(x.reason)).slice(0, 12)) console.log(`    ex. ${m.date} ${m.league} : ${m.homeName} - ${m.awayName} -> ${m.reason}`);

// Un match à venir de bout en bout : calendrier, ligne football-data, identifiants, cotes.
const evRattache = avenir.events.find((e) => e.homeId && e.awayId && couvertes.some((f) => f.homeId === e.homeId && f.awayId === e.awayId));
if (evRattache) {
  const f = couvertes.find((x) => x.homeId === evRattache.homeId && x.awayId === evRattache.awayId);
  const cotes = avenir.quotes.filter((q) => q.sourceEvent === evRattache.sourceEvent);
  console.log(`\n  Vérification d'un match À VENIR :`);
  console.log(`    calendrier CôteMaster : ${f.date} ${f.league} ${f.homeName} (${f.homeId}) - ${f.awayName} (${f.awayId})`);
  console.log(`    football-data         : ${evRattache.sourceEvent} ; jour UTC ${evRattache.date} ; coup d'envoi ${evRattache.kickoff} ; ${evRattache.homeName} (${evRattache.homeId}) - ${evRattache.awayName} (${evRattache.awayId})`);
  for (const b of ['Moyenne du marché', 'Bet365', 'Betfair Exchange']) {
    const c = cotes.filter((q) => q.bookmaker === b);
    if (c.length) console.log(`    ${b.padEnd(18)} ${c.map((q) => `${q.market}${q.market === '1x2' ? '' : `(${q.line})`} ${q.selection} ${q.price}`).join(' | ')}`);
  }
  console.log(`    kind ${[...new Set(cotes.map((q) => q.kind))].join(',')} ; relevé ${cotes[0]?.releveAt} ; provenance ${cotes[0]?.provenance}`);
} else console.log('\n  Aucun match à venir rattaché à vérifier (fixtures.csv ne couvre pas encore ces jours).');

/* 3. Noms appris par le vote -------------------------------------------- */
titre('3. Noms football-data appris par le vote (backfillQuotes, apply: false) puis gardés en mémoire seulement');
const liguesNonResolues = [...new Set(avenir.unresolved.map((u) => u.league))];
let requetesEtape3 = 0;
if (!liguesNonResolues.length) console.log('Aucun nom non résolu : rien à apprendre.');
else {
  const courante = fd.saisonCourante();
  const precedente = `${Number(courante.slice(0, 2)) - 1}${courante.slice(0, 2)}`;
  let appris = 0;
  for (const league of liguesNonResolues) {
    const code = fd.LIGUES.get(league);
    const saisons = fd.FD_SAISONNIERS[code] ? [precedente, courante] : null;
    const r = await fd.backfillQuotes({ league, saisons, budget: 2, apply: false, database });
    requetesEtape3 += r.requests;
    const voulus = new Set(avenir.unresolved.filter((u) => u.league === league).map((u) => u.name));
    const utiles = r.bilan.traductions.filter((t) => voulus.has(t.name));
    console.log(`${league} (${code}) : ${r.requests} requête(s), ${r.bilan.attached} rencontres rattachées par le vote, ${r.bilan.traductions.length} noms traduits dont ${utiles.length} non résolus plus haut : ${utiles.map((t) => `${t.name} -> ${t.teamId}`).join(', ') || 'aucun'}`);
    // ODDS_MATCHING_READONLY=1 : apprendreAlias ne garde l'alias qu'en mémoire (rien n'est écrit en base).
    for (const t of r.bilan.traductions) apprendreAlias(fd.SOURCE, t.name, t.league, t.teamId, 'vote', { database });
    appris += r.bilan.traductions.length;
  }
  const apres = await fd.collectFixturesCsv({ fixtures, database });
  requetesEtape3 += apres.requests;
  console.log(`Après ${appris} alias appris (en mémoire) : ${resumeAvenir(apres)}`);
  console.log(`  rattachées ${avenir.attached} -> ${apres.attached} ; noms non résolus ${avenir.unresolved.length} -> ${apres.unresolved.length} : ${apres.unresolved.map((u) => `${u.name} (${u.league})`).join(', ') || 'aucun'}`);
  console.log('  manques par raison :', enLigne(compter(apres.missing, (m) => m.reason.replace(/ : .*/, ' : …'))));
}

/* 4. Direct ------------------------------------------------------------- */
titre('4. collectLive (matchs du jour des compétitions couvertes)');
const duJour = couvertes.filter((f) => f.date === aujourdhui);
const live = await fd.collectLive({ fixtures: duJour, database });
console.log(`${duJour.length} matchs du jour passés : cotes ${live.quotes.length}, requêtes ${live.requests}, manques ${live.missing.length}${live.missing[0] ? ` (« ${live.missing[0].reason} »)` : ''}`);

/* 5. Rattrapage E0 2026-27, budget 2 ------------------------------------ */
titre('5. backfillQuotes({ codes: [E0], saisons: [2627], budget: 2 })');
t0 = Date.now();
const e0 = await fd.backfillQuotes({ codes: ['E0'], saisons: ['2627'], budget: 2, apply: false, database });
const resumeRattrapage = (r) =>
  `requêtes ${r.requests} | cotes ${r.quotes.length} | done ${r.done} | rattachées ${r.bilan.attached} | non rattachées ${r.bilan.unmatched} | score différent ${r.bilan.scoreMismatch} | sans cote ${r.bilan.sansCote} | noms non résolus ${r.bilan.unresolvedNames.join(', ') || 'aucun'}`;
console.log(`${resumeRattrapage(e0)} | ${Date.now() - t0} ms`);
console.log('  curseur :', e0.cursor);
console.log('  fichiers :', e0.bilan.fichiers.map((f) => `${f.fichier} ${f.statut} (${f.lignes ?? 0} lignes, ${f.rattachees ?? 0} rattachées, ${f.cotes ?? 0} cotes, dernier match ${f.derniereDate ?? '?'}, mis en ligne ${f.version ?? '?'})`).join(' ; '));
console.log('  cotes par kind :', enLigne(compter(e0.quotes, (q) => q.kind)));
console.log('  cotes par bookmaker :', enLigne(compter(e0.quotes, (q) => q.bookmaker)));
console.log('  cotes par marché :', enLigne(compter(e0.quotes, (q) => q.market)));
if (e0.errors.length) console.log('  erreurs :', e0.errors.join(' ; '));

const magasin = database.prepare(`SELECT match_key, date, league, home_name, away_name, home_id, away_id, home_goals, away_goals,
                                         CASE WHEN json_valid(meta) THEN json_extract(meta, '$.kickoff') END AS kickoff
                                  FROM matches WHERE match_key = ?`);
const exemple = e0.quotes.find((q) => q.homeName === 'Fulham' && q.awayName === 'Man United') ?? e0.quotes[0];
const m = exemple ? magasin.get(exemple.matchKey) : null;
if (exemple && m) {
  const cotes = e0.quotes.filter((q) => q.sourceEvent === exemple.sourceEvent);
  console.log(`\n  Vérification d'un match JOUÉ :`);
  console.log(`    magasin       : ${m.match_key} ; ${m.date} ; ${m.home_name} (${m.home_id}) ${m.home_goals}-${m.away_goals} ${m.away_name} (${m.away_id}) ; coup d'envoi FotMob ${m.kickoff}`);
  console.log(`    football-data : ${exemple.sourceEvent} ; jour UTC ${exemple.date} ; coup d'envoi ${exemple.kickoff} ; ${exemple.homeName} (${exemple.homeId}) - ${exemple.awayName} (${exemple.awayId})`);
  for (const b of ['Moyenne du marché', 'Betfair Exchange', 'Bet365']) {
    for (const kind of ['preclose', 'close']) {
      const c = cotes.filter((q) => q.bookmaker === b && q.kind === kind);
      if (c.length) console.log(`    ${b.padEnd(18)} ${kind.padEnd(8)} ${c.map((q) => `${q.market}${q.market === '1x2' ? '' : `(${q.line})`} ${q.selection} ${q.price}`).join(' | ')} ; relevé ${c[0].releveAt}`);
    }
  }
  console.log(`    ${cotes.length} cotes pour ce match ; provenance ${exemple.provenance}`);
}

/* 6. Rattrapage d'une compétition, comme l'orchestrateur ---------------- */
titre(`6. backfillQuotes({ league: ${LIGUE}, budget: ${BUDGET}, state: null }) puis reprise au curseur`);
t0 = Date.now();
const passe1 = await fd.backfillQuotes({ league: LIGUE, budget: BUDGET, state: null, apply: false, database });
console.log(`${resumeRattrapage(passe1)} | ${Date.now() - t0} ms`);
for (const f of passe1.bilan.fichiers) console.log(`  ${f.fichier.padEnd(8)} ${f.statut} ${f.lignes ?? 0} lignes (${f.gardees ?? 0} dans la période du magasin), ${f.rattachees ?? 0} rattachées, ${f.cotes ?? 0} cotes, dernier match ${f.derniereDate ?? '?'}, mis en ligne ${f.version ?? '?'}`);
console.log('  curseur :', passe1.cursor, '; à jour :', passe1.bilan.aJour);
const passe2 = await fd.backfillQuotes({ league: LIGUE, budget: BUDGET, state: { cursor: passe1.cursor }, apply: false, database });
console.log(`Reprise immédiate : requêtes ${passe2.requests}, cotes ${passe2.quotes.length}, done ${passe2.done} ; attente : ${passe2.bilan.attente}`);
const vieux = JSON.parse(passe1.cursor);
vieux.lu = new Date(Date.now() - 13 * 3_600_000).toISOString();
const passe3 = await fd.backfillQuotes({ league: LIGUE, budget: BUDGET, state: { cursor: JSON.stringify(vieux) }, apply: false, database });
console.log(`Reprise 13 h plus tard (simulée) : requêtes ${passe3.requests}, statut ${passe3.bilan.fichiers.map((f) => `${f.fichier} ${f.statut}`).join(', ')}, cotes ${passe3.quotes.length}, curseur ${passe3.cursor}`);
// Avec apply: true (orchestrateur), les noms votés sur les saisons passées sont appris AVANT la saison en
// cours, qui en profite. Ici : appris en mémoire seulement (ODDS_MATCHING_READONLY=1), puis saison en cours seule.
for (const t of passe1.bilan.traductions) apprendreAlias(fd.SOURCE, t.name, t.league, t.teamId, 'vote', { database });
const courante = await fd.backfillQuotes({ league: LIGUE, saisons: [fd.saisonCourante()], budget: 1, apply: false, database });
console.log(`Saison en cours seule, avec les ${passe1.bilan.traductions.length} noms des saisons passées (en mémoire) : requêtes ${courante.requests}, rattachées ${courante.bilan.attached}, non rattachées ${courante.bilan.unmatched}, noms non résolus ${courante.bilan.unresolvedNames.join(', ') || 'aucun'}, cotes ${courante.quotes.length}`);

/* 7. Fichier par pays et coups d'envoi ---------------------------------- */
titre(`7. backfillQuotes({ league: ${PAYS} }) et coups d'envoi comparés au magasin`);
t0 = Date.now();
const pays = await fd.backfillQuotes({ league: PAYS, budget: 2, state: null, apply: false, database });
console.log(`${resumeRattrapage(pays)} | ${Date.now() - t0} ms`);
console.log('  fichiers :', pays.bilan.fichiers.map((f) => `${f.fichier} ${f.statut} (${f.lignes ?? 0} lignes, ${f.gardees ?? 0} dans la période, dernier match ${f.derniereDate ?? '?'}, mis en ligne ${f.version ?? '?'})`).join(' ; '));
console.log('  cotes par kind / bookmaker / marché :', enLigne(compter(pays.quotes, (q) => `${q.kind} ${q.bookmaker} ${q.market}`)));
for (const [nom, r] of [[LIGUE, passe1], [PAYS, pays]]) {
  const parRencontre = new Map(r.quotes.map((q) => [q.matchKey, q]));
  let egaux = 0;
  let sansHeure = 0;
  const ecarts = [];
  for (const [cle, q] of parRencontre) {
    const m = magasin.get(cle);
    if (!m?.kickoff || !q.kickoff) {
      sansHeure++;
      continue;
    }
    if (Date.parse(m.kickoff) === Date.parse(q.kickoff)) egaux++;
    else ecarts.push(`${q.sourceEvent} : football-data ${q.kickoff} / FotMob ${m.kickoff} (jour ${q.date} / ${m.date})`);
  }
  const memeJour = [...parRencontre].filter(([cle, q]) => magasin.get(cle)?.date === q.date).length;
  console.log(`${nom} : ${parRencontre.size} rencontres rattachées ; coup d'envoi identique au magasin ${egaux}, différent ${ecarts.length}, heure absente ${sansHeure} ; jour UTC identique ${memeJour}/${parRencontre.size}`);
  for (const e of ecarts.slice(0, 5)) console.log(`    écart : ${e}`);
}

/* Bilan ----------------------------------------------------------------- */
titre('Bilan');
const apresSonde = comptes();
console.log('Lignes après la sonde :', JSON.stringify(apresSonde));
console.log('Base inchangée :', JSON.stringify(avant) === JSON.stringify(apresSonde));
const requetesModule = avenir.requests + requetesEtape3 + live.requests + e0.requests + passe1.requests + passe2.requests + passe3.requests + courante.requests + pays.requests;
console.log(`Requêtes HTTP : ${requetesSonde} de la sonde (en-têtes, étape 1) + ${requetesModule} du module ; durée totale ${Math.round((Date.now() - debutSonde) / 1000)} s`);
