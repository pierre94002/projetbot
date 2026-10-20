<script setup>
/**
 * Carnet de santé des données (étape 12 du plan, 06/10/2026) : pour chaque
 * championnat et chaque saison (vraies bornes, année civile comprise), la part
 * des matchs joués qui ont leurs xG, tirs, corners, cartons, joueurs et
 * compositions — colonnes total et moyenne, vert / orange / rouge — puis la
 * liste des anomalies trouvées par le contrôle (doublons, mauvaise
 * compétition, manquants, chiffres impossibles, zéros « non relevés », clubs
 * ou joueurs mal identifiés) avec le match concerné et la date du contrôle.
 *
 * Tout est LU (GET /api/match-stats/health, un état préparé chaque nuit par
 * l'étape « Contrôles et carnet de santé des données » de l'actualisation) :
 * la carte ne lance aucun contrôle, ne recompte rien et ne corrige rien. Le
 * pied du tableau (Σ, ⌀) est refait pour les lignes affichées par la règle du
 * serveur (utils/carnetSante.js). Règles de dessin (ui/DESIGN.md) : chiffres
 * clés en .cm-kpis, tableaux complets même vides ou en erreur, Σ total et ⌀
 * moyenne au pied, provenance réelle, jamais un chiffre absent sans le dire.
 */
import { computed, onMounted, ref, watch } from 'vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import AppSelect from '@/components/common/AppSelect.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import LeagueBadge from '@/components/matches/LeagueBadge.vue';
import { matchStatsApi } from '@/services/matchStatsApi.js';
import { useFavoritesStore } from '@/stores/favoritesStore.js';
import { formatDateTime } from '@/utils/format.js';
import { formatLeagueOptionLabel } from '@/utils/leagueDisplay.js';
import {
  SEUILS_PAR_DEFAUT,
  DONNEES_PAR_DEFAUT,
  TYPES_PAR_DEFAUT,
  ICONES_TYPES,
  TONS_GRAVITE,
  tonDe,
  pourcentTexte,
  nombre,
  totauxDuCarnet,
  filtrerCarnet,
  noteDeLigne,
  ongletsAnomalies,
  phraseDuControle
} from '@/utils/carnetSante.js';

const props = defineProps({
  /** Fin de la dernière passe d'actualisation : la carte se relit quand elle change. */
  passeTermineeLe: { type: String, default: null }
});

const favoris = useFavoritesStore();
const PAS = 300;

const etat = ref({ loading: false, error: null, data: null });
const typeChoisi = ref('');
const limite = ref(PAS);
const ligue = ref('');
const saisons = ref('en-cours');

