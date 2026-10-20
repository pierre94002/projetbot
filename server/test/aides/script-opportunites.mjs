/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-opportunites.mjs <serveur de la copie> <phase>
 *
 * Étape 8 du plan — la page « Opportunités du jour ». Un faux relevé The Odds
 * API (odds-snapshot.json de la COPIE), archivé comme le font les
 * Enregistreurs ; des cotes GRATUITES fabriquées (ouverture puis dernier
 * relevé) pour les mouvements ; des compositions dans le cache ; la base
 * d'essai ; réseau coupé, heure figée (CM_TEST_MAINTENANT = 05/10/2026 12 h UTC).
 * Phases :
 *   verdicts       le Repérage calculé, la page Opportunités lue (à 12 h, puis à
 *                  16 h : cotes trop vieilles), l'analyse de chaque match par la
 *                  route Express (celle de Mes paris), les Chutes de cotes, la route
 *                  des opportunités vertes ;
 *   invalidation   un nouveau relevé The Odds API rend le calcul périmé ; sans nouveau
 *                  relevé, la lecture des vertes ne relance rien ;
 *   moteur         l'analyse de matchs de la base d'essai (statLines, statExpectations,
 *                  pronostics) pour « Paris les plus probables ».
 * Sortie : une ligne JSON.
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

const { resolveDbPath, openDb, upsertUpcomingLineup } = await imp('data/db/matchStatsDb.js');
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

/**
 * Cinq matchs, un par cas que le verdict doit savoir dire :
 *   A  Man City – Liverpool   Pinnacle fixe la cote juste ; William Hill paie au-dessus à domicile → LA value
 *   B  Arsenal – Chelsea      ni Pinnacle ni palier 2 : la cote juste vient de VOS bookmakers (palier 3) → juge et partie partout
 *   C  Tottenham – Everton    palier 2 = Codere (à vous) + Marathon ; Codere paie le plus, mais il a fixé la cote juste
 *   D  Newcastle – Leeds      deux issues au-dessus du seuil chez Unibet : le moteur n'en retient qu'une
 *   E  Fulham – Brentford     une issue à 7,40 : au-delà de la cote maximale (5)
 */
