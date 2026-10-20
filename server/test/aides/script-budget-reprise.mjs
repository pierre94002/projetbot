/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-budget-reprise.mjs <serveur de la copie>
 *
 * Étape 4 — LA RÈGLE DES DEUX TITULAIRES HABITUELS (mode économe) :
 *   A. la fonction (titulairesHabituelsChanges) sur des compositions
 *      fabriquées : habituel = au moins la moitié des matchs de l'équipe
 *      (et 2) ; remplaçant contre remplaçant = 0 ; un habituel sorti = 1 ;
 *      deux = 2 ; un habituel remplacé par un autre = 2 ; les deux équipes
 *      comptent ; un côté sans composition est ignoré ;
 *   B. la décision de reprise (compositionChangee + reprisePermise) : en
 *      économe, au moins deux ; en normal, au moindre changement ; les règles
 *      d'avant (composition plus ancienne que l'analyse, déjà refaite) intactes ;
 *   C. la vraie passe d'avant coup d'envoi : un habituel changé → reprise
 *      évitée (comptée une fois), deux → reprise faite et notée « reprise » ;
 *      en mode normal, un seul suffit.
 * Claude SIMULÉ, FotMob SIMULÉ. Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import { installerClaudeSimule, importeur, pageComposition, lireFichierJournal } from './claudeSimule.mjs';
import { rencontre, listeDuJour, installerFauxFetch } from './fotmobSimule.mjs';

const [serveur] = process.argv.slice(2);
const imp = importeur(serveur);
const RUNTIME = path.join(serveur, 'data', 'runtime');
const ecrire = (nom, contenu) => fs.writeFileSync(path.join(RUNTIME, nom), JSON.stringify(contenu, null, 1));

const { resolveDbPath, openDb, upsertUpcomingLineup } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error('Base inattendue');
const database = openDb();
const { titulairesHabituelsChanges, onzesDe } = await imp('data/providers/lineupContext.js');
const auto = await imp('core/ai/autoMatchAiTrigger.js');
const budget = await imp('core/ai/claudeBudget.js');
const { getByMatchId } = await imp('data/repositories/matchAiAnalysisRepository.js');

const s = {};
const JOUR = '2026-10-05';
const COUP = '2026-10-05T12:30:00.000Z';

// ------------------------------------------------- A. la fonction seule
// Une équipe sur 10 matchs : habituel = au moins 5 titularisations. Le onze :
// n° 0 à 8 habituels (10 à 5), n° 9 remplaçant (2), n° 10 sans statistiques ;
// n° 99 : titulaire habituel ABSENT du onze analysé.
const joueur = (n, starts) => ({ id: `fotmob-${n}`, name: `Joueur ${n}`, stats: starts === null ? null : { starts } });
const STARTS = [10, 9, 9, 8, 8, 7, 7, 6, 5, 2, null];
const equipe = (base, teamMatches = 10) => ({
  teamMatches,
  startXI: STARTS.map((st, k) => joueur(base + k, st)),
  usualStartersMissing: [{ id: `fotmob-${base + 99}`, name: `Habituel absent ${base}`, starts: 8 }]
});
const instantane = { fotmobMatchId: '4900301', home: equipe(1000), away: equipe(2000) };
const onze = (base, remplacements = {}) => STARTS.map((_, k) => `fotmob-${remplacements[k] ?? base + k}`);
const cas = (home, away = onze(2000)) => titulairesHabituelsChanges(instantane, { home, away }).map((c) => `${c.side}:${c.name}:${c.sens}`);
s.A = {
  identique: cas(onze(1000)),
  remplacantContreRemplacant: cas(onze(1000, { 9: 1050 })),
  sansStatsRemplace: cas(onze(1000, { 10: 1051 })),
  unHabituelSorti: cas(onze(1000, { 8: 1050 })),
  deuxHabituelsSortis: cas(onze(1000, { 7: 1050, 8: 1051 })),
  habituelContreHabituel: cas(onze(1000, { 8: 1099 })),
  habituelRevient: cas(onze(1000, { 9: 1099 })),
  unDeChaqueCote: cas(onze(1000, { 8: 1050 }), onze(2000, { 0: 2050 })),
  coteSansCompo: titulairesHabituelsChanges(instantane, { home: onze(1000, { 8: 1050 }), away: [] }).length,
  peuDeMatchs: titulairesHabituelsChanges({ home: equipe(1000, 2) }, { home: onze(1000, { 9: 1050 }) }).length,
  avecOnzesDe: titulairesHabituelsChanges(instantane, onzesDe({ home: { startXI: onze(1000, { 7: 1050, 8: 1051 }).map((id) => ({ id })) }, away: { startXI: onze(2000).map((id) => ({ id })) } })).length
};

// --------------------------- B. la décision de reprise, composition par composition
const ECONOME = budget.politiqueBudget(true);
const NORMAL = budget.politiqueBudget(false);
const entreeB = { matchId: 'essai-B', timing: 'coup-d-envoi', analysedAt: '2026-10-05T12:00:00.000Z', kickoffRuns: 1, lineupSnapshot: instantane };
const pageDe = (home, away) => ({ available: true, home: { startXI: home.map((id) => ({ id })) }, away: { startXI: away.map((id) => ({ id })) } });
const cache = (fotmobId, home, away, fetchedAt) =>
  upsertUpcomingLineup({ fotmobId, date: JOUR, kickoff: COUP, league: 'EPL', homeId: null, awayId: null, homeName: 'Domicile', awayName: 'Exterieur', payload: pageDe(home, away), fetchedAt }, { database });
