<script setup>
import { computed } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import ValueBadge from '@/components/common/ValueBadge.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import PickCrest from '@/components/matches/PickCrest.vue';
import TeamCrest from '@/components/matches/TeamCrest.vue';
import { liveNow } from '@/utils/liveClock.js';
import { lireLeComparateur } from '@/utils/comparateur.js';
import { selectionDeLaLigne, cleDeSelection } from '@/utils/ticket.js';

/**
 * LE COMPARATEUR DE VOS BOOKMAKERS (étape 10 du plan, 06/10/2026). Un tableau par
 * marché : une ligne par issue, une colonne par bookmaker qui a une cote — celle
 * du relevé The Odds API pour le 1 / N / 2, celles que vous avez saisies à la main
 * pour les autres marchés — avec l'heure de la cote, la pastille de value (le
 * verdict du moteur pour CE bookmaker) et, au bout de la ligne, la cote minimale
 * à prendre pour qu'il reste de la value. Les cotes de référence (gratuites, ou
 * d'un bookmaker qui n'est pas à vous comme Pinnacle) sont à part : jamais
 * jouables, jamais de value.
 *
 * Aucun calcul : utils/comparateur.js range ce que le serveur a calculé
 * (verdictPari.js, coteMinimale.js, saisiesCotes.js) et ne réévalue que la
 * fraîcheur des cotes à l'horloge. Le composant n'appelle rien : « Prendre »
 * donne la sélection à la page (`prendre`), qui la met sur le ticket.
 */
const props = defineProps({
  result: { type: Object, required: true }, // l'analyse du moteur (GET /api/analysis/match/:id), avec `comparateur`
  match: { type: Object, required: true }, // { matchId, home, away, league, commenceTime }
  saisies: { type: Object, default: null }, // GET /api/odds/saisies?matchId=
  cotes: { type: Object, default: null }, // GET /api/odds/fixture (cotes de référence)
  homeId: { type: String, default: null },
  awayId: { type: String, default: null },
  pris: { type: Array, default: () => [] }, // les sélections déjà sur le ticket (utils/ticket.js)
  maintenant: { type: Number, default: null }
});

const emit = defineEmits(['prendre']);

const heure = computed(() => props.maintenant ?? liveNow.value);
const lu = computed(() => lireLeComparateur({ result: props.result, saisies: props.saisies, cotes: props.cotes, match: props.match, maintenant: heure.value }));
const cote2 = (x) => (Number.isFinite(x) ? x.toFixed(2).replace('.', ',') : '—');
const pourcentEntier = (p) => (Number.isFinite(p) ? `${Math.round(p * 100)} %` : null);
const delaiHeures = computed(() => {
  const m = props.result?.fraicheurCotes?.reglage?.maxAgeMinutes;
  return Number.isFinite(m) ? m / 60 : 3;
});

function selection(ligne, k) {
  return selectionDeLaLigne({ match: props.match, ligne, case: k, calculeLe: lu.value.calculeLe });
}
/** Cette case est-elle sur le ticket : la même sélection, chez le même bookmaker. */
function estPris(ligne, k) {
  const cle = cleDeSelection(selection(ligne, k));
  return props.pris.some((s) => cleDeSelection(s) === cle && (s.bookmaker ?? null) === (k?.bookmaker ?? null));
}
function prendre(ligne, k = null) {
  emit('prendre', selection(ligne, k));
}
/** La phrase du survol de la case du moteur. */
function titreDuMoteur(l) {
  if (!Number.isFinite(l.probabilite)) return l.raisonSansProbabilite ?? "Le moteur n'a pas de probabilité pour cette issue.";
  return `Le moteur donne ${(l.probabilite * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} % à « ${l.libelle} » : cote juste ${cote2(l.coteJuste)}${l.origineProbabilite ? ` (${l.origineProbabilite})` : ''}.`;
}
</script>

