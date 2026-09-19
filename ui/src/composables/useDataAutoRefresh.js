import { onMounted, onUnmounted } from 'vue';
import { dataVersionApi } from '@/services/dataVersionApi.js';
import { useDataVersionStore } from '@/stores/dataVersionStore.js';
import { useMatchesStore } from '@/stores/matchesStore.js';
import { usePredictionsStore } from '@/stores/predictionsStore.js';
import { useBetsStore } from '@/stores/betsStore.js';
import { useMatchAiAnalysisStore } from '@/stores/matchAiAnalysisStore.js';
import { useSourcesStore } from '@/stores/sourcesStore.js';
import { useToastStore } from '@/stores/toastStore.js';

// 30 s : l'appel ne fait que quelques `stat` côté serveur, et les données ne
// changent en pratique qu'une fois par jour (tâche planifiée). L'intérêt n'est
// pas la réactivité à la seconde mais qu'un onglet laissé ouvert la nuit ne
// montre pas des données de la veille au matin.
const POLL_INTERVAL_MS = 30000;

/**
 * Rafraîchit l'appli quand les fichiers de données changent côté serveur.
 *
 * À monter UNE SEULE FOIS, dans AppShell. Le serveur relit déjà ses JSON à
 * chaque requête : il suffit donc de savoir QUAND refaire les appels. On
 * interroge pour cela une empreinte peu coûteuse (/data-version) plutôt que de
 * re-télécharger périodiquement des listes entières.
 *
 * Seuls les stores DÉJÀ peuplés sont rechargés : inutile d'aller chercher les
 * paris si l'utilisateur n'a jamais ouvert la page correspondante, la vue le
 * fera à son montage. Les vues qui gardent leurs données en local surveillent
 * `dataVersionStore.version` de leur côté.
 */
export function useDataAutoRefresh() {
  const dataVersion = useDataVersionStore();
  const matches = useMatchesStore();
  const predictions = usePredictionsStore();
  const bets = useBetsStore();
  const matchAiAnalysis = useMatchAiAnalysisStore();
  const sources = useSourcesStore();
  const toast = useToastStore();

  let intervalId = null;
  // Verrou posé AVANT tout `await` : `visibilitychange` et `focus` se
  // déclenchent souvent ensemble, et deux contrôles concurrents liraient la
  // même version précédente avant que l'un ait écrit la nouvelle — d'où un
  // double rechargement et un toast en double. Une variable locale synchrone,
  // pas l'état du store, parce que seule la synchronicité protège ici.
  let checking = false;

  async function refreshLoadedStores() {
    const jobs = [];
    if (matches.matches.length) jobs.push(matches.fetchMatches());
    if (predictions.entries.length) jobs.push(predictions.fetchPredictions());
    if (bets.bets.length) jobs.push(bets.fetchBets());
    if (Object.keys(matchAiAnalysis.byMatchId).length) jobs.push(matchAiAnalysis.fetchAll());
    if (sources.sources.length) jobs.push(sources.fetchSources());

    // allSettled : un store en erreur ne doit pas empêcher les autres de se
    // remettre à jour. Chaque store gère déjà son propre `error`.
    if (jobs.length) await Promise.allSettled(jobs);
    dataVersion.markRefreshed();
  }

  async function check() {
    // Onglet en arrière-plan : on ne fait rien, le retour au premier plan
    // déclenche un contrôle immédiat (cf. onVisibilityChange).
    if (typeof document !== 'undefined' && document.hidden) return;
    if (checking) return;
    checking = true;

    try {
      let payload;
      try {
        payload = await dataVersionApi.get();
      } catch {
        return; // Serveur injoignable : silencieux, la prochaine passe réessaiera.
      }
      if (!payload?.version) return;

      const previous = dataVersion.version;
      dataVersion.setVersion(payload.version, payload.updatedAt ?? null);

      // Première observation : on mémorise l'empreinte sans rien recharger, les
      // vues viennent de charger leurs données à leur montage.
      if (previous === null || previous === payload.version) return;

      dataVersion.refreshing = true;
      try {
        await refreshLoadedStores();
        toast.push('Nouvelles données disponibles : affichage actualisé.', 'info');
      } finally {
        dataVersion.refreshing = false;
      }
    } finally {
      checking = false;
    }
  }

  function onVisibilityChange() {
    if (!document.hidden) check();
  }

  onMounted(() => {
    check();
    intervalId = setInterval(check, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onVisibilityChange);
  });

  onUnmounted(() => {
    clearInterval(intervalId);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('focus', onVisibilityChange);
  });

  return { check };
}
