<script setup>
import { computed, ref, watch } from 'vue';
import AppCard from '@/components/common/AppCard.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import AppButton from '@/components/common/AppButton.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import OddsMoveArrow from '@/components/common/OddsMoveArrow.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import { liveNow } from '@/utils/liveClock.js';
import { formatOdds } from '@/utils/format.js';
import { quandDit } from '@/utils/langageParis.js';
import { courbeDesCotes, geometrieDeLaCourbe, descriptionDeLaCourbe, accordDit } from '@/utils/courbeDesCotes.js';

/**
 * LES COTES, DE L'OUVERTURE À MAINTENANT (étape 9 du plan, 06/10/2026) : le
 * graphique de la page d'un match. Il ne calcule rien de nouveau : il dessine
 * les mouvements que le serveur mesure déjà pour l'onglet Cotes (« Ce qui a
 * bougé depuis l'ouverture ») et la page Chutes de cotes — la cote JUSTE (marge
 * retirée, moyenne des bookmakers qui ont bougé) de chaque issue à l'ouverture
 * et au dernier relevé, avec l'heure de chacun (cf. utils/courbeDesCotes.js).
 *
 * Ces cotes sont des cotes de RÉFÉRENCE relevées gratuitement (ESPN,
 * football-data.co.uk, 365Scores, Kalshi, Smarkets) : elles disent où va le
 * marché, jamais ce que paient vos bookmakers — rien ici n'est vert ni
 * « jouable ». La provenance réelle (les sources et l'heure du dernier relevé)
 * est dite en tête. Sans relevé, ou avec un seul, le graphique le DIT au lieu de
 * rester vide (règle de Pierre du 04/10/2026 : pas de cote absente sans le dire).
 *
 * Le dessin n'a que l'essentiel, et chaque chiffre est AUSSI dans la légende
 * dessous, lisible par un lecteur d'écran : l'ouverture à gauche, le dernier
 * relevé à droite, une ligne par issue — une issue dont la cote baisse descend.
 * Une issue se reconnaît à son TRAIT (plein, tirets, pointillés) autant qu'à sa
 * couleur. Jamais de vert ni de rouge : une cote qui baisse n'est ni bonne ni
 * mauvaise en soi (c'est le marché qui joue davantage l'issue).
 *
 * `etat` : { loading, error, data } — la réponse de GET /api/odds/fixture, lue
 * par la page (la même que celle de l'onglet Cotes).
 */
const props = defineProps({
  etat: { type: Object, required: true }
});

defineEmits(['voir-cotes']);

const choix = ref(null);
const courbe = computed(() => courbeDesCotes(props.etat?.data ?? null, { marche: choix.value }));
const geometrie = computed(() => (courbe.value.etat === 'ok' ? geometrieDeLaCourbe(courbe.value.issues) : null));
const description = computed(() => descriptionDeLaCourbe(courbe.value));
// Un autre match : le marché choisi n'a plus de sens.
watch(
  () => props.etat?.data?.fixture,
  () => {
    choix.value = null;
  }
);

const sourcesDites = computed(() => [...new Set(courbe.value.sources.map((s) => s.nom))].join(', '));
const dernierReleve = computed(() => courbe.value.sources.map((s) => s.dernier).filter(Boolean).sort().at(-1) ?? null);
const nombreDeManques = computed(() => courbe.value.manques.length);
const manquesDits = computed(() => courbe.value.manques.slice(0, 4));

const quand = (iso) => (iso ? quandDit(iso, liveNow.value) : 'heure inconnue');
const cote = (x) => formatOdds(x);
const TRAIT = { home: 'plein', draw: 'tirets', away: 'points', over: 'plein', under: 'points', yes: 'plein', no: 'points' };
</script>

