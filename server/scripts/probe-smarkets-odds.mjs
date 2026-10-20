#!/usr/bin/env node
/**
 * probe-smarkets-odds.mjs — ce que le fournisseur Smarkets collecte, en LECTURE SEULE.
 * -----------------------------------------------------------------------
 * Montre, sur les vraies rencontres du calendrier CôteMaster :
 *   1. collectUpcoming : les matchs « scheduled » des 7 prochains jours
 *      (data/runtime/season-calendar.json) — rencontres Smarkets vues,
 *      rattachées, prix rendus, noms non résolus, raisons des manques,
 *      volume médian par marché, requêtes et durée ;
 *   2. un exemple d'unités, recalculé à la main sur le carnet brut d'un 1x2 ;
 *   3. collectLive : les matchs en cours MAINTENANT (liste du jour FotMob,
 *      coup d'envoi passé depuis moins de 3 h) ;
 *   4. backfill : ce que rend le rattrapage (Smarkets n'a pas d'historique).
 *
 * Options : --noeuds (revérifie les nœuds de compétition Smarkets : slug et
 * matchs publiés sur 14 jours, y compris ceux des compétitions jugées non
 * couvertes), --jours N (7 par défaut), --ligue « EPL », --detail (tous les
 * rattachements), --direct-seul (seulement 3), --sans-direct.
 *
 * Rien n'est écrit : la base est ouverte en lecture seule, et
 * ODDS_MATCHING_READONLY=1 garde en mémoire les alias que le fournisseur
 * apprendrait. Le script refuse de tourner sans ces deux garde-fous.
 *
 * Exemple (PowerShell, depuis server/, sur une COPIE de la base) :
 *   $env:MATCH_STATS_DB = '<copie de la base>'; $env:ODDS_MATCHING_READONLY = '1'; node scripts/probe-smarkets-odds.mjs
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/data/db/matchStatsDb.js';
import { clubDuMagasin } from '../src/data/db/oddsProfileRead.js';
import { fetchMatchesByDate, FOTMOB_LEAGUES, leagueKeyMatches } from '../src/data/providers/fotMobProvider.js';
import { SOURCE, LIGUES, BOOKMAKERS, COUVERTURE, collectUpcoming, collectLive, backfill, __testing } from '../src/data/providers/smarketsOdds.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const API = 'https://api.smarkets.com/v3';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

const args = process.argv.slice(2);
const option = (nom, defaut = null) => {
  const i = args.indexOf(nom);
  return i === -1 ? defaut : (args[i + 1] ?? defaut);
};
const JOURS = Number(option('--jours', 7));
const LIGUE = option('--ligue');
const DETAIL = args.includes('--detail');
const DIRECT_SEUL = args.includes('--direct-seul');
const SANS_DIRECT = args.includes('--sans-direct');

if (!process.env.MATCH_STATS_DB) {
  console.error('Refus : MATCH_STATS_DB doit désigner la base à lire (une copie de préférence).');
  process.exit(1);
}
if (process.env.ODDS_MATCHING_READONLY !== '1') {
  console.error('Refus : ODDS_MATCHING_READONLY=1 est obligatoire (aucun alias écrit pendant une sonde).');
  process.exit(1);
}

const db = openDb({ file: process.env.MATCH_STATS_DB, readonly: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jour = (t) => new Date(t).toISOString().slice(0, 10);
const plus = (j, n) => jour(Date.parse(`${j}T00:00:00Z`) + n * 86_400_000);
const mediane = (xs) => {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const compter = (sql) => db.prepare(sql).get().n;
const temoins = () => ({
  events: compter('SELECT COUNT(*) n FROM odds_events'),
  quotes: compter('SELECT COUNT(*) n FROM odds_quotes'),
  aliases: compter('SELECT COUNT(*) n FROM team_source_aliases')
});
/** Requêtes de la sonde elle-même (vérification des unités, des nœuds) : espacées comme celles du module. */
async function lire(url) {
  await sleep(1300);
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  return { status: r.status, json: await r.json().catch(() => null) };
}

