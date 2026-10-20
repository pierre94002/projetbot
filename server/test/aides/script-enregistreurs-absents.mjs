/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-enregistreurs-absents.mjs <serveur de la copie>
 *
 * Étape E — les ABSENTS DU JOUR (data/enregistreurs/absents.js), passe par
 * passe, à des instants choisis : matchs à venir sous 48 h des championnats
 * suivis ; reprise du cache des compositions lu aujourd'hui (aucune
 * requête) ; une lecture par match et par jour au plus ; trois essais par
 * jour pour un match en échec ; plafond par passe ; identifiant 0 jamais pris
 * pour une identité ; le cache des compositions jamais réécrit. FotMob
 * SIMULÉ (lecteurs injectés) : aucun réseau. Sortie : une ligne JSON.
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { rencontre, listeDuJour } from './fotmobSimule.mjs';

const [serveur] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);

const { resolveDbPath, openDb, upsertUpcomingLineup, upcomingLineupByFotmobId } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error('Base inattendue');
const database = openDb();
const fot = await imp('data/providers/fotMobProvider.js');
const { passeAbsents, lignesAbsents, __oublierAbsents } = await imp('data/enregistreurs/absents.js');
const { vider } = await imp('data/enregistreurs/file.js');

const T0 = Date.parse(process.env.CM_TEST_MAINTENANT);
const MIN = 60_000;
const r = (id, ligue, coup, extra = {}) => rencontre({ id, ligue, home: [`Dom ${id}`, id * 10], away: [`Ext ${id}`, id * 10 + 1], coup, ...extra });
const A = r(5001, 'LIGA', '2026-10-05T17:00:00.000Z');
const S = r(5002, 'EPL', '2026-10-05T11:00:00.000Z', { started: true, score: '0 - 0' });
const H = r(5003, 'HORS', '2026-10-05T18:00:00.000Z');
const B = r(5004, 'L1', '2026-10-06T19:00:00.000Z');
const C = r(5005, 'SERIEA', '2026-10-06T12:00:00.000Z');
const F = r(5006, 'EPL', '2026-10-06T15:00:00.000Z');
const E = r(5007, 'EPL', '2026-10-07T11:00:00.000Z');
const D = r(5008, 'BUNDES', '2026-10-07T13:00:00.000Z');
const LISTES = {
  '2026-10-05': listeDuJour([A, S, H]),
  '2026-10-06': listeDuJour([B, C, F]),
  '2026-10-07': listeDuJour([E, D]),
  '2026-10-08': listeDuJour([])
};

// Les listes passent par le vrai lecteur de FotMob (champs et formes réels).
const lireListe = async (jour) => {
  if (!LISTES[jour]) throw new Error(`journée inconnue ${jour}`);
  fot.__testing.listes.vider();
  globalThis.fetch = async () => ({ status: 200, ok: true, json: async () => JSON.parse(JSON.stringify(LISTES[jour])) });
  return fot.fetchMatchesByDate(jour);
};

const equipe = (id, nom, absents) => ({ teamId: `fotmob-${id}`, teamName: nom, formation: null, coach: null, startXI: [], substitutes: [], unavailable: absents });
const appels = [];
let echecsE = 1;
const lireDetail = async (id) => {
  appels.push(Number(id));
  if (id === '5004') return { available: false, reason: 'not_published_yet', meta: null };
  if (id === '5005')
    return {
      available: false,
      source: 'fotmob',
      fixtureId: id,
      home: equipe(50050, 'Dom 5005', [
        { id: 'fotmob-777', name: 'Lautaro Martínez', type: 'injury', expectedReturn: 'Mid October 2026' },
        { id: 'fotmob-777', name: 'Lautaro Martínez', type: 'injury', expectedReturn: 'Mid October 2026' }
      ]),
      away: equipe(50051, 'Ext 5005', [{ id: null, name: 'Joueur Inconnu', type: 'suspension', expectedReturn: null }]),
      meta: null
    };
  if (id === '5006') throw new Error('HTTP 500');
  if (id === '5007') {
    if (echecsE-- > 0) throw new Error('HTTP 503');
    return { available: false, home: equipe(50070, 'Dom 5007', [{ id: 'fotmob-888', name: 'Bukayo Saka', type: 'internationalDuty' }]), away: equipe(50071, 'Ext 5007', []) };
  }
  return { available: false, home: equipe(Number(id) * 10, `Dom ${id}`, []), away: equipe(Number(id) * 10 + 1, `Ext ${id}`, []) };
};

