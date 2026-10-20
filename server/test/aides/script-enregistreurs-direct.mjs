/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-enregistreurs-direct.mjs <serveur de la copie>
 *
 * Étape E — la BOUCLE DU DIRECT (jobs/liveWatch.js), tour par tour, à des
 * instants choisis : plafond de détails par minute, rotation, un instantané
 * au plus toutes les cinq minutes, mi-temps, instantané de la liste seule
 * après trois minutes d'attente, dernier instantané à la fin, arrêt après
 * cinq erreurs FotMob et alerte durable posée puis levée, priorités lues
 * dans les favoris. FotMob SIMULÉ (lecteurs injectés) : aucun réseau.
 * Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { rencontre, listeDuJour, detailEnDirect } from './fotmobSimule.mjs';

const [serveur] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);

const { resolveDbPath, openDb } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error('Base inattendue');
const database = openDb();
const fot = await imp('data/providers/fotMobProvider.js');
const { tourDuDirect, __reglerDirect, getLiveWatchStatus, getLiveState, prioritesParDefaut, RANGS } = await imp('jobs/liveWatch.js');
const { vider } = await imp('data/enregistreurs/file.js');
const { noterPlanificateur, actualiserAlerte } = await imp('data/enregistreurs/etat.js');
const { REFRESH_STATUS_FILE } = await imp('data/repositories/refreshStatusRepository.js');

const T0 = Date.parse(process.env.CM_TEST_MAINTENANT);
const MIN = 60_000;
const LIGUES = ['LIGA', 'LIGA', 'LIGA', 'EPL', 'EPL', 'EPL', 'SERIEA', 'SERIEA', 'SERIEA'];
/** n matchs en cours, identifiants 4900001…, coups d'envoi échelonnés. */
const enCours = (n, { premier = 4900001, ligues = LIGUES, autre = 'BUNDES', liveTime = { short: '30’' } } = {}) =>
  Array.from({ length: n }, (_, i) =>
    rencontre({
      id: premier + i,
      ligue: ligues[i] ?? autre,
      home: [`Domicile ${i + 1}`, 1000 + 2 * i],
      away: [`Exterieur ${i + 1}`, 1001 + 2 * i],
      coup: new Date(T0 - (40 - i) * MIN).toISOString(),
      started: true,
      score: '0 - 0',
      liveTime
    })
  );
const s = {};

// ------------------------------------------------ A. plafond et rotation
{
  __reglerDirect({ maxDetailsParMinute: 6 });
  // Les rangs à rebours des coups d'envoi : favoris = les trois derniers à
  // commencer, pronostics les trois d'avant, moteur les trois d'avant encore.
  // Une rotation qui oublierait les rangs servirait les premiers commencés.
  const ligues = [...Array(11).fill('BUNDES'), 'SERIEA', 'SERIEA', 'SERIEA', 'EPL', 'EPL', 'EPL', 'LIGA', 'LIGA', 'LIGA'];
  const payload = listeDuJour(enCours(20, { ligues }));
  let appelsListe = 0;
  const lus = [];
  // La liste simulée passe par le vrai lecteur de FotMob (formes et champs du direct).
  const lireListe = async () => {
    appelsListe++;
    fot.__testing.listes.vider();
    globalThis.fetch = async () => ({ status: 200, ok: true, json: async () => JSON.parse(JSON.stringify(payload)) });
    return fot.fetchMatchesByDate('2026-10-05');
  };
  const lireDetail = async (id) => {
    lus.push({ id, t: courant });
    return { matchId: String(id), homeGoals: 0, awayGoals: 0, liveMinute: 30, liveAddedTime: null, liveLabel: '30’', halfTime: false, homeRedCards: 0, awayRedCards: 0, xgHome: 0.4, xgAway: 0.1, stats: { home: { expected_goals: 0.4 }, away: { expected_goals: 0.1 } }, coverage: 'xG' };
  };
  const rangs = {
    liguesFavorites: new Set(['La Liga - Spain']),
    equipesFavorites: new Set(),
    paires: new Set(['fotmob-1028|fotmob-1029', 'fotmob-1030|fotmob-1031', 'fotmob-1032|fotmob-1033']),
    moteur: new Set(['fotmob-1022|fotmob-1023', 'fotmob-1024|fotmob-1025', 'fotmob-1026|fotmob-1027'])
  };
  let courant = T0;
  const tours = [];
  for (const decalage of [0, 1, 2, 3, 4, 5]) {
    courant = T0 + decalage * MIN;
    const b = await tourDuDirect({ maintenant: courant, lireListe, lireDetail, rangs, pauseMs: 0 });
    tours.push({ decalage, details: b.details, horsPlafond: b.horsPlafond, instantanes: b.instantanes, enDirect: b.enDirect, lus: lus.filter((l) => l.t === courant).map((l) => Number(l.id) - 4900000) });
  }
  s.rotation = { tours, appelsListe, rangs: getLiveState().map((x) => [Number(x.fotmobId) - 4900000, x.rang]).sort((a, b) => a[0] - b[0]) };
  await vider({ maintenant: courant });
  s.rotation.lignes = database
    .prepare("SELECT fotmob_id AS id, taken_at AS t, source, minute, xg_home AS xg, league, stats FROM live_snapshots WHERE fotmob_id LIKE '49000%' ORDER BY fotmob_id, taken_at")
    .all()
    .map((l) => ({ ...l, id: Number(l.id) - 4900000, t: (Date.parse(l.t) - T0) / MIN }));
}

