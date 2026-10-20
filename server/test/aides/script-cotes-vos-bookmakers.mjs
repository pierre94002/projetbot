/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-cotes-vos-bookmakers.mjs <serveur de la copie> <phase>
 *
 * Étape 7 du plan — les cotes de VOS bookmakers : fraîches, archivées, saisies.
 * Un faux instantané The Odds API (odds-snapshot.json de la COPIE), la base
 * d'essai, réseau coupé, heure figée (CM_TEST_MAINTENANT). Phases :
 *   saisies   saisir, rejouer (idempotent), corriger, retirer ; value face au moteur ;
 *             archive (source « saisie ») ; écrans des cotes gratuites inchangés ;
 *             verrou tenu par un import : rien d'écrit, « en attente », puis écrit ;
 *   analyse   l'heure des cotes payantes lue dans l'archive, la value fraîche ou
 *             « à rafraîchir », par le moteur puis par la route Express ;
 *   routes    aucune route n'appelle The Odds API, sauf POST /api/sources/odds/refresh
 *             (le client payant est REMPLACÉ par un espion : rien ne part) ;
 *   releve    le relevé payant (espion qui répond) garde son bilan : crédits restants,
 *             coût ; le conseil de relevé le lit ;
 *   conseil   le conseil de relevé sur un cas fabriqué (compositions annoncées).
 * Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { Socket } from 'node:net';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';

const [serveur, phase] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);
const T0 = Date.parse(process.env.CM_TEST_MAINTENANT);
const MIN = 60_000;
const H = 3_600_000;
const iso = (t) => new Date(t).toISOString();

// ------------------------------------------------- l'espion du client payant
// Le vrai oddsApiClient.js n'est JAMAIS chargé dans les phases « routes » et
// « releve » : un module à sa place note chaque appel. Sans réponse prévue, il
// lève (comme une clé absente) ; rien ne sort de ce processus (garde.mjs).
if (phase === 'routes' || phase === 'releve') {
  globalThis.__appelsPayants = [];
  const ESPION = `export async function getSportOddsRaw(sportKey, options = {}) {
    globalThis.__appelsPayants.push(sportKey);
    const r = globalThis.__reponsePayante ? globalThis.__reponsePayante(sportKey, options) : null;
    if (!r) throw new Error('appel payant intercepté par le test : ' + sportKey);
    if (r.erreur) throw Object.assign(new Error(r.erreur), { quota: r.quota });
    return r;
  }`;
  registerHooks({
    load(url, context, nextLoad) {
      if (/[\\/]data[\\/]providers[\\/]oddsApiClient\.js$/.test(decodeURIComponent(new URL(url).pathname))) {
        return { format: 'module', source: ESPION, shortCircuit: true };
      }
      return nextLoad(url, context);
    }
  });
}

const { resolveDbPath, openDb } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error('Base inattendue');
const database = openDb();
const { getFixturePaths } = await imp('data/repositories/fixturesRepository.js');
const fichierInstantane = getFixturePaths().odds;
if (!path.resolve(fichierInstantane).toLowerCase().startsWith(path.resolve(serveur).toLowerCase())) throw new Error(`Instantané hors de la copie : ${fichierInstantane}`);

