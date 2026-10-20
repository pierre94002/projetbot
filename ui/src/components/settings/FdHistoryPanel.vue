<script setup>
/**
 * Historique football-data (étape 13 du plan, 06/10/2026) : les fichiers
 * gratuits de football-data.co.uk depuis 2000-01 — 22 divisions européennes
 * et 16 fichiers par pays — gardés dans la base, une ligne par match (scores,
 * tirs, corners, fautes, cartons, arbitre, cotes d'avant-match et de clôture).
 * La carte dit, championnat par championnat, combien de saisons et de matchs,
 * la part des clubs reconnus (identifiant FotMob donné par le vote jour +
 * score, jamais par ressemblance de nom), la part des matchs depuis 2023
 * rattachés à leur rencontre FotMob avec le même score, la date du dernier
 * relevé, les fichiers en échec, la taille ajoutée à la base, les cotes
 * gardées livre par livre (William Hill saison par saison) et les écarts de
 * score entre football-data et FotMob.
 *
 * Tout est LU (GET /api/match-stats/fd-history, un résumé préparé à la fin de
 * chaque passe de l'actualisation) : la carte ne télécharge rien et ne
 * recompte rien. Le pied du tableau (Σ, ⌀) est refait pour les lignes
 * affichées par les règles de utils/historiqueFd.js. Règles de dessin
 * (ui/DESIGN.md) : chiffres clés en .cm-kpis, tableaux complets même vides
 * ou en erreur, Σ total et ⌀ moyenne au pied (jamais une somme ni une moyenne
 * de pourcentages), provenance réelle, jamais un chiffre absent sans le dire.
 */
import { computed, onMounted, ref, watch } from 'vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import LeagueBadge from '@/components/matches/LeagueBadge.vue';
import PlayerFlag from '@/components/matches/PlayerFlag.vue';
import { matchStatsApi } from '@/services/matchStatsApi.js';
import { useFavoritesStore } from '@/stores/favoritesStore.js';
import { formatDateTime } from '@/utils/format.js';
import {
  OBJECTIF_RATTACHEMENT,
  codeDrapeau,
  nombre,
  part,
  pourcentTexte,
  tonRattachement,
  tailleTexte,
  texteSaisons,
  filtrerChampionnats,
  totauxDesChampionnats,
  etatDeLImport,
  lignesDesCotes,
  MARCHES,
  TEMOINS_SAISON,
  lignesParSaison,
  totauxParSaison,
  phraseEcart
} from '@/utils/historiqueFd.js';

const props = defineProps({
  /** Fin de la dernière passe d'actualisation : la carte se relit quand elle change. */
  passeTermineeLe: { type: String, default: null }
});

const favoris = useFavoritesStore();
const PAS = 30;

const etat = ref({ loading: false, error: null, data: null });
const choix = ref('suivis');
const ecartsVisibles = ref(PAS);

async function charger() {
  etat.value = { ...etat.value, loading: true, error: null };
  try {
    etat.value = { loading: false, error: null, data: await matchStatsApi.fdHistory() };
  } catch (error) {
    // Un serveur d'avant l'étape 13 prend « fd-history » pour un identifiant de match.
    const message = /introuvables pour le match fd-history/.test(error.message) ? "Le serveur n'est pas à jour : relancez demarrer-cotemaster.bat pour activer l'historique football-data." : error.message;
    etat.value = { ...etat.value, loading: false, error: message };
  }
}

onMounted(charger);
watch(
  () => props.passeTermineeLe,
  (apres, avant) => {
    if (apres && apres !== avant) charger();
  }
);

// ------------------------------------------------------------ présentation
const d = computed(() => etat.value.data);
const r = computed(() => d.value?.resume ?? null);
const t = computed(() => r.value?.totaux ?? null);
const importLu = computed(() => etatDeLImport(d.value));

const lignes = computed(() => {
  const liste = filtrerChampionnats(r.value?.championnats ?? [], choix.value);
  // Une LISTE de championnats : les favoris d'abord (leur ordre gardé ensuite).
  return favoris.favoritesFirst(liste, { league: (l) => l.league });
});
const pied = computed(() => totauxDesChampionnats(lignes.value));
const CHOIX = [
  { value: 'suivis', label: 'Championnats suivis', icone: 'star' },
  { value: 'tous', label: 'Tous les fichiers', icone: 'layers' }
];

