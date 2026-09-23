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
import { markNoSheet, openDb, deleteMatches } from '../db/matchStatsDb.js';
import { rebuildRegistries } from '../db/identityRegistry.js';
import { storedEntriesIndex } from '../db/matchStatsRead.js';

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

// Les entrées déjà connues viennent de la base, plus des fichiers JSON
// mensuels : ceux-ci pesaient 1,5 Go et étaient relus ENTIÈREMENT à chaque
// appel — au démarrage d'un import, d'un relevé de retard, d'une reprise.
// Une requête indexée rend la même chose en une seconde.

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
  const known = new Set(storedEntriesIndex().keys());
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
      // Terminée SANS être annulée : une rencontre abandonnée est publiée
      // « finished » avec son score provisoire (cf. fetchMatchesByDate).
      if (!match.played || match.homeGoals === null || match.awayGoals === null) continue;
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
      // Pas de feuille de match, mais une rencontre JOUÉE avec son score :
      // elle entre quand même, sans relevé — avec ce que la page dit encore
      // (journée, phase, composition, buteurs). La version qui la laissait
      // tomber amputait des saisons entières — la Serbie et Israël 2023-24
      // et 2024-25, que FotMob publie sans statistiques détaillées — et un
      // classement calculé sur les matchs restants aurait été faux plutôt
      // qu'absent. Les statistiques manquantes se voient ; des rencontres
      // qui n'ont jamais existé, non.
      if (!stats || stats.noSheet) report.noStats++; else report.fetched++;
      batch.push(entreeDepuis(stats, {
        date: match.date,
        league,
        homeName: match.homeName,
        awayName: match.awayName,
        homeId: match.homeId,
        awayId: match.awayId,
        fotmobId: String(match.matchId),
        homeGoals: match.homeGoals,
        awayGoals: match.awayGoals,
        leagueKey: match.leagueKey
      }));
    } catch {
      report.failed++;
    }
    done++;
    if (batch.length >= FLUSH_EVERY) flush();
    if (onProgress && done % 50 === 0) onProgress({ phase: 'fetching', done, total: pending.length, merged: report.merged });
  });

  flush();
  // Les annuaires ne se reconstruisent que si quelque chose est entré : la
  // reconstruction est complète (huit secondes, bloquantes) et une passe
  // périodique qui n'a rien trouvé n'a rien à y changer.
  if (report.merged) refreshRegistries(report);
  onProgress?.({ phase: 'done', ...report });
  return report;
}

/**
 * Une entrée du magasin à partir d'une page FotMob — ou de la seule liste du
 * jour quand la page manque. Le score de la PAGE d'abord : celui d'un match
 * repris porte le résultat final, celui d'un match attribué le résultat de
 * la fédération, là où la liste du jour garde le score du terrain.
 *
 * `replacePlayers` : une feuille complète fait foi sur les lignes joueur du
 * match. Ce qu'elle ne porte plus est retiré — identité provisoire que
 * FotMob a fusionnée depuis (Cherif sous « Mohamed Bangoura » pendant trois
 * journées), ligne ESPN sous une autre graphie du même homme (« Jojo
 * Wollacott » à côté de « Joseph Wollacott » : deux gardiens pour un, 7 961
 * lignes dans 902 rencontres). Sans relevé, rien n'est retiré : on n'a pas
 * de quoi trancher.
 */
function entreeDepuis(stats, base) {
  const sansReleve = !stats || stats.noSheet;
  const entree = {
    date: base.date,
    league: base.league,
    homeName: base.homeName ?? stats?.homeName,
    awayName: base.awayName ?? stats?.awayName,
    homeId: stats?.homeId ?? base.homeId ?? null,
    awayId: stats?.awayId ?? base.awayId ?? null,
    fotmobId: stats?.fotmobId ?? base.fotmobId,
    homeGoals: stats?.homeGoals ?? base.homeGoals ?? null,
    awayGoals: stats?.awayGoals ?? base.awayGoals ?? null,
    meta: {
      ...(stats?.meta ?? {}),
      rev: FOTMOB_REV,
      ...(sansReleve ? { noSheet: true } : {}),
      // L'intitulé exact de la PHASE chez FotMob (« MEX|Liga MX Apertura
      // Playoff »), lu dans la liste du jour : c'est lui qui distingue un
      // tournoi d'ouverture d'un tournoi de clôture, une phase régulière de
      // ses playoffs ou de ses barrages.
      ...(base.leagueKey ? { leagueKey: base.leagueKey } : {})
    },
    replacePlayers: !sansReleve,
    sources: stats?.sources ?? [`https://www.fotmob.com/api/data/matchDetails?matchId=${base.fotmobId}`]
  };
  if (stats) Object.assign(entree, { teamStats: stats.teamStats, players: stats.players, events: stats.events, lineups: stats.lineups, shotmap: stats.shotmap });
  return entree;
}

