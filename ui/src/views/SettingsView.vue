<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
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
// Étape 42 du plan : le bulletin du jour et le bilan de la semaine, deux textes écrits par l'IA (deux étapes de l'actualisation).
import BulletinsPanel from '@/components/settings/BulletinsPanel.vue';
import FavoritesPanel from '@/components/settings/FavoritesPanel.vue';
import FreeOddsCoveragePanel from '@/components/settings/FreeOddsCoveragePanel.vue';
import BackupStatusPanel from '@/components/settings/BackupStatusPanel.vue';
import RecordersStatusPanel from '@/components/settings/RecordersStatusPanel.vue';
import ClaudeBudgetPanel from '@/components/settings/ClaudeBudgetPanel.vue';
import PaidOddsAdvicePanel from '@/components/settings/PaidOddsAdvicePanel.vue';
// Étape 11 du plan : les garde-fous de Pierre (sous le coupe-circuit qu'ils enclenchent) et les fiches de ses comptes bookmakers.
import GardeFousPanel from '@/components/settings/GardeFousPanel.vue';
import BookmakerAccountsPanel from '@/components/settings/BookmakerAccountsPanel.vue';
// Étape 12 du plan : les contrôles des données et le carnet de santé (un état préparé chaque nuit).
import DataHealthPanel from '@/components/settings/DataHealthPanel.vue';
// Étape 13 du plan : l'historique football-data depuis 2000 (un résumé préparé à chaque passe).
import FdHistoryPanel from '@/components/settings/FdHistoryPanel.vue';
// Étape 17 du plan : la table du jour J (ce qu'on savait la veille de chaque match), tenue à jour chaque nuit.
import DayTablePanel from '@/components/settings/DayTablePanel.vue';
// Étape 14 du plan : le contrôle quotidien des données (le feu) et la santé des sources.
import DailyChecksPanel from '@/components/settings/DailyChecksPanel.vue';
import SourceHealthPanel from '@/components/settings/SourceHealthPanel.vue';
// Étape 25 du plan : les versions du moteur (numéro de chaque état, candidate à blanc, retour arrière).
import EngineVersionsPanel from '@/components/settings/EngineVersionsPanel.vue';
import { phraseDeLEnregistrement, avertissementDeLEnregistrement, confirmationSansEtat } from '@/utils/versionsMoteur.js';
import { avertissementDeLaRemiseAZero } from '@/utils/modeleDeButs.js';

/**
 * Réglages — section cyan. Refonte visuelle du 01/10/2026 (guide ui/DESIGN.md) :
 * un bandeau qui dit l'état de l'appli en trois puces (actualisation, IA,
 * coupe-circuit), puis les cartes à icône. Aucune donnée ni action n'a bougé.
 */
const configStore = useConfigStore();
// Étape 14 : la puce du feu, en haut de l'appli, mène à la carte du contrôle quotidien (« ?carte=controle-quotidien »).
const route = useRoute();
const montrerLeControle = computed(() => route?.query?.carte === 'controle-quotidien');
const sourcesStore = useSourcesStore();
const toastStore = useToastStore();
const aiAnalysisStore = useAiAnalysisStore();
const flashscoreStore = useFlashscoreStore();

const saving = ref(false);
// Étape 26 : l'état des versions du moteur que la carte « Versions du moteur » vient de lire — la candidate en essai ou
// jugée y est ; « Paramètres du moteur » en tire son avertissement (et la remise à zéro sa confirmation).
const etatDesVersions = ref(null);
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
  { key: 'market', label: 'Consensus marché', description: "Cotes des bookmakers de référence (les plus fiables d'abord), marge retirée." },
  { key: 'structural', label: 'Facteurs structurels', description: "Le modèle statistique seul (attaque et défense des deux équipes). Poids 0 % : le 1N2 vient du marché. Ses réglages « pressing, fatigue » n'ont jamais reçu de données." },
  { key: 'exogenous', label: 'Facteurs exogènes', description: "Le même modèle ajusté par la météo et le terrain. Poids 0 %, et l'ajustement n'a jamais reçu de données. Le contexte du match (étape 32) est montré à part." }
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
    direLaVersion();
  } catch (error) {
    toastStore.error(`Échec de l'enregistrement : ${error.message}`);
  } finally {
    saving.value = false;
  }
}

