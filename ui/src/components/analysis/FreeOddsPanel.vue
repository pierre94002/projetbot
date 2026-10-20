<script setup>
import { computed, ref, watch } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import AppButton from '@/components/common/AppButton.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import { oddsApi } from '@/services/oddsApi.js';
import { formatOdds } from '@/utils/format.js';

/**
 * Les cotes d'un match, relevées GRATUITEMENT par l'appli (04/10/2026,
 * Pierre : « récupère-les gratuitement, de la même façon que les données de
 * match ») : ESPN (DraftKings, ESPN BET, Bet 365…), football-data.co.uk
 * (moyenne et maximum du marché, bourse Betfair, Pinnacle, Bet365),
 * 365Scores (Bet365), Kalshi et Smarkets (marchés d'échange : probabilité et
 * argent échangé).
 *
 * En tête, la probabilité que ces cotes donnent, marge retirée (méthode
 * puissance, la même que le moteur) ; puis, marché par marché, chaque
 * bookmaker : son ouverture, sa dernière cote d'avant-match (la clôture une
 * fois le match commencé), le mouvement entre les deux, et le direct s'il y
 * en a. Chaque ligne dit d'où elle vient ; rien ici n'est un pari possible :
 * ces bookmakers ne sont pas jouables depuis la France.
 *
 * Sous la probabilité, « Ce qui a bougé depuis l'ouverture » (04/10/2026) :
 * les cotes justes qui ont bougé de plus de 3 %, et combien de bookmakers
 * vont dans le même sens.
 */
const props = defineProps({
  // { matchId, home, away, league, commenceTime }
  match: { type: Object, required: true },
  // Heure exacte du coup d'envoi quand la page FotMob la donne.
  kickoff: { type: String, default: null }
});

const etat = ref({ loading: false, error: null, data: null });
const releve = ref(false);

async function charger() {
  const m = props.match;
  if (!m?.home || !m?.away) return;
  etat.value = { ...etat.value, loading: true, error: null };
  try {
    const data = await oddsApi.fixture({ home: m.home, away: m.away, league: m.league, commenceTime: props.kickoff ?? m.commenceTime });
    etat.value = { loading: false, error: null, data };
  } catch (error) {
    etat.value = { loading: false, error: error.message, data: null };
  }
}

async function releverMaintenant() {
  releve.value = true;
  try {
    await oddsApi.refresh();
    await charger();
  } catch (error) {
    etat.value = { ...etat.value, error: error.message };
  } finally {
    releve.value = false;
  }
}

watch(() => [props.match?.matchId, props.kickoff], charger, { immediate: true });

// ------------------------------------------------------------ lecture
const MARCHES = { '1x2': 'Résultat 1 / N / 2', ou: 'Plus / moins de buts', ah: 'Handicap asiatique', btts: 'Les deux équipes marquent', dc: 'Double chance', dnb: 'Remboursé si nul' };
const SELECTIONS = { home: '1', draw: 'N', away: '2', over: 'Plus', under: 'Moins', yes: 'Oui', no: 'Non' };
const ORDRE_SELECTIONS = ['home', 'draw', 'away', 'over', 'under', 'yes', 'no'];

const sources = computed(() => etat.value.data?.sources ?? []);
const proba = computed(() => etat.value.data?.probabilities ?? null);
const pct = (p) => (p === null || p === undefined ? '—' : `${Math.round(p * 1000) / 10} %`.replace('.', ','));
const nombre = (n) => (n === null || n === undefined ? '—' : Math.round(n).toLocaleString('fr-FR'));

/** Dernière valeur d'avant-match (jamais un point du direct). */
const avantMatch = (sel) => sel.close ?? sel.snapshots?.at(-1) ?? sel.preclose ?? sel.open ?? null;

/**
 * Les marchés, toutes sources confondues : une ligne par (source,
 * bookmaker, ligne du marché), chaque sélection avec ouverture, dernière
 * cote d'avant-match, mouvement et direct.
 */
const marches = computed(() => {
  const parMarche = new Map();
  for (const s of sources.value) {
    for (const b of s.bookmakers) {
      for (const m of b.markets) {
        const cle = m.market;
        const bloc = parMarche.get(cle) ?? { market: cle, label: MARCHES[cle] ?? cle, lignes: [], selections: new Set() };
        const selections = {};
        for (const sel of m.selections) {
          bloc.selections.add(sel.selection);
          const fin = avantMatch(sel);
          const ouverture = sel.open ?? sel.preclose ?? null;
          const direct = sel.live?.at(-1) ?? null;
          const mouvement = ouverture?.price && fin?.price && ouverture !== fin ? fin.price / ouverture.price - 1 : null;
          selections[sel.selection] = { ouverture, fin, direct, mouvement, type: sel.close ? 'clôture' : sel.snapshots?.length ? 'dernier relevé' : sel.preclose ? 'pré-clôture' : 'ouverture' };
        }
        bloc.lignes.push({
          cle: `${s.source}|${b.bookmaker}|${m.line}`,
          source: s.name,
          echange: s.exchange,
          bookmaker: b.bookmaker,
          line: m.line,
          provenance: b.provenance,
          selections
        });
        parMarche.set(cle, bloc);
      }
    }
  }
  const ordre = Object.keys(MARCHES);
  return [...parMarche.values()]
    .map((b) => ({ ...b, selections: ORDRE_SELECTIONS.filter((s) => b.selections.has(s)).concat([...b.selections].filter((s) => !ORDRE_SELECTIONS.includes(s))) }))
    .sort((a, b) => (ordre.indexOf(a.market) + 1 || 99) - (ordre.indexOf(b.market) + 1 || 99));
});

