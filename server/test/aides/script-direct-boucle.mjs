/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-direct-boucle.mjs <serveur de la copie> [--toucher]
 *
 * Étape 46 (lot 1, partie 0, 11/11/2026) — la BOUCLE DU DIRECT de E (jobs/liveWatch.js) rejouée tour par tour sur un FotMob
 * SIMULÉ, pour garder ce que E ÉCRIT (R25 de la critique ; T-M2, T-M5) : les lignes passées à la file, les lignes de
 * live_snapshots APRÈS le vidage (ce que la base reçoit vraiment), le bilan de chaque tour et le nombre de requêtes au faux
 * FotMob. La fixture « avant » (fixtures/direct-boucle-avant-46.json) est la sortie de ce script sur le liveWatch.js d'avant
 * la 46 ; T-M2 la compare à la sortie sur le liveWatch.js retouché.
 *
 * Scénarios :
 *   A, B, C  ceux de script-enregistreurs-direct.mjs (plafond et rotation ; mi-temps, attente, fin ; erreurs FotMob), mêmes
 *            entrées ;
 *   M        trois matchs minute par minute (119 tours), avec le VRAI lecteur partagé de la liste, JAMAIS vidé entre deux
 *            tours : la lecture prend 2 s, le tour suivant part 60 s après le début du précédent, donc une liste fraîche un
 *            tour sur deux et la copie du partage l'autre (R4). Libellés avec le caractère invisible U+200E (LRM) devant, une
 *            espace insécable, l'apostrophe typographique ; rouges jamais publiés par la liste (null), publiés par le détail
 *            de M1, jamais par celui de M2 (couverture réduite) ; M1 : but vu au détail un tour avant la liste (détail 1-0,
 *            copie 0-0, puis 1-0), rouge lu au détail, arrêts de jeu de la première mi-temps, pause, but puis but annulé,
 *            minute figée six minutes, arrêts de jeu, « FT » avant « terminé » ; M2 : pris en route à la pause, arrêts de
 *            jeu, coupure « Break », prolongation (durée max 105 puis 120), pause de la prolongation « HT », but en
 *            prolongation, « AET », fin ; M3 : coup d'envoi en retard, match arrêté (annulé chez FotMob).
 *
 * `--toucher` (à partir de la partie B) : entre deux tours, appelle ce que la 46 ajoute (getEtatMinute de liveWatch.js, et
 * les crochets des routes ci-dessous) et MODIFIE en profondeur ce qu'ils rendent. Sans la 46 (la fixture « avant »), il n'y
 * a rien à toucher. Les ENTRÉES (ce que le faux FotMob sert à chaque tour) ont une empreinte, `entreesSha1` : elle doit
 * rester celle de la fixture, quel que soit le reste du script.
 *
 * Sortie : une ligne JSON { ok, entreesSha1, touches, scenarios: { A, B, C, M } }.
 *
 * `--detail-nul` (S1 de la vérification « sûreté », 13/11/2026 ; T-M6) : ne lance QUE le scénario N, copie du scénario A
 * (mêmes matchs, mêmes rangs, même plafond) où `lireDetail` rend null — une page FotMob sans `general` ni `teams`
 * (fotMobProvider.js, fetchLiveDetail) — pour le PREMIER match dont le détail est lu aux tours 2 et 3 (le pas de 5 minutes
 * fait qu'aucun match n'est lu deux tours de suite : un match au tour 2, un autre au tour 3). N ne fait AUCUN noterEntree :
 * l'empreinte de la fixture « avant la 46 » couvre A, B, C et M seulement. Sortie : { ok, entreesSha1, touches,
 * scenarios: { N } }, N = { tours, lignesEnFile, lignesEcrites, appels, detailsNuls } (detailsNuls : tour → match).
 */

import crypto from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { rencontre, listeDuJour, detailEnDirect, installerFauxFetch } from './fotmobSimule.mjs';

const [serveur, ...options] = process.argv.slice(2);
const TOUCHER = options.includes('--toucher');
const DETAIL_NUL = options.includes('--detail-nul');
const imp =(rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);

const { resolveDbPath, openDb } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error('Base inattendue');
const database = openDb();
const fot = await imp('data/providers/fotMobProvider.js');
const boucle = await imp('jobs/liveWatch.js');
const { tourDuDirect, __reglerDirect } = boucle;
const { mettreEnFile, vider } = await imp('data/enregistreurs/file.js');

