<script setup>
import { computed } from 'vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import TeamCrest from '@/components/matches/TeamCrest.vue';
import { aBlancDit, ecartsDeLaMinute0, heureCourte, lignesDuDetail, PHRASE_DU_RETARD, referenceAbsenteDite, referenceDite } from '@/utils/direct.js';

/**
 * TOUS LES MARCHÉS D'UN MATCH EN COURS (étape 46 du plan, lot 1, partie D, 12/11/2026 ; conception § 1.2, critique R2,
 * R3, R8, R17 ; décision P6, questions 3, 4, 8 et 9). Toutes les familles (MARCHES_MONTRES) ; « Résultat et buts » et
 * « Scores exacts » en gris, « non jugé au banc » ; une ligne écartée par le banc d'essai dit pourquoi, une ligne « à
 * surveiller » passe à l'ambre ; aucune « cote juste » (R3). Tant que le banc n'a rien jugé : la structure complète, et
 * « pas encore jugé » à la place des chiffres (P4). Dessous : l'écart de la minute 0 (R8), la phrase du retard (R3 point
 * 3) et les cotes en direct relevées — en gris, une référence, JAMAIS un écart au calcul (R2 forme a).
 */
const props = defineProps({
  match: { type: Object, required: true },
  reference: { type: Object, default: null },
  maintenant: { type: Number, default: null }
});

const calcul = computed(() => props.match?.calcul ?? {});
const aBlanc = computed(() => Boolean(calcul.value.aBlanc) || !calcul.value.fait);
const raisonGenerale = computed(() => aBlancDit(calcul.value) ?? 'Pas de calcul pour cet état du match : rien à montrer.');
const familles = computed(() => lignesDuDetail(props.match));
const ecarts = computed(() => ecartsDeLaMinute0(props.match));
// Mineur du 13/11 soir (écrans 9) : l'heure du calcul au format du direct, dans le texte et au survol (R37 point 2).
const quandDuCalcul = computed(() => (heureCourte(calcul.value.calculeLe) ? `calculé à ${heureCourte(calcul.value.calculeLe)}` : 'heure du calcul inconnue'));
const noms = computed(() => ({ home: props.match?.home?.nom ?? 'Domicile', away: props.match?.away?.nom ?? 'Extérieur' }));
const idDe = (c) => props.match?.[c]?.id ?? null;
const references = computed(() =>
  (props.reference?.lignes ?? []).map((l, i) => ({ cle: `${l.marche}-${l.ligne ?? ''}-${l.issue}-${l.source}-${i}`, ...referenceDite(l, { aBlanc: aBlanc.value, noms: noms.value, etat: props.match?.etat }) }))
);
</script>

<template>
  <section class="direct-markets" data-bloc="direct-marches" :data-a-blanc="aBlanc ? 'oui' : 'non'">
    <h4 class="direct-markets__titre">Tous les marchés</h4>
    <div class="cm-table-wrap">
      <table class="cm-table" data-tableau="direct-marches">
        <thead>
          <tr>
            <th scope="col">Marché</th>
            <th scope="col" class="cm-numeric">Probabilité</th>
            <th scope="col">Pourquoi</th>
          </tr>
        </thead>
        <tbody v-for="f in familles" :key="f.famille" :data-famille="f.famille">
          <tr class="direct-markets__famille">
            <th colspan="3" scope="rowgroup">
              {{ f.titre }}<span v-if="f.nonJugee" class="direct-markets__gris"> · non jugé au banc</span>
            </th>
          </tr>
          <tr v-if="aBlanc" class="is-muted">
            <td colspan="3">{{ raisonGenerale }}</td>
          </tr>
          <tr v-else-if="f.raison" class="is-muted">
            <td colspan="3">{{ f.raison }}</td>
          </tr>
          <tr v-else-if="!f.lignes.length" class="is-muted">
            <td colspan="3">Aucune ligne calculée pour cette famille.</td>
          </tr>
          <template v-else>
            <tr v-for="l in f.lignes" :key="l.cle" :data-cle="l.cle" :class="[`is-${l.ton}`, { 'is-muted': !l.montre }]">
              <td>
                <span class="direct-markets__marche">
                  <TeamCrest v-for="c in l.camps" :key="c" :name="noms[c]" :league="match.league" :team-id="idDe(c)" :size="16" />
                  {{ l.texte }}
                </span>
              </td>
              <td class="cm-numeric">{{ l.montre ? l.valeur : 'pas montré' }}</td>
              <td class="direct-markets__pourquoi">{{ l.raison ?? '' }}</td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <ProvenanceChip
      v-if="!aBlanc"
      source="Calcul CôteMaster"
      :releve-le="calcul.calculeLe ?? null"
      action="calculé"
      :vieux-apres-heures="null"
      :maintenant="maintenant"
      variante="ligne"
      :titre="`Calcul CôteMaster : ${quandDuCalcul}.`"
      data-provenance="calcul"
    >
      <template #quand>{{ quandDuCalcul }}</template>
    </ProvenanceChip>

    <ul v-if="ecarts.length" class="direct-markets__lignes" data-bloc="direct-minute0">
      <li v-for="n in ecarts" :key="n.cle" :data-note="n.cle">
        <TeamCrest v-for="c in n.camps" :key="c" :name="noms[c]" :league="match.league" :team-id="idDe(c)" :size="16" />
        <span>{{ n.texte }}</span>
      </li>
    </ul>

    <p class="direct-markets__gris" data-phrase="retard">{{ PHRASE_DU_RETARD }}</p>

    <section class="direct-markets__reference" data-reference :data-trouvee="reference?.trouvee ? 'oui' : 'non'">
      <h5 class="direct-markets__sous-titre">Cotes en direct relevées, pour référence</h5>
      <ul v-if="references.length" class="direct-markets__lignes">
        <li v-for="r in references" :key="r.cle">
          <TeamCrest v-for="c in r.camps" :key="c" :name="noms[c]" :league="match.league" :team-id="idDe(c)" :size="16" />
          <span>{{ r.texte }}</span>
        </li>
      </ul>
      <p v-else class="direct-markets__gris">{{ referenceAbsenteDite(reference) }}</p>
    </section>
  </section>
</template>

<style scoped>
.direct-markets {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.direct-markets__titre,
.direct-markets__sous-titre {
  margin: 0;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--cm-text-secondary);
}

.direct-markets__famille th {
  font-size: 12px;
  font-weight: 700;
  color: var(--cm-text-primary);
}

.direct-markets__marche {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.direct-markets__pourquoi {
  font-size: 11.5px;
  color: var(--cm-text-muted);
}

tr.is-muted td,
.direct-markets__gris {
  color: var(--cm-text-muted);
}

tr.is-warning td {
  color: var(--cm-warning);
}

.direct-markets__gris {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
}

.direct-markets__lignes {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
}

.direct-markets__lignes li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.direct-markets__reference {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* La référence reste en gris : jamais un vert ni un rouge à côté d'un prix (R2). */
.direct-markets__reference .direct-markets__lignes {
  color: var(--cm-text-muted);
}
</style>