const premiereSaison = computed(() => (r.value?.championnats ?? []).map((l) => l.premiere).filter(Boolean).sort()[0] ?? null);
const derniereSaison = computed(() => (r.value?.championnats ?? []).filter((l) => !l.parPays).map((l) => l.derniere).filter(Boolean).sort().at(-1) ?? null);
const nbSaisons = computed(() => (premiereSaison.value && derniereSaison.value ? Number(derniereSaison.value.slice(0, 4)) - Number(premiereSaison.value.slice(0, 4)) + 1 : 0));
const nbChampionnats = computed(() => (r.value?.championnats ?? []).filter((l) => l.matchs).length);
const partRattachee = computed(() => part(t.value?.rattachees, t.value?.periode));

const cotes = computed(() => lignesDesCotes(r.value?.cotes));
const parSaison = computed(() => lignesParSaison(r.value?.saisons));
const piedSaisons = computed(() => totauxParSaison(parSaison.value));
const echecs = computed(() => r.value?.fichiers?.echecs ?? []);
const absents = computed(() => r.value?.fichiers?.absentsListe ?? []);
const ecarts = computed(() => r.value?.ecarts?.liste ?? []);
const ecartsAffiches = computed(() => ecarts.value.slice(0, ecartsVisibles.value));

const kpiTaille = computed(() => {
  const o = r.value?.taille?.octets ?? null;
  if (o === null) return { valeur: 'non mesurée', detail: r.value?.taille?.erreur ?? 'pas encore d’import' };
  const cache = r.value?.cache;
  return {
    valeur: tailleTexte(o),
    detail: `dans la base (les trois tables de l’historique et leurs index)${cache ? ` ; fichiers gardés à côté : ${tailleTexte(cache.octets)} (${nombre(cache.fichiers)} fichiers)` : ''}`
  };
});