<template>
  <div class="bkc">
    <div v-if="!lu.present" class="cm-note is-warning">
      <span class="cm-icon-box is-warning is-sm"><AppIcon name="alert" :size="14" /></span>
      <div>
        <p class="cm-note__title">Comparateur indisponible</p>
        <p class="cm-note__text">{{ lu.raison }}</p>
      </div>
    </div>

    <template v-else>
      <p class="bkc__sum">
        <span class="cm-chip"><AppIcon name="layers" :size="11" />{{ lu.resume.colonnes }} bookmaker{{ lu.resume.colonnes > 1 ? 's' : '' }} comparé{{ lu.resume.colonnes > 1 ? 's' : '' }}</span>
        <span class="cm-chip"><AppIcon name="check" :size="11" />{{ lu.resume.vertes ? `${lu.resume.vertes} case${lu.resume.vertes > 1 ? 's' : ''} en value à cette minute` : 'Aucune case en value à cette minute' }}</span>
        <span class="bkc__lecture">Value <HelpTip terme="value" /> · Cote minimale <HelpTip terme="cote-minimale" /> · Juge et partie <HelpTip terme="juge-et-partie" /></span>
      </p>
      <p v-if="lu.sansCoteDeMarche" class="bkc__absent">
        Pas de cote de marché pour ce match : aucun relevé The Odds API ne le cote. Les autres marchés gardent la probabilité du moteur et leur cote minimale ; une cote vue chez votre bookmaker se saisit dans l'onglet Marchés.
      </p>

      <section v-for="t in lu.tables" :key="t.cle" class="bkc__table" :data-table="t.cle">
        <p class="bkc__title">
          {{ t.titre }}<span class="bkc__subtitle"> · {{ t.soustitre }}</span>
          <ProvenanceChip
            v-if="t.provenance"
            :source="t.provenance.source"
            :releve-le="t.provenance.releveAt"
            :vieux-apres-heures="delaiHeures"
            :payant="t.provenance.payant"
            :action="t.provenance.payant ? 'relevé' : 'saisi'"
            variante="ligne"
          />
        </p>
        <div class="bkc__scroll">
          <table class="bkc__grid">
            <thead>
              <tr>
                <th scope="col" class="bkc__col-pick">Issue</th>
                <th scope="col" class="bkc__col-engine">Moteur</th>
                <th v-for="col in t.colonnes" :key="col.cle" scope="col" class="bkc__col-book" :title="col.juge ? `${col.titre} a servi à fixer la cote juste de ce match : juge et partie.` : col.titre">
                  <span class="bkc__book">{{ col.titre }}</span>
                  <small v-if="col.releve" class="bkc__when" :class="{ 'is-stale': col.fraicheur && col.fraicheur.etat !== 'fraiche' }">{{ col.releve }}</small>
                  <small v-if="col.juge" class="bkc__when">juge et partie</small>
                </th>
                <th scope="col" class="bkc__col-min">À prendre</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in t.lignes" :key="l.cle" class="bkc__row" :class="{ 'is-kept': l.retenue }">
                <th scope="row" class="bkc__pick">
                  <span class="bkc__pick-inner">
                    <span class="bkc__crest">
                      <PickCrest v-if="l.camp" :side="l.camp" :home="match.home" :away="match.away" :league="match.league" :home-id="homeId" :away-id="awayId" :size="18" />
                      <span v-else class="bkc__duo">
                        <TeamCrest :name="match.home" :league="match.league" :team-id="homeId" :size="15" />
                        <TeamCrest :name="match.away" :league="match.league" :team-id="awayId" :size="15" class="bkc__duo-away" />
                      </span>
                    </span>
                    <span class="bkc__pick-text">
                      <strong class="bkc__label">{{ l.libelle }}</strong>
                      <small class="bkc__market">{{ l.marche }}<template v-if="l.retenue"> · retenue par le moteur</template><template v-if="l.pronostic"> · pronostic du moteur</template></small>
                    </span>
                  </span>
                </th>
                <td class="bkc__engine" :title="titreDuMoteur(l)">
                  <template v-if="Number.isFinite(l.probabilite)">
                    <strong class="cm-numeric">{{ pourcentEntier(l.probabilite) }}</strong>
                    <small class="cm-numeric">juste {{ cote2(l.coteJuste) }}</small>
                  </template>
                  <small v-else>non calculée</small>
                </td>
                <td v-for="col in t.colonnes" :key="col.cle" class="bkc__cell" :class="{ 'is-best': l.meilleure === col.cle }" :data-livre="col.titre">
                  <template v-if="l.cases[col.cle]">
                    <span class="bkc__odds cm-numeric">{{ cote2(l.cases[col.cle].cote) }}</span>
                    <ValueBadge
                      v-if="l.cases[col.cle].verdict"
                      taille="sm"
                      :verdict="l.cases[col.cle].verdict"
                      :fraicheur="l.cases[col.cle].verdict.fraicheur ?? null"
                    />
                    <ValueBadge
                      v-else
                      taille="sm"
                      :pourcent="l.cases[col.cle].saisie.pourcent"
                      :jouable="l.cases[col.cle].saisie.jouable"
                      :cote="l.cases[col.cle].saisie.cote"
                      :regle="lu.regle"
                      :fraicheur="l.cases[col.cle].saisie.fraicheur"
                      :bookmaker="l.cases[col.cle].saisie.bookmakerTitre"
                    />
                    <small class="bkc__when" :class="{ 'is-stale': l.cases[col.cle].etat === 'a-rafraichir' }">{{ l.cases[col.cle].releve }}</small>
                    <small v-if="l.cases[col.cle].conseillee" class="bkc__flag">pari du moteur</small>
                    <small v-else-if="l.meilleure === col.cle" class="bkc__flag">meilleure cote</small>
                    <button type="button" class="bkc__take" :class="{ 'is-taken': estPris(l, l.cases[col.cle]) }" :title="`Mettre « ${l.libelle} » à ${cote2(l.cases[col.cle].cote)} chez ${l.cases[col.cle].bookmakerTitle} sur le ticket`" @click="prendre(l, l.cases[col.cle])">
                      <AppIcon :name="estPris(l, l.cases[col.cle]) ? 'check' : 'plus'" :size="11" />Prendre
                    </button>
                  </template>
                  <small v-else class="bkc__none">pas de cote</small>
                </td>
                <td class="bkc__min" :title="l.bornesTexte.detail">
                  <strong class="bkc__min-text">{{ l.bornesTexte.court }}</strong>
                  <small v-if="Number.isFinite(l.bornesTexte.maximum)" class="bkc__when">jusqu'à {{ cote2(l.bornesTexte.maximum) }}</small>
                  <button type="button" class="bkc__take" :title="`Mettre « ${l.libelle} » sur le ticket, à la cote que vous avez eue (à taper)`" @click="prendre(l)">
                    <AppIcon name="edit" :size="11" />Autre cote
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="!t.colonnes.length" class="bkc__absent">
          Aucune cote de vos bookmakers sur ce marché<template v-if="t.cle !== 'resultat'"> : The Odds API ne relève que le 1 / N / 2, une cote se saisit à la main (onglet Marchés)</template>. La cote minimale reste dite : prenez « Autre cote » avec celle que vous voyez chez votre bookmaker.
        </p>
      </section>

      <section v-if="lu.references.length" class="bkc__refs">
        <p class="bkc__title">
          Cotes de référence<span class="bkc__subtitle"> · référence, non jouable : elles mesurent le marché, jamais une value</span>
        </p>
        <div v-for="r in lu.references" :key="r.cle" class="bkc__scroll">
          <table class="bkc__grid is-ref">
            <caption class="bkc__caption">{{ r.titre }}</caption>
            <thead>
              <tr>
                <th scope="col" class="bkc__col-pick">Issue</th>
                <th v-for="col in r.colonnes" :key="col.cle" scope="col" class="bkc__col-book" :title="`${col.titre} · ${col.source}${col.juge ? ' · a fixé la cote juste (juge)' : ''}`">
                  <span class="bkc__book">{{ col.titre }}</span>
                  <small class="bkc__when">{{ col.source }}<template v-if="col.juge"> · cote juste</template></small>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in r.lignes" :key="l.cle">
                <th scope="row" class="bkc__pick"><strong class="bkc__label">{{ l.libelle }}</strong></th>
                <td v-for="col in r.colonnes" :key="col.cle" class="bkc__cell is-ref" :data-livre="`${col.titre} · ${col.source}`">
                  <template v-if="l.valeurs[col.cle] && Number.isFinite(l.valeurs[col.cle].cote)">
                    <span class="bkc__odds cm-numeric">{{ cote2(l.valeurs[col.cle].cote) }}</span>
                    <small class="bkc__when">{{ l.valeurs[col.cle].releve }}</small>
                  </template>
                  <small v-else class="bkc__none">pas de cote</small>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.bkc {
  container: bkc / inline-size;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.bkc__sum {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
  margin: 0;
}

.bkc__lecture {
  margin-left: auto;
  font-size: 11px;
  color: var(--cm-text-muted);
}

.bkc__absent {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
}

.bkc__table,
.bkc__refs {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bkc__title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  margin: 0;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

.bkc__subtitle {
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
}

.bkc__title :deep(.prov) {
  letter-spacing: 0;
  text-transform: none;
}

/* Beaucoup de bookmakers : le tableau défile dans son cadre, jamais la page. */
.bkc__scroll {
  max-width: 100%;
  overflow-x: auto;
  border-radius: 12px;
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
}

.bkc__grid {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.bkc__caption {
  padding: 8px 12px 0;
  text-align: left;
  font-size: 11px;
  font-weight: 700;
  color: var(--cm-text-secondary);
}

.bkc__grid th,
.bkc__grid td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--cm-border-soft);
  vertical-align: top;
  text-align: left;
}

.bkc__grid tbody tr:last-child th,
.bkc__grid tbody tr:last-child td {
  border-bottom: none;
}

.bkc__grid thead th {
  font-size: 10.5px;
  font-weight: 700;
  color: var(--cm-text-muted);
  white-space: nowrap;
}

.bkc__col-book {
  min-width: 108px;
}

.bkc__book {
  display: block;
  color: var(--cm-text-secondary);
}

.bkc__when {
  display: block;
  font-size: 10.5px;
  font-weight: 500;
  color: var(--cm-text-muted);
}

/* Un relevé trop vieux : l'ambre d'une cote à rafraîchir, comme partout (jamais le vert). */
.bkc__when.is-stale {
  color: var(--cm-warning);
}

.bkc__row:hover {
  background: var(--cm-surface-hover);
}

/* L'issue que le moteur retient : un filet gris plus marqué, sans couleur (le vert est celui de la value). */
.bkc__row.is-kept th {
  box-shadow: inset 3px 0 0 var(--cm-border-strong);
}

/* La cellule de l'issue reste une cellule de tableau (elle s'étire sur la hauteur de la ligne) : le logo et le texte côte à côte dans un bloc intérieur. */
.bkc__pick {
  min-width: 180px;
}

.bkc__pick-inner {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bkc__crest {
  display: inline-flex;
  flex-shrink: 0;
}

.bkc__duo {
  display: inline-flex;
  align-items: center;
}

.bkc__duo-away {
  margin-left: -5px;
}

.bkc__pick-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.bkc__label {
  font-size: 13px;
  color: var(--cm-text-primary);
  overflow-wrap: anywhere;
}

.bkc__market {
  font-size: 10.5px;
  color: var(--cm-text-muted);
}

.bkc__engine {
  white-space: nowrap;
  color: var(--cm-text-primary);
}

.bkc__engine small {
  display: block;
  font-size: 10.5px;
  color: var(--cm-text-muted);
}

.bkc__cell {
  min-width: 108px;
}

/* La meilleure cote de la ligne : un filet, pas une couleur. */
.bkc__cell.is-best {
  box-shadow: inset 0 0 0 1px var(--cm-border-strong);
}

.bkc__odds {
  display: block;
  font-size: 15px;
  font-weight: 800;
  color: var(--cm-text-primary);
}

.bkc__cell :deep(.vbadge) {
  margin: 3px 0 2px;
}

.bkc__flag {
  display: block;
  font-size: 10.5px;
  font-weight: 700;
  color: var(--cm-text-secondary);
}

.bkc__none {
  font-size: 11px;
  color: var(--cm-text-muted);
}

.bkc__take {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--cm-border);
  background: var(--cm-surface-raised);
  color: var(--cm-text-secondary);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.bkc__take:hover,
.bkc__take.is-taken {
  border-color: var(--cm-border-strong);
  color: var(--cm-text-primary);
}

.bkc__min {
  min-width: 130px;
}

.bkc__min-text {
  display: block;
  font-size: 12px;
  color: var(--cm-text-primary);
}

.bkc__cell.is-ref .bkc__odds {
  font-size: 13px;
  font-weight: 700;
  color: var(--cm-text-secondary);
}

/* Place étroite (téléphone) : chaque ligne devient une petite fiche — l'issue et le moteur en haut, puis la case de
   chaque bookmaker (son nom au-dessus), puis la cote minimale — plutôt qu'un tableau qui défile de côté et cache
   la colonne « À prendre ». */
@container bkc (max-width: 640px) {
  .bkc__lecture {
    margin-left: 0;
    flex-basis: 100%;
  }

  .bkc__grid thead {
    display: none;
  }

  .bkc__grid,
  .bkc__grid tbody {
    display: block;
  }

  .bkc__grid tr {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px 12px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--cm-border-soft);
  }

  .bkc__grid tbody tr:last-child {
    border-bottom: none;
  }

  .bkc__grid th,
  .bkc__grid td {
    padding: 0;
    border-bottom: none;
  }

  .bkc__pick {
    grid-column: 1;
    min-width: 0;
  }

  .bkc__engine {
    grid-column: 2;
    text-align: right;
  }

  .bkc__cell,
  .bkc__min {
    grid-column: 1 / -1;
    min-width: 0;
  }

  .bkc__cell {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 8px;
    padding: 6px 8px;
    border-radius: 8px;
    background: var(--cm-surface-raised);
  }

  /* Le nom du bookmaker, que l'en-tête caché ne dit plus. */
  .bkc__cell::before {
    content: attr(data-livre);
    flex-basis: 100%;
    font-size: 10.5px;
    font-weight: 700;
    color: var(--cm-text-muted);
  }

  .bkc__cell .bkc__odds,
  .bkc__cell .bkc__when,
  .bkc__cell .bkc__flag {
    display: inline;
  }

  .bkc__cell :deep(.vbadge) {
    margin: 0;
  }

  .bkc__take {
    margin-top: 0;
  }

  .bkc__min {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 10px;
  }

  .bkc__min .bkc__min-text,
  .bkc__min .bkc__when {
    display: inline;
  }
}
</style>
