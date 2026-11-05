<script setup>
import { computed } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import { encadreAvantDeParier } from '@/utils/avantDeParier.js';

/**
 * « AVANT DE PARIER — À BLANC » (étape 38 du plan, lot 1b, 04/11/2026 ; conception §7) : un encadré gris, sous le tableau des
 * verdicts de la page d'un match à venir. Il ne LIT rien lui-même : le bloc `combinaison` que le serveur joint à l'analyse
 * (APRÈS elle : la ligne du pronostic du résultat rangée la nuit, l'ancre de la cote juste et les cotes de vos bookmakers de
 * cette analyse, la note du banc) — aucune requête de plus. Les mots viennent de utils/avantDeParier.js (pur). Jamais
 * « sûr », jamais une jauge, jamais une value ni un seuil conseillé, jamais la mise (dite au-dessus, par l'étape 39).
 */
const props = defineProps({
  combinaison: { type: Object, default: null }, // le bloc `combinaison` de GET /api/analysis/match/:id
  result: { type: Object, default: null } // l'analyse (la mise conseillée de l'étape 39 : jamais redite)
});

const encadre = computed(() => encadreAvantDeParier({ combinaison: props.combinaison, result: props.result }));
</script>

<template>
  <section class="cm-note avant-de-parier" data-bloc="avant-de-parier" :data-etat="encadre.etat" aria-label="Avant de parier — à blanc">
    <span class="cm-icon-box is-muted is-sm avant-de-parier__icone"><AppIcon name="info" :size="14" /></span>
    <div class="avant-de-parier__corps">
      <p class="cm-note__title">{{ encadre.titre }}</p>
      <p class="avant-de-parier__sous-titre">{{ encadre.sousTitre }}</p>
      <ul class="avant-de-parier__lignes">
        <li v-for="l in encadre.lignes" :key="l.cle" class="cm-note__text avant-de-parier__ligne" :data-ligne="l.cle">{{ l.texte }}</li>
      </ul>
      <p class="avant-de-parier__pied" data-ligne="pied">{{ encadre.pied }}</p>
    </div>
  </section>
</template>

<style scoped>
.avant-de-parier {
  margin-top: 14px;
}

.avant-de-parier__icone {
  color: var(--cm-text-muted);
}

.avant-de-parier__corps {
  min-width: 0;
}

.avant-de-parier__sous-titre {
  margin: 0 0 6px;
  font-size: 12px;
  color: var(--cm-text-secondary);
}

.avant-de-parier__lignes {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 4px;
}

.avant-de-parier__ligne {
  color: var(--cm-text-secondary);
}

.avant-de-parier__ligne[data-ligne='manque'] {
  color: var(--cm-text-primary);
}

.avant-de-parier__pied {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--cm-text-muted);
}
</style>