// ------------------------------------- B. mi-temps, attente, fin du match
{
  __reglerDirect({ maxDetailsParMinute: 1 });
  const matchs = [
    ...enCours(1, { premier: 4910001, ligues: ['EPL'], liveTime: { short: 'HT' } }),
    ...enCours(5, { premier: 4910002, ligues: ['EPL', 'EPL', 'EPL', 'EPL', 'EPL'] })
  ];
  const rangs = { liguesFavorites: new Set(), equipesFavorites: new Set(), paires: new Set(), moteur: new Set() };
  let courant = T0;
  let payload = listeDuJour(matchs);
  const lireListe = async () => {
    fot.__testing.listes.vider();
    globalThis.fetch = async () => ({ status: 200, ok: true, json: async () => JSON.parse(JSON.stringify(payload)) });
    return fot.fetchMatchesByDate('2026-10-05');
  };
  const lus = [];
  const lireDetail = async (id) => {
    lus.push({ id: Number(id) - 4910000, t: (courant - T0) / MIN });
    return { matchId: String(id), homeGoals: 1, awayGoals: 0, liveMinute: 31, liveLabel: '31’', halfTime: false, homeRedCards: 0, awayRedCards: 0, xgHome: 0.9, xgAway: 0.2, stats: { home: { expected_goals: 0.9 }, away: { expected_goals: 0.2 } }, coverage: 'xG' };
  };
  const tours = [];
  for (const decalage of [0, 1, 2, 3]) {
    courant = T0 + decalage * MIN;
    tours.push(await tourDuDirect({ maintenant: courant, lireListe, lireDetail, rangs, pauseMs: 0 }));
  }
  // Le match 4910002 se termine : 2-1, dernier instantané.
  payload = listeDuJour(matchs.map((r) => (r.match.id === 4910002 ? { ...r, match: { ...r.match, status: { ...r.match.status, finished: true, scoreStr: '2 - 1', liveTime: undefined } } } : r)));
  courant = T0 + 4 * MIN;
  tours.push(await tourDuDirect({ maintenant: courant, lireListe, lireDetail, rangs, pauseMs: 0 }));
  await vider({ maintenant: courant });
  s.attente = {
    lus,
    tours: tours.map((b) => ({ details: b.details, instantanes: b.instantanes, fins: b.fins, enDirect: b.enDirect })),
    lignes: database
      .prepare("SELECT fotmob_id AS id, taken_at AS t, kind, status, source, detail_at AS detailAt, home_goals AS hg, away_goals AS ag, minute_label AS libelle FROM live_snapshots WHERE fotmob_id LIKE '4910%' ORDER BY fotmob_id, taken_at")
      .all()
      .map((l) => ({ ...l, id: Number(l.id) - 4910000, t: (Date.parse(l.t) - T0) / MIN }))
  };
}

