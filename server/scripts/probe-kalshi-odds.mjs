#!/usr/bin/env node
/**
 * probe-kalshi-odds.mjs — ce que le fournisseur Kalshi collecte, sans rien écrire.
 * -----------------------------------------------------------------------
 * Montre, chiffres réels à l'appui :
 *   1. la couverture : compétitions du magasin couvertes ou non par une
 *      série Kalshi ;
 *   2. collectUpcoming sur les matchs « scheduled » des prochains jours du
 *      calendrier CôteMaster (data/runtime/season-calendar.json), par
 *      compétition : événements vus, rattachés, noms non résolus, volume
 *      médian, et ce qui manque avec sa raison ; le sens domicile/extérieur
 *      vérifié sur des matchs du calendrier ;
 *   3. collectLive sur les matchs en cours de la liste du jour FotMob (comme
 *      la boucle oddsWatch) ;
 *   4. backfill sur une ou plusieurs compétitions avec un petit budget, puis
 *      une reprise au curseur rendu ; un match joué vérifié de bout en bout
 *      (score du magasin, issue Kalshi, ouverture et clôture).
 *
 * LECTURE SEULE : la base est ouverte en lecture seule et les alias que
 * sourceMatching apprend restent en mémoire (ODDS_MATCHING_READONLY=1) ; les
 * cotes ne sont jamais écrites (aucun upsertQuotes). Le script compte les
 * lignes des tables de cotes avant et après pour le prouver.
 *
 * Usage (dans server/) :
 *   MATCH_STATS_DB=<copie de la base> node scripts/probe-kalshi-odds.mjs
 *     [--jours=7] [--budget=40] [--ligues=EPL,Primera A - Colombia]
 *     [--sans-avant-match] [--sans-live] [--sans-rattrapage]
 * -----------------------------------------------------------------------
 */

