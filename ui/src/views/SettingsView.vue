<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { useConfigStore } from '@/stores/configStore.js';
import { useSourcesStore } from '@/stores/sourcesStore.js';
import { useToastStore } from '@/stores/toastStore.js';
import { useAiAnalysisStore } from '@/stores/aiAnalysisStore.js';
import { useFlashscoreStore } from '@/stores/flashscoreStore.js';
import { generatorApi } from '@/services/generatorApi.js';
import { matchStatsApi } from '@/services/matchStatsApi.js';
import AppCard from '@/components/common/AppCard.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import EngineConfigForm from '@/components/settings/EngineConfigForm.vue';
import RiskControlPanel from '@/components/settings/RiskControlPanel.vue';
import DataGeneratorPanel from '@/components/settings/DataGeneratorPanel.vue';
import AiConnectionForm from '@/components/settings/AiConnectionForm.vue';
import AiAnalysisPanel from '@/components/settings/AiAnalysisPanel.vue';
import MatchStatsCoveragePanel from '@/components/settings/MatchStatsCoveragePanel.vue';

const configStore = useConfigStore();
const sourcesStore = useSourcesStore();
const toastStore = useToastStore();
const aiAnalysisStore = useAiAnalysisStore();
const flashscoreStore = useFlashscoreStore();

const saving = ref(false);
const generating = ref(false);
const statsCoverage = ref(null);
const refreshingStats = ref(false);
let statsPollTimer = null;

const MODEL_WEIGHTS = [
  { key: 'market', label: 'Consensus marché', description: 'Moyenne des cotes bookmakers — le signal le plus fiable.' },
  { key: 'structural', label: 'Facteurs structurels', description: 'Pressing, fatigue et rotation — impact borné à ±6%.' },
  { key: 'exogenous', label: 'Facteurs exogènes', description: 'Météo et état du terrain — impact borné à ±2%.' }
];

onMounted(() => {
  configStore.fetchAll();
  sourcesStore.fetchSources();
  aiAnalysisStore.fetchStatus();
  aiAnalysisStore.fetchHistory();
  flashscoreStore.fetchStatus();
  loadStatsCoverage();
});

onUnmounted(() => {
  clearTimeout(statsPollTimer);
});

/**
 * Relit la couverture. Tant qu'un rafraîchissement tourne (au démarrage du
 * serveur ou déclenché ici), on repasse toutes les cinq secondes pour voir
 * les barres progresser.
 */
async function loadStatsCoverage() {
  try {
    statsCoverage.value = await matchStatsApi.coverage();
    clearTimeout(statsPollTimer);
    if (statsCoverage.value?.refresh?.running) statsPollTimer = setTimeout(loadStatsCoverage, 5000);
  } catch {
    statsCoverage.value = null; // Le panneau affiche « indisponible ».
  }
}

async function handleRefreshStats() {
  refreshingStats.value = true;
  try {
    const result = await matchStatsApi.refresh();
    toastStore.success(result.alreadyRunning ? 'Un rafraîchissement est déjà en cours.' : 'Rafraîchissement lancé en fond.');
    await loadStatsCoverage();
  } catch (error) {
    toastStore.error(`Rafraîchissement impossible : ${error.message}`);
  } finally {
    refreshingStats.value = false;
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
  <div class="settings-view">
    <LoadingSpinner v-if="configStore.loading && !configStore.config" />

    <template v-else-if="configStore.config">
      <AppCard title="Paramètres du moteur" subtitle="Seuils et coefficients utilisés par le calcul d'edge et de mise">
        <EngineConfigForm :config="configStore.config" :saving="saving" @save="handleSaveConfig" @reset="handleResetConfig" />
      </AppCard>

      <div class="settings-view__row">
        <AppCard title="Gestion du risque" subtitle="Coupe-circuit manuel, indépendant de la configuration">
          <RiskControlPanel
            :circuit-breaker-active="configStore.tilt?.circuitBreakerActive ?? false"
            @toggle="handleToggleCircuitBreaker"
            @reset="handleResetTilt"
          />
        </AppCard>

        <AppCard title="Données" subtitle="Disponibilité des sources et génération de jeux de test">
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
        title="Couverture des statistiques"
        subtitle="Statistiques d'équipe et de joueurs, complétées automatiquement en fond"
      >
        <MatchStatsCoveragePanel :coverage="statsCoverage" :refreshing="refreshingStats" @refresh="handleRefreshStats" />
      </AppCard>

      <AppCard title="Connexion IA" subtitle="Connectez votre clé API Anthropic pour activer l'analyse">
        <AiConnectionForm :status="aiAnalysisStore.status" :connecting="aiAnalysisStore.connecting" @connect="handleConnectAi" @disconnect="handleDisconnectAi" />
      </AppCard>

      <AppCard title="Analyse IA des pronostics" subtitle="Corrélations entre lieu, compétition, phase de saison et justesse des pronostics">
        <AiAnalysisPanel
          :connected="aiAnalysisStore.status?.connected ?? false"
          :running="aiAnalysisStore.running"
          :history="aiAnalysisStore.history"
          @run="handleRunAiAnalysis"
        />
      </AppCard>

      <AppCard title="Structure du modèle" subtitle="Importance relative des signaux — à titre indicatif, non modifiable">
        <div class="model-weights">
          <div v-for="weight in MODEL_WEIGHTS" :key="weight.key" class="model-weights__item">
            <div class="model-weights__top">
              <span>{{ weight.label }}</span>
              <span class="cm-numeric cm-text-secondary">{{ Math.round(configStore.config.weights[weight.key] * 100) }}%</span>
            </div>
            <div class="model-weights__track">
              <div class="model-weights__fill" :style="{ width: configStore.config.weights[weight.key] * 100 + '%' }" />
            </div>
            <p class="cm-text-muted model-weights__description">{{ weight.description }}</p>
          </div>
        </div>
      </AppCard>
    </template>
  </div>
</template>

<style scoped>
.settings-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.settings-view__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.model-weights {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.model-weights__top {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  margin-bottom: 6px;
}

.model-weights__track {
  height: 5px;
  border-radius: 3px;
  background: var(--cm-surface-hover);
  overflow: hidden;
}

.model-weights__fill {
  height: 100%;
  background: var(--cm-accent);
}

.model-weights__description {
  font-size: 12px;
  margin-top: 6px;
}

@media (max-width: 860px) {
  .settings-view__row {
    grid-template-columns: 1fr;
  }
}
</style>