// Smarkets compte en livres échangées, Kalshi en contrats d'un dollar.
const UNITES = { Smarkets: '£', Kalshi: '$' };
const volumeAvecUnite = (ligne) => {
  const v = Object.values(ligne.selections)[0]?.fin?.volume;
  return v === null || v === undefined ? '—' : `${nombre(v)} ${UNITES[ligne.source] ?? ''}`.trim();
};
const avecDirect = (bloc) => bloc.lignes.some((l) => Object.values(l.selections).some((s) => s.direct));
const avecVolume = (bloc) => bloc.lignes.some((l) => l.echange);
const sens = (m) => (m === null || Math.abs(m) < 0.005 ? null : m > 0 ? 'up' : 'down');
const titreValeur = (v, type) => (v ? `${type} · relevé le ${new Date(v.releveAt).toLocaleString('fr-FR')}${v.volume ? ` · ${nombre(v.volume)} échangés` : ''}` : '');
const ligneLabel = (l) => (l.line ? `${l.bookmaker} (${l.line > 0 && l.line % 1 !== 0 && false ? '+' : ''}${String(l.line).replace('.', ',')})` : l.bookmaker);

// ------------------------------------------------------- ce qui manque
// 04/10/2026, Pierre : « pour toutes les données que tu n'as pas sur les
// cotes, il faut que tu le notifies, que je le voie dans CôteMaster ». Le
// serveur dit chaque absence et sa raison ; les cotes françaises ne manquent
// pas quand le relevé The Odds API cote ce match.
const CLES_FRANCAISES = /_fr$/;
const CATEGORIES = [
  { cle: 'source', titre: 'Sources' },
  { cle: 'francais', titre: 'Bookmakers français' },
  { cle: 'marche', titre: 'Marchés' },
  { cle: 'volumes', titre: 'Argent misé' },
  { cle: 'direct', titre: 'Direct' },
  { cle: 'historique', titre: 'Historique' }
];
const avecCotesFrancaises = computed(() => (props.match?.marketOdds?.byBookmaker ?? []).some((b) => CLES_FRANCAISES.test(b.key ?? '')));
/** Les cotes 1 / N / 2 du relevé The Odds API (manuel), quand il couvre ce match. */
const livresOddsApi = computed(() => (props.match?.marketOdds?.source === 'gratuit' ? [] : (props.match?.marketOdds?.byBookmaker ?? []).filter((b) => b.odds1 > 1)));
// Les bookmakers français et les deux références (Pinnacle, bourse Betfair) d'abord ; les autres sur demande.
const CLES_EN_TETE = /(_fr$|^pinnacle$|^betfair_ex)/;
const tousLesLivres = ref(false);
const livresAffiches = computed(() => {
  const tete = livresOddsApi.value.filter((b) => CLES_EN_TETE.test(b.key ?? ''));
  return tousLesLivres.value || !tete.length ? livresOddsApi.value : tete;
});
const manques = computed(() =>
  (etat.value.data?.missing ?? []).filter((g) => {
    if (g.category === 'francais') return !avecCotesFrancaises.value;
    // Le 1 / N / 2 ne manque pas quand le relevé The Odds API le donne.
    if (g.category === 'marche' && g.label.startsWith('Résultat') && livresOddsApi.value.length) return false;
    return true;
  })
);
const manquesParCategorie = computed(() =>
  CATEGORIES.map((c) => ({ ...c, lignes: manques.value.filter((g) => g.category === c.cle) })).filter((c) => c.lignes.length)
);
const manquesOuverts = ref(true);

const quand = (iso) => (iso ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '—');
const provenances = computed(() =>
  sources.value.map((s) => ({
    nom: s.name,
    dernier: s.lastReleveAt,
    rencontres: s.events,
    liens: [...new Set(s.bookmakers.map((b) => b.provenance).filter(Boolean))].slice(0, 3),
    bookmakers: s.bookmakers.map((b) => b.bookmaker)
  }))
);

