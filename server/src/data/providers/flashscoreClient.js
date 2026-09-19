import { env } from '../../config/env.js';

/**
 * Client pour l'actor Apify "FlashScore Scraper Live" (statanow) — cf.
 * évaluation manuelle du 2026-09-13 : statistiques d'équipe riches (xG,
 * possession, tirs...) mais AUCUN score final fiable sur le match en cours
 * (le champ n'existe pas, et le reconstituer depuis `history` est incohérent
 * d'un match à l'autre). Cette source sert donc uniquement à ENRICHIR le
 * contexte qualitatif de l'IA (cf. flashscoreEnrichment.js) — jamais comme
 * source de score ou de suivi en direct.
 *
 * Passe par l'API "run + dataset" (même mécanisme que le test manuel réussi
 * sur console.apify.com), PAS l'endpoint Standby : un premier essai via
 * Standby (réponse HTTP synchrone unique pour toute une journée de matchs) a
 * échoué en "socket hang up" — la réponse "with-history" est trop volumineuse
 * (~110 Mo/jour en Football) pour tenir dans une seule connexion HTTP.
 * "run + dataset" évite ça : le run tourne côté Apify, puis le dataset déjà
 * complet est relu par pages, chaque page étant un aller-retour HTTP court.
 *
 * Coût réel (~0,01 $/résultat en mode "with-history", ~250-300 matchs
 * Football/jour) — `maxTotalChargeUsd` plafonne la dépense côté Apify (même
 * garde-fou que le champ "Maximum cost per run" utilisé lors du test manuel).
 * N'appeler cette fonction que depuis une action explicite de l'utilisateur
 * (Réglages > Actualiser), jamais en arrière-plan ni à chaque analyse IA.
 */
const TERMINAL_RUN_STATUSES = ['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'];
const RUN_SYNC_WAIT_SECONDS = 300; // maximum autorisé par Apify pour `waitForFinish`
const EXTRA_POLL_INTERVAL_MS = 5000;
const EXTRA_POLL_MAX_ATTEMPTS = 60; // ~5 minutes de plus si le run n'est toujours pas fini après les 300s ci-dessus
const DATASET_PAGE_SIZE = 50;

function actorPathId() {
  return env.apify.flashscoreActor.replace('/', '~');
}

async function apifyJsonFetch(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Apify a répondu ${response.status}${body ? ` : ${body.slice(0, 300)}` : ''}`);
  }
  return response.json();
}

async function waitForRunToFinish(runId, token) {
  for (let attempt = 0; attempt < EXTRA_POLL_MAX_ATTEMPTS; attempt++) {
    const url = new URL(`https://api.apify.com/v2/actor-runs/${runId}`);
    url.searchParams.set('token', token);
    const { data: run } = await apifyJsonFetch(url);
    if (TERMINAL_RUN_STATUSES.includes(run.status)) return run;
    await new Promise((resolve) => setTimeout(resolve, EXTRA_POLL_INTERVAL_MS));
  }
  throw new Error("L'actor FlashScore met trop de temps à répondre (> 10 minutes au total) — réessaie plus tard.");
}

async function fetchAllDatasetItems(datasetId, token) {
  const items = [];
  let offset = 0;
  while (true) {
    const url = new URL(`https://api.apify.com/v2/datasets/${datasetId}/items`);
    url.searchParams.set('token', token);
    url.searchParams.set('format', 'json');
    url.searchParams.set('clean', 'true');
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('limit', String(DATASET_PAGE_SIZE));
    const response = await fetch(url);
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`FlashScore (Apify dataset) a répondu ${response.status}${body ? ` : ${body.slice(0, 300)}` : ''}`);
    }
    const page = await response.json();
    if (!page.length) break;
    items.push(...page);
    offset += page.length;
    if (page.length < DATASET_PAGE_SIZE) break;
  }
  return items;
}

export async function fetchFlashscoreMatches({ sport = 'football', days = '0', mode = 'with-history', historyFromYear = 2020, maxTotalChargeUsd = 3 } = {}) {
  if (!env.apify.apiToken) {
    throw new Error('Jeton Apify manquant : renseignez APIFY_API_TOKEN dans server/.env');
  }

  const token = env.apify.apiToken;
  const runUrl = new URL(`https://api.apify.com/v2/acts/${actorPathId()}/runs`);
  runUrl.searchParams.set('token', token);
  runUrl.searchParams.set('waitForFinish', String(RUN_SYNC_WAIT_SECONDS));
  runUrl.searchParams.set('maxTotalChargeUsd', String(maxTotalChargeUsd));

  const { data: startedRun } = await apifyJsonFetch(runUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dayOffsets: [String(days)], sport, mode, historyFromYear })
  });

  const finishedRun = TERMINAL_RUN_STATUSES.includes(startedRun.status) ? startedRun : await waitForRunToFinish(startedRun.id, token);

  if (finishedRun.status !== 'SUCCEEDED') {
    throw new Error(
      `Run FlashScore terminé avec le statut "${finishedRun.status}" (plafond de coût : ${maxTotalChargeUsd} $ — un arrêt "ABORTED" par ce plafond est normal, pas forcément une panne).`
    );
  }

  return fetchAllDatasetItems(finishedRun.defaultDatasetId, token);
}
