<script setup>
// Un seul bloc "composition d'équipe" (formation, titulaires, remplaçants) —
// utilisé aussi bien empilé dans un panneau étroit (TeamStatsModal) qu'en
// grille 2 colonnes dans une page pleine largeur (TeamSquadView) : c'est
// au parent de choisir la disposition, ce composant ne rend qu'UNE équipe.
//
// Refonte visuelle du 01/10/2026 (cf. ui/DESIGN.md) : le club en tête avec
// son logo en grand, la formation en pastille couleur de section, puis deux
// groupes (titulaires, remplaçants) en lignes « numéro · joueur · poste ».
import TeamCrest from './TeamCrest.vue';
import PlayerFlag from './PlayerFlag.vue';
import AppIcon from '@/components/common/AppIcon.vue';

defineProps({
  team: { type: Object, required: true }
});
</script>

<template>
  <article class="team-lineup">
    <!-- Le club : logo, nom, formation et entraîneur. -->
    <header class="team-lineup__head">
      <TeamCrest :name="team.teamName" :team-id="team.teamId ?? null" :size="36" class="team-lineup__crest" />
      <div class="team-lineup__titles">
        <p class="team-lineup__name">{{ team.teamName }}</p>
        <p class="cm-text-muted team-lineup__meta">
          <span class="cm-pill is-section team-lineup__formation" title="Formation">{{ team.formation ?? '—' }}</span>
          <span v-if="team.coach" class="team-lineup__coach" title="Entraîneur"><AppIcon name="whistle" :size="12" />{{ team.coach }}</span>
        </p>
      </div>
    </header>

    <!-- Les titulaires : numéro en pastille couleur de section. -->
    <section class="team-lineup__group is-starters">
      <p class="cm-group-title team-lineup__subhead">
        Titulaires
        <span class="team-lineup__count">{{ team.startXI?.length ?? 0 }}</span>
      </p>
      <ul class="team-lineup__player-list">
        <li v-for="(p, index) in team.startXI" :key="p.id ?? `xi-${index}-${p.name}`" class="team-lineup__player">
          <span class="cm-numeric team-lineup__player-number">{{ p.number ?? '—' }}</span>
          <span class="team-lineup__player-ident">
            <TeamCrest :name="team.teamName" :team-id="team.teamId ?? null" :size="14" class="team-lineup__flag" />
            <PlayerFlag :player-id="p.id ?? null" :size="13" class="team-lineup__flag" />
            <span class="cm-truncate">{{ p.name }}</span>
          </span>
          <span class="cm-text-muted team-lineup__position">{{ p.position }}</span>
        </li>
      </ul>
    </section>

    <!-- Les remplaçants : même dessin, numéro en gris. -->
    <section class="team-lineup__group">
      <p class="cm-group-title team-lineup__subhead">
        Remplaçants
        <span class="team-lineup__count">{{ team.substitutes?.length ?? 0 }}</span>
      </p>
      <ul class="team-lineup__player-list">
        <li v-for="(p, index) in team.substitutes" :key="p.id ?? `sub-${index}-${p.name}`" class="team-lineup__player">
          <span class="cm-numeric team-lineup__player-number">{{ p.number ?? '—' }}</span>
          <span class="team-lineup__player-ident">
            <TeamCrest :name="team.teamName" :team-id="team.teamId ?? null" :size="14" class="team-lineup__flag" />
            <PlayerFlag :player-id="p.id ?? null" :size="13" class="team-lineup__flag" />
            <span class="cm-truncate">{{ p.name }}</span>
          </span>
          <span class="cm-text-muted team-lineup__position">{{ p.position }}</span>
        </li>
      </ul>
    </section>
  </article>
</template>

<style scoped>
.team-lineup {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  padding: 16px;
  border-radius: var(--cm-radius-md);
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
}

/* ------------------------------------------------------------- le club */
.team-lineup__head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.team-lineup__crest {
  box-shadow: 0 0 0 3px rgba(var(--cm-section-rgb) / 0.18);
}

.team-lineup__titles {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.team-lineup__name {
  font-size: 14.5px;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: var(--cm-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.team-lineup__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 10px;
  font-size: 11.5px;
}

.team-lineup__formation {
  min-width: 0;
  padding: 2px 9px;
  font-size: 11px;
}

.team-lineup__coach {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

/* ---------------------------------------------------------- les groupes */
.team-lineup__group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.team-lineup__count {
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--cm-surface-hover);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0;
  color: var(--cm-text-secondary);
}

.team-lineup__player-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.team-lineup__player {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  gap: 9px;
  align-items: center;
  padding: 4px 6px;
  border-radius: var(--cm-radius-xs);
  font-size: 12.5px;
  transition: background var(--cm-transition);
}

.team-lineup__player:hover {
  background: var(--cm-surface-hover);
}

.team-lineup__player-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 22px;
  border-radius: 6px;
  background: var(--cm-surface-hover);
  font-size: 11px;
  font-weight: 700;
  color: var(--cm-text-secondary);
}

/* Les titulaires portent la couleur de section, les remplaçants restent gris. */
.team-lineup__group.is-starters .team-lineup__player-number {
  background: var(--cm-section-soft);
  color: var(--cm-section);
}

.team-lineup__player-ident {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-weight: 500;
  color: var(--cm-text-primary);
}

.team-lineup__flag {
  flex-shrink: 0;
}

.team-lineup__position {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  white-space: nowrap;
}
</style>
