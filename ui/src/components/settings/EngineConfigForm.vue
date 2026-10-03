<script setup>
import { computed, reactive, watch } from 'vue';
import AppSlider from '@/components/common/AppSlider.vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';

/**
 * Les réglages du moteur (seuils, Kelly, mise, corrélation, cote plafond) et
 * les bookmakers où un pari peut être recommandé. Refonte visuelle du
 * 01/10/2026 (guide ui/DESIGN.md) : curseurs sur deux colonnes, bookmakers
 * en puces cochables, explication en note, enregistrement en vert de la
 * marque. Aucune donnée ni action n'a bougé.
 */
const props = defineProps({
  config: { type: Object, required: true },
  saving: { type: Boolean, default: false }
});

const emit = defineEmits(['save', 'reset']);

const form = reactive({ ...props.config, valueBookmakers: [...(props.config.valueBookmakers ?? [])], maxValueOdds: props.config.maxValueOdds ?? 5 });

watch(
  () => props.config,
  (next) => Object.assign(form, next, { valueBookmakers: [...(next.valueBookmakers ?? [])], maxValueOdds: next.maxValueOdds ?? 5 }),
  { deep: true }
);

// Bookmakers où un pari peut être recommandé (aucun coché = tous). La cote
// juste, elle, vient toujours des bookmakers les plus justes — Pinnacle
// d'abord (cf. server/src/core/engine/valueFinder.js) — et un bookmaker qui
// l'a fixée n'est jamais recommandé pour ce match. Les « fiables » sont
// réglementés par une autorité européenne ; aucun n'est agréé en France.
const BOOKMAKERS = [
  { key: 'williamhill', title: 'William Hill', groupe: 'fiable' },
  { key: 'sport888', title: '888sport', groupe: 'fiable' },
  { key: 'betsson', title: 'Betsson', groupe: 'fiable' },
  { key: 'nordicbet', title: 'Nordic Bet', groupe: 'fiable' },
  { key: 'unibet_nl', title: 'Unibet (NL)', groupe: 'fiable' },
  { key: 'unibet_se', title: 'Unibet (SE)', groupe: 'fiable' },
  { key: 'leovegas_se', title: 'LeoVegas (SE)', groupe: 'fiable' },
  { key: 'tipico_de', title: 'Tipico', groupe: 'fiable' },
  { key: 'coolbet', title: 'Coolbet', groupe: 'fiable' },
  { key: 'codere_it', title: 'Codere (IT)', groupe: 'fiable' },
  { key: 'betclic_fr', title: 'Betclic', groupe: 'france' },
  { key: 'unibet_fr', title: 'Unibet (FR)', groupe: 'france' },
  { key: 'winamax_fr', title: 'Winamax (FR)', groupe: 'france' },
  { key: 'pmu_fr', title: 'PMU', groupe: 'france' },
  { key: 'marathonbet', title: 'Marathon Bet', groupe: 'autre' },
  { key: 'onexbet', title: '1xBet', groupe: 'autre' }
];
const NOTES = { france: 'agréé en France, marge 11 à 15 %', autre: 'non retenu par défaut' };

// Présentation seulement : combien de bookmakers sont cochés (aucun = tous).
const selection = computed(() => {
  const n = form.valueBookmakers.length;
  if (!n) return 'Tous les bookmakers';
  return `${n} bookmaker${n > 1 ? 's' : ''} retenu${n > 1 ? 's' : ''}`;
});

function basculer(key) {
  const i = form.valueBookmakers.indexOf(key);
  if (i >= 0) form.valueBookmakers.splice(i, 1);
  else form.valueBookmakers.push(key);
}

function handleSave() {
  emit('save', {
    edgeThresholdMin: form.edgeThresholdMin,
    edgeThresholdMax: form.edgeThresholdMax,
    kellyFraction: form.kellyFraction,
    maxStakePercent: form.maxStakePercent,
    defaultCorrelation: form.defaultCorrelation,
    cornersAdjustmentMax: form.cornersAdjustmentMax,
    valueBookmakers: [...form.valueBookmakers],
    maxValueOdds: form.maxValueOdds
  });
}

const asPercent = (value) => `${(value * 100).toFixed(1)}%`;
</script>

