<script setup>
import { computed } from 'vue';
import AppButton from '@/components/common/AppButton.vue';
import CollapsibleSection from '@/components/common/CollapsibleSection.vue';
import { formatOdds } from '@/utils/format.js';
import { computeSafestPicks } from '@/utils/safestPicks.js';

const props = defineProps({
  result: { type: Object, default: null },
  averagesComparison: { type: Object, default: null } // { loading, error, teams, homeTeamId, homeName, awayName }
});

defineEmits(['compare-averages-click']);

const averagesLoaded = computed(() => (props.averagesComparison?.teams?.length ?? 0) === 2);
const safestPicks = computed(() => computeSafestPicks(props.result, props.averagesComparison));
</script>

<template>
  <CollapsibleSection v-if="result" class="safest-picks">
    <template #header>
      <div class="safest-picks__headrow">
        <p class="safest-picks__head">Meilleures chances <span class="cm-text-muted">— tous marchés (modèle)</span></p>
        <AppButton
          v-if="!averagesLoaded"
          variant="secondary"
          size="sm"
          :loading="averagesComparison?.loading"
          @click.stop="
            $emit('compare-averages-click', {
              homeName: result.teamStats?.home?.name,
              awayName: result.teamStats?.away?.name,
              league: result.league
            })
          "
        >
          Lancer (inclure tirs, tirs cadrés &amp; corners)
        </AppButton>
      </div>
    </template>

    <div class="safest-picks__list">
      <div v-for="pick in safestPicks" :key="pick.market" class="safest-picks__row">
        <span class="cm-text-muted safest-picks__market">{{ pick.market }}</span>
        <span class="safest-picks__pick">{{ pick.pick }}</span>
        <span class="cm-numeric safest-picks__odds">@ {{ formatOdds(pick.odds) }}</span>
      </div>
    </div>

    <p class="cm-text-muted safest-picks__note">
      Chaque ligne est le meilleur pari indépendant de son marché, trié par cote — <strong>pas un pari combiné</strong> :
      les cotes ne sont jamais multipliées entre elles. Plusieurs marchés dérivent du même modèle de buts (donc
      corrélés) — les combiner comme des paris indépendants donnerait une fausse cote, trop généreuse.
    </p>
  </CollapsibleSection>
</template>

<style scoped>
.safest-picks {
  padding: 14px 16px;
  background: var(--cm-surface-alt);
  border-radius: var(--cm-radius);
  border: 1px solid var(--cm-border);
}

.safest-picks__headrow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.safest-picks__head {
  font-size: 13px;
  font-weight: 600;
}

.safest-picks__list {
  display: flex;
  flex-direction: column;
  margin-top: 10px;
}

.safest-picks__row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 10px;
  padding: 7px 0;
  border-bottom: 1px solid var(--cm-border-soft);
  font-size: 12.5px;
}

.safest-picks__row:last-child {
  border-bottom: none;
}

.safest-picks__market {
  font-size: 11px;
}

.safest-picks__pick {
  font-weight: 600;
  text-align: right;
}

.safest-picks__odds {
  min-width: 52px;
  text-align: right;
  font-weight: 700;
  color: var(--cm-accent);
}

.safest-picks__note {
  font-size: 11px;
  margin-top: 10px;
}
</style>
