<script setup>
import { computed, ref, watch } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import FavoriteStar from '@/components/common/FavoriteStar.vue';
import TeamCrest from './TeamCrest.vue';
import { matchStatsApi } from '@/services/matchStatsApi.js';
import { useFavoritesStore } from '@/stores/favoritesStore.js';
import { nomNormalise } from '@/utils/favoris.js';

/**
 * Le classement corrigé par les xG (04/10/2026) : la même compétition,
 * classée aux points attendus (xPts) plutôt qu'aux points pris.
 *
 * Le serveur rejoue chaque match joué sur ses occasions
 * (server/src/data/db/expectedPoints.js) : chaque tir marque avec la
 * probabilité de son xG — la méthode d'Understat — ou, sans carte des tirs
 * complète, le xG total de l'équipe sert de moyenne à une loi de Poisson.
 * D'où, match par match, 3 × P(victoire) + P(nul). L'écart points − xPts dit
 * qui gagne plus (ou moins) que ses occasions ne le justifient : une chance
 * — ou une malchance — qui a tendance à s'inverser.
 *
 * Le rang réel est celui du classement affiché à côté (rattaché par
 * identifiant FotMob, sinon par nom). Comme tout classement, celui-ci ne se
 * réordonne jamais pour les favoris : leur ligne est seulement marquée.
 */
const props = defineProps({
  league: { type: String, required: true },
  // Année de début de la saison du classement affiché (2026 pour 2026-27) ;
  // absente, le serveur prend la plus récente du magasin.
  season: { type: [Number, String], default: null },
  // Les lignes du classement affiché (officiel FotMob ou calculé) : elles
  // donnent le VRAI rang de chaque équipe.
  standingsRows: { type: Array, default: () => [] },
  official: { type: Boolean, default: false },
  // La table affichée, quand la compétition en publie plusieurs (conférence, groupe).
  tableName: { type: String, default: null },
  // Le classement se charge encore : sa saison n'est pas sûre, on attend
  // plutôt que de calculer la table d'une autre saison.
  pending: { type: Boolean, default: false }
});

// Favoris (03/10/2026) : une équipe favorite porte son étoile, l'ordre ne bouge pas.
const favoris = useFavoritesStore();

const etat = ref({ loading: false, error: null, absent: false, data: null });
// Seule la réponse de la DERNIÈRE demande s'affiche : passer vite d'une
// compétition à l'autre ne doit pas laisser à l'écran la table d'avant.
let derniereDemande = 0;
let cleChargee = null;

async function charger() {
  if (props.pending) return;
  const cle = `${props.league}|${props.season ?? ''}`;
  // Le classement relu pour une autre de ses tables (une conférence) ne
  // change ni la compétition ni la saison : rien à recalculer.
  if (cle === cleChargee) return;
  cleChargee = cle;
  const demande = ++derniereDemande;
  etat.value = { loading: true, error: null, absent: false, data: null };
  try {
    const data = await matchStatsApi.xgTable(props.league, props.season ?? null);
    if (demande !== derniereDemande) return;
    etat.value = { loading: false, error: null, absent: false, data };
  } catch (error) {
    if (demande !== derniereDemande) return;
    // Le 404 « Aucun match joué au magasin… » est l'état de la saison, pas
    // une panne ; httpClient ne garde que le message de l'erreur, pas son
    // code, d'où la lecture du message.
    const absent = /^Aucun match joué/.test(error.message ?? '');
    etat.value = { loading: false, error: absent ? null : error.message, absent, data: null };
    // Une panne se retente au prochain rechargement du classement.
    if (!absent) cleChargee = null;
  }
}

watch(() => [props.league, props.season, props.pending], charger, { immediate: true });

const data = computed(() => etat.value.data);

// ------------------------------------------------------------ le rang réel
const officielles = computed(() => {
  const parId = new Map();
  const parNom = new Map();
  for (const r of props.standingsRows) {
    if (r.teamId) parId.set(String(r.teamId), r);
    for (const n of [r.teamName, r.shortName]) if (n) parNom.set(nomNormalise(n), r);
  }
  return { parId, parNom };
});

