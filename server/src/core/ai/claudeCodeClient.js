/**
 * claudeCodeClient.js — appelle Claude en mode « headless » (`claude -p`)
 * plutôt que l'API Anthropic à la clé (anthropicClient.js).
 * -----------------------------------------------------------------------
 * Décision de Pierre le 27/09/2026 : l'analyse par match (avant/après)
 * consomme le quota de son abonnement Max x5 (déjà payé), jamais de crédits
 * API facturés séparément. `--json-schema` contraint la sortie dans
 * `structured_output` — même garantie de format que le tool_choice forcé
 * côté API.
 *
 * QUEL `claude`. L'exécutable natif du paquet npm (`npm install -g
 * @anthropic-ai/claude-code` → %APPDATA%\npm\node_modules\@anthropic-ai\
 * claude-code\bin\claude.exe, cf. env.claudeCode.bin), JAMAIS le claude.exe
 * embarqué par l'app de bureau (%APPDATA%\Claude\claude-code\<version>\) : ce
 * dernier n'existe que dans la vue virtualisée des outils de Claude lui-même,
 * pas pour un processus lancé normalement sur la machine — constaté le
 * 30/09/2026 après plusieurs essais, l'Explorateur de Pierre ne voyait même
 * pas le dossier (cf. memory auto-ai-analysis).
 *
 * AUTHENTIFICATION. Par jeton longue durée (1 an), `CLAUDE_CODE_OAUTH_TOKEN`
 * dans server/.env (cf. env.js), transmis au sous-processus par l'environnement
 * hérité — jamais un état « connecté » global, qui dépendrait justement de
 * dossiers dont la vue diffère selon le processus.
 *
 * Isolé de CôteMaster à dessein : working directory neutre (dossier temp du
 * système), `--tools ""` (aucun accès fichier/bash — le modèle n'a qu'à lire
 * ce qu'on lui donne), `--no-session-persistence` (50 analyses/jour ne
 * doivent pas encombrer l'historique Claude Code de Pierre).
 * -----------------------------------------------------------------------
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import { env } from '../../config/env.js';

const execFileAsync = promisify(execFile);

const TIMEOUT_MS = 120_000;
const CWD = os.tmpdir();

/**
 * Panne qui touchera aussi les appels suivants (pas de réponse, CLI cassé,
 * jeton refusé, quota de l'abonnement épuisé) — par opposition à un schéma
 * non respecté, propre à UN match. Sert à arrêter une série d'analyses
 * automatiques plutôt que d'enchaîner des échecs certains.
 */
export class ClaudeCodeIndisponible extends Error {}

export function isClaudeCodeAuthenticated() {
  return Boolean(env.claudeCode.oauthToken);
}

/**
 * Environnement du sous-processus : celui du serveur SANS aucune variable
 * ANTHROPIC_* / CLAUDE*, plus le seul jeton. Un serveur démarré depuis une
 * session Claude Code (serveur de test, aperçu) hérite de dizaines de
 * variables de cette session — dont ANTHROPIC_BASE_URL, le proxy de l'app de
 * bureau — et le `claude` lancé ici se serait comporté en sous-session de
 * celle-ci plutôt que d'utiliser le jeton de Pierre.
 */
function childEnv() {
  const propre = Object.fromEntries(Object.entries(process.env).filter(([cle]) => !/^(ANTHROPIC_|CLAUDE)/i.test(cle)));
  return { ...propre, CLAUDE_CODE_OAUTH_TOKEN: env.claudeCode.oauthToken };
}

/**
 * @param {{system: string, userMessage: string, jsonSchema: object, model?: string, effort?: string}} params
 * `model` accepte un alias ('sonnet', 'opus'...) — jamais un nom figé, pour
 * suivre la dernière version de la gamme sans dépendre d'un id précis.
 * @returns {Promise<{structuredOutput: object, usage: object|null, costUsd: number}>}
 */
export async function callClaudeCode({ system, userMessage, jsonSchema, model = 'sonnet', effort = 'low' }) {
  const args = [
    '-p',
    '--output-format', 'json',
    '--json-schema', JSON.stringify(jsonSchema),
    '--system-prompt', system,
    '--tools', '',
    '--no-session-persistence',
    '--setting-sources', 'user',
    '--permission-prompts', 'none',
    '--model', model,
    '--effort', effort
  ];

  let stdout;
  try {
    // Jamais `shell: true` : les arguments (prompt, schéma) partent tels quels,
    // un par un, sans être réinterprétés par cmd.exe — cf. env.claudeCode.bin.
    const appel = execFileAsync(env.claudeCode.bin, args, {
      cwd: CWD,
      timeout: TIMEOUT_MS,
      maxBuffer: 8 * 1024 * 1024,
      env: childEnv()
    });
    // Le message (tout le contexte du match) part par l'entrée standard, pas
    // en argument : une ligne de commande Windows plafonne à ~32 000
    // caractères, et un grand championnat (classement complet, actualités,
    // formes) peut s'en approcher.
    appel.child.stdin.end(userMessage);
    ({ stdout } = await appel);
  } catch (error) {
    // Un code de sortie non nul (is_error côté CLI) rejette execFile mais
    // laisse quand même le JSON dans error.stdout — c'est là qu'est le vrai
    // message ("Not logged in", quota, etc.), pas dans error.message.
    stdout = error.stdout || '';
    if (!stdout) throw new ClaudeCodeIndisponible(`Claude Code (headless) n'a pas répondu : ${error.message}`);
  }

  let payload;
  try {
    payload = JSON.parse(stdout);
  } catch {
    throw new ClaudeCodeIndisponible(`Claude Code (headless) : sortie illisible (${stdout.slice(0, 200)}).`);
  }

  if (payload.is_error) {
    throw new ClaudeCodeIndisponible(`Claude Code (headless) : ${payload.result || 'échec inconnu'}.`);
  }
  if (!payload.structured_output) {
    throw new Error('Claude Code (headless) : réponse sans sortie structurée (schéma non respecté).');
  }

  return { structuredOutput: payload.structured_output, usage: payload.usage ?? null, costUsd: payload.total_cost_usd ?? 0 };
}
