<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useApiHealth } from '@/composables/useApiHealth.js';
import { refreshApi } from '@/services/refreshApi.js';
import AppIcon from '@/components/common/AppIcon.vue';
import { etatDuFeu, titreDuFeu } from '@/utils/controleQuotidien.js';
import { controlesAntiFuiteDits } from '@/utils/controlesAntiFuite.js';

const route = useRoute();
const router = useRouter();
const title = computed(() => route.meta?.title ?? 'CôteMaster');
const SECTIONS = { matches: 'Matchs', bets: 'Mes paris', history: 'Historique moteur', roadmap: 'Feuille de route', settings: 'Réglages' };
// Le fil : la section, puis la page quand elle en diffère (« Matchs › Équipe »).
const section = computed(() => SECTIONS[route.meta?.section] ?? null);
const sousPage = computed(() => (section.value && section.value !== title.value ? title.value : null));
const { isOnline } = useApiHealth();

// Repère de l'actualisation automatique : une passe en cours, ou l'heure de
// la dernière. Relu toutes les minutes, toutes les cinq secondes pendant
// une passe.
const refresh = ref(null);
let refreshTimer = null;
async function loadRefresh() {
  clearTimeout(refreshTimer);
  try {
    refresh.value = await refreshApi.overview();
  } catch {
    refresh.value = null;
  }
  refreshTimer = setTimeout(loadRefresh, refresh.value?.running ? 5000 : 60000);
}
onMounted(loadRefresh);
onUnmounted(() => clearTimeout(refreshTimer));

const quandCourt = (iso) => {
  const d = new Date(iso);
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString() ? heure : `${d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} ${heure}`;
};
/** Sauvegardes (étape 1 du plan) : ce qui manque, posé chaque nuit par l'étape « sauvegarde ». */
const alertesSauvegarde = computed(() => refresh.value?.alerts?.sauvegarde?.alertes ?? []);
const sauvegardeGrave = computed(() => alertesSauvegarde.value.some((a) => a.niveau === 'danger'));
/** Enregistreurs (étape E du plan) : un relevé arrêté ou en erreur, posé par le serveur. */
const alertesEnregistreurs = computed(() => refresh.value?.alerts?.enregistreurs?.releves ?? []);
/** Contrôles anti-fuite de la nuit (étape 27) : des écarts dans la table du jour J ou dans les forces de buts. */
const alertesFuite = computed(() => controlesAntiFuiteDits(refresh.value?.alerts ?? null));
/** Des alertes durables (contradictions, anomalies du contrôle, cotes, sauvegardes, enregistreurs, contrôles anti-fuite) sont en cours. */
const alertes = computed(() =>
  Boolean(
    refresh.value?.alerts?.contradictions?.count ||
      refresh.value?.alerts?.audit?.anomalies ||
      refresh.value?.alerts?.cotes?.sources?.length ||
      alertesSauvegarde.value.length ||
      alertesFuite.value.length ||
      alertesEnregistreurs.value.length
  )
);
const titreRepere = computed(() =>
  [
    'Actualisation automatique — détails dans Réglages',
    ...alertesSauvegarde.value.map((a) => `Sauvegardes : ${a.texte}`),
    ...alertesFuite.value.map((f) => `Contrôle anti-fuite de la nuit — ${f.texte}`),
    ...alertesEnregistreurs.value.map((a) => `Enregistreurs — ${a.nom} : ${a.probleme}`)
  ].join('\n')
);
/**
 * Étape 11 du plan : les alertes des garde-fous de Pierre (perte maximale de la semaine atteinte ou engagée,
 * série de pertes hors de sa zone normale, pari au-delà de la mise maximale), calculées par le serveur à la
 * lecture de /api/refresh — une puce à part, qui mène à Performance paris.
 */
const alertesGardeFous = computed(() => refresh.value?.gardeFous?.alertes ?? []);
const gardeFouGrave = computed(() => alertesGardeFous.value.some((a) => a.niveau === 'danger'));
function voirLeSuivi() {
  router.push({ path: '/historique-moteur', query: { onglet: 'performance' } }).catch(() => {});
}

/**
 * Étape 14 du plan : le FEU du contrôle quotidien des données (vert, orange,
 * rouge), lu dans le champ `controleQuotidien` de GET /api/refresh (déjà relu
 * chaque minute, sans route de plus). Au survol, les contrôles en échec ; un
 * clic mène à la carte « Contrôle quotidien » de Réglages.
 */
