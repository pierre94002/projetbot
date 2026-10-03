<script setup>
import { computed, ref, watch } from 'vue';
import AppCard from '@/components/common/AppCard.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import AppSelect from '@/components/common/AppSelect.vue';
import TeamCrest from './TeamCrest.vue';
import StandingsTable from './StandingsTable.vue';
import { standingsApi } from '@/services/standingsApi.js';
import { matchStatsApi } from '@/services/matchStatsApi.js';
import { nomNormalise } from '@/utils/favoris.js';
import { teamIdFor } from '@/utils/teamIds.js';
import { parseLeagueLabel } from '@/utils/leagueDisplay.js';

/**
 * Le classement d'une compétition, à côté de son calendrier (03/10/2026,
 * Pierre : « dans l'onglet calendrier de saison, rajoute-moi le classement,
 * avec quelques informations sur le classement »).
 *
 * En tête, six informations tirées de la table et des résultats du
 * calendrier : le leader et son avance, la journée et l'avancement de la
 * saison (avec les buts par match), la meilleure attaque, la meilleure
 * défense, l'équipe la plus en forme, la lutte pour le maintien. Puis la
 * table elle-même (StandingsTable, la même que la fenêtre « Classement »),
 * avec la forme de chaque équipe sur ses cinq derniers matchs.
 *
 * Tout vient du magasin (FotMob) : la table par /standings, la forme et
 * l'avancement par les rencontres du calendrier déjà chargées — aucun appel
 * de plus pour elles.
 */
const props = defineProps({
  league: { type: String, required: true },
  season: { type: String, default: null }, // saison du calendrier (« 2025-26 »)
  currentSeason: { type: Boolean, default: true },
  matches: { type: Array, default: () => [] } // les rencontres de CETTE compétition dans la saison du calendrier
});

const etat = ref({ loading: false, error: null, data: null, autreSaison: false, matchsSaisonPrecedente: null });
const table = ref(null);

/**
 * La saison du calendrier se retrouve dans celles du classement par son
 * libellé (« 2025-26 »), ou par son année de début pour une compétition
 * jouée sur l'année civile ; sinon, le classement de la saison en cours, et
 * on le dit.
 */
async function charger() {
  const ligue = props.league;
  const saisonDemandee = props.currentSeason ? null : props.season;
  etat.value = { ...etat.value, loading: true, error: null };
  try {
    let season = null;
    let autreSaison = false;
    const { seasons = [] } = await matchStatsApi.seasons(ligue).catch(() => ({ seasons: [] }));
    if (saisonDemandee) {
      const trouvee = seasons.find((s) => s.label === saisonDemandee) ?? seasons.find((s) => String(s.season) === saisonDemandee.slice(0, 4));
      if (trouvee) season = trouvee.season;
      else autreSaison = true;
    }
    const data = await standingsApi.get(ligue, { season, table: table.value });
    if (props.league !== ligue) return;
    // Le nombre de matchs de la saison d'avant, au magasin : la mesure d'une
    // saison complète de cette compétition (journeesDuCalendrier).
    const debut = Number(data?.season) || null;
    const precedente = debut ? (seasons.find((x) => Number(x.season) === debut - 1)?.matches ?? null) : null;
    etat.value = { loading: false, error: null, data, autreSaison, matchsSaisonPrecedente: precedente };
  } catch (error) {
    if (props.league !== ligue) return;
    etat.value = { loading: false, error: error.message, data: null, autreSaison: false, matchsSaisonPrecedente: null };
  }
}

watch(
  () => [props.league, props.season, props.currentSeason],
  () => {
    table.value = null;
    charger();
  },
  { immediate: true }
);

function changerTable(nom) {
  table.value = nom;
  charger();
}

const rows = computed(() => [...(etat.value.data?.rows ?? [])].sort((a, b) => a.rank - b.rank));
const tables = computed(() => (etat.value.data?.tables ?? []).map((nom) => ({ value: nom, label: nom })));
const nomCourt = computed(() => parseLeagueLabel(props.league).name || props.league);

