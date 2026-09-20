/**
 * espnScheduleRefresh.js
 * -----------------------------------------------------------------------
 * Calendrier de saison et classements, depuis l'API JSON publique d'ESPN.
 *
 * Remplace la recherche web quotidienne qui les alimentait jusqu'ici : celle-
 * ci passait par un modèle de langage, consommait le quota hebdomadaire et
 * lisait des pages résumées — c'est ainsi que huit résultats faux se sont
 * glissés dans le calendrier le 20 septembre 2026, dont six rencontres
 * enregistrées comme terminées alors qu'elles étaient en cours ou pas encore
 * jouées. La lecture d'un JSON nommé ne fait pas ce genre d'erreur : ESPN
 * déclare explicitement l'état de chaque rencontre.
 *
 * Gratuit, sans clé, sans quota — donc exécutable en boucle.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { ESPN_LEAGUE_SLUGS, fetchEvents, fetchSeasonMatchDays, fetchStandings } from './espnMatchStatsProvider.js';
import { findBestTeamNameMatch } from '../../utils/teamNameMatch.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME_DIR = path.resolve(__dirname, '../../../data/runtime');
const CALENDAR_FILE = path.join(RUNTIME_DIR, 'season-calendar.json');
const STANDINGS_FILE = path.join(RUNTIME_DIR, 'standings-web.json');
const MERGE_CALENDAR_SCRIPT = path.resolve(__dirname, '../../../scripts/merge-season-calendar.mjs');

const DEFAULT_CONCURRENCY = 4;

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function pool(items, size, worker) {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(size, items.length)) }, async () => {
      while (cursor < items.length) await worker(items[cursor++]);
    })
  );
}

/** Date décalée de N jours par rapport à aujourd'hui, au format AAAA-MM-JJ. */
function shiftDay(days, now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Année de début de la saison en cours (une saison commence le 1er juillet). */
function currentSeasonYear(now = new Date()) {
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

/** Noms d'équipe déjà employés par le projet, pour éviter les doublons. */
function knownNamesByLeague() {
  const byLeague = new Map();
  for (const fixture of readJson(CALENDAR_FILE, [])) {
    if (!fixture?.league) continue;
    if (!byLeague.has(fixture.league)) byLeague.set(fixture.league, new Set());
    byLeague.get(fixture.league).add(fixture.homeName);
    byLeague.get(fixture.league).add(fixture.awayName);
  }
  return byLeague;
}

function canonicalName(espnName, league, known) {
  const candidates = known.get(league);
  if (!candidates?.size) return espnName;
  return findBestTeamNameMatch(espnName, [...candidates].filter(Boolean)) ?? espnName;
}

/**
 * Reconstruit le calendrier d'une saison depuis ESPN et le fusionne.
 *
 * La fusion passe par scripts/merge-season-calendar.mjs, qui tient le contrat
 * (identifiant stable, déplacement d'un match reporté, refus d'écraser un
 * score déjà connu par un score différent). L'appeler plutôt que réécrire le
 * fichier évite d'en tenir une seconde version.
 */
export async function refreshCalendarFromEspn({
  season = currentSeasonYear(),
  leagues = null,
  concurrency = DEFAULT_CONCURRENCY,
  // Fenêtre glissante, en jours autour d'aujourd'hui. Une saison entière
  // représente plusieurs milliers d'appels : inutile à chaque passage, puisque
  // seuls les jours récents (résultats qui tombent) et proches (programme qui
  // se précise) changent. `null` traite la saison complète.
  pastDays = 7,
  futureDays = 30,
  onProgress = null
} = {}) {
  const wanted = leagues ? Object.entries(ESPN_LEAGUE_SLUGS).filter(([name]) => leagues.includes(name)) : Object.entries(ESPN_LEAGUE_SLUGS);
  const known = knownNamesByLeague();
  const report = { season, days: 0, fixtures: 0, unavailable: [], merge: null };

  const windowed = pastDays !== null && futureDays !== null;
  const from = windowed ? shiftDay(-pastDays) : null;
  const to = windowed ? shiftDay(futureDays) : null;

  const tasks = [];
  for (const [leagueName, slug] of wanted) {
    const days = await fetchSeasonMatchDays(slug, season).catch(() => null);
    if (!days?.length) {
      report.unavailable.push(leagueName);
      continue;
    }
    for (const date of days) {
      if (windowed && (date < from || date > to)) continue;
      tasks.push({ leagueName, slug, date });
    }
  }
  report.days = tasks.length;
  onProgress?.({ phase: 'days', days: report.days });

  const payload = [];
  let done = 0;
  await pool(tasks, concurrency, async ({ leagueName, slug, date }) => {
    const events = await fetchEvents(slug, date).catch(() => []);
    for (const event of events) {
      if (!event.homeName || !event.awayName) continue;
      payload.push({
        date: event.date,
        league: leagueName,
        homeName: canonicalName(event.homeName, leagueName, known),
        awayName: canonicalName(event.awayName, leagueName, known),
        status: event.status,
        homeGoals: event.homeGoals,
        awayGoals: event.awayGoals,
        round: null,
        source: 'espn'
      });
    }
    done++;
    if (onProgress && done % 100 === 0) onProgress({ phase: 'scanning', done, total: tasks.length, fixtures: payload.length });
  });

  // Une rencontre peut figurer sur deux journées voisines selon le fuseau.
  const unique = [...new Map(payload.map((f) => [`${f.date}|${f.homeName}|${f.awayName}`, f])).values()];
  report.fixtures = unique.length;
  if (!unique.length) return report;

  const tmp = path.join(os.tmpdir(), `cotemaster-calendar-${Date.now()}.json`);
  fs.writeFileSync(tmp, JSON.stringify(unique), 'utf8');
  try {
    const { stdout } = await execFileAsync(process.execPath, [MERGE_CALENDAR_SCRIPT, CALENDAR_FILE, tmp], { maxBuffer: 16 * 1024 * 1024 });
    report.merge = JSON.parse(String(stdout).trim().split('\n').pop());
  } finally {
    fs.rmSync(tmp, { force: true });
  }
  onProgress?.({ phase: 'done', ...report });
  return report;
}

/**
 * Rafraîchit standings-web.json depuis les tableaux d'ESPN.
 *
 * PÉNALITÉS DE POINTS — ESPN les répercute pour certains championnats et pas
 * pour d'autres (la Super League chinoise oui, les −4 de Southampton non).
 * On compare donc, pour chaque ligne, les points annoncés au total brut
 * V×3+N : si ESPN montre déjà un écart, on le suit ; s'il n'en montre aucun
 * alors que la ligne stockée en portait un, on reporte celui-ci et on le
 * signale, plutôt que d'effacer une pénalité bien réelle.
 */
export async function refreshStandingsFromEspn({ leagues = null, onProgress = null } = {}) {
  const wanted = leagues ? Object.entries(ESPN_LEAGUE_SLUGS).filter(([name]) => leagues.includes(name)) : Object.entries(ESPN_LEAGUE_SLUGS);
  const stored = readJson(STANDINGS_FILE, {});
  const report = { leagues: 0, rows: 0, unavailable: [], deductionsKept: [], staleKept: [], anomalies: [] };
  const now = new Date().toISOString();

  for (const [leagueName, slug] of wanted) {
    const rows = await fetchStandings(slug).catch(() => null);
    if (!rows?.length) {
      report.unavailable.push(leagueName);
      continue;
    }

    const previous = new Map((stored[leagueName]?.rows ?? []).map((r) => [r.teamName, r]));
    const merged = rows.map((row) => {
      const before = previous.get(row.teamName) ?? findRow(previous, row.teamName);

      // Le tableau d'ESPN accuse quelques heures de retard sur les rencontres
      // du jour. Or le nombre de matchs joués d'une équipe ne DIMINUE jamais
      // au cours d'une saison : une ligne qui régresse est périmée, on garde
      // donc celle qu'on a. Sans ce garde-fou, un passage en fin de matinée
      // effacerait les résultats de la veille au soir.
      if (before && Number.isFinite(before.played) && row.played < before.played) {
        report.staleKept.push(`${leagueName} | ${row.teamName} : ESPN ${row.played} J < ${before.played} J en base`);
        return { ...before };
      }

      const rawPoints = row.won * 3 + row.drawn;
      const espnDeduction = row.points - rawPoints;
      const storedDeduction = before ? before.points - (before.won * 3 + before.drawn) : 0;

      let points = row.points;
      if (espnDeduction === 0 && storedDeduction !== 0) {
        points = rawPoints + storedDeduction;
        report.deductionsKept.push(`${leagueName} | ${row.teamName} : ${storedDeduction}`);
      }
      return {
        rank: 0,
        teamId: before?.teamId ?? `web-${slugify(row.teamName)}`,
        teamName: before?.teamName ?? row.teamName,
        teamLogo: before?.teamLogo ?? null,
        played: row.played,
        won: row.won,
        drawn: row.drawn,
        lost: row.lost,
        goalsFor: row.goalsFor,
        goalsAgainst: row.goalsAgainst,
        goalDiff: row.goalsFor - row.goalsAgainst,
        points,
        description: before?.description ?? null,
        home: before?.home ?? { played: 0, goalsFor: 0, goalsAgainst: 0 },
        away: before?.away ?? { played: 0, goalsFor: 0, goalsAgainst: 0 }
      };
    });

    // Contrôles internes : un tableau où les buts pour ne totalisent pas les
    // buts contre, ou dont une ligne a V+N+D ≠ J, est incohérent — on le
    // signale plutôt que de l'enregistrer en silence.
    const goalsFor = merged.reduce((sum, r) => sum + r.goalsFor, 0);
    const goalsAgainst = merged.reduce((sum, r) => sum + r.goalsAgainst, 0);
    if (goalsFor !== goalsAgainst) report.anomalies.push(`${leagueName} : buts pour ${goalsFor} ≠ buts contre ${goalsAgainst}`);
    for (const r of merged) {
      if (r.won + r.drawn + r.lost !== r.played) report.anomalies.push(`${leagueName} | ${r.teamName} : V+N+D ≠ J`);
    }

    merged.sort((a, b) => b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor || a.teamName.localeCompare(b.teamName));
    merged.forEach((r, i) => {
      r.rank = i + 1;
    });

    stored[leagueName] = {
      leagueName,
      season: stored[leagueName]?.season ?? currentSeasonYear() + 1,
      updatedAt: now,
      rows: merged
    };
    report.leagues++;
    report.rows += merged.length;
    onProgress?.({ phase: 'league', league: leagueName, rows: merged.length });
  }

  if (report.leagues) fs.writeFileSync(STANDINGS_FILE, `${JSON.stringify(stored, null, 2)}\n`, 'utf8');
  return report;
}

function slugify(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Ligne existante dont le nom correspond, même écrit autrement. */
function findRow(previous, teamName) {
  const match = findBestTeamNameMatch(teamName, [...previous.keys()]);
  return match ? previous.get(match) : null;
}
