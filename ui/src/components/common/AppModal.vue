<script setup>
import AppIcon from './AppIcon.vue';

defineProps({
  title: { type: String, default: '' }
});

const emit = defineEmits(['close']);
</script>

<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="emit('close')">
      <div class="modal">
        <header class="modal__header">
          <h3 class="modal__title">{{ title }}</h3>
          <button type="button" class="modal__close" @click="emit('close')">
            <AppIcon name="x" :size="16" />
          </button>
        </header>
        <div class="modal__body">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(4, 6, 10, 0.6);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  z-index: 200;
}

.modal {
  width: min(460px, 100%);
  height: 100vh;
  background: var(--cm-surface);
  border-left: 1px solid var(--cm-border);
  display: flex;
  flex-direction: column;
  animation: slide-in 200ms ease;
}

@keyframes slide-in {
  from {
    transform: translateX(24px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px;
  border-bottom: 1px solid var(--cm-border-soft);
}

.modal__title {
  font-size: 14.5px;
  font-weight: 600;
}

.modal__close {
  background: none;
  border: none;
  color: var(--cm-text-muted);
  cursor: pointer;
  display: flex;
  padding: 4px;
}
.modal__close:hover {
  color: var(--cm-text-primary);
}

.modal__body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}
</style>
