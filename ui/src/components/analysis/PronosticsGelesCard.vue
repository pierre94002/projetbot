<script setup>
import { computed } from 'vue';
import AppCard from '@/components/common/AppCard.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import PickCrest from '@/components/matches/PickCrest.vue';
import { MOTS_APRES_MATCH, pronosticsGeles } from '@/utils/apresLeMatch.js';

/**
 * LES PRONOSTICS GELÉS DU MOTEUR, RÉGLÉS (étape 40 du plan, lot 1b, 17/11/2026) — onglet « Analyse IA » de la page d'un match joué.
 * Ce que le moteur annonçait avant le coup d'envoi (la dernière valeur gelée, et la première quand elle différait), puis ce que le
 * match a donné : vert « Juste » et sa coche, rouge « Faux » et sa croix, gris « Non réglable » et sa raison, avec le chiffre réel
 * (« 11 corners (5 + 6) », « Score à la 90e minute : 2-1 (match prolongé) »). Tout vient de la fiche du serveur
 * (data/fiche/ficheApresMatch.js, réglée comme le bilan de la fiabilité) : rien n'est calculé ici, aucun appel. La carte garde
 * toute sa structure en chargement, en panne ou sans pronostic (la phrase de l'état). Le vert et le rouge ne disent que juste ou faux.
 */
const props = defineProps({
  fiche: { type: Object, default: null },
  chargement: { type: Boolean, default: false },
  erreur: { type: String, default: null },
  home: { type: String, default: null },
  away: { type: String, default: null },
  league: { type: String, default: null },
  homeId: { type: String, default: null },
  awayId: { type: String, default: null }
});

const MOTS = MOTS_APRES_MATCH;
const vue = computed(() => pronosticsGeles(props.fiche, { chargement: props.chargement, noms: { home: props.home, away: props.away } }));
const enPanne = computed(() => vue.value.etat === 'panne' || (Boolean(props.erreur) && !props.fiche));
const message = computed(() => (props.erreur && !props.fiche ? `L’onglet n’a pas pu être lu (${props.erreur}) : aucun pronostic réglé à montrer.` : vue.value.message));
</script>

<template>
  <AppCard :title="MOTS.titreCarte" :subtitle="MOTS.sousTitreCarte" icon="cpu">
    <div class="pgc" data-bloc="pronostics-geles" :data-etat="erreur && !fiche ? 'erreur' : vue.etat">
      <p v-if="message" class="pgc__message" :class="{ 'is-panne': enPanne }">
        <AppIcon :name="enPanne ? 'alert' : 'info'" :size="13" />{{ message }}
      </p>

      <p v-if="vue.compte" class="pgc__compte" data-ligne="compte">
        <span class="cm-chip is-accent"><AppIcon name="check" :size="11" />{{ vue.compte.juste }} juste{{ vue.compte.juste > 1 ? 's' : '' }}</span>
        <span class="cm-chip is-danger"><AppIcon name="x" :size="11" />{{ vue.compte.faux }} faux</span>
        <span class="cm-chip"><AppIcon name="minus" :size="11" />{{ vue.compte.nonReglable }} non réglable{{ vue.compte.nonReglable > 1 ? 's' : '' }}</span>
      </p>

      <ul v-if="vue.lignes.length" class="pgc__liste">
        <li v-for="l in vue.lignes" :key="l.cle" class="pgc__ligne" :data-issue="l.issue?.cle ?? 'aucune'" :data-marche="l.marketId">
          <div class="pgc__quoi">
            <span class="pgc__marche">{{ l.marche }}</span>
            <span class="pgc__pronostic">
              <PickCrest :item="l.item" :home="home" :away="away" :league="league" :home-id="homeId" :away-id="awayId" :size="16" />{{ l.pronostic }}
            </span>
            <span class="pgc__meta cm-numeric">{{ l.pourcentage ?? 'pourcentage non noté' }} · {{ l.version }} · {{ MOTS.derniere }}</span>
          </div>
          <div v-if="l.issue" class="pgc__issue">
            <span class="pgc__mot"><AppIcon :name="l.issue.icone" :size="11" />{{ l.issue.libelle }}</span>
            <span v-if="l.chiffre" class="pgc__chiffre cm-numeric">{{ l.chiffre }}</span>
            <span v-if="l.issue.raison" class="pgc__raison">{{ l.issue.raison }}</span>
          </div>
          <p v-if="l.premiere" class="pgc__premiere">{{ l.premiere }}</p>
        </li>
      </ul>

      <p v-if="vue.butsCaches" class="pgc__note" data-ligne="buts-caches"><AppIcon name="info" :size="12" />{{ vue.butsCaches }}</p>
      <p class="pgc__provenance"><AppIcon name="database" :size="12" />{{ vue.provenance ?? MOTS.titreReel }}</p>
    </div>
  </AppCard>
</template>

<style scoped>
.pgc {
  container: pgc / inline-size;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pgc__message,
.pgc__note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  padding: 9px 12px;
  border-radius: var(--cm-radius-sm);
  background: var(--cm-surface-hover);
  color: var(--cm-text-secondary);
  font-size: 12.5px;
  line-height: 1.45;
}

/* Une panne se dit en ambre, avec son icône : l'analyse de l'IA, au-dessus, reste entière. */
.pgc__message.is-panne {
  background: var(--cm-warning-soft);
  color: var(--cm-warning);
}

.pgc__compte {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
}

.pgc__compte .cm-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.pgc__liste {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.pgc__ligne {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px 14px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
}

/* Le liseré dit l'issue : vert juste, rouge faux ; gris (aucun liseré) non réglable. */
.pgc__ligne[data-issue='juste'] {
  box-shadow: inset 3px 0 0 var(--cm-accent);
}

.pgc__ligne[data-issue='faux'] {
  box-shadow: inset 3px 0 0 var(--cm-danger);
}

.pgc__quoi {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.pgc__marche {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

.pgc__pronostic {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--cm-text-primary);
}

.pgc__meta {
  font-size: 11px;
  color: var(--cm-text-muted);
}

.pgc__issue {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
  min-width: 0;
  text-align: right;
}

.pgc__mot {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  background: var(--cm-surface-hover);
  color: var(--cm-text-muted);
}

.pgc__ligne[data-issue='juste'] .pgc__mot {
  background: var(--cm-accent-soft);
  color: var(--cm-accent);
}

.pgc__ligne[data-issue='faux'] .pgc__mot {
  background: var(--cm-danger-soft);
  color: var(--cm-danger);
}

.pgc__chiffre {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--cm-text-primary);
}

.pgc__raison {
  font-size: 11.5px;
  color: var(--cm-text-muted);
}

.pgc__premiere {
  grid-column: 1 / -1;
  margin: 0;
  font-size: 11.5px;
  color: var(--cm-text-secondary);
}

.pgc__provenance {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  font-size: 11px;
  line-height: 1.45;
  color: var(--cm-text-muted);
}

/* Une colonne sous 520 px : l'issue passe sous le pronostic, alignée à gauche. */
@container pgc (max-width: 520px) {
  .pgc__ligne {
    grid-template-columns: minmax(0, 1fr);
  }

  .pgc__issue {
    align-items: flex-start;
    text-align: left;
  }
}
</style>
