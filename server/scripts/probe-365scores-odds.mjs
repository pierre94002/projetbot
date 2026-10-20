#!/usr/bin/env node
/**
 * probe-365scores-odds.mjs — ce que le fournisseur 365Scores collecte, EN LECTURE SEULE.
 * -----------------------------------------------------------------------
 * Montre, avec les vraies données du jour :
 *   1. collectUpcoming sur les rencontres « scheduled » des N prochains jours
 *      du calendrier CôteMaster (data/runtime/season-calendar.json) ;
 *   2. collectLive maintenant, sur les rencontres d'aujourd'hui et d'hier
 *      que le calendrier ne dit pas terminées (seules celles en cours chez
 *      365Scores ressortent cotées ; le calendrier n'a pas l'heure) ;
 *   3. backfill sur un petit budget (des journées passées, toutes
 *      compétitions, en remontant).
 * Puis vérifie de bout en bout un match à venir (calendrier <-> 365Scores,
 * sens domicile/extérieur compris) et un match joué (magasin : jour, clubs,
 * score <-> 365Scores).
 *
 * Rien n'est écrit : base ouverte en LECTURE SEULE, aucun upsertQuotes,
 * ODDS_MATCHING_READONLY=1 (les alias appris restent en mémoire), vote sans
 * `apply`. Les compteurs des tables de cotes sont affichés avant et après.
 *
 * Usage (depuis server/) :
 *   MATCH_STATS_DB=<copie de la base> ODDS_MATCHING_READONLY=1 \
 *     node scripts/probe-365scores-odds.mjs [--jours 7] [--budget 10]
 *       [--curseur AAAA-MM-JJ] [--ligue "EPL"]
 *       [--sans-avant-match] [--sans-direct] [--sans-rattrapage]
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// Avant tout appel : sourceMatching lit cette variable à chaque alias appris.
if (process.env.ODDS_MATCHING_READONLY !== '1') {
  console.warn('ODDS_MATCHING_READONLY n’était pas à 1 : forcé pour cette sonde (aucun alias écrit).');
  process.env.ODDS_MATCHING_READONLY = '1';
}

const { openDb } = await import('../src/data/db/matchStatsDb.js');
const { clubDuMagasin } = await import('../src/data/db/oddsProfileRead.js');
const fournisseur = await import('../src/data/providers/scores365Odds.js');
const { SOURCE, LIGUES, COUVERTURE, collectUpcoming, collectLive, backfill } = fournisseur;

// ---------------------------------------------------------------- options
const args = process.argv.slice(2);
const option = (nom, defaut) => {
  const i = args.indexOf(`--${nom}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : defaut;
};
const drapeau = (nom) => args.includes(`--${nom}`);
const JOURS = Number(option('jours', 7));
const BUDGET = Number(option('budget', 10));
const CURSEUR = option('curseur', null);
const LIGUE = option('ligue', null);

if (!process.env.MATCH_STATS_DB) console.warn('MATCH_STATS_DB absent : base réelle, ouverte en LECTURE SEULE.');
// Première ouverture du processus, en lecture seule : openDb garde cette
// connexion par chemin, tous les modules la réutilisent.
const database = openDb({ readonly: true });

const jourIso = (t) => new Date(t).toISOString().slice(0, 10);
const decaler = (iso, n) => jourIso(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000);
const ecartJours = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
const duree = (t0) => `${((Date.now() - t0) / 1000).toFixed(1)} s`;
const titre = (t) => console.log(`\n=== ${t} ${'='.repeat(Math.max(0, 70 - t.length))}`);
const histogramme = (liste, cle) => {
  const h = new Map();
  for (const x of liste) {
    const k = cle(x);
    h.set(k, (h.get(k) ?? 0) + 1);
  }
  return [...h.entries()].sort((a, b) => b[1] - a[1]);
};
/** Une raison sans son détail variable (« nom d'équipe non reconnu : X » -> « nom d'équipe non reconnu »). */
const famille = (raison) => String(raison).replace(/ : [^)]*/, '');

function compteurs() {
  const n = (table) => {
    try {
      return database.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
    } catch {
      return 'absente';
    }
  };
  return { odds_events: n('odds_events'), odds_quotes: n('odds_quotes'), team_source_aliases: n('team_source_aliases'), odds_source_state: n('odds_source_state') };
}