const controle = computed(() => refresh.value?.controleQuotidien ?? null);
const feuDuControle = computed(() => etatDuFeu(controle.value));
const titreDuControle = computed(() => titreDuFeu(controle.value));
function voirLeControle() {
  router.push({ name: 'settings', query: { carte: 'controle-quotidien' } }).catch(() => {});
}

/** Dernière passe trop ancienne : plus de deux intervalles et une heure. */
const ancienne = computed(() => {
  const r = refresh.value;
  if (!r?.lastPass) return false;
  return Date.now() - Date.parse(r.lastPass.finishedAt) > (2 * (r.intervalMinutes ?? 180) + 60) * 60_000;
});
const refreshLabel = computed(() => {
  const r = refresh.value;
  if (!r) return null;
  if (r.running) return r.running.stepLabel ? `Actualisation : ${r.running.stepLabel.toLowerCase()}…` : 'Actualisation…';
  if (!r.enabled) return 'Actualisation automatique désactivée';
  if (!r.lastPass) return null;
  const quand = quandCourt(r.lastPass.finishedAt);
  if (r.lastPass.outcome === 'error') return `Actualisation en échec · ${quand}`;
  if (sauvegardeGrave.value) return `Sauvegarde à vérifier · ${quand}`;
  if (ancienne.value) return `Dernière actualisation · ${quand}`;
  if (r.lastPass.outcome !== 'ok' || alertes.value) return `Actualisé · ${quand} · à vérifier`;
  return `Données à jour · ${quand}`;
});
const refreshTone = computed(() => {
  const r = refresh.value;
  if (r?.running) return 'running';
  if (!r?.enabled || r?.lastPass?.outcome === 'error' || sauvegardeGrave.value) return 'error';
  return r?.lastPass?.outcome === 'ok' && !alertes.value && !ancienne.value ? 'ok' : 'warn';
});

const statusLabel = computed(() => {
  if (isOnline.value === null) return 'Vérification…';
  return isOnline.value ? 'API connectée' : 'API hors ligne';
});
</script>

<template>
  <header class="topbar">
    <div class="topbar__titles">
      <span v-if="sousPage" class="topbar__eyebrow">{{ section }} › {{ sousPage }}</span>
      <h1 class="topbar__title">{{ title }}</h1>
    </div>

    <div class="topbar__right">
      <button
        v-if="controle && isOnline"
        type="button"
        class="topbar__feu"
        :class="`topbar__feu--${feuDuControle.feu ?? 'aucun'}`"
        :title="titreDuControle"
        :aria-label="titreDuControle"
        @click="voirLeControle"
      >
        <span class="topbar__feu-point" aria-hidden="true" />
        <span class="topbar__feu-long">{{ feuDuControle.libelle }}</span>
        <span class="topbar__feu-court">{{ feuDuControle.court ?? 'contrôle' }}</span>
      </button>
      <button
        v-if="alertesGardeFous.length && isOnline"
        type="button"
        class="topbar__garde"
        :class="gardeFouGrave ? 'topbar__garde--danger' : 'topbar__garde--warn'"
        :title="`${alertesGardeFous.map((a) => a.texte).join('\n')}\n— Performance paris`"
        @click="voirLeSuivi"
      >
        <AppIcon name="shield" :size="12" />
        {{ gardeFouGrave ? 'Garde-fou atteint' : 'Garde-fou : à regarder' }}
      </button>
      <button
        v-if="refreshLabel && isOnline"
        type="button"
        class="topbar__refresh"
        :class="`topbar__refresh--${refreshTone}`"
        :title="titreRepere"
        @click="router.push({ name: 'settings' }).catch(() => {})"
      >
        <AppIcon name="refresh" :size="12" class="topbar__refresh-icon" :class="{ 'is-spinning': refreshTone === 'running' }" />
        {{ refreshLabel }}
      </button>
      <div class="topbar__status" :class="{ 'topbar__status--online': isOnline, 'topbar__status--offline': isOnline === false }">
        <span class="topbar__dot" />
        {{ statusLabel }}
      </div>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  height: var(--cm-topbar-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 30px;
  border-bottom: 1px solid var(--cm-glass-border);
  position: sticky;
  top: 0;
  background: rgb(var(--cm-glass-tint) / var(--cm-elevation-1));
  backdrop-filter: blur(var(--cm-elevation-1-blur)) saturate(var(--cm-glass-saturate));
  -webkit-backdrop-filter: blur(var(--cm-elevation-1-blur)) saturate(var(--cm-glass-saturate));
  z-index: 10;
}

