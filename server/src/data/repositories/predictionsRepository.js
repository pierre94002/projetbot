import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { readJsonFile, writeJsonAtomic } from '../../utils/atomicJson.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PREDICTIONS_FILE_PATH = path.resolve(__dirname, '../../../data/runtime/predictions.json');

// Un fichier illisible fait échouer la lecture au lieu de passer pour un
// journal vide : l'écriture suivante l'aurait sinon réécrit à partir de rien
// (cf. utils/atomicJson.js).
function readPredictions() {
  return readJsonFile(PREDICTIONS_FILE_PATH, []);
}

function writePredictions(entries) {
  writeJsonAtomic(PREDICTIONS_FILE_PATH, entries);
}

/** Un numéro de version du moteur connu (entier ≥ 1) — étape 25. */
const versionConnue = (v) => Number.isInteger(v) && v >= 1;

export function listPredictions() {
  return readPredictions().sort((a, b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt));
}

/**
 * Étape 14 du plan (07/10/2026) : le champ « aVerifier » de chaque pronostic —
 * absent, ou { raisons, texte } quand les données qu'il a lues sont douteuses
 * (contrôle quotidien : un score à vérifier dans les rencontres récentes d'un
 * des deux clubs, des cartons non relevés dans son championnat, le magasin
 * pas à jour, FotMob en panne…). CALCULÉ À LA LECTURE, JAMAIS ÉCRIT : le
 * journal est réécrit par le scan et par le règlement ; une marque gardée
 * dedans vieillirait (une donnée corrigée resterait « à vérifier ») et
 * demanderait une écriture de plus à chaque passe. `aVerifierDe(entree)` :
 * la règle (data/controleQuotidien.js), passée par l'appelant. Le statut,
 * la cote et le verdict du pronostic ne changent jamais.
 */
export function avecAVerifier(entries, aVerifierDe) {
  if (typeof aVerifierDe !== 'function') return entries;
  return entries.map((entree) => {
    let a = null;
    try {
      a = aVerifierDe(entree);
    } catch {
      a = null;
    }
    // Le champ n'existe que s'il y a une raison : un pronostic sans doute reste tel qu'avant.
    return a ? { ...entree, aVerifier: a } : entree;
  });
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
 *
 * `commenceTime` (coup d'envoi) est gardé : c'est lui qui permet au
 * règlement automatique de retrouver le résultat d'un match scanné plusieurs
 * jours avant d'être joué — `day` n'est que la date du premier scan.
 *
 * Étape 25 du plan (07/10/2026) : `engineVersion`, le numéro de la VERSION DU
 * MOTEUR qui a calculé les chiffres de l'entrée (cf.
 * core/engine/engineVersions.js). Écrit seulement quand il est connu ; un
 * rescan le remplace avec les chiffres qu'il remplace, et un rescan sans
 * version le retire (les chiffres ne sont plus ceux de l'ancienne version).
 * Les entrées d'avant ne sont jamais réécrites pour lui : « sans version ».
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
      if (entry.commenceTime) existing.commenceTime = entry.commenceTime;
      // Un rescan d'un match déjà journalisé AVANT la migration vers le
      // marché structuré (cf. sports/football/markets.js) le fait passer au
      // nouveau format à cette occasion, sans script à relancer.
      if (entry.marketId) existing.marketId = entry.marketId;
      if (entry.params) existing.params = entry.params;
      if (versionConnue(entry.engineVersion)) existing.engineVersion = entry.engineVersion;
      else delete existing.engineVersion;
    } else {
      log.push({
        id: crypto.randomUUID(),
        day,
        matchId: entry.matchId,
        homeName: entry.homeName,
        awayName: entry.awayName,
        league: entry.league ?? null,
        commenceTime: entry.commenceTime ?? null,
        market: entry.market,
        marketId: entry.marketId ?? null,
        params: entry.params ?? null,
        predictedOutcome: entry.predictedOutcome,
        predictedLabel: entry.predictedLabel,
        predictedOdds: entry.predictedOdds,
        action: entry.action,
        edgePercent: entry.edgePercent,
        ...(versionConnue(entry.engineVersion) ? { engineVersion: entry.engineVersion } : {}),
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

/**
 * Statut posé À LA MAIN (Historique moteur, fiche d'un match) : il est
 * marqué comme tel, et le règlement automatique n'y touchera plus — même si
 * le score connu change ensuite.
 */
export function updatePredictionStatus(id, status) {
  const log = readPredictions();
  const entry = log.find((e) => e.id === id);
  if (!entry) return null;
  entry.status = status;
  entry.settledAt = status === 'pending' ? null : new Date().toISOString();
  entry.settledBy = status === 'pending' ? null : 'manual';
  entry.settledScore = null;
  writePredictions(log);
  return entry;
}

/**
 * Règlements AUTOMATIQUES, d'une seule lecture et d'une seule écriture du
 * journal (une réécriture complète par entrée coûtait 450 Ko à chaque fois).
 * Chaque entrée garde le score qui l'a réglée, pour pouvoir la revoir si ce
 * score est corrigé plus tard.
 *
 * @param {{ id: string, status: string, score: string, resultId: string|null }[]} settlements
 * @returns {number} entrées modifiées
 */
export function applyPredictionSettlements(settlements) {
  if (!settlements.length) return 0;
  const log = readPredictions();
  const byId = new Map(log.map((e) => [e.id, e]));
  const now = new Date().toISOString();
  let n = 0;
  for (const s of settlements) {
    const entry = byId.get(s.id);
    if (!entry) continue;
    entry.status = s.status;
    entry.settledAt = now;
    entry.settledBy = 'auto';
    entry.settledScore = s.score;
    entry.settledResultId = s.resultId ?? null;
    n++;
  }
  if (n) writePredictions(log);
  return n;
}

export function deletePrediction(id) {
  const log = readPredictions();
  const index = log.findIndex((e) => e.id === id);
  if (index === -1) return false;
  log.splice(index, 1);
  writePredictions(log);
  return true;
}
