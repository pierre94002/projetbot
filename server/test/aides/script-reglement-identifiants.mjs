/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-reglement-identifiants.mjs <serveur de la copie> <phase>
 *
 * LE CORRECTIF DU RÈGLEMENT DES VRAIS PARIS (02/11/2026), sur le MAGASIN FABRIQUÉ de reglementFabrique.mjs (base NEUVE de
 * la copie : jamais la base du bac, jamais la vraie base), réseau coupé, heure figée. Phases :
 *   principal  deux passes de settlePending sur le carnet, les résultats et les pronostics fabriqués ; la lecture du
 *              carnet (reglementPourLaLecture, puis GET /api/bets par le contrôleur, carnet relu à l'octet avant/après) ;
 *              les phrases de chaque code ;
 *   erreur     le magasin sans la table team_stats : la passe rend son rapport, les paris qui en ont besoin attendent ;
 *   revue-a    un pari réglé à la 90e ; puis le club n'est plus reconnu (alias retirés, nom changé au magasin) ;
 *   revue-b    (même copie, autre processus) la passe suivante ne le revoit pas sur le score final.
 * Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as F from './reglementFabrique.mjs';

const [serveur, phase] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);
const RUNTIME = path.join(serveur, 'data', 'runtime');

const M = await imp('data/db/matchStatsDb.js');
if (path.resolve(M.resolveDbPath()).toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error('Base inattendue');
const database = M.openDb();
const S = await imp('data/providers/settlementService.js');
const { listBets } = await imp('data/repositories/betsRepository.js');
const { listPredictions } = await imp('data/repositories/predictionsRepository.js');
const ecrire = (nom, contenu) => fs.writeFileSync(path.join(RUNTIME, nom), JSON.stringify(contenu, null, 1));
const s = { ok: true, phase };

async function magasin() {
  const { rebuildRegistries } = await imp('data/db/identityRegistry.js');
  return F.fabriquerLeMagasin(database, { rebuildRegistries });
}
const vue = (bets) =>
  Object.fromEntries(bets.flatMap((b) => b.legs.map((l, i) => [b.legs.length === 1 ? b.id : `${b.id}#${i}`, { status: l.status ?? b.status, settledBy: l.settledBy ?? null, settledScore: l.settledScore ?? null, ticket: b.status }])));

if (phase === 'principal') {
  s.rencontres = await magasin();
  ecrire('match-results.json', F.resultats());
  ecrire('bets.json', F.carnet());
  ecrire('predictions.json', F.pronostics());
  ecrire('season-calendar.json', []);
  s.premiere = S.settlePending({ apply: true, database });
  s.apresPremiere = vue(listBets());
  s.seconde = S.settlePending({ apply: true, database });
  s.selections = vue(listBets());
  s.pronostics = Object.fromEntries(listPredictions().map((p) => [p.id, { status: p.status, settledScore: p.settledScore ?? null }]));
  // La lecture : toutes les attentes (comparaison), puis celle de Mes paris (conditions d'heure).
  s.attentes = S.reglementPourLaLecture({ bets: listBets(), database, toutes: true });
  s.lecture = S.reglementPourLaLecture({ bets: listBets(), database });
  // GET /api/bets par le contrôleur : le carnet relu à l'octet avant et après.
  const carnetAvant = fs.readFileSync(path.join(RUNTIME, 'bets.json'));
  const { getAllBets } = await imp('api/controllers/bets.controller.js');
  let corps = null;
  getAllBets({}, { json: (x) => { corps = JSON.parse(JSON.stringify(x)); } });
  s.route = corps;
  s.carnetIntact = Buffer.compare(carnetAvant, fs.readFileSync(path.join(RUNTIME, 'bets.json'))) === 0;
  // Les phrases de chaque code, avec des détails d'essai.
  const details = { club: 'Wolfsberg AC', a: '2-1', b: '2-2', score: '1-1', quoi: 'prolongation' };
  s.phrases = Object.fromEntries(Object.entries(S.PHRASES_DU_REGLEMENT).map(([code, f]) => [code, f(details)]));
  s.phrases90e = ['prolongation', 'tirs au but', 'prolongation et tirs au but'].map((quoi) => S.PHRASES_DU_REGLEMENT['regle-a-la-90e']({ score: '0-0', quoi }));
} else if (phase === 'erreur') {
  await magasin();
  database.exec('DROP TABLE team_stats');
  const C = F.CLUBS;
  ecrire('match-results.json', F.resultats());
  ecrire('season-calendar.json', []);
  const jambe = (matchId, home, away, league, market, pick) => ({ matchId, homeName: home, awayName: away, league, commenceTime: `${F.J}T15:00:00Z`, market, pick, odds: 1.9, status: 'pending' });
  const pari = (id, leg) => ({ id, createdAt: `${F.plusJours(F.J, -1)}T10:00:00.000Z`, settledAt: null, status: 'pending', stake: 10, odds: 1.9, legs: [leg] });
  ecrire('bets.json', [
    pari('e-corners', jambe('odds-e1', C.portVale.nom, C.exeter.nom, 'EFL Cup', 'Total corners', 'Plus de 9.5')),
    pari('e-buts', jambe('odds-e2', C.porto.nom, C.casaPia.nom, 'Primeira Liga - Portugal', 'Résultat', 'FC Porto')),
    pari('e-saisie', jambe('odds-r10a', 'Bellmoor', 'Crestfall', 'Coupe Fabriquée', 'Résultat', 'Match nul'))
  ]);
  ecrire('predictions.json', [
    { id: 'p-buts', matchId: 'odds-pe', homeName: 'Port Vale', awayName: 'Exeter City', league: 'EFL Cup', market: 'Résultat', predictedOutcome: 'home', predictedLabel: 'Résultat', status: 'pending', settledAt: null, day: F.plusJours(F.J, -1), commenceTime: `${F.J}T15:00:00Z` }
  ]);
  try {
    s.rapport = S.settlePending({ apply: true, database });
  } catch (error) {
    s.ok = false;
    s.erreur = String(error?.message ?? error);
  }
  s.selections = vue(listBets());
  s.pronostics = Object.fromEntries(listPredictions().map((p) => [p.id, p.status]));
  s.attentes = S.reglementPourLaLecture({ bets: listBets(), database, toutes: true });
} else if (phase === 'revue-a') {
  await magasin();
  ecrire('match-results.json', F.resultats());
  ecrire('season-calendar.json', []);
  ecrire('predictions.json', []);
  ecrire('bets.json', [
    { id: 'r19', createdAt: `${F.plusJours(F.J, -1)}T10:00:00.000Z`, settledAt: null, status: 'pending', stake: 10, odds: 2.1, legs: [{ matchId: 'odds-r19', homeName: 'Ardmore', awayName: 'Belcastle', league: 'Coupe Fabriquée', commenceTime: `${F.J}T15:00:00Z`, market: 'Résultat', pick: 'Belcastle', odds: 2.1, status: 'pending' }] }
  ]);
  s.rapport = S.settlePending({ apply: true, database });
  s.selections = vue(listBets());
  // Le club n'est plus reconnu : ses écritures retirées de l'annuaire, et le nom changé au magasin (le frein par noms ne
  // le retrouve plus non plus).
  const id = F.CLUBS.Belcastle.id;
  s.retires = database.prepare('DELETE FROM team_aliases WHERE team_id = ?').run(id).changes;
  database.prepare("UPDATE matches SET away_name = 'Zzyzx Rangers' WHERE away_id = ?").run(id);
  database.exec('PRAGMA wal_checkpoint(TRUNCATE)');
} else if (phase === 'revue-b') {
  s.club = (await imp('data/db/oddsProfileRead.js')).clubDuMagasin('Belcastle', 'Coupe Fabriquée', database);
  s.rapport = S.settlePending({ apply: true, database });
  s.selections = vue(listBets());
} else {
  throw new Error(`Phase inconnue : ${phase}`);
}

console.log(JSON.stringify(s));
