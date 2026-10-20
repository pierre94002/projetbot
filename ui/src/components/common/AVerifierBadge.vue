<script setup>
import { computed } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import { raisonsPourMarche, texteDesRaisons, phraseDuBadge } from '@/utils/controleQuotidien.js';

/**
 * Le badge « À VÉRIFIER » (étape 14 du plan, 07/10/2026) : posé là où un
 * verdict est affiché (cartes de marchés, page Opportunités, page du match,
 * journal des pronostics) quand les données qu'a lues le pronostic sont
 * douteuses — un score à vérifier dans les rencontres récentes d'un des deux
 * clubs, des cartons non relevés dans son championnat, FotMob en panne…
 *
 * INFORMATIF : il ne touche ni au verdict ni à la pastille de value (le vert
 * reste décidé par le serveur, verdictPari.js), il dit seulement pourquoi
 * regarder de plus près, avec une raison courte. Ambre, une icône et un mot :
 * il se lit sans la couleur ; toutes les raisons au survol et pour les
 * lecteurs d'écran.
 *
 * `aVerifier` : ce que le serveur joint ({ raisons, texte }) ; `marche` :
 * l'identifiant du marché de la ligne — seules les raisons de sa famille (et
 * celles de toutes familles) comptent ; sans `marche`, toutes celles jointes.
 * Un écart de buteurs ou de gardiens est de la famille « joueurs » : il ne
 * met le badge que sur un marché de joueurs (aucun aujourd'hui), et le
 * serveur ne le joint jamais à l'analyse d'un match — pas de bandeau.
 * `avecRaison` : la raison courte écrite à côté du mot, en plus du survol.
 */
const props = defineProps({
  aVerifier: { type: Object, default: null },
  marche: { type: String, default: null },
  avecRaison: { type: Boolean, default: false },
  taille: { type: String, default: 'sm' } // 'sm' | 'md'
});

const raisons = computed(() => raisonsPourMarche(props.aVerifier, props.marche));
const phrase = computed(() => phraseDuBadge(raisons.value));
const court = computed(() => texteDesRaisons(raisons.value));
</script>

<template>
  <span v-if="raisons.length" class="averif" :class="`averif--${taille}`" role="note" :aria-label="phrase" :title="phrase">
    <AppIcon name="alert" :size="taille === 'sm' ? 10 : 12" class="averif__icon" />
    <span class="averif__mot">À vérifier</span>
    <span v-if="avecRaison" class="averif__raison">{{ court }}</span>
  </span>
</template>

<style scoped>
/* L'ambre de « à vérifier » (DESIGN.md : --cm-warning), en pointillés : jamais le vert d'une value ni le rouge d'une perte. */
.averif {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  padding: 2px 9px 2px 7px;
  border-radius: 999px;
  border: 1px dashed rgba(var(--cm-warning-rgb) / 0.5);
  background: var(--cm-warning-soft);
  color: var(--cm-warning);
  font-size: 11.5px;
  font-weight: 700;
  line-height: 1.35;
  cursor: help;
  white-space: nowrap;
}

.averif--sm {
  padding: 1px 8px 1px 6px;
  font-size: 10.5px;
}

.averif__icon {
  flex-shrink: 0;
}

.averif__mot {
  flex-shrink: 0;
}

/* La raison courte : plus discrète que le mot, coupée proprement quand la place manque. */
.averif__raison {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 600;
  opacity: 0.9;
}
</style>