// ---------------------------------------------------------------- calendrier
const cheminCalendrier = fileURLToPath(new URL('../data/runtime/season-calendar.json', import.meta.url));
const calendrier = JSON.parse(fs.readFileSync(cheminCalendrier, 'utf8'));
const entrees = Array.isArray(calendrier) ? calendrier : (calendrier.entries ?? calendrier.matches ?? []);
const aujourdhui = jourIso(Date.now());
const idClub = new Map();
const club = (nom, league) => {
  const cle = `${league}|${nom}`;
  if (!idClub.has(cle)) {
    let id = null;
    try {
      id = clubDuMagasin(nom, league, database);
    } catch {
      id = null;
    }
    idClub.set(cle, id);
  }
  return idClub.get(cle);
};
// Comme freeOdds.upcomingFixtures : identifiants des clubs par l'annuaire strict.
const versRencontre = (e) => ({ league: e.league, date: e.date, homeName: e.homeName, awayName: e.awayName, homeId: club(e.homeName, e.league), awayId: club(e.awayName, e.league), kickoff: null });

console.log(`Sonde ${SOURCE} — ${new Date().toISOString()} — base : ${process.env.MATCH_STATS_DB ?? '(réelle)'}`);
console.log(`Couverture déclarée : ${Object.keys(LIGUES).length} compétitions, marchés ${COUVERTURE.marches.join(', ')}, historique ${COUVERTURE.historique}`);
const avant = compteurs();
console.log('Tables de cotes AVANT :', JSON.stringify(avant));

