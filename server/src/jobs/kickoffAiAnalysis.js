/**
 * kickoffAiAnalysis.js — l'analyse IA de chaque match environ une heure
 * avant son coup d'envoi, avec la composition qui va jouer et les dernières
 * actualités (demande de Pierre le 01/10/2026).
 * -----------------------------------------------------------------------
 * Boucle à part de l'actualisation complète (toutes les 3 h, bien trop
 * espacée pour viser l'heure qui précède un match), au même rythme que celle
 * des compositions (cf. lineupPrefetch.js) : toutes les 5 min. Le travail est
 * dans autoMatchAiTrigger.js (runKickoffPreMatchAnalyses) ; ici, seulement le
 * rythme, le plafond du jour et le coupe-circuit AUTO_AI_ANALYSIS=false.
 *
 * Une passe peut durer plus de 5 min un samedi chargé (une analyse prend 15 à
 * 30 s) : la suivante ne démarre jamais avant la fin de la précédente, sinon
 * deux passes analyseraient le même match.
 * -----------------------------------------------------------------------
 */

import { env } from '../config/env.js';
import { runKickoffPreMatchAnalyses } from '../core/ai/autoMatchAiTrigger.js';
import { budgetRestant, jourParis } from '../data/repositories/autoAiAnalysisRepository.js';

const MINUTE_MS = 60_000;

let timer = null;
let enCours = false;

/** Une passe, ou `null` si la précédente tourne encore ou si l'analyse automatique est coupée. */
export async function passeCoupDEnvoi() {
  if (enCours || !env.autoAiAnalysis.enabled) return null;
  enCours = true;
  try {
    return await runKickoffPreMatchAnalyses({ limit: budgetRestant(jourParis(), env.autoAiAnalysis.dailyLimit) });
  } finally {
    enCours = false;
  }
}

/** Démarre la boucle. Sans effet si elle tourne déjà. */
export function startKickoffAiAnalysis({ intervalMinutes = 5, startupDelayMinutes = 2 } = {}) {
  if (timer) return false;
  const lancer = async () => {
    try {
      const r = await passeCoupDEnvoi();
      if (!r || r.nonConfigure || (!r.ok && !r.failed && !r.laisses)) return;
      console.log(
        `[ia coup d'envoi] ${r.ok} analyse(s) faite(s)` +
          (r.ok ? ` (${r.avecCompo} avec la composition${r.reprises ? `, ${r.reprises} refaite(s) après un changement de composition` : ''})` : '') +
          (r.failed ? `, ${r.failed} échec(s) : ${r.samples.join(' ; ')}` : '') +
          (r.laisses ? `, ${r.laisses} match(s) sans analyse : plafond du jour atteint` : '') +
          (r.interrompu ? " — arrêt après plusieurs pannes de Claude Code d'affilée" : '') +
          '.'
      );
    } catch (error) {
      console.error(`[ia coup d'envoi] passe en échec : ${error.message}`);
    }
  };
  setTimeout(() => {
    lancer();
    timer = setInterval(lancer, intervalMinutes * MINUTE_MS);
    timer.unref?.();
  }, startupDelayMinutes * MINUTE_MS).unref?.();
  return true;
}

export function stopKickoffAiAnalysis() {
  clearInterval(timer);
  timer = null;
}