const decision = (entree) => {
  const change = auto.__testing.compositionChangee(entree);
  return { change, econome: change ? auto.__testing.reprisePermise(entree, ECONOME).reprendre : null, normal: change ? auto.__testing.reprisePermise(entree, NORMAL).reprendre : null };
};
cache('4900301', onze(1000, { 8: 1050 }), onze(2000), '2026-10-05T12:05:00.000Z');
s.B = { unHabituel: decision(entreeB) };
cache('4900301', onze(1000, { 7: 1050, 8: 1051 }), onze(2000), '2026-10-05T12:06:00.000Z');
s.B.deuxHabituels = decision(entreeB);
cache('4900301', onze(1000, { 9: 1050 }), onze(2000), '2026-10-05T12:07:00.000Z');
s.B.unRemplacant = decision(entreeB);
cache('4900301', onze(1000, { 7: 1050, 8: 1051 }), onze(2000), '2026-10-05T11:55:00.000Z');
s.B.compoPlusAncienne = decision(entreeB);
cache('4900301', onze(1000, { 7: 1050, 8: 1051 }), onze(2000), '2026-10-05T12:08:00.000Z');
s.B.dejaRefaite = decision({ ...entreeB, kickoffRuns: 2 });

// ---------------------- C. la vraie passe d'avant coup d'envoi (économe puis normal)
const K = { id: 4900401, home: ['Brentford', 9937], away: ['Fulham', 9879], matchId: 'cal-2026-10-05-Brentford-Fulham' };
const K2 = { id: 4900402, home: ['Norwich', 9850], away: ['Wrexham', 9841], matchId: 'cal-2026-10-05-Norwich-Wrexham' };
ecrire('season-calendar.json', [
  { league: 'EPL', homeName: 'Brentford', awayName: 'Fulham', date: JOUR },
  { league: 'Championship', homeName: 'Norwich', awayName: 'Wrexham', date: JOUR }
]);
const instantaneDe = (fotmobMatchId, bDom, bExt) => ({ source: 'FotMob', fotmobMatchId, fetchedAt: '2026-10-05T12:00:00.000Z', home: equipe(bDom), away: equipe(bExt) });
const entree = (k, bDom, bExt, league) => ({
  matchId: k.matchId,
  homeName: k.home[0],
  awayName: k.away[0],
  league,
  commenceTime: COUP,
  model: 'claude-code:sonnet',
  timing: 'coup-d-envoi',
  kickoffRuns: 1,
  analysedAt: '2026-10-05T12:00:00.000Z',
  createdAt: '2026-10-05T12:00:00.000Z',
  lineupSnapshot: instantaneDe(String(k.id), bDom, bExt),
  engineSnapshot: { marketPredictions: [] },
  analysis: { summary: 'Analyse d’essai au coup d’envoi.' }
});
ecrire('match-ai-analyses.json', [entree(K, 3000, 4000, 'EPL'), entree(K2, 5000, 6000, 'Championship')]);
ecrire('budget-claude.json', { tokensParJour: 1_000_000, tokensParSemaine: 5_000_000, mode: 'econome', enregistreLe: '2026-10-05T08:00:00.000Z' });
const avecIds = (liste) => liste.map((id) => [Number(id.replace('fotmob-', '')), `Joueur ${id}`]);
const faux = installerFauxFetch({
  listes: {
    20261004: listeDuJour([]),
    20261005: listeDuJour([rencontre({ id: K.id, home: K.home, away: K.away, coup: COUP }), rencontre({ id: K2.id, home: K2.home, away: K2.away, coup: COUP })]),
    20261006: listeDuJour([])
  },
  details: {}
});
const publier = (k, dom, ext, fetchedAt) => {
  faux.details[k.id] = pageComposition({ home: k.home, away: k.away, onzeDom: avecIds(dom), onzeExt: avecIds(ext), coup: COUP });
  upsertUpcomingLineup({ fotmobId: String(k.id), date: JOUR, kickoff: COUP, league: null, homeId: null, awayId: null, homeName: k.home[0], awayName: k.away[0], payload: pageDe(dom, ext), fetchedAt }, { database });
};
const claude = await installerClaudeSimule(serveur, { tokens: () => 30_000 });
const passe = async () => {
  const r = await auto.runKickoffPreMatchAnalyses({ limit: 150 });
  return { ok: r.ok, reprises: r.reprises, reprisesEvitees: r.reprisesEvitees, mode: r.mode, appels: claude.appels.length };
};

// Économe : un seul titulaire habituel de Brentford changé → pas de reprise (comptée une fois).
publier(K, onze(3000, { 8: 3050 }), onze(4000), '2026-10-05T12:05:00.000Z');
s.C = { econome1: await passe() };
s.C.econome1bis = await passe();
// Deux titulaires habituels changés → reprise.
publier(K, onze(3000, { 7: 3050, 8: 3051 }), onze(4000), '2026-10-05T12:06:00.000Z');
s.C.econome2 = await passe();
s.C.kickoffRunsK = getByMatchId(K.matchId)?.kickoffRuns ?? null;
// Mode normal (réglage « auto », 30 000 tokens consommés) : un seul habituel de Norwich changé → reprise, comme avant.
ecrire('budget-claude.json', { tokensParJour: 1_000_000, tokensParSemaine: 5_000_000, mode: 'auto', enregistreLe: '2026-10-05T08:10:00.000Z' });
publier(K2, onze(5000, { 8: 5050 }), onze(6000), '2026-10-05T12:07:00.000Z');
s.C.normal1 = await passe();
s.C.kickoffRunsK2 = getByMatchId(K2.matchId)?.kickoffRuns ?? null;
s.C.journal = (lireFichierJournal(serveur, JOUR)?.appels ?? []).map((a) => `${a.type}:${a.match?.home}:${a.mode}`);
s.C.effets = budget.effetsEconome();

console.log(JSON.stringify({ ok: true, ...s }));
