<script setup>
import { computed } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import LineupPitch from './LineupPitch.vue';
import TeamCrest from './TeamCrest.vue';
import PlayerFlag from './PlayerFlag.vue';
import { aUneFiche, classeNote } from '@/utils/playerVisuals.js';

/**
 * Compositions d'un match joué : les deux onzes sur le terrain, chacun selon
 * sa formation, avec la note du match de chaque titulaire (cf.
 * LineupPitch.vue — demande de Pierre le 01/10/2026 : « affiche-moi les
 * compos comme ça », capture FotMob à l'appui), puis les remplaçants entrés
 * en jeu et ceux restés sur le banc. Chaque joueur ouvre sa fiche.
 *
 * Refonte du 01/10/2026 : sous le terrain, un banc par équipe en carte (logo
 * et nom du club en tête, les entrants en lignes avec leur minute d'entrée
 * et leur note en pastille, les remplaçants non entrés en pied de carte).
 */
const props = defineProps({ entry: { type: Object, required: true } });

function group(side) {
  const players = props.entry.players?.[side] ?? [];
  const info = props.entry.lineups?.[side] ?? null;
  const starters = players.filter((p) => p.starter);
  return {
    name: side === 'home' ? props.entry.homeName : props.entry.awayName,
    teamId: (side === 'home' ? props.entry.homeId : props.entry.awayId) ?? null,
    pitch: {
      name: side === 'home' ? props.entry.homeName : props.entry.awayName,
      teamId: side === 'home' ? props.entry.homeId : props.entry.awayId,
      formation: info?.formation ?? null,
      rating: info?.rating ?? null,
      coach: info?.coach ?? null,
      starters: starters.map((p) => ({
        id: p.playerId,
        name: p.name,
        number: p.number,
        position: p.position,
        x: p.x,
        y: p.y,
        rating: p.rating
      }))
    },
    used: players.filter((p) => !p.starter && (p.subbedIn || p.minutes)).sort((a, b) => (a.subInMinute ?? 999) - (b.subInMinute ?? 999)),
    unused: players.filter((p) => !p.starter && !p.subbedIn && !p.minutes)
  };
}

const home = computed(() => group('home'));
const away = computed(() => group('away'));

function rating(player) {
  return player.rating != null ? Number(player.rating).toFixed(1).replace('.', ',') : null;
}
</script>

<template>
  <div class="lineups">
    <LineupPitch :home="home.pitch" :away="away.pitch" />

    <!-- Les bancs : une carte par équipe, côte à côte quand la place existe. -->
    <div class="lineups__benches cm-stagger">
      <section v-for="(team, i) in [home, away]" :key="i" class="lineups__team cm-block">
        <header class="lineups__head">
          <p class="lineups__name">
            <TeamCrest :name="team.name" :league="entry.league" :team-id="team.teamId" :size="20" class="lineups__crest" />{{ team.name }}
          </p>
          <span class="cm-chip is-section"><AppIcon name="users" :size="11" />Banc</span>
        </header>

        <template v-if="team.used.length">
          <p class="lineups__section cm-group-title">Entrés en jeu</p>
          <ul class="lineups__list">
            <li v-for="p in team.used" :key="p.playerId ?? p.name" class="lineups__player">
              <span class="lineups__num cm-numeric">{{ p.number ?? '' }}</span>
              <span class="lineups__who">
                <TeamCrest :name="team.name" :league="entry.league" :team-id="team.teamId" :size="14" />
                <PlayerFlag :player-id="p.playerId ?? null" :size="13" />
                <RouterLink v-if="aUneFiche(p.playerId)" :to="`/joueur/${p.playerId}`" class="cm-truncate lineups__link">{{ p.name }}</RouterLink>
                <span v-else class="cm-truncate">{{ p.name }}</span>
              </span>
              <span v-if="p.subInMinute" class="lineups__sub lineups__sub--in cm-numeric" title="Minute d'entrée en jeu">↑ {{ p.subInMinute }}'</span>
              <span v-if="rating(p)" class="lineups__note cm-pill" :class="classeNote(p.rating)" title="Note du match">{{ rating(p) }}</span>
            </li>
          </ul>
        </template>

        <p v-if="team.unused.length" class="lineups__bench cm-text-muted">
          <TeamCrest :name="team.name" :league="entry.league" :team-id="team.teamId" :size="14" class="lineups__flag" />Remplaçants non entrés :
          <template v-for="(p, i) in team.unused" :key="p.playerId ?? p.name"
            ><PlayerFlag :player-id="p.playerId ?? null" :size="12" class="lineups__flag" /><RouterLink
              v-if="aUneFiche(p.playerId)"
              :to="`/joueur/${p.playerId}`"
              class="lineups__link"
              >{{ p.name }}</RouterLink
            ><template v-else>{{ p.name }}</template><template v-if="i < team.unused.length - 1">, </template></template
          >
        </p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.lineups {
  /* Se règle sur SA largeur : les deux bancs côte à côte seulement si la place existe. */
  container: lineups / inline-size;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.lineups__benches {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

/* ------------------------------------------------------------ carte */
.lineups__team {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.lineups__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 2px;
}

.lineups__name {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  margin: 0;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: var(--cm-text-primary);
}

.lineups__crest {
  margin-right: 8px;
}

.lineups__section {
  margin-top: 4px;
}

/* ------------------------------------------------------------ lignes */
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
  grid-template-columns: 24px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border-radius: var(--cm-radius-sm);
  font-size: 12.5px;
  transition: background var(--cm-transition);
}

.lineups__player:hover {
  background: var(--cm-surface-hover);
}

.lineups__num {
  font-size: 11px;
  font-weight: 700;
  color: var(--cm-text-muted);
  text-align: right;
}

.lineups__who {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-weight: 600;
  color: var(--cm-text-primary);
}

.lineups__link {
  color: inherit;
  text-decoration: none;
}

.lineups__link:hover {
  color: var(--cm-section);
  text-decoration: underline;
}

/* La minute d'entrée : en vert, comme l'entrant du fil du match. */
.lineups__sub {
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.lineups__sub--in {
  color: var(--cm-accent);
}

/* La note du match en pastille, colorée comme sur le terrain : bleu au
   sommet, vert quand c'est bon, ambre moyen, rouge faible. */
.lineups__note {
  min-width: 38px;
  padding: 2px 8px;
  font-size: 11.5px;
  color: var(--cm-text-primary);
}

.lineups__note.is-top {
  background: var(--cm-info-soft);
  color: var(--cm-info);
}

.lineups__note.is-great,
.lineups__note.is-good {
  background: var(--cm-accent-soft);
  color: var(--cm-accent);
}

.lineups__note.is-mid {
  background: var(--cm-warning-soft);
  color: var(--cm-warning);
}

.lineups__note.is-low {
  background: var(--cm-danger-soft);
  color: var(--cm-danger);
}

/* Les remplaçants non entrés : en pied de carte, sous un filet. */
.lineups__bench {
  margin: 6px 0 0;
  padding-top: 10px;
  border-top: 1px solid var(--cm-border-soft);
  font-size: 11.5px;
  line-height: 1.6;
}

.lineups__flag {
  margin-right: 4px;
}

/* Assez de place : les deux bancs côte à côte. */
@container lineups (min-width: 720px) {
  .lineups__benches {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }
}
</style>