process.env.ODDS_MATCHING_READONLY = '1';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, resolveDbPath } from '../src/data/db/matchStatsDb.js';
import { clubDuMagasin } from '../src/data/db/oddsProfileRead.js';
import { normaliserCote } from '../src/data/db/oddsQuotesRepository.js';
import { fetchMatchesByDate, FOTMOB_LEAGUES, leagueKeyMatches } from '../src/data/providers/fotMobProvider.js';
import { SOURCE, LIGUES, COUVERTURE, collectUpcoming, collectLive, backfill } from '../src/data/providers/kalshiOdds.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.length ? v.join('=') : true];
  })
);
const JOURS = Number(args.jours ?? 7);
const BUDGET = Number(args.budget ?? 40);
const LIGUES_RATTRAPAGE = String(args.ligues ?? 'EPL,Primera A - Colombia')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const JOUR_MS = 86_400_000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const secondes = (debut) => `${((Date.now() - debut) / 1000).toFixed(1)} s`;
const titre = (t) => console.log(`\n=== ${t} ${'='.repeat(Math.max(0, 74 - t.length))}`);
const mediane = (l) => {
  const t = l.filter(Number.isFinite).sort((a, b) => a - b);
  return t.length ? (t.length % 2 ? t[(t.length - 1) / 2] : (t[t.length / 2 - 1] + t[t.length / 2]) / 2) : null;
};
const compter = (liste, cle) => {
  const m = new Map();
  for (const x of liste) m.set(cle(x), (m.get(cle(x)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

/** Cotes conformes au dépôt (normaliserCote, sans écrire) et aux règles du contrat. */
function verifierCotes(cotes, { kinds }) {
  const defauts = [];
  for (const q of cotes) {
    const n = normaliserCote(q);
    if (!n) {
      defauts.push(`refusée par le dépôt : ${q.sourceEvent} ${q.selection} ${q.kind}`);
      continue;
    }
    if (!(n.price > 1)) defauts.push(`cote <= 1 : ${q.sourceEvent}`);
    if (!(n.prob > 0 && n.prob < 1)) defauts.push(`probabilité hors bornes : ${q.sourceEvent}`);
    if (!q.provenance) defauts.push(`sans provenance : ${q.sourceEvent}`);
    if (!kinds.includes(q.kind)) defauts.push(`kind inattendu ${q.kind} : ${q.sourceEvent}`);
    if (q.market !== '1x2' || q.line !== 0) defauts.push(`marché ${q.market}/${q.line} : ${q.sourceEvent}`);
    if (q.kind === 'snapshot' && q.kickoff && Date.parse(q.releveAt) >= Date.parse(q.kickoff)) defauts.push(`instantané relevé après le coup d'envoi : ${q.sourceEvent}`);
    if ((q.kind === 'open' || q.kind === 'close') && q.kickoff && Date.parse(q.releveAt) > Date.parse(q.kickoff)) defauts.push(`${q.kind} après le coup d'envoi : ${q.sourceEvent}`);
    if (q.kind === 'live' && q.kickoff && Date.parse(q.releveAt) < Date.parse(q.kickoff)) defauts.push(`direct relevé avant le coup d'envoi : ${q.sourceEvent}`);
    if (q.date !== q.kickoff?.slice(0, 10)) defauts.push(`jour UTC ≠ coup d'envoi : ${q.sourceEvent}`);
  }
  return defauts;
}

/** Les compteurs des tables que la sonde ne doit jamais toucher. */
function compteurs(database) {
  const n = (table) => {
    try {
      return database.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
    } catch {
      return 'absente';
    }
  };
  return { team_source_aliases: n('team_source_aliases'), odds_events: n('odds_events'), odds_quotes: n('odds_quotes'), odds_source_state: n('odds_source_state') };
}

/** Les cotes d'une liste, regroupées par rencontre : { q, sel: { home, draw, away } }. */
function parRencontre(cotes) {
  const m = new Map();
  for (const q of cotes) {
    const e = m.get(q.sourceEvent) ?? { q, sel: {} };
    e.sel[q.selection] = q;
    m.set(q.sourceEvent, e);
  }
  return m;
}

function sectionCouverture(database) {
  titre('1. Couverture');
  const duMagasin = database.prepare('SELECT DISTINCT league FROM matches ORDER BY league').all().map((r) => r.league);
  const couvertes = duMagasin.filter((l) => LIGUES[l]);
  console.log(`${duMagasin.length} compétitions au magasin ; ${couvertes.length} couvertes par ${COUVERTURE.nom} (${SOURCE}) ; marchés : ${COUVERTURE.marches.join(', ')}`);
  console.log(`Non couvertes (${duMagasin.length - couvertes.length}) : ${duMagasin.filter((l) => !LIGUES[l]).join(' · ')}`);
  const inconnues = Object.keys(LIGUES).filter((l) => !duMagasin.includes(l));
  if (inconnues.length) console.log(`ATTENTION, libellés de LIGUES absents du magasin : ${inconnues.join(', ')}`);
}

async function sectionAvantMatch(database) {
  titre(`2. collectUpcoming — calendrier, matchs « scheduled » des ${JOURS} prochains jours`);
  const aujourdHui = iso(Date.now());
  const fin = iso(Date.now() + JOURS * JOUR_MS);
  const calendrier = JSON.parse(fs.readFileSync(path.join(ICI, '..', 'data', 'runtime', 'season-calendar.json'), 'utf8'));
  const entrees = (Array.isArray(calendrier) ? calendrier : calendrier.matches ?? []).filter(
    (e) => e.status === 'scheduled' && e.homeGoals == null && e.date >= aujourdHui && e.date <= fin && e.league && e.homeName && e.awayName
  );
  // Identifiants FotMob des clubs du calendrier par l'annuaire strict, comme freeOdds.upcomingFixtures.
  const cache = new Map();
  const club = (nom, league) => {
    const cle = `${league}|${nom}`;
    if (!cache.has(cle)) {
      let id = null;
      try {
        id = clubDuMagasin(nom, league, database);
      } catch {
        id = null;
      }
      cache.set(cle, id);
    }
    return cache.get(cle);
  };
  const fixtures = entrees.map((e) => ({ league: e.league, date: e.date, homeName: e.homeName, awayName: e.awayName, homeId: club(e.homeName, e.league), awayId: club(e.awayName, e.league), kickoff: null }));
  const couvertes = fixtures.filter((f) => LIGUES[f.league]);
  console.log(`${fixtures.length} matchs au calendrier du ${aujourdHui} au ${fin}, dont ${couvertes.length} dans ${new Set(couvertes.map((f) => f.league)).size} compétitions couvertes`);

  const debut = Date.now();
  const av = await collectUpcoming({ fixtures, database });
  const duree = secondes(debut);
  console.log(`\n${'compétition'.padEnd(32)} fixtures événements rattachés (par l'adversaire) cotes non-résolus manques volume-médian`);
  for (const [league, s] of Object.entries(av.parLigue ?? {})) {
    const vol = s.volumeMedian === null || s.volumeMedian === undefined ? '—' : Math.round(s.volumeMedian);
    console.log(
      `${league.slice(0, 31).padEnd(32)} ${String(s.fixtures).padStart(8)} ${String(s.evenements).padStart(10)} ${String(s.rattaches).padStart(9)} ${`(${s.parAdversaire})`.padStart(18)} ${String(s.cotes).padStart(5)} ${String(s.nonResolus).padStart(12)} ${String(s.manques).padStart(7)} ${String(vol).padStart(13)}`
    );
  }
  const rattaches = Object.values(av.parLigue ?? {}).reduce((n, s) => n + s.rattaches, 0);
  console.log(
    `\nTOTAL : ${av.events.length} événements Kalshi vus (dont ${av.events.filter((e) => e.started).length} commencés), ${av.quotes.length} cotes « snapshot », ` +
      `${rattaches} fixtures cotées sur ${couvertes.length}, ${av.missing.length} manques, ${av.unresolved.length} noms non résolus, ` +
      `${av.requests} requêtes, ${duree}, ${av.errors.length} erreurs`
  );
  console.log(`Origine du coup d'envoi : ${compter(av.events, (e) => e.kickoffSource).map(([k, n]) => `${k} ${n}`).join(', ') || '—'}`);
  console.log('Manques par raison :');
  for (const [raison, n] of compter(av.missing, (m) => m.reason.replace(/ \(noms non reconnus.*$/, ' (…)').replace(/ : .*$/, ' : …'))) console.log(`  ${String(n).padStart(4)}  ${raison}`);
  console.log(`Noms non résolus (${av.unresolved.length}) : ${av.unresolved.map((u) => `${u.name} [${u.league}]${u.suspect ? ` (annuaire : ${u.suspect}, hors compétition)` : ''}`).join(' · ')}`);
  if (av.errors.length) console.log(`Erreurs : ${av.errors.slice(0, 12).join(' | ')}`);
  const defauts = verifierCotes(av.quotes, { kinds: ['snapshot'] });
  console.log(`Contrôle des cotes : ${defauts.length ? defauts.slice(0, 10).join(' | ') : 'toutes conformes (normaliserCote, cote > 1, provenance, jamais après le coup d’envoi, jour UTC du coup d’envoi)'}`);

  console.log('\nSens domicile/extérieur (calendrier FotMob -> cotes Kalshi rendues) :');
  const rencontres = [...parRencontre(av.quotes).values()];
  let montres = 0;
  for (const f of couvertes) {
    if (montres >= 6) break;
    if (!['EPL', 'Ligue 1 - France', 'La Liga - Spain', 'Primera A - Colombia', 'Liga MX', 'MLS'].includes(f.league)) continue;
    const e = rencontres.find((x) => x.q.league === f.league && x.q.homeId === f.homeId && x.q.awayId === f.awayId && Math.abs(Date.parse(x.q.date) - Date.parse(f.date)) <= JOUR_MS);
    if (!e) continue;
    montres++;
    const s = e.sel;
    const somme = ['home', 'draw', 'away'].reduce((t, k) => t + (s[k]?.prob ?? 0), 0);
    console.log(
      `  [${f.league}] calendrier ${f.date} ${f.homeName} (${f.homeId}) - ${f.awayName} (${f.awayId}) | Kalshi ${e.q.sourceEvent} « ${e.q.homeName} - ${e.q.awayName} » coup d'envoi ${e.q.kickoff}` +
        ` | 1 ${s.home?.prob ?? '—'} (${s.home?.price ?? '—'}, vol ${s.home?.volume ?? '—'}) N ${s.draw?.prob ?? '—'} 2 ${s.away?.prob ?? '—'} (${s.away?.price ?? '—'}) | somme ${somme.toFixed(3)}`
    );
  }
  const parAdversaire = av.events.filter((e) => e.fixture?.parAdversaire);
  if (parAdversaire.length) console.log(`Appariés par l'adversaire au calendrier (${parAdversaire.length}) : ${parAdversaire.map((e) => `« ${e.homeName} - ${e.awayName} » = ${e.fixture.homeName} - ${e.fixture.awayName}`).join(' · ')}`);
}

async function sectionDirect(database) {
  titre('3. collectLive — matchs en cours (liste du jour FotMob, comme oddsWatch)');
  const maintenant = Date.now();
  const jours = [iso(maintenant)];
  if (new Date(maintenant).getUTCHours() < 6) jours.unshift(iso(maintenant - JOUR_MS));
  const libelles = Object.entries(FOTMOB_LEAGUES);
  const libelleDe = (cle) => libelles.find(([, matcher]) => leagueKeyMatches(matcher, cle))?.[0] ?? null;
  let liste = [];
  try {
    liste = (await Promise.all(jours.map((j) => fetchMatchesByDate(j)))).flat();
  } catch (error) {
    console.log(`Liste du jour FotMob indisponible : ${error.message}`);
  }
  const duJour = liste
    .map((m) => ({ league: libelleDe(m.leagueKey), date: m.kickoff ? iso(m.kickoff) : m.date, kickoff: m.kickoff, homeName: m.homeName, awayName: m.awayName, homeId: m.homeId, awayId: m.awayId, started: m.started, finished: m.finished || m.played || m.cancelled }))
    .filter((f) => f.league && f.kickoff && f.homeName && f.awayName);
  // Les critères de la boucle oddsWatch : commencé depuis moins de 2 h 30, pas terminé.
  const enCours = duJour.filter((f) => {
    const depuis = (maintenant - Date.parse(f.kickoff)) / 60_000;
    return !f.finished && depuis >= 0 && depuis <= 150 && (f.started || depuis >= 10);
  });
  console.log(`${duJour.length} matchs suivis aujourd'hui (FotMob), ${enCours.length} en cours, dont ${enCours.filter((f) => LIGUES[f.league]).length} dans une compétition couverte par Kalshi`);
  const debut = Date.now();
  const r = await collectLive({ fixtures: enCours, database });
  console.log(`collectLive : ${r.quotes.length} cotes « live », ${r.missing.length} manques, ${r.requests} requêtes, ${secondes(debut)}, ${r.errors.length} erreurs`);
  for (const { q, sel } of parRencontre(r.quotes).values()) {
    console.log(
      `  [${q.league}] ${q.homeName} - ${q.awayName} (${q.sourceEvent}, coup d'envoi ${q.kickoff}, relevé ${q.releveAt}) : ` +
        `1 ${sel.home?.prob ?? '—'} · N ${sel.draw?.prob ?? '—'} · 2 ${sel.away?.prob ?? '—'} ; volume ${sel.home?.volume ?? '—'} / ${sel.draw?.volume ?? '—'} / ${sel.away?.volume ?? '—'}`
    );
  }
  for (const m of r.missing) console.log(`  manque [${m.league}] ${m.homeName} - ${m.awayName} : ${m.reason}`);
  const defauts = verifierCotes(r.quotes, { kinds: ['live'] });
  if (defauts.length) console.log(`Contrôle : ${defauts.slice(0, 8).join(' | ')}`);
}

async function sectionRattrapage(database) {
  const rattrapages = [];
  for (const league of LIGUES_RATTRAPAGE) {
    titre(`4. backfill — ${league} (budget ${BUDGET} requêtes)`);
    const debut = Date.now();
    const r = await backfill({ league, database, budget: BUDGET, state: null });
    const b = r.bilan;
    rattrapages.push({ league, r });
    console.log(`${r.requests} requêtes, ${secondes(debut)}, ${r.quotes.length} cotes (${compter(r.quotes, (q) => q.kind).map(([k, n]) => `${k} ${n}`).join(', ') || 'aucune'}), done=${r.done}, phase ${b.phase}`);
    console.log(
      `Bilan : ${b.events} rencontres réglées lues, ${b.attached} rattachées, ${b.unmatched} non rattachées, ${b.sansCote} sans cote, ` +
        `${b.resultatDifferent} issue différente du magasin, ${b.sansResultat} réglées sans issue, ${b.inverses} inversées, ${b.illisibles.length} illisibles`
    );
    console.log(`Noms non résolus : ${b.unresolvedNames.join(' · ') || 'aucun'}`);
    console.log(`Alias appris (vote par l'issue) : ${b.appris.map((a) => `${a.noms.join('/')} -> ${a.id} (${a.preuve})`).join(' · ') || 'aucun'}`);
    console.log(`Occurrence − coup d'envoi du magasin : ${Object.entries(b.ecartsCoupEnvoi).map(([k, n]) => `${k} ×${n}`).join(', ') || '—'}`);
    if (b.illisibles.length) console.log(`Illisibles : ${b.illisibles.slice(0, 5).join(' | ')}`);
    if (b.errors.length) console.log(`Erreurs : ${b.errors.slice(0, 5).join(' | ')}`);
    for (const ex of b.exemples) {
      console.log(`Exemple de bout en bout : ${ex.sourceEvent} « ${ex.kalshi} » issue Kalshi ${ex.issueKalshi} ; magasin ${ex.matchKey} : ${ex.magasin}, issue 90' ${ex.res90}`);
      for (const c of ex.cotes) console.log(`    ${c}`);
    }
    const defauts = verifierCotes(r.quotes, { kinds: ['open', 'close'] });
    console.log(`Contrôle des cotes : ${defauts.length ? defauts.slice(0, 8).join(' | ') : 'toutes conformes (open/close, jamais après le coup d’envoi, cote > 1, provenance)'}`);
    const vol = r.quotes.filter((q) => q.kind === 'close').map((q) => q.volume);
    if (vol.length) console.log(`Volume à la clôture (contrats échangés avant le coup d'envoi), par sélection : médiane ${Math.round(mediane(vol))}, max ${Math.round(Math.max(...vol))}`);
    console.log(`Curseur rendu : ${r.cursor ?? '(fini)'}`);
  }
  // Reprise : la tranche suivante repart du curseur, sans retraiter ce qui est fait.
  const premier = rattrapages[0];
  if (premier?.r.cursor) {
    titre(`4 bis. backfill — reprise au curseur (${premier.league}, budget 12)`);
    const r2 = await backfill({ league: premier.league, database, budget: 12, state: { cursor: premier.r.cursor } });
    const deja = new Set(premier.r.quotes.map((q) => q.sourceEvent));
    const nouveaux = [...new Set(r2.quotes.map((q) => q.sourceEvent))];
    console.log(`${r2.requests} requêtes, ${r2.quotes.length} cotes, ${nouveaux.length} rencontres dont ${nouveaux.filter((e) => deja.has(e)).length} déjà rendues à la tranche précédente ; curseur ${r2.cursor ?? '(fini)'}`);
  }
}

const fichier = process.env.MATCH_STATS_DB ?? resolveDbPath();
const database = openDb({ file: fichier, readonly: true });
const avant = compteurs(database);
const debutSonde = Date.now();
console.log(`Sonde Kalshi — ${new Date().toISOString()} — base ${fichier} (lecture seule), alias en mémoire seulement`);

sectionCouverture(database);
if (!args['sans-avant-match']) await sectionAvantMatch(database);
if (!args['sans-live']) await sectionDirect(database);
if (!args['sans-rattrapage']) await sectionRattrapage(database);

titre('Aucune écriture');
const apres = compteurs(database);
console.log(`Tables de cotes avant ${JSON.stringify(avant)} / après ${JSON.stringify(apres)} : ${JSON.stringify(avant) === JSON.stringify(apres) ? 'inchangées' : 'MODIFIÉES ?!'}`);
console.log(`Durée totale ${secondes(debutSonde)}`);
