#!/usr/bin/env node
/**
 * merge-match-stats.mjs
 * -----------------------------------------------------------------------
 * Contrôle puis enregistre les statistiques détaillées de matchs terminés
 * (stats d'équipe complètes + stats individuelles de chaque joueur) dans le
 * magasin SQLite, lu par GET /api/match-stats/*.
 *
 * ÉCRITURE UNIQUE depuis le 2026-09-22. Ce module tenait en plus des
 * fichiers mensuels <AAAA-MM>.json qui doublaient le magasin : 1,5 Go dans
 * l'arbre de travail, relus ENTIÈREMENT à chaque démarrage d'import pour
 * savoir ce qui était déjà là, et plus lus par l'API depuis la migration
 * vers SQLite. Le filet de secours qu'ils constituaient est mieux tenu par
 * les sauvegardes de la base (backupTo, VACUUM INTO).
 *
 * Le premier argument reste le dossier des anciens fichiers : il n'est plus
 * utilisé, mais les appelants le passent encore et le retirer n'apporterait
 * rien qu'une cascade de changements.
 *
 * Usage :
 *   node merge-match-stats.mjs <dossier-ignoré> <nouvelles-stats.json>
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
import { pathToFileURL } from 'node:url';
import { slug, nameTokens, sharesNameToken } from '../src/utils/nameIdentity.js';
import { TEAM_STAT_KEYS, PLAYER_STAT_KEYS } from '../src/utils/statVocabulary.js';
import { upsertMatches } from '../src/data/db/matchStatsDb.js';

// Re-exportes : plusieurs scripts les importent depuis ce module.
export { slug, nameTokens, sharesNameToken, TEAM_STAT_KEYS, PLAYER_STAT_KEYS };

const PERCENT_TEAM_KEYS = new Set(['Ball Possession', 'Passes %']);

const PLAYER_TEXT_KEYS = ['name', 'position', 'number', 'playerId'];
/**
 * Booléens de feuille de match. `starter` dit qui a débuté, `subbedIn` qui
 * est entré depuis le banc : les deux ensemble disent qui a joué, ce dont
 * dépend toute moyenne « par match ».
 */
const PLAYER_FLAG_KEYS = ['starter', 'subbedIn'];
/** Placement sur le terrain et minutes d entree/sortie, pour la composition. */
const PLAYER_META_KEYS = ['side', 'x', 'y', 'subInMinute', 'subOutMinute'];


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
export function writeWithRetry(file, contents, attempts = 14) {
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
  const warnings = [];
  let skipped = 0;
  let playersCount = 0;
  // Les rencontres qui passent le contrôle. Celles qu'on écarte n'allaient
  // AUTREFOIS pas dans le JSON mais partaient quand même vers la base, qui
  // recevait alors des rencontres sans rien dedans.
  const retenues = [];

  for (const m of incoming) {
    const { date, league, homeName, awayName } = m ?? {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || !homeName || !awayName) {
      console.error(`Ignoré (date AAAA-MM-JJ / équipes manquantes) : ${JSON.stringify(m)?.slice(0, 200)}`);
      skipped++;
      continue;
    }

    const label = `${date} ${homeName}-${awayName}`;

    const homeStats = cleanTeamStats(m.teamStats?.home, warnings, `${label} (dom.)`);
    const awayStats = cleanTeamStats(m.teamStats?.away, warnings, `${label} (ext.)`);
    const homePlayers = (m.players?.home ?? []).map((p) => cleanPlayer(p, warnings, `${label} (dom.)`)).filter(Boolean);
    const awayPlayers = (m.players?.away ?? []).map((p) => cleanPlayer(p, warnings, `${label} (ext.)`)).filter(Boolean);

    // Aucune statistique — mais une rencontre JOUÉE, avec son score, reste
    // une rencontre. La garde d'origine visait les entrées vides d'une
    // recherche web ratée ; appliquée telle quelle à FotMob, elle écartait
    // 1 378 matchs bien réels, dont les saisons 2023-24 et 2024-25 de Serbie
    // et d'Israël, que la source publie sans feuille de match. Le classement
    // de ces saisons se calculait alors sur les matchs restants : faux,
    // plutôt qu'absent. On n'écarte donc que ce qui n'a NI relevé NI score.
    const sansReleve = !Object.keys(homeStats).length && !Object.keys(awayStats).length
      && !homePlayers.length && !awayPlayers.length;
    const sansScore = m.homeGoals === null || m.homeGoals === undefined
      || m.awayGoals === null || m.awayGoals === undefined;
    if (sansReleve && sansScore) {
      console.error(`Ignoré (ni statistique ni score) : ${label}`);
      skipped++;
      continue;
    }

    playersCount += homePlayers.length + awayPlayers.length;
    retenues.push(m);
  }



  // Le magasin SQLite est désormais la seule écriture. Les fichiers JSON
  // mensuels qui le doublaient ont été retirés : 1,5 Go dans l'arbre de
  // travail, relus ENTIÈREMENT à chaque démarrage d'import, pour un contenu
  // que la base porte déjà — et que l'API ne lisait plus depuis la
  // migration. Leur seul rôle restant était d'être un filet de secours, que
  // les sauvegardes de la base (backupTo) remplissent mieux.
  //
  // Une seule ligne refusée annulait AUTREFOIS toute la transaction, donc
  // tout le lot — et l'erreur finissait dans `warnings`, que personne ne
  // lit. 4 952 rencontres ont disparu de la base ainsi, présentes en JSON,
  // sans un mot. Deux règles en découlent :
  //   1. on réessaie rencontre par rencontre, pour ne perdre que ce qui est
  //      réellement mauvais plutôt que ses 300 voisines ;
  //   2. l'échec s'écrit sur la sortie d'erreur, pas dans un tableau.
  let dbReport = null;
  try {
    dbReport = upsertMatches(retenues);
  } catch (error) {
    dbReport = { created: 0, updated: 0, skipped: 0, playersMerged: 0, warnings: [], rejected: [] };
    for (const entry of incoming) {
      try {
        const un = upsertMatches([entry]);
        dbReport.created += un.created;
        dbReport.updated += un.updated;
        dbReport.playersMerged += un.playersMerged;
      } catch (err) {
        dbReport.rejected.push({ matchKey: entry.matchKey ?? `${entry.date}-${entry.homeName}-${entry.awayName}`, reason: err.message });
      }
    }
    const avis =
      `Base SQLite : le lot a été refusé en bloc (${error.message}). ` +
      `Repris une par une : ${dbReport.created + dbReport.updated} acceptées, ${dbReport.rejected.length} refusées.`;
    warnings.push(avis);
    console.error(`[base] ${avis}`);
    for (const r of dbReport.rejected.slice(0, 10)) console.error(`[base]   ${r.matchKey} : ${r.reason}`);
    if (dbReport.rejected.length > 10) console.error(`[base]   … et ${dbReport.rejected.length - 10} autres.`);
  }

  // « créé » et « mis à jour » viennent de la base : c'est elle qui sait
  // désormais si une rencontre existait déjà.
  return {
    created: dbReport?.created ?? 0,
    updated: dbReport?.updated ?? 0,
    skipped,
    playersMerged: playersCount,
    warnings,
    db: dbReport
  };
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
