<script setup>
import AppIcon from './AppIcon.vue';

/**
 * La carte : le conteneur de tout bloc de contenu. Même API qu'avant
 * (title, subtitle, padded, emplacement `actions`), plus :
 * - `icon` : une icône dans un carré teinté devant le titre ;
 * - `eyebrow` : un sur-titre en petites capitales, couleur de section ;
 * - `tone` : 'glass' (défaut) | 'plain' (surface opaque) | 'section'
 *   (liseré et halo de la couleur de section, pour LA carte d'une page).
 */
defineProps({
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  eyebrow: { type: String, default: '' },
  icon: { type: String, default: '' },
  tone: { type: String, default: 'glass' },
  padded: { type: Boolean, default: true }
});
</script>

<template>
  <section class="card" :class="[`card--${tone}`, { 'card--padded': padded }]">
    <header v-if="title || eyebrow || $slots.actions" class="card__header">
      <div class="card__heading">
        <span v-if="icon" class="card__icon"><AppIcon :name="icon" :size="17" /></span>
        <div class="card__titles">
          <span v-if="eyebrow" class="card__eyebrow">{{ eyebrow }}</span>
          <h3 v-if="title" class="card__title">{{ title }}</h3>
          <p v-if="subtitle" class="card__subtitle">{{ subtitle }}</p>
        </div>
      </div>
      <div v-if="$slots.actions" class="card__actions">
        <slot name="actions" />
      </div>
    </header>
    <div class="card__body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.card {
  position: relative;
  background: rgb(var(--cm-glass-tint) / var(--cm-elevation-2));
  backdrop-filter: blur(var(--cm-elevation-2-blur)) saturate(var(--cm-glass-saturate));
  -webkit-backdrop-filter: blur(var(--cm-elevation-2-blur)) saturate(var(--cm-glass-saturate));
  border: 1px solid var(--cm-glass-border);
  border-radius: var(--cm-radius-lg);
  box-shadow: var(--cm-shadow-sm);
}

/* Un reflet fin sur le bord haut : ce qui donne du relief à une surface sombre. */
.card::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 1px;
  border-radius: var(--cm-radius-lg) var(--cm-radius-lg) 0 0;
  background: linear-gradient(90deg, transparent, var(--cm-glass-highlight), transparent);
  pointer-events: none;
}

.card--plain {
  background: var(--cm-surface);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  border-color: var(--cm-border-soft);
}

.card--section {
  border-color: rgba(var(--cm-section-rgb) / 0.26);
  background:
    radial-gradient(120% 120% at 0% 0%, rgba(var(--cm-section-rgb) / 0.1), transparent 55%),
    rgb(var(--cm-glass-tint) / var(--cm-elevation-2));
}

.card--padded {
  padding: 20px 22px;
}

.card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 16px;
}

.card__heading {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
}

.card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: var(--cm-section-soft);
  color: var(--cm-section);
}

.card__titles {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.card__eyebrow {
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.7px;
  text-transform: uppercase;
  color: var(--cm-section);
}

.card__title {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--cm-text-primary);
}

.card__subtitle {
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
}

.card__actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 8px;
}

@media (max-width: 640px) {
  .card--padded {
    padding: 16px;
  }
}
</style>
