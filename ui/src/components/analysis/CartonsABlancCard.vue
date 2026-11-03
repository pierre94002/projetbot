<script setup>
/**
 * LA CARTE « CARTONS ATTENDUS — À BLANC » de la page d'un match à venir (étape 33 du plan, lot 1b, partie D, 02/11/2026).
 *
 * Onglet Statistiques, juste après « Corners et tirs attendus » (le moteur, inchangé : aucune ligne « à blanc » n'y est
 * ajoutée — critique de l'étape 33, recommandation 4). Les cartons attendus de chaque équipe (barres face à face), puis
 * cinq lignes TOUJOURS là — équipes, championnat, arbitre, enjeu, corners et tirs par championnat —, chacune avec sa
 * pastille, sa vraie provenance (la source et l'heure) et, quand elle manque, sa raison. « Explication seulement » (gris)
 * par défaut ; « Effet mesuré » (le seul vert) pour une famille que le banc d'essai a prouvée utile — « pas encore un
 * marché » pour les cartons, « pas encore dans le pourcentage » pour corners et tirs. Les lignes du total (« plus de… »)
 * seulement si les cartons des équipes sont utiles au banc, avec « ni un pronostic, ni une cote juste ».
 *
 * AUCUNE requête : il lit ce que la page a déjà — le bloc `cartons` de l'analyse, la page FotMob du match (l'arbitre
 * désigné et sa ligne dans la table des cartons) et le bloc `simulation` (l'enjeu vit dans son encadré : la ligne y
 * renvoie). Une seule place : aucune famille « Cartons » dans les pronostics, aucun pourcentage à blanc des corners et
 * des tirs, les moyennes brutes de l'arbitre restent dans « Contexte du match ».
 * Les mots viennent de utils/cartonsABlanc.js (pur, rejoué par server/test/cartonsEcran.test.mjs).
 */
import { computed } from 'vue';
import AppCard from '@/components/common/AppCard.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import TeamCrest from '@/components/matches/TeamCrest.vue';
import LeagueBadge from '@/components/matches/LeagueBadge.vue';
import MatchupHeader from '@/components/matches/MatchupHeader.vue';
import MatchStatBars from '@/components/matches/MatchStatBars.vue';
import { cartonsDit } from '@/utils/cartonsABlanc.js';

const props = defineProps({
  /** Le bloc `cartons` de l'analyse ; undefined : un serveur d'avant l'étape 33. */
  cartons: { type: Object, default: undefined },
  /** L'état de l'analyse : { loading, error, result }. */
  analyse: { type: Object, default: null },
  /** La page FotMob du match : { loading, error, data }. */
  page: { type: Object, default: null },
  /** Le bloc `simulation` de l'analyse (étape 28). */
  simulation: { type: Object, default: null },
  /** Le match : { home, away, league, homeId, awayId }. */
  match: { type: Object, default: null }
});

const dit = computed(() => cartonsDit({ cartons: props.cartons, analyse: props.analyse, page: props.page, simulation: props.simulation, match: props.match }));
const iconeDeLaNote = (ton) => (ton === 'is-danger' ? 'x' : ton === 'is-warning' ? 'alert' : 'info');
const ancienApres = (p) => (p.vieuxApresHeures === null ? null : undefined);
const idDe = (camp) => {
  const id = props.cartons?.clubs?.[camp]?.id ?? null;
  return id === null || id === undefined ? props.match?.[`${camp}Id`] ?? null : `fotmob-${id}`;
};
const nomDe = (camp) => props.cartons?.clubs?.[camp]?.nom ?? props.match?.[camp] ?? '';
const ligue = computed(() => props.cartons?.ligue?.league ?? props.cartons?.statsParChampionnat?.league ?? props.match?.league ?? null);
</script>

