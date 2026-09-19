#!/usr/bin/env node
/**
 * import-flashscore-history.mjs
 * -----------------------------------------------------------------------
 * Remplit d'un coup les statistiques d'équipe de TOUTE la saison (tous
 * championnats) à partir de FlashScore, via l'actor Apify déjà utilisé par
 * Réglages > Données > "Actualiser FlashScore" (cf. flashscoreClient.js).
 *
 * Principe : en mode "with-history", chaque match du jour embarque jusqu'à
 * 100 matchs d'historique PAR ÉQUIPE, avec les mêmes statistiques (xG,
 * possession, tirs, corners…). En couvrant une semaine de matchs, on
 * récupère donc l'historique complet de quasiment toutes les équipes
 * d'Europe — bien plus que les seuls matchs des 7 jours demandés.
 *
 * Ce que FlashScore ne fournit PAS via cet actor : les statistiques
 * individuelles des joueurs (compos, notes, xG joueur). Les entrées créées
 * ici ont donc "players": vide — elles seront complétées par une autre
 * source (tâche quotidienne / FotMob) sans écraser les stats d'équipe.
 *
 * Usage (depuis le dossier server/, pour que .env soit lu) :
 *   node scripts/import-flashscore-history.mjs [--days -7..0] [--from 2025] [--max-usd 25]
 *   node scripts/import-flashscore-history.mjs --convert-only     (rejoue la conversion
 *        depuis les fichiers bruts déjà téléchargés, sans rien dépenser)
 *
 * COÛT RÉEL sur le compte Apify (~0,01 $/match renvoyé en mode historique,
 * ~250-300 matchs/jour) : --max-usd plafonne la dépense TOTALE ; le plafond
 * est réparti entre les journées demandées. Le brut est conservé dans
 * data/runtime/flashscore-raw/ (un fichier par journée) pour pouvoir
 * relancer la conversion gratuitement.
 *
 * Sorties (mêmes fichiers que la tâche quotidienne, mêmes scripts de fusion) :
 *   data/runtime/match-stats/<AAAA-MM>.json   (stats d'équipe match par match)
 *   data/runtime/match-results.json           (scores manquants)
 *   data/runtime/season-calendar.json         (matchs manquants)
 *   data/runtime/flashscore-raw/_rapport.json (clés non reconnues, à me montrer
 *                                              pour compléter la table de correspondance)
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(__dirname, '..');
const RUNTIME_DIR = path.join(SERVER_DIR, 'data', 'runtime');
const RAW_DIR = path.join(RUNTIME_DIR, 'flashscore-raw');
const MATCH_STATS_DIR = path.join(RUNTIME_DIR, 'match-stats');
const TMP_DIR = path.join(RUNTIME_DIR, '_tmp-flashscore-import');

// ---------------------------------------------------------------- arguments
const args = process.argv.slice(2);
function argValue(name, fallback) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] !== undefined ? args[i + 1] : fallback;
}
const CONVERT_ONLY = args.includes('--convert-only');
const DAYS_SPEC = argValue('--days', '-7..0');
const HISTORY_FROM_YEAR = Number(argValue('--from', '2025'));
const MAX_USD_TOTAL = Number(argValue('--max-usd', '25'));

function parseDays(spec) {
  const range = spec.match(/^(-?\d+)\.\.(-?\d+)$/);
  if (range) {
    const [a, b] = [Number(range[1]), Number(range[2])];
    const out = [];
    for (let d = Math.min(a, b); d <= Math.max(a, b); d++) out.push(d);
    return out;
  }
  return spec.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
}

// ------------------------------------------------- correspondance des stats
// Libellés FlashScore (snake_case ou texte) → clés Cote Master
// (ui/src/constants/matchStatFields.js). Comparaison sur une forme normalisée
// (minuscules, sans accents ni ponctuation) pour absorber les variantes.
const TEAM_STAT_ALIASES = {
  expected_goals: ['expected_goals', 'expected goals xg', 'xg', 'expected goals'],
  xgot: ['xgot', 'xg on target xgot', 'expected goals on target', 'xg on target'],
  'Total Shots': ['total_shots', 'total shots', 'goal attempts', 'shots', 'shots total'],
  'Shots on Goal': ['shots_on_goal', 'shots on goal', 'shots on target', 'on target'],
  'Shots off Goal': ['shots_off_goal', 'shots off goal', 'shots off target', 'off target'],
  'Blocked Shots': ['blocked_shots', 'blocked shots'],
  'Shots insidebox': ['shots_inside_box', 'shots inside box', 'shots inside the box', 'shots insidebox'],
  'Shots outsidebox': ['shots_outside_box', 'shots outside box', 'shots outside the box', 'shots outsidebox'],
  woodwork: ['woodwork', 'hit woodwork', 'hit the woodwork', 'post hits'],
  big_chances: ['big_chances', 'big chances'],
  'Corner Kicks': ['corners', 'corner_kicks', 'corner kicks'],
  touches_opponent_box: ['touches_in_opposition_box', 'touches in opposition box', 'touches in opponent box', 'touches in penalty area'],
  touches_six_yard_box: ['touches_in_six_yard_box', 'touches in six yard box', 'touches in 6 yard box'],
  through_balls: ['through_balls', 'through balls', 'through passes'],
  Offsides: ['offsides', 'offside'],
  free_kicks: ['free_kicks', 'free kicks'],
  'Ball Possession': ['possession', 'ball_possession', 'ball possession'],
  'Total passes': ['total_passes', 'total passes', 'passes'],
  'Passes accurate': ['completed_passes', 'completed passes', 'accurate passes', 'passes completed', 'passes accurate'],
  'Passes %': ['pass_accuracy', 'pass accuracy', 'passes percent', 'pass completion'],
  long_balls: ['long_balls', 'long balls', 'long passes'],
  final_third_passes: ['passes_in_final_third', 'passes in final third', 'final third passes', 'final third entries'],
  crosses: ['crosses', 'total crosses', 'cross'],
  expected_assists: ['expected_assists', 'expected assists xa', 'xa', 'expected assists'],
  throw_ins: ['throw_ins', 'throw ins', 'throw-ins'],
  Fouls: ['fouls', 'fouls committed'],
  tackles: ['tackles', 'total tackles'],
  duels_won: ['duels_won', 'duels won'],
  clearances: ['clearances', 'total clearances'],
  interceptions: ['interceptions'],
  errors_leading_to_shot: ['errors_leading_to_shot', 'errors leading to shot'],
  errors_leading_to_goal: ['errors_leading_to_goal', 'errors leading to goal'],
  'Yellow Cards': ['yellow_cards', 'yellow cards'],
  'Red Cards': ['red_cards', 'red cards'],
  'Goalkeeper Saves': ['goalkeeper_saves', 'goalkeeper saves', 'saves'],
  xgot_faced: ['xgot_faced', 'xgot faced', 'xg on target faced'],
  goals_prevented: ['goals_prevented', 'goals prevented']
};
const PERCENT_KEYS = new Set(['Ball Possession', 'Passes %']);

function norm(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim();
}
const ALIAS_LOOKUP = new Map();
for (const [key, aliases] of Object.entries(TEAM_STAT_ALIASES)) for (const a of aliases) ALIAS_LOOKUP.set(norm(a), key);

/** "92% (751/819)" → { pct: 92, num: 751, den: 819 } ; "1.64" → { num: 1.64 } ; 55 → { num: 55 } */
function parseValue(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return { num: raw };
  const text = String(raw).replace(',', '.');
  const pct = text.match(/(-?\d+(?:\.\d+)?)\s*%/);
  const frac = text.match(/\(?\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*\)?/);
  const first = text.match(/-?\d+(?:\.\d+)?/);
  if (!first) return null;
  return {
    pct: pct ? Number(pct[1]) : undefined,
    num: frac ? Number(frac[1]) : Number(first[0]),
    den: frac ? Number(frac[2]) : undefined
  };
}