async function charger() {
  etat.value = { ...etat.value, loading: true, error: null };
  try {
    etat.value = { loading: false, error: null, data: await matchStatsApi.health({ type: typeChoisi.value, limite: limite.value }) };
  } catch (error) {
    // Un serveur d'avant l'étape 12 prend « health » pour un identifiant de match.
    const message = /introuvables pour le match health/.test(error.message) ? "Le serveur n'est pas à jour : relancez demarrer-cotemaster.bat pour activer le carnet de santé." : error.message;
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

function choisirType(cle) {
  if (typeChoisi.value === cle) return;
  typeChoisi.value = cle;
  limite.value = PAS;
  charger();
}

function voirPlus() {
  limite.value += PAS;
  charger();
}

// ------------------------------------------------------------ présentation
const d = computed(() => etat.value.data);
const pret = computed(() => d.value?.etat === 'pret');
const seuils = computed(() => d.value?.seuils ?? SEUILS_PAR_DEFAUT);
const donnees = computed(() => d.value?.donnees ?? DONNEES_PAR_DEFAUT);
const types = computed(() => d.value?.types ?? TYPES_PAR_DEFAUT);
const libelleType = (cle) => types.value.find((t) => t.cle === cle)?.libelle ?? cle;
const libelleGravite = (cle) => d.value?.gravites?.find((g) => g.cle === cle)?.libelle ?? cle;
const sorte = (a) => d.value?.sortes?.[a.sorte] ?? null;
const c = computed(() => d.value?.controle ?? null);

const lignesFiltrees = computed(() => {
  const lignes = filtrerCarnet(d.value?.carnet ?? [], { ligue: ligue.value, saisons: saisons.value });
  // Une LISTE de championnats : les favoris d'abord (un classement, lui, ne se réordonne jamais).
  return favoris.favoritesFirst(lignes, { league: (l) => l.league });
});
const pied = computed(() => totauxDuCarnet(lignesFiltrees.value, donnees.value));
const tousLesMatchs = computed(() => d.value?.totaux ?? null);

const ligueOptions = computed(() => {
  const ligues = [...new Set((d.value?.carnet ?? []).map((l) => l.league))].sort((a, b) => formatLeagueOptionLabel(a).localeCompare(formatLeagueOptionLabel(b), 'fr'));
  const avecFavoris = favoris.leagues.length > 0;
  return [
    { value: '', label: 'Tous les championnats', icon: 'layers', hint: `${nombre(ligues.length)} championnat(s)` },
    ...favoris.favoritesFirst(ligues, { league: (l) => l }).map((l) => {
      const favorite = favoris.isFavoriteLeague(l);
      return { value: l, label: formatLeagueOptionLabel(l), league: l, favorite, group: avecFavoris ? (favorite ? 'Favoris' : 'Autres championnats') : undefined };
    })
  ];
});
watch(ligueOptions, (options) => {
  if (ligue.value && !options.some((o) => o.value === ligue.value)) ligue.value = '';
});
const SAISONS = [
  { value: 'en-cours', label: 'Saison en cours', icone: 'clock' },
  { value: 'toutes', label: 'Toutes les saisons', icone: 'calendar' }
];

const onglets = computed(() => ongletsAnomalies(types.value, d.value?.parType, d.value?.anomaliesTotal));
const anomalies = computed(() => d.value?.anomalies ?? []);
const restantes = computed(() => Math.max(0, (d.value?.anomaliesFiltrees ?? 0) - anomalies.value.length));
const erreurs = computed(() => Object.values(d.value?.parType ?? {}).reduce((n, t) => n + (t?.erreur ?? 0), 0));

const kpiControle = computed(() => {
  if (!d.value) return { valeur: 'non lu', detail: 'état indisponible', ton: 'is-warn' };
  if (d.value.etat === 'jamais') return { valeur: 'Pas encore', detail: 'le premier contrôle, complet, se fait à la prochaine passe de nuit', ton: 'is-warn' };
  if (d.value.etat === 'illisible') return { valeur: 'Illisible', detail: d.value.erreur ?? 'carnet illisible', ton: 'is-danger' };
  return { valeur: c.value?.mode === 'complet' ? 'Complet' : 'De nuit', detail: `le ${formatDateTime(c.value?.le)}`, ton: 'is-ok' };
});

/** Ce que les pages de compétition FotMob ont de joué AVANT la première saison du magasin (compté à part, jamais une anomalie). */
const horsPerimetre = computed(() => {
  const liste = c.value?.fotmob?.horsPerimetre ?? [];
  const saisons = [...new Set(liste.map((x) => x.saison))].sort();
  return { matchs: liste.reduce((n, x) => n + (x.matchs ?? 0), 0), saisons: saisons.length ? `saison${saisons.length > 1 ? 's' : ''} ${saisons.join(', ')}` : '' };
});
/** Ce qu'ont dit les pages de compétition FotMob au dernier contrôle complet qui les a lues. */
const phraseFotmob = computed(() => {
  const f = c.value?.fotmob;
  if (!f?.lu) return '';
  const avant = horsPerimetre.value.matchs
    ? ` ; avant sa première saison, ${nombre(horsPerimetre.value.matchs)} rencontres jouées que le magasin n'a jamais tenues (${horsPerimetre.value.saisons}), comptées à part, pas comme des anomalies`
    : '';
  return `Pages de compétition FotMob (le calendrier complet) lues le ${formatDateTime(f.le)} : ${nombre(f.competitions)} compétitions, ${nombre(f.saisons)} saisons — ${nombre(f.signalees)} rencontre(s) jouée(s) absente(s) du magasin${avant}.`;
});

const dateCourte = (iso) => (iso ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${String(iso).slice(0, 10)}T12:00:00`)) : 'date inconnue');
const texteCellule = (l, cle) => `${nombre(l.avec?.[cle])} match(s) sur ${nombre(l.matchs)} avec ${donnees.value.find((x) => x.cle === cle)?.quoi ?? cle}`;
</script>

<template>
  <div class="sante">
    <LoadingSpinner v-if="etat.loading && !d" label="Lecture du carnet de santé…" />

    <div v-if="etat.error" class="cm-note is-danger">
      <span class="cm-icon-box is-danger"><AppIcon name="x" :size="16" /></span>
      <div>
        <p class="cm-note__title sante__titre--danger">Carnet de santé illisible</p>
        <p class="cm-note__text sante__texte">{{ etat.error }} — le tableau ci-dessous reste affiché, sans valeurs.</p>
      </div>
    </div>

    <!-- 1. Les chiffres clés. -->
    <div class="cm-kpis sante__kpis">
      <div class="cm-kpi" :class="kpiControle.ton">
        <span class="cm-kpi__label">Dernier contrôle</span>
        <span class="cm-kpi__value sante__kpi-texte">{{ kpiControle.valeur }}</span>
        <span class="cm-kpi__detail">{{ kpiControle.detail }}</span>
      </div>
      <div class="cm-kpi">
        <span class="cm-kpi__label">Rencontres au magasin</span>
        <span class="cm-kpi__value">{{ pret ? nombre(c?.rencontresAuMagasin) : 'non lu' }}</span>
        <span class="cm-kpi__detail">{{ pret ? (c?.mode === 'complet' ? 'toutes relues à ce contrôle' : `${nombre(c?.rencontresControlees)} nouvelle(s) ou modifiée(s) relue(s) cette nuit`) : 'carnet indisponible' }}</span>
      </div>
      <div class="cm-kpi" :class="erreurs ? 'is-danger' : pret ? 'is-ok' : ''">
        <span class="cm-kpi__label">Anomalies</span>
        <span class="cm-kpi__value">{{ pret ? nombre(d.anomaliesTotal) : 'non lu' }}</span>
        <span class="cm-kpi__detail">{{ pret ? `dont ${nombre(erreurs)} erreur(s) ; ${nombre(c?.nouvellesAnomalies)} nouvelle(s), ${nombre(c?.anomaliesLevees)} levée(s) depuis le contrôle d'avant` : 'carnet indisponible' }}</span>
      </div>
      <div class="cm-kpi is-section">
        <span class="cm-kpi__label">Complétude moyenne</span>
        <span class="cm-kpi__value">{{ tousLesMatchs ? pourcentTexte(tousLesMatchs.moyenne) : 'non lu' }}</span>
        <span class="cm-kpi__detail">{{ tousLesMatchs ? `des six données, sur ${nombre(tousLesMatchs.matchs)} matchs joués de toutes les saisons` : 'carnet indisponible' }}</span>
      </div>
    </div>

    <!-- 2. Ce que fait le contrôle, et ce qu'il ne fait pas. -->
    <div v-if="d?.etat === 'jamais'" class="cm-note is-warning">
      <span class="cm-icon-box is-warning"><AppIcon name="clock" :size="16" /></span>
      <div>
        <p class="cm-note__title">Pas encore de contrôle</p>
        <p class="cm-note__text sante__texte">
          Le premier contrôle, complet (tout le magasin), se fait à la prochaine passe de nuit de l'actualisation ; ensuite, chaque nuit, seulement les rencontres
          nouvelles ou modifiées. Le tableau se remplira alors.
        </p>
      </div>
    </div>
    <div class="sante__entete">
      <ProvenanceChip
        source="Magasin FotMob · base SQLite (lecture seule)"
        :releve-le="c?.le ?? null"
        action="contrôlé"
        :fichier="d?.fichier ?? null"
        :detail="c ? phraseDuControle(c) : 'Le carnet est préparé chaque nuit par l’actualisation.'"
        :vieux-apres-heures="48"
      />
      <AppButton variant="secondary" size="sm" :loading="etat.loading" @click="charger">
        <template #icon><AppIcon name="refresh" :size="13" /></template>
        Relire
      </AppButton>
    </div>

    <!-- 3. Le carnet : un championnat et une saison par ligne. -->
    <h4 class="cm-group-title sante__groupe">
      Le carnet, championnat par championnat
      <HelpTip
        titre="Comment lire le carnet"
        texte="Pour chaque championnat et chaque saison (juillet-juin, ou l’année civile pour les pays nordiques, les Amériques et la Chine), la part des matchs joués qui ont la donnée pour les deux équipes. Vert à partir de 90 %, orange à partir de 50 %, rouge en dessous. Un résultat attribué sur tapis vert n’a pas de feuille à exiger : il est compté à part."
      />
    </h4>
    <div class="cm-toolbar sante__filtres">
      <AppSelect v-model="ligue" label="Championnat" :options="ligueOptions" class="sante__select" />
      <div class="sante__choix" role="radiogroup" aria-label="Saisons affichées">
        <button
          v-for="s in SAISONS"
          :key="s.value"
          type="button"
          role="radio"
          class="sante__choix-btn"
          :class="{ 'is-active': saisons === s.value }"
          :aria-checked="saisons === s.value"
          @click="saisons = s.value"
        >
          <AppIcon :name="s.icone" :size="13" />
          {{ s.label }}
        </button>
      </div>
    </div>
    <div class="cm-table-wrap sante__wrap">
      <table class="cm-table sante__table">
        <thead>
          <tr>
            <th class="is-left">Championnat</th>
            <th class="is-left">Saison</th>
            <th title="Matchs joués de la saison au magasin (le dénominateur de chaque part)">Total</th>
            <th v-for="x in donnees" :key="x.cle" :title="`Part des matchs joués avec ${x.quoi}`">{{ x.libelle }}</th>
            <th title="Moyenne des six parts de la ligne (la part des cases remplies), jamais une somme de pourcentages">Moyenne</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="l in lignesFiltrees" :key="`${l.league}|${l.season}`">
            <td class="is-left is-strong sante__ligue">
              <LeagueBadge :league="l.league" />
              <small v-for="(n, i) in noteDeLigne(l)" :key="i" class="sante__petit">{{ n }}</small>
            </td>
            <td class="is-left cm-numeric">
              {{ l.saison }}
              <small class="sante__petit">{{ l.premier ? `${dateCourte(l.premier)} → ${dateCourte(l.dernier)}` : 'aucune rencontre' }}</small>
            </td>
            <td class="cm-numeric is-strong" :title="`${nombre(l.rencontres)} rencontre(s) au magasin pour cette saison`">{{ nombre(l.matchs) }}</td>
            <td v-for="x in donnees" :key="x.cle" class="cm-numeric sante__pct" :class="`is-${tonDe(l.pourcent?.[x.cle], seuils)}`" :title="texteCellule(l, x.cle)">
              {{ pourcentTexte(l.pourcent?.[x.cle]) }}
            </td>
            <td class="cm-numeric sante__pct is-strong" :class="`is-${tonDe(l.moyenne, seuils)}`">{{ pourcentTexte(l.moyenne) }}</td>
          </tr>
          <tr v-if="!lignesFiltrees.length">
            <td class="is-left sante__vide" :colspan="4 + donnees.length">
              {{ pret ? 'Aucune ligne pour ce choix (championnat ou saison en cours).' : d?.etat === 'jamais' ? 'Le carnet se remplira au premier contrôle.' : 'Carnet indisponible : rien à afficher.' }}
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td class="is-left is-strong" colspan="2">Σ {{ nombre(lignesFiltrees.length) }} ligne(s)</td>
            <td class="cm-numeric is-strong">{{ nombre(pied.matchs) }}</td>
            <td v-for="x in donnees" :key="x.cle" class="cm-numeric is-strong" :title="`Matchs avec ${x.quoi}, sur les lignes affichées`">{{ nombre(pied.avec[x.cle]) }}</td>
            <td class="is-left sante__moyenne">cases remplies</td>
          </tr>
          <tr>
            <td class="is-left sante__moyenne" colspan="2">⌀ sur tous ces matchs</td>
            <td class="cm-numeric sante__moyenne">{{ nombre(pied.matchs) }}</td>
            <td v-for="x in donnees" :key="x.cle" class="cm-numeric sante__pct" :class="`is-${tonDe(pied.pourcent[x.cle], seuils)}`">{{ pourcentTexte(pied.pourcent[x.cle]) }}</td>
            <td class="cm-numeric sante__pct is-strong" :class="`is-${tonDe(pied.moyenne, seuils)}`">{{ pourcentTexte(pied.moyenne) }}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    <p v-if="d?.recoupement" class="sante__pied">
      <AppIcon name="swap" :size="12" />
      <span>
        Recoupement avec le tableau « Couverture des statistiques », qui rapproche le calendrier du magasin par le NOM des clubs (le carnet, par leurs
        identifiants FotMob) : sur {{ nombre(d.recoupement.totaux.finis) }} matchs terminés du calendrier, {{ nombre(d.recoupement.totaux.parNom) }} trouvés
        des deux façons, {{ nombre(d.recoupement.totaux.parIdsSeulement) }} seulement par les identifiants (le tableau les compte sans statistiques),
        {{ nombre(d.recoupement.totaux.introuvables) }} absents du magasin — relevé le {{ formatDateTime(d.recoupement.le) }}.
      </span>
    </p>

    <!-- 4. Les anomalies. -->
    <h4 class="cm-group-title sante__groupe">
      Les anomalies
      <HelpTip
        titre="Ce que le contrôle signale"
        texte="Doublons, rencontres rangées dans la mauvaise compétition, matchs manquants, chiffres impossibles, zéros qui veulent dire « non relevé », clubs ou joueurs mal identifiés. Rien n’est corrigé automatiquement : une erreur se corrige à la main (scripts du serveur, après une sauvegarde), une limite de la source se sait."
      />
    </h4>
    <div class="sante__choix sante__types" role="radiogroup" aria-label="Sorte d'anomalie">
      <button
        v-for="o in onglets"
        :key="o.cle || 'toutes'"
        type="button"
        role="radio"
        class="sante__choix-btn"
        :class="{ 'is-active': typeChoisi === o.cle }"
        :aria-checked="typeChoisi === o.cle"
        :disabled="!pret"
        @click="choisirType(o.cle)"
      >
        <AppIcon v-if="o.cle" :name="ICONES_TYPES[o.cle] ?? 'info'" :size="13" />
        {{ o.libelle }}
        <span class="cm-pill sante__compte">{{ nombre(o.compte) }}</span>
      </button>
    </div>
    <div class="cm-table-wrap sante__wrap">
      <table class="cm-table sante__table sante__anomalies">
        <thead>
          <tr>
            <th class="is-left">Match concerné</th>
            <th class="is-left">Anomalie</th>
            <th class="is-left">Gravité</th>
            <th class="is-left" title="Date du contrôle qui l'a vue en dernier, et du premier qui l'a trouvée">Contrôle</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in anomalies" :key="a.id">
            <td class="is-left sante__match">
              <strong>{{ a.label ?? 'rencontre sans nom' }}</strong>
              <small class="sante__petit">
                {{ a.date ? dateCourte(a.date) : 'saison entière' }}<template v-if="a.score"> · {{ a.score }}</template> · {{ a.league ?? 'compétition inconnue' }}<template v-if="a.saison"> {{ a.saison }}</template>
              </small>
            </td>
            <td class="is-left sante__constat">
              <span class="cm-chip sante__type">
                <AppIcon :name="ICONES_TYPES[a.type] ?? 'info'" :size="11" />
                {{ libelleType(a.type) }}<template v-if="sorte(a)"> · {{ sorte(a).libelle }}</template>
              </span>
              <span class="sante__detail" :title="sorte(a)?.explication ?? ''">{{ a.detail }}</span>
            </td>
            <td class="is-left">
              <span class="cm-chip" :class="TONS_GRAVITE[a.gravite] ?? ''">{{ libelleGravite(a.gravite) }}</span>
            </td>
            <td class="is-left cm-numeric sante__quand">
              {{ a.controleLe ? formatDateTime(a.controleLe) : 'date inconnue' }}
              <small v-if="a.trouveeLe && a.trouveeLe !== a.controleLe" class="sante__petit">trouvée le {{ formatDateTime(a.trouveeLe) }}</small>
            </td>
          </tr>
          <tr v-if="!anomalies.length">
            <td class="is-left sante__vide" colspan="4">
              {{ pret ? (typeChoisi ? `Aucune anomalie de cette sorte (« ${libelleType(typeChoisi)} »).` : 'Aucune anomalie : rien ne cloche au dernier contrôle.') : d?.etat === 'jamais' ? 'La liste se remplira au premier contrôle.' : 'Liste indisponible : carnet non lu.' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="restantes" class="sante__plus">
      <span class="sante__texte">{{ nombre(anomalies.length) }} affichée(s) sur {{ nombre(d.anomaliesFiltrees) }} — les erreurs d'abord, puis les plus récentes.</span>
      <AppButton variant="ghost" size="sm" :loading="etat.loading" @click="voirPlus">Voir {{ nombre(Math.min(restantes, PAS)) }} de plus</AppButton>
    </div>

    <!-- 5. D'où ça vient, et ce que le contrôle ne fait jamais. -->
    <p v-if="pret" class="sante__pied">
      <AppIcon name="search" :size="12" />
      <span v-if="c?.fotmob?.lu">{{ phraseFotmob }}</span>
      <span v-else>
        Pages de compétition FotMob (le calendrier complet) : pas relues toutes saisons à ce contrôle (réseau, à la demande) ; la saison en cours l'est à
        chaque passe par l'étape « omissions », dont le carnet reprend les rencontres encore absentes.
      </span>
    </p>
    <p class="sante__pied">
      <AppIcon name="shield" :size="12" />
      <span>
        Le contrôle n'écrit jamais dans la base (il l'ouvre en lecture seule) et ne corrige rien ; il ne tourne jamais pendant un import. Complet la première
        fois, puis chaque nuit sur les seules rencontres nouvelles ou modifiées, comme une étape de l'actualisation.
        <template v-if="d?.complet"> Dernier contrôle complet le {{ formatDateTime(d.complet.le) }} ({{ nombre(d.complet.rencontres) }} rencontres{{ d.complet.fotmob ? ', avec les pages de compétition FotMob' : '' }}).</template>
        <template v-if="d?.base"> Base : {{ d.base }}.</template>
      </span>
    </p>
  </div>
</template>

<style scoped>
.sante {
  container: sante / inline-size;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.sante__kpis {
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
}

/* Valeurs textuelles (« Complet », « Pas encore ») : plus petites qu'un chiffre seul. */
.sante__kpi-texte {
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

.sante__titre--danger {
  color: var(--cm-danger);
}

.sante__texte {
  font-size: 12.5px;
  color: var(--cm-text-secondary);
}

.sante__entete {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.sante__groupe {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 6px 0 0;
}

.sante__filtres {
  align-items: flex-end;
  flex-wrap: wrap;
}

.sante__select {
  min-width: 240px;
}

/* Les choix (saisons, sorte d'anomalie) : barre segmentée, même dessin que
   TabbedView (fond discret, l'option active en relief couleur de section). */
.sante__choix {
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

.sante__types {
  border-radius: var(--cm-radius-md);
}

.sante__choix-btn {
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

.sante__choix-btn:hover:not(:disabled) {
  background: rgb(var(--cm-glass-tint) / var(--cm-glass-alpha-2));
  color: var(--cm-text-primary);
}

.sante__choix-btn.is-active,
.sante__choix-btn.is-active:hover:not(:disabled) {
  background: var(--cm-section);
  color: var(--cm-section-on);
  box-shadow: 0 4px 14px rgba(var(--cm-section-rgb) / 0.3);
}

.sante__choix-btn:disabled {
  cursor: default;
  opacity: 0.6;
}

.sante__compte {
  padding: 1px 7px;
  font-size: 11px;
}

.sante__wrap {
  max-height: 560px;
}

.sante__table td {
  font-size: 12.5px;
  vertical-align: top;
}

.sante__ligue {
  min-width: 200px;
  white-space: normal;
}

/* Les couleurs sémantiques du tableau de couverture : la donnée est là,
   partielle ou rare (la couleur ne dit rien que le pourcentage ne dise). */
.sante__pct {
  font-weight: 700;
}

.sante__pct.is-bon {
  color: var(--cm-accent);
}

.sante__pct.is-partiel {
  color: var(--cm-warning);
}

.sante__pct.is-faible {
  color: var(--cm-danger);
}

.sante__pct.is-vide {
  color: var(--cm-text-muted);
  font-weight: 500;
}

.sante__petit {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  font-weight: 500;
  color: var(--cm-text-muted);
  white-space: normal;
}

.sante__vide {
  color: var(--cm-text-secondary);
  white-space: normal;
}

.sante__moyenne {
  color: var(--cm-text-muted);
}

.sante__match {
  min-width: 190px;
  white-space: normal;
}

.sante__constat {
  min-width: 280px;
  white-space: normal;
}

.sante__type {
  margin-bottom: 4px;
}

.sante__detail {
  display: block;
  line-height: 1.45;
  color: var(--cm-text-secondary);
  overflow-wrap: anywhere;
}

.sante__quand {
  min-width: 130px;
  white-space: normal;
}

.sante__plus {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.sante__pied {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--cm-text-muted);
  overflow-wrap: anywhere;
}

.sante__pied :deep(svg) {
  flex-shrink: 0;
  margin-top: 3px;
}

@container sante (max-width: 560px) {
  .sante__select {
    min-width: 0;
    width: 100%;
  }
}
</style>
