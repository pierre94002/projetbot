import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PREDICTIONS_FILE_PATH = path.resolve(__dirname, '../../../data/runtime/predictions.json');

function readPredictions() {
  try {
    if (fs.existsSync(PREDICTIONS_FILE_PATH)) return JSON.parse(fs.readFileSync(PREDICTIONS_FILE_PATH, 'utf8'));
  } catch {
    // Fichier corrompu : on repart d'un journal vide plutôt que de faire échouer l'appli.
  }
  return [];
}

function writePredictions(entries) {
  fs.mkdirSync(path.dirname(PREDICTIONS_FILE_PATH), { recursive: true });
  fs.writeFileSync(PREDICTIONS_FILE_PATH, JSON.stringify(entries, null, 2), 'utf8');
}

export function listPredictions() {
  return readPredictions().sort((a, b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt));
}

/**
 * Journalise le pronostic du moteur pour CHAQUE match scanné, sur PLUSIEURS
 * marchés (résultat, total buts, buts par équipe, BTTS…) — pas seulement le
 * 1N2 des value bets. Une même détection (match + MARCHÉ) est mise à jour
 * plutôt que dupliquée à chaque rescan — la clé n'inclut PAS le jour : un
 * même match rescanné un autre jour (cotes qui bougent, nouveau scan avant
 * le coup d'envoi...) doit mettre à jour l'entrée existante, pas en créer une
 * seconde. `day` reste celui du tout premier scan (aligné sur firstSeenAt) et
 * ne bouge plus ensuite, pour que le tableau jour-par-jour ne "déménage" pas
 * une prédiction déjà journalisée.
 */
export function upsertPredictions(entries) {
  const log = readPredictions();
  const now = new Date().toISOString();
  const day = now.slice(0, 10);

  for (const entry of entries) {
    const existing = log.find((e) => e.matchId === entry.matchId && e.market === entry.market);
    if (existing) {
      existing.predictedOutcome = entry.predictedOutcome;
      existing.predictedLabel = entry.predictedLabel;
      existing.predictedOdds = entry.predictedOdds;
      existing.action = entry.action;
      existing.edgePercent = entry.edgePercent;
      existing.lastSeenAt = now;
    } else {
      log.push({
        id: crypto.randomUUID(),
        day,
        matchId: entry.matchId,
        homeName: entry.homeName,
        awayName: entry.awayName,
        league: entry.league ?? null,
        market: entry.market,
        predictedOutcome: entry.predictedOutcome,
        predictedLabel: entry.predictedLabel,
        predictedOdds: entry.predictedOdds,
        action: entry.action,
        edgePercent: entry.edgePercent,
        status: 'pending',
        settledAt: null,
        firstSeenAt: now,
        lastSeenAt: now
      });
    }
  }

  writePredictions(log);
  return log;
}

export function updatePredictionStatus(id, status) {
  const log = readPredictions();
  const entry = log.find((e) => e.id === id);
  if (!entry) return null;
  entry.status = status;
  entry.settledAt = status === 'pending' ? null : new Date().toISOString();
  writePredictions(log);
  return entry;
}

export function deletePrediction(id) {
  const log = readPredictions();
  const index = log.findIndex((e) => e.id === id);
  if (index === -1) return false;
  log.splice(index, 1);
  writePredictions(log);
  return true;
}