<template>
  <AppCard title="Les cotes, de l'ouverture à maintenant" subtitle="La cote juste de chaque issue, de son ouverture au dernier relevé." icon="activity" eyebrow="Le marché" class="otc">
    <template v-if="courbe.etat === 'ok' && sourcesDites" #actions>
      <ProvenanceChip
        :source="sourcesDites"
        :releve-le="dernierReleve"
        detail="Cotes de référence relevées gratuitement : elles montrent où va le marché, jamais ce que paient vos bookmakers."
      />
    </template>

    <LoadingSpinner v-if="etat.loading && !etat.data" label="Lecture des cotes relevées…" />
    <div v-else-if="etat.error && !etat.data" class="cm-note is-danger">
      <span class="cm-icon-box is-danger is-sm"><AppIcon name="alert" :size="14" /></span>
      <div>
        <p class="cm-note__title">Cotes indisponibles</p>
        <p class="cm-note__text">{{ etat.error }}</p>
      </div>
    </div>

    <!-- Rien à tracer : on dit pourquoi, et ce qui manque. -->
    <div v-else-if="courbe.etat !== 'ok'" class="otc__empty">
      <div class="cm-note" :class="courbe.etat === 'serveur-ancien' ? 'is-warning' : ''">
        <span class="cm-icon-box is-sm" :class="courbe.etat === 'serveur-ancien' ? 'is-warning' : 'is-muted'"><AppIcon :name="courbe.etat === 'un-seul-releve' ? 'clock' : 'info'" :size="14" /></span>
        <div>
          <p class="cm-note__title">{{ courbe.etat === 'sans-cotes' ? 'Aucune cote relevée pour ce match' : courbe.etat === 'un-seul-releve' ? 'Un seul relevé pour l\'instant' : 'Pas de courbe' }}</p>
          <p class="cm-note__text">{{ courbe.raison }}</p>
        </div>
      </div>
      <ul v-if="manquesDits.length" class="otc__manques">
        <li v-for="(m, i) in manquesDits" :key="i"><strong>{{ m.label }}</strong> — {{ m.reason }}</li>
        <li v-if="nombreDeManques > manquesDits.length" class="otc__plus">… et {{ nombreDeManques - manquesDits.length }} de plus, source par source, dans l'onglet Cotes.</li>
      </ul>
      <AppButton v-if="courbe.etat === 'sans-cotes' || courbe.etat === 'un-seul-releve'" variant="secondary" size="sm" @click="$emit('voir-cotes')">
        <template #icon><AppIcon name="percent" :size="13" /></template>
        Voir l'onglet Cotes
      </AppButton>
    </div>

    <template v-else>
      <div v-if="courbe.marches.length > 1" class="otc__markets" role="group" aria-label="Marché de la courbe">
        <button
          v-for="m in courbe.marches"
          :key="m.cle"
          type="button"
          class="otc__market"
          :class="{ 'is-active': m.cle === courbe.marche.cle }"
          :aria-pressed="m.cle === courbe.marche.cle"
          @click="choix = m.cle"
        >
          {{ m.libelle }}
        </button>
      </div>
      <p v-else class="otc__market-name">{{ courbe.marche.libelle }}</p>

      <div class="otc__body">
        <div class="otc__chart">
          <svg v-if="geometrie" class="otc__svg" :viewBox="`0 0 ${geometrie.largeur} ${geometrie.hauteur}`" role="img" :aria-label="description" preserveAspectRatio="xMidYMid meet">
            <title>{{ description }}</title>
            <g class="otc__grid">
              <g v-for="t in geometrie.ticks" :key="t.valeur">
                <line :x1="geometrie.gauche" :x2="geometrie.droite" :y1="t.y" :y2="t.y" />
                <text :x="geometrie.gauche - 6" :y="t.y" text-anchor="end" dominant-baseline="middle">{{ t.valeur.toFixed(2) }}</text>
              </g>
            </g>
            <g v-for="s in geometrie.series" :key="s.issue" class="otc__serie" :class="`is-${s.issue}`">
              <line :x1="geometrie.xDe" :y1="s.yDe" :x2="geometrie.xVers" :y2="s.yVers" />
              <circle :cx="geometrie.xDe" :cy="s.yDe" r="4"><title>{{ s.libelle }} · ouverture {{ cote(s.de) }}</title></circle>
              <circle :cx="geometrie.xVers" :cy="s.yVers" r="4"><title>{{ s.libelle }} · dernier relevé {{ cote(s.vers) }}</title></circle>
            </g>
          </svg>
          <div class="otc__axis">
            <span class="otc__axis-end"><strong>Ouverture</strong><small>{{ quand(courbe.debut) }}</small></span>
            <span class="otc__axis-end is-end"><strong>Dernier relevé</strong><small>{{ quand(courbe.fin) }}</small></span>
          </div>
        </div>

        <!-- La légende : une ligne par issue — son trait, son nom et l'accord des bookmakers, ses deux cotes justes, son mouvement. -->
        <ul class="otc__legend" aria-label="Cote juste de chaque issue, de l'ouverture au dernier relevé">
          <li v-for="i in courbe.issues" :key="i.issue" class="otc__row">
            <span class="otc__swatch" :class="`is-${i.issue}`" :title="`Trait ${TRAIT[i.issue] ?? 'plein'}`" aria-hidden="true" />
            <span class="otc__issue-text">
              <strong>{{ i.libelle }}</strong>
              <small>{{ accordDit(i) }}</small>
            </span>
            <span class="otc__nums cm-numeric">
              <span class="otc__num" :title="`Ouverture : ${quand(i.deAt)}`"><span class="cm-visually-hidden">Ouverture </span>{{ cote(i.de) }}</span>
              <AppIcon name="arrowRight" :size="11" class="otc__to" />
              <span class="otc__num is-last" :title="`Dernier relevé : ${quand(i.versAt)}`"><span class="cm-visually-hidden">dernier relevé </span><strong>{{ cote(i.vers) }}</strong></span>
            </span>
            <OddsMoveArrow class="otc__move" :pourcent="i.pourcent" sujet="Cote juste" taille="sm" />
          </li>
        </ul>
      </div>
      <p class="otc__foot">
        Cotes de référence, pas les vôtres : elles disent où va le marché, pas ce que paient vos bookmakers. Le détail bookmaker par bookmaker est dans l'onglet Cotes.
        <button type="button" class="cm-link otc__link" @click="$emit('voir-cotes')">Voir l'onglet Cotes</button>
      </p>
    </template>
  </AppCard>
