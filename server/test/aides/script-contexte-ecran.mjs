/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-contexte-ecran.mjs <serveur de la copie> <options JSON>
 *
 * L'ENCADRÉ « CONTEXTE DU MATCH » (étape 32, partie D, 29/10/2026) : les VRAIES réponses du serveur — la lecture du
 * contexte d'un match (data/contexte/contexteRead.contexteDuMatch : ce que l'analyse reçoit APRÈS le moteur) et le
 * complément de la page FotMob (data/providers/lineupContext.arbitreAuMagasin) — sur un MAGASIN FABRIQUÉ
 * (contexteFabrique.mjs : huit clubs réels de venues.json, des matchs fabriqués, AUCUN résultat réel), deux nuits de
 * suite (contexteNuit, dans ce processus), base NEUVE de la copie, réseau coupé, heure figée. Les lectures :
 *   premiereNuit   avant toute nuit : « pas encore calculé » ;
 *   calendrier     un match du calendrier dans la fenêtre (son midi UTC fictif : heure inconnue) ;
 *   avecCote       le même match quand l'analyse connaît son VRAI coup d'envoi (une cote) : heures refaites ;
 *   altitude / synthetique   un match chez le club en altitude, chez le club à pelouse synthétique ;
 *   horsFenetre    au-delà des 14 jours : « paraîtra la nuit du … » ;
 *   clubsInconnus  sans identifiants FotMob ; illisible : une base qui ne répond pas ;
 *   redateNouvelle / redateAncienne   un match RE-DATÉ d'un jour entre les deux nuits : l'orpheline de la première nuit
 *                  n'est jamais lue (critique, constat 17 ; bug n° 43) ;
 *   figee          un match du jour d'avant la lecture : sa fiche gelée, lue telle quelle ; figeeAvecCote : le même, son vrai
 *                  coup d'envoi connu (le match précédent, au magasin, a le sien : les heures sont exactes).
 * Chaque lecture est espionnée : ses ordres SQL (aucune écriture) et sa durée. Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import { importeur } from './versionsMoteurCommun.mjs';
import { fabriquerLeMagasin, ecrireUnCalendrier } from './contexteFabrique.mjs';

const [serveur, brut] = process.argv.slice(2);
JSON.parse(brut ?? '{}');
const imp = importeur(serveur);
const M = await imp('data/db/matchStatsDb.js');
const R = await imp('data/contexte/contexteRead.js');
const N = await imp('data/contexte/contexteNuit.js');
const LC = await imp('data/providers/lineupContext.js');
const { lireStades } = await imp('data/reference/donneesDeReference.js');
const { rebuildRegistries } = await imp('data/db/identityRegistry.js');
const dossier = process.env.CM_TEST_DOSSIER;
const s = { ok: true, pid: process.pid };

const database = M.openDb();
const sqls = [];
/** Une base espionnée : chaque ordre préparé est noté (la lecture ne doit rien écrire). */
const espion = { prepare: (sql) => (sqls.push(String(sql)), database.prepare(sql)) };
const lire = (match, maintenant, quoi) => {
  const avant = sqls.length;
  const t0 = performance.now();
  const r = R.contexteDuMatch({ match, database: espion, maintenant, lancement: { le: '2026-09-29' } });
  return { ...r, __mesure: { quoi, ms: Math.round((performance.now() - t0) * 100) / 100, ordres: sqls.slice(avant) } };
};

const venues = lireStades();
const fab = fabriquerLeMagasin(database, { venues, rebuildRegistries, jours: 60 });
const clubs = fab.clubs;
const parNom = new Map(clubs.map((c) => [c.nom, c]));
const fichierCalendrier = path.join(dossier, 'calendrier.json');
const lignes = ecrireUnCalendrier(fichierCalendrier, clubs, { de: '2026-09-30', a: '2026-10-27' });
const matchDe = (l, extra = {}) => ({
  matchId: l.matchId,
  home: l.homeName,
  away: l.awayName,
  league: l.league,
  commenceTime: `${l.date}T12:00:00Z`,
  hasOdds: false,
  scoreInputs: { home: { teamId: `fotmob-${parNom.get(l.homeName).id}` }, away: { teamId: `fotmob-${parNom.get(l.awayName).id}` } },
  ...extra
});
const ordinaire = (l) => parNom.get(l.homeName).rang < 6 && parNom.get(l.awayName).rang < 6;
const unMatch = (filtre) => lignes.find(filtre);
const calendrier = unMatch((l) => l.date === '2026-10-06' && ordinaire(l));
const altitude = unMatch((l) => l.date >= '2026-10-02' && l.date <= '2026-10-14' && parNom.get(l.homeName).rang === 7 && parNom.get(l.awayName).rang < 6);
const synthetique = unMatch((l) => l.date >= '2026-10-02' && l.date <= '2026-10-14' && parNom.get(l.homeName).rang === 6);
const loin = unMatch((l) => l.date === '2026-10-24');
const redate = unMatch((l) => l.date === '2026-10-03' && ordinaire(l) && l !== calendrier);
const figee = unMatch((l) => l.date === '2026-09-30');
s.calendrier = { lignes: lignes.length, matchs: { calendrier, altitude, synthetique, loin, redate, figee } };
s.clubs = clubs.map((c) => ({ id: c.id, nom: c.nom, rang: c.rang, stade: c.stade, synthetique: c.synthetique, altitude: c.altitude }));