const T0 = Date.parse(process.env.CM_TEST_MAINTENANT);
const MIN = 60_000;
const LRM = String.fromCharCode(0x200e);
const NBSP = String.fromCharCode(0x00a0);
const APO = String.fromCharCode(0x2019);
const copieJson = (v) => JSON.parse(JSON.stringify(v));

// ------------------------------------------------------------------------------------------------ les entrées, notées
const entrees = [];
const noterEntree = (scenario, quoi, valeur) => entrees.push([scenario, quoi, copieJson(valeur)]);

// ------------------------------------------------------------------------------------------------ toucher (partie B)
let touches = 0;
/** Abîme en profondeur ce qu'on a reçu : chaque nombre, chaque texte, chaque tableau. Une copie fidèle n'y perd rien. */
function abimer(v, profondeur = 0) {
  if (!v || typeof v !== 'object' || profondeur > 12 || Object.isFrozen(v)) return;
  if (Array.isArray(v)) {
    for (const x of v) abimer(x, profondeur + 1);
    v.push({ abime: true });
    return;
  }
  for (const [k, x] of Object.entries(v)) {
    if (x && typeof x === 'object') abimer(x, profondeur + 1);
    else if (typeof x === 'number') v[k] = x + 1000;
    else if (typeof x === 'string') v[k] = `${x}#abime`;
    else if (x === null) v[k] = 'abime';
  }
  v.champAbime = true;
}
/**
 * Les crochets des routes de la 46 (partie B) : chacun reçoit { maintenant, database } et rend ce que la route rendrait.
 * Partie B (12/11/2026) : le tableau (GET /api/direct) et le détail de chaque match suivi (GET /api/direct/match?id=…), lus
 * par le module de lecture de LA COPIE, sans note. La ligne d'avant-match est FABRIQUÉE (la base de la copie n'a pas de nuit
 * pour ces matchs simulés) : les calculs, la minute 0, la courbe et la référence tournent vraiment entre deux tours.
 * Chargés au premier appel seulement (avec --toucher) : sans --toucher, le script ne charge rien de plus qu'avant.
 */
let lecture46 = null;
let cleDeNuit46 = null;
async function laLecture46() {
  if (!lecture46) {
    ({ cleDeNuit: cleDeNuit46 } = await imp('data/simulation/simulationRead.js'));
    lecture46 = await imp('data/direct/lectureDuDirect.js');
  }
  return lecture46;
}
/** Une ligne « service » fabriquée (la forme de ligneDeService), la même pour tous les matchs simulés. */
function ligneDeLEssai({ homeId, awayId, kickoff }) {
  const coup = Date.parse(kickoff ?? '');
  const cle = cleDeNuit46({ homeId, awayId, commenceTime: kickoff });
  if (!cle || !Number.isFinite(coup)) return { trouve: false, raison: 'sans-identifiant', cle: null, nuit: null };
  const calcule = new Date(coup - 6 * 3_600_000).toISOString();
  return {
    trouve: true,
    raison: null,
    cle,
    nuit: calcule,
    calculeLe: calcule,
    grille: 'ancien-81',
    engineVersion: 5,
    candidateHash: null,
    lambda: 1.45,
    mu: 1.15,
    rho: -0.08,
    fair: { home: 0.45, draw: 0.28, away: 0.27 },
    oddsSource: 'cotes fabriquées (essai)',
    oddsAt: null,
    kickoff: new Date(coup).toISOString(),
    kickoffConnu: true,
    date: new Date(coup).toISOString().slice(0, 10),
    decalageJours: 0,
    ageAuCoupDEnvoiH: 6,
    coteAgeAuCoupDEnvoiH: null
  };
}
const CROCHETS_DES_ROUTES = [
  async ({ maintenant, database: base }) => (await laLecture46()).tableauDuDirect({ maintenant, database: base, note: null, ligneDe: ligneDeLEssai }),
  async ({ maintenant, database: base }) => {
    const L = await laLecture46();
    const rendus = [];
    for (const m of boucle.getEtatMinute(maintenant).matchs) rendus.push(await L.matchDuDirect({ maintenant, database: base, note: null, ligneDe: ligneDeLEssai, id: String(m.id) }));
    return rendus;
  },
  // Mineur du 13/11 soir (sûreté 5) : /api/direct/en-cours, la route lue chaque minute par toute l'appli, accrochée aussi.
  async ({ maintenant, database: base }) => (await laLecture46()).enCoursDuDirect({ maintenant, database: base })
];

