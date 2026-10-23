<script setup>
/**
 * Le bloc « STYLE DE JEU » de la page d'une équipe (étape 37 du plan, 22/10/2026) : son étiquette (possession, jeu
 * direct, contre-attaque, coups de pied arrêtés, ou sans style marqué), les chiffres qui la justifient face à son
 * championnat, son style mois par mois (la stabilité), et son entraîneur avec le style de celui-ci.
 *
 * Tout est LU (GET /api/match-stats/team-style?club=…, des tables calculées la nuit par l'actualisation,
 * server/src/data/db/teamStyle.js) : rien n'est calculé à l'ouverture, aucun appel payant. Le bloc reste TOUJOURS
 * affiché, tableaux compris, même vide ; il montre sa source réelle et l'heure du calcul. EXPLICATION SEULEMENT : aucun
 * chiffre du moteur n'en dépend. Les mots viennent de utils/stylesDeJeu.js (pur, rejoué par
 * server/test/stylesEcran.test.mjs). Le club est reconnu par son identifiant FotMob (surveillance de `clubId`).
 */
import { computed, onMounted, ref, watch } from 'vue';
import AppButton from '@/components/common/AppButton.vue';
import AppCard from '@/components/common/AppCard.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import LeagueBadge from '@/components/matches/LeagueBadge.vue';
import TeamCrest from '@/components/matches/TeamCrest.vue';
import { matchStatsApi } from '@/services/matchStatsApi.js';
import {
  STYLES,
  libelleDe,
  iconeDe,
  etatDuBloc,
  provenanceDuBloc,
  lignesDesChiffres,
  piedDesChiffres,
  pourquoiCeStyle,
  prudences,
  historiqueDit,
  entraineurDit,
  jourDit
} from '@/utils/stylesDeJeu.js';

const props = defineProps({
  /** L'identifiant FotMob du club (« fotmob-8456 ») ; sans lui, le bloc le dit et garde ses tableaux. */
  clubId: { type: String, default: null },
  clubName: { type: String, default: '' },
  league: { type: String, default: null }
});

const etat = ref({ loading: false, error: null, data: null });

async function charger() {
  const club = props.clubId;
  if (!club) {
    etat.value = { loading: false, error: null, data: null };
    return;
  }
  etat.value = { ...etat.value, loading: true, error: null };
  try {
    const data = await matchStatsApi.teamStyle(club);
    // Une réponse arrivée après un changement de club est ignorée.
    if (props.clubId === club) etat.value = { loading: false, error: null, data };
  } catch (error) {
    if (props.clubId === club) etat.value = { loading: false, error: error.message, data: null };
  }
}

onMounted(charger);
watch(
  () => props.clubId,
  (apres, avant) => {
    if (apres === avant) return;
    etat.value = { loading: false, error: null, data: null };
    charger();
  }
);

const reponse = computed(() => etat.value.data);
const lu = computed(() => etatDuBloc({ chargement: etat.value.loading, erreur: etat.value.error, reponse: reponse.value, clubId: props.clubId }));
const style = computed(() => (lu.value.cle === 'pret' ? reponse.value?.style ?? null : null));
const lignes = computed(() => lignesDesChiffres(style.value, lu.value.cle));
const pied = computed(() => piedDesChiffres(style.value, lignes.value));
const pourquoi = computed(() => pourquoiCeStyle(style.value));
const gardes = computed(() => prudences(style.value, reponse.value?.reglages ?? {}));
const histo = computed(() => historiqueDit(reponse.value?.historique ?? []));
const coach = computed(() => entraineurDit(lu.value.cle === 'pret' || lu.value.cle === 'sans-style' ? reponse.value : null));
const provenance = computed(() => provenanceDuBloc(reponse.value));
const championnat = computed(() => style.value?.league ?? props.league ?? null);
const iconeDeLaNote = (ton) => (ton === 'is-danger' ? 'x' : ton === 'is-warning' ? 'alert' : 'info');
</script>

