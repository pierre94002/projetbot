<script setup>
import { computed } from 'vue';
import AppCard from '@/components/common/AppCard.vue';
import EnjeuBadge from '@/components/common/EnjeuBadge.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import { enjeuDit } from '@/utils/simulation.js';

/**
 * L'ENCADRÉ « ENJEU » de la page d'un match à venir (étape 28 du plan, 27/10/2026) — seulement quand Réglages a allumé
 * les fins de saison. Il dit ce que la nuit a rangé pour CETTE rencontre (le bloc `simulation.enjeu` de l'analyse, lu
 * par identifiants FotMob) : la pastille (EnjeuBadge), la phrase de chaque club arrondie à 5 points (« Arsenal joue
 * l'Europe : 60 % en cas de victoire, 40 % en cas de défaite ; Burnley joue sa survie : 45 % de descente en cas de
 * victoire, 70 % en cas de défaite »), quand l'enjeu a été calculé (refait chaque nuit jusqu'à la veille du match, puis
 * gardé tel quel), la provenance réelle et la loi employée.
 * Non calculé : la raison. Une information : elle n'entre dans aucun pourcentage du moteur. Jamais vert ni rouge.
 */
const props = defineProps({
  enjeu: { type: Object, required: true }
});

const dit = computed(() => enjeuDit(props.enjeu));
const calcule = computed(() => props.enjeu?.calcule !== false);
const loi = computed(() => {
  const t = props.enjeu?.loiPhrase ?? null;
  return t ? `${t.charAt(0).toUpperCase()}${t.slice(1)}.` : null;
});
</script>

<template>
  <AppCard title="Enjeu" subtitle="Ce que la rencontre change pour chaque club au classement, d'après la fin de saison simulée la nuit." icon="flag" data-bloc="enjeu-du-match">
    <template #actions>
      <HelpTip terme="enjeu" />
    </template>
    <div class="edm">
      <div class="edm__tete">
        <EnjeuBadge v-if="dit.visible" :enjeu="enjeu" />
        <span v-else class="edm__entre">Un enjeu ni gros ni nul</span>
      </div>
      <p class="edm__phrase">{{ dit.phrase ?? 'Pas de phrase rangée pour cette rencontre.' }}</p>
      <template v-if="calcule">
        <p v-if="dit.quand" class="edm__petit">{{ dit.quand }}</p>
        <p v-if="loi" class="edm__petit">{{ loi }}</p>
        <ProvenanceChip
          source="Simulation CôteMaster, classement FotMob"
          :releve-le="enjeu.calculeLe ?? null"
          action="calculé"
          detail="10 000 fins de saison simulées la nuit ; l’enjeu, figé avant le coup d’envoi, n’entre dans aucun pourcentage du moteur."
          :vieux-apres-heures="null"
          variante="ligne"
        />
      </template>
    </div>
  </AppCard>
</template>

<style scoped>
.edm {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.edm__tete {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.edm__entre {
  font-size: 12px;
  font-weight: 600;
  color: var(--cm-text-secondary);
}

.edm__phrase {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--cm-text-primary);
}

.edm__petit {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--cm-text-muted);
}
</style>
