/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-reglement-frontiere.mjs <serveur de la copie> <carnet : vide | coupe-circuit>
 *
 * T-G1 du correctif du règlement (02/11/2026) : le carnet de paris ne change RIEN de ce que l'essai 27 enregistre. Sur la
 * base d'essai de la copie (comme script-moteur-a-blanc.mjs : faux relevé The Odds API, FotMob simulé vide, heure figée,
 * aucun Claude), avec les MÊMES garde-fous réglés (perte maximale 50 € par semaine) et un carnet soit vide, soit avec
 * 60 € perdus cette semaine (le coupe-circuit s'enclenche) :
 *   - le TÉMOIN : l'état du coupe-circuit, et la mise conseillée et les verdicts d'une analyse (ils DOIVENT différer d'un
 *     carnet à l'autre, sinon le test passerait à vide) ;
 *   - ce que la nuit ÉCRIT : les pronostics gelés (gelerLaNuit → engine_picks) et les lignes à blanc d'une candidate
 *     d'essai (calculerABlanc → engine_candidate_picks), relus en entier, sans les colonnes d'heure.
 * Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import { importeur, requeteExpress, ecrireInstantane, matchsDuCalendrier, MATCHS_COTES } from './versionsMoteurCommun.mjs';
import { recopierScripts } from './claudeSimule.mjs';
import { installerFauxFetch, listeDuJour } from './fotmobSimule.mjs';

const [serveur, carnet] = process.argv.slice(2);
const imp = importeur(serveur);
const RUNTIME = path.join(serveur, 'data', 'runtime');
const DOSSIER_COPIE = path.resolve(serveur, '..', '..');

const { resolveDbPath, openDb } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error('Base inattendue');
const database = openDb();
installerFauxFetch({ listes: { 20261004: listeDuJour([]), 20261005: listeDuJour([]), 20261006: listeDuJour([]) } });
recopierScripts(serveur);

const s = { ok: true, carnet };
await ecrireInstantane(imp);
const perdu = (id, mise, cree, regle) => ({
  id, createdAt: cree, settledAt: regle, status: 'lost', stake: mise, odds: 2,
  legs: [{ matchId: `m-${id}`, homeName: 'Arsenal', awayName: 'Chelsea', league: 'EPL', market: 'Résultat', pick: 'Arsenal', odds: 2, marketId: 'result', params: { outcome: 'home' }, status: 'lost', settledBy: 'manual' }]
});
const paris = carnet === 'coupe-circuit' ? [perdu('lundi-1', 30, '2026-10-04T10:00:00Z', '2026-10-05T08:00:00Z'), perdu('lundi-2', 30, '2026-10-04T11:00:00Z', '2026-10-05T09:00:00Z')] : [];
fs.writeFileSync(path.join(RUNTIME, 'bets.json'), JSON.stringify(paris));
fs.writeFileSync(path.join(RUNTIME, 'predictions.json'), '[]');
const { enregistrerReglageGardeFous } = await imp('data/repositories/gardeFousRepository.js');
enregistrerReglageGardeFous({ perteMaxParSemaine: 50 });

const V = await imp('core/engine/engineVersions.js');
V.demarrerVersions();
const { getTiltState } = await imp('core/engine/tiltState.js');
const tilt = getTiltState();
s.temoin = { coupeCircuit: tilt.circuitBreakerActive, motif: tilt.coupeCircuit?.motif ?? null };
// Le témoin : une analyse de la route de Mes paris et de la page du match (mise conseillée, verdicts).
const { createApp } = await imp('app.js');
const app = createApp();
const m = MATCHS_COTES[0];
const r = await requeteExpress(app, 'GET', `/api/analysis/match/${m.id}?source=odds-api&bankroll=10000`);
s.temoin.analyse = { code: r.code, staking: r.corps?.staking ?? null, verdicts: r.corps?.verdicts ?? null };

// Ce que la nuit écrit : le gel, puis la candidate d'essai à blanc (celle de script-moteur-a-blanc.mjs).
const gel = await imp('data/enregistreurs/gelPronostics.js');
const { calculerABlanc } = await imp('data/enregistreurs/moteurABlanc.js');
const calendrier = await matchsDuCalendrier(imp);
s.gel = await gel.gelerLaNuit({ maintenant: Date.now(), matchs: calendrier, dansLaPasse: true, database });
const CANDIDATE = Object.freeze({
  id: 'essai-rho-015',
  etape: '27',
  quoi: 'Corrélation Dixon-Coles à −0,15 (candidate d’essai)',
  modifications: { football: { defaultCorrelation: -0.15 } },
  marches: ['totalGoals', 'bothTeamsScore']
});
s.nuit = await calculerABlanc({ dansLaPasse: true, candidate: CANDIDATE, mesure: { fichier: path.join(DOSSIER_COPIE, 'registre-mesure-essai.json') } });
const sansHeure = (ligne) => Object.fromEntries(Object.entries(ligne).filter(([k]) => !/(_at|At)$/.test(k)));
const tout = (table) => database.prepare(`SELECT * FROM ${table}`).all().map((x) => sansHeure({ ...x })).map((x) => JSON.stringify(x)).sort();
s.ecrit = { engine_picks: tout('engine_picks'), engine_candidate_picks: tout('engine_candidate_picks') };
s.colonnes = {
  engine_picks: database.prepare('PRAGMA table_info(engine_picks)').all().map((c) => c.name),
  engine_candidate_picks: database.prepare('PRAGMA table_info(engine_candidate_picks)').all().map((c) => c.name)
};
console.log(JSON.stringify(s));
