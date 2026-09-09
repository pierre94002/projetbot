import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../../config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AI_CONFIG_FILE_PATH = path.resolve(__dirname, '../../../data/runtime/ai-config.json');

export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5';

function loadPersistedConfig() {
  try {
    if (fs.existsSync(AI_CONFIG_FILE_PATH)) {
      return JSON.parse(fs.readFileSync(AI_CONFIG_FILE_PATH, 'utf8'));
    }
  } catch {
    // Fichier corrompu ou illisible : on retombe sur aucune connexion persistée.
  }
  return null;
}

let persistedConfig = loadPersistedConfig(); // { provider: 'anthropic', apiKey, model, connectedAt } | null

function persist() {
  fs.mkdirSync(path.dirname(AI_CONFIG_FILE_PATH), { recursive: true });
  if (persistedConfig) {
    fs.writeFileSync(AI_CONFIG_FILE_PATH, JSON.stringify(persistedConfig, null, 2), 'utf8');
  } else if (fs.existsSync(AI_CONFIG_FILE_PATH)) {
    fs.unlinkSync(AI_CONFIG_FILE_PATH);
  }
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
  persistedConfig = {
    provider: 'anthropic',
    apiKey,
    model: model || DEFAULT_ANTHROPIC_MODEL,
    workspaceId: workspaceId || '',
    connectedAt: new Date().toISOString()
  };
  persist();
  return getAiConnectionStatus();
}

/**
 * Ne fait qu'effacer la clé saisie depuis l'UI — si ANTHROPIC_API_KEY reste
 * définie dans .env, le statut redevient connected:true (source:'env') juste
 * après, ce qui est voulu (cf. AiConnectionForm.vue pour le texte associé).
 */
export function disconnectAi() {
  persistedConfig = null;
  persist();
  return getAiConnectionStatus();
}
