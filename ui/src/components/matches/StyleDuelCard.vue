<script setup>
/**
 * Le bloc « DUEL DE STYLES » de la page d'un match (étape 37 du plan, 22/10/2026) : le style actuel de chaque équipe
 * (logo, étiquette, possession) et ce que leur rencontre laisse attendre — marqué « Explication seulement », sauf si
 * ce duel précis a passé le seuil sévère du banc d'essai (« Effet mesuré », avec l'effet et le nombre de matchs).
 *
 * Tout est LU (GET /api/match-stats/style-duel) ; rien n'est calculé à l'ouverture, aucun appel payant. Le bloc reste
 * affiché même vide, avec sa source réelle et l'heure du calcul. Aucun chiffre du moteur n'en dépend. Les mots viennent
 * de utils/stylesDeJeu.js (pur, rejoué par server/test/stylesEcran.test.mjs).
 */
import { computed, onMounted, ref, watch } from 'vue';
import AppCard from '@/components/common/AppCard.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import TeamCrest from '@/components/matches/TeamCrest.vue';
import { matchStatsApi } from '@/services/matchStatsApi.js';
import { libelleDe, iconeDe, etatDuDuel, duelDit, provenanceDuDuel, valeurDite } from '@/utils/stylesDeJeu.js';

const props = defineProps({
  homeName: { type: String, default: '' },
  awayName: { type: String, default: '' },
  league: { type: String, default: null },
  /** Les identifiants FotMob, quand la page les connaît ; sinon le serveur reconnaît les clubs par leur nom. */
  homeId: { type: String, default: null },
  awayId: { type: String, default: null }
});

const etat = ref({ loading: false, error: null, data: null });
const cle = () => `${props.homeId ?? props.homeName}|${props.awayId ?? props.awayName}`;

async function charger() {
  const demande = cle();
  if (!props.homeName && !props.homeId) return;
  etat.value = { ...etat.value, loading: true, error: null };
  try {
    const data = await matchStatsApi.styleDuel({ homeId: props.homeId, awayId: props.awayId, homeName: props.homeName, awayName: props.awayName, league: props.league });
    if (cle() === demande) etat.value = { loading: false, error: null, data };
  } catch (error) {
    if (cle() === demande) etat.value = { loading: false, error: error.message, data: null };
  }
}

onMounted(charger);
watch(cle, (apres, avant) => {
  if (apres === avant) return;
  etat.value = { loading: false, error: null, data: null };
  charger();
});

const reponse = computed(() => etat.value.data);
const lu = computed(() => etatDuDuel({ chargement: etat.value.loading, erreur: etat.value.error, reponse: reponse.value }));
const duel = computed(() => duelDit(lu.value.cle === 'pret' ? reponse.value : { banc: reponse.value?.banc }));
const provenance = computed(() => provenanceDuDuel(reponse.value));
const camps = computed(() => [
  { cote: 'home', nom: props.homeName, id: reponse.value?.homeId ?? props.homeId, style: reponse.value?.home ?? null, ou: 'à domicile' },
  { cote: 'away', nom: props.awayName, id: reponse.value?.awayId ?? props.awayId, style: reponse.value?.away ?? null, ou: 'à l’extérieur' }
]);
const iconeDeLaNote = (ton) => (ton === 'is-danger' ? 'x' : ton === 'is-warning' ? 'alert' : 'info');
</script>