<template>
  <AppCard
    class="tst"
    icon="target"
    eyebrow="Calculé chaque nuit · explication seulement"
    title="Style de jeu"
    subtitle="Sa façon de jouer, lue sur ses 20 derniers matchs de championnat et comparée aux autres clubs de son championnat"
    :data-etat="lu.cle"
    data-bloc="style-de-jeu"
  >
    <template #actions>
      <AppButton variant="secondary" size="sm" :loading="etat.loading" :disabled="!clubId" @click="charger">
        <template #icon><AppIcon name="refresh" :size="13" /></template>
        Relire
      </AppButton>
    </template>

    <div class="tst__corps">
      <!-- 0. Le club (logo) et son championnat. -->
      <p class="tst__club">
        <TeamCrest :name="clubName" :league="league" :team-id="clubId" :size="26" />
        <strong class="cm-truncate">{{ clubName }}</strong>
        <span v-if="championnat" class="cm-chip tst__ligue"><LeagueBadge :league="championnat" /></span>
      </p>

      <LoadingSpinner v-if="lu.cle === 'chargement'" label="Lecture du style de jeu…" />

      <div v-if="lu.texte && lu.cle !== 'chargement'" class="cm-note" :class="lu.ton" :data-raison="lu.cle">
        <span class="cm-icon-box" :class="lu.ton === 'is-danger' ? 'is-danger' : lu.ton === 'is-warning' ? 'is-warning' : 'is-info'"><AppIcon :name="iconeDeLaNote(lu.ton)" :size="16" /></span>
        <div>
          <p class="cm-note__title">{{ lu.titre }}</p>
          <p class="cm-note__text tst__texte">{{ lu.texte }}</p>
        </div>
      </div>

      <div v-if="lu.aRefaire" class="cm-note is-warning" data-raison="autre-version">
        <span class="cm-icon-box is-warning"><AppIcon name="clock" :size="16" /></span>
        <div>
          <p class="cm-note__title">Calcul d’une autre version</p>
          <p class="cm-note__text tst__texte">Le style lu a été fait par une autre forme du calcul : la prochaine passe de nuit le refait. Ses chiffres restent lus en attendant.</p>
        </div>
      </div>

      <!-- 1. L'étiquette et la phrase qui la justifie. -->
      <div class="tst__etiquette" data-style="etiquette">
        <span class="cm-icon-box is-section"><AppIcon :name="style ? iconeDe(style.style) : 'minus'" :size="18" /></span>
        <div class="tst__etiquette-texte">
          <p class="tst__nom-style">
            <span class="cm-chip is-section" :data-style-id="style?.style ?? 'aucun'">{{ style ? libelleDe(style.style) : lu.cle === 'sans-style' ? 'pas de style lu' : 'pas encore calculé' }}</span>
            <span v-if="style?.provisoire" class="cm-chip is-warning">provisoire</span>
            <span v-if="style?.secondLibelle" class="cm-chip" title="Un second trait, au-dessus du seuil lui aussi.">aussi : {{ style.secondLibelle }}</span>
          </p>
          <p class="tst__texte" data-style="pourquoi">{{ pourquoi ?? 'Les chiffres qui justifient le style s’afficheront ici dès le premier calcul.' }}</p>
        </div>
      </div>
      <ul v-if="gardes.length" class="tst__gardes" data-style="prudences">
        <li v-for="g in gardes" :key="g.cle" :data-prudence="g.cle"><AppIcon name="alert" :size="12" />{{ g.texte }}</li>
      </ul>

      <!-- 2. D'où ça vient. -->
      <div class="tst__entete">
        <ProvenanceChip :source="provenance.source" :releve-le="provenance.releveLe" :action="provenance.action" :fichier="provenance.fichier" :detail="provenance.detail" :vieux-apres-heures="48" />
        <span v-if="reponse?.etat?.jusqua" class="tst__petit-texte">Matchs pris en compte jusqu’au {{ jourDit(reponse.etat.jusqua) }}</span>
      </div>

      <!-- 3. Les chiffres qui justifient le style. -->
      <h4 class="cm-group-title tst__groupe">
        Les chiffres du style
        <HelpTip
          titre="Lire ce tableau"
          texte="Chaque chiffre est une moyenne par match sur ses 20 derniers matchs de championnat, à côté de la moyenne des clubs de son championnat. « Au-dessus » ou « en dessous » : il s’en écarte nettement. Les parts de tirs viennent de la carte des tirs FotMob (les penalties ne comptent pas). En gras : les chiffres qui portent son étiquette."
        />
      </h4>
      <div class="cm-table-wrap">
        <table class="cm-table tst__table" data-tableau="chiffres-du-style">
          <thead>
            <tr>
              <th class="is-left">Chiffre</th>
              <th>Le club</th>
              <th>Son championnat</th>
              <th>Écart</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in lignes" :key="l.id" :data-chiffre="l.id" :class="{ 'is-justifie': l.justifie }">
              <td class="is-left" :class="{ 'is-strong': l.justifie }">{{ l.libelle }}</td>
              <td class="cm-numeric" :class="{ 'tst__vide': l.vide }">{{ l.club }}</td>
              <td class="cm-numeric">{{ l.ligue }}</td>
              <td><span class="tst__ecart" :class="l.ecart.ton">{{ l.ecart.texte }}</span></td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td class="is-left is-strong">Σ Total</td>
              <td colspan="3" class="is-strong">{{ pied.sigma }}</td>
            </tr>
            <tr>
              <td class="is-left tst__moyenne">⌀ Moyenne</td>
              <td colspan="3" class="tst__moyenne">{{ pied.moyenne }}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- 4. L'entraîneur et son style. -->
      <h4 class="cm-group-title tst__groupe">
        L’entraîneur
        <HelpTip
          titre="Le style de l’entraîneur"
          texte="Lu dans les compositions publiées par FotMob : ses 20 derniers matchs de championnat, avec ce club et ceux qu’il a dirigés avant, chacun comparé à son championnat. Un nouvel entraîneur peut changer le style d’une équipe : le sien dit vers quoi elle peut aller."
        />
      </h4>
      <section class="cm-block tst__coach" data-bloc="entraineur" data-style="entraineur">
        <p class="tst__coach-ligne">
          <AppIcon name="users" :size="15" />
          <strong>{{ coach.nom ?? 'Entraîneur inconnu' }}</strong>
          <span v-if="coach.style" class="cm-chip is-section" :data-style-id="coach.style">{{ coach.libelle }}</span>
          <span v-if="coach.provisoire" class="cm-chip is-warning">provisoire</span>
        </p>
        <p class="tst__texte">{{ coach.texte }}</p>
        <p v-if="coach.note" class="tst__petit-texte">{{ coach.note }}</p>
        <ul v-if="coach.clubs?.length" class="tst__clubs">
          <li v-for="c in coach.clubs" :key="c.club">
            <TeamCrest :name="c.nom" :league="c.league" :team-id="c.teamId" :size="18" />
            <strong class="tst__petit-nom">{{ c.nom }}</strong>
            <LeagueBadge :league="c.league" />
            <span class="tst__petit-texte">{{ c.texte }}</span>
          </li>
        </ul>
      </section>

      <!-- 5. Son style mois par mois (la stabilité). -->
      <h4 class="cm-group-title tst__groupe">
        Son style mois par mois
        <HelpTip titre="La stabilité" texte="Le style noté au 1er de chaque mois, sur les 20 matchs d’avant. Un club garde son étiquette tant qu’un autre style ne le dépasse pas nettement : un style ne change pas sur un match." />
      </h4>
      <p class="tst__texte" data-style="historique">{{ histo.phrase }}</p>
      <div class="cm-table-wrap">
        <table class="cm-table tst__table" data-tableau="style-par-mois">
          <thead>
            <tr>
              <th class="is-left">Mois</th>
              <th class="is-left">Style</th>
              <th>Matchs lus</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="h in histo.lignes" :key="h.jour">
              <td class="is-left">{{ h.mois }}</td>
              <td class="is-left"><span class="cm-chip" :data-style-id="h.style">{{ h.libelle }}</span><small v-if="h.provisoire" class="tst__petit-texte"> provisoire</small></td>
              <td class="cm-numeric">{{ h.n }}</td>
            </tr>
            <tr v-if="!histo.lignes.length">
              <td class="is-left tst__vide" colspan="3">pas encore d’historique</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td class="is-left is-strong">Σ Total</td>
              <td colspan="2" class="is-strong">{{ histo.sigma }}</td>
            </tr>
            <tr>
              <td class="is-left tst__moyenne">⌀ Moyenne</td>
              <td colspan="2" class="tst__moyenne">{{ histo.moyenne }}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- 6. La règle. -->
      <p class="tst__pied" data-regle>
        <AppIcon name="shield" :size="12" />
        <span>Explication seulement : le style n’entre dans aucun chiffre du moteur. Les cinq étiquettes : {{ STYLES.map((s) => s.libelle).join(', ') }}.</span>
      </p>
    </div>
  </AppCard>
