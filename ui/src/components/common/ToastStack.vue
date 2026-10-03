<script setup>
import { useToastStore } from '@/stores/toastStore.js';
import AppIcon from './AppIcon.vue';

const toastStore = useToastStore();

const ICON_BY_VARIANT = { success: 'check', error: 'alert', info: 'sparkles' };
</script>

<template>
  <div class="toast-stack">
    <TransitionGroup name="toast">
      <div v-for="toast in toastStore.toasts" :key="toast.id" class="toast" :class="`toast--${toast.variant}`">
        <span class="toast__icon"><AppIcon :name="ICON_BY_VARIANT[toast.variant] ?? 'sparkles'" :size="14" /></span>
        <span class="toast__text">{{ toast.message }}</span>
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
  max-width: 360px;
}

.toast {
  --ton: var(--cm-info);
  --ton-rgb: var(--cm-info-rgb);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 12px 11px 11px;
  border-radius: var(--cm-radius-md);
  background: rgba(21, 26, 36, 0.92);
  backdrop-filter: blur(var(--cm-elevation-3-blur));
  -webkit-backdrop-filter: blur(var(--cm-elevation-3-blur));
  border: 1px solid rgba(var(--ton-rgb) / 0.35);
  box-shadow: var(--cm-shadow);
  font-size: 13px;
  color: var(--cm-text-primary);
}

.toast--success {
  --ton: var(--cm-accent);
  --ton-rgb: var(--cm-accent-rgb);
}
.toast--error {
  --ton: var(--cm-danger);
  --ton-rgb: var(--cm-danger-rgb);
}

.toast__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: rgba(var(--ton-rgb) / 0.15);
  color: var(--ton);
}

.toast__text {
  flex: 1;
  line-height: 1.4;
}

.toast__close {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--cm-text-muted);
  display: flex;
  padding: 2px;
}
.toast__close:hover {
  color: var(--cm-text-primary);
}

.toast-enter-active,
.toast-leave-active {
  transition: all 200ms cubic-bezier(0.22, 1, 0.36, 1);
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(10px);
}
</style>
