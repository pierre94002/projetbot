<script setup>
import TeamCrest from './TeamCrest.vue';

/**
 * Les deux camps en tête d'un comparatif (barres de statistiques, corners et
 * tirs attendus) : chaque club au-dessus de SA colonne — l'équipe qui reçoit
 * au bord gauche, l'autre au bord droit — avec son logo, dans le dessin des
 * cartes de rencontre (01/10/2026, « la même esthétique que le reste »).
 * Un camp qui n'est pas un club (`awayIsTeam: false`, « ses adversaires »)
 * n'a pas de logo. Le point de couleur sous chaque nom est la légende des
 * barres qui suivent (MatchStatBars : vert à gauche, ambre à droite).
 */
defineProps({
  home: { type: String, required: true },
  away: { type: String, required: true },
  league: { type: String, default: null },
  homeId: { type: String, default: null },
  awayId: { type: String, default: null },
  homeNote: { type: String, default: null },
  awayNote: { type: String, default: null },
  label: { type: String, default: null },
  awayIsTeam: { type: Boolean, default: true },
  size: { type: Number, default: 26 }
});
</script>

<template>
  <div class="matchup">
    <span class="matchup__side">
      <span class="matchup__crest"><TeamCrest :name="home" :league="league" :team-id="homeId" :size="size" /></span>
      <span class="matchup__names">
        <span class="matchup__name">{{ home }}</span>
        <span class="matchup__meta">
          <i class="matchup__key is-home" aria-hidden="true" />
          <span v-if="homeNote" class="matchup__note">{{ homeNote }}</span>
        </span>
      </span>
    </span>
    <span class="matchup__label" :class="{ 'is-empty': !label }">{{ label ?? '' }}</span>
    <span class="matchup__side is-away">
      <span class="matchup__names">
        <span class="matchup__name" :class="{ 'is-generic': !awayIsTeam }">{{ away }}</span>
        <span class="matchup__meta">
          <span v-if="awayNote" class="matchup__note">{{ awayNote }}</span>
          <i class="matchup__key is-away" aria-hidden="true" />
        </span>
      </span>
      <span v-if="awayIsTeam" class="matchup__crest"><TeamCrest :name="away" :league="league" :team-id="awayId" :size="size" /></span>
    </span>
  </div>
</template>

<style scoped>
.matchup {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
  padding: 10px 14px;
  border-radius: var(--cm-radius-md);
  border: 1px solid var(--cm-border-soft);
  background: linear-gradient(180deg, rgb(var(--cm-glass-tint) / 0.025), rgb(var(--cm-glass-tint) / 0)), var(--cm-surface-alt);
}

.matchup__side {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.matchup__side.is-away {
  justify-content: flex-end;
}

/* Un fin anneau autour du logo : il se détache du fond sombre. */
.matchup__crest {
  display: inline-flex;
  flex-shrink: 0;
  border-radius: 50%;
  box-shadow: 0 0 0 2px var(--cm-surface-alt), 0 0 0 3px var(--cm-border);
}

.matchup__names {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.matchup__side.is-away .matchup__names {
  align-items: flex-end;
  text-align: right;
}

.matchup__name {
  max-width: 100%;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: var(--cm-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.matchup__name.is-generic {
  color: var(--cm-text-secondary);
  font-weight: 600;
}

.matchup__meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

/* La légende des barres : vert pour le camp de gauche, ambre pour celui de droite. */
.matchup__key {
  display: inline-block;
  flex-shrink: 0;
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.matchup__key.is-home {
  background: var(--cm-accent);
  box-shadow: 0 0 0 3px var(--cm-accent-soft);
}

.matchup__key.is-away {
  background: var(--cm-warning);
  box-shadow: 0 0 0 3px var(--cm-warning-soft);
}

.matchup__note {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.matchup__label {
  padding: 4px 11px;
  border-radius: 999px;
  background: var(--cm-section-soft);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--cm-section);
  white-space: nowrap;
}

.matchup__label.is-empty {
  padding: 0;
  background: none;
}
</style>