const avant = temoins();
const t0 = Date.now();
console.log(`Source ${SOURCE} — ${LIGUES.size} compétitions couvertes, bookmaker(s) : ${BOOKMAKERS.join(', ')}`);
console.log(`Couverture : marchés ${COUVERTURE.marches.join(', ')} | avant-match ${COUVERTURE.avantMatch} | direct ${COUVERTURE.live} | historique « ${COUVERTURE.historique} » | volumes ${COUVERTURE.volumes}`);
const magasin = db.prepare('SELECT DISTINCT league FROM matches ORDER BY league').all().map((r) => r.league);
const absentes = magasin.filter((l) => !LIGUES.has(l));
const inconnues = [...LIGUES.keys()].filter((l) => !magasin.includes(l));
console.log(`Magasin : ${magasin.length} compétitions ; non couvertes (${absentes.length}) : ${absentes.join(' ; ')}`);
if (inconnues.length) console.log(`ATTENTION, libellés de LIGUES absents du magasin : ${inconnues.join(' ; ')}`);

// --- Option --noeuds : revérifier l'arbre Smarkets ---------------------------------------------
async function verifierNoeuds() {
  const { NOEUDS } = __testing;
  // Nœuds des compétitions jugées non couvertes le 04/10/2026 : revus aussi, pour savoir si cela change.
  const exclus = { 'russia-premier-league': '30091633', 'china-super-league': '29190454', 'china-fa-cup': '31675862', 'bolivia-primera-division': '41986505', 'venezuela-primera-division': '42266403', 'latvia-virsliga': '41614555' };
  const tous = new Map([...[...NOEUDS].map(([slug, n]) => [n.id, { slug, league: n.league }]), ...Object.entries(exclus).map(([slug, id]) => [id, { slug, league: '(non couverte)' }])]);
  const ids = [...tous.keys()];
  const vus = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const q = ids.slice(i, i + 50).map((id) => `id=${id}`).join('&');
    const { json } = await lire(`${API}/events/?${q}&limit=50`);
    for (const e of json?.events ?? []) vus.set(String(e.id), e.slug);
  }
  const fin = new Date(Date.now() + 14 * 86_400_000).toISOString();
  const parNoeud = new Map();
  let url = `${API}/events/?${ids.map((id) => `parent_id=${id}`).join('&')}&type=football_match&state=upcoming&state=live&sort=start_datetime,id&limit=50&start_datetime_max=${encodeURIComponent(fin)}`;
  for (let p = 0; url && p < 40; p++) {
    const { json } = await lire(url);
    for (const e of json?.events ?? []) parNoeud.set(String(e.parent_id), (parNoeud.get(String(e.parent_id)) ?? 0) + 1);
    url = json?.pagination?.next_page ? `${API}/events/${json.pagination.next_page}` : null;
  }
  console.log('\nNœuds Smarkets (compétition, identifiant, slug attendu, contrôle du slug, matchs publiés sur 14 jours) :');
  for (const [id, n] of tous) {
    const lu = vus.get(id) ?? 'ABSENT';
    console.log(`  ${n.league.padEnd(32)} ${id.padEnd(9)} ${n.slug.padEnd(46)} ${lu === n.slug ? 'ok' : `DIFFÉRENT (${lu})`} ${String(parNoeud.get(id) ?? 0).padStart(4)}`);
  }
}

