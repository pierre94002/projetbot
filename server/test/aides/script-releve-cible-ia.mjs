/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-releve-cible-ia.mjs <serveur de la copie> <phase>
 *
 * Relevé ciblé (18/11/2026) — ce que l'analyse IA automatique en reçoit. Heure figée (05/10 12 h), réseau coupé, base
 * d'essai ; Claude SIMULÉ, FotMob SIMULÉ ; aucun client payant chargé. Phases :
 *   a4   élément A4 (décision RC6) : pour un même match et un même instant, la décision donnée à l'IA
 *        (calculerEngineResult, le vrai) est celle de la PAGE DU MATCH (la vraie route GET /api/analysis/match/:id) —
 *        « à rafraîchir » des deux côtés pour une cote trop vieille, « RECOMMENDED » des deux côtés pour une cote fraîche ;
 *        ce que le gel écrit (le vrai gelerAnalyse) est identique à l'octet avec et sans la fraîcheur jointe ;
 *   1b   lot 1b (décision RC5) : une analyse déjà faite pour le même match sous un AUTRE identifiant (bascule cal- ↔
 *        The Odds API d'un relevé ciblé) n'est pas refaite — analyses d'avance, d'avant coup d'envoi, réserve du jour ;
 *        des témoins : un autre jour, une entrée sans heure, d'autres matchs, eux, sont analysés.
 * Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { Socket } from 'node:net';
import { pathToFileURL } from 'node:url';
import { installerClaudeSimule, recopierScripts, pageComposition, onzeFictif } from './claudeSimule.mjs';
import { rencontre, listeDuJour, installerFauxFetch } from './fotmobSimule.mjs';

const [serveur, phase] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);
const T0 = Date.parse(process.env.CM_TEST_MAINTENANT);
const RUNTIME = path.join(serveur, 'data', 'runtime');
const ecrire = (nom, contenu) => {
  fs.mkdirSync(RUNTIME, { recursive: true });
  fs.writeFileSync(path.join(RUNTIME, nom), JSON.stringify(contenu, null, 1));
};

const { resolveDbPath, openDb } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error('Base inattendue');
const database = openDb();
const sortie = { ok: true, phase };

