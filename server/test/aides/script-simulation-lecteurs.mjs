/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-simulation-lecteurs.mjs <serveur de la copie>
 *
 * Étape 28 — CE QUE L'APPLI LIT DE LA SIMULATION, par le VRAI serveur (routes Express appelées sans réseau, heure figée
 * au 05/10/2026 3 h de Paris, réglages de la copie AVEC la clé du modèle de buts) :
 *   - un ESPION sur simulerMatch, posé dans la copie avant tout import : aucune simulation dans ce processus (les
 *     chemins se tirent dans le processus à part de la nuit) — ni la page du match, ni le ticket, ni les routes ;
 *   - T15/B9 : les interrupteurs (simulation_state seulement ; empreinte des réglages, versions du moteur et
 *     engine-config.json inchangés ; « combines » et « tout » refusés en 409 sans la preuve, puis sans la clé) ;
 *   - les nuits (fins de saison d'un championnat planté, déroulés des trois rencontres cotées), puis GET /saison,
 *     GET /enjeux, la page du match (bloc `simulation`, jamais dans le message de l'IA) ;
 *   - B6 : POST /prix-combine (score seul, contradictoires, redondantes, corners, déroulé hors « tout », sans ligne, au-delà
 *     de 10 %, éteint) ;
 *   - B7 : « J'ai parié » avec le prix juste d'un combiné, ses refus, le gain attendu, l'écart-type du suivi ; le coupe-
 *     circuit inchangé par les champs nouveaux.
 * Sortie : une ligne JSON ; le TEST recalcule les attentes.
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { Socket } from 'node:net';
import { pathToFileURL } from 'node:url';
import { planterUnChampionnat, planterLesForces, LIGUE_ESSAI } from './simulationFabrique.mjs';
import { installerFauxFetch, listeDuJour } from './fotmobSimule.mjs';

const [serveur] = process.argv.slice(2);

// L'ESPION, avant tout import : simulerMatch compte ses appels DANS CE PROCESSUS (la copie seulement).
const FICHIER_SIM = path.join(serveur, 'src', 'data', 'simulation', 'simulationMatch.js');
{
  const t = fs.readFileSync(FICHIER_SIM, 'utf8');
  const avant = 'export function simulerMatch({ lambda, mu, grille = null, params, n = N, seed, depuis = null }) {';
  if (t.split(avant).length !== 2) throw new Error('espion : la signature de simulerMatch a changé');
  fs.writeFileSync(FICHIER_SIM, t.replace(avant, 'export const APPELS_POUR_L_ESPION = { simulerMatch: 0 };\nexport function simulerMatch(a) {\n  APPELS_POUR_L_ESPION.simulerMatch++;\n  return simulerMatchSansEspion(a);\n}\nfunction simulerMatchSansEspion({ lambda, mu, grille = null, params, n = N, seed, depuis = null }) {'));
}

const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);
const { openDb, resolveDbPath } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error('Base inattendue');
const db = openDb();
const SM = await imp('data/simulation/simulationMatch.js');
const SN = await imp('data/simulation/simulationNuit.js');
const ES = await imp('data/simulation/etatSimulation.js');
const { getEngineConfig } = await imp('core/engine/engineConfig.js');
const { empreinteDesReglages, etatDesVersions } = await imp('core/engine/engineVersions.js');
const { getFixturePaths } = await imp('data/repositories/fixturesRepository.js');
const { CALENDAR_FILE_PATH } = await imp('data/repositories/seasonCalendarRepository.js');
const RUNTIME = path.join(serveur, 'data', 'runtime');
const sha = (f) => (fs.existsSync(f) ? crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex') : 'absent');
const sortie = { ok: true };
const M = '2026-10-05T01:00:00.000Z';

// ------------------------------------------------------------ la copie : relevé coté, championnat planté, calendrier
const instantane = getFixturePaths().odds;
if (!path.resolve(instantane).toLowerCase().startsWith(path.resolve(serveur).toLowerCase())) throw new Error('instantané hors de la copie');
const h2h = (home, away, [o1, ox, o2]) => ({ key: 'h2h', outcomes: [{ name: home, price: o1 }, { name: away, price: o2 }, { name: 'Draw', price: ox }] });
const coté = (id, home, away, ko, cotes) => ({ id, sport_key: 'soccer_epl', sport_title: 'EPL', commence_time: ko, home_team: home, away_team: away, bookmakers: [{ key: 'pinnacle', title: 'Pinnacle', last_update: '2026-10-04T20:00:00Z', markets: [h2h(home, away, cotes)] }] });
fs.mkdirSync(path.dirname(instantane), { recursive: true });
fs.writeFileSync(instantane, JSON.stringify([{ data: [coté('essai-a', 'Man City', 'Liverpool', '2026-10-05T18:30:00Z', [2.0, 3.6, 3.9]), coté('essai-b', 'Arsenal', 'Chelsea', '2026-10-05T19:00:00Z', [2.2, 3.5, 3.4]), coté('essai-e', 'Fulham', 'Brentford', '2026-10-06T20:00:00Z', [2.4, 3.3, 3.0])] }]));
const P = planterUnChampionnat(db, { n: 20, jouees: 3, jourD: '2026-10-05', releveLe: '2026-10-04T20:00:00.000Z', aVenir: 3 });
fs.writeFileSync(CALENDAR_FILE_PATH, JSON.stringify(P.calendrier));
planterLesForces(db, { clubs: P.clubs, jour: '2026-10-04', calculeLe: '2026-10-04T03:00:00.000Z' });

// L'application Express, appelée sans réseau.
const { createApp } = await imp('app.js');
const app = createApp();
const appel = (methode, url, corps) =>
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

// ------------------------------------------------------------ T15 / B9 : les interrupteurs
// L'étape 28 lancée le 01/09 au registre de la COPIE (le premier démarrage du serveur avec ce code).
const { enregistrerLancements } = await imp('bench/trialsRegistry.js');
enregistrerLancements({ maintenant: Date.parse('2026-09-01T10:00:00Z') });
const photo = () => ({ fichier: sha(path.join(RUNTIME, 'engine-config.json')), reglages: empreinteDesReglages(getEngineConfig('football')), versions: JSON.stringify(etatDesVersions()) });
const avant = photo();
const i = {};
i.etat = await appel('GET', '/api/simulation/etat');
i.combinesSansPreuve = await appel('PUT', '/api/simulation/affichage', { cle: 'matchs', valeur: 'combines' });
i.toutSansPreuve = await appel('PUT', '/api/simulation/affichage', { cle: 'matchs', valeur: 'tout' });
i.saisons = await appel('PUT', '/api/simulation/affichage', { cle: 'saisons', valeur: 'allume' });
// Un principal « retenu » d'un AUTRE lancement de l'étape 28 (une version d'avant) : il n'ouvre rien.
ES.ecrireLaValeur(db, 'principal', { le: '2026-08-26T02:00:00.000Z', verdict: 'retenu', garde: { ok: true, eteints: [], seuilPt: 4 }, lancement: '2026-08-01', version: 'simulation-v0' });
i.combinesAncien = await appel('PUT', '/api/simulation/affichage', { cle: 'matchs', valeur: 'combines' });
i.etatAncien = await appel('GET', '/api/simulation/etat');
// Le principal « retenu » du lancement EN COURS : les combinés s'ouvrent.
ES.ecrireLaValeur(db, 'principal', { le: '2026-09-26T02:00:00.000Z', verdict: 'retenu', garde: { ok: true, eteints: [], seuilPt: 4 }, lancement: '2026-09-01', version: 'simulation-v1' });
i.combines = await appel('PUT', '/api/simulation/affichage', { cle: 'matchs', valeur: 'combines' });
i.inconnu = await appel('PUT', '/api/simulation/affichage', { cle: 'pas-un-interrupteur', valeur: 'x' });
i.valeur = await appel('PUT', '/api/simulation/affichage', { cle: 'matchs', valeur: 'parfois' });
i.etatApres = await appel('GET', '/api/simulation/etat');
const apres = photo();
sortie.interrupteurs = { ...i, avant, apres, etatRange: ES.lireLesValeurs(db) };

// ------------------------------------------------------------ les nuits
const nuitS = await SN.simulerLesSaisonsDeLaNuit({ maintenant: M, aPart: false, n: 2000, ligues: [LIGUE_ESSAI] });
const nuitM = await SN.simulerLesMatchsDeLaNuit({ maintenant: M, aPart: true });
sortie.nuits = { saisons: nuitS.mode, matchs: nuitM.mode, erreurMatchs: nuitM.erreur ?? null, lignes: db.prepare('SELECT fixture_key, role, grille, home_name, lambda, mu, rho, fair FROM simulation_matchs ORDER BY fixture_key').all() };

// ------------------------------------------------------------ GET /saison, GET /enjeux
const enc = encodeURIComponent;
sortie.saison = await appel('GET', `/api/simulation/saison?league=${enc(LIGUE_ESSAI)}`);
sortie.coupe = await appel('GET', `/api/simulation/saison?league=${enc('EFL Cup')}`);
sortie.sansLigue = await appel('GET', '/api/simulation/saison');
sortie.enjeux = await appel('GET', '/api/simulation/enjeux?du=2026-10-05&au=2026-10-19');
sortie.enjeuxFaux = await appel('GET', '/api/simulation/enjeux?du=hier&au=2026-10-19');
sortie.planté = { clubs: P.clubs.map((c) => [c.numero, c.nom]), calendrier: P.calendrier.length };

// ------------------------------------------------------------ la page du match (déroulé en « tout ») et l'IA
ES.ecrireLaValeur(db, 'affichage_matchs', 'tout');
const page = await appel('GET', '/api/analysis/match/essai-a?source=odds-api&bankroll=10000');
sortie.page = { code: page.code, simulation: page.corps?.simulation ?? null, modeleDeButs: page.corps?.modeleDeButs ? { expectedGoals: page.corps.modeleDeButs.expectedGoals, rho: page.corps.modeleDeButs.rho } : null, result: page.corps?.distributions?.result ?? null, verdicts: page.corps?.verdicts ?? null };
// Vérification du 27/10, constat 13 (a) : une lecture de la simulation qui ÉCHOUE (la table de l'état remplacée par une
// table sans ses colonnes) n'empêche jamais l'analyse de la page du match — 200, le bloc absent, le reste identique.
db.exec('ALTER TABLE simulation_state RENAME TO simulation_state_de_cote');
db.exec('CREATE TABLE simulation_state (autre TEXT)');
const pageRatee = await appel('GET', '/api/analysis/match/essai-a?source=odds-api&bankroll=10000');
db.exec('DROP TABLE simulation_state');
db.exec('ALTER TABLE simulation_state_de_cote RENAME TO simulation_state');
sortie.pageLectureRatee = { code: pageRatee.code, simulation: pageRatee.corps?.simulation ?? null, aLaCle: Boolean(pageRatee.corps && 'simulation' in pageRatee.corps), result: pageRatee.corps?.distributions?.result ?? null, verdicts: pageRatee.corps?.verdicts ?? null, erreur: pageRatee.corps?.error ?? null };
// FotMob simulé (journées vides) : le contexte de l'IA ne sort jamais (le patron de script-moteur-a-blanc.mjs).
installerFauxFetch({ listes: { 20261004: listeDuJour([]), 20261005: listeDuJour([]), 20261006: listeDuJour([]) } });
const service = await imp('core/ai/matchAiAnalysisService.js');
const sansBloc = { ...page.corps };
delete sansBloc.simulation;
const ia1 = await service.preparerAnalyseAvantMatch({ matchId: 'essai-a', home: 'Man City', away: 'Liverpool', league: 'EPL', engineResult: page.corps, sansRepliPayant: true });
const ia2 = await service.preparerAnalyseAvantMatch({ matchId: 'essai-a', home: 'Man City', away: 'Liverpool', league: 'EPL', engineResult: sansBloc, sansRepliPayant: true });
sortie.ia = { identique: ia1.userMessage === ia2.userMessage && ia1.system === ia2.system, mentionne: /simulation|déroulé simulé|enjeu/i.test(ia1.userMessage) };

// ------------------------------------------------------------ B6 : le prix juste d'un ticket
const leg = (marketId, params, pick, extra = {}) => ({ matchId: 'essai-a', homeName: 'Man City', awayName: 'Liverpool', league: 'EPL', commenceTime: '2026-10-05T18:30:00Z', market: extra.market ?? marketId, marketId, params, pick, ...extra });
const UN = leg('result', { outcome: 'home' }, 'Man City', { market: 'Résultat' });
const DEUX = leg('result', { outcome: 'away' }, 'Liverpool', { market: 'Résultat' });
const PLUS25 = leg('totalGoals', { line: 2.5, side: 'over' }, 'Plus de 2,5 buts', { market: 'Total buts' });
const PLUS05 = leg('totalGoals', { line: 0.5, side: 'over' }, 'Plus de 0,5 but', { market: 'Total buts' });
const BTTS = leg('bothTeamsScore', { outcome: 'yes' }, 'Oui', { market: 'Les 2 équipes marquent' });
const CORNERS = leg('totalCorners', { line: 9.5, side: 'over' }, 'Plus de 9,5 corners', { market: 'Total corners' });
const MT = leg('halfTimeResult', { outcome: 'home' }, 'Mi-temps : Man City', { market: 'Mi-temps' });
const prix = (legs, cote = null) => appel('POST', '/api/simulation/prix-combine', { legs, ...(cote ? { cote } : {}) });
// Vérification du 27/10, constats 7 et 12 : la GARDE DE SÛRETÉ du principal (« retenu ») a éteint un marché de déroulé
// (« 2e mi-temps plus de buts ») et un combiné (« 1 & les deux marquent ») : chacun s'éteint SEUL — « tout » permis, la
// page sans ce marché, le prix des autres donné, les deux éteints refusés en mots ; Réglages le dit en libellés.
const PRINCIPAL_RETENU = ES.lireEtat({ database: db }).principal;
ES.ecrireLaValeur(db, 'affichage_matchs', 'eteint');
ES.ecrireLaValeur(db, 'principal', { ...PRINCIPAL_RETENU, garde: { ok: false, eteints: ['h2plusQueH1', '1 & les deux marquent'], seuilPt: 4 } });
const g = {};
g.put = await appel('PUT', '/api/simulation/affichage', { cle: 'matchs', valeur: 'tout' });
g.etat = (await appel('GET', '/api/simulation/etat')).corps;
g.page = (await appel('GET', '/api/analysis/match/essai-a?source=odds-api&bankroll=10000')).corps?.simulation ?? null;
g.prixScore = (await prix([UN, PLUS25])).corps;
g.prixBtts = (await prix([UN, BTTS])).corps;
g.prixH2 = (await prix([UN, leg('secondHalfMoreGoals', { outcome: 'yes' }, '2e mi-temps plus de buts', { market: 'Déroulé' })])).corps;
g.prixMtEnTout = (await prix([MT, UN])).corps;
ES.ecrireLaValeur(db, 'principal', PRINCIPAL_RETENU);
ES.ecrireLaValeur(db, 'affichage_matchs', 'tout');
sortie.garde = g;
const p = {};
p.score = await prix([UN, PLUS25, BTTS], 4.2);
p.simple = await prix([UN]);
p.contradictoires = await prix([UN, DEUX]);
p.redondantes = await prix([UN, PLUS05]);
p.corners = await prix([UN, CORNERS]);
p.mtEnTout = await prix([MT, UN]);
// Partie C (porte 1) : les marchés écartés par la preuve, refusés en mots même en « tout ».
p.butsDeuxMiTemps = await prix([leg('goalInBothHalves', { outcome: 'yes' }, 'Un but dans chaque mi-temps', { market: 'Déroulé' }), UN]);
p.rouge = await prix([UN, leg('redCard', { outcome: 'yes' }, 'Au moins un rouge', { market: 'Déroulé' })]);
ES.ecrireLaValeur(db, 'affichage_matchs', 'combines');
p.mtEnCombines = await prix([MT, UN]);
ES.ecrireLaValeur(db, 'affichage_matchs', 'tout');
db.prepare("UPDATE simulation_matchs SET lambda = ROUND(lambda * 1.2, 3) WHERE home_name = 'Man City'").run();
p.mtAuDelaDe10 = await prix([MT, UN]);
db.prepare("DELETE FROM simulation_matchs WHERE home_name = 'Man City'").run();
p.mtSansLigne = await prix([MT, UN]);
p.scoreSansLigne = await prix([UN, PLUS25]);
p.vide = await appel('POST', '/api/simulation/prix-combine', { legs: [] });
p.sansMarche = await appel('POST', '/api/simulation/prix-combine', { legs: [{ matchId: 'essai-a' }] });
ES.ecrireLaValeur(db, 'affichage_matchs', 'eteint');
p.eteint = await prix([UN, PLUS25]);
sortie.prix = p;
sortie.distributionCorners = (await imp('sports/football/markets.js')).distributionDuMarche(page.corps, { marketId: 'totalCorners', params: { line: 9.5, side: 'over' } });

// ------------------------------------------------------------ T15 bis : les interrupteurs RELUS avec leurs conditions
// L'interrupteur des matchs rangé sur « tout », puis ses conditions retirées une à une (JAMAIS l'interrupteur) : la page,
// le ticket et GET /etat se comportent comme éteint et disent pourquoi ; la valeur rangée reste « tout » ; le principal
// remis, tout revient sans aucun clic.
const relus = {};
ES.ecrireLaValeur(db, 'affichage_matchs', 'tout');
const PRINCIPAL = ES.lireEtat({ database: db }).principal;
const relire = async (nom) => {
  const pageRelue = await appel('GET', '/api/analysis/match/essai-a?source=odds-api&bankroll=10000');
  const etatRelu = await appel('GET', '/api/simulation/etat');
  relus[nom] = { page: pageRelue.corps?.simulation ?? null, prix: (await prix([UN, PLUS25])).corps, effectif: etatRelu.corps?.effectif ?? null, affichage: etatRelu.corps?.affichage ?? null, range: ES.lireLesValeurs(db).affichage_matchs };
};
await relire('tenues');
ES.ecrireLaValeur(db, 'principal', { ...PRINCIPAL, lancement: '2026-08-01', version: 'simulation-v0' });
await relire('autreLancement');
ES.effacerLaValeur(db, 'principal');
await relire('sansPrincipal');
ES.ecrireLaValeur(db, 'principal', { ...PRINCIPAL, verdict: 'pas-prouve' });
await relire('pasProuve');
ES.ecrireLaValeur(db, 'principal', PRINCIPAL);
await relire('remis');
// Le modèle de buts plus en service (réglages sans la clé) : la fonction elle-même, sur la base de la copie.
relus.sansCle = ES.affichageEffectif({ database: db, reglagesEnService: (({ modeleDeButs, ...reste }) => reste)(getEngineConfig('football')), lancement: { le: '2026-09-01', version: 'simulation-v1' } });
relus.avecCle = ES.affichageEffectif({ database: db, reglagesEnService: getEngineConfig('football'), lancement: () => ({ le: '2026-09-01', version: 'simulation-v1' }) });
relus.rangeALaFin = ES.lireLesValeurs(db).affichage_matchs;
ES.ecrireLaValeur(db, 'affichage_matchs', 'eteint');
sortie.relus = relus;

// ------------------------------------------------------------ l'espion : aucune simulation dans ce processus
sortie.espion = { avant: SM.APPELS_POUR_L_ESPION.simulerMatch };
SM.simulerMatch({ lambda: 1, mu: 1, grille: null, params: (await imp('data/simulation/reglages.js')).PARAMS, n: 10, seed: 1 });
sortie.espion.apres = SM.APPELS_POUR_L_ESPION.simulerMatch;

// ------------------------------------------------------------ B7 : « J'ai parié » avec le prix juste d'un combiné
const jambe = (market, pick, odds) => ({ matchId: 'essai-a', homeName: 'Man City', awayName: 'Liverpool', league: 'EPL', commenceTime: '2026-10-05T18:30:00Z', market, pick, odds, bookmaker: 'williamhill' });
const b = {};
b.combine = await appel('POST', '/api/bets', { stake: 10, legs: [jambe('Résultat', 'Man City', 2.0), jambe('Total buts', 'Plus de 2,5 buts', 1.9)], cotePrise: 3.2, prixJuste: { probabilite: 0.27, source: 'Prix juste : grille du moteur de 3 h 00, alignée sur le 1N2 affiché', lueA: M } });
b.miTemps = await appel('POST', '/api/bets', { stake: 10, legs: [jambe('Résultat', 'Man City', 2.0), jambe('Mi-temps', 'Mi-temps : Man City', 2.6)], cotePrise: 4.1, prixJuste: { probabilite: 0.2, source: 'x', lueA: M } });
b.simple = await appel('POST', '/api/bets', { stake: 10, legs: [jambe('Résultat', 'Man City', 2.0)], prixJuste: { probabilite: 0.5, source: 'x', lueA: M } });
b.horsBornes = await appel('POST', '/api/bets', { stake: 10, legs: [jambe('Résultat', 'Man City', 2.0), jambe('Total buts', 'Plus de 2,5 buts', 1.9)], cotePrise: 3.2, prixJuste: { probabilite: 1.2, source: 'x', lueA: M } });
b.sourceLongue = await appel('POST', '/api/bets', { stake: 10, legs: [jambe('Résultat', 'Man City', 2.0), jambe('Total buts', 'Plus de 2,5 buts', 1.9)], cotePrise: 3.2, prixJuste: { probabilite: 0.27, source: 'x'.repeat(301), lueA: M } });
b.sansPrix = await appel('POST', '/api/bets', { stake: 5, legs: [jambe('Résultat', 'Man City', 2.0), jambe('Total buts', 'Plus de 2,5 buts', 1.9)], cotePrise: 3.3 });
// Vérification du 27/10, constat 17 : une jambe d'un marché de DÉROULÉ refusée par le serveur, prix juste joint ou non.
const miTempsDeroule = { ...jambe('Déroulé simulé', 'Mi-temps : Man City mène', 2.6), marketId: 'halfTimeResult', params: { outcome: 'home' } };
b.derouleSansPrix = await appel('POST', '/api/bets', { stake: 5, legs: [jambe('Résultat', 'Man City', 2.0), miTempsDeroule], cotePrise: 4.1 });
b.derouleSimple = await appel('POST', '/api/bets', { stake: 5, legs: [miTempsDeroule] });
const id = b.combine.corps?.id;
await appel('PATCH', `/api/bets/${id}/legs/0/status`, { status: 'won' });
b.regle = await appel('PATCH', `/api/bets/${id}/legs/1/status`, { status: 'won' });
b.suivi = await appel('GET', '/api/bets/suivi');
b.carnet = JSON.parse(fs.readFileSync(path.join(RUNTIME, 'bets.json'), 'utf8'));
sortie.paris = { combine: b.combine, miTemps: b.miTemps, simple: b.simple, horsBornes: b.horsBornes, sourceLongue: b.sourceLongue, sansPrix: b.sansPrix, derouleSansPrix: b.derouleSansPrix, derouleSimple: b.derouleSimple, regle: b.regle.corps?.status ?? null, attendu: b.suivi.corps?.attendu ?? null, carnet: b.carnet };
// Le coupe-circuit : les champs nouveaux d'un combiné ne changent rien.
const { getTiltState } = await imp('core/engine/tiltState.js');
const ancien = b.carnet.map(({ probabiliteCombine, probabiliteCombineSource, probabiliteCombineLueA, ...x }) => x);
fs.writeFileSync(path.join(RUNTIME, 'bets.json'), JSON.stringify(ancien));
const tilt1 = JSON.stringify(getTiltState());
fs.writeFileSync(path.join(RUNTIME, 'bets.json'), JSON.stringify(b.carnet, null, 1));
const tilt2 = JSON.stringify(getTiltState());
sortie.tilt = { identique: tilt1 === tilt2 };

// ------------------------------------------------------------ pour les écrans (B10) : la fin de saison dans les trois lois
// Le même championnat planté, lu par le vrai lecteur : forces du modèle EN SERVICE (la clé dans les réglages de la copie),
// forces du modèle EN ESSAI (réglages sans la clé), classement seul (forces plus vieilles que 3 jours) ; une coupe ;
// l'état final (fins de saison allumées, combinés éteints) avec la porte 1 et la liste des championnats.
const SR = await imp('data/simulation/simulationRead.js');
const avecCle = getEngineConfig('football');
const sansCle = (({ modeleDeButs, ...reste }) => reste)(avecCle);
sortie.ecrans = {
  saisonService: SR.saisonDe(LIGUE_ESSAI, { database: db, maintenant: Date.parse(M), reglagesEnService: avecCle }),
  saisonEssai: SR.saisonDe(LIGUE_ESSAI, { database: db, maintenant: Date.parse(M), reglagesEnService: sansCle }),
  saisonTable: SR.saisonDe(LIGUE_ESSAI, { database: db, maintenant: Date.parse(M) + 5 * 86_400_000, reglagesEnService: avecCle }),
  saisonCoupe: SR.saisonDe('EFL Cup', { database: db, maintenant: Date.parse(M), reglagesEnService: avecCle }),
  etat: (await appel('GET', '/api/simulation/etat')).corps,
  ligue: LIGUE_ESSAI
};
console.log(JSON.stringify(sortie));
