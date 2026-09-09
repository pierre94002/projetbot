// Migration ponctuelle, à lancer à la main une seule fois : ajoute
// marketId/params (structurés) sur chaque sélection de bets.json et chaque
// entrée de predictions.json — EN PLUS des champs texte existants
// (market/pick/predictedLabel), jamais à la place. Réutilise exactement la
// même logique de reconnaissance que sports/football/markets.js et
// l'ancienne PredictionsHistoryView.vue (extractGoalLine/namesMatch), déjà
// éprouvée en prod pour régler les paris.
//
// Usage : node server/scripts/migrate-market-shape.js

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME_DIR = path.resolve(__dirname, '../data/runtime');
const BACKUP_DIR = path.resolve(RUNTIME_DIR, '../backups', `migrate-market-shape-${new Date().toISOString().replace(/[:.]/g, '-')}`);

const FILES_TO_BACKUP = ['bets.json', 'predictions.json'];

const GOAL_LINE_PATTERN = /(?:plus|moins) de (\d+(?:[.,]\d+)?)\s*buts?/i;

function extractGoalLine(label) {
  const match = GOAL_LINE_PATTERN.exec(label ?? '');
  return match ? match[1].replace(',', '.') : null;
}

/** Compare deux noms d'équipe en ignorant accents/casse (cf. ui/src/utils/betTrends.js#namesMatch). */
function namesMatch(pick, teamName) {
  const normalize = (s) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return normalize(pick).startsWith(normalize(teamName));
}

/**
 * Reconstruit {marketId, params} à partir des champs texte legacy — miroir
 * en sens inverse de sports/football/markets.js#deriveMarketPredictions
 * (texte → structure, puisqu'il s'agit ici de ré-interpréter des
 * enregistrements déjà persistés). Retourne `null` si le marché/pick n'est
 * pas reconnu — jamais de déduction hasardeuse.
 */
function inferMarketShape({ market, pick, homeName, awayName }) {
  if (market === 'Résultat' || market === '1N2') {
    if (/nul/i.test(pick)) return { marketId: 'result', params: { outcome: 'draw' } };
    if (namesMatch(pick, homeName)) return { marketId: 'result', params: { outcome: 'home' } };
    if (namesMatch(pick, awayName)) return { marketId: 'result', params: { outcome: 'away' } };
    return null;
  }

  if (market === 'Total buts') {
    const line = extractGoalLine(pick);
    if (line === null) return null;
    const side = /plus de/i.test(pick) ? 'over' : 'under';
    return { marketId: 'totalGoals', params: { line: Number(line), side } };
  }

  if (market === 'Les 2 équipes marquent') {
    return { marketId: 'bothTeamsScore', params: {} };
  }

  if (market === 'Résultat + Total buts') {
    const line = extractGoalLine(pick);
    if (line === null) return null;
    const isOver = /plus de/i.test(pick);
    let side;
    if (/nul/i.test(pick)) side = 'draw';
    else if (namesMatch(pick, homeName)) side = 'home';
    else if (namesMatch(pick, awayName)) side = 'away';
    else return null;
    return { marketId: 'resultAndTotal', params: { line: Number(line), key: `${side}${isOver ? 'Over' : 'Under'}` } };
  }

  if (market === 'Buts par équipe' || market?.startsWith('Buts — ')) {
    const line = extractGoalLine(pick);
    if (line === null) return null;
    const side = /plus de/i.test(pick) ? 'over' : 'under';
    const isHomeTeam = namesMatch(pick, homeName);
    const isAwayTeam = namesMatch(pick, awayName);
    if (!isHomeTeam && !isAwayTeam) return null;
    return { marketId: 'teamGoals', params: { team: isHomeTeam ? 'home' : 'away', line: Number(line), side } };
  }

  return null;
}

function backupFiles() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  for (const file of FILES_TO_BACKUP) {
    const src = path.join(RUNTIME_DIR, file);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(BACKUP_DIR, file));
  }
  console.log(`Sauvegarde : ${BACKUP_DIR}`);
}

function migratePredictions() {
  const filePath = path.join(RUNTIME_DIR, 'predictions.json');
  const entries = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  let migrated = 0;
  let alreadyDone = 0;
  const unrecognized = [];

  for (const entry of entries) {
    if (entry.marketId) {
      alreadyDone++;
      continue;
    }
    const shape = inferMarketShape({ market: entry.market, pick: entry.predictedLabel, homeName: entry.homeName, awayName: entry.awayName });
    if (shape) {
      entry.marketId = shape.marketId;
      entry.params = shape.params;
      migrated++;
    } else {
      entry.marketId = null;
      entry.params = null;
      unrecognized.push({ id: entry.id, market: entry.market, predictedLabel: entry.predictedLabel });
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(entries, null, 2), 'utf8');
  return { total: entries.length, migrated, alreadyDone, unrecognized };
}

function migrateBets() {
  const filePath = path.join(RUNTIME_DIR, 'bets.json');
  const bets = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  let migrated = 0;
  let alreadyDone = 0;
  let total = 0;
  const unrecognized = [];

  for (const bet of bets) {
    for (const leg of bet.legs) {
      total++;
      if (leg.marketId) {
        alreadyDone++;
        continue;
      }
      const shape = inferMarketShape({ market: leg.market, pick: leg.pick, homeName: leg.homeName, awayName: leg.awayName });
      if (shape) {
        leg.marketId = shape.marketId;
        leg.params = shape.params;
        migrated++;
      } else {
        leg.marketId = null;
        leg.params = null;
        unrecognized.push({ betId: bet.id, market: leg.market, pick: leg.pick });
      }
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(bets, null, 2), 'utf8');
  return { total, migrated, alreadyDone, unrecognized };
}

console.log('=== Migration vers le format de marché structuré (marketId/params) ===\n');
backupFiles();

const predictionsResult = migratePredictions();
console.log(`\npredictions.json : ${predictionsResult.migrated} migré(s), ${predictionsResult.alreadyDone} déjà fait(s), sur ${predictionsResult.total}.`);
if (predictionsResult.unrecognized.length > 0) {
  console.log(`  ⚠ ${predictionsResult.unrecognized.length} non reconnu(s) :`);
  for (const u of predictionsResult.unrecognized) console.log(`     [${u.id}] "${u.market}" / "${u.predictedLabel}"`);
}

const betsResult = migrateBets();
console.log(`\nbets.json : ${betsResult.migrated} sélection(s) migrée(s), ${betsResult.alreadyDone} déjà fait(s), sur ${betsResult.total}.`);
if (betsResult.unrecognized.length > 0) {
  console.log(`  ⚠ ${betsResult.unrecognized.length} non reconnue(s) :`);
  for (const u of betsResult.unrecognized) console.log(`     [pari ${u.betId}] "${u.market}" / "${u.pick}"`);
}

const totalUnrecognized = predictionsResult.unrecognized.length + betsResult.unrecognized.length;
console.log(`\n${totalUnrecognized === 0 ? '✓ Couverture 100%.' : `⚠ ${totalUnrecognized} enregistrement(s) au total à revoir à la main.`}`);
