/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-bulletins-fiches.mjs <serveur de la copie> <phase>
 *
 * Étape 42 — LES FICHES CHIFFRÉES du bulletin du jour et du bilan de la semaine, lues dans la COPIE de la base d'essai et dans le
 * data/runtime de la copie (aucun réseau, aucun Claude, heure figée au 05/10/2026 12 h UTC = 14 h à Paris, un lundi). Pour chaque
 * fiche, les valeurs ATTENDUES sont recalculées ici par un SECOND chemin (la route d'analyse d'un match de Mes paris, les Chutes de
 * cotes, du SQL, des boucles écrites à la main — sans bulletinFiches.js) ; le test compare.
 * Phases :
 *   jour     le décor de la page Opportunités (un faux relevé The Odds API de cinq matchs, des cotes gratuites qui bougent, des
 *            compositions dans le cache, Newcastle en favori, un contrôle quotidien orange) ; le Repérage calculé ; les entrées lues,
 *            la fiche du jour (normale, économe), son texte ; un championnat favori ; le Repérage en calcul / en erreur ; un jour
 *            sans match.
 *   semaine  le journal des pronostics, le carnet de paris, les analyses de l'IA et son carnet PLANTÉS dans la semaine du 28/09 au
 *            04/10 (et autour, pour les écarter) ; la fiche de la semaine, son texte ; sans carnet de l'IA ; la valeur de clôture.
 * Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { Socket } from 'node:net';
import { pathToFileURL } from 'node:url';

const [serveur, phase] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);
const RUNTIME = path.join(serveur, 'data', 'runtime');
const ecrireRuntime = (nom, contenu) => {
  fs.mkdirSync(RUNTIME, { recursive: true });
  fs.writeFileSync(path.join(RUNTIME, nom), typeof contenu === 'string' ? contenu : JSON.stringify(contenu, null, 1));
};
const T0 = Date.parse(process.env.CM_TEST_MAINTENANT);
const MIN = 60_000;
const H = 3_600_000;
const iso = (t) => new Date(t).toISOString();

const { resolveDbPath, openDb, upsertUpcomingLineup } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error('Base inattendue');
const database = openDb();
const ecritures = () => database.prepare('SELECT total_changes() AS n').get().n;

const F = await imp('core/ai/bulletinFiches.js');
const P = await imp('core/ai/bulletinPrompt.js');
const G = await imp('core/ai/gardeDesChiffres.js');
const sortie = { ok: true, phase };

/** L'application Express, appelée sans réseau (la route d'analyse d'un match de Mes paris : le second chemin des verdicts). */
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

