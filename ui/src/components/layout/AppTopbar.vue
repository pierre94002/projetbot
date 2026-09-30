<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useApiHealth } from '@/composables/useApiHealth.js';
import { refreshApi } from '@/services/refreshApi.js';

const route = useRoute();
const router = useRouter();
const title = computed(() => route.meta?.title ?? 'CôteMaster');
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
    <h1 class="topbar__title">{{ title }}</h1>

    <div class="topbar__right">
      <button
        v-if="refreshLabel && isOnline"
        type="button"
        class="topbar__refresh"
        :class="`topbar__refresh--${refreshTone}`"
        title="Actualisation automatique — détails dans Réglages"
        @click="router.push({ name: 'settings' }).catch(() => {})"
      >
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
  padding: 0 28px;
  border-bottom: 1px solid var(--cm-glass-border);
  position: sticky;
  top: 0;
  backdrop-filter: blur(var(--cm-elevation-1-blur)) saturate(var(--cm-glass-saturate));
  -webkit-backdrop-filter: blur(var(--cm-elevation-1-blur)) saturate(var(--cm-glass-saturate));
  z-index: 10;
}

.topbar__title {
  font-size: 16px;
  font-weight: 600;
}

.topbar__right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.topbar__refresh {
  padding: 3px 10px;
  border: 1px solid var(--cm-border-soft);
  border-radius: 999px;
  background: none;
  font: inherit;
  font-size: 11.5px;
  color: var(--cm-text-muted);
  cursor: pointer;
}

.topbar__refresh--running {
  color: var(--cm-warning);
  border-color: var(--cm-warning-soft);
}

.topbar__refresh--warn {
  color: var(--cm-warning);
}

.topbar__refresh--error {
  color: var(--cm-danger);
  border-color: var(--cm-danger-soft);
}

.topbar__status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
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
}
.topbar__status--online .topbar__dot {
  background: var(--cm-accent);
  box-shadow: 0 0 0 3px var(--cm-accent-soft);
}

.topbar__status--offline {
  color: var(--cm-danger);
}
.topbar__status--offline .topbar__dot {
  background: var(--cm-danger);
  box-shadow: 0 0 0 3px var(--cm-danger-soft);
}
</style>