// ------------------------------------------------------- la forme (calendrier)
// Le classement et le calendrier n'écrivent pas toujours un club pareil :
// « Deportivo Alavés » d'un côté, « Alavés » ou « Alaves » de l'autre. Un nom
// du calendrier se rattache à sa ligne par le nom (complet ou court), sinon
// par l'identifiant FotMob du club — demandé pour ces seuls noms-là.
const lignesParNom = computed(() => {
  const parNom = new Map();
  for (const r of rows.value) for (const n of [r.teamName, r.shortName]) if (n) parNom.set(nomNormalise(n), r);
  return parNom;
});
const lignesParId = computed(() => new Map(rows.value.filter((r) => r.teamId).map((r) => [r.teamId, r])));

function ligneDe(nom) {
  const parNom = lignesParNom.value.get(nomNormalise(nom));
  if (parNom) return parNom;
  const id = teamIdFor(nom, props.league);
  return id ? (lignesParId.value.get(id) ?? null) : null;
}

/**
 * Les cinq derniers résultats de chaque équipe du classement, du plus récent
 * au plus ancien, lus dans les rencontres terminées du calendrier — au format
 * de FormBadges ({ result: V|N|D, opponent, score, date, home }).
 *
 * Jamais plus de matchs que l'équipe n'en a joué au classement : le calendrier
 * d'une coupe à phase de ligue contient aussi ses tours de qualification
 * (Fenerbahçe en comptait quatre de juillet-août en Ligue des champions),
 * qui n'appartiennent pas à la table.
 */
const formeParLigne = computed(() => {
  const parEquipe = new Map();
  // Le classement d'une autre saison que celle du calendrier : ses rencontres
  // ne disent rien de cette table.
  if (etat.value.autreSaison) return parEquipe;
  const jouees = props.matches
    .filter((m) => m.status === 'finished' && m.homeGoals != null && m.awayGoals != null)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  for (const m of jouees) {
    for (const cote of ['home', 'away']) {
      const ligne = ligneDe(cote === 'home' ? m.homeName : m.awayName);
      if (!ligne) continue;
      const cle = ligne.teamId ?? ligne.teamName;
      const liste = parEquipe.get(cle) ?? [];
      if (liste.length >= Math.min(5, ligne.played ?? 5)) continue;
      const pour = cote === 'home' ? m.homeGoals : m.awayGoals;
      const contre = cote === 'home' ? m.awayGoals : m.homeGoals;
      liste.push({
        result: pour > contre ? 'V' : pour < contre ? 'D' : 'N',
        opponent: cote === 'home' ? m.awayName : m.homeName,
        score: `${pour}-${contre}`,
        date: m.date,
        home: cote === 'home'
      });
      parEquipe.set(cle, liste);
    }
  }
  return parEquipe;
});

/** La forme d'une ligne du classement. */
const formeDe = (row) => formeParLigne.value.get(row.teamId ?? row.teamName) ?? null;

