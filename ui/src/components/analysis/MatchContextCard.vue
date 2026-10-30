<script setup>
/**
 * L'ENCADRÉ « CONTEXTE DU MATCH » de la page d'un match à venir (étape 32 du plan, partie D, 29/10/2026).
 *
 * Ce qui entoure le match, en neuf lignes TOUJOURS là — repos, enchaînement, déplacement, altitude, pelouse, météo,
 * arbitre, entraîneur, enjeu —, chacune avec sa pastille, sa vraie provenance (la source et l'heure) et, quand elle
 * manque, sa raison. « Explication seulement » (gris) par défaut ; « Effet mesuré » (le seul vert) pour un facteur que
 * le banc d'essai a prouvé utile — « pas encore dans le pourcentage » : rien n'entre dans les chiffres avant le lot 2 et
 * votre accord. Le tableau « Ce que dit le banc d'essai », replié, dit chaque mesure.
 *
 * AUCUNE requête : il lit ce que la page a déjà — le bloc `contexte` de l'analyse (la fiche de la nuit et les statuts du
 * banc), la page FotMob du match (météo prévue, pelouse, arbitre désigné et sa ligne au magasin) et le bloc `simulation`
 * (l'enjeu vit dans son propre encadré : cette ligne y renvoie). Une seule place par information : la carte « Rencontre »
 * ne montre plus pelouse, météo ni arbitre sur cette page, ni « Actualités d'équipe » le changement d'entraîneur.
 * Les mots viennent de utils/contexteDuMatch.js (pur, rejoué par server/test/contexteEcran.test.mjs).
 */
import { computed } from 'vue';
import AppCard from '@/components/common/AppCard.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import { contexteDit } from '@/utils/contexteDuMatch.js';

const props = defineProps({
  /** Le bloc `contexte` de l'analyse ; undefined : un serveur d'avant l'étape 32. */
  contexte: { type: Object, default: undefined },
  /** L'état de l'analyse : { loading, error }. */
  analyse: { type: Object, default: null },
  /** La page FotMob du match : { loading, error, data }. */
  page: { type: Object, default: null },
  /** Le bloc `simulation` de l'analyse (étape 28). */
  simulation: { type: Object, default: null },
  /** Le match : { home, away, league }. */
  match: { type: Object, default: null }
});

const dit = computed(() => contexteDit({ contexte: props.contexte, analyse: props.analyse, page: props.page, simulation: props.simulation, match: props.match }));
const iconeDeLaNote = (ton) => (ton === 'is-danger' ? 'x' : ton === 'is-warning' ? 'alert' : 'info');
const ancienApres = (p) => (p.vieuxApresHeures === null ? null : undefined);
</script>

