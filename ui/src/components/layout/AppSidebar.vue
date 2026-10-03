<script setup>
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import AppIcon from '@/components/common/AppIcon.vue';

/**
 * La barre latérale : la marque, puis les quatre sections de l'appli, chacune
 * avec son icône et sa couleur (cf. tokens.css [data-section]) — l'entrée
 * active prend la couleur de sa section, les autres restent sobres.
 */
const NAV_ITEMS = [
  { to: '/matches', section: 'matches', label: 'Matchs', hint: 'Cotes, calendrier, stats', icon: 'matches' },
  { to: '/paris', section: 'bets', label: 'Mes paris', hint: 'Value bets et carnet', icon: 'wallet' },
  { to: '/historique-moteur', section: 'history', label: 'Historique moteur', hint: 'Pronostics et bilans', icon: 'history' },
  { to: '/reglages', section: 'settings', label: 'Réglages', hint: 'Moteur, données, IA', icon: 'sliders' }
];

const route = useRoute();
const sectionActive = computed(() => route.meta?.section ?? 'matches');
</script>

<template>
  <aside class="sidebar">
    <RouterLink to="/matches" class="sidebar__brand">
      <span class="sidebar__mark"><AppIcon name="target" :size="18" /></span>
      <span class="sidebar__wordmark">Côte<strong>Master</strong></span>
    </RouterLink>

    <nav class="sidebar__nav">
      <RouterLink
        v-for="item in NAV_ITEMS"
        :key="item.to"
        :to="item.to"
        class="sidebar__link"
        :class="{ 'is-active': sectionActive === item.section }"
        :data-section="item.section"
      >
        <span class="sidebar__icon"><AppIcon :name="item.icon" :size="17" /></span>
        <span class="sidebar__text">
          <span class="sidebar__label">{{ item.label }}</span>
          <span class="sidebar__hint">{{ item.hint }}</span>
        </span>
      </RouterLink>
    </nav>

    <div class="sidebar__footer">
      <span class="sidebar__footer-title">Moteur d'analyse de cotes</span>
      <span class="sidebar__footer-text">Données FotMob · cotes The Odds API</span>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: var(--cm-sidebar-width);
  flex-shrink: 0;
  height: 100vh;
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px 14px;
  background: rgb(var(--cm-glass-tint) / var(--cm-elevation-1));
  backdrop-filter: blur(var(--cm-elevation-1-blur)) saturate(var(--cm-glass-saturate));
  -webkit-backdrop-filter: blur(var(--cm-elevation-1-blur)) saturate(var(--cm-glass-saturate));
  border-right: 1px solid var(--cm-glass-border);
}

.sidebar__brand {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 6px 10px 18px;
}

.sidebar__mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 11px;
  background: linear-gradient(135deg, var(--cm-section), rgba(var(--cm-section-rgb) / 0.55));
  color: var(--cm-section-on);
  box-shadow: var(--cm-shadow-section);
  transition: background var(--cm-transition-slow), box-shadow var(--cm-transition-slow);
}

.sidebar__wordmark {
  font-size: 16px;
  letter-spacing: -0.01em;
  color: var(--cm-text-primary);
}

.sidebar__wordmark strong {
  font-weight: 800;
}

.sidebar__nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sidebar__link {
  position: relative;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 9px 10px;
  border-radius: var(--cm-radius);
  color: var(--cm-text-secondary);
  transition: background var(--cm-transition), color var(--cm-transition);
}

.sidebar__link::before {
  content: '';
  position: absolute;
  left: -14px;
  top: 10px;
  bottom: 10px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--cm-section);
  opacity: 0;
  transform: scaleY(0.4);
  transition: opacity var(--cm-transition), transform var(--cm-transition);
}

.sidebar__link:hover {
  background: rgba(255, 255, 255, 0.045);
  color: var(--cm-text-primary);
}

.sidebar__link.is-active {
  background: var(--cm-section-soft);
  color: var(--cm-text-primary);
}

.sidebar__link.is-active::before {
  opacity: 1;
  transform: scaleY(1);
}

.sidebar__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--cm-text-secondary);
  transition: background var(--cm-transition), color var(--cm-transition), box-shadow var(--cm-transition);
}

.sidebar__link.is-active .sidebar__icon {
  background: var(--cm-section);
  color: var(--cm-section-on);
  box-shadow: var(--cm-shadow-section);
}

.sidebar__text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.sidebar__label {
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.2;
}

.sidebar__hint {
  font-size: 10.5px;
  color: var(--cm-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar__link.is-active .sidebar__hint {
  color: var(--cm-section);
  opacity: 0.85;
}

.sidebar__footer {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 10px 4px;
  border-top: 1px solid var(--cm-border-soft);
}

.sidebar__footer-title {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--cm-text-secondary);
}

.sidebar__footer-text {
  font-size: 10.5px;
  color: var(--cm-text-muted);
}
</style>
