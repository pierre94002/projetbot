<script setup>
/**
 * Déroulé du match : buts, cartons et remplacements sur une colonne centrale
 * de minutes, chaque camp de son côté — la forme de FotMob.
 */
defineProps({
  events: { type: Array, default: () => [] },
  homeName: { type: String, default: '' },
  awayName: { type: String, default: '' }
});

const ICONS = { goal: '⚽', card: '▮', substitution: '⇄' };

function label(event) {
  if (event.type === 'goal') {
    const parts = [event.player];
    if (event.ownGoal) parts.push('(CSC)');
    return parts.filter(Boolean).join(' ');
  }
  if (event.type === 'card') return event.player;
  return null;
}

function sublabel(event) {
  if (event.type === 'goal' && event.assist) return `passe décisive de ${event.assist}`;
  if (event.type === 'goal' && event.detail) return event.detail;
  return null;
}
</script>

<template>
  <ol v-if="events.length" class="events">
    <li v-for="(event, index) in events" :key="index" class="events__row">
      <div class="events__side events__side--home">
        <template v-if="event.side === 'home'">
          <div v-if="event.type === 'substitution'" class="events__sub">
            <span class="events__in">{{ event.playerIn }}</span>
            <span class="events__out">{{ event.playerOut }}</span>
          </div>
          <div v-else>
            <span class="events__name">{{ label(event) }}</span>
            <span v-if="sublabel(event)" class="events__detail">{{ sublabel(event) }}</span>
          </div>
        </template>
      </div>

      <div class="events__minute">
        <span class="events__icon" :class="`events__icon--${event.type}`" :data-card="event.card ?? null">{{ ICONS[event.type] ?? '·' }}</span>
        <span class="events__time">{{ event.minute }}'</span>
      </div>

      <div class="events__side">
        <template v-if="event.side === 'away'">
          <div v-if="event.type === 'substitution'" class="events__sub">
            <span class="events__in">{{ event.playerIn }}</span>
            <span class="events__out">{{ event.playerOut }}</span>
          </div>
          <div v-else>
            <span class="events__name">{{ label(event) }}</span>
            <span v-if="sublabel(event)" class="events__detail">{{ sublabel(event) }}</span>
          </div>
        </template>
      </div>
    </li>
  </ol>
  <p v-else class="cm-text-muted">Le déroulé de cette rencontre n'est pas publié.</p>
</template>

<style scoped>
.events {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.events__row {
  display: grid;
  grid-template-columns: 1fr 72px 1fr;
  align-items: center;
  gap: 10px;
  padding: 7px 0;
  border-bottom: 1px solid var(--cm-border-soft);
  font-size: 12.5px;
}

.events__row:last-child {
  border-bottom: 0;
}

.events__side--home {
  text-align: right;
}

.events__name {
  display: block;
  font-weight: 600;
}

.events__detail {
  display: block;
  font-size: 11px;
  color: var(--cm-text-muted);
}

.events__sub {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.events__in {
  color: var(--cm-accent);
}

.events__out {
  color: var(--cm-danger);
  font-size: 11.5px;
}

.events__minute {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.events__icon {
  font-size: 12px;
}

.events__icon--card {
  color: var(--cm-warning);
}

.events__icon--card[data-card='red'] {
  color: var(--cm-danger);
}

.events__icon--substitution {
  color: var(--cm-text-muted);
}

.events__time {
  font-family: var(--cm-font-mono);
  font-size: 11px;
  color: var(--cm-text-muted);
  min-width: 26px;
}
</style>
