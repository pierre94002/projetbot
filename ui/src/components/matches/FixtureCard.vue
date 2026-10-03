<script setup>
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import LeagueBadge from '@/components/matches/LeagueBadge.vue';
import TeamCrest from '@/components/matches/TeamCrest.vue';
import MatchCard from '@/components/matches/MatchCard.vue';
import { tour } from '@/utils/fotmobLabels.js';

/**
 * Un match à venir du calendrier d'une équipe — demande de Pierre le
 * 01/10/2026 : « fais-moi quelque chose de plus joli, et de plus facile à
 * voir ». En ligne ou en compact, c'est la carte de rencontre commune à
 * toute l'appli (MatchCard.vue) ; en 'hero', le prochain match en grand,
 * avec un compte à rebours — dessiné comme le bandeau d'une page (.cm-hero),
 * teinté de la couleur de la section (refonte visuelle du 01/10/2026).
 *
 * `fixture` : un match de GET /api/season-calendar/team.
 */
const props = defineProps({
  fixture: { type: Object, required: true },
  variant: { type: String, default: 'row' } // 'hero' | 'row' | 'compact'
});

const f = computed(() => props.fixture);
const reporte = computed(() => f.value.status === 'postponed');
const lien = computed(() => (f.value.pageMatchId ? `/match-a-venir/${f.value.pageMatchId}` : null));

const carte = computed(() => ({
  date: f.value.date,
  commenceTime: f.value.commenceTime ?? null,
  league: f.value.league ?? null,
  round: f.value.round ?? null,
  homeName: f.value.homeName,
  awayName: f.value.awayName,
  homeId: f.value.homeId ?? null,
  awayId: f.value.awayId ?? null,
  status: reporte.value ? 'postponed' : 'scheduled',
  side: f.value.side ?? null,
  hasOdds: f.value.hasOdds ?? false,
  postponedFrom: f.value.postponedFrom ?? null
}));

// --- Le prochain match, en grand ------------------------------------------
const instant = computed(() => (f.value.commenceTime ? new Date(f.value.commenceTime) : new Date(`${f.value.date}T12:00:00Z`)));
const format = (options) => new Intl.DateTimeFormat('fr-FR', { ...options, ...(f.value.commenceTime ? {} : { timeZone: 'UTC' }) }).format(instant.value);
const dateLongue = computed(() => format({ weekday: 'long', day: 'numeric', month: 'long' }));
const heure = computed(() => (f.value.commenceTime ? format({ hour: '2-digit', minute: '2-digit' }) : null));
const dans = computed(() => {
  const aujourdhui = new Date();
  const debut = Date.UTC(aujourdhui.getFullYear(), aujourdhui.getMonth(), aujourdhui.getDate());
  const [a, m, j] = String(f.value.date).split('-').map(Number);
  const ecart = Math.round((Date.UTC(a, m - 1, j) - debut) / 86_400_000);
  if (ecart <= 0) return "Aujourd'hui";
  if (ecart === 1) return 'Demain';
  return `Dans ${ecart} jours`;
});
const manche = computed(() => (f.value.round ? tour(f.value.round, f.value.league) : null));
const etiquette = computed(() => {
  if (reporte.value) return { texte: 'Reporté', classe: 'is-reporte', titre: 'Reporté, nouvelle date à venir' };
  if (f.value.postponedFrom) return { texte: 'Reprogrammé', classe: 'is-reprogramme', titre: `Reporté du ${f.value.postponedFrom.split('-').reverse().join('/')}` };
  if (f.value.hasOdds) return { texte: 'Coté', classe: 'is-cote', titre: 'Des cotes de bookmakers sont relevées pour ce match' };
  return null;
});
const equipes = computed(() => [
  { cote: 'home', nom: f.value.homeName, id: f.value.homeId ?? null, club: f.value.side === 'home' },
  { cote: 'away', nom: f.value.awayName, id: f.value.awayId ?? null, club: f.value.side === 'away' }
]);
</script>

<template>
  <component
    :is="lien ? RouterLink : 'div'"
    v-if="variant === 'hero'"
    v-bind="lien ? { to: lien } : {}"
    class="hero"
    :class="{ 'is-link': lien, 'is-postponed': reporte }"
    :title="lien ? 'Ouvrir la page du match' : undefined"
  >
    <!-- En haut : ce que c'est (prochain match, compétition, journée), et quand (étiquette, compte à rebours). -->
    <div class="hero__top">
      <span class="hero__kicker"><span class="hero__kicker-dot" />Prochain match</span>
      <LeagueBadge v-if="f.league" :league="f.league" class="hero__league" />
      <span v-if="manche" class="hero__round">{{ manche }}</span>
      <span class="hero__spacer" />
      <span v-if="etiquette" class="hero__tag" :class="etiquette.classe" :title="etiquette.titre">{{ etiquette.texte }}</span>
      <span class="hero__countdown">{{ dans }}</span>
    </div>

    <!-- Les deux clubs face à face, l'heure et la date au centre. -->
    <div class="hero__match">
      <div v-for="e in equipes" :key="e.cote" class="hero__team" :class="`is-${e.cote}`">
        <TeamCrest :name="e.nom" :league="f.league" :team-id="e.id" :size="56" />
        <span class="hero__name" :class="{ 'is-club': e.club }">{{ e.nom }}</span>
      </div>
      <div class="hero__center">
        <span class="hero__time">{{ reporte ? 'Reporté' : heure ?? '— : —' }}</span>
        <span class="hero__date">{{ dateLongue }}</span>
        <span v-if="!heure && !reporte" class="hero__hint">heure à confirmer</span>
      </div>
    </div>

    <div v-if="lien" class="hero__foot">Voir la page du match <span class="hero__chevron">›</span></div>
  </component>

  <MatchCard v-else :match="carte" :to="lien" :variant="variant" :show-competition="variant === 'row'" />
