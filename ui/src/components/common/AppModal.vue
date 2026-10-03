<script setup>
import AppIcon from './AppIcon.vue';

/** Panneau latéral (droite), par-dessus la page : classement, détails… */
defineProps({
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' }
});

const emit = defineEmits(['close']);
</script>

<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="emit('close')">
      <div class="modal" role="dialog" aria-modal="true">
        <header class="modal__header">
          <div class="modal__titles">
            <h3 class="modal__title">{{ title }}</h3>
            <p v-if="subtitle" class="modal__subtitle">{{ subtitle }}</p>
          </div>
          <button type="button" class="modal__close" title="Fermer" @click="emit('close')">
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
  background: rgba(4, 6, 10, 0.55);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: stretch;
  justify-content: flex-end;
  z-index: 200;
  animation: overlay-in 180ms ease;
}

@keyframes overlay-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.modal {
  width: min(520px, 100%);
  height: 100vh;
  background: rgba(16, 20, 28, 0.86);
  backdrop-filter: blur(var(--cm-elevation-4-blur)) saturate(var(--cm-glass-saturate));
  -webkit-backdrop-filter: blur(var(--cm-elevation-4-blur)) saturate(var(--cm-glass-saturate));
  border-left: 1px solid var(--cm-glass-border);
  box-shadow: var(--cm-shadow-lg);
  display: flex;
  flex-direction: column;
  animation: slide-in 240ms cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes slide-in {
  from {
    transform: translateX(28px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.modal__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--cm-glass-border);
  background: linear-gradient(180deg, rgba(var(--cm-section-rgb) / 0.08), transparent);
}

.modal__titles {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.modal__title {
  font-size: 15.5px;
  font-weight: 700;
}

.modal__subtitle {
  font-size: 12px;
  color: var(--cm-text-secondary);
}

.modal__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  border: 1px solid var(--cm-border-soft);
  background: rgba(255, 255, 255, 0.04);
  color: var(--cm-text-secondary);
  cursor: pointer;
  transition: background var(--cm-transition), color var(--cm-transition);
}
.modal__close:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--cm-text-primary);
}

.modal__body {
  padding: 18px 20px 28px;
  overflow-y: auto;
  flex: 1;
}
</style>
