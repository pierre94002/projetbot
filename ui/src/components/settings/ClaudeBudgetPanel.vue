<script setup>
/**
 * Budget Claude (étape 4 du plan) — UN seul composant, repris tel quel par la
 * feuille de route (étape 5), la santé du moteur (24) et la page Bulletin (42).
 *
 *   variante="complete"  (Réglages) : le mode et pourquoi, les tokens du jour et
 *                        de la semaine face au budget, par type d'appel, le
 *                        plafond de 150 rappelé, l'accord compteur / journal,
 *                        les derniers appels, les règles du mode économe, la
 *                        fiche envoyée à l'IA et le coût moyen d'une analyse
 *                        par forme face à la référence du 04/10 (étape 41), la
 *                        provenance ; et le réglage du budget si `reglable`.
 *   variante="compacte"  (tête d'une autre page) : le mode, les deux jauges et
 *                        le plafond, sur une ligne.
 *
 * Tout est LU (GET /api/claude-budget, un état préparé par le serveur : le
 * journal de chaque appel) ; seule écriture : le réglage du budget
 * (PUT /api/claude-budget/reglage, idempotent), jamais server\.env.
 * Ce que l'appli voit : SES appels, jamais le pourcentage de l'abonnement Max.
 * Règles de dessin (ui/DESIGN.md) : tableaux complets même vides ou en erreur
 * (la raison est dite), Σ total et ⌀ moyenne au pied, aucune somme de
 * pourcentages, provenance réelle (dossier du journal, fichier du réglage).
 */
import { computed, onMounted, reactive, ref, watch } from 'vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import AppNumberField from '@/components/common/AppNumberField.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import { claudeBudgetApi } from '@/services/claudeBudgetApi.js';
import { formatDateTime, formatTime } from '@/utils/format.js';

const props = defineProps({
  /** 'complete' (Réglages) ou 'compacte' (tête d'une autre page). */
  variante: { type: String, default: 'complete' },
  /** Montrer le réglage du budget (Réglages seulement). */
  reglable: { type: Boolean, default: false },
  /** Fin de la dernière passe d'actualisation : la carte se relit quand elle change. */
  passeTermineeLe: { type: String, default: null }
});

const etat = ref({ loading: false, error: null, data: null });

async function charger(relire = false) {
  etat.value = { ...etat.value, loading: true, error: null };
  try {
    etat.value = { loading: false, error: null, data: await claudeBudgetApi.overview(relire === true) };
  } catch (error) {
    etat.value = { ...etat.value, loading: false, error: error.message };
  }
}

onMounted(() => charger());
watch(
  () => props.passeTermineeLe,
  (apres, avant) => {
    if (apres && apres !== avant) charger(true);
  }
);

// ------------------------------------------------------------ présentation
const d = computed(() => etat.value.data);
const complete = computed(() => props.variante !== 'compacte');

const nombre = (n) => (n === null || n === undefined ? 'non lu' : Math.round(Number(n)).toLocaleString('fr-FR'));
const decimal = (n) => Number(n ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 });
const pourcent = (p) => `${(Math.floor(Number(p ?? 0) * 1000) / 10).toLocaleString('fr-FR')} %`;
const usd = (v) => (v === null || v === undefined ? 'non calculé' : `${Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`);
const jourCourt = (j) => (j ? new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(new Date(`${j}T12:00:00`)) : '');

/** Les six types d'appel, toujours affichés (même sans état lu : la ligne le dit). */
const TYPES = [
  { type: 'avance', libelle: "Avant-match d'avance" },
  { type: 'coup-d-envoi', libelle: "Avant-match au coup d'envoi" },
  { type: 'reprise', libelle: 'Reprise après changement de onze' },
  { type: 'revue', libelle: "Revue d'après-match" },
  // Étape 42 : le bulletin du matin et le bilan de la semaine, deux appels de l'actualisation.
  { type: 'bulletin', libelle: 'Bulletin du jour' },
  { type: 'bilan-semaine', libelle: 'Bilan de la semaine' },
  { type: 'manuel', libelle: 'Clic manuel' },
  { type: 'autre', libelle: 'Autre' }
];
const libelleType = (t) => TYPES.find((x) => x.type === t)?.libelle ?? t;

// -- le mode
const puceMode = computed(() => {
  if (!d.value) return { libelle: 'Mode non lu', ton: '', icone: 'info' };
  return d.value.mode.econome
    ? { libelle: 'Mode économe', ton: 'is-warning', icone: 'trendDown' }
    : { libelle: 'Mode normal', ton: 'is-accent', icone: 'check' };
});