// ------------------------------------------- ce qui a bougé depuis l'ouverture
// 04/10/2026 : le serveur mesure, bookmaker par bookmaker, de combien la cote
// JUSTE (marge retirée) a bougé entre l'ouverture et le dernier relevé, puis
// fait la moyenne (server/src/data/marketMovement.js#mouvements) : comparer
// le panier d'ouverture à celui de la fin ferait passer un changement de
// bookmakers pour un mouvement. En dessous de 3 %, c'est le bruit d'un relevé
// à l'autre : on ne montre que ce qui dépasse.
const SEUIL_MOUVEMENT = 3;
// `undefined` (et non une liste vide) : un serveur d'avant les mouvements.
const mouvementsRecus = computed(() => etat.value.data?.movement);
const mouvementsParSens = computed(() => {
  const liste = mouvementsRecus.value ?? [];
  // dropPct positif = la cote a BAISSÉ = l'issue est davantage jouée.
  const baisses = liste.filter((m) => m.dropPct > SEUIL_MOUVEMENT).sort((a, b) => b.dropPct - a.dropPct);
  const hausses = liste.filter((m) => m.dropPct < -SEUIL_MOUVEMENT).sort((a, b) => a.dropPct - b.dropPct);
  return [
    { cle: 'baisse', sens: 'down', titre: "En baisse : l'issue est davantage jouée", lignes: baisses },
    { cle: 'hausse', sens: 'up', titre: "En hausse : l'issue est moins jouée", lignes: hausses }
  ].filter((g) => g.lignes.length);
});
/** Le plus grand mouvement mesuré : quand aucun ne passe le seuil, on dit lequel s'en approche. */
const plusGrandMouvement = computed(() =>
  (mouvementsRecus.value ?? []).reduce((max, m) => (!max || Math.abs(m.dropPct) > Math.abs(max.dropPct) ? m : max), null)
);

const cleMouvement = (m) => `${m.market}|${m.line}|${m.issue}`;
const nomSource = (cle) => sources.value.find((s) => s.source === cle)?.name ?? cle;
// Une probabilité nulle n'a pas de cote juste : on le dit plutôt qu'un tiret.
const coteJuste = (p) => (p > 0 ? formatOdds(1 / p) : 'probabilité nulle');
const unDecimal = (n) => n.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** La variation de la cote juste : « −16,1 % » quand elle a baissé de 16,1 %. */
function variation(m) {
  const v = Math.round(-m.dropPct * 10) / 10;
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${unDecimal(Math.abs(v))} %`;
}

function titreProba(m) {
  const d = Math.round(m.deltaPoints * 10) / 10;
  const ecart = `${d > 0 ? '+' : d < 0 ? '−' : ''}${unDecimal(Math.abs(d))} point${Math.abs(d) >= 2 ? 's' : ''}`;
  return `Cote juste = 1 ÷ probabilité, marge retirée. Probabilité : ${pct(m.fromProb)} à l'ouverture, ${pct(m.toProb)} au dernier relevé (${ecart})`;
}

/** « 2 bookmakers sur 3 vont dans ce sens » ; des bourses quand seules elles cotent ce marché. */
function accord(m) {
  const nom = m.exchangeOnly ? 'bourse' : 'bookmaker';
  const n = m.agreeing ?? 0;
  return `${n} ${nom}${n > 1 ? 's' : ''} sur ${m.bookmakersCount} ${n > 1 ? 'vont' : 'va'} dans ce sens`;
}

