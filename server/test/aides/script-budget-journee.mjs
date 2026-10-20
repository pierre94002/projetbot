/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-budget-journee.mjs <serveur de la copie>
 *
 * Étape 4 — UNE JOURNÉE SIMULÉE, avec les vraies fonctions de l'appli (passe
 * d'avant coup d'envoi, étape d'actualisation des analyses d'avance et des
 * revues avec son plafond et sa réserve, contrôleur des clics) et un budget
 * réglé bas (187 500 tokens par jour : économe à 150 000) :
 *   1. coup d'envoi : 2 analyses (mode normal) ;
 *   2. le onze d'un match change : reprise (mode normal, au moindre changement) ;
 *   3. un clic avant-match ;
 *   4. analyses d'avance : la passe franchit les 80 % après la première ;
 *      les non-favoris suivants sont laissés, le favori passe ;
 *   5. revues en mode économe : le favori d'abord — en échec (réponse en
 *      erreur), puis l'autre ;
 *   6. le onze de l'autre match change, sans titulaire habituel touché :
 *      reprise évitée (mode économe) ;
 *   7. un clic après-match.
 * À la fin, le compteur du plafond et le journal tombent juste. Claude
 * SIMULÉ (30 000 tokens par appel), FotMob SIMULÉ. Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import { installerClaudeSimule, importeur, recopierScripts, reponseFactice, pageComposition, onzeFictif, lireFichierJournal } from './claudeSimule.mjs';
import { rencontre, listeDuJour, installerFauxFetch } from './fotmobSimule.mjs';

const [serveur] = process.argv.slice(2);
const imp = importeur(serveur);
recopierScripts(serveur);
const RUNTIME = path.join(serveur, 'data', 'runtime');
const ecrire = (nom, contenu) => fs.writeFileSync(path.join(RUNTIME, nom), JSON.stringify(contenu, null, 1));

const { resolveDbPath, openDb, upsertUpcomingLineup } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error('Base inattendue');
const database = openDb();

const JOUR = '2026-10-05';
const COUP = '2026-10-05T12:30:00.000Z';

