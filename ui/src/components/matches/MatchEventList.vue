<script setup>
import { computed } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import PlayerFlag from '@/components/matches/PlayerFlag.vue';
import TeamCrest from '@/components/matches/TeamCrest.vue';

/**
 * Déroulé du match : buts, cartons et remplacements sur une colonne centrale
 * de minutes, chaque camp de son côté — la forme de FotMob. Le drapeau de
 * chaque joueur (01/10/2026), d'après la feuille du match (`players`) : les
 * évènements ne portent que des noms, et pas toujours écrits pareil (le fil
 * dit « Pascal Groß », « Jurriën Timber », la feuille « Pascal Gross »,
 * « Jurrien Timber ») — rapprochés sans accents, dans le camp de l'évènement.
 *
 * Refonte du 01/10/2026 : un fil vertical au centre, la minute en pastille
 * et l'icône de l'évènement (ballon, carré de la couleur du carton, flèches
 * d'un remplacement) dans un carré teinté ; chaque évènement est une carte
 * posée du côté de son camp.
 */
const props = defineProps({
  events: { type: Array, default: () => [] },
  homeName: { type: String, default: '' },
  awayName: { type: String, default: '' },
  players: { type: Object, default: null }, // { home: [{ playerId, name }], away: [...] }
  // Le logo du club sur chaque ligne (01/10/2026, « des logos à chaque ligne où il y a un joueur »).
  league: { type: String, default: null },
  homeId: { type: String, default: null },
  awayId: { type: String, default: null }
});

const simplifier = (nom) =>
  String(nom ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[ıİ]/g, 'i')
    .replace(/[øØ]/g, 'o')
    .replace(/[łŁ]/g, 'l')
    .replace(/[đĐ]/g, 'd')
    .replace(/[æÆ]/g, 'ae')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const identifiants = computed(() => {
  const parCote = {};
  for (const cote of ['home', 'away']) {
    const joueurs = (props.players?.[cote] ?? []).filter((p) => p.playerId).map((p) => ({ id: p.playerId, nom: simplifier(p.name) }));
    parCote[cote] = { exacts: new Map(joueurs.map((j) => [j.nom, j.id])), joueurs };
  }
  return parCote;
});

/** Identifiant du joueur nommé dans l'évènement : même nom, sinon même nom de famille s'il est seul à le porter dans son camp. */
function idDe(cote, nom) {
  const camp = identifiants.value[cote];
  const cle = simplifier(nom);
  if (!camp || !cle) return null;
  if (camp.exacts.has(cle)) return camp.exacts.get(cle);
  const famille = cle.split(' ').at(-1);
  const memes = camp.joueurs.filter((j) => j.nom.split(' ').at(-1) === famille);
  return memes.length === 1 ? memes[0].id : null;
}

// Repli textuel pour un type d'évènement que le dessin ne connaît pas.
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
  <ol v-if="events.length" class="events cm-stagger">
    <li v-for="(event, index) in events" :key="index" class="events__row">
      <!-- Le camp qui reçoit, à gauche du fil. -->
      <div class="events__side events__side--home">
        <template v-if="event.side === 'home'">
          <div v-if="event.type === 'substitution'" class="events__entry events__sub">
            <span class="events__in">
              <span class="events__who">{{ event.playerIn }} <PlayerFlag :player-id="idDe('home', event.playerIn)" :size="12" /> <TeamCrest :name="homeName" :league="league" :team-id="homeId" :size="14" /></span>
              <AppIcon name="plus" :size="11" class="events__sub-mark" />
            </span>
            <span class="events__out">
              <span class="events__who">{{ event.playerOut }} <PlayerFlag :player-id="idDe('home', event.playerOut)" :size="12" /> <TeamCrest :name="homeName" :league="league" :team-id="homeId" :size="14" /></span>
              <AppIcon name="minus" :size="11" class="events__sub-mark" />
            </span>
          </div>
          <div v-else class="events__entry" :class="`is-${event.type}`">
            <span class="events__name">{{ label(event) }} <PlayerFlag :player-id="idDe('home', event.player)" :size="13" /> <TeamCrest :name="homeName" :league="league" :team-id="homeId" :size="16" /></span>
            <span v-if="sublabel(event)" class="events__detail">{{ sublabel(event) }}</span>
          </div>
        </template>
      </div>

      <!-- Le fil : l'icône de l'évènement dans un carré teinté, la minute en pastille. -->
      <div class="events__minute">
        <span class="events__icon cm-icon-box is-sm" :class="`events__icon--${event.type}`" :data-card="event.card ?? null">
          <AppIcon v-if="event.type === 'goal'" name="ball" :size="15" />
          <i v-else-if="event.type === 'card'" class="events__card-shape" aria-hidden="true" />
          <AppIcon v-else-if="event.type === 'substitution'" name="swap" :size="14" />
          <template v-else>{{ ICONS[event.type] ?? '·' }}</template>
        </span>
        <span class="events__time cm-pill cm-numeric">{{ event.minute }}'</span>
      </div>

      <!-- Le camp qui se déplace, à droite du fil. -->
      <div class="events__side events__side--away">
        <template v-if="event.side === 'away'">
          <div v-if="event.type === 'substitution'" class="events__entry events__sub">
            <span class="events__in">
              <AppIcon name="plus" :size="11" class="events__sub-mark" />
              <span class="events__who"><TeamCrest :name="awayName" :league="league" :team-id="awayId" :size="14" /> <PlayerFlag :player-id="idDe('away', event.playerIn)" :size="12" /> {{ event.playerIn }}</span>
            </span>
            <span class="events__out">
              <AppIcon name="minus" :size="11" class="events__sub-mark" />
              <span class="events__who"><TeamCrest :name="awayName" :league="league" :team-id="awayId" :size="14" /> <PlayerFlag :player-id="idDe('away', event.playerOut)" :size="12" /> {{ event.playerOut }}</span>
            </span>
          </div>
          <div v-else class="events__entry" :class="`is-${event.type}`">
            <span class="events__name"><TeamCrest :name="awayName" :league="league" :team-id="awayId" :size="16" /> <PlayerFlag :player-id="idDe('away', event.player)" :size="13" /> {{ label(event) }}</span>
            <span v-if="sublabel(event)" class="events__detail">{{ sublabel(event) }}</span>
          </div>
        </template>
      </div>
    </li>
  </ol>
  <EmptyState v-else icon="clock" title="Pas de fil du match" description="Le déroulé de cette rencontre n'est pas publié." />
