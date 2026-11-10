<script setup>
/**
 * LE BLOC « DÉBUT DE SAISON » de l'encadré « Contexte du match » (étape 35 du plan, lot 1b, 10/11/2026).
 *
 * Posé SOUS les neuf lignes de l'encadré et sous son banc d'essai : jamais une dixième ligne (« toujours neuf lignes » reste
 * vrai). TOUJOURS deux lignes, une par club — le rang dans la saison, le statut (début de saison, promu, relégué, nouveau
 * venu, premier au magasin, en saison), l'effet à blanc quand le banc d'essai l'a mesuré utile pour CE match, l'effectif
 * (continuité, arrivées et départs qui comptent) et la force de l'effectif à blanc (puce « À blanc ») —, chacune avec son
 * logo et sa vraie provenance. « Explication seulement » (gris) par défaut ; « Effet mesuré » (le seul vert), TOUJOURS suivi
 * de « pas encore dans le pourcentage » : rien n'entre dans les chiffres au lot 1. Jamais de vert ni de rouge pour une valeur.
 *
 * AUCUNE requête : il lit le bloc `debutsDeSaison` que le serveur joint à l'analyse APRÈS elle (la fiche gelée la nuit, les
 * lignes des deux clubs, la note du banc). Les mots viennent de utils/debutsDeSaison.js (pur, rejoué par
 * server/test/debutsEcran.test.mjs) ; le détail nom par nom vit sur la page de l'équipe (« Arrivées et départs »).
 */
import { computed } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import TeamCrest from '@/components/matches/TeamCrest.vue';
import { debutsDits } from '@/utils/debutsDeSaison.js';

const props = defineProps({
  /** Le bloc `debutsDeSaison` de l'analyse ; undefined : un serveur d'avant l'étape 35. */
  debuts: { type: Object, default: undefined },
  /** L'état de l'analyse : { loading, error, result }. */
  analyse: { type: Object, default: null },
  /** Le match : { home, away, league }. */
  match: { type: Object, default: null }
});

const dit = computed(() => debutsDits({ debuts: props.debuts, analyse: props.analyse, match: props.match }));
const iconeDeLaNote = (ton) => (ton === 'is-danger' ? 'x' : ton === 'is-warning' ? 'alert' : 'info');
const ancienApres = (p) => (p.vieuxApresHeures === null ? null : undefined);
</script>

