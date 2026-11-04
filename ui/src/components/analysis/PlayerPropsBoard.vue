<script setup>
/**
 * L'ONGLET « JOUEURS — À BLANC » de la page d'un match à venir (étape 34 du plan, lot 1b, partie D, 03/11/2026).
 *
 * Juste après « Compositions » (décision de Pierre du 02/11, n° 6). L'en-tête (« À blanc · pas encore un marché »), l'état
 * de la compo et la base des deux équipes, puis DEUX tableaux (un par équipe, logo et nom du club en titre) qui gardent
 * TOUJOURS leurs colonnes et leurs en-têtes : Joueur | Poste | Minutes attendues | Marque | Au moins un tir cadré | Averti |
 * Passe décisive. Chaque case : un pourcentage et, dessous, sa cote juste ; « au moins deux tirs cadrés » au survol. Les
 * titulaires d'abord, puis les remplaçants « s'il entre en jeu ». Le logo du club ET le drapeau sur chaque ligne qui nomme
 * un joueur. Les pastilles par famille (« Effet mesuré » est le seul vert), les mentions fixes, la provenance réelle avec
 * l'heure, et le tableau replié « Ce que dit le banc d'essai ».
 *
 * AUCUNE requête : il lit le bloc `joueurs` que l'analyse a déjà (server/src/data/joueurs/joueursRead.js). Une seule place :
 * rien sur le terrain des compositions, aucune famille « Joueurs » dans les pronostics du moteur (MarketPicksBoard).
 * Les mots viennent de utils/joueursABlanc.js (pur, rejoué par server/test/joueursEcran.test.mjs).
 */
import { computed } from 'vue';
import AppCard from '@/components/common/AppCard.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import TeamCrest from '@/components/matches/TeamCrest.vue';
import PlayerFlag from '@/components/matches/PlayerFlag.vue';
import { joueursDit, COLONNES } from '@/utils/joueursABlanc.js';

const props = defineProps({
  /** Le bloc `joueurs` de l'analyse ; undefined : un serveur d'avant l'étape 34 ; null : l'analyse se charge. */
  joueurs: { type: Object, default: undefined },
  /** Le match : { home, away, league, homeId, awayId }. */
  match: { type: Object, default: null }
});

const dit = computed(() => joueursDit(props.joueurs));
const iconeDeLaNote = (ton) => (ton === 'is-danger' ? 'x' : ton === 'is-warning' ? 'alert' : 'info');
const idDe = (camp) => {
  const id = props.joueurs?.clubs?.[camp]?.id ?? null;
  return id === null || id === undefined ? props.match?.[`${camp}Id`] ?? null : `fotmob-${id}`;
};
const nomDe = (camp) => props.joueurs?.clubs?.[camp]?.nom ?? props.match?.[camp] ?? '';
const ligue = computed(() => props.match?.league ?? null);
</script>

