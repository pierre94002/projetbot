import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME_DIR = path.resolve(__dirname, '../../../data/runtime');
const ODDS_SNAPSHOT_PATH = path.resolve(__dirname, '../../../data/fixtures/odds/odds-snapshot.json');

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
    else if (entry.isFile()) collectFile(fullPath, path.relative(baseDir, fullPath).replace(/\\/g, '/'), parts, state);
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

  return {
    version: crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16),
    updatedAt: state.latestMs ? new Date(state.latestMs).toISOString() : null,
    fileCount: parts.length
  };
}