const unmapped = new Map();
function convertStatistics(statistics, side) {
  const out = {};
  if (!statistics || typeof statistics !== 'object') return out;
  for (const [rawKey, entry] of Object.entries(statistics)) {
    const key = ALIAS_LOOKUP.get(norm(rawKey));
    const rawValue = entry && typeof entry === 'object' ? entry[side] : undefined;
    if (!key) {
      unmapped.set(rawKey, (unmapped.get(rawKey) ?? 0) + 1);
      continue;
    }
    const v = parseValue(rawValue);
    if (!v) continue;
    if (key === 'Ball Possession') out[key] = `${v.pct ?? v.num}%`;
    else if (key === 'Passes accurate' || key === 'Total passes') {
      // "92% (751/819)" : réussies/total/précision d'un coup
      if (v.den !== undefined) {
        out['Passes accurate'] = v.num;
        out['Total passes'] = v.den;
        if (v.pct !== undefined) out['Passes %'] = `${v.pct}%`;
      } else out[key] = v.num;
    } else if (key === 'Passes %') out[key] = `${v.pct ?? v.num}%`;
    else out[key] = v.num;
  }
  return out;
}

// ----------------------------------------------------- lecture d'un match brut
const DATE_KEYS = ['date', 'match_date', 'start_time', 'start_date', 'kickoff', 'datetime', 'timestamp', 'start_timestamp', 'time'];
const LEAGUE_KEYS = ['league', 'competition', 'tournament', 'league_name', 'tournament_name'];
const COUNTRY_KEYS = ['country', 'country_name', 'category'];

