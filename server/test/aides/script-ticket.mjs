/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-ticket.mjs <serveur de la copie> <phase> <dossier ui/src>
 *
 * Étape 10 du plan — le comparateur et « J'ai parié ». Ce script ne vérifie rien : il fait produire au
 * VRAI serveur (routes Express appelées sans réseau, moteur, base d'essai copiée, heure figée) ce que
 * le test lit. La copie garde son data/runtime d'une phase à l'autre (même dossier) :
 *   - phase « pari » (05/10/2026 12 h UTC) : un faux relevé The Odds API (Man City – Liverpool à
 *     18 h 30, Pinnacle, William Hill, Betclic), archivé comme le font les Enregistreurs ; des cotes
 *     GRATUITES pour ce match (ouverture la veille, relevés du matin, CLÔTURE à 18 h 25) ; une cote
 *     saisie à la main (corners) ; l'analyse du match (le comparateur) ; puis des paris envoyés comme
 *     l'écran les envoie — le corps est construit par ui/src/utils/ticket.js et comparateur.js, les
 *     vraies règles de l'écran — et d'autres, au format d'avant ou refusés ; enfin GET /api/bets.
 *     Les paris d'AVANT (bets.json de la copie) sont fabriqués par le test.
 *   - phase « cloture » (le lendemain) : la valeur de clôture des paris (closingValue.js), le
 *     règlement à blanc (settlePending sans écrire) et les règles de règlement de chaque sélection.
 * Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { Socket } from 'node:net';
import { pathToFileURL } from 'node:url';

const [serveur, phase, uiSrc] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);
const ui = (rel) => import(pathToFileURL(path.join(uiSrc, rel)).href);
const T0 = Date.parse(process.env.CM_TEST_MAINTENANT);

const { resolveDbPath, openDb } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error('Base inattendue');
const database = openDb();
const { getFixturePaths } = await imp('data/repositories/fixturesRepository.js');
const fichierInstantane = getFixturePaths().odds;
if (!path.resolve(fichierInstantane).toLowerCase().startsWith(path.resolve(serveur).toLowerCase())) throw new Error(`Instantané hors de la copie : ${fichierInstantane}`);
const fichierParis = path.join(serveur, 'data', 'runtime', 'bets.json');

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

const sortie = { ok: true, phase, instant: new Date(T0).toISOString() };

