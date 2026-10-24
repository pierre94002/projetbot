<script setup>
/**
 * DOSSIERS ET LEÇONS (étape 45 du plan, 24/10/2026) : la carte « Mémoire de l'IA » de la page « Bulletin ». Elle réunit à UN endroit ce que
 * le code garde de chaque équipe et de chaque championnat (étape 44) :
 *   1. les leçons que le carnet de l'IA a CONFIRMÉES, de toutes les équipes et de tous les championnats, du plus récent au plus ancien,
 *      avec leur jour, leur match d'origine (les deux logos), le marché et le pronostic, ce que le carnet a vu, qui la garde, et la date
 *      de confirmation ;
 *   2. les leçons RETIRÉES (démenties par les matchs suivants, ou jamais confirmées), et pourquoi ;
 *   3. le choix d'un championnat puis d'une équipe pour ouvrir son DOSSIER COMPLET — le composant de la page d'une équipe (AiDossierCard),
 *      repris tel quel, sans en recopier une ligne.
 *
 * Le composant n'appelle rien lui-même hors le dossier ouvert (AiDossierCard lit GET …/dossiers) : la page lui donne la réponse de
 * GET /api/match-ai-analysis/dossiers/resume (écrit chaque nuit par l'actualisation, rien n'est calculé à l'ouverture, jamais Claude).
 * Tout est TOUJOURS affiché, même vide : les deux tableaux (en-têtes, Σ, ⌀) restent, la raison est dite. Une leçon n'est ni bonne ni mauvaise :
 * ni vert ni rouge. Les mots viennent de utils/indexDesDossiers.js (pur, rejoué par server/test/bulletinPageEcran.test.mjs).
 */
import { computed, nextTick, ref, watch } from 'vue';
import AppButton from '@/components/common/AppButton.vue';
import AppCard from '@/components/common/AppCard.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import AppSelect from '@/components/common/AppSelect.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import AiDossierCard from '@/components/analysis/AiDossierCard.vue';
import LeagueBadge from '@/components/matches/LeagueBadge.vue';
import TeamCrest from '@/components/matches/TeamCrest.vue';
import { useFavoritesStore } from '@/stores/favoritesStore.js';
import { AUCUN, equipeDeLIndex, etatDeLIndex, lignesDesLeconsDeLIndex, optionsDesChampionnats, optionsDesEquipes, piedDesLecons, provenanceDeLIndex, resumeDeLIndex } from '@/utils/indexDesDossiers.js';
import { SECTIONS } from '@/utils/pageBulletin.js';

const props = defineProps({
  /** La réponse de GET /api/match-ai-analysis/dossiers/resume, ou null tant qu'elle n'est pas lue. */
  reponse: { type: Object, default: null },
  chargement: { type: Boolean, default: false },
  /** Le message d'une lecture ratée (la dernière réponse reste affichée). */
  erreur: { type: String, default: null },
  /** Le dossier ouvert au départ (un lien partagé) : le championnat, puis l'équipe par son identifiant FotMob. */
  ligueInitiale: { type: String, default: AUCUN },
  equipeInitiale: { type: String, default: AUCUN }
});

const emit = defineEmits(['relire', 'choisi']);

const favoris = useFavoritesStore();
const ligue = ref(props.ligueInitiale);
const equipe = ref(props.equipeInitiale);

// Changer de championnat ferme le dossier de l'équipe d'avant (une équipe se choisit DANS un championnat).
watch(ligue, (apres, avant) => {
  if (apres !== avant && equipe.value && equipeDeLIndex(props.reponse, equipe.value)?.league !== apres) equipe.value = AUCUN;
});
watch([ligue, equipe], ([l, e]) => emit('choisi', { ligue: l, equipe: e }));