/**
 * L'intitulé de phase le plus fréquent du magasin pour chaque identifiant de
 * phase FotMob : ce qui permet d'étiqueter une rencontre importée par
 * identifiant, sans liste du jour — puisque c'est précisément la liste du
 * jour qui l'avait omise.
 */
function leagueKeysByLeagueId({ database = openDb() } = {}) {
  const parPhase = new Map();
  const rows = database.prepare(
    `SELECT json_extract(meta, '$.leagueId') AS lid, json_extract(meta, '$.leagueKey') AS k, COUNT(*) AS n
     FROM matches
     WHERE json_extract(meta, '$.leagueId') IS NOT NULL AND json_extract(meta, '$.leagueKey') IS NOT NULL
     GROUP BY lid, k`
  ).all();
  for (const r of rows) {
    const connu = parPhase.get(Number(r.lid));
    if (!connu || connu.n < r.n) parPhase.set(Number(r.lid), { k: r.k, n: r.n });
  }
  return new Map([...parPhase].map(([lid, v]) => [lid, v.k]));
}

/**
 * Importe des rencontres par IDENTIFIANT FotMob, quand la liste du jour les
 * a omises : trois journées entières de Bolivie, d'Équateur et du Paraguay
 * (18-20 juillet 2025), trois matchs brésiliens de mars 2026, huit
 * rencontres canadiennes — la page de la compétition les connaît, la liste
 * du jour non (cf. fotMobFixtureGaps.js). La date est celle du coup d'envoi
 * UTC, comme partout dans le magasin ; seules les rencontres TERMINÉES
 * entrent.
 */
export async function importFotmobIds(ids, { league, concurrency = DEFAULT_CONCURRENCY, onProgress = null } = {}) {
  const report = { requested: ids.length, fetched: 0, noStats: 0, notFinished: 0, failed: 0, merged: 0, playersMerged: 0, samples: { failed: [] } };
  if (!ids.length) return report;
  const phases = leagueKeysByLeagueId();
  // L'intitulé de phase DÉJÀ stocké fait foi pour une rencontre connue : la
  // phase la plus fréquente d'un identifiant est fausse dès que playoffs et
  // saison régulière partagent cet identifiant (MLS) — une relecture avait
  // rendu la finale de la MLS Cup 2024 « saison régulière ».
  const cleConnue = openDb().prepare("SELECT json_extract(meta, '$.leagueKey') AS k FROM matches WHERE fotmob_id = ? LIMIT 1");
  let batch = [];
  const flush = () => {
    if (!batch.length) return;
    const summary = mergeMatchStats(MATCH_STATS_DIR, batch);
    report.merged += summary.created + summary.updated;
    report.playersMerged += summary.playersMerged;
    batch = [];
  };
  let done = 0;
  await pool(ids, concurrency, async (id) => {
    try {
      const stats = await fetchMatchStats(id);
      const date = stats?.meta?.kickoff ? String(stats.meta.kickoff).slice(0, 10) : null;
      if (!stats || !date) {
        report.failed++;
        if (report.samples.failed.length < 20) report.samples.failed.push(`${id} : page absente`);
        return;
      }
      if (!stats.finished) { report.notFinished++; return; }
      if (stats.noSheet) report.noStats++; else report.fetched++;
      const leagueKey = cleConnue.get(String(id))?.k ?? phases.get(Number(stats.meta?.leagueId)) ?? null;
      batch.push(entreeDepuis(stats, { date, league, fotmobId: String(id), leagueKey }));
    } catch (error) {
      report.failed++;
      if (report.samples.failed.length < 20) report.samples.failed.push(`${id} : ${error.message}`);
    } finally {
      done++;
      if (batch.length >= FLUSH_EVERY) flush();
      if (onProgress && done % 50 === 0) onProgress({ phase: 'fetching', done, total: ids.length, merged: report.merged });
    }
  });
  flush();
  if (report.merged) refreshRegistries(report);
  return report;
}

/**
 * Remet les annuaires d'identités en accord avec le magasin, une fois la
 * passe terminée.
 *
 * À la FIN, pas à chaque lot : la reconstruction est complète (huit secondes
 * sur 810 000 lignes) et la rejouer tous les cinquante matchs coûterait
 * davantage que l'import lui-même. Une reconstruction complète plutôt
 * qu'incrémentale parce qu'un annuaire qui s'écarte de sa source est pire
 * que pas d'annuaire du tout : ici, il ne peut pas s'en écarter.
 *
 * Un échec est consigné, jamais propagé : l'import, lui, a réussi, et
 * perdre les statistiques importées parce qu'un index n'a pas pu se refaire
 * serait une régression bien plus grave que l'index manquant.
 */
