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
          <Transition name="view" mode="out-in">
            <component :is="Component" :key="route.name" />
          </Transition>
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

/* Dégradé de fond global et fixe, sous toute l'appli : c'est la texture que
   révèlent tous les éléments "glass" (sidebar, topbar, cards, modals) en la
   floutant — sans lui, flouter un fond plat ne produit aucun effet visible.
   Quatre taches douces réparties sur tout le viewport (pas juste les coins)
   pour qu'il y ait toujours quelque chose à révéler, où que défile le
   contenu. Statique — pas d'animation ni de couleurs vives, dans l'esprit
   "flat" plutôt qu'un habillage décoratif. */
.shell__wash {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(1100px circle at 8% -8%, rgba(52, 211, 153, 0.16), transparent 55%),
    radial-gradient(900px circle at 102% 12%, rgba(96, 165, 250, 0.13), transparent 55%),
    radial-gradient(1000px circle at 12% 108%, rgba(129, 140, 248, 0.11), transparent 55%),
    radial-gradient(850px circle at 92% 105%, rgba(52, 211, 153, 0.08), transparent 55%);
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
