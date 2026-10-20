/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-enregistreurs-verrou.mjs <serveur de la copie>
 *
 * Étape E — AUCUNE ÉCRITURE PENDANT UN IMPORT (règle WAL). Un autre
 * processus tient le verrou d'actualisation (le fichier de verrou de la
 * copie, au nom du processus parent, vivant) : les quatre enregistreurs
 * relèvent, mais rien n'est écrit — tout attend en file. Puis une passe
 * d'actualisation dans ce processus : seule l'étape du gel écrit, et ses
 * seules lignes. Verrou libre : tout part, par tranches ; un import qui
 * démarre entre deux tranches arrête l'écriture. Enfin l'état de la carte
 * « Enregistreurs » (route en lecture seule). FotMob SIMULÉ : aucun réseau.
 * Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { rencontre, listeDuJour } from './fotmobSimule.mjs';

const [serveur] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);

const { resolveDbPath, openDb } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error('Base inattendue');
const database = openDb();
const fot = await imp('data/providers/fotMobProvider.js');
const { isRefreshRunning, withRefreshLock } = await imp('data/providers/refreshLock.js');
const { tourDuDirect, __reglerDirect } = await imp('jobs/liveWatch.js');
const { passeAbsents } = await imp('data/enregistreurs/absents.js');
const { archiverReleveSiNouveau } = await imp('data/enregistreurs/cotesPayantes.js');
const gel = await imp('data/enregistreurs/gelPronostics.js');
const { vider, mettreEnFile, etatDeLaFile } = await imp('data/enregistreurs/file.js');
const { tourEnregistreurs, __reglerPlanificateur } = await imp('jobs/enregistreurs.js');
const { noterPlanificateur, etatEnregistreurs } = await imp('data/enregistreurs/etat.js');
const { getRecordersOverview } = await imp('api/controllers/recorders.controller.js');
const { getFixturePaths } = await imp('data/repositories/fixturesRepository.js');
const { adaptSeasonCalendarMatch } = await imp('data/adapters/seasonCalendarAdapter.js');
const { enrichMatchWithRealAverages } = await imp('data/providers/matchEnrichment.js');
const { analyzeMatch } = await imp('core/engine/oddsEngine.js');
const { getEngineConfig } = await imp('core/engine/engineConfig.js');
const { getTiltState } = await imp('core/engine/tiltState.js');
const { getSport } = await imp('sports/index.js');

const T0 = Date.parse(process.env.CM_TEST_MAINTENANT);
const MIN = 60_000;
const VERROU = path.join(serveur, 'data', 'runtime', 'espn-refresh.lock');

const compter = () => ({
  direct: database.prepare('SELECT COUNT(*) n FROM live_snapshots').get().n,
  lectures: database.prepare('SELECT COUNT(*) n FROM unavailable_reads').get().n,
  absents: database.prepare('SELECT COUNT(*) n FROM unavailable_daily').get().n,
  gel: database.prepare('SELECT COUNT(*) n FROM engine_picks').get().n,
  payantes: database.prepare("SELECT COUNT(*) n FROM odds_quotes q JOIN odds_events e ON e.id = q.event_id WHERE e.source = 'odds-api'").get().n,
  comptes: database.prepare('SELECT COUNT(*) n FROM recorder_counts').get().n
});
const enAttente = () => Object.fromEntries(Object.entries(etatDeLaFile().parEnregistreur).map(([k, v]) => [k, v.enAttente]));

