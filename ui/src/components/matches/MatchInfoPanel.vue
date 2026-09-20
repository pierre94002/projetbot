<script setup>
import { computed } from 'vue';

/**
 * Cadre de la rencontre : stade, remplissage, terrain, météo, et l'arbitre
 * avec ses moyennes de la saison — celles-ci disent s'il siffle plus ou moins
 * que la moyenne du championnat, ce qui intéresse directement les marchés
 * cartons et fautes.
 */
const props = defineProps({ meta: { type: Object, default: null } });

const SURFACES = { grass: 'Gazon', artificial: 'Synthétique', hybrid: 'Hybride' };

const fill = computed(() => {
  const { attendance, capacity } = props.meta ?? {};
  if (!attendance || !capacity) return null;
  return Math.round((100 * attendance) / capacity);
});

const referee = computed(() => props.meta?.referee ?? null);

/** « en dessous » ou « au-dessus » de la moyenne du championnat. */
function versusAverage(value, average) {
  if (value == null || average == null) return null;
  return value < average ? 'En dessous de la moyenne' : 'Au-dessus de la moyenne';
}

function fr(value, decimals = 1) {
  return value == null ? '—' : Number(value).toFixed(decimals).replace('.', ',');
}
</script>

<template>
  <div v-if="meta" class="match-info">
    <section class="match-info__block">
      <p v-if="meta.stadium" class="match-info__row">
        <span class="match-info__label">Stade</span>
        <span>{{ meta.stadium }}<template v-if="meta.city"> · {{ meta.city }}</template></span>
      </p>
      <p v-if="meta.capacity" class="match-info__row">
        <span class="match-info__label">Capacité</span>
        <span>{{ meta.capacity.toLocaleString('fr-FR') }}</span>
      </p>
      <template v-if="meta.attendance">
        <p class="match-info__row">
          <span class="match-info__label">Spectateurs</span>
          <span>{{ meta.attendance.toLocaleString('fr-FR') }}<template v-if="fill"> — {{ fill }} %</template></span>
        </p>
        <div v-if="fill" class="match-info__bar"><span :style="{ width: `${Math.min(fill, 100)}%` }" /></div>
      </template>
      <p v-if="meta.surface" class="match-info__row">
        <span class="match-info__label">Type de terrain</span>
        <span>{{ SURFACES[meta.surface] ?? meta.surface }}</span>
      </p>
      <p v-if="meta.temperature != null" class="match-info__row">
        <span class="match-info__label">Météo</span>
        <span>
          {{ meta.temperature }} °C<template v-if="meta.weather"> · {{ meta.weather }}</template>
          <template v-if="meta.windSpeed"> · vent {{ meta.windSpeed }} km/h</template>
        </span>
      </p>
    </section>

    <section v-if="referee" class="match-info__block">
      <p class="match-info__title">Arbitre</p>
      <p class="match-info__referee">
        {{ referee.name }}
        <span v-if="referee.country" class="cm-text-muted">· {{ referee.country }}</span>
      </p>
      <div v-if="referee.yellowCardsPerMatch != null || referee.foulsPerMatch != null" class="match-info__ref-stats">
        <div v-if="referee.yellowCardsPerMatch != null" class="match-info__ref-stat">
          <span class="match-info__label">Cartons jaunes</span>
          <strong>{{ fr(referee.yellowCardsPerMatch, 1) }}</strong><span class="cm-text-muted"> / match</span>
          <span class="match-info__vs">{{ versusAverage(referee.yellowCardsPerMatch, referee.yellowCardsLeagueAverage) }}</span>
        </div>
        <div v-if="referee.foulsPerMatch != null" class="match-info__ref-stat">
          <span class="match-info__label">Fautes</span>
          <strong>{{ fr(referee.foulsPerMatch, 1) }}</strong><span class="cm-text-muted"> / match</span>
          <span class="match-info__vs">{{ versusAverage(referee.foulsPerMatch, referee.foulsLeagueAverage) }}</span>
        </div>
      </div>
      <p v-if="referee.matches" class="cm-text-muted match-info__ref-foot">
        {{ referee.matches }} match(s) arbitré(s)<template v-if="referee.league"> en {{ referee.league }}</template>
        <template v-if="referee.penalties"> · {{ referee.penalties }} penalty(s)</template>
        <template v-if="referee.redCards"> · {{ referee.redCards }} carton(s) rouge(s)</template>
      </p>
    </section>
  </div>
</template>

<style scoped>
.match-info {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.match-info__block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.match-info__row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin: 0;
  font-size: 12.5px;
}

.match-info__label {
  color: var(--cm-text-muted);
  font-size: 11.5px;
}

.match-info__bar {
  height: 5px;
  border-radius: 3px;
  background: var(--cm-surface-alt);
  overflow: hidden;
}

.match-info__bar span {
  display: block;
  height: 100%;
  background: var(--cm-accent);
  border-radius: 3px;
}

.match-info__title {
  margin: 0;
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--cm-text-muted);
}

.match-info__referee {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}

.match-info__ref-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 4px;
}

.match-info__ref-stat {
  display: flex;
  flex-direction: column;
  gap: 1px;
  font-size: 12.5px;
}

.match-info__ref-stat strong {
  font-family: var(--cm-font-mono);
  font-size: 15px;
}

.match-info__vs {
  font-size: 10.5px;
  color: var(--cm-warning);
}

.match-info__ref-foot {
  font-size: 10.5px;
  margin: 2px 0 0;
  line-height: 1.5;
}

@media (max-width: 720px) {
  .match-info {
    grid-template-columns: 1fr;
  }
}
</style>
