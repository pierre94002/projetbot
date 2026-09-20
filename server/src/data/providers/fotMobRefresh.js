/**
 * fotMobRefresh.js
 * -----------------------------------------------------------------------
 * Complète les entrées déjà constituées par ESPN avec ce que FotMob publie
 * en plus : expected goals, xGOT, grosses occasions, duels, touches dans la
 * surface — et, par joueur, la note, les minutes, les passes et les duels.
 *
 * Purement additif. La fusion ne remplace jamais une valeur absente par un
 * vide, et ESPN reste maître des scores et des feuilles de match : FotMob ne
 * fait que remplir des cases restées vides.
 *
 * Appariement en trois conditions — championnat correspondant, DEUX noms
 * d'équipe concordants, ET score identique. Un seul candidat doit convenir ;
 * dans le doute on n'écrit rien, plutôt que d'attribuer à une rencontre les
 * statistiques d'une autre.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FOTMOB_LEAGUES, FOTMOB_REV, leagueKeyMatches, fetchMatchesByDate, fetchMatchStats } from './fotMobProvider.js';
import { teamNamesLikelyMatch } from '../../utils/teamNameMatch.js';
import { mergeMatchStats } from '../../../scripts/merge-match-stats.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME_DIR = path.resolve(__dirname, '../../../data/runtime');
const MATCH_STATS_DIR = path.join(RUNTIME_DIR, 'match-stats');

/** Témoin de reprise : une entrée déjà enrichie porte cette marque. */
const FOTMOB_SOURCE_MARK = 'fotmob.com/api/data/matchDetails';

const DEFAULT_CONCURRENCY = 3;
const FLUSH_EVERY = 120;

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function readStoredEntries() {
  const out = [];
  let files = [];
  try {
    files = fs.readdirSync(MATCH_STATS_DIR).filter((f) => /^\d{4}-\d{2}\.json$/.test(f));
  } catch {
    return out;
  }
  for (const file of files) {
    const entries = readJson(path.join(MATCH_STATS_DIR, file), []);
    if (Array.isArray(entries)) out.push(...entries);
  }
  return out;
}

