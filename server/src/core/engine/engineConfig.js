import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonFile, writeJsonAtomic } from '../../utils/atomicJson.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE_PATH = path.resolve(__dirname, '../../../data/runtime/engine-config.json');

export const DEFAULT_ENGINE_CONFIG_BY_SPORT = {
  football: {
    // Avantage minimum d'un pari sur la probabilité juste du marché (cf.
    // valueFinder.js). 2 % : sur l'historique, 278 paris, +14,9 % de retour
    // et +2,9 % face à la cote de clôture. Au-delà de 25 %, c'est une cote
    // périmée ou une erreur, pas une value.
    edgeThresholdMin: 0.02,
    edgeThresholdMax: 0.25,
    // Bookmakers où un pari peut être recommandé, choisis par Pierre le
    // 23/09/2026 : les plus fiables HORS bookmakers français (dont la marge
    // de 11 à 15 % sur le 1N2 ne laisse jamais de value). Tous réglementés
    // par une autorité européenne ; aucun n'est agréé en France. Les sites
    // offshore (1xBet, MyBookie, BetOnline, GTbets…) n'y figurent pas. La
    // cote juste, elle, vient des paliers de fiabilité (cf. valueFinder.js),
    // et un bookmaker qui l'a fixée n'est jamais recommandé pour ce match.
    valueBookmakers: [
      'williamhill',
      'sport888',
      'betsson',
      'nordicbet',
      'unibet_nl',
      'unibet_se',
      'leovegas_se',
      'tipico_de',
      'coolbet',
      'codere_it'
    ],
    // Pas de recommandation au-delà de cette cote : sur les outsiders, les
    // résultats du test étaient instables.
    maxValueOdds: 5,
    defaultCorrelation: -0.075,
    kellyFraction: 0.125,
    maxStakePercent: 0.02,
    homeAdvantage: 1.06,
    cornersAdjustmentMax: 0.08,
    // Garde-fou plausibilité du staking (cf. risk/staking.js) : au-delà de cet
    // écart de taux domicile/extérieur, on ne recommande pas de mise. Sorti
    // du fichier générique vers la config du sport qui l'utilise.
    maxExpectedRateGap: 0.4,
    // 100 % marché pour le résultat : testé sur 12 943 matchs de
    // vérification, chaque point donné au modèle de buts ou à l'ajustement
    // météo dégradait la prévision (l'ancien 70/20/10 comme le 80/20
    // proposé). Le modèle de buts reste la source des marchés sans cote
    // (plus/moins, les deux équipes marquent) et des matchs sans cote.
    weights: {
      market: 1,
      structural: 0,
      exogenous: 0
    }
  }
};

/**
 * `engine-config.json` était, avant le refactor sport, un objet plat
 * (un seul sport = football existait). Un fichier déjà au nouveau format
 * (une clé par sport) est renvoyé tel quel ; un fichier à l'ancien format
 * plat est traité comme la config football — migration silencieuse et
 * rétrocompatible, pas de script à lancer à la main pour ce fichier.
 */
function migrateToSportKeyed(raw) {
  if (!raw) return {};
  const looksAlreadySportKeyed = Object.keys(DEFAULT_ENGINE_CONFIG_BY_SPORT).some((sportId) => raw[sportId]);
  return looksAlreadySportKeyed ? raw : { football: raw };
}

// Absent : valeurs par défaut. Présent mais illisible : erreur, cf. getConfigBySport.
function loadPersistedConfig() {
  const raw = readJsonFile(CONFIG_FILE_PATH, null);
  const migrated = migrateToSportKeyed(raw);
  const result = {};
  for (const sportId of Object.keys(DEFAULT_ENGINE_CONFIG_BY_SPORT)) {
    const defaults = DEFAULT_ENGINE_CONFIG_BY_SPORT[sportId];
    const persisted = migrated[sportId];
    result[sportId] = persisted
      ? { ...defaults, ...persisted, weights: { ...defaults.weights, ...persisted.weights } }
      : { ...defaults };
  }
  return result;
}

/**
 * Cache invalidé par la date de modification du fichier, sur le modèle de
 * matchStatsWebRepository. La config est relue à chaque analyse de match : la
 * garder en mémoire évite de re-parser le fichier à chaque appel, mais la
 * comparer au mtime fait qu'une modification venue d'ailleurs — édition à la
 * main, script de fusion, restauration d'une sauvegarde — est prise en compte
 * sans redémarrer le serveur. C'était le seul fichier de data/runtime qui
 * exigeait encore un redémarrage.
 */
let cache = { mtimeMs: undefined, configBySport: null };

function currentMtimeMs() {
  try {
    return fs.statSync(CONFIG_FILE_PATH).mtimeMs;
  } catch {
    return null; // Fichier absent : état légitime, on sert les valeurs par défaut.
  }
}

function getConfigBySport() {
  const mtimeMs = currentMtimeMs();
  if (cache.configBySport && cache.mtimeMs === mtimeMs) return cache.configBySport;
  try {
    cache = { mtimeMs, configBySport: loadPersistedConfig() };
  } catch (error) {
    // Illisible (OneDrive le tient) : la dernière configuration lue, retentée
    // à l'appel suivant — jamais les valeurs par défaut. Elles restaient en
    // cache jusqu'à la modification suivante du fichier, le moteur misait
    // avec, et le prochain réglage enregistré les écrivait par-dessus ceux de
    // l'utilisateur.
    if (!cache.configBySport) throw error;
    console.warn(`[moteur] ${error.message} — dernière configuration lue conservée.`);
  }
  return cache.configBySport;
}

function persistConfig(configBySport) {
  writeJsonAtomic(CONFIG_FILE_PATH, configBySport);
  // On réaligne le cache sur le fichier qu'on vient d'écrire, sinon le
  // prochain appel le relirait pour rien.
  cache = { mtimeMs: currentMtimeMs(), configBySport };
}

export function getEngineConfig(sportId = 'football') {
  const configBySport = getConfigBySport();
  return configBySport[sportId] ?? configBySport.football;
}

export function updateEngineConfig(sportId, partialConfig) {
  // Rétrocompat : ancien appel à 1 argument (partialConfig seul) = football implicite.
  if (typeof sportId !== 'string') {
    partialConfig = sportId;
    sportId = 'football';
  }
  const current = getEngineConfig(sportId);
  const next = {
    ...getConfigBySport(),
    [sportId]: { ...current, ...partialConfig, weights: { ...current.weights, ...partialConfig.weights } }
  };
  persistConfig(next);
  return next[sportId];
}

export function resetEngineConfig(sportId = 'football') {
  const next = { ...getConfigBySport(), [sportId]: { ...DEFAULT_ENGINE_CONFIG_BY_SPORT[sportId] } };
  persistConfig(next);
  return next[sportId];
}