<template>
  <section class="dds" data-bloc="debut-de-saison" :data-debuts-etat="dit.etat.cle" aria-label="Début de saison">
    <header class="dds__tete">
      <span class="cm-icon-box is-sm is-muted"><AppIcon name="calendar" :size="14" /></span>
      <h3 class="dds__titre">Début de saison</h3>
      <span class="dds__pastille" :class="{ dds__vert: dit.pastille.vert }" role="note" :aria-label="dit.pastille.aria" :data-pastille="dit.pastille.cle">
        <AppIcon :name="dit.pastille.vert ? 'check' : 'info'" :size="12" />{{ dit.pastille.libelle }}
      </span>
      <span v-if="dit.pastille.sous" class="dds__sous">{{ dit.pastille.sous }}</span>
    </header>
    <p v-if="dit.banc" class="dds__banc" data-debuts="banc"><AppIcon name="shield" :size="12" /><span>{{ dit.banc }}</span></p>
    <p v-if="dit.prudence" class="dds__petit" data-debuts="prudence">{{ dit.prudence }}</p>

    <LoadingSpinner v-if="dit.etat.cle === 'chargement'" label="Lecture du début de saison…" />
    <div v-else-if="dit.etat.texte" class="cm-note" :class="dit.etat.ton" :data-raison="dit.etat.cle">
      <span class="cm-icon-box" :class="dit.etat.ton === 'is-danger' ? 'is-danger' : dit.etat.ton === 'is-warning' ? 'is-warning' : 'is-info'"><AppIcon :name="iconeDeLaNote(dit.etat.ton)" :size="16" /></span>
      <div>
        <p class="cm-note__title">{{ dit.etat.titre }}</p>
        <p class="cm-note__text">{{ dit.etat.texte }}</p>
      </div>
    </div>

    <!-- Les deux clubs en saison : le bloc le dit en une ligne grise, et garde ses deux lignes. -->
    <p v-if="dit.grise" class="dds__grise" data-debuts="en-saison">
      <template v-for="l in dit.lignes" :key="l.camp">
        <TeamCrest v-if="l.club.teamId" :name="l.club.nom" :league="l.club.league" :team-id="l.club.teamId" :size="16" />
      </template>
      <span>{{ dit.grise }}</span>
    </p>

    <!-- TOUJOURS deux lignes, une par club. -->
    <ul class="dds__lignes">
      <li v-for="l in dit.lignes" :key="l.camp" class="dds__ligne" :data-club="l.camp" :data-cas="l.cas">
        <p class="dds__club">
          <TeamCrest v-if="l.club.teamId" :name="l.club.nom" :league="l.club.league" :team-id="l.club.teamId" :size="20" />
          <span v-else class="dds__sans-logo" title="Club non reconnu par son identifiant FotMob : son logo n’est jamais cherché d’après son nom."><AppIcon name="shield" :size="12" /></span>
          <strong class="cm-truncate">{{ l.club.nom }}</strong>
        </p>
        <!-- La phrase de l'effet mesuré nomme le club d'en face : son logo avec elle (par son identifiant FotMob). -->
        <p v-for="p in l.phrases" :key="p.cle" class="dds__phrase" :data-ligne="p.cle">
          <span v-if="p.clubs?.some((c) => c.teamId)" class="dds__logos" data-logos="clubs">
            <template v-for="c in p.clubs" :key="c.nom"><TeamCrest v-if="c.teamId" :name="c.nom" :league="c.league" :team-id="c.teamId" :size="14" /></template>
          </span>
          {{ p.texte }}
        </p>
        <p v-if="l.effectif" class="dds__phrase" data-ligne="effectif">{{ l.effectif.texte }}</p>
        <p v-if="l.force" class="dds__force" data-ligne="force-effectif">
          <span class="dds__puce" role="note" :aria-label="l.force.aria">À blanc</span>
          <span>{{ l.force.texte }}</span>
        </p>
        <p v-if="l.force" class="dds__petit">{{ l.force.limite }}</p>
        <div v-if="l.provenances.length" class="dds__provenances">
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

    <ul class="dds__mentions">
      <li v-for="m in dit.mentions" :key="m">{{ m }}</li>
    </ul>

    <footer v-if="dit.pied.length" class="dds__pied">
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

    <!-- Ce que dit le banc d'essai : les lignes du banc RÉEL (la note, recopiée par le serveur), repliées ; aucun vert. -->
    <details class="dds__details" data-debuts="banc-d-essai">
      <summary class="dds__resume"><AppIcon name="shield" :size="13" />Ce que dit le banc d’essai</summary>
      <div class="cm-table-wrap dds__wrap">
        <table class="cm-table dds__table" data-tableau="banc-des-debuts">
          <thead>
            <tr>
              <th>Ce qui a été comparé</th>
              <th>Fenêtre</th>
              <th>Régime</th>
              <th>Matchs jugés</th>
              <th>Erreur en moins (fourchette)</th>
              <th>Ampleur</th>
              <th>Verdict</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in dit.tableau.lignes" :key="t.cle" :data-ligne="t.cle" :data-controle="t.controle ? 'oui' : null">
              <td class="dds__case-texte">{{ t.compare }}</td>
              <td>{{ t.fenetre }}</td>
              <td>{{ t.regime }}</td>
              <td class="cm-numeric">{{ t.matchs }}</td>
              <td class="cm-numeric">{{ t.erreur }}</td>
              <td class="cm-numeric">{{ t.ampleur }}</td>
              <td class="dds__case-texte">{{ t.verdict }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3" class="dds__case-texte">{{ dit.tableau.portee }}</td>
              <td colspan="2" class="dds__case-texte">{{ dit.tableau.somme }}</td>
              <td colspan="2" class="dds__case-texte">{{ dit.tableau.moyenne }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p class="dds__petit" data-debuts="pied-du-banc">{{ dit.tableau.pied }}</p>
      <ul v-if="dit.tableau.limites.length" class="dds__mentions" data-debuts="limites">
        <li v-for="m in dit.tableau.limites" :key="m">{{ m }}</li>
      </ul>
    </details>
  </section>
</template>

<style scoped>
.dds {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid var(--cm-border-soft);
}

.dds__tete {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
}

.dds__titre {
  margin: 0;
  font-size: 13.5px;
  font-weight: 700;
  color: var(--cm-text-primary);
}

/* La pastille : gris « Explication seulement » ; « Effet mesuré » en vert, la seule exception (DESIGN.md). */
.dds__pastille {
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

.dds__pastille.dds__vert {
  color: var(--cm-accent);
  border-color: var(--cm-accent);
}

.dds__sous {
  font-size: 11px;
  color: var(--cm-text-muted);
}

.dds__banc {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--cm-text-secondary);
}

.dds__banc :deep(svg) {
  flex-shrink: 0;
  margin-top: 2px;
}

.dds__grise {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--cm-text-muted);
}

.dds__lignes {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.dds__ligne {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
  padding: 10px 12px;
  border-radius: var(--cm-radius-md);
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
}

.dds__club {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  min-width: 0;
  font-size: 13px;
  color: var(--cm-text-primary);
}

.dds__sans-logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 1px dashed var(--cm-border-soft);
  color: var(--cm-text-muted);
}

.dds__phrase {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--cm-text-primary);
}

.dds__logos {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-right: 4px;
  vertical-align: middle;
}

.dds__force {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
}

/* La puce « À blanc » : grise, toujours (la force de l'effectif n'est jamais dans les chiffres au lot 1). */
.dds__puce {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface);
  color: var(--cm-text-muted);
  font-size: 10.5px;
  font-weight: 700;
  white-space: nowrap;
}

.dds__mentions {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0 0 0 14px;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--cm-text-muted);
}

.dds__provenances,
.dds__pied {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
}

.dds__pied {
  padding-top: 8px;
  border-top: 1px solid var(--cm-border-soft);
}

.dds__details {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dds__resume {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  color: var(--cm-section);
}

.dds__wrap {
  margin-top: 8px;
}

.dds__case-texte {
  white-space: normal;
  text-align: left;
  min-width: 140px;
  color: var(--cm-text-secondary);
}

.dds__petit {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--cm-text-muted);
}

/* Assez de place : les deux clubs côte à côte. */
@container mcc (min-width: 820px) {
  .dds__lignes {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