// ---------------------------------------------------------------- 1. à venir
let t0 = Date.now();
if (!drapeau('sans-avant-match')) {
  titre(`1. collectUpcoming — rencontres « scheduled » du ${aujourdhui} au ${decaler(aujourdhui, JOURS)}`);
  const aVenir = entrees
    .filter((e) => e.status === 'scheduled' && e.date >= aujourdhui && e.date <= decaler(aujourdhui, JOURS) && e.league && e.homeName && e.awayName)
    .map(versRencontre);
  const couvertes = aVenir.filter((f) => LIGUES[f.league]);
  console.log(`Calendrier : ${aVenir.length} rencontres, dont ${couvertes.length} dans une compétition couverte par 365Scores.`);
  t0 = Date.now();
  const up = await collectUpcoming({ fixtures: aVenir, database, log: (x) => console.log('  [log]', JSON.stringify(x)) });
  const dureeUp = duree(t0);
  const parKind = histogramme(up.quotes, (q) => q.kind);
  console.log(`Requêtes : ${up.requests} — durée : ${dureeUp}`);
  console.log(`Matchs à venir vus chez 365Scores (compétitions suivies) : ${up.events.length} ; avec deux identifiants FotMob : ${up.events.filter((e) => e.homeId && e.awayId).length}`);
  console.log(`Cotes rendues : ${up.quotes.length} (${parKind.map(([k, n]) => `${k} ${n}`).join(', ')}) ; matchs cotés : ${new Set(up.quotes.map((q) => q.sourceEvent)).size}`);
  console.log(`Rencontres du calendrier cotées : ${couvertes.length - up.missing.length} / ${couvertes.length} ; manquantes : ${up.missing.length}`);
  for (const [raison, n] of histogramme(up.missing, (m) => famille(m.reason)).slice(0, 12)) console.log(`   ${String(n).padStart(4)} × ${raison}`);
  console.log(`Noms non résolus : ${up.unresolved.length}${up.unresolved.length ? ` — ${up.unresolved.slice(0, 25).map((u) => `${u.name} (${u.league})`).join(' ; ')}` : ''}`);
  if (up.errors.length) console.log('Erreurs :', up.errors.slice(0, 5));

  // Par compétition : rencontres, cotées, manquantes.
  const manquantesParLigue = new Map(histogramme(up.missing, (m) => m.league));
  const parLigue = histogramme(couvertes, (f) => f.league);
  console.log('Par compétition (rencontres / cotées) :');
  console.log(
    '   ' +
      parLigue
        .map(([l, n]) => `${l} ${n - (manquantesParLigue.get(l) ?? 0)}/${n}`)
        .join(' | ')
  );

  // Écart de jour entre le calendrier (FotMob) et 365Scores (UTC), sur les rencontres retrouvées.
  const evParIds = new Map(up.events.filter((e) => e.homeId && e.awayId).map((e) => [`${e.league}|${e.homeId}|${e.awayId}`, e]));
  const ecarts = [];
  for (const f of couvertes) {
    const e = f.homeId && f.awayId ? evParIds.get(`${f.league}|${f.homeId}|${f.awayId}`) : null;
    if (e) ecarts.push(ecartJours(e.date, f.date));
  }
  console.log(`Jour 365Scores (UTC) - jour du calendrier, rencontres retrouvées : ${histogramme(ecarts, (x) => x).map(([k, n]) => `${k >= 0 ? '+' : ''}${k} j : ${n}`).join(', ')}`);

  // Vérification de bout en bout d'un match à venir.
  const prioritaires = ['EPL', 'Ligue 1 - France', 'La Liga - Spain', 'Serie A - Italy', 'Bundesliga - Germany'];
  const cotees = couvertes.filter((f) => f.homeId && f.awayId && evParIds.has(`${f.league}|${f.homeId}|${f.awayId}`) && up.quotes.some((q) => q.homeId === f.homeId && q.awayId === f.awayId));
  const temoin = cotees.find((f) => prioritaires.includes(f.league)) ?? cotees[0];
  if (temoin) {
    const e = evParIds.get(`${temoin.league}|${temoin.homeId}|${temoin.awayId}`);
    const sesCotes = up.quotes.filter((q) => q.sourceEvent === e.sourceEvent);
    console.log('Vérification — match à venir :');
    console.log(`   calendrier : ${temoin.date} ${temoin.league} — ${temoin.homeName} (${temoin.homeId}) - ${temoin.awayName} (${temoin.awayId})`);
    console.log(`   365Scores  : match ${e.sourceEvent}, coup d'envoi ${e.kickoff} — ${e.homeName} (${e.homeId}) - ${e.awayName} (${e.awayId})`);
    console.log(`   sens domicile/extérieur : ${temoin.homeId === e.homeId && temoin.awayId === e.awayId ? 'identique' : 'DIFFÉRENT'}`);
    for (const kind of ['open', 'snapshot']) {
      const t = Object.fromEntries(sesCotes.filter((q) => q.kind === kind).map((q) => [q.selection, q.price]));
      console.log(`   ${kind.padEnd(8)} : 1 ${t.home} | N ${t.draw} | 2 ${t.away}`);
    }
    console.log(`   provenance : ${sesCotes[0]?.provenance}`);
  } else console.log('Vérification — aucun match à venir coté à montrer.');
}

// ---------------------------------------------------------------- 2. direct
if (!drapeau('sans-direct')) {
  titre('2. collectLive — maintenant');
  const hier = decaler(aujourdhui, -1);
  const enCours = entrees
    .filter((e) => (e.date === aujourdhui || e.date === hier) && e.status !== 'finished' && e.status !== 'postponed' && e.homeGoals == null && e.league && e.homeName && e.awayName)
    .map(versRencontre);
  t0 = Date.now();
  const live = await collectLive({ fixtures: enCours, database });
  console.log(`Rencontres du calendrier d'hier et d'aujourd'hui non terminées : ${enCours.length} (couvertes : ${enCours.filter((f) => LIGUES[f.league]).length})`);
  console.log(`Requêtes : ${live.requests} — durée : ${duree(t0)}`);
  console.log(`Matchs en cours retrouvés et cotés : ${live.events.length} ; cotes « live » : ${live.quotes.length}`);
  for (const [raison, n] of histogramme(live.missing, (m) => famille(m.reason)).slice(0, 8)) console.log(`   ${String(n).padStart(4)} × ${raison}`);
  console.log(`Noms non résolus (matchs en cours) : ${live.unresolved.length}${live.unresolved.length ? ` — ${live.unresolved.slice(0, 10).map((u) => `${u.name} (${u.league})`).join(' ; ')}` : ''}`);
  for (const e of live.events.slice(0, 5)) {
    const t = Object.fromEntries(live.quotes.filter((q) => q.sourceEvent === e.sourceEvent).map((q) => [q.selection, q.price]));
    console.log(`   ${e.league} — ${e.homeName} - ${e.awayName} : 1 ${t.home} | N ${t.draw} | 2 ${t.away}`);
  }
  if (live.errors.length) console.log('Erreurs :', live.errors.slice(0, 5));
}

