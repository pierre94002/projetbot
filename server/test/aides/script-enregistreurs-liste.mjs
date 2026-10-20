/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-enregistreurs-liste.mjs <serveur de la copie>
 *
 * Étape E — la LECTURE PARTAGÉE de la liste du jour (fetchMatchesByDate) :
 * une seule requête pour plusieurs appelants (en même temps, puis les vraies
 * boucles de l'appli dans la même minute, sans qu'on les ait modifiées),
 * chacun sa copie, oubli après une minute, jamais d'erreur gardée ; et la
 * lecture du direct (minute, rouges) dans la liste et dans le détail.
 * Réponses FotMob SIMULÉES (fotmobSimule.mjs) : aucun réseau. Sortie : une ligne JSON.
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { rencontre, listeDuJour, detailEnDirect, pageAVenir, installerFauxFetch } from './fotmobSimule.mjs';

const [serveur] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);

const { resolveDbPath, openDb } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error('Base inattendue');
const database = openDb();

const fot = await imp('data/providers/fotMobProvider.js');
const { runLineupPrefetch } = await imp('data/providers/lineupPrefetch.js');
const { reserveCoupDEnvoi } = await imp('core/ai/autoMatchAiTrigger.js');
const { runOddsWatch } = await imp('jobs/oddsWatch.js');
const { passeAbsents } = await imp('data/enregistreurs/absents.js');
const { tourDuDirect, __reglerDirect } = await imp('jobs/liveWatch.js');

const MAINTENANT = Date.parse(process.env.CM_TEST_MAINTENANT);
const L1 = rencontre({ id: 4810001, ligue: 'EPL', home: ['Arsenal', 9825], away: ['Chelsea', 8455], coup: '2026-10-05T09:15:00.000Z', started: true, score: '2 - 1', liveTime: { short: '88’', long: '87:40', maxTime: 90 }, rouges: [0, 1] });
const L2 = rencontre({ id: 4810002, ligue: 'LIGA', home: ['Sevilla', 7854], away: ['Betis', 8603], coup: '2026-10-05T09:20:00.000Z', started: true, score: '0 - 0', liveTime: { short: 'HT' } });
const L3 = rencontre({ id: 4810003, ligue: 'SERIEA', home: ['Inter', 8636], away: ['Udinese', 8600], coup: '2026-10-05T09:25:00.000Z', started: true, score: '1 - 1', liveTime: { long: '33:12' } });
const U1 = rencontre({ id: 4810010, ligue: 'LIGA', home: ['Getafe', 8305], away: ['Girona', 7732], coup: '2026-10-05T17:00:00.000Z' });
const H1 = rencontre({ id: 4810011, ligue: 'HORS', home: ['A', 1], away: ['B', 2], coup: '2026-10-05T17:30:00.000Z' });
const T1 = rencontre({ id: 4810020, ligue: 'L1', home: ['Lens', 8588], away: ['Lille', 8639], coup: '2026-10-06T19:00:00.000Z' });
const P1 = rencontre({ id: 4810030, ligue: 'SERIEA', home: ['Monza', 6504], away: ['Sassuolo', 7943], coup: '2026-10-07T10:00:00.000Z' });

const faux = installerFauxFetch({
  listes: {
    20261005: listeDuJour([L1, L2, L3, U1, H1]),
    20261006: listeDuJour([T1]),
    20261007: listeDuJour([P1])
  },
  details: {
    4810001: detailEnDirect({ id: 4810001, home: ['Arsenal', 9825], away: ['Chelsea', 8455], score: '2 - 1', liveTime: { short: '89’' }, xg: [1.84, 0.62], tirs: [14, 6], cartons: [{ side: 'away', card: 'Red', minute: 51 }, { side: 'home', card: 'Yellow', minute: 20 }] }),
    4810003: detailEnDirect({ id: 4810003, home: ['Inter', 8636], away: ['Udinese', 8600], score: '1 - 1', liveTime: { short: '34’' }, sansStats: true, coverage: 'lower' }),
    4810010: pageAVenir({ home: ['Getafe', 8305], away: ['Girona', 7732], absentsDom: [{ id: 501, nom: 'Mauro Arambarri', type: 'injury' }], absentsExt: [] }),
    4810020: pageAVenir({ home: ['Lens', 8588], away: ['Lille', 8639], publiee: false }),
    4810030: pageAVenir({ home: ['Monza', 6504], away: ['Sassuolo', 7943], absentsDom: [], absentsExt: [{ id: 0, nom: 'Joueur Inconnu', type: 'suspension' }] })
  }
});
const listes = (jour) => faux.compter(`/matches?date=${jour}`);
const s = {};