/** La ligne d'une équipe dans le classement affiché : par identifiant FotMob, sinon par nom. */
function ligneOfficielle(row) {
  const { parId, parNom } = officielles.value;
  return (row.teamId ? parId.get(String(row.teamId)) : null) ?? parNom.get(nomNormalise(row.teamName)) ?? null;
}

/**
 * Les lignes de la table corrigée, avec leur rang réel.
 *
 * Le rang réel est celui du classement affiché quand celui-ci retrouve
 * TOUTES les équipes, chacune une seule fois. Sinon — une conférence de la
 * MLS, un groupe de coupe — mêler ses rangs à ceux d'un autre calcul ne
 * voudrait rien dire : tous viennent alors du serveur, sur les mêmes matchs
 * (points, différence de buts, buts marqués).
 */
const rattachement = computed(() => {
  const rows = [...(data.value?.rows ?? [])].sort((a, b) => a.xRank - b.xRank);
  const trouvees = rows.map(ligneOfficielle);
  const complet = rows.length > 0 && trouvees.every(Boolean) && new Set(trouvees).size === rows.length;
  return {
    rangsOfficiels: complet,
    lignes: rows.map((row, i) => {
      const o = trouvees[i];
      const rangReel = complet ? o.rank : row.rank;
      return {
        ...row,
        // Le nom du classement affiché à côté : le même club s'écrit pareil dans les deux vues.
        nom: o?.teamName ?? row.teamName,
        teamId: row.teamId ?? o?.teamId ?? null,
        rangReel,
        // Positif : l'équipe est mieux classée une fois corrigée (elle « mérite » plus).
        ecartRang: rangReel - row.xRank
      };
    })
  };
});
const lignes = computed(() => rattachement.value.lignes);

const estFavorite = (l) => favoris.isFavoriteTeam(l.nom, props.league, l.teamId ?? undefined);

// ------------------------------------------------------------- l'écriture
const DEUX_DECIMALES = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
const nombre2 = (x) => Number(x ?? 0).toLocaleString('fr-FR', DEUX_DECIMALES);
const arrondi2 = (x) => Math.round(Number(x ?? 0) * 100) / 100;

/** Un écart signé, au signe moins typographique : « +1,67 », « −3,43 », « 0,00 ». */
function signe(x) {
  const v = arrondi2(x);
  if (v > 0) return `+${nombre2(v)}`;
  if (v < 0) return `−${nombre2(-v)}`;
  return nombre2(0);
}

const pluriel = (n, un, plusieurs) => `${Number(n).toLocaleString('fr-FR')} ${n > 1 ? plusieurs : un}`;
const rangTexte = (n) => (n === 1 ? '1er' : `${n}e`);

/** Points pris au-dessus de ses occasions (ambre) ou en dessous (bleu). */
function classeEcart(x) {
  const v = arrondi2(x);
  return v > 0 ? 'is-lucky' : v < 0 ? 'is-unlucky' : '';
}

const classeRang = (n) => (n > 0 ? 'is-up' : n < 0 ? 'is-down' : 'is-same');

function titreRang(l) {
  const base = `${rangTexte(l.xRank)} aux points attendus, ${rangTexte(l.rangReel)} au classement réel`;
  if (!l.ecartRang) return `${base} : même place une fois corrigé par les xG`;
  const n = Math.abs(l.ecartRang);
  return `${base} : ${n} place${n > 1 ? 's' : ''} ${l.ecartRang > 0 ? 'de mieux' : 'de moins'} une fois corrigé par les xG`;
}

function titreMatchs(l) {
  if (l.playedWithXg === l.played) return `${pluriel(l.played, 'match joué', 'matchs joués')}, ${l.played > 1 ? 'tous avec xG' : 'avec xG'}`;
  const exclus = l.played - l.playedWithXg;
  return `${l.playedWithXg} avec xG sur ${pluriel(l.played, 'match joué', 'matchs joués')} : ${pluriel(exclus, 'exclu', 'exclus')} des points attendus, faute de xG`;
}

function titrePoints(l) {
  const sur = `${pluriel(l.pointsWithXg, 'point pris', 'points pris')} sur ${pluriel(l.playedWithXg, 'match avec xG', 'matchs avec xG')}`;
  if (l.played === l.playedWithXg) return sur;
  return `${sur} — ${pluriel(l.points, 'point', 'points')} au total sur ${pluriel(l.played, 'match joué', 'matchs joués')}`;
}

