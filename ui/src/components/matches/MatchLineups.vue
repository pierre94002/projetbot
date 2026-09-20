<script setup>
import { computed } from 'vue';

/**
 * Compositions : formation, entraîneur, note d'équipe, titulaires avec leur
 * note et leur minute de sortie, puis les remplaçants entrés en jeu.
 *
 * Le placement sur le terrain (`x`, `y`) est stocké mais n'est pas dessiné :
 * une liste ordonnée par ligne reste lisible sur un écran étroit, là où un
 * terrain miniature ne l'est pas.
 */
const props = defineProps({ entry: { type: Object, required: true } });

function group(side) {
  const players = props.entry.players?.[side] ?? [];
  const starters = players.filter((p) => p.starter).sort((a, b) => (a.y ?? 1) - (b.y ?? 1) || (a.x ?? 0) - (b.x ?? 0));
  const used = players.filter((p) => !p.starter && (p.subbedIn || p.minutes));
  const unused = players.filter((p) => !p.starter && !p.subbedIn && !p.minutes);
  return { starters, used, unused, info: props.entry.lineups?.[side] ?? null };
}

const home = computed(() => group('home'));
const away = computed(() => group('away'));

function rating(player) {
  return player.rating != null ? Number(player.rating).toFixed(1).replace('.', ',') : null;
}
</script>

<template>
  <div class="lineups">
    <section v-for="(team, i) in [home, away]" :key="i" class="lineups__team">
      <header class="lineups__head">
        <span class="lineups__name">{{ i === 0 ? entry.homeName : entry.awayName }}</span>
        <span v-if="team.info?.formation" class="lineups__formation">{{ team.info.formation }}</span>
        <span v-if="team.info?.rating != null" class="lineups__rating">{{ Number(team.info.rating).toFixed(1).replace('.', ',') }}</span>
      </header>
      <p v-if="team.info?.coach" class="cm-text-muted lineups__coach">Entraîneur : {{ team.info.coach }}</p>

      <ul class="lineups__list">
        <li v-for="p in team.starters" :key="p.playerId ?? p.name" class="lineups__player">
          <span class="lineups__num">{{ p.number ?? '' }}</span>
          <span class="cm-truncate">{{ p.name }}</span>
          <span v-if="p.subOutMinute" class="lineups__sub lineups__sub--out">↓ {{ p.subOutMinute }}'</span>
          <span v-if="rating(p)" class="lineups__note">{{ rating(p) }}</span>
        </li>
      </ul>

      <template v-if="team.used.length">
        <p class="lineups__section cm-text-muted">Entrés en jeu</p>
        <ul class="lineups__list">
          <li v-for="p in team.used" :key="p.playerId ?? p.name" class="lineups__player">
            <span class="lineups__num">{{ p.number ?? '' }}</span>
            <span class="cm-truncate">{{ p.name }}</span>
            <span v-if="p.subInMinute" class="lineups__sub lineups__sub--in">↑ {{ p.subInMinute }}'</span>
            <span v-if="rating(p)" class="lineups__note">{{ rating(p) }}</span>
          </li>
        </ul>
      </template>

      <p v-if="team.unused.length" class="lineups__bench cm-text-muted">
        Remplaçants non entrés : {{ team.unused.map((p) => p.name).join(', ') }}
      </p>
    </section>
  </div>
</template>

<style scoped>
.lineups {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.lineups__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
}

.lineups__name {
  font-weight: 600;
  font-size: 13px;
}

.lineups__formation {
  font-family: var(--cm-font-mono);
  font-size: 11px;
  color: var(--cm-text-muted);
}

.lineups__rating {
  margin-left: auto;
  font-family: var(--cm-font-mono);
  font-size: 11.5px;
  font-weight: 700;
  color: var(--cm-accent);
}

.lineups__coach {
  font-size: 11px;
  margin: 0 0 8px;
}

.lineups__section {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  margin: 10px 0 4px;
}

.lineups__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.lineups__player {
  display: grid;
  grid-template-columns: 22px 1fr auto auto;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  padding: 3px 0;
}

.lineups__num {
  font-family: var(--cm-font-mono);
  font-size: 10.5px;
  color: var(--cm-text-muted);
  text-align: right;
}

.lineups__sub {
  font-size: 10px;
  font-family: var(--cm-font-mono);
}

.lineups__sub--out {
  color: var(--cm-danger);
}

.lineups__sub--in {
  color: var(--cm-accent);
}

.lineups__note {
  font-family: var(--cm-font-mono);
  font-size: 11px;
  font-weight: 600;
  min-width: 26px;
  text-align: right;
}

.lineups__bench {
  font-size: 10.5px;
  margin: 10px 0 0;
  line-height: 1.5;
}

@media (max-width: 720px) {
  .lineups {
    grid-template-columns: 1fr;
  }
}
</style>
