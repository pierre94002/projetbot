/**
 * refreshStatusRepository.js — ce que l'actualisation a fait, et quand.
 * -----------------------------------------------------------------------
 * La boucle d'actualisation ne laissait qu'une ligne dans la fenêtre du
 * serveur, et rien du tout quand elle jugeait que « rien n'avait bougé ».
 * Ce fichier garde, pour l'interface et pour la passe suivante :
 *
 *   - la passe EN COURS (étape, depuis quand, quel processus) ;
 *   - les trente dernières passes, étape par étape (bilan, durée, erreurs) ;
 *   - la dernière réussite de chaque étape — ce qui fixe la fenêtre de
 *     rattrapage après une absence, et le rythme des étapes quotidiennes
 *     ou hebdomadaires. Une étape qui a laissé des journées en échec
 *     n'avance son repère que jusqu'à la première d'entre elles : la passe
 *     suivante les relit ;
 *   - les ALERTES en cours (contradictions de règlement, anomalies du
 *     contrôle des scores), gardées jusqu'à ce qu'une passe ou une
 *     correction les lève — et non effacées dès la passe suivante, qui
 *     saute le contrôle quotidien ;
 *   - `dataChangedAt`, la dernière passe qui a réellement ÉCRIT des données
 *     (c'est elle, et non chaque fin de passe, qui fait recharger l'interface) ;
 *   - `registryRebuildPending`, une reconstruction des annuaires demandée et
 *     pas encore faite (serveur arrêté entre-temps, échec) : elle est reprise.
 *
 * Écrit d'un bloc (fichier temporaire renommé). Un fichier présent mais
 * illisible est mis de côté (refresh-status.illisible-<date>.json), jamais
 * écrasé en silence.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonFile, writeJsonAtomic } from '../../utils/atomicJson.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REFRESH_STATUS_FILE = path.resolve(__dirname, '../../../data/runtime/refresh-status.json');
const HISTORIQUE = 30;

/** Un état neuf à chaque appel : jamais d'objet partagé qu'on modifierait. */
const vide = () => ({
  version: 1,
  running: null,
  lastCompletedAt: null,
  lastSuccessAt: null,
  dataChangedAt: null,
  stepsLastSuccess: {},
  alerts: { contradictions: null, audit: null },
  registryRebuildPending: false,
  history: []
});

export function readRefreshStatus() {
  try {
    const lu = readJsonFile(REFRESH_STATUS_FILE, null);
    if (!lu) return vide();
    const etat = { ...vide(), ...lu };
    etat.stepsLastSuccess = { ...(lu.stepsLastSuccess ?? {}) };
    etat.alerts = { ...vide().alerts, ...(lu.alerts ?? {}) };
    etat.history = Array.isArray(lu.history) ? lu.history : [];
    return etat;
  } catch (error) {
    // Illisible : mis de côté plutôt qu'écrasé, puis on repart d'un état
    // neuf (fenêtres minimales de rattrapage).
    try {
      const cote = REFRESH_STATUS_FILE.replace(/\.json$/, `.illisible-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
      fs.renameSync(REFRESH_STATUS_FILE, cote);
      console.warn(`[actualisation] état illisible (${error.message}) : mis de côté sous ${path.basename(cote)}.`);
    } catch {
      // Déjà déplacé par un autre lecteur.
    }
    return vide();
  }
}

function ecrire(etat) {
  try {
    writeJsonAtomic(REFRESH_STATUS_FILE, etat);
  } catch (error) {
    console.warn(`[actualisation] état non enregistré : ${error.message}`);
  }
}

/** Une passe commence. */
export function markRunning({ reason, steps, pid = process.pid }) {
  const etat = readRefreshStatus();
  etat.running = { pid, reason, startedAt: new Date().toISOString(), step: null, stepLabel: null, stepIndex: 0, steps, heartbeatAt: new Date().toISOString() };
  ecrire(etat);
}

/** Une étape commence. */
export function markStep({ key, label, index }) {
  const etat = readRefreshStatus();
  if (!etat.running) return;
  etat.running = { ...etat.running, step: key, stepLabel: label, stepIndex: index, heartbeatAt: new Date().toISOString() };
  ecrire(etat);
}

/**
 * La passe est finie : elle entre dans l'historique ; les étapes réussies
 * avancent leur repère (jusqu'à `resumeFrom` si elles l'indiquent) ; les
 * alertes des étapes qui ont tourné sont remplacées.
 *
 * @param {object} passe  bilan de la passe (steps[] avec status, resumeFrom?, alert?, changed?)
 * @param {object} extra  { registryRebuildPending?: boolean }
 */
export function recordPass(passe, { registryRebuildPending = false } = {}) {
  const etat = readRefreshStatus();
  etat.running = null;
  etat.lastCompletedAt = passe.finishedAt;
  if (passe.outcome === 'ok' || passe.outcome === 'partial') etat.lastSuccessAt = passe.finishedAt;
  if (passe.steps.some((e) => e.changed)) etat.dataChangedAt = passe.finishedAt;
  for (const etape of passe.steps) {
    if (etape.status === 'ok' || etape.status === 'warn') {
      etat.stepsLastSuccess[etape.key] = etape.resumeFrom ? `${etape.resumeFrom}T00:00:00.000Z` : passe.finishedAt;
    }
    if (etape.alert !== undefined) etat.alerts[etape.alert.key] = etape.alert.value;
  }
  etat.registryRebuildPending = registryRebuildPending;
  // L'historique ne garde pas les listes d'alertes (elles vivent dans `alerts`).
  etat.history = [passe, ...(etat.history ?? [])].slice(0, HISTORIQUE);
  ecrire(etat);
}

/** Remplace une alerte (après une correction faite hors passe). */
export function setAlert(key, value) {
  const etat = readRefreshStatus();
  etat.alerts[key] = value;
  if (key === 'contradictions') etat.dataChangedAt = new Date().toISOString();
  ecrire(etat);
}

/** Au démarrage : une passe notée « en cours » par un processus mort ne l'est plus. */
export function clearStaleRunning(estVivant) {
  const etat = readRefreshStatus();
  if (etat.running && !estVivant(etat.running.pid)) {
    etat.running = null;
    ecrire(etat);
  }
}