const etat = computed(() => etatDeLIndex({ chargement: props.chargement, erreur: props.erreur, reponse: props.reponse }));
const resume = computed(() => resumeDeLIndex(props.reponse));
const provenance = computed(() => provenanceDeLIndex(props.reponse));
const totaux = computed(() => props.reponse?.totaux ?? null);
const confirmees = computed(() => lignesDesLeconsDeLIndex(props.reponse?.lecons?.confirmees));
const retirees = computed(() => lignesDesLeconsDeLIndex(props.reponse?.lecons?.retirees));
const piedConfirmees = computed(() => piedDesLecons(confirmees.value, { genre: 'confirmees', gardees: totaux.value?.confirmees ?? null, enTout: totaux.value?.confirmeesEnTout ?? null }));
const piedRetirees = computed(() => piedDesLecons(retirees.value, { genre: 'retirees', gardees: totaux.value?.retirees ?? null, enTout: totaux.value?.retireesEnTout ?? null }));

const optionsLigues = computed(() => optionsDesChampionnats(props.reponse, { favorisEnPremier: (l) => favoris.favoritesFirst(l, { league: (o) => o.league }), estFavori: (nom) => favoris.isFavoriteLeague(nom) }));
const optionsEquipes = computed(() =>
  optionsDesEquipes(props.reponse, ligue.value, {
    favorisEnPremier: (l) => favoris.favoritesFirst(l, { teams: (o) => [[o.label, ligue.value, o.value]] }),
    estFavorite: (nom, league, id) => favoris.isFavoriteTeam(nom, league, id)
  })
);
const equipeChoisie = computed(() => equipeDeLIndex(props.reponse, equipe.value));
const iconeDeLaNote = (ton) => (ton === 'is-danger' ? 'x' : ton === 'is-warning' ? 'alert' : 'info');
const section = SECTIONS.dossiers;

/** Un clic sur l'équipe ou le championnat qui garde une leçon ouvre son dossier, juste dessous. */
async function ouvrir(portee) {
  if (!portee) return;
  ligue.value = portee.league ?? AUCUN;
  await nextTick();
  equipe.value = portee.genre === 'equipe' ? portee.id : AUCUN;
}
</script>

