import { modeBacASable } from '../../config/bacASable.js';
import { journaliserAppel } from '../../data/repositories/claudeUsageLedger.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

/**
 * TESTS SEULEMENT (cf. __testing) : remplace l'envoi HTTP par une réponse
 * fabriquée. Aucune API n'est alors appelée.
 */
let envoiSimule = null;

/**
 * Note l'appel au journal (étape 4 du plan, canal « api-anthropic » : facturé
 * à la clé, hors du budget de l'abonnement). Jamais la clé ni l'espace de
 * travail : le modèle, les tokens rendus, l'issue. Ne fait jamais échouer
 * l'appel.
 */
function noterAppel({ appel, model, debut, statut, erreur = null, reponse = null }) {
  try {
    journaliserAppel({ canal: 'api-anthropic', appel, modele: reponse?.model ?? model ?? null, statut, erreur, usage: reponse?.usage ?? null, coutUsd: null, debut, fin: Date.now() });
  } catch (error) {
    console.warn(`[journal Claude] appel non noté : ${error.message}`);
  }
}

/**
 * Client HTTP brut pour l'API Messages d'Anthropic — même style que
 * apiFootballClient.js (fetch natif, pas de SDK). La clé est passée en
 * paramètre (pas lue depuis env.js directement) car elle est dynamique :
 * connectée/déconnectée à chaud depuis Réglages, potentiellement différente
 * de celle en .env — cf. aiConfigStore.js.
 *
 * `appel` (journal, étape 4) : { type: 'autre', detail } — ce qui a demandé
 * l'appel (audit des pronostics, recherche web, test de la clé).
 */
export async function callAnthropicMessages({ apiKey, workspaceId, model, system, messages, tools, toolChoice, maxTokens, appel = null }) {
  // Bac à sable (cf. config/bacASable.js) : l'API Anthropic à la clé est
  // payante ; jamais appelée depuis le bac, même si une clé y a été saisie.
  // Une réponse SIMULÉE (tests) n'appelle rien : rien à refuser.
  if (!envoiSimule && modeBacASable()) {
    throw new Error("Bac à sable : l'API Anthropic (clé payante) n'est jamais appelée depuis le bac.");
  }
  if (!apiKey) {
    throw new Error('Clé API Anthropic manquante : connectez-en une depuis Réglages > Connexion IA.');
  }

  const debut = Date.now();
  let response;
  try {
    response = await (envoiSimule ?? fetch)(ANTHROPIC_API_URL, {
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
  } catch (error) {
    noterAppel({ appel, model, debut, statut: 'echec', erreur: error.message });
    throw error;
  }

  if (response.status === 401) {
    noterAppel({ appel, model, debut, statut: 'echec', erreur: 'HTTP 401 : clé invalide ou révoquée' });
    throw new Error('Clé API Anthropic invalide ou révoquée.');
  }
  if (response.status === 429) {
    noterAppel({ appel, model, debut, statut: 'echec', erreur: 'HTTP 429 : limite de débit' });
    throw new Error('Limite de débit Anthropic atteinte — réessayez plus tard.');
  }
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const message = `Anthropic a répondu ${response.status}${errorBody?.error?.message ? ` : ${errorBody.error.message}` : ''}`;
    noterAppel({ appel, model, debut, statut: 'echec', erreur: message });
    throw new Error(message);
  }

  let corps;
  try {
    corps = await response.json();
  } catch (error) {
    noterAppel({ appel, model, debut, statut: 'echec', erreur: `réponse illisible : ${error.message}` });
    throw error;
  }
  noterAppel({ appel, model, debut, statut: 'ok', reponse: corps });
  return corps;
}

/**
 * Pour les tests seulement. `simulerEnvoi(fn)` remplace l'envoi HTTP par
 * `fn(url, options)`, qui rend un objet { status, ok, json() } ; `null` le
 * rétablit. Refusé hors d'une copie d'essai (CM_TEST_DOSSIER).
 */
export const __testing = {
  simulerEnvoi(fn) {
    if (fn && !process.env.CM_TEST_DOSSIER) throw new Error('Simulation de l’API Anthropic réservée aux tests (copie isolée, CM_TEST_DOSSIER).');
    envoiSimule = typeof fn === 'function' ? fn : null;
  }
};
