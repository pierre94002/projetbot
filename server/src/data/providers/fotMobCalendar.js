/**
 * -----------------------------------------------------------------------
 * Calendrier des compétitions suivies, lu chez FotMob.
 * -----------------------------------------------------------------------
 * Balaye les journées d'une période — un appel par jour couvre TOUTES les
 * compétitions — et fusionne ce qu'il trouve dans season-calendar.json
 * (matchs joués et à venir) et match-results.json (les rencontres
 * terminées, c'est-à-dire ce que lit le règlement des paris).
 *
 * Remplace refreshCalendarFromEspn dans la boucle automatique du serveur :
 * ESPN ne publiait pas tous les championnats suivis, et la règle est
 * qu'hors cotes, tout vienne de FotMob. La ligne de commande
 * (scripts/fotmob-season-calendar.mjs) appelle la même fonction.
 *
 * La fusion passe par les scripts merge-season-calendar.mjs et
 * merge-daily-results.mjs, seuls dépositaires du contrat de ces deux
 * fichiers (reports, refus de remplacer un score connu).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { FOTMOB_LEAGUES, leagueKeyMatches, fetchMatchesByDate } from './fotMobProvider.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME_DIR = path.resolve(__dirname, '../../../data/runtime');
const SCRIPTS_DIR = path.resolve(__dirname, '../../../scripts');
const CALENDRIER = path.join(RUNTIME_DIR, 'season-calendar.json');
const RESULTATS = path.join(RUNTIME_DIR, 'match-results.json');

const jour = (d) => d.toISOString().slice(0, 10);

async function pool(items, size, worker) {
  let index = 0;
  const runners = Array.from({ length: Math.max(1, size) }, async () => {
    while (index < items.length) await worker(items[index++]);
  });
  await Promise.all(runners);
}

/** Dernière ligne JSON d'une sortie de script, ou le texte brut. */
function bilanDe(stdout) {
  const ligne = String(stdout ?? '').trim().split('\n').pop();
  try {
    return JSON.parse(ligne);
  } catch {
    return { raw: String(stdout ?? '').trim() };
  }
}

/**
 * @param {object} options
 * @param {string|null} options.from  première journée (défaut : il y a 7 jours)
 * @param {string|null} options.to    dernière journée (défaut : from + days)
 * @param {number} options.days       horizon en jours quand `to` est absent
 * @param {string[]|null} options.leagues  restreindre à ces championnats
 * @param {boolean} options.dryRun    relever sans rien écrire
 */
export async function refreshCalendarFromFotMob({
  from = null,
  to = null,
  days = 45,
  leagues = null,
  concurrency = 3,
  dryRun = false,
  onProgress = null
} = {}) {
  const debut = from ?? jour(new Date(Date.now() - 7 * 86_400_000));
  const fin = to ?? jour(new Date(Date.now() + days * 86_400_000));
  const voulus = leagues
    ? Object.entries(FOTMOB_LEAGUES).filter(([nom]) => leagues.includes(nom))
    : Object.entries(FOTMOB_LEAGUES);
  if (!voulus.length) throw new Error(`Aucune compétition connue parmi : ${(leagues ?? []).join(', ')}`);

  const dates = [];
  for (let d = new Date(`${debut}T12:00:00Z`); d <= new Date(`${fin}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(jour(d));
  }

  const sorties = [];
  let echecs = 0;
  let faites = 0;
  await pool(dates, concurrency, async (date) => {
    let rencontres;
    try {
      rencontres = await fetchMatchesByDate(date);
    } catch {
      echecs++;
      return;
    } finally {
      faites++;
      if (onProgress && faites % 25 === 0) onProgress({ phase: 'scanning', done: faites, total: dates.length, found: sorties.length });
    }
    for (const m of rencontres) {
      const league = voulus.find(([, motif]) => leagueKeyMatches(motif, m.leagueKey))?.[0];
      if (!league || !m.homeName || !m.awayName) continue;
      // Un match abandonné n'entre pas au calendrier : son score est celui de
      // l'arrêt, et le règlement des paris le lirait comme un résultat. La
      // reprise ou le match rejoué, eux, sont des rencontres ordinaires.
      if (m.cancelled) continue;
      sorties.push({
        date: m.date,
        league,
        homeName: m.homeName,
        awayName: m.awayName,
        // « terminé » se lit sur le drapeau de la source, pas sur la présence
        // d'un score : un match arrêté ou en cours en affiche un aussi.
        status: m.played ? 'finished' : 'scheduled',
        homeGoals: m.played ? m.homeGoals : null,
        awayGoals: m.played ? m.awayGoals : null,
        round: null,
        source: 'fotmob'
      });
    }
  });
  sorties.sort((a, b) => a.date.localeCompare(b.date) || a.league.localeCompare(b.league));

  const byLeague = {};
  for (const s of sorties) {
    const l = (byLeague[s.league] ??= { matches: 0, upcoming: 0 });
    l.matches++;
    if (s.status === 'scheduled') l.upcoming++;
  }
  const report = {
    from: debut,
    to: fin,
    days: dates.length,
    failures: echecs,
    matches: sorties.length,
    upcoming: sorties.filter((s) => s.status === 'scheduled').length,
    byLeague,
    merge: null,
    results: null,
    resultsError: null
  };
  if (dryRun || !sorties.length) return report;

  // Les tampons sont supprimés QUOI QU'IL ARRIVE : laissés sur le disque, ils
  // ressemblent à des données du projet, et 20 253 lignes de calendrier
  // dupliqué sont ainsi parties dans un commit.
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  const tampon = path.join(RUNTIME_DIR, 'calendrier-fotmob.json');
  try {
    fs.writeFileSync(tampon, JSON.stringify(sorties));
    const { stdout } = await execFileAsync(process.execPath, [path.join(SCRIPTS_DIR, 'merge-season-calendar.mjs'), CALENDRIER, tampon], { maxBuffer: 64 * 1024 * 1024 });
    report.merge = bilanDe(stdout);
  } finally {
    fs.rmSync(tampon, { force: true });
  }

  const termines = sorties.filter((s) => s.status === 'finished' && s.homeGoals !== null && s.awayGoals !== null);
  if (termines.length) {
    const tamponR = path.join(RUNTIME_DIR, 'resultats-fotmob.json');
    try {
      fs.writeFileSync(tamponR, JSON.stringify(termines));
      const { stdout } = await execFileAsync(process.execPath, [path.join(SCRIPTS_DIR, 'merge-daily-results.mjs'), RESULTATS, tamponR], { maxBuffer: 64 * 1024 * 1024 });
      report.results = bilanDe(stdout);
    } catch (error) {
      // Un score divergent fait sortir le script en erreur : c'est un signal,
      // pas une panne. Le calendrier, lui, est déjà écrit.
      report.resultsError = `${error.stdout ?? ''}${error.stderr ?? error.message}`.trim();
    } finally {
      fs.rmSync(tamponR, { force: true });
    }
  }
  onProgress?.({ phase: 'done', ...report });
  return report;
}
