<script setup>
import { useToastStore } from '@/stores/toastStore.js';
import AppIcon from './AppIcon.vue';

const toastStore = useToastStore();

const ICON_BY_VARIANT = { success: 'check', error: 'alert', info: 'bolt' };
</script>

<template>
  <div class="toast-stack">
    <TransitionGroup name="toast">
      <div v-for="toast in toastStore.toasts" :key="toast.id" class="toast" :class="`toast--${toast.variant}`">
        <AppIcon :name="ICON_BY_VARIANT[toast.variant] ?? 'bolt'" :size="15" />
        <span>{{ toast.message }}</span>
        <button class="toast__close" type="button" @click="toastStore.dismiss(toast.id)">
          <AppIcon name="x" :size="13" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-stack {
  position: fixed;
  bottom: 20px;
  right: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 100;
  max-width: 340px;
}

.toast {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: var(--cm-radius);
  background: var(--cm-surface-alt);
  border: 1px solid var(--cm-border);
  box-shadow: var(--cm-shadow);
  font-size: 13px;
  color: var(--cm-text-primary);
}

.toast--success {
  border-color: rgba(52, 211, 153, 0.35);
  color: var(--cm-accent);
}
.toast--error {
  border-color: rgba(248, 113, 113, 0.35);
  color: var(--cm-danger);
}

.toast span {
  flex: 1;
}

.toast__close {
  background: none;
  border: none;
  cursor: pointer;
  color: inherit;
  opacity: 0.6;
  display: flex;
  padding: 2px;
}
.toast__close:hover {
  opacity: 1;
}

.toast-enter-active,
.toast-leave-active {
  transition: all 180ms ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(8px);
}
</style>