// --- 1 et 2. Avant-match : les 7 prochains jours du calendrier, puis les unités ------------------
async function avantMatch() {
  const calendrier = JSON.parse(fs.readFileSync(path.join(ICI, '../data/runtime/season-calendar.json'), 'utf8'));
  const aujourdHui = jour(Date.now());
  const club = new Map();
  const idDe = (nom, league) => {
    const cle = `${league}|${nom}`;
    if (!club.has(cle)) {
      let id = null;
      try {
        id = clubDuMagasin(nom, league, db);
      } catch {
        id = null;
      }
      club.set(cle, id);
    }
    return club.get(cle);
  };
  // Comme freeOdds.upcomingFixtures : le calendrier FotMob, identifiants par l'annuaire strict, sans heure.
  const fixtures = calendrier
    .filter((e) => e.status === 'scheduled' && e.date >= aujourdHui && e.date <= plus(aujourdHui, JOURS) && e.league && e.homeName && e.awayName)
    .filter((e) => !LIGUE || e.league === LIGUE)
    .map((e) => ({ league: e.league, date: e.date, homeName: e.homeName, awayName: e.awayName, homeId: idDe(e.homeName, e.league), awayId: idDe(e.awayName, e.league), kickoff: null }));
  const couvertes = fixtures.filter((f) => LIGUES.has(f.league));
  console.log(`\n=== collectUpcoming : ${fixtures.length} matchs « scheduled » du ${aujourdHui} au ${plus(aujourdHui, JOURS)}, dont ${couvertes.length} dans une compétition couverte`);
  const t1 = Date.now();
  const av = await collectUpcoming({ fixtures, database: db, log: (m) => console.log(m) });
  const duree = (Date.now() - t1) / 1000;
  const avecPrix = new Set(av.quotes.map((q) => q.sourceEvent));
  const avec1x2 = new Set(av.quotes.filter((q) => q.market === '1x2').map((q) => q.sourceEvent));
  console.log(`Rencontres Smarkets vues : ${av.events.length} | rattachées à une rencontre du calendrier : ${av.attached} | avec au moins un prix : ${avecPrix.size} (1x2 : ${avec1x2.size})`);
  console.log(`Prix rendus : ${av.quotes.length} (${['1x2', 'ou', 'btts'].map((m) => `${m} ${av.quotes.filter((q) => q.market === m).length}`).join(', ')}) | kinds : ${[...new Set(av.quotes.map((q) => q.kind))].join(', ')}`);
  console.log(`Requêtes : ${av.requests} en ${duree.toFixed(1)} s | erreurs : ${av.errors.length ? av.errors.join(' | ') : 'aucune'}`);
  console.log(`Noms Smarkets non résolus : ${av.unresolved.length}${av.unresolved.length ? ` — ${av.unresolved.slice(0, 40).map((u) => `${u.name} (${u.league})`).join(' ; ')}` : ''}`);

  const volumes = new Map();
  for (const q of av.quotes) volumes.set(`${q.sourceEvent}|${q.market}`, { market: q.market, volume: q.volume });
  for (const m of ['1x2', 'ou', 'btts']) {
    const v = [...volumes.values()].filter((x) => x.market === m).map((x) => x.volume).filter(Number.isFinite);
    console.log(`Volume échangé, marché ${m.padEnd(4)} : médiane ${mediane(v) ?? '—'} £ sur ${v.length} marchés (max ${v.length ? Math.max(...v) : '—'} £, à 0 £ : ${v.filter((x) => x === 0).length})`);
  }
  const triplets = new Map();
  for (const q of av.quotes.filter((x) => x.market === '1x2')) triplets.set(q.sourceEvent, [...(triplets.get(q.sourceEvent) ?? []), q.prob]);
  const sommes = [...triplets.values()].filter((p) => p.length === 3).map((p) => p.reduce((a, b) => a + b, 0));
  if (sommes.length) console.log(`Somme des trois probabilités 1x2 (brutes) : médiane ${mediane(sommes).toFixed(4)}, de ${Math.min(...sommes).toFixed(4)} à ${Math.max(...sommes).toFixed(4)} sur ${sommes.length} matchs`);

  const raisons = new Map();
  for (const m of av.missing) {
    const cle = m.reason.split(' : ')[0].replace(/\(\d issues? sur 3\)/, '(n sur 3)');
    raisons.set(cle, (raisons.get(cle) ?? 0) + 1);
  }
  console.log(`Matchs couverts sans prix 1x2 complet (missing) : ${av.missing.length}`);
  for (const [r, n] of [...raisons].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${r}`);
  for (const m of av.missing.filter((x) => /non reconnu|non identifié|différente|inversés|doublon|incohérent/.test(x.reason)).slice(0, 30)) {
    console.log(`     ${m.date} ${m.league} — ${m.homeName} - ${m.awayName} : ${m.reason}`);
  }

  console.log('\nPar compétition (matchs du calendrier / rencontres Smarkets vues / rattachées / avec un 1x2 complet) :');
  for (const l of [...new Set(couvertes.map((f) => f.league))].sort()) {
    const nf = couvertes.filter((f) => f.league === l).length;
    const ne = av.events.filter((e) => e.league === l).length;
    const na = av.events.filter((e) => e.league === l && e.attached).length;
    const n1 = [...triplets].filter(([ev, p]) => p.length === 3 && av.quotes.find((q) => q.sourceEvent === ev)?.league === l).length;
    console.log(`  ${l.padEnd(32)} ${String(nf).padStart(3)} ${String(ne).padStart(4)} ${String(na).padStart(4)} ${String(n1).padStart(4)}`);
  }

  // Sens domicile/extérieur : la rencontre Smarkets en face de celle du calendrier, identifiants compris.
  const parEvenement = new Map();
  for (const q of av.quotes) if (!parEvenement.has(q.sourceEvent)) parEvenement.set(q.sourceEvent, q);
  console.log(`\nRattachements (Smarkets -> calendrier CôteMaster), ${DETAIL ? 'tous' : 'échantillon'} :`);
  for (const q of [...parEvenement.values()].slice(0, DETAIL ? 1000 : 12)) {
    const f = couvertes.find((x) => x.league === q.league && x.homeId === q.homeId && x.awayId === q.awayId);
    const p = Object.fromEntries(av.quotes.filter((x) => x.sourceEvent === q.sourceEvent && x.market === '1x2').map((x) => [x.selection, x.price]));
    console.log(`  ${q.kickoff?.slice(0, 16)} ${q.league} : « ${q.homeName} - ${q.awayName} » -> « ${f?.homeName} - ${f?.awayName} » (${f?.date}) ${q.homeId}/${q.awayId} | 1x2 ${p.home ?? '—'} / ${p.draw ?? '—'} / ${p.away ?? '—'}`);
  }

  // Unités : un carnet brut, relu à part et recalculé à la main, en face de ce que rend le module.
  const q1 = av.quotes.filter((q) => q.market === '1x2').sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))[0];
  if (q1) {
    const marketId = q1.provenance.match(/markets\/(\d+)\//)?.[1];
    const contrats = await lire(`${API}/markets/${marketId}/contracts/`);
    const carnets = await lire(`${API}/markets/${marketId}/quotes/`);
    const vol = await lire(`${API}/markets/${marketId}/volumes/`);
    console.log(`\n=== Unités vérifiées sur le marché ${marketId} (${q1.homeName} - ${q1.awayName}, ${q1.kickoff})`);
    for (const c of contrats.json?.contracts ?? []) {
      const carnet = carnets.json?.[c.id];
      const achat = carnet?.bids?.[0];
      const vente = carnet?.offers?.[0];
      const m = __testing.milieu(carnet);
      const sel = { HOME: 'home', DRAW: 'draw', AWAY: 'away' }[c.contract_type?.name];
      const rendu = av.quotes.find((x) => x.provenance === q1.provenance && x.selection === sel);
      console.log(
        `  ${String(c.contract_type?.name).padEnd(5)} ${String(c.name).padEnd(22)} achat ${achat?.price ?? '—'} pb (${achat ? (achat.price / 100).toFixed(2) : '—'} %, cote ${achat ? (10000 / achat.price).toFixed(3) : '—'}, pot ${achat ? (achat.quantity / 10000).toFixed(2) : '—'} £ dont mise ${achat ? ((achat.quantity * achat.price) / 1e8).toFixed(2) : '—'} £)` +
          ` | vente ${vente?.price ?? '—'} pb (cote ${vente ? (10000 / vente.price).toFixed(3) : '—'})` +
          ` | milieu maintenant ${m.prob ?? m.raison} -> cote ${m.price ?? '—'} | module : prob ${rendu?.prob ?? '—'}, price ${rendu?.price ?? '—'} (relevé ${rendu?.releveAt?.slice(11, 19) ?? '—'})`
      );
    }
    const v = vol.json?.volumes?.[0];
    console.log(`  volume du marché : ${v?.volume} £ (double_stake_volume ${v?.double_stake_volume}) | module : ${q1.volume} £ sur chaque issue`);
  }
}

// --- 3. Direct : les matchs en cours maintenant -----------------------------------------------
async function enDirect() {
  const maintenant = Date.now();
  const jours = [jour(maintenant)];
  if (new Date(maintenant).getUTCHours() < 6) jours.unshift(jour(maintenant - 86_400_000));
  const libelles = Object.entries(FOTMOB_LEAGUES);
  const libelleDe = (cle) => libelles.find(([, motif]) => leagueKeyMatches(motif, cle))?.[0] ?? null;
  const duJour = [];
  for (const j of jours) duJour.push(...(await fetchMatchesByDate(j).catch(() => [])));
  // Comme oddsWatch : liste FotMob du jour (heure exacte, identifiants), coup d'envoi passé depuis moins de 3 h.
  const enCours = duJour
    .map((m) => ({ league: libelleDe(m.leagueKey), date: m.kickoff ? jour(m.kickoff) : m.date, kickoff: m.kickoff, homeName: m.homeName, awayName: m.awayName, homeId: m.homeId, awayId: m.awayId, started: m.started, finished: m.finished || m.played || m.cancelled }))
    .filter((f) => f.league && f.kickoff && !f.finished && maintenant - Date.parse(f.kickoff) >= 0 && maintenant - Date.parse(f.kickoff) <= 3 * 3_600_000);
  console.log(`\n=== collectLive : ${enCours.length} matchs suivis en cours (liste FotMob du ${jours.join(' et ')}), dont ${enCours.filter((f) => LIGUES.has(f.league)).length} couverts par Smarkets`);
  for (const f of enCours) console.log(`  ${f.kickoff} ${f.league} : ${f.homeName} - ${f.awayName}${f.started ? '' : ' (pas encore commencé selon FotMob)'}`);
  const t2 = Date.now();
  const li = await collectLive({ fixtures: enCours, database: db, log: (m) => console.log(m) });
  console.log(`Rencontres vues ${li.events.length} | rattachées ${li.attached} | prix ${li.quotes.length} (kinds ${[...new Set(li.quotes.map((q) => q.kind))].join(', ') || '—'}) | requêtes ${li.requests} en ${((Date.now() - t2) / 1000).toFixed(1)} s | erreurs ${li.errors.join(' | ') || 'aucune'}`);
  for (const m of li.missing) console.log(`  sans prix : ${m.league} — ${m.homeName} - ${m.awayName} : ${m.reason}`);
  for (const q of li.quotes) console.log(`  ${q.homeName} - ${q.awayName} ${q.market}/${q.selection}${q.line ? ` ${q.line}` : ''} prob ${q.prob} cote ${q.price} volume ${q.volume} £ (${q.kind}, relevé ${q.releveAt})`);
}

if (args.includes('--noeuds')) await verifierNoeuds();
if (!DIRECT_SEUL) await avantMatch();
if (!SANS_DIRECT) await enDirect();

// --- 4. Rattrapage --------------------------------------------------------------------------
const bf = await backfill({ league: 'EPL', database: db, budget: 40, state: null, log: () => {} });
console.log(`\n=== backfill(EPL, budget 40) : ${bf.quotes.length} cotes, ${bf.requests} requêtes, done ${bf.done}, curseur ${bf.cursor} — ${bf.bilan?.note}`);

const apres = temoins();
console.log(`\nBase (lecture seule) avant/après : odds_events ${avant.events}/${apres.events}, odds_quotes ${avant.quotes}/${apres.quotes}, team_source_aliases ${avant.aliases}/${apres.aliases}`);
console.log(`Durée totale ${((Date.now() - t0) / 1000).toFixed(1)} s`);
