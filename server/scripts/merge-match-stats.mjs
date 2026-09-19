#!/usr/bin/env node
/**
 * merge-match-stats.mjs
 * -----------------------------------------------------------------------
 * Fusionne les statistiques détaillées de matchs terminés (stats d'équipe
 * complètes + stats individuelles de chaque joueur, match par match) dans
 * server/data/runtime/match-stats/<AAAA-MM>.json, lus par
 * GET /api/match-stats/* (cf. matchStatsWebRepository.js).
 *
 * Un fichier par mois plutôt qu'un seul gros fichier : une saison complète
 * (≈ 40 joueurs × 2 000 matchs) dépasserait vite la taille qu'on peut
 * transférer d'un coup vers le PC — seul le mois touché est réécrit.
 *
 * Usage :
 *   node merge-match-stats.mjs <dossier-match-stats> <nouvelles-stats.json>
 *
 * "nouvelles-stats.json" est un tableau d'objets :
 *   [{
 *     "date": "2026-09-14", "league": "Ligue 1 - France",
 *     "homeName": "Paris Saint Germain", "awayName": "Marseille",
 *     "homeGoals": 2, "awayGoals": 1,
 *     "sources": ["https://...", "https://..."],
 *     "teamStats": {
 *       "home": { "expected_goals": 1.64, "Total Shots": 14, "Ball Possession": "55%", ... },
 *       "away": { ... }
 *     },
 *     "players": {
 *       "home": [{ "name": "...", "position": "M", "starter": true, "minutes": 90,
 *                  "rating": 7.3, "goals": 1, "assists": 0, "shots": 3, ... }],
 *       "away": [ ... ]
 *     }
 *   }, ...]
 *
 * Clés d'équipe acceptées = celles de ui/src/constants/matchStatFields.js
 * (TEAM_STAT_KEYS ci-dessous). Clés joueur = PLAYER_STAT_KEYS. Toute autre
 * clé est ignorée (avec avertissement) plutôt que stockée en vrac.
 *
 * Upsert par matchId stable (date + équipes) : relancer le script sur un
 * match déjà connu COMPLÈTE les valeurs (une valeur null/absente ne
 * remplace jamais un chiffre déjà confirmé), sans jamais dupliquer.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';

export const TEAM_STAT_KEYS = [
  'expected_goals', 'xgot', 'Total Shots', 'Shots on Goal', 'Shots off Goal', 'Blocked Shots',
  'Shots insidebox', 'Shots outsidebox', 'woodwork',
  'big_chances', 'Corner Kicks', 'touches_opponent_box', 'touches_six_yard_box', 'through_balls', 'Offsides', 'free_kicks',
  'Ball Possession', 'Total passes', 'Passes accurate', 'Passes %', 'long_balls', 'final_third_passes', 'crosses', 'expected_assists',
  'throw_ins', 'Fouls', 'tackles', 'duels_won', 'clearances', 'interceptions', 'errors_leading_to_shot', 'errors_leading_to_goal',
  'Yellow Cards', 'Red Cards',
  'Goalkeeper Saves', 'xgot_faced', 'goals_prevented'
];
const PERCENT_TEAM_KEYS = new Set(['Ball Possession', 'Passes %']);

export const PLAYER_STAT_KEYS = [
  'minutes', 'rating', 'goals', 'assists', 'shots', 'shotsOnTarget', 'xg', 'xa', 'keyPasses',
  'passes', 'passesAccurate', 'crosses', 'dribblesWon', 'touches', 'tackles', 'interceptions',
  'clearances', 'duelsWon', 'duelsTotal', 'foulsCommitted', 'foulsSuffered', 'offsides',
  'yellowCards', 'redCards', 'saves', 'goalsConceded'
];
const PLAYER_TEXT_KEYS = ['name', 'position', 'number'];

function slug(text) {
  return (text ?? '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function readJson(p, fallback) {
  try {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.error(`Attention : ${p} illisible/corrompu (${e.message}), on repart de la valeur par défaut.`);
  }
  return fallback;
}

function toNumber(raw) {
  if (raw === null || raw === undefined || raw === '' || raw === '—' || raw === '-') return null;
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace('%', '').replace(',', '.').trim());
  return Number.isFinite(n) ? n : null;
}

function cleanTeamStats(raw, warnings, label) {
  const out = {};
  for (const [key, value] of Object.entries(raw ?? {})) {
    if (!TEAM_STAT_KEYS.includes(key)) {
      warnings.push(`${label} : clé d'équipe inconnue ignorée "${key}"`);
      continue;
    }
    const n = toNumber(value);
    if (n === null) continue;
    out[key] = PERCENT_TEAM_KEYS.has(key) ? `${Number(n.toFixed(1))}%` : n;
  }
  return out;
}

function cleanPlayer(raw, warnings, label) {
  if (!raw?.name) {
    warnings.push(`${label} : joueur sans nom ignoré`);
    return null;
  }
  const out = { name: String(raw.name).trim() };
  if (raw.position != null) out.position = String(raw.position);
  if (raw.number != null) out.number = raw.number;
  if (typeof raw.starter === 'boolean') out.starter = raw.starter;
  for (const key of PLAYER_STAT_KEYS) {
    const n = toNumber(raw[key]);
    if (n !== null) out[key] = n;
  }
  for (const key of Object.keys(raw)) {
    if (!PLAYER_STAT_KEYS.includes(key) && !PLAYER_TEXT_KEYS.includes(key) && key !== 'starter') {
      warnings.push(`${label} : clé joueur inconnue ignorée "${key}"`);
    }
  }
  return out;
}

/** Complète `target` avec `incoming` : un chiffre existant n'est remplacé que par un chiffre, jamais par une absence. */
function fillStats(target, incoming) {
  for (const [key, value] of Object.entries(incoming)) {
    if (value !== null && value !== undefined) target[key] = value;
  }
  return target;
}

