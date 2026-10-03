<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useConfigStore } from '@/stores/configStore.js';
import { useSourcesStore } from '@/stores/sourcesStore.js';
import { useToastStore } from '@/stores/toastStore.js';
import { useAiAnalysisStore } from '@/stores/aiAnalysisStore.js';
import { useFlashscoreStore } from '@/stores/flashscoreStore.js';
import { generatorApi } from '@/services/generatorApi.js';
import { matchStatsApi } from '@/services/matchStatsApi.js';
import { refreshApi } from '@/services/refreshApi.js';
import AppCard from '@/components/common/AppCard.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import EngineConfigForm from '@/components/settings/EngineConfigForm.vue';
import RiskControlPanel from '@/components/settings/RiskControlPanel.vue';
import DataGeneratorPanel from '@/components/settings/DataGeneratorPanel.vue';
import AiConnectionForm from '@/components/settings/AiConnectionForm.vue';
import AiAnalysisPanel from '@/components/settings/AiAnalysisPanel.vue';
import MatchStatsCoveragePanel from '@/components/settings/MatchStatsCoveragePanel.vue';
import RefreshStatusPanel from '@/components/settings/RefreshStatusPanel.vue';

/**
 * Réglages — section cyan. Refonte visuelle du 01/10/2026 (guide ui/DESIGN.md) :
 * un bandeau qui dit l'état de l'appli en trois puces (actualisation, IA,
 * coupe-circuit), puis les cartes à icône. Aucune donnée ni action n'a bougé.
 */
const configStore = useConfigStore();
const sourcesStore = useSourcesStore();
const toastStore = useToastStore();
const aiAnalysisStore = useAiAnalysisStore();
const flashscoreStore = useFlashscoreStore();

const saving = ref(false);
const generating = ref(false);
const statsCoverage = ref(null);
const refreshOverview = ref(null);
const startingRefresh = ref(false);
const resettling = ref(false);
let refreshPollTimer = null;
// Faux une fois la page quittée : une réponse arrivée après ne réarme plus
// de minuteur, que plus personne n'annulerait.
let pageOuverte = true;

const MODEL_WEIGHTS = [
  { key: 'market', label: 'Consensus marché', description: 'Moyenne des cotes bookmakers — le signal le plus fiable.' },
  { key: 'structural', label: 'Facteurs structurels', description: 'Pressing, fatigue et rotation — impact borné à ±6%.' },
  { key: 'exogenous', label: 'Facteurs exogènes', description: 'Météo et état du terrain — impact borné à ±2%.' }
];

// ------------------------------------------------ puces du bandeau
// Présentation seulement : l'état de l'actualisation, de l'IA et du
// coupe-circuit, lus dans ce que la page charge déjà pour ses cartes.
const puceActualisation = computed(() => {
  const o = refreshOverview.value;
  if (!o) return { libelle: 'Actualisation : état inconnu', ton: '', icone: 'refresh', enCours: false };
  if (o.running) return { libelle: 'Actualisation en cours', ton: 'is-warning', icone: 'refresh', enCours: true };
  if (!o.enabled) return { libelle: 'Actualisation automatique désactivée', ton: 'is-danger', icone: 'pause', enCours: false };
  const issue = o.lastPass?.outcome;
  if (!issue) return { libelle: 'Actualisation : aucune passe encore', ton: '', icone: 'clock', enCours: false };
  const tons = { ok: 'is-accent', partial: 'is-warning', error: 'is-danger' };
  const libelles = { ok: 'réussie', partial: 'à regarder', error: 'en échec' };
  return { libelle: `Dernière actualisation ${libelles[issue] ?? issue}`, ton: tons[issue] ?? '', icone: issue === 'ok' ? 'check' : 'alert', enCours: false };
});
const iaConnectee = computed(() => Boolean(aiAnalysisStore.status?.connected));
const coupeCircuit = computed(() => Boolean(configStore.tilt?.circuitBreakerActive));

onMounted(() => {
  configStore.fetchAll();
  sourcesStore.fetchSources();
  aiAnalysisStore.fetchStatus();
  aiAnalysisStore.fetchHistory();
  flashscoreStore.fetchStatus();
  loadStatsCoverage();
  loadRefreshOverview();
});

