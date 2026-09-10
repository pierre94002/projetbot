<script setup>
import { RouterLink } from 'vue-router';
import AppIcon from '@/components/common/AppIcon.vue';

const NAV_ITEMS = [
  { to: '/matches', label: 'Matchs', icon: 'matches' },
  { to: '/paris', label: 'Mes paris', icon: 'target' },
  { to: '/historique-moteur', label: 'Historique moteur', icon: 'check' },
  { to: '/reglages', label: 'Réglages', icon: 'settings' }
];
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar__brand">
      <span class="sidebar__mark"><AppIcon name="target" :size="18" /></span>
      <span class="sidebar__wordmark">Côte<strong>Master</strong></span>
    </div>

    <nav class="sidebar__nav">
      <RouterLink v-for="item in NAV_ITEMS" :key="item.to" :to="item.to" class="sidebar__link">
        <AppIcon :name="item.icon" :size="17" />
        <span>{{ item.label }}</span>
      </RouterLink>
    </nav>

    <div class="sidebar__footer cm-text-muted">Moteur d'analyse de cotes</div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: var(--cm-sidebar-width);
  flex-shrink: 0;
  height: 100vh;
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  backdrop-filter: blur(var(--cm-elevation-1-blur)) saturate(var(--cm-glass-saturate));
  -webkit-backdrop-filter: blur(var(--cm-elevation-1-blur)) saturate(var(--cm-glass-saturate));
  border-right: 1px solid var(--cm-glass-border);
  padding: 20px 14px;
}

.sidebar__brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px 24px;
}

.sidebar__mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: var(--cm-radius-sm);
  background: var(--cm-accent-soft);
  color: var(--cm-accent);
}

.sidebar__wordmark {
  font-size: 15px;
  letter-spacing: 0.2px;
  color: var(--cm-text-primary);
}

.sidebar__wordmark strong {
  font-weight: 700;
}

.sidebar__nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sidebar__link {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: var(--cm-radius-sm);
  color: var(--cm-text-secondary);
  font-size: 13.5px;
  transition: background var(--cm-transition), color var(--cm-transition);
}

.sidebar__link:hover {
  background: var(--cm-surface-hover);
  color: var(--cm-text-primary);
}

.sidebar__link.router-link-active {
  background: var(--cm-accent-soft);
  color: var(--cm-accent);
}

.sidebar__footer {
  margin-top: auto;
  padding: 10px;
  font-size: 11.5px;
}
</style>