function mergePlayers(existing = [], incoming = []) {
  const byKey = new Map(existing.map((p) => [slug(p.name), p]));
  for (const player of incoming) {
    const key = slug(player.name);
    if (byKey.has(key)) {
      const { name, ...rest } = player; // on garde l'orthographe déjà stockée (accents…)
      fillStats(byKey.get(key), rest);
    }
    else byKey.set(key, player);
  }
  return [...byKey.values()];
}

function main() {
  const [, , statsDir, newStatsPath] = process.argv;
  if (!statsDir || !newStatsPath) {
    console.error('Usage: node merge-match-stats.mjs <dossier-match-stats> <nouvelles-stats.json>');
    process.exit(1);
  }

  const incoming = readJson(newStatsPath, []);
  if (!Array.isArray(incoming)) {
    console.error('Le fichier de nouvelles stats doit contenir un TABLEAU JSON.');
    process.exit(1);
  }

  const shards = new Map(); // "AAAA-MM" -> tableau
  const touched = new Set();
  const warnings = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let playersCount = 0;
  const now = new Date().toISOString();

  const loadShard = (month) => {
    if (!shards.has(month)) shards.set(month, readJson(path.join(statsDir, `${month}.json`), []));
    return shards.get(month);
  };

  for (const m of incoming) {
    const { date, league, homeName, awayName } = m ?? {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || !homeName || !awayName) {
      console.error(`Ignoré (date AAAA-MM-JJ / équipes manquantes) : ${JSON.stringify(m)?.slice(0, 200)}`);
      skipped++;
      continue;
    }

    const label = `${date} ${homeName}-${awayName}`;
    const matchKey = `${date}-${slug(homeName)}-${slug(awayName)}`;
    const month = date.slice(0, 7);
    const shard = loadShard(month);

    const homeStats = cleanTeamStats(m.teamStats?.home, warnings, `${label} (dom.)`);
    const awayStats = cleanTeamStats(m.teamStats?.away, warnings, `${label} (ext.)`);
    const homePlayers = (m.players?.home ?? []).map((p) => cleanPlayer(p, warnings, `${label} (dom.)`)).filter(Boolean);
    const awayPlayers = (m.players?.away ?? []).map((p) => cleanPlayer(p, warnings, `${label} (ext.)`)).filter(Boolean);

    if (!Object.keys(homeStats).length && !Object.keys(awayStats).length && !homePlayers.length && !awayPlayers.length) {
      console.error(`Ignoré (aucune statistique exploitable) : ${label}`);
      skipped++;
      continue;
    }

    const sources = [...new Set([...(Array.isArray(m.sources) ? m.sources : []), ...(m.source ? [m.source] : [])])];
    const existing = shard.find((e) => e.matchKey === matchKey);

    if (existing) {
      existing.league = league ?? existing.league ?? null;
      if (toNumber(m.homeGoals) !== null) existing.homeGoals = toNumber(m.homeGoals);
      if (toNumber(m.awayGoals) !== null) existing.awayGoals = toNumber(m.awayGoals);
      fillStats(existing.teamStats.home, homeStats);
      fillStats(existing.teamStats.away, awayStats);
      existing.players.home = mergePlayers(existing.players.home, homePlayers);
      existing.players.away = mergePlayers(existing.players.away, awayPlayers);
      existing.sources = [...new Set([...(existing.sources ?? []), ...sources])];
      existing.updatedAt = now;
      updated++;
    } else {
      shard.push({
        matchId: `stats-${matchKey}`,
        matchKey,
        date,
        league: league ?? null,
        homeName,
        awayName,
        homeGoals: toNumber(m.homeGoals),
        awayGoals: toNumber(m.awayGoals),
        teamStats: { home: homeStats, away: awayStats },
        players: { home: homePlayers, away: awayPlayers },
        sources,
        updatedAt: now
      });
      created++;
    }
    playersCount += homePlayers.length + awayPlayers.length;
    touched.add(month);
  }

  fs.mkdirSync(statsDir, { recursive: true });
  const written = [];
  for (const month of touched) {
    const shard = shards.get(month).sort((a, b) => a.date.localeCompare(b.date) || a.matchKey.localeCompare(b.matchKey));
    const file = path.join(statsDir, `${month}.json`);
    // JSON compact (pas d'indentation) : les stats joueurs pèsent lourd.
    fs.writeFileSync(file, JSON.stringify(shard), 'utf8');
    written.push(file);
  }

  for (const w of warnings.slice(0, 30)) console.error(`Avertissement : ${w}`);
  if (warnings.length > 30) console.error(`… ${warnings.length - 30} autres avertissements`);

  console.log(JSON.stringify({ created, updated, skipped, playersMerged: playersCount, writtenFiles: written }));
}

main();
