/**
 * La page « Feuille de route » SE RENDE avec les vraies données du serveur (étape 5 du plan).
 *   node --test test/feuilleDeRouteEcran.test.mjs        (depuis server/)
 *
 * interface.test.mjs prouve que tout COMPILE et se construit ; ceci prouve que le gabarit
 * S'EXÉCUTE : un rendu côté serveur (sans navigateur, sans serveur de développement) des
 * composants de la page avec l'état réel de feuilleDeRoute.js, pour attraper ce qu'une
 * compilation laisse passer — une propriété lue sur une valeur absente, un composant mal
 * branché, un texte qui ne s'affiche plus.
 *
 * Aucun réseau ni aucun fichier de l'appli : fetch est REMPLACÉ (l'état de la page, des
 * sauvegardes, fabriqués ici), un serveur Vite en mode « middleware » n'écoute sur aucun
 * port, son cache va dans le dossier d'essais (effacé ensuite), et rien n'est écrit dans ui/.
 * Seule bidouille : dans le rendu, `onMounted` devient `onServerPrefetch` pour que le rendu
 * attende le chargement (le code de l'appli n'est pas modifié).
 *
 *  1. La page : bandeau, avancement, ligne « Tests », sauvegardes en variante COURTE,
 *     les 9 lots dont seuls ceux de la semaine sont ouverts.
 *  2. Les 49 étapes : état, réglage, semaine, « pas encore mesuré », note ; fichier de
 *     notes illisible : écriture désactivée, lecture gardée.
 *  3. Le menu : routeur, barre latérale, barre du haut, couleur de section, icônes.
 *  4. La carte des sauvegardes de Réglages n'a rien perdu (variante complète intacte).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SERVEUR, RACINE_ESSAIS } from './aides/isolement.mjs';
import { etatFeuilleDeRoute } from '../src/data/roadmap/feuilleDeRoute.js';
import { etatPourFeuilleDeRoute } from '../src/bench/trialsRegistry.js';
import { HISTORIQUE } from '../src/data/roadmap/historique.js';
import { ETAPES, LOTS } from '../src/data/roadmap/plan.js';

// Ce qui est terminé, CALCULÉ à partir de l'historique du code (étape 7 du plan) : une étape
// suivante ajoute sa ligne à HISTORIQUE, et aucun compte de ce fichier n'est à retoucher.
// Étape 27 (21/10/2026) : une ligne PARTIELLE ne finit pas l'étape (la 27 : en essai à blanc, adoption à venir) —
// l'étape est « en cours », et son lot s'ouvre au premier affichage comme tout lot où l'on travaille.
const TERMINEES = new Set(HISTORIQUE.filter((h) => !h.partielle).map((h) => h.etape));
const NB = TERMINEES.size;
const PARTIELLES = new Set(HISTORIQUE.filter((h) => h.partielle && !TERMINEES.has(h.etape)).map((h) => h.etape));
const NB_PARTIELLES = PARTIELLES.size;
/** Les étapes rendues au premier affichage quand les lots `numeros` sont ouverts, plus ceux d'une étape en cours par l'historique. */
const rendues = (numeros) => {
  const ouverts = new Set([...numeros, ...ETAPES.filter((e) => PARTIELLES.has(e.id)).map((e) => e.lot)]);
  return ETAPES.filter((e) => ouverts.has(e.lot)).sort((a, b) => a.lot - b.lot).map((e) => e.id);
};
/** Les notes du scénario mettent la 11 de côté (la 9, qui l'était avant le 06/10/2026, est terminée) : tant qu'elle n'est pas terminée (terminée prime). */
const MISES_DE_COTE = ['11'].filter((id) => !TERMINEES.has(id));
const accord = (n, singulier, pluriel) => `${n} ${n === 1 ? singulier : pluriel}`;
/** Le pourcentage tel que la page l'écrit (une décimale, virgule). */
const pourcentDit = (n) => `${(Math.round((n / 49) * 1000) / 10).toLocaleString('fr-FR')} %`;
const jourComplet = (j) => new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${j}T12:00:00`));
const echapper = (texte) => texte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Les étapes d'un lot, prévues dans une semaine du plan, encore à faire (ni terminées ni mises de côté). */
const aFaireCetteSemaine = (numeroLot, semaine) =>
  ETAPES.filter((e) => e.lot === numeroLot && semaine >= e.semaine && semaine <= (e.semaineFin ?? e.semaine) && !TERMINEES.has(e.id) && !MISES_DE_COTE.includes(e.id)).length;

const UI = path.resolve(SERVEUR, '..', 'ui');
const pret = ['vite', '@vitejs/plugin-vue', 'vue'].every((p) => fs.existsSync(path.join(UI, 'node_modules', p)));
const imp = (chemin) => import(pathToFileURL(chemin).href);

const MAINTENANT = Date.parse('2026-10-06T10:00:00Z');
const NOTES = {
  source: 'enregistre',
  fichier: 'C:\\essai\\roadmap.json',
  probleme: null,
  majLe: '2026-10-06T08:00:00.000Z',
  etapes: {
    5: { note: 'Relire cette page avec Pierre.\nLe lot 1 est prêt pour son bilan.', noteLe: '2026-10-06T08:00:00.000Z', miseDeCote: null },
    11: { note: null, noteLe: null, miseDeCote: { le: '2026-10-06T08:00:00.000Z', raison: 'plus tard' } },
    12: { note: 'Vérifier les fichiers football-data.', noteLe: '2026-10-06T07:00:00.000Z', miseDeCote: null },
    99: { note: 'Une note orpheline.', noteLe: null, miseDeCote: null }
  }
};
// Le registre de la mesure : jamais celui de data/runtime (celui de Pierre, dans le dépôt) — un chemin d'essai qui n'existe pas, lu seulement.
const MESURE_ABSENTE = etatPourFeuilleDeRoute({ fichier: path.join(RACINE_ESSAIS, `cm-registre-absent-${process.pid}.json`) });
assert.equal(MESURE_ABSENTE.source, 'absent');
// Étape 16 : un registre de forme inattendue (illisible), écrit au moment du scénario dans le dossier d'essais, effacé à la fin.
const REGISTRE_ILLISIBLE = path.join(RACINE_ESSAIS, `cm-registre-illisible-${process.pid}.json`);
const SCENARIOS = {
  // L'état du jour : 7 terminées, rien en cours, deux notes, une mise de côté, une note orpheline.
  jour: () => etatFeuilleDeRoute({ maintenant: MAINTENANT, pierre: NOTES, mesure: MESURE_ABSENTE }),
  // Une étape en cours et le bilan du lot 1 fait.
  enCours: () =>
    etatFeuilleDeRoute({
      maintenant: Date.parse('2026-10-13T10:00:00Z'),
      enCours: ['6'],
      bilans: { 1: { fait: '2026-10-12', garder: ['Toutes les étapes'], sauter: [], reordonner: ['La 14 après la 15'], texte: 'Le lot 1 est gardé tel quel.' } },
      pierre: NOTES,
      mesure: MESURE_ABSENTE
    }),
  // Le fichier des notes ne se lit pas.
  illisible: () => etatFeuilleDeRoute({ maintenant: MAINTENANT, pierre: { source: 'illisible', fichier: 'C:\\essai\\roadmap.json', probleme: 'roadmap.json illisible (Unexpected end of JSON input)', majLe: null, etapes: {} }, mesure: MESURE_ABSENTE }),
  // Tout est à faire, aucun test noté.
  vide: () => etatFeuilleDeRoute({ maintenant: MAINTENANT, historique: [], pierre: { source: 'absent', fichier: 'C:\\essai\\roadmap.json', probleme: null, majLe: null, etapes: {} }, mesure: MESURE_ABSENTE }),
  // Les 12 semaines sont passées.
  horsPlan: () => etatFeuilleDeRoute({ maintenant: Date.parse('2027-01-10T10:00:00Z'), pierre: { source: 'absent', fichier: 'C:\\essai\\roadmap.json', probleme: null, majLe: null, etapes: {} }, mesure: MESURE_ABSENTE }),
  // Étape 16 : le registre de la mesure ne se lit pas (lu par le vrai serveur sur un fichier d'essai).
  registreIllisible: () => {
    fs.mkdirSync(RACINE_ESSAIS, { recursive: true });
    fs.writeFileSync(REGISTRE_ILLISIBLE, '[]');
    return etatFeuilleDeRoute({ maintenant: MAINTENANT, pierre: NOTES, mesure: etatPourFeuilleDeRoute({ fichier: REGISTRE_ILLISIBLE }) });
  },
  // Étape 16 : un registre tenu, trois jugements rangés (état fabriqué, à la forme de etatPourFeuilleDeRoute).
  registreTenu: () =>
    etatFeuilleDeRoute({
      maintenant: MAINTENANT,
      pierre: NOTES,
      mesure: { source: 'enregistre', fichier: 'C:\\essai\\registre-mesure.json', probleme: null, majLe: '2026-11-25T02:10:00.000Z', nombre: 3, etapes: {} }
    }),
  // Étape 16 : la réponse d'un serveur d'avant l'étape (pas encore relancé après la recopie), sans registre ni provenance du registre.
  ancienServeur: () => {
    const { mesureRegistre, provenance, ...reste } = etatFeuilleDeRoute({ maintenant: MAINTENANT, pierre: NOTES, mesure: MESURE_ABSENTE });
    const { registre, ...provenanceAncienne } = provenance;
    return { ...reste, provenance: provenanceAncienne, lots: reste.lots.map((l) => ({ ...l, etapes: l.etapes.map(({ mesure, ...e }) => e) })) };
  }
};

/** Un état de /api/backups complet (les deux variantes de la carte y lisent). */
const SAUVEGARDES = {
  alertes: [{ code: 'hors-disque-absente', niveau: 'warning', texte: 'La copie hors disque n’est pas encore faite.' }],
  enCours: false,
  derniereReussie: { fin: '2026-10-06T01:10:00.000Z', octets: 339_000_000, octetsBase: 1_684_000_000, dureeMs: 120_000 },
  derniere: { ok: true, fin: '2026-10-06T01:10:00.000Z' },
  compte: { jeux: 1, quotidiennes: 1, hebdomadaires: 1, mensuelles: 1 },
  politique: { quotidiennes: 7, hebdomadaires: 4, mensuelles: 12 },
  copies: [
    { jour: '2026-10-06', raisons: ['quotidienne', 'hebdomadaire', 'mensuelle'], octets: 340_000_000, octetsBase: 1_684_000_000, rencontres: 60200, derniereDate: '2026-10-05', fichiers: { base: { nom: 'cotemaster-2026-10-06.db.gz', octets: 339_000_000 }, donnees: { nom: 'cotemaster-2026-10-06.donnees.zip', octets: 1_000_000 } } }
  ],
  incomplets: [],
  manuelles: [],
  octetsAuto: 340_000_000,
  octetsManuelles: 0,
  base: { octets: 1_684_000_000, journalOctets: 0 },
  dossier: 'C:\\Users\\PC\\CoteMaster\\sauvegardes',
  dossierPresent: true,
  fichiersEtat: { sauvegarde: 'backup-status.json', restauration: 'restore-status.json' },
  etatPrepareLe: '2026-10-06T01:11:00.000Z',
  genereLe: '2026-10-06T10:00:00.000Z',
  restauration: {
    derniere: { saine: true, rencontres: 60200, attendues: 60200, derniereDate: '2026-10-05', fin: '2026-10-06T01:20:00.000Z', controle: 'quick_check', sauvegarde: { jour: '2026-10-06' }, durees: { totalMs: 42_000 } },
    historique: [],
    prochaine: '2026-10-13',
    dernierControleComplet: null,
    prochainControleComplet: '2026-11-03',
    majLe: '2026-10-06T01:20:00.000Z'
  },
  horsDisque: { reglage: 'configuree', type: 'onedrive', source: 'defaut-onedrive', destination: 'C:\\Users\\PC\\OneDrive\\CoteMaster-sauvegardes', presente: false, derniereReussie: null, derniereTentative: null, garder: 1, garderDossier: 2, onedrive: { detecte: true, racine: 'C:\\Users\\PC\\OneDrive', variable: 'OneDriveConsumer' }, prochaine: null, verification: null },
  disque: { libre: 75_000_000_000, requis: 5_000_000_000, niveau: 'ok' }
};

let contexte;
const avertissements = [];

before(async () => {
  if (!pret) return;
  const { createServer } = await imp(path.join(UI, 'node_modules', 'vite', 'dist', 'node', 'index.js'));
  const vuePlugin = (await imp(path.join(UI, 'node_modules', '@vitejs', 'plugin-vue', 'dist', 'index.mjs'))).default;
  const { renderToString } = await imp(path.join(UI, 'node_modules', 'vue', 'server-renderer', 'index.mjs'));
  const { createSSRApp, h } = await imp(path.join(UI, 'node_modules', 'vue', 'index.mjs'));

  let courant = SCENARIOS.jour();
  const reponse = (url) => {
    if (/\/api\/roadmap$/.test(url)) return courant;
    if (/\/api\/backups$/.test(url)) return SAUVEGARDES;
    throw new Error(`fetch interdit dans ce rendu : ${url}`);
  };
  globalThis.fetch = async (url) => {
    const corps = reponse(String(url));
    return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => JSON.parse(JSON.stringify(corps)) };
  };
  console.warn = (...a) => avertissements.push(a.map(String).join(' ').slice(0, 300));

  // Le rendu attend le chargement : onMounted ne s'exécute pas côté serveur, onServerPrefetch si.
  const prefetch = {
    name: 'ssr-prefetch',
    enforce: 'pre',
    transform(code, id) {
      if (!/(RoadmapView|BackupStatusPanel)\.vue$/.test(id) || id.includes('?')) return null;
      return code.replace(/import \{ ([^}]*)\bonMounted\b([^}]*)\} from 'vue';/, (m, a, b) => `import { ${a}onMounted, onServerPrefetch${b}} from 'vue';`).replace(/onMounted\(/g, 'onServerPrefetch(');
    }
  };
  fs.mkdirSync(RACINE_ESSAIS, { recursive: true });
  const cache = fs.mkdtempSync(path.join(RACINE_ESSAIS, 'cm-rendu-'));
  const vite = await createServer({
    configFile: false,
    root: UI,
    logLevel: 'error',
    appType: 'custom',
    cacheDir: cache,
    server: { middlewareMode: true, watch: null, hmr: false },
    plugins: [prefetch, vuePlugin()],
    resolve: { alias: { '@': path.join(UI, 'src') } }
  });
  const composants = {
    Vue: (await vite.ssrLoadModule('/src/views/RoadmapView.vue')).default,
    Lot: (await vite.ssrLoadModule('/src/components/roadmap/RoadmapLot.vue')).default,
    Sauvegardes: (await vite.ssrLoadModule('/src/components/settings/BackupStatusPanel.vue')).default
  };
  const application = (composant, props) => {
    const app = createSSRApp(composant, props);
    // Le routeur n'est pas installé : RouterLink est remplacé par un simple lien.
    app.component('RouterLink', { props: ['to'], setup: (p, { slots }) => () => h('a', { href: p.to, class: 'router-link' }, slots.default?.()) });
    return app;
  };
  contexte = {
    vite,
    cache,
    /** La page entière avec l'état du scénario : { html, texte, avertissements }. */
    async page(nom) {
      courant = SCENARIOS[nom]();
      const avant = avertissements.length;
      const html = await renderToString(application(composants.Vue));
      return { html, texte: texteDe(html), avertissements: avertissements.slice(avant), etat: courant };
    },
    /** Un lot, ouvert ou non, avec les réglages de la page. */
    async lot(etat, numero, props = {}) {
      const avant = avertissements.length;
      const html = await renderToString(application(composants.Lot, { lot: etat.lots[numero - 1], reglages: etat.reglages, longueurMax: 4000, notesEcrivables: true, semaineCourante: 1, ouvert: true, ...props }));
      return { html, texte: texteDe(html), avertissements: avertissements.slice(avant) };
    },
    /** La carte des sauvegardes, dans sa variante. */
    async sauvegardes(props) {
      const avant = avertissements.length;
      const html = await renderToString(application(composants.Sauvegardes, props));
      return { html, texte: texteDe(html), avertissements: avertissements.slice(avant) };
    }
  };
});

after(async () => {
  fs.rmSync(REGISTRE_ILLISIBLE, { force: true });
  if (!contexte) return;
  await contexte.vite.close();
  // Le dossier de cache ne contient aucun lien : suppression sans danger.
  fs.rmSync(contexte.cache, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

/** Un instant tel que l'interface l'écrit (formatDateTime) : le fuseau de la machine ne change pas le test. */
const horodatage = (iso) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

/** Le texte visible d'un rendu : balises retirées, entités décodées, espaces unifiés. */
const texteDe = (html) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ');
const compter = (texte, motif) => (texte.match(motif) ?? []).length;
const options = { skip: pret ? false : 'ui/node_modules (vite, plugin-vue, vue) manque' };

// ------------------------------------------------------------- 1. la page

test('page : bandeau, avancement général, ligne « Tests », sauvegardes en variante courte, 9 lots — sans aucun avertissement de Vue', options, async () => {
  const { texte, avertissements: avert, etat } = await contexte.page('jour');
  assert.deepEqual(avert, [], 'avertissements de Vue pendant le rendu');
  assert.match(texte, /Feuille de route/);
  assert.match(texte, /Semaine 1 sur 12 · 05\/10 → 11\/10/);
  assert.ok(texte.includes(`${NB} / 49 étapes terminées`), `${NB} / 49 étapes terminées`);
  assert.ok(texte.includes(`${accord(NB, 'étape', 'étapes')} sur 49 ${NB === 1 ? 'terminée' : 'terminées'} (${pourcentDit(NB)})`), 'l’avancement en pourcentage');
  // Les quatre états, toujours dits.
  assert.ok(texte.includes(accord(NB, 'terminée', 'terminées')));
  assert.ok(texte.includes(`${NB_PARTIELLES} en cours`), `${NB_PARTIELLES} en cours`);
  assert.ok(texte.includes(accord(MISES_DE_COTE.length, 'mise de côté', 'mises de côté')));
  assert.ok(texte.includes(`${49 - NB - NB_PARTIELLES - MISES_DE_COTE.length} à faire`));
  // La ligne « Tests » : celle de l'historique du code.
  const t = etat.tests;
  assert.match(texte, new RegExp(`Tests : ${t.reussis} réussis \\+ ${t.todo} constats à suivre \\(non bloquants\\), aucun échec — dernier passage le ${echapper(jourComplet(t.le))}, à la fin de l’étape ${t.etape}`));
  // Les 9 lots, dans l'ordre.
  const lots = [...texte.matchAll(/Lot (\d) — ([^0-9]*?) (?=\d+ étapes?)/g)].map((m) => `${m[1]}:${m[2].trim()}`);
  assert.deepEqual(lots, ['1:Sécurité', '2:Design des paris', '3:Données', '4:Mesure', '5:Cœur : les buts', '6:Reste du match et décision', '7:IA', '8:Direct', '9:Recette']);
  assert.match(texte, /Les 9 lots/);
  // Les sauvegardes : la version COURTE (chiffres clés, alerte, lien) — pas le détail de Réglages.
  assert.match(texte, /Dernière sauvegarde/);
  assert.match(texte, /Restauration d'essai/);
  assert.match(texte, /La copie hors disque n’est pas encore faite/);
  assert.match(texte, /dans Réglages/);
  assert.doesNotMatch(texte, /Copies automatiques gardées|Entretien|Comment ça marche/, 'la version courte ne montre pas le détail');
  // Le budget Claude : le composant existant, sa carte (il se charge lui-même côté navigateur).
  assert.match(texte, /Budget Claude/);
  // La provenance réelle.
  assert.match(texte, /D’où viennent ces données/);
  assert.match(texte, /roadmap[\\/]plan\.js/);
  assert.match(texte, /roadmap[\\/]historique\.js/);
  assert.ok(texte.includes(`Vos notes : C:\\essai\\roadmap.json — 2 notes, dernier enregistrement le ${horodatage(NOTES.majLe)}.`), 'provenance des notes : fichier lu, nombre, dernier enregistrement');
  // Une note rangée sous une étape qui n'existe pas est dite, jamais cachée.
  assert.match(texte, /Notes rangées sous une étape qui n’est plus dans le plan/);
  assert.match(texte, /Étape « 99 » : Une note orpheline\./);
});

test('page : seuls les lots où l’on travaille cette semaine sont ouverts ; ceux d’une autre semaine restent repliés (leurs étapes ne sont pas rendues)', options, async () => {
  // Semaine 1 : le lot 1 (toutes ses étapes sont de la semaine 1) ; rien d'autre.
  const jour = await contexte.page('jour');
  assert.equal(compter(jour.html, /data-etape="/g), rendues([1]).length, 'le lot 1 (et celui d’une étape en cours par l’historique : la 27)');
  assert.deepEqual([...jour.html.matchAll(/data-etape="([^"]+)"/g)].map((m) => m[1]), rendues([1]));
  assert.deepEqual(rendues([1]).slice(0, 7), ['0', '1', '2', '3', '4', '5', 'E']);
  // Semaine 2 (la 6 dite « en cours » — terminée depuis, terminée l'emporte) : le lot 2 (étapes de la semaine 2) et le lot 7 (la 41) s'ouvrent, pas le lot 1.
  const deux = await contexte.page('enCours');
  const rendu = [...deux.html.matchAll(/data-etape="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(rendu, rendues([2, 7]));
  for (const id of ['6', '7', '8', '9', '10', '11', '41', '42', '43', '44', '45']) assert.ok(rendu.includes(id), `étape ${id}`);
  assert.match(deux.texte, /Lot 1 — Sécurité 7 étapes · semaine 1 Lot terminé 7 \/ 7/);
  // Hors du plan : la page le dit, et ouvre le lot d'une étape en cours (la 27, par l'historique) — à défaut, le premier lot pas fini.
  const hors = await contexte.page('horsPlan');
  assert.deepEqual(hors.avertissements, []);
  assert.match(hors.texte, /Les 12 semaines du plan sont passées/);
  const premierLotPasFini = LOTS.find((l) => !ETAPES.filter((e) => e.lot === l.numero).every((e) => TERMINEES.has(e.id)));
  const lotOuvert = NB_PARTIELLES ? Math.min(...ETAPES.filter((e) => PARTIELLES.has(e.id)).map((e) => e.lot)) : premierLotPasFini.numero;
  assert.deepEqual(
    [...new Set([...hors.html.matchAll(/data-etape="([^"]+)"/g)].map((m) => m[1]))].slice(0, 3),
    ETAPES.filter((e) => e.lot === lotOuvert).slice(0, 3).map((e) => e.id)
  );
  // Rien de fait, aucun test noté : la page le dit.
  const vide = await contexte.page('vide');
  assert.deepEqual(vide.avertissements, []);
  assert.match(vide.texte, /Tests : aucun passage noté dans l’historique/);
  assert.match(vide.texte, /0 \/ 49 étapes terminées/);
  assert.match(vide.texte, /0 étape sur 49 terminée \(0 %\)/);
});

// ----------------------------------------------------------- 2. les étapes

test('étapes : les 49, avec leur état, leur réglage, leur semaine prévue, « pas encore mesuré » et leur note — dans leur lot, sans avertissement', options, async () => {
  const { etat } = await contexte.page('jour');
  let total = 0;
  const parEtat = {};
  for (const lot of etat.lots) {
    const { html, texte, avertissements: avert } = await contexte.lot(etat, lot.numero);
    assert.deepEqual(avert, [], `lot ${lot.numero}`);
    total += compter(html, /data-etape="/g);
    assert.match(texte, new RegExp(`Lot ${lot.numero} — ${lot.nom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.match(texte, /Objectif du lot/);
    assert.ok(texte.includes(lot.objectif.replace(/\s+/g, ' ')), `lot ${lot.numero} : son objectif chiffré`);
    assert.match(texte, /Bilan de fin de lot/);
    for (const e of lot.etapes) {
      assert.ok(texte.includes(e.nom), `étape ${e.id} : son nom exact « ${e.nom} »`);
      parEtat[e.etat] = (parEtat[e.etat] ?? 0) + 1;
    }
    // Les durées et semaines de chaque étape du lot.
    assert.equal(compter(texte, /Semaine prévue/g), lot.etapes.length, `lot ${lot.numero} : une semaine prévue par étape`);
    assert.equal(compter(texte, /Date de fin/g), lot.etapes.length);
    assert.equal(compter(texte, /Gain mesuré/g), lot.etapes.length);
    assert.equal(compter(texte, /Note de Pierre/g), lot.etapes.length);
  }
  assert.equal(total, 49);
  const attendu = Object.fromEntries(Object.entries({ terminee: NB, 'mise-de-cote': MISES_DE_COTE.length, 'a-faire': 49 - NB - NB_PARTIELLES - MISES_DE_COTE.length, 'en-cours': NB_PARTIELLES }).filter(([, n]) => n > 0));
  assert.deepEqual(parEtat, attendu);
});

