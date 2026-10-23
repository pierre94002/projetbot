<script setup>
/**
 * Le MEILLEUR MOMENT POUR PARIER (étape 31 du plan, 22/10/2026), tel que l'étape 22 l'a mesuré
 * (data/marketKnowledge.js) : tôt (l'ouverture, ou le relevé du vendredi / mardi), après les compositions, ou juste
 * avant le coup d'envoi — chaque moment comparé à la clôture par la VALEUR DE CLÔTURE (cote prise × probabilité juste
 * de clôture − 1, pour une issue prise au hasard). Trois parties :
 *   1. pour le championnat choisi : la conclusion, la valeur de clôture de chaque moment, et les comparaisons « tôt
 *      contre tard » jugées par le juge de l'étape 16 ;
 *   2. championnat par championnat : la conclusion de chacun, de quoi choisir (un clic le lit plus haut).
 *
 * Tout est LU (props : les lignes et le résumé de GET /api/market-knowledge) ; rien n'est calculé ici. Les tableaux
 * restent TOUJOURS affichés, même sans mesure. Aucun vert, aucun rouge : une valeur de clôture négative est la marge
 * du bookmaker, pas une erreur. Les mots viennent de utils/bookmakers.js.
 */
import { computed } from 'vue';
import AppCard from '@/components/common/AppCard.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import LeagueBadge from '@/components/matches/LeagueBadge.vue';
import { useFavoritesStore } from '@/stores/favoritesStore.js';
import { MOMENTS, PORTEE_TOUS, conclusionDe, lignesDesChampionnats, meilleurMomentDuChampionnat } from '@/utils/bookmakers.js';

const props = defineProps({
  portee: { type: String, default: PORTEE_TOUS },
  nom: { type: String, default: 'Tous les championnats' },
  lignes: { type: Object, default: () => ({}) },
  resume: { type: Object, default: null },
  championnats: { type: Array, default: () => [] },
  provenance: { type: Object, default: null },
  /** Le texte d'une ligne vide : « pas encore mesuré », ou « lecture en cours ». */
  vide: { type: String, default: 'pas encore mesuré' },
  /** Vrai seulement quand les chiffres du championnat sont lus : une case vide peut alors dire POURQUOI ; sinon elle dit `vide`. */
  calculLu: { type: Boolean, default: false }
});
const emit = defineEmits(['choisir']);

const favoris = useFavoritesStore();
const momentChoisi = computed(() => meilleurMomentDuChampionnat({ lignes: props.lignes }));
// Sans comparaison (aucun match comparé, ou rien de lu) : la puce ne dit PAS « pas de moment meilleur prouvé » — ce
// serait dire qu'on a comparé et rien trouvé.
const conclusion = computed(() =>
  momentChoisi.value.mesure ? conclusionDe(momentChoisi.value.conclusion.cle) : { court: props.calculLu ? 'Trop peu de matchs pour juger' : 'Pas mesuré', precision: '', icone: 'info' }
);
const tableau = computed(() =>
  lignesDesChampionnats(
    { resume: props.resume, championnats: props.championnats, selection: props.portee },
    { favorisEnPremier: (liste) => favoris.favoritesFirst(liste, { league: (l) => (l.horsAppli ? null : l.portee) }), estFavori: (portee) => favoris.isFavoriteLeague(portee) }
  )
);
const TYPES = Object.freeze({ favori: 'un favori', nul: 'un match nul', outsider: 'un outsider' });
const parTypeTexte = computed(() =>
  Object.entries(momentChoisi.value.parType)
    .filter(([, v]) => v)
    .map(([cle, v]) => ({ cle, pour: TYPES[cle], phrase: v.phrase, conclusion: conclusionDe(v.conclusion) }))
);
const nombre = (n) => Number(n ?? 0).toLocaleString('fr-FR');
</script>

