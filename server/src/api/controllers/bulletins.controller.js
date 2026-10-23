/**
 * bulletins.controller.js — le bulletin du jour et le bilan de la semaine vus de l'interface (étape 42 du plan, 22/10/2026).
 * -----------------------------------------------------------------------
 * GET /api/match-ai-analysis/bulletins   LECTURE SEULE : les deux textes écrits par l'IA (data/runtime/ai-bulletins.json, écrit
 *                                        par l'actualisation), leur fiche chiffrée, leur coût en tokens, ce qui empêche d'en
 *                                        écrire un maintenant (heure, interrupteur, déjà fait, essais épuisés), les derniers
 *                                        textes et les règles. Ne lance rien, n'écrit rien, n'appelle jamais Claude. Pas encore
 *                                        de texte : 200, avec la même forme (l'écran garde toute sa structure et dit pourquoi).
 *                                        Fichier illisible : 503, jamais pris pour vide.
 * Aucune route n'écrit un bulletin : ils naissent de l'actualisation, une fois par jour et par semaine, jamais d'un clic.
 * -----------------------------------------------------------------------
 */

import { etatDesBulletins } from '../../core/ai/bulletinService.js';

export function getBulletins(req, res) {
  const r = etatDesBulletins({ maintenant: Date.now() });
  if (r.etat === 'illisible') {
    res.status(503).json({ ...r, error: `Les textes du bulletin sont illisibles pour l’instant : ${String(r.erreur).replace(/\.\s*$/, '')} — rien n’est réécrit tant qu’ils ne se relisent pas.` });
    return;
  }
  res.json(r);
}
