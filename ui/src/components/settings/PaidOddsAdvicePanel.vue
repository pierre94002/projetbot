<script setup>
import { computed, onMounted, ref } from 'vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import AppSelect from '@/components/common/AppSelect.vue';
import AppToggle from '@/components/common/AppToggle.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import KickoffCountdown from '@/components/common/KickoffCountdown.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import LeagueBadge from '@/components/matches/LeagueBadge.vue';
import { oddsApi } from '@/services/oddsApi.js';
import { quandDit } from '@/utils/langageParis.js';
import { liveNow } from '@/utils/liveClock.js';

/**
 * Le CONSEIL DE RELEVÉ PAYANT (étape 7 du plan, 06/10/2026) : quand un relevé
 * The Odds API vaut le coup — quels championnats, combien de crédits, combien
 * il en reste (s'ils sont connus), et le bon moment (à l'annonce des
 * compositions des matchs proches). UN ENCART D'INFORMATION : il ne relève
 * rien. Le relevé reste le bouton « Actualiser » de la carte Données (Cotes
 * marché, The Odds API), que Pierre clique ; rien ne part tout seul.
 *
 * `variante="complete"` (Réglages) : le conseil, les matchs concernés, les
 * crédits en chiffres clés, et le réglage de fraîcheur (délai, règle des
 * compositions ; PUT /api/odds/fraicheur, idempotent). `variante="compacte"`
 * (page d'un match dont la value est à rafraîchir) : le conseil en une ligne et
 * où est le bouton. LIT /api/odds/conseil-releve (et /api/odds/fraicheur en
 * variante complète), sans rien lancer.
 */
const props = defineProps({
  variante: { type: String, default: 'complete' } // 'complete' | 'compacte'
});

const conseil = ref(null);
const chargement = ref(true);
const erreur = ref(null);
const reglage = ref(null);
const delai = ref(180);
const avantCompos = ref(true);
const enregistrement = ref({ enCours: false, message: null, erreur: null });

/** Les délais proposés (le serveur accepte de 15 min à 24 h). */
const OPTIONS_DELAI = [
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 heure' },
  { value: 120, label: '2 heures' },
  { value: 180, label: '3 heures (proposé)' },
  { value: 360, label: '6 heures' },
  { value: 720, label: '12 heures' },
  { value: 1440, label: '24 heures' }
];

async function charger() {
  chargement.value = true;
  erreur.value = null;
  try {
    const [c, r] = await Promise.all([oddsApi.conseilReleve(), props.variante === 'complete' ? oddsApi.fraicheur() : Promise.resolve(null)]);
    conseil.value = c;
    if (r) {
      reglage.value = r;
      delai.value = r.reglage?.maxAgeMinutes ?? 180;
      avantCompos.value = r.reglage?.avantCompos !== false;
    }
  } catch (error) {
    erreur.value = error.message;
  } finally {
    chargement.value = false;
  }
}

// Les promesses rendues ne servent qu'au rendu côté serveur des essais : en navigateur, elles sont ignorées.
onMounted(() => charger());

const credits = computed(() => conseil.value?.credits ?? null);
const ICONES = { maintenant: 'bolt', 'plus-tard': 'clock', inutile: 'check' };
const BOITES = { maintenant: 'is-warning', 'plus-tard': 'is-info', inutile: 'is-muted' };
const icone = computed(() => ICONES[conseil.value?.conseil] ?? 'info');
const boite = computed(() => BOITES[conseil.value?.conseil] ?? 'is-muted');