.topbar__titles {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.topbar__eyebrow {
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.7px;
  text-transform: uppercase;
  color: var(--cm-section);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.topbar__title {
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.topbar__right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.topbar__refresh {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 11px;
  border: 1px solid var(--cm-border-soft);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.03);
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--cm-text-muted);
  cursor: pointer;
  transition: border-color var(--cm-transition), color var(--cm-transition);
}

.topbar__refresh:hover {
  border-color: var(--cm-border);
  color: var(--cm-text-secondary);
}

.topbar__refresh--ok {
  color: var(--cm-text-secondary);
}

.topbar__refresh--running {
  color: var(--cm-warning);
  border-color: rgba(var(--cm-warning-rgb) / 0.3);
}

.topbar__refresh--warn {
  color: var(--cm-warning);
}

.topbar__refresh--error {
  color: var(--cm-danger);
  border-color: rgba(var(--cm-danger-rgb) / 0.3);
}

/* Étape 14 : le feu du contrôle quotidien — un point de couleur ET un mot (il se lit sans la couleur). */
.topbar__feu {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 11px;
  border: 1px solid var(--cm-border-soft);
  border-radius: 999px;
  background: transparent;
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--cm-text-secondary);
  cursor: pointer;
  white-space: nowrap;
  transition: border-color var(--cm-transition), color var(--cm-transition);
}

.topbar__feu:hover {
  border-color: var(--cm-border);
}

.topbar__feu-point {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--cm-text-muted);
}

.topbar__feu-court {
  display: none;
}

.topbar__feu--vert .topbar__feu-point {
  background: var(--cm-accent);
  box-shadow: 0 0 0 3px var(--cm-accent-soft);
}

.topbar__feu--orange {
  color: var(--cm-warning);
  border-color: rgba(var(--cm-warning-rgb) / 0.3);
}

.topbar__feu--orange .topbar__feu-point {
  background: var(--cm-warning);
  box-shadow: 0 0 0 3px var(--cm-warning-soft);
}

.topbar__feu--rouge {
  color: var(--cm-danger);
  border-color: rgba(var(--cm-danger-rgb) / 0.35);
}

.topbar__feu--rouge .topbar__feu-point {
  background: var(--cm-danger);
  box-shadow: 0 0 0 3px var(--cm-danger-soft);
}

/* Étape 11 : la puce des garde-fous (ambre : à regarder ; rouge : plafond atteint). */
.topbar__garde {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 11px;
  border: 1px solid rgba(var(--cm-warning-rgb) / 0.3);
  border-radius: 999px;
  background: transparent;
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--cm-warning);
  cursor: pointer;
  white-space: nowrap;
}

.topbar__garde--danger {
  border-color: rgba(var(--cm-danger-rgb) / 0.35);
  color: var(--cm-danger);
}

.topbar__refresh-icon.is-spinning {
  animation: topbar-spin 1.4s linear infinite;
}

@keyframes topbar-spin {
  to {
    transform: rotate(360deg);
  }
}

.topbar__status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 11px;
  border-radius: 999px;
  border: 1px solid var(--cm-border-soft);
  font-size: 11.5px;
  font-weight: 600;
  color: var(--cm-text-muted);
}

.topbar__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--cm-text-muted);
}

.topbar__status--online {
  color: var(--cm-accent);
  border-color: rgba(var(--cm-accent-rgb) / 0.25);
}
.topbar__status--online .topbar__dot {
  background: var(--cm-accent);
  box-shadow: 0 0 0 3px var(--cm-accent-soft);
}

.topbar__status--offline {
  color: var(--cm-danger);
  border-color: rgba(var(--cm-danger-rgb) / 0.3);
}
.topbar__status--offline .topbar__dot {
  background: var(--cm-danger);
  box-shadow: 0 0 0 3px var(--cm-danger-soft);
}

@media (max-width: 900px) {
  .topbar {
    padding: 0 16px;
  }

  .topbar__refresh {
    display: none;
  }

  /* Le feu reste, en court : son mot (vert, orange, rouge) et son point. */
  .topbar__feu-long {
    display: none;
  }

  .topbar__feu-court {
    display: inline;
  }
}
</style>