// -- les deux jauges
const jauges = computed(() => {
  if (!d.value) {
    return [
      { cle: 'jour', titre: "Aujourd'hui", sousTitre: 'état non lu', nonLu: true },
      { cle: 'semaine', titre: 'Cette semaine', sousTitre: 'état non lu', nonLu: true }
    ];
  }
  const ligne = (cle, titre, sousTitre, b) => {
    const part = Number(b.part ?? 0);
    return {
      cle,
      titre,
      sousTitre,
      tokens: b.tokens.total,
      budget: b.budget,
      seuilTokens: b.seuilTokens,
      part,
      largeur: `${Math.min(100, part * 100)}%`,
      ton: part >= 1 ? 'is-danger' : part >= d.value.seuil ? 'is-warning' : '',
      appels: b.appels,
      echecs: b.echecs,
      sansTokens: b.sansTokens,
      usd: b.equivalentApiUsd
    };
  };
  return [
    ligne('jour', "Aujourd'hui", `jour de Paris du ${jourCourt(d.value.jour)}`, d.value.aujourdhui),
    ligne('semaine', 'Cette semaine', `du ${jourCourt(d.value.semaine.du)} au ${jourCourt(d.value.semaine.au)}`, d.value.cetteSemaine)
  ];
});
const seuilPourcent = computed(() => `${Math.round((d.value?.seuil ?? 0.8) * 100)}%`);

// -- le plafond de 150 (rappel)
const plafond = computed(() => d.value?.plafond ?? null);
const kpiPlafond = computed(() => {
  const p = plafond.value;
  if (!p) return { valeur: 'non lu', detail: 'état indisponible', ton: '' };
  if (p.aujourdhui === null) return { valeur: `? / ${p.limite}`, detail: `compteur illisible : ${p.erreur ?? 'raison inconnue'}`, ton: 'is-warn' };
  const laisses = (p.laissesAvantMatch ?? 0) + (p.laissesApresMatch ?? 0);
  // Étape 42 : le bulletin du jour et le bilan de la semaine prennent leur place sur les mêmes 150.
  const textes = (p.bulletin ?? 0) + (p.bilanSemaine ?? 0);
  return {
    valeur: `${nombre(p.aujourdhui)} / ${p.limite}`,
    detail: `${nombre(p.avantMatch)} avant-match, ${nombre(p.apresMatch)} revue(s)${textes ? `, ${nombre(textes)} bulletin ou bilan` : ''}${laisses ? ` ; ${nombre(laisses)} laissée(s) pour demain` : ''}${p.actif ? '' : ' — analyses automatiques coupées'}`,
    ton: p.aujourdhui >= p.limite ? 'is-warn' : ''
  };
});

// -- par type
const lignesTypes = computed(() => TYPES.map((t) => d.value?.parType?.find((x) => x.type === t.type) ?? { ...t, nonLu: true }));
const totaux = computed(() => {
  if (!d.value) return null;
  const somme = (cle, champ) => d.value.parType.reduce((n, l) => n + (champ === 'tokens' ? l[cle].tokens.total : l[cle][champ]), 0);
  const t = {
    jourAppels: somme('aujourdhui', 'appels'),
    jourTokens: somme('aujourdhui', 'tokens'),
    semaineAppels: somme('cetteSemaine', 'appels'),
    semaineTokens: somme('cetteSemaine', 'tokens'),
    semaineUsd: d.value.parType.reduce((n, l) => n + (l.cetteSemaine.equivalentApiUsd ?? 0), 0)
  };
  t.jourMoyenne = t.jourAppels ? t.jourTokens / t.jourAppels : null;
  t.semaineMoyenne = t.semaineAppels ? t.semaineTokens / t.semaineAppels : null;
  t.semaineUsdMoyen = t.semaineAppels ? t.semaineUsd / t.semaineAppels : null;
  return t;
});

// -- accord du compteur du plafond et du journal
const coherence = computed(() => {
  const c = d.value?.coherence;
  if (!c) return null;
  if (c.compteur === null) return { ton: 'is-warning', icone: 'alert', titre: 'Compteur du plafond illisible', texte: `Journal : ${nombre(c.journalAutomatiques)} analyse(s) automatique(s) réussie(s) aujourd'hui.` };
  if (c.egal) {
    return {
      ton: '',
      icone: 'check',
      titre: 'Le compteur et le journal tombent juste',
      texte: `Compteur du plafond : ${nombre(c.compteur)} analyse(s) automatique(s) aujourd'hui ; journal : ${nombre(c.journalAutomatiques)} appel(s) automatique(s) réussi(s).`
    };
  }
  return {
    ton: 'is-warning',
    icone: 'alert',
    titre: 'Écart entre le compteur et le journal',
    texte:
      `Compteur du plafond : ${nombre(c.compteur)} ; journal : ${nombre(c.journalAutomatiques)} appel(s) automatique(s) réussi(s) aujourd'hui. ` +
      (c.journalCommenceAujourdhui
        ? `Le journal n'existe que depuis le ${formatDateTime(c.journalDepuis)} : les analyses faites avant ne sont pas dedans.`
        : c.journalDepuis
          ? 'Un appel réussi dont l’analyse n’a pas pu être enregistrée compte au journal sans compter au plafond : à vérifier dans les derniers appels.'
          : 'Le journal est encore vide : il se remplit à chaque appel à partir de maintenant.')
  };
});

// -- le mode économe : ses règles et ses effets
const regles = computed(() => {
  const p = d.value?.mode?.politique;
  const actif = Boolean(d.value?.mode?.econome);
  return [
    { cle: 'a', texte: "Une seule analyse d'avant-match, dès la composition officielle (celle d'avant coup d'envoi).", actif },
    { cle: 'b', texte: `Reprise après un changement de onze seulement si au moins ${p?.repriseTitulairesHabituelsMin > 1 ? p.repriseTitulairesHabituelsMin : 2} titulaires habituels changent (en mode normal : au moindre changement).`, actif },
    { cle: 'c', texte: "Analyse d'avance (3 h à 48 h avant) réservée aux équipes et championnats favoris.", actif },
    { cle: 'd', texte: 'Les favoris passent d’abord dans chaque liste : si le plafond du jour coupe une liste, les autres attendent.', actif }
  ];
});
const effets = computed(() => d.value?.effets ?? null);