// ------------------------- C. erreurs FotMob : arrêt, alerte posée puis levée
{
  __reglerDirect({ maxDetailsParMinute: 6, erreursMax: 5, suspensionMinutes: 30 });
  noterPlanificateur({ demarre: true, demarreA: new Date(T0).toISOString(), raison: null });
  const matchs = enCours(6, { premier: 4920001, ligues: ['EPL', 'EPL', 'EPL', 'EPL', 'EPL', 'EPL'] });
  const payload = listeDuJour(matchs);
  let appelsListe = 0;
  let appelsDetail = 0;
  let panne = true;
  const lireListe = async () => {
    appelsListe++;
    fot.__testing.listes.vider();
    globalThis.fetch = async () => ({ status: 200, ok: true, json: async () => JSON.parse(JSON.stringify(payload)) });
    return fot.fetchMatchesByDate('2026-10-05');
  };
  const lireDetail = async (id) => {
    appelsDetail++;
    if (panne) throw new Error('HTTP 503');
    return { matchId: String(id), homeGoals: 0, awayGoals: 0, liveMinute: 60, liveLabel: '60’', halfTime: false, homeRedCards: null, awayRedCards: null, xgHome: null, xgAway: null, stats: null, coverage: 'lower' };
  };
  const rangs = { liguesFavorites: new Set(), equipesFavorites: new Set(), paires: new Set(), moteur: new Set() };
  const alerte = () => {
    try {
      return JSON.parse(fs.readFileSync(REFRESH_STATUS_FILE, 'utf8')).alerts?.enregistreurs ?? null;
    } catch {
      return 'absente';
    }
  };
  const t1 = await tourDuDirect({ maintenant: T0, lireListe, lireDetail, rangs, pauseMs: 0 });
  const apresPanne = { appelsListe, appelsDetail, statut: getLiveWatchStatus(T0 + MIN) };
  const t2 = await tourDuDirect({ maintenant: T0 + MIN, lireListe, lireDetail, rangs, pauseMs: 0 });
  const pendantArret = { appelsListe, appelsDetail };
  actualiserAlerte({ maintenant: T0 + MIN });
  const alertePosee = alerte();
  panne = false;
  const t3 = await tourDuDirect({ maintenant: T0 + 31 * MIN, lireListe, lireDetail, rangs, pauseMs: 0 });
  const statutRepris = getLiveWatchStatus(T0 + 31 * MIN);
  actualiserAlerte({ maintenant: T0 + 31 * MIN });
  s.erreurs = {
    t1: { erreurs: t1.erreurs, details: t1.details, suspendu: t1.suspendu ?? null, instantanes: t1.instantanes },
    apresPanne: { appelsListe: apresPanne.appelsListe, appelsDetail: apresPanne.appelsDetail, suspendu: apresPanne.statut.suspendu, erreur: apresPanne.statut.erreur },
    t2: { suspendu: t2.suspendu ?? null, listeLue: t2.listeLue },
    pendantArret,
    alertePosee,
    t3: { details: t3.details, listeLue: t3.listeLue, suspendu: t3.suspendu ?? null },
    repris: { suspendu: statutRepris.suspendu, erreur: statutRepris.erreur, appelsListe, appelsDetail },
    alerteLevee: alerte()
  };
}

// ------------------------------------------- D. priorités lues dans les favoris
{
  const p = await prioritesParDefaut({ maintenant: T0, database });
  s.favoris = { equipes: [...p.equipesFavorites], ligues: [...p.liguesFavorites], rangs: RANGS };
}

console.log(JSON.stringify({ ok: true, ...s }));