// ------------------------------------------------- le faux relevé payant
const KICKOFF = '2026-10-06T19:00:00Z';
const h2h = (home, away, [o1, ox, o2]) => ({ key: 'h2h', outcomes: [{ name: home, price: o1 }, { name: away, price: o2 }, { name: 'Draw', price: ox }] });
const livre = (key, title, home, away, cotes) => ({ key, title, last_update: '2026-10-05T10:55:00Z', markets: [h2h(home, away, cotes)] });
/** Man City – Liverpool : Pinnacle fixe la cote juste, William Hill paie au-dessus à domicile (value d'environ +11 %). */
const instantane = ({ coupDEnvoi = KICKOFF, wh = [2.3, 3.4, 3.3] } = {}) => [
  {
    data: [
      {
        id: 'essai-city-liverpool',
        sport_key: 'soccer_epl',
        sport_title: 'EPL',
        commence_time: coupDEnvoi,
        home_team: 'Man City',
        away_team: 'Liverpool',
        bookmakers: [
          livre('pinnacle', 'Pinnacle', 'Man City', 'Liverpool', [2.0, 3.6, 3.9]),
          livre('williamhill', 'William Hill', 'Man City', 'Liverpool', wh),
          livre('betclic_fr', 'Betclic (FR)', 'Man City', 'Liverpool', [1.9, 3.3, 3.6])
        ]
      }
    ]
  }
];
const ecrireInstantane = (contenu, mtimeIso) => {
  fs.mkdirSync(path.dirname(fichierInstantane), { recursive: true });
  fs.writeFileSync(fichierInstantane, JSON.stringify(contenu));
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

const sortie = { ok: true, phase };

if (phase === 'saisies') {
  ecrireInstantane(instantane(), '2026-10-05T11:00:00.000Z');
  const S = await imp('data/saisiesCotes.js');
  const oq = await imp('data/db/oddsQuotesRepository.js');
  const { clubDuMagasin } = await imp('data/db/oddsProfileRead.js');
  const { etatDeLaFile } = await imp('data/enregistreurs/file.js');
  const MATCH = 'essai-city-liverpool';
  const homeId = clubDuMagasin('Man City', 'EPL', database);
  const awayId = clubDuMagasin('Liverpool', 'EPL', database);
  sortie.ids = { homeId, awayId };
  const lignesSaisies = () =>
    database
      .prepare("SELECT q.bookmaker, q.market, q.selection, q.line, q.releve_at AS r, q.price, q.kind FROM odds_quotes q JOIN odds_events e ON e.id = q.event_id WHERE e.source = 'saisie' ORDER BY q.seq, q.market, q.selection")
      .all();
  const sansHeure = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k === 'generatedAt' || k === 'updatedAt' ? undefined : v)));
  const lecturesGratuites = () =>
    sansHeure({
      fixture: oq.quotesForFixture({ homeId, awayId, date: '2026-10-06' }, { database }),
      avecPayantes: oq.quotesForFixture({ homeId, awayId, date: '2026-10-06' }, { database, avecPayantes: true }),
      resume: oq.quotesSummary({ database, withQuotes: true }),
      resumePayantes: oq.quotesSummary({ database, withQuotes: true, avecPayantes: true }),
      reference: Object.fromEntries(oq.latestPrematch1x2({ from: '2026-10-04', to: '2026-10-08', database }))
    });
  const avant = lecturesGratuites();

  // 1. Rien de saisi : le formulaire a vos bookmakers et les marchés.
  const vide = await S.etatDesSaisies({ matchId: MATCH, maintenant: T0 });
  sortie.vide = { saisies: vide.saisies.length, bookmakers: vide.bookmakers.map((b) => b.cle), marches: vide.marches.map((m) => m.id), regle: vide.regle, cleArchive: vide.match.cleArchive, moteur: vide.moteur, heureSure: vide.match.heureSure };
  // 2. Une saisie : la value aussitôt, l'archive avec l'heure.
  const corners = { matchId: MATCH, bookmaker: 'williamhill', marketId: 'totalCorners', sens: 'over', ligne: 9.5, cote: 2.1 };
  const p1 = await S.enregistrerSaisie(corners, { maintenant: T0 });
  const s1 = p1.etat.saisies.find((s) => s.cle === p1.cle);
  sortie.p1 = { change: p1.change, correction: p1.correction, ecrite: p1.ecrite, enAttente: p1.enAttente, cle: p1.cle, saisie: s1, lignes: lignesSaisies() };
  // 3. La même cote rejouée : rien d'écrit.
  const p2 = await S.enregistrerSaisie({ ...corners }, { maintenant: T0 + 30_000 });
  sortie.p2 = { change: p2.change, lignes: lignesSaisies().length };
  // 4. Corrigée : une ligne de plus, l'ancienne gardée.
  const p3 = await S.enregistrerSaisie({ ...corners, cote: 2.25 }, { maintenant: T0 + MIN });
  const s3 = p3.etat.saisies.find((s) => s.cle === p3.cle);
  sortie.p3 = { change: p3.change, correction: p3.correction, cote: s3.cote, coteAvant: s3.coteAvant, versions: s3.versions, premiere: s3.premiereSaisieA, releveAt: s3.releveAt, pourcent: s3.pourcent, lignes: lignesSaisies() };
  // 5. D'autres marchés : les 2 marquent (modèle de buts), buts 4,5 (hors des lignes du moteur), cartons et buteur (sans moteur).
  const btts = await S.enregistrerSaisie({ matchId: MATCH, bookmaker: 'betsson', marketId: 'bothTeamsScore', sens: 'yes', cote: 1.8 }, { maintenant: T0 + 2 * MIN });
  const buts45 = await S.enregistrerSaisie({ matchId: MATCH, bookmaker: 'unibet_nl', marketId: 'totalGoals', sens: 'over', ligne: 4.5, cote: 4.2 }, { maintenant: T0 + 3 * MIN });
  const cartons = await S.enregistrerSaisie({ matchId: MATCH, bookmaker: 'tipico_de', marketId: 'totalCards', sens: 'over', ligne: 4.5, cote: 1.9 }, { maintenant: T0 + 4 * MIN });
  const buteur = await S.enregistrerSaisie({ matchId: MATCH, bookmaker: 'coolbet', marketId: 'anytimeScorer', sens: 'yes', joueur: 'Erling  Haaland ', cote: 1.95 }, { maintenant: T0 + 5 * MIN });
  const buteurBis = await S.enregistrerSaisie({ matchId: MATCH, bookmaker: 'coolbet', marketId: 'anytimeScorer', sens: 'yes', joueur: 'erling haaland', cote: 1.95 }, { maintenant: T0 + 6 * MIN });
  const equipe = await S.enregistrerSaisie({ matchId: MATCH, bookmaker: 'williamhill', marketId: 'teamGoals', sens: 'under', ligne: 1.5, equipe: 'away', cote: 1.7 }, { maintenant: T0 + 7 * MIN });
  const de = (r) => r.etat.saisies.find((s) => s.cle === r.cle);
  sortie.autres = Object.fromEntries(
    Object.entries({ btts, buts45, cartons, buteur, equipe }).map(([k, r]) => {
      const s = de(r);
      return [k, { cle: r.cle, libelle: s.libelle, moteur: s.moteur, pourcent: s.pourcent, verdict: s.verdict }];
    })
  );
  sortie.buteurBis = { change: buteurBis.change, cle: buteurBis.cle };
  // Le moteur, par ailleurs : ce qu'il donne pour ces marchés.
  sortie.moteurBrut = await (async () => {
    const { findAdaptedMatch } = await imp('data/matchSources.js');
    const { enrichMatchWithRealAverages } = await imp('data/providers/matchEnrichment.js');
    const { analyzeMatch } = await imp('core/engine/oddsEngine.js');
    const { getEngineConfig } = await imp('core/engine/engineConfig.js');
    const { getTiltState } = await imp('core/engine/tiltState.js');
    const { getSport } = await imp('sports/index.js');
    const m = findAdaptedMatch('odds-api', MATCH);
    const r = await analyzeMatch(await enrichMatchWithRealAverages(m, { sansRepliPayant: true }), getEngineConfig('football'), getTiltState(), getSport('football'));
    return { statExpectations: r.statExpectations, bothTeamsScore: r.trueOdds.bothTeamsScore, awayUnder15: r.trueOdds.awayTeamGoals.under15 };
  })();
  // 6. Refusées : rien d'écrit.
  const refus = {};
  const essayer = async (nom, corps) => {
    try {
      await S.enregistrerSaisie(corps, { maintenant: T0 + 8 * MIN });
      refus[nom] = 'accepté';
    } catch (error) {
      refus[nom] = `${error.constructor.name} : ${error.message}`;
    }
  };
  const nLignes = lignesSaisies().length;
  await essayer('pasVotreBookmaker', { ...corners, bookmaker: 'betclic_fr' });
  await essayer('resultat', { ...corners, marketId: 'result', sens: 'home' });
  await essayer('ligneEntiere', { ...corners, ligne: 9 });
  await essayer('ligneQuart', { ...corners, ligne: 2.25 });
  await essayer('cote', { ...corners, cote: 0.95 });
  await essayer('coteTexte', { ...corners, cote: '2,10' });
  await essayer('equipeAbsente', { matchId: MATCH, bookmaker: 'williamhill', marketId: 'teamCorners', sens: 'over', ligne: 4.5, cote: 1.9 });
  await essayer('joueurVide', { matchId: MATCH, bookmaker: 'coolbet', marketId: 'anytimeScorer', sens: 'yes', joueur: '  ', cote: 2 });
  await essayer('matchInconnu', { ...corners, matchId: 'pas-un-match' });
  await essayer('sansMatch', { ...corners, matchId: undefined });
  sortie.refus = refus;
  sortie.refusRienEcrit = lignesSaisies().length === nLignes;
  // 7. Retirée : une ligne sans prix ; deux fois : rien de plus ; inconnue : refusée.
  const r1 = await S.retirerSaisie({ matchId: MATCH, cle: p1.cle }, { maintenant: T0 + 9 * MIN });
  const r2 = await S.retirerSaisie({ matchId: MATCH, cle: p1.cle }, { maintenant: T0 + 10 * MIN });
  let r3;
  try {
    await S.retirerSaisie({ matchId: MATCH, cle: 'williamhill|corners|over|99.5' }, { maintenant: T0 + 10 * MIN });
    r3 = 'accepté';
  } catch (error) {
    r3 = `${error.constructor.name} : ${error.message}`;
  }
  sortie.retrait = {
    r1: { change: r1.change, ecrite: r1.ecrite, enVigueur: r1.etat.saisies.some((s) => s.cle === p1.cle), retirees: r1.etat.retirees.map((x) => [x.cle, x.retireeA]) },
    r2: { change: r2.change },
    r3,
    lignesCorners: lignesSaisies().filter((l) => l.market === 'corners')
  };
  // Re-saisie après un retrait : elle revient.
  const revient = await S.enregistrerSaisie({ ...corners, cote: 2.25 }, { maintenant: T0 + 11 * MIN });
  sortie.revient = { change: revient.change, correction: revient.correction, enVigueur: revient.etat.saisies.some((s) => s.cle === p1.cle) };
  // 8. L'archive : odds_events de la saisie (identifiants FotMob, jour), et les lectures gratuites inchangées.
  sortie.evenements = database.prepare("SELECT source, source_event AS ev, league, date, kickoff, home_id AS h, away_id AS a, provenance FROM odds_events WHERE source = 'saisie'").all();
  const apres = lecturesGratuites();
  sortie.gratuitesInchangees = Object.fromEntries(Object.keys(avant).map((k) => [k, JSON.stringify(avant[k]) === JSON.stringify(apres[k])]));
  // 9. Verrou tenu par un import (un autre processus) : rien d'écrit, « en attente » ; idempotent même en attente ; écrit à la libération.
  const VERROU = path.join(serveur, 'data', 'runtime', 'espn-refresh.lock');
  fs.writeFileSync(VERROU, JSON.stringify({ pid: process.ppid, token: 'import-en-ligne-de-commande', startedAt: iso(T0), heartbeatAt: iso(T0) }));
  const avantVerrou = lignesSaisies().length;
  const pv = await S.enregistrerSaisie({ matchId: MATCH, bookmaker: 'nordicbet', marketId: 'teamCorners', sens: 'over', ligne: 4.5, equipe: 'home', cote: 1.9 }, { maintenant: T0 + 12 * MIN });
  const pvBis = await S.enregistrerSaisie({ matchId: MATCH, bookmaker: 'nordicbet', marketId: 'teamCorners', sens: 'over', ligne: 4.5, equipe: 'home', cote: 1.9 }, { maintenant: T0 + 13 * MIN });
  const pendant = await S.etatDesSaisies({ matchId: MATCH, maintenant: T0 + 13 * MIN });
  sortie.verrou = {
    pv: { change: pv.change, ecrite: pv.ecrite, enAttente: pv.enAttente, raison: pv.raison },
    pvBis: { change: pvBis.change, enAttente: pvBis.enAttente },
    pendantEcrites: lignesSaisies().length - avantVerrou,
    pendantAffichee: pendant.saisies.find((s) => s.cle === pv.cle)?.enAttente ?? null,
    file: etatDeLaFile().parEnregistreur.saisies?.enAttente ?? null
  };
  fs.rmSync(VERROU, { force: true });
  const libre = await S.etatDesSaisies({ matchId: MATCH, maintenant: T0 + 14 * MIN });
  sortie.verrou.apresLiberation = { ecrites: lignesSaisies().length - avantVerrou, affichee: libre.saisies.find((s) => s.cle === pv.cle)?.enAttente ?? null, file: etatDeLaFile().parEnregistreur.saisies?.enAttente ?? null };
  // 10. La fraîcheur d'une saisie : quatre heures plus tard, à rafraîchir ; une saisie d'avant les compositions aussi.
  const tard = await S.etatDesSaisies({ matchId: MATCH, maintenant: T0 + 4 * H + 30 * MIN });
  sortie.fraicheurTard = tard.saisies.map((s) => [s.cle, s.fraicheur.etat, s.fraicheur.code, s.verdict]);
  const veille = await S.enregistrerSaisie({ matchId: MATCH, bookmaker: 'leovegas_se', marketId: 'totalShots', sens: 'over', ligne: 24.5, cote: 1.9 }, { maintenant: Date.parse('2026-10-06T17:00:00Z') });
  const apresCompos = await S.etatDesSaisies({ matchId: MATCH, maintenant: Date.parse('2026-10-06T18:10:00Z') });
  const tirs = apresCompos.saisies.find((s) => s.cle === veille.cle);
  sortie.fraicheurCompos = { etat: tirs.fraicheur.etat, code: tirs.fraicheur.code, raison: tirs.fraicheur.raison, verdict: tirs.verdict, avantAnnonce: veille.etat.saisies.find((s) => s.cle === veille.cle).fraicheur.etat };
  sortie.lignesFinales = lignesSaisies().length;
} else if (phase === 'analyse') {
  // L'archive a le relevé de 11 h (étape E) ; le moteur lit l'heure de chaque cote dedans.
  ecrireInstantane(instantane(), '2026-10-05T11:00:00.000Z');
  const { archiverReleveSiNouveau } = await imp('data/enregistreurs/cotesPayantes.js');
  const { vider } = await imp('data/enregistreurs/file.js');
  archiverReleveSiNouveau({ maintenant: T0, database });
  await vider({ maintenant: T0, database });
  const { findAdaptedMatch } = await imp('data/matchSources.js');
  const { enrichMatchWithRealAverages } = await imp('data/providers/matchEnrichment.js');
  const { analyzeMatch } = await imp('core/engine/oddsEngine.js');
  const { getEngineConfig } = await imp('core/engine/engineConfig.js');
  const { getTiltState } = await imp('core/engine/tiltState.js');
  const { getSport } = await imp('sports/index.js');
  const { fraicheurDuMatch, heuresDesCotesPayantes } = await imp('data/cotesDeVosBookmakers.js');
  const m = findAdaptedMatch('odds-api', 'essai-city-liverpool');
  const enrichi = await enrichMatchWithRealAverages(m, { sansRepliPayant: true });
  const moteur = (maintenant, extra = {}) => analyzeMatch({ ...enrichi, fraicheurCotes: fraicheurDuMatch(enrichi, { database, maintenant, ...extra }) }, getEngineConfig('football'), getTiltState(), getSport('football'));
  const resume = (r) => ({
    action: r.staking.action,
    reason: r.staking.reason ?? null,
    bookmaker: r.staking.bookmaker ?? r.staking.aRafraichir?.bookmaker ?? null,
    releveAt: r.staking.releveAt ?? r.staking.aRafraichir?.releveAt ?? null,
    origine: r.staking.origineReleve ?? r.staking.aRafraichir?.origineReleve ?? null,
    fraicheur: r.staking.fraicheur?.code ?? r.staking.aRafraichir?.fraicheur?.code ?? null,
    ev: r.staking.ev ?? r.staking.aRafraichir?.ev ?? null,
    stake: r.staking.stake,
    edgePercent: r.edgePercent
  });
  sortie.heures = heuresDesCotesPayantes(enrichi, { database });
  const sansFraicheur = await analyzeMatch(enrichi, getEngineConfig('football'), getTiltState(), getSport('football'));
  sortie.sansFraicheur = { action: sansFraicheur.staking.action, bookmaker: sansFraicheur.staking.bookmaker, ev: sansFraicheur.staking.ev, champ: 'fraicheurCotes' in sansFraicheur };
  sortie.fraiche = resume(await moteur(Date.parse('2026-10-05T11:30:00Z')));
  sortie.limite = resume(await moteur(Date.parse('2026-10-05T14:00:00Z')));
  sortie.perimee = resume(await moteur(Date.parse('2026-10-05T14:00:01Z')));
  const deux = await moteur(Date.parse('2026-10-05T11:30:00Z'));
  sortie.memeChiffres = JSON.stringify(deux.trueOdds) === JSON.stringify(sansFraicheur.trueOdds) && JSON.stringify(deux.marketPredictions) === JSON.stringify(sansFraicheur.marketPredictions);
  sortie.candidats = deux.staking.candidates.map((c) => [c.outcome, c.bookmaker, c.releveAt, c.fraicheur?.etat]);
  // La route Express : à l'heure figée (05/10 12 h), le relevé de 11 h est dans l'archive.
  const appel = await application();
  const r = await appel('GET', '/api/analysis/match/essai-city-liverpool?source=odds-api&bankroll=10000');
  sortie.route = { code: r.code, staking: r.corps?.staking ? { action: r.corps.staking.action, releveAt: r.corps.staking.releveAt ?? null, fraicheur: r.corps.staking.fraicheur?.code ?? null } : null, fraicheurCotes: r.corps?.fraicheurCotes ?? null };
  // Le Repérage : la cote jouable porte l'heure lue dans l'archive ; sa fraîcheur est jugée à la LECTURE (le tableau est gardé 30 min).
  const screener = await imp('data/screener.js');
  screener.getScreener({ force: true });
  let lu = screener.getScreener();
  for (let i = 0; i < 600 && lu.status === 'computing'; i++) {
    await new Promise((fin) => setTimeout(fin, 25));
    lu = screener.getScreener();
  }
  const ligneReperage = lu.data?.matches?.find((m) => m.matchId === 'essai-city-liverpool');
  const domicile = ligneReperage?.markets?.find((k) => k.key === 'home');
  sortie.reperage = {
    status: lu.status,
    error: lu.error,
    bestBookmakerKey: domicile?.bestBookmakerKey ?? null,
    bestOddsAt: domicile?.bestOddsAt ?? null,
    origine: domicile?.bestOddsOrigin ?? null,
    freshness: domicile?.freshness?.code ?? null,
    reglage: lu.data?.freshness?.reglage ?? null,
    sansCoteJouable: ligneReperage?.markets?.find((k) => k.key === 'over25')?.freshness ?? null
  };
  sortie.reperageTard = screener.avecFraicheur(lu.data, { maintenant: Date.parse('2026-10-05T14:30:00Z') }).matches.find((m) => m.matchId === 'essai-city-liverpool').markets.find((k) => k.key === 'home').freshness.code;
  // Le jour du match : un relevé à 17 h 30 (UTC), archivé ; compositions annoncées à 18 h (une heure avant 19 h).
  ecrireInstantane(instantane(), '2026-10-06T17:30:00.000Z');
  archiverReleveSiNouveau({ maintenant: Date.parse('2026-10-06T17:31:00Z'), database });
  await vider({ maintenant: Date.parse('2026-10-06T17:31:00Z'), database });
  sortie.avantAnnonce = resume(await moteur(Date.parse('2026-10-06T17:55:00Z')));
  sortie.avantCompos = resume(await moteur(Date.parse('2026-10-06T18:10:00Z')));
  sortie.commence = resume(await moteur(Date.parse('2026-10-06T19:05:00Z')));
  // Le réglage : sans la règle des compositions, la même cote reste fraîche à 18 h 10.
  sortie.sansRegleCompos = resume(await moteur(Date.parse('2026-10-06T18:10:00Z'), { reglage: { maxAgeMinutes: 180, avantCompos: false } }));
  sortie.delaiCourt = resume(await moteur(Date.parse('2026-10-06T17:55:00Z'), { reglage: { maxAgeMinutes: 15, avantCompos: true } }));
  // Retour au relevé de 11 h pour la suite.
  ecrireInstantane(instantane(), '2026-10-05T11:00:00.000Z');
  // Un nouveau relevé (le 06/10 à 17 h 45) pas encore archivé : l'heure du fichier, qui EST l'heure du relevé.
  ecrireInstantane(instantane({ wh: [2.32, 3.4, 3.3] }), '2026-10-06T17:45:00.000Z');
  const m2 = findAdaptedMatch('odds-api', 'essai-city-liverpool');
  sortie.heuresEnRetard = heuresDesCotesPayantes(m2, { database });
  // Une cote qui ne correspond à rien (fichier plus ancien que l'archive, prix différent) : heure inconnue.
  const m3 = { ...m2, marketOdds: { ...m2.marketOdds, byBookmaker: m2.marketOdds.byBookmaker.map((b) => (b.key === 'williamhill' ? { ...b, odds1: 2.5 } : b)) } };
  ecrireInstantane(instantane({ wh: [2.32, 3.4, 3.3] }), '2026-10-05T10:00:00.000Z');
  sortie.heuresIncoherentes = heuresDesCotesPayantes(m3, { database });
  // Une cote gratuite (match du calendrier) : jamais d'heure cherchée, jamais jouable.
  sortie.heuresGratuites = heuresDesCotesPayantes({ ...m2, matchId: 'cal-2026-10-06-man-city-liverpool', oddsSource: 'gratuit' }, { database });
} else if (phase === 'routes' || phase === 'releve') {
  ecrireInstantane(instantane(), '2026-10-05T11:00:00.000Z');
  const appel = await application();
  if (phase === 'routes') {
    // Toutes les routes de lecture et d'écriture de l'étape 7, et les pages qui montrent les cotes de vos bookmakers.
    const essais = [
      ['GET', '/api/odds/fraicheur'],
      ['PUT', '/api/odds/fraicheur', { maxAgeMinutes: 120, avantCompos: true }],
      ['GET', '/api/odds/conseil-releve'],
      ['GET', '/api/odds/saisies?matchId=essai-city-liverpool'],
      ['PUT', '/api/odds/saisies', { matchId: 'essai-city-liverpool', bookmaker: 'williamhill', marketId: 'totalCorners', sens: 'over', ligne: 9.5, cote: 2.1 }],
      ['PUT', '/api/odds/saisies/retrait', { matchId: 'essai-city-liverpool', cle: 'williamhill|corners|over|9.5' }],
      ['GET', '/api/analysis/match/essai-city-liverpool'],
      ['GET', '/api/sources'],
      ['GET', '/api/matches?source=odds-api'],
      ['GET', '/api/odds/status'],
      ['GET', '/api/recorders']
    ];
    sortie.reponses = [];
    for (const [methode, url, corps] of essais) {
      const r = await appel(methode, url, corps);
      sortie.reponses.push({ methode, url, code: r.code, erreur: r.corps?.error ?? null });
    }
    // Le réglage de fraîcheur : enregistré, rejoué sans réécriture, refusé hors bornes ou d'un autre type ; un fichier illisible mis de côté.
    const fichierReglage = path.join(serveur, 'data', 'runtime', 'fraicheur-cotes.json');
    const r1 = await appel('PUT', '/api/odds/fraicheur', { maxAgeMinutes: 90, avantCompos: false });
    const mtime1 = fs.statSync(fichierReglage).mtimeMs;
    const contenu1 = fs.readFileSync(fichierReglage, 'utf8');
    const r2 = await appel('PUT', '/api/odds/fraicheur', { maxAgeMinutes: 90, avantCompos: false });
    const refusReglage = [];
    for (const corps of [{ maxAgeMinutes: 5, avantCompos: true }, { maxAgeMinutes: 2000, avantCompos: true }, { maxAgeMinutes: '90', avantCompos: true }, { maxAgeMinutes: 90.5, avantCompos: true }, { maxAgeMinutes: 90 }, undefined]) {
      const r = await appel('PUT', '/api/odds/fraicheur', corps);
      refusReglage.push([r.code, r.corps?.error ?? null]);
    }
    const lu = await appel('GET', '/api/odds/fraicheur');
    sortie.reglage = {
      r1: { code: r1.code, change: r1.corps?.enregistrement?.change, reglage: r1.corps?.reglage, source: r1.corps?.source },
      r2: { code: r2.code, change: r2.corps?.enregistrement?.change },
      inchange: fs.statSync(fichierReglage).mtimeMs === mtime1 && fs.readFileSync(fichierReglage, 'utf8') === contenu1,
      refus: refusReglage,
      lu: { reglage: lu.corps?.reglage, source: lu.corps?.source, defaut: lu.corps?.defaut, bornes: lu.corps?.bornes }
    };
    fs.writeFileSync(fichierReglage, '{"maxAgeMinutes": 9');
    const illisible = await appel('GET', '/api/odds/fraicheur');
    const apres = await appel('PUT', '/api/odds/fraicheur', { maxAgeMinutes: 180, avantCompos: true });
    sortie.reglage.illisible = { source: illisible.corps?.source, reglage: illisible.corps?.reglage, probleme: illisible.corps?.probleme ?? null };
    sortie.reglage.apresIllisible = {
      code: apres.code,
      change: apres.corps?.enregistrement?.change,
      misDeCote: fs.readdirSync(path.dirname(fichierReglage)).filter((f) => f.startsWith('fraicheur-cotes.illisible-')).length,
      fichier: JSON.parse(fs.readFileSync(fichierReglage, 'utf8'))
    };
    sortie.appelsApresLesRoutes = [...globalThis.__appelsPayants];
    // Le seul chemin : le bouton de Réglages. L'espion lève (pas de réponse prévue) : rien ne sort, 37 appels notés.
    const releve = await appel('POST', '/api/sources/odds/refresh');
    sortie.releve = { code: releve.code, erreur: releve.corps?.error ?? null, appels: globalThis.__appelsPayants.length, cles: [...new Set(globalThis.__appelsPayants)].length };
    sortie.fichierBilan = fs.existsSync(path.join(serveur, 'data', 'runtime', 'releve-payant.json'));
    // Les routes du routeur des cotes, telles que branchées.
    const { default: routes } = await imp('api/routes/odds.routes.js');
    sortie.routeur = routes.stack.map((c) => [Object.keys(c.route.methods).join(','), c.route.path]);
  } else {
    // L'espion répond : deux compétitions avec des matchs, une « hors saison » (0 match), une en échec, les autres vides.
    const { TRACKED_SPORT_KEYS } = await imp('data/providers/oddsApiCompetitions.js');
    let utilises = 120;
    globalThis.__reponsePayante = (cle) => {
      // Une compétition en erreur (le serveur répond, avec son quota) ; deux avec des matchs ; les autres vides (hors saison).
      if (cle === 'soccer_spl') return { erreur: 'The Odds API a répondu 404 : compétition inconnue', quota: { remaining: 500 - utilises, used: utilises, last: 0 } };
      utilises += cle === 'soccer_epl' || cle === 'soccer_spain_la_liga' ? 1 : 0;
      const matches = cle === 'soccer_epl' ? instantane()[0].data : cle === 'soccer_spain_la_liga' ? [{ ...instantane()[0].data[0], id: 'essai-liga', sport_key: cle, sport_title: 'La Liga - Spain' }] : [];
      return { matches, quota: { remaining: 500 - utilises, used: utilises, last: matches.length ? 1 : 0 } };
    };
    const r = await appel('POST', '/api/sources/odds/refresh');
    sortie.reponse = { code: r.code, corps: r.corps };
    sortie.appels = globalThis.__appelsPayants.length;
    sortie.cles = TRACKED_SPORT_KEYS.length;
    const fichier = path.join(serveur, 'data', 'runtime', 'releve-payant.json');
    sortie.bilan = JSON.parse(fs.readFileSync(fichier, 'utf8'));
    const c = await appel('GET', '/api/odds/conseil-releve');
    sortie.conseil = { code: c.code, credits: c.corps?.credits ?? null, appelsApres: globalThis.__appelsPayants.length };
    // Un second relevé où une réponse n'a pas d'en-tête de coût : coût inconnu, jamais 0.
    globalThis.__reponsePayante = (cle) => (cle === 'soccer_epl' ? { matches: instantane()[0].data, quota: { remaining: 376, used: 124, last: null } } : { matches: [], quota: { remaining: 376, used: 124, last: 0 } });
    const r2 = await appel('POST', '/api/sources/odds/refresh');
    sortie.secondCout = { code: r2.code, cout: r2.corps?.cout, fichier: JSON.parse(fs.readFileSync(fichier, 'utf8')).cout, restants: JSON.parse(fs.readFileSync(fichier, 'utf8')).quota.restants };
    // Un bilan illisible : jamais pris pour « aucun relevé » sans le dire.
    fs.writeFileSync(fichier, '{"at": "2026-10');
    const c2 = await appel('GET', '/api/odds/conseil-releve');
    sortie.conseilIllisible = { code: c2.code, source: c2.corps?.credits?.source, restants: c2.corps?.credits?.restants, probleme: c2.corps?.credits?.probleme };
  }
} else if (phase === 'conseil') {
  // 12 h : Man City – Liverpool à 12 h 40 (compositions annoncées à 11 h 40), relevé payant de 10 h, archivé.
  ecrireInstantane(instantane({ coupDEnvoi: '2026-10-05T12:40:00Z' }), '2026-10-05T10:00:00.000Z');
  const { archiverReleveSiNouveau } = await imp('data/enregistreurs/cotesPayantes.js');
  const { vider } = await imp('data/enregistreurs/file.js');
  archiverReleveSiNouveau({ maintenant: T0, database });
  await vider({ maintenant: T0, database });
  // Les compositions lues par la boucle FotMob (cache, aucune requête ici).
  const { upsertUpcomingLineup } = await imp('data/db/matchStatsDb.js');
  const { clubDuMagasin } = await imp('data/db/oddsProfileRead.js');
  upsertUpcomingLineup(
    { fotmobId: '777001', date: '2026-10-05', kickoff: '2026-10-05T12:40:00Z', league: 'ENG|Premier League', homeId: clubDuMagasin('Man City', 'EPL', database), awayId: clubDuMagasin('Liverpool', 'EPL', database), homeName: 'Man City', awayName: 'Liverpool', payload: { available: true }, fetchedAt: '2026-10-05T11:45:00.000Z' },
    { database }
  );
  fs.writeFileSync(
    path.join(serveur, 'data', 'runtime', 'releve-payant.json'),
    JSON.stringify({ version: 1, at: '2026-10-05T10:00:00.000Z', clesDemandees: 37, clesRelevees: ['soccer_epl'], echecs: [], matchs: 1, quota: { restants: 300, utilises: 200 }, cout: 18, coutParCle: {}, matchsParCle: { soccer_epl: 1, soccer_spl: 0 } })
  );
  const { conseilReleveActuel } = await imp('data/conseilReleve.js');
  sortie.conseil = conseilReleveActuel({ maintenant: T0, database });
  const appel = await application();
  const r = await appel('GET', '/api/odds/conseil-releve');
  sortie.route = { code: r.code, conseil: r.corps?.conseil, titre: r.corps?.titre };
} else {
  throw new Error(`Phase inconnue : ${phase}`);
}

console.log(JSON.stringify(sortie));
