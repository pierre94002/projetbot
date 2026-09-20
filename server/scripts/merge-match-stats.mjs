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
import { pathToFileURL } from 'node:url';

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
  'yellowCards', 'redCards', 'saves', 'goalsConceded',
  // Détail supplémentaire publié par FotMob, nécessaire pour reproduire ses
  // onglets Attaque / Passes / Défense / Duels / Gardien.
  'xgot', 'xgotFaced', 'goalsPrevented', 'bigChancesMissed', 'touchesOppBox',
  'blocks', 'recoveries', 'dribbledPast', 'dispossessed',
  'groundDuelsWon', 'groundDuelsTotal', 'aerialsWon', 'aerialsTotal',
  'longBalls', 'longBallsAccurate', 'crossesAccurate', 'finalThirdPasses',
  'ownHalfPasses', 'oppHalfPasses', 'ownGoals',
  // Mesures supplementaires du releve joueur FotMob.
  'shotsOffTarget', 'xgNonPenalty', 'duelsLost', 'throwIns', 'cornersTaken', 'woodwork',
  'defensiveActions', 'bigChancesCreated', 'headedClearances', 'clearancesOffLine', 'lastManTackles',
  'divingSaves', 'highClaims', 'sweeperActions', 'savesInsideBox', 'punches'
];
const PLAYER_TEXT_KEYS = ['name', 'position', 'number', 'playerId'];
/**
 * Booléens de feuille de match. `starter` dit qui a débuté, `subbedIn` qui
 * est entré depuis le banc : les deux ensemble disent qui a joué, ce dont
 * dépend toute moyenne « par match ».
 */
const PLAYER_FLAG_KEYS = ['starter', 'subbedIn'];
/** Placement sur le terrain et minutes d entree/sortie, pour la composition. */
const PLAYER_META_KEYS = ['side', 'x', 'y', 'subInMinute', 'subOutMinute'];

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

/**
 * Écrit en réessayant : sous Windows, la synchronisation OneDrive verrouille
 * un instant le fichier qu'elle envoie, et l'écriture échoue alors avec
 * EBUSY, EPERM ou un UNKNOWN opaque. Attendre quelques centaines de
 * millisecondes suffit ; échouer ferait perdre tout un lot d'import.
 */
