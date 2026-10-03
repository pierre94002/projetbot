<script setup>
defineProps({
  label: { type: String, default: '' },
  description: { type: String, default: '' }
});

const model = defineModel({ type: Boolean, required: true });
</script>

<template>
  <label class="toggle">
    <div v-if="label" class="toggle__text">
      <span class="toggle__label">{{ label }}</span>
      <span v-if="description" class="toggle__description">{{ description }}</span>
    </div>
    <span class="toggle__switch" :class="{ 'toggle__switch--on': model }" @click="model = !model">
      <input type="checkbox" v-model="model" class="cm-visually-hidden" />
      <span class="toggle__knob" />
    </span>
  </label>
</template>

<style scoped>
.toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  cursor: pointer;
}

.toggle__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.toggle__label {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--cm-text-primary);
}

.toggle__description {
  font-size: 12px;
  line-height: 1.45;
  color: var(--cm-text-muted);
}

.toggle__switch {
  flex-shrink: 0;
  width: 42px;
  height: 24px;
  border-radius: 999px;
  background: var(--cm-border-strong);
  position: relative;
  transition: background var(--cm-transition), box-shadow var(--cm-transition);
}

.toggle__switch--on {
  background: var(--cm-section);
  box-shadow: 0 0 0 3px rgba(var(--cm-section-rgb) / 0.18);
}

.toggle__knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: white;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
  transition: transform var(--cm-transition);
}

.toggle__switch--on .toggle__knob {
  transform: translateX(18px);
}
</style>