<template>
  <AppCard
    class="mcc"
    title="Contexte du match"
    subtitle="Ce qui entoure le match, et ce qui compte dans le pourcentage."
    icon="globe"
    eyebrow="Explication"
    data-bloc="contexte-du-match"
    :data-etat="dit.etat.cle"
  >
    <template #actions>
      <HelpTip
        titre="Contexte du match"
        texte="Calculé chaque nuit pour les matchs des 14 prochains jours, depuis le magasin FotMob, le calendrier de saison et la table des stades ; la météo, la pelouse du match et l’arbitre viennent de la page FotMob du match. Chaque facteur a été mesuré une fois au banc d’essai, avec un seuil sévère : « Effet mesuré » veut dire mesuré utile, pas encore dans les pourcentages."
      />
    </template>
    <div class="mcc__corps">
      <p class="mcc__ouverture" data-contexte="ouverture">{{ dit.ouverture }}</p>

      <LoadingSpinner v-if="dit.etat.cle === 'chargement'" label="Lecture du contexte…" />
      <div v-else-if="dit.etat.texte" class="cm-note" :class="dit.etat.ton" :data-raison="dit.etat.cle">
        <span class="cm-icon-box" :class="dit.etat.ton === 'is-danger' ? 'is-danger' : dit.etat.ton === 'is-warning' ? 'is-warning' : 'is-info'"><AppIcon :name="iconeDeLaNote(dit.etat.ton)" :size="16" /></span>
        <div>
          <p class="cm-note__title">{{ dit.etat.titre }}</p>
          <p class="cm-note__text">{{ dit.etat.texte }}</p>
        </div>
      </div>

      <!-- Les neuf lignes : toujours là, chacune avec sa pastille, sa phrase, ses mentions, ce que dit le banc, sa provenance. -->
      <ul class="mcc__lignes">
        <li v-for="l in dit.lignes" :key="l.facteur" class="mcc__ligne" :data-facteur="l.facteur" :data-concerne="l.concerne === null ? 'sans-objet' : String(l.concerne)">
          <div class="mcc__tete">
            <span class="cm-icon-box is-sm is-muted"><AppIcon :name="l.icone" :size="14" /></span>
            <span class="mcc__titre">{{ l.titre }}</span>
            <span class="mcc__pastille" :class="`is-${l.pastille.cle}`" role="note" :aria-label="l.aria" :data-pastille="l.pastille.cle">
              <AppIcon :name="l.pastille.vert ? 'check' : 'info'" :size="12" />{{ l.pastille.libelle }}
            </span>
            <span v-if="l.pastille.sous" class="mcc__sous">{{ l.pastille.sous }}</span>
          </div>
          <p v-if="l.pastille.note" class="mcc__dementi" data-contexte="dementi"><AppIcon name="alert" :size="12" />{{ l.pastille.note }}</p>
          <p v-for="(p, i) in l.phrases" :key="i" class="mcc__phrase" :title="p.titre ?? undefined">{{ p.texte }}</p>
          <ul v-if="l.mentions.length" class="mcc__mentions">
            <li v-for="m in l.mentions" :key="m">{{ m }}</li>
          </ul>
          <p v-if="l.banc" class="mcc__banc" :class="{ 'is-mesure': l.pastille.vert }" data-contexte="banc">
            <AppIcon name="shield" :size="12" /><span>{{ l.banc }}</span>
          </p>
          <div v-if="l.provenances.length" class="mcc__provenances">
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

      <!-- Le pied : la fiche, la page FotMob, la table des stades ; puis le banc d'essai, replié. -->
      <footer v-if="dit.pied.length" class="mcc__pied">
        <ProvenanceChip
          v-for="p in dit.pied"
          :key="p.cle"
          :source="p.source"
          :releve-le="p.releveLe"
          :action="p.action"
          :fichier="p.fichier ?? null"
          :vieux-apres-heures="ancienApres(p)"
          variante="ligne"
        >
          <template v-if="p.jourSeul" #quand>{{ p.action }} le {{ p.jourSeul }}</template>
          <template v-else-if="p.quand" #quand="{ ancien, ilYA }">{{ p.quand }}<template v-if="ancien"> · {{ ilYA }}</template></template>
        </ProvenanceChip>
      </footer>

      <details class="mcc__details" data-contexte="banc-d-essai">
        <summary class="mcc__resume"><AppIcon name="shield" :size="13" />Ce que dit le banc d’essai</summary>
        <div class="cm-table-wrap mcc__wrap">
          <table class="cm-table mcc__table" data-tableau="banc-du-contexte">
            <thead>
              <tr>
                <th>Facteur</th>
                <th>Ce qui a été mesuré</th>
                <th>Matchs jugés</th>
                <th>Part des matchs</th>
                <th>Gain (fourchette)</th>
                <th>Verdict</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="t in dit.tableau.lignes" :key="t.cle" :data-ligne="t.cle">
                <td class="mcc__case-facteur">{{ t.facteur }}</td>
                <td class="mcc__case-texte">{{ t.mesure }}</td>
                <td class="cm-numeric">{{ t.matchs }}</td>
                <td class="cm-numeric">{{ t.part }}</td>
                <td class="cm-numeric">{{ t.gain }}</td>
                <td>
                  <span v-if="t.mesureUtile" class="mcc__pastille is-mesure" role="note" :aria-label="`${t.facteur} : effet mesuré`"><AppIcon name="check" :size="12" />Effet mesuré</span>
                  <span v-else class="mcc__verdict">{{ t.verdict }}</span>
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td colspan="2" class="mcc__case-texte">{{ dit.tableau.portee }}</td>
                <td class="cm-numeric">{{ dit.tableau.somme }}</td>
                <td class="cm-numeric">{{ dit.tableau.moyenne }}</td>
                <td colspan="2"></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p class="mcc__petit" data-contexte="pied-du-banc">{{ dit.tableau.pied }}</p>
        <p class="mcc__petit">{{ dit.tableau.preuve }}</p>
      </details>
    </div>
  </AppCard>
</template>

<style scoped>
.mcc__corps {
  container: mcc / inline-size;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mcc__ouverture {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
}

.mcc__lignes {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.mcc__ligne {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
  padding: 10px 12px;
  border-radius: var(--cm-radius-md);
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
}

.mcc__tete {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
}

.mcc__titre {
  font-size: 13px;
  font-weight: 700;
  color: var(--cm-text-primary);
}

/* La pastille : gris « Explication seulement » ; « Effet mesuré » en vert, la seule exception (DESIGN.md). */
.mcc__pastille {
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

.mcc__pastille.is-mesure,
.mcc__pastille.is-compte {
  color: var(--cm-accent);
  border-color: var(--cm-accent);
}

.mcc__sous {
  font-size: 11px;
  color: var(--cm-text-muted);
}

.mcc__phrase {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--cm-text-primary);
}

.mcc__mentions {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0 0 0 14px;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--cm-text-muted);
}

.mcc__dementi {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin: 0;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--cm-warning);
}

.mcc__banc {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--cm-text-muted);
}

.mcc__banc.is-mesure {
  color: var(--cm-text-secondary);
}

.mcc__banc :deep(svg) {
  flex-shrink: 0;
  margin-top: 2px;
}

.mcc__provenances,
.mcc__pied {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
}

.mcc__pied {
  padding-top: 8px;
  border-top: 1px solid var(--cm-border-soft);
}

.mcc__details {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mcc__resume {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  color: var(--cm-section);
}

.mcc__wrap {
  margin-top: 8px;
}

.mcc__case-facteur {
  font-weight: 700;
  color: var(--cm-text-primary);
}

.mcc__case-texte {
  white-space: normal;
  text-align: left;
  min-width: 180px;
  color: var(--cm-text-secondary);
}

.mcc__verdict {
  font-size: 11.5px;
  color: var(--cm-text-secondary);
  white-space: normal;
}

.mcc__petit {
  margin: 6px 0 0;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--cm-text-muted);
}

/* Assez de place : deux lignes côte à côte. */
@container mcc (min-width: 820px) {
  .mcc__lignes {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
