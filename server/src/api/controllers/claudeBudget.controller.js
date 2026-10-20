/**
 * claudeBudget.controller.js — le budget Claude vu de l'interface (étape 4 du plan).
 * -----------------------------------------------------------------------
 * GET /api/claude-budget            LECTURE SEULE : l'état préparé (journal
 *                                   des appels tenu à chaque appel, réglage,
 *                                   compteur du plafond) — tokens du jour et de
 *                                   la semaine face au budget, par type, le
 *                                   mode (normal / économe) et pourquoi, le
 *                                   plafond de 150 rappelé. Ne lance rien,
 *                                   n'écrit rien. Gardé 15 s (`?force=1` relit).
 * PUT /api/claude-budget/reglage    { tokensParJour, tokensParSemaine, mode }
 *                                   enregistre le budget choisi par Pierre
 *                                   (data/runtime/budget-claude.json, jamais
 *                                   server/.env) ; idempotent : les mêmes
 *                                   valeurs ne réécrivent rien. Renvoie l'état
 *                                   complet. Une demande refusée répond 400.
 * Aucune route ne touche au plafond quotidien des analyses automatiques.
 * -----------------------------------------------------------------------
 */

import { etatBudgetClaude } from '../../core/ai/claudeBudget.js';
import { enregistrerReglageBudget, BudgetInvalide } from '../../data/repositories/claudeBudgetRepository.js';
import { ApiError } from '../middlewares/errorHandler.js';

const CACHE_MS = 15_000;
let cache = { at: 0, valeur: null };

export function getClaudeBudget(req, res) {
  const maintenant = Date.now();
  if (!cache.valeur || maintenant - cache.at >= CACHE_MS || req.query.force === '1') {
    cache = { at: maintenant, valeur: etatBudgetClaude({ maintenant }) };
  }
  res.json(cache.valeur);
}

export function putClaudeBudgetSetting(req, res) {
  const { tokensParJour, tokensParSemaine, mode } = req.body ?? {};
  let r;
  try {
    r = enregistrerReglageBudget({ tokensParJour, tokensParSemaine, mode });
  } catch (error) {
    if (error instanceof BudgetInvalide) throw new ApiError(400, error.message);
    throw error;
  }
  const maintenant = Date.now();
  cache = { at: maintenant, valeur: etatBudgetClaude({ maintenant }) };
  res.json({ ...cache.valeur, enregistrement: { change: r.change, fichier: r.fichier, misDeCote: r.misDeCote ?? null } });
}