// ------------------------------------------------------------------------------ --etats (partie B : T-M1, T-M3, T-M4)
const ETATS = options.includes('--etats');
/** Ce que getEtatMinute() porte après un tour du scénario M (pris AVANT toucher) : liste vue, mémoire, finis, compteurs. */
function resumeDeLEtat(w, em) {
  return {
    w,
    at: em.at,
    listeFotmobA: em.listeFotmobA,
    derniereListe: em.derniereListe,
    module46: em.module46,
    erreurs46: em.erreurs46,
    charge: em.charge,
    matchs: em.matchs.map((m) => ({
      id: m.id,
      liste: m.liste
        ? { label: m.liste.liveLabel ?? null, h: m.liste.homeGoals ?? null, a: m.liste.awayGoals ?? null, rh: m.liste.homeRedCards ?? null, ra: m.liste.awayRedCards ?? null, maxTime: m.liste.liveMaxTime ?? null }
        : null,
      memoire: m.memoire
    })),
    finis: em.finis.map((f) => ({ id: f.id, at: f.at, statut: f.fin?.status ?? null, memoire: f.memoire }))
  };
}
const etatsM = [];
async function toucher(maintenant) {
  if (!TOUCHER) return;
  if (typeof boucle.getEtatMinute === 'function') {
    abimer(boucle.getEtatMinute());
    touches++;
  }
  for (const crochet of CROCHETS_DES_ROUTES) {
    abimer(await crochet({ maintenant, database }));
    touches++;
  }
}

/** La file, avec le journal de ce qu'elle reçoit (une copie au moment même de l'appel). */
function fileNotee(journal) {
  return (lignes) => {
    journal.push(copieJson(lignes));
    return mettreEnFile('direct', lignes);
  };
}
const COLONNES = 'fotmob_id, taken_at, kind, date, kickoff, league, league_key, home_id, away_id, home_name, away_name, status, minute, added_time, minute_label, home_goals, away_goals, home_red, away_red, xg_home, xg_away, stats, coverage, detail_at, source';
const ecrites = (motif) => database.prepare(`SELECT ${COLONNES} FROM live_snapshots WHERE fotmob_id LIKE ? ORDER BY fotmob_id, taken_at`).all(motif).map((l) => ({ ...l }));

const LIGUES = ['LIGA', 'LIGA', 'LIGA', 'EPL', 'EPL', 'EPL', 'SERIEA', 'SERIEA', 'SERIEA'];
/** n matchs en cours, identifiants 4900001…, coups d'envoi échelonnés (repris de script-enregistreurs-direct.mjs). */
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

