/**
 * probe-espn-odds.mjs — ce que le fournisseur ESPN (espnOdds.js) collecte,
 * en LECTURE SEULE : aucune écriture en base, aucun alias appris en base.
 * -----------------------------------------------------------------------
 * Trois volets, chiffres réels :
 *   1. collectUpcoming sur les rencontres « scheduled » des N prochains
 *      jours du calendrier CôteMaster (data/runtime/season-calendar.json) ;
 *   2. collectLive maintenant, sur les rencontres du calendrier d'hier et
 *      d'aujourd'hui (seules celles qu'ESPN dit « en cours » rendent du
 *      direct ; les autres disent pourquoi) ;
 *   3. backfill de quelques compétitions avec un petit budget de requêtes,
 *      puis une seconde passe qui reprend au curseur rendu.
 *
 * Usage (depuis server/) — la base doit être une COPIE :
 *   MATCH_STATS_DB=<copie.db> ODDS_MATCHING_READONLY=1 node scripts/probe-espn-odds.mjs
 *   options : --jours 7  --budget 40  --ligues "Primera A - Colombia,EPL"
 *             --sans-avenir  --sans-direct  --sans-historique  --detail
 *
 * La base est ouverte en lecture seule (toute écriture lèverait une
 * erreur) et ODDS_MATCHING_READONLY=1 est imposé : sourceMatching garde
 * alors en mémoire ce qu'il apprend. Le vote du rattrapage tourne avec
 * apply: false.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Avant tout import du module : sourceMatching lit cette variable à chaque alias.
process.env.ODDS_MATCHING_READONLY = '1';

const { openDb, resolveDbPath } = await import('../src/data/db/matchStatsDb.js');
const espn = await import('../src/data/providers/espnOdds.js');

const ici = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (nom, defaut) => {
  const i = args.indexOf(`--${nom}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : defaut;
};
const drapeau = (nom) => args.includes(`--${nom}`);
const JOURS = Number(option('jours', 7));
const BUDGET = Number(option('budget', 40));
const LIGUES_HISTO = option('ligues', 'Primera A - Colombia,EPL,UEFA Champions League').split(',').map((s) => s.trim()).filter(Boolean);
const DETAIL = drapeau('detail');

const fichierBase = resolveDbPath();
const reelle = path.resolve(path.join(process.env.USERPROFILE ?? process.env.HOME ?? '', 'CoteMaster', 'match-stats.db'));
if (!process.env.MATCH_STATS_DB) {
  console.error('MATCH_STATS_DB doit désigner une COPIE de la base (jamais la base réelle).');
  process.exit(2);
}
if (path.resolve(fichierBase).toLowerCase() === reelle.toLowerCase()) {
  console.error('MATCH_STATS_DB désigne la base réelle : la sonde ne travaille que sur une copie.');
  process.exit(2);
}
const database = openDb({ file: fichierBase, readonly: true });

const compte = (sql, ...params) => {
  try {
    return database.prepare(sql).get(...params).n;
  } catch {
    return null;
  }
};
const etatBase = () => ({
  aliases: compte("SELECT COUNT(*) n FROM team_source_aliases WHERE source = 'espn'"),
  oddsEvents: compte('SELECT COUNT(*) n FROM odds_events'),
  oddsQuotes: compte('SELECT COUNT(*) n FROM odds_quotes')
});
const avant = etatBase();
const taille = () => {
  try {
    return fs.statSync(fichierBase).size;
  } catch {
    return null;
  }
};
const tailleAvant = taille();

const jourUtc = (t) => new Date(t).toISOString().slice(0, 10);
const plus = (jour, n) => jourUtc(Date.parse(`${jour}T00:00:00Z`) + n * 86_400_000);
const aujourdHui = jourUtc(Date.now());
const calendrier = JSON.parse(fs.readFileSync(path.join(ici, '..', 'data', 'runtime', 'season-calendar.json'), 'utf8'));

const titre = (t) => console.log(`\n=== ${t} ${'='.repeat(Math.max(0, 70 - t.length))}`);
const parCle = (liste, cle) => {
  const m = new Map();
  for (const x of liste) {
    const k = cle(x);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
};
const raisonCourte = (r) => r.replace(/ : .*$/, ' : …');

console.log(`Base (lecture seule) : ${fichierBase}`);
console.log(`Compétitions couvertes par ESPN : ${Object.keys(espn.LIGUES).length} ; bookmakers : ${espn.BOOKMAKERS.join(', ')}`);

// ---------------------------------------------------------------------------
if (!drapeau('sans-avenir')) {
  titre(`1. collectUpcoming — rencontres « scheduled » du ${aujourdHui} au ${plus(aujourdHui, JOURS)}`);
  const fixtures = calendrier
    .filter((e) => e.status === 'scheduled' && e.date >= aujourdHui && e.date <= plus(aujourdHui, JOURS) && e.league && e.homeName && e.awayName)
    .map((e) => ({ league: e.league, date: e.date, homeName: e.homeName, awayName: e.awayName, kickoff: null }));
  const couvertes = fixtures.filter((f) => espn.LIGUES[f.league]);
  console.log(`${fixtures.length} rencontres au calendrier, dont ${couvertes.length} dans une compétition couverte par ESPN.`);
  const t0 = Date.now();
  const r = await espn.collectUpcoming({ fixtures, database });
  const duree = ((Date.now() - t0) / 1000).toFixed(1);
  const evParLigue = parCle(r.events, (e) => e.league);
  const cotesParLigue = parCle(r.quotes, (q) => q.league);
  const evCotes = new Map();
  for (const q of r.quotes) {
    if (!evCotes.has(q.league)) evCotes.set(q.league, new Set());
    evCotes.get(q.league).add(q.sourceEvent);
  }
  const manquesParLigue = parCle(r.missing, (m) => m.league);
  const nrParLigue = parCle(r.unresolved, (u) => u.league);
  const fxParLigue = parCle(couvertes, (f) => f.league);
  console.log('compétition'.padEnd(34), 'calend.', 'trouvées', 'cotées', 'cotes', 'manques', 'noms non résolus');
  for (const [league, n] of [...fxParLigue.entries()].sort()) {
    console.log(league.padEnd(34), String(n).padStart(7), String(evParLigue.get(league) ?? 0).padStart(8), String(evCotes.get(league)?.size ?? 0).padStart(6), String(cotesParLigue.get(league) ?? 0).padStart(5), String(manquesParLigue.get(league) ?? 0).padStart(7), String(nrParLigue.get(league) ?? 0).padStart(5));
  }
  console.log(`TOTAL : ${couvertes.length} rencontres couvertes, ${r.events.length} trouvées chez ESPN (${r.events.filter((e) => e.rattachement === 'un seul identifiant').length} par un seul identifiant), ${new Set(r.quotes.map((q) => q.sourceEvent)).size} cotées, ${r.quotes.length} cotes, ${r.missing.length} manques, ${r.unresolved.length} noms non résolus, ${r.requests} requêtes, ${duree} s.`);
  console.log('Cotes par kind :', JSON.stringify(Object.fromEntries(parCle(r.quotes, (q) => q.kind))), '— par marché :', JSON.stringify(Object.fromEntries(parCle(r.quotes, (q) => q.market))), '— par bookmaker :', JSON.stringify(Object.fromEntries(parCle(r.quotes, (q) => q.bookmaker))));
  console.log('Raisons des manques :', JSON.stringify(Object.fromEntries(parCle(r.missing, (m) => raisonCourte(m.reason)))));
  if (r.unresolved.length) console.log('Noms ESPN non résolus :', r.unresolved.map((u) => `${u.name} (${u.league})`).join(' ; '));
  if (r.errors.length) console.log('Erreurs :', r.errors.join(' | '));
  if (DETAIL) for (const m of r.missing) console.log('  manque', m.league, m.date, m.homeName, '-', m.awayName, '→', m.reason);
  // Les appariements par un seul club, à relire : nom ESPN contre nom du calendrier.
  for (const e of r.events.filter((x) => x.rattachement === 'un seul identifiant')) {
    console.log(`  un seul identifiant : ESPN « ${e.homeName} - ${e.awayName} » ${e.kickoff} <-> calendrier « ${e.calendrier.homeName} - ${e.calendrier.awayName} » ${e.calendrier.date} (${e.league})`);
  }
  // Vérification de bout en bout : une rencontre du calendrier, son événement ESPN, ses cotes.
  const exemple = r.events.find((e) => e.league === 'EPL' && r.quotes.some((q) => q.sourceEvent === e.sourceEvent)) ?? r.events.find((e) => r.quotes.some((q) => q.sourceEvent === e.sourceEvent));
  if (exemple) {
    console.log(`\nExemple de bout en bout : calendrier « ${exemple.calendrier.homeName} - ${exemple.calendrier.awayName} » ${exemple.calendrier.date} (${exemple.league}) <-> ESPN ${exemple.sourceEvent} « ${exemple.homeName} - ${exemple.awayName} » ${exemple.kickoff} -> identifiants ${exemple.homeId} / ${exemple.awayId}`);
    const nomDb = (id) => database.prepare('SELECT name FROM teams WHERE team_id = ?').get(id)?.name ?? '?';
    console.log(`  annuaire : ${exemple.homeId} = ${nomDb(exemple.homeId)}, ${exemple.awayId} = ${nomDb(exemple.awayId)}`);
    for (const q of r.quotes.filter((x) => x.sourceEvent === exemple.sourceEvent)) console.log(`  ${q.kind.padEnd(8)} ${q.bookmaker} ${q.market} ${q.selection} ${q.line} -> ${q.price}   ${q.provenance}`);
  }
}

// ---------------------------------------------------------------------------
if (!drapeau('sans-direct')) {
  titre('2. collectLive — maintenant');
  const hier = plus(aujourdHui, -1);
  // Le calendrier ne connaît pas l'heure : on passe toutes les rencontres
  // non terminées d'hier et d'aujourd'hui ; ESPN dit lesquelles sont en cours.
  const fixtures = calendrier
    .filter((e) => (e.date === aujourdHui || e.date === hier) && e.status === 'scheduled' && e.league && e.homeName && e.awayName && espn.LIGUES[e.league])
    .map((e) => ({ league: e.league, date: e.date, homeName: e.homeName, awayName: e.awayName, kickoff: null }));
  const t0 = Date.now();
  const r = await espn.collectLive({ fixtures, database });
  const duree = ((Date.now() - t0) / 1000).toFixed(1);
  const enCours = r.events.filter((e) => e.etat === 'in');
  console.log(`${fixtures.length} rencontres du calendrier d'hier et d'aujourd'hui (compétitions couvertes) ; ${r.events.length} trouvées chez ESPN, dont ${enCours.length} en cours ; ${r.quotes.length} cotes live ; ${r.requests} requête(s) ; ${duree} s.`);
  console.log('États ESPN :', JSON.stringify(Object.fromEntries(parCle(r.events, (e) => e.etat))), '— raisons des manques :', JSON.stringify(Object.fromEntries(parCle(r.missing, (m) => raisonCourte(m.reason)))));
  for (const e of enCours) {
    const cotes = r.quotes.filter((q) => q.sourceEvent === e.sourceEvent);
    console.log(`  en cours : ${e.league} ${e.homeName} - ${e.awayName} (${e.sourceEvent}) : ${cotes.map((q) => `${q.market}/${q.selection}${q.line ? ' ' + q.line : ''}=${q.price}`).join(' ') || 'aucune cote'}`);
  }
  if (r.unresolved.length) console.log('Noms ESPN non résolus (matchs en cours) :', r.unresolved.map((u) => `${u.name} (${u.league})`).join(' ; '));
  if (r.errors.length) console.log('Erreurs :', r.errors.join(' | '));
}

// ---------------------------------------------------------------------------
if (!drapeau('sans-historique')) {
  titre(`3. backfill — budget ${BUDGET} requêtes, deux passes par compétition`);
  for (const league of LIGUES_HISTO) {
    const cotees = compte('SELECT COUNT(*) n FROM match_odds o JOIN matches m ON m.match_key = o.match_key WHERE m.league = ?', league);
    console.log(`\n— ${league} (slug ${espn.LIGUES[league] ?? 'aucun'} ; cotes déjà au profilage : ${cotees ?? '?'})`);
    let state = null;
    for (let passe = 1; passe <= 2; passe++) {
      const t0 = Date.now();
      const r = await espn.backfill({ league, database, budget: BUDGET, state, apply: false });
      const duree = ((Date.now() - t0) / 1000).toFixed(1);
      const b = r.bilan;
      console.log(`  passe ${passe} : ${r.requests} requêtes, ${duree} s, curseur ${state?.cursor ?? '(début)'} -> ${r.cursor}, terminé : ${r.done} ; jours bouclés ${b.joursTraites} (restent ${b.joursRestants}) ; rencontres ESPN des jours bouclés ${b.rencontresVues} ; rattachées et relevées ${b.attached} ; non rattachées ${b.unmatched} (dont clubs reconnus sans rencontre au même score : ${b.scoreMismatch}) ; sans cote ${b.sansCote} ; cotes ${r.quotes.length} ; « current » 2023 écartés ${b.douteuxEcartes}`);
      console.log(`    par kind ${JSON.stringify(Object.fromEntries(parCle(r.quotes, (q) => q.kind)))} ; par bookmaker ${JSON.stringify(Object.fromEntries(parCle(r.quotes, (q) => q.bookmaker)))} ; par marché ${JSON.stringify(Object.fromEntries(parCle(r.quotes, (q) => q.market)))}`);
      if (b.unresolvedNames.length) console.log(`    noms non résolus : ${b.unresolvedNames.join(', ')}`);
      if (b.fournisseursIgnores.length) console.log(`    fournisseurs ignorés : ${b.fournisseursIgnores.join(', ')}`);
      if (r.errors.length) console.log(`    erreurs : ${r.errors.join(' | ')}`);
      // Vérification de bout en bout : la rencontre du magasin, l'événement ESPN, la clôture 1x2.
      const q0 = r.quotes.find((q) => q.kind === 'close' && q.market === '1x2');
      if (q0) {
        const m = database.prepare('SELECT date, home_name, away_name, home_id, away_id, home_goals, away_goals FROM matches WHERE match_key = ?').get(q0.matchKey);
        const clot = r.quotes.filter((q) => q.sourceEvent === q0.sourceEvent && q.kind === 'close' && q.market === '1x2');
        console.log(`    exemple : magasin ${m?.date} ${m?.home_name} ${m?.home_goals}-${m?.away_goals} ${m?.away_name} (${m?.home_id}/${m?.away_id}) <- ESPN ${q0.sourceEvent} « ${q0.homeName} - ${q0.awayName} » ${q0.kickoff} (${q0.homeId}/${q0.awayId})`);
        console.log(`      clôtures 1x2 : ${[...new Set(clot.map((q) => q.bookmaker))].map((bk) => `${bk} ${['home', 'draw', 'away'].map((s) => clot.find((q) => q.bookmaker === bk && q.selection === s)?.price).join('/')}`).join(' ; ')}`);
        console.log(`      provenance : ${q0.provenance}`);
      }
      state = { cursor: r.cursor };
      if (r.done) break;
    }
  }
}

// ---------------------------------------------------------------------------
titre('Aucune écriture en base');
const apres = etatBase();
console.log(`avant : ${JSON.stringify(avant)} ; après : ${JSON.stringify(apres)} ; taille du fichier ${tailleAvant} -> ${taille()} octets ; identiques : ${JSON.stringify(avant) === JSON.stringify(apres) && tailleAvant === taille()}`);
