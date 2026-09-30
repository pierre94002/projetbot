import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../../config/env.js';
import { readJsonFile, writeJsonAtomic, removeFileWithRetry } from '../../utils/atomicJson.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AI_CONFIG_FILE_PATH = path.resolve(__dirname, '../../../data/runtime/ai-config.json');

export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5';

function loadPersistedConfig() {
  try {
    return readJsonFile(AI_CONFIG_FILE_PATH, null);
  } catch {
    // Illisible malgré les nouvelles tentatives : aucune connexion persistée
    // pour cette session, le fichier reste tel quel. Sans le message
    // d'erreur, qui peut citer le début du fichier, donc de la clé.
    console.warn('[connexion IA] ai-config.json illisible : aucune connexion persistée pour cette session.');
    return null;
  }
}

let persistedConfig = loadPersistedConfig(); // { provider: 'anthropic', apiKey, model, connectedAt } | null

// Appelé AVANT de changer l'état en mémoire : si OneDrive refuse l'écriture
// malgré les nouvelles tentatives, l'erreur remonte et rien ne change — plutôt
// qu'une clé active jusqu'au redémarrage mais absente du disque.
function persist(config) {
  if (config) writeJsonAtomic(AI_CONFIG_FILE_PATH, config);
  else removeFileWithRetry(AI_CONFIG_FILE_PATH);
}

/**
 * Interne uniquement — ne JAMAIS exposer via une route, la clé y est en clair.
 * Priorité : clé connectée depuis l'UI (persistée sur disque) > ANTHROPIC_API_KEY
 * dans .env (raccourci pour qui préfère éditer un fichier plutôt que l'UI).
 */
export function getAiConfig() {
  const apiKey = persistedConfig?.apiKey || env.anthropic.apiKey || '';
  const model = persistedConfig?.model || env.anthropic.model || DEFAULT_ANTHROPIC_MODEL;
  const workspaceId = persistedConfig?.workspaceId || env.anthropic.workspaceId || '';
  const source = persistedConfig?.apiKey ? 'ui' : env.anthropic.apiKey ? 'env' : null;
  return { provider: 'anthropic', apiKey, model, workspaceId, connectedAt: persistedConfig?.connectedAt ?? null, source };
}

/**
 * La SEULE forme jamais renvoyée au frontend — pas de champ apiKey.
 * workspaceId n'est pas un secret (juste un identifiant, pas une
 * credential) : renvoyé tel quel pour pré-remplir le formulaire, contrairement
 * à la clé.
 */
export function getAiConnectionStatus() {
  const { apiKey, model, workspaceId, connectedAt, source } = getAiConfig();
  return { connected: Boolean(apiKey), provider: 'anthropic', model, workspaceId, connectedAt, source };
}

export function connectAi({ apiKey, model, workspaceId }) {
  const config = {
    provider: 'anthropic',
    apiKey,
    model: model || DEFAULT_ANTHROPIC_MODEL,
    workspaceId: workspaceId || '',
    connectedAt: new Date().toISOString()
  };
  persist(config);
  persistedConfig = config;
  return getAiConnectionStatus();
}

/**
 * Ne fait qu'effacer la clé saisie depuis l'UI — si ANTHROPIC_API_KEY reste
 * définie dans .env, le statut redevient connected:true (source:'env') juste
 * après, ce qui est voulu (cf. AiConnectionForm.vue pour le texte associé).
 */
export function disconnectAi() {
  persist(null);
  persistedConfig = null;
  return getAiConnectionStatus();
}
