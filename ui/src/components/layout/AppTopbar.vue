<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useApiHealth } from '@/composables/useApiHealth.js';

const route = useRoute();
const title = computed(() => route.meta?.title ?? 'CôteMaster');
const { isOnline } = useApiHealth();

const statusLabel = computed(() => {
  if (isOnline.value === null) return 'Vérification…';
  return isOnline.value ? 'API connectée' : 'API hors ligne';
});
</script>

<template>
  <header class="topbar">
    <h1 class="topbar__title">{{ title }}</h1>

    <div class="topbar__status" :class="{ 'topbar__status--online': isOnline, 'topbar__status--offline': isOnline === false }">
      <span class="topbar__dot" />
      {{ statusLabel }}
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
