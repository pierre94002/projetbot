<script setup>
import { ref } from 'vue';
import AppIcon from './AppIcon.vue';

const props = defineProps({
  defaultOpen: { type: Boolean, default: false }
});

const open = ref(props.defaultOpen);
</script>

<template>
  <div>
    <div
      class="collapsible__header"
      role="button"
      tabindex="0"
      @click="open = !open"
      @keydown.enter="open = !open"
      @keydown.space.prevent="open = !open"
    >
      <span class="collapsible__header-content"><slot name="header" /></span>
      <AppIcon name="chevronRight" :size="14" class="collapsible__chevron" :class="{ 'collapsible__chevron--open': open }" />
    </div>
    <div v-if="open" class="collapsible__body">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.collapsible__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  cursor: pointer;
}

.collapsible__header-content {
  flex: 1;
  min-width: 0;
}

.collapsible__chevron {
  flex-shrink: 0;
  color: var(--cm-text-muted);
  transform: rotate(90deg);
  transition: transform var(--cm-transition);
}

.collapsible__chevron--open {
  transform: rotate(-90deg);
}

.collapsible__body {
  margin-top: 10px;
}
</style>