</template>

<style scoped>
/* Le prochain match en grand : même matière que le bandeau d'une page
   (.cm-hero), la couleur de la section en liseré et en halo. La carte se
   règle sur SA largeur (une page entière comme une colonne de résumé). */
.hero {
  container: fixture / inline-size;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 18px 22px;
  border-radius: var(--cm-radius-lg);
  border: 1px solid rgba(var(--cm-section-rgb) / 0.22);
  background:
    radial-gradient(120% 140% at 0% 0%, rgba(var(--cm-section-rgb) / 0.14), transparent 55%),
    radial-gradient(120% 140% at 100% 100%, var(--cm-section-glow-2), transparent 55%),
    var(--cm-surface-alt);
  color: inherit;
  text-decoration: none;
  overflow: hidden;
  transition: border-color var(--cm-transition), box-shadow var(--cm-transition);
}

.hero.is-link:hover {
  border-color: rgba(var(--cm-section-rgb) / 0.55);
  box-shadow: var(--cm-shadow-section);
}

.hero.is-postponed {
  opacity: 0.75;
}

/* ------------------------------------------------------------ en haut */
.hero__top {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.hero__kicker {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.7px;
  text-transform: uppercase;
  color: var(--cm-section);
  white-space: nowrap;
}

.hero__kicker-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--cm-section);
  box-shadow: 0 0 0 3px var(--cm-section-soft);
}

.hero__league {
  flex: 0 1 auto;
}

.hero__round {
  font-size: 11px;
  color: var(--cm-text-muted);
  white-space: nowrap;
}

.hero__spacer {
  flex: 1;
}

.hero__tag {
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 700;
  white-space: nowrap;
}

/* Couleurs sémantiques : coté (positif), reporté (rouge), reprogrammé (ambre). */
.hero__tag.is-cote {
  background: var(--cm-accent-soft);
  color: var(--cm-accent);
}

.hero__tag.is-reporte {
  background: var(--cm-danger-soft);
  color: var(--cm-danger);
}

.hero__tag.is-reprogramme {
  background: var(--cm-warning-soft);
  color: var(--cm-warning);
}

/* Le compte à rebours : LA pastille de la carte, pleine couleur de section. */
.hero__countdown {
  padding: 4px 12px;
  border-radius: 999px;
  background: var(--cm-section);
  color: var(--cm-section-on);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.2px;
  white-space: nowrap;
  box-shadow: 0 4px 14px rgba(var(--cm-section-rgb) / 0.3);
}

/* ------------------------------------------------------------- le match */
.hero__match {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 20px;
}

.hero__team {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

/* Logo à droite du nom, le tout collé au centre (en row-reverse, le début est à droite). */
.hero__team.is-home {
  grid-column: 1;
  flex-direction: row-reverse;
  justify-content: flex-start;
}

.hero__team.is-away {
  grid-column: 3;
}

.hero__name {
  font-size: 19px;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: var(--cm-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Le club de la page reste discret ; l'adversaire ressort. */
.hero__name.is-club {
  color: var(--cm-text-secondary);
}

/* L'heure et la date, dans un bloc central un cran plus clair. */
.hero__center {
  grid-column: 2;
  grid-row: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  min-width: 118px;
  padding: 10px 16px;
  border-radius: var(--cm-radius-md);
  border: 1px solid var(--cm-border-soft);
  background: rgb(var(--cm-glass-tint) / var(--cm-elevation-2));
}

.hero__time {
  font-size: 28px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.5px;
  line-height: 1.1;
  color: var(--cm-text-primary);
}

.hero.is-postponed .hero__time {
  font-size: 18px;
  color: var(--cm-danger);
}

.hero__date {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--cm-text-secondary);
  white-space: nowrap;
}

/* « Samedi 10 octobre » : majuscule au jour seulement. */
.hero__date::first-letter {
  text-transform: uppercase;
}

.hero__hint {
  font-size: 10.5px;
  color: var(--cm-text-muted);
}

/* ------------------------------------------------------------- en bas */
.hero__foot {
  align-self: flex-end;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 700;
  color: var(--cm-section);
}

.hero.is-link:hover .hero__foot {
  text-decoration: underline;
}

.hero__chevron {
  font-size: 18px;
  line-height: 1;
}

/* Carte étroite (colonne de résumé, panneau) : tout se resserre. */
@container fixture (max-width: 560px) {
  .hero {
    padding: 14px 16px;
    gap: 12px;
  }

  .hero__match {
    gap: 12px;
  }

  .hero__team {
    gap: 8px;
  }

  .hero__name {
    font-size: 14.5px;
  }

  .hero__center {
    min-width: 92px;
    padding: 8px 10px;
  }

  .hero__time {
    font-size: 20px;
  }

  .hero__date {
    font-size: 11px;
    white-space: normal;
    text-align: center;
  }
}
</style>
