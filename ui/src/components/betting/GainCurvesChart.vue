<script setup>
import { computed } from 'vue';
import { COURBES, geometrieDesCourbes, eurosSignes, phraseAttendu, jourDit } from '@/utils/suiviParis.js';

/**
 * GAGNÉ ET ATTENDU, dans le temps (étape 11 du plan, 06/10/2026) : les paris
 * réglés dans l'ordre où ils se sont réglés, un pas par pari, depuis 0.
 *   - « Gagné · tout le carnet » : le gain réel cumulé (le profit net du carnet) ;
 *   - « Gagné · paris avec leur probabilité » et « Attendu · mêmes paris » : le
 *     gain réel et le gain attendu (mise × (probabilité du moteur × cote − 1))
 *     des SEULS paris qui ont leur probabilité du moment (« J'ai parié »,
 *     étape 10) — l'écart entre les deux sépare la chance de la méthode.
 * Aucune couleur de gain ou de perte sur les traits (ni vert ni rouge) : un
 * trait se reconnaît à sa couleur ET à son dessin (plein, épais, tirets).
 * Le composant n'appelle rien : la page lui donne `courbe` et `attendu`
 * (GET /api/bets/suivi). Géométrie : utils/suiviParis.js.
 */
const props = defineProps({
  courbe: { type: Object, default: null },
  attendu: { type: Object, default: null }
});

const LARGEUR = 640;
const HAUTEUR = 220;
const g = computed(() => geometrieDesCourbes(props.courbe, { largeur: LARGEUR, hauteur: HAUTEUR }));
const legende = computed(() => COURBES.filter((c) => g.value.chemins[c.cle]).map((c) => ({ ...c, valeur: g.value.fin[c.cle] })));
const absentes = computed(() => COURBES.filter((c) => !g.value.chemins[c.cle]));
const phrase = computed(() => phraseAttendu(props.attendu));
const debut = computed(() => (props.courbe?.debut ? jourDit(props.courbe.debut) : null));
const fin = computed(() => (props.courbe?.fin ? jourDit(props.courbe.fin) : null));
/** Ce que dit le dessin, pour un lecteur d'écran. */
const description = computed(() =>
  g.value.vide
    ? 'Aucun pari réglé : pas encore de courbe.'
    : `${g.value.n} paris réglés, du ${debut.value} au ${fin.value}. ${legende.value.map((c) => `${c.libelle} : ${eurosSignes(c.valeur)}`).join(' ; ')}.`
);
</script>

<template>
  <figure class="gcurve">
    <figcaption class="gcurve__head">
      <span class="cm-eyebrow">Gain réel et gain attendu, cumulés</span>
      <span v-if="!g.vide" class="gcurve__range cm-numeric">{{ g.n }} pari{{ g.n > 1 ? 's' : '' }} réglé{{ g.n > 1 ? 's' : '' }} · {{ debut }} → {{ fin }}</span>
    </figcaption>

    <p v-if="g.vide" class="gcurve__empty">Aucun pari réglé : les courbes commencent au premier pari réglé.</p>
    <div v-else class="gcurve__plot">
      <svg class="gcurve__svg" :viewBox="`0 0 ${LARGEUR} ${HAUTEUR}`" preserveAspectRatio="none" role="img" :aria-label="description">
        <line v-for="r in g.reperes" :key="`r${r.valeur}`" class="gcurve__grid" x1="0" :x2="LARGEUR" :y1="r.y" :y2="r.y" />
        <line class="gcurve__zero" x1="0" :x2="LARGEUR" :y1="g.zero" :y2="g.zero" />
        <path v-if="g.chemins.carnet" class="gcurve__line is-carnet" :d="g.chemins.carnet" />
        <path v-if="g.chemins.gagne" class="gcurve__line is-gagne" :d="g.chemins.gagne" />
        <path v-if="g.chemins.attendu" class="gcurve__line is-attendu" :d="g.chemins.attendu" />
      </svg>
      <span v-for="r in g.reperes" :key="`t${r.valeur}`" class="gcurve__tick cm-numeric" :style="{ top: `${r.pct}%` }">{{ r.texte }}</span>
    </div>

    <ul class="gcurve__legend">
      <li v-for="c in legende" :key="c.cle" class="gcurve__item" :title="c.aide">
        <i class="gcurve__swatch" :class="`is-${c.cle}`" aria-hidden="true" />
        <span>{{ c.libelle }}</span>
        <strong class="cm-numeric">{{ eurosSignes(c.valeur) }}</strong>
      </li>
      <li v-for="c in absentes" :key="c.cle" class="gcurve__item is-absent" :title="c.aide">
        <i class="gcurve__swatch" :class="`is-${c.cle}`" aria-hidden="true" />
        <span>{{ c.libelle }} : pas encore — {{ g.vide ? 'aucun pari réglé' : 'aucun pari réglé n’a sa probabilité du moment' }}.</span>
      </li>
    </ul>
    <p class="gcurve__note">{{ phrase }}</p>
  </figure>
</template>

<style scoped>
.gcurve {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 14px 16px 12px;
  border-radius: var(--cm-radius-md);
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
}

.gcurve__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 4px 12px;
}

.gcurve__range {
  font-size: 11px;
  color: var(--cm-text-muted);
}

.gcurve__empty,
.gcurve__note {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--cm-text-secondary);
}

/* Le dessin s'étire en largeur ; les repères (HTML) restent nets à gauche. */
.gcurve__plot {
  position: relative;
  height: 200px;
  padding-left: 76px;
}

.gcurve__svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.gcurve__grid {
  stroke: var(--cm-border-soft);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

.gcurve__zero {
  stroke: var(--cm-border-strong);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

.gcurve__line {
  fill: none;
  stroke-linejoin: round;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}

.gcurve__line.is-carnet {
  stroke: var(--cm-section);
  stroke-width: 2;
}

.gcurve__line.is-gagne {
  stroke: var(--cm-cyan);
  stroke-width: 3;
}

.gcurve__line.is-attendu {
  stroke: var(--cm-info);
  stroke-width: 2;
  stroke-dasharray: 7 5;
}

.gcurve__tick {
  position: absolute;
  left: 0;
  width: 70px;
  transform: translateY(-50%);
  font-size: 10.5px;
  text-align: right;
  color: var(--cm-text-muted);
  white-space: nowrap;
}

.gcurve__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.gcurve__item {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  color: var(--cm-text-secondary);
}

.gcurve__item strong {
  color: var(--cm-text-primary);
}

.gcurve__item.is-absent {
  color: var(--cm-text-muted);
}

/* La marque de la légende reprend le dessin du trait. */
.gcurve__swatch {
  display: inline-block;
  width: 22px;
  height: 0;
  border-top: 2px solid var(--cm-section);
}

.gcurve__swatch.is-gagne {
  border-top: 3px solid var(--cm-cyan);
}

.gcurve__swatch.is-attendu {
  border-top: 2px dashed var(--cm-info);
}

.gcurve__item.is-absent .gcurve__swatch {
  opacity: 0.45;
}

@media (max-width: 560px) {
  .gcurve__plot {
    height: 160px;
    padding-left: 64px;
  }

  .gcurve__tick {
    width: 58px;
  }
}
</style>
