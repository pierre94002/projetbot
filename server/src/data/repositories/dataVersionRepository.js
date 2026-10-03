import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME_DIR = path.resolve(__dirname, '../../../data/runtime');
const ODDS_SNAPSHOT_PATH = path.resolve(__dirname, '../../../data/fixtures/odds/odds-snapshot.json');

/**
 * Fichiers de RÉGLAGES, exclus de l'empreinte : ils ne sont écrits que depuis
 * l'écran Réglages, et le rafraîchissement automatique ne recharge de toute
 * façon pas la configuration. Les inclure ferait apparaître un toast
 * "nouvelles données" dans l'onglet de celui qui vient simplement
 * d'enregistrer un réglage, sans rien lui apporter. Les fichiers écrits par
 * l'utilisateur qui, eux, DOIVENT se propager (paris, pronostics) restent
 * dans l'empreinte : c'est ce qui les synchronise entre deux onglets.
 */
// favorites.json (03/10/2026) : cocher une étoile ne doit pas faire recharger
// toutes les pages comme une vraie nouvelle donnée.
const SETTINGS_FILES = new Set(['engine-config.json', 'ai-config.json', 'favorites.json']);

/**
 * Fichiers de TRAVAIL de l'actualisation, exclus eux aussi : le verrou, les
 * tampons de fusion, les fichiers temporaires d'écriture et l'état de la
 * passe. Ils changeaient l'empreinte au début, au milieu et à la fin de
 * chaque passe, et l'interface annonçait « nouvelles données » même quand
 * rien n'avait bougé. À la place, UNE marque : la dernière passe qui a
 * réellement écrit des données (dataChangedAt), qui couvre aussi ce qui
 * n'est écrit que dans la base SQLite, que ce parcours ne voit pas. Les
 * imports lancés en ligne de commande posent la leur (data-stamp.json, cf.
 * refreshLock.js), qui, elle, est suivie comme un fichier ordinaire.
 */
const WORK_FILES = new Set(['refresh-status.json', 'espn-refresh.lock', 'calendrier-fotmob.json', 'resultats-fotmob.json']);
const isWorkFile = (name) =>
  WORK_FILES.has(name) || name.startsWith('refresh-status.') || name.startsWith('espn-refresh.lock') || name.endsWith('.tmp') || name.endsWith('.abandonne') || name.endsWith('.new');
const REFRESH_STATUS_PATH = path.join(RUNTIME_DIR, 'refresh-status.json');

function lastRefreshMark() {
  try {
    return JSON.parse(fs.readFileSync(REFRESH_STATUS_PATH, 'utf8')).dataChangedAt ?? null;
  } catch {
    return null;
  }
}

/**
 * Empreinte de l'état des fichiers de données, SANS les lire : seuls les
 * métadonnées (chemin, date de modification, taille) entrent dans le calcul.
 * Le coût est donc celui de quelques `stat`, ce qui permet au front d'appeler
 * cet endpoint toutes les 30 secondes pour savoir s'il doit recharger, au lieu
 * de re-télécharger en aveugle des listes de plusieurs milliers de lignes.
 *
 * Tout `data/runtime` est parcouru plutôt qu'une liste de fichiers en dur :
 * une donnée écrite par un script de fusion (nouveau mois de match-stats, par
 * exemple) est prise en compte sans qu'il faille penser à l'ajouter ici. On y
 * joint l'instantané de cotes, qui vit ailleurs mais alimente la page Matchs.
 *
 * La taille entre dans l'empreinte en plus du mtime : deux écritures dans la
 * même milliseconde (la résolution du FS n'est pas toujours meilleure) restent
 * ainsi distinguables tant que le contenu change de longueur.
 */
function collectFile(filePath, relPath, parts, state) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return; // Fichier disparu entre le readdir et le stat : il ne compte pas.
  }
  parts.push(`${relPath}:${Math.round(stat.mtimeMs)}:${stat.size}`);
  if (stat.mtimeMs > state.latestMs) state.latestMs = stat.mtimeMs;
}

function walk(dir, baseDir, parts, state) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // Dossier absent (première installation) : version calculée sur le reste.
  }
  for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(fullPath, baseDir, parts, state);
    else if (entry.isFile() && !SETTINGS_FILES.has(entry.name) && !isWorkFile(entry.name)) {
      collectFile(fullPath, path.relative(baseDir, fullPath).replace(/\\/g, '/'), parts, state);
    }
  }
}

/**
 * @returns {{ version: string, updatedAt: string|null, fileCount: number }}
 *   `version` change dès qu'un fichier de données est écrit, ajouté ou
 *   supprimé. `updatedAt` est la plus récente date de modification observée.
 */
export function getDataVersion() {
  const parts = [];
  const state = { latestMs: 0 };

  walk(RUNTIME_DIR, RUNTIME_DIR, parts, state);
  collectFile(ODDS_SNAPSHOT_PATH, 'fixtures/odds-snapshot.json', parts, state);
  const marque = lastRefreshMark();
  if (marque) {
    parts.push(`refresh:${marque}`);
    const ms = Date.parse(marque);
    if (Number.isFinite(ms) && ms > state.latestMs) state.latestMs = ms;
  }

  return {
    version: crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16),
    updatedAt: state.latestMs ? new Date(state.latestMs).toISOString() : null,
    fileCount: parts.length
  };
}