// -- la fiche envoyée à l'IA (étape 41) et le coût moyen d'une analyse, par forme
const fiche = computed(() => {
  const c = d.value?.mode?.politique?.compactage;
  if (!c?.texte) return { texte: 'Forme de la fiche non lue : état indisponible.', icone: 'info' };
  const phrase = `${c.texte.charAt(0).toUpperCase()}${c.texte.slice(1)}`;
  return c.actif ? { texte: `${phrase} — depuis l'${c.depuis ?? 'étape 41'}.`, icone: 'check' } : { texte: `${phrase}.`, icone: 'alert' };
});
const sansCache = computed(() => d.value?.mode?.politique?.essaiSansCache?.prevu ?? 'essai sans mise en cache : prévu, pas activé');
const ANALYSES = [
  { analyse: 'avantMatch', libelle: "Analyse d'avant-match" },
  { analyse: 'revue', libelle: "Revue d'après-match" }
];
/** Les deux analyses toujours affichées, même sans état lu (la case le dit). */
const lignesCout = computed(() => ANALYSES.map((a) => d.value?.coutParForme?.analyses?.find((x) => x.analyse === a.analyse) ?? { ...a, nonLu: true }));
const caseForme = (ligne, forme) => {
  if (ligne.nonLu) return { valeur: 'non lu', detail: '' };
  const f = ligne.formes?.find((x) => x.forme === forme);
  if (!f || !f.appels) return { valeur: 'aucun appel', detail: f?.sansTokens ? `${nombre(f.sansTokens)} sans tokens connus` : 'cette semaine' };
  const detail = [`${nombre(f.appels)} appel(s)`, f.echecs ? `dont ${nombre(f.echecs)} en échec` : '', `entrée ${nombre(f.entreeMoyenne)}`, `sortie ${nombre(f.sortieMoyenne)}`, f.caracteresMoyens !== null ? `${nombre(f.caracteresMoyens)} caractères envoyés` : '']
    .filter(Boolean)
    .join(' · ');
  return { valeur: nombre(f.tokensMoyens), detail };
};

// -- les derniers appels du jour
const derniers = computed(() => d.value?.derniersAppels ?? []);
const matchDe = (a) => (a.match?.home ? `${a.match.home} - ${a.match.away ?? '?'}` : a.detail ?? '—');

// ------------------------------------------------------------- le réglage
const formulaire = reactive({ tokensParJour: null, tokensParSemaine: null, mode: 'auto' });
const touche = ref(false);
const enregistrement = ref({ loading: false, error: null, message: '' });
const MODES = [
  { value: 'auto', label: 'Automatique (économe à 80 %)', icone: 'activity', aide: 'Mode normal tant que le jour et la semaine restent sous 80 % du budget, mode économe au-delà.' },
  { value: 'econome', label: 'Économe tout le temps', icone: 'trendDown', aide: 'Les règles du mode économe s’appliquent même sous 80 %.' }
];

/** Le formulaire suit le réglage en vigueur, tant que rien n'a été touché. */
watch(
  () => d.value?.reglage,
  (r) => {
    if (!r || touche.value) return;
    formulaire.tokensParJour = r.tokensParJour;
    formulaire.tokensParSemaine = r.tokensParSemaine;
    formulaire.mode = r.mode;
  },
  { immediate: true }
);

function modifier(champ, valeur) {
  formulaire[champ] = valeur;
  touche.value = true;
  enregistrement.value = { ...enregistrement.value, message: '', error: null };
}

const reglage = computed(() => d.value?.reglage ?? null);
const formulaireValide = computed(() => Number.isInteger(formulaire.tokensParJour) && Number.isInteger(formulaire.tokensParSemaine) && formulaire.tokensParSemaine >= formulaire.tokensParJour);
/** Enregistrer sert à quelque chose : valeurs valides, et différentes de celles enregistrées (ou rien d'enregistré : confirmer le provisoire). */
const aEnregistrer = computed(() => {
  const r = reglage.value;
  if (!r || !formulaireValide.value) return false;
  if (r.provisoire) return true;
  return r.tokensParJour !== formulaire.tokensParJour || r.tokensParSemaine !== formulaire.tokensParSemaine || r.mode !== formulaire.mode;
});

async function enregistrer() {
  enregistrement.value = { loading: true, error: null, message: '' };
  try {
    const data = await claudeBudgetApi.saveSettings({ tokensParJour: formulaire.tokensParJour, tokensParSemaine: formulaire.tokensParSemaine, mode: formulaire.mode });
    touche.value = false;
    etat.value = { loading: false, error: null, data };
    enregistrement.value = {
      loading: false,
      error: null,
      message: data.enregistrement?.change ? `Enregistré dans ${data.enregistrement.fichier}.` : 'Rien à changer : ces valeurs sont déjà enregistrées.'
    };
  } catch (error) {
    enregistrement.value = { loading: false, error: error.message, message: '' };
  }
}