// Le cache des compositions : A lu AUJOURD'HUI (servira sans requête), C lu HIER (ne servira pas).
const pageA = { available: true, source: 'fotmob', fixtureId: '5001', home: equipe(50010, 'Dom 5001', [{ id: 'fotmob-501', name: 'Mauro Arambarri', type: 'injury', expectedReturn: 'Late October 2026' }]), away: equipe(50011, 'Ext 5001', []), teams: [] };
upsertUpcomingLineup({ fotmobId: '5001', date: '2026-10-05', kickoff: '2026-10-05T17:00:00.000Z', league: 'ESP|LaLiga', homeId: 'fotmob-50010', awayId: 'fotmob-50011', homeName: 'Dom 5001', awayName: 'Ext 5001', payload: pageA, fetchedAt: '2026-10-05T10:00:00.000Z' }, { database });
upsertUpcomingLineup({ fotmobId: '5005', date: '2026-10-06', kickoff: '2026-10-06T12:00:00.000Z', league: 'ITA|Serie A', homeId: 'fotmob-50050', awayId: 'fotmob-50051', homeName: 'Dom 5005', awayName: 'Ext 5005', payload: { available: false, home: equipe(50050, 'Dom 5005', []), away: equipe(50051, 'Ext 5005', []) }, fetchedAt: '2026-10-04T20:00:00.000Z' }, { database });
const cacheAvant = database.prepare('SELECT fotmob_id, payload, fetched_at FROM upcoming_lineups ORDER BY fotmob_id').all();

__oublierAbsents();
const passe = async (decalageMin, options = {}) => {
  const avant = appels.length;
  const b = await passeAbsents({ maintenant: T0 + decalageMin * MIN, lireListe, lireDetail, database, pauseMs: 0, ...options });
  await vider({ maintenant: T0 + decalageMin * MIN });
  return { ...b, appels: appels.slice(avant) };
};
const s = {};
s.p1 = await passe(0);
s.lecturesJour1 = database.prepare("SELECT fotmob_id AS id, origin, status, home_count AS h, away_count AS a, read_at AS lueA FROM unavailable_reads WHERE day = '2026-10-05' ORDER BY fotmob_id").all();
s.p2 = await passe(30);
s.p3 = await passe(60);
s.p4 = await passe(90);
// Redémarrage du serveur : la mémoire de la passe est perdue, la base dit ce qui est déjà relevé aujourd'hui.
__oublierAbsents();
s.p5 = await passe(120);
s.joueursJour1 = database.prepare("SELECT fotmob_id AS id, side, player_key AS cle, player_id AS pid, player_name AS nom, team_id AS equipe, reason, expected_return AS retour FROM unavailable_daily WHERE day = '2026-10-05' ORDER BY fotmob_id, side, player_key").all();
// Le lendemain : de nouvelles lectures, une par match, sous le plafond de la passe.
s.j2a = await passe(24 * 60, { maxLectures: 1 });
s.j2b = await passe(24 * 60 + 30);
s.lecturesJour2 = database.prepare("SELECT fotmob_id AS id, origin, status FROM unavailable_reads WHERE day = '2026-10-06' ORDER BY fotmob_id").all();
s.cacheIntact = JSON.stringify(database.prepare('SELECT fotmob_id, payload, fetched_at FROM upcoming_lineups ORDER BY fotmob_id').all()) === JSON.stringify(cacheAvant);
s.cacheA = upcomingLineupByFotmobId('5001', { database })?.fetchedAt ?? null;
s.unitaire = {
  vide: lignesAbsents({ available: false, reason: 'not_published_yet' }),
  sansListe: lignesAbsents({ home: { teamId: 'fotmob-1' }, away: null })
};

console.log(JSON.stringify({ ok: true, ...s }));