test('étapes : « pas encore mesuré » et « pas encore terminée » partout où rien n’est mesuré ni fini ; les terminées ont leur date et leurs mesures', options, async () => {
  const { etat } = await contexte.page('jour');
  const lot1 = await contexte.lot(etat, 1);
  assert.equal(compter(lot1.texte, /pas encore mesuré/g), 0, 'le lot 1 est entièrement mesuré');
  assert.match(lot1.texte, /05\/10\/2026 · ~22 h 10/, 'date de fin de la 1 : celle de son complément');
  assert.match(lot1.texte, /06\/10\/2026 · ~0 h 15/, 'date de fin de la 4');
  assert.match(lot1.texte, /Complément : copie hors disque sur OneDrive ou sur une clé USB/);
  assert.match(lot1.texte, /Terminée/);
  assert.equal(compter(lot1.texte, /Terminée/g), 7);
  // Le lot 2 : ses étapes pas encore terminées (dont la 11, mise de côté) — rien de mesuré, rien de fini, et la structure est complète ;
  // ses étapes terminées (la 6 et la 7 depuis le 06/10/2026), leur date et leurs mesures.
  const lot2 = await contexte.lot(etat, 2);
  const pasFaites = ETAPES.filter((e) => e.lot === 2 && !TERMINEES.has(e.id)).map((e) => e.id);
  assert.equal(compter(lot2.texte, /pas encore mesuré/g), pasFaites.length);
  assert.equal(compter(lot2.texte, /pas encore terminée|mise de côté, pas terminée/g), pasFaites.length);
  assert.equal(compter(lot2.texte, /Rien n’a encore changé/g), pasFaites.length);
  assert.equal(compter(lot2.texte, /À faire/g), pasFaites.filter((id) => !MISES_DE_COTE.includes(id)).length);
  assert.equal(compter(lot2.texte, /Mise de côté/g), MISES_DE_COTE.filter((id) => pasFaites.includes(id)).length);
  assert.equal(compter(lot2.texte, /Terminée/g), 6 - pasFaites.length);
  // Les réglages sont nommés (la lettre et son nom), les semaines et durées aussi.
  assert.match(lot2.texte, /Réglage S Sonnet 5\.5/);
  assert.match(lot2.texte, /Réglage C Opus 5\.5 effort high/);
  assert.match(lot2.texte, /Semaine 2 dès le 12\/10/);
  assert.match(lot2.texte, /Durée prévue 6-8 h/);
  assert.match(lot2.texte, /Après la 7 et avant la 10/);
  const lot5 = await contexte.lot(etat, 5);
  assert.match(lot5.texte, /Semaines 4 à 5 dès le 26\/10/, 'la 25 court sur deux semaines');
  assert.match(lot5.texte, /Réglage A Fable 5\.1 \+ ultracode/);
});

