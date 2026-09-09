<script setup>
import AppSidebar from './AppSidebar.vue';
import AppTopbar from './AppTopbar.vue';
import ToastStack from '@/components/common/ToastStack.vue';
import TeamStatsModal from '@/components/matches/TeamStatsModal.vue';
</script>

<template>
  <div class="shell">
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
}

.shell__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.shell__content {
  flex: 1;
  padding: 28px;
  max-width: 1320px;
  width: 100%;
  margin: 0 auto;
}
</style>
