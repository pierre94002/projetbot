<script setup>
import { computed } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import { pelouse, meteo } from '@/utils/fotmobLabels.js';

/**
 * Cadre de la rencontre : stade, remplissage, terrain, météo, et l'arbitre
 * avec ses moyennes de la saison — celles-ci disent s'il siffle plus ou moins
 * que la moyenne du championnat, ce qui intéresse directement les marchés
 * cartons et fautes. Chaque information est une tuile à icône (refonte du
 * 01/10/2026), l'arbitre a sa carte avec ses deux chiffres en tuiles.
 */
const props = defineProps({ meta: { type: Object, default: null } });

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
    <!-- Le cadre : stade, capacité, affluence, terrain, météo. -->
    <section class="match-info__group">
      <p class="cm-group-title">Le cadre</p>
      <div class="match-info__tiles">
        <div v-if="meta.stadium" class="cm-kpi match-info__tile">
          <span class="match-info__tile-head">
            <span class="cm-icon-box is-sm"><AppIcon name="mapPin" :size="14" /></span>
            <span class="cm-kpi__label">Stade</span>
          </span>
          <span class="match-info__tile-text">{{ meta.stadium }}</span>
          <span v-if="meta.city" class="cm-kpi__detail">{{ meta.city }}</span>
        </div>

        <div v-if="meta.capacity" class="cm-kpi match-info__tile">
          <span class="match-info__tile-head">
            <span class="cm-icon-box is-sm is-muted"><AppIcon name="users" :size="14" /></span>
            <span class="cm-kpi__label">Capacité</span>
          </span>
          <span class="cm-kpi__value">{{ meta.capacity.toLocaleString('fr-FR') }}</span>
          <span class="cm-kpi__detail">places</span>
        </div>

        <div v-if="meta.attendance" class="cm-kpi match-info__tile" :class="{ 'is-section': fill }">
          <span class="match-info__tile-head">
            <span class="cm-icon-box is-sm"><AppIcon name="users" :size="14" /></span>
            <span class="cm-kpi__label">Spectateurs</span>
          </span>
          <span class="cm-kpi__value">{{ meta.attendance.toLocaleString('fr-FR') }}</span>
          <span v-if="fill" class="cm-kpi__detail">{{ fill }} % de remplissage</span>
          <div v-if="fill" class="cm-bar match-info__bar" title="Remplissage du stade"><span class="cm-bar__fill" :style="{ width: `${Math.min(fill, 100)}%` }" /></div>
        </div>

        <div v-if="meta.surface" class="cm-kpi match-info__tile">
          <span class="match-info__tile-head">
            <span class="cm-icon-box is-sm is-accent"><AppIcon name="layers" :size="14" /></span>
            <span class="cm-kpi__label">Type de terrain</span>
          </span>
          <span class="match-info__tile-text">{{ pelouse(meta.surface) }}</span>
        </div>

        <div v-if="meta.temperature != null" class="cm-kpi match-info__tile">
          <span class="match-info__tile-head">
            <span class="cm-icon-box is-sm is-info"><AppIcon name="thermometer" :size="14" /></span>
            <span class="cm-kpi__label">Météo</span>
          </span>
          <span class="cm-kpi__value">{{ meta.temperature }} °C</span>
          <span class="match-info__weather">
            <span v-if="meta.weather" class="match-info__weather-item"><AppIcon name="droplet" :size="11" />{{ meteo(meta.weather) }}</span>
            <span v-if="meta.windSpeed" class="match-info__weather-item"><AppIcon name="wind" :size="11" />vent {{ meta.windSpeed }} km/h</span>
          </span>
        </div>
      </div>
    </section>

    <!-- L'arbitre : son nom, puis ses moyennes de la saison face à celles du championnat. -->
    <section v-if="referee" class="match-info__group">
      <p class="cm-group-title">Arbitre</p>
      <div class="match-info__referee">
        <div class="match-info__ref-head">
          <span class="cm-icon-box is-warning"><AppIcon name="whistle" :size="18" /></span>
          <div class="match-info__ref-identity">
            <p class="match-info__ref-name">
              {{ referee.name }}
              <span v-if="referee.country" class="cm-chip">{{ referee.country }}</span>
            </p>
            <p v-if="referee.matches" class="match-info__ref-foot">
              {{ referee.matches }} match(s) arbitré(s)<template v-if="referee.league"> en {{ referee.league }}</template>
              <template v-if="referee.penalties"> · {{ referee.penalties }} penalty(s)</template>
              <template v-if="referee.redCards"> · {{ referee.redCards }} carton(s) rouge(s)</template>
            </p>
          </div>
        </div>

        <div v-if="referee.yellowCardsPerMatch != null || referee.foulsPerMatch != null" class="match-info__tiles">
          <div v-if="referee.yellowCardsPerMatch != null" class="cm-kpi match-info__tile">
            <span class="match-info__tile-head">
              <span class="cm-icon-box is-sm is-warning"><AppIcon name="cards" :size="14" /></span>
              <span class="cm-kpi__label">Cartons jaunes</span>
            </span>
            <span class="cm-kpi__value">{{ fr(referee.yellowCardsPerMatch, 1) }}<small class="match-info__per"> / match</small></span>
            <span class="match-info__vs">{{ versusAverage(referee.yellowCardsPerMatch, referee.yellowCardsLeagueAverage) }}</span>
          </div>
          <div v-if="referee.foulsPerMatch != null" class="cm-kpi match-info__tile">
            <span class="match-info__tile-head">
              <span class="cm-icon-box is-sm is-danger"><AppIcon name="alert" :size="14" /></span>
              <span class="cm-kpi__label">Fautes</span>
            </span>
            <span class="cm-kpi__value">{{ fr(referee.foulsPerMatch, 1) }}<small class="match-info__per"> / match</small></span>
            <span class="match-info__vs">{{ versusAverage(referee.foulsPerMatch, referee.foulsLeagueAverage) }}</span>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.match-info {
  /* Se règle sur SA largeur : deux colonnes dans une page large, une seule
     dans la moitié d'un résumé ou un panneau. */
  container: matchinfo / inline-size;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 18px;
}

