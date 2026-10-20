/**
 * jetonClaudeRepository.js — la date d'expiration du jeton Claude, saisie par Pierre.
 * -----------------------------------------------------------------------
 * Étape 14 du plan (07/10/2026), santé des sources. Le jeton longue durée de
 * Claude Code (CLAUDE_CODE_OAUTH_TOKEN, créé par `claude setup-token`) dure
 * un an, et rien ne le dit à l'appli : ni le CLI, ni le jeton lui-même. La
 * date est donc un RÉGLAGE que Pierre saisit (Réglages › Santé des sources),
 * gardé dans data/runtime/jeton-claude.json — jamais lue dans server/.env,
 * qui n'est jamais lu ni copié par ce module.
 *
 * Sans réglage enregistré : le 30/09/2027, la date notée à la création du
 * jeton (un an après le 30/09/2026), marquée « à confirmer ».
 *
 * Écriture d'un bloc (utils/atomicJson.js, data/runtime est sous OneDrive) ;
 * idempotente (la même date ne réécrit rien) ; un fichier présent mais
 * illisible n'est jamais pris pour « pas de réglage » ni écrasé en silence.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonFile, writeJsonAtomic } from '../../utils/atomicJson.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const FICHIER_JETON_CLAUDE = path.resolve(__dirname, '../../../data/runtime/jeton-claude.json');
export const VERSION_JETON = 1;
/** La date notée à la création du jeton (memory du projet : « jeton expire ~30/09/2027 »). */
export const EXPIRATION_PAR_DEFAUT = '2027-09-30';
/** Les dates acceptées : un jeton dure un an ; au-delà, une faute de frappe. */
const BORNES = ['2026-01-01', '2030-12-31'];

/** « AAAA-MM-JJ » d'un jour qui existe, entre les bornes ; null sinon. */
export function dateValide(texte) {
  const t = String(texte ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  if (new Date(`${t}T12:00:00Z`).toISOString().slice(0, 10) !== t) return null;
  if (t < BORNES[0] || t > BORNES[1]) return null;
  return t;
}

/**
 * Le réglage : { source: 'defaut' | 'enregistre' | 'illisible', expireLe,
 * aConfirmer, majLe, fichier, probleme? }. Un fichier illisible garde la date
 * par défaut À CONFIRMER et le dit (jamais pris pour « pas de réglage »).
 */
export function lireJetonClaude({ fichier = FICHIER_JETON_CLAUDE } = {}) {
  const defaut = { expireLe: EXPIRATION_PAR_DEFAUT, aConfirmer: true, majLe: null, fichier };
  let brut;
  try {
    brut = readJsonFile(fichier, null);
  } catch (error) {
    return { ...defaut, source: 'illisible', probleme: error.message };
  }
  if (brut === null) return { ...defaut, source: 'defaut' };
  const expireLe = dateValide(brut?.expireLe);
  if (!brut || typeof brut !== 'object' || Array.isArray(brut) || !expireLe) {
    return { ...defaut, source: 'illisible', probleme: 'forme inattendue (pas de date « expireLe » valable)' };
  }
  return { source: 'enregistre', expireLe, aConfirmer: false, majLe: brut.majLe ?? null, fichier };
}

/**
 * Enregistre la date saisie. Rend { ok: true, change, reglage } ou
 * { ok: false, code: 400 | 503, erreur } — rien n'est écrit en cas de refus.
 */
export function enregistrerJetonClaude(entree, { fichier = FICHIER_JETON_CLAUDE, maintenant = new Date() } = {}) {
  const champs = entree && typeof entree === 'object' && !Array.isArray(entree) ? Object.keys(entree) : null;
  if (!champs || champs.some((c) => c !== 'expireLe')) {
    return { ok: false, code: 400, erreur: 'Seule la date d’expiration (« expireLe », AAAA-MM-JJ) se règle ici.' };
  }
  const expireLe = dateValide(entree.expireLe);
  if (!expireLe) return { ok: false, code: 400, erreur: `Date invalide : « ${String(entree.expireLe ?? '').slice(0, 20)} » (AAAA-MM-JJ, entre ${BORNES[0]} et ${BORNES[1]}).` };
  const avant = lireJetonClaude({ fichier });
  if (avant.source === 'illisible' && fs.existsSync(fichier)) {
    return { ok: false, code: 503, erreur: `Le réglage enregistré est illisible (${avant.probleme}) : rien n'est écrasé.` };
  }
  if (avant.source === 'enregistre' && avant.expireLe === expireLe) return { ok: true, change: false, reglage: avant };
  writeJsonAtomic(fichier, { version: VERSION_JETON, expireLe, majLe: new Date(maintenant).toISOString() });
  return { ok: true, change: true, reglage: lireJetonClaude({ fichier }) };
}