// ============================================================================================== jour
if (phase === 'jour') {
  // --- le faux relevé The Odds API (le décor de script-opportunites.mjs, étape 8) : A Man City – Liverpool (la value), B Arsenal – Chelsea,
  // C Tottenham – Everton, D Newcastle – Leeds (une autre value), E Fulham – Brentford. Tous le 05/10/2026.
  const h2h = (home, away, [o1, ox, o2]) => ({ key: 'h2h', outcomes: [{ name: home, price: o1 }, { name: away, price: o2 }, { name: 'Draw', price: ox }] });
  const livre = (key, title, home, away, cotes) => ({ key, title, last_update: '2026-10-05T11:45:00Z', markets: [h2h(home, away, cotes)] });
  const match = (id, home, away, coupDEnvoi, livres) => ({ id, sport_key: 'soccer_epl', sport_title: 'EPL', commence_time: coupDEnvoi, home_team: home, away_team: away, bookmakers: livres.map(([key, title, cotes]) => livre(key, title, home, away, cotes)) });
  const MATCHS = [
    match('essai-a', 'Man City', 'Liverpool', '2026-10-05T12:40:00Z', [['pinnacle', 'Pinnacle', [2.0, 3.6, 3.9]], ['williamhill', 'William Hill', [2.3, 3.4, 3.3]], ['betclic_fr', 'Betclic (FR)', [1.9, 3.3, 3.6]]]),
    match('essai-b', 'Arsenal', 'Chelsea', '2026-10-05T18:30:00Z', [['williamhill', 'William Hill', [2.2, 3.5, 3.4]], ['betsson', 'Betsson', [2.45, 3.3, 3.0]], ['unibet_nl', 'Unibet (NL)', [2.2, 3.5, 3.4]]]),
    match('essai-c', 'Tottenham', 'Everton', '2026-10-05T19:00:00Z', [['codere_it', 'Codere (IT)', [2.3, 3.3, 3.6]], ['marathonbet', 'Marathon Bet', [1.95, 3.5, 4.3]], ['williamhill', 'William Hill', [2.12, 3.3, 3.7]]]),
    match('essai-d', 'Newcastle', 'Leeds', '2026-10-05T19:30:00Z', [['pinnacle', 'Pinnacle', [2.5, 3.4, 2.9]], ['unibet_nl', 'Unibet (NL)', [2.75, 3.75, 2.6]]]),
    match('essai-e', 'Fulham', 'Brentford', '2026-10-05T20:00:00Z', [['pinnacle', 'Pinnacle', [1.5, 4.5, 6.5]], ['williamhill', 'William Hill', [1.48, 4.4, 7.4]]])
  ];
  const { getFixturePaths } = await imp('data/repositories/fixturesRepository.js');
  const fichierInstantane = getFixturePaths().odds;
  if (!path.resolve(fichierInstantane).toLowerCase().startsWith(path.resolve(serveur).toLowerCase())) throw new Error(`Instantané hors de la copie : ${fichierInstantane}`);
  fs.mkdirSync(path.dirname(fichierInstantane), { recursive: true });
  fs.writeFileSync(fichierInstantane, JSON.stringify([{ data: MATCHS }]));
  fs.utimesSync(fichierInstantane, new Date('2026-10-05T11:50:00.000Z'), new Date('2026-10-05T11:50:00.000Z'));
  const { archiverReleveSiNouveau } = await imp('data/enregistreurs/cotesPayantes.js');
  const { vider } = await imp('data/enregistreurs/file.js');
  archiverReleveSiNouveau({ maintenant: T0, database });
  await vider({ maintenant: T0, database });
  const { clubDuMagasin } = await imp('data/db/oddsProfileRead.js');
  const ids = Object.fromEntries(['Man City', 'Liverpool', 'Arsenal', 'Chelsea', 'Tottenham', 'Everton', 'Newcastle', 'Leeds', 'Fulham', 'Brentford'].map((n) => [n, clubDuMagasin(n, 'EPL', database)]));
  sortie.ids = ids;
  // --- des cotes gratuites (ESPN) : ouverture la veille, dernier relevé ce matin — Man City gagne et « Plus de 2,5 buts » chutent.
  const { upsertQuotes } = await imp('data/db/oddsQuotesRepository.js');
  const gratuite = (kind, releveAt, market, line, selection, price) => ({
    source: 'espn', sourceEvent: 'espn-city-liverpool', bookmaker: 'DraftKings', market, selection, line, price, kind, releveAt, date: '2026-10-05', kickoff: '2026-10-05T12:40:00Z',
    league: 'English Premier League', homeId: ids['Man City'], awayId: ids.Liverpool, homeName: 'Manchester City', awayName: 'Liverpool', provenance: 'ESPN (essai)'
  });
  upsertQuotes(
    [['home', 2.3, 2.0], ['draw', 3.4, 3.6], ['away', 3.2, 3.9]]
      .flatMap(([sel, avant, apres]) => [gratuite('open', '2026-10-04T09:00:00Z', '1x2', 0, sel, avant), gratuite('snapshot', '2026-10-05T11:00:00Z', '1x2', 0, sel, apres)])
      .concat([gratuite('open', '2026-10-04T09:00:00Z', 'ou', 2.5, 'over', 2.0), gratuite('open', '2026-10-04T09:00:00Z', 'ou', 2.5, 'under', 1.85), gratuite('snapshot', '2026-10-05T11:00:00Z', 'ou', 2.5, 'over', 1.8), gratuite('snapshot', '2026-10-05T11:00:00Z', 'ou', 2.5, 'under', 2.05)]),
    { database }
  );
  // --- les compositions du cache : A lue 45 min avant le coup d'envoi ; D 5 h avant ; B 30 min avant, mais un titulaire de Chelsea y est dit indisponible.
  const onze = (prefixe) => Array.from({ length: 11 }, (_, i) => ({ id: `${prefixe}-${i}`, name: `${prefixe} Joueur ${i + 1}` }));
  const compo = (fotmobId, home, away, kickoff, avantMin, { indisponible = null, absentsDom = [] } = {}) =>
    upsertUpcomingLineup(
      {
        fotmobId, date: kickoff.slice(0, 10), kickoff, league: 'ENG|Premier League', homeId: ids[home], awayId: ids[away], homeName: home, awayName: away,
        payload: {
          available: true,
          home: { teamId: ids[home], teamName: home, startXI: onze(home), unavailable: absentsDom },
          away: { teamId: ids[away], teamName: away, startXI: onze(away), unavailable: indisponible ? [{ id: `${away}-3`, name: `${away} Joueur 4`, type: 'injury' }] : [] }
        },
        fetchedAt: iso(Date.parse(kickoff) - avantMin * MIN)
      },
      { database }
    );
  compo('900001', 'Man City', 'Liverpool', '2026-10-05T12:40:00Z', 45, { absentsDom: [{ id: 'mc-9', name: 'Rodri', type: 'injury' }] });
  compo('900004', 'Newcastle', 'Leeds', '2026-10-05T19:30:00Z', 300);
  compo('900002', 'Arsenal', 'Chelsea', '2026-10-05T18:30:00Z', 30, { indisponible: true });
  // --- Newcastle en favori (une équipe, par son identifiant FotMob) ; un contrôle quotidien orange (un rouge récent, un orange connu).
  ecrireRuntime('favorites.json', { teams: [{ id: ids.Newcastle, name: 'Newcastle', league: 'EPL', addedAt: '2026-10-03T18:14:00.741Z' }], leagues: [], updatedAt: '2026-10-03T18:14:00.741Z' });
  const controle = (cle, libelle, famille, constats, extra = {}) => ({ cle, libelle, famille, constat: `${constats.length} constat(s)`, total: constats.length, constats, ...extra });
  const constat = (classe, trouveLe) => ({ id: `c-${classe}-${trouveLe}`, controle: 'x', classe, texte: `Constat ${classe}`, trouveLe, familles: ['tout'], clubs: [] });
  ecrireRuntime('controle-quotidien.json', {
    version: 1,
    le: '2026-10-05T03:10:00.000Z',
    dureeMs: 1200,
    controles: [
      controle('scores-football-data', 'Score différent de football-data', 'scores', [constat('rouge', '2026-10-05T03:10:00.000Z'), constat('rouge', '2026-10-05T03:10:00.000Z')]),
      controle('zeros-non-releves', 'Zéros « non relevé »', 'zeros', [constat('orange', '2026-10-01T03:10:00.000Z')]),
      controle('doublons', 'Doublons', 'identite', [])
    ],
    vus: {},
    aVerifier: { clubs: {}, ligues: {}, global: [] },
    historique: []
  });

  // --- le Repérage (l'état préparé de la page Opportunités), calculé et attendu.
  const screener = await imp('data/screener.js');
  const { getOpportunities } = await imp('data/opportunities.js');
  screener.getScreener({ force: true });
  let lu = screener.getScreener();
  for (let i = 0; i < 1200 && lu.status === 'computing'; i++) {
    await new Promise((fin) => setTimeout(fin, 25));
    lu = screener.getScreener();
  }
  sortie.reperage = { status: lu.status, matchs: lu.data?.matches?.length ?? 0 };

  // --- LES ENTRÉES, lues par le vrai lecteur ; puis la fiche.
  const avant = ecritures();
  const entrees = await F.lireLesEntreesDuJour({ maintenant: T0, database, attenteMs: 0 });
  sortie.lecteur = { ecritures: ecritures() - avant, jour: entrees.jour, opportunites: { etat: entrees.opportunites.etat, lignes: entrees.opportunites.lignes.length }, matchs: entrees.matchs.map((m) => ({ cle: m.cle, favori: m.favori, compo: m.compo ? { source: m.compo.source, minutes: m.compo.minutesBeforeKickoff } : null })), favoris: entrees.favoris, controle: { etat: entrees.controle?.etat, feu: entrees.controle?.feu, compte: entrees.controle?.compte, enEchec: entrees.controle?.enEchec }, problemes: entrees.problemes };
  const fiche = F.construireLaFicheDuJour(entrees, { econome: false });
  const ficheE = F.construireLaFicheDuJour(entrees, { econome: true });
  const texte = P.rendreLaFicheDuJour(fiche);
  sortie.fiche = fiche;
  sortie.ficheEconome = { retenues: ficheE.opportunites.retenues.length, chutes: ficheE.opportunites.chutesRetenues.length, matchs: ficheE.favoris.matchs.length, mode: ficheE.mode };
  sortie.texte = texte;
  sortie.tokensEstimes = { jour: F.estimerLesTokens(texte), caracteres: texte.length, econome: F.estimerLesTokens(P.rendreLaFicheDuJour(ficheE)) };
  sortie.vide = F.ficheDuJourVide(fiche);
  // Les nombres du texte de la fiche sont tous ceux de la fiche : la garde les reconnaît (et un nombre inventé, non).
  sortie.garde = { sur: G.verifierLesChiffres({ fiche: texte, textes: { t: `Man City : 12,4 % à 2,30, ${fiche.opportunites.valuesVertes} values.` } }).ok, inventé: G.verifierLesChiffres({ fiche: texte, textes: { t: 'Une cote de 9,87 !' } }).ok };

  // --- LE SECOND CHEMIN : les verdicts par la route d'analyse d'un match (Mes paris), les chutes par la page des Chutes de cotes, les compositions en SQL.
  const appel = await application();
  const verdictsParRoute = {};
  for (const m of MATCHS) {
    const r = await appel('GET', `/api/analysis/match/${m.id}?source=odds-api&bankroll=10000`);
    verdictsParRoute[m.id] = r.corps?.verdicts ?? null;
  }
  sortie.verdictsParRoute = Object.fromEntries(
    Object.entries(verdictsParRoute).map(([id, v]) => [id, Object.fromEntries(['home', 'draw', 'away'].map((k) => [k, { etat: v?.[k]?.etat ?? null, vert: v?.[k]?.vert ?? null, pourcent: v?.[k]?.pourcent ?? null, cote: v?.[k]?.cote ?? null, bookmakerTitle: v?.[k]?.bookmakerTitle ?? null, coteJuste: v?.[k]?.coteJuste ?? null, probabilite: v?.[k]?.probabilite ?? null }]))])
  );
  const { droppingOdds } = await imp('data/droppingOdds.js');
  const chutes = droppingOdds({ days: 3, minDropPct: 5, force: true, database });
  sortie.chutesParLaPage = JSON.parse(JSON.stringify(chutes.items ?? chutes.rows ?? chutes)).slice?.(0, 12) ?? chutes;
  sortie.lignesCompo = database.prepare("SELECT home_name AS home, away_name AS away, kickoff, fetched_at AS fetchedAt, json_extract(payload, '$.home.unavailable') AS absentsDom FROM upcoming_lineups ORDER BY kickoff").all();
  sortie.ligne = (() => {
    const op = getOpportunities({ maintenant: T0 });
    return op.data.lignes.map((l) => ({ cle: l.cle, vert: Boolean(l.verdict?.vert), chute: l.chute, dropPct: l.mouvement?.dropPct ?? null, pourcent: l.verdict?.pourcent ?? null, cote: l.verdict?.cote ?? null, probabilite: l.probabilite, coteJuste: l.coteJuste, commenceTime: l.commenceTime }));
  })();

  // --- UN CHAMPIONNAT FAVORI : tous les matchs d'EPL le sont ; la raison est « championnat favori », pas « équipe ».
  ecrireRuntime('favorites.json', { teams: [], leagues: [{ name: 'EPL', addedAt: '2026-10-03T18:14:00.741Z' }], updatedAt: '2026-10-03T18:14:00.741Z' });
  const entrees2 = await F.lireLesEntreesDuJour({ maintenant: T0, database, attenteMs: 0 });
  const fiche2 = F.construireLaFicheDuJour(entrees2, { econome: false });
  sortie.championnatFavori = { matchs: fiche2.favoris.matchs.map((m) => [m.match, m.pourquoi]), matchsDuJour: fiche2.favoris.matchsDuJour, equipes: fiche2.favoris.equipes, championnats: fiche2.favoris.championnats };
  // Sans favori.
  ecrireRuntime('favorites.json', { teams: [], leagues: [] });
  const fiche3 = F.construireLaFicheDuJour(await F.lireLesEntreesDuJour({ maintenant: T0, database, attenteMs: 0 }), { econome: false });
  sortie.sansFavori = { matchs: fiche3.favoris.matchs.length, matchsDuJour: fiche3.favoris.matchsDuJour, texte: P.rendreLaFicheDuJour(fiche3).split('\n').filter((l) => /favoris/.test(l)) };
  // Favoris illisibles.
  ecrireRuntime('favorites.json', '{"teams":');
  const fiche4 = F.construireLaFicheDuJour(await F.lireLesEntreesDuJour({ maintenant: T0, database, attenteMs: 0 }), { econome: false });
  sortie.favorisIllisibles = { illisible: fiche4.favoris.illisible, texte: P.rendreLaFicheDuJour(fiche4).split('\n').filter((l) => /illisibles/.test(l)) };

  // --- LE REPÉRAGE PAS PRÊT : en calcul, puis en erreur — la fiche le dit, ne conclut pas « rien aujourd'hui ».
  const enCalcul = await F.lireLesEntreesDuJour({ maintenant: T0, database, attenteMs: 0, lireOpportunites: () => ({ status: 'computing', progress: { done: 3, total: 40 }, error: null, data: null }) });
  const ficheCalcul = F.construireLaFicheDuJour(enCalcul);
  const enErreur = await F.lireLesEntreesDuJour({ maintenant: T0, database, attenteMs: 0, lireOpportunites: () => ({ status: 'error', progress: null, error: 'le Repérage est tombé', data: null }) });
  const ficheErreur = F.construireLaFicheDuJour(enErreur);
  sortie.pasPret = { calcul: { etat: ficheCalcul.opportunites.etat, vide: F.ficheDuJourVide(ficheCalcul), texte: P.rendreLaFicheDuJour(ficheCalcul).split('\n').filter((l) => /pas encore calculées/.test(l)) }, erreur: { etat: ficheErreur.opportunites.etat, erreur: ficheErreur.opportunites.erreur, vide: F.ficheDuJourVide(ficheErreur) } };
  // Un Repérage qui finit de se calculer pendant l'attente (le lecteur attend, par pas).
  let appels = 0;
  const filePrete = await F.lireLesEntreesDuJour({
    maintenant: T0,
    database,
    attenteMs: 1_000,
    pasMs: 1,
    lireOpportunites: (o) => {
      appels++;
      return appels < 4 ? { status: 'computing', progress: null, error: null, data: null } : getOpportunities({ ...o, maintenant: T0 });
    }
  });
  sortie.attente = { appels, etat: filePrete.opportunites.etat, lignes: filePrete.opportunites.lignes.length };

  // --- UN JOUR SANS MATCH : le Repérage est prêt, rien à dire — la fiche est vide (aucun appel ne partira).
  const noel = Date.parse('2026-12-25T08:00:00Z');
  ecrireRuntime('favorites.json', { teams: [], leagues: [] });
  const ficheNoel = F.construireLaFicheDuJour(await F.lireLesEntreesDuJour({ maintenant: noel, database, attenteMs: 0, lireOpportunites: (o) => getOpportunities({ ...o, maintenant: noel }) }));
  sortie.sansMatch = { vide: F.ficheDuJourVide(ficheNoel), lignes: ficheNoel.opportunites.lignesLues, favoris: ficheNoel.favoris.matchsDuJour, etat: ficheNoel.opportunites.etat };

  // --- LES MATCHS DU JOUR (liste injectée) : ceux qui ne sont pas commencés. Un match COTÉ qui a commencé est écarté ; un match du calendrier
  // (sans cote : son heure n'est qu'un repli de midi) garde son jour ; un autre jour est écarté. Seuls les comptes sont regardés.
  const unMatch = (home, away, commenceTime, hasOdds) => ({ matchId: `${home}-${away}`, home, away, league: 'EPL', commenceTime, hasOdds });
  const reperageVide = () => ({ status: 'ready', error: null, progress: null, data: { generatedAt: iso(T0), lignes: [], resume: {} } });
  const liste = [
    unMatch('Aston Villa', 'Wolves', iso(T0 - 30 * MIN), true), // commencé il y a 30 minutes, coté : écarté
    unMatch('Everton', 'Leeds', iso(T0 + 6 * H), true), // à venir, coté : gardé
    unMatch('Brighton', 'Burnley', iso(T0 - 2 * H), false), // du calendrier, sans cote : gardé même avec une heure de repli passée
    unMatch('Fulham', 'Brentford', iso(T0 + 30 * H), true) // demain : écarté
  ];
  const entreesListe = await F.lireLesEntreesDuJour({ maintenant: T0, database, attenteMs: 0, lireOpportunites: reperageVide, listerLesMatchs: () => liste });
  sortie.listeInjectee = { nombre: entreesListe.nombreDeMatchsDuJour, lectures: entreesListe.lectures, problemes: entreesListe.problemes };
}

