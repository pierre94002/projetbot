/**
 * health.controller.js — le contrôle quotidien et la santé des sources (étape 14 du plan).
 * -----------------------------------------------------------------------
 * GET /api/health/checks         le feu, les contrôles (en échec d'abord) et
 *                                leurs constats, les sources — l'état gardé
 *                                par la dernière passe, constats re-datés et
 *                                sources relues maintenant ; rien n'est lancé
 * GET /api/health/sources        les six lignes de la santé des sources
 *                                (lues dans les notes : jamais un appel réseau)
 * PUT /api/health/jeton-claude   { expireLe: 'AAAA-MM-JJ' } : la date
 *                                d'expiration du jeton Claude, saisie par
 *                                Pierre (data/runtime/jeton-claude.json) ;
 *                                idempotent
 * (GET /api/health, sans rien derrière, reste le « l'API répond » d'avant.)
 * -----------------------------------------------------------------------
 */

import { lireLeControle } from '../../data/controleQuotidien.js';
import { etatDesSources } from '../../data/sourceHealth.js';
import { enregistrerJetonClaude } from '../../data/repositories/jetonClaudeRepository.js';
import { ApiError } from '../middlewares/errorHandler.js';

export function getHealthChecks(req, res) {
  res.json(lireLeControle());
}

export function getHealthSources(req, res) {
  res.json(etatDesSources());
}

export function putJetonClaude(req, res) {
  const r = enregistrerJetonClaude(req.body ?? null);
  if (!r.ok) throw new ApiError(r.code, r.erreur);
  res.json({ change: r.change, reglage: r.reglage, sources: etatDesSources() });
}
