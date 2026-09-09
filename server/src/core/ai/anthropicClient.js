const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

/**
 * Client HTTP brut pour l'API Messages d'Anthropic — même style que
 * apiFootballClient.js (fetch natif, pas de SDK). La clé est passée en
 * paramètre (pas lue depuis env.js directement) car elle est dynamique :
 * connectée/déconnectée à chaud depuis Réglages, potentiellement différente
 * de celle en .env — cf. aiConfigStore.js.
 */
export async function callAnthropicMessages({ apiKey, workspaceId, model, system, messages, tools, toolChoice, maxTokens }) {
  if (!apiKey) {
    throw new Error('Clé API Anthropic manquante : connectez-en une depuis Réglages > Connexion IA.');
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
      // Requis par certaines clés "identity-linked" (liées à un workspace
      // précis plutôt qu'à toute l'organisation) — absent pour les autres
      // clés, donc envoyé seulement quand fourni plutôt qu'imposé partout.
      ...(workspaceId ? { 'anthropic-workspace-id': workspaceId } : {})
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages,
      ...(tools ? { tools, tool_choice: toolChoice } : {})
    })
  });

  if (response.status === 401) {
    throw new Error('Clé API Anthropic invalide ou révoquée.');
  }
  if (response.status === 429) {
    throw new Error('Limite de débit Anthropic atteinte — réessayez plus tard.');
  }
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(`Anthropic a répondu ${response.status}${errorBody?.error?.message ? ` : ${errorBody.error.message}` : ''}`);
  }

  return response.json();
}