const dateCourte = (iso) => (iso ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${String(iso).slice(0, 10)}T12:00:00`)) : 'jamais');
const libelleMoment = (m) => (m === 'avant' ? 'avant-match' : 'clôture');
const noteDeLigne = (l) => {
  const notes = [];
  if (l.parPays) notes.push('fichier par pays : clôture 1 N 2 seulement, sans statistiques');
  if (!l.league) notes.push('championnat que le magasin ne suit pas : rien à rattacher, l’historique sert aux promus');
  if (l.fichiers?.echecs) notes.push(`${nombre(l.fichiers.echecs)} fichier(s) en échec`);
  if (l.fichiers?.absents) notes.push(`${nombre(l.fichiers.absents)} fichier(s) absent(s) chez le site`);
  return notes;
};
const texteRattachement = (l) => {
  if (!l.league) return 'non suivi';
  if (!l.periode) return l.depuis2023 ? 'pas encore au magasin' : 'aucun match depuis 2023';
  return `${nombre(l.rattachees)} sur ${nombre(l.periode)}`;
};
</script>

<template>
  <div class="fdh">
    <LoadingSpinner v-if="etat.loading && !d" label="Lecture de l’historique football-data…" />

    <div v-if="etat.error" class="cm-note is-danger">
      <span class="cm-icon-box is-danger"><AppIcon name="x" :size="16" /></span>
      <div>
        <p class="cm-note__title fdh__titre--danger">Historique football-data illisible</p>
        <p class="cm-note__text fdh__texte">{{ etat.error }} — les tableaux ci-dessous restent affichés, sans valeurs.</p>
      </div>
    </div>

    <!-- 1. Les chiffres clés. -->
    <div class="cm-kpis fdh__kpis">
      <div class="cm-kpi" :class="importLu.ton">
        <span class="cm-kpi__label">Import</span>
        <span class="cm-kpi__value fdh__kpi-texte">{{ d ? importLu.titre : 'non lu' }}</span>
        <span class="cm-kpi__detail">{{ d ? importLu.texte : 'état indisponible' }}</span>
      </div>
      <div class="cm-kpi is-section">
        <span class="cm-kpi__label">Saisons gardées</span>
        <span class="cm-kpi__value">{{ t ? `${nombre(nbSaisons)} saisons` : 'non lu' }}</span>
        <span class="cm-kpi__detail">{{ t ? `${texteSaisons(premiereSaison, derniereSaison)} ; ${nombre(t.matchs)} matchs, ${nombre(nbChampionnats)} championnats` : 'résumé indisponible' }}</span>
      </div>
      <div class="cm-kpi">
        <span class="cm-kpi__label">Rattachés à FotMob depuis 2023</span>
        <span class="cm-kpi__value fdh__pct" :class="`is-${tonRattachement(partRattachee)}`">{{ t ? pourcentTexte(partRattachee) : 'non lu' }}</span>
        <span class="cm-kpi__detail">{{ t ? `${nombre(t.rattachees)} sur ${nombre(t.periode)} matchs de la période commune, même score (objectif ${OBJECTIF_RATTACHEMENT} %) ; ${nombre(t.ecarts)} écart(s) de score` : 'résumé indisponible' }}</span>
      </div>
      <div class="cm-kpi">
        <span class="cm-kpi__label">Clubs reconnus</span>
        <span class="cm-kpi__value">{{ t ? `${nombre(t.clubsReconnus)} sur ${nombre(t.clubs)}` : 'non lu' }}</span>
        <span class="cm-kpi__detail">{{ t ? 'identifiant FotMob donné par le vote ; les autres gardent leur nom football-data' : 'résumé indisponible' }}</span>
      </div>
      <div class="cm-kpi">
        <span class="cm-kpi__label">Taille ajoutée</span>
        <span class="cm-kpi__value fdh__kpi-texte">{{ kpiTaille.valeur }}</span>
        <span class="cm-kpi__detail">{{ kpiTaille.detail }}</span>
      </div>
    </div>

    <!-- 2. D'où ça vient. -->
    <div class="fdh__entete">
      <ProvenanceChip
        source="football-data.co.uk · fichiers CSV gratuits"
        :releve-le="r?.fichiers?.dernierReleve ?? null"
        action="relevé"
        :fichier="r?.cache?.dossier ?? null"
        :detail="r ? `Résumé calculé le ${formatDateTime(r.calculeLe)} ; dernier import le ${formatDateTime(r.fichiers?.dernierImport)}.` : 'Le résumé est préparé à chaque passe de l’actualisation.'"
        :vieux-apres-heures="24 * 8"
      />
      <AppButton variant="secondary" size="sm" :loading="etat.loading" @click="charger">
        <template #icon><AppIcon name="refresh" :size="13" /></template>
        Relire
      </AppButton>
    </div>

    <div class="cm-note is-info">
      <span class="cm-icon-box is-info"><AppIcon name="info" :size="16" /></span>
      <div>
        <p class="cm-note__title">Ce que l’historique donne, et ce qu’il ne donne pas</p>
        <p class="cm-note__text fdh__texte">
          Par match : scores final et mi-temps, tirs, tirs cadrés, corners, fautes, cartons, l’arbitre (Angleterre et Écosse), et les cotes d’avant-match
          (relevées le vendredi ou le mardi) et de clôture — 1 N 2, plus/moins 2,5 buts et handicap asiatique. Rien pour 1,5 ou 3,5 buts ni pour « les deux
          marquent » : le site ne les publie pas. Les fichiers par pays n’ont que la clôture 1 N 2. Pinnacle n’est plus publié depuis 2026.
        </p>
      </div>
    </div>

    <!-- 3. Championnat par championnat. -->
    <h4 class="cm-group-title fdh__groupe">
      Championnat par championnat
      <HelpTip
        titre="Comment lire ce tableau"
        texte="Pour chaque championnat : les saisons et les matchs gardés, les clubs reconnus (ceux que le vote jour + score relie à leur identifiant FotMob, sur les saisons communes avec le magasin), et la part des matchs depuis 2023 rattachés à leur rencontre FotMob avec le même score. Un club qui n’a plus joué dans un championnat suivi depuis 2023 garde son nom football-data : il n’est jamais rapproché d’un nom qui lui ressemble."
      />
    </h4>
    <div class="fdh__choix" role="radiogroup" aria-label="Championnats affichés">
      <button
        v-for="c in CHOIX"
        :key="c.value"
        type="button"
        role="radio"
        class="fdh__choix-btn"
        :class="{ 'is-active': choix === c.value }"
        :aria-checked="choix === c.value"
        @click="choix = c.value"
      >
        <AppIcon :name="c.icone" :size="13" />
        {{ c.label }}
      </button>
    </div>
    <div class="cm-table-wrap fdh__wrap">
      <table class="cm-table fdh__table">
        <thead>
          <tr>
            <th class="is-left">Championnat</th>
            <th class="is-left">Saisons</th>
            <th title="Matchs gardés, toutes saisons">Matchs</th>
            <th title="Clubs reliés à leur identifiant FotMob par le vote, sur tous les clubs du championnat">Clubs reconnus</th>
            <th title="Matchs depuis 2023 rattachés à leur rencontre FotMob avec le même score, sur les matchs de la période que couvre le magasin">Rattachés depuis 2023</th>
            <th title="Matchs dont le score football-data diffère de celui de FotMob">Écarts</th>
            <th class="is-left" title="Date du dernier téléchargement d'un fichier de ce championnat">Dernier relevé</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="l in lignes" :key="l.code">
            <td class="is-left is-strong fdh__ligue">
              <LeagueBadge v-if="l.league" :league="l.league" />
              <span v-else class="fdh__nom"><PlayerFlag :code="codeDrapeau(l.pays)" :size="14" /> {{ l.nom }}</span>
              <small class="fdh__petit">{{ l.code }} · {{ l.nom }}</small>
              <small v-for="(n, i) in noteDeLigne(l)" :key="i" class="fdh__petit">{{ n }}</small>
            </td>
            <td class="is-left cm-numeric">
              {{ texteSaisons(l.premiere, l.derniere) }}
              <small class="fdh__petit">{{ nombre(l.saisons) }} saison(s)</small>
            </td>
            <td class="cm-numeric is-strong">{{ nombre(l.matchs) }}</td>
            <td class="cm-numeric" :title="`${nombre(l.clubsPeriodeReconnus)} sur ${nombre(l.clubsPeriode)} des clubs qui ont joué depuis 2023 dans la période du magasin`">
              {{ nombre(l.clubsReconnus) }} / {{ nombre(l.clubs) }}
              <small class="fdh__petit">{{ pourcentTexte(part(l.clubsReconnus, l.clubs), 'aucun club') }}</small>
            </td>
            <td class="cm-numeric fdh__pct" :class="`is-${l.league ? tonRattachement(part(l.rattachees, l.periode)) : 'vide'}`">
              {{ l.league && l.periode ? pourcentTexte(part(l.rattachees, l.periode)) : '' }}
              <small class="fdh__petit">{{ texteRattachement(l) }}</small>
            </td>
            <td class="cm-numeric">{{ nombre(l.ecarts) }}</td>
            <td class="is-left cm-numeric">{{ dateCourte(l.dernierReleve) }}</td>
          </tr>
          <tr v-if="!lignes.length">
            <td class="is-left fdh__vide" colspan="7">
              {{ r ? 'Aucun championnat pour ce choix.' : d?.etat === 'jamais' ? 'Le tableau se remplira au premier import (prochaine passe de l’actualisation).' : 'Résumé indisponible : rien à afficher.' }}
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td class="is-left is-strong">Σ {{ nombre(pied.lignes) }} championnat(s)</td>
            <td class="cm-numeric is-strong" title="Saisons de championnat (une saison d'un championnat = une ligne de fichier)">{{ nombre(pied.saisons) }}</td>
            <td class="cm-numeric is-strong">{{ nombre(pied.matchs) }}</td>
            <td class="cm-numeric is-strong">{{ nombre(pied.clubsReconnus) }} / {{ nombre(pied.clubs) }}</td>
            <td class="cm-numeric is-strong">{{ nombre(pied.rattachees) }} / {{ nombre(pied.periode) }}</td>
            <td class="cm-numeric is-strong">{{ nombre(pied.ecarts) }}</td>
            <td class="is-left fdh__moyenne" title="Dernier téléchargement, tous fichiers confondus">{{ dateCourte(r?.fichiers?.dernierReleve) }}</td>
          </tr>
          <tr>
            <td class="is-left fdh__moyenne" colspan="3">⌀ sur tous ces matchs et clubs réunis</td>
            <td class="cm-numeric fdh__moyenne">{{ pourcentTexte(pied.partClubs, 'aucun club') }}</td>
            <td class="cm-numeric fdh__pct is-strong" :class="`is-${tonRattachement(pied.partRattachee)}`">{{ pourcentTexte(pied.partRattachee) }}</td>
            <td class="cm-numeric fdh__moyenne" colspan="2">{{ pied.periode ? `${pourcentTexte(part(pied.ecarts, pied.periode))} d’écarts` : '' }}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- 4. Les cotes gardées. -->
    <h4 class="cm-group-title fdh__groupe">
      Les cotes gardées, livre par livre
      <HelpTip
        titre="D’où viennent ces cotes"
        texte="Les cotes que publie football-data.co.uk : avant-match (relevées le vendredi pour le week-end, le mardi en semaine) et clôture (au plus près du coup d’envoi, publiée après le match, depuis 2019-20 ; 2012-13 pour Pinnacle). La moyenne et le maximum du marché viennent de BetBrain jusqu’en 2018-19, puis de football-data. William Hill n’a que le 1 N 2."
      />
    </h4>
    <div class="cm-table-wrap fdh__wrap">
      <table class="cm-table fdh__table">
        <thead>
          <tr>
            <th class="is-left" rowspan="2">Livre</th>
            <th v-for="m in MARCHES" :key="m.cle" colspan="2" class="is-center">{{ m.nom }}</th>
          </tr>
          <tr>
            <template v-for="m in MARCHES" :key="`${m.cle}-mom`">
              <th>avant-match</th>
              <th>clôture</th>
            </template>
          </tr>
        </thead>
        <tbody>
          <tr v-for="l in cotes" :key="l.cle">
            <td class="is-left is-strong">{{ l.nom }}</td>
            <td v-for="c in l.cases" :key="`${c.marche}-${c.moment}`" class="cm-numeric fdh__cote" :class="{ 'is-absent': !c.publie || !c.matchs }" :title="`${l.nom}, ${libelleMoment(c.moment)}`">
              {{ c.texte }}
              <small v-if="c.matchs" class="fdh__petit">{{ nombre(c.matchs) }} matchs</small>
              <small v-if="c.fichiersParPays" class="fdh__petit">+ {{ nombre(c.fichiersParPays) }} (fichiers par pays)</small>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <h4 class="cm-group-title fdh__groupe">
      Saison par saison : William Hill, Pinnacle et la moyenne du marché (1 N 2)
      <HelpTip
        titre="Jusqu’où vont les cotes de chaque livre"
        texte="La part des matchs des 22 divisions à fichier saisonnier qui ont la cote 1 N 2 de ce livre, saison par saison. C’est ce que le banc d’essai pourra simuler : des paris chez William Hill et au prix moyen du marché, là où les cotes existent."
      />
    </h4>
    <div class="cm-table-wrap fdh__wrap fdh__wrap--court">
      <table class="cm-table fdh__table">
        <thead>
          <tr>
            <th class="is-left">Saison</th>
            <th>Matchs</th>
            <th v-for="c in TEMOINS_SAISON" :key="c.colonne" :title="`${c.livre}, ${c.moment}`">{{ c.livre }}<br /><small>{{ c.moment }}</small></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in parSaison" :key="s.saison">
            <td class="is-left cm-numeric">{{ s.saison }}</td>
            <td class="cm-numeric">{{ nombre(s.matchs) }}</td>
            <td v-for="c in TEMOINS_SAISON" :key="c.colonne" class="cm-numeric" :class="{ 'fdh__absent': !s.parts[c.colonne].n }" :title="`${nombre(s.parts[c.colonne].n)} match(s) sur ${nombre(s.matchs)}`">
              {{ s.parts[c.colonne].n ? pourcentTexte(s.parts[c.colonne].pct) : 'aucune' }}
            </td>
          </tr>
          <tr v-if="!parSaison.length">
            <td class="is-left fdh__vide" :colspan="2 + TEMOINS_SAISON.length">{{ r ? 'Aucune saison importée.' : 'Résumé indisponible : rien à afficher.' }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td class="is-left is-strong">Σ {{ nombre(parSaison.length) }} saison(s)</td>
            <td class="cm-numeric is-strong">{{ nombre(piedSaisons.matchs) }}</td>
            <td v-for="c in TEMOINS_SAISON" :key="c.colonne" class="cm-numeric is-strong">{{ nombre(piedSaisons.parts[c.colonne].n) }}</td>
          </tr>
          <tr>
            <td class="is-left fdh__moyenne" colspan="2">⌀ sur tous ces matchs</td>
            <td v-for="c in TEMOINS_SAISON" :key="c.colonne" class="cm-numeric fdh__moyenne">{{ pourcentTexte(piedSaisons.parts[c.colonne].pct) }}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- 5. Les fichiers en échec. -->
    <h4 class="cm-group-title fdh__groupe">Fichiers en échec</h4>
    <div class="cm-table-wrap fdh__wrap fdh__wrap--court">
      <table class="cm-table fdh__table">
        <thead>
          <tr>
            <th class="is-left">Fichier</th>
            <th class="is-left">Raison</th>
            <th>Essais</th>
            <th class="is-left">Dernier essai</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in echecs" :key="e.fichier">
            <td class="is-left is-strong">{{ e.fichier }}.csv</td>
            <td class="is-left fdh__detail">
              {{ e.erreur ?? 'raison inconnue' }}
              <small v-if="e.relecture" class="fdh__petit">relecture de la semaine manquée : les matchs déjà importés restent, nouvel essai à la passe suivante</small>
            </td>
            <td class="cm-numeric">{{ nombre(e.essais) }}</td>
            <td class="is-left cm-numeric">{{ e.le ? formatDateTime(e.le) : 'date inconnue' }}</td>
          </tr>
          <tr v-if="!echecs.length">
            <td class="is-left fdh__vide" colspan="4">{{ r ? 'Aucun fichier en échec : la passe suivante n’a rien à reprendre.' : 'Liste indisponible : résumé non lu.' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="absents.length" class="fdh__pied">
      <AppIcon name="file" :size="12" />
      <span>{{ nombre(absents.length) }} fichier(s) absent(s) chez football-data.co.uk (réponse 404), jamais redemandés pour une saison passée : {{ absents.slice(0, 8).join(', ') }}{{ absents.length > 8 ? '…' : '' }}.</span>
    </p>

    <!-- 6. Les écarts de score. -->
    <h4 class="cm-group-title fdh__groupe">
      Écarts de score entre football-data et FotMob
      <HelpTip
        titre="Ce qu’est un écart de score"
        texte="Un match de football-data que les deux clubs et la date désignent sans hésitation au magasin, mais dont le score diffère de celui de FotMob (résultat attribué sur tapis vert, erreur d’une des deux sources). Rien n’est corrigé : le contrôle quotidien (étape 14) les reprendra."
      />
    </h4>
    <div class="cm-table-wrap fdh__wrap fdh__wrap--court">
      <table class="cm-table fdh__table">
        <thead>
          <tr>
            <th class="is-left">Match</th>
            <th>football-data</th>
            <th>FotMob</th>
            <th class="is-left">Rencontre FotMob</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(e, i) in ecartsAffiches" :key="`${e.matchKey}-${i}`" :title="phraseEcart(e)">
            <td class="is-left fdh__match">
              <strong>{{ e.dom }} - {{ e.ext }}</strong>
              <small class="fdh__petit">{{ dateCourte(e.date) }} · {{ e.league ?? e.code }} {{ e.saison }}</small>
            </td>
            <td class="cm-numeric is-strong">{{ e.scoreFootballData }}</td>
            <td class="cm-numeric is-strong">{{ e.scoreMagasin ?? 'introuvable' }}</td>
            <td class="is-left fdh__detail">{{ e.rencontreMagasin ?? 'rencontre retirée du magasin' }}<small class="fdh__petit">{{ e.matchKey }}</small></td>
          </tr>
          <tr v-if="!ecarts.length">
            <td class="is-left fdh__vide" colspan="4">{{ r ? 'Aucun écart de score.' : 'Liste indisponible : résumé non lu.' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="ecarts.length > ecartsAffiches.length || (r?.ecarts?.total ?? 0) > ecarts.length" class="fdh__plus">
      <span class="fdh__texte">{{ nombre(ecartsAffiches.length) }} affiché(s) sur {{ nombre(r?.ecarts?.total ?? ecarts.length) }} — les plus récents d’abord.</span>
      <AppButton v-if="ecarts.length > ecartsAffiches.length" variant="ghost" size="sm" @click="ecartsVisibles += PAS">Voir {{ nombre(Math.min(PAS, ecarts.length - ecartsAffiches.length)) }} de plus</AppButton>
    </div>

    <!-- 7. Ce que fait l'import, et ce qu'il ne fait jamais. -->
    <p class="fdh__pied">
      <AppIcon name="shield" :size="12" />
      <span>
        L’import se fait par le serveur, dans l’actualisation : {{ nombre(d?.parPasse ?? 150) }} requêtes au plus par passe, au moins 1,5 s entre deux requêtes,
        jamais pendant un autre import. Chaque semaine, les fichiers de la saison en cours sont repris de ceux que l’étape « cotes passées » vient de
        télécharger ; seuls les autres sont redemandés au site. Les clubs sont reconnus par le vote (jour et score), jamais par la ressemblance des noms.
        <template v-if="d?.import?.termineLe"> Import complet terminé le {{ formatDateTime(d.import.termineLe) }}.</template>
        <template v-if="d?.import?.tailleBaseAvant"> Base : {{ tailleTexte(d.import.tailleBaseAvant) }} avant le premier import{{ d.import.tailleBaseApres ? `, ${tailleTexte(d.import.tailleBaseApres)} après` : '' }}.</template>
        <template v-if="d?.base"> Base : {{ d.base }}.</template>
        <template v-if="r?.cache?.dossier"> Fichiers gardés : {{ r.cache.dossier }}.</template>
      </span>
    </p>
  </div>
</template>

<style scoped>
.fdh {
  container: fdh / inline-size;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.fdh__kpis {
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
}

/* Valeurs textuelles (« Complet », « 63,4 Mo ») : plus petites qu'un chiffre seul. */
.fdh__kpi-texte {
  font-size: 17px;
  line-height: 1.3;
}

.cm-kpi.is-ok .cm-kpi__value {
  color: var(--cm-accent);
}

.cm-kpi.is-warn .cm-kpi__value {
  color: var(--cm-warning);
}

.cm-kpi.is-danger .cm-kpi__value {
  color: var(--cm-danger);
}

.fdh__titre--danger {
  color: var(--cm-danger);
}

.fdh__texte {
  font-size: 12.5px;
  color: var(--cm-text-secondary);
}

.fdh__entete {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.fdh__groupe {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 6px 0 0;
}

/* Le choix des championnats : barre segmentée, même dessin que TabbedView. */
.fdh__choix {
  display: inline-flex;
  flex-wrap: wrap;
  align-self: flex-start;
  gap: 3px;
  max-width: 100%;
  padding: 4px;
  border-radius: 999px;
  border: 1px solid var(--cm-border-soft);
  background: rgb(var(--cm-glass-tint) / var(--cm-glass-alpha-1));
}

.fdh__choix-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 14px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--cm-text-secondary);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: background var(--cm-transition), color var(--cm-transition), box-shadow var(--cm-transition);
}

.fdh__choix-btn:hover {
  background: rgb(var(--cm-glass-tint) / var(--cm-glass-alpha-2));
  color: var(--cm-text-primary);
}

.fdh__choix-btn.is-active,
.fdh__choix-btn.is-active:hover {
  background: var(--cm-section);
  color: var(--cm-section-on);
  box-shadow: 0 4px 14px rgba(var(--cm-section-rgb) / 0.3);
}

.fdh__wrap {
  max-height: 560px;
}

.fdh__wrap--court {
  max-height: 380px;
}

.fdh__table td {
  font-size: 12.5px;
  vertical-align: top;
}

.fdh__ligue {
  min-width: 210px;
  white-space: normal;
}

.fdh__nom {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

/* Les couleurs du tableau de couverture voisin : la donnée est là, partielle
   ou rare (la couleur ne dit rien que le pourcentage ne dise). */
.fdh__pct {
  font-weight: 700;
}

.fdh__pct.is-bon {
  color: var(--cm-accent);
}

.fdh__pct.is-partiel {
  color: var(--cm-warning);
}

.fdh__pct.is-faible {
  color: var(--cm-danger);
}

.fdh__pct.is-vide {
  color: var(--cm-text-muted);
  font-weight: 500;
}

.fdh__cote {
  min-width: 118px;
  white-space: normal;
}

.fdh__cote.is-absent,
.fdh__absent {
  color: var(--cm-text-muted);
}

.fdh__petit {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  font-weight: 500;
  color: var(--cm-text-muted);
  white-space: normal;
}

.fdh__vide {
  color: var(--cm-text-secondary);
  white-space: normal;
}

.fdh__moyenne {
  color: var(--cm-text-muted);
}

.fdh__match {
  min-width: 200px;
  white-space: normal;
}

.fdh__detail {
  line-height: 1.45;
  color: var(--cm-text-secondary);
  white-space: normal;
  overflow-wrap: anywhere;
}

.fdh__plus {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.fdh__pied {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--cm-text-muted);
  overflow-wrap: anywhere;
}

.fdh__pied :deep(svg) {
  flex-shrink: 0;
  margin-top: 3px;
}

@container fdh (max-width: 560px) {
  .fdh__ligue {
    min-width: 160px;
  }
}
</style>
