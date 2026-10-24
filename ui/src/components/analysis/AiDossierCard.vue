<script setup>
/**
 * Le bloc « MÉMOIRE DE L'IA » de la page d'une équipe (étape 44 du plan, 23/10/2026) : le dossier que le CODE tient
 * pour ce club — faits du moment, forme, absents connus, entraîneur, style, et les leçons que le carnet de l'IA a
 * confirmées sur plusieurs matchs (avec leur date et leur match d'origine) —, celui de son championnat, et ce que
 * l'IA en lit avant chaque analyse. Réutilisé par la page « Bulletin » (étape 45).
 *
 * Tout est LU (GET /api/match-ai-analysis/dossiers?club=…, écrit chaque nuit par l'actualisation) : rien n'est calculé
 * à l'ouverture, aucun appel payant, jamais Claude. Le bloc reste TOUJOURS affiché, tableaux compris (Σ et ⌀), même
 * vide ; il montre sa vraie provenance et l'heure de mise à jour. Le club est reconnu par son identifiant FotMob.
 * Les mots viennent du serveur (les mêmes que ceux que l'IA lit) et de utils/dossiersIA.js (pur, rejoué par
 * server/test/aiMemoireEcran.test.mjs).
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
import { matchAiAnalysisApi } from '@/services/matchAiAnalysisApi.js';
import {
  jourDit,
  etatDuDossier,
  etatDuDossierChampionnat,
  provenanceDuDossier,
  lignesDeForme,
  lignesDesLecons,
  lignesDesRetirees,
  lignesDesAbsents,
  texteLuParLIA,
  REGLE_DU_DOSSIER
} from '@/utils/dossiersIA.js';

const props = defineProps({
  /** L'identifiant FotMob du club (« fotmob-8456 ») ; sans lui, le bloc le dit et garde ses tableaux. */
  clubId: { type: String, default: null },
  clubName: { type: String, default: '' },
  /** 'equipe' (défaut) : le dossier d'un club et, dessous, celui de son championnat. 'championnat' : celui d'un championnat seul (page « Bulletin », étape 45). */
  portee: { type: String, default: 'equipe' },
  league: { type: String, default: null }
});
const soloChampionnat = computed(() => props.portee === 'championnat');

const etat = ref({ loading: false, error: null, data: null });

/** Le dossier d'un championnat seul : la même route, par son nom. Une réponse arrivée après un changement de championnat est ignorée. */
async function chargerChampionnat() {
  const ligue = props.league;
  if (!ligue) {
    etat.value = { loading: false, error: null, data: null };
    return;
  }
  etat.value = { ...etat.value, loading: true, error: null };
  try {
    const data = await matchAiAnalysisApi.dossierChampionnat(ligue);
    if (props.league === ligue && soloChampionnat.value) etat.value = { loading: false, error: null, data };
  } catch (error) {
    if (props.league === ligue && soloChampionnat.value) etat.value = { loading: false, error: error.message, data: null };
  }
}