function writeWithRetry(file, contents, attempts = 14) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      // Écriture en deux temps : un fichier temporaire, puis un renommage.
      // Le renommage est atomique, donc un lecteur ne voit jamais un fichier
      // à moitié écrit — et la fenêtre pendant laquelle le fichier final est
      // ouvert en écriture, celle que OneDrive verrouille, disparaît.
      const temp = `${file}.tmp`;
      fs.writeFileSync(temp, contents, 'utf8');
      fs.renameSync(temp, file);
      return;
    } catch (error) {
      lastError = error;
      const retryable = ['EBUSY', 'EPERM', 'UNKNOWN', 'EACCES', 'ENOENT'].includes(error.code);
      if (!retryable || attempt === attempts) throw error;
      // Attente active : le script est synchrone, la pause doit l'être aussi.
      // Progression jusqu'à 2 s par tentative, soit une vingtaine de secondes
      // au total — largement de quoi laisser passer une synchronisation.
      const until = Date.now() + Math.min(2000, attempt * 200);
      while (Date.now() < until) {
        /* on patiente */
      }
    }
  }
  throw lastError;
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
  // Identifiant de la source : seule clé vraiment fiable pour reconnaître un
  // joueur d'un passage à l'autre. Les noms, eux, changent de forme selon la
  // source — « Wu Xi » / « Xi Wu », « Jinghang Hu » / « Jing Hu ».
  if (raw.playerId != null) out.playerId = String(raw.playerId);
  for (const key of PLAYER_FLAG_KEYS) {
    if (typeof raw[key] === 'boolean') out[key] = raw[key];
  }
  for (const key of PLAYER_META_KEYS) {
    if (raw[key] !== null && raw[key] !== undefined) out[key] = raw[key];
  }
  for (const key of PLAYER_STAT_KEYS) {
    const n = toNumber(raw[key]);
    if (n !== null) out[key] = n;
  }
  for (const key of Object.keys(raw)) {
    if (!PLAYER_STAT_KEYS.includes(key) && !PLAYER_TEXT_KEYS.includes(key) && !PLAYER_FLAG_KEYS.includes(key) && !PLAYER_META_KEYS.includes(key)) {
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

/**
 * Rapproche les joueurs d'une même feuille de match.
 *
 * Le numéro de maillot sert de clé de secours : les sources changent
 * d'orthographe d'un passage à l'autre ("Pepe Carmona" devient "José Ángel
 * Carmona"), et indexer par nom seul créait une seconde ligne pour le même
 * joueur — donc des buts comptés deux fois.
 *
 * Mais le numéro seul ne suffit pas : en League 1 et League 2, la source
 * attribue parfois le même numéro à deux joueurs distincts d'une même
 * feuille. Le rapprochement par numéro exige donc en plus un mot de nom en
 * commun, faute de quoi on préfère deux lignes séparées à une confusion.
 *
 * Le nom déjà stocké est conservé : c'est celui auquel le reste des données
 * fait référence.
 */
function nameTokens(name) {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đð]/gi, 'd')
    .replace(/[øœ]/gi, 'o')
    .replace(/ł/gi, 'l')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Deux écritures désignent-elles le même joueur ?
 *
 * Les sources ne s'accordent ni sur l'ordre des noms chinois (« Wu Xi » /
 * « Xi Wu »), ni sur la translittération (« Jinghang Hu » / « Jing Hu »), ni
 * sur les formes courtes. On accepte donc : mêmes mots dans n'importe quel
 * ordre, l'un contenu dans l'autre, un mot long partagé, ou un mot qui
 * préfixe l'autre — ce dernier cas borné à 4 lettres d'écart, sinon
 * « Wu » vaudrait « Wuhan ».
 */
function sharesNameToken(a, b) {
  const left = nameTokens(a);
  const right = nameTokens(b);
  if (!left.length || !right.length) return false;

  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const sameSet = left.length === right.length && left.every((t) => rightSet.has(t));
  if (sameSet) return true; // ordre inversé
  if (left.every((t) => rightSet.has(t)) || right.every((t) => leftSet.has(t))) return true; // sous-ensemble
  if (right.some((t) => t.length >= 3 && leftSet.has(t))) return true; // mot long commun

  return left.some((x) =>
    right.some((y) => {
      const [short, long] = x.length <= y.length ? [x, y] : [y, x];
      return short.length >= 3 && long.startsWith(short) && long.length - short.length <= 4;
    })
  );
}

function mergePlayers(existing = [], incoming = []) {
  const ordered = [...existing];
  const byId = new Map();
  const byNumber = new Map();
  const byName = new Map();
  for (const p of ordered) {
    if (p.playerId != null && !byId.has(p.playerId)) byId.set(String(p.playerId), p);
    if (p.number != null && !byNumber.has(p.number)) byNumber.set(p.number, p);
    const key = slug(p.name);
    if (!byName.has(key)) byName.set(key, p);
  }

  for (const player of incoming) {
    // Par ordre de fiabilité : identifiant de la source, puis numéro de
    // maillot corroboré par le nom, puis le nom seul.
    const sameId = player.playerId != null ? byId.get(String(player.playerId)) : null;
    const sameNumber = player.number != null ? byNumber.get(player.number) : null;
    const target = sameId ?? (sameNumber && sharesNameToken(sameNumber.name, player.name) ? sameNumber : null) ?? byName.get(slug(player.name));
    if (target) {
      const { name, ...rest } = player; // on garde l'orthographe déjà stockée (accents…)
      fillStats(target, rest);
      continue;
    }
    ordered.push(player);
    if (player.playerId != null && !byId.has(String(player.playerId))) byId.set(String(player.playerId), player);
    if (player.number != null && !byNumber.has(player.number)) byNumber.set(player.number, player);
    byName.set(slug(player.name), player);
  }
  return ordered;
}

/**
 * Fusionne un tableau de statistiques dans <statsDir> et renvoie le bilan
 * (dont les avertissements, que l'appelant affiche ou journalise).
 *
 * Extrait de la CLI pour que le serveur puisse rafraîchir ses statistiques
 * en direct (cf. src/services/matchStatsRefreshService.js) sans relancer un
 * processus : une seule implémentation du contrat de fusion, partagée par la
 * ligne de commande et par l'application.
 */
export function mergeMatchStats(statsDir, incoming) {
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
      // Une entrée écrite par un import plus ancien peut n'avoir ni bloc
      // `players` ni bloc `teamStats` complet : on rétablit la forme attendue
      // avant de compléter, plutôt que d'échouer sur toute la fusion.
      existing.teamStats ??= {};
      existing.teamStats.home ??= {};
      existing.teamStats.away ??= {};
      existing.players ??= {};
      existing.players.home ??= [];
      existing.players.away ??= [];

      existing.league = league ?? existing.league ?? null;
      if (toNumber(m.homeGoals) !== null) existing.homeGoals = toNumber(m.homeGoals);
      if (toNumber(m.awayGoals) !== null) existing.awayGoals = toNumber(m.awayGoals);
      fillStats(existing.teamStats.home, homeStats);
      fillStats(existing.teamStats.away, awayStats);
      existing.players.home = mergePlayers(existing.players.home, homePlayers);
      existing.players.away = mergePlayers(existing.players.away, awayPlayers);
      // Déroulé du match et compositions : remplacés en bloc plutôt que
      // complétés champ par champ. Ce sont des listes ordonnées — les fondre
      // ligne à ligne produirait un déroulé incohérent — et la source les
      // publie entières ou pas du tout.
      if (Array.isArray(m.events) && m.events.length) existing.events = m.events;
      if (m.lineups && (m.lineups.home || m.lineups.away)) existing.lineups = m.lineups;
      if (m.meta && Object.keys(m.meta).length) existing.meta = { ...(existing.meta ?? {}), ...m.meta };
      if (Array.isArray(m.shotmap) && m.shotmap.length) existing.shotmap = m.shotmap;
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
        ...(Array.isArray(m.events) && m.events.length ? { events: m.events } : {}),
        ...(m.lineups && (m.lineups.home || m.lineups.away) ? { lineups: m.lineups } : {}),
        ...(m.meta && Object.keys(m.meta).length ? { meta: m.meta } : {}),
        ...(Array.isArray(m.shotmap) && m.shotmap.length ? { shotmap: m.shotmap } : {}),
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
    // Réessais : le projet vit dans un dossier OneDrive, dont la
    // synchronisation verrouille brièvement un fichier qu'elle envoie
    // (EBUSY, EPERM, ou un UNKNOWN sous Windows). Abandonner à la première
    // tentative faisait perdre tout un lot d'import.
    writeWithRetry(file, JSON.stringify(shard));
    written.push(file);
  }

  return { created, updated, skipped, playersMerged: playersCount, writtenFiles: written, warnings };
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

  const { warnings, ...summary } = mergeMatchStats(statsDir, incoming);
  for (const w of warnings.slice(0, 30)) console.error(`Avertissement : ${w}`);
  if (warnings.length > 30) console.error(`… ${warnings.length - 30} autres avertissements`);
  console.log(JSON.stringify(summary));
}

// Exécuté en ligne de commande seulement : importé comme module, ce fichier
// n'a aucun effet de bord.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main();