// ============================================================================================== semaine
else if (phase === 'semaine') {
  // --- PLANTÉ : la semaine écoulée à la date du 05/10/2026 est celle du 28/09 au 04/10. Des lignes dedans, et autour pour les écarter.
  const dans = (jour, h = '21:00') => `${jour}T${h}:00.000Z`;
  const pronostic = (id, status, marketId, market, league, settledAt) => ({ id, day: '2026-09-25', matchId: `m-${id}`, homeName: 'A', awayName: 'B', league, market, marketId, predictedLabel: 'x', predictedOdds: 2, status, settledAt, settledBy: 'auto', firstSeenAt: '2026-09-25T10:00:00.000Z', lastSeenAt: '2026-09-25T10:00:00.000Z' });
  const preds = [
    // dans la semaine : 12 réglés — Résultat 5 (3 justes), Total buts 4 (1 juste), Les deux marquent 2 (2 justes), Corners 1 (0 juste)
    pronostic('p1', 'correct', 'result', 'Résultat', 'EPL', dans('2026-09-28')),
    pronostic('p2', 'correct', 'result', 'Résultat', 'EPL', dans('2026-09-29')),
    pronostic('p3', 'incorrect', 'result', 'Résultat', 'Ligue 1', dans('2026-09-30')),
    pronostic('p4', 'correct', 'result', 'Résultat', 'Serie A', dans('2026-10-01')),
    pronostic('p5', 'incorrect', 'result', 'Résultat', 'EPL', dans('2026-10-04', '10:00')),
    pronostic('p6', 'incorrect', 'totalGoals', 'Total buts', 'EPL', dans('2026-09-29')),
    pronostic('p7', 'correct', 'totalGoals', 'Total buts', 'Ligue 1', dans('2026-09-30')),
    pronostic('p8', 'incorrect', 'totalGoals', 'Total buts', 'EPL', dans('2026-10-02')),
    pronostic('p9', 'incorrect', 'totalGoals', 'Total buts', 'Serie A', dans('2026-10-03')),
    pronostic('p10', 'correct', 'bothTeamsScore', 'Les 2 équipes marquent', 'EPL', dans('2026-10-02')),
    pronostic('p11', 'correct', 'bothTeamsScore', 'Les 2 équipes marquent', 'Ligue 1', dans('2026-10-03')),
    pronostic('p12', 'incorrect', 'teamCorners', 'Corners — Arsenal', 'EPL', dans('2026-10-04', '20:00')),
    // autour : la veille de la semaine (réglé le dimanche 27/09 tard le soir à Paris = le même jour), le lundi suivant, en attente, sans date
    pronostic('p13', 'correct', 'result', 'Résultat', 'EPL', '2026-09-27T21:30:00.000Z'),
    pronostic('p14', 'incorrect', 'result', 'Résultat', 'EPL', '2026-10-05T01:00:00.000Z'),
    { ...pronostic('p15', 'pending', 'result', 'Résultat', 'EPL', null) },
    pronostic('p16', 'correct', 'result', 'Résultat', 'EPL', 'pas-une-date')
  ];
  // Le dimanche 04/10 à 22 h UTC = lundi 05/10 à 0 h à Paris : HORS de la semaine (jour de Paris). Et le 27/09 à 22 h UTC = lundi 28/09 0 h : DANS.
  preds.push(pronostic('p17', 'correct', 'result', 'Résultat', 'EPL', '2026-10-04T22:30:00.000Z'));
  preds.push(pronostic('p18', 'incorrect', 'bothTeamsScore', 'Les 2 équipes marquent', 'MLS', '2026-09-27T22:30:00.000Z'));
  ecrireRuntime('predictions.json', preds);

  const jambe = (matchId, home, away, league, pick, odds, status, p) => ({ matchId, homeName: home, awayName: away, league, market: 'Résultat', marketId: 'result', pick, odds, status, ...(p ? { probabiliteMoteur: p } : {}) });
  const pari = (id, status, stake, odds, settledAt, jambes, extra = {}) => ({ id, createdAt: '2026-09-27T10:00:00.000Z', settledAt, status, stake, odds, legs: jambes, bookmaker: 'winamax_fr', bookmakerTitle: 'Winamax (FR)', ...extra });
  const paris = [
    pari('b1', 'won', 10, 2.1, dans('2026-09-29'), [jambe('x1', 'Lyon', 'Nice', 'Ligue 1', 'Lyon gagne', 2.1, 'won', 0.5)]),
    pari('b2', 'lost', 5, 1.9, dans('2026-09-30'), [jambe('x2', 'Arsenal', 'Chelsea', 'EPL', 'Arsenal gagne', 1.9, 'lost', 0.55)]),
    pari('b3', 'lost', 8, 2.4, dans('2026-10-02'), [jambe('x3', 'Roma', 'Lazio', 'Serie A', 'Roma gagne', 2.4, 'lost')]),
    pari('b4', 'won', 4, 3.0, dans('2026-10-03'), [jambe('x4', 'Man City', 'Everton', 'EPL', 'Man City gagne', 3.0, 'won', 0.4)]),
    pari('b5', 'void', 6, 2.0, dans('2026-10-01'), [jambe('x5', 'Leeds', 'Fulham', 'EPL', 'Leeds gagne', 2.0, 'void')]),
    pari('b6', 'lost', 5, 6.0, dans('2026-10-02'), [jambe('x6', 'Lyon', 'Nantes', 'Ligue 1', 'Lyon gagne', 2.0, 'lost'), jambe('x7', 'Nice', 'Brest', 'Ligue 1', 'Nice gagne', 3.0, 'lost')], { nature: 'combine' }),
    // hors semaine : réglé avant, réglé après, en attente
    pari('b7', 'won', 20, 2.0, dans('2026-09-26'), [jambe('x8', 'A', 'B', 'EPL', 'A gagne', 2.0, 'won')]),
    pari('b8', 'lost', 20, 2.0, dans('2026-10-06'), [jambe('x9', 'C', 'D', 'EPL', 'C gagne', 2.0, 'lost')]),
    pari('b9', 'pending', 7, 2.2, null, [jambe('x10', 'E', 'F', 'EPL', 'E gagne', 2.2, 'pending')])
  ];
  ecrireRuntime('bets.json', paris);

  // Les analyses de l'IA (et leur revue d'après-match) : celles du 28/09 au 04/10 comptent, les autres non.
  const rv = (market, marketId, aiVerdict, aiWasRight, outcome, extra = {}) => ({ market, marketId, pick: `pronostic ${market}`, aiVerdict, aiConfidence: 'moyenne', aiWasRight, outcome, minOdds: 1.2, ...extra });
  const analyse = (matchId, home, away, league, commenceTime, reviews) => ({ matchId, homeName: home, awayName: away, league, commenceTime, postMatchReview: { createdAt: iso(Date.parse(commenceTime) + 4 * H), marketReviews: reviews } });
  ecrireRuntime('match-ai-analyses.json', [
    analyse('a1', 'Lyon', 'Nice', 'Ligue 1', '2026-09-29T19:00:00.000Z', [rv('Résultat', 'result', 'confirme', true, 'juste'), rv('Total buts', 'totalGoals', 'confirme', false, 'faux'), rv('Résultat', 'result', 'nuance', null, 'juste')]),
    analyse('a2', 'Arsenal', 'Chelsea', 'EPL', '2026-10-03T14:00:00.000Z', [rv('Résultat', 'result', 'contredit', true, 'faux'), rv('Total corners', 'totalCorners', 'confirme', false, 'faux'), rv('Les 2 équipes marquent', 'bothTeamsScore', 'confirme', true, 'juste', { minOdds: 0 })]),
    // hors semaine
    analyse('a3', 'Roma', 'Lazio', 'Serie A', '2026-09-26T19:00:00.000Z', [rv('Résultat', 'result', 'confirme', false, 'faux')]),
    analyse('a4', 'Leeds', 'Fulham', 'EPL', '2026-10-05T19:00:00.000Z', [rv('Résultat', 'result', 'confirme', false, 'faux')]),
    // sans revue
    { matchId: 'a5', homeName: 'X', awayName: 'Y', league: 'EPL', commenceTime: '2026-10-01T19:00:00.000Z', analysis: {} }
  ]);
  // Le carnet de l'IA de la nuit (une forme minimale que lit lireLeCarnet).
  const carnet = { version: 1, calculeLe: '2026-10-05T03:10:00.000Z', depuis: { jour: '2026-09-30' }, analyses: { reglees: 240 }, total: { bilan: { aiVerdicts: 716, aiRight: 394 } }, types: [{ marketType: 'result', label: 'Résultat', bilan: { aiVerdicts: 300, aiRight: 170 } }, { marketType: 'totalGoals', label: 'Total buts', bilan: { aiVerdicts: 0, aiRight: 0 } }] };
  ecrireRuntime('carnet-ia.json', carnet);

  // --- LES ENTRÉES, lues par le vrai lecteur (la valeur de clôture, elle, par le vrai rapport — sans cote gratuite dans la base d'essai).
  const entrees = await F.lireLesEntreesDeLaSemaine({ maintenant: T0, database });
  sortie.entrees = { jour: entrees.jour, semaine: entrees.semaine, problemes: entrees.problemes, pronostics: entrees.pronostics.length, paris: entrees.paris.length, analyses: entrees.analyses.length, carnet: entrees.carnet.etat, carte: entrees.carte, cloture: { disponible: entrees.cloture.disponible, mesures: entrees.cloture.mesures.length, manques: entrees.cloture.manques.length } };
  const fiche = F.construireLaFicheDeLaSemaine(entrees, { econome: false });
  const texte = P.rendreLaFicheDeLaSemaine(fiche);
  sortie.fiche = fiche;
  sortie.texte = texte;
  sortie.tokensEstimes = { semaine: F.estimerLesTokens(texte), caracteres: texte.length, econome: F.estimerLesTokens(P.rendreLaFicheDeLaSemaine(F.construireLaFicheDeLaSemaine(entrees, { econome: true }))) };
  sortie.vide = F.ficheDeLaSemaineVide(fiche);

  // --- LE SECOND CHEMIN : des boucles écrites à la main sur les fichiers plantés (rien de bulletinFiches.js, suiviParis.js ni gardeFous.js).
  const parisHorsSemaineEcartes = JSON.parse(fs.readFileSync(path.join(RUNTIME, 'bets.json'), 'utf8'));
  const jourParis = (instant) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(new Date(instant));
  const dedans = (instantIso) => {
    const t = Date.parse(instantIso ?? '');
    if (!Number.isFinite(t)) return false;
    const j = jourParis(t);
    return j >= '2026-09-28' && j <= '2026-10-04';
  };
  const reglesDeLaSemaine = JSON.parse(fs.readFileSync(path.join(RUNTIME, 'predictions.json'), 'utf8')).filter((p) => (p.status === 'correct' || p.status === 'incorrect') && dedans(p.settledAt));
  const parMarche = {};
  const parLigue = {};
  for (const p of reglesDeLaSemaine) {
    for (const [table, cle] of [[parMarche, p.marketId], [parLigue, p.league]]) {
      table[cle] ??= { regles: 0, justes: 0 };
      table[cle].regles++;
      if (p.status === 'correct') table[cle].justes++;
    }
  }
  const attenduPronostics = { regles: reglesDeLaSemaine.length, justes: reglesDeLaSemaine.filter((p) => p.status === 'correct').length, parMarche, parLigue };
  const gain = (b) => (b.status === 'won' ? b.stake * b.odds - b.stake : b.status === 'lost' ? -b.stake : null);
  const betsDedans = parisHorsSemaineEcartes.filter((b) => ['won', 'lost', 'void'].includes(b.status) && dedans(b.settledAt));
  const jouesEtRegles = betsDedans.filter((b) => b.status !== 'void');
  const mise = jouesEtRegles.reduce((n, b) => n + b.stake, 0);
  const gainReel = jouesEtRegles.reduce((n, b) => n + gain(b), 0);
  // Gain attendu : mise × (probabilité du moteur × cote − 1), pour les paris simples qui ont la probabilité.
  const avecP = jouesEtRegles.filter((b) => b.legs.length === 1 && typeof b.legs[0].probabiliteMoteur === 'number');
  const attendu = avecP.reduce((n, b) => n + b.stake * (b.legs[0].probabiliteMoteur * b.odds - 1), 0);
  const gainDesAvecP = avecP.reduce((n, b) => n + gain(b), 0);
  const ligues = {};
  for (const b of jouesEtRegles) {
    const k = new Set(b.legs.map((l) => l.league)).size > 1 ? 'Plusieurs championnats (combinés)' : b.legs[0].league;
    ligues[k] ??= { paris: 0, gain: 0 };
    ligues[k].paris++;
    ligues[k].gain += gain(b);
  }
  sortie.attendu = {
    pronostics: attenduPronostics,
    paris: { regles: jouesEtRegles.length, gagnes: jouesEtRegles.filter((b) => b.status === 'won').length, perdus: jouesEtRegles.filter((b) => b.status === 'lost').length, annules: betsDedans.filter((b) => b.status === 'void').length, mise, gainReel, roiPct: (100 * gainReel) / mise, attendu: { paris: avecP.length, gainAttendu: attendu, gainReel: gainDesAvecP }, enAttente: parisHorsSemaineEcartes.filter((b) => b.status === 'pending').length, ligues, ids: jouesEtRegles.map((b) => b.id) }
  };
  // L'IA : les avis jugés dont le MATCH est dans la semaine (jour de Paris du coup d'envoi), minOdds présent, aiWasRight vrai ou faux.
  const analyses = JSON.parse(fs.readFileSync(path.join(RUNTIME, 'match-ai-analyses.json'), 'utf8'));
  let avis = 0;
  let tenus = 0;
  const erreurs = [];
  for (const a of analyses) {
    if (!a.postMatchReview || !dedans(a.commenceTime)) continue;
    for (const r of a.postMatchReview.marketReviews) {
      if (!r.minOdds || (r.aiWasRight !== true && r.aiWasRight !== false)) continue;
      avis++;
      if (r.aiWasRight) tenus++;
      else erreurs.push(`${a.homeName} - ${a.awayName} | ${r.market}`);
    }
  }
  sortie.attendu.ia = { avis, tenus, erreurs };

  // --- LA VALEUR DE CLÔTURE injectée : le rapport de closingValue.js est remplacé par des mesures connues (par pari simple, « <id>#0 »).
  const mesures = [
    { id: 'b1#0', valueAtClosePct: 4.0 },
    { id: 'b2#0', valueAtClosePct: -2.0 },
    { id: 'b4#0', valueAtClosePct: 7.0 },
    { id: 'b7#0', valueAtClosePct: 50 } // hors semaine : écarté
  ];
  const entreesCloture = await F.lireLesEntreesDeLaSemaine({ maintenant: T0, database, lireCloture: async () => ({ toutesLesMesures: mesures, missing: [], generatedAt: iso(T0), totalEntries: 4, measured: 4 }) });
  sortie.cloture = F.construireLaFicheDeLaSemaine(entreesCloture).valeurDeCloture;
  // Une valeur de clôture qui ne se lit pas : dite, la fiche ne l'invente pas.
  const entreesSansCloture = await F.lireLesEntreesDeLaSemaine({ maintenant: T0, database, lireCloture: async () => { throw new Error('base des cotes indisponible'); } });
  const ficheSansCloture = F.construireLaFicheDeLaSemaine(entreesSansCloture);
  sortie.clotureIndisponible = { fiche: ficheSansCloture.valeurDeCloture, texte: P.rendreLaFicheDeLaSemaine(ficheSansCloture).split('\n').filter((l) => /indisponible/.test(l)) };

  // --- SANS CARNET DE L'IA, puis avec un fichier illisible : la fiche le dit.
  fs.rmSync(path.join(RUNTIME, 'carnet-ia.json'));
  const sansCarnet = F.construireLaFicheDeLaSemaine(await F.lireLesEntreesDeLaSemaine({ maintenant: T0, database }));
  sortie.sansCarnet = { etat: sansCarnet.ia.carnet.etat, texte: P.rendreLaFicheDeLaSemaine(sansCarnet).split('\n').filter((l) => /Carnet de l'IA/.test(l)) };
  ecrireRuntime('carnet-ia.json', '{"types":');
  const carnetCasse = F.construireLaFicheDeLaSemaine(await F.lireLesEntreesDeLaSemaine({ maintenant: T0, database }));
  sortie.carnetIllisible = { etat: carnetCasse.ia.carnet.etat, texte: P.rendreLaFicheDeLaSemaine(carnetCasse).split('\n').filter((l) => /Carnet de l'IA/.test(l)) };
  // --- UN CARNET DE PARIS ILLISIBLE : la lecture échoue, elle est dite (jamais « aucun pari »).
  ecrireRuntime('bets.json', '[{"id":');
  const entreesCasse = await F.lireLesEntreesDeLaSemaine({ maintenant: T0, database });
  const ficheCasse = F.construireLaFicheDeLaSemaine(entreesCasse);
  sortie.parisIllisibles = { problemes: entreesCasse.problemes, regles: ficheCasse.paris.regles, lectures: entreesCasse.lectures, lu: ficheCasse.paris.lu, texte: P.rendreLaFicheDeLaSemaine(ficheCasse).split('\n').filter((l) => /illisible|ÉCHOUÉ/.test(l)) };
  // --- LES TROIS JOURNAUX ILLISIBLES À LA FOIS (pronostics, paris, analyses de l'IA) : chacun est dit, aucun n'est pris pour « rien », la semaine n'est pas « vide ».
  await new Promise((fin) => setTimeout(fin, 30)); // l'horodatage du fichier des analyses (la clé de son cache) doit changer
  ecrireRuntime('predictions.json', '[{"id":');
  ecrireRuntime('match-ai-analyses.json', '[{"id":');
  const entreesTout = await F.lireLesEntreesDeLaSemaine({ maintenant: T0, database });
  const ficheTout = F.construireLaFicheDeLaSemaine(entreesTout);
  sortie.toutIllisible = { lectures: entreesTout.lectures, lu: [ficheTout.pronostics.lu, ficheTout.paris.lu, ficheTout.ia.semaine.lu], vide: F.ficheDeLaSemaineVide(ficheTout), problemes: entreesTout.problemes.length, lignesIllisibles: P.rendreLaFicheDeLaSemaine(ficheTout).split('\n').filter((l) => /illisible/.test(l)).length };
  await new Promise((fin) => setTimeout(fin, 30));
  // --- UNE SEMAINE VIDE : rien de réglé.
  ecrireRuntime('bets.json', []);
  ecrireRuntime('predictions.json', []);
  ecrireRuntime('match-ai-analyses.json', []);
  const videFiche = F.construireLaFicheDeLaSemaine(await F.lireLesEntreesDeLaSemaine({ maintenant: T0, database }));
  sortie.semaineVide = { vide: F.ficheDeLaSemaineVide(videFiche), texte: P.rendreLaFicheDeLaSemaine(videFiche).split('\n').filter((l) => /Aucun/.test(l)) };
}

else {
  throw new Error(`Phase inconnue : ${phase}`);
}

console.log(JSON.stringify(sortie));
