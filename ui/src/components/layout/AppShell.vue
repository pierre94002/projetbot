<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import AppSidebar from './AppSidebar.vue';
import AppTopbar from './AppTopbar.vue';
import ToastStack from '@/components/common/ToastStack.vue';
import { useDataAutoRefresh } from '@/composables/useDataAutoRefresh.js';
import { useFavoritesStore } from '@/stores/favoritesStore.js';

// Monté ici parce que AppShell enveloppe toute l'appli et n'est jamais démonté :
// la surveillance tourne donc quelle que soit la page affichée.
useDataAutoRefresh();

// Les équipes et championnats favoris (03/10/2026) : chargés une fois, lus
// par toutes les pages qui rangent des matchs ou des championnats.
useFavoritesStore().fetch();

// La section de la page (cf. router meta.section) : elle choisit la couleur
// d'ambiance de toute l'interface via [data-section] (tokens.css) — demande
// de Pierre le 01/10/2026, « changer la couleur quand on change d'onglet ».
const route = useRoute();
const section = computed(() => route.meta?.section ?? 'matches');
</script>

<template>
  <div class="shell" :data-section="section">
    <!-- Deux fonds superposés le temps d'un changement de section : l'ancien
         s'efface pendant que le nouveau apparaît (un dégradé ne s'anime pas). -->
    <Transition name="wash">
      <div :key="section" class="shell__wash" aria-hidden="true" />
    </Transition>
    <div class="shell__grain" aria-hidden="true" />
    <AppSidebar />
    <div class="shell__main">
      <AppTopbar />
      <main class="shell__content">
        <RouterView v-slot="{ Component, route: r }">
          <Transition name="view" mode="out-in">
            <component :is="Component" :key="r.name" />
          </Transition>
        </RouterView>
      </main>
    </div>
    <ToastStack />
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  min-height: 100vh;
  position: relative;
  background: var(--cm-bg);
}

/* Le fond d'ambiance, fixe sous toute l'appli : deux taches de la couleur de
   la section en haut à gauche et en bas à droite, une tache secondaire pour
   que l'ambiance ne soit jamais monochrome. C'est aussi la texture que
   révèlent les éléments « glass » (sidebar, topbar, cartes) en la floutant. */
.shell__wash {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(1200px circle at 6% -10%, var(--cm-section-glow), transparent 58%),
    radial-gradient(900px circle at 104% 10%, var(--cm-section-glow-2), transparent 55%),
    radial-gradient(1000px circle at 10% 110%, rgba(var(--cm-section-rgb) / 0.08), transparent 55%),
    radial-gradient(900px circle at 94% 104%, var(--cm-section-glow-2), transparent 58%),
    linear-gradient(180deg, #0b0f17 0%, var(--cm-bg) 60%);
}

.wash-enter-active,
.wash-leave-active {
  transition: opacity 700ms ease;
}

.wash-enter-from,
.wash-leave-to {
  opacity: 0;
}

/* Un grain très léger par-dessus le fond : enlève l'aspect « plat » des
   dégradés, invisible en soi. */
.shell__grain {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  opacity: 0.035;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}

.shell__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 1;
}

.shell__content {
  flex: 1;
  padding: 26px 30px 48px;
  max-width: 1360px;
  width: 100%;
  margin: 0 auto;
}

@media (max-width: 900px) {
  .shell__content {
    padding: 18px 16px 40px;
  }
}
</style>