if (phase === 'pari') {
  // ------------------------------------------------ le relevé payant de 11 h 50, archivé
  const h2h = (home, away, [o1, ox, o2]) => ({ key: 'h2h', outcomes: [{ name: home, price: o1 }, { name: away, price: o2 }, { name: 'Draw', price: ox }] });
  const livre = (key, title, cotes) => ({ key, title, last_update: '2026-10-05T11:45:00Z', markets: [h2h('Man City', 'Liverpool', cotes)] });
  const releve = [
    {
      id: 'essai-a',
      sport_key: 'soccer_epl',
      sport_title: 'EPL',
      commence_time: '2026-10-05T18:30:00Z',
      home_team: 'Man City',
      away_team: 'Liverpool',
      bookmakers: [livre('pinnacle', 'Pinnacle', [2.0, 3.6, 3.9]), livre('williamhill', 'William Hill', [2.3, 3.4, 3.3]), livre('betclic_fr', 'Betclic (FR)', [1.9, 3.3, 3.6])]
    }
  ];
  fs.mkdirSync(path.dirname(fichierInstantane), { recursive: true });
  fs.writeFileSync(fichierInstantane, JSON.stringify([{ data: releve }]));
  const t = new Date('2026-10-05T11:50:00.000Z');
  fs.utimesSync(fichierInstantane, t, t);
  const { archiverReleveSiNouveau } = await imp('data/enregistreurs/cotesPayantes.js');
  const { vider } = await imp('data/enregistreurs/file.js');
  archiverReleveSiNouveau({ maintenant: T0, database });
  await vider({ maintenant: T0, database });

  // ------------------------------------------------ les cotes gratuites : ouverture, matin, clôture
  const { clubDuMagasin } = await imp('data/db/oddsProfileRead.js');
  const ids = { home: clubDuMagasin('Man City', 'EPL', database), away: clubDuMagasin('Liverpool', 'EPL', database) };
  sortie.ids = ids;
  const { upsertQuotes } = await imp('data/db/oddsQuotesRepository.js');
  const gratuite = (bookmaker, kind, releveAt, market, line, selection, price) => ({
    source: 'espn',
    sourceEvent: 'espn-city-liverpool',
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
    homeId: ids.home,
    awayId: ids.away,
    homeName: 'Manchester City',
    awayName: 'Liverpool',
    provenance: 'espn (essai)'
  });
  const lignes = [];
  for (const [kind, releveAt, cotes] of [
    ['open', '2026-10-04T09:00:00Z', [2.3, 3.4, 3.2]],
    ['snapshot', '2026-10-05T11:00:00Z', [2.1, 3.5, 3.6]],
    ['close', '2026-10-05T18:25:00Z', [1.95, 3.7, 4.1]]
  ]) {
    ['home', 'draw', 'away'].forEach((sel, i) => lignes.push(gratuite('DraftKings', kind, releveAt, '1x2', 0, sel, cotes[i])));
    lignes.push(gratuite('DraftKings', kind, releveAt, 'ou', 2.5, 'over', kind === 'close' ? 1.75 : 1.9));
    lignes.push(gratuite('DraftKings', kind, releveAt, 'ou', 2.5, 'under', kind === 'close' ? 2.1 : 1.95));
  }
  sortie.gratuites = upsertQuotes(lignes, { database });

  const appel = await application();

  // ------------------------------------------------ une cote saisie à la main (corners), puis l'analyse
  sortie.saisie = (await appel('PUT', '/api/odds/saisies', { matchId: 'essai-a', bookmaker: 'williamhill', marketId: 'totalCorners', sens: 'over', ligne: 9.5, cote: 2.25 })).code;
  const analyse = await appel('GET', '/api/analysis/match/essai-a?source=odds-api&bankroll=10000&includeCorners=false');
  sortie.analyse = { code: analyse.code, corps: analyse.corps };
  const saisies = (await appel('GET', '/api/odds/saisies?matchId=essai-a')).corps;
  sortie.saisies = saisies;
  const fixture = (await appel('GET', `/api/odds/fixture?home=Man%20City&away=Liverpool&league=EPL&commenceTime=${encodeURIComponent('2026-10-05T18:30:00Z')}`)).corps;
  sortie.fixture = fixture;

  // ------------------------------------------------ les paris, construits par les règles de l'écran
  const C = await ui('utils/comparateur.js');
  const K = await ui('utils/ticket.js');
  const match = { matchId: 'essai-a', home: 'Man City', away: 'Liverpool', league: 'EPL', commenceTime: '2026-10-05T18:30:00Z' };
  const lu = C.lireLeComparateur({ result: analyse.corps, saisies, cotes: fixture, match, maintenant: T0 });
  const resultat = lu.tables.find((x) => x.cle === 'resultat');
  const domicile = resultat.lignes.find((l) => l.issue === 'home');
  const corners = lu.tables.flatMap((x) => x.lignes).find((l) => l.libelle === 'Plus de 9,5 corners');
  const selDomicile = K.selectionDeLaLigne({ match, ligne: domicile, case: domicile.cases.williamhill, calculeLe: lu.calculeLe });
  const selCorners = K.selectionDeLaLigne({ match, ligne: corners, case: corners.cases.williamhill, calculeLe: lu.calculeLe });
  const bookmakers = lu.vosBookmakers;
  const envoyer = async (nom, corps) => {
    const r = await appel('POST', '/api/bets', corps);
    sortie.envois[nom] = { corps, code: r.code, reponse: r.corps };
  };
  sortie.envois = {};
  sortie.selections = { domicile: selDomicile, corners: selCorners };
  // 1. « J'ai parié » sur la case de William Hill (la value du moteur), 10 €.
  await envoyer('domicile', K.pariAEnregistrer({ selections: [selDomicile], edition: { bookmaker: 'williamhill', cotes: {}, coteCombinee: null }, mise: 10, origine: 'page-du-match', maintenant: T0, bookmakers }));
  // 2. La même issue chez Unibet (pas dans le relevé) : cote tapée au moment du pari.
  await envoyer('tapee', K.pariAEnregistrer({ selections: [{ ...selDomicile }], edition: { bookmaker: 'unibet_nl', cotes: { [K.cleDeSelection(selDomicile)]: 2.25 }, coteCombinee: null }, mise: 5, origine: 'page-du-match', maintenant: T0, bookmakers }));
  // 3. Les corners saisis (William Hill 2,25).
  await envoyer('corners', K.pariAEnregistrer({ selections: [selCorners], edition: { bookmaker: 'williamhill', cotes: {}, coteCombinee: null }, mise: 8, origine: 'page-du-match', maintenant: T0, bookmakers }));
  // 4. Un combiné du même match sans la cote du bookmaker : refusé ; avec : enregistré.
  await envoyer('combineSansCote', K.pariAEnregistrer({ selections: [selDomicile, selCorners], edition: { bookmaker: 'williamhill', cotes: {}, coteCombinee: null }, mise: 4, origine: 'page-du-match', maintenant: T0, bookmakers }));
  await envoyer('combine', K.pariAEnregistrer({ selections: [selDomicile, selCorners], edition: { bookmaker: 'williamhill', cotes: {}, coteCombinee: 4.6 }, mise: 4, origine: 'page-du-match', maintenant: T0, bookmakers }));
  // 5. Le format d'avant (le bordereau d'avant l'étape 10) : rien de nouveau, accepté tel quel.
  const ancien = { matchId: 'essai-a', homeName: 'Man City', awayName: 'Liverpool', league: 'EPL', commenceTime: '2026-10-05T18:30:00Z', market: 'Total buts', marketId: 'totalGoals', params: { line: 2.5, side: 'over' }, pick: 'Plus de 2.5 buts', odds: 1.28 };
  await envoyer('ancien', { stake: 3, legs: [ancien] });
  // 6. Deux matchs différents (l'accumulateur d'avant) : la cote est le produit.
  await envoyer('deuxMatchs', { stake: 2, legs: [ancien, { ...ancien, matchId: 'autre-match', homeName: 'Arsenal', awayName: 'Chelsea', pick: 'Moins de 2.5 buts', params: { line: 2.5, side: 'under' }, odds: 2.1 }] });
  // 7. Refus.
  await envoyer('deuxBookmakers', { stake: 2, legs: [{ ...ancien, bookmaker: 'williamhill' }, { ...ancien, matchId: 'autre-match', homeName: 'Arsenal', awayName: 'Chelsea', bookmaker: 'betsson' }] });
  await envoyer('probabiliteHors', { stake: 2, legs: [{ ...ancien, probabiliteMoteur: 1.2 }] });
  await envoyer('probabiliteEnPourcent', { stake: 2, legs: [{ ...ancien, probabiliteMoteur: 58 }] });
  await envoyer('sourceInconnue', { stake: 2, legs: [{ ...ancien, coteSource: 'pinnacle' }] });
  await envoyer('bookmakerEnClair', { stake: 2, legs: [{ ...ancien, bookmaker: 'William Hill' }] });
  await envoyer('dateIllisible', { stake: 2, legs: [{ ...ancien, coteReleveeA: 'hier soir' }] });
  await envoyer('origineInconnue', { stake: 2, legs: [ancien], origine: 'ailleurs' });
  await envoyer('cotePriseBasse', { stake: 2, legs: [ancien, { ...ancien, pick: 'Oui', market: 'Les 2 équipes marquent', marketId: 'bothTeamsScore', params: { outcome: 'yes' }, odds: 1.6 }], cotePrise: 0.9 });

  sortie.liste = (await appel('GET', '/api/bets')).corps;
  sortie.carnet = JSON.parse(fs.readFileSync(fichierParis, 'utf8'));
} else if (phase === 'cloture') {
  const { closingValueReport } = await imp('data/closingValue.js');
  sortie.cloture = await closingValueReport({ scope: 'bets', force: true, database });
  const { settlePending } = await imp('data/providers/settlementService.js');
  sortie.reglement = settlePending({ apply: false, database });
  const { deriveBetLegOutcome } = await imp('core/settlement/settlementRules.js');
  const carnet = JSON.parse(fs.readFileSync(fichierParis, 'utf8'));
  // Les règles de règlement lisent chaque sélection : Man City 2 – 1 Liverpool, 6 + 5 corners.
  sortie.issues = carnet.flatMap((b) => b.legs.map((l) => ({ betId: b.id, pick: l.pick, market: l.market, issue: deriveBetLegOutcome(l, 2, 1, { home: { corners: 6 }, away: { corners: 5 } }) })));
  sortie.carnet = carnet;
} else {
  throw new Error(`Phase inconnue : ${phase}`);
}

console.log(JSON.stringify(sortie));
