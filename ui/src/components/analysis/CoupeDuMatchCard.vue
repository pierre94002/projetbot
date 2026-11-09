<script setup>
/**
 * L'ENCADRÉ « COUPE » de la page d'un match à venir (étape 36 du plan, lot 1, 09/11/2026).
 *
 * Pour un match de coupe seulement, entre l'encadré « Enjeu » (étape 28) et « Contexte du match » (étape 32) : le tour en
 * français, le score de l'aller et ce qu'il faut à chacun, la chance de se qualifier (le 1N2 de cette page sur 90 minutes,
 * le cumul, puis pile ou face), la règle d'après 90 minutes de la compétition, les tirs au but (pile ou face : votre
 * décision), le lieu, l'avance au cumul (non mesurée) et la phrase « 90 minutes ». TOUJOURS les huit lignes, chacune avec sa
 * pastille « Explication seulement » (gris : jamais de vert sur la chance de la page), sa vraie provenance et le logo des
 * clubs qu'elle nomme. Sous la chance, une ligne grise dit ce que la calibration a trouvé sur les matchs passés.
 *
 * AUCUNE requête : il lit le bloc `coupe` que le serveur joint à l'analyse et la page FotMob déjà chargée (son tour). Les
 * mots viennent de utils/coupeDuMatch.js (pur, rejoué par server/test/coupesEcran.test.mjs).
 */
import { computed } from 'vue';
import AppCard from '@/components/common/AppCard.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import TeamCrest from '@/components/matches/TeamCrest.vue';
import { lignesDeLaCoupe } from '@/utils/coupeDuMatch.js';

const props = defineProps({
  /** Le bloc `coupe` de l'analyse ; undefined : un serveur d'avant l'étape 36 ; null : pas un match de coupe. */
  coupe: { type: Object, default: undefined },
  /** La page FotMob du match : { loading, error, data }. */
  page: { type: Object, default: null },
  /** L'état de l'analyse : { loading, error }. */
  analyse: { type: Object, default: null },
  /** Le match : { home, away, league }. */
  match: { type: Object, default: null }
});

const dit = computed(() => lignesDeLaCoupe({ coupe: props.coupe, page: props.page, analyse: props.analyse }));
const iconeDeLaNote = (ton) => (ton === 'is-warning' ? 'alert' : 'info');
</script>

