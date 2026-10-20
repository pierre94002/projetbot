<script setup>
/**
 * Le champ de texte sur plusieurs lignes : même dessin qu'AppTextField (libellé
 * en petites capitales, anneau de focus couleur de section), pour une note
 * libre. Redimensionnable à la verticale seulement.
 */
defineProps({
  label: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  rows: { type: Number, default: 3 },
  maxlength: { type: Number, default: undefined },
  disabled: { type: Boolean, default: false }
});

const model = defineModel({ type: String, default: '' });
</script>

<template>
  <label class="field">
    <span v-if="label" class="field__label">{{ label }}</span>
    <textarea v-model="model" class="field__area" :rows="rows" :placeholder="placeholder" :maxlength="maxlength" :disabled="disabled" />
  </label>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.field__label {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

.field__area {
  width: 100%;
  min-height: 72px;
  padding: 10px 12px;
  background: var(--cm-surface-alt);
  border: 1px solid var(--cm-border);
  border-radius: var(--cm-radius-sm);
  font-size: 13.5px;
  line-height: 1.5;
  color: var(--cm-text-primary);
  resize: vertical;
  outline: none;
  transition: border-color var(--cm-transition), box-shadow var(--cm-transition);
}

.field__area:hover:not(:disabled) {
  border-color: var(--cm-border-strong);
}

.field__area:focus {
  border-color: var(--cm-section);
  box-shadow: 0 0 0 3px rgba(var(--cm-section-rgb) / 0.18);
}

.field__area:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.field__area::placeholder {
  color: var(--cm-text-muted);
}
</style>