export const MATCHS = (variante = {}) => [
  match('essai-a', 'Man City', 'Liverpool', '2026-10-05T12:40:00Z', [
    ['pinnacle', 'Pinnacle', [2.0, 3.6, 3.9]],
    ['williamhill', 'William Hill', variante.whA ?? [2.3, 3.4, 3.3]],
    ['betclic_fr', 'Betclic (FR)', [1.9, 3.3, 3.6]]
  ]),
  match('essai-b', 'Arsenal', 'Chelsea', '2026-10-05T18:30:00Z', [
    ['williamhill', 'William Hill', [2.2, 3.5, 3.4]],
    ['betsson', 'Betsson', [2.45, 3.3, 3.0]],
    ['unibet_nl', 'Unibet (NL)', [2.2, 3.5, 3.4]]
  ]),
  match('essai-c', 'Tottenham', 'Everton', '2026-10-05T19:00:00Z', [
    ['codere_it', 'Codere (IT)', [2.3, 3.3, 3.6]],
    ['marathonbet', 'Marathon Bet', [1.95, 3.5, 4.3]],
    ['williamhill', 'William Hill', [2.12, 3.3, 3.7]]
  ]),
  match('essai-d', 'Newcastle', 'Leeds', '2026-10-05T19:30:00Z', [
    ['pinnacle', 'Pinnacle', [2.5, 3.4, 2.9]],
    ['unibet_nl', 'Unibet (NL)', [2.75, 3.75, 2.6]]
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
  return (methode, url) =>
    new Promise((resolve, reject) => {
      const req = new http.IncomingMessage(new Socket());
      req.method = methode;
      req.url = url;
      req.headers = { host: 'essai' };
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

async function attendreLeCalcul(screener) {
  let lu = screener.getScreener();
  for (let i = 0; i < 1200 && lu.status === 'computing'; i++) {
    await new Promise((fin) => setTimeout(fin, 25));
    lu = screener.getScreener();
  }
  return lu;
}

const sortie = { ok: true, phase };

if (phase === 'verdicts' || phase === 'invalidation') {
  // Le relevé payant de 11 h 50, archivé par les Enregistreurs (l'heure de chaque cote vient de là).
  ecrireInstantane(MATCHS(), '2026-10-05T11:50:00.000Z');
  const { archiverReleveSiNouveau } = await imp('data/enregistreurs/cotesPayantes.js');
  const { vider } = await imp('data/enregistreurs/file.js');
  archiverReleveSiNouveau({ maintenant: T0, database });
  await vider({ maintenant: T0, database });
  const { clubDuMagasin } = await imp('data/db/oddsProfileRead.js');
  const ids = Object.fromEntries(
    ['Man City', 'Liverpool', 'Arsenal', 'Chelsea', 'Tottenham', 'Everton', 'Newcastle', 'Leeds', 'Fulham', 'Brentford'].map((n) => [n, clubDuMagasin(n, 'EPL', database)])
  );
  sortie.ids = ids;

  if (phase === 'verdicts') {
    // Des cotes GRATUITES (ESPN) : ouverture la veille, dernier relevé ce matin — Man City gagne et « Plus de 2,5 buts » chutent.
    const { upsertQuotes } = await imp('data/db/oddsQuotesRepository.js');
    const gratuite = (kind, releveAt, market, line, selection, price) => ({
      source: 'espn',
      sourceEvent: 'espn-city-liverpool',
      bookmaker: 'DraftKings',
      market,
      selection,
      line,
      price,
      kind,
      releveAt,
      date: '2026-10-05',
      kickoff: '2026-10-05T12:40:00Z',
      league: 'English Premier League',
      homeId: ids['Man City'],
      awayId: ids.Liverpool,
      homeName: 'Manchester City',
      awayName: 'Liverpool',
      provenance: 'ESPN (essai)'
    });
    const bilan = upsertQuotes(
      [
        ['home', 2.3, 2.0],
        ['draw', 3.4, 3.6],
        ['away', 3.2, 3.9]
      ].flatMap(([sel, avant, apres]) => [gratuite('open', '2026-10-04T09:00:00Z', '1x2', 0, sel, avant), gratuite('snapshot', '2026-10-05T11:00:00Z', '1x2', 0, sel, apres)])
        .concat([
          gratuite('open', '2026-10-04T09:00:00Z', 'ou', 2.5, 'over', 2.0),
          gratuite('open', '2026-10-04T09:00:00Z', 'ou', 2.5, 'under', 1.85),
          gratuite('snapshot', '2026-10-05T11:00:00Z', 'ou', 2.5, 'over', 1.8),
          gratuite('snapshot', '2026-10-05T11:00:00Z', 'ou', 2.5, 'under', 2.05)
        ]),
      { database }
    );
    sortie.gratuites = bilan;
    // Les compositions du cache (boucle des compositions) : A lue 45 min avant le coup d'envoi ; D 5 h avant ;
    // B 30 min avant, mais un titulaire de Chelsea y est dit indisponible.
    const onze = (prefixe) => Array.from({ length: 11 }, (_, i) => ({ id: `${prefixe}-${i}`, name: `${prefixe} Joueur ${i + 1}` }));
    const compo = (fotmobId, home, away, kickoff, avantMin, { indisponible = null } = {}) =>
      upsertUpcomingLineup(
        {
          fotmobId,
          date: kickoff.slice(0, 10),
          kickoff,
          league: 'ENG|Premier League',
          homeId: ids[home],
          awayId: ids[away],
          homeName: home,
          awayName: away,
          payload: {
            available: true,
            home: { teamId: ids[home], teamName: home, startXI: onze(home), unavailable: [] },
            away: { teamId: ids[away], teamName: away, startXI: onze(away), unavailable: indisponible ? [{ id: `${away}-3`, name: `${away} Joueur 4`, type: 'injury' }] : [] }
          },
          fetchedAt: iso(Date.parse(kickoff) - avantMin * MIN)
        },
        { database }
      );
    compo('900001', 'Man City', 'Liverpool', '2026-10-05T12:40:00Z', 45);
    compo('900004', 'Newcastle', 'Leeds', '2026-10-05T19:30:00Z', 300);
    compo('900002', 'Arsenal', 'Chelsea', '2026-10-05T18:30:00Z', 30, { indisponible: true });
  }

  const screener = await imp('data/screener.js');
  const { getOpportunities, getOpportunitesVertes } = await imp('data/opportunities.js');
  screener.getScreener({ force: true });
  const lu = await attendreLeCalcul(screener);
  sortie.reperage = { status: lu.status, error: lu.error, matchs: lu.data?.matches?.length ?? 0, echecs: lu.data?.failures ?? [] };

  if (phase === 'verdicts') {
    sortie.reperageMarches = Object.fromEntries((lu.data?.matches ?? []).map((m) => [m.matchId, { pari: m.pari, lastLineupKnown: m.lastLineupKnown, homeId: m.homeId, awayId: m.awayId, markets: m.markets }]));
    // La page, à midi (cotes fraîches), puis à 16 h (plus de 3 h : à rafraîchir ; le match A a commencé).
    const page = getOpportunities({ maintenant: T0 });
    sortie.page = { status: page.status, resume: page.data?.resume, releve: page.data?.releve, lignes: page.data?.lignes ?? [] };
    sortie.pageTard = { lignes: getOpportunities({ maintenant: T0 + 4 * H }).data?.lignes ?? [] };
    // L'analyse de chaque match, par la route de Mes paris (scan) et de la page du match.
    const appel = await application();
    sortie.route = {};
    for (const m of MATCHS()) {
      const r = await appel('GET', `/api/analysis/match/${m.id}?source=odds-api&bankroll=10000`);
      sortie.route[m.id] = { code: r.code, staking: r.corps?.staking ?? null, verdicts: r.corps?.verdicts ?? null, edgePercent: r.corps?.edgePercent ?? null };
    }
    // Le moteur à 16 h (l'heure des cotes, la même), comme la route le donnerait à ce moment-là.
    const { findAdaptedMatch } = await imp('data/matchSources.js');
    const { enrichMatchWithRealAverages } = await imp('data/providers/matchEnrichment.js');
    const { analyzeMatch } = await imp('core/engine/oddsEngine.js');
    const { getEngineConfig } = await imp('core/engine/engineConfig.js');
    const { getTiltState } = await imp('core/engine/tiltState.js');
    const { getSport } = await imp('sports/index.js');
    const { fraicheurDuMatch } = await imp('data/cotesDeVosBookmakers.js');
    sortie.moteurTard = {};
    for (const m of MATCHS()) {
      const adapte = findAdaptedMatch('odds-api', m.id);
      const enrichi = await enrichMatchWithRealAverages(adapte, { sansRepliPayant: true });
      const r = await analyzeMatch({ ...enrichi, fraicheurCotes: fraicheurDuMatch(enrichi, { database, maintenant: T0 + 4 * H }) }, getEngineConfig('football'), getTiltState(), getSport('football'));
      sortie.moteurTard[m.id] = { staking: r.staking, verdicts: r.verdicts };
    }
    // Les opportunités vertes (la surveillance des notifications), par la route.
    const vertes = await appel('GET', '/api/opportunities/vertes');
    sortie.vertes = { code: vertes.code, corps: vertes.corps };
    sortie.vertesFonction = getOpportunitesVertes({ maintenant: T0 });
    const pageRoute = await appel('GET', '/api/opportunities');
    sortie.pageRoute = { code: pageRoute.code, status: pageRoute.corps?.status, lignes: pageRoute.corps?.data?.lignes?.length ?? null };
    // Les Chutes de cotes (la page des chutes), pour comparer les mouvements.
    const { droppingOdds } = await imp('data/droppingOdds.js');
    sortie.chutes = droppingOdds({ days: 3, minDropPct: 5, force: true, database });
    // Le Repérage tel que sa route le rend (avec les verdicts).
    const reperageRoute = await appel('GET', '/api/screener');
    sortie.reperageRoute = { code: reperageRoute.code, verdictA: reperageRoute.corps?.data?.matches?.find((m) => m.matchId === 'essai-a')?.markets?.find((k) => k.key === 'home')?.verdict ?? null };
  } else {
    // Sans nouveau relevé : la lecture des vertes ne relance aucun calcul.
    const avant = getOpportunitesVertes({ maintenant: T0 });
    sortie.sansNouveauReleve = { status: avant.status, vertes: avant.vertes.map((v) => v.cle) };
    // Un nouveau relevé (12 h 05) : William Hill baisse sa cote à domicile sur A — plus de value. Le calcul est périmé, il se refait.
    ecrireInstantane(MATCHS({ whA: [2.02, 3.5, 3.6] }), '2026-10-05T12:05:00.000Z');
    const apres = getOpportunitesVertes({ maintenant: T0 + 10 * MIN });
    sortie.nouveauReleve = { status: apres.status };
    const fini = await attendreLeCalcul(screener);
    sortie.apresCalcul = { status: fini.status, vertes: getOpportunitesVertes({ maintenant: T0 + 10 * MIN }).vertes.map((v) => v.cle) };
  }
} else if (phase === 'moteur') {
  // Le moteur sur des matchs de la base d'essai (comme les pronostics figés) : corners, tirs et tirs cadrés.
  const { enrichMatchWithRealAverages } = await imp('data/providers/matchEnrichment.js');
  const { analyzeMatch } = await imp('core/engine/oddsEngine.js');
  const { getEngineConfig } = await imp('core/engine/engineConfig.js');
  const { getTiltState } = await imp('core/engine/tiltState.js');
  const { getSport } = await imp('sports/index.js');
  const { adaptSeasonCalendarMatch } = await imp('data/adapters/seasonCalendarAdapter.js');
  const manifeste = JSON.parse(fs.readFileSync(fichierManifeste, 'utf8'));
  const lire = database.prepare('SELECT match_key, date, league, home_name, away_name FROM matches WHERE match_key = ?');
  sortie.analyses = [];
  for (const cible of manifeste.cibles) {
    if (sortie.analyses.length >= 12) break;
    const r = lire.get(cible.cle);
    const base = adaptSeasonCalendarMatch({ homeName: r.home_name, awayName: r.away_name, date: r.date, league: r.league }, 10000);
    const a = await analyzeMatch(await enrichMatchWithRealAverages(base, { sansRepliPayant: true }), getEngineConfig('football'), getTiltState(), getSport('football'));
    if (!a.statExpectations?.corners || !a.statExpectations?.shots || !a.statExpectations?.shotsOnTarget) continue;
    sortie.analyses.push({
      cle: cible.cle,
      match: `${r.home_name} - ${r.away_name}`,
      trueOdds: a.trueOdds,
      teamStats: a.teamStats ? { home: { name: a.teamStats.home?.name ?? null }, away: { name: a.teamStats.away?.name ?? null } } : null,
      statExpectations: a.statExpectations,
      statLines: a.statLines,
      marketPredictions: a.marketPredictions
    });
  }
} else {
  throw new Error(`Phase inconnue : ${phase}`);
}

console.log(JSON.stringify(sortie));
