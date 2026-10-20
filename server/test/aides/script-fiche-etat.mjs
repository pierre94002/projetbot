/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-fiche-etat.mjs <serveur de la copie>
 *
 * Étape 41 — l'état COMPLET que lit la carte « Budget Claude » (GET
 * /api/claude-budget, etatBudgetClaude du serveur), sur un journal FABRIQUÉ
 * de la semaine (lundi 05/10/2026, heure figée) : des analyses d'avant-match
 * et des revues dans les deux formes. Aucun appel à Claude. Sortie : une ligne
 * JSON (l'état, pour le rendu de la carte dans ficheCompacteEcran.test.mjs).
 */

import fs from 'node:fs';
import path from 'node:path';
import { importeur } from './claudeSimule.mjs';

const [serveur] = process.argv.slice(2);
const imp = importeur(serveur);
const budget = await imp('core/ai/claudeBudget.js');

const JOUR = '2026-10-05';
const dossier = path.join(serveur, 'data', 'runtime', 'journal-claude');
fs.mkdirSync(dossier, { recursive: true });
let n = 0;
const ligne = (type, { detail = null, fiche = null, total, statut = 'ok', taille = null }) => {
  const tokens = { entree: 2, ecritureCache: Math.round(total * 0.55), lectureCache: Math.round(total * 0.25), sortie: 0, total };
  tokens.sortie = total - tokens.entree - tokens.ecritureCache - tokens.lectureCache;
  return {
    id: `essai-${++n}`,
    at: `${JOUR}T0${n}:00:00.000Z`,
    jour: JOUR,
    canal: 'claude-code',
    type,
    detail,
    match: { matchId: `m${n}`, home: `Domicile ${n}`, away: `Extérieur ${n}`, league: 'EPL' },
    mode: 'normal',
    ...(fiche ? { fiche } : {}),
    ...(taille ? { taille } : {}),
    modele: 'claude-code:sonnet',
    statut,
    erreur: statut === 'ok' ? null : 'schéma non respecté',
    tokens,
    equivalentApiUsd: 0.05
  };
};
fs.writeFileSync(
  path.join(dossier, `${JOUR}.json`),
  JSON.stringify({
    version: 1,
    jour: JOUR,
    canal: 'claude-code',
    majLe: `${JOUR}T09:00:00.000Z`,
    appels: [
      ligne('coup-d-envoi', { total: 24_400 }),
      ligne('revue', { total: 10_800 }),
      ligne('coup-d-envoi', { fiche: 'compacte', total: 16_800, taille: { consignes: 6612, message: 13421 } }),
      ligne('reprise', { fiche: 'compacte', total: 15_200, taille: { consignes: 6612, message: 13020 } }),
      ligne('revue', { fiche: 'compacte', total: 9_400, taille: { consignes: 1997, message: 8459 } })
    ]
  })
);
console.log(JSON.stringify({ ok: true, etat: budget.etatBudgetClaude() }));
