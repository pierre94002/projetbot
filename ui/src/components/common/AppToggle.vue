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
      <span v-if="description" class="toggle__description cm-text-muted">{{ description }}</span>
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
  color: var(--cm-text-primary);
}

.toggle__description {
  font-size: 12px;
}

.toggle__switch {
  flex-shrink: 0;
  width: 38px;
  height: 22px;
  border-radius: 999px;
  background: var(--cm-border);
  position: relative;
  transition: background var(--cm-transition);
}

.toggle__switch--on {
  background: var(--cm-accent);
}

.toggle__knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: white;
  transition: transform var(--cm-transition);
}

.toggle__switch--on .toggle__knob {
  transform: translateX(16px);
}
</style>
