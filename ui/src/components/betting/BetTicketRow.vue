<script setup>
import { useTeamStatsModalStore } from '@/stores/teamStatsModalStore.js';
import { formatOdds, formatCurrency, formatDateTime } from '@/utils/format.js';
import { legStatus } from '@/utils/betTrends.js';
import AppIcon from '@/components/common/AppIcon.vue';
import TeamCrest from '@/components/matches/TeamCrest.vue';
import PickCrest from '@/components/matches/PickCrest.vue';

/**
 * Un ticket réglé (gagné ou perdu) de la page Mes tickets. Redessiné le
 * 01/10/2026 dans le vocabulaire commun (cf. ui/DESIGN.md) : une carte au
 * liseré gauche vert ou rouge, la rencontre avec ses logos, le marché et le
 * pronostic, puis la cote, la mise et le retour en chiffres étiquetés ; un
 * combiné déroule ses sélections en sous-cartes, chacune avec son statut.
 * Toutes les données d'avant sont là, seul le dessin change.
 */
defineProps({
  bet: { type: Object, required: true }
});

const teamStatsModalStore = useTeamStatsModalStore();
const LEG_STATUS_LABELS = { pending: 'En attente', won: 'Gagné', lost: 'Perdu', void: 'Annulé' };
</script>

<template>
  <article class="ticket" :class="`is-${bet.status}`">
    <div class="ticket__head">
      <div class="ticket__main">
        <template v-if="bet.legs.length === 1">
          <p class="ticket__match">
            <TeamCrest :name="bet.legs[0].homeName" :league="bet.legs[0].league" :size="18" />
            <button type="button" class="cm-team-link ticket__team" @click.stop="teamStatsModalStore.openFor(bet.legs[0].homeName, bet.legs[0].league, bet.legs[0].matchId)">{{ bet.legs[0].homeName }}</button>
            <span class="ticket__vs">vs</span>
            <button type="button" class="cm-team-link ticket__team" @click.stop="teamStatsModalStore.openFor(bet.legs[0].awayName, bet.legs[0].league, bet.legs[0].matchId)">{{ bet.legs[0].awayName }}</button>
            <TeamCrest :name="bet.legs[0].awayName" :league="bet.legs[0].league" :size="18" />
          </p>
          <p class="ticket__market cm-truncate">
            {{ bet.legs[0].market }} <span v-if="bet.legs[0].league">· {{ bet.legs[0].league }}</span>
          </p>
          <p class="ticket__pick cm-truncate"><PickCrest :item="bet.legs[0]" :home="bet.legs[0].homeName" :away="bet.legs[0].awayName" :league="bet.legs[0].league" :size="16" />{{ bet.legs[0].pick }}</p>
        </template>
        <template v-else>
          <p class="ticket__market">Combiné</p>
          <p class="ticket__pick cm-truncate">Combiné — {{ bet.legs.length }} sélections</p>
        </template>
        <p class="ticket__date"><AppIcon name="clock" :size="11" />Réglé le {{ formatDateTime(bet.settledAt) }}</p>
      </div>

      <dl class="ticket__figures">
        <div class="ticket__figure">
          <dt>Cote</dt>
          <dd><span class="cm-pill">@ {{ formatOdds(bet.odds) }}</span></dd>
        </div>
        <div class="ticket__figure">
          <dt>Mise</dt>
          <dd class="cm-numeric">{{ formatCurrency(bet.stake) }}</dd>
        </div>
        <div class="ticket__figure">
          <dt>Retour</dt>
          <dd class="cm-numeric ticket__return" :class="bet.status === 'won' ? 'cm-positive' : 'cm-negative'">
            {{ formatCurrency(bet.status === 'won' ? bet.stake * bet.odds : 0) }}
          </dd>
        </div>
      </dl>

      <span class="ticket__status" :class="`is-${bet.status}`">{{ bet.status === 'won' ? 'Gagné' : 'Perdu' }}</span>
    </div>

    <!-- Un combiné : ses sélections, chacune avec son propre statut. -->
    <div v-if="bet.legs.length > 1" class="ticket__legs">
      <div v-for="(leg, i) in bet.legs" :key="i" class="ticket-leg" :class="`is-${legStatus(bet, i)}`">
        <div class="ticket-leg__main">
          <p class="ticket__match is-leg">
            <TeamCrest :name="leg.homeName" :league="leg.league" :size="16" />
            <button type="button" class="cm-team-link ticket__team" @click.stop="teamStatsModalStore.openFor(leg.homeName, leg.league, leg.matchId)">{{ leg.homeName }}</button>
            <span class="ticket__vs">vs</span>
            <button type="button" class="cm-team-link ticket__team" @click.stop="teamStatsModalStore.openFor(leg.awayName, leg.league, leg.matchId)">{{ leg.awayName }}</button>
            <TeamCrest :name="leg.awayName" :league="leg.league" :size="16" />
          </p>
          <p class="ticket__market is-leg cm-truncate">{{ leg.market }} <span v-if="leg.league">· {{ leg.league }}</span></p>
          <p class="ticket__pick is-leg cm-truncate">
            <PickCrest :item="leg" :home="leg.homeName" :away="leg.awayName" :league="leg.league" :size="14" />{{ leg.pick }}
            <span class="cm-pill ticket-leg__odds">@ {{ formatOdds(leg.odds) }}</span>
          </p>
        </div>
        <span class="ticket__status is-sm" :class="`is-${legStatus(bet, i)}`">{{ LEG_STATUS_LABELS[legStatus(bet, i)] }}</span>
      </div>
    </div>
  </article>