const heure = (iso) => new Intl.DateTimeFormat('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const quand = (iso) => quandDit(iso, liveNow.value);
const pluriel = (n, mot, motPluriel = `${mot}s`) => `${n} ${n > 1 ? motPluriel : mot}`;

/** L'état des cotes d'un match concerné, en clair. */
function cotesDe(m) {
  if (m.cotes === 'absentes') return 'pas encore de cote de vos bookmakers';
  if (m.cotes === 'avant-compos') return `vos cotes relevées ${quand(m.releveAt)}, avant l'annonce des compositions`;
  if (m.cotes === 'a-rafraichir') return m.releveAt ? `vos cotes relevées ${quand(m.releveAt)} : à rafraîchir` : 'heure de vos cotes inconnue : à rafraîchir';
  return `vos cotes relevées ${quand(m.releveAt)}`;
}
const composDe = (m) => (m.compos?.publiee ? `compositions publiées chez FotMob (lues ${quand(m.compos.lueA)})` : m.composAnnonceesA ? `compositions annoncées vers ${new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date(m.composAnnonceesA))}` : 'heure du coup d’envoi à confirmer');

const restantsDetail = computed(() => {
  const c = credits.value;
  if (!c) return '';
  if (c.source === 'illisible') return `bilan du dernier relevé illisible (${c.probleme ?? 'fichier abîmé'})`;
  if (c.restants === null) return 'inconnus : aucun relevé fait depuis la mise à jour (le prochain les donnera)';
  return `selon The Odds API, au relevé ${quand(c.connusLe)} (forfait de ${c.forfait} par mois)`;
});
const apresDetail = computed(() => {
  const c = credits.value;
  if (!c || c.restants === null) return 'inconnu tant que les crédits restants ne le sont pas';
  if (c.suffisants === false) return `pas assez pour un relevé complet (${c.parReleve} au plus)`;
  return `au pire, soit ${pluriel(c.relevesPossibles, 'relevé complet', 'relevés complets')} possibles`;
});
const dernierDetail = computed(() => {
  const c = credits.value;
  if (!c?.connusLe) return 'aucun relevé gardé';
  return c.dernierCout === null ? `coût non communiqué par The Odds API (relevé ${quand(c.connusLe)})` : `crédits décomptés au relevé ${quand(c.connusLe)}`;
});

const sourceReglage = computed(() => {
  const r = reglage.value;
  if (!r) return '';
  if (r.source === 'enregistre') return `Réglage enregistré ${r.enregistreLe ? quand(r.enregistreLe) : ''} dans ${r.fichier}.`;
  if (r.source === 'illisible') return `Le fichier ${r.fichier} est illisible (${r.probleme}) : la règle par défaut s'applique, il sera mis de côté au prochain enregistrement.`;
  return 'Réglage par défaut (3 heures, compositions comprises) : rien n’est encore enregistré.';
});
const reglageChange = computed(() => reglage.value && (delai.value !== reglage.value.reglage?.maxAgeMinutes || avantCompos.value !== (reglage.value.reglage?.avantCompos !== false) || reglage.value.source !== 'enregistre'));

async function enregistrer() {
  enregistrement.value = { enCours: true, message: null, erreur: null };
  try {
    const r = await oddsApi.enregistrerFraicheur({ maxAgeMinutes: Number(delai.value), avantCompos: Boolean(avantCompos.value) });
    reglage.value = r;
    enregistrement.value = { enCours: false, message: r.enregistrement?.change ? 'Réglage enregistré : les pages le prennent au prochain affichage.' : 'Déjà enregistré : rien de changé.', erreur: null };
    conseil.value = await oddsApi.conseilReleve();
  } catch (error) {
    enregistrement.value = { enCours: false, message: null, erreur: error.message };
  }
}
</script>

<template>
  <div class="advice" :class="`advice--${variante}`">
    <LoadingSpinner v-if="chargement && !conseil" label="Conseil de relevé…" />
    <div v-else-if="erreur && !conseil" class="cm-note is-danger">
      <span class="cm-icon-box is-danger is-sm"><AppIcon name="alert" :size="14" /></span>
      <div>
        <p class="cm-note__title">Conseil de relevé indisponible</p>
        <p class="cm-note__text">{{ erreur }}</p>
      </div>
    </div>

    <!-- La version courte : une ligne, et où est le bouton. -->
    <div v-else-if="conseil && variante === 'compacte'" class="advice__compact" :class="`is-${conseil.conseil}`">
      <span class="cm-icon-box is-sm" :class="boite"><AppIcon :name="icone" :size="14" /></span>
      <p class="advice__compact-text">
        <strong>{{ conseil.resume }}</strong>
        <span v-if="credits?.restants !== null && credits?.restants !== undefined"> {{ credits.restants }} crédits restants.</span>
        <span> Bouton : {{ conseil.bouton.ou }} — rien ne part tout seul.</span>
      </p>
      <RouterLink to="/reglages" class="cm-link advice__compact-link">Réglages</RouterLink>
    </div>

    <template v-else-if="conseil">
      <div class="advice__head" :class="`is-${conseil.conseil}`">
        <span class="cm-icon-box" :class="boite"><AppIcon :name="icone" :size="17" /></span>
        <div class="advice__head-text">
          <p class="advice__title">{{ conseil.titre }}</p>
          <p class="advice__reason">{{ conseil.raison }}</p>
        </div>
      </div>

      <ul v-if="conseil.championnats.length" class="advice__leagues">
        <li v-for="c in conseil.championnats" :key="c.cle" class="advice__league">
          <LeagueBadge :league="c.nom" />
          <span class="advice__league-meta">{{ pluriel(c.matchs, 'match') }} · premier coup d'envoi {{ heure(c.premierCoupDEnvoi) }}{{ c.composPubliees ? ` · compositions publiées pour ${c.composPubliees}` : '' }}</span>
        </li>
      </ul>
      <ul v-if="conseil.matchs.length" class="advice__matches">
        <li v-for="m in conseil.matchs" :key="m.matchId" class="advice__match">
          <span class="advice__match-name">{{ m.home }} – {{ m.away }}</span>
          <KickoffCountdown :coup-d-envoi="m.coupDEnvoi" :heure-sure="m.heureSure" variante="texte" />
          <span class="advice__match-meta">{{ composDe(m) }} · {{ cotesDe(m) }}</span>
        </li>
      </ul>

      <div v-if="credits" class="cm-kpis advice__kpis">
        <div class="cm-kpi is-section">
          <span class="cm-kpi__label">Coût d'un relevé</span>
          <span class="cm-kpi__value">{{ credits.parReleve }}</span>
          <span class="cm-kpi__detail">crédits au plus ({{ credits.competitions }} compétitions, une requête chacune)</span>
        </div>
        <div class="cm-kpi">
          <span class="cm-kpi__label">Crédits restants</span>
          <span class="cm-kpi__value">{{ credits.restants ?? 'inconnus' }}</span>
          <span class="cm-kpi__detail">{{ restantsDetail }}</span>
        </div>
        <div class="cm-kpi">
          <span class="cm-kpi__label">Après ce relevé</span>
          <span class="cm-kpi__value">{{ credits.apres ?? 'inconnu' }}</span>
          <span class="cm-kpi__detail">{{ apresDetail }}</span>
        </div>
        <div class="cm-kpi">
          <span class="cm-kpi__label">Dernier relevé</span>
          <span class="cm-kpi__value">{{ credits.dernierCout ?? (credits.connusLe ? 'coût inconnu' : 'aucun') }}</span>
          <span class="cm-kpi__detail">{{ dernierDetail }}</span>
        </div>
      </div>
      <p v-if="credits" class="advice__detail">{{ credits.detail }}</p>

      <div class="cm-note">
        <span class="cm-icon-box is-muted is-sm"><AppIcon name="lock" :size="14" /></span>
        <div>
          <p class="cm-note__title">C'est vous qui cliquez</p>
          <p class="cm-note__text">{{ conseil.bouton.texte }} Le bouton : {{ conseil.bouton.ou }}.</p>
        </div>
      </div>

      <ProvenanceChip
        source="Conseil calculé par CôteMaster"
        :releve-le="conseil.genereLe"
        action="calculé"
        :vieux-apres-heures="null"
        variante="ligne"
        :detail="`Matchs de la page Matchs, heure de vos cotes lue dans les archives (relevés The Odds API), compositions lues chez FotMob par la boucle des compositions, crédits du bilan ${credits?.fichier ?? 'du dernier relevé'}.`"
      />

      <section v-if="variante === 'complete'" class="advice__setting">
        <h4 class="cm-section-title advice__setting-title">
          Fraîcheur de vos cotes <HelpTip terme="a-rafraichir" />
          <span class="cm-section-title__hint">au-delà, une value n'est plus montrée comme value : « à rafraîchir »</span>
        </h4>
        <div class="advice__setting-fields">
          <AppSelect v-model="delai" label="Plus vieille que" :options="OPTIONS_DELAI" />
          <AppToggle v-model="avantCompos" label="Relevée avant l'annonce des compositions" description="Une heure avant le coup d'envoi, les cotes bougent : une cote relevée avant devient à rafraîchir." />
          <AppButton variant="section" size="sm" :loading="enregistrement.enCours" :disabled="!reglageChange" @click="enregistrer">
            <template #icon><AppIcon name="check" :size="14" /></template>
            Enregistrer
          </AppButton>
        </div>
        <p class="advice__hint">{{ sourceReglage }}</p>
        <p v-if="enregistrement.message" class="advice__hint" role="status">{{ enregistrement.message }}</p>
        <p v-if="enregistrement.erreur" class="advice__error" role="alert">Réglage non enregistré : {{ enregistrement.erreur }}</p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.advice {
  container: advice / inline-size;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.advice__head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px;
  align-items: start;
  padding: 12px 14px;
  border-radius: var(--cm-radius-md);
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
}

/* « Maintenant » : un bord ambre — une action à faire, jamais le vert d'une value. */
.advice__head.is-maintenant {
  border-color: rgba(var(--cm-warning-rgb) / 0.4);
}

.advice__head-text {
  min-width: 0;
}

.advice__title {
  margin: 0 0 3px;
  font-size: 14.5px;
  font-weight: 800;
  color: var(--cm-text-primary);
}

.advice__reason,
.advice__detail {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
}

.advice__leagues,
.advice__matches {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.advice__league,
.advice__match {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  font-size: 12.5px;
  color: var(--cm-text-secondary);
}

.advice__league-meta,
.advice__match-meta {
  color: var(--cm-text-muted);
}

.advice__match-name {
  font-weight: 700;
  color: var(--cm-text-primary);
}

.advice__setting {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 6px;
  border-top: 1px solid var(--cm-border-soft);
}

.advice__setting-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 4px 0 0;
}

.advice__setting-fields {
  display: grid;
  grid-template-columns: minmax(150px, 220px) minmax(0, 1fr) auto;
  align-items: end;
  gap: 12px 16px;
}

.advice__hint {
  margin: 0;
  font-size: 11.5px;
  color: var(--cm-text-muted);
  overflow-wrap: anywhere;
}

.advice__error {
  margin: 0;
  font-size: 12px;
  color: var(--cm-danger);
}

/* La version courte : une ligne posée sous la value à rafraîchir. */
.advice__compact {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: var(--cm-radius);
  border: 1px dashed var(--cm-border-strong);
  background: var(--cm-surface-alt);
}

.advice__compact-text {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--cm-text-secondary);
}

.advice__compact-text strong {
  color: var(--cm-text-primary);
}

.advice__compact-link {
  font-size: 12px;
  white-space: nowrap;
}

@container advice (max-width: 560px) {
  .advice__setting-fields {
    grid-template-columns: minmax(0, 1fr);
  }

  .advice__compact {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .advice__compact-link {
    grid-column: 2;
  }
}
</style>