// Le faux FotMob de ce script : deux matchs en cours, deux à venir.
const L = [
  rencontre({ id: 6001, ligue: 'EPL', home: ['Arsenal', 9825], away: ['Chelsea', 8455], coup: new Date(T0 - 40 * MIN).toISOString(), started: true, score: '1 - 0', liveTime: { short: '41’' } }),
  rencontre({ id: 6002, ligue: 'LIGA', home: ['Sevilla', 7854], away: ['Betis', 8603], coup: new Date(T0 - 30 * MIN).toISOString(), started: true, score: '0 - 0', liveTime: { short: '31’' } }),
  rencontre({ id: 6003, ligue: 'SERIEA', home: ['Inter', 8636], away: ['Udinese', 8600], coup: '2026-10-05T18:45:00.000Z' }),
  rencontre({ id: 6004, ligue: 'L1', home: ['Lens', 8588], away: ['Lille', 8639], coup: '2026-10-06T19:00:00.000Z' })
];
const LISTES = { '2026-10-05': listeDuJour(L.slice(0, 3)), '2026-10-06': listeDuJour(L.slice(3)), '2026-10-07': listeDuJour([]) };
const lireListe = async (jour) => {
  fot.__testing.listes.vider();
  globalThis.fetch = async () => ({ status: 200, ok: true, json: async () => JSON.parse(JSON.stringify(LISTES[jour] ?? { leagues: [] })) });
  return fot.fetchMatchesByDate(jour);
};
const lireDetail = async (id) => ({ matchId: String(id), homeGoals: 1, awayGoals: 0, liveMinute: 42, liveLabel: '42’', halfTime: false, homeRedCards: 0, awayRedCards: 0, xgHome: 0.8, xgAway: 0.3, stats: { home: { expected_goals: 0.8 }, away: { expected_goals: 0.3 } }, coverage: 'xG' });
const lirePage = async () => ({ available: false, home: { teamId: 'fotmob-1', unavailable: [{ id: 'fotmob-42', name: 'Un Blessé', type: 'injury' }] }, away: { teamId: 'fotmob-2', unavailable: [] } });
const rangs = { liguesFavorites: new Set(), equipesFavorites: new Set(), paires: new Set(), moteur: new Set() };

// Un match pour le gel, et un résultat du moteur pour une analyse.
const M = adaptSeasonCalendarMatch({ league: 'EPL', homeName: 'Aston Villa', awayName: "Nott'm Forest", date: '2026-10-06' }, 10000);
const enrichi = await enrichMatchWithRealAverages(M, { sansRepliPayant: true });
const resultat = await analyzeMatch(enrichi, getEngineConfig('football'), getTiltState(), getSport('football'));

// L'instantané payant.
const fichier = getFixturePaths().odds;
fs.mkdirSync(path.dirname(fichier), { recursive: true });
fs.writeFileSync(
  fichier,
  JSON.stringify([{ data: [{ id: 'oa-1', sport_key: 'soccer_epl', sport_title: 'EPL', commence_time: '2026-10-06T18:45:00Z', home_team: 'Aston Villa', away_team: "Nott'm Forest", bookmakers: [{ key: 'winamax_fr', markets: [{ key: 'h2h', outcomes: [{ name: 'Aston Villa', price: 2.1 }, { name: "Nott'm Forest", price: 3.6 }, { name: 'Draw', price: 3.3 }] }] }] }] }])
);
fs.utimesSync(fichier, new Date('2026-10-05T11:30:00Z'), new Date('2026-10-05T11:30:00Z'));

const s = { depart: compter() };
noterPlanificateur({ demarre: true, demarreA: new Date(T0).toISOString(), raison: null });

// ------------------------- 1. Un import tient le verrou (autre processus, vivant).
fs.writeFileSync(VERROU, JSON.stringify({ pid: process.ppid, token: 'import-en-ligne-de-commande', startedAt: new Date(T0).toISOString(), heartbeatAt: new Date(T0).toISOString() }));
s.verrouTenu = isRefreshRunning();
__reglerDirect();
s.direct = await tourDuDirect({ maintenant: T0, lireListe, lireDetail, rangs, pauseMs: 0 });
s.absents = await passeAbsents({ maintenant: T0, lireListe, lireDetail: lirePage, database, pauseMs: 0 });
s.payantes = archiverReleveSiNouveau({ maintenant: T0, database });
s.analyseEnFile = gel.gelerAnalyse({ match: M, engineResult: resultat, origine: gel.ORIGINES.avance, database, maintenant: T0 });
s.gelHorsPasse = await gel.gelerLaNuit({ maintenant: T0, matchs: [M], dansLaPasse: false, database });
s.vidage = await vider({ maintenant: T0, database });
__reglerPlanificateur();
s.tour = await tourEnregistreurs({ maintenant: T0 + MIN, absents: false });
s.pendantImport = compter();
s.fileAttente = enAttente();