<template>
  <AppCard class="mem" :icon="section.icone" :eyebrow="section.eyebrow" :title="section.titre" :subtitle="section.sousTitre" :data-etat="etat.cle" data-bloc="dossiers-ia">
    <template #actions>
      <AppButton variant="secondary" size="sm" :loading="chargement" @click="emit('relire')">
        <template #icon><AppIcon name="refresh" :size="14" /></template>
        Relire
      </AppButton>
    </template>

    <div class="mem__corps" :class="{ 'is-busy': chargement && reponse }" :aria-busy="chargement">
      <LoadingSpinner v-if="etat.cle === 'chargement'" label="Lecture des dossiers…" />

      <div v-if="etat.texte && etat.cle !== 'chargement'" class="cm-note" :class="etat.ton" :data-raison="etat.cle">
        <span class="cm-icon-box" :class="etat.ton === 'is-danger' ? 'is-danger' : etat.ton === 'is-warning' ? 'is-warning' : 'is-info'"><AppIcon :name="iconeDeLaNote(etat.ton)" :size="16" /></span>
        <div>
          <p class="cm-note__title">{{ etat.titre }}</p>
          <p class="cm-note__text mem__texte">{{ etat.texte }}</p>
        </div>
      </div>
      <div v-if="erreur && reponse" class="cm-note is-danger" data-raison="relecture">
        <span class="cm-icon-box is-danger is-sm"><AppIcon name="alert" :size="14" /></span>
        <div>
          <p class="cm-note__title">Lecture impossible — derniers dossiers affichés</p>
          <p class="cm-note__text mem__texte">{{ erreur }}</p>
        </div>
      </div>

      <div class="mem__entete">
        <ProvenanceChip :source="provenance.source" :releve-le="provenance.releveLe" :action="provenance.action" :fichier="provenance.fichier" :detail="provenance.detail" :vieux-apres-heures="72" />
        <span class="mem__petit" data-resume>{{ resume }}</span>
      </div>

      <!-- 1. Les leçons confirmées par le carnet, de toutes les portées. -->
      <h4 class="cm-group-title mem__groupe">
        Leçons confirmées par le carnet
        <HelpTip
          titre="Comment une leçon entre"
          texte="Après chaque match, l’IA écrit une leçon par marché. Le code ne la garde que si le carnet de l’IA la confirme sur les matchs SUIVANTS de l’équipe ou du championnat (au moins 3 matchs pour une équipe, 10 pour un championnat, un écart net et plus grand que le hasard). Si les matchs suivants la démentent, elle est retirée pour de bon. Chaque leçon garde sa date et son match d’origine."
        />
      </h4>
      <div class="cm-table-wrap">
        <table class="cm-table mem__table" data-tableau="lecons-confirmees">
          <thead>
            <tr>
              <th class="is-left">Jour</th>
              <th class="is-left">Match d’origine</th>
              <th class="is-left">Marché et pronostic</th>
              <th class="is-left">Leçon</th>
              <th class="is-left">Ce que le carnet a vu</th>
              <th class="is-left">Gardée par</th>
              <th>Confirmée le</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in confirmees" :key="l.cle" :data-portee="l.porteeGenre">
              <td class="is-left">{{ l.jour }}</td>
              <td class="is-left mem__match">
                <span class="mem__equipe"><TeamCrest :name="l.home" :league="l.league" :team-id="l.homeId" :size="14" /><span>{{ l.home }}</span></span>
                <span class="mem__equipe"><TeamCrest :name="l.away" :league="l.league" :team-id="l.awayId" :size="14" /><span>{{ l.away }}</span></span>
              </td>
              <td class="is-left">{{ l.marche }} : {{ l.pronostic }}</td>
              <td class="is-left mem__lecon">« {{ l.texte }} »</td>
              <td class="is-left mem__petit-texte">{{ l.sens }} — {{ l.preuve }}</td>
              <td class="is-left">
                <button v-if="l.portee?.genre === 'equipe'" type="button" class="cm-link mem__portee" :title="`Ouvrir le dossier de ${l.portee.nom}`" @click="ouvrir(l.portee)">
                  <TeamCrest :name="l.portee.nom" :league="l.portee.league" :team-id="l.portee.id" :size="14" /><span>{{ l.portee.nom }}</span>
                </button>
                <button v-else-if="l.portee" type="button" class="cm-link mem__portee" :title="`Ouvrir le dossier du championnat ${l.portee.league}`" @click="ouvrir(l.portee)">
                  <LeagueBadge :league="l.portee.league" />
                </button>
                <span v-else class="mem__petit-texte">portée inconnue</span>
              </td>
              <td>{{ l.confirmeeLe }}</td>
            </tr>
            <tr v-if="!confirmees.length">
              <td class="is-left mem__vide" colspan="7" data-vide="confirmees">aucune leçon confirmée pour l’instant</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td class="is-left is-strong">Σ Total</td>
              <td colspan="6" class="is-strong">{{ piedConfirmees.sigma }}</td>
            </tr>
            <tr>
              <td class="is-left mem__moyenne">⌀ Moyenne</td>
              <td colspan="6" class="mem__moyenne">{{ piedConfirmees.moyenne }}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- 2. Les leçons retirées. -->
      <h4 class="cm-group-title mem__groupe">Leçons retirées</h4>
      <div class="cm-table-wrap">
        <table class="cm-table mem__table" data-tableau="lecons-retirees">
          <thead>
            <tr>
              <th class="is-left">Jour</th>
              <th class="is-left">Match d’origine</th>
              <th class="is-left">Marché et pronostic</th>
              <th class="is-left">Pourquoi</th>
              <th class="is-left">Gardée par</th>
              <th>Retirée le</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in retirees" :key="l.cle" :data-portee="l.porteeGenre">
              <td class="is-left">{{ l.jour }}</td>
              <td class="is-left mem__match">
                <span class="mem__equipe"><TeamCrest :name="l.home" :league="l.league" :team-id="l.homeId" :size="14" /><span>{{ l.home }}</span></span>
                <span class="mem__equipe"><TeamCrest :name="l.away" :league="l.league" :team-id="l.awayId" :size="14" /><span>{{ l.away }}</span></span>
              </td>
              <td class="is-left">{{ l.marche }} : {{ l.pronostic }}</td>
              <td class="is-left mem__petit-texte">{{ l.raison }} — {{ l.preuve }}</td>
              <td class="is-left">
                <span v-if="l.portee?.genre === 'equipe'" class="mem__equipe"><TeamCrest :name="l.portee.nom" :league="l.portee.league" :team-id="l.portee.id" :size="14" /><span>{{ l.portee.nom }}</span></span>
                <LeagueBadge v-else-if="l.portee" :league="l.portee.league" />
                <span v-else class="mem__petit-texte">portée inconnue</span>
              </td>
              <td>{{ l.retireeLe }}</td>
            </tr>
            <tr v-if="!retirees.length">
              <td class="is-left mem__vide" colspan="6" data-vide="retirees">aucune leçon retirée</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td class="is-left is-strong">Σ Total</td>
              <td colspan="5" class="is-strong">{{ piedRetirees.sigma }}</td>
            </tr>
            <tr>
              <td class="is-left mem__moyenne">⌀ Moyenne</td>
              <td colspan="5" class="mem__moyenne">{{ piedRetirees.moyenne }}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- 3. Ouvrir un dossier : un championnat, puis une équipe. -->
      <h4 class="cm-group-title mem__groupe">Ouvrir un dossier</h4>
      <div class="cm-toolbar mem__choix">
        <AppSelect v-model="ligue" label="Championnat" :options="optionsLigues" class="mem__champ" />
        <AppSelect v-model="equipe" label="Équipe" :options="optionsEquipes" :disabled="!ligue" placeholder="Choisir un championnat d’abord" class="mem__champ" />
      </div>
      <div v-if="!ligue" class="cm-note is-info" data-raison="sans-choix">
        <span class="cm-icon-box is-info"><AppIcon name="info" :size="16" /></span>
        <div>
          <p class="cm-note__title">Quel dossier lire ?</p>
          <p class="cm-note__text mem__texte">Choisissez un championnat pour lire le sien, puis une équipe pour lire le sien — ou cliquez sur l’équipe ou le championnat qui garde une leçon, dans le premier tableau.</p>
        </div>
      </div>
      <AiDossierCard v-else-if="equipe" :club-id="equipe" :club-name="equipeChoisie?.nom ?? ''" :league="ligue" />
      <AiDossierCard v-else portee="championnat" :league="ligue" />
    </div>
  </AppCard>
</template>

<style scoped>
.mem__corps {
  container: mem / inline-size;
  display: flex;
  flex-direction: column;
  gap: 14px;
  transition: opacity var(--cm-transition);
}

.mem__corps.is-busy {
  opacity: 0.7;
}

.mem__entete {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
}

.mem__texte {
  font-size: 12.5px;
  color: var(--cm-text-secondary);
}

.mem__petit {
  font-size: 12px;
  line-height: 1.5;
  color: var(--cm-text-muted);
}

.mem__petit-texte {
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--cm-text-secondary);
}

.mem__table th,
.mem__table td {
  font-size: 12px;
  white-space: normal;
  vertical-align: top;
}

.mem__match {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 150px;
}

.mem__equipe {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.mem__lecon {
  min-width: 220px;
  font-style: italic;
  color: var(--cm-text-primary);
}

.mem__portee {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.mem__vide {
  color: var(--cm-text-muted);
}

.mem__moyenne {
  color: var(--cm-text-secondary);
}

.mem__choix {
  align-items: flex-end;
  flex-wrap: wrap;
}

.mem__champ {
  flex: 1 1 240px;
  max-width: 420px;
}
</style>