test('étapes : la pastille « cette semaine » — seulement pour une étape à faire ou en cours, prévue dans la semaine du plan où l’on est', options, async () => {
  const { etat } = await contexte.page('jour');
  // Semaine 1 : le lot 2 n'est pas encore à l'ordre du jour ; le lot 1 est entièrement terminé.
  assert.equal(compter((await contexte.lot(etat, 2, { semaineCourante: 1 })).texte, /cette semaine/g), 0);
  assert.equal(compter((await contexte.lot(etat, 1, { semaineCourante: 1 })).texte, /cette semaine/g), 0, 'une étape terminée n’est plus « cette semaine »');
  // Semaine 2 : les étapes à faire du lot 2 (ni terminées, ni la 11, mise de côté) ; la 25, qui court des semaines 4 à 5, l'est en semaine 5.
  assert.equal(compter((await contexte.lot(etat, 2, { semaineCourante: 2 })).texte, /cette semaine/g), aFaireCetteSemaine(2, 2));
  assert.ok(aFaireCetteSemaine(2, 2) < 5, 'la 6 et la 7, terminées, ne sont plus « cette semaine »');
  assert.equal(compter((await contexte.lot(etat, 5, { semaineCourante: 4 })).texte, /cette semaine/g), aFaireCetteSemaine(5, 4));
  assert.equal(compter((await contexte.lot(etat, 5, { semaineCourante: 5 })).texte, /cette semaine/g), aFaireCetteSemaine(5, 5));
  assert.equal(compter((await contexte.lot(etat, 5, { semaineCourante: 6 })).texte, /cette semaine/g), aFaireCetteSemaine(5, 6), 'semaine 6 : les 27 et 28');
  assert.equal(compter((await contexte.lot(etat, 5, { semaineCourante: 0 })).texte, /cette semaine/g), 0, 'hors du plan');
});

