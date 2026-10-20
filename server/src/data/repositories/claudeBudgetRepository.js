/**
 * claudeBudgetRepository.js — le budget Claude de l'appli, choisi par Pierre (étape 4 du plan).
 * -----------------------------------------------------------------------
 * data/runtime/budget-claude.json :
 *   { tokensParJour, tokensParSemaine, mode: 'auto' | 'econome', enregistreLe }
 * Un réglage NON SECRET, enregistré depuis Réglages › Budget Claude
 * (PUT /api/claude-budget/reglage, idempotent : les mêmes valeurs ne
 * réécrivent rien). Jamais dans server/.env.
 *
 * Tant que rien n'est enregistré : les valeurs PROVISOIRES (1 200 000 tokens
 * par jour, 6 000 000 par semaine), choisies au-dessus du volume mesuré pour
 * ne rien changer au fonctionnement — le mode économe (80 %) n'arrive qu'à
 * 960 000 tokens dans la journée ou 4 800 000 dans la semaine —, et affichées
 * « réglage provisoire, à confirmer ». Enregistrer — même ces valeurs — les
 * confirme.
 *
 * `mode` : « auto » = mode économe à 80 % du budget du jour ou de la semaine
 * (cf. core/ai/claudeBudget.js) ; « econome » = mode économe tout le temps,
 * choisi par Pierre. Aucun choix ne coupe le mode économe automatique.
 *
 * Un fichier illisible n'est jamais écrasé en silence : les valeurs
 * provisoires s'appliquent, l'état le dit, et le prochain enregistrement le
 * met de côté (renommé, jamais supprimé) avant d'écrire.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonFile, writeJsonAtomic } from '../../utils/atomicJson.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const FICHIER_BUDGET = path.resolve(__dirname, '../../../data/runtime/budget-claude.json');

/**
 * Valeurs provisoires, à confirmer par Pierre : au-dessus du volume mesuré
 * (usage gardé dans match-ai-analyses.json : ~0,76 M le 03/10/2026 ; ~0,62 M le
 * 04/10 plus une dizaine d'appels que le fichier perdait, soit ~0,85 M ;
 * semaine du 28/09 : ~1,8 M gardés). Le mode économe (80 %) ne se déclenche
 * qu'à 960 000 tokens par jour ou 4 800 000 par semaine : rien ne change à ce
 * volume.
 */
export const BUDGET_PROVISOIRE = Object.freeze({ tokensParJour: 1_200_000, tokensParSemaine: 6_000_000, mode: 'auto' });
export const MODES_BUDGET = Object.freeze(['auto', 'econome']);
export const BORNES_BUDGET = Object.freeze({ min: 10_000, max: 1_000_000_000 });

/** Une demande refusée (400), à distinguer d'une panne (500 : disque, fichier tenu). */
export class BudgetInvalide extends Error {}

const nombre = (n) => Number(n).toLocaleString('fr-FR');

function entierBorne(valeur, nom) {
  if (typeof valeur !== 'number' || !Number.isInteger(valeur)) throw new BudgetInvalide(`« ${nom} » doit être un nombre entier de tokens.`);
  if (valeur < BORNES_BUDGET.min || valeur > BORNES_BUDGET.max) {
    throw new BudgetInvalide(`« ${nom} » doit être entre ${nombre(BORNES_BUDGET.min)} et ${nombre(BORNES_BUDGET.max)} tokens.`);
  }
  return valeur;
}

/** Contrôle une demande complète : les deux budgets et le mode. Lève BudgetInvalide sinon. */
export function validerBudget(demande) {
  if (!demande || typeof demande !== 'object') throw new BudgetInvalide('Corps attendu : { tokensParJour, tokensParSemaine, mode }.');
  const tokensParJour = entierBorne(demande.tokensParJour, 'tokensParJour');
  const tokensParSemaine = entierBorne(demande.tokensParSemaine, 'tokensParSemaine');
  if (tokensParSemaine < tokensParJour) {
    throw new BudgetInvalide(`Le budget de la semaine (${nombre(tokensParSemaine)}) doit être au moins celui d'un jour (${nombre(tokensParJour)}).`);
  }
  if (!MODES_BUDGET.includes(demande.mode)) throw new BudgetInvalide('« mode » vaut « auto » (économe à 80 % du budget) ou « econome » (tout le temps).');
  return { tokensParJour, tokensParSemaine, mode: demande.mode };
}

/**
 * Le réglage en vigueur : { tokensParJour, tokensParSemaine, mode, provisoire,
 * source: 'defaut' | 'enregistre' | 'illisible', fichier, enregistreLe, probleme? }.
 */
export function lireReglageBudget() {
  const provisoire = (source, probleme = null) => ({ ...BUDGET_PROVISOIRE, provisoire: true, source, fichier: FICHIER_BUDGET, enregistreLe: null, ...(probleme ? { probleme } : {}) });
  let brut;
  try {
    brut = readJsonFile(FICHIER_BUDGET, null);
  } catch (error) {
    return provisoire('illisible', error.message);
  }
  if (brut === null) return provisoire('defaut');
  try {
    const v = validerBudget(brut);
    return { ...v, provisoire: false, source: 'enregistre', fichier: FICHIER_BUDGET, enregistreLe: brut.enregistreLe ?? null };
  } catch (error) {
    return provisoire('illisible', `forme inattendue (${error.message})`);
  }
}

/**
 * Enregistre le budget voulu. Idempotent : les mêmes valeurs que celles déjà
 * enregistrées ne réécrivent rien (`change: false`). Lève BudgetInvalide pour
 * une demande refusée.
 * @returns {{ change: boolean, fichier: string, reglage: object, misDeCote?: string }}
 */
export function enregistrerReglageBudget(demande) {
  const voulu = validerBudget(demande);
  const actuel = lireReglageBudget();
  if (actuel.source === 'enregistre' && actuel.tokensParJour === voulu.tokensParJour && actuel.tokensParSemaine === voulu.tokensParSemaine && actuel.mode === voulu.mode) {
    return { change: false, fichier: FICHIER_BUDGET, reglage: actuel };
  }
  let misDeCote;
  if (actuel.source === 'illisible' && fs.existsSync(FICHIER_BUDGET)) {
    misDeCote = FICHIER_BUDGET.replace(/\.json$/, `.illisible-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.renameSync(FICHIER_BUDGET, misDeCote);
  }
  writeJsonAtomic(FICHIER_BUDGET, { ...voulu, enregistreLe: new Date().toISOString() });
  return { change: true, fichier: FICHIER_BUDGET, reglage: lireReglageBudget(), ...(misDeCote ? { misDeCote } : {}) };
}
