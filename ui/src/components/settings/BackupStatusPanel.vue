<script setup>
/**
 * Sauvegardes de la base (étape 1 du plan, 06/10/2026) : la sauvegarde de la
 * nuit, les copies gardées (7 quotidiennes, 4 hebdomadaires, 12 mensuelles),
 * la restauration d'essai de chaque semaine, la copie hors du disque, la
 * place restante. Tout est LU dans un état préparé chaque nuit par
 * l'actualisation (server/scripts/backup-db.mjs et restore-test-db.mjs) :
 * cette carte ne lance aucune sauvegarde et ne calcule rien de lourd.
 *
 * Seule écriture (05/10/2026) : la DESTINATION de la copie hors disque —
 * OneDrive (en ligne), clé USB ou autre dossier, aucune —, enregistrée par
 * le serveur dans data/runtime (PUT /api/backups/destination). Décision de
 * Pierre : OneDrive pour le moment (il s'applique par défaut quand il est
 * détecté), une clé USB plus tard, et jamais server\.env à modifier. Le
 * bouton « Vérifier » fait mesurer la destination sans rien y écrire.
 *
 * Règles de dessin (ui/DESIGN.md) : chiffres clés en .cm-kpis, alertes en
 * notes, tableaux complets même quand une donnée manque (la raison est dite,
 * jamais un simple tiret), provenance réelle : chemin des fichiers et heure ;
 * le choix en barre segmentée (même dessin que TabbedView), le bouton
 * d'enregistrement en variant="section".
 */
import { computed, onMounted, reactive, ref, watch } from 'vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import AppTextField from '@/components/common/AppTextField.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import { backupsApi } from '@/services/backupsApi.js';
import { formatDateTime } from '@/utils/format.js';

const props = defineProps({
  /** Fin de la dernière passe d'actualisation : la carte se relit quand elle change. */
  passeTermineeLe: { type: String, default: null },
  /**
   * 'complete' (Réglages) ou 'compacte' (tête d'une autre page, comme la feuille
   * de route — étape 5 du plan) : les chiffres clés et les alertes seulement,
   * lus sur le même /api/backups, avec un lien vers le détail.
   */
  variante: { type: String, default: 'complete' }
});

const complete = computed(() => props.variante !== 'compacte');

const etat = ref({ loading: false, error: null, data: null });
const voirManuelles = ref(false);