// a. Cinq appelants EN MÊME TEMPS : une seule requête.
fot.__testing.listes.vider();
const simultanes = await Promise.all([1, 2, 3, 4, 5].map(() => fot.fetchMatchesByDate('2026-10-05')));
s.simultanes = { requetes: listes('20261005'), compteurs: fot.__testing.listes.compteurs(), identiques: simultanes.every((l) => JSON.stringify(l) === JSON.stringify(simultanes[0])), taille: simultanes[0].length };

// b. Les vraies boucles de l'appli, telles quelles, dans la même minute.
const appelsAvant = faux.appels.length;
s.compositions = await runLineupPrefetch({ windowMin: 120, database });
s.reserve = await reserveCoupDEnvoi(MAINTENANT);
s.cotes = await runOddsWatch({ backfill: false });
s.absents = await passeAbsents({ maintenant: MAINTENANT, pauseMs: 0, database });
__reglerDirect();
s.direct = await tourDuDirect({ maintenant: MAINTENANT, rangs: { liguesFavorites: new Set(), equipesFavorites: new Set(), paires: new Set(), moteur: new Set() }, enFile: () => {}, pauseMs: 0 });
s.boucles = {
  listeAujourdhui: listes('20261005'),
  listeDemain: listes('20261006'),
  listeApresDemain: listes('20261007'),
  details: faux.compter('/matchDetails'),
  autresAppels: faux.appels.slice(appelsAvant).filter((a) => !a.includes('/matches?date=') && !a.includes('/matchDetails')).length,
  compteurs: fot.__testing.listes.compteurs()
};

// c. Chacun sa copie : ce qu'un appelant modifie ne touche pas les autres.
const a = await fot.fetchMatchesByDate('2026-10-05');
a[0].homeName = 'MODIFIÉ';
a.push({ matchId: 'intrus' });
const b = await fot.fetchMatchesByDate('2026-10-05');
s.copies = { nom: b[0].homeName, taille: b.length, requetes: listes('20261005') };

// d. Au-delà d'une minute, la liste est relue.
fot.__testing.listes.avancer(61_000);
await fot.fetchMatchesByDate('2026-10-05');
s.apresUneMinute = { requetes: listes('20261005') };

// e. Une lecture ratée n'est jamais gardée : ceux qui l'attendaient échouent tous ensemble, l'appel suivant redemande.
faux.listes['20261008'] = new Error('FotMob muet');
const echecs = await Promise.allSettled([1, 2, 3].map(() => fot.fetchMatchesByDate('2026-10-08')));
const appelsEchec = listes('20261008');
const compteursEchec = fot.__testing.listes.compteurs();
faux.listes['20261008'] = listeDuJour([]);
const reprise = await fot.fetchMatchesByDate('2026-10-08').then((l) => ({ ok: true, taille: l.length }), (e) => ({ ok: false, erreur: e.message }));
s.erreurs = { rejets: echecs.filter((r) => r.status === 'rejected').length, appels: appelsEchec, compteurs: compteursEchec, reprise, appelsApres: listes('20261008') };

// f. Le direct dans la liste du jour : minute et rouges, rien d'inventé.
const duJour = await fot.fetchMatchesByDate('2026-10-05');
const champ = (id) => {
  const m = duJour.find((x) => x.matchId === String(id));
  return { liveMinute: m.liveMinute, liveAddedTime: m.liveAddedTime, liveLabel: m.liveLabel, liveMaxTime: m.liveMaxTime, halfTime: m.halfTime, homeRedCards: m.homeRedCards, awayRedCards: m.awayRedCards, started: m.started };
};
s.liste = { L1: champ(4810001), L2: champ(4810002), L3: champ(4810003), U1: champ(4810010) };
const lire = fot.__testing.lireDirect;
s.formes = {
  arretsDeJeu: lire({ liveTime: { short: '45+2’' } }),
  long: lire({ liveTime: { long: '61:05' } }),
  miTemps: lire({ liveTime: { short: 'HT' } }),
  rien: lire({}),
  rougesEquipe: lire({ liveTime: { short: '70’' } }, { redCards: 2 }, { redCards: 0 })
};

// g. Le détail d'un match en cours.
s.detail = {
  L1: await fot.fetchLiveDetail(4810001),
  L3: await fot.fetchLiveDetail(4810003)
};

console.log(JSON.stringify({ ok: true, ...s }));