function titreEcart(l) {
  const v = arrondi2(l.pointsDiff);
  const faits = `${l.nom} : ${pluriel(l.pointsWithXg, 'point pris', 'points pris')} pour ${nombre2(l.xPoints)} attendus`;
  if (v > 0) return `${faits}, soit ${nombre2(v)} de plus que ses occasions ne le justifient — une réussite qui pourrait ne pas durer`;
  if (v < 0) return `${faits}, soit ${nombre2(-v)} de moins — moins de points que ses occasions : la malchance tourne souvent`;
  return `${faits} : exactement ce que valent ses occasions`;
}

function titreXg(l) {
  return `xG pour ${nombre2(l.xgFor)} – xG contre ${nombre2(l.xgAgainst)} (différence ${signe(l.xgDiff)}) : la valeur des occasions créées et concédées, d'après FotMob, sur ${pluriel(l.playedWithXg, 'match', 'matchs')}`;
}

function titreFinition(l) {
  const pour = arrondi2(l.goalsMinusXgFor);
  const contre = arrondi2(l.goalsMinusXgAgainst);
  const attaque = pour > 0 ? "l'attaque marque plus que ses occasions" : pour < 0 ? "l'attaque marque moins que ses occasions" : "l'attaque marque autant que ses occasions";
  const defense = contre > 0 ? 'la défense encaisse plus que les occasions concédées' : contre < 0 ? 'la défense encaisse moins que les occasions concédées' : 'la défense encaisse autant que les occasions concédées';
  return `Finition — buts marqués − xG pour : ${signe(pour)}, ${attaque} ; buts encaissés − xG contre : ${signe(contre)}, ${defense}`;
}

// ------------------------------------------------------- source et note
/** Une compétition sans aucun xG : on dit combien de matchs en manquent. */
const sansXg = computed(() => {
  const n = data.value?.matches ?? 0;
  const preuve = n > 1 ? `aucun des ${n} matchs joués au magasin cette saison n'a de xG` : "le match joué au magasin cette saison n'a pas de xG";
  return `Le classement corrigé est impossible : ${preuve}.`;
});

const ligneSource = computed(() => {
  const d = data.value;
  if (!d) return '';
  const saison = d.seasonLabel ? ` — saison ${d.seasonLabel}` : '';
  const avecXg = d.matchesWithoutXg ? `, ${d.matchesWithXg} avec xG` : '';
  return `Points attendus recalculés sur les xG FotMob du magasin${saison} · ${pluriel(d.matches, 'match joué', 'matchs joués')}${avecXg}`;
});

const noteMatchs = computed(() => {
  const d = data.value;
  if (!d) return '';
  const tirs = d.methods?.shots ?? 0;
  const poisson = d.methods?.poisson ?? 0;
  const sans = d.matchesWithoutXg ?? 0;
  const exclus = sans ? `, ${pluriel(sans, 'exclu', 'exclus')} faute de xG` : ', aucun exclu faute de xG';
  return `${pluriel(tirs, 'match rejoué', 'matchs rejoués')} tir par tir (chaque tir marque avec la probabilité de son xG, comme chez Understat), ${poisson} par le xG total de chaque équipe (loi de Poisson)${exclus}.`;
});

const noteRang = computed(() => {
  if (rattachement.value.rangsOfficiels) {
    return props.official
      ? 'Rang réel : celui du classement officiel FotMob.'
      : 'Rang réel : celui du classement calculé sur les résultats du magasin (sans pénalités ni départages du règlement).';
  }
  const calcul = 'Rang réel calculé sur les mêmes résultats (points, différence de buts, buts marqués)';
  if (!props.standingsRows.length) return `${calcul}.`;
  const table = props.tableName ? `la table « ${props.tableName} » affichée` : 'le classement affiché';
  return props.standingsRows.length < lignes.value.length
    ? `${calcul} : ${table} ne couvre pas toutes ces équipes.`
    : `${calcul} : toutes ces équipes n'ont pas été retrouvées dans ${table}.`;
});
</script>