<template>
  <AppCard
    class="mmc"
    icon="clock"
    eyebrow="Meilleur moment"
    title="Quand parier ?"
    subtitle="Tôt (à l’ouverture ou au relevé du vendredi ou du mardi), après les compositions, ou juste avant le coup d’envoi : le moment où la cote est la plus intéressante, comparée à la clôture, championnat par championnat"
    data-bloc="meilleur-moment"
    :data-portee="portee"
  >
    <div class="mmc__corps">

      <!-- 1. Pour le championnat choisi. -->
      <p class="mmc__nom">{{ nom }}</p>
      <div class="mmc__conclusion" data-conclusion>
        <span class="cm-chip is-section mmc__chip"><AppIcon :name="conclusion.icone" :size="12" />{{ conclusion.court }}</span>
        <p class="mmc__phrase">
          <template v-if="momentChoisi.mesure">
            {{ momentChoisi.conclusion.phrase.replace(/^./, (c) => c.toUpperCase()) }}.
            <span class="mmc__petit-texte">Sur {{ nombre(momentChoisi.conclusion.n) }} matchs comparés ; {{ conclusion.precision }}.</span>
          </template>
          <template v-else-if="calculLu">Pas mesuré : trop peu de cotes archivées et datées dans ce championnat pour comparer les moments.</template>
          <template v-else>Pas mesuré : {{ vide }}.</template>
        </p>
      </div>
      <ul v-if="parTypeTexte.length" class="mmc__types" data-types>
        <li v-for="t in parTypeTexte" :key="t.cle">
          <span class="cm-chip"><AppIcon :name="t.conclusion.icone" :size="11" />Pour {{ t.pour }}</span>
          <span>{{ t.phrase.replace(/^./, (c) => c.toUpperCase()) }}</span>
        </li>
      </ul>

      <h4 class="cm-group-title mmc__groupe">
        La valeur de clôture de chaque moment
        <HelpTip
          titre="La valeur de clôture"
          texte="On prend la cote d’un moment, on la multiplie par la probabilité juste de la clôture (la dernière cote avant le coup d’envoi, marge retirée), et on retire 1 : c’est ce que vaut, en moyenne, un pari d’un euro pris à ce moment, jugé avec l’information de la dernière minute. Elle est négative presque partout : c’est la marge du bookmaker. Le meilleur moment est celui où elle est la moins négative — si l’écart dépasse le hasard."
        />
      </h4>
      <div class="cm-table-wrap mmc__wrap">
        <table class="cm-table mmc__table" data-tableau="valeurs">
          <thead>
            <tr>
              <th class="is-left">Moment</th>
              <th title="Les matchs comparés à ce moment">Matchs</th>
              <th title="Valeur de clôture moyenne d’un pari d’une unité sur une issue prise au hasard">Valeur de clôture</th>
              <th title="Sur le favori du match">Favori</th>
              <th title="Sur le match nul">Nul</th>
              <th title="Sur l’outsider">Outsider</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="v in momentChoisi.valeurs" :key="v.moment" :class="{ 'is-vide': !v.mesure }">
              <td class="is-left is-strong" :title="MOMENTS[v.moment].long">{{ v.libelle }}</td>
              <template v-if="v.mesure">
                <td class="cm-numeric">{{ nombre(v.n) }}</td>
                <td class="cm-numeric is-strong">{{ v.texte }}</td>
                <td class="cm-numeric">{{ v.issuesTexte.favori }}</td>
                <td class="cm-numeric">{{ v.issuesTexte.nul }}</td>
                <td class="cm-numeric">{{ v.issuesTexte.outsider }}</td>
              </template>
              <td v-else class="is-left mmc__vide" colspan="5">{{ calculLu ? 'pas mesuré : pas de relevé daté à ce moment dans ce championnat' : vide }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td class="is-left is-strong">Σ Total<small class="mmc__petit">{{ momentChoisi.pied.texte.valeursSigma }}</small></td>
              <td class="mmc__moyenne" colspan="5">les mêmes matchs servent à plusieurs moments : pas de somme de matchs ni de valeurs</td>
            </tr>
            <tr>
              <td class="is-left mmc__moyenne">⌀ Moyenne<small class="mmc__petit">des moments mesurés</small></td>
              <td class="mmc__moyenne"></td>
              <td class="cm-numeric mmc__moyenne">{{ momentChoisi.pied.texte.valeursMoyenne }}</td>
              <td class="cm-numeric mmc__moyenne">{{ momentChoisi.pied.texte.issuesMoyenne.favori }}</td>
              <td class="cm-numeric mmc__moyenne">{{ momentChoisi.pied.texte.issuesMoyenne.nul }}</td>
              <td class="cm-numeric mmc__moyenne">{{ momentChoisi.pied.texte.issuesMoyenne.outsider }}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <h4 class="cm-group-title mmc__groupe">Tôt contre tard, jugé par le hasard</h4>
      <div class="cm-table-wrap mmc__wrap">
        <table class="cm-table mmc__table" data-tableau="comparaisons">
          <thead>
            <tr>
              <th class="is-left">Comparaison</th>
              <th title="Les matchs où les deux moments sont cotés">Matchs</th>
              <th title="Valeur de clôture du moment tard moins celle du moment tôt, en points : positif, plus tard vaut mieux">Écart</th>
              <th title="Fourchette à 95 %, élargie par le nombre de comparaisons essayées">Fourchette</th>
              <th class="is-left">Verdict</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in momentChoisi.comparaisons" :key="`${c.tot}|${c.tard}`" :class="{ 'is-vide': !c.mesuree }">
              <td class="is-left is-strong">{{ c.libelle }}</td>
              <td class="cm-numeric">{{ c.n === null ? 'non lu' : nombre(c.n) }}</td>
              <td class="cm-numeric">{{ c.ecartTexte }}</td>
              <td class="cm-numeric">{{ c.fourchette ?? 'non mesurée' }}</td>
              <td class="is-left" :title="c.mesuree || calculLu ? c.titre : vide"><span class="cm-chip" :class="c.ton">{{ c.mesuree || calculLu ? c.dit : vide }}</span></td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td class="is-left is-strong" colspan="2">Σ Total<small class="mmc__petit">{{ momentChoisi.pied.texte.comparaisonsSigma }}</small></td>
              <td class="mmc__moyenne" colspan="3">jamais de somme d’écarts : la moyenne est sur la ligne suivante</td>
            </tr>
            <tr>
              <td class="is-left mmc__moyenne" colspan="2">⌀ Moyenne<small class="mmc__petit">écart moyen des comparaisons mesurées</small></td>
              <td class="cm-numeric mmc__moyenne">{{ momentChoisi.pied.texte.comparaisonsMoyenne }}</td>
              <td class="mmc__moyenne" colspan="2"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- 2. Championnat par championnat. -->
      <h4 class="cm-group-title mmc__groupe">
        Championnat par championnat
        <HelpTip
          titre="Lire cette liste"
          texte="Pour chaque championnat, le moment qui donne la meilleure cote, d’après ses propres matchs. « Pas de moment meilleur prouvé » ne veut pas dire que tous se valent : l’écart peut venir du hasard, ou le championnat n’a pas assez de relevés datés. Cliquez sur un championnat pour lire ses chiffres plus haut."
        />
      </h4>
      <div class="cm-table-wrap mmc__wrap mmc__wrap--haut">
        <table class="cm-table mmc__table" data-tableau="championnats">
          <thead>
            <tr>
              <th class="is-left">Championnat</th>
              <th class="is-left">Mieux vaut parier…</th>
              <th title="Le plus grand nombre de matchs réunis dans une comparaison tôt / tard de ce championnat">Matchs comparés</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in tableau.lignes" :key="l.portee" :class="{ 'is-choisi': l.choisi, 'is-favori': l.favori }" :data-portee="l.portee">
              <td class="is-left is-strong">
                <button type="button" class="mmc__choisir" :aria-pressed="l.choisi" :title="`Lire les chiffres de ${l.nom}`" @click="emit('choisir', l.portee)">
                  <LeagueBadge v-if="!l.tous && !l.horsAppli" :league="l.portee" />
                  <span v-else class="cm-truncate">{{ l.nom }}</span>
                </button>
              </td>
              <td class="is-left" :title="l.mesure || calculLu ? l.phrase : vide">
                <span class="cm-chip" :class="l.mesure && l.cle !== 'aucune' ? 'is-section' : ''"><AppIcon :name="l.icone" :size="11" />{{ l.mesure || calculLu ? l.conclusion : vide }}</span>
                <small v-if="l.mesure || calculLu" class="mmc__petit">{{ l.precision }}</small>
              </td>
              <td class="cm-numeric">{{ l.n === null ? 'non mesuré' : nombre(l.n) }}</td>
            </tr>
            <tr v-if="tableau.lignes.length <= 1">
              <td class="is-left mmc__vide" colspan="3">{{ vide === 'lecture en cours' ? vide : 'Aucun autre championnat mesuré pour l’instant.' }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td class="is-left is-strong">Σ Total<small class="mmc__petit">{{ tableau.pied.texte.sigma }}</small></td>
              <td class="is-left mmc__sigma">{{ tableau.pied.texte.repartition }}</td>
              <td class="cm-numeric is-strong" title="La somme des plus grandes comparaisons de chaque championnat : un match n’est que dans un seul championnat, aucun n’est compté deux fois. Ce n’est pas le chiffre de « Tous les championnats », qui compte une seule comparaison à la fois.">{{ tableau.pied.texte.matchs }}</td>
            </tr>
            <tr>
              <td class="is-left mmc__moyenne">⌀ Moyenne<small class="mmc__petit">par championnat mesuré (« Tous les championnats » n’y est pas)</small></td>
              <td class="mmc__moyenne"></td>
              <td class="cm-numeric mmc__moyenne">{{ tableau.pied.texte.moyenne }}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div class="mmc__pied">
        <ProvenanceChip
          v-if="provenance"
          variante="ligne"
          :source="provenance.source"
          :releve-le="provenance.releveLe"
          :action="provenance.action"
          :fichier="provenance.fichier"
          :detail="provenance.detail"
          :vieux-apres-heures="48"
        />
      </div>
    </div>
  </AppCard>
</template>

<style scoped>
.mmc {
  container: mmc / inline-size;
}

.mmc__corps {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mmc__nom {
  margin: 0;
  font-size: 12px;
  color: var(--cm-text-muted);
}

.mmc__conclusion {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 14px;
  padding: 12px 16px;
  border-radius: var(--cm-radius-md);
  border: 1px solid rgba(var(--cm-section-rgb) / 0.3);
  background: linear-gradient(180deg, rgba(var(--cm-section-rgb) / 0.1), transparent), var(--cm-surface-alt);
}

.mmc__chip {
  font-size: 13px;
}

.mmc__phrase {
  flex: 1 1 260px;
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.45;
  color: var(--cm-text-primary);
}

.mmc__petit-texte {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  font-weight: 500;
  color: var(--cm-text-muted);
}

.mmc__types {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.mmc__types li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--cm-text-secondary);
}

.mmc__types li .cm-chip {
  flex-shrink: 0;
}

.mmc__groupe {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 6px 0 0;
}

.mmc__wrap {
  max-height: 420px;
}

.mmc__wrap--haut {
  max-height: 560px;
}

.mmc__table td {
  vertical-align: top;
}

.mmc__table tr.is-vide td {
  color: var(--cm-text-muted);
}

.mmc__petit {
  display: block;
  margin-top: 3px;
  font-size: 11px;
  font-weight: 500;
  color: var(--cm-text-muted);
  white-space: normal;
}

.mmc__vide {
  color: var(--cm-text-secondary);
  white-space: normal;
}

.mmc__sigma {
  white-space: normal;
  font-size: 12px;
  font-weight: 700;
  color: var(--cm-text-primary);
}

.mmc__moyenne {
  color: var(--cm-text-muted);
  white-space: normal;
}

/* Le championnat regardé plus haut : marqué par sa couleur de section, jamais par le vert. */
.mmc__table tr.is-choisi td {
  background: rgba(var(--cm-section-rgb) / 0.12);
}

.mmc__table tr.is-favori td:first-child {
  box-shadow: inset 3px 0 0 var(--cm-gold);
}

.mmc__choisir {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-weight: 700;
  color: var(--cm-text-primary);
  cursor: pointer;
}

.mmc__choisir:hover {
  color: var(--cm-section);
}

.mmc__choisir:focus-visible {
  outline: 2px solid var(--cm-section);
  outline-offset: 2px;
  border-radius: 4px;
}

.mmc__pied {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