// ---------------- 2. Une passe d'actualisation dans ce processus : seul le gel écrit.
fs.rmSync(VERROU, { force: true });
s.dansLaPasse = await withRefreshLock(async () => {
  const autres = await vider({ maintenant: T0 + 2 * MIN, database });
  const avantGel = compter();
  const g = await gel.gelerLaNuit({ maintenant: T0 + 2 * MIN, matchs: [M], dansLaPasse: true, database });
  return { autres, avantGel, gel: { ecrits: g.ecrits, reporte: g.reporte }, apresGel: compter(), verrou: isRefreshRunning() };
}, { stamp: false });

// --------------------------- 3. Verrou libre : tout part, par tranches.
s.verrouApresPasse = isRefreshRunning();
s.vidageLibre = await vider({ maintenant: T0 + 3 * MIN, database });
s.apres = compter();
s.fileVide = enAttente();

// -------- 4. Un import qui démarre ENTRE deux tranches arrête l'écriture.
const lignes = Array.from({ length: 1000 }, (_, i) => ({
  fotmobId: '7001', takenAt: new Date(T0 + (10 + i) * MIN).toISOString(), kind: 'direct', date: '2026-10-05', status: 'en cours', homeGoals: 0, awayGoals: 0, source: 'liste'
}));
mettreEnFile('direct', lignes);
const enCours = vider({ maintenant: T0 + 4 * MIN, database });
await new Promise((fin) => setTimeout(fin, 5));
fs.writeFileSync(VERROU, JSON.stringify({ pid: process.ppid, token: 'import-2', startedAt: new Date(T0).toISOString(), heartbeatAt: new Date(T0).toISOString() }));
s.coupe = await enCours;
s.ecritesAvantCoupure = database.prepare("SELECT COUNT(*) n FROM live_snapshots WHERE fotmob_id = '7001'").get().n;
fs.rmSync(VERROU, { force: true });
s.reprise = await vider({ maintenant: T0 + 5 * MIN, database });
s.ecritesFin = database.prepare("SELECT COUNT(*) n FROM live_snapshots WHERE fotmob_id = '7001'").get().n;

// ---------------------- 5. L'état de la carte, en lecture seule.
const avantEtat = compter();
const etat = etatEnregistreurs({ database, maintenant: T0 + 6 * MIN });
const res = { code: 200, corps: null, status(c) { this.code = c; return this; }, json(x) { this.corps = x; return this; } };
getRecordersOverview({ query: {} }, res);
s.etat = {
  coupure: etat.coupure,
  base: etat.base,
  lignes: etat.enregistreurs.map((e) => ({ cle: e.cle, aujourdhui: e.aujourdhui, hier: e.hier, depuis: e.depuis, dernier: e.dernierReleve, etat: e.etat, tables: e.tables, fournisseur: e.fournisseur, enAttente: e.enAttente })),
  deja: etat.dejaGardes.map((e) => ({ cle: e.cle, etat: e.etat, aujourdhui: e.aujourdhui })),
  totaux: etat.totaux,
  problemes: etat.problemes,
  listeDuJour: etat.listeDuJour,
  route: { code: res.code, cles: res.corps?.enregistreurs?.map((e) => e.cle) ?? null, generatedAt: Boolean(res.corps?.generatedAt) },
  rienEcrit: JSON.stringify(compter()) === JSON.stringify(avantEtat)
};

console.log(JSON.stringify({ ok: true, ...s }));