// ---------------------------------------------------------------- 3. rattrapage
if (!drapeau('sans-rattrapage')) {
  titre(`3. backfill — budget ${BUDGET} requêtes${CURSEUR ? `, depuis le ${CURSEUR}` : ''}${LIGUE ? `, compétition ${LIGUE}` : ', toutes compétitions'}`);
  t0 = Date.now();
  const rb = await backfill({ league: LIGUE, database, budget: BUDGET, state: CURSEUR ? { cursor: CURSEUR } : null, apply: false });
  const b = rb.bilan;
  console.log(`Requêtes : ${rb.requests} — durée : ${duree(t0)} — jours lus : ${b.joursLus.length} (${b.joursLus.at(-1) ?? '-'} → ${b.joursLus[0] ?? '-'}) ; en échec : ${b.joursEnEchec.join(', ') || 'aucun'} ; coupés, matin relu : ${b.joursCoupes.join(', ') || 'aucun'}`);
  console.log(`Matchs terminés des compétitions suivies : ${b.rows} ; rattachés au magasin : ${b.attached} ; non rattachés : ${b.unmatched} ; score différent : ${b.scoreMismatch} ; rattachés sans cote : ${b.sansCote}`);
  console.log(`Cotes rendues : ${rb.quotes.length} (${histogramme(rb.quotes, (q) => q.kind).map(([k, n]) => `${k} ${n}`).join(', ')}) ; toutes avec matchKey : ${rb.quotes.every((q) => q.matchKey && q.homeId && q.awayId)}`);
  console.log(`Curseur rendu : ${rb.cursor} ; fini : ${rb.done}`);
  console.log(`Noms non résolus : ${b.unresolvedNames.length}${b.unresolvedNames.length ? ` — ${b.unresolvedNames.slice(0, 30).join(' ; ')}` : ''}`);
  if (rb.errors.length) console.log('Erreurs :', rb.errors.slice(0, 5));
  const lignes = Object.entries(b.parLigue).sort((x, y) => y[1].rows - x[1].rows);
  console.log('Par compétition (terminés / rattachés / sans cote) :');
  console.log('   ' + lignes.map(([l, s]) => `${l} ${s.rows}/${s.attached}/${s.sansCote}`).join(' | '));

  // Vérification de bout en bout d'un match joué.
  const ex = b.exemples.EPL ?? b.exemples['Ligue 1 - France'] ?? Object.values(b.exemples)[0];
  if (ex) {
    const m = database.prepare('SELECT league, date, home_name, away_name, home_id, away_id, home_goals, away_goals FROM matches WHERE match_key = ?').get(ex.matchKey);
    console.log('Vérification — match joué :');
    console.log(`   365Scores : match ${ex.sourceEvent}, ${ex.date} — ${ex.homeName} ${ex.score} ${ex.awayName} ; ouverture Bet365 1 ${ex.ouverture.home} | N ${ex.ouverture.draw} | 2 ${ex.ouverture.away}`);
    console.log(`   magasin   : ${m?.date} ${m?.league} — ${m?.home_name} ${m?.home_goals}-${m?.away_goals} ${m?.away_name} (${m?.home_id} / ${m?.away_id})`);
    console.log(`   score identique : ${m && `${m.home_goals}-${m.away_goals}` === ex.score} ; écart de jour : ${m ? ecartJours(ex.date, m.date) : '?'}`);
  } else console.log('Vérification — aucun match joué rattaché à montrer (budget trop petit ?).');
}

const apres = compteurs();
titre('Écritures');
console.log('Tables de cotes APRÈS :', JSON.stringify(apres));
console.log(JSON.stringify(avant) === JSON.stringify(apres) ? 'Aucune écriture en base.' : 'ATTENTION : les compteurs ont changé.');