<template>
  <AppCard
    class="cab"
    :title="dit.enTete.titre"
    :subtitle="dit.enTete.sousTitre"
    icon="cards"
    :eyebrow="dit.enTete.eyebrow"
    data-bloc="cartons-a-blanc"
    :data-etat="dit.etat.cle"
  >
    <template #actions>
      <HelpTip
        titre="Cartons attendus"
        texte="Calculés chaque nuit depuis le magasin FotMob : les cartons que chaque équipe prend et fait prendre sur ses 20 derniers matchs relevés, la moyenne et la tendance du championnat, et l’effet de l’arbitre désigné. Mesurés une fois au banc d’essai, avec un seuil sévère : « Effet mesuré » veut dire mesuré utile, pas encore un marché ni un pronostic."
      />
    </template>
    <div class="cab__corps">
      <LoadingSpinner v-if="dit.etat.cle === 'chargement'" label="Lecture des cartons attendus…" />
      <div v-else-if="dit.etat.texte" class="cm-note" :class="dit.etat.ton" :data-raison="dit.etat.cle">
        <span class="cm-icon-box" :class="dit.etat.ton === 'is-danger' ? 'is-danger' : dit.etat.ton === 'is-warning' ? 'is-warning' : 'is-info'"><AppIcon :name="iconeDeLaNote(dit.etat.ton)" :size="16" /></span>
        <div>
          <p class="cm-note__title">{{ dit.etat.titre }}</p>
          <p class="cm-note__text">{{ dit.etat.texte }}</p>
        </div>
      </div>

      <!-- Les cartons attendus de chaque équipe, face à face, et la pastille du modèle. -->
      <template v-if="dit.barres && match">
        <MatchupHeader :home="nomDe('home')" :away="nomDe('away')" :home-id="idDe('home')" :away-id="idDe('away')" :league="ligue" label="par match" />
        <MatchStatBars :group="dit.barres.group" :home="dit.barres.home" :away="dit.barres.away" data-cartons="barres" />
      </template>
      <div class="cab__modele" data-cartons="modele">
        <span class="cab__pastille" :class="`is-${dit.modele.pastille.cle}`" role="note" :aria-label="dit.modele.aria" :data-pastille="dit.modele.pastille.cle">
          <AppIcon :name="dit.modele.pastille.vert ? 'check' : 'info'" :size="12" />{{ dit.modele.pastille.libelle }}
        </span>
        <span v-if="dit.modele.pastille.sous" class="cab__sous">{{ dit.modele.pastille.sous }}</span>
        <p v-if="dit.modele.banc" class="cab__banc is-mesure" data-cartons="banc-du-modele"><AppIcon name="shield" :size="12" /><span>{{ dit.modele.banc }}</span></p>
      </div>

      <!-- Les cinq lignes : toujours là, chacune avec sa pastille, ses phrases, ses mentions, ce que dit le banc, sa provenance. -->
      <ul class="cab__lignes">
        <li v-for="l in dit.lignes" :key="l.cle" class="cab__ligne" :data-ligne="l.cle">
          <div class="cab__tete">
            <span class="cm-icon-box is-sm is-muted"><AppIcon :name="l.icone" :size="14" /></span>
            <span class="cab__titre">{{ l.titre }}</span>
            <span v-if="l.crests === 'les-deux'" class="cab__crests">
              <TeamCrest :name="nomDe('home')" :league="ligue" :team-id="idDe('home')" :size="16" />
              <TeamCrest :name="nomDe('away')" :league="ligue" :team-id="idDe('away')" :size="16" />
            </span>
            <LeagueBadge v-else-if="l.crests === 'ligue' && ligue" :league="ligue" class="cab__ligue" />
            <template v-if="l.pastille">
              <span class="cab__pastille" :class="`is-${l.pastille.cle}`" role="note" :aria-label="l.aria" :data-pastille="l.pastille.cle">
                <AppIcon :name="l.pastille.vert ? 'check' : 'info'" :size="12" />{{ l.pastille.libelle }}
              </span>
              <span v-if="l.pastille.sous" class="cab__sous">{{ l.pastille.sous }}</span>
            </template>
          </div>
          <div v-if="l.pastilles" class="cab__pastilles" role="note" :aria-label="l.aria">
            <span v-for="p in l.pastilles" :key="p.stat" class="cab__pastille" :class="`is-${p.cle}`" :data-pastille="p.cle" :data-stat="p.stat">
              <AppIcon :name="p.vert ? 'check' : 'info'" :size="12" />{{ p.mot }} : {{ p.libelle }}<template v-if="p.sous"> · {{ p.sous }}</template>
            </span>
          </div>
          <p v-if="l.pastille?.note" class="cab__dementi" data-cartons="dementi"><AppIcon name="alert" :size="12" />{{ l.pastille.note }}</p>
          <p v-for="(p, i) in l.phrases" :key="i" class="cab__phrase" :title="p.titre ?? undefined">{{ p.texte }}</p>
          <ul v-if="l.mentions.length" class="cab__mentions">
            <li v-for="m in l.mentions" :key="m">{{ m }}</li>
          </ul>
          <p v-if="l.banc" class="cab__banc" :class="{ 'is-mesure': l.pastille?.vert }" data-cartons="banc"><AppIcon name="shield" :size="12" /><span>{{ l.banc }}</span></p>
          <div v-if="l.provenances.length" class="cab__provenances">
            <ProvenanceChip
              v-for="(p, i) in l.provenances"
              :key="i"
              :source="p.source"
              :releve-le="p.releveLe"
              :action="p.action"
              :fichier="p.fichier ?? null"
              :detail="p.detail ?? null"
              :vieux-apres-heures="ancienApres(p)"
              variante="ligne"
            >
              <template v-if="p.jourSeul" #quand>{{ p.action }} le {{ p.jourSeul }}</template>
              <template v-else-if="p.quand" #quand="{ ancien, ilYA }">{{ p.quand }}<template v-if="ancien"> · {{ ilYA }}</template></template>
            </ProvenanceChip>
          </div>
        </li>
      </ul>

      <!-- Les lignes du total : seulement si les cartons des équipes sont utiles au banc. -->
      <div v-if="dit.total.montre" class="cm-table-wrap cab__wrap">
        <table class="cm-table cab__table" data-tableau="total-des-cartons">
          <thead>
            <tr>
              <th>Total des cartons</th>
              <th v-for="t in dit.total.lignes" :key="t.ligne">{{ t.titre }}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="cab__case-texte">À blanc</td>
              <td v-for="t in dit.total.lignes" :key="t.ligne" class="cm-numeric">{{ t.p }}</td>
            </tr>
          </tbody>
        </table>
        <p class="cab__petit" data-cartons="pied-du-total">{{ dit.total.pied }}</p>
      </div>

      <ul class="cab__fixes" data-cartons="mentions">
        <li v-for="m in dit.mentions" :key="m">{{ m }}</li>
      </ul>

      <details class="cab__details" data-cartons="banc-d-essai">
        <summary class="cab__resume"><AppIcon name="shield" :size="13" />Ce que dit le banc d’essai</summary>
        <div class="cm-table-wrap cab__wrap">
          <table class="cm-table cab__table" data-tableau="banc-des-cartons">
            <thead>
              <tr>
                <th>Ce qui a été comparé</th>
                <th>Matchs jugés</th>
                <th>Erreur en moins (fourchette)</th>
                <th>Annoncé face au réalisé (avant → après)</th>
                <th>Verdict</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="t in dit.tableau.lignes" :key="t.cle" :data-ligne="t.cle">
                <td class="cab__case-texte">{{ t.quoi }}</td>
                <td class="cm-numeric">{{ t.matchs }}</td>
                <td class="cm-numeric">{{ t.gain }}</td>
                <td class="cm-numeric">{{ t.calibration }}</td>
                <td>
                  <span v-if="t.mesureUtile" class="cab__pastille is-mesure" role="note" :aria-label="`${t.quoi} : effet mesuré`"><AppIcon name="check" :size="12" />Effet mesuré</span>
                  <span v-else class="cab__verdict">{{ t.verdict }}</span>
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td class="cab__case-texte">Ensemble</td>
                <td class="cm-numeric">{{ dit.tableau.somme }}</td>
                <td></td>
                <td class="cm-numeric">{{ dit.tableau.moyenne }}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p class="cab__petit" data-cartons="pied-du-banc">{{ dit.tableau.pied }}</p>
        <p class="cab__petit">{{ dit.tableau.preuve }}</p>
      </details>

      <details v-if="dit.tableauChampionnats.lignes.length" class="cab__details" data-cartons="reglages-par-championnat">
        <summary class="cab__resume"><AppIcon name="target" :size="13" />Réglages par championnat (à blanc)</summary>
        <div class="cm-table-wrap cab__wrap">
          <table class="cm-table cab__table" data-tableau="reglages-par-championnat">
            <thead>
              <tr>
                <th>Championnat</th>
                <th>Matchs</th>
                <th>Corners dom. / ext.</th>
                <th>Tirs dom. / ext.</th>
                <th>Tirs cadrés dom. / ext.</th>
                <th>Réglage</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in dit.tableauChampionnats.lignes" :key="c.league" :data-ligne="c.league">
                <td class="cab__case-texte"><span class="cab__ligue-cellule"><LeagueBadge :league="c.league" /></span></td>
                <td class="cm-numeric">{{ c.matchs }}</td>
                <td class="cm-numeric">{{ c.corners }}</td>
                <td class="cm-numeric">{{ c.tirs }}</td>
                <td class="cm-numeric">{{ c.cadres }}</td>
                <td>{{ c.propre }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td class="cab__case-texte">Ensemble</td>
                <td class="cm-numeric">{{ dit.tableauChampionnats.somme }}</td>
                <td colspan="4" class="cab__case-texte">{{ dit.tableauChampionnats.moyenne }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </details>
    </div>
  </AppCard>
</template>

<style scoped>
.cab__corps {
  container: cab / inline-size;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cab__modele {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
}

.cab__lignes {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.cab__ligne {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
  padding: 10px 12px;
  border-radius: var(--cm-radius-md);
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
}

.cab__tete {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
}

.cab__titre {
  font-size: 13px;
  font-weight: 700;
  color: var(--cm-text-primary);
}

.cab__crests {
  display: inline-flex;
  gap: 3px;
}

/* La pastille : gris « Explication seulement » ; « Effet mesuré » en vert, la seule exception (DESIGN.md). */
.cab__pastille {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 9px;
  border-radius: 999px;
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface);
  color: var(--cm-text-secondary);
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.cab__pastille.is-mesure {
  color: var(--cm-accent);
  border-color: var(--cm-accent);
}

.cab__pastilles {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 6px;
}

.cab__sous {
  font-size: 11px;
  color: var(--cm-text-muted);
}

.cab__phrase {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--cm-text-primary);
}

.cab__mentions,
.cab__fixes {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0 0 0 14px;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--cm-text-muted);
}

.cab__dementi {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin: 0;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--cm-warning);
}

.cab__banc {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--cm-text-muted);
}

.cab__banc.is-mesure {
  color: var(--cm-text-secondary);
}

.cab__banc :deep(svg) {
  flex-shrink: 0;
  margin-top: 2px;
}

.cab__provenances {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
}

.cab__details {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cab__resume {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  color: var(--cm-section);
}

.cab__wrap {
  margin-top: 4px;
}

.cab__case-texte {
  white-space: normal;
  text-align: left;
  min-width: 160px;
  color: var(--cm-text-secondary);
}

.cab__ligue-cellule {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.cab__verdict {
  font-size: 11.5px;
  color: var(--cm-text-secondary);
  white-space: normal;
}

.cab__petit {
  margin: 6px 0 0;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--cm-text-muted);
}

/* Assez de place : deux lignes côte à côte. */
@container cab (min-width: 820px) {
  .cab__lignes {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