<template>
  <AppCard class="ppb" :title="dit.enTete.titre" :subtitle="dit.enTete.sousTitre" icon="users" :eyebrow="dit.enTete.eyebrow" data-bloc="joueurs-a-blanc" :data-etat="joueurs?.etat ?? (joueurs === null ? 'chargement' : 'ancien-serveur')">
    <template #actions>
      <HelpTip
        titre="Chiffres des joueurs"
        texte="Calculés chaque nuit depuis le magasin FotMob : la part de chaque joueur dans ce que produit son équipe (occasions, tirs cadrés, avertissements, passes), ses minutes, et ce qu’attend l’équipe. Mesurés une fois au banc d’essai, avec un seuil sévère. Gardés avant chaque match pour être jugés plus tard sur vos matchs. Pas encore un marché : ni pronostic, ni value, ni pari conseillé."
      />
    </template>
    <div class="ppb__corps">
      <LoadingSpinner v-if="dit.etat?.cle === 'chargement'" label="Lecture des chiffres des joueurs…" />
      <div v-else-if="dit.etat?.texte" class="cm-note" :class="dit.etat.ton" :data-raison="dit.etat.cle" role="note">
        <span class="cm-icon-box" :class="dit.etat.ton === 'is-warning' ? 'is-warning' : 'is-info'"><AppIcon :name="iconeDeLaNote(dit.etat.ton)" :size="16" /></span>
        <div>
          <p class="cm-note__title">{{ dit.etat.titre }}</p>
          <p class="cm-note__text">{{ dit.etat.texte }}</p>
        </div>
      </div>

      <p v-if="dit.compo" class="ppb__ligne" data-ligne="compo"><AppIcon name="users" :size="13" /><span>{{ dit.compo.texte }}</span></p>
      <p v-if="dit.base" class="ppb__ligne" data-ligne="base"><AppIcon name="target" :size="13" /><span>{{ dit.base.texte }}</span></p>

      <!-- Les statuts des quatre familles : la pastille et la calibration au banc. -->
      <div class="ppb__pastilles" data-ligne="statuts">
        <span v-for="p in dit.pastilles" :key="p.famille" class="ppb__famille" :data-famille="p.famille">
          <span class="ppb__mot">{{ p.mot }}</span>
          <span class="ppb__pastille" :class="`is-${p.cle}`" role="note" :aria-label="p.aria" :title="p.titre ?? undefined" :data-pastille="p.cle">
            <AppIcon :name="p.vert ? 'check' : 'info'" :size="12" />{{ p.libelle }}
          </span>
          <span v-if="p.sous" class="ppb__sous">{{ p.sous }}</span>
          <span v-if="p.calibration" class="ppb__calibre" :class="{ 'is-ambre': p.calibration.ambre }" :data-calibre="p.calibration.cle">{{ p.calibration.texte }}</span>
        </span>
      </div>

      <!-- Un tableau par équipe : TOUJOURS ses colonnes et ses en-têtes. -->
      <section v-for="c in dit.camps" :key="c.camp" class="ppb__camp" :data-camp="c.camp">
        <h4 class="ppb__club"><TeamCrest :name="nomDe(c.camp)" :league="ligue" :team-id="idDe(c.camp)" :size="18" />{{ nomDe(c.camp) }}</h4>
        <div class="cm-table-wrap ppb__wrap">
          <table class="cm-table ppb__table" :data-tableau="`joueurs-${c.camp}`">
            <thead>
              <tr>
                <th v-for="col in COLONNES" :key="col.cle" :class="{ 'cm-numeric': col.cle !== 'joueur' && col.cle !== 'poste' }">{{ col.titre }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!c.titulaires.length && !c.remplacants.length" class="ppb__vide">
                <td :colspan="COLONNES.length">Aucun joueur à montrer pour cette équipe.</td>
              </tr>
              <template v-for="groupe in [{ cle: 'titulaires', titre: null, lignes: c.titulaires }, { cle: 'remplacants', titre: 'Remplaçants (s’il entre en jeu)', lignes: c.remplacants }]" :key="groupe.cle">
                <tr v-if="groupe.titre && groupe.lignes.length" class="ppb__groupe"><td :colspan="COLONNES.length">{{ groupe.titre }}</td></tr>
                <tr v-for="l in groupe.lignes" :key="l.cle" :data-joueur="l.id ?? ''" :class="{ 'is-sans-id': l.note?.cle === 'sans-identifiant' }">
                  <td class="ppb__joueur">
                    <span class="ppb__nom">
                      <TeamCrest :name="nomDe(c.camp)" :league="ligue" :team-id="idDe(c.camp)" :size="14" />
                      <PlayerFlag :code="l.pays" :name="l.nomPays" :size="14" />
                      {{ l.nom }}<span v-if="l.sIlJoue" class="ppb__petit"> · s’il joue</span>
                    </span>
                    <span v-if="l.entre" class="ppb__petit">{{ l.entre }}</span>
                    <span v-if="l.note" class="ppb__note" role="note" :data-note="l.note.cle">{{ l.note.texte }}</span>
                  </td>
                  <td>{{ l.poste }}</td>
                  <td class="cm-numeric">{{ l.minutes }}</td>
                  <td v-for="f in ['marque', 'cadres', 'averti', 'passeur']" :key="f" class="cm-numeric ppb__case" :title="l.cases[f].titre ?? undefined" :data-famille="f">
                    <span class="ppb__p">{{ l.cases[f].p }}</span>
                    <span v-if="l.cases[f].cote" class="ppb__cote">{{ l.cases[f].cote }}</span>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
        <p v-if="c.pied" class="ppb__pied" data-ligne="somme">{{ c.pied }}</p>
      </section>

      <ul class="ppb__fixes" data-ligne="mentions">
        <li v-for="m in dit.mentions" :key="m">{{ m }}</li>
      </ul>

      <div class="ppb__provenances">
        <ProvenanceChip v-for="p in dit.provenances" :key="p.cle" :source="p.source" :releve-le="p.releveLe" :action="p.action" variante="ligne" :data-provenance="p.cle">
          <template v-if="p.jourSeul" #quand>{{ p.action }} le {{ p.jourSeul }}</template>
        </ProvenanceChip>
      </div>

      <details class="ppb__details" data-ligne="banc-d-essai">
        <summary class="ppb__resume"><AppIcon name="shield" :size="13" />Ce que dit le banc d’essai</summary>
        <div class="cm-table-wrap ppb__wrap">
          <table class="cm-table ppb__table" data-tableau="banc-des-joueurs">
            <thead>
              <tr>
                <th>Ce qui a été comparé</th>
                <th>Matchs jugés</th>
                <th>Erreur en moins (fourchette)</th>
                <th>Annoncé face au réalisé</th>
                <th>Verdict</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="t in dit.tableau.lignes" :key="t.cle" :data-ligne="t.cle">
                <td>{{ t.quoi }}</td>
                <td class="cm-numeric">{{ t.matchs }}</td>
                <td class="cm-numeric">{{ t.gain }}</td>
                <td class="cm-numeric">{{ t.calibration }}</td>
                <td>
                  <span v-if="t.mesureUtile" class="ppb__pastille is-mesure" role="note" :aria-label="`${t.quoi} : effet mesuré`"><AppIcon name="check" :size="12" />Effet mesuré</span>
                  <span v-else class="ppb__verdict">{{ t.verdict }}</span>
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td>Ensemble</td>
                <td class="cm-numeric">Σ {{ dit.tableau.somme }}</td>
                <td></td>
                <td class="cm-numeric">⌀ {{ dit.tableau.moyenne }}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p class="ppb__petit" data-ligne="pied-du-banc">{{ dit.tableau.pied }}</p>
      </details>
    </div>
  </AppCard>
</template>

<style scoped>
.ppb__corps {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ppb__ligne {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  margin: 0;
  color: var(--cm-text-secondary);
  font-size: 0.9rem;
  line-height: 1.45;
}
.ppb__pastilles {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
}
.ppb__famille {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 0.82rem;
}
.ppb__mot {
  font-weight: 600;
}
.ppb__pastille {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid var(--cm-border-soft);
  color: var(--cm-text-muted);
  font-size: 0.78rem;
  white-space: nowrap;
}
.ppb__pastille.is-mesure {
  color: var(--cm-accent);
  border-color: var(--cm-accent);
}
.ppb__sous,
.ppb__calibre,
.ppb__petit {
  color: var(--cm-text-muted);
  font-size: 0.78rem;
}
.ppb__calibre.is-ambre {
  color: var(--cm-warning);
}
.ppb__club {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 4px 0;
  font-size: 0.95rem;
}
.ppb__wrap {
  overflow-x: auto;
}
.ppb__table td,
.ppb__table th {
  vertical-align: top;
}
.ppb__joueur {
  min-width: 11rem;
}
.ppb__nom {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}
.ppb__note {
  display: block;
  color: var(--cm-text-muted);
  font-size: 0.76rem;
}
.ppb__case {
  white-space: nowrap;
}
.ppb__p {
  display: block;
  font-weight: 600;
}
.ppb__cote {
  display: block;
  color: var(--cm-text-muted);
  font-size: 0.74rem;
}
.ppb__groupe td {
  font-weight: 600;
  color: var(--cm-text-muted);
  font-size: 0.8rem;
}
.ppb__vide td {
  color: var(--cm-text-muted);
  font-style: italic;
}
.is-sans-id td {
  color: var(--cm-text-muted);
}
.ppb__pied {
  margin: 4px 0 0;
  font-size: 0.82rem;
  color: var(--cm-text-secondary);
}
.ppb__fixes {
  margin: 0;
  padding-left: 1.1rem;
  color: var(--cm-text-muted);
  font-size: 0.8rem;
}
.ppb__provenances {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
}
.ppb__resume {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.86rem;
}
.ppb__verdict {
  color: var(--cm-text-muted);
}
</style>
