<script setup>
import { ref } from 'vue';
import AppIcon from './AppIcon.vue';

const props = defineProps({
  defaultOpen: { type: Boolean, default: false }
});

const open = ref(props.defaultOpen);
</script>

<template>
  <div class="collapsible" :class="{ 'is-open': open }">
    <div
      class="collapsible__header"
      role="button"
      tabindex="0"
      @click="open = !open"
      @keydown.enter="open = !open"
      @keydown.space.prevent="open = !open"
    >
      <span class="collapsible__header-content"><slot name="header" /></span>
      <span class="collapsible__toggle">
        <AppIcon name="chevronDown" :size="14" class="collapsible__chevron" :class="{ 'collapsible__chevron--open': open }" />
      </span>
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
  border-radius: var(--cm-radius-sm);
}

.collapsible__header-content {
  flex: 1;
  min-width: 0;
}

.collapsible__toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--cm-text-muted);
  transition: background var(--cm-transition), color var(--cm-transition);
}

.collapsible__header:hover .collapsible__toggle {
  background: var(--cm-section-soft);
  color: var(--cm-section);
}

.collapsible__chevron {
  transition: transform var(--cm-transition);
}

.collapsible__chevron--open {
  transform: rotate(180deg);
}

.collapsible__body {
  margin-top: 10px;
}
</style>