<template>
  <AppCard class="sdc" icon="swap" eyebrow="Styles de jeu" title="Duel de styles" subtitle="Comment les deux façons de jouer se rencontrent" :data-etat="lu.cle" data-bloc="duel-de-styles">
    <div class="sdc__corps">
      <p class="sdc__mention" :class="duel.mesure ? 'is-mesure' : 'is-explication'" data-duel="mention">
        <AppIcon :name="duel.mesure ? 'check' : 'info'" :size="13" />
        {{ duel.mention }}
        <HelpTip
          titre="Explication seulement"
          texte="Le style aide à comprendre un match, il ne change aucun pourcentage du moteur. Chaque duel de styles a été mesuré au banc d’essai face à la cote de clôture, avec un seuil sévère : tant qu’un duel n’a pas prouvé qu’il surprend le marché, il reste une explication."
        />
      </p>

      <LoadingSpinner v-if="lu.cle === 'chargement'" label="Lecture des styles…" />
      <div v-if="lu.texte && lu.cle !== 'chargement'" class="cm-note" :class="lu.ton" :data-raison="lu.cle">
        <span class="cm-icon-box" :class="lu.ton === 'is-danger' ? 'is-danger' : lu.ton === 'is-warning' ? 'is-warning' : 'is-info'"><AppIcon :name="iconeDeLaNote(lu.ton)" :size="16" /></span>
        <div>
          <p class="cm-note__title">{{ lu.titre }}</p>
          <p class="cm-note__text sdc__texte">{{ lu.texte }}</p>
        </div>
      </div>

      <!-- Les deux équipes, face à face : toujours affichées. -->
      <div class="sdc__duo">
        <div v-for="c in camps" :key="c.cote" class="cm-block sdc__camp" :data-camp="c.cote">
          <p class="sdc__equipe">
            <TeamCrest :name="c.nom" :league="league" :team-id="c.id" :size="24" />
            <strong class="cm-truncate">{{ c.nom }}</strong>
            <small class="sdc__petit">{{ c.ou }}</small>
          </p>
          <p class="sdc__style">
            <AppIcon :name="c.style ? iconeDe(c.style.style) : 'minus'" :size="14" />
            <span class="cm-chip is-section" :data-style-id="c.style?.style ?? 'aucun'">{{ c.style ? libelleDe(c.style.style) : 'style inconnu' }}</span>
            <span v-if="c.style?.provisoire" class="cm-chip is-warning">provisoire</span>
          </p>
          <p class="sdc__petit">{{ c.style ? `possession ${valeurDite('pourcentage', c.style.poss) ?? 'non publiée'} · ${c.style.n} matchs lus` : 'pas assez de matchs relevés' }}</p>
        </div>
      </div>

      <p v-if="duel.titre" class="sdc__titre" data-duel="titre">{{ duel.titre }}</p>
      <p class="sdc__texte" data-duel="scenario">{{ duel.scenario ?? 'Le duel se lit quand les deux équipes ont un style.' }}</p>
      <p v-if="duel.effetTexte" class="sdc__texte is-strong" data-duel="effet">{{ duel.effetTexte }}</p>
      <p class="sdc__petit" data-duel="banc"><AppIcon name="shield" :size="12" /> {{ duel.bancTexte }}</p>

      <ProvenanceChip :source="provenance.source" :releve-le="provenance.releveLe" :action="provenance.action" :fichier="provenance.fichier" :detail="provenance.detail" :vieux-apres-heures="48" variante="ligne" />
    </div>
  </AppCard>
</template>

<style scoped>
.sdc__corps {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sdc__mention {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 6px;
  margin: 0;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  border: 1px solid var(--cm-border-soft);
  color: var(--cm-text-secondary);
  background: var(--cm-surface-alt);
}

/* « Effet mesuré » : la seule chose prouvée au banc (le vert est réservé à ce qui est prouvé, DESIGN.md). */
.sdc__mention.is-mesure {
  color: var(--cm-accent);
  border-color: var(--cm-accent);
}

.sdc__duo {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 10px;
}

.sdc__camp {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sdc__equipe,
.sdc__style {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  font-size: 13px;
  color: var(--cm-text-primary);
}

.sdc__titre {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--cm-text-primary);
}

.sdc__texte {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
}

.sdc__texte.is-strong {
  font-weight: 700;
  color: var(--cm-text-primary);
}

.sdc__petit {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  margin: 0;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--cm-text-muted);
}
</style>