</template>

<style scoped>
.events {
  /* Se règle sur SA largeur : page entière comme panneau étroit. */
  container: events / inline-size;
  --events-minute: 64px;
  position: relative;
  list-style: none;
  margin: 0;
  padding: 4px 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* Le fil vertical, derrière la colonne des minutes. */
.events::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 1px;
  background: var(--cm-border);
  pointer-events: none;
}

.events__row {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--events-minute) minmax(0, 1fr);
  align-items: center;
  gap: 12px;
}

.events__side {
  display: flex;
  min-width: 0;
}

.events__side--home {
  justify-content: flex-end;
  text-align: right;
}

.events__side--away {
  justify-content: flex-start;
}

/* ------------------------------------------------------------ carte */
.events__entry {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-width: 100%;
  min-width: 0;
  padding: 8px 12px;
  border-radius: var(--cm-radius);
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
  font-size: 12.5px;
  transition: border-color var(--cm-transition), background var(--cm-transition);
}

.events__entry:hover {
  border-color: var(--cm-border);
  background: var(--cm-surface-hover);
}

/* Un but : un liseré couleur de section du côté du fil. */
.events__entry.is-goal {
  border-color: rgba(var(--cm-section-rgb) / 0.35);
  background: linear-gradient(180deg, rgba(var(--cm-section-rgb) / 0.08), transparent), var(--cm-surface-alt);
}

.events__name {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px 5px;
  min-width: 0;
  font-weight: 700;
  color: var(--cm-text-primary);
}

.events__side--home .events__name {
  justify-content: flex-end;
}

.events__detail {
  display: block;
  font-size: 11px;
  color: var(--cm-text-muted);
}

/* Un remplacement : l'entrant en vert, le sortant en rouge, plus petit. */
.events__sub {
  gap: 3px;
}

.events__in,
.events__out {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.events__side--home .events__in,
.events__side--home .events__out {
  justify-content: flex-end;
}

.events__who {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px 5px;
  min-width: 0;
}

.events__in {
  font-weight: 700;
  color: var(--cm-accent);
}

.events__out {
  font-size: 11.5px;
  color: var(--cm-danger);
}

.events__sub-mark {
  flex-shrink: 0;
}

/* ------------------------------------------------------------- fil */
.events__minute {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

/* L'icône dans un carré teinté, posé sur le fil (fond opaque pour le couper). */
.events__icon {
  font-size: 12px;
  box-shadow: 0 0 0 3px var(--cm-surface);
}

.events__icon--goal {
  background: var(--cm-section);
  color: var(--cm-section-on);
  box-shadow: 0 0 0 3px var(--cm-surface), var(--cm-shadow-section);
}

.events__icon--card {
  background: var(--cm-warning-soft);
  color: var(--cm-warning);
}

.events__icon--card[data-card='red'] {
  background: var(--cm-danger-soft);
  color: var(--cm-danger);
}

.events__icon--substitution {
  background: var(--cm-surface-hover);
  color: var(--cm-text-secondary);
}

/* Le carton : un petit rectangle de la couleur du carton. */
.events__card-shape {
  display: block;
  width: 10px;
  height: 14px;
  border-radius: 2px;
  background: currentColor;
}

.events__time {
  min-width: 42px;
  padding: 2px 8px;
  font-size: 11px;
  color: var(--cm-text-secondary);
  box-shadow: 0 0 0 3px var(--cm-surface);
}

/* Panneau étroit : le fil passe à gauche, chaque évènement s'aligne à gauche
   (le logo dit le camp), l'icône et la minute côte à côte. */
@container events (max-width: 560px) {
  .events {
    --events-minute: 76px;
  }

  .events::before {
    left: calc(var(--events-minute) / 2);
  }

  .events__row {
    grid-template-columns: var(--events-minute) minmax(0, 1fr);
    gap: 10px;
  }

  .events__minute {
    grid-column: 1;
    grid-row: 1;
    flex-direction: row;
    gap: 5px;
  }

  .events__side {
    grid-column: 2;
    grid-row: 1;
  }

  .events__side--home {
    justify-content: flex-start;
    text-align: left;
  }

  .events__side--home .events__name,
  .events__side--home .events__in,
  .events__side--home .events__out {
    justify-content: flex-start;
  }

  .events__time {
    min-width: 36px;
    padding: 2px 6px;
  }
}
</style>