test('étapes : une note de Pierre s’affiche, « Modifier la note » ; sans note, « Écrire une note » ; le bilan de lot fait remplace la place vide', options, async () => {
  const { etat } = await contexte.page('jour');
  const lot1 = await contexte.lot(etat, 1);
  assert.match(lot1.texte, /Relire cette page avec Pierre\. Le lot 1 est prêt pour son bilan\./);
  assert.ok(lot1.texte.includes(`enregistrée le ${horodatage(NOTES.etapes[5].noteLe)}`), 'la date de la note, comme l’interface l’écrit');
  assert.equal(compter(lot1.texte, /Modifier la note/g), 1);
  assert.equal(compter(lot1.texte, /Écrire une note/g), 6);
  assert.match(lot1.texte, /Le lot est terminé : son bilan reste à faire avec Pierre/);
  const { etat: avecBilan } = await contexte.page('enCours');
  const bilan = await contexte.lot(avecBilan, 1);
  assert.match(bilan.texte, /Bilan de fin de lot · fait le 12\/10 Le lot 1 est gardé tel quel\. On garde : Toutes les étapes On saute : rien On réordonne : La 14 après la 15/);
  assert.doesNotMatch(bilan.texte, /son bilan reste à faire/);
  // Un lot replié ne rend aucune étape.
  const replie = await contexte.lot(etat, 4, { ouvert: false });
  assert.equal(compter(replie.html, /data-etape="/g), 0);
  // Étape 23 (22/10/2026) : le lot 4 est complet (9 / 9), la puce « Lot terminé » s'affiche avant le compte.
  const finiesDuLot4 = ETAPES.filter((e) => e.lot === 4 && TERMINEES.has(e.id)).length;
  assert.match(replie.texte, new RegExp(`Lot 4 — Mesure 9 étapes · semaines 3 à 6 ${finiesDuLot4 === 9 ? 'Lot terminé ' : ''}${finiesDuLot4} \\/ 9`));
});

test('fichier des notes illisible : la page le dit, garde le plan, et désactive l’écriture de chaque note', options, async () => {
  const page = await contexte.page('illisible');
  assert.deepEqual(page.avertissements, []);
  assert.match(page.texte, /Vos notes ne peuvent pas être lues/);
  assert.match(page.texte, /Le fichier C:\\essai\\roadmap\.json est illisible : roadmap\.json illisible \(Unexpected end of JSON input\)/);
  assert.match(page.texte, /Vos notes ne sont pas perdues et rien n’y est écrit tant qu’il est illisible/);
  assert.match(page.texte, /Vos notes : C:\\essai\\roadmap\.json — illisible pour l’instant/);
  assert.ok(page.texte.includes(`${NB} / 49 étapes terminées`), 'le plan et l’historique restent affichés');
  const lot = await contexte.lot(page.etat, 1, { notesEcrivables: false });
  assert.equal(compter(lot.html, /<button[^>]*\bdisabled\b[^>]*>(?:(?!<\/button>)[\s\S])*?Écrire une note/g), 7, 'les 7 boutons d’écriture sont désactivés');
  const normal = await contexte.lot(page.etat, 1, { notesEcrivables: true });
  assert.equal(compter(normal.html, /<button[^>]*\bdisabled\b[^>]*>(?:(?!<\/button>)[\s\S])*?Écrire une note/g), 0);
});

test('pied de page (étape 16) : le registre de la mesure et son fichier — « pas encore de fichier » s’il est absent, « illisible » s’il ne se lit pas, ses jugements sinon ; la page reste entière', options, async () => {
  const ligne = (fichier, fin) => `Preuve après lancement (dates de lancement, variantes essayées, jugements) : ${fichier} — ${fin}`;
  const absent = await contexte.page('jour');
  assert.deepEqual(absent.avertissements, []);
  assert.ok(absent.texte.includes(ligne(MESURE_ABSENTE.fichier, 'pas encore de fichier : il sera créé au premier démarrage de l’appli avec une version déclarée.')), 'registre absent');
  assert.match(absent.texte, /les notes et le registre de la mesure restent sur ce PC, dans les données de l’appli\./);
  const illisible = await contexte.page('registreIllisible');
  assert.deepEqual(illisible.avertissements, []);
  assert.equal(illisible.etat.mesureRegistre.source, 'illisible');
  assert.ok(illisible.texte.includes(ligne(REGISTRE_ILLISIBLE, 'illisible pour l’instant.')), 'registre illisible');
  assert.ok(illisible.texte.includes(`${NB} / 49 étapes terminées`), 'le plan et l’historique restent affichés');
  assert.ok(illisible.texte.includes(`Vos notes : C:\\essai\\roadmap.json — 2 notes, dernier enregistrement le ${horodatage(NOTES.majLe)}.`), 'les notes aussi');
  const tenu = await contexte.page('registreTenu');
  assert.deepEqual(tenu.avertissements, []);
  assert.ok(tenu.texte.includes(ligne('C:\\essai\\registre-mesure.json', `3 jugements, dernier enregistrement le ${horodatage('2026-11-25T02:10:00.000Z')}.`)), 'registre tenu (3 jugements, 2 notes)');
  // Un serveur pas encore relancé après la recopie ne renvoie pas le registre : pas de ligne, la page reste entière.
  const ancien = await contexte.page('ancienServeur');
  assert.deepEqual(ancien.avertissements, []);
  assert.doesNotMatch(ancien.texte, /Preuve après lancement \(dates de lancement/);
  assert.match(ancien.texte, /D’où viennent ces données/);
});

// ---------------------------------------------- 3. le menu et les couleurs

test('menu : la page est déclarée dans le routeur, la barre latérale (entre Historique moteur et Réglages), la barre du haut et les couleurs de section', () => {
  const lire = (...chemin) => fs.readFileSync(path.join(UI, 'src', ...chemin), 'utf8');
  const routeur = lire('router', 'index.js');
  assert.match(routeur, /path: '\/feuille-de-route',\s*name: 'roadmap',\s*component: \(\) => import\('@\/views\/RoadmapView\.vue'\),\s*meta: \{ title: 'Feuille de route', section: 'roadmap' \}/);
  const lateral = lire('components', 'layout', 'AppSidebar.vue');
  assert.match(lateral, /\{ to: '\/feuille-de-route', section: 'roadmap', label: 'Feuille de route', hint: '[^']+', icon: 'flag' \}/);
  const [historique, feuille, reglages] = ["to: '/historique-moteur'", "to: '/feuille-de-route'", "to: '/reglages'"].map((m) => lateral.indexOf(m));
  assert.ok(historique > 0 && historique < feuille && feuille < reglages, 'Feuille de route entre Historique moteur et Réglages');
  assert.match(lire('components', 'layout', 'AppTopbar.vue'), /roadmap: 'Feuille de route'/);
  // La couleur de section : les sept jetons du bloc — dont les trois dérivés, que :root calcule en émeraude sinon.
  const bloc = /\[data-section='roadmap'\]\s*\{([^}]*)\}/.exec(lire('assets', 'styles', 'tokens.css'))?.[1] ?? '';
  for (const jeton of ['--cm-section', '--cm-section-rgb', '--cm-section-soft', '--cm-section-glow', '--cm-shadow-section', '--cm-section-glow-2', '--cm-section-on']) {
    assert.match(bloc, new RegExp(`${jeton}:`), `bloc [data-section='roadmap'] : ${jeton}`);
  }
  assert.match(bloc, /--cm-section-soft: rgba\(var\(--cm-section-rgb\)/);
  // Chaque icône nommée par la page existe dans AppIcon (un nom inconnu s'affiche vide, sans erreur).
  const connues = new Set([...lire('components', 'common', 'AppIcon.vue').matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]));
  assert.ok(connues.has('flag') && connues.has('chevronRight') && connues.size > 40);
  for (const fichier of [['views', 'RoadmapView.vue'], ['components', 'roadmap', 'RoadmapLot.vue'], ['components', 'roadmap', 'RoadmapStep.vue'], ['components', 'settings', 'BackupStatusPanel.vue']]) {
    const source = lire(...fichier);
    const noms = [...source.matchAll(/<AppIcon name="(\w+)"|\bicon="(\w+)"|\bicone: '(\w+)'/g)].map((m) => m[1] ?? m[2] ?? m[3]);
    assert.ok(noms.length > 0, fichier.join('/'));
    for (const nom of noms) assert.ok(connues.has(nom), `${fichier.join('/')} : l'icône « ${nom} » n'existe pas dans AppIcon`);
  }
});

// ------------------------------------------- 4. la carte des sauvegardes

test('carte des sauvegardes : la variante complète de Réglages n’a rien perdu, la courte ne montre que les chiffres clés et les alertes', options, async () => {
  const complete = await contexte.sauvegardes({});
  assert.deepEqual(complete.avertissements, []);
  for (const titre of ['Dernière sauvegarde', 'Copies gardées', 'Restauration d\'essai', 'Copie hors disque', 'Place libre', 'Copies automatiques gardées', 'Restaurations d\'essai', 'Copie hors du disque', 'Entretien', 'Comment ça marche']) {
    assert.ok(complete.texte.includes(titre), `variante complète : « ${titre} »`);
  }
  assert.doesNotMatch(complete.texte, /Détails \(copies gardées/, 'le lien vers Réglages n’est que dans la version courte');
  assert.match(complete.texte, /Relire/);
  const courte = await contexte.sauvegardes({ variante: 'compacte' });
  assert.deepEqual(courte.avertissements, []);
  for (const titre of ['Dernière sauvegarde', 'Copies gardées', 'Restauration d\'essai', 'Copie hors disque', 'Place libre', 'La copie hors disque n’est pas encore faite', 'dans Réglages']) {
    assert.ok(courte.texte.includes(titre), `variante courte : « ${titre} »`);
  }
  for (const absent of ['Copies automatiques gardées', 'Restaurations d\'essai', 'Copie hors du disque', 'Entretien', 'Comment ça marche', 'Relire']) {
    assert.ok(!courte.texte.includes(absent), `variante courte : pas « ${absent} »`);
  }
  assert.ok(courte.texte.length < complete.texte.length / 2, 'la version courte est bien plus courte');
});
