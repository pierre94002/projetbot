<script setup>
import { computed } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import { bandeDesSeries, phrasesDesSeries } from '@/utils/suiviParis.js';

/**
 * LA ZONE NORMALE DES SÉRIES DE PERTES (étape 11 du plan, 06/10/2026) : ce que
 * le hasard seul donne avec les cotes de VOS paris réglés — calcul exact du
 * serveur (server/src/core/risk/seriesDePertes.js), pas une simulation. La
 * bande va de 0 à une échelle qui montre la zone (« normale jusqu'à N »), la
 * plus longue série du carnet et celle en cours ; au-delà de N, ambre : rare
 * (moins d'une fois sur 20), un signal à regarder, jamais une preuve.
 * Le composant n'appelle rien : la page lui donne `series` (GET /api/bets/suivi).
 */
const props = defineProps({
  series: { type: Object, default: null }
});

const b = computed(() => bandeDesSeries(props.series));
const p = computed(() => phrasesDesSeries(props.series));
</script>

<template>
  <section class="lsb" :class="`is-${b.etat}`">
    <header class="lsb__head">
      <span class="cm-icon-box is-sm" :class="b.etat === 'hors-zone' ? 'is-warning' : 'is-info'"><AppIcon name="activity" :size="14" /></span>
      <h4 class="lsb__title">
        {{ b.etat === 'vide' ? 'Séries de pertes' : `Série de pertes normale jusqu'à ${b.jusqua}` }}
        <HelpTip terme="series-de-pertes" />
      </h4>
      <span v-if="b.etat === 'hors-zone'" class="cm-chip is-warning"><AppIcon name="alert" :size="11" />Série en cours hors de la zone</span>
      <span v-else-if="b.etat === 'normale'" class="cm-chip is-info"><AppIcon name="check" :size="11" />Dans la zone normale</span>
    </header>

    <div v-if="b.etat !== 'vide'" class="lsb__track" role="img" :aria-label="`${p.zone} ${p.enCours} ${p.plusLongue}`">
      <span class="lsb__beyond" aria-hidden="true" />
      <span class="lsb__zone" :style="{ width: `${b.zonePct}%` }" aria-hidden="true" />
      <span v-for="m in b.marqueurs" :key="m.cle" class="lsb__mark" :class="`is-${m.cle}`" :style="{ left: `${m.pct}%` }" :title="m.libelle" aria-hidden="true" />
    </div>
    <div v-if="b.etat !== 'vide'" class="lsb__scale cm-numeric" aria-hidden="true">
      <span v-for="gr in b.graduations" :key="gr.k" class="lsb__tick" :style="{ left: `${gr.pct}%` }">{{ gr.k }}</span>
    </div>
    <ul v-if="b.etat !== 'vide'" class="lsb__legend">
      <li><i class="lsb__key is-zone" aria-hidden="true" />zone normale : 0 à {{ b.jusqua }} pertes d'affilée</li>
      <li><i class="lsb__key is-beyond" aria-hidden="true" />au-delà : rare avec ces cotes</li>
      <li v-for="m in b.marqueurs" :key="m.cle"><i class="lsb__key is-mark" :class="`is-${m.cle}`" aria-hidden="true" />{{ m.libelle }}</li>
    </ul>

    <p class="lsb__text">{{ p.zone }}</p>
    <p v-if="p.enCours" class="lsb__text" :class="{ 'is-warning': b.etat === 'hors-zone' }">{{ p.enCours }}</p>
    <p v-if="p.plusLongue" class="lsb__text">{{ p.plusLongue }}</p>
    <p v-if="p.sources" class="lsb__text is-muted">{{ p.sources }}</p>
  </section>
</template>

<style scoped>
.lsb {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  border-radius: var(--cm-radius-md);
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
}

.lsb.is-hors-zone {
  border-color: rgba(var(--cm-warning-rgb) / 0.4);
}

.lsb__head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 10px;
}

.lsb__title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 13.5px;
  font-weight: 700;
  color: var(--cm-text-primary);
}

/* La bande : la zone normale (bleu d'information), au-delà (ambre), les repères. */
.lsb__track {
  position: relative;
  height: 14px;
  margin-top: 6px;
  border-radius: 999px;
  overflow: visible;
}

.lsb__beyond,
.lsb__zone {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  border-radius: 999px;
}

.lsb__beyond {
  right: 0;
  background: rgba(var(--cm-warning-rgb) / 0.16);
}

.lsb__zone {
  background: rgba(var(--cm-info-rgb) / 0.32);
}

.lsb__mark {
  position: absolute;
  top: -4px;
  width: 4px;
  height: 22px;
  margin-left: -2px;
  border-radius: 2px;
  background: var(--cm-text-muted);
}

.lsb__mark.is-plus-longue {
  background: var(--cm-violet);
}

.lsb__mark.is-en-cours {
  width: 8px;
  margin-left: -4px;
  background: var(--cm-text-primary);
}

.lsb.is-hors-zone .lsb__mark.is-en-cours {
  background: var(--cm-warning);
}

.lsb__scale {
  position: relative;
  height: 14px;
}

.lsb__tick {
  position: absolute;
  transform: translateX(-50%);
  font-size: 10.5px;
  color: var(--cm-text-muted);
}

.lsb__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin: 2px 0 0;
  padding: 0;
  list-style: none;
  font-size: 11.5px;
  color: var(--cm-text-secondary);
}

.lsb__legend li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.lsb__key {
  display: inline-block;
  width: 14px;
  height: 8px;
  border-radius: 999px;
}

.lsb__key.is-zone {
  background: rgba(var(--cm-info-rgb) / 0.32);
}

.lsb__key.is-beyond {
  background: rgba(var(--cm-warning-rgb) / 0.16);
}

.lsb__key.is-mark {
  width: 4px;
  height: 12px;
  border-radius: 2px;
  background: var(--cm-text-muted);
}

.lsb__key.is-mark.is-plus-longue {
  background: var(--cm-violet);
}

.lsb__key.is-mark.is-en-cours {
  width: 8px;
  background: var(--cm-text-primary);
}

.lsb__text {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--cm-text-secondary);
}

.lsb__text.is-warning {
  color: var(--cm-warning);
  font-weight: 600;
}

.lsb__text.is-muted {
  font-size: 11.5px;
  color: var(--cm-text-muted);
}
</style>