</template>

<style scoped>
/* La carte d'un ticket : liseré gauche à la couleur du résultat (gagné vert,
   perdu rouge — couleurs sémantiques, identiques dans toutes les sections).
   Elle se règle sur SA largeur : une colonne de la page Mes tickets comme un
   panneau étroit. */
.ticket {
  --ton: var(--cm-border);
  container: ticket / inline-size;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
  padding: 12px 14px 12px 16px;
  border-radius: var(--cm-radius-md);
  border: 1px solid var(--cm-border-soft);
  border-left: 3px solid var(--ton);
  background: var(--cm-surface-alt);
  transition: border-color var(--cm-transition), background var(--cm-transition);
}

.ticket:hover {
  border-color: var(--cm-border);
  border-left-color: var(--ton);
  background: var(--cm-surface-hover);
}

.ticket.is-won {
  --ton: var(--cm-accent);
}

.ticket.is-lost {
  --ton: var(--cm-danger);
}

.ticket__head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 10px 18px;
}

.ticket__main {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

/* La rencontre : logo, club, « vs », club, logo — les noms se tronquent, pas les logos. */
.ticket__match {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--cm-text-primary);
}

.ticket__match.is-leg {
  font-size: 12px;
}

.ticket__team {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ticket__vs {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

.ticket__market {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

.ticket__market.is-leg {
  font-size: 10px;
}

.ticket__pick {
  font-size: 13px;
  font-weight: 700;
  color: var(--cm-text-primary);
}

.ticket__pick.is-leg {
  font-size: 12px;
}

.ticket__date {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: 2px;
  font-size: 11px;
  color: var(--cm-text-muted);
}

/* Les chiffres, étiquetés en petites capitales, alignés à droite. */
.ticket__figures {
  display: flex;
  gap: 16px;
  margin: 0;
}

.ticket__figure {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
}

.ticket__figure dt {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
  white-space: nowrap;
}

.ticket__figure dd {
  margin: 0;
  font-size: 13.5px;
  font-weight: 700;
  color: var(--cm-text-primary);
}

.ticket__return {
  font-size: 15px;
}

/* Le statut : pastille à point, verte ou rouge. */
.ticket__status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--cm-surface-hover);
  color: var(--cm-text-secondary);
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.ticket__status::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.85;
}

.ticket__status.is-won {
  background: var(--cm-accent-soft);
  color: var(--cm-accent);
}

.ticket__status.is-lost {
  background: var(--cm-danger-soft);
  color: var(--cm-danger);
}

.ticket__status.is-pending {
  background: var(--cm-section-soft);
  color: var(--cm-section);
}

.ticket__status.is-sm {
  padding: 2px 8px;
  font-size: 10px;
}

/* Les sélections d'un combiné. */
.ticket__legs {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 10px;
  border-top: 1px dashed var(--cm-border-soft);
}

.ticket-leg {
  --ton: var(--cm-border);
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 8px 10px 8px 12px;
  border-radius: var(--cm-radius-sm);
  border: 1px solid var(--cm-border-soft);
  border-left: 2px solid var(--ton);
  background: var(--cm-surface);
}

.ticket-leg.is-won {
  --ton: var(--cm-accent);
}

.ticket-leg.is-lost {
  --ton: var(--cm-danger);
}

.ticket-leg.is-pending {
  --ton: var(--cm-section);
}

.ticket-leg__main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ticket-leg__odds {
  min-width: 0;
  margin-left: 6px;
  padding: 1px 7px;
  font-size: 11px;
  vertical-align: middle;
}

/* Carte étroite : les chiffres passent sous la rencontre, le statut reste en haut à droite. */
@container ticket (max-width: 560px) {
  .ticket__head {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .ticket__status {
    grid-column: 2;
    grid-row: 1;
  }

  .ticket__figures {
    grid-column: 1 / -1;
    grid-row: 2;
    justify-content: flex-start;
    padding-top: 8px;
    border-top: 1px dashed var(--cm-border-soft);
  }

  .ticket__figure {
    align-items: flex-start;
  }
}
</style>