</template>

<style scoped>
.tst {
  container: tst / inline-size;
}

.tst__corps {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.tst__club,
.tst__nom-style,
.tst__coach-ligne {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  font-size: 14px;
  color: var(--cm-text-primary);
}

.tst__ligue {
  max-width: 100%;
}

.tst__etiquette {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.tst__etiquette-texte {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.tst__texte {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
}

.tst__entete {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
}

.tst__petit-texte {
  font-size: 11.5px;
  color: var(--cm-text-muted);
}

.tst__groupe {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 6px 0 0;
}

.tst__gardes {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 12px;
  color: var(--cm-warning);
}

.tst__gardes li {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.tst__table td {
  vertical-align: top;
}

.tst__vide {
  font-size: 11px;
  color: var(--cm-text-muted);
}

/* L'écart au championnat : bleu d'information au-dessus, ambre en dessous — jamais le vert ni le rouge. */
.tst__ecart {
  font-size: 12px;
  color: var(--cm-text-secondary);
}

.tst__ecart.is-fort {
  color: var(--cm-info);
  font-weight: 700;
}

.tst__ecart.is-faible {
  color: var(--cm-warning);
  font-weight: 700;
}

.tst__moyenne {
  color: var(--cm-text-muted);
}

.tst__coach {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tst__clubs {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.tst__petit-nom {
  font-size: 12px;
  color: var(--cm-text-primary);
}

.tst__clubs li {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.tst__pied {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--cm-text-muted);
}

.tst__pied :deep(svg) {
  flex-shrink: 0;
  margin-top: 3px;
}

@container tst (max-width: 520px) {
  .tst__etiquette {
    flex-direction: column;
  }
}
</style>