// ----------------------------------------------- le nombre de journées (calendrier)
/** La date du jour, au format des rencontres du calendrier (AAAA-MM-JJ, heure locale). */
function aujourdhui() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Le nombre de journées de la saison, quand le calendrier le dit sans
 * ambiguïté : toutes les équipes du classement s'y affrontent, chaque paire
 * le même nombre de fois (k), soit k × (n − 1) journées. Sinon null, et la
 * tuile n'affiche que la journée en cours — mieux vaut rien qu'un total faux :
 *   - calendrier publié par morceaux (Brésil, Paraguay, Chili, Liga MX) ;
 *   - phase de ligue sans aller-retour (Ligue des champions) ou table de
 *     conférence (MLS) ;
 *   - saison en deux phases dont la seconde n'est pas encore au calendrier
 *     (Autriche, Écosse, Danemark…) ou calendrier publié à moitié (la Suisse
 *     jusqu'à la 22e de ses 33 journées) : le total du calendrier reste loin
 *     des matchs de la saison précédente au magasin.
 * Le calendrier n'est pas toujours propre : une rencontre déplacée gardée à
 * ses deux dates, un même match importé deux fois, un report pas encore
 * reprogrammé. Un dixième des paires peut donc s'écarter du compte commun.
 * Une rencontre « à venir » datée d'avant aujourd'hui ne compte pas (déplacée
 * depuis, restée à son ancienne date — l'Ekstraklasa en gardait cinq), sauf
 * si elle est marquée reportée : elle se jouera.
 */
const journeesDuCalendrier = computed(() => {
  const liste = rows.value;
  const n = liste.length;
  if (n < 2 || etat.value.autreSaison) return null;
  const jour = aujourdhui();
  const cle = (r) => r.teamId ?? r.teamName;
  const paires = new Map();
  for (const m of props.matches) {
    if (m.status !== 'finished' && m.status !== 'postponed' && String(m.date) < jour) continue;
    const a = ligneDe(m.homeName);
    const b = ligneDe(m.awayName);
    if (!a || !b || a === b) continue;
    const paire = [cle(a), cle(b)].sort().join('|');
    paires.set(paire, (paires.get(paire) ?? 0) + 1);
  }
  if (paires.size !== (n * (n - 1)) / 2) return null;
  const frequences = new Map();
  for (const fois of paires.values()) frequences.set(fois, (frequences.get(fois) ?? 0) + 1);
  const [k, combien] = [...frequences].sort((x, y) => y[1] - x[1])[0];
  if (combien < 0.9 * paires.size) return null;
  const precedente = etat.value.matchsSaisonPrecedente;
  if (precedente && (k * n * (n - 1)) / 2 < 0.95 * precedente) return null;
  return k * (n - 1);
});

const points = (forme) => forme.reduce((total, f) => total + (f.result === 'V' ? 3 : f.result === 'N' ? 1 : 0), 0);
const unDecimal = (n) => n.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// ------------------------------------------------------ les informations clés
const infos = computed(() => {
  const liste = rows.value;
  if (!liste.length) return null;
  const [premier, second] = liste;
  const parRang = (a, b) => a.rank - b.rank;

  const journee = Math.max(...liste.map((r) => r.played ?? 0));
  const joues = liste.reduce((s, r) => s + (r.played ?? 0), 0);
  const matchsJoues = joues / 2;

  // Un total plus petit que la journée atteinte : le calendrier se trompe, on ne le dit pas.
  const journees = journeesDuCalendrier.value && journeesDuCalendrier.value >= journee ? journeesDuCalendrier.value : null;
  const buts = liste.reduce((s, r) => s + (r.goalsFor ?? 0), 0);

  const attaque = [...liste].sort((a, b) => (b.goalsFor ?? 0) - (a.goalsFor ?? 0) || parRang(a, b))[0];
  const defense = [...liste].sort((a, b) => (a.goalsAgainst ?? 0) - (b.goalsAgainst ?? 0) || parRang(a, b))[0];

  let enForme = null;
  for (const r of liste) {
    const f = formeDe(r);
    if (!f || f.length < 3) continue;
    const pts = points(f);
    if (!enForme || pts > enForme.pts) enForme = { row: r, pts, n: f.length, forme: f };
  }

  // Le maintien : l'écart entre la dernière équipe hors de la zone rouge et la première dedans.
  const iRelegation = liste.findIndex((r) => /relegation|relégation/i.test(r.description ?? ''));
  const maintien = iRelegation > 0 ? { sauf: liste[iRelegation - 1], menace: liste[iRelegation], ecart: liste[iRelegation - 1].points - liste[iRelegation].points } : null;

  return {
    commence: journee > 0,
    premier,
    second: second ?? null,
    avance: second ? premier.points - second.points : null,
    journee,
    journees,
    progression: journees ? Math.min(100, Math.round((joues / (journees * liste.length)) * 100)) : null,
    butsParMatch: matchsJoues ? unDecimal(buts / matchsJoues) : null,
    attaque,
    attaqueParMatch: attaque.played ? unDecimal(attaque.goalsFor / attaque.played) : null,
    defense,
    defenseParMatch: defense.played ? unDecimal(defense.goalsAgainst / defense.played) : null,
    enForme,
    maintien
  };
});
</script>

<template>
  <AppCard icon="award" eyebrow="Classement" :title="nomCourt" :subtitle="etat.data?.seasonLabel ? `Saison ${etat.data.seasonLabel}` : ''" class="lst">
    <template v-if="tables.length > 1" #actions>
      <AppSelect :model-value="etat.data?.table ?? null" :options="tables" class="lst__table-select" @update:model-value="changerTable" />
    </template>

    <p v-if="etat.autreSaison" class="cm-note is-warning lst__note">
      <AppIcon name="info" :size="14" />
      <span>Pas de classement enregistré pour la saison {{ season }} : voici celui de la saison en cours.</span>
    </p>

    <p v-if="infos && !infos.commence && !etat.loading" class="cm-note lst__note">
      <AppIcon name="info" :size="14" />
      <span>Aucun match joué pour l'instant : les informations du classement apparaîtront après la 1<sup>re</sup> journée.</span>
    </p>

    <!-- Les informations clés, tirées de la table et des résultats du calendrier. -->
    <div v-if="infos?.commence && !etat.loading" class="lst__kpis cm-stagger">
      <div class="lst__kpi is-lead">
        <span class="lst__kpi-label"><AppIcon name="trophy" :size="11" />En tête</span>
        <span class="lst__kpi-team">
          <TeamCrest :name="infos.premier.teamName" :league="league" :team-id="infos.premier.teamId ?? null" :size="22" />
          <span class="cm-truncate">{{ infos.premier.teamName }}</span>
        </span>
        <span class="lst__kpi-detail">
          <strong>{{ infos.premier.points }} pts</strong>
          <template v-if="infos.second">
            · {{ infos.avance === 0 ? 'à égalité avec' : `${infos.avance} d'avance sur` }} {{ infos.second.teamName }}
          </template>
        </span>
      </div>

      <div class="lst__kpi">
        <span class="lst__kpi-label"><AppIcon name="calendar" :size="11" />Saison</span>
        <span class="lst__kpi-value">
          {{ infos.journee }}<small>{{ infos.journee > 1 ? 'e' : 're' }} journée<template v-if="infos.journees"> sur {{ infos.journees }}</template></small>
        </span>
        <span v-if="infos.progression !== null" class="cm-bar lst__bar" :title="`${infos.progression} % des matchs de la saison sont joués`">
          <span class="cm-bar__fill" :style="{ width: `${infos.progression}%` }" />
        </span>
        <span class="lst__kpi-detail">
          <template v-if="infos.progression !== null">{{ infos.progression }} % joués</template>
          <template v-if="infos.progression !== null && infos.butsParMatch"> · </template>
          <template v-if="infos.butsParMatch">{{ infos.butsParMatch }} buts par match</template>
        </span>
      </div>

      <div class="lst__kpi">
        <span class="lst__kpi-label"><AppIcon name="target" :size="11" />Meilleure attaque</span>
        <span class="lst__kpi-team">
          <TeamCrest :name="infos.attaque.teamName" :league="league" :team-id="infos.attaque.teamId ?? null" :size="20" />
          <span class="cm-truncate">{{ infos.attaque.teamName }}</span>
        </span>
        <span class="lst__kpi-detail">
          <strong>{{ infos.attaque.goalsFor }} buts</strong><template v-if="infos.attaqueParMatch"> · {{ infos.attaqueParMatch }} par match</template>
        </span>
      </div>

      <div class="lst__kpi">
        <span class="lst__kpi-label"><AppIcon name="shield" :size="11" />Meilleure défense</span>
        <span class="lst__kpi-team">
          <TeamCrest :name="infos.defense.teamName" :league="league" :team-id="infos.defense.teamId ?? null" :size="20" />
          <span class="cm-truncate">{{ infos.defense.teamName }}</span>
        </span>
        <span class="lst__kpi-detail">
          <strong>{{ infos.defense.goalsAgainst }} encaissés</strong><template v-if="infos.defenseParMatch"> · {{ infos.defenseParMatch }} par match</template>
        </span>
      </div>

      <div v-if="infos.enForme" class="lst__kpi">
        <span class="lst__kpi-label"><AppIcon name="activity" :size="11" />En forme</span>
        <span class="lst__kpi-team">
          <TeamCrest :name="infos.enForme.row.teamName" :league="league" :team-id="infos.enForme.row.teamId ?? null" :size="20" />
          <span class="cm-truncate">{{ infos.enForme.row.teamName }}</span>
        </span>
        <span class="lst__kpi-detail">
          <strong>{{ infos.enForme.pts }} pts</strong> sur ses {{ infos.enForme.n }} derniers matchs
        </span>
      </div>

      <div v-if="infos.maintien" class="lst__kpi" :class="{ 'is-tight': infos.maintien.ecart <= 3 }">
        <span class="lst__kpi-label"><AppIcon name="alert" :size="11" />Maintien</span>
        <span class="lst__kpi-value">
          {{ infos.maintien.ecart }}<small> pt{{ infos.maintien.ecart > 1 ? 's' : '' }} d'écart</small>
        </span>
        <span class="lst__kpi-detail">
          entre {{ infos.maintien.sauf.teamName }} ({{ infos.maintien.sauf.rank }}e) et {{ infos.maintien.menace.teamName }} ({{ infos.maintien.menace.rank }}e)
        </span>
      </div>
    </div>

    <StandingsTable
      :loading="etat.loading"
      :error="etat.error"
      :rows="rows"
      :official="etat.data?.official ?? false"
      :league="league"
      :fetched-at="etat.data?.fetchedAt ?? null"
      :season-label="etat.data?.seasonLabel ?? null"
      :postponed="etat.data?.postponed ?? []"
      :form-of="formeDe"
    />
  </AppCard>
</template>

<style scoped>
.lst__note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0 0 12px;
  font-size: 12.5px;
  color: var(--cm-text-secondary);
}

.lst__table-select {
  min-width: 160px;
}

/* ------------------------------------------------- les informations clés */
.lst__kpis {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 14px;
}

.lst__kpi {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
  padding: 11px 12px;
  border-radius: var(--cm-radius);
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
}

/* Le leader : sur toute la largeur, teinté de la couleur de section. */
.lst__kpi.is-lead {
  grid-column: 1 / -1;
  border-color: rgba(var(--cm-section-rgb) / 0.3);
  background: linear-gradient(135deg, rgba(var(--cm-section-rgb) / 0.12), transparent 70%), var(--cm-surface-alt);
}

/* Une tuile seule sur sa ligne (nombre impair) : toute la largeur. */
.lst__kpi:last-child:nth-child(even) {
  grid-column: 1 / -1;
}

/* Un maintien serré (3 points ou moins) : en ambre. */
.lst__kpi.is-tight {
  border-color: rgba(var(--cm-warning-rgb) / 0.35);
}

.lst__kpi.is-tight .lst__kpi-value {
  color: var(--cm-warning);
}

.lst__kpi-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

.lst__kpi.is-lead .lst__kpi-label {
  color: var(--cm-section);
}

.lst__kpi-team {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 13.5px;
  font-weight: 700;
  color: var(--cm-text-primary);
}

.lst__kpi.is-lead .lst__kpi-team {
  font-size: 15px;
  font-weight: 800;
}

.lst__kpi-value {
  font-size: 20px;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  color: var(--cm-text-primary);
}

.lst__kpi-value small {
  margin-left: 2px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0;
  color: var(--cm-text-secondary);
}

.lst__kpi-detail {
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--cm-text-secondary);
}

.lst__kpi-detail strong {
  font-weight: 700;
  color: var(--cm-text-primary);
}

.lst__bar {
  height: 5px;
}
</style>
