<script setup>
/**
 * D'OÙ VIENNENT LES POURCENTAGES DE BUTS (étape 27 du plan, 21/10/2026) : la pastille de provenance
 * (ProvenanceChip, variante « ligne ») du modèle de buts unique, posée sous « Buts » et sur « Les 2 équipes
 * marquent » / « Résultat + total » (MarketPicksBoard) et sur la carte du score (ScorePredictionCard).
 * En tête, le mot court du régime (« cotes + xG », « cotes 1N2 + buts », « xG seuls »…) ; puis le VRAI fournisseur
 * de chaque morceau (« Moteur CôteMaster · cote 1N2 Pinnacle + plus/moins 2,5 football-data (moyenne du marché) +
 * xG FotMob ») ; l'heure du relevé du plus/moins (ambre au-delà de 24 h) ou, sans lui, l'heure du calcul et la cote
 * absente DITE (« aucune cote plus/moins relevée pour ce match »). `compacte` : le mot court seul à l'écran, le
 * fournisseur au survol. `aide` : la bulle « modele-de-buts » du guide de lecture.
 * Les mots viennent de utils/modeleDeButs.js (provenanceDesButs) : sans le modèle de buts (prop null), RIEN n'est
 * rendu — pendant l'essai à blanc, la page du match ne change pas.
 */
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import HelpTip from '@/components/common/HelpTip.vue';

defineProps({
  /** provenanceDesButs(result) : { court, source, releveLe, action, vieuxApresHeures, manque, detail } ou null. */
  provenance: { type: Object, default: null },
  compacte: { type: Boolean, default: false },
  aide: { type: Boolean, default: false }
});
</script>

<template>
  <span v-if="provenance" class="gmp" data-modele-de-buts>
    <ProvenanceChip
      :source="provenance.source"
      :releve-le="provenance.releveLe"
      :action="provenance.action"
      :vieux-apres-heures="provenance.vieuxApresHeures"
      :detail="provenance.detail"
      variante="ligne"
    >
      <template #source>
        <strong class="gmp__court">{{ provenance.court }}</strong><template v-if="!compacte"> · {{ provenance.source }}</template>
      </template>
      <template v-if="provenance.manque" #quand="{ texte }">{{ texte }} · {{ provenance.manque }}</template>
    </ProvenanceChip>
    <HelpTip v-if="aide" terme="modele-de-buts" />
  </span>
</template>

<style scoped>
.gmp {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 6px;
  max-width: 100%;
}

/* Le régime en tête : un mot court, en couleur des statistiques (lisible sans elle : c'est un mot). */
.gmp__court {
  color: var(--cm-violet);
}
</style>
