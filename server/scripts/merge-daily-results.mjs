#!/usr/bin/env node
/**
 * merge-daily-results.mjs
 * -----------------------------------------------------------------------
 * Fusionne une liste de résultats du jour (JSON) dans server/data/runtime/
 * match-results.json, en respectant EXACTEMENT le même contrat que
 * `recordMatchResult()` dans server/src/data/repositories/matchResultsRepository.js
 * (mêmes noms de champs, même logique d'upsert par matchId) — c'est ce
 * fichier que lit `getResultsForTeam()` pour enrichir les moyennes de buts
 * du moteur, exactement comme quand Pierre saisit un score via "Score final".
 *
 * Usage :
 *   node merge-daily-results.mjs <chemin-vers-match-results.json> <chemin-vers-nouveaux-resultats.json>
 *
 * Le fichier "nouveaux résultats" est un tableau d'objets :
 *   [{ "date": "2026-09-13", "league": "Ligue 1 - France", "homeName": "Paris Saint Germain",
 *      "awayName": "Marseille", "homeGoals": 2, "awayGoals": 1, "source": "..." }, ...]
 *
 * matchId est dérivé de façon stable (date + équipes) plutôt qu'un ID
 * externe (The Odds API), puisque cette source n'a pas d'ID d'API — un
 * même match rejoué le lendemain via ce script met donc à jour la même
 * entrée plutôt que d'en créer une seconde.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [, , resultsPath, newMatchesPath] = process.argv;
if (!resultsPath || !newMatchesPath) {
  console.error('Usage: node merge-daily-results.mjs <match-results.json> <nouveaux-resultats.json>');
  process.exit(1);
}

function slug(text) {
  return (text ?? '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function readJson(path, fallback) {
  try {
    if (fs.existsSync(path)) return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch (e) {
    console.error(`Attention : ${path} illisible/corrompu (${e.message}), on repart de la valeur par défaut.`);
  }
  return fallback;
}

const results = readJson(resultsPath, []);
const newMatches = readJson(newMatchesPath, []);

let created = 0;
let updated = 0;
let skipped = 0;

for (const m of newMatches) {
  const { date, league, homeName, awayName, homeGoals, awayGoals, source } = m;

  if (!homeName || !awayName || !Number.isFinite(Number(homeGoals)) || !Number.isFinite(Number(awayGoals))) {
    console.error(`Ignoré (données incomplètes) : ${JSON.stringify(m)}`);
    skipped++;
    continue;
  }

  const matchId = `web-${date ?? 'inconnu'}-${slug(homeName)}-${slug(awayName)}`;
  const now = new Date().toISOString();
  const existing = results.find((r) => r.matchId === matchId);
  const numHomeGoals = Number(homeGoals);
  const numAwayGoals = Number(awayGoals);

  if (existing) {
    existing.homeGoals = numHomeGoals;
    existing.awayGoals = numAwayGoals;
    existing.homeScore = numHomeGoals;
    existing.awayScore = numAwayGoals;
    existing.settledAt = now;
    existing.source = source ?? existing.source ?? 'web';
    updated++;
  } else {
    results.push({
      id: crypto.randomUUID(),
      matchId,
      homeName,
      awayName,
      league: league ?? null,
      homeGoals: numHomeGoals,
      awayGoals: numAwayGoals,
      homeScore: numHomeGoals,
      awayScore: numAwayGoals,
      settledAt: now,
      source: source ?? 'web'
    });
    created++;
  }
}

fs.mkdirSync(path.dirname(resultsPath), { recursive: true });
fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2), 'utf8');

console.log(JSON.stringify({ created, updated, skipped, total: results.length }));