// Avant toute nuit.
s.premiereNuit = lire(matchDe(calendrier), '2026-09-29T20:00:00.000Z', 'premiere-nuit');

// La nuit A (30/09, 01 h 30 de Paris) ; puis le match « redate » passe du 03/10 au 04/10 dans le calendrier ; la nuit B (01/10).
const A = await N.faireLeContexteDeLaNuit({ maintenant: '2026-09-29T23:30:00.000Z', fichierCalendrier, aPart: false });
s.nuitA = { mode: A.mode, erreur: A.erreur ?? null, calculeLe: A.calculeLe, fiches: A.ecrites?.fiches ?? null };
const redatees = lignes.map((l) => (l === redate ? { ...l, date: '2026-10-04' } : l));
fs.writeFileSync(fichierCalendrier, JSON.stringify(redatees));
const B = await N.faireLeContexteDeLaNuit({ maintenant: '2026-09-30T23:30:00.000Z', fichierCalendrier, aPart: false });
s.nuitB = { mode: B.mode, erreur: B.erreur ?? null, calculeLe: B.calculeLe, fiches: B.ecrites?.fiches ?? null };
s.orphelines = database
  .prepare('SELECT date, home_id, away_id, calcule_le FROM contexte_fiches WHERE home_id = ? AND away_id = ? ORDER BY date')
  .all(parNom.get(redate.homeName).id, parNom.get(redate.awayName).id)
  .map((r) => ({ ...r }));

// Les lectures, le 01/10 à 12 h (Paris) — après la nuit B.
const T = '2026-10-01T10:00:00.000Z';
s.lectures = {
  calendrier: lire(matchDe(calendrier), T, 'calendrier'),
  avecCote: lire(matchDe(calendrier, { hasOdds: true, matchId: 'essai-cote', commenceTime: `${calendrier.date}T19:45:00.000Z` }), T, 'avec-cote'),
  coteDuCalendrier: lire(matchDe(calendrier, { marketOdds: { kickoff: `${calendrier.date}T17:30:00.000Z` } }), T, 'cote-du-calendrier'),
  altitude: altitude ? lire(matchDe(altitude), T, 'altitude') : null,
  synthetique: synthetique ? lire(matchDe(synthetique), T, 'synthetique') : null,
  horsFenetre: lire(matchDe(loin), T, 'hors-fenetre'),
  clubsInconnus: lire(matchDe(calendrier, { scoreInputs: null }), T, 'clubs-inconnus'),
  redateNouvelle: lire(matchDe({ ...redate, date: '2026-10-04' }), T, 'redate-nouvelle'),
  redateAncienne: lire(matchDe(redate), T, 'redate-ancienne'),
  figee: lire(matchDe(figee), T, 'figee'),
  figeeAvecCote: lire(matchDe(figee, { hasOdds: true, matchId: 'essai-figee', commenceTime: `${figee.date}T18:00:00.000Z` }), T, 'figee-avec-cote')
};
const casse = { prepare: () => { throw new Error('base fermée'); } };
s.lectures.illisible = R.contexteDuMatch({ match: matchDe(calendrier), database: casse, maintenant: T });
s.sqlsEcriture = sqls.filter((q) => /\b(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i.test(q));

// L'arbitre désigné, au magasin (le complément de la page FotMob) : connu, homonyme, inconnu, sans nom, base qui ne répond pas.
s.arbitres = {
  connu: LC.arbitreAuMagasin({ name: 'Clément Turpin', country: 'France' }, database),
  homonyme: LC.arbitreAuMagasin({ name: 'Jean Dupont', country: 'France' }, database),
  inconnu: LC.arbitreAuMagasin({ name: 'Arbitre Jamais Vu', country: 'Italy' }, database),
  sansNom: LC.arbitreAuMagasin({ country: 'France' }, database),
  illisible: LC.arbitreAuMagasin({ name: 'Clément Turpin', country: 'France' }, casse)
};
s.ligues = Object.keys(JSON.parse(database.prepare("SELECT valeur FROM contexte_etat WHERE cle = 'ligues'").get()?.valeur ?? '{}').ligues ?? {});

console.log(JSON.stringify(s));