async function handleResetConfig() {
  // Étape 26 : remettre les valeurs par défaut fait aussi une version : si une candidate est en essai ou jugée, on le redemande.
  const essaiEnCours = avertissementDeLEnregistrement(etatDesVersions.value);
  if (essaiEnCours && !window.confirm(essaiEnCours.confirmationRemise)) return;
  // Vérification finale (constat 5) : l'état des versions pas encore lu (lecture lente ou en échec) — une confirmation générique.
  const sansEtat = confirmationSansEtat(etatDesVersions.value, { remise: true });
  if (sansEtat && !window.confirm(sansEtat)) return;
  // Étape 27 : les valeurs par défaut n'ont pas le modèle de buts unique — quand il est en service, la remise à zéro le
  // retirerait : une confirmation le dit d'abord (utils/modeleDeButs.js) ; sans lui, rien ne change.
  const avertissement = avertissementDeLaRemiseAZero(configStore.config);
  if (avertissement && !window.confirm(avertissement)) return;
  try {
    await configStore.resetConfig();
    toastStore.success('Configuration réinitialisée aux valeurs par défaut.');
    direLaVersion();
  } catch (error) {
    toastStore.error(error.message);
  }
}

/** Étape 25 : chaque enregistrement fait une version du moteur (ou reprend celle d'un état déjà vu) — dit dans un second message. */
function direLaVersion() {
  const phrase = phraseDeLEnregistrement(configStore.derniereVersion);
  if (phrase) toastStore.push(phrase, 'info');
}