<template>
  <form class="config-form" @submit.prevent="handleSave">
    <!-- 1. Les seuils : un curseur par réglage, deux colonnes quand la place existe. -->
    <section class="config-form__section">
      <h4 class="cm-section-title">
        Seuils et coefficients
        <span class="cm-section-title__hint">edge, Kelly, mise, corrélation, corners, cote plafond</span>
      </h4>
      <div class="cm-grid-2 config-form__grid">
        <AppSlider v-model="form.edgeThresholdMin" label="Edge minimum requis" :min="0" :max="0.2" :step="0.005" :format-value="asPercent" />
        <AppSlider v-model="form.edgeThresholdMax" label="Edge maximum accepté" :min="0.05" :max="0.6" :step="0.005" :format-value="asPercent" />
        <AppSlider v-model="form.kellyFraction" label="Fraction de Kelly" :min="0" :max="1" :step="0.01" :format-value="(v) => v.toFixed(2)" />
        <AppSlider v-model="form.maxStakePercent" label="Mise max (% bankroll)" :min="0" :max="0.1" :step="0.002" :format-value="asPercent" />
        <AppSlider v-model="form.defaultCorrelation" label="Corrélation Dixon-Coles (rho)" :min="-0.3" :max="0" :step="0.005" :format-value="(v) => v.toFixed(3)" />
        <AppSlider
          v-model="form.cornersAdjustmentMax"
          label="Écart max affiché signal corners (±, indicatif)"
          :min="0"
          :max="0.2"
          :step="0.005"
          :format-value="asPercent"
        />
        <AppSlider v-model="form.maxValueOdds" label="Cote maximale d'un pari recommandé" :min="1.5" :max="10" :step="0.25" :format-value="(v) => v.toFixed(2)" />
      </div>
    </section>

    <!-- 2. Les bookmakers : une puce cochable par bookmaker, la note en petit. -->
    <fieldset class="config-form__section config-form__bookmakers">
      <legend class="cm-section-title config-form__legend">
        Vos bookmakers : un pari n'est recommandé que chez eux
        <span class="cm-chip is-section config-form__count">{{ selection }}</span>
      </legend>
      <div class="config-form__chips">
        <label v-for="b in BOOKMAKERS" :key="b.key" class="bookmaker" :class="{ 'is-on': form.valueBookmakers.includes(b.key) }">
          <input type="checkbox" class="cm-visually-hidden" :checked="form.valueBookmakers.includes(b.key)" @change="basculer(b.key)" />
          <span class="bookmaker__check"><AppIcon name="check" :size="11" /></span>
          <span class="bookmaker__name">{{ b.title }}</span>
          <span v-if="NOTES[b.groupe]" class="bookmaker__note">{{ NOTES[b.groupe] }}</span>
        </label>
      </div>
      <div class="cm-note">
        <span class="cm-icon-box is-muted"><AppIcon name="info" :size="16" /></span>
        <div>
          <p class="cm-note__title">Comment la sélection est lue</p>
          <p class="cm-note__text config-form__hint">
            Aucun coché : tous les bookmakers. Les bookmakers sans mention sont réglementés par une autorité européenne, mais aucun
            n'est agréé en France. La cote juste vient toujours des bookmakers les plus justes, Pinnacle d'abord, et jamais du
            bookmaker où l'on parie.
          </p>
        </div>
      </div>
    </fieldset>

    <!-- 3. Enregistrer (vert de la marque) ou revenir aux valeurs par défaut. -->
    <div class="config-form__actions">
      <AppButton type="submit" variant="section" :loading="saving">
        <template #icon><AppIcon name="check" :size="15" /></template>
        Enregistrer
      </AppButton>
      <AppButton variant="ghost" type="button" @click="emit('reset')">
        <template #icon><AppIcon name="refresh" :size="15" /></template>
        Réinitialiser les valeurs par défaut
      </AppButton>
    </div>
  </form>
</template>

<style scoped>
.config-form {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.config-form__section {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

/* Les curseurs : un peu plus d'air entre les colonnes qu'entre les lignes. */
.config-form__grid {
  gap: 18px 28px;
}

/* ------------------------------------------------------------ bookmakers */
.config-form__bookmakers {
  margin: 0;
  padding: 0;
  border: 0;
}

.config-form__legend {
  padding: 0;
  margin-bottom: 14px;
}

.config-form__count {
  text-transform: none;
  letter-spacing: 0;
}

.config-form__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* Une puce cochable : filet discret, couleur de section quand elle est retenue. */
.bookmaker {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px 7px 9px;
  border-radius: 999px;
  border: 1px solid var(--cm-border);
  background: var(--cm-surface-alt);
  font-size: 12.5px;
  font-weight: 600;
  color: var(--cm-text-secondary);
  cursor: pointer;
  user-select: none;
  transition: border-color var(--cm-transition), background var(--cm-transition), color var(--cm-transition);
}

.bookmaker:hover {
  border-color: var(--cm-border-strong);
  color: var(--cm-text-primary);
}

.bookmaker.is-on {
  border-color: rgba(var(--cm-section-rgb) / 0.45);
  background: var(--cm-section-soft);
  color: var(--cm-text-primary);
}

/* Le clavier reste visible : l'anneau de focus suit la case masquée. */
.bookmaker:has(input:focus-visible) {
  box-shadow: 0 0 0 3px rgba(var(--cm-section-rgb) / 0.25);
}

.bookmaker__check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 6px;
  border: 1px solid var(--cm-border-strong);
  background: var(--cm-surface);
  color: transparent;
  transition: background var(--cm-transition), border-color var(--cm-transition), color var(--cm-transition);
}

.bookmaker.is-on .bookmaker__check {
  border-color: var(--cm-section);
  background: var(--cm-section);
  color: var(--cm-section-on);
}

.bookmaker__note {
  font-size: 10.5px;
  font-weight: 500;
  color: var(--cm-text-muted);
}

.config-form__hint {
  font-size: 12.5px;
  color: var(--cm-text-secondary);
}

/* ---------------------------------------------------------------- actions */
.config-form__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding-top: 16px;
  border-top: 1px solid var(--cm-border-soft);
}
</style>
