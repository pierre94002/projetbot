/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-noms.mjs <serveur de la copie>
 *
 * Les vraies fonctions de rapprochement du serveur, sur la base d'essai :
 * clubDuMagasin (identifiant FotMob d'un nom, dans une compétition),
 * findTeams (annuaire), listTeamMatchStats (forme et moyennes d'une équipe),
 * teamFormFromStore, scoreInputsFromStore et statInputsFromStore (entrées du
 * moteur). Sortie : une ligne JSON, que test/noms.test.mjs vérifie.
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [serveur] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);

const { resolveDbPath, openDb } = await imp('data/db/matchStatsDb.js');
const chemin = path.resolve(resolveDbPath());
if (chemin.toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error(`Base inattendue : ${chemin}`);
const db = openDb();

const { clubDuMagasin } = await imp('data/db/oddsProfileRead.js');
const { findTeams } = await imp('data/db/identityRegistry.js');
const { listTeamMatchStats } = await imp('data/repositories/matchStatsWebRepository.js');
const { teamFormFromStore } = await imp('data/db/matchStatsRead.js');
const { scoreInputsFromStore } = await imp('data/db/scoreFormRead.js');
const { statInputsFromStore } = await imp('data/db/statInputsRead.js');

const PT = 'Primeira Liga - Portugal';
const PY = 'División Profesional - Paraguay';
const EC = 'Serie A - Ecuador';
const CL = 'Primera División - Chile';

const CAS = [
  ['Leeds United', 'EPL'], ['Leeds', 'EPL'], ['Leeds United', null], ['Leeds United', 'MLS'], ['DC United', 'MLS'], ['D.C. United', 'MLS'], ['DC United', 'EPL'],
  ['Nacional', PT], ['C.D. Nacional', PT], ['Nacional', PY], ['Nacional', null], ['Nacional', 'EPL'],
  ['Libertad', PY], ['Libertad', EC], ['Libertad', null],
  ['Universidad Católica', EC], ['Universidad Católica', CL], ['Universidad Catolica', null],
  ['Port', 'Super League - China'], ['Port', 'League 2'], ['Port', 'Championship'], ['Port', PT],
  ['Portsmouth', 'Championship'], ['Porto', PT], ['FC Porto', PT], ['Port Vale', 'League 2'], ['Shanghai Port', 'Super League - China'], ['Shanghai SIPG FC', 'Super League - China'],
  ['Inter', 'Serie A - Italy'], ['Inter Miami CF', 'MLS']
];
const clubs = CAS.map(([nom, ligue]) => ({ nom, ligue, id: clubDuMagasin(nom, ligue, db) }));
const annuaire = Object.fromEntries(['Nacional', 'Libertad', 'Universidad Católica', 'Leeds United', 'DC United', 'Port', 'Porto'].map((n) => [n, findTeams(n, { database: db }).map((c) => c.teamId)]));

const vue = (liste) => liste.map((m) => ({ date: m.date, league: m.league, equipe: m.teams[0].teamId, adversaire: m.teams[1].teamId, nom: m.teamName }));
const listes = {
  leedsEPL: vue(listTeamMatchStats('Leeds United', { league: 'EPL' })),
  leedsSansLigue: vue(listTeamMatchStats('Leeds United')),
  dcUnited: vue(listTeamMatchStats('DC United', { league: 'MLS' })),
  nacionalPT: vue(listTeamMatchStats('Nacional', { league: PT })),
  nacionalPY: vue(listTeamMatchStats('Nacional', { league: PY }))
};
const formes = Object.fromEntries(
  [['nacionalPT', 'Nacional', PT], ['nacionalPY', 'Nacional', PY], ['libertadEC', 'Libertad', EC], ['libertadPY', 'Libertad', PY]].map(([cle, nom, league]) => {
    const f = teamFormFromStore(nom, { league, database: db });
    const ligueDe = db.prepare('SELECT league FROM matches WHERE fotmob_id = ? OR match_key = ?');
    const ligues = [...new Set(f.matches.map((m) => ligueDe.get(String(m.fixtureId), String(m.fixtureId))?.league ?? null))];
    return [cle, { n: f.matches.length, adversaires: f.matches.map((m) => m.opponent), ligues, teamId: f.teamId }];
  })
);
const entrees = {
  scoreNacionalPT: (({ home, away }) => ({ home: home.teamId, away: away.teamId }))(scoreInputsFromStore({ league: PT, home: 'C.D. Nacional', away: 'FC Famalicao', date: '2026-09-19', database: db })),
  scoreNacionalPY: (({ home, away }) => ({ home: home.teamId, away: away.teamId }))(scoreInputsFromStore({ league: PY, home: 'Nacional', away: '2 de Mayo', date: '2026-09-18', database: db })),
  statsLeeds: statInputsFromStore({ homeName: 'Leeds United', awayName: 'Newcastle United', league: 'EPL', beforeDate: '2026-09-14', database: db }),
  statsDcUnited: statInputsFromStore({ homeName: 'DC United', awayName: 'Atlanta United', league: 'MLS', beforeDate: '2026-09-12', database: db })
};
console.log(JSON.stringify({ ok: true, clubs, annuaire, listes, formes, entrees }));
