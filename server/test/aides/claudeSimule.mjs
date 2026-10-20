/**
 * Claude SIMULÉ pour les tests du budget Claude (étape 4) — ce n'est PAS un
 * fichier de test. Chargé par les scripts test/aides/script-budget-*.mjs,
 * exécutés dans une copie isolée (isolement.mjs : réseau coupé, heure figée).
 *
 * AUCUN Claude n'est appelé : callClaudeCode reçoit une réponse fabriquée à
 * la place du CLI (claudeCodeClient.__testing.simulerClaude, refusé hors
 * d'une copie d'essai) ; tout le reste — contrôles, JOURNAL — tourne pour de
 * vrai. Même chose pour l'API Anthropic à la clé (anthropicClient.__testing).
 * Garde-fous en plus : refus de s'installer si un jeton Claude est présent ou
 * si l'exécutable Claude configuré existe sur le disque.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const importeur = (serveur) => (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);

/**
 * La copie n'a que `src` : l'actualisation (jobs/matchStatsAutoRefresh.js)
 * importe un script du serveur (scripts/merge-match-stats.mjs, qui n'importe
 * que src). Il est recopié depuis le serveur d'origine (CM_TEST_MODULES),
 * dans la copie seulement, avant d'importer l'actualisation.
 */
export function recopierScripts(serveur, noms = ['merge-match-stats.mjs']) {
  const origine = process.env.CM_TEST_MODULES;
  if (!origine) throw new Error('CM_TEST_MODULES manque : script lancé hors de isolement.mjs ?');
  fs.mkdirSync(path.join(serveur, 'scripts'), { recursive: true });
  for (const nom of noms) fs.copyFileSync(path.join(origine, 'scripts', nom), path.join(serveur, 'scripts', nom));
}

/** Les tokens d'une réponse simulée : `total` réparti en entrée / écriture en cache / lecture en cache / sortie, somme exacte. */
export function usageSimule(total) {
  const entree = 2;
  const ecriture = Math.round(total * 0.6);
  const lecture = Math.round(total * 0.24);
  return { input_tokens: entree, cache_creation_input_tokens: ecriture, cache_read_input_tokens: lecture, output_tokens: total - entree - ecriture - lecture };
}

/** Équivalent API simulé : 4 $ le million de tokens (un chiffre d'essai, pas un tarif). */
export const coutSimule = (total) => Math.round((total / 250_000) * 1e6) / 1e6;

/**
 * Installe le Claude simulé. `tokens(appel, i)` dit combien de tokens rend
 * l'appel numéro i (30 000 par défaut). `prochain(genre)` programme l'issue
 * de l'appel suivant : 'erreur' (is_error, avec ses tokens), 'sans-sortie'
 * (schéma non respecté, avec ses tokens), 'panne' (pas de réponse du tout).
 */
export async function installerClaudeSimule(serveur, { tokens = () => 30_000 } = {}) {
  const imp = importeur(serveur);
  const { env } = await imp('config/env.js');
  if (env.claudeCode.oauthToken) throw new Error('Un jeton Claude est présent dans l’environnement du test : refus.');
  if (env.claudeCode.bin && fs.existsSync(env.claudeCode.bin)) throw new Error(`L'exécutable Claude configuré existe (${env.claudeCode.bin}) : refus.`);
  const cc = await imp('core/ai/claudeCodeClient.js');
  const appels = [];
  const issues = [];
  cc.__testing.simulerClaude(async ({ appel, model, effort }) => {
    const i = appels.length;
    const genre = issues.shift() ?? 'ok';
    const total = tokens(appel, i);
    appels.push({ i, type: appel?.type ?? null, mode: appel?.mode ?? null, match: appel?.match ?? null, model, effort, genre, total: genre === 'panne' ? null : total });
    if (genre === 'panne') throw new cc.ClaudeCodeIndisponible("Claude Code (headless) n'a pas répondu : panne simulée");
    const usage = usageSimule(total);
    const cout = coutSimule(total);
    if (genre === 'erreur') return { is_error: true, result: 'quota simulé épuisé', usage, total_cost_usd: cout };
    if (genre === 'sans-sortie') return { is_error: false, usage, total_cost_usd: cout };
    return {
      is_error: false,
      structured_output: { summary: `Analyse simulée n° ${i + 1}.`, keyFactors: [], marketViews: [], marketReviews: [], caveats: 'simulée' },
      usage,
      total_cost_usd: cout
    };
  });
  return {
    cc,
    appels,
    prochain: (genre) => issues.push(genre),
    arreter: () => cc.__testing.simulerClaude(null)
  };
}

/** Installe l'API Anthropic simulée : `reponse(i)` rend { status, corps }. */
export async function installerAnthropicSimule(serveur, { reponse = () => ({ status: 200, corps: { model: 'claude-essai', usage: { input_tokens: 1200, output_tokens: 300 }, content: [] } }) } = {}) {
  const imp = importeur(serveur);
  const an = await imp('core/ai/anthropicClient.js');
  const envois = [];
  an.__testing.simulerEnvoi(async (url, options) => {
    const i = envois.length;
    const corpsEnvoye = JSON.parse(options.body);
    // La clé ne sort jamais d'ici : seul ce qui sert à vérifier est gardé.
    envois.push({ url, model: corpsEnvoye.model, aUneCle: Boolean(options.headers?.['x-api-key']) });
    const { status, corps } = reponse(i);
    return { status, ok: status >= 200 && status < 300, json: async () => JSON.parse(JSON.stringify(corps)) };
  });
  return { an, envois, arreter: () => an.__testing.simulerEnvoi(null) };
}

/** Une réponse d'Express factice pour appeler un contrôleur sans serveur. */
export function reponseFactice() {
  return {
    code: 200,
    corps: undefined,
    status(c) {
      this.code = c;
      return this;
    },
    json(v) {
      this.corps = v;
      return this;
    }
  };
}

/**
 * La page FotMob d'un match à venir AVEC sa composition (onze de départ de
 * chaque équipe) : `onzeDom` / `onzeExt` = [[identifiant numérique, nom], …].
 */
export function pageComposition({ home, away, onzeDom, onzeExt, coup = null }) {
  const equipe = ([nom, id], onze) => ({
    id,
    name: nom,
    formation: '4-3-3',
    starters: onze.map(([pid, nomJoueur], k) => ({ id: pid, name: nomJoueur, shirtNumber: String(k + 1), positionId: k === 0 ? 11 : 30 + k })),
    subs: [],
    unavailable: []
  });
  return {
    general: { homeTeam: { id: home[1], name: home[0] }, awayTeam: { id: away[1], name: away[0] }, matchTimeUTCDate: coup },
    header: { status: { started: false, finished: false } },
    content: { lineup: { homeTeam: equipe(home, onzeDom), awayTeam: equipe(away, onzeExt) } }
  };
}

/** Un onze fictif : onze identifiants à partir de `base`. */
export const onzeFictif = (base, prefixe) => Array.from({ length: 11 }, (_, k) => [base + k, `${prefixe} ${k + 1}`]);

/** Lit le journal du jour (fichier écrit par le serveur), sans passer par le code testé. */
export function lireFichierJournal(serveur, jour, suffixe = '') {
  const f = path.join(serveur, 'data', 'runtime', 'journal-claude', `${jour}${suffixe}.json`);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}
