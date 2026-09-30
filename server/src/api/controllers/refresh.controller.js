/**
 * refresh.controller.js — l'actualisation complète vue de l'interface.
 * -----------------------------------------------------------------------
 * GET  /api/refresh           où en est l'actualisation, ce qu'ont fait les
 *                             dernières passes, les alertes en cours, quand
 *                             vient la prochaine passe
 * POST /api/refresh           lance une passe tout de suite
 * POST /api/refresh/resettle  corrige, sur demande, les statuts anciens qui
 *                             contredisent un score final sûr — seulement
 *                             ceux dont l'interface envoie la clé
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRefreshStatus, setAlert } from '../../data/repositories/refreshStatusRepository.js';
import { isRefreshRunning, lockHolder } from '../../data/providers/refreshLock.js';
import { refreshNow, nextRefreshAt, REFRESH_STEPS } from '../../jobs/matchStatsAutoRefresh.js';
import { resettleContradictions } from '../../data/providers/settlementService.js';
import { env } from '../../config/env.js';
import { ApiError } from '../middlewares/errorHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ODDS_SNAPSHOT = path.resolve(__dirname, '../../../data/fixtures/odds/odds-snapshot.json');

/**
 * Âge des cotes À VENIR (The Odds API) : elles ne se relèvent qu'à la main,
 * pour ne pas dépenser le quota payant, et l'utilisateur doit voir qu'elles
 * vieillissent. Relu seulement quand le fichier change.
 */
let cacheCotes = { mtimeMs: 0, valeur: null };
function coteAVenir() {
  try {
    const stat = fs.statSync(ODDS_SNAPSHOT);
    if (stat.mtimeMs !== cacheCotes.mtimeMs) {
      const brut = JSON.parse(fs.readFileSync(ODDS_SNAPSHOT, 'utf8'));
      const matchs = (Array.isArray(brut) ? brut : [brut]).flatMap((b) => (Array.isArray(b?.data) ? b.data : Array.isArray(b) ? b : []));
      cacheCotes = { mtimeMs: stat.mtimeMs, valeur: { updatedAt: stat.mtime.toISOString(), matches: matchs.length, commenceTimes: matchs.map((m) => m.commence_time).filter(Boolean) } };
    }
    const maintenant = Date.now();
    const v = cacheCotes.valeur;
    return { updatedAt: v.updatedAt, matches: v.matches, upcoming: v.commenceTimes.filter((t) => Date.parse(t) > maintenant).length };
  } catch {
    return null;
  }
}

/** Une passe sans ses détails volumineux, pour l'historique. */
const resumePasse = (p) => ({
  id: p.id,
  reason: p.reason,
  startedAt: p.startedAt,
  finishedAt: p.finishedAt,
  durationMs: p.durationMs,
  outcome: p.outcome,
  steps: p.steps.map(({ key, label, status, summary, durationMs }) => ({ key, label, status, summary, durationMs }))
});

export function getRefreshOverview(req, res) {
  const etat = readRefreshStatus();
  const detenteur = lockHolder();
  // Passe EN COURS : celle que l'état enregistré décrit, si son processus
  // tient encore le verrou (un serveur arrêté au milieu laisse un état
  // « en cours » périmé). Un autre programme qui tient le verrou (import en
  // ligne de commande) n'est pas une passe : il est signalé à part, et le
  // bilan de la dernière passe reste affiché.
  const passeEnCours = etat.running && (etat.running.pid === process.pid ? isRefreshRunning() : detenteur?.pid === etat.running.pid);
  const running = passeEnCours ? { ...etat.running, byThisServer: etat.running.pid === process.pid } : null;
  const lockedByOther = !running && detenteur && !detenteur.self ? { pid: detenteur.pid, startedAt: detenteur.startedAt } : null;
  const [derniere, ...precedentes] = etat.history ?? [];
  res.json({
    enabled: env.matchStatsRefresh.enabled,
    intervalMinutes: env.matchStatsRefresh.intervalMinutes,
    nextRunAt: nextRefreshAt(),
    running,
    lockedByOther,
    lastCompletedAt: etat.lastCompletedAt,
    lastSuccessAt: etat.lastSuccessAt,
    dataChangedAt: etat.dataChangedAt,
    stepsLastSuccess: etat.stepsLastSuccess ?? {},
    alerts: etat.alerts ?? {},
    steps: REFRESH_STEPS,
    lastPass: derniere ? resumePasse(derniere) : null,
    history: precedentes.slice(0, 9).map(resumePasse),
    upcomingOdds: coteAVenir()
  });
}

export function postRefresh(req, res) {
  if (isRefreshRunning()) {
    res.status(202).json({ started: false, alreadyRunning: true });
    return;
  }
  refreshNow().catch((error) => console.error(`[actualisation] passe manuelle en échec : ${error.message}`));
  res.status(202).json({ started: true, alreadyRunning: false });
}

export function postResettle(req, res) {
  const keys = req.body?.keys;
  if (!Array.isArray(keys) || !keys.length || !keys.every((k) => typeof k === 'string')) {
    throw new ApiError(400, 'Indiquez les lignes à corriger ("keys").');
  }
  // Pendant une passe, le règlement écrit les mêmes journaux : on attend.
  if (isRefreshRunning()) throw new ApiError(409, 'Une actualisation est en cours : réessayez quand elle sera finie.');
  const r = resettleContradictions({ keys });
  // L'alerte affichée suit tout de suite, sans attendre la passe suivante.
  setAlert('contradictions', r.remaining.count ? { ...r.remaining, updatedAt: new Date().toISOString() } : null);
  res.json({ predictions: r.predictions, betLegs: r.betLegs, remaining: r.remaining.count });
}