// --------------------------------- N. un détail null (S1 de la vérification « sûreté », 13/11/2026 ; --detail-nul SEUL)
// Copie du scénario A (mêmes matchs, mêmes rangs, même plafond), sans aucun noterEntree : au tour 2 puis au tour 3, le
// PREMIER détail lu rend null (page FotMob sans general ni teams). La boucle doit écrire la liste seule pour ce match.
if (DETAIL_NUL) {
  __reglerDirect({ maxDetailsParMinute: 6 });
  const ligues = [...Array(11).fill('BUNDES'), 'SERIEA', 'SERIEA', 'SERIEA', 'EPL', 'EPL', 'EPL', 'LIGA', 'LIGA', 'LIGA'];
  const payload = listeDuJour(enCours(20, { ligues }));
  let appelsListe = 0;
  let appelsDetail = 0;
  let tourCourant = -1;
  const detailsNuls = {};
  const lireListe = async () => {
    appelsListe++;
    fot.__testing.listes.vider();
    globalThis.fetch = async () => ({ status: 200, ok: true, json: async () => JSON.parse(JSON.stringify(payload)) });
    return fot.fetchMatchesByDate('2026-10-05');
  };
  const lireDetail = async (id) => {
    appelsDetail++;
    if ((tourCourant === 2 || tourCourant === 3) && !(tourCourant in detailsNuls)) {
      detailsNuls[tourCourant] = String(id);
      return null;
    }
    return { matchId: String(id), homeGoals: 0, awayGoals: 0, liveMinute: 30, liveAddedTime: null, liveLabel: '30’', halfTime: false, homeRedCards: 0, awayRedCards: 0, xgHome: 0.4, xgAway: 0.1, stats: { home: { expected_goals: 0.4 }, away: { expected_goals: 0.1 } }, coverage: 'xG' };
  };
  const rangs = {
    liguesFavorites: new Set(['La Liga - Spain']),
    equipesFavorites: new Set(),
    paires: new Set(['fotmob-1028|fotmob-1029', 'fotmob-1030|fotmob-1031', 'fotmob-1032|fotmob-1033']),
    moteur: new Set(['fotmob-1022|fotmob-1023', 'fotmob-1024|fotmob-1025', 'fotmob-1026|fotmob-1027'])
  };
  const journal = [];
  const tours = [];
  let courant = T0;
  for (const decalage of [0, 1, 2, 3, 4, 5]) {
    tourCourant = decalage;
    courant = T0 + decalage * MIN;
    tours.push(await tourDuDirect({ maintenant: courant, lireListe, lireDetail, rangs, pauseMs: 0, enFile: fileNotee(journal) }));
    await toucher(courant);
  }
  await vider({ maintenant: courant });
  s.N = { tours, lignesEnFile: journal, lignesEcrites: ecrites('49000%'), appels: { listes: appelsListe, details: appelsDetail }, detailsNuls };
}

// ------------------------------------------------ A. plafond et rotation (entrées de script-enregistreurs-direct.mjs)
if (!DETAIL_NUL) {
  __reglerDirect({ maxDetailsParMinute: 6 });
  const ligues = [...Array(11).fill('BUNDES'), 'SERIEA', 'SERIEA', 'SERIEA', 'EPL', 'EPL', 'EPL', 'LIGA', 'LIGA', 'LIGA'];
  const payload = listeDuJour(enCours(20, { ligues }));
  noterEntree('A', 'liste', payload);
  let appelsListe = 0;
  let appelsDetail = 0;
  const lireListe = async () => {
    appelsListe++;
    fot.__testing.listes.vider();
    globalThis.fetch = async () => ({ status: 200, ok: true, json: async () => JSON.parse(JSON.stringify(payload)) });
    return fot.fetchMatchesByDate('2026-10-05');
  };
  const lireDetail = async (id) => {
    appelsDetail++;
    return { matchId: String(id), homeGoals: 0, awayGoals: 0, liveMinute: 30, liveAddedTime: null, liveLabel: '30’', halfTime: false, homeRedCards: 0, awayRedCards: 0, xgHome: 0.4, xgAway: 0.1, stats: { home: { expected_goals: 0.4 }, away: { expected_goals: 0.1 } }, coverage: 'xG' };
  };
  const rangs = {
    liguesFavorites: new Set(['La Liga - Spain']),
    equipesFavorites: new Set(),
    paires: new Set(['fotmob-1028|fotmob-1029', 'fotmob-1030|fotmob-1031', 'fotmob-1032|fotmob-1033']),
    moteur: new Set(['fotmob-1022|fotmob-1023', 'fotmob-1024|fotmob-1025', 'fotmob-1026|fotmob-1027'])
  };
  const journal = [];
  const tours = [];
  let courant = T0;
  for (const decalage of [0, 1, 2, 3, 4, 5]) {
    courant = T0 + decalage * MIN;
    tours.push(await tourDuDirect({ maintenant: courant, lireListe, lireDetail, rangs, pauseMs: 0, enFile: fileNotee(journal) }));
    await toucher(courant);
  }
  await vider({ maintenant: courant });
  s.A = { tours, lignesEnFile: journal, lignesEcrites: ecrites('49000%'), appels: { listes: appelsListe, details: appelsDetail } };
}

