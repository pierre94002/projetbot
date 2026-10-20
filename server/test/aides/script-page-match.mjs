/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-page-match.mjs <serveur de la copie> <phase> [manifeste]
 *
 * Étape 9 du plan — la page d'un match pour décider. Ce script ne vérifie rien :
 * il fait produire au VRAI serveur (routes Express appelées sans réseau, moteur,
 * base d'essai copiée, heure figée au 05/10/2026 12 h UTC) les réponses que la
 * page lit, pour que le rendu de l'écran soit essayé sur des réponses réelles et
 * non sur des réponses écrites à la main :
 *   - un faux relevé The Odds API (odds-snapshot.json de la COPIE), archivé comme
 *     le font les Enregistreurs : Man City – Liverpool (William Hill paie au-dessus
 *     de Pinnacle : LA value), Arsenal – Chelsea (aucun juge hors de vos
 *     bookmakers : juge et partie), Fulham – Brentford (cote trop haute) ;
 *   - des cotes GRATUITES fabriquées pour Man City – Liverpool (ESPN et 365Scores :
 *     ouverture la veille, relevés du matin) : les mouvements de la courbe ;
 *   - des cotes saisies à la main (corners, les deux marquent, cartons, plus de 2,5) ;
 *   - un match du calendrier SANS aucune cote (un match de la base d'essai).
 * Phase « payloads » : sortie = une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { Socket } from 'node:net';
import { pathToFileURL } from 'node:url';

const [serveur, phase, fichierManifeste] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);
const T0 = Date.parse(process.env.CM_TEST_MAINTENANT);
const MIN = 60_000;
const H = 3_600_000;
const iso = (t) => new Date(t).toISOString();

const { resolveDbPath, openDb } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error('Base inattendue');
const database = openDb();
const { getFixturePaths } = await imp('data/repositories/fixturesRepository.js');
const fichierInstantane = getFixturePaths().odds;
if (!path.resolve(fichierInstantane).toLowerCase().startsWith(path.resolve(serveur).toLowerCase())) throw new Error(`Instantané hors de la copie : ${fichierInstantane}`);

// ------------------------------------------------- le faux relevé payant
const h2h = (home, away, [o1, ox, o2]) => ({ key: 'h2h', outcomes: [{ name: home, price: o1 }, { name: away, price: o2 }, { name: 'Draw', price: ox }] });
const livre = (key, title, home, away, cotes) => ({ key, title, last_update: '2026-10-05T11:45:00Z', markets: [h2h(home, away, cotes)] });
const match = (id, home, away, coupDEnvoi, livres) => ({
  id,
  sport_key: 'soccer_epl',
  sport_title: 'EPL',
  commence_time: coupDEnvoi,
  home_team: home,
  away_team: away,
  bookmakers: livres.map(([key, title, cotes]) => livre(key, title, home, away, cotes))
});

export const MATCHS = [
  match('essai-a', 'Man City', 'Liverpool', '2026-10-05T18:30:00Z', [
    ['pinnacle', 'Pinnacle', [2.0, 3.6, 3.9]],
    ['williamhill', 'William Hill', [2.3, 3.4, 3.3]],
    ['betclic_fr', 'Betclic (FR)', [1.9, 3.3, 3.6]]
  ]),
  match('essai-b', 'Arsenal', 'Chelsea', '2026-10-05T19:00:00Z', [
    ['williamhill', 'William Hill', [2.2, 3.5, 3.4]],
    ['betsson', 'Betsson', [2.45, 3.3, 3.0]],
    ['unibet_nl', 'Unibet (NL)', [2.2, 3.5, 3.4]]
  ]),
  match('essai-e', 'Fulham', 'Brentford', '2026-10-05T20:00:00Z', [
    ['pinnacle', 'Pinnacle', [1.5, 4.5, 6.5]],
    ['williamhill', 'William Hill', [1.48, 4.4, 7.4]]
  ])
];
const ecrireInstantane = (matchs, mtimeIso) => {
  fs.mkdirSync(path.dirname(fichierInstantane), { recursive: true });
  fs.writeFileSync(fichierInstantane, JSON.stringify([{ data: matchs }]));
  const t = new Date(mtimeIso);
  fs.utimesSync(fichierInstantane, t, t);
};

/** L'application Express, appelée sans réseau : une requête fabriquée, la réponse captée. */
async function application() {
  const { createApp } = await imp('app.js');
  const app = createApp();
  return (methode, url, corps) =>
    new Promise((resolve, reject) => {
      const req = new http.IncomingMessage(new Socket());
      req.method = methode;
      req.url = url;
      req.headers = { host: 'essai', ...(corps !== undefined ? { 'content-type': 'application/json' } : {}) };
      if (corps !== undefined) {
        req._body = true;
        req.body = corps;
      }
      const res = new http.ServerResponse(req);
      const morceaux = [];
      res.write = (c) => {
        morceaux.push(Buffer.from(c));
        return true;
      };
      res.end = (c) => {
        if (c) morceaux.push(Buffer.from(c));
        let rendu = null;
        try {
          rendu = JSON.parse(Buffer.concat(morceaux).toString('utf8'));
        } catch {
          rendu = null;
        }
        resolve({ code: res.statusCode, corps: rendu });
        return res;
      };
      app.handle(req, res, reject);
    });
}

if (phase !== 'payloads') throw new Error(`Phase inconnue : ${phase}`);
const sortie = { ok: true, phase, instant: iso(T0) };

// Le relevé de 11 h 50, archivé par les Enregistreurs (l'heure de chaque cote vient de là).
ecrireInstantane(MATCHS, '2026-10-05T11:50:00.000Z');
const { archiverReleveSiNouveau } = await imp('data/enregistreurs/cotesPayantes.js');
const { vider } = await imp('data/enregistreurs/file.js');
archiverReleveSiNouveau({ maintenant: T0, database });
await vider({ maintenant: T0, database });
const { clubDuMagasin } = await imp('data/db/oddsProfileRead.js');
const ids = Object.fromEntries(['Man City', 'Liverpool', 'Arsenal', 'Chelsea', 'Fulham', 'Brentford'].map((n) => [n, clubDuMagasin(n, 'EPL', database)]));
sortie.ids = ids;

// Des cotes GRATUITES pour Man City – Liverpool : deux sources, une ouverture la veille puis deux relevés ce matin.
const { upsertQuotes } = await imp('data/db/oddsQuotesRepository.js');
const gratuite = (source, bookmaker, kind, releveAt, market, line, selection, price) => ({
  source,
  sourceEvent: `${source}-city-liverpool`,
  bookmaker,
  market,
  selection,
  line,
  price,
  kind,
  releveAt,
  date: '2026-10-05',
  kickoff: '2026-10-05T18:30:00Z',
  league: 'English Premier League',
  homeId: ids['Man City'],
  awayId: ids.Liverpool,
  homeName: 'Manchester City',
  awayName: 'Liverpool',
  provenance: `${source} (essai)`
});
const lignes = [];
for (const [source, bookmaker, ouverture, mi, fin] of [
  ['espn', 'DraftKings', [2.3, 3.4, 3.2], [2.15, 3.5, 3.5], [2.0, 3.6, 3.9]],
  ['365scores', 'Bet365', [2.25, 3.4, 3.25], [2.1, 3.5, 3.55], [2.02, 3.55, 3.8]]
]) {
  ['home', 'draw', 'away'].forEach((sel, i) => {
    lignes.push(gratuite(source, bookmaker, 'open', '2026-10-04T09:00:00Z', '1x2', 0, sel, ouverture[i]));
    lignes.push(gratuite(source, bookmaker, 'snapshot', '2026-10-05T07:00:00Z', '1x2', 0, sel, mi[i]));
    lignes.push(gratuite(source, bookmaker, 'snapshot', '2026-10-05T11:00:00Z', '1x2', 0, sel, fin[i]));
  });
  for (const [sel, a, b, c] of [
    ['over', 2.0, 1.9, 1.8],
    ['under', 1.85, 1.95, 2.05]
  ]) {
    lignes.push(gratuite(source, bookmaker, 'open', '2026-10-04T09:00:00Z', 'ou', 2.5, sel, a));
    lignes.push(gratuite(source, bookmaker, 'snapshot', '2026-10-05T07:00:00Z', 'ou', 2.5, sel, b));
    lignes.push(gratuite(source, bookmaker, 'snapshot', '2026-10-05T11:00:00Z', 'ou', 2.5, sel, c));
  }
}
sortie.gratuites = upsertQuotes(lignes, { database });

const appel = await application();

// ------------------------------------------------------- la liste et les analyses
const liste = await appel('GET', '/api/matches?source=odds-api&bankroll=10000');
sortie.liste = { code: liste.code, corps: liste.corps };
sortie.analyses = {};
for (const m of MATCHS) {
  const r = await appel('GET', `/api/analysis/match/${m.id}?source=odds-api&bankroll=10000&includeCorners=false`);
  sortie.analyses[m.id] = { code: r.code, corps: r.corps };
}

// L'analyse de Man City – Liverpool quatre heures plus tard (cotes trop vieilles), comme la route la donnerait à ce moment-là.
{
  const { findAdaptedMatch } = await imp('data/matchSources.js');
  const { enrichMatchWithRealAverages } = await imp('data/providers/matchEnrichment.js');
  const { analyzeMatch } = await imp('core/engine/oddsEngine.js');
  const { getEngineConfig } = await imp('core/engine/engineConfig.js');
  const { getTiltState } = await imp('core/engine/tiltState.js');
  const { getSport } = await imp('sports/index.js');
  const { fraicheurDuMatch } = await imp('data/cotesDeVosBookmakers.js');
  const adapte = findAdaptedMatch('odds-api', 'essai-a');
  const enrichi = await enrichMatchWithRealAverages(adapte, { sansRepliPayant: true });
  const tard = await analyzeMatch({ ...enrichi, fraicheurCotes: fraicheurDuMatch(enrichi, { database, maintenant: T0 + 4 * H }) }, getEngineConfig('football'), getTiltState(), getSport('football'));
  sortie.analyseATard = tard;

  // Un match du calendrier SANS aucune cote : un match de la base d'essai, jamais coté.
  const { adaptSeasonCalendarMatch } = await imp('data/adapters/seasonCalendarAdapter.js');
  const manifeste = JSON.parse(fs.readFileSync(fichierManifeste, 'utf8'));
  const lire = database.prepare('SELECT match_key, date, league, home_name, away_name FROM matches WHERE match_key = ?');
  for (const cible of manifeste.cibles) {
    const r = lire.get(cible.cle);
    if (!r) continue;
    const base = adaptSeasonCalendarMatch({ homeName: r.home_name, awayName: r.away_name, date: r.date, league: r.league }, 10000);
    const a = await analyzeMatch(await enrichMatchWithRealAverages(base, { sansRepliPayant: true }), getEngineConfig('football'), getTiltState(), getSport('football'));
    if (!a.statExpectations?.corners || !a.marketPredictions?.length) continue;
    sortie.sansCotes = { match: { ...base, matchId: base.matchId ?? `cal-${r.match_key}`, commenceTime: base.commenceTime ?? `${r.date}T12:00:00Z` }, analyse: a, ligne: { home: r.home_name, away: r.away_name, league: r.league, date: r.date } };
    break;
  }
}

// ---------------------------------------------------- les cotes relevées et saisies
const fixture = (home, away, league, commenceTime) =>
  appel('GET', `/api/odds/fixture?home=${encodeURIComponent(home)}&away=${encodeURIComponent(away)}&league=${encodeURIComponent(league)}&commenceTime=${encodeURIComponent(commenceTime)}`);
sortie.fixtureA = (await fixture('Man City', 'Liverpool', 'EPL', '2026-10-05T18:30:00Z')).corps;
sortie.fixtureE = (await fixture('Fulham', 'Brentford', 'EPL', '2026-10-05T20:00:00Z')).corps;
if (sortie.sansCotes) {
  const l = sortie.sansCotes.ligne;
  sortie.fixtureSansCotes = (await fixture(l.home, l.away, l.league, `${l.date}T12:00:00Z`)).corps;
}

// Les saisies de Man City – Liverpool (les corners et « plus de 2,5 » ont une probabilité du moteur ; les cartons n'en ont pas).
sortie.saisiesPut = [];
for (const corps of [
  { matchId: 'essai-a', bookmaker: 'williamhill', marketId: 'totalCorners', sens: 'over', ligne: 9.5, cote: 2.25 },
  { matchId: 'essai-a', bookmaker: 'unibet_nl', marketId: 'totalGoals', sens: 'over', ligne: 2.5, cote: 1.95 },
  { matchId: 'essai-a', bookmaker: 'betsson', marketId: 'bothTeamsScore', sens: 'yes', cote: 1.8 },
  { matchId: 'essai-a', bookmaker: 'tipico_de', marketId: 'totalCards', sens: 'over', ligne: 4.5, cote: 1.9 }
]) {
  const r = await appel('PUT', '/api/odds/saisies', corps);
  sortie.saisiesPut.push({ code: r.code, erreur: r.corps?.error ?? null });
}
sortie.saisiesA = (await appel('GET', '/api/odds/saisies?matchId=essai-a')).corps;
sortie.saisiesVides = (await appel('GET', '/api/odds/saisies?matchId=essai-e')).corps;
sortie.conseil = (await appel('GET', '/api/odds/conseil-releve')).corps;

console.log(JSON.stringify(sortie));
