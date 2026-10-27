<script setup>
import { computed } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import { enjeuDit } from '@/utils/simulation.js';

/**
 * LA PASTILLE D'ENJEU (étape 28 du plan, 27/10/2026 ; DESIGN.md § 3 bis) — le seul dessin d'un enjeu de rencontre, posé
 * sur les cartes de rencontre (MatchCard) et dans l'encadré « Enjeu » de la page du match (EnjeuDuMatch).
 *   - « Gros enjeu » : bleu d'information (un club au moins voit une zone changer d'au moins 20 points entre victoire et
 *     défaite, arrondis à 5 comme à l'écran : deux rencontres « 20 pt » portent la même pastille) ;
 *   - « Sans enjeu » : gris (les deux clubs à « 0 pt » une fois arrondis, moins de 2,5 points) ;
 *   - « Enjeu non calculé » : gris en pointillés (fin de saison non calculée, coupe, rencontre au-delà de 14 jours) ;
 *   - entre les deux seuils : pas de pastille (l'encadré de la page dit la phrase).
 * Jamais vert ni rouge : un enjeu n'est ni une value ni une perte. Une information, qui n'entre dans aucun pourcentage du
 * moteur. Elle se lit sans la couleur : une icône et un mot ; la phrase du serveur (arrondie à 5 points) et quand elle a
 * été calculée au survol ET dans `aria-label`. `enjeu` : une ligne du serveur ; `compacte` : plus petite (cartes).
 */
const props = defineProps({
  enjeu: { type: Object, default: null },
  compacte: { type: Boolean, default: false }
});

const dit = computed(() => enjeuDit(props.enjeu));
</script>

<template>
  <span v-if="dit.visible" class="enjeu" :class="[`enjeu--${dit.ton}`, { 'enjeu--compacte': compacte }]" role="note" :aria-label="dit.titre" :title="dit.titre" data-enjeu>
    <AppIcon :name="dit.icone" :size="compacte ? 10 : 11" class="enjeu__icone" />
    <span class="enjeu__mot">{{ dit.libelle }}</span>
  </span>
</template>

<style scoped>
/* Un enjeu : jamais le vert d'une value ni le rouge d'une perte (DESIGN.md § 3 bis). */
.enjeu {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  padding: 2px 9px 2px 7px;
  border-radius: 999px;
  border: 1px solid var(--cm-border);
  background: var(--cm-surface-alt);
  color: var(--cm-text-secondary);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.35;
  cursor: help;
  white-space: nowrap;
}

.enjeu--compacte {
  padding: 1px 8px 1px 6px;
  font-size: 10.5px;
}

/* « Gros enjeu » : le bleu d'information. */
.enjeu--info {
  border-color: rgba(var(--cm-info-rgb) / 0.45);
  background: var(--cm-info-soft);
  color: var(--cm-info);
}

/* « Sans enjeu » : gris plein. */
.enjeu--gris {
  color: var(--cm-text-muted);
}

/* « Enjeu non calculé » : gris en pointillés. */
.enjeu--pointille {
  border-style: dashed;
  background: transparent;
  color: var(--cm-text-muted);
}

.enjeu__icone {
  flex-shrink: 0;
}
</style>