<template>
  <AppCard
    v-if="dit.montre"
    class="cdm"
    :title="dit.titre"
    :subtitle="dit.sousTitre"
    icon="trophy"
    :eyebrow="dit.surTitre"
    data-bloc="coupe"
    :data-etat="dit.etat?.cle"
    :data-nature="dit.nature?.valeur ?? null"
  >
    <template #actions>
      <HelpTip
        titre="Coupe"
        texte="Calculé chaque nuit depuis le magasin FotMob (tours, matchs aller, règle d’après 90 minutes de chaque coupe, stades habituels des clubs), puis, à l’ouverture de la page, sur le 1N2 qu’elle affiche. Rien de ceci n’entre dans les pronostics, la value ou le pari conseillé."
      />
    </template>
    <div class="cdm__corps">
      <LoadingSpinner v-if="dit.etat?.cle === 'chargement'" label="Lecture de la coupe…" />
      <div v-else-if="dit.etat?.texte" class="cm-note" :class="dit.etat.ton" :data-raison="dit.etat.cle">
        <span class="cm-icon-box" :class="dit.etat.ton === 'is-warning' ? 'is-warning' : 'is-info'"><AppIcon :name="iconeDeLaNote(dit.etat.ton)" :size="16" /></span>
        <div>
          <p class="cm-note__title">{{ dit.etat.titre }}</p>
          <p class="cm-note__text">{{ dit.etat.texte }}</p>
        </div>
      </div>

      <!-- Les huit lignes : toujours là, chacune avec sa pastille, ses phrases, ses mentions, le logo des clubs qu'elle nomme, sa provenance. -->
      <ul v-if="dit.lignes?.length" class="cdm__lignes">
        <li v-for="l in dit.lignes" :key="l.cle" class="cdm__ligne" :data-ligne="l.cle">
          <div class="cdm__tete">
            <span class="cdm__titre">{{ l.titre }}</span>
            <span class="cdm__pastille" role="note" :aria-label="`${l.titre} : ${l.pastille.libelle}${l.pastille.sous ? `, ${l.pastille.sous}` : ''}`" :data-pastille="l.pastille.cle">
              <AppIcon name="info" :size="12" />{{ l.pastille.libelle }}
            </span>
            <span v-if="l.pastille.sous" class="cdm__sous">{{ l.pastille.sous }}</span>
            <span v-if="l.clubs.length" class="cdm__logos" data-logos="clubs">
              <TeamCrest v-for="c in l.clubs" :key="`${l.cle}-${c.teamId ?? c.nom}`" :name="c.nom" :team-id="c.teamId" :league="match?.league ?? null" :size="20" />
            </span>
          </div>
          <p v-for="(p, i) in l.phrases" :key="i" class="cdm__phrase">{{ p }}</p>
          <div v-if="l.barres" class="cdm__barres" role="img" :aria-label="l.phrases[0]" data-barres="chance">
            <span class="cdm__barre cdm__barre--dom" :style="{ width: `${l.barres.dom}%` }" />
            <span class="cdm__barre cdm__barre--ext" :style="{ width: `${l.barres.ext}%` }" />
          </div>
          <ul v-if="l.mentions.length" class="cdm__mentions">
            <li v-for="m in l.mentions" :key="m">{{ m }}</li>
          </ul>
          <p v-if="l.cle === 'chance'" class="cdm__calibration" data-ligne-calibration="chance"><AppIcon name="shield" :size="12" /><span>{{ dit.ligneCalibration }}</span></p>
          <div v-if="l.provenances.length" class="cdm__provenances">
            <ProvenanceChip
              v-for="(p, i) in l.provenances"
              :key="i"
              :source="p.source"
              :releve-le="p.releveLe"
              :action="p.action"
              :vieux-apres-heures="p.vieux ?? undefined"
              variante="ligne"
            >
              <template v-if="p.jourSeul" #quand>{{ p.action }} le {{ p.jourSeul }}</template>
            </ProvenanceChip>
          </div>
        </li>
      </ul>

      <details class="cdm__details" data-coupe="banc-d-essai">
        <summary class="cdm__resume"><AppIcon name="shield" :size="13" />Ce que dit le banc d’essai</summary>
        <div class="cm-table-wrap cdm__wrap">
          <table class="cm-table cdm__table" data-tableau="banc-des-coupes">
            <thead>
              <tr>
                <th>Ce qui a été vérifié</th>
                <th>Matchs</th>
                <th>Annoncé face au réalisé</th>
                <th>Ce que dit le banc</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="t in dit.tableau.lignes" :key="t.cle" :data-ligne="t.cle">
                <td class="cdm__case-texte">{{ t.quoi }}</td>
                <td class="cm-numeric">{{ t.matchs }}</td>
                <td class="cm-numeric">{{ t.annonceRealise }}</td>
                <td class="cdm__case-texte">{{ t.mot }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td class="cdm__case-texte">Σ confrontations vérifiées · ⌀ écart</td>
                <td class="cm-numeric">{{ dit.tableau.somme }}</td>
                <td class="cm-numeric" colspan="2">{{ dit.tableau.moyenne }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p class="cdm__petit" data-coupe="pied-du-banc">{{ dit.tableau.pied }}</p>
      </details>
    </div>
  </AppCard>
</template>

<style scoped>
.cdm__corps {
  container: cdm / inline-size;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cdm__lignes {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.cdm__ligne {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
  padding: 10px 12px;
  border-radius: var(--cm-radius-md);
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
}

.cdm__tete {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
}

.cdm__titre {
  font-size: 13px;
  font-weight: 700;
  color: var(--cm-text-primary);
}

/* La pastille : toujours grise (« Explication seulement ») — jamais de vert sur la chance de la page (DESIGN.md). */
.cdm__pastille {
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

.cdm__sous {
  font-size: 11px;
  color: var(--cm-text-muted);
}

.cdm__logos {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

.cdm__phrase {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--cm-text-primary);
}

/* Les barres face à face de la chance : deux tons neutres, jamais vert ni rouge pour une valeur. */
.cdm__barres {
  display: flex;
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--cm-border-soft);
}

.cdm__barre--dom {
  background: var(--cm-section);
}

.cdm__barre--ext {
  background: var(--cm-text-muted);
}

.cdm__mentions {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0 0 0 14px;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--cm-text-muted);
}

.cdm__calibration {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--cm-text-muted);
}

.cdm__calibration :deep(svg) {
  flex-shrink: 0;
  margin-top: 2px;
}

.cdm__provenances {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
}

.cdm__details {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cdm__resume {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  color: var(--cm-section);
}

.cdm__wrap {
  margin-top: 8px;
}

.cdm__case-texte {
  white-space: normal;
  text-align: left;
  min-width: 160px;
  color: var(--cm-text-secondary);
}

.cdm__petit {
  margin: 6px 0 0;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--cm-text-muted);
}

/* Assez de place : deux lignes côte à côte. */
@container cdm (min-width: 820px) {
  .cdm__lignes {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