// ------------------------------------- B. mi-temps, attente, fin du match (entrées de script-enregistreurs-direct.mjs)
if (!DETAIL_NUL) {
  __reglerDirect({ maxDetailsParMinute: 1 });
  const matchs = [
    ...enCours(1, { premier: 4910001, ligues: ['EPL'], liveTime: { short: 'HT' } }),
    ...enCours(5, { premier: 4910002, ligues: ['EPL', 'EPL', 'EPL', 'EPL', 'EPL'] })
  ];
  const rangs = { liguesFavorites: new Set(), equipesFavorites: new Set(), paires: new Set(), moteur: new Set() };
  let payload = listeDuJour(matchs);
  noterEntree('B', 'liste', payload);
  let appelsListe = 0;
  let appelsDetail = 0;
  const lireListe = async () => {
    appelsListe++;
    fot.__testing.listes.vider();
    globalThis.fetch = async () => ({ status: 200, ok: true, json: async () => JSON.parse(JSON.stringify(payload)) });
    return fot.fetchMatchesByDate('2026-10-05');
  };
  const lireDetail = async (id) => {
    appelsDetail++;
    return { matchId: String(id), homeGoals: 1, awayGoals: 0, liveMinute: 31, liveLabel: '31’', halfTime: false, homeRedCards: 0, awayRedCards: 0, xgHome: 0.9, xgAway: 0.2, stats: { home: { expected_goals: 0.9 }, away: { expected_goals: 0.2 } }, coverage: 'xG' };
  };
  const journal = [];
  const tours = [];
  let courant = T0;
  for (const decalage of [0, 1, 2, 3]) {
    courant = T0 + decalage * MIN;
    tours.push(await tourDuDirect({ maintenant: courant, lireListe, lireDetail, rangs, pauseMs: 0, enFile: fileNotee(journal) }));
    await toucher(courant);
  }
  payload = listeDuJour(matchs.map((r) => (r.match.id === 4910002 ? { ...r, match: { ...r.match, status: { ...r.match.status, finished: true, scoreStr: '2 - 1', liveTime: undefined } } } : r)));
  noterEntree('B', 'liste-fin', payload);
  courant = T0 + 4 * MIN;
  tours.push(await tourDuDirect({ maintenant: courant, lireListe, lireDetail, rangs, pauseMs: 0, enFile: fileNotee(journal) }));
  await toucher(courant);
  await vider({ maintenant: courant });
  s.B = { tours, lignesEnFile: journal, lignesEcrites: ecrites('4910%'), appels: { listes: appelsListe, details: appelsDetail } };
}

// ------------------------- C. erreurs FotMob : arrêt après cinq, reprise (entrées de script-enregistreurs-direct.mjs)
if (!DETAIL_NUL) {
  __reglerDirect({ maxDetailsParMinute: 6, erreursMax: 5, suspensionMinutes: 30 });
  const matchs = enCours(6, { premier: 4920001, ligues: ['EPL', 'EPL', 'EPL', 'EPL', 'EPL', 'EPL'] });
  const payload = listeDuJour(matchs);
  noterEntree('C', 'liste', payload);
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
  const journal = [];
  const tours = [];
  for (const [t, enPanne] of [[T0, true], [T0 + MIN, true], [T0 + 31 * MIN, false]]) {
    panne = enPanne;
    tours.push(await tourDuDirect({ maintenant: t, lireListe, lireDetail, rangs, pauseMs: 0, enFile: fileNotee(journal) }));
    await toucher(t);
  }
  await vider({ maintenant: T0 + 31 * MIN });
  s.C = { tours, lignesEnFile: journal, lignesEcrites: ecrites('4920%'), appels: { listes: appelsListe, details: appelsDetail } };
}