function pick(obj, keys) {
  for (const k of keys) if (obj?.[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
  return null;
}

function toIsoDate(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') {
    const ms = raw > 1e12 ? raw : raw * 1000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  let m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/(\d{2})\.(\d{2})\.(\d{4})/); // 14.09.2026 (format FlashScore)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  if (/^\d{10}(\.\d+)?$/.test(s) || /^\d{13}$/.test(s)) return toIsoDate(Number(s));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function leagueLabel(match, fallback) {
  const league = pick(match, LEAGUE_KEYS);
  const country = pick(match, COUNTRY_KEYS);
  const l = typeof league === 'object' ? league?.name : league;
  const c = typeof country === 'object' ? country?.name : country;
  if (l && c) return `${String(l).replace(/^[A-Z]+:\s*/, '')} - ${c}`;
  if (l) {
    // FlashScore écrit souvent "FRANCE: Ligue 1"
    const m = String(l).match(/^([A-Za-z\s]+):\s*(.+)$/);
    if (m) return `${m[2].trim()} - ${titleCase(m[1].trim())}`;
    return String(l);
  }
  return fallback ?? null;
}
function titleCase(s) {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function scoreOf(match) {
  const s = match.score ?? match.result ?? null;
  const home = s && typeof s === 'object' ? s.home ?? s.full_time?.home : match.home_score ?? match.homeScore;
  const away = s && typeof s === 'object' ? s.away ?? s.full_time?.away : match.away_score ?? match.awayScore;
  const h = Number(home);
  const a = Number(away);
  return Number.isFinite(h) && Number.isFinite(a) ? { home: h, away: a } : null;
}

function isFinished(match, score) {
  const status = norm(match.status ?? match.match_status ?? match.state ?? '');
  if (/finished|ended|ft|full time|after|aet|pen/.test(status)) return true;
  if (/live|1st|2nd|half|scheduled|not started|postponed|cancel|abandon/.test(status)) return false;
  return Boolean(score);
}

function toEntry(match, inheritedLeague) {
  const homeName = match.home_team ?? match.homeTeam ?? match.home?.name ?? match.home;
  const awayName = match.away_team ?? match.awayTeam ?? match.away?.name ?? match.away;
  const date = toIsoDate(pick(match, DATE_KEYS));
  if (!homeName || !awayName || !date) return null;
  const score = scoreOf(match);
  if (!isFinished(match, score)) return null;

  const teamStats = { home: convertStatistics(match.statistics, 'home'), away: convertStatistics(match.statistics, 'away') };
  return {
    date,
    league: leagueLabel(match, inheritedLeague),
    homeName: String(homeName).trim(),
    awayName: String(awayName).trim(),
    homeGoals: score?.home ?? null,
    awayGoals: score?.away ?? null,
    sources: ['flashscore (apify statanow/flashscore-scraper-live)'],
    teamStats,
    players: { home: [], away: [] }
  };
}

// ------------------------------------------------------------- conversion
function collectEntries(rawMatches, report) {
  const byKey = new Map();
  const slug = (t) => norm(t).replace(/ /g, '-');
  const add = (entry) => {
    if (!entry) return;
    const key = `${entry.date}-${slug(entry.homeName)}-${slug(entry.awayName)}`;
    const existing = byKey.get(key);
    if (!existing) byKey.set(key, entry);
    else {
      // complète sans écraser un chiffre déjà présent
      for (const side of ['home', 'away']) for (const [k, v] of Object.entries(entry.teamStats[side])) existing.teamStats[side][k] ??= v;
      existing.homeGoals ??= entry.homeGoals;
      existing.awayGoals ??= entry.awayGoals;
      existing.league ??= entry.league;
    }
  };

  let sampleKeysLogged = false;
  for (const match of rawMatches) {
    if (!sampleKeysLogged) {
      report.sampleTopLevelKeys = Object.keys(match);
      const hist = match.historical_snapshot?.historical_data?.home_team?.matches?.[0];
      if (hist) report.sampleHistoricalKeys = Object.keys(hist);
      if (match.statistics) report.sampleStatisticsKeys = Object.keys(match.statistics);
      sampleKeysLogged = true;
    }
    const sport = norm(match.sport ?? 'football');
    if (sport && !/football|soccer/.test(sport)) continue;

    const league = leagueLabel(match, null);
    add(toEntry(match, league));
    const hd = match.historical_snapshot?.historical_data ?? {};
    for (const side of ['home_team', 'away_team']) {
      for (const h of hd[side]?.matches ?? []) add(toEntry(h, null));
    }
  }
  return [...byKey.values()];
}

function run(script, ...fileArgs) {
  const r = spawnSync(process.execPath, [path.join(__dirname, script), ...fileArgs], { encoding: 'utf8' });
  if (r.stderr?.trim()) console.error(r.stderr.trim().split('\n').slice(0, 15).join('\n'));
  if (r.status !== 0) throw new Error(`${script} a échoué (code ${r.status})`);
  console.log(`  ${script} → ${r.stdout.trim()}`);
}

async function main() {
  fs.mkdirSync(RAW_DIR, { recursive: true });
  fs.mkdirSync(TMP_DIR, { recursive: true });

  // ---- 1) téléchargement (sauf --convert-only)
  if (!CONVERT_ONLY) {
    const { fetchFlashscoreMatches } = await import('../src/data/providers/flashscoreClient.js');
    const days = parseDays(DAYS_SPEC);
    const perRunUsd = Math.max(0.5, Number((MAX_USD_TOTAL / days.length).toFixed(2)));
    console.log(`Téléchargement FlashScore : ${days.length} journée(s) [${days.join(', ')}], historique depuis ${HISTORY_FROM_YEAR}, plafond ${MAX_USD_TOTAL} $ (${perRunUsd} $/journée).`);
    for (const offset of days) {
      const date = new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
      const file = path.join(RAW_DIR, `${date}.json`);
      if (fs.existsSync(file)) {
        console.log(`  ${date} : déjà téléchargé, ignoré (supprime le fichier pour re-télécharger).`);
        continue;
      }
      process.stdout.write(`  ${date} (offset ${offset}) … `);
      try {
        const matches = await fetchFlashscoreMatches({ sport: 'football', days: String(offset), mode: 'with-history', historyFromYear: HISTORY_FROM_YEAR, maxTotalChargeUsd: perRunUsd });
        fs.writeFileSync(file, JSON.stringify(matches), 'utf8');
        console.log(`${matches.length} matchs bruts.`);
      } catch (e) {
        console.log(`ÉCHEC : ${e.message}`);
      }
    }
  }

  // ---- 2) conversion depuis tous les bruts présents
  const rawFiles = fs.readdirSync(RAW_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  if (!rawFiles.length) {
    console.error('Aucun fichier brut dans data/runtime/flashscore-raw/ — rien à convertir.');
    process.exit(1);
  }
  const report = { generatedAt: new Date().toISOString(), rawFiles, unmappedStatKeys: {}, leagues: {} };
  const all = [];
  for (const f of rawFiles) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(RAW_DIR, f), 'utf8'));
      const entries = collectEntries(Array.isArray(raw) ? raw : raw.items ?? [], report);
      console.log(`  ${f} : ${entries.length} matchs terminés (avec historique).`);
      all.push(...entries);
    } catch (e) {
      console.error(`  ${f} illisible : ${e.message}`);
    }
  }
  // dédoublonnage inter-fichiers (le même historique revient d'un jour à l'autre)
  const dedup = new Map();
  for (const e of all) {
    const k = `${e.date}-${norm(e.homeName)}-${norm(e.awayName)}`;
    if (!dedup.has(k)) dedup.set(k, e);
  }
  const entries = [...dedup.values()].filter((e) => e.date >= `${HISTORY_FROM_YEAR}-01-01`);
  for (const e of entries) report.leagues[e.league ?? '(inconnue)'] = (report.leagues[e.league ?? '(inconnue)'] ?? 0) + 1;
  for (const [k, n] of unmapped) report.unmappedStatKeys[k] = n;
  const withStats = entries.filter((e) => Object.keys(e.teamStats.home).length > 0).length;
  report.summary = { matches: entries.length, withTeamStats: withStats };
  fs.writeFileSync(path.join(RAW_DIR, '_rapport.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n${entries.length} matchs uniques depuis ${HISTORY_FROM_YEAR}, dont ${withStats} avec stats d'équipe. Clés non reconnues : ${unmapped.size} (cf. flashscore-raw/_rapport.json).`);

  // ---- 3) fusion dans les fichiers de l'appli via les scripts existants
  const statsIn = path.join(TMP_DIR, 'stats.json');
  const resultsIn = path.join(TMP_DIR, 'results.json');
  const calendarIn = path.join(TMP_DIR, 'calendar.json');
  fs.writeFileSync(statsIn, JSON.stringify(entries), 'utf8');
  const scored = entries.filter((e) => e.homeGoals !== null && e.awayGoals !== null);
  fs.writeFileSync(resultsIn, JSON.stringify(scored.map(({ date, league, homeName, awayName, homeGoals, awayGoals }) => ({ date, league, homeName, awayName, homeGoals, awayGoals, source: 'flashscore' }))), 'utf8');
  fs.writeFileSync(calendarIn, JSON.stringify(scored.map(({ date, league, homeName, awayName, homeGoals, awayGoals }) => ({ date, league, homeName, awayName, status: 'finished', homeGoals, awayGoals, round: null, source: 'flashscore' }))), 'utf8');

  console.log('\nFusion dans les fichiers Cote Master :');
  run('merge-match-stats.mjs', MATCH_STATS_DIR, statsIn);
  run('merge-daily-results.mjs', path.join(RUNTIME_DIR, 'match-results.json'), resultsIn);
  run('merge-season-calendar.mjs', path.join(RUNTIME_DIR, 'season-calendar.json'), calendarIn);
  console.log('\nTerminé. Relance le serveur Cote Master (ou attends le rechargement) pour voir les stats dans Historique / Détail complet des statistiques.');
}

main().catch((e) => {
  console.error(`\nErreur : ${e.message}`);
  process.exit(1);
});