if (phase === 'a4') {
  // Garde : aucun client payant ne doit être chargé (le relevé n'est pas en jeu ici).
  const { getFixturePaths } = await imp('data/repositories/fixturesRepository.js');
  const fichierInstantane = getFixturePaths().odds;
  if (!path.resolve(fichierInstantane).toLowerCase().startsWith(path.resolve(serveur).toLowerCase())) throw new Error('Instantané hors de la copie');
  const livre = (key, title, [o1, ox, o2]) => ({ key, title, last_update: '2026-10-05T06:55:00Z', markets: [{ key: 'h2h', outcomes: [{ name: 'Man City', price: o1 }, { name: 'Liverpool', price: o2 }, { name: 'Draw', price: ox }] }] });
  /** Man City – Liverpool (06/10 19 h) : Pinnacle fixe la cote juste, William Hill paie au-dessus à domicile (value). */
  const contenu = [{ data: [{ id: 'essai-city-liverpool', sport_key: 'soccer_epl', sport_title: 'EPL', commence_time: '2026-10-06T19:00:00Z', home_team: 'Man City', away_team: 'Liverpool', bookmakers: [livre('pinnacle', 'Pinnacle', [2.0, 3.6, 3.9]), livre('williamhill', 'William Hill', [2.3, 3.4, 3.3]), livre('betclic_fr', 'Betclic (FR)', [1.9, 3.3, 3.6])] }] }];
  const { archiverReleveSiNouveau } = await imp('data/enregistreurs/cotesPayantes.js');
  const file = await imp('data/enregistreurs/file.js');
  const releve = async (mtime) => {
    fs.mkdirSync(path.dirname(fichierInstantane), { recursive: true });
    fs.writeFileSync(fichierInstantane, JSON.stringify(contenu));
    fs.utimesSync(fichierInstantane, new Date(mtime), new Date(mtime));
    archiverReleveSiNouveau({ maintenant: T0, database });
    await file.vider({ maintenant: T0, database });
  };
  const { createApp } = await imp('app.js');
  const app = createApp();
  const get = (url) =>
    new Promise((resolve, reject) => {
      const req = new http.IncomingMessage(new Socket());
      req.method = 'GET';
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
  const { calculerEngineResult } = await imp('core/ai/autoMatchAiTrigger.js');
  const { listAdaptedMatches } = await imp('data/matchSources.js');
  const C = await imp('core/ai/compactContext.js');
  const gel = await imp('data/enregistreurs/gelPronostics.js');
  /** La ligne « Mise (staking) » que l'IA lit dans sa fiche (compactContext.js). */
  const ligneDeMise = (staking) =>
    C.ficheAvantMatch({ home: 'Man City', away: 'Liverpool', league: 'EPL', commenceTime: '2026-10-06T19:00:00.000Z', timing: 'avance', engineSummary: { staking: staking ?? null } })
      .split('\n')
      .find((l) => l.startsWith('Mise (staking) : ')) ?? null;
  const decision = (s) => ({ action: s?.action ?? null, reason: s?.reason ?? null, bookmaker: s?.bookmaker ?? s?.aRafraichir?.bookmaker ?? null, fraicheur: s?.fraicheur?.code ?? s?.aRafraichir?.fraicheur?.code ?? null });
  /** Ce que le gel écrit (le vrai gelerAnalyse, mis en file), sans son heure d'écriture. */
  const ceQueLeGelEcrit = (x) => {
    const avant = file.lignesEnAttente('gel').length;
    gel.gelerAnalyse({ ...x, database, maintenant: T0 });
    const lignes = file.lignesEnAttente('gel');
    if (lignes.length !== avant + 1) return null;
    return JSON.stringify({ ...lignes.at(-1), recordedAt: null });
  };
  const cas = async (nom, mtime) => {
    await releve(mtime);
    const page = await get('/api/analysis/match/essai-city-liverpool?source=odds-api&bankroll=10000');
    const m = listAdaptedMatches('odds-api', 10000).find((x) => x.matchId === 'essai-city-liverpool');
    const avec = [];
    const sans = [];
    const ia = await calculerEngineResult(m, { geler: (x) => avec.push(x) });
    // Le chemin d'avant l'élément A4 (fraîcheur non jointe) : pour comparer ce que le gel écrit.
    const iaSans = await calculerEngineResult(m, { geler: (x) => sans.push(x), fraicheur: (x) => x });
    sortie[nom] = {
      page: { code: page.code, ...decision(page.corps?.staking) },
      ia: decision(ia?.staking),
      ligneIA: ligneDeMise(ia?.staking),
      ligneIASansFraicheur: ligneDeMise(iaSans?.staking),
      gel: {
        appels: [avec.length, sans.length],
        memeMatch: avec[0]?.match === m && sans[0]?.match === m,
        memeAVerifier: JSON.stringify(avec[0]?.aVerifier ?? null) === JSON.stringify(sans[0]?.aVerifier ?? null),
        identique: Boolean(avec[0] && sans[0]) && ceQueLeGelEcrit(avec[0]) === ceQueLeGelEcrit(sans[0]) && ceQueLeGelEcrit(avec[0]) !== null,
        lignes: (() => {
          const e = ceQueLeGelEcrit(avec[0]);
          return e ? JSON.parse(e).pronostics?.length ?? null : null;
        })()
      }
    };
  };
  // Trop vieille : relevée à 7 h, il est 12 h (délai par défaut : 3 h).
  await cas('vieille', '2026-10-05T07:00:00.000Z');
  // Fraîche : relevée à 11 h.
  await cas('fraiche', '2026-10-05T11:00:00.000Z');
} else if (phase === '1b') {
  recopierScripts(serveur);
  const JOUR = '2026-10-05';
  const COUP = '2026-10-05T12:30:00.000Z';
  ecrire('budget-claude.json', { tokensParJour: 5_000_000, tokensParSemaine: 50_000_000, mode: 'auto', enregistreLe: '2026-10-05T08:00:00.000Z' });
  ecrire('favorites.json', { teams: [], leagues: [{ name: 'EPL', addedAt: '2026-10-03T18:14:00.741Z' }, { name: 'Championship', addedAt: '2026-10-03T18:14:00.741Z' }] });
  ecrire('season-calendar.json', [
    // Aujourd'hui : deux matchs à 12 h 30 (heure FotMob) — analyses d'avant coup d'envoi.
    { league: 'EPL', homeName: 'Leeds', awayName: 'Newcastle', date: JOUR },
    { league: 'Championship', homeName: 'Birmingham', awayName: 'Sheffield United', date: JOUR },
    // Demain : analyses d'avance.
    { league: 'EPL', homeName: 'Everton', awayName: 'Tottenham', date: '2026-10-06' },
    { league: 'EPL', homeName: 'Arsenal', awayName: 'Chelsea', date: '2026-10-06' },
    { league: 'EPL', homeName: 'Brighton', awayName: 'Wolves', date: '2026-10-06' },
    { league: 'EPL', homeName: 'Fulham', awayName: 'Brentford', date: '2026-10-06' }
  ]);
  const entree = (matchId, homeName, awayName, league, { commenceTime = null, timing = 'avance', analysedAt }) => ({
    matchId,
    homeName,
    awayName,
    league,
    commenceTime,
    model: 'claude-code:sonnet',
    timing,
    analysedAt,
    createdAt: analysedAt,
    engineSnapshot: { marketPredictions: [] },
    analysis: { summary: 'Analyse d’essai.', marketViews: [] }
  });
  ecrire('match-ai-analyses.json', [
    // Everton – Tottenham : déjà analysé sous l'identifiant The Odds API d'un relevé précédent.
    entree('essai-oddsapi-everton', 'Everton', 'Tottenham', 'EPL', { commenceTime: '2026-10-06T19:00:00.000Z', analysedAt: '2026-10-04T18:00:00.000Z' }),
    // Témoins : la même affiche un autre jour (il y a 5 jours) ; une entrée sans heure de coup d'envoi.
    entree('essai-oddsapi-brighton', 'Brighton', 'Wolves', 'EPL', { commenceTime: '2026-10-01T19:00:00.000Z', timing: 'coup-d-envoi', analysedAt: '2026-10-01T18:10:00.000Z' }),
    entree('essai-sans-heure-fulham', 'Fulham', 'Brentford', 'EPL', { analysedAt: '2026-09-20T10:00:00.000Z' }),
    // Leeds – Newcastle : l'analyse d'AVANCE sous l'identifiant du calendrier, celle d'AVANT COUP D'ENVOI (11 h 50) sous
    // l'identifiant The Odds API — la plus avancée compte.
    entree('cal-2026-10-05-Leeds-Newcastle', 'Leeds', 'Newcastle', 'EPL', { commenceTime: '2026-10-05T12:00:00.000Z', analysedAt: '2026-10-04T09:00:00.000Z' }),
    entree('essai-oddsapi-leeds', 'Leeds', 'Newcastle', 'EPL', { commenceTime: COUP, timing: 'coup-d-envoi', analysedAt: '2026-10-05T11:50:00.000Z' })
  ]);
  const K1 = { id: 4900501, home: ['Leeds', 8463], away: ['Newcastle', 10261] };
  const K2 = { id: 4900502, home: ['Birmingham', 8658], away: ['Sheffield United', 8657] };
  installerFauxFetch({
    listes: {
      20261004: listeDuJour([]),
      20261005: listeDuJour([rencontre({ id: K1.id, home: K1.home, away: K1.away, coup: COUP }), rencontre({ id: K2.id, home: K2.home, away: K2.away, coup: COUP })]),
      20261006: listeDuJour([]),
      20261007: listeDuJour([])
    },
    details: {
      [K1.id]: pageComposition({ home: K1.home, away: K1.away, onzeDom: onzeFictif(7100, 'Leeds'), onzeExt: onzeFictif(7200, 'Newcastle'), coup: COUP }),
      [K2.id]: pageComposition({ home: K2.home, away: K2.away, onzeDom: onzeFictif(7300, 'Birmingham'), onzeExt: onzeFictif(7400, 'Sheffield United'), coup: COUP })
    }
  });
  const claude = await installerClaudeSimule(serveur, { tokens: () => 20_000 });
  const auto = await imp('core/ai/autoMatchAiTrigger.js');
  const { listAll } = await imp('data/repositories/matchAiAnalysisRepository.js');
  const qui = () => claude.appels.map((a) => `${a.type}:${a.match?.home ?? '?'}`);
  // La fonction seule.
  // Sur le code d'avant le lot (les poses), la fonction manque : c'est dit dans la sortie, sans arrêter l'essai.
  const trouve = (m) => (typeof auto.analyseDejaFaite === 'function' ? auto.analyseDejaFaite(m)?.matchId ?? null : 'fonction absente');
  sortie.fonction = {
    everton: trouve({ matchId: 'cal-2026-10-06-Everton-Tottenham', home: 'Everton', away: 'Tottenham', league: 'EPL', commenceTime: '2026-10-06T12:00:00Z' }),
    evertonAutreChampionnat: trouve({ matchId: 'x', home: 'Everton', away: 'Tottenham', league: 'Championship', commenceTime: '2026-10-06T12:00:00Z' }),
    evertonDansUneSemaine: trouve({ matchId: 'x', home: 'Everton', away: 'Tottenham', league: 'EPL', commenceTime: '2026-10-13T19:00:00Z' }),
    brighton: trouve({ matchId: 'x', home: 'Brighton', away: 'Wolves', league: 'EPL', commenceTime: '2026-10-06T12:00:00Z' }),
    fulham: trouve({ matchId: 'x', home: 'Fulham', away: 'Brentford', league: 'EPL', commenceTime: '2026-10-06T12:00:00Z' }),
    leeds: trouve({ matchId: 'cal-2026-10-05-Leeds-Newcastle', home: 'Leeds', away: 'Newcastle', league: 'EPL', commenceTime: '2026-10-05T12:00:00Z' }),
    parIdentifiant: trouve({ matchId: 'essai-oddsapi-everton', home: 'Autre', away: 'Nom', league: 'EPL', commenceTime: 'pas une date' })
  };
  // La réserve du jour (avant coup d'envoi) : Leeds est déjà fait, Birmingham non.
  sortie.reserve = await auto.reserveCoupDEnvoi(T0);
  // Les analyses d'avance : Everton est déjà fait ; Arsenal, Brighton (autre jour) et Fulham (entrée sans heure) le sont.
  const avance = await auto.runAutoPreMatchAnalyses({ limit: 10 });
  sortie.avance = { ok: avance.ok, failed: avance.failed, candidates: avance.candidates, samples: avance.samples ?? [], appels: qui() };
  // Les analyses d'avant coup d'envoi : Leeds est déjà fait (sous l'autre identifiant), Birmingham non.
  const avantCoup = await auto.runKickoffPreMatchAnalyses({ limit: 10 });
  sortie.coupDEnvoi = { ok: avantCoup.ok, failed: avantCoup.failed, candidates: avantCoup.candidates, enAttente: avantCoup.enAttente, samples: avantCoup.samples ?? [], appels: qui().slice(sortie.avance.appels.length) };
  // Les analyses neuves sont rangées sous l'identifiant du moment.
  sortie.rangees = listAll().map((e) => [e.matchId, e.timing ?? null]).sort();
} else if (phase === 's6s8') {
  // Corrections S6 et S8 (relecture Fable, RC5 bis). Heure figée : 05/10 12 h.
  //  S6 : Aston Villa – Burnley (EPL, 12 h 30) a été analysé AVANT SON COUP D'ENVOI il y a 20 min sous l'identifiant du
  //       calendrier (sans cote payante) ; un relevé ciblé lui a donné depuis l'identifiant The Odds API et des cotes
  //       payées. La réserve le compte ; la passe le refait UNE fois sous l'identifiant du moment ; la passe suivante,
  //       plus rien.
  //  S8 : Wolves – Everton (EPL, joué hier 1-1) a deux analyses : d'avance sous `cal-`, au coup d'envoi sous l'identifiant
  //       The Odds API. Une seule revue, sur celle du coup d'envoi ; la passe suivante, aucune.
  recopierScripts(serveur);
  const COUP = '2026-10-05T12:30:00.000Z';
  ecrire('budget-claude.json', { tokensParJour: 5_000_000, tokensParSemaine: 50_000_000, mode: 'auto', enregistreLe: '2026-10-05T08:00:00.000Z' });
  ecrire('season-calendar.json', []);
  const { getFixturePaths } = await imp('data/repositories/fixturesRepository.js');
  const fichierInstantane = getFixturePaths().odds;
  if (!path.resolve(fichierInstantane).toLowerCase().startsWith(path.resolve(serveur).toLowerCase())) throw new Error('Instantané hors de la copie');
  const livre = (key, title, [o1, ox, o2]) => ({ key, title, last_update: '2026-10-05T11:55:00Z', markets: [{ key: 'h2h', outcomes: [{ name: 'Aston Villa', price: o1 }, { name: 'Burnley', price: o2 }, { name: 'Draw', price: ox }] }] });
  fs.mkdirSync(path.dirname(fichierInstantane), { recursive: true });
  fs.writeFileSync(
    fichierInstantane,
    JSON.stringify([{ data: [{ id: 'essai-oddsapi-villa', sport_key: 'soccer_epl', sport_title: 'EPL', commence_time: COUP, home_team: 'Aston Villa', away_team: 'Burnley', bookmakers: [livre('pinnacle', 'Pinnacle', [1.8, 3.8, 4.6]), livre('williamhill', 'William Hill', [1.85, 3.7, 4.4])] }] }])
  );
  fs.utimesSync(fichierInstantane, new Date('2026-10-05T11:55:00Z'), new Date('2026-10-05T11:55:00Z'));
  const entree = (matchId, homeName, awayName, { commenceTime, timing, analysedAt }) => ({
    matchId,
    homeName,
    awayName,
    league: 'EPL',
    commenceTime,
    model: 'claude-code:sonnet',
    timing,
    analysedAt,
    createdAt: analysedAt,
    engineSnapshot: { marketPredictions: [] },
    analysis: { summary: 'Analyse d’essai.', marketViews: [] }
  });
  ecrire('match-ai-analyses.json', [
    entree('cal-2026-10-05-Aston Villa-Burnley', 'Aston Villa', 'Burnley', { commenceTime: COUP, timing: 'coup-d-envoi', analysedAt: '2026-10-05T11:40:00.000Z' }),
    entree('cal-2026-10-04-Wolves-Everton', 'Wolves', 'Everton', { commenceTime: '2026-10-04T12:00:00.000Z', timing: 'avance', analysedAt: '2026-10-03T09:00:00.000Z' }),
    entree('essai-oddsapi-wolves', 'Wolves', 'Everton', { commenceTime: '2026-10-04T14:00:00.000Z', timing: 'coup-d-envoi', analysedAt: '2026-10-04T13:10:00.000Z' })
  ]);
  database.prepare('INSERT INTO matches (match_key, match_id, date, league, home_name, away_name, home_goals, away_goals) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('essai-s8-wolves', 'essai-s8', '2026-10-04', 'EPL', 'Wolves', 'Everton', 1, 1);
  installerFauxFetch({ listes: { 20261004: listeDuJour([]), 20261005: listeDuJour([]), 20261006: listeDuJour([]), 20261007: listeDuJour([]) }, details: {} });
  const claude = await installerClaudeSimule(serveur, { tokens: () => 20_000 });
  const auto = await imp('core/ai/autoMatchAiTrigger.js');
  const { listAll } = await imp('data/repositories/matchAiAnalysisRepository.js');
  const qui = (n) => claude.appels.slice(n).map((a) => `${a.type}:${a.match?.home ?? a.matchId ?? '?'}`);
  // S6.
  sortie.reserveAvant = await auto.reserveCoupDEnvoi(T0);
  let n = claude.appels.length;
  const p1 = await auto.runKickoffPreMatchAnalyses({ limit: 10 });
  sortie.passe1 = { ok: p1.ok, failed: p1.failed, samples: p1.samples ?? [], appels: qui(n) };
  n = claude.appels.length;
  const p2 = await auto.runKickoffPreMatchAnalyses({ limit: 10 });
  sortie.passe2 = { ok: p2.ok, failed: p2.failed, appels: qui(n) };
  sortie.reserveApres = await auto.reserveCoupDEnvoi(T0);
  sortie.rangeesS6 = listAll().filter((e) => e.homeName === 'Aston Villa').map((e) => [e.matchId, e.timing ?? null]).sort();
  // S8.
  n = claude.appels.length;
  const r1 = await auto.runAutoPostMatchReviews({ limit: 5 });
  sortie.revue1 = { ok: r1.ok, failed: r1.failed, samples: r1.samples ?? [], appels: qui(n), revues: listAll().filter((e) => e.postMatchReview).map((e) => e.matchId).sort() };
  n = claude.appels.length;
  const r2 = await auto.runAutoPostMatchReviews({ limit: 5 });
  sortie.revue2 = { ok: r2.ok, appels: qui(n), revues: listAll().filter((e) => e.postMatchReview).map((e) => e.matchId).sort() };
} else {
  throw new Error(`Phase inconnue : ${phase}`);
}

console.log(JSON.stringify(sortie));