// ------------------------------------------------------------------------- M. minute par minute, lecteur partagé (R4)
if (!DETAIL_NUL) {
  __reglerDirect({ maxDetailsParMinute: 6 });
  fot.__testing.listes.vider();
  const faux = installerFauxFetch({ listes: {}, details: {} });
  const fetchDuFaux = globalThis.fetch;
  // L'horloge du partage de la liste : figée comme le reste, avancée à la main (début de chaque tour, durée d'une lecture).
  let horlogePartage = T0;
  const allerA = (t) => {
    if (t < horlogePartage) throw new Error('horloge du partage à rebours');
    fot.__testing.listes.avancer(t - horlogePartage);
    horlogePartage = t;
  };
  const LECTURE_LISTE_MS = 2000;
  globalThis.fetch = async (url) => {
    if (/\/matches\?date=/.test(String(url))) {
      fot.__testing.listes.avancer(LECTURE_LISTE_MS);
      horlogePartage += LECTURE_LISTE_MS;
    }
    return fetchDuFaux(url);
  };

  const M1 = { id: 4930001, ligue: 'EPL', home: ['Domicile M1', 1100], away: ['Exterieur M1', 1101], coup: new Date(T0).toISOString() };
  const M2 = { id: 4930002, ligue: 'BUNDES', home: ['Domicile M2', 1102], away: ['Exterieur M2', 1103], coup: new Date(T0 - 60 * MIN).toISOString() };
  const M3 = { id: 4930003, ligue: 'SERIEA', home: ['Domicile M3', 1104], away: ['Exterieur M3', 1105], coup: new Date(T0 + 20 * MIN).toISOString() };
  const lt = (short, long, maxTime) => ({ short, ...(long ? { long } : {}), ...(maxTime ? { maxTime } : {}) });
  const mn = (m) => `${m}${APO}`;
  const chrono = (m) => `${m - 1}:30`;

  /** M1 au tour w (minute d'horloge depuis T0) : liste et détail. */
  function m1(w) {
    let liveTime = null;
    let fini = false;
    if (w <= 44) liveTime = lt((w >= 20 ? LRM : '') + mn(w + 1), chrono(w + 1), 45);
    else if (w === 45) liveTime = lt(`45+1${APO}`, '46:10', 45);
    else if (w === 46) liveTime = lt(`45${NBSP}+${NBSP}2${APO}`, '47:10', 45);
    else if (w === 47) liveTime = lt(`${LRM}45+3${APO}`, '48:10', 45);
    else if (w <= 62) liveTime = lt('HT', null, 45);
    else if (w <= 84) liveTime = lt(mn(w - 17), chrono(w - 17), 90);
    else if (w <= 89) liveTime = lt(mn(67), '66:59', 90); // minute figée six minutes (match interrompu)
    else if (w <= 112) liveTime = lt(mn(w - 22), chrono(w - 22), 90);
    else if (w <= 115) liveTime = lt(`${w === 115 ? LRM : ''}90+${w - 112}${APO}`, `${w - 22}:20`, 90);
    else if (w === 116) liveTime = lt('FT', null, 90);
    else fini = true;
    // Score de la liste (elle a un tour de retard sur le détail pour le premier but) ; celui du détail.
    const liste = w < 22 ? '0 - 0' : w < 77 ? '1 - 0' : w < 80 ? '2 - 0' : w < 107 ? '1 - 0' : '1 - 1';
    const detail = w < 20 ? '0 - 0' : w < 77 ? '1 - 0' : w < 80 ? '2 - 0' : w < 107 ? '1 - 0' : '1 - 1';
    const cartons = w >= 34 ? [{ minute: 35, side: 'away', card: 'Red', id: 9101, nom: 'Joueur M1' }] : [{ minute: 12, side: 'home', card: 'Yellow', id: 9100, nom: 'Joueur M1 bis' }];
    return {
      liste: rencontre({ ...M1, started: true, finished: fini, score: fini ? '1 - 1' : liste, liveTime: fini ? null : liveTime }),
      detail: fini ? null : detailEnDirect({ id: M1.id, home: M1.home, away: M1.away, score: detail, liveTime, xg: [0.4 + w / 100, 0.2 + w / 200], cartons, coverage: 'xG' })
    };
  }
  /** M2 (coup d'envoi une heure avant T0, pris en route à la pause) : arrêts de jeu, prolongation, but en prolongation. */
  function m2(w) {
    let liveTime = null;
    let fini = false;
    if (w <= 2) liveTime = lt('HT', null, 45);
    else if (w <= 47) liveTime = lt(mn(w + 43), chrono(w + 43), 90);
    else if (w <= 50) liveTime = lt(`90+${w === 50 ? 4 : w - 47}${APO}`, `${w + 43}:05`, 90);
    else if (w <= 55) liveTime = lt('Break', null, 90);
    else if (w <= 70) liveTime = lt(mn(w + 35), chrono(w + 35), 105);
    else if (w === 71) liveTime = lt(`105+1${APO}`, '105:40', 105);
    else if (w <= 73) liveTime = lt('HT', null, 105);
    else if (w <= 88) liveTime = lt(mn(w + 32), chrono(w + 32), 120);
    else if (w === 89) liveTime = lt(`120+2${APO}`, '121:30', 120);
    else if (w === 90) liveTime = lt('AET', null, 120);
    else fini = true;
    const score = w < 37 ? '0 - 1' : w < 80 ? '1 - 1' : '2 - 1';
    return {
      liste: rencontre({ ...M2, started: true, finished: fini, score, liveTime: fini ? null : liveTime }),
      detail: fini ? null : detailEnDirect({ id: M2.id, home: M2.home, away: M2.away, score, liveTime, sansStats: true, coverage: 'lower' })
    };
  }
  /** M3 (coup d'envoi prévu à T0 + 20 min, donné à T0 + 23 min) : arrêté à la 38e, 0-0 au moment de l'arrêt. */
  function m3(w) {
    if (w < 23) return { liste: rencontre({ ...M3, started: false }), detail: null };
    if (w < 60) {
      const liveTime = lt(mn(w - 22), chrono(w - 22), 45);
      return { liste: rencontre({ ...M3, started: true, score: '0 - 0', liveTime }), detail: detailEnDirect({ id: M3.id, home: M3.home, away: M3.away, score: '0 - 0', liveTime, coverage: 'xG' }) };
    }
    const r = rencontre({ ...M3, started: true, finished: true, cancelled: true, score: '0 - 0' });
    r.match.status.reason = { short: 'Ab', long: 'Abandoned' };
    return { liste: r, detail: null };
  }

  const rangs = { liguesFavorites: new Set(), equipesFavorites: new Set(['fotmob-1102']), paires: new Set(), moteur: new Set() };
  const lireListe = (date) => fot.fetchMatchesByDate(date);
  const lireDetail = (id) => fot.fetchLiveDetail(id);
  const journal = [];
  const tours = [];
  const TOURS = 119;
  for (let w = 0; w < TOURS; w++) {
    const maintenant = T0 + w * MIN;
    allerA(maintenant);
    const etats = [m1(w), m2(w), m3(w)];
    const jour = '20261005';
    faux.listes[jour] = listeDuJour(etats.map((e) => e.liste));
    for (const [i, e] of etats.entries()) {
      const id = [M1, M2, M3][i].id;
      if (e.detail) faux.details[id] = e.detail;
      else delete faux.details[id];
    }
    noterEntree('M', `tour ${w}`, { liste: faux.listes[jour], details: faux.details });
    const avant = faux.appels.length;
    const b = await tourDuDirect({ maintenant, lireListe, lireDetail, rangs, pauseMs: 0, enFile: fileNotee(journal) });
    tours.push({ w, ...b, requetes: faux.appels.slice(avant).map((u) => (/matches\?date=/.test(u) ? 'liste' : `detail ${u.match(/matchId=(\d+)/)?.[1] ?? '?'}`)) });
    if (ETATS && typeof boucle.getEtatMinute === 'function') etatsM.push(resumeDeLEtat(w, boucle.getEtatMinute(maintenant)));
    await toucher(maintenant);
  }
  await vider({ maintenant: T0 + TOURS * MIN });
  const partage = fot.sharedDayListStats();
  s.M = {
    tours,
    lignesEnFile: journal,
    lignesEcrites: ecrites('4930%'),
    appels: { listes: faux.compter('/matches?date='), details: faux.compter('/matchDetails'), total: faux.appels.length },
    partage: { requetes: partage.requetes, servies: partage.servies, echecs: partage.echecs }
  };
  if (ETATS && typeof boucle.getEtatMinute === 'function') {
    s.M.etats = etatsM;
    // __reglerDirect() (les tests) oublie aussi la mémoire du direct : plus aucun match, plus aucun fini, le module à recharger.
    __reglerDirect();
    const apres = boucle.getEtatMinute(T0 + TOURS * MIN);
    s.M.apresReglage = { matchs: apres.matchs.length, finis: apres.finis.length, module46: apres.module46, erreurs46: apres.erreurs46, listeFotmobA: apres.listeFotmobA };
  }
}

const entreesSha1 = crypto.createHash('sha1').update(JSON.stringify(entrees)).digest('hex');
console.log(JSON.stringify({ ok: true, entreesSha1, touches, scenarios: s }));