function refreshRegistries(report) {
  try {
    const debut = Date.now();
    const bilan = rebuildRegistries();
    report.registries = { ...bilan, ms: Date.now() - debut };
  } catch (error) {
    report.warnings = [...(report.warnings ?? []), `Annuaires d'identités non reconstruits : ${error.message}`];
  }
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
  return [...storedEntriesIndex().values()].filter((entry) => {
    if (!entry?.date || !entry.league || !entry.homeName || !entry.awayName) return false;
    if (!FOTMOB_LEAGUES[entry.league]) return false;
    if (wanted && !wanted.has(entry.league)) return false;
    if (since && entry.date < since) return false;
    if (until && entry.date > until) return false;
    if (entry.homeGoals === null || entry.homeGoals === undefined) return false;
    const fetched = entry.fromFotmob;
    // `meta` n'apparaît qu'avec la version enrichie de la lecture (déroulé,
    // composition, cadre de la rencontre, carte des tirs). Une entrée qui
    // porte la source FotMob sans ce bloc vient d'un passage antérieur et
    // reste donc à reprendre — ce qui rend l'import reprenable après un
    // incident sans avoir à tout refaire avec --force.
    // La revision dit si l entree a ete lue avec la table de correspondance
    // courante : une mise a jour de celle-ci rend caduques les entrees plus
    // anciennes, qui sont alors reprises sans repasser sur tout le reste.
    const complete = fetched && entry.metaRev === FOTMOB_REV;
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
    cancelled: 0,
    idReused: 0,
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
      // Par IDENTIFIANT quand l'entrée en porte déjà un : c'est exact, là où
      // le rapprochement par les noms refuse « Man United » contre
      // « Manchester United » et laissait ces feuilles à jamais incomplètes.
      // La liste du jour reste lue pour l'intitulé de la phase.
      const found = (entry.fotmobId && dayMatches.find((m) => m.matchId === String(entry.fotmobId))) || matchEntry(entry, dayMatches);
      if (found) pairs.push({ entry, fotMobId: found.matchId, leagueKey: found.leagueKey });
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
  // Les rencontres que la source publie sans relevé : marquées comme telles
  // à la fin, pour ne pas être redemandées à chaque passe (cf. markNoSheet).
  const sansFeuille = [];
  const annulees = [];
  await pool(pairs, concurrency, async ({ entry, fotMobId, leagueKey }) => {
    try {
      const stats = await fetchMatchStats(fotMobId);
      // Annulée chez FotMob (finished=false, cancelled=true) : Binacional
      // exclu de la Liga 1 péruvienne 2025, ses matchs de Clausura effacés —
      // la page garde le score et la feuille, mais ce n'est plus un résultat.
      const annulee = Boolean(stats?.cancelled) && !stats?.awarded;
      // Identifiant RÉATTRIBUÉ par FotMob à une autre rencontre (Mirassol -
      // Vasco 2025 → 2026, même identifiant) : la page décrit un match à des
      // mois de la date du magasin. On ne l'applique pas.
      const kickoff = stats?.meta?.kickoff ? String(stats.meta.kickoff).slice(0, 10) : null;
      const reattribue = Boolean(kickoff) && Math.abs(Date.parse(kickoff) - Date.parse(entry.date)) > 45 * 86_400_000;
      if (annulee) {
        report.cancelled++;
        annulees.push(entry.matchKey);
      } else if (reattribue) {
        report.idReused++;
        if (report.samples.failed.length < 20) report.samples.failed.push(`${entry.date} ${entry.homeName}-${entry.awayName} : identifiant ${fotMobId} réattribué (coup d'envoi ${kickoff})`);
      } else if (!stats || stats.noSheet) {
        report.noStats++;
        sansFeuille.push(entry.matchKey);
      } else report.fetched++;
      if (stats && !annulee && !reattribue) {
        batch.push(entreeDepuis(stats, {
          date: entry.date,
          league: entry.league,
          // Les noms déjà stockés font foi : FotMob ne sert qu'à compléter.
          homeName: entry.homeName,
          awayName: entry.awayName,
          fotmobId: String(fotMobId),
          homeGoals: entry.homeGoals,
          awayGoals: entry.awayGoals,
          leagueKey
        }));
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
  if (annulees.length) {
    try {
      deleteMatches(annulees);
    } catch (error) {
      report.warnings = [...(report.warnings ?? []), `Rencontres annulées non retirées : ${error.message}`];
    }
  }
  if (sansFeuille.length) {
    try {
      report.markedNoSheet = markNoSheet(sansFeuille, FOTMOB_REV);
    } catch (error) {
      report.warnings = [...(report.warnings ?? []), `Rencontres sans feuille non marquées : ${error.message}`];
    }
  }
  // Les annuaires ne se reconstruisent que si quelque chose est entré : la
  // reconstruction est complète (huit secondes, bloquantes) et une passe
  // périodique qui n'a rien trouvé n'a rien à y changer.
  if (report.merged) refreshRegistries(report);
  report.finishedAt = new Date().toISOString();
  onProgress?.({ phase: 'done', ...report });
  return report;
}