onUnmounted(() => {
  pageOuverte = false;
  clearTimeout(refreshPollTimer);
});

/** Couverture des statistiques, championnat par championnat. */
async function loadStatsCoverage() {
  try {
    statsCoverage.value = await matchStatsApi.coverage();
  } catch {
    statsCoverage.value = null; // Le panneau affiche « indisponible ».
  }
}

/**
 * État de l'actualisation automatique. Pendant une passe, relu toutes les
 * quatre secondes pour suivre les étapes ; sinon chaque minute, pour voir
 * arriver la passe automatique suivante. À la fin d'une passe, la
 * couverture est relue elle aussi.
 */
async function loadRefreshOverview() {
  clearTimeout(refreshPollTimer);
  const enCours = Boolean(refreshOverview.value?.running);
  try {
    refreshOverview.value = await refreshApi.overview();
  } catch {
    refreshOverview.value = null;
  }
  if (!pageOuverte) return;
  clearTimeout(refreshPollTimer);
  if (enCours && !refreshOverview.value?.running) loadStatsCoverage();
  refreshPollTimer = setTimeout(loadRefreshOverview, refreshOverview.value?.running ? 4000 : 60000);
}

async function handleRunRefresh() {
  startingRefresh.value = true;
  try {
    const result = await refreshApi.run();
    toastStore.success(result.alreadyRunning ? 'Une actualisation est déjà en cours.' : 'Actualisation lancée.');
    await loadRefreshOverview();
  } catch (error) {
    toastStore.error(`Actualisation impossible : ${error.message}`);
  } finally {
    startingRefresh.value = false;
  }
}

async function handleResettle(keys) {
  if (!keys?.length) return;
  const ok = window.confirm(
    `Remplacer ${keys.length} statut(s) par ce que dit le score final ?\n\n` +
      "Seules les lignes affichées sont touchées. Un statut posé à la main parce que le bookmaker a payé autrement serait écrasé."
  );
  if (!ok) return;
  resettling.value = true;
  try {
    const r = await refreshApi.resettle(keys);
    toastStore.success(`${r.predictions} pronostic(s) et ${r.betLegs} sélection(s) corrigés d'après le score final.`);
    await loadRefreshOverview();
  } catch (error) {
    toastStore.error(`Correction impossible : ${error.message}`);
  } finally {
    resettling.value = false;
  }
}

async function handleSaveConfig(partialConfig) {
  saving.value = true;
  try {
    await configStore.updateConfig(partialConfig);
    toastStore.success('Configuration enregistrée.');
  } catch (error) {
    toastStore.error(`Échec de l'enregistrement : ${error.message}`);
  } finally {
    saving.value = false;
  }
}

async function handleResetConfig() {
  try {
    await configStore.resetConfig();
    toastStore.success('Configuration réinitialisée aux valeurs par défaut.');
  } catch (error) {
    toastStore.error(error.message);
  }
}

async function handleToggleCircuitBreaker(active) {
  try {
    await configStore.setCircuitBreaker(active);
    toastStore.success(active ? 'Coupe-circuit activé : les mises sont suspendues.' : 'Coupe-circuit désactivé.');
  } catch (error) {
    toastStore.error(error.message);
  }
}

async function handleResetTilt() {
  try {
    await configStore.resetTilt();
    toastStore.success('État de risque réinitialisé.');
  } catch (error) {
    toastStore.error(error.message);
  }
}

async function handleGenerate(count) {
  generating.value = true;
  try {
    const { count: generated } = await generatorApi.generateSampleMatches(count);
    toastStore.success(`${generated} matchs fictifs générés.`);
    sourcesStore.fetchSources();
  } catch (error) {
    toastStore.error(`Échec de la génération : ${error.message}`);
  } finally {
    generating.value = false;
  }
}

async function handleRefreshOdds() {
  try {
    const result = await sourcesStore.refreshOdds();
    toastStore.success(`${result.matchesFetched} matchs récupérés depuis The Odds API.`);
  } catch (error) {
    toastStore.error(`Échec de la synchronisation : ${error.message}`);
  }
}

async function handleRefreshCompetitions() {
  try {
    const result = await sourcesStore.refreshCompetitions();
    toastStore.success(`${result.competitionsFetched} compétitions récupérées depuis football-data.org.`);
  } catch (error) {
    toastStore.error(`Échec de la synchronisation : ${error.message}`);
  }
}