/** Étape 25 : après un retour à la version précédente, le formulaire des paramètres montre les réglages remis. */
function handleRetourVersion(r) {
  configStore.appliquerRetour(r);
  toastStore.success(`Version ${r?.vers} du moteur remise en service.`);
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

/** Étape 11 : un plafond enregistré peut enclencher ou relâcher le coupe-circuit — la carte et la puce du bandeau suivent. */
async function handleGardeFousEnregistres() {
  try {
    await configStore.refreshTilt();
  } catch (error) {
    toastStore.error(`État du coupe-circuit non relu : ${error.message}`);
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
          Le moteur, ses seuils et ses versions, le coupe-circuit et vos garde-fous, vos comptes bookmakers, les sources de données, l'actualisation automatique, le budget
          Claude, les sauvegardes, les enregistreurs, le contrôle quotidien et la santé des sources, la couverture des statistiques, le carnet de santé des données et l'IA : tout ce qui se règle, au même endroit. Les poids du modèle se lisent à côté de la connexion IA, à titre indicatif.
        </p>
      </section>

      <!-- Les favoris (03/10/2026) : équipes et championnats affichés en premier. -->
      <AppCard
        title="Favoris"
        subtitle="Vos équipes et vos championnats, toujours affichés en premier"
        eyebrow="Affichage"
        icon="star"
      >
        <FavoritesPanel />
      </AppCard>

      <AppCard
        title="Paramètres du moteur"
        subtitle="Seuils et coefficients utilisés par le calcul d'edge et de mise"
        eyebrow="Moteur"
        icon="sliders"
      >
        <EngineConfigForm :config="configStore.config" :saving="saving" :essai="etatDesVersions" @save="handleSaveConfig" @reset="handleResetConfig" />
      </AppCard>

      <!-- Les versions du moteur (étape 25 du plan, le socle, 07/10/2026) : un numéro pour chaque état du moteur, la candidate à blanc, le retour arrière. -->
      <AppCard
        title="Versions du moteur"
        subtitle="Chaque état du moteur — ses réglages et son code — a un numéro, gardé avec chaque pronostic ; la version candidate calculée à blanc ; le retour à la version précédente en un clic"
        eyebrow="Moteur"
        icon="history"
      >
        <EngineVersionsPanel
          :changement-le="configStore.derniereVersion?.le ?? null"
          :passe-terminee-le="refreshOverview?.lastCompletedAt ?? null"
          @retour="handleRetourVersion"
          @lu="(d) => (etatDesVersions = d)"
        />
      </AppCard>

      <div class="settings-view__row">
        <AppCard title="Gestion du risque" subtitle="Coupe-circuit manuel, indépendant de la configuration, et vos garde-fous (mise maximale, perte maximale par semaine)" eyebrow="Sécurité" icon="shield">
          <RiskControlPanel
            :circuit-breaker-active="configStore.tilt?.circuitBreakerActive ?? false"
            :manuel="configStore.tilt?.coupeCircuitManuel ?? null"
            :automatique="configStore.tilt?.automatique ?? null"
            @toggle="handleToggleCircuitBreaker"
            @reset="handleResetTilt"
          />
          <GardeFousPanel @enregistre="handleGardeFousEnregistres" />
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

      <!-- Les comptes de vos bookmakers (étape 11 du plan) : solde déclaré, mise maximale acceptée, limitation — jamais d'identifiant ni de mot de passe. -->
      <AppCard
        title="Comptes bookmakers"
        subtitle="Une fiche par compte : solde déclaré, mise maximale acceptée connue, limitation éventuelle et date de mise à jour — pour signaler un pari au-delà de la mise acceptée"
        eyebrow="Vos comptes"
        icon="wallet"
      >
        <BookmakerAccountsPanel />
      </AppCard>

      <!-- Les cotes de vos bookmakers (étape 7 du plan) : quand un relevé payant vaut le coup — information seulement,
           le bouton reste « Actualiser » de la carte Données — et le réglage de fraîcheur des cotes. -->
      <AppCard
        title="Cotes de vos bookmakers"
        subtitle="Quand relever les cotes payantes, ce que ça coûte, et quand une cote devient trop vieille pour une value"
        eyebrow="The Odds API"
        icon="clock"
      >
        <PaidOddsAdvicePanel />
      </AppCard>

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

      <!-- Le bulletin du jour et le bilan de la semaine (étape 42 du plan, 22/10/2026) : deux textes écrits par l'IA, un appel à Claude Code par jour et par semaine, sur une fiche chiffrée du code. -->
      <AppCard
        title="Bulletin du jour et bilan de la semaine"
        subtitle="Chaque matin, ce qui vaut le coup aujourd'hui et pourquoi ; chaque semaine, ce qui a marché, ce qui a perdu et où l'IA s'est trompée — écrits par l'IA sur des chiffres calculés par le code, jamais les siens"
        eyebrow="Intelligence artificielle"
        icon="sparkles"
      >
        <BulletinsPanel :passe-terminee-le="refreshOverview?.lastCompletedAt ?? null" />
      </AppCard>

      <!-- Le contrôle quotidien (étape 14 du plan, 07/10/2026) : le feu vert / orange / rouge de chaque passe, les contrôles en échec, puis la santé de chaque source. -->
      <AppCard
        title="Contrôle quotidien des données"
        subtitle="Après chaque actualisation, une trentaine de contrôles rapides donnent un feu vert, orange ou rouge : scores face à football-data, doublons, chiffres impossibles, zéros « non relevé », saisons hors repères, sources — sans rien corriger"
        eyebrow="Qualité des données"
        icon="activity"
      >
        <DailyChecksPanel :passe-terminee-le="refreshOverview?.lastCompletedAt ?? null" :montrer="montrerLeControle" />
      </AppCard>

      <AppCard
        title="Santé des sources"
        subtitle="FotMob, football-data, The Odds API, API-Football, Claude et les cotes gratuites : état, dernier relevé et limite de chacune, lus dans ce qu'elles ont répondu — jamais un appel de plus"
        eyebrow="Sources"
        icon="globe"
      >
        <SourceHealthPanel :passe-terminee-le="refreshOverview?.lastCompletedAt ?? null" />
      </AppCard>

      <!-- Le budget Claude (étape 4 du plan) : les tokens de l'appli face au budget, le mode économe, le plafond de 150 rappelé. -->
      <AppCard
        title="Budget Claude"
        subtitle="Les tokens de chaque appel de l'appli, face au budget du jour et de la semaine ; mode économe à 80 % ; le plafond de 150 analyses inchangé"
        eyebrow="Intelligence artificielle"
        icon="cpu"
      >
        <ClaudeBudgetPanel reglable :passe-terminee-le="refreshOverview?.lastCompletedAt ?? null" />
      </AppCard>

      <!-- Les sauvegardes (étape 1 du plan, 06/10/2026) : nuit, rotation, restauration d'essai, hors disque. -->
      <AppCard
        title="Sauvegardes"
        subtitle="Une copie compressée chaque nuit, une restauration d'essai chaque semaine, une copie hors du disque si une destination est réglée"
        eyebrow="Sécurité des données"
        icon="shield"
      >
        <BackupStatusPanel :passe-terminee-le="refreshOverview?.lastCompletedAt ?? null" />
      </AppCard>

      <!-- Les enregistreurs (étape E du plan, 05/10/2026) : ce qui ne se rattrape pas, gardé au moment où ça se passe. -->
      <AppCard
        title="Enregistreurs"
        subtitle="Absents du jour, matchs en direct, cotes payantes archivées, pronostics du moteur gelés : ce qui se perd si on ne le note pas sur le moment"
        eyebrow="Relevés"
        icon="activity"
      >
        <RecordersStatusPanel :passe-terminee-le="refreshOverview?.lastCompletedAt ?? null" />
      </AppCard>

      <AppCard
        title="Cotes gratuites"
        subtitle="ESPN, football-data.co.uk, 365Scores, Kalshi, Smarkets : ce qu'on a, compétition par compétition, et ce qui manque"
        eyebrow="Cotes"
        icon="percent"
      >
        <FreeOddsCoveragePanel />
      </AppCard>

      <AppCard title="Couverture des statistiques" subtitle="Statistiques d'équipe et de joueurs, par championnat" eyebrow="Statistiques" icon="barChart">
        <MatchStatsCoveragePanel :coverage="statsCoverage" />
      </AppCard>

      <!-- Le carnet de santé des données (étape 12 du plan, 06/10/2026) : complétude par championnat et saison, anomalies du contrôle de nuit. -->
      <AppCard
        title="Carnet de santé des données"
        subtitle="Pour chaque championnat et saison, la part des matchs qui ont leurs xG, tirs, corners, cartons, joueurs et compositions ; puis ce que le contrôle de nuit a trouvé (doublons, manquants, chiffres impossibles…) — sans rien corriger"
        eyebrow="Statistiques"
        icon="activity"
      >
        <DataHealthPanel :passe-terminee-le="refreshOverview?.lastCompletedAt ?? null" />
      </AppCard>

      <!-- L'historique football-data (étape 13 du plan, 06/10/2026) : vingt saisons de plus que le magasin FotMob, rattachées par le vote. -->
      <AppCard
        title="Historique football-data"
        subtitle="Les fichiers gratuits de football-data.co.uk depuis 2000 : saisons et matchs par championnat, clubs reconnus, rattachement à FotMob, cotes gardées, fichiers en échec et taille ajoutée à la base"
        eyebrow="Statistiques"
        icon="history"
      >
        <FdHistoryPanel :passe-terminee-le="refreshOverview?.lastCompletedAt ?? null" />
      </AppCard>

      <!-- La table du jour J (étape 17 du plan, 12/10/2026) : pour chaque match passé, ce qu'on savait la veille ; mesurée seulement. -->
      <AppCard
        title="Table du jour J"
        subtitle="Pour chaque match passé, ce que l'appli savait la veille de chaque équipe et de chaque joueur : lignes équipe et joueur, jusqu'à quand elle est à jour, et le contrôle anti-fuite de la nuit"
        eyebrow="Statistiques"
        icon="calendar"
      >
        <DayTablePanel :passe-terminee-le="refreshOverview?.lastCompletedAt ?? null" />
      </AppCard>

      <div class="settings-view__row">
        <AppCard title="Connexion IA" subtitle="Connectez votre clé API Anthropic pour activer l'analyse" eyebrow="Intelligence artificielle" icon="sparkles">
          <AiConnectionForm :status="aiAnalysisStore.status" :connecting="aiAnalysisStore.connecting" @connect="handleConnectAi" @disconnect="handleDisconnectAi" />
        </AppCard>

        <AppCard title="Structure du modèle" subtitle="Poids de chaque signal dans le pronostic du résultat (1N2). Les marchés de buts ont leur propre modèle." eyebrow="Modèle" icon="pieChart">
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