const provenanceReglage = computed(() => {
  const r = reglage.value;
  if (!r) return 'Réglage non lu.';
  if (r.source === 'enregistre') return `Choisi dans cet écran${r.enregistreLe ? ` le ${formatDateTime(r.enregistreLe)}` : ''} ; enregistré dans ${r.fichier}.`;
  if (r.source === 'illisible') return `Le réglage enregistré (${r.fichier}) est illisible : ${r.probleme}. Les valeurs provisoires s'appliquent ; « Enregistrer » le met de côté, sans l'effacer.`;
  return `Rien n'est encore enregistré : valeurs provisoires, au-dessus du volume mesuré. « Enregistrer » les confirme (fichier ${r.fichier}).`;
});
</script>

<template>
  <div class="cbud" :class="`cbud--${complete ? 'complete' : 'compacte'}`">
    <LoadingSpinner v-if="etat.loading && !d" label="Lecture du budget Claude…" />

    <div v-if="etat.error" class="cm-note is-danger">
      <span class="cm-icon-box is-danger"><AppIcon name="x" :size="16" /></span>
      <div>
        <p class="cm-note__title cbud__titre--danger">Budget Claude illisible</p>
        <p class="cm-note__text cbud__texte">{{ etat.error }} — les jauges et les tableaux ci-dessous restent affichés, sans valeurs.</p>
      </div>
    </div>

    <template v-if="d || etat.error">
      <!-- 1. Le mode, et pourquoi. -->
      <div class="cbud__entete">
        <span class="cm-chip" :class="puceMode.ton" :title="d?.mode?.raison ?? ''">
          <AppIcon :name="puceMode.icone" :size="11" />
          {{ puceMode.libelle }}
        </span>
        <span v-if="reglage?.provisoire" class="cm-chip is-warning" title="Aucun budget enregistré : valeurs par défaut, au-dessus du volume mesuré">
          <AppIcon name="alert" :size="11" />
          réglage provisoire, à confirmer
        </span>
        <span class="cbud__raison">{{ d?.mode?.raison ?? 'Mode non lu : état indisponible.' }}</span>
      </div>

      <!-- 2. Les deux jauges : tokens face au budget, bascule à 80 %. -->
      <div class="cbud__jauges">
        <div v-for="j in jauges" :key="j.cle" class="cbud__jauge cm-block" :class="j.ton">
          <div class="cbud__jauge-haut">
            <span class="cm-kpi__label">{{ j.titre }}</span>
            <span class="cbud__petit">{{ j.sousTitre }}</span>
          </div>
          <div class="cbud__jauge-valeur">
            <span class="cbud__gros cm-numeric">{{ j.nonLu ? 'non lu' : nombre(j.tokens) }}</span>
            <span class="cbud__petit">{{ j.nonLu ? '' : `tokens sur ${nombre(j.budget)} (${pourcent(j.part)})` }}</span>
          </div>
          <div class="cbud__barre" :title="j.nonLu ? '' : `Mode économe à ${nombre(j.seuilTokens)} tokens (80 %)`">
            <div class="cm-bar">
              <div class="cm-bar__fill cbud__remplissage" :style="{ width: j.nonLu ? '0%' : j.largeur }" />
            </div>
            <span class="cbud__seuil" :style="{ left: seuilPourcent }" aria-hidden="true" />
          </div>
          <span class="cbud__petit">
            <template v-if="j.nonLu">état indisponible</template>
            <template v-else>
              {{ nombre(j.appels) }} appel(s)<template v-if="j.echecs">, dont {{ nombre(j.echecs) }} en échec</template><template v-if="j.sansTokens">, {{ nombre(j.sansTokens) }} sans tokens connus</template>
              · économe à {{ nombre(j.seuilTokens) }} · {{ usd(j.usd) }} d'équivalent API
            </template>
          </span>
        </div>
        <div class="cbud__jauge cm-block" :class="kpiPlafond.ton">
          <div class="cbud__jauge-haut">
            <span class="cm-kpi__label">Plafond quotidien</span>
            <span class="cbud__petit">analyses automatiques, jour de Paris</span>
          </div>
          <div class="cbud__jauge-valeur">
            <span class="cbud__gros cm-numeric">{{ kpiPlafond.valeur }}</span>
          </div>
          <span class="cbud__petit">{{ kpiPlafond.detail }}</span>
          <span class="cbud__petit">Inchangé par le budget : la seule limite dure, que le mode économe ne touche pas.</span>
        </div>
      </div>

      <template v-if="complete">
        <!-- 3. Ce que l'appli voit (et ne voit pas). -->
        <div class="cm-note is-info">
          <span class="cm-icon-box is-info"><AppIcon name="eye" :size="16" /></span>
          <div>
            <p class="cm-note__title">Ce que l'appli voit</p>
            <p class="cm-note__text cbud__texte">
              {{ d?.abonnement?.texte ?? "L'appli ne voit que ses propres appels, jamais le pourcentage de l'abonnement Max : le mode économe se déclenche à 80 % du budget fixé ici." }}
              Les appels de l'API Anthropic à la clé (audit des pronostics, recherche web) sont facturés à part : comptés ci-dessous, hors budget.
            </p>
          </div>
        </div>

        <div v-if="coherence" class="cm-note" :class="coherence.ton">
          <span class="cm-icon-box" :class="coherence.ton === 'is-warning' ? 'is-warning' : 'is-accent'"><AppIcon :name="coherence.icone" :size="16" /></span>
          <div>
            <p class="cm-note__title">{{ coherence.titre }}</p>
            <p class="cm-note__text cbud__texte">{{ coherence.texte }}</p>
          </div>
        </div>

        <div v-for="(p, i) in d?.journal?.problemes ?? []" :key="`p-${i}`" class="cm-note is-warning">
          <span class="cm-icon-box is-warning"><AppIcon name="alert" :size="16" /></span>
          <div>
            <p class="cm-note__title cbud__titre--warning">Journal du {{ jourCourt(p.jour) }} illisible</p>
            <p class="cm-note__text cbud__texte">{{ p.fichier }} : {{ p.probleme }}. Rien n'est écrasé ; la dernière version lue compte.</p>
          </div>
        </div>
        <div v-if="d?.journal?.enAttente || d?.journal?.erreur" class="cm-note is-warning">
          <span class="cm-icon-box is-warning"><AppIcon name="clock" :size="16" /></span>
          <div>
            <p class="cm-note__title cbud__titre--warning">Écriture du journal en attente</p>
            <p class="cm-note__text cbud__texte">
              {{ nombre(d.journal.enAttente) }} ligne(s) gardée(s) en mémoire et déjà comptée(s)<template v-if="d.journal.erreur"> — dernière erreur le {{ formatDateTime(d.journal.erreur.at) }} : {{ d.journal.erreur.message }}</template>.
              Nouvel essai automatique ; rien n'est perdu tant que le serveur tourne.
            </p>
          </div>
        </div>

        <!-- 4. Par type d'appel : tableau complet, même vide. -->
        <h4 class="cm-group-title cbud__groupe">Par type d'appel (Claude Code, quota de l'abonnement)</h4>
        <div class="cm-table-wrap">
          <table class="cm-table cbud__table">
            <thead>
              <tr>
                <th class="is-left">Type</th>
                <th title="Appels terminés aujourd'hui (jour de Paris), réussis ou en échec">Appels jour</th>
                <th title="Tokens d'aujourd'hui : entrée + écriture en cache + lecture en cache + sortie">Tokens jour</th>
                <th title="Appels de la semaine (lundi → aujourd'hui)">Appels semaine</th>
                <th title="Tokens de la semaine (lundi → aujourd'hui)">Tokens semaine</th>
                <th title="Équivalent au tarif de l'API (total_cost_usd rendu par Claude Code) : pas une facture, le quota de l'abonnement">Équiv. API semaine</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in lignesTypes" :key="l.type">
                <td class="is-left is-strong cbud__nom">
                  {{ l.libelle }}
                  <small class="cbud__petit">{{ l.nonLu ? 'non lu' : l.automatique ? 'automatique · compté sur le plafond' : l.type === 'manuel' ? 'votre clic · hors plafond, jamais bloqué' : 'sans type précis' }}</small>
                </td>
                <td class="cm-numeric">
                  {{ l.nonLu ? 'non lu' : nombre(l.aujourdhui.appels) }}
                  <small v-if="!l.nonLu && l.aujourdhui.echecs" class="cbud__petit cbud__petit--danger">{{ nombre(l.aujourdhui.echecs) }} en échec</small>
                </td>
                <td class="cm-numeric is-strong">{{ l.nonLu ? 'non lu' : nombre(l.aujourdhui.tokens.total) }}</td>
                <td class="cm-numeric">{{ l.nonLu ? 'non lu' : nombre(l.cetteSemaine.appels) }}</td>
                <td class="cm-numeric">{{ l.nonLu ? 'non lu' : nombre(l.cetteSemaine.tokens.total) }}</td>
                <td class="cm-numeric">{{ l.nonLu ? 'non lu' : usd(l.cetteSemaine.equivalentApiUsd) }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td class="is-left is-strong">Σ {{ lignesTypes.length }} types</td>
                <td class="cm-numeric is-strong">{{ totaux ? nombre(totaux.jourAppels) : 'non lu' }}</td>
                <td class="cm-numeric is-strong">{{ totaux ? nombre(totaux.jourTokens) : 'non lu' }}</td>
                <td class="cm-numeric is-strong">{{ totaux ? nombre(totaux.semaineAppels) : 'non lu' }}</td>
                <td class="cm-numeric is-strong">{{ totaux ? nombre(totaux.semaineTokens) : 'non lu' }}</td>
                <td class="cm-numeric is-strong">{{ totaux ? usd(totaux.semaineUsd) : 'non lu' }}</td>
              </tr>
              <tr>
                <td class="is-left cbud__moyenne">⌀ par appel</td>
                <td class="cm-numeric cbud__moyenne">—</td>
                <td class="cm-numeric cbud__moyenne">{{ totaux ? (totaux.jourMoyenne === null ? 'aucun appel' : decimal(totaux.jourMoyenne)) : 'non lu' }}</td>
                <td class="cm-numeric cbud__moyenne">—</td>
                <td class="cm-numeric cbud__moyenne">{{ totaux ? (totaux.semaineMoyenne === null ? 'aucun appel' : decimal(totaux.semaineMoyenne)) : 'non lu' }}</td>
                <td class="cm-numeric cbud__moyenne">{{ totaux ? (totaux.semaineUsdMoyen === null ? 'aucun appel' : usd(totaux.semaineUsdMoyen)) : 'non lu' }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p class="cbud__ligne cbud__petit">
          <AppIcon name="globe" :size="12" />
          API Anthropic à la clé, hors budget : aujourd'hui {{ d ? `${nombre(d.apiAnthropic.aujourdhui.appels)} appel(s), ${nombre(d.apiAnthropic.aujourdhui.tokens.total)} tokens` : 'non lu' }} ;
          cette semaine {{ d ? `${nombre(d.apiAnthropic.cetteSemaine.appels)} appel(s), ${nombre(d.apiAnthropic.cetteSemaine.tokens.total)} tokens` : 'non lu' }} (facturés sur la clé, pas sur l'abonnement).
        </p>

        <!-- 5. Le mode économe : ses règles, ce qu'il a évité. -->
        <h4 class="cm-group-title cbud__groupe">Mode économe</h4>
        <div class="cbud__bloc cm-block">
          <p class="cbud__ligne">
            Il se déclenche seul à 80 % du budget du jour OU de la semaine<template v-if="reglage?.mode === 'econome'">, et vous l'avez choisi tout le temps</template>.
            Au-delà de 100 % : rien de plus (pas d'arrêt) ; le plafond de {{ plafond?.limite ?? 150 }} analyses automatiques reste la seule limite dure. Un clic n'est jamais bloqué.
          </p>
          <ul class="cbud__regles">
            <li v-for="r in regles" :key="r.cle" :class="{ 'is-actif': r.actif, 'is-plus-tard': r.plusTard }">
              <AppIcon :name="r.plusTard ? 'clock' : r.actif ? 'check' : 'minus'" :size="12" />
              <span>{{ r.texte }}</span>
            </li>
          </ul>
          <p class="cbud__ligne cbud__petit">
            Effet aujourd'hui (depuis le démarrage du serveur) :
            {{ effets ? `${nombre(effets.avancesEcartees)} analyse(s) d'avance non faite(s) (non favorites), ${nombre(effets.reprisesEvitees)} reprise(s) évitée(s) (moins de deux titulaires habituels changés)` : 'non lu' }}.
          </p>
        </div>

        <!-- 5 bis. La fiche envoyée à l'IA (étape 41) et le coût moyen d'une analyse, par forme. -->
        <h4 class="cm-group-title cbud__groupe">Fiche envoyée à l'IA et coût moyen d'une analyse</h4>
        <div class="cbud__bloc cm-block">
          <p class="cbud__ligne">
            <AppIcon :name="fiche.icone" :size="12" />
            <span>{{ fiche.texte }}</span>
          </p>
          <p class="cbud__ligne cbud__petit">
            <AppIcon name="clock" :size="12" />
            <span>{{ sansCache.charAt(0).toUpperCase() + sansCache.slice(1) }}.</span>
          </p>
          <div class="cm-table-wrap">
            <table class="cm-table cbud__table">
              <thead>
                <tr>
                  <th class="is-left">Analyse</th>
                  <th title="Tokens moyens par analyse mesurés le 04/10/2026, sortie comprise">Avant (04/10)</th>
                  <th title="Objectif de l'étape 41 du plan">Objectif</th>
                  <th title="Tokens moyens par appel cette semaine, ancienne fiche (ou appel d'avant l'étape 41)">Ancienne fiche</th>
                  <th title="Tokens moyens par appel cette semaine, fiche compacte">Fiche compacte</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="l in lignesCout" :key="l.analyse">
                  <td class="is-left is-strong">{{ l.libelle }}</td>
                  <td class="cm-numeric">{{ l.nonLu ? 'non lu' : nombre(l.reference) }}</td>
                  <td class="cm-numeric">{{ l.nonLu ? 'non lu' : nombre(l.objectif) }}</td>
                  <td v-for="forme in ['ancienne', 'compacte']" :key="forme" class="cm-numeric">
                    <span class="is-strong">{{ caseForme(l, forme).valeur }}</span>
                    <small class="cbud__petit">{{ caseForme(l, forme).detail }}</small>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="cbud__ligne cbud__petit">
            Tokens par appel (entrée, cache et sortie compris), lus dans le journal du {{ d?.coutParForme ? jourCourt(d.coutParForme.du) : '…' }} à aujourd'hui, échecs compris quand leurs
            tokens sont connus. Référence : {{ d?.coutParForme?.reference ?? 'non lue' }}.
          </p>
        </div>

        <!-- 6. Les derniers appels du jour. -->
        <h4 class="cm-group-title cbud__groupe">Derniers appels d'aujourd'hui</h4>
        <div class="cm-table-wrap">
          <table class="cm-table cbud__table">
            <thead>
              <tr>
                <th class="is-left">Heure</th>
                <th class="is-left">Type</th>
                <th class="is-left">Match</th>
                <th title="Tokens d'entrée hors cache">Entrée</th>
                <th title="Tokens écrits en cache (1 h)">Écrit. cache</th>
                <th title="Tokens relus en cache">Lect. cache</th>
                <th title="Tokens de sortie">Sortie</th>
                <th>Total</th>
                <th title="Équivalent au tarif de l'API : pas une facture">Équiv. API</th>
                <th class="is-left">Issue</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="a in derniers" :key="a.id">
                <td class="is-left cm-numeric">{{ formatTime(a.at) }}</td>
                <td class="is-left">
                  {{ libelleType(a.type) }}
                  <small v-if="a.mode === 'econome'" class="cbud__petit">en mode économe</small>
                </td>
                <td class="is-left cbud__match">{{ matchDe(a) }}</td>
                <template v-if="a.tokens">
                  <td class="cm-numeric">{{ nombre(a.tokens.entree) }}</td>
                  <td class="cm-numeric">{{ nombre(a.tokens.ecritureCache) }}</td>
                  <td class="cm-numeric">{{ nombre(a.tokens.lectureCache) }}</td>
                  <td class="cm-numeric">{{ nombre(a.tokens.sortie) }}</td>
                  <td class="cm-numeric is-strong">{{ nombre(a.tokens.total) }}</td>
                </template>
                <td v-else class="cbud__manque" colspan="5">tokens inconnus : pas de réponse lisible</td>
                <td class="cm-numeric">{{ usd(a.equivalentApiUsd) }}</td>
                <td class="is-left">
                  <span class="cm-chip" :class="a.statut === 'ok' ? 'is-accent' : 'is-danger'">
                    <AppIcon :name="a.statut === 'ok' ? 'check' : 'x'" :size="11" />
                    {{ a.statut === 'ok' ? 'réussi' : 'échec' }}
                  </span>
                  <small v-if="a.erreur" class="cbud__petit cbud__petit--bloc">{{ a.erreur }}</small>
                </td>
              </tr>
              <tr v-if="!derniers.length">
                <td class="is-left cbud__vide" colspan="10">
                  {{ d ? `Aucun appel à Claude aujourd'hui${d.journal?.depuis ? ` (journal tenu depuis le ${formatDateTime(d.journal.depuis)})` : ' : le journal se remplira au premier appel'}.` : 'Liste indisponible : état du budget non lu.' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 7. Le réglage du budget (Réglages seulement). -->
        <template v-if="reglable">
          <h4 class="cm-group-title cbud__groupe">Réglage du budget</h4>
          <div class="cbud__bloc cm-block">
            <p class="cbud__ligne cbud__petit">{{ provenanceReglage }}</p>
            <div class="cm-toolbar cbud__champs">
              <AppNumberField
                :model-value="formulaire.tokensParJour"
                class="cbud__champ"
                label="Tokens par jour"
                :min="10000"
                :step="50000"
                suffix="tokens"
                hint="Mode économe à 80 %"
                @update:model-value="(v) => modifier('tokensParJour', v)"
              />
              <AppNumberField
                :model-value="formulaire.tokensParSemaine"
                class="cbud__champ"
                label="Tokens par semaine"
                :min="10000"
                :step="250000"
                suffix="tokens"
                hint="Du lundi au dimanche, jours de Paris"
                @update:model-value="(v) => modifier('tokensParSemaine', v)"
              />
            </div>
            <div class="cbud__choix" role="radiogroup" aria-label="Mode du budget Claude">
              <button
                v-for="m in MODES"
                :key="m.value"
                type="button"
                role="radio"
                class="cbud__choix-btn"
                :class="{ 'is-active': formulaire.mode === m.value }"
                :aria-checked="formulaire.mode === m.value"
                :title="m.aide"
                :disabled="!d"
                @click="modifier('mode', m.value)"
              >
                <AppIcon :name="m.icone" :size="13" />
                {{ m.label }}
              </button>
            </div>
            <p v-if="!formulaireValide && formulaire.tokensParJour !== null" class="cbud__ligne cbud__petit cbud__petit--warning">
              Deux nombres entiers de tokens, et le budget de la semaine au moins égal à celui d'un jour.
            </p>
            <div class="cbud__actions">
              <span class="cbud__petit">{{ enregistrement.message || (reglage?.provisoire ? 'Valeurs provisoires : « Enregistrer » les confirme.' : '') }}</span>
              <AppButton variant="section" size="sm" :loading="enregistrement.loading" :disabled="!aEnregistrer" @click="enregistrer">
                <template #icon><AppIcon name="check" :size="13" /></template>
                Enregistrer
              </AppButton>
            </div>
            <div v-if="enregistrement.error" class="cm-note is-danger">
              <span class="cm-icon-box is-danger"><AppIcon name="x" :size="16" /></span>
              <div>
                <p class="cm-note__title cbud__titre--danger">Budget non enregistré</p>
                <p class="cm-note__text cbud__texte">{{ enregistrement.error }}</p>
              </div>
            </div>
          </div>
        </template>

        <!-- 8. La provenance réelle. -->
        <div class="cbud__actions">
          <span class="cbud__provenance" :title="d?.journal?.dossier ?? ''">
            <AppIcon name="folder" :size="12" />
            {{ d?.journal ? `Journal : ${d.journal.dossier} (un fichier par jour de Paris)${d.journal.depuis ? `, tenu depuis le ${formatDateTime(d.journal.depuis)}` : ', vide pour l’instant'}` : 'Journal : dossier non lu' }}
          </span>
          <AppButton variant="secondary" size="sm" :loading="etat.loading" @click="charger(true)">
            <template #icon><AppIcon name="refresh" :size="13" /></template>
            Relire
          </AppButton>
        </div>
        <p v-if="d" class="cbud__pied">
          <AppIcon name="clock" :size="12" />
          <span>
            État du {{ formatDateTime(d.generatedAt) }}. Chaque appel est noté au moment où il se termine, réussi ou non, avec ses tokens rendus par Claude Code — y compris
            l'analyse d'avance remplacée par celle du coup d'envoi et la reprise après changement de onze, que le fichier des analyses ne garde pas.
          </span>
        </p>
      </template>
    </template>
  </div>
</template>

<style scoped>
.cbud {
  container: cbud / inline-size;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.cbud--compacte {
  gap: 10px;
}

.cbud__entete {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.cbud__raison {
  flex: 1 1 260px;
  min-width: 0;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--cm-text-secondary);
}

.cbud__jauges {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
}

@container cbud (min-width: 720px) {
  .cbud__jauges {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.cbud__jauge {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.cbud__jauge.is-warning {
  border-color: rgba(var(--cm-warning-rgb) / 0.35);
}

.cbud__jauge.is-danger,
.cbud__jauge.is-warn {
  border-color: rgba(var(--cm-danger-rgb) / 0.35);
}

.cbud__jauge-haut {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
}

.cbud__jauge-valeur {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
}

.cbud__gros {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.15;
  color: var(--cm-text-primary);
}

.cbud__jauge.is-warning .cbud__gros {
  color: var(--cm-warning);
}

.cbud__jauge.is-danger .cbud__gros {
  color: var(--cm-danger);
}

/* La barre et le repère des 80 % (bascule en mode économe). */
.cbud__barre {
  position: relative;
  padding: 3px 0;
}

.cbud__jauge.is-warning .cbud__remplissage {
  background: var(--cm-warning);
}

.cbud__jauge.is-danger .cbud__remplissage {
  background: var(--cm-danger);
}

.cbud__seuil {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
  border-radius: 1px;
  background: var(--cm-warning);
  opacity: 0.8;
}

.cbud__petit {
  display: block;
  font-size: 11.5px;
  font-weight: 500;
  line-height: 1.45;
  color: var(--cm-text-muted);
}

.cbud__petit--bloc {
  margin-top: 4px;
  white-space: normal;
}

.cbud__petit--danger {
  color: var(--cm-danger);
}

.cbud__petit--warning {
  color: var(--cm-warning);
}

.cbud__titre--danger {
  color: var(--cm-danger);
}

.cbud__titre--warning {
  color: var(--cm-warning);
}

.cbud__texte {
  font-size: 12.5px;
  color: var(--cm-text-secondary);
}

.cbud__groupe {
  margin: 6px 0 0;
}

.cbud__table td {
  font-size: 12.5px;
  vertical-align: top;
}

.cbud__table td.cbud__nom,
.cbud__table td.cbud__match {
  white-space: normal;
  min-width: 150px;
}

.cbud__manque {
  font-size: 11.5px;
  color: var(--cm-text-muted);
  white-space: normal;
}

.cbud__vide {
  color: var(--cm-text-secondary);
  white-space: normal;
}

.cbud__moyenne {
  color: var(--cm-text-muted);
}

.cbud__ligne {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
  overflow-wrap: anywhere;
}

.cbud__ligne :deep(svg) {
  flex-shrink: 0;
  align-self: center;
}

.cbud__bloc {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cbud__regles {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--cm-text-muted);
}

.cbud__regles li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.cbud__regles li :deep(svg) {
  flex-shrink: 0;
  margin-top: 3px;
}

.cbud__regles li.is-actif {
  color: var(--cm-text-primary);
}

.cbud__regles li.is-actif :deep(svg) {
  color: var(--cm-warning);
}

.cbud__regles li.is-plus-tard {
  font-style: italic;
}

.cbud__champs {
  align-items: flex-start;
}

.cbud__champ {
  flex: 1 1 220px;
}

/* Le choix du mode : barre segmentée, même dessin que TabbedView et la carte Sauvegardes. */
.cbud__choix {
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

.cbud__choix-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 15px;
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

.cbud__choix-btn:hover:not(:disabled) {
  background: rgb(var(--cm-glass-tint) / var(--cm-glass-alpha-2));
  color: var(--cm-text-primary);
}

.cbud__choix-btn.is-active,
.cbud__choix-btn.is-active:hover:not(:disabled) {
  background: var(--cm-section);
  color: var(--cm-section-on);
  box-shadow: 0 4px 14px rgba(var(--cm-section-rgb) / 0.3);
}

.cbud__choix-btn:disabled {
  cursor: default;
  opacity: 0.6;
}

.cbud__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.cbud__provenance {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 11.5px;
  color: var(--cm-text-muted);
  overflow-wrap: anywhere;
}

.cbud__pied {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--cm-text-muted);
}

.cbud__pied :deep(svg) {
  flex-shrink: 0;
  margin-top: 3px;
}

@container cbud (max-width: 560px) {
  .cbud__actions {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
