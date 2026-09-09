<script setup>
import AppSidebar from './AppSidebar.vue';
import AppTopbar from './AppTopbar.vue';
import ToastStack from '@/components/common/ToastStack.vue';
import TeamStatsModal from '@/components/matches/TeamStatsModal.vue';
</script>

<template>
  <div class="shell">
    <div class="shell__wash" aria-hidden="true" />
    <AppSidebar />
    <div class="shell__main">
      <AppTopbar />
      <main class="shell__content">
        <RouterView v-slot="{ Component, route }">
          <component :is="Component" :key="route.name" />
        </RouterView>
      </main>
    </div>
    <ToastStack />
    <TeamStatsModal />
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  min-height: 100vh;
  position: relative;
}

/* Fond doux fixe, derrière sidebar/topbar : sans lui, le blur "glass" de ces
   deux éléments n'aurait qu'une couleur plate à flouter (aucun effet visible).
   Sobre et statique — pas de dégradé animé ni de taches vives, dans l'esprit
   "flat" plutôt qu'un habillage décoratif. */
.shell__wash {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(680px circle at 6% -4%, rgba(52, 211, 153, 0.09), transparent 60%),
    radial-gradient(620px circle at 100% 24%, rgba(96, 165, 250, 0.07), transparent 60%);
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
  padding: 28px;
  max-width: 1320px;
  width: 100%;
  margin: 0 auto;
}
</style>