async function handleRefreshFlashscore() {
  if (!window.confirm('Lancer une actualisation FlashScore ? Chaque exécution est facturée sur ton compte Apify (~2-3 $ pour une journée de football).')) return;
  try {
    const status = await flashscoreStore.refresh();
    toastStore.success(`${status.teamCount} équipe(s) avec stats sur ${status.matchCount} match(s) FlashScore scannés.`);
  } catch (error) {
    toastStore.error(`Actualisation FlashScore impossible : ${error.message}`);
  }
}

async function handleConnectAi(apiKey, model, workspaceId) {
  try {
    await aiAnalysisStore.connect(apiKey, model, workspaceId);
    toastStore.success('IA connectée.');
  } catch (error) {
    toastStore.error(`Connexion impossible : ${error.message}`);
  }
}

async function handleDisconnectAi() {
  try {
    await aiAnalysisStore.disconnect();
    toastStore.success('IA déconnectée.');
  } catch (error) {
    toastStore.error(error.message);
  }
}

async function handleRunAiAnalysis(limit) {
  try {
    await aiAnalysisStore.runAnalysis(limit);
    toastStore.success('Analyse IA terminée.');
  } catch (error) {
    toastStore.error(`Analyse impossible : ${error.message}`);
  }
}
</script>

<template>
  <div class="settings-view cm-page">
    <LoadingSpinner v-if="configStore.loading && !configStore.config" label="Chargement des réglages…" />

    <template v-else-if="configStore.config">
      <!-- Le bandeau : ce que la page règle, et l'état de l'appli en trois puces. -->
      <section class="cm-hero settings-hero">
        <div class="cm-hero__top">
          <h2 class="cm-hero__title">
            <span class="settings-hero__logo"><AppIcon name="settings" :size="16" /></span>
            Réglages
          </h2>
          <span class="cm-hero__chips">
            <span class="cm-chip" :class="puceActualisation.ton" title="Actualisation automatique des données (calendrier, résultats, classements, statistiques, règlement)">
              <AppIcon :name="puceActualisation.icone" :size="11" :class="{ 'settings-hero__spin': puceActualisation.enCours }" />
              {{ puceActualisation.libelle }}
            </span>
            <span class="cm-chip" :class="iaConnectee ? 'is-info' : ''" title="Connexion à l'API Anthropic pour l'analyse IA des pronostics">
              <AppIcon name="sparkles" :size="11" />
              {{ iaConnectee ? 'IA connectée' : 'IA non connectée' }}
            </span>
            <span class="cm-chip" :class="coupeCircuit ? 'is-danger' : 'is-accent'" title="Coupe-circuit manuel : suspend toute recommandation de mise">
              <AppIcon :name="coupeCircuit ? 'alert' : 'shield'" :size="11" />
              {{ coupeCircuit ? 'Coupe-circuit actif' : 'Mises autorisées' }}
            </span>
          </span>
        </div>
        <p class="cm-hero__subtitle">
          Le moteur et ses seuils, le coupe-circuit, les sources de données, l'actualisation automatique, la couverture des statistiques et
          l'IA : tout ce qui se règle, au même endroit. Les poids du modèle se lisent à côté de la connexion IA, à titre indicatif.
        </p>
      </section>

      <AppCard
        title="Paramètres du moteur"
        subtitle="Seuils et coefficients utilisés par le calcul d'edge et de mise"
        eyebrow="Moteur"
        icon="sliders"
      >
        <EngineConfigForm :config="configStore.config" :saving="saving" @save="handleSaveConfig" @reset="handleResetConfig" />
      </AppCard>

      <div class="settings-view__row">
        <AppCard title="Gestion du risque" subtitle="Coupe-circuit manuel, indépendant de la configuration" eyebrow="Sécurité" icon="shield">
          <RiskControlPanel
            :circuit-breaker-active="configStore.tilt?.circuitBreakerActive ?? false"
            @toggle="handleToggleCircuitBreaker"
            @reset="handleResetTilt"
          />
        </AppCard>

        <AppCard title="Données" subtitle="Disponibilité des sources et génération de jeux de test" eyebrow="Sources" icon="database">
          <DataGeneratorPanel
            :fixtures="sourcesStore.fixtures"
            :generating="generating"
            :refreshing-odds="sourcesStore.refreshingOdds"
            :refreshing-competitions="sourcesStore.refreshingCompetitions"
            :last-odds-quota="sourcesStore.lastOddsQuota"
            :flashscore-status="flashscoreStore.status"
            :refreshing-flashscore="flashscoreStore.refreshing"
            @generate="handleGenerate"
            @refresh-odds="handleRefreshOdds"
            @refresh-competitions="handleRefreshCompetitions"
            @refresh-flashscore="handleRefreshFlashscore"
          />
        </AppCard>
      </div>

      <AppCard
        title="Actualisation automatique"
        subtitle="Calendrier, résultats, classements, statistiques, règlement des paris : tout se met à jour seul"
        eyebrow="Automatisation"
        icon="refresh"
      >
        <RefreshStatusPanel
          :overview="refreshOverview"
          :starting="startingRefresh"
          :resettling="resettling"
          @run="handleRunRefresh"
          @resettle="handleResettle"
        />
      </AppCard>

      <AppCard title="Couverture des statistiques" subtitle="Statistiques d'équipe et de joueurs, par championnat" eyebrow="Statistiques" icon="barChart">
        <MatchStatsCoveragePanel :coverage="statsCoverage" />
      </AppCard>

      <div class="settings-view__row">
        <AppCard title="Connexion IA" subtitle="Connectez votre clé API Anthropic pour activer l'analyse" eyebrow="Intelligence artificielle" icon="sparkles">
          <AiConnectionForm :status="aiAnalysisStore.status" :connecting="aiAnalysisStore.connecting" @connect="handleConnectAi" @disconnect="handleDisconnectAi" />
        </AppCard>

        <AppCard title="Structure du modèle" subtitle="Importance relative des signaux — à titre indicatif, non modifiable" eyebrow="Modèle" icon="pieChart">
          <div class="model-weights cm-stagger">
            <div v-for="weight in MODEL_WEIGHTS" :key="weight.key" class="model-weights__item cm-block">
              <div class="model-weights__top">
                <span class="model-weights__label">{{ weight.label }}</span>
                <span class="cm-pill is-section">{{ Math.round(configStore.config.weights[weight.key] * 100) }}%</span>
              </div>
              <div class="cm-bar model-weights__bar">
                <div class="cm-bar__fill" :style="{ width: configStore.config.weights[weight.key] * 100 + '%' }" />
              </div>
              <p class="cm-text-muted model-weights__description">{{ weight.description }}</p>
            </div>
          </div>
        </AppCard>
      </div>

      <AppCard
        title="Analyse IA des pronostics"
        subtitle="Corrélations entre lieu, compétition, phase de saison et justesse des pronostics"
        eyebrow="Intelligence artificielle"
        icon="cpu"
      >
        <AiAnalysisPanel
          :connected="aiAnalysisStore.status?.connected ?? false"
          :running="aiAnalysisStore.running"
          :history="aiAnalysisStore.history"
          @run="handleRunAiAnalysis"
        />
      </AppCard>
    </template>
  </div>
</template>

<style scoped>
.settings-view {
  /* Se règle sur SA largeur : deux colonnes dès que la place existe. */
  container: settings / inline-size;
}

/* ------------------------------------------------------------ bandeau */
.settings-hero__logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--cm-section), rgba(var(--cm-section-rgb) / 0.6));
  color: var(--cm-section-on);
  box-shadow: var(--cm-shadow-section);
}

/* L'icône de la puce tourne tant qu'une passe est en cours. */
.settings-hero__spin {
  animation: settings-spin 1.6s linear infinite;
}

@keyframes settings-spin {
  to {
    transform: rotate(360deg);
  }
}

/* --------------------------------------------------------- deux colonnes */
.settings-view__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}

@container settings (min-width: 860px) {
  .settings-view__row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* ------------------------------------------------------ poids du modèle */
.model-weights {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.model-weights__item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.model-weights__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.model-weights__label {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--cm-text-primary);
}

.model-weights__bar {
  height: 7px;
}

.model-weights__description {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
}
</style>