async function pool(items, size, worker) {
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(size, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

/**
 * Importe des rencontres que le magasin ne connaît pas encore, en balayant
 * les journées d'une période.
 *
 * Sert aux championnats-saisons qu'ESPN n'a pas fournis — Serie B et Ligue 2
 * 2023-24, par exemple, dont il ne publie pas le calendrier. Un seul appel
 * par journée couvre toutes les compétitions, ce qui rend le balayage
 * abordable.
 */
export async function importMissingFromFotMob({ from, to, leagues = null, concurrency = DEFAULT_CONCURRENCY, onProgress = null } = {}) {
  const wanted = leagues ? Object.entries(FOTMOB_LEAGUES).filter(([name]) => leagues.includes(name)) : Object.entries(FOTMOB_LEAGUES);
  const known = new Set(readStoredEntries().map((e) => e.matchKey));
  const report = { days: 0, discovered: 0, skipped: 0, fetched: 0, merged: 0, playersMerged: 0, noStats: 0, failed: 0 };

  const days = [];
  for (let d = new Date(`${from}T12:00:00Z`); d <= new Date(`${to}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
  }
  report.days = days.length;

  const pending = [];
  let scanned = 0;
  await pool(days, concurrency, async (date) => {
    const dayMatches = await fetchMatchesByDate(date).catch(() => []);
    for (const match of dayMatches) {
      if (!match.finished || match.homeGoals === null || match.awayGoals === null) continue;
      const league = wanted.find(([, matcher]) => leagueKeyMatches(matcher, match.leagueKey))?.[0];
      if (!league) continue;
      report.discovered++;
      const matchKey = `${match.date}-${slugify(match.homeName)}-${slugify(match.awayName)}`;
      if (known.has(matchKey)) {
        report.skipped++;
        continue;
      }
      pending.push({ league, match });
    }
    scanned++;
    if (onProgress && scanned % 50 === 0) onProgress({ phase: 'scanning', done: scanned, total: days.length, found: pending.length });
  });
  onProgress?.({ phase: 'discovered', discovered: report.discovered, pending: pending.length, skipped: report.skipped });

  let batch = [];
  const flush = () => {
    if (!batch.length) return;
    const summary = mergeMatchStats(MATCH_STATS_DIR, batch);
    report.merged += summary.created + summary.updated;
    report.playersMerged += summary.playersMerged;
    batch = [];
  };

  let done = 0;
  await pool(pending, concurrency, async ({ league, match }) => {
    try {
      const stats = await fetchMatchStats(match.matchId);
      if (!stats) report.noStats++;
      else {
        report.fetched++;
        batch.push({
          date: match.date,
          league,
          homeName: match.homeName,
          awayName: match.awayName,
          homeGoals: match.homeGoals,
          awayGoals: match.awayGoals,
          teamStats: stats.teamStats,
          players: stats.players,
          events: stats.events,
          lineups: stats.lineups,
          meta: stats.meta,
          shotmap: stats.shotmap,
          sources: stats.sources
        });
      }
    } catch {
      report.failed++;
    }
    done++;
    if (batch.length >= FLUSH_EVERY) flush();
    if (onProgress && done % 50 === 0) onProgress({ phase: 'fetching', done, total: pending.length, merged: report.merged });
  });

  flush();
  onProgress?.({ phase: 'done', ...report });
  return report;
}

function slugify(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Entrées auxquelles FotMob pourrait encore apporter quelque chose. */
export function listPending({ leagues = null, since = null, until = null, force = false } = {}) {
  const wanted = leagues ? new Set(leagues) : null;
  return readStoredEntries().filter((entry) => {
    if (!entry?.date || !entry.league || !entry.homeName || !entry.awayName) return false;
    if (!FOTMOB_LEAGUES[entry.league]) return false;
    if (wanted && !wanted.has(entry.league)) return false;
    if (since && entry.date < since) return false;
    if (until && entry.date > until) return false;
    if (entry.homeGoals === null || entry.homeGoals === undefined) return false;
    const fetched = (entry.sources ?? []).some((s) => String(s).includes(FOTMOB_SOURCE_MARK));
    // `meta` n'apparaît qu'avec la version enrichie de la lecture (déroulé,
    // composition, cadre de la rencontre, carte des tirs). Une entrée qui
    // porte la source FotMob sans ce bloc vient d'un passage antérieur et
    // reste donc à reprendre — ce qui rend l'import reprenable après un
    // incident sans avoir à tout refaire avec --force.
    // La revision dit si l entree a ete lue avec la table de correspondance
    // courante : une mise a jour de celle-ci rend caduques les entrees plus
    // anciennes, qui sont alors reprises sans repasser sur tout le reste.
    const complete = fetched && entry.meta && entry.meta.rev === FOTMOB_REV;
    return force || !complete;
  });
}

/**
 * Apparie une de nos entrées à une rencontre FotMob du même jour. Refuse dès
 * que plusieurs candidats conviennent, ou que le score diverge — le score est
 * le garde-fou le plus sûr contre un mauvais appariement.
 */
function matchEntry(entry, dayMatches) {
  const leagueKey = FOTMOB_LEAGUES[entry.league];
  const candidates = dayMatches.filter(
    (m) =>
      leagueKeyMatches(leagueKey, m.leagueKey) &&
      teamNamesLikelyMatch(m.homeName, entry.homeName) &&
      teamNamesLikelyMatch(m.awayName, entry.awayName)
  );
  if (candidates.length !== 1) return null;
  const found = candidates[0];
  if (found.homeGoals !== entry.homeGoals || found.awayGoals !== entry.awayGoals) return null;
  return found;
}

/**
 * Enrichit les entrées depuis FotMob.
 *
 * Une journée est demandée une seule fois : l'appel « matchs du jour » couvre
 * toutes les compétitions d'un coup, contrairement à ESPN qui en exige un par
 * championnat.
 */
export async function refreshFromFotMob(options = {}) {
  const { concurrency = DEFAULT_CONCURRENCY, limit = null, onProgress = null } = options;
  const startedAt = new Date().toISOString();

  let pending = listPending(options);
  if (limit) pending = pending.slice(0, limit);

  const report = {
    startedAt,
    finishedAt: null,
    considered: pending.length,
    days: 0,
    matched: 0,
    unmatched: 0,
    fetched: 0,
    merged: 0,
    playersMerged: 0,
    noStats: 0,
    failed: 0,
    samples: { unmatched: [], failed: [] }
  };
  if (!pending.length) {
    report.finishedAt = new Date().toISOString();
    return report;
  }

  const byDate = new Map();
  for (const entry of pending) {
    if (!byDate.has(entry.date)) byDate.set(entry.date, []);
    byDate.get(entry.date).push(entry);
  }
  report.days = byDate.size;

  // Étape 1 : apparier, jour par jour.
  const pairs = [];
  let daysDone = 0;
  await pool([...byDate.entries()], concurrency, async ([date, entries]) => {
    const dayMatches = await fetchMatchesByDate(date).catch(() => []);
    for (const entry of entries) {
      const found = matchEntry(entry, dayMatches);
      if (found) pairs.push({ entry, fotMobId: found.matchId });
      else {
        report.unmatched++;
        if (report.samples.unmatched.length < 20) report.samples.unmatched.push(`${entry.date} ${entry.league} ${entry.homeName}-${entry.awayName}`);
      }
    }
    daysDone++;
    if (onProgress && daysDone % 50 === 0) onProgress({ phase: 'matching', done: daysDone, total: byDate.size, matched: pairs.length });
  });
  report.matched = pairs.length;
  onProgress?.({ phase: 'matched', matched: report.matched, unmatched: report.unmatched });

  // Étape 2 : récupérer et fusionner par lots.
  let batch = [];
  const flush = () => {
    if (!batch.length) return;
    const summary = mergeMatchStats(MATCH_STATS_DIR, batch);
    report.merged += summary.created + summary.updated;
    report.playersMerged += summary.playersMerged;
    batch = [];
  };

  let done = 0;
  await pool(pairs, concurrency, async ({ entry, fotMobId }) => {
    try {
      const stats = await fetchMatchStats(fotMobId);
      if (!stats) report.noStats++;
      else {
        report.fetched++;
        batch.push({
          date: entry.date,
          league: entry.league,
          // Les noms déjà stockés font foi : FotMob ne sert qu'à compléter.
          homeName: entry.homeName,
          awayName: entry.awayName,
          homeGoals: entry.homeGoals,
          awayGoals: entry.awayGoals,
          teamStats: stats.teamStats,
          players: stats.players,
          // Déroulé, composition, cadre de la rencontre et carte des tirs :
          // ce qui permet à la page de match de reproduire la source.
          events: stats.events,
          lineups: stats.lineups,
          meta: stats.meta,
          shotmap: stats.shotmap,
          sources: stats.sources
        });
      }
    } catch (error) {
      report.failed++;
      if (report.samples.failed.length < 20) report.samples.failed.push(`${entry.date} ${entry.homeName}-${entry.awayName} : ${error.message}`);
    }
    done++;
    if (batch.length >= FLUSH_EVERY) flush();
    if (onProgress && done % 50 === 0) onProgress({ phase: 'fetching', done, total: pairs.length, merged: report.merged });
  });

  flush();
  report.finishedAt = new Date().toISOString();
  onProgress?.({ phase: 'done', ...report });
  return report;
}
