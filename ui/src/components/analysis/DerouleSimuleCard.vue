<script setup>
import { computed } from 'vue';
import AppCard from '@/components/common/AppCard.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import { derouleDit, selectionDuDeroule } from '@/utils/simulation.js';
import { cleDeSelection } from '@/utils/ticket.js';

/**
 * LA CARTE « DÉROULÉ SIMULÉ » de la page d'un match à venir (étape 28 du plan, 27/10/2026) — SEULEMENT quand Réglages a
 * mis l'affichage des matchs sur « tout » (ce qui demande le modèle de buts en service ET la preuve de l'étape 28).
 * Elle lit le bloc `simulation.deroule` de l'analyse : les 10 000 matchs simulés la nuit, repondérés sur la grille de
 * CETTE analyse et alignés sur le 1N2 affiché (le serveur, simulationRead.js). Jamais une simulation à l'ouverture.
 *   - la phrase « Information, pas un pronostic. … » (les écarts mesurés au réel, le hasard du tirage) ;
 *   - la mi-temps, mi-temps / fin, le premier but, d'une mi-temps à l'autre ; au survol de chaque ligne, l'écart mesuré
 *     sur 2025-2026 avec les cotes de clôture (ECARTS_MESURES_V du serveur) ;
 *   - les marchés que la preuve sur 2019-2023 a écartés n'y sont JAMAIS (le serveur ne les envoie pas ; une phrase le dit) ;
 *   - « Ni pronostic ni règlement automatique. » ; « Prendre » met la ligne dans le ticket pour lire son prix juste dans
 *     un combiné — elle se lit, ne se parie pas.
 * Aucun vert : rien ici n'est une value.
 */
const props = defineProps({
  deroule: { type: Object, required: true },
  match: { type: Object, required: true },
  pris: { type: Array, default: () => [] }
});

const emit = defineEmits(['prendre']);

const dit = computed(() => derouleDit(props.deroule, { home: props.match?.home, away: props.match?.away }));
const dejaPris = (ligne) => {
  const s = selectionDuDeroule(ligne, props.match, props.deroule);
  return Boolean(s) && props.pris.some((p) => cleDeSelection(p) === cleDeSelection(s));
};
function prendre(ligne) {
  const s = selectionDuDeroule(ligne, props.match, props.deroule);
  if (s) emit('prendre', s);
}
</script>

<template>
  <AppCard title="Déroulé simulé" subtitle="La mi-temps, le premier but, un retournement : 10 000 matchs simulés la nuit." icon="activity" data-bloc="deroule-simule">
    <template #actions>
      <HelpTip terme="deroule-simule" />
    </template>
    <div class="dsc">
      <p v-if="!dit.calcule" class="dsc__vide">{{ dit.phrase }}</p>
      <template v-else>
        <p class="cm-note is-info dsc__phrase">
          <AppIcon name="info" :size="14" />
          <span>{{ dit.phrase }}</span>
        </p>
        <div v-for="g in dit.groupes" :key="g.titre" class="dsc__groupe">
          <h4 class="cm-group-title dsc__titre">{{ g.titre }}</h4>
          <ul class="dsc__lignes">
            <li v-for="l in g.lignes" :key="l.cle" class="dsc__ligne" :data-cle="l.cle" :title="l.titre">
              <span class="dsc__libelle">{{ l.libelle }}</span>
              <span class="dsc__p cm-numeric">{{ l.texte }}</span>
              <button v-if="l.jambe" type="button" class="dsc__prendre" :class="{ 'is-pris': dejaPris(l) }" :title="`Mettre « ${l.libelle} » dans le ticket : elle se lit et se chiffre, elle ne se parie pas`" @click="prendre(l)">
                {{ dejaPris(l) ? 'Pris' : 'Prendre' }}
              </button>
              <span v-else class="dsc__sans" title="Aucun marché du ticket ne dit exactement cette ligne : elle se lit seulement">—</span>
            </li>
          </ul>
        </div>
        <p v-if="dit.ecartes" class="dsc__petit dsc__ecartes">{{ dit.ecartes }}</p>
        <p class="dsc__petit"><strong>{{ dit.mention }}</strong> Au survol de chaque ligne : l’écart mesuré au réel.</p>
        <ProvenanceChip source="Simulation CôteMaster, grille du moteur" :releve-le="dit.calculeLe" action="calculé" :detail="dit.provenance" :vieux-apres-heures="null" variante="ligne" />
      </template>
    </div>
  </AppCard>
</template>

<style scoped>
.dsc {
  container: dsc / inline-size;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dsc__vide,
.dsc__petit {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
}

.dsc__petit strong {
  color: var(--cm-text-primary);
}

.dsc__phrase {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  font-size: 12.5px;
  line-height: 1.55;
}

.dsc__groupe {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dsc__titre {
  margin: 2px 0 0;
}

.dsc__lignes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 14px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.dsc__ligne {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: var(--cm-radius-sm);
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
  cursor: help;
}

.dsc__libelle {
  font-size: 12.5px;
  color: var(--cm-text-secondary);
  overflow-wrap: anywhere;
}

.dsc__p {
  font-size: 13px;
  font-weight: 700;
  color: var(--cm-text-primary);
}

.dsc__prendre {
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--cm-border);
  background: transparent;
  font-size: 11px;
  font-weight: 700;
  color: var(--cm-text-secondary);
  cursor: pointer;
}

.dsc__prendre:hover {
  border-color: var(--cm-border-strong);
  color: var(--cm-text-primary);
}

.dsc__prendre.is-pris {
  border-style: dashed;
  color: var(--cm-text-muted);
}

.dsc__sans {
  font-size: 11px;
  color: var(--cm-text-muted);
}

.dsc__ecartes {
  color: var(--cm-text-muted);
}

@container dsc (max-width: 560px) {
  .dsc__lignes {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