async function charger() {
  if (soloChampionnat.value) return chargerChampionnat();
  const club = props.clubId;
  if (!club) {
    etat.value = { loading: false, error: null, data: null };
    return;
  }
  etat.value = { ...etat.value, loading: true, error: null };
  try {
    const data = await matchAiAnalysisApi.dossierEquipe(club);
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

watch(
  () => [props.league, props.portee],
  (apres, avant) => {
    if (!soloChampionnat.value || (apres[0] === avant[0] && apres[1] === avant[1])) return;
    etat.value = { loading: false, error: null, data: null };
    charger();
  }
);

const reponse = computed(() => etat.value.data);
const lu = computed(() =>
  soloChampionnat.value
    ? etatDuDossierChampionnat({ chargement: etat.value.loading, erreur: etat.value.error, reponse: reponse.value, league: props.league })
    : etatDuDossier({ chargement: etat.value.loading, erreur: etat.value.error, reponse: reponse.value, clubId: props.clubId })
);
const pret = computed(() => lu.value.cle === 'pret');
const dossier = computed(() => (pret.value ? reponse.value?.dossier ?? null : null));
const phrases = computed(() => (pret.value ? reponse.value?.phrases ?? null : null));
const champ = computed(() => (reponse.value?.etat === 'lu' || reponse.value?.etat === 'autreVersion' ? reponse.value?.championnat ?? null : null));
const phrasesChamp = computed(() => (champ.value ? reponse.value?.phrasesChampionnat ?? null : null));
const provenance = computed(() => provenanceDuDossier(reponse.value));
const forme = computed(() => lignesDeForme(dossier.value));
const absents = computed(() => lignesDesAbsents(dossier.value));
const lecons = computed(() => lignesDesLecons(dossier.value?.lecons, phrases.value?.preuves));
const retirees = computed(() => lignesDesRetirees(dossier.value?.lecons, phrases.value?.preuves));
const leconsChamp = computed(() => lignesDesLecons(champ.value?.lecons, phrasesChamp.value?.preuves));
const luParIA = computed(() => texteLuParLIA(pret.value ? reponse.value : null));
const championnat = computed(() => dossier.value?.league ?? props.league ?? null);
const iconeDeLaNote = (ton) => (ton === 'is-danger' ? 'x' : ton === 'is-warning' ? 'alert' : 'info');
</script>

<template>
  <AppCard
    class="aid"
    icon="sparkles"
    eyebrow="Écrit par le code chaque nuit · lu par l’IA seule"
    title="Mémoire de l’IA"
    subtitle="Le dossier que l’IA relit avant chaque analyse : faits du moment, forme, absents, entraîneur, style, et les leçons que son carnet a confirmées"
    :data-etat="lu.cle"
    :data-portee="portee"
    data-bloc="memoire-ia"
  >
    <template #actions>
      <AppButton variant="secondary" size="sm" :loading="etat.loading" :disabled="soloChampionnat ? !league : !clubId" @click="charger">
        <template #icon><AppIcon name="refresh" :size="13" /></template>
        Relire
      </AppButton>
    </template>

    <div class="aid__corps">
      <!-- 0. Le club (logo) et son championnat — ou, pour un championnat seul, son badge. -->
      <p v-if="soloChampionnat" class="aid__club" data-portee-ligue>
        <span class="cm-chip aid__ligue"><LeagueBadge :league="league" /></span>
      </p>
      <p v-else class="aid__club">
        <TeamCrest :name="clubName" :league="championnat" :team-id="clubId" :size="26" />
        <strong class="cm-truncate">{{ dossier?.nom ?? clubName }}</strong>
        <span v-if="championnat" class="cm-chip aid__ligue"><LeagueBadge :league="championnat" /></span>
      </p>

      <LoadingSpinner v-if="lu.cle === 'chargement'" label="Lecture du dossier…" />

      <div v-if="lu.texte && lu.cle !== 'chargement'" class="cm-note" :class="lu.ton" :data-raison="lu.cle">
        <span class="cm-icon-box" :class="lu.ton === 'is-danger' ? 'is-danger' : lu.ton === 'is-warning' ? 'is-warning' : 'is-info'"><AppIcon :name="iconeDeLaNote(lu.ton)" :size="16" /></span>
        <div>
          <p class="cm-note__title">{{ lu.titre }}</p>
          <p class="cm-note__text aid__texte">{{ lu.texte }}</p>
        </div>
      </div>

      <!-- 1. D'où ça vient. -->
      <div class="aid__entete">
        <ProvenanceChip :source="provenance.source" :releve-le="provenance.releveLe" :action="provenance.action" :fichier="provenance.fichier" :detail="provenance.detail" :vieux-apres-heures="72" />
        <span v-if="dossier?.jusquAu" class="aid__petit-texte">Matchs pris en compte jusqu’au {{ jourDit(dossier.jusquAu) }}</span>
        <span v-else-if="soloChampionnat && champ?.jusquAu" class="aid__petit-texte">Matchs pris en compte jusqu’au {{ jourDit(champ.jusquAu) }}</span>
      </div>

      <!-- 2 à 6. Les morceaux d'un club : faits, forme, absents, leçons confirmées et retirées (pas pour un championnat seul). -->
      <template v-if="!soloChampionnat">
      <!-- 2. Les faits du moment. -->
      <h4 class="cm-group-title aid__groupe">Faits du moment</h4>
      <ul class="aid__faits" data-dossier="faits">
        <li data-fait="classement"><AppIcon name="trophy" :size="13" /><span>{{ phrases?.classement ?? 'Classement : pas de table officielle FotMob où ce club figure.' }}</span></li>
        <li data-fait="series"><AppIcon name="activity" :size="13" /><span>{{ phrases?.series?.length ? `Séries en cours : ${phrases.series.join(', ')}.` : 'Séries en cours : aucune qui se remarque.' }}</span></li>
        <li data-fait="entraineur"><AppIcon name="users" :size="13" /><span>{{ phrases?.entraineur ?? 'Entraîneur : inconnu des compositions relevées.' }}</span></li>
        <li data-fait="style"><AppIcon name="target" :size="13" /><span>{{ phrases?.style ?? 'Style de jeu : pas encore lu (moins de 6 matchs de championnat relevés).' }}</span></li>
        <li v-if="phrases?.carnet" data-fait="carnet"><AppIcon name="award" :size="13" /><span>{{ phrases.carnet }}</span></li>
      </ul>

      <!-- 3. La forme. -->
      <h4 class="cm-group-title aid__groupe">
        Forme
        <HelpTip titre="Lire ce tableau" texte="Ses 10 derniers matchs, toutes compétitions, du plus récent au plus ancien (les matchs attribués sans jeu ne comptent pas). La phrase compare les points par match des 5 derniers à ceux des 5 d’avant." />
      </h4>
      <p class="aid__texte" data-dossier="forme">{{ phrases?.forme ?? 'Aucun match relevé dans les 400 derniers jours.' }}</p>
      <div class="cm-table-wrap">
        <table class="cm-table aid__table" data-tableau="forme">
          <thead>
            <tr>
              <th class="is-left">Jour</th>
              <th class="is-left">Adversaire</th>
              <th class="is-left">Compétition</th>
              <th>Lieu</th>
              <th>Score</th>
              <th>Issue</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in forme.lignes" :key="m.cle">
              <td class="is-left">{{ m.jour }}</td>
              <td class="is-left aid__equipe"><TeamCrest :name="m.adversaire" :league="m.league" :team-id="m.adversaireId" :size="16" /><span>{{ m.adversaire }}</span></td>
              <td class="is-left"><LeagueBadge :league="m.league" /></td>
              <td>{{ m.lieu }}</td>
              <td class="cm-numeric">{{ m.score }}</td>
              <td>{{ m.issueDite }}</td>
            </tr>
            <tr v-if="!forme.lignes.length">
              <td class="is-left aid__vide" colspan="6">aucun match relevé</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td class="is-left is-strong">Σ Total</td>
              <td colspan="5" class="is-strong">{{ forme.pied.sigma }}</td>
            </tr>
            <tr>
              <td class="is-left aid__moyenne">⌀ Moyenne</td>
              <td colspan="5" class="aid__moyenne">{{ forme.pied.moyenne }}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- 4. Les absents connus. -->
      <h4 class="cm-group-title aid__groupe">Absents connus</h4>
      <p class="aid__petit-texte aid__absents-lus">
        <span>{{ absents.lus }}</span>
      </p>
      <div class="cm-table-wrap">
        <table class="cm-table aid__table" data-tableau="absents">
          <thead>
            <tr>
              <th class="is-left">Joueur</th>
              <th class="is-left">Motif</th>
              <th class="is-left">Retour annoncé</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in absents.lignes" :key="a.cle">
              <td class="is-left aid__equipe"><TeamCrest :name="dossier?.nom ?? clubName" :league="championnat" :team-id="clubId" :size="14" /><span>{{ a.nom }}</span></td>
              <td class="is-left">{{ a.motif }}</td>
              <td class="is-left">{{ a.retour }}</td>
            </tr>
            <tr v-if="!absents.lignes.length">
              <td class="is-left aid__vide" colspan="3">aucun absent annoncé</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td class="is-left is-strong">Σ Total</td>
              <td colspan="2" class="is-strong">{{ absents.pied.sigma }}</td>
            </tr>
            <tr>
              <td class="is-left aid__moyenne">⌀ Moyenne</td>
              <td colspan="2" class="aid__moyenne">{{ absents.pied.moyenne }}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- 5. Les leçons confirmées par le carnet. -->
      <h4 class="cm-group-title aid__groupe">
        Leçons confirmées par le carnet
        <HelpTip
          titre="Comment une leçon entre"
          texte="Après chaque match, l’IA écrit une leçon par marché. Le code ne la garde que si le carnet de l’IA la confirme sur les matchs SUIVANTS de ce club (au moins 3, un écart net et plus grand que le hasard). Si les matchs suivants la démentent, elle est retirée pour de bon. Chaque leçon garde sa date et son match d’origine."
        />
      </h4>
      <div class="cm-table-wrap">
        <table class="cm-table aid__table" data-tableau="lecons">
          <thead>
            <tr>
              <th class="is-left">Jour</th>
              <th class="is-left">Match d’origine</th>
              <th class="is-left">Marché et pronostic</th>
              <th class="is-left">Leçon</th>
              <th class="is-left">Ce que le carnet a vu</th>
              <th>Confirmée le</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in lecons.lignes" :key="l.cle">
              <td class="is-left">{{ l.jour }}</td>
              <td class="is-left aid__match">
                <span class="aid__equipe"><TeamCrest :name="l.home" :league="l.league" :team-id="l.homeId" :size="14" /><span>{{ l.home }}</span></span>
                <span class="aid__equipe"><TeamCrest :name="l.away" :league="l.league" :team-id="l.awayId" :size="14" /><span>{{ l.away }}</span></span>
              </td>
              <td class="is-left">{{ l.marche }} : {{ l.pronostic }}</td>
              <td class="is-left aid__lecon">« {{ l.texte }} »</td>
              <td class="is-left aid__petit-texte">{{ l.sens }} — {{ l.preuve }}</td>
              <td>{{ l.confirmeeLe }}</td>
            </tr>
            <tr v-if="!lecons.lignes.length">
              <td class="is-left aid__vide" colspan="6">aucune leçon confirmée pour l’instant</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td class="is-left is-strong">Σ Total</td>
              <td colspan="5" class="is-strong">{{ lecons.pied.sigma }}</td>
            </tr>
            <tr>
              <td class="is-left aid__moyenne">⌀ Moyenne</td>
              <td colspan="5" class="aid__moyenne">{{ lecons.pied.moyenne }}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- 6. Les leçons retirées. -->
      <h4 class="cm-group-title aid__groupe">Leçons retirées</h4>
      <div class="cm-table-wrap">
        <table class="cm-table aid__table" data-tableau="retirees">
          <thead>
            <tr>
              <th class="is-left">Jour</th>
              <th class="is-left">Match d’origine</th>
              <th class="is-left">Marché et pronostic</th>
              <th class="is-left">Pourquoi</th>
              <th>Retirée le</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in retirees.lignes" :key="l.cle">
              <td class="is-left">{{ l.jour }}</td>
              <td class="is-left aid__match">
                <span class="aid__equipe"><TeamCrest :name="l.home" :league="l.league" :team-id="l.homeId" :size="14" /><span>{{ l.home }}</span></span>
                <span class="aid__equipe"><TeamCrest :name="l.away" :league="l.league" :team-id="l.awayId" :size="14" /><span>{{ l.away }}</span></span>
              </td>
              <td class="is-left">{{ l.marche }} : {{ l.pronostic }}</td>
              <td class="is-left aid__petit-texte">{{ l.raison }} — {{ l.preuve }}</td>
              <td>{{ l.retireeLe }}</td>
            </tr>
            <tr v-if="!retirees.lignes.length">
              <td class="is-left aid__vide" colspan="5">aucune leçon retirée</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td class="is-left is-strong">Σ Total</td>
              <td colspan="4" class="is-strong">{{ retirees.pied.sigma }}</td>
            </tr>
            <tr>
              <td class="is-left aid__moyenne">⌀ Moyenne</td>
              <td colspan="4" class="aid__moyenne">{{ retirees.pied.moyenne }}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      </template>

      <!-- 7. Son championnat (ou le championnat seul). -->
      <h4 class="cm-group-title aid__groupe">
        {{ soloChampionnat ? 'Le championnat' : 'Son championnat' }}
        <span v-if="championnat" class="cm-chip"><LeagueBadge :league="championnat" /></span>
      </h4>
      <section class="cm-block aid__champ" data-dossier="championnat">
        <p class="aid__texte">{{ phrasesChamp?.profil ?? 'Repères de la saison : pas encore mesurés pour cette compétition.' }}</p>
        <ul v-if="champ?.tete?.length" class="aid__tete">
          <li v-for="(t, i) in champ.tete" :key="t.id ?? t.nom">
            <span class="aid__rang">{{ i + 1 }}</span>
            <TeamCrest :name="t.nom" :league="championnat" :team-id="t.id" :size="16" />
            <strong class="aid__petit-nom">{{ t.nom }}</strong>
            <span class="aid__petit-texte">{{ t.points }} pts</span>
          </li>
        </ul>
        <p class="aid__texte">{{ phrasesChamp?.carnet ?? 'Carnet de l’IA : aucun avis compté dans ce championnat.' }}</p>
      </section>
      <div class="cm-table-wrap">
        <table class="cm-table aid__table" data-tableau="lecons-championnat">
          <thead>
            <tr>
              <th class="is-left">Jour</th>
              <th class="is-left">Match d’origine</th>
              <th class="is-left">Marché et pronostic</th>
              <th class="is-left">Leçon</th>
              <th class="is-left">Ce que le carnet a vu</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in leconsChamp.lignes" :key="l.cle">
              <td class="is-left">{{ l.jour }}</td>
              <td class="is-left aid__match">
                <span class="aid__equipe"><TeamCrest :name="l.home" :league="l.league" :team-id="l.homeId" :size="14" /><span>{{ l.home }}</span></span>
                <span class="aid__equipe"><TeamCrest :name="l.away" :league="l.league" :team-id="l.awayId" :size="14" /><span>{{ l.away }}</span></span>
              </td>
              <td class="is-left">{{ l.marche }} : {{ l.pronostic }}</td>
              <td class="is-left aid__lecon">« {{ l.texte }} »</td>
              <td class="is-left aid__petit-texte">{{ l.sens }} — {{ l.preuve }}</td>
            </tr>
            <tr v-if="!leconsChamp.lignes.length">
              <td class="is-left aid__vide" colspan="5">aucune leçon de championnat confirmée</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td class="is-left is-strong">Σ Total</td>
              <td colspan="4" class="is-strong">{{ leconsChamp.pied.sigma }}</td>
            </tr>
            <tr>
              <td class="is-left aid__moyenne">⌀ Moyenne</td>
              <td colspan="4" class="aid__moyenne">{{ leconsChamp.pied.moyenne }}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- 8. Ce que l'IA en lit. -->
      <details v-if="!soloChampionnat" class="aid__ia" data-dossier="lu-par-ia">
        <summary>Ce que l’IA lit de ce dossier · {{ luParIA.resume }}</summary>
        <pre v-if="luParIA.texte" class="aid__pre">{{ luParIA.texte }}</pre>
      </details>

      <!-- 9. La règle. -->
      <p class="aid__pied" data-regle>
        <AppIcon name="shield" :size="12" />
        <span>{{ REGLE_DU_DOSSIER }}</span>
      </p>
    </div>
  </AppCard>
</template>

<style scoped>
.aid {
  container: aid / inline-size;
}

.aid__corps {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.aid__club {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  font-size: 14px;
  color: var(--cm-text-primary);
}

.aid__ligue {
  max-width: 100%;
}

.aid__entete {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
}

.aid__texte {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
}

.aid__petit-texte {
  font-size: 11.5px;
  color: var(--cm-text-muted);
}

.aid__absents-lus {
  margin: 0;
}

.aid__groupe {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 6px 0 0;
}

.aid__faits {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
}

.aid__faits li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.aid__faits :deep(svg) {
  flex-shrink: 0;
  margin-top: 3px;
  color: var(--cm-section);
}

.aid__table td {
  vertical-align: top;
}

.aid__equipe {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.aid__match {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.aid__lecon {
  min-width: 220px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--cm-text-primary);
}

.aid__vide {
  font-size: 11px;
  color: var(--cm-text-muted);
}

.aid__moyenne {
  color: var(--cm-text-muted);
}

.aid__champ {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.aid__tete {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.aid__tete li {
  display: flex;
  align-items: center;
  gap: 6px;
}

.aid__rang {
  min-width: 16px;
  font-size: 12px;
  font-weight: 700;
  color: var(--cm-text-muted);
}

.aid__petit-nom {
  font-size: 12px;
  color: var(--cm-text-primary);
}

.aid__ia summary {
  cursor: pointer;
  font-size: 12px;
  color: var(--cm-text-secondary);
}

.aid__pre {
  margin: 8px 0 0;
  padding: 10px 12px;
  border-radius: var(--cm-radius-sm);
  background: var(--cm-surface-alt);
  font-family: inherit;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--cm-text-secondary);
}

.aid__pied {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--cm-text-muted);
}

.aid__pied :deep(svg) {
  flex-shrink: 0;
  margin-top: 3px;
}

@container aid (max-width: 520px) {
  .aid__lecon {
    min-width: 160px;
  }
}
</style>
