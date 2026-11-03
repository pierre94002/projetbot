/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-cartons-ecran.mjs <serveur de la copie> <options JSON>
 *
 * LES CARTONS À L'ÉCRAN (étape 33, lot 1b, partie D, 02/11/2026) : les VRAIES réponses du serveur — la lecture des cartons
 * d'un match (cartonsRead.cartonsDuMatch) et l'arbitre désigné dans la table des cartons (cartonsRead.arbitreDesCartons) —
 * sur un MAGASIN FABRIQUÉ (cartonsFabrique.mjs : aucun résultat réel), avant puis après une nuit (cartonsNuit, dans ce
 * processus). Chaque lecture est mesurée : les ordres SQL préparés (aucune écriture), la durée. Sortie : une ligne JSON.
 */

import { importeur } from './versionsMoteurCommun.mjs';
import { fabriquerLeMagasinDesCartons, plusJours } from './cartonsFabrique.mjs';

const [serveur, brut] = process.argv.slice(2);
JSON.parse(brut ?? '{}');
const imp = importeur(serveur);
const M = await imp('data/db/matchStatsDb.js');
const N = await imp('data/cartons/cartonsNuit.js');
const R = await imp('data/cartons/cartonsRead.js');
const S = await imp('sports/football/statMarkets.js');
const s = { ok: true };

/** Une base qui note chaque ordre préparé (et refuse toute écriture). */
function espionne(database) {
  const ordres = [];
  return {
    ordres,
    base: {
      prepare(sql) {
        ordres.push(String(sql).replace(/\s+/g, ' ').trim());
        if (!/^\s*SELECT\b/i.test(sql)) throw new Error(`écriture refusée dans la lecture : ${sql}`);
        return database.prepare(sql);
      }
    }
  };
}
const ILLISIBLE = { prepare: () => { throw new Error('base fermée'); } };

const entrees = (h, a) => ({ home: { corners: { for: h[0], against: h[1] }, shots: { for: h[2], against: h[3] }, shotsOnTarget: { for: h[4], against: h[5] } }, away: { corners: { for: a[0], against: a[1] }, shots: { for: a[2], against: a[3] }, shotsOnTarget: { for: a[4], against: a[5] } } });
const unMatch = ({ home = 6001, away = 6002, league = 'Ligue Test', noms = ['Club 6001', 'Club 6002'], ids = true, statInputs = entrees([5.6, 4.4, 13.2, 11.1, 4.6, 3.8], [4.9, 5.1, 11.4, 12.6, 3.9, 4.3]) } = {}) => {
  const m = {
    matchId: `essai-${home}-${away}`,
    home: noms[0],
    away: noms[1],
    league,
    commenceTime: '2026-07-26T18:00:00.000Z',
    scoreInputs: { home: { teamId: ids === true || ids === 'home' ? `fotmob-${home}` : null }, away: { teamId: ids === true || ids === 'away' ? `fotmob-${away}` : null } },
    statInputs
  };
  return { match: m, analyse: { statExpectations: S.statExpectations(m) } };
};
const lire = (database, cas) => {
  const e = espionne(database);
  const t = performance.now();
  const r = R.cartonsDuMatch({ ...cas, database: e.base });
  return { ...r, __mesure: { ms: performance.now() - t, ordres: e.ordres } };
};

const database = M.openDb();
const fab = fabriquerLeMagasinDesCartons(database, { debut: '2026-01-05', jours: 200, aZeroDe: '2026-04-01', aZeroA: '2026-04-20' });
const dernier = fab.matchs.at(-1).date;
s.dernier = dernier;
s.lectures = {};
// Avant la première nuit : « pas encore calculé ».
s.lectures.avant = lire(database, unMatch());
const instant = Date.parse(`${plusJours(dernier, 1)}T10:00:00.000Z`);
const A = await N.faireLesCartonsDeLaNuit({ maintenant: instant, database, aPart: false, graine: 20261102 });
s.nuit = { mode: A.mode, calculeLe: A.calculeLe, jourD: A.jourD, equipes: A.ecrites?.equipes?.ecrites ?? null, arbitres: A.ecrites?.arbitres?.ecrites ?? null };
s.lectures.pret = lire(database, unMatch());
s.lectures.pret.__mesure.deuxieme = lire(database, unMatch()).__mesure.ms;
s.lectures.clubSansMatch = lire(database, unMatch({ away: 999999, noms: ['Club 6001', 'Club Neuf'] }));
s.lectures.sansCartons = lire(database, unMatch({ home: 6201, away: 6202, league: 'Liga Buts', noms: ['Club 6201', 'Club 6202'] }));
s.lectures.reglagePropre = lire(database, unMatch({ league: 'Allsvenskan - Sweden' }));
s.lectures.labelInconnu = lire(database, unMatch({ league: 'Ligue Inconnue des Essais' }));
s.lectures.sansStats = lire(database, unMatch({ statInputs: null }));
// T-E10 : « Port » sans identifiant, alors que « Portsmouth » (un autre club) a ses cartons au magasin : jamais rapprochés.
s.lectures.port = lire(database, unMatch({ noms: ['Port', 'Club 6002'], ids: 'away' }));
s.lectures.lesDeuxInconnus = lire(database, unMatch({ noms: ['Port', 'Portsmouth'], ids: false }));
s.lectures.illisible = R.cartonsDuMatch({ ...unMatch(), database: ILLISIBLE });
s.lectures.sansBase = R.cartonsDuMatch({ ...unMatch(), database: null });
s.lectures.sansNote = R.cartonsDuMatch({ ...unMatch(), database, note: null });
s.ligueTest = JSON.parse(database.prepare("SELECT valeur FROM cartons_etat WHERE cle = 'ligues'").get().valeur).ligues['Ligue Test'];
s.equipe6001 = { ...database.prepare('SELECT * FROM cartons_equipes WHERE club = 6001').get() };
// L'aperçu : l'arbitre désigné dans la table des cartons.
const arb = (referee, db = database) => {
  const e = espionne(db);
  const t = performance.now();
  const r = R.arbitreDesCartons(referee, e.base);
  return r ? { ...r, __mesure: { ms: performance.now() - t, ordres: e.ordres } } : r;
};
s.arbitres = {
  homonyme: arb({ name: 'Jean Dupont', country: 'France', yellowCardsPerMatch: 9.9, matches: 99 }),
  connu: arb({ name: 'Clément Arbitre', country: 'France' }),
  inconnu: arb({ name: 'Personne Inconnue', country: 'Spain' }),
  sansNom: arb({ name: '  ', country: 'France' }),
  illisible: R.arbitreDesCartons({ name: 'Jean Dupont', country: 'France' }, ILLISIBLE)
};
console.log(JSON.stringify(s));