// ------------------------------------------------------------- le décor
ecrire('favorites.json', { teams: [], leagues: [{ name: 'EPL', addedAt: '2026-10-03T18:14:00.741Z' }] });
ecrire('budget-claude.json', { tokensParJour: 187_500, tokensParSemaine: 5_000_000, mode: 'auto', enregistreLe: '2026-10-05T08:00:00.000Z' });
ecrire('season-calendar.json', [
  // Aujourd'hui (heure de FotMob : 12 h 30 UTC) — analyses d'avant coup d'envoi.
  { league: 'EPL', homeName: 'Brentford', awayName: 'Fulham', date: JOUR },
  { league: 'Championship', homeName: 'Norwich', awayName: 'Wrexham', date: JOUR },
  // Demain — analyses d'avance, dans l'ordre où elles passent.
  { league: 'Championship', homeName: 'Watford', awayName: 'West Brom', date: '2026-10-06' },
  { league: 'Championship', homeName: 'Birmingham', awayName: 'Sheffield United', date: '2026-10-06' },
  { league: 'MLS', homeName: 'Inter Miami CF', awayName: 'Colorado Rapids', date: '2026-10-06' },
  { league: 'MLS', homeName: 'DC United', awayName: 'Vancouver Whitecaps', date: '2026-10-06' },
  { league: 'EPL', homeName: 'Everton', awayName: 'Tottenham', date: '2026-10-06' },
  { league: 'MLS', homeName: 'Portland Timbers', awayName: 'Real Salt Lake', date: '2026-10-06' }
]);
// Deux matchs joués, avec leur analyse d'avant-match (sans revue) : l'un d'EPL (favori), l'autre non.
const prior = (matchId, homeName, awayName, league, jour) => ({
  matchId,
  homeName,
  awayName,
  league,
  commenceTime: `${jour}T14:00:00.000Z`,
  model: 'claude-code:sonnet',
  timing: 'coup-d-envoi',
  analysedAt: `${jour}T13:10:00.000Z`,
  createdAt: `${jour}T13:10:00.000Z`,
  engineSnapshot: { marketPredictions: [{ marketId: 'result', params: {}, market: 'Résultat', predictedOutcome: 'home', predictedLabel: homeName, predictedOdds: 2.1, minOdds: 1.2 }] },
  analysis: { summary: 'Analyse d’essai.', marketViews: [] }
});
ecrire('match-ai-analyses.json', [
  prior('cal-2026-10-03-Blackburn-West Ham', 'Blackburn', 'West Ham', 'Championship', '2026-10-03'),
  prior('cal-2026-10-04-Leeds-Newcastle', 'Leeds', 'Newcastle', 'EPL', '2026-10-04')
]);
const inserer = database.prepare('INSERT INTO matches (match_key, match_id, date, league, home_name, away_name, home_goals, away_goals) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
inserer.run('essai-2026-10-03-blackburn-westham', 'essai-1', '2026-10-03', 'Championship', 'Blackburn', 'West Ham', 1, 1);
inserer.run('essai-2026-10-04-leeds-newcastle', 'essai-2', '2026-10-04', 'EPL', 'Leeds', 'Newcastle', 2, 1);
ecrire('match-results.json', [{ matchId: 'clic-man-city-everton', homeName: 'Man City', awayName: 'Everton', homeGoals: 3, awayGoals: 1, league: 'EPL' }]);

// FotMob : la liste d'aujourd'hui (les deux matchs à 12 h 30) et leurs compositions.
const K1 = { id: 4900101, home: ['Brentford', 9937], away: ['Fulham', 9879] };
const K2 = { id: 4900102, home: ['Norwich', 9850], away: ['Wrexham', 9841] };
const faux = installerFauxFetch({
  listes: {
    // Les jours voisins aussi (vides) : un jour absent répondrait 404, retenté deux fois (1,8 s chacun).
    20261003: listeDuJour([]),
    20261004: listeDuJour([]),
    20261005: listeDuJour([rencontre({ id: K1.id, home: K1.home, away: K1.away, coup: COUP }), rencontre({ id: K2.id, home: K2.home, away: K2.away, coup: COUP })]),
    20261006: listeDuJour([]),
    20261007: listeDuJour([])
  },
  details: {
    [K1.id]: pageComposition({ home: K1.home, away: K1.away, onzeDom: onzeFictif(7100, 'Brentford'), onzeExt: onzeFictif(7200, 'Fulham'), coup: COUP }),
    [K2.id]: pageComposition({ home: K2.home, away: K2.away, onzeDom: onzeFictif(7300, 'Norwich'), onzeExt: onzeFictif(7400, 'Wrexham'), coup: COUP })
  }
});

const claude = await installerClaudeSimule(serveur, { tokens: () => 30_000 });
const auto = await imp('core/ai/autoMatchAiTrigger.js');
const { __testing: refresh } = await imp('jobs/matchStatsAutoRefresh.js');
const { budgetRestant, statutDuJour } = await imp('data/repositories/autoAiAnalysisRepository.js');
const { env } = await imp('config/env.js');
const budget = await imp('core/ai/claudeBudget.js');
const controleur = await imp('api/controllers/matchAiAnalysis.controller.js');
const { getByMatchId, listAll } = await imp('data/repositories/matchAiAnalysisRepository.js');

const plafond = env.autoAiAnalysis.dailyLimit;
const compteur = () => statutDuJour(JOUR);
const tokensDuJour = () => budget.consommation().aujourdhui.tokens.total;
const passeCoupDEnvoi = () => auto.runKickoffPreMatchAnalyses({ limit: budgetRestant(JOUR, plafond) });
const etape = (cle, lancer, usage, candidats, faits) => refresh.passeIaAuto({ ecrit: false }, { lancer, usage, candidats, faits });
const bilan = (r) => {
  const { samples, ...reste } = r;
  return { ...reste, samples: samples?.length ?? 0 };
};
const s = { plafond, journee: [] };
const noter = (quoi, r) => s.journee.push({ quoi, mode: budget.modeBudget().mode, tokens: tokensDuJour(), compteur: compteur().count, appels: claude.appels.length, ...(r ? { r } : {}) });

// 1. Coup d'envoi : les deux matchs, compositions publiées.
noter('1. coup d’envoi', bilan(await passeCoupDEnvoi()));

// 2. Le onze de Brentford change (relu par la boucle des compositions 5 min plus tard) : reprise, en mode normal.
const nouveauOnze = [[7100, 'Brentford 1'], [7101, 'Brentford 2'], [7150, 'Brentford remplaçant A'], ...onzeFictif(7100, 'Brentford').slice(3)];
faux.details[K1.id] = pageComposition({ home: K1.home, away: K1.away, onzeDom: nouveauOnze, onzeExt: onzeFictif(7200, 'Fulham'), coup: COUP });
const { fetchProbableLineup: lireCompo } = await imp('data/providers/fotMobProvider.js');
upsertUpcomingLineup({ fotmobId: K1.id, date: JOUR, kickoff: COUP, league: 'EPL', homeId: 'fotmob-9937', awayId: 'fotmob-9879', homeName: 'Brentford', awayName: 'Fulham', payload: await lireCompo(K1.id), fetchedAt: '2026-10-05T12:05:00.000Z' }, { database });
noter('2. reprise après changement de onze', bilan(await passeCoupDEnvoi()));

// 3. Un clic avant-match (hors plafond).
const res3 = reponseFactice();
await controleur.postPreMatch(
  { params: { matchId: 'clic-man-city-everton' }, body: { home: 'Man City', away: 'Everton', league: 'EPL', engineResult: { label: 'essai', marketPredictions: [] } } },
  res3
);
noter('3. clic avant-match', { code: res3.code });

// 4. Les analyses d'avance (étape de l'actualisation) : la passe franchit les 80 % après la première.
noter(
  '4. analyses d’avance',
  bilan(await etape('iaAutoAvantMatch', auto.runAutoPreMatchAnalyses, (ok, skipped) => ({ preMatch: ok, skippedPreMatch: skipped }), ['rencontre à venir', 'rencontres à venir'], ['analysée', 'analysées']))
);

// 5. Les revues, en mode économe : le favori d'abord, et sa réponse revient en erreur.
claude.prochain('erreur');
noter(
  '5. revues',
  bilan(await etape('iaAutoApresMatch', auto.runAutoPostMatchReviews, (ok, skipped) => ({ postMatch: ok, skippedPostMatch: skipped }), ['rencontre terminée', 'rencontres terminées'], ['revue faite', 'revues faites']))
);

// 6. Le onze de Norwich change sans toucher de titulaire habituel : reprise évitée (mode économe).
const pageK2 = pageComposition({ home: K2.home, away: K2.away, onzeDom: [[7399, 'Norwich nouveau'], ...onzeFictif(7300, 'Norwich').slice(1)], onzeExt: onzeFictif(7400, 'Wrexham'), coup: COUP });
faux.details[K2.id] = pageK2;
upsertUpcomingLineup({ fotmobId: K2.id, date: JOUR, kickoff: COUP, league: 'Championship', homeId: 'fotmob-9850', awayId: 'fotmob-9841', homeName: 'Norwich', awayName: 'Wrexham', payload: await lireCompo(K2.id), fetchedAt: '2026-10-05T12:06:00.000Z' }, { database });
noter('6. onze changé en mode économe', bilan(await passeCoupDEnvoi()));
noter('6b. la boucle repasse', bilan(await passeCoupDEnvoi()));

// 7. Un clic après-match.
const res7 = reponseFactice();
await controleur.postPostMatch({ params: { matchId: 'clic-man-city-everton' } }, res7);
noter('7. clic après-match', { code: res7.code });

// ------------------------------------------------------------- le bilan
const journal = lireFichierJournal(serveur, JOUR);
const AUTOMATIQUES = ['avance', 'coup-d-envoi', 'reprise', 'revue'];
s.compteur = compteur();
s.journal = {
  lignes: journal.appels.length,
  automatiquesReussis: journal.appels.filter((a) => a.statut === 'ok' && AUTOMATIQUES.includes(a.type)).length,
  suite: journal.appels.map((a) => `${a.type}:${a.statut}:${a.match?.home ?? '?'}:${a.mode ?? '-'}`),
  tokens: journal.totaux.tokens.total,
  parType: Object.fromEntries(Object.entries(journal.totaux.parType).map(([t, b]) => [t, { appels: b.appels, ok: b.ok, echecs: b.echecs, tokens: b.tokens.total }]))
};
// Ce que le fichier des analyses garde d'aujourd'hui (usage d'avant-match et de revue) : moins que le journal.
const usages = listAll().flatMap((e) => [
  e.usage && String(e.analysedAt ?? '').startsWith(JOUR) ? 1 : 0,
  e.postMatchReview?.usage && String(e.postMatchReview.createdAt ?? '').startsWith(JOUR) ? 1 : 0
]);
s.fichierAnalyses = { usagesDuJour: usages.reduce((a, b) => a + b, 0), brentfordKickoffRuns: getByMatchId('cal-2026-10-05-Brentford-Fulham')?.kickoffRuns ?? null };
const etat = budget.etatBudgetClaude();
s.etat = {
  coherence: etat.coherence,
  mode: etat.mode.mode,
  declencheurs: etat.mode.declencheurs.map((d) => d.cle),
  aujourdhui: { tokens: etat.aujourdhui.tokens.total, appels: etat.aujourdhui.appels, echecs: etat.aujourdhui.echecs, part: etat.aujourdhui.part },
  effets: etat.effets,
  plafond: etat.plafond,
  derniers: etat.derniersAppels.length
};
s.simules = claude.appels.map((a) => `${a.type}:${a.genre}:${a.match?.home ?? '?'}`);
s.reseauFotmob = faux.appels.filter((u) => !u.includes('/matches?date=') && !u.includes('/matchDetails')).length;

console.log(JSON.stringify({ ok: true, ...s }));