<template>
  <div class="xpt">
    <LoadingSpinner v-if="pending || etat.loading" label="Calcul du classement corrigé par les xG…" />

    <EmptyState
      v-else-if="etat.absent"
      icon="calendar"
      title="Aucun match joué cette saison au magasin"
      description="Le classement corrigé se calcule sur les matchs joués : il apparaîtra après la 1re journée."
    />

    <div v-else-if="etat.error" class="cm-note is-danger xpt__note">
      <span class="cm-icon-box is-danger is-sm"><AppIcon name="alert" :size="14" /></span>
      <div class="xpt__note-body">
        <p class="cm-note__title">Classement corrigé indisponible</p>
        <p class="xpt__note-text">{{ etat.error }}</p>
      </div>
    </div>

    <!-- Ce qui manque se dit avec sa raison (règle de Pierre). -->
    <EmptyState
      v-else-if="data && !data.matchesWithXg"
      icon="target"
      title="FotMob ne publie pas de xG pour cette compétition"
      :description="sansXg"
    />

    <EmptyState v-else-if="!lignes.length" icon="matches" title="Aucune équipe à classer" />

    <template v-else>
      <!-- D'où viennent ces chiffres : les xG FotMob du magasin. -->
      <p class="xpt__source">
        <AppIcon name="database" :size="12" />
        <span>{{ ligneSource }}</span>
      </p>

      <!-- Le classement corrigé, sur le dessin commun des tableaux : rang gris,
           logo et nom en gras, xPts (la colonne décisive) en couleur de
           section, l'écart en ambre (réussite) ou en bleu (malchance). -->
      <div class="cm-table-wrap">
        <table class="cm-table xpt__table">
          <!-- Largeurs posées sur l'en-tête (table-layout: fixed) : seul le nom
               du club est élastique. Les colonnes de xG n'apparaissent que si
               la place existe ; sinon, elles passent sous le nom du club. -->
          <thead>
            <tr>
              <th class="is-center xpt__col-rank" title="Rang aux points attendus (xPts), puis à la différence de xG">#</th>
              <th class="is-left">Équipe</th>
              <th class="is-center xpt__col-real" title="Rang au classement réel, et les places gagnées (flèche vers le haut) ou perdues (vers le bas) une fois corrigé par les xG">Réel</th>
              <th class="is-center xpt__col-played" title="Matchs avec xG / matchs joués : seuls les matchs avec xG entrent dans les points attendus">J</th>
              <th class="xpt__col-pts" title="Points pris sur les matchs avec xG">Pts</th>
              <th class="xpt__col-xpts" title="Points attendus : 3 × P(victoire) + P(nul), match par match, d'après les occasions">xPts</th>
              <th class="xpt__col-gap" title="Points pris − points attendus : positif, une réussite qui pourrait ne pas durer ; négatif, la malchance tourne souvent">Écart</th>
              <th class="xpt__wide xpt__col-xg" title="xG pour – xG contre : la valeur des occasions créées et concédées, d'après FotMob">xG</th>
              <th class="xpt__wide xpt__col-xgdiff" title="Différence de xG (pour − contre)">Diff</th>
              <th class="xpt__wide xpt__col-finish" title="Finition : buts marqués − xG pour / buts encaissés − xG contre">Finition</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in lignes" :key="l.teamId ?? l.teamName" class="xpt-row" :class="{ 'is-favorite': estFavorite(l) }">
              <td class="is-center xpt__rank cm-numeric">{{ l.xRank }}</td>
              <td class="is-left">
                <span class="xpt__team">
                  <TeamCrest :name="l.nom" :league="league" :team-id="l.teamId" :size="22" class="xpt__crest" />
                  <span class="xpt__team-text">
                    <span class="xpt__name-line">
                      <span class="xpt__name cm-truncate">{{ l.nom }}</span>
                      <FavoriteStar v-if="estFavorite(l)" active :interactive="false" :size="11" :label="l.nom" />
                    </span>
                    <!-- Étroit : les xG et la finition, en petit sous le nom. -->
                    <span class="xpt__sub cm-numeric">
                      <span :title="titreXg(l)">xG {{ nombre2(l.xgFor) }} – {{ nombre2(l.xgAgainst) }} <b :class="l.xgDiff >= 0 ? 'cm-positive' : 'cm-negative'">({{ signe(l.xgDiff) }})</b></span>
                      <span :title="titreFinition(l)">finition {{ signe(l.goalsMinusXgFor) }} / {{ signe(l.goalsMinusXgAgainst) }}</span>
                    </span>
                  </span>
                </span>
              </td>
              <td class="is-center xpt__real" :title="titreRang(l)">
                <span class="xpt__real-inner">
                  <span class="cm-numeric xpt__real-rank">{{ l.rangReel }}</span>
                  <span class="xpt__shift cm-numeric" :class="classeRang(l.ecartRang)">
                    <AppIcon v-if="l.ecartRang" name="chevronDown" :size="10" class="xpt__shift-icon" />{{ l.ecartRang ? Math.abs(l.ecartRang) : '=' }}
                  </span>
                </span>
              </td>
              <td class="is-center cm-numeric xpt__played" :title="titreMatchs(l)">
                {{ l.playedWithXg }}<small v-if="l.playedWithXg !== l.played" class="xpt__played-all">/{{ l.played }}</small>
              </td>
              <td class="cm-numeric xpt__pts" :title="titrePoints(l)">{{ l.pointsWithXg }}</td>
              <td class="cm-numeric is-strong xpt__xpts">{{ nombre2(l.xPoints) }}</td>
              <td class="cm-numeric xpt__gap" :class="classeEcart(l.pointsDiff)" :title="titreEcart(l)">{{ signe(l.pointsDiff) }}</td>
              <td class="cm-numeric xpt__wide xpt__xg" :title="titreXg(l)">{{ nombre2(l.xgFor) }}<span class="xpt__sep">–</span>{{ nombre2(l.xgAgainst) }}</td>
              <td class="cm-numeric xpt__wide" :class="l.xgDiff >= 0 ? 'cm-positive' : 'cm-negative'">{{ signe(l.xgDiff) }}</td>
              <td class="cm-numeric xpt__wide xpt__finish" :title="titreFinition(l)">{{ signe(l.goalsMinusXgFor) }} / {{ signe(l.goalsMinusXgAgainst) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Comment le lire, et sur quels matchs il repose. -->
      <div class="cm-note is-info xpt__note">
        <span class="cm-icon-box is-info is-sm"><AppIcon name="info" :size="14" /></span>
        <div class="xpt__note-body">
          <p class="cm-note__title">Comment le lire</p>
          <p class="xpt__note-text">
            <strong>Écart</strong> = points pris − points attendus (xPts), sur les mêmes matchs.
            <span class="xpt__lucky">Positif</span> : l'équipe gagne plus que ses occasions ne le justifient, une réussite qui pourrait ne pas durer.
            <span class="xpt__unlucky">Négatif</span> : moins de points que ses occasions, la malchance tourne souvent.
            La flèche du rang réel : les places gagnées (vers le haut) ou perdues (vers le bas) une fois corrigé.
          </p>
          <p class="xpt__note-text xpt__note-muted">{{ noteMatchs }} {{ noteRang }}</p>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.xpt {
  /* Se règle sur SA largeur : à côté du calendrier (≈ 400 à 640 px) ou en pleine largeur. */
  container: xpt / inline-size;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.xpt__source {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin: 0;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--cm-text-muted);
}

.xpt__source :deep(svg) {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--cm-section);
}

/* ------------------------------------------------------------ tableau */
/* Colonnes fixes : seul le nom du club est élastique. Sous 400 px, le
   tableau défile dans son cadre plutôt que d'écraser le nom. */
.xpt__table {
  table-layout: fixed;
  min-width: 400px;
}

/* Étroit par défaut (à côté du calendrier) : cases serrées, comme StandingsTable. */
.xpt__table th,
.xpt__table td {
  padding: 8px 6px;
  font-size: 12px;
}

.xpt__table td:first-child {
  padding-left: 8px;
}

.xpt__table th.xpt__col-rank {
  width: 32px;
}

.xpt__table th.xpt__col-real {
  width: 56px;
}

.xpt__table th.xpt__col-played {
  width: 46px;
}

.xpt__table th.xpt__col-pts {
  width: 36px;
}

.xpt__table th.xpt__col-xpts {
  width: 50px;
}

.xpt__table th.xpt__col-gap {
  width: 56px;
}

.xpt__table th.xpt__col-xg {
  width: 100px;
}

.xpt__table th.xpt__col-xgdiff {
  width: 60px;
}

.xpt__table th.xpt__col-finish {
  width: 104px;
}

/* Les colonnes de xG : seulement quand la place existe (voir plus bas). */
.xpt__table .xpt__wide {
  display: none;
}

/* Le rang corrigé : gris, centré (la règle commune aligne la première colonne à gauche). */
.xpt__table th.xpt__col-rank,
.xpt__table .xpt__rank {
  text-align: center;
  color: var(--cm-text-muted);
  font-weight: 600;
}

/* Le nom se tronque, jamais l'étoile qui le suit. */
.xpt__team {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.xpt__crest {
  flex-shrink: 0;
}

.xpt__team-text {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.xpt__name-line {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}

/* Le nom prend la place libre : l'étoile se range au bord, comme dans StandingsTable. */
.xpt__name {
  flex: 1 1 auto;
  min-width: 0;
  font-weight: 700;
  color: var(--cm-text-primary);
}

.xpt__sub {
  display: flex;
  flex-wrap: wrap;
  gap: 0 8px;
  font-size: 10.5px;
  line-height: 1.4;
  white-space: normal;
  color: var(--cm-text-muted);
}

/* Chaque précision reste d'un seul tenant : « (+3,22) » ne part jamais seul à la ligne. */
.xpt__sub > span {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.xpt__sub b {
  font-weight: 700;
}

/* Le rang réel et la flèche : bleu quand l'équipe monte une fois corrigée
   (elle prend moins que ses occasions), ambre quand elle descend (elle prend
   plus) — les couleurs de la colonne Écart. */
.xpt__real-inner {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.xpt__real-rank {
  font-weight: 600;
  color: var(--cm-text-secondary);
}

.xpt__shift {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  font-size: 10.5px;
  font-weight: 700;
}

.xpt__shift.is-up {
  color: var(--cm-info);
}

.xpt__shift.is-down {
  color: var(--cm-warning);
}

.xpt__shift.is-same {
  color: var(--cm-text-muted);
}

.xpt__shift.is-up .xpt__shift-icon {
  transform: rotate(180deg);
}

.xpt__played-all {
  font-size: 10.5px;
  font-weight: 500;
  color: var(--cm-text-muted);
}

.xpt__pts {
  color: var(--cm-text-secondary);
}

/* La colonne décisive : les points attendus, en couleur de section. */
.xpt__table .xpt__xpts {
  color: var(--cm-section);
  font-size: 13px;
  font-weight: 800;
}

.xpt__gap {
  font-weight: 700;
  color: var(--cm-text-secondary);
}

.xpt__table .xpt__gap.is-lucky {
  color: var(--cm-warning);
}

.xpt__table .xpt__gap.is-unlucky {
  color: var(--cm-info);
}

.xpt__xg {
  color: var(--cm-text-secondary);
}

.xpt__sep {
  margin: 0 4px;
  color: var(--cm-text-muted);
}

.xpt__finish {
  font-size: 11px;
  color: var(--cm-text-muted);
}

/* Une équipe favorite : sa ligne légèrement dorée, l'ordre ne change pas. */
.xpt-row.is-favorite > td {
  background-color: rgba(var(--cm-gold-rgb) / 0.07);
}

/* Large : les xG reprennent leurs colonnes, la ligne sous le nom s'efface. */
@container xpt (min-width: 720px) {
  .xpt__table th,
  .xpt__table td {
    padding: 9px 8px;
    font-size: 12.5px;
  }

  .xpt__table td:first-child {
    padding-left: 10px;
  }

  .xpt__table .xpt__wide {
    display: table-cell;
  }

  .xpt__sub {
    display: none;
  }
}

/* ---------------------------------------------------------------- note */
.xpt__note {
  gap: 10px;
  padding: 12px 14px;
}

.xpt__note-body {
  min-width: 0;
}

.xpt__note-text {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: var(--cm-text-secondary);
}

.xpt__note-text + .xpt__note-text {
  margin-top: 5px;
}

.xpt__note-text strong {
  font-weight: 700;
  color: var(--cm-text-primary);
}

.xpt__note-muted {
  font-size: 11.5px;
  color: var(--cm-text-muted);
}

.xpt__lucky {
  font-weight: 700;
  color: var(--cm-warning);
}

.xpt__unlucky {
  font-weight: 700;
  color: var(--cm-info);
}
</style>