// L'heure de Paris, quelle que soit l'horloge de la machine : les relevés sont
// datés en UTC (« …Z ») et Pierre lit l'heure française.
const PARIS = { timeZone: 'Europe/Paris' };
const JOUR_HEURE = new Intl.DateTimeFormat('fr-FR', { ...PARIS, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const JOUR = new Intl.DateTimeFormat('fr-FR', { ...PARIS, day: '2-digit', month: '2-digit' });
const HEURE = new Intl.DateTimeFormat('fr-FR', { ...PARIS, hour: '2-digit', minute: '2-digit' });

/**
 * La période d'un mouvement. ESPN et 365Scores donnent l'ouverture ET la
 * cote du moment dans la même réponse : les deux portent alors l'heure du
 * relevé, et l'heure d'ouverture du bookmaker n'est pas publiée.
 */
function periode(debut, fin) {
  if (!debut || !fin) return null;
  const a = new Date(debut);
  const b = new Date(fin);
  if (JOUR_HEURE.format(a) === JOUR_HEURE.format(b)) return `de l'ouverture au relevé du ${JOUR.format(b)} à ${HEURE.format(b)}`;
  if (JOUR.format(a) === JOUR.format(b)) return `le ${JOUR.format(a)}, de ${HEURE.format(a)} à ${HEURE.format(b)}`;
  return `du ${JOUR_HEURE.format(a)} au ${JOUR_HEURE.format(b)}`;
}

/** La même, en court, pour une ligne du détail. */
function periodeCourte(debut, fin) {
  if (!debut || !fin) return 'heure du relevé inconnue';
  const a = JOUR_HEURE.format(new Date(debut));
  const b = JOUR_HEURE.format(new Date(fin));
  return a === b ? `relevé du ${b}` : `${a} → ${b}`;
}

/** Le sens d'un bookmaker, sur sa cote juste (celui que compte « N sur M »). */
const sensLivre = (b) => (b.fromProb > 0 && b.toProb > 0 ? sens(b.fromProb / b.toProb - 1) : null);
/** L'argent échangé d'une bourse, dans son unité (cf. UNITES). */
const volumeLivre = (b) => `${nombre(b.volume)} ${UNITES[nomSource(b.source)] ?? ''}`.trim();

const PRIX_EN_PROBA = "Marché d'échange : son prix est une probabilité, lue dans la colonne « Proba juste »";
const BOURSE_HORS_COMPTE = "Bourse d'échange : montrée pour comparaison, elle n'entre pas dans le compte des bookmakers";

// Le détail par bookmaker, replié par défaut : un mouvement se lit d'abord en une ligne.
const detailsOuverts = ref({});
const basculerDetail = (m) => {
  const cle = cleMouvement(m);
  detailsOuverts.value = { ...detailsOuverts.value, [cle]: !detailsOuverts.value[cle] };
};
</script>

<template>
  <div class="fodds">
    <LoadingSpinner v-if="etat.loading && !etat.data" label="Lecture des cotes relevées…" />
    <EmptyState v-else-if="etat.error" icon="alert" title="Cotes indisponibles" :description="etat.error" />

    <template v-else-if="etat.data">
      <!-- Aucune cote encore : on peut relever tout de suite, c'est gratuit. -->
      <div v-if="!etat.data.count" class="fodds__empty">
        <EmptyState
          icon="percent"
          title="Aucune cote relevée pour ce match pour l'instant"
          description="Les cotes gratuites se relèvent toutes les trois heures, puis toutes les cinq minutes dans les deux heures qui précèdent le coup d'envoi. Les petits championnats ne sont souvent cotés que la veille ou le jour du match."
        />
        <AppButton variant="secondary" size="sm" :loading="releve" @click="releverMaintenant">
          <template #icon><AppIcon name="refresh" :size="14" /></template>
          Relever maintenant
        </AppButton>
      </div>

      <template v-else>
        <!-- La probabilité que donnent ces cotes, marge retirée. -->
        <section v-if="proba?.bookmakers || proba?.exchanges" class="fodds__proba">
          <div v-if="proba.bookmakers" class="fodds__proba-row">
            <span class="fodds__proba-label">
              <AppIcon name="percent" :size="13" />Bookmakers, marge retirée
              <small>{{ proba.bookmakers.count }} cote{{ proba.bookmakers.count > 1 ? 's' : '' }}</small>
            </span>
            <div class="cm-kpis fodds__kpis">
              <div class="cm-kpi is-section"><span class="cm-kpi__label">1 · {{ match.home }}</span><span class="cm-kpi__value">{{ pct(proba.bookmakers.home) }}</span></div>
              <div class="cm-kpi"><span class="cm-kpi__label">N · nul</span><span class="cm-kpi__value">{{ pct(proba.bookmakers.draw) }}</span></div>
              <div class="cm-kpi"><span class="cm-kpi__label">2 · {{ match.away }}</span><span class="cm-kpi__value">{{ pct(proba.bookmakers.away) }}</span></div>
              <div v-if="proba.over25" class="cm-kpi"><span class="cm-kpi__label">Plus de 2,5 buts</span><span class="cm-kpi__value">{{ pct(proba.over25.over) }}</span></div>
            </div>
          </div>
          <div v-if="proba.exchanges" class="fodds__proba-row">
            <span class="fodds__proba-label">
              <AppIcon name="activity" :size="13" />Marchés d'échange, pondérés par l'argent échangé
              <small>{{ proba.exchanges.books.join(', ') }}</small>
            </span>
            <div class="cm-kpis fodds__kpis">
              <div class="cm-kpi"><span class="cm-kpi__label">1</span><span class="cm-kpi__value">{{ pct(proba.exchanges.home) }}</span></div>
              <div class="cm-kpi"><span class="cm-kpi__label">N</span><span class="cm-kpi__value">{{ pct(proba.exchanges.draw) }}</span></div>
              <div class="cm-kpi"><span class="cm-kpi__label">2</span><span class="cm-kpi__value">{{ pct(proba.exchanges.away) }}</span></div>
            </div>
          </div>
        </section>

        <!-- Ce qui a bougé depuis l'ouverture : la cote juste (marge retirée),
             bookmaker par bookmaker ; les baisses d'abord, puis les hausses. -->
        <section class="fodds__mvt">
          <h4 class="cm-group-title">Ce qui a bougé depuis l'ouverture</h4>

          <!-- Un serveur d'avant les mouvements : la donnée n'arrive pas, on dit pourquoi. -->
          <p v-if="mouvementsRecus === undefined" class="cm-note is-warning fodds__mvt-empty">
            <AppIcon name="alert" :size="14" />
            <span>Le serveur ne mesure pas encore les mouvements de cotes : relancez demarrer-cotemaster.bat pour activer cette fonction.</span>
          </p>
          <p v-else-if="!mouvementsRecus.length" class="cm-note fodds__mvt-empty">
            <AppIcon name="clock" :size="14" />
            <span>Un seul relevé pour l'instant : un mouvement se mesure entre deux relevés.</span>
          </p>
          <p v-else-if="!mouvementsParSens.length" class="cm-note fodds__mvt-empty">
            <AppIcon name="check" :size="14" />
            <span>
              Aucune cote juste (marge retirée) n'a bougé de plus de {{ SEUIL_MOUVEMENT }} % depuis l'ouverture.
              <template v-if="plusGrandMouvement">Le plus grand mouvement : {{ plusGrandMouvement.label }} ({{ plusGrandMouvement.marketLabel }}), {{ variation(plusGrandMouvement) }}.</template>
            </span>
          </p>

          <template v-else>
            <p class="fodds__mvt-lead">La cote juste (marge retirée), de l'ouverture au dernier relevé : seuls les mouvements de plus de {{ SEUIL_MOUVEMENT }} %.</p>
            <div v-for="g in mouvementsParSens" :key="g.cle" class="fodds__mvt-group">
              <span class="fodds__mvt-title" :class="`is-${g.sens}`">
                <AppIcon :name="g.sens === 'down' ? 'trendDown' : 'trendUp'" :size="12" />{{ g.titre }}
                <span class="cm-pill fodds__mvt-count">{{ g.lignes.length }}</span>
              </span>
              <ul class="fodds__mvt-list">
                <li v-for="m in g.lignes" :key="cleMouvement(m)" class="fodds__mvt-item">
                  <div class="fodds__mvt-head">
                    <span class="cm-icon-box is-sm" :class="g.sens === 'down' ? 'is-accent' : 'is-danger'">
                      <AppIcon :name="g.sens === 'down' ? 'trendDown' : 'trendUp'" :size="14" />
                    </span>
                    <span class="fodds__mvt-what">
                      <span class="fodds__mvt-label">{{ m.label }}</span>
                      <span class="fodds__mvt-market">{{ m.marketLabel }}</span>
                    </span>
                    <span class="fodds__mvt-figures">
                      <span class="cm-numeric fodds__mvt-odds" :title="titreProba(m)">
                        {{ coteJuste(m.fromProb) }}<AppIcon name="arrowRight" :size="11" class="fodds__mvt-arrow" /><strong>{{ coteJuste(m.toProb) }}</strong>
                      </span>
                      <span class="cm-numeric fodds__mvt-pct" :class="`is-${g.sens}`">{{ variation(m) }}</span>
                    </span>
                  </div>
                  <p class="fodds__mvt-meta">
                    <span class="fodds__mvt-fact">{{ accord(m) }}</span>
                    <span v-if="periode(m.fromAt, m.toAt)" class="fodds__mvt-fact">{{ periode(m.fromAt, m.toAt) }}</span>
                    <span v-if="m.exchangeOnly" class="fodds__mvt-fact fodds__mvt-exchange">bourses d'échange seulement</span>
                  </p>
                  <button type="button" class="cm-link fodds__mvt-toggle" :aria-expanded="Boolean(detailsOuverts[cleMouvement(m)])" @click="basculerDetail(m)">
                    Détail par bookmaker ({{ m.bookmakers.length }})
                    <AppIcon name="chevronDown" :size="12" class="fodds__mvt-caret" :class="{ 'is-open': detailsOuverts[cleMouvement(m)] }" />
                  </button>
                  <div v-if="detailsOuverts[cleMouvement(m)]" class="cm-table-wrap fodds__mvt-detail">
                    <table class="cm-table fodds__table">
                      <thead>
                        <tr>
                          <th class="is-left">Bookmaker</th>
                          <th class="is-center" title="Cote du bookmaker à l'ouverture, marge comprise">Ouverture</th>
                          <th class="is-center" title="Dernière cote d'avant-match du bookmaker (la clôture une fois le match commencé), marge comprise">Dernière</th>
                          <th class="is-center" title="Probabilité de l'issue, marge retirée : à l'ouverture → au dernier relevé">Proba juste</th>
                          <th class="is-left">Relevé</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="b in m.bookmakers" :key="`${b.source}|${b.bookmaker}`" :title="b.exchange && !m.exchangeOnly ? BOURSE_HORS_COMPTE : ''">
                          <td class="is-left fodds__book">
                            <span class="fodds__book-name">{{ b.bookmaker }}</span>
                            <span class="fodds__book-source" :class="{ 'is-exchange': b.exchange }">{{ nomSource(b.source) }}</span>
                          </td>
                          <td class="cm-numeric is-center fodds__open">
                            <template v-if="b.fromOdds">{{ formatOdds(b.fromOdds) }}</template>
                            <span v-else :title="PRIX_EN_PROBA">prix en %</span>
                          </td>
                          <td class="cm-numeric is-center fodds__close">
                            <template v-if="b.toOdds">{{ formatOdds(b.toOdds) }}</template>
                            <span v-else class="cm-text-muted" :title="PRIX_EN_PROBA">prix en %</span>
                            <AppIcon v-if="sensLivre(b)" :name="sensLivre(b) === 'up' ? 'trendUp' : 'trendDown'" :size="11" class="fodds__move" :class="`is-${sensLivre(b)}`" />
                          </td>
                          <td class="cm-numeric is-center">{{ pct(b.fromProb) }} → {{ pct(b.toProb) }}</td>
                          <td class="is-left fodds__mvt-when">
                            {{ periodeCourte(b.fromAt, b.toAt) }}
                            <small v-if="b.exchange && b.volume" class="fodds__mvt-volume">{{ volumeLivre(b) }} échangés</small>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </li>
              </ul>
            </div>
          </template>
        </section>
      </template>

      <!-- Le relevé The Odds API (fait à la main), quand il couvre ce match : les seules cotes françaises. -->
      <section v-if="livresOddsApi.length" class="fodds__market">
        <h4 class="cm-group-title">Résultat 1 / N / 2 — relevé The Odds API (manuel)</h4>
        <div class="cm-table-wrap">
          <table class="cm-table fodds__table">
            <thead>
              <tr>
                <th class="is-left">Bookmaker</th>
                <th class="is-center">1</th>
                <th class="is-center">N</th>
                <th class="is-center">2</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="b in livresAffiches" :key="b.key">
                <td class="is-left fodds__book">
                  <span class="fodds__book-name">{{ b.title ?? b.key }}</span>
                  <span class="fodds__book-source">The Odds API</span>
                </td>
                <td class="cm-numeric is-center fodds__close">{{ formatOdds(b.odds1) }}</td>
                <td class="cm-numeric is-center fodds__close">{{ formatOdds(b.oddsDraw) }}</td>
                <td class="cm-numeric is-center fodds__close">{{ formatOdds(b.odds2) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <button v-if="livresAffiches.length < livresOddsApi.length || tousLesLivres" type="button" class="fodds__more" @click="tousLesLivres = !tousLesLivres">
          {{ tousLesLivres ? 'Seulement les bookmakers français et les références' : `Voir les ${livresOddsApi.length - livresAffiches.length} autres bookmakers` }}
        </button>
      </section>

      <!-- Ce qui manque, et pourquoi : chaque absence est dite, jamais tue. -->
      <section v-if="manques.length" class="fodds__gaps">
        <button type="button" class="fodds__gaps-head" :aria-expanded="manquesOuverts" @click="manquesOuverts = !manquesOuverts">
          <AppIcon name="alert" :size="14" />
          <span class="fodds__gaps-label">Ce qui manque pour ce match</span>
          <span class="cm-pill">{{ manques.length }}</span>
          <AppIcon name="chevronDown" :size="13" class="fodds__gaps-caret" :class="{ 'is-open': manquesOuverts }" />
        </button>
        <div v-if="manquesOuverts" class="fodds__gaps-body">
          <div v-for="c in manquesParCategorie" :key="c.cle" class="fodds__gaps-group">
            <span class="fodds__gaps-title">{{ c.titre }}</span>
            <ul class="fodds__gaps-list">
              <li v-for="(g, i) in c.lignes" :key="`${c.cle}-${i}`">
                <strong>{{ g.label }}</strong> — {{ g.reason }}<template v-if="g.checkedAt">{{ ' ' }}<span class="cm-text-muted">(vérifié le {{ quand(g.checkedAt) }})</span></template>
                <span v-if="g.note" class="fodds__gaps-note">{{ g.note }}</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <template v-if="etat.data.count">
        <!-- Marché par marché, bookmaker par bookmaker. -->
        <section v-for="bloc in marches" :key="bloc.market" class="fodds__market">
          <h4 class="cm-group-title">{{ bloc.label }}</h4>
          <div class="cm-table-wrap">
            <table class="cm-table fodds__table">
              <thead>
                <tr>
                  <th class="is-left">Bookmaker</th>
                  <th v-for="sel in bloc.selections" :key="sel" class="is-center" colspan="2">{{ SELECTIONS[sel] ?? sel }}</th>
                  <th v-if="avecDirect(bloc)" class="is-center">Direct</th>
                  <th v-if="avecVolume(bloc)" class="is-right">Échangé</th>
                </tr>
                <tr class="fodds__subhead">
                  <th class="is-left"></th>
                  <template v-for="sel in bloc.selections" :key="sel">
                    <th class="is-center">ouv.</th>
                    <th class="is-center">fin</th>
                  </template>
                  <th v-if="avecDirect(bloc)"></th>
                  <th v-if="avecVolume(bloc)"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="ligne in bloc.lignes" :key="ligne.cle">
                  <td class="is-left fodds__book">
                    <span class="fodds__book-name">{{ ligneLabel(ligne) }}</span>
                    <span class="fodds__book-source" :class="{ 'is-exchange': ligne.echange }">{{ ligne.source }}</span>
                  </td>
                  <template v-for="sel in bloc.selections" :key="sel">
                    <td class="cm-numeric is-center fodds__open" :title="titreValeur(ligne.selections[sel]?.ouverture, 'ouverture')">
                      {{ ligne.selections[sel]?.ouverture ? formatOdds(ligne.selections[sel].ouverture.price) : '—' }}
                    </td>
                    <td class="cm-numeric is-center fodds__close" :title="titreValeur(ligne.selections[sel]?.fin, ligne.selections[sel]?.type)">
                      <span v-if="ligne.selections[sel]?.fin">
                        {{ formatOdds(ligne.selections[sel].fin.price) }}
                        <AppIcon
                          v-if="sens(ligne.selections[sel].mouvement)"
                          :name="sens(ligne.selections[sel].mouvement) === 'up' ? 'trendUp' : 'trendDown'"
                          :size="11"
                          class="fodds__move"
                          :class="`is-${sens(ligne.selections[sel].mouvement)}`"
                        />
                      </span>
                      <span v-else>—</span>
                      <small v-if="ligne.echange && ligne.selections[sel]?.fin?.prob" class="fodds__prob">{{ pct(ligne.selections[sel].fin.prob) }}</small>
                    </td>
                  </template>
                  <td v-if="avecDirect(bloc)" class="cm-numeric is-center fodds__live">
                    <template v-for="sel in bloc.selections" :key="sel">
                      <span v-if="ligne.selections[sel]?.direct" :title="titreValeur(ligne.selections[sel].direct, 'direct')">{{ formatOdds(ligne.selections[sel].direct.price) }}</span>
                    </template>
                  </td>
                  <td v-if="avecVolume(bloc)" class="cm-numeric fodds__volume">
                    {{ ligne.echange ? volumeAvecUnite(ligne) : '' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- D'où vient chaque cote. -->
        <footer class="fodds__sources">
          <p class="fodds__sources-lead">
            <AppIcon name="database" :size="12" />
            Relevées gratuitement par l'appli, gardées dans la base locale. « fin » = la dernière cote avant le coup d'envoi (la clôture une fois le match commencé). Référence seulement : aucun de ces bookmakers n'est jouable depuis la France.
          </p>
          <ul class="fodds__sources-list">
            <li v-for="p in provenances" :key="p.nom">
              <strong>{{ p.nom }}</strong>
              <span class="cm-text-muted">· {{ p.bookmakers.join(', ') }} · dernier relevé {{ quand(p.dernier) }}</span>
              <a v-for="lien in p.liens" :key="lien" :href="lien" target="_blank" rel="noopener noreferrer" class="fodds__link" :title="lien">
                <AppIcon name="external" :size="11" />source
              </a>
            </li>
          </ul>
          <AppButton variant="ghost" size="sm" :loading="releve" @click="releverMaintenant">
            <template #icon><AppIcon name="refresh" :size="13" /></template>
            Relever maintenant
          </AppButton>
        </footer>
      </template>
    </template>
  </div>
</template>

<style scoped>
.fodds {
  display: flex;
  flex-direction: column;
  gap: 18px;
  container: fodds / inline-size;
}

.fodds__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

/* ------------------------------------------------------- probabilités */
.fodds__proba {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.fodds__proba-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fodds__proba-label {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--cm-text-secondary);
}

.fodds__proba-label small {
  font-weight: 500;
  color: var(--cm-text-muted);
}

.fodds__kpis {
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
}

/* ------------------------------------------------------------ tableaux */
.fodds__market {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fodds__table th,
.fodds__table td {
  white-space: nowrap;
}

.fodds__subhead th {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.4px;
  color: var(--cm-text-muted);
  padding-top: 0;
}

.fodds__book {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.fodds__book-name {
  font-weight: 600;
  color: var(--cm-text-primary);
}

.fodds__book-source {
  font-size: 11px;
  color: var(--cm-text-muted);
}

.fodds__book-source.is-exchange {
  color: var(--cm-info);
}

.fodds__open {
  color: var(--cm-text-muted);
}

.fodds__close {
  font-weight: 700;
}

.fodds__move {
  vertical-align: -1px;
  margin-left: 2px;
}

/* Une cote qui monte : l'issue est jugée moins probable qu'à l'ouverture. */
.fodds__move.is-up {
  color: var(--cm-danger);
}

.fodds__move.is-down {
  color: var(--cm-accent);
}

.fodds__prob {
  display: block;
  font-size: 10.5px;
  font-weight: 500;
  color: var(--cm-info);
}

.fodds__live {
  display: table-cell;
  color: var(--cm-warning);
}

.fodds__live span + span::before {
  content: ' · ';
  color: var(--cm-text-muted);
}

.fodds__volume {
  color: var(--cm-text-secondary);
}

.fodds__more {
  align-self: flex-start;
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: var(--cm-section);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.fodds__more:hover {
  text-decoration: underline;
}

/* ------------------------------------------------------ ce qui manque */
.fodds__gaps {
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(var(--cm-warning-rgb) / 0.35);
  border-radius: var(--cm-radius);
  background: var(--cm-warning-soft);
  overflow: hidden;
}

.fodds__gaps-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border: 0;
  background: transparent;
  color: var(--cm-warning);
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}

.fodds__gaps-label {
  flex: 1;
  color: var(--cm-text-primary);
}

.fodds__gaps-caret {
  color: var(--cm-text-muted);
  transition: transform var(--cm-transition);
}

.fodds__gaps-caret.is-open {
  transform: rotate(180deg);
}

.fodds__gaps-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0 14px 12px 36px;
}

.fodds__gaps-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.fodds__gaps-title {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

.fodds__gaps-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--cm-text-secondary);
}

.fodds__gaps-list strong {
  color: var(--cm-text-primary);
}

.fodds__gaps-note {
  display: block;
  font-size: 11.5px;
  color: var(--cm-text-muted);
}

/* ------------------------------------------------------------- sources */
.fodds__sources {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--cm-border-soft);
}

.fodds__sources-lead {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--cm-text-muted);
}

.fodds__sources-lead :deep(svg) {
  flex-shrink: 0;
  margin-top: 3px;
}

.fodds__sources-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 12px;
}

.fodds__link {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: 8px;
  color: var(--cm-section);
  text-decoration: none;
}

.fodds__link:hover {
  text-decoration: underline;
}

/* ------------------------------------------- ce qui a bougé (mouvements) */
.fodds__mvt {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.fodds__mvt-lead {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--cm-text-muted);
}

/* Un état sans mouvement : une note d'une ligne, icône à gauche. */
.fodds__mvt-empty {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  padding: 10px 14px;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
}

.fodds__mvt-empty :deep(svg) {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--cm-text-muted);
}

.fodds__mvt-empty.is-warning :deep(svg) {
  color: var(--cm-warning);
}

.fodds__mvt-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fodds__mvt-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.fodds__mvt-title.is-down {
  color: var(--cm-accent);
}

.fodds__mvt-title.is-up {
  color: var(--cm-danger);
}

.fodds__mvt-count {
  min-width: 0;
  padding: 1px 7px;
  font-size: 10.5px;
}

.fodds__mvt-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.fodds__mvt-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 11px 14px;
  border-radius: var(--cm-radius);
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
}

.fodds__mvt-head {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.fodds__mvt-what {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.fodds__mvt-label {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--cm-text-primary);
}

.fodds__mvt-market {
  font-size: 11px;
  color: var(--cm-text-muted);
}

.fodds__mvt-figures {
  display: flex;
  flex-shrink: 0;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.fodds__mvt-odds {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12.5px;
  color: var(--cm-text-secondary);
}

.fodds__mvt-odds strong {
  font-size: 15px;
  font-weight: 800;
  color: var(--cm-text-primary);
}

.fodds__mvt-arrow {
  color: var(--cm-text-muted);
}

.fodds__mvt-pct {
  font-size: 12px;
  font-weight: 800;
}

/* Les couleurs du tableau des marchés : une cote qui baisse en vert, une qui monte en rouge. */
.fodds__mvt-pct.is-down {
  color: var(--cm-accent);
}

.fodds__mvt-pct.is-up {
  color: var(--cm-danger);
}

/* Les précisions et le détail s'alignent sur le texte, après le carré d'icône (28 + 10 px). */
.fodds__mvt-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  margin: 0 0 0 38px;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
}

.fodds__mvt-fact + .fodds__mvt-fact::before {
  content: '·';
  margin: 0 6px;
  color: var(--cm-text-muted);
}

.fodds__mvt-exchange {
  color: var(--cm-info);
}

.fodds__mvt-toggle {
  align-self: flex-start;
  margin-left: 38px;
}

.fodds__mvt-caret {
  transition: transform var(--cm-transition);
}

.fodds__mvt-caret.is-open {
  transform: rotate(180deg);
}

.fodds__mvt-detail {
  margin-left: 38px;
}

.fodds__mvt-when {
  color: var(--cm-text-secondary);
}

/* L'argent échangé d'une bourse, sous la période : la colonne reste étroite. */
.fodds__mvt-volume {
  display: block;
  font-size: 11px;
  color: var(--cm-text-muted);
}

/* Étroit : les précisions et le détail reprennent toute la largeur, une
   précision par ligne (un « · » en tête de ligne ne se lit pas). */
@container fodds (max-width: 520px) {
  .fodds__mvt-meta,
  .fodds__mvt-toggle,
  .fodds__mvt-detail {
    margin-left: 0;
  }

  .fodds__mvt-meta {
    flex-direction: column;
    align-items: flex-start;
  }

  .fodds__mvt-fact + .fodds__mvt-fact::before {
    content: none;
  }
}
</style>
