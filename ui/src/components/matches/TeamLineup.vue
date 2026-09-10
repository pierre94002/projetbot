<script setup>
// Un seul bloc "composition d'équipe" (formation, titulaires, remplaçants) —
// utilisé aussi bien empilé dans un panneau étroit (TeamStatsModal) qu'en
// grille 2 colonnes dans une page pleine largeur (TeamSquadView) : c'est
// au parent de choisir la disposition, ce composant ne rend qu'UNE équipe.
defineProps({
  team: { type: Object, required: true }
});
</script>

<template>
  <div class="team-lineup">
    <p class="team-lineup__name">{{ team.teamName }}</p>
    <p class="cm-text-muted team-lineup__meta">
      {{ team.formation ?? '—' }} <span v-if="team.coach">· {{ team.coach }}</span>
    </p>

    <p class="team-lineup__subhead cm-text-muted">Titulaires</p>
    <ul class="team-lineup__player-list">
      <li v-for="p in team.startXI" :key="p.id" class="team-lineup__player">
        <span class="cm-numeric team-lineup__player-number">{{ p.number ?? '—' }}</span>
        <span class="cm-truncate">{{ p.name }}</span>
        <span class="cm-text-muted">{{ p.position }}</span>
      </li>
    </ul>

    <p class="team-lineup__subhead cm-text-muted">Remplaçants</p>
    <ul class="team-lineup__player-list">
      <li v-for="p in team.substitutes" :key="p.id" class="team-lineup__player">
        <span class="cm-numeric team-lineup__player-number">{{ p.number ?? '—' }}</span>
        <span class="cm-truncate">{{ p.name }}</span>
        <span class="cm-text-muted">{{ p.position }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.team-lineup__name {
  font-size: 13.5px;
  font-weight: 700;
}

.team-lineup__meta {
  font-size: 11.5px;
  margin-top: 2px;
  margin-bottom: 12px;
}

.team-lineup__subhead {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin: 10px 0 4px;
}

.team-lineup__player-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.team-lineup__player {
  display: grid;
  grid-template-columns: 20px 1fr auto;
  gap: 8px;
  align-items: center;
  padding: 3px 0;
  font-size: 12.5px;
}

.team-lineup__player-number {
  color: var(--cm-text-muted);
  font-size: 11px;
}
</style>
