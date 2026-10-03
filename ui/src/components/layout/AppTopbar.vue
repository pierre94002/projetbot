<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useApiHealth } from '@/composables/useApiHealth.js';
import { refreshApi } from '@/services/refreshApi.js';
import AppIcon from '@/components/common/AppIcon.vue';

const route = useRoute();
const router = useRouter();
const title = computed(() => route.meta?.title ?? 'CôteMaster');
const SECTIONS = { matches: 'Matchs', bets: 'Mes paris', history: 'Historique moteur', settings: 'Réglages' };
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
/** Des alertes durables (contradictions, anomalies du contrôle) sont en cours. */
const alertes = computed(() => Boolean(refresh.value?.alerts?.contradictions?.count || refresh.value?.alerts?.audit?.anomalies));
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
  if (ancienne.value) return `Dernière actualisation · ${quand}`;
  if (r.lastPass.outcome !== 'ok' || alertes.value) return `Actualisé · ${quand} · à vérifier`;
  return `Données à jour · ${quand}`;
});
const refreshTone = computed(() => {
  const r = refresh.value;
  if (r?.running) return 'running';
  if (!r?.enabled || r?.lastPass?.outcome === 'error') return 'error';
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
        v-if="refreshLabel && isOnline"
        type="button"
        class="topbar__refresh"
        :class="`topbar__refresh--${refreshTone}`"
        title="Actualisation automatique — détails dans Réglages"
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
}
</style>