async function charger() {
  etat.value = { ...etat.value, loading: true, error: null };
  try {
    etat.value = { loading: false, error: null, data: await backupsApi.overview() };
  } catch (error) {
    etat.value = { ...etat.value, loading: false, error: error.message };
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
const GO = 1024 ** 3;
const taille = (o) => {
  if (o === null || o === undefined) return null;
  return o >= GO
    ? `${(o / GO).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Go`
    : `${(o / 1024 ** 2).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
};
const nombre = (n) => Number(n ?? 0).toLocaleString('fr-FR');
const duree = (ms) => {
  if (ms === null || ms === undefined) return null;
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
};
const jour = (j) => (j ? new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${j}T12:00:00`)) : null);
const dateCourte = (j) => (j ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${j}T12:00:00`)) : null);
const ROLES = { quotidienne: 'quotidienne', hebdomadaire: 'hebdomadaire', mensuelle: 'mensuelle' };
const CONTROLES = { quick_check: 'rapide (quick_check)', integrity_check: 'complet (integrity_check)' };

const d = computed(() => etat.value.data);
const alertes = computed(() => d.value?.alertes ?? []);
const derniere = computed(() => d.value?.derniereReussie ?? null);
const echec = computed(() => (d.value?.derniere?.ok === false ? d.value.derniere : null));
const restau = computed(() => d.value?.restauration ?? null);
const hd = computed(() => d.value?.horsDisque ?? null);
const disque = computed(() => d.value?.disque ?? null);

const kpiSauvegarde = computed(() => {
  if (echec.value && !derniere.value) return { valeur: 'En échec', detail: echec.value.erreur, ton: 'is-danger' };
  if (!derniere.value) return { valeur: 'Pas encore', detail: 'la première se fait à la prochaine passe de nuit', ton: 'is-warn' };
  return {
    valeur: formatDateTime(derniere.value.fin),
    detail: `${taille(derniere.value.octets)} compressée (base ${taille(derniere.value.octetsBase)}) · ${duree(derniere.value.dureeMs)}`,
    ton: echec.value ? 'is-danger' : ''
  };
});

const kpiRestauration = computed(() => {
  const r = restau.value?.derniere;
  if (!r) return { valeur: 'Jamais faite', detail: 'la première suit la prochaine sauvegarde', ton: 'is-warn' };
  if (r.saine === true) return { valeur: 'Saine', detail: `${nombre(r.rencontres)} rencontres · dernière le ${dateCourte(r.derniereDate)} · ${formatDateTime(r.fin)}`, ton: 'is-ok' };
  if (r.saine === false) return { valeur: 'Non saine', detail: (r.problemes ?? []).join(' ; ') || formatDateTime(r.fin), ton: 'is-danger' };
  return { valeur: 'Impossible', detail: r.impossible ?? formatDateTime(r.fin), ton: 'is-warn' };
});

// ------------------------------------------- copie hors du disque : l'état
const TYPES = [
  {
    value: 'onedrive',
    label: 'OneDrive (en ligne)',
    icone: 'globe',
    aide: 'Une fois par semaine, dans votre dossier OneDrive (CoteMaster-sauvegardes), puis envoyée en ligne par OneDrive ; une seule copie gardée.'
  },
  {
    value: 'dossier',
    label: 'Clé USB ou autre dossier',
    icone: 'folder',
    aide: 'Une fois par semaine, dans le dossier indiqué ; il doit exister (clé branchée) ; deux copies gardées au plus.'
  },
  { value: 'aucune', label: 'Aucune', icone: 'minus', aide: "Pas de copie hors du disque, et plus d'alerte pour le rappeler." }
];
const LIBELLES = Object.fromEntries(TYPES.map((t) => [t.value, t.label]));
/** Un chemin comparable : sans guillemets (« Copier en tant que chemin »), sans barre finale, sans casse (Windows). */
const cleChemin = (p) =>
  String(p ?? '')
    .trim()
    .replace(/^"(.*)"$/, '$1')
    .trim()
    .replace(/\//g, '\\')
    .replace(/\\+$/, '')
    .toLowerCase();
const memeChemin = (a, b) => Boolean(cleChemin(a)) && cleChemin(a) === cleChemin(b);
const heure = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** Les essais faits vers la destination EN VIGUEUR (un ancien choix ne compte plus). */
const reussieIci = computed(() => (hd.value && memeChemin(hd.value.derniereReussie?.destination, hd.value.destination) ? hd.value.derniereReussie : null));
const reussieAilleurs = computed(() => (hd.value?.derniereReussie && !reussieIci.value ? hd.value.derniereReussie : null));
const tentativeIci = computed(() => {
  const t = hd.value?.derniereTentative ?? null;
  if (!t) return null;
  return !hd.value.destination || memeChemin(t.destination, hd.value.destination) ? t : null;
});

const kpiHorsDisque = computed(() => {
  const h = hd.value;
  if (!h) return { valeur: 'Inconnue', detail: '', ton: '' };
  if (h.reglage === 'illisible') return { valeur: 'Choix illisible', detail: 'à refaire ci-dessous (Copie hors du disque)', ton: 'is-warn' };
  if (h.reglage === 'non-configuree') return { valeur: 'Non réglée', detail: 'choisissez OneDrive ou une clé USB ci-dessous', ton: 'is-warn' };
  if (h.reglage === 'refusee') return { valeur: 'Aucune', detail: h.source === 'variable' ? `${h.variable} = aucune (server\\.env)` : 'choix « Aucune » : pas de copie, pas d’alerte', ton: '' };
  if (!h.destination) return { valeur: 'OneDrive introuvable', detail: h.probleme ?? 'OneDrive n’est pas détecté sur ce PC', ton: 'is-warn' };
  const t = tentativeIci.value;
  const textes = { absente: h.type === 'onedrive' ? 'OneDrive absent' : 'Destination absente', 'place-insuffisante': 'Place insuffisante', erreur: 'En échec', 'rien-a-copier': 'Rien à copier' };
  if (t && t.statut !== 'faite') return { valeur: textes[t.statut] ?? t.statut, detail: t.message ?? h.destination, ton: 'is-warn' };
  if (reussieIci.value) return { valeur: `Faite le ${formatDateTime(reussieIci.value.fin)}`, detail: `${LIBELLES[h.type] ?? h.type} · ${taille(reussieIci.value.octets)} · ${h.destination}`, ton: 'is-ok' };
  return { valeur: 'Pas encore faite', detail: `${LIBELLES[h.type] ?? h.type} : part avec la prochaine sauvegarde de nuit`, ton: 'is-warn' };
});

/** Ce qui s'applique maintenant. */
const enVigueur = computed(() => {
  const h = hd.value;
  if (!h) return null;
  if (h.reglage === 'refusee') return { libelle: 'Aucune', chemin: null };
  if (h.reglage === 'non-configuree') return { libelle: 'Non réglée', chemin: null };
  if (h.reglage === 'illisible') return { libelle: 'Choix illisible', chemin: null };
  return { libelle: LIBELLES[h.type] ?? h.type, chemin: h.destination };
});

/** D'où vient ce qui s'applique : le fichier et l'heure du choix, la variable, ou OneDrive détecté. */
const provenance = computed(() => {
  const h = hd.value;
  if (!h) return '';
  const od = h.onedrive;
  if (h.source === 'reglage' && h.reglage !== 'illisible') {
    return `Choisie dans cet écran${h.choix?.majLe ? ` le ${formatDateTime(h.choix.majLe)}` : ''} ; enregistrée dans ${h.fichierReglage}.`;
  }
  if (h.reglage === 'illisible') return `Le choix enregistré (${h.fichierReglage}) est illisible : ${h.probleme}. Choisissez de nouveau ci-dessous : il sera mis de côté, pas écrasé.`;
  if (h.source === 'variable') return `Réglée par la variable ${h.variable} de server\\.env. Un choix enregistré ici passe devant : inutile de modifier ce fichier.`;
  if (h.source === 'defaut-onedrive') {
    return `Par défaut : OneDrive est détecté sur ce PC (${od?.racine}, variable ${od?.variable}${od?.essai ? ', FAUX OneDrive d’essai' : ' de Windows'}) et aucun choix n’est enregistré.`;
  }
  return `Aucun choix enregistré, aucune variable, et ${h.probleme ?? 'OneDrive n’est pas détecté sur ce PC'}.`;
});

// ------------------------------------------ copie hors du disque : le choix
const choix = reactive({ type: null, chemin: '' });
const modifie = ref(false);
const verif = ref({ loading: false, error: null, data: null, pour: null });
const enregistrement = ref({ loading: false, error: null, faitLe: null, change: null });
const choixEnVigueur = computed(() => (hd.value ? (hd.value.reglage === 'refusee' ? 'aucune' : hd.value.type) : null));
const cleChoix = () => `${choix.type}|${choix.type === 'dossier' ? cleChemin(choix.chemin) : ''}`;

/** Le choix affiché suit ce qui s'applique, tant que rien n'a été touché. */
function initialiserChoix() {
  const h = hd.value;
  if (!h) return;
  choix.type = h.reglage === 'refusee' ? 'aucune' : h.type === 'onedrive' || h.type === 'dossier' ? h.type : null;
  choix.chemin = h.type === 'dossier' ? h.destination ?? '' : h.choix?.type === 'dossier' ? h.choix.chemin ?? '' : '';
  modifie.value = false;
}
watch(
  () => etat.value.data,
  () => {
    if (!modifie.value) initialiserChoix();
  },
  { immediate: true }
);

async function verifier() {
  if (!choix.type) return;
  const pour = cleChoix();
  verif.value = { loading: true, error: null, data: null, pour };
  try {
    const data = await backupsApi.checkDestination({ type: choix.type, chemin: choix.type === 'dossier' ? choix.chemin : null });
    if (pour === cleChoix()) verif.value = { loading: false, error: null, data, pour };
  } catch (error) {
    if (pour === cleChoix()) verif.value = { loading: false, error: error.message, data: null, pour };
  }
}

function choisir(type) {
  if (choix.type === type) return;
  choix.type = type;
  modifie.value = true;
  verif.value = { loading: false, error: null, data: null, pour: null };
  enregistrement.value = { loading: false, error: null, faitLe: null, change: null };
  // OneDrive : rien à taper, la vérification part tout de suite (rien n'est écrit).
  if (type === 'onedrive') verifier();
}

function cheminTape() {
  modifie.value = true;
  enregistrement.value = { loading: false, error: null, faitLe: null, change: null };
}

/** La vérification à montrer : celle du bouton pour ce choix-là, sinon celle de l'état si le choix est celui en vigueur. */
const verificationAffichee = computed(() => {
  if (verif.value.data && verif.value.pour === cleChoix()) return verif.value.data;
  const h = hd.value;
  if (!h?.verification || choix.type !== choixEnVigueur.value) return null;
  if (choix.type === 'dossier' && !memeChemin(choix.chemin, h.destination)) return null;
  return h.verification;
});

/** Enregistrer sert à quelque chose : choix complet, et différent de celui enregistré (ou rien d'enregistré encore). */
const aEnregistrer = computed(() => {
  const h = hd.value;
  if (!h || !choix.type) return false;
  if (choix.type === 'dossier' && !choix.chemin.trim()) return false;
  if (h.source !== 'reglage' || h.reglage === 'illisible') return true;
  if (choixEnVigueur.value !== choix.type) return true;
  return choix.type === 'dossier' && !memeChemin(choix.chemin, h.choix?.chemin);
});

const messageEnregistrement = computed(() => {
  const e = enregistrement.value;
  if (e.loading) return 'Enregistrement…';
  if (e.faitLe) return e.change === false ? `Déjà enregistré (${heure(e.faitLe)}) : rien n’a changé.` : `Choix enregistré à ${heure(e.faitLe)} : il s’applique dès la prochaine sauvegarde de nuit.`;
  if (!aEnregistrer.value) return '';
  if (modifie.value) return 'Choix modifié, pas encore enregistré.';
  if (hd.value?.source === 'defaut-onedrive') return 'OneDrive s’applique par défaut ; « Enregistrer » en fait votre choix.';
  if (hd.value?.source === 'variable') return 'Réglée par server\\.env ; « Enregistrer » en fait votre choix, sans toucher à ce fichier.';
  return '';
});

async function enregistrer() {
  enregistrement.value = { loading: true, error: null, faitLe: null, change: null };
  try {
    const data = await backupsApi.saveDestination({ type: choix.type, chemin: choix.type === 'dossier' ? choix.chemin : null });
    etat.value = { loading: false, error: null, data };
    initialiserChoix();
    verif.value = { loading: false, error: null, data: null, pour: null };
    enregistrement.value = { loading: false, error: null, faitLe: new Date().toISOString(), change: data.enregistrement?.change ?? null };
  } catch (error) {
    enregistrement.value = { loading: false, error: error.message, faitLe: null, change: null };
  }
}

// Présentation d'une vérification.
const copiesDossier = computed(() => {
  const n = hd.value?.garderDossier ?? 2;
  return n > 1 ? `Au plus ${n} copies y sont gardées` : 'Une seule copie y est gardée';
});
const existence = (v) => (v.existe ? 'existe' : v.aCreer ? 'sera créé à la première copie' : 'absent');
function placeTexte(v) {
  if (v.libre === null || v.libre === undefined) return v.problemes.some((p) => p.code === 'interdit') ? 'non mesurée (dossier refusé)' : 'non mesurable ici';
  const libre = `${taille(v.libre)} libres${v.total ? ` sur ${taille(v.total)}` : ''}`;
  if (v.requis === null || v.requis === undefined) return `${libre} ; taille d’une copie encore inconnue (pas de sauvegarde de nuit pour l’instant)`;
  return `${libre} ; il en faut ${taille(v.requis)} (dernière sauvegarde ${taille(v.tailleCopie)} + 512 Mo de marge)`;
}
const onedriveTexte = (o) => (o?.detecte ? `détecté : ${o.racine} (variable ${o.variable}${o.essai ? ', faux OneDrive d’essai' : ' de Windows'})` : o?.raison ?? 'non détecté');

const kpiPlace = computed(() => {
  const p = disque.value;
  if (!p || p.libre === null) return { valeur: 'Inconnue', detail: 'place libre non mesurable', ton: 'is-warn' };
  const tons = { ok: 'is-ok', surveiller: 'is-warn', insuffisante: 'is-danger' };
  return { valeur: taille(p.libre), detail: `sauvegarde impossible sous ${taille(p.requis)} (2 × la base + 2 Go)`, ton: tons[p.niveau] ?? '' };
});

// Copies gardées : la liste du dossier telle qu'elle est, et le rôle de chaque copie.
const copies = computed(() => d.value?.copies ?? []);
const totalCopies = computed(() => copies.value.reduce((n, c) => n + (c.octets ?? 0), 0));
const restaurations = computed(() => restau.value?.historique ?? []);

const roleTon = (r) => (r === 'quotidienne' ? '' : r === 'hebdomadaire' ? 'is-section' : r === 'mensuelle' ? 'is-info' : 'is-warning');
const resultatEssai = (r) => (r.saine === true ? { texte: 'saine', ton: 'is-accent' } : r.saine === false ? { texte: 'non saine', ton: 'is-danger' } : { texte: 'impossible', ton: 'is-warning' });
</script>

<template>
  <div class="bkp">
    <LoadingSpinner v-if="etat.loading && !d" label="Lecture de l'état des sauvegardes…" />

    <div v-if="etat.error" class="cm-note is-danger">
      <span class="cm-icon-box is-danger"><AppIcon name="x" :size="16" /></span>
      <div>
        <p class="cm-note__title bkp__titre--danger">État des sauvegardes illisible</p>
        <p class="cm-note__text bkp__texte">{{ etat.error }} — le tableau ci-dessous reste affiché, sans valeurs.</p>
      </div>
    </div>

    <template v-if="d || etat.error">
      <!-- 1. Les chiffres clés. -->
      <div class="cm-kpis bkp__kpis">
        <div class="cm-kpi" :class="kpiSauvegarde.ton">
          <span class="cm-kpi__label">Dernière sauvegarde</span>
          <span class="cm-kpi__value bkp__kpi-valeur">{{ d ? kpiSauvegarde.valeur : 'non lue' }}</span>
          <span class="cm-kpi__detail">{{ d ? kpiSauvegarde.detail : 'état indisponible' }}</span>
        </div>
        <div class="cm-kpi">
          <span class="cm-kpi__label">Copies gardées</span>
          <span class="cm-kpi__value">{{ d ? d.compte.jeux : 'non lu' }}</span>
          <span class="cm-kpi__detail" title="Une même copie peut compter à plusieurs titres : celle de cette nuit est à la fois la quotidienne, l'hebdomadaire et la mensuelle du moment.">
            <template v-if="d">{{ d.compte.quotidiennes }}/{{ d.politique.quotidiennes }} quotidiennes · {{ d.compte.hebdomadaires }}/{{ d.politique.hebdomadaires }} hebdo. · {{ d.compte.mensuelles }}/{{ d.politique.mensuelles }} mensuelles</template>
            <template v-else>état indisponible</template>
          </span>
        </div>
        <div class="cm-kpi" :class="kpiRestauration.ton">
          <span class="cm-kpi__label">Restauration d'essai</span>
          <span class="cm-kpi__value bkp__kpi-valeur">{{ d ? kpiRestauration.valeur : 'non lue' }}</span>
          <span class="cm-kpi__detail">{{ d ? kpiRestauration.detail : 'état indisponible' }}</span>
        </div>
        <div class="cm-kpi" :class="kpiHorsDisque.ton">
          <span class="cm-kpi__label">Copie hors disque</span>
          <span class="cm-kpi__value bkp__kpi-valeur">{{ d ? kpiHorsDisque.valeur : 'non lue' }}</span>
          <span class="cm-kpi__detail">{{ d ? kpiHorsDisque.detail : 'état indisponible' }}</span>
        </div>
        <div class="cm-kpi" :class="kpiPlace.ton">
          <span class="cm-kpi__label">Place libre</span>
          <span class="cm-kpi__value bkp__kpi-valeur">{{ d ? kpiPlace.valeur : 'non lue' }}</span>
          <span class="cm-kpi__detail">{{ d ? kpiPlace.detail : 'état indisponible' }}</span>
        </div>
      </div>

      <!-- 2. Ce qui manque ou ne va pas (alertes durables). -->
      <div v-for="a in alertes" :key="a.code" class="cm-note" :class="a.niveau === 'danger' ? 'is-danger' : 'is-warning'">
        <span class="cm-icon-box" :class="a.niveau === 'danger' ? 'is-danger' : 'is-warning'"><AppIcon name="alert" :size="16" /></span>
        <div>
          <p class="cm-note__text bkp__texte">{{ a.texte }}</p>
        </div>
      </div>

      <!-- Version courte (feuille de route) : les chiffres clés et les alertes ci-dessus suffisent ; le détail est dans Réglages. -->
      <RouterLink v-if="!complete" to="/reglages" class="cm-link bkp__lien">
        Détails (copies gardées, restaurations d’essai, choix de la copie hors disque) dans Réglages
        <AppIcon name="chevronRight" :size="12" />
      </RouterLink>

      <template v-if="complete">
      <div class="bkp__actions">
        <span v-if="d?.enCours" class="cm-chip is-warning"><AppIcon name="refresh" :size="11" /> Sauvegarde ou essai en cours</span>
        <span v-else />
        <AppButton variant="secondary" size="sm" :loading="etat.loading" @click="charger">
          <template #icon><AppIcon name="refresh" :size="13" /></template>
          Relire
        </AppButton>
      </div>

      <!-- 3. Les copies gardées : rôle, tailles, rencontres, fichiers. -->
      <h4 class="cm-group-title bkp__groupe">Copies automatiques gardées</h4>
      <div class="cm-table-wrap">
        <table class="cm-table bkp__table">
          <thead>
            <tr>
              <th class="is-left">Jour (Paris)</th>
              <th class="is-left" title="Rôle de la copie dans la rotation 7 quotidiennes / 4 hebdomadaires / 12 mensuelles">Rôle</th>
              <th title="La base compressée (cotemaster-AAAA-MM-JJ.db.gz)">Base</th>
              <th title="Pronostics, paris, analyses IA, réglages du moteur… (data/runtime, sans secrets)">Données de l'appli</th>
              <th title="Rencontres comptées dans la copie le soir de la sauvegarde">Rencontres</th>
              <th class="is-left">Dernière rencontre</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in copies" :key="c.jour">
              <td class="is-left is-strong cm-numeric">{{ jour(c.jour) }}</td>
              <td class="is-left bkp__roles">
                <span v-for="r in c.raisons" :key="r" class="cm-chip" :class="roleTon(r)">{{ ROLES[r] ?? r }}</span>
                <span v-if="c.ancienFormat" class="cm-chip is-warning" title="Copie hebdomadaire d'avant le 06/10/2026 : non compressée, sans archive des données">ancien format</span>
              </td>
              <td class="cm-numeric" :title="(c.fichiers.base ?? c.fichiers.ancienne)?.nom">
                {{ taille((c.fichiers.base ?? c.fichiers.ancienne)?.octets) ?? 'absente' }}
                <small v-if="c.octetsBase" class="bkp__petit">base {{ taille(c.octetsBase) }}</small>
                <small v-else-if="c.ancienFormat" class="bkp__petit">non compressée</small>
              </td>
              <td class="cm-numeric" :title="c.fichiers.donnees?.nom">
                <template v-if="c.fichiers.donnees">{{ taille(c.fichiers.donnees.octets) }}</template>
                <span v-else class="bkp__manque">{{ c.ancienFormat ? 'non comprises (ancien format)' : 'absentes' }}</span>
              </td>
              <td class="cm-numeric">
                <template v-if="c.rencontres !== null">{{ nombre(c.rencontres) }}</template>
                <span v-else class="bkp__manque">{{ c.ancienFormat ? 'non comptées (ancien format)' : 'pas de bilan lu' }}</span>
              </td>
              <td class="is-left cm-numeric">
                <template v-if="c.derniereDate">{{ dateCourte(c.derniereDate) }}</template>
                <span v-else class="bkp__manque">{{ c.ancienFormat ? 'non relevée (ancien format)' : 'pas de bilan lu' }}</span>
              </td>
              <td class="cm-numeric is-strong">{{ taille(c.octets) }}</td>
            </tr>
            <tr v-if="!copies.length">
              <td class="is-left bkp__vide" colspan="7">
                {{ d ? `Aucune copie automatique dans ${d.dossier} pour l'instant : la première se fait à la prochaine passe de nuit.` : 'Liste indisponible.' }}
              </td>
            </tr>
          </tbody>
          <tfoot v-if="copies.length">
            <tr>
              <td class="is-left is-strong" colspan="6">Σ {{ copies.length }} copie{{ copies.length > 1 ? 's' : '' }} automatique{{ copies.length > 1 ? 's' : '' }}</td>
              <td class="cm-numeric is-strong">{{ taille(totalCopies) }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p v-if="d?.incomplets?.length" class="bkp__pied is-warning">
        <AppIcon name="alert" :size="12" />
        Jeux sans base (fichier supprimé à la main ?), laissés tels quels : {{ d.incomplets.map((i) => `${i.jour} (${i.fichiers.join(', ')})`).join(' ; ') }}.
      </p>

      <!-- 4. Les restaurations d'essai. -->
      <h4 class="cm-group-title bkp__groupe">Restaurations d'essai</h4>
      <div class="cm-table-wrap">
        <table class="cm-table bkp__table">
          <thead>
            <tr>
              <th class="is-left">Essai du</th>
              <th class="is-left">Copie essayée</th>
              <th class="is-left">Contrôle</th>
              <th class="is-left">Résultat</th>
              <th title="Rencontres trouvées dans la copie restaurée / comptées le soir de la sauvegarde">Rencontres</th>
              <th class="is-left">Dernière rencontre</th>
              <th>Durée</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in restaurations" :key="r.fin">
              <td class="is-left is-strong cm-numeric">{{ formatDateTime(r.fin) }}</td>
              <td class="is-left cm-numeric">{{ r.sauvegarde?.jour ? jour(r.sauvegarde.jour) : 'aucune' }}</td>
              <td class="is-left">{{ r.controle ? CONTROLES[r.controle] ?? r.controle : 'pas fait' }}</td>
              <td class="is-left bkp__resultat">
                <span class="cm-chip" :class="resultatEssai(r).ton">{{ resultatEssai(r).texte }}</span>
                <span v-if="r.problemes?.length || r.impossible" class="bkp__petit bkp__petit--bloc">{{ r.impossible ?? r.problemes.join(' ; ') }}</span>
                <span v-else-if="r.avertissements?.length" class="bkp__petit bkp__petit--bloc">{{ r.avertissements.join(' ; ') }}</span>
              </td>
              <td class="cm-numeric">
                <template v-if="r.rencontres !== undefined && r.rencontres !== null">{{ nombre(r.rencontres) }}<small class="bkp__petit"> / {{ r.attendues !== null && r.attendues !== undefined ? nombre(r.attendues) : 'non comptées à la sauvegarde' }}</small></template>
                <span v-else class="bkp__manque">non comptées (essai interrompu)</span>
              </td>
              <td class="is-left cm-numeric">
                <template v-if="r.derniereDate">{{ dateCourte(r.derniereDate) }}</template>
                <span v-else class="bkp__manque">non lue</span>
              </td>
              <td class="cm-numeric">{{ duree(r.durees?.totalMs) ?? 'non mesurée' }}</td>
            </tr>
            <tr v-if="!restaurations.length">
              <td class="is-left bkp__vide" colspan="7">Aucune restauration d'essai pour l'instant : elle suit la sauvegarde de nuit, une fois par semaine.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="d" class="bkp__pied">
        <AppIcon name="clock" :size="12" />
        <span>
          Prochaine restauration d'essai : {{ restau?.prochaine ? `le ${dateCourte(restau.prochaine)}` : 'à la prochaine sauvegarde de nuit' }}.
          Contrôle complet (integrity_check, index compris) :
          {{ restau?.dernierControleComplet ? `dernier le ${formatDateTime(restau.dernierControleComplet.fin)}` : 'jamais fait' }}, prochain
          {{ restau?.prochainControleComplet ? `le ${dateCourte(restau.prochainControleComplet)}` : 'au prochain essai' }}.
          <template v-if="restau?.derniere?.indexManquants?.length"> Index absents de la dernière copie : {{ restau.derniere.indexManquants.join(', ') }}.</template>
        </span>
      </p>

      <!-- 5. Hors du disque : ce qui s'applique et d'où ça vient, le choix, la dernière copie. -->
      <h4 class="cm-group-title bkp__groupe">Copie hors du disque</h4>
      <div class="bkp__bloc cm-block">
        <!-- 5a. En vigueur, avec sa provenance réelle (fichier et heure du choix, variable, OneDrive détecté). -->
        <p class="bkp__ligne">
          <strong>En vigueur :</strong> {{ enVigueur?.libelle ?? 'inconnue (état non lu)' }}<template v-if="enVigueur?.chemin"> — {{ enVigueur.chemin }}</template>
          <span v-if="hd?.reglage === 'configuree' && hd.destination" class="cm-chip" :class="hd.presente ? 'is-accent' : hd.type === 'onedrive' ? 'is-info' : 'is-warning'">
            {{ hd.presente ? 'présente maintenant' : hd.type === 'onedrive' ? 'dossier créé à la première copie' : 'absente maintenant (clé débranchée ?)' }}
          </span>
        </p>
        <p v-if="hd" class="bkp__ligne bkp__petit">{{ provenance }}</p>

        <!-- 5b. Le choix : trois options, le dossier et « Vérifier », « Enregistrer ». -->
        <div class="bkp__choix" role="radiogroup" aria-label="Destination de la copie hors du disque">
          <button
            v-for="t in TYPES"
            :key="t.value"
            type="button"
            role="radio"
            class="bkp__choix-btn"
            :class="{ 'is-active': choix.type === t.value }"
            :aria-checked="choix.type === t.value"
            :title="t.aide"
            :disabled="!d"
            @click="choisir(t.value)"
          >
            <AppIcon :name="t.icone" :size="13" />
            {{ t.label }}
          </button>
        </div>

        <div v-if="choix.type === 'dossier'" class="cm-toolbar bkp__chemin">
          <AppTextField
            v-model="choix.chemin"
            class="bkp__champ"
            label="Dossier de la clé USB (ou autre dossier)"
            placeholder="E:\CoteMaster-sauvegardes"
            @update:model-value="cheminTape"
          >
            <template #icon><AppIcon name="folder" :size="14" /></template>
          </AppTextField>
          <AppButton variant="secondary" size="sm" :loading="verif.loading" :disabled="!choix.chemin.trim()" @click="verifier">
            <template #icon><AppIcon name="search" :size="13" /></template>
            Vérifier
          </AppButton>
        </div>
        <p v-if="choix.type === 'dossier'" class="bkp__ligne bkp__petit">
          Branchez la clé, créez-y un dossier (par exemple E:\CoteMaster-sauvegardes), collez son chemin ici puis « Vérifier ». {{ copiesDossier }} ; clé
          débranchée la nuit venue : rien n'est écrit, une alerte le dit. Jamais le dossier des sauvegardes ni un dossier du projet.
        </p>
        <div v-if="choix.type === 'onedrive'" class="cm-note is-info">
          <span class="cm-icon-box is-info"><AppIcon name="globe" :size="16" /></span>
          <div>
            <p class="cm-note__title">OneDrive : sur ce disque, puis en ligne</p>
            <p class="cm-note__text bkp__texte">
              La copie est écrite sur ce même disque, dans votre dossier OneDrive (sous-dossier CoteMaster-sauvegardes, créé au besoin, une seule copie gardée),
              puis OneDrive l'envoie en ligne : une fois envoyée, elle survit à une panne de ce disque. L'appli ne voit pas la place restante dans votre
              compte OneDrive (5 Go en gratuit ; une copie pèse {{ hd?.tailleCopie ? `~${taille(hd.tailleCopie)}` : 'environ 0,35 Go' }}) : si la synchronisation
              s'arrête, vérifiez l'icône OneDrive de la barre des tâches.
            </p>
          </div>
        </div>
        <p v-if="choix.type === 'aucune'" class="bkp__ligne bkp__petit">
          Pas de copie hors du disque : les sauvegardes ne vivent que sur ce disque, et plus aucune alerte ne le rappellera.
        </p>

        <!-- La vérification : ce qui a été mesuré, sans rien écrire. -->
        <div v-if="verif.error" class="cm-note is-danger">
          <span class="cm-icon-box is-danger"><AppIcon name="x" :size="16" /></span>
          <div>
            <p class="cm-note__title bkp__titre--danger">Vérification impossible</p>
            <p class="cm-note__text bkp__texte">{{ verif.error }}</p>
          </div>
        </div>
        <div v-else-if="verificationAffichee && choix.type !== 'aucune'" class="cm-note" :class="verificationAffichee.utilisable ? '' : 'is-warning'">
          <span class="cm-icon-box" :class="verificationAffichee.utilisable ? 'is-accent' : 'is-warning'">
            <AppIcon :name="verificationAffichee.utilisable ? 'check' : 'alert'" :size="16" />
          </span>
          <div>
            <p class="cm-note__title">{{ verificationAffichee.utilisable ? 'Destination utilisable' : 'Destination pas utilisable maintenant' }}</p>
            <ul class="bkp__faits">
              <li v-if="verificationAffichee.destination">Dossier : {{ verificationAffichee.destination }} — {{ existence(verificationAffichee) }}</li>
              <li v-if="verificationAffichee.type === 'onedrive'">OneDrive : {{ onedriveTexte(verificationAffichee.onedrive) }}</li>
              <li v-if="verificationAffichee.destination">Place sur ce disque : {{ placeTexte(verificationAffichee) }}</li>
              <li v-for="p in verificationAffichee.problemes" :key="`${p.code}-${p.texte}`" class="bkp__probleme">{{ p.texte }}</li>
              <li v-for="a in verificationAffichee.avertissements" :key="a">{{ a }}</li>
            </ul>
            <p class="bkp__petit">Vérifiée le {{ formatDateTime(verificationAffichee.verifieLe) }}, sans rien écrire.</p>
          </div>
        </div>

        <div class="bkp__actions">
          <span class="bkp__petit bkp__message">{{ messageEnregistrement }}</span>
          <AppButton variant="section" size="sm" :loading="enregistrement.loading" :disabled="!aEnregistrer" @click="enregistrer">
            <template #icon><AppIcon name="check" :size="13" /></template>
            Enregistrer
          </AppButton>
        </div>
        <div v-if="enregistrement.error" class="cm-note is-danger">
          <span class="cm-icon-box is-danger"><AppIcon name="x" :size="16" /></span>
          <div>
            <p class="cm-note__title bkp__titre--danger">Choix non enregistré</p>
            <p class="cm-note__text bkp__texte">{{ enregistrement.error }}</p>
          </div>
        </div>

        <!-- 5c. La dernière copie hors disque (vers la destination en vigueur). -->
        <template v-if="hd?.reglage === 'configuree' && hd.destination">
          <p class="bkp__ligne">
            <strong>Dernière copie :</strong>
            <template v-if="reussieIci">le {{ formatDateTime(reussieIci.fin) }} ({{ taille(reussieIci.octets) }}, en {{ duree(reussieIci.dureeMs) }}) ; copies là-bas : {{ (reussieIci.copiesLaBas ?? []).map((c) => dateCourte(c.jour)).join(', ') || 'aucune' }} (au plus {{ hd.garder }})</template>
            <template v-else>aucune vers cette destination pour l'instant</template>
            ; prochaine : {{ hd.prochaine ? `le ${dateCourte(hd.prochaine)}` : 'avec la prochaine sauvegarde de nuit' }}.
          </p>
          <p v-if="tentativeIci && tentativeIci.statut !== 'faite'" class="bkp__ligne bkp__manque">
            Dernier essai le {{ formatDateTime(tentativeIci.fin) }} : {{ tentativeIci.message ?? tentativeIci.statut }}.
          </p>
        </template>
        <p v-else-if="hd?.reglage === 'configuree'" class="bkp__ligne bkp__manque">
          Rien ne part tant que OneDrive n'est pas détecté : {{ hd.probleme ?? 'OneDrive introuvable' }}.
        </p>
        <p v-if="reussieAilleurs" class="bkp__ligne bkp__petit">
          Dernière copie faite vers {{ reussieAilleurs.destination }} le {{ formatDateTime(reussieAilleurs.fin) }} (ancienne destination, ou option --hors-disque d'un
          lancement à la main) : elle y reste, rien n'y est plus écrit.
        </p>
      </div>

      <!-- 6. Entretien : tailles, copies faites à la main, provenance. -->
      <h4 class="cm-group-title bkp__groupe">Entretien</h4>
      <div class="cm-kpis bkp__kpis bkp__kpis--petits">
        <div class="cm-kpi">
          <span class="cm-kpi__label">Base</span>
          <span class="cm-kpi__value">{{ d?.base?.octets !== null && d?.base?.octets !== undefined ? taille(d.base.octets) : 'non mesurée' }}</span>
          <span class="cm-kpi__detail">journal (-wal) : {{ d?.base?.journalOctets !== null && d?.base?.journalOctets !== undefined ? taille(d.base.journalOctets) : 'non mesuré' }}</span>
        </div>
        <div class="cm-kpi">
          <span class="cm-kpi__label">Copies automatiques</span>
          <span class="cm-kpi__value">{{ d ? taille(d.octetsAuto) : 'non mesurées' }}</span>
          <span class="cm-kpi__detail">rotation 7 / 4 / 12</span>
        </div>
        <div class="cm-kpi">
          <span class="cm-kpi__label">Copies faites à la main</span>
          <span class="cm-kpi__value">{{ d ? d.manuelles.length : 'non lues' }}</span>
          <span class="cm-kpi__detail">{{ d ? `${taille(d.octetsManuelles)} · jamais supprimées` : 'état indisponible' }}</span>
        </div>
      </div>
      <button v-if="d?.manuelles?.length" type="button" class="cm-link bkp__bascule" @click="voirManuelles = !voirManuelles">
        <AppIcon name="chevronRight" :size="12" class="bkp__chevron" :class="{ 'is-open': voirManuelles }" />
        Copies faites à la main ({{ d.manuelles.length }})
      </button>
      <div v-if="voirManuelles && d?.manuelles?.length" class="cm-table-wrap">
        <table class="cm-table bkp__table">
          <thead>
            <tr>
              <th class="is-left">Fichier</th>
              <th>Taille</th>
              <th class="is-left">Modifié le</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in d.manuelles" :key="m.nom">
              <td class="is-left">{{ m.nom }}</td>
              <td class="cm-numeric">{{ taille(m.octets) }}</td>
              <td class="is-left cm-numeric">{{ formatDateTime(m.modifieLe) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p v-if="d" class="bkp__pied">
        <AppIcon name="folder" :size="12" />
        <span>
          Dossier : {{ d.dossier }}{{ d.dossierPresent ? '' : ' (pas encore créé)' }}. État lu dans {{ d.fichiersEtat?.sauvegarde }}
          ({{ d.etatPrepareLe ? `préparé le ${formatDateTime(d.etatPrepareLe)} par backup-db.mjs` : 'pas encore écrit' }}) et {{ d.fichiersEtat?.restauration }}
          ({{ restau?.majLe ? `écrit le ${formatDateTime(restau.majLe)} par restore-test-db.mjs` : 'pas encore écrit' }}) ; liste du dossier, tailles et
          place libre mesurées le {{ formatDateTime(d.genereLe) }}.
        </span>
      </p>

      <div class="cm-note">
        <span class="cm-icon-box is-muted"><AppIcon name="shield" :size="16" /></span>
        <div>
          <p class="cm-note__title">Comment ça marche</p>
          <p class="cm-note__text bkp__texte">
            Chaque nuit, l'actualisation copie la base par VACUUM INTO (lecture seule, sans jamais toucher à son journal), la compresse et y
            joint les données de l'appli (pronostics, paris, analyses IA, réglages du moteur — jamais server\.env ni ai-config.json). On garde
            la dernière copie de chacun des 7 derniers jours, des 4 dernières semaines et des 12 derniers mois ; une copie faite à la main
            n'est jamais supprimée. Chaque semaine, la dernière copie est restaurée dans un dossier temporaire, ouverte en lecture seule et
            contrôlée (une fois par mois, contrôle complet), puis effacée. Chaque semaine aussi, la dernière copie part hors du disque, vers la
            destination choisie ci-dessus : OneDrive (une copie gardée, envoyée en ligne) ou une clé USB / un autre dossier (deux au plus) ;
            destination absente ou place insuffisante : rien n'est écrit, une alerte le dit.
          </p>
        </div>
      </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.bkp {
  container: bkp / inline-size;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.bkp__kpis {
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
}

.bkp__kpis--petits {
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}

/* Valeurs textuelles (« Saine », une date) : plus petites qu'un chiffre seul. */
.bkp__kpi-valeur {
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

.bkp__titre--danger {
  color: var(--cm-danger);
}

.bkp__texte {
  font-size: 12.5px;
  color: var(--cm-text-secondary);
}

.bkp__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.bkp__groupe {
  margin: 6px 0 0;
}

.bkp__table td {
  font-size: 12.5px;
  vertical-align: top;
}

.bkp__roles {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.bkp__table td.bkp__resultat {
  white-space: normal;
  min-width: 200px;
}

.bkp__petit {
  display: block;
  font-size: 11px;
  font-weight: 500;
  color: var(--cm-text-muted);
}

.bkp__petit--bloc {
  margin-top: 4px;
  line-height: 1.4;
  white-space: normal;
}

.bkp__manque {
  font-size: 11.5px;
  color: var(--cm-text-muted);
  white-space: normal;
}

.bkp__vide {
  color: var(--cm-text-secondary);
  white-space: normal;
}

.bkp__pied {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--cm-text-muted);
}

.bkp__pied.is-warning {
  color: var(--cm-warning);
}

.bkp__pied :deep(svg) {
  flex-shrink: 0;
  margin-top: 3px;
}

.bkp__bloc {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bkp__ligne {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
  /* Les chemins (OneDrive, clé USB) sont longs : ils passent à la ligne au lieu de déborder. */
  overflow-wrap: anywhere;
}

.bkp__ligne strong {
  color: var(--cm-text-primary);
}

.bkp__ligne .cm-chip {
  margin-left: 6px;
}

/* Le choix de la destination : barre segmentée, même dessin que TabbedView
   (fond discret, l'option active en relief couleur de section). */
.bkp__choix {
  display: inline-flex;
  flex-wrap: wrap;
  align-self: flex-start;
  gap: 3px;
  max-width: 100%;
  margin-top: 4px;
  padding: 4px;
  border-radius: 999px;
  border: 1px solid var(--cm-border-soft);
  background: rgb(var(--cm-glass-tint) / var(--cm-glass-alpha-1));
}

.bkp__choix-btn {
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

.bkp__choix-btn:hover:not(:disabled) {
  background: rgb(var(--cm-glass-tint) / var(--cm-glass-alpha-2));
  color: var(--cm-text-primary);
}

.bkp__choix-btn.is-active,
.bkp__choix-btn.is-active:hover:not(:disabled) {
  background: var(--cm-section);
  color: var(--cm-section-on);
  box-shadow: 0 4px 14px rgba(var(--cm-section-rgb) / 0.3);
}

.bkp__choix-btn:disabled {
  cursor: default;
  opacity: 0.6;
}

.bkp__chemin {
  align-items: flex-end;
}

.bkp__champ {
  flex: 1 1 320px;
}

.bkp__faits {
  margin: 4px 0 6px;
  padding-left: 18px;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
  overflow-wrap: anywhere;
}

.bkp__probleme {
  color: var(--cm-warning);
}

.bkp__message {
  display: inline;
}

.bkp__bascule {
  align-self: flex-start;
}

.bkp__lien {
  align-self: flex-start;
  text-align: left;
}

.bkp__chevron {
  transition: transform var(--cm-transition);
}

.bkp__chevron.is-open {
  transform: rotate(90deg);
}

@container bkp (max-width: 560px) {
  .bkp__actions {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
