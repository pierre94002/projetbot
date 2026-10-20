/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-fiche-reglage.mjs <serveur de la copie>
 *
 * Étape 41 — LE RÉGLAGE ET LE DRAPEAU : la forme en vigueur (fiche compacte
 * par défaut, AI_ANALYSIS_FICHE=ancienne pour revenir à l'ancienne, lu par
 * config/env.js), le drapeau `compactage` de la politique du budget (étape 4)
 * en mode normal comme en économe, l'essai sans mise en cache toujours éteint ;
 * un avant-match sans paramètre suit le réglage, un paramètre `fiche` l'emporte ;
 * le coût moyen d'une analyse par forme, lu dans un journal FABRIQUÉ (semaine
 * du 28/09 au 04/10/2026). Claude simulé, FotMob simulé. Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import { importeur, lireFichierJournal } from './claudeSimule.mjs';
import { installerFauxFetch, listeDuJour } from './fotmobSimule.mjs';

const [serveur] = process.argv.slice(2);
const imp = importeur(serveur);
const { env } = await imp('config/env.js');
if (env.claudeCode.oauthToken) throw new Error('Un jeton Claude est présent : refus.');
if (env.claudeCode.bin && fs.existsSync(env.claudeCode.bin)) throw new Error('L’exécutable Claude configuré existe : refus.');
const cc = await imp('core/ai/claudeCodeClient.js');
const service = await imp('core/ai/matchAiAnalysisService.js');
const budget = await imp('core/ai/claudeBudget.js');
const { getByMatchId } = await imp('data/repositories/matchAiAnalysisRepository.js');
installerFauxFetch({ listes: Object.fromEntries(['20261004', '20261005', '20261006', '20261007'].map((j) => [j, listeDuJour([])])) });

const recus = [];
cc.__testing.simulerClaude(async ({ args, userMessage }) => {
  recus.push({ system: args[args.indexOf('--system-prompt') + 1], user: userMessage });
  return { is_error: false, structured_output: { summary: 's', keyFactors: [], alignmentWithModel: 'a', marketViews: [] }, usage: { input_tokens: 2, cache_creation_input_tokens: 100, cache_read_input_tokens: 0, output_tokens: 50 }, total_cost_usd: 0.001 };
});

const moteur = (home) => ({
  label: 'essai',
  commenceTime: '2026-10-06T19:00:00.000Z',
  marketPredictions: [{ marketId: 'result', params: { outcome: 'home' }, market: 'Résultat', predictedOutcome: 'home', predictedLabel: `${home} gagne`, predictedOdds: 1.8, minOdds: 1.2 }]
});
const analyser = async (matchId, home, away, fiche) => {
  await service.runPreMatchAnalysis({ matchId, home, away, league: 'EPL', engineResult: moteur(home), sansRepliPayant: true, appel: { type: 'avance', mode: 'normal' }, ...(fiche ? { fiche } : {}) });
  const r = recus.at(-1);
  return { compacte: r.user.startsWith('#'), consignesAvecEquipes: r.system.includes(home) && r.system.includes(away), ficheEnregistree: getByMatchId(matchId)?.fiche ?? null };
};

const s = {
  reglage: env.ficheIa,
  politique: { normal: budget.politiqueBudget(false), econome: budget.politiqueBudget(true) },
  modeDuMoment: budget.modeBudget().politique.compactage,
  sansParametre: await analyser('reglage-1', 'Fulham', 'Leeds', null),
  forceeCompacte: await analyser('reglage-2', 'Everton', 'Brighton', 'compacte'),
  forceeAncienne: await analyser('reglage-3', 'Newcastle', 'Bournemouth', 'ancienne'),
  valeurInconnue: await analyser('reglage-4', 'Man City', "Nott'm Forest", 'moyenne')
};
s.journal = (lireFichierJournal(serveur, '2026-10-05')?.appels ?? []).map((a) => ({ match: a.match?.matchId, fiche: a.fiche, taille: a.taille }));

// ---------------------------------------- le coût moyen par forme, sur un journal FABRIQUÉ
const dossier = path.join(serveur, 'data', 'runtime', 'journal-claude');
fs.mkdirSync(dossier, { recursive: true });
let n = 0;
const ligne = (jour, type, { detail = null, fiche = null, total = null, statut = 'ok', taille = null } = {}) => {
  const tokens = total === null ? null : { entree: 2, ecritureCache: Math.round(total * 0.6), lectureCache: Math.round(total * 0.2), sortie: 0, total };
  if (tokens) tokens.sortie = total - tokens.entree - tokens.ecritureCache - tokens.lectureCache;
  return { id: `essai-${++n}`, at: `${jour}T10:00:00.000Z`, jour, canal: 'claude-code', type, detail, match: null, mode: 'normal', ...(fiche ? { fiche } : {}), ...(taille ? { taille } : {}), modele: 'claude-code:sonnet', statut, erreur: null, tokens, equivalentApiUsd: 0.01 };
};
const ecrire = (jour, appels) => fs.writeFileSync(path.join(dossier, `${jour}.json`), JSON.stringify({ version: 1, jour, canal: 'claude-code', majLe: `${jour}T23:00:00.000Z`, appels }));
// La semaine d'AVANT (dimanche 27/09) et un jour APRÈS le « maintenant » (jeudi 01/10) : jamais comptés.
ecrire('2026-09-27', [ligne('2026-09-27', 'coup-d-envoi', { total: 999_000 })]);
ecrire('2026-10-01', [ligne('2026-10-01', 'revue', { fiche: 'compacte', total: 888_000 })]);
ecrire('2026-09-28', [
  ligne('2026-09-28', 'coup-d-envoi', { total: 24_000 }),
  ligne('2026-09-28', 'revue', { total: 12_000 }),
  ligne('2026-09-28', 'autre', { total: 50_000 }),
  ligne('2026-09-28', 'manuel', { detail: 'avant-match', fiche: 'compacte', total: 16_000 })
]);
ecrire('2026-09-30', [
  ligne('2026-09-30', 'coup-d-envoi', { fiche: 'compacte', total: 15_000, taille: { consignes: 6559, message: 13000 } }),
  ligne('2026-09-30', 'reprise', { fiche: 'compacte', total: 17_000, statut: 'echec' }),
  ligne('2026-09-30', 'avance', { fiche: 'compacte', total: null, statut: 'echec' }),
  ligne('2026-09-30', 'revue', { fiche: 'compacte', total: 9_000, taille: { consignes: 1943, message: 8000 } }),
  ligne('2026-09-30', 'manuel', { detail: 'après-match', fiche: 'ancienne', total: 11_000 })
]);
s.cout = budget.coutMoyenParForme({ maintenant: Date.parse('2026-09-30T12:00:00.000Z') });
s.etat = budget.etatBudgetClaude().coutParForme;
console.log(JSON.stringify({ ok: true, ...s }));
