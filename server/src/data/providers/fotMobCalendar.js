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
import os from 'node:os';
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

/**
 * Vrai pendant que le script enfant fusionne match-results.json : il lit le
 * fichier, calcule, puis le remplace. Un score saisi à la main pendant ce
 * temps serait écrasé par son remplacement ; la route de saisie attend donc
 * la fin de la fusion (quelques secondes).
 */
let fusionResultats = false;
export const isResultsMergeRunning = () => fusionResultats;

async function pool(items, size, worker) {
  let index = 0;
  const runners = Array.from({ length: Math.max(1, size) }, async () => {
    while (index < items.length) await worker(items[index++]);
  });
  await Promise.all(runners);
}

/** Supprime un tampon de fusion ; s'il résiste, il reste dans le dossier temporaire du système, sans conséquence. */
function supprimerTampon(fichier) {
  try {
    fs.rmSync(fichier, { force: true });
  } catch {
    // Nom unique, hors du projet : rien ne le relira.
  }
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
  // Les journées en échec sont gardées : l'actualisation repartira de la
  // première d'entre elles au lieu de les perdre (cf. matchStatsAutoRefresh.js).
  const joursEnEchec = [];
  let faites = 0;
  await pool(dates, concurrency, async (date) => {
    let rencontres;
    try {
      rencontres = await fetchMatchesByDate(date);
    } catch {
      echecs++;
      joursEnEchec.push(date);
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
    failedDates: joursEnEchec.sort(),
    matches: sorties.length,
    upcoming: sorties.filter((s) => s.status === 'scheduled').length,
    byLeague,
    merge: null,
    mergeError: null,
    results: null,
    resultsError: null
  };
  if (dryRun || !sorties.length) return report;

  // Les tampons vivent dans le dossier temporaire du système, hors du projet :
  // laissés dans data/runtime, ils ressemblaient à des données (20 253 lignes
  // de calendrier dupliqué sont ainsi parties dans un commit), et OneDrive,
  // qui envoie chaque fichier qui y apparaît, pouvait en refuser la
  // suppression — l'exception faisait alors échouer toute l'étape. Toujours
  // supprimés, mais sans conséquence si l'un résiste.
  const tampon = path.join(os.tmpdir(), `cotemaster-calendrier-fotmob-${process.pid}-${Date.now()}.json`);
  try {
    fs.writeFileSync(tampon, JSON.stringify(sorties));
    const { stdout } = await execFileAsync(process.execPath, [path.join(SCRIPTS_DIR, 'merge-season-calendar.mjs'), CALENDRIER, tampon], { maxBuffer: 64 * 1024 * 1024 });
    report.merge = bilanDe(stdout);
  } catch (error) {
    // Calendrier illisible (le script refuse alors d'écrire) : signalé, et
    // les résultats sont quand même fusionnés, ils ne dépendent pas de lui.
    report.mergeError = `${error.stdout ?? ''}${error.stderr ?? error.message}`.trim().slice(-2000);
  } finally {
    supprimerTampon(tampon);
  }

  const termines = sorties.filter((s) => s.status === 'finished' && s.homeGoals !== null && s.awayGoals !== null);
  if (termines.length) {
    const tamponR = path.join(os.tmpdir(), `cotemaster-resultats-fotmob-${process.pid}-${Date.now()}.json`);
    try {
      fs.writeFileSync(tamponR, JSON.stringify(termines));
      fusionResultats = true;
      const { stdout } = await execFileAsync(process.execPath, [path.join(SCRIPTS_DIR, 'merge-daily-results.mjs'), RESULTATS, tamponR], { maxBuffer: 64 * 1024 * 1024 });
      report.results = bilanDe(stdout);
    } catch (error) {
      // Le script ne sort en erreur que s'il n'a PAS pu écrire (fichier
      // illisible, disque) ; un score divergent, lui, est compté dans
      // `results.conflicts` et détaillé dans `results.conflictsList`. Le
      // calendrier est déjà écrit.
      report.resultsError = `${error.stdout ?? ''}${error.stderr ?? error.message}`.trim().slice(-2000);
    } finally {
      fusionResultats = false;
      supprimerTampon(tamponR);
    }
  }
  onProgress?.({ phase: 'done', ...report });
  return report;
}
