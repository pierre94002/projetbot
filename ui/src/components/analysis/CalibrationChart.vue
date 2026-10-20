<script setup>
import { computed } from 'vue';

/**
 * LA COURBE ANNONCÉ / RÉALISÉ du banc d'essai (étape 19 du plan, 13/10/2026) : pour une case (un marché, une
 * période, un jeu de prix), chaque tranche de probabilité annoncée par le moteur (les dixièmes) est un point —
 * à gauche-droite ce qu'il annonçait en moyenne, en hauteur ce qui est arrivé. Sur la diagonale, il dit vrai ;
 * au-dessous, il promet trop. Le nombre de matchs est écrit sous chaque point. Dessin en SVG, couleurs par
 * jetons seulement (aucune couleur de gain : ce n'est pas un pari). Le composant n'appelle rien : la page lui
 * donne `points` (utils/banc.js, pointsDeLaCourbe).
 */
const props = defineProps({
  points: { type: Array, default: () => [] },
  titre: { type: String, default: '' }
});

const TAILLE = 260;
const MARGE = 28;
const echelle = (p) => MARGE + p * (TAILLE - 2 * MARGE);
const y = (p) => TAILLE - echelle(p);
const dessin = computed(() => props.points.filter((p) => Number.isFinite(p.annonce) && Number.isFinite(p.realise)).map((p) => ({ ...p, cx: echelle(p.annonce), cy: y(p.realise), rayon: Math.max(3, Math.min(9, Math.sqrt(p.n) / 6)) })));
const reperes = [0, 0.25, 0.5, 0.75, 1];
const pourcent = (p) => `${Math.round(p * 100)} %`;
const description = computed(() =>
  dessin.value.length
    ? `Annoncé et réalisé, ${dessin.value.length} tranches : ${dessin.value.map((p) => `annoncé ${pourcent(p.annonce)}, réalisé ${pourcent(p.realise)} sur ${p.n} matchs`).join(' ; ')}.`
    : 'Pas de point : aucun pronostic mesuré dans cette case.'
);
</script>

<template>
  <figure class="ccal">
    <figcaption class="ccal__head">
      <span class="cm-eyebrow">Annoncé et réalisé</span>
      <span v-if="titre" class="ccal__titre">{{ titre }}</span>
    </figcaption>
    <p v-if="!dessin.length" class="ccal__vide">Pas de point : aucun pronostic mesuré dans cette case.</p>
    <svg v-else class="ccal__svg" :viewBox="`0 0 ${TAILLE} ${TAILLE}`" role="img" :aria-label="description">
      <line v-for="r in reperes" :key="`x${r}`" class="ccal__grille" :x1="echelle(r)" :x2="echelle(r)" :y1="y(0)" :y2="y(1)" />
      <line v-for="r in reperes" :key="`y${r}`" class="ccal__grille" :x1="echelle(0)" :x2="echelle(1)" :y1="y(r)" :y2="y(r)" />
      <line class="ccal__diagonale" :x1="echelle(0)" :y1="y(0)" :x2="echelle(1)" :y2="y(1)" />
      <text v-for="r in reperes" :key="`tx${r}`" class="ccal__texte" :x="echelle(r)" :y="TAILLE - 8" text-anchor="middle">{{ pourcent(r) }}</text>
      <text v-for="r in reperes" :key="`ty${r}`" class="ccal__texte" :x="MARGE - 6" :y="y(r) + 3" text-anchor="end">{{ pourcent(r) }}</text>
      <g v-for="p in dessin" :key="p.de">
        <circle class="ccal__point" :cx="p.cx" :cy="p.cy" :r="p.rayon" />
        <text class="ccal__n" :x="p.cx" :y="p.cy + p.rayon + 10" text-anchor="middle">{{ p.n.toLocaleString('fr-FR') }}</text>
      </g>
    </svg>
    <p class="ccal__legende cm-text-muted">En largeur : ce que le moteur annonçait ; en hauteur : ce qui est arrivé. Sur la diagonale, il dit vrai ; sous elle, il promet trop.</p>
  </figure>
</template>

<style scoped>
.ccal {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ccal__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
}
.ccal__titre {
  font-size: 13px;
  color: var(--cm-text-secondary);
}
.ccal__svg {
  width: 100%;
  max-width: 340px;
  height: auto;
}
.ccal__grille {
  stroke: var(--cm-border-soft);
  stroke-width: 1;
}
.ccal__diagonale {
  stroke: var(--cm-text-muted);
  stroke-width: 1;
  stroke-dasharray: 4 4;
}
.ccal__point {
  fill: rgba(var(--cm-section-rgb) / 0.55);
  stroke: var(--cm-section);
  stroke-width: 1.5;
}
.ccal__texte,
.ccal__n {
  fill: var(--cm-text-muted);
  font-size: 10px;
}
.ccal__vide,
.ccal__legende {
  margin: 0;
  font-size: 12px;
}
</style>
