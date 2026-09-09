<script setup>
import { computed } from 'vue';

const props = defineProps({
  name: { type: String, required: true }
});

const PALETTE = ['#34d399', '#60a5fa', '#fbbf24', '#f87171', '#a78bfa', '#22d3ee'];

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash << 5) - hash + value.charCodeAt(i);
  return Math.abs(hash);
}

const initial = computed(() => props.name.trim().charAt(0).toUpperCase() || '?');
const color = computed(() => PALETTE[hashString(props.name) % PALETTE.length]);
</script>

<template>
  <span class="team-avatar" :style="{ color, background: `${color}26` }">{{ initial }}</span>
</template>

<style scoped>
.team-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 6px;
  font-size: 10.5px;
  font-weight: 700;
  flex-shrink: 0;
}
</style>