</template>

<style scoped>
.otc {
  /* Se règle sur SA largeur : la courbe à côté de sa légende si la place existe, sinon l'une sous l'autre. */
  container: otc / inline-size;
}

.otc__markets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}

.otc__market {
  padding: 5px 12px;
  border-radius: 999px;
  border: 1px solid var(--cm-border-soft);
  background: transparent;
  color: var(--cm-text-secondary);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--cm-transition), color var(--cm-transition), border-color var(--cm-transition);
}

.otc__market:hover {
  color: var(--cm-text-primary);
  background: var(--cm-surface-hover);
}

.otc__market.is-active {
  border-color: rgba(var(--cm-section-rgb) / 0.4);
  background: rgba(var(--cm-section-rgb) / 0.12);
  color: var(--cm-text-primary);
}

.otc__market-name {
  margin: 0 0 12px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

.otc__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.otc__chart {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.otc__svg {
  display: block;
  width: 100%;
  max-width: 380px;
  height: auto;
}

/* Les repères de l'axe des cotes : des filets discrets, des chiffres petits. */
.otc__grid line {
  stroke: var(--cm-border-soft);
  stroke-width: 1;
}

.otc__grid text {
  fill: var(--cm-text-muted);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}

/* Une issue = une couleur ET un trait : plein, tirets, pointillés. Jamais de vert ni de rouge. */
.otc__serie line {
  stroke: var(--cm-info);
  stroke-width: 2.5;
  stroke-linecap: round;
}

.otc__serie circle {
  fill: var(--cm-surface);
  stroke: var(--cm-info);
  stroke-width: 2.5;
}

.otc__serie.is-draw line,
.otc__serie.is-draw circle {
  stroke: var(--cm-violet);
}

.otc__serie.is-draw line {
  stroke-dasharray: 7 5;
}

.otc__serie.is-away line,
.otc__serie.is-under line,
.otc__serie.is-no line,
.otc__serie.is-away circle,
.otc__serie.is-under circle,
.otc__serie.is-no circle {
  stroke: var(--cm-cyan);
}

.otc__serie.is-away line,
.otc__serie.is-under line,
.otc__serie.is-no line {
  stroke-dasharray: 1 6;
}

.otc__axis {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  max-width: 380px;
  padding: 0 8px 0 36px;
}

.otc__axis-end {
  display: flex;
  flex-direction: column;
  gap: 1px;
  font-size: 11px;
  color: var(--cm-text-secondary);
}

.otc__axis-end.is-end {
  align-items: flex-end;
  text-align: right;
}

.otc__axis-end small {
  font-size: 11px;
  color: var(--cm-text-muted);
}

.otc__legend {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.otc__row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 4px 12px;
  padding: 9px 12px;
  border-radius: 12px;
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
}

.otc__nums {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--cm-text-secondary);
  white-space: nowrap;
}

.otc__num.is-last {
  color: var(--cm-text-primary);
}

.otc__to {
  color: var(--cm-text-muted);
}

.otc__move {
  justify-self: end;
  min-width: 74px;
}

/* Le trait de l'issue, devant son nom : le même que dans le dessin. */
.otc__swatch {
  display: inline-block;
  flex-shrink: 0;
  width: 22px;
  height: 0;
  border-top: 3px solid var(--cm-info);
  border-radius: 2px;
}

.otc__swatch.is-draw {
  border-top-color: var(--cm-violet);
  border-top-style: dashed;
}

.otc__swatch.is-away,
.otc__swatch.is-under,
.otc__swatch.is-no {
  border-top-color: var(--cm-cyan);
  border-top-style: dotted;
}

.otc__issue-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.otc__issue-text small {
  font-size: 11px;
  color: var(--cm-text-muted);
}

.otc__foot {
  margin: 12px 0 0;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--cm-text-muted);
}

.otc__link {
  margin-left: 4px;
  font-size: 11.5px;
}

.otc__empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}

.otc__manques {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--cm-text-secondary);
}

.otc__plus {
  list-style: none;
  margin-left: -18px;
  color: var(--cm-text-muted);
}

/* Assez de place : la courbe à gauche, son tableau à droite. */
@container otc (min-width: 800px) {
  .otc__body {
    grid-template-columns: minmax(0, 380px) minmax(0, 1fr);
  }
}

/* Place étroite : le mouvement passe à droite du nom, les deux cotes dessous. */
@container otc (max-width: 480px) {
  .otc__row {
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-areas:
      'trait nom mouvement'
      'trait cotes cotes';
  }

  .otc__swatch {
    grid-area: trait;
    width: 14px;
  }

  .otc__issue-text {
    grid-area: nom;
  }

  .otc__move {
    grid-area: mouvement;
  }

  .otc__nums {
    grid-area: cotes;
  }
}
</style>
