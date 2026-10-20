<script setup>
import AppIcon from '@/components/common/AppIcon.vue';

/**
 * LA PLACE du « pourquoi ce pourcentage » (étape 9 du plan, 06/10/2026) : le
 * deuxième bloc de la page d'un match, juste sous le verdict. Elle est
 * RÉSERVÉE — la fiche du pronostic (étape 40 du plan) la remplira avec ce qui
 * fait monter ou baisser chaque pourcentage du verdict. Tant que le moteur ne
 * calcule pas ces raisons, elle ne montre RIEN d'autre que le dire : aucune
 * explication inventée, aucun faux contenu.
 *
 * Pour l'étape 40 : ce composant est l'emplacement ; la page lui passera les
 * raisons par l'emplacement par défaut (slot), qui remplacera alors la phrase.
 */
</script>

<template>
  <section class="why" aria-label="Pourquoi ce pourcentage">
    <span class="cm-icon-box is-muted is-sm"><AppIcon name="info" :size="14" /></span>
    <div class="why__body">
      <p class="why__title">
        Pourquoi ce pourcentage ?
        <span class="cm-chip why__soon" title="Prévu à l'étape 40 du plan : la fiche du pronostic.">à venir · étape 40 du plan</span>
      </p>
      <slot>
        <p class="why__text">
          Place réservée. La fiche du pronostic dira ici, marché par marché, ce qui fait monter ou baisser chaque pourcentage du verdict ; tant que le moteur ne le calcule pas,
          rien n'est affiché à la place — aucune explication inventée. En attendant, la phrase de l'IA se lit sous chaque pronostic de l'onglet Marchés et dans l'avis de l'IA plus bas.
        </p>
      </slot>
    </div>
  </section>
</template>

<style scoped>
.why {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 14px;
  border-radius: var(--cm-radius-md);
  border: 1px dashed var(--cm-border-strong);
  background: transparent;
}

.why__body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.why__title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  margin: 0;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--cm-text-secondary);
}

.why__soon {
  font-weight: 600;
  color: var(--cm-text-muted);
}

.why__text {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--cm-text-muted);
}
</style>