.match-info__group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

/* ------------------------------------------------------------ tuiles */
.match-info__tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}

.match-info__tile {
  gap: 6px;
}

.match-info__tile-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
}

/* Une valeur en toutes lettres (stade, pelouse) : moins grosse qu'un chiffre. */
.match-info__tile-text {
  font-size: 14px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--cm-text-primary);
  overflow-wrap: anywhere;
}

.match-info__bar {
  margin-top: 4px;
}

.match-info__weather {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
}

.match-info__weather-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  color: var(--cm-text-secondary);
}

.match-info__weather-item :first-child {
  color: var(--cm-info);
}

/* ----------------------------------------------------------- arbitre */
.match-info__referee {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px;
  border-radius: var(--cm-radius-md);
  border: 1px solid rgba(var(--cm-warning-rgb) / 0.22);
  background: radial-gradient(120% 140% at 0% 0%, rgba(var(--cm-warning-rgb) / 0.07), transparent 55%), var(--cm-surface-alt);
}

.match-info__ref-head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px;
  align-items: center;
}

.match-info__ref-identity {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.match-info__ref-name {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: var(--cm-text-primary);
}

.match-info__ref-foot {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--cm-text-muted);
}

.match-info__referee .match-info__tiles {
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
}

.match-info__referee .match-info__tile {
  background: var(--cm-surface);
}

.match-info__per {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0;
  color: var(--cm-text-muted);
}

/* « Au-dessus » ou « en dessous » de la moyenne du championnat : ambre, à
   surveiller pour les marchés cartons et fautes. */
.match-info__vs {
  font-size: 11px;
  font-weight: 600;
  color: var(--cm-warning);
}

/* Assez de place : le cadre à gauche, l'arbitre à droite. */
@container matchinfo (min-width: 760px) {
  .match-info {
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    gap: 20px;
    align-items: start;
  }
}
</style>
