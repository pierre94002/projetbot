<script setup>
import { computed } from 'vue';
import TeamCrest from '@/components/matches/TeamCrest.vue';
import { geometrieDuDirect, heureCourte } from '@/utils/direct.js';

/**
 * LA COURBE DU 1N2 AU FIL DU MATCH (étape 46 du plan, lot 1, partie D, 12/11/2026 ; conception § 3.3) : les minutes en
 * abscisse, la probabilité en ordonnée ; le club qui reçoit en bleu plein (--cm-info), le nul en violet à tirets
 * (--cm-violet), le visiteur en cyan pointillé (--cm-cyan) — lisible sans la couleur ; un trait à chaque changement de
 * score vu ; coupée aux trous des relevés. Sa géométrie est propre au direct (geometrieDuDirect) : celle des graphiques
 * de l'appli ne trace que deux colonnes. Pas encore jugé : la phrase, aucun pourcentage (P4).
 */
const props = defineProps({
  courbe: { type: Object, default: null },
  match: { type: Object, required: true }
});

// Mise en service, écrans 4 (verification.md § 2.6) : sans calcul lu, la courbe reste à blanc (jamais « tout passe »).
const aBlanc = computed(() => props.match?.calcul?.aBlanc !== false);
const g = computed(() => (aBlanc.value ? null : geometrieDuDirect(props.courbe)));
const etat = computed(() => (aBlanc.value ? 'a-blanc' : g.value ? 'ok' : 'vide'));
const chiffres = computed(() => (props.courbe?.points ?? []).filter((p) => p?.un2).length);
const trous = computed(() => props.courbe?.trous ?? []);
const nom = (c) => props.match?.[c]?.nom ?? (c === 'home' ? 'Domicile' : 'Extérieur');
const decrit = computed(
  () => `Probabilités du 1N2 au fil du match : ${nom('home')} en trait plein, le nul en tirets, ${nom('away')} en pointillés ; ${g.value?.points ?? 0} relevés.`
);
const trousDits = computed(() =>
  trous.value
    .map((t) => [heureCourte(t.de), heureCourte(t.a)])
    .filter(([a, b]) => a && b)
    .map(([a, b]) => `de ${a} à ${b}`)
    .join(', ')
);
</script>

<template>
  <section class="direct-curve" :data-courbe="etat" :data-points="g ? g.points : chiffres">
    <h4 class="direct-curve__titre">Le 1N2 au fil du match</h4>
    <p v-if="etat === 'a-blanc'" class="direct-curve__gris">Courbe des probabilités : pas encore jugée — calculée à blanc, pas montrée.</p>
    <p v-else-if="etat === 'vide'" class="direct-curve__gris">
      Pas assez de relevés chiffrés pour tracer la courbe ({{ chiffres }} relevé{{ chiffres > 1 ? 's' : '' }} ; il en faut deux).
    </p>
    <template v-else>
      <svg class="direct-curve__svg" :viewBox="`0 0 ${g.largeur} ${g.hauteur}`" role="img" :aria-label="decrit">
        <g class="direct-curve__grille">
          <line v-for="t in g.ticksY" :key="`y${t.valeur}`" :x1="g.gauche" :x2="g.droite" :y1="t.y" :y2="t.y" />
        </g>
        <g class="direct-curve__axes">
          <template v-for="t in g.ticksY" :key="`ty${t.valeur}`">
            <text v-if="t.libelle" :x="g.gauche - 4" :y="t.y + 3" text-anchor="end">{{ t.libelle }}</text>
          </template>
          <text v-for="t in g.ticksX" :key="`tx${t.valeur}`" :x="t.x" :y="g.hauteur - 6" text-anchor="middle">{{ t.valeur }}e</text>
        </g>
        <g class="direct-curve__buts">
          <template v-for="(b, i) in g.buts" :key="`b${i}`">
            <line :x1="b.x" :x2="b.x" :y1="g.haut" :y2="g.bas" />
            <text :x="b.x + 3" :y="g.haut + 9">{{ b.score }}</text>
          </template>
        </g>
        <g v-for="s in g.series" :key="s.issue" class="direct-curve__serie" :class="`is-${s.issue}`" :data-serie="s.issue">
          <polyline v-for="(c, i) in s.chemins" :key="i" :points="c" fill="none" />
        </g>
      </svg>
      <ul class="direct-curve__legende">
        <li class="is-home">
          <span class="direct-curve__trait"></span>
          <TeamCrest :name="nom('home')" :league="match.league" :team-id="match.home?.id ?? null" :size="16" />
          {{ nom('home') }}
        </li>
        <li class="is-draw"><span class="direct-curve__trait"></span>Nul</li>
        <li class="is-away">
          <span class="direct-curve__trait"></span>
          <TeamCrest :name="nom('away')" :league="match.league" :team-id="match.away?.id ?? null" :size="16" />
          {{ nom('away') }}
        </li>
      </ul>
      <p v-if="trous.length" class="direct-curve__gris">
        Courbe coupée là où les relevés manquent{{ trousDits ? ` (${trousDits})` : '' }} : rien n'est inventé entre deux relevés.
      </p>
    </template>
  </section>
</template>

<style scoped>
.direct-curve {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.direct-curve__titre {
  margin: 0;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--cm-text-secondary);
}

.direct-curve__gris {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--cm-text-muted);
}

.direct-curve__svg {
  width: 100%;
  height: auto;
  max-height: 240px;
}

.direct-curve__grille line {
  stroke: var(--cm-border-soft);
  stroke-width: 1;
}

.direct-curve__axes text,
.direct-curve__buts text {
  font-size: 9px;
  fill: var(--cm-text-muted);
}

.direct-curve__buts line {
  stroke: var(--cm-text-muted);
  stroke-width: 1;
  stroke-dasharray: 2 3;
}

.direct-curve__serie polyline {
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}

.direct-curve__serie.is-home polyline {
  stroke: var(--cm-info);
}

.direct-curve__serie.is-draw polyline {
  stroke: var(--cm-violet);
  stroke-dasharray: 6 4;
}

.direct-curve__serie.is-away polyline {
  stroke: var(--cm-cyan);
  stroke-dasharray: 2 3;
}

.direct-curve__legende {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 12px;
  color: var(--cm-text-secondary);
}

.direct-curve__legende li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.direct-curve__trait {
  width: 22px;
  height: 0;
  border-top: 2px solid var(--cm-info);
}

.direct-curve__legende .is-draw .direct-curve__trait {
  border-top: 2px dashed var(--cm-violet);
}

.direct-curve__legende .is-away .direct-curve__trait {
  border-top: 2px dotted var(--cm-cyan);
}
</style>
