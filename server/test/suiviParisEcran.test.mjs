/**
 * Le SUIVI DES PARIS, les GARDE-FOUS et les COMPTES SE RENDENT (étape 11 du plan) — rendu côté serveur, sans
 * navigateur ni serveur de développement : `fetch` remplacé (tout appel hors liste refusé et compté), routeur de
 * l'appli remplacé par un faux, rien écrit dans ui/.
 *
 * La réponse du suivi n'est PAS écrite à la main : c'est `rapportDeSuivi` du serveur (data/suiviParis.js), calculé
 * ici sur un carnet FABRIQUÉ (anciens paris, « J'ai parié », 60 € perdus ce lundi) avec des garde-fous réglés.
 *
 *  1. Performance paris : les nouveaux blocs dans l'ordre (gagné face à l'attendu, valeur de clôture, résultats,
 *     pari par pari), puis ceux d'avant, intacts ; les chiffres clés, les trois courbes, la zone normale des
 *     séries, les cinq tableaux avec TOTAL (jamais un %) et MOYENNE, le carnet (30 lignes et la suite), l'alerte
 *     du garde-fou ; un carnet vide ; un serveur qui ne répond pas (la structure reste, sans valeurs).
 *  2. Réglages : les garde-fous (champs, état de la semaine, conseil suspendu, alertes, provenance ; aucun plafond
 *     par défaut), les fiches des comptes (trois champs, jamais d'identifiant ni de mot de passe), le coupe-circuit
 *     enclenché par un garde-fou (l'interrupteur manuel reste le sien).
 *  3. Le ticket : il SIGNALE (les phrases du serveur), « J'ai parié » reste actif.
 *  4. Hygiène des six composants, câblage des pages, aucun appel hors liste, aucun avertissement de Vue.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SERVEUR, RACINE_ESSAIS } from './aides/isolement.mjs';
import { rapportDeSuivi } from '../src/data/suiviParis.js';
import * as GF from '../src/core/risk/gardeFous.js';
import { gainAttenduDuPari } from '../src/data/repositories/betsRepository.js';

const UI = path.resolve(SERVEUR, '..', 'ui');
const pret = ['vite', '@vitejs/plugin-vue', 'vue', 'pinia', 'vue-router'].every((p) => fs.existsSync(path.join(UI, 'node_modules', p)));
const imp = (chemin) => import(pathToFileURL(chemin).href);
const options = { skip: pret ? false : 'ui/node_modules (vite, plugin-vue, vue, pinia, vue-router) manque' };
const MAINTENANT = Date.parse('2026-10-05T12:00:00Z');
const VOS = ['williamhill', 'sport888', 'betsson', 'nordicbet', 'unibet_nl', 'unibet_se', 'leovegas_se', 'tipico_de', 'coolbet', 'codere_it'];

// --------------------------------------------------------------- le carnet fabriqué

const jambe = (extra = {}) => ({ matchId: 'm', homeName: 'Arsenal', awayName: 'Chelsea', league: 'EPL', market: 'Résultat', pick: 'Arsenal gagne', odds: 2, marketId: 'result', params: { outcome: 'home' }, ...extra });
const pari = (id, { status, stake, odds, cree, regle = null, p = null, livre = null, ...reste }) => ({
  id,
  createdAt: cree,
  settledAt: regle,
  status,
  stake,
  odds,
  legs: [jambe({ odds, status, matchId: `m-${id}`, ...(p !== null ? { probabiliteMoteur: p } : {}), ...(livre ? { bookmaker: livre } : {}) })],
  ...(livre ? { bookmaker: livre, bookmakerTitle: livre === 'williamhill' ? 'William Hill' : 'Unibet (NL)' } : {}),
  ...reste
});
const jourDe = (i) => `2026-09-${String(1 + (i % 28)).padStart(2, '0')}`;
const ANCIENS = Array.from({ length: 30 }, (_, i) => pari(`ancien-${String(i).padStart(2, '0')}`, { status: i % 3 === 2 ? 'lost' : 'won', stake: 10, odds: 1.5 + (i % 7) * 0.25, cree: `${jourDe(i)}T08:00:00Z`, regle: `${jourDe(i)}T20:${String(i).padStart(2, '0')}:00Z` }));
const CARNET = [
  ...ANCIENS,
  pari('wh-gagne', { status: 'won', stake: 10, odds: 2.1, cree: '2026-10-01T10:00:00Z', regle: '2026-10-03T20:00:00Z', p: 0.55, livre: 'williamhill' }),
  pari('unibet-perdu', { status: 'lost', stake: 15, odds: 2.3, cree: '2026-10-02T10:00:00Z', regle: '2026-10-02T21:00:00Z', p: 0.48, livre: 'unibet_nl' }),
  pari('lundi-1', { status: 'lost', stake: 30, odds: 1.9, cree: '2026-10-04T10:00:00Z', regle: '2026-10-05T08:00:00Z' }),
  pari('lundi-2', { status: 'lost', stake: 30, odds: 2.1, cree: '2026-10-04T11:00:00Z', regle: '2026-10-05T09:00:00Z' }),
  pari('wh-attente', { status: 'pending', stake: 8, odds: 1.9, cree: '2026-10-05T09:00:00Z', p: 0.6, livre: 'williamhill' })
];
const REGLAGE = { miseMaxParPari: 20, perteMaxParSemaine: 50 };
const FICHE_WH = { soldeDeclare: 40, miseMaxAcceptee: 30, limitation: 'ferme', majLe: '2026-10-05T07:00:00.000Z' };
const CLOTURE = {
  disponible: true,
  mesures: [
    { id: 'wh-gagne#0', valueAtClosePct: 4.2, clvPct: 3.1, marketLabel: 'Résultat', approx: null, sources: ['espn'] },
    { id: 'unibet-perdu#0', valueAtClosePct: -1.5, clvPct: -2, marketLabel: 'Résultat', approx: 'ouverture', sources: ['espn'] }
  ],
  manques: [{ reason: 'equipe', label: 'Club non reconnu dans l’annuaire (nom différent de FotMob)', count: 33 }],
  calculeLe: '2026-10-05T11:55:00.000Z',
  sur: 35,
  mesurees: 2
};
const suiviDe = (paris, extra = {}) => JSON.parse(JSON.stringify(rapportDeSuivi({ paris, reglage: REGLAGE, comptes: { williamhill: FICHE_WH }, vosBookmakers: VOS, cloture: CLOTURE, maintenant: MAINTENANT, ...extra })));
const SUIVI = suiviDe(CARNET);

// --------------------------------------------------------------- le rendu

/** Les seuls appels permis pendant un rendu : le carnet, le suivi, la valeur de clôture. */
const AUTORISES = [/\/api\/bets$/, /\/api\/bets\/suivi$/, /\/api\/odds\/closing-value\?/];
let scenario = {};
const appels = [];
const interdits = [];
const avertissements = [];
let contexte;
let originaux = {};

const reponseJson = (corps, statut = 200) => ({ ok: statut < 400, status: statut, headers: { get: () => 'application/json' }, json: async () => JSON.parse(JSON.stringify(corps)) });

before(async () => {
  if (!pret) return;
  originaux = { fetch: globalThis.fetch, warn: console.warn, setInterval: globalThis.setInterval, setTimeout: globalThis.setTimeout };
  globalThis.setInterval = (fn, ms) => {
    const t = originaux.setInterval(fn, ms);
    t.unref?.();
    return t;
  };
  globalThis.setTimeout = (fn, ms, ...a) => {
    const t = originaux.setTimeout(fn, ms, ...a);
    t.unref?.();
    return t;
  };
  globalThis.fetch = async (url) => {
    const u = String(url);
    appels.push(u);
    if (!AUTORISES.some((m) => m.test(u))) {
      interdits.push(u);
      return reponseJson({ error: `fetch interdit dans ce rendu : ${u}` }, 599);
    }
    if (/\/api\/bets$/.test(u)) return reponseJson({ bets: scenario.carnet.map((b) => ({ ...b, gainAttendu: gainAttenduDuPari(b) })) });
    if (/\/api\/bets\/suivi$/.test(u)) return scenario.suivi === 'absent' ? reponseJson({ error: 'Route introuvable : GET /api/bets/suivi' }, 404) : reponseJson(scenario.suivi);
    if (/\/api\/odds\/closing-value/.test(u)) return reponseJson({ error: 'pas de mesure dans ce rendu' }, 503);
    return reponseJson({ error: 'inconnu' }, 404);
  };
  console.warn = (...a) => avertissements.push(a.map(String).join(' ').slice(0, 300));

  const { createServer } = await imp(path.join(UI, 'node_modules', 'vite', 'dist', 'node', 'index.js'));
  const vuePlugin = (await imp(path.join(UI, 'node_modules', '@vitejs', 'plugin-vue', 'dist', 'index.mjs'))).default;
  const { renderToString } = await imp(path.join(UI, 'node_modules', 'vue', 'server-renderer', 'index.mjs'));
  const { createSSRApp, h } = await imp(path.join(UI, 'node_modules', 'vue', 'index.mjs'));
  const { createPinia, setActivePinia } = await imp(path.join(UI, 'node_modules', 'pinia', 'dist', 'pinia.mjs'));
  const { createRouter, createMemoryHistory } = await imp(path.join(UI, 'node_modules', 'vue-router', 'dist', 'vue-router.mjs'));

  // Le chargement de la page attendu par le rendu : onMounted ne s'exécute pas côté serveur, onServerPrefetch si.
  const prefetch = {
    name: 'ssr-prefetch',
    enforce: 'pre',
    transform(code, id) {
      if (id.includes('?') || !/BetsPerformanceView\.vue$/.test(id)) return null;
      let c = code;
      const remplacer = (a, b) => {
        assert.ok(c.includes(a), `la page a changé : « ${a.slice(0, 70)} » introuvable`);
        c = c.replace(a, b);
      };
      remplacer("import { computed, onMounted } from 'vue';", "import { computed, onMounted, onServerPrefetch } from 'vue';");
      remplacer('onMounted(() => {\n  betsStore.fetchBets();\n  chargerSuivi();\n});', 'onServerPrefetch(async () => {\n  await betsStore.fetchBets();\n  await chargerSuivi();\n});');
      return c;
    }
  };
  const ID_FAUX = '\0routeur-faux';
  const routeurFaux = {
    name: 'routeur-faux',
    enforce: 'pre',
    resolveId(source) {
      return /(^@\/router\/index\.js$)|([\\/]src[\\/]router[\\/]index\.js$)/.test(source) ? ID_FAUX : null;
    },
    load(id) {
      return id === ID_FAUX ? 'export const router = { push: async () => null, resolve: () => ({ href: "/" }) };' : null;
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
    plugins: [routeurFaux, prefetch, vuePlugin()],
    resolve: { alias: { '@': path.join(UI, 'src') } }
  });
  const routeur = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:chemin(.*)*', component: { render: () => null } }] });
  await routeur.push('/');
  await routeur.isReady();
  const horloge = await vite.ssrLoadModule('/src/utils/liveClock.js');
  const charger = async (chemin) => (await vite.ssrLoadModule(chemin)).default;
  const risqueStore = await vite.ssrLoadModule('/src/stores/risqueStore.js');
  const nettoyer = (html) => html.replace(/ data-v-[a-z0-9]+(?==|\s|>)/g, '');
  contexte = {
    vite,
    cache,
    composants: {
      Page: await charger('/src/views/BetsPerformanceView.vue'),
      GardeFous: await charger('/src/components/settings/GardeFousPanel.vue'),
      Comptes: await charger('/src/components/settings/BookmakerAccountsPanel.vue'),
      Risque: await charger('/src/components/settings/RiskControlPanel.vue'),
      Ticket: await charger('/src/components/betting/TicketDuPari.vue')
    },
    /** Rend un composant ; `risque` préremplit le store des garde-fous (son chargement est dans onMounted). */
    async rendre(composant, props = {}, { risque = null } = {}) {
      const avant = avertissements.length;
      horloge.liveNow.value = MAINTENANT;
      const app = createSSRApp({ render: () => h(composant, props) });
      const pinia = createPinia();
      app.use(pinia);
      app.use(routeur);
      if (risque) {
        setActivePinia(pinia);
        const store = risqueStore.useRisqueStore(pinia);
        store.$patch({ gardeFous: risque.gardeFous ?? null, comptes: risque.comptes ?? null, chargeLe: MAINTENANT, erreur: risque.erreur ?? null });
      }
      const html = nettoyer(await renderToString(app));
      const vide = /<path(?![^>]*\bd=)[^>]*>/.exec(html);
      assert.equal(vide, null, `une icône inconnue d'AppIcon (tracé vide) : ${vide?.[0]}`);
      return { html, texte: texteDe(html), avertissements: avertissements.slice(avant) };
    }
  };
});

after(async () => {
  if (!pret) return;
  globalThis.fetch = originaux.fetch;
  console.warn = originaux.warn;
  globalThis.setInterval = originaux.setInterval;
  globalThis.setTimeout = originaux.setTimeout;
  if (!contexte) return;
  await contexte.vite.close();
  fs.rmSync(contexte.cache, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

const texteDe = (html) =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
const compter = (texte, motif) => (texte.match(motif) ?? []).length;
const lireUi = (...p) => fs.readFileSync(path.join(UI, 'src', ...p), 'utf8');
const echapper = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Les lignes d'un tableau rendu (balise tr), en texte. */
const lignesDe = (html) => html.split('<tr').slice(1).map((l) => texteDe(`<tr${l.split('</tr>')[0]}</tr>`));

// ------------------------------------------------------------- 1. Performance paris

test('Performance paris : les nouveaux blocs dans l’ordre, puis ceux d’avant, intacts — chiffres clés, trois courbes, zone normale, cinq tableaux (TOTAL sans %, MOYENNE par pari), le carnet pari par pari, l’alerte du garde-fou', options, async () => {
  scenario = { carnet: CARNET, suivi: SUIVI };
  const r = await contexte.rendre(contexte.composants.Page);
  assert.deepEqual(r.avertissements, []);
  const t = r.texte;
  const ordre = ["Gagné face à l'attendu", 'Tes paris ont-ils battu la cote de clôture ?', 'Résultats par marché, championnat, bookmaker, cote et confiance', 'Le carnet, pari par pari', 'Jour par jour', 'Taux de réussite par marché'].map((x) => t.indexOf(x));
  assert.ok(ordre.every((x) => x > 0), JSON.stringify(ordre));
  assert.deepEqual([...ordre].sort((a, b) => a - b), ordre, 'dans cet ordre');
  // Ce qui était là avant : le bandeau, jour par jour, le taux par marché et sa note du yield.
  for (const avant of ['Historique & performance', 'Profit net', 'Taux de réussite', 'Yield : paris simples uniquement', 'Tous les jours', 'Tous marchés']) assert.ok(t.includes(avant), avant);
  // Les chiffres clés : le carnet (le profit net du bandeau d'avant, au centime), l'attendu, les paris avec leur probabilité.
  const net = CARNET.filter((b) => b.status === 'won' || b.status === 'lost').reduce((s, b) => s + (b.status === 'won' ? b.stake * b.odds - b.stake : -b.stake), 0);
  assert.ok(t.includes(`Gagné · carnet ${GF.euros(Math.abs(net)).replace(/^/, net >= 0 ? '+' : '−')}`), `gagné du carnet ${net}`);
  assert.match(t, /Attendu \+3,11 € sur 2 paris réglés avec leur probabilité/, '10 × (0,55 × 2,1 − 1) + 15 × (0,48 × 2,3 − 1)');
  assert.match(t, /Gagné · mêmes paris −4 € écart −7,11 €/, '+11 − 15');
  assert.match(t, /Avec leur probabilité 3 \/ 35 32 non notés · 0 combiné/);
  assert.match(t, /Valeur de clôture .*\+1,4 % 2 paris simples mesurés · 50 % au-dessus de 0/, '(4,2 − 1,5) / 2');
  // L'alerte du garde-fou : la perte maximale de la semaine (60 € perdus ce lundi, plafond 50 €).
  assert.match(t, /Garde-fou Perte maximale de la semaine atteinte : 60 € perdus depuis lundi, pour un plafond de 50 €\. Le moteur ne conseille plus de mise jusqu'à lundi prochain ; vos paris s'enregistrent toujours\. Réglages/);
  // Les trois courbes et leur légende, la phrase de l'écart.
  for (const c of ['is-carnet', 'is-gagne', 'is-attendu']) assert.equal(compter(r.html, new RegExp(`class="gcurve__line ${c}"`, 'g')), 1, c);
  assert.match(t, /Gagné · tout le carnet [+−][\d\s ]+,?\d* €/);
  assert.match(t, /Attendu · mêmes paris \+3,11 €/);
  assert.match(t, /2 paris réglés sur 34 ont leur probabilité du moment : gagné −4 €, attendu \+3,11 € — un écart de −7,11 €, dans ce que le hasard donne avec ces cotes et ces mises/);
  // La zone normale des séries de pertes, avec ses phrases et sa bulle d'aide.
  assert.match(t, new RegExp(`Série de pertes normale jusqu'à ${SUIVI.series.zone.jusqua}`));
  assert.match(t, /Série en cours : 2 pertes d'affilée depuis le 05\/10\/2026/);
  assert.match(t, /Probabilité de gagner chaque pari : celle du moteur au moment du pari pour 2 paris, celle de la cote prise \(1 \/ cote\) pour 32 paris\./);
  assert.match(r.html, /Qu&#39;est-ce que « Séries de pertes normales » \?/);
  // Les cinq tableaux : chacun avec sa ligne TOTAL (sans aucun %) et sa ligne MOYENNE par pari.
  for (const titre of ['Par marché', 'Par championnat', 'Par bookmaker', 'Par tranche de cote', 'Par confiance']) assert.ok(t.includes(titre), titre);
  const totaux = lignesDe(r.html).filter((l) => l.startsWith('Total (Σ)'));
  const moyennes = lignesDe(r.html).filter((l) => l.startsWith('Moyenne (⌀) par pari'));
  assert.equal(totaux.length, 5);
  assert.equal(moyennes.length, 5);
  for (const l of totaux) assert.doesNotMatch(l, /%/, `jamais un pourcentage au total : ${l}`);
  for (const l of moyennes) assert.match(l, /€ \/ pari .*%/, l);
  const parBookmaker = r.html.slice(r.html.indexOf('Par bookmaker'), r.html.indexOf('Par tranche de cote'));
  for (const titre of ['William Hill', '888sport', 'Codere (IT)', 'Bookmaker non noté (pari d’avant « J’ai parié »)']) assert.ok(parBookmaker.includes(titre), titre);
  // Le carnet, pari par pari : 30 lignes, puis la suite à la demande ; chaque pari dit son gain attendu ou « non noté ».
  const carnet = r.html.slice(r.html.indexOf('Le carnet, pari par pari'), r.html.indexOf('Jour par jour'));
  assert.equal(compter(carnet, /<tr>/g), 31, 'l’en-tête et 30 paris');
  assert.match(texteDe(carnet), /Voir les 5 autres paris/);
  assert.match(texteDe(carnet), /Arsenal gagne .*William Hill 1,90 8 € En attente — \+1,12 € \(\+14,00 %\)/, 'le pari en attente et son gain attendu');
  assert.match(texteDe(carnet), /Pari en attente chez William Hill, compte noté fermé \(fiche du 05\/10\/2026\)\./);
  assert.match(texteDe(carnet), /non noté/);
  assert.match(texteDe(carnet), /\+4,2 %/, 'la valeur de clôture du pari de William Hill');
});

test('Performance paris : un carnet vide — les courbes et la zone le disent, les cinq tableaux restent avec leurs lignes fixes, leur total et leur moyenne', options, async () => {
  scenario = { carnet: [], suivi: suiviDe([]) };
  const r = await contexte.rendre(contexte.composants.Page);
  assert.deepEqual(r.avertissements, []);
  assert.match(r.texte, /Aucun pari réglé : les courbes commencent au premier pari réglé\./);
  assert.match(r.texte, /Aucun pari réglé : la zone normale se calcule dès le premier\./);
  assert.match(r.texte, /Aucun pari réglé pour l'instant : le gain attendu se calcule pour chaque pari pris avec « J'ai parié » \(étape 10\)/);
  assert.equal(compter(r.texte, /Total \(Σ\)/g), 5);
  assert.equal(compter(r.texte, /Moyenne \(⌀\) par pari/g), 5);
  for (const l of ['Moins de 1,50', '5,00 et plus', 'Pas encore mesurée (étape 38)', 'Nordic Bet']) assert.ok(r.texte.includes(l), l);
  assert.match(r.texte, /Aucun pari au carnet pour l'instant\./);
});

test('Performance paris : un serveur qui n’a pas le suivi (pas encore relancé) — l’erreur dite, la structure reste : cinq tableaux vides, leurs lignes fixes, total et moyenne ; les blocs d’avant toujours remplis', options, async () => {
  scenario = { carnet: CARNET, suivi: 'absent' };
  const r = await contexte.rendre(contexte.composants.Page);
  assert.deepEqual(r.avertissements, []);
  assert.match(r.texte, /Suivi des paris indisponible Le serveur n'est pas à jour : relancez demarrer-cotemaster\.bat pour activer cette fonction\. — les tableaux restent affichés, sans valeurs\./);
  assert.equal(compter(r.texte, /Total \(Σ\)/g), 5);
  for (const l of ['Moins de 1,50', '3,00 à 4,99', 'Sûr', 'Fragile']) assert.ok(r.texte.includes(l), l);
  assert.match(r.texte, /Gagné · carnet — suivi non lu/);
  assert.ok(r.texte.includes('Tous les jours'), 'jour par jour, rempli par le carnet d’avant');
});

// ------------------------------------------------------------- 2. Réglages

const VUE_GARDE_FOUS = (reglage, paris = CARNET) => {
  const etat = GF.etatDesGardeFous({ paris, reglage, maintenant: MAINTENANT });
  const { series, ...reste } = etat;
  return JSON.parse(JSON.stringify({ reglage, source: reglage.miseMaxParPari === null && reglage.perteMaxParSemaine === null ? 'defaut' : 'enregistre', majLe: '2026-10-05T07:30:00.000Z', fichier: 'C:\\essai\\garde-fous.json', etat: reste, series, probleme: null }));
};

test('Réglages › garde-fous : les deux plafonds (vide = aucun), l’état de la semaine, le conseil suspendu quand la perte maximale est atteinte, les alertes, la provenance ; par défaut, aucun plafond', options, async () => {
  const r = await contexte.rendre(contexte.composants.GardeFous, {}, { risque: { gardeFous: VUE_GARDE_FOUS(REGLAGE) } });
  assert.deepEqual(r.avertissements, []);
  const t = r.texte;
  assert.match(t, /Garde-fous/);
  assert.match(t, /Vos paris s'enregistrent toujours — un garde-fou bloque le conseil et alerte, jamais un pari\. Champ vide : pas de plafond\./);
  assert.match(t, /Mise maximale par pari .*Vide : aucun plafond/);
  assert.match(t, /Perte maximale par semaine .*Du lundi au dimanche ; vide : aucun plafond/);
  assert.match(r.html, /value="20"/);
  assert.match(r.html, /value="50"/);
  assert.match(t, /Perte de la semaine 60 € du lundi 05\/10\/2026 au dimanche 11\/10\/2026 · plafond : 50 €/);
  assert.match(t, /Mises en attente 8 € 1 pari pas encore réglé/);
  assert.match(t, /Reste avant le plafond 0 €/);
  assert.match(t, /Conseil de mise suspendu perte maximale de la semaine/);
  assert.match(t, /Perte maximale de la semaine atteinte : 60 € perdus depuis lundi, pour un plafond de 50 €/);
  assert.match(t, /Fixés dans cet écran le 05\/10\/2026 ; enregistrés dans C:\\essai\\garde-fous\.json\./);
  assert.match(t, /Série de pertes normale jusqu'à \d+/);
  assert.match(t, /Retirer les plafonds/);
  // Par défaut : aucun plafond — les champs vides, le conseil « sans plafond », la provenance qui le dit.
  const d = await contexte.rendre(contexte.composants.GardeFous, {}, { risque: { gardeFous: VUE_GARDE_FOUS({ miseMaxParPari: null, perteMaxParSemaine: null }) } });
  assert.match(d.texte, /Aucun plafond réglé \(valeur par défaut\) : c'est vous qui les fixez\./);
  assert.match(d.texte, /Conseil de mise sans plafond Kelly fractionné du moteur, tel quel/);
  assert.match(d.texte, /Reste avant le plafond — pas de perte maximale réglée/);
  assert.doesNotMatch(d.texte, /Retirer les plafonds/);
  assert.doesNotMatch(d.html, /value="\d/);
  // Seulement la mise maximale : le conseil plafonné, rien de suspendu.
  const m = await contexte.rendre(contexte.composants.GardeFous, {}, { risque: { gardeFous: VUE_GARDE_FOUS({ miseMaxParPari: 12.5, perteMaxParSemaine: null }) } });
  assert.match(m.texte, /Conseil de mise ≤ 12,50 € votre mise maximale par pari/);
  // Illisible : dit, et la prudence expliquée.
  const e = await contexte.rendre(contexte.composants.GardeFous, {}, { risque: { erreur: 'Réglage des garde-fous illisible (C:\\essai\\garde-fous.json)' } });
  assert.match(e.texte, /Garde-fous illisibles Réglage des garde-fous illisible .* — tant qu'un plafond réglé ne peut pas être vérifié, le moteur ne conseille aucune mise\./);
});

test('Réglages › comptes bookmakers : une fiche par bookmaker (solde déclaré, mise maximale acceptée, limitation, date) — jamais un champ d’identifiant ni de mot de passe', options, async () => {
  const comptes = {
    bookmakers: VOS.map((cle) => ({ cle, titre: { williamhill: 'William Hill', unibet_nl: 'Unibet (NL)' }[cle] ?? cle, fiche: cle === 'williamhill' ? FICHE_WH : cle === 'unibet_nl' ? { soldeDeclare: null, miseMaxAcceptee: null, limitation: 'limite', majLe: '2026-10-04T08:00:00.000Z' } : null })),
    limitations: GF.LIMITATIONS,
    champs: ['soldeDeclare', 'miseMaxAcceptee', 'limitation'],
    source: 'enregistre',
    fichier: 'C:\\essai\\comptes-bookmakers.json',
    champsIgnores: 1
  };
  const r = await contexte.rendre(contexte.composants.Comptes, {}, { risque: { comptes } });
  assert.deepEqual(r.avertissements, []);
  const t = r.texte;
  assert.match(t, /Jamais d'identifiant ni de mot de passe Chaque fiche ne garde que trois choses que vous tapez vous-même : le solde déclaré, la mise maximale que le bookmaker accepte/);
  assert.equal(compter(r.html, /class="[^"]*\bcomptes__fiche\b/g), 10, 'une fiche par bookmaker (Vue écrit la classe d’état avant la classe fixe)');
  assert.match(t, /William Hill Compte fermé Solde déclaré : 40 € · mise acceptée : 30 € · Compte fermé — mise à jour le 05\/10\/2026\./);
  assert.match(t, /Unibet \(NL\) Compte limité Solde déclaré : non connu · mise acceptée : non connue · Compte limité \(mises réduites\) — mise à jour le 04\/10\/2026\./);
  assert.equal(compter(t, /Pas de fiche : rien de connu sur ce compte\./g), 8);
  // Les seuls champs : solde, mise acceptée, limitation — aucun champ de texte libre, d'identifiant, de courriel ou de mot de passe.
  const libelles = [...r.html.matchAll(/class="field__label">([^<]+)</g)].map((m) => m[1]);
  assert.deepEqual([...new Set(libelles)].sort(), ['Limitation', 'Mise maximale acceptée', 'Solde déclaré']);
  assert.equal(compter(r.html, /Limitation/g) >= 10, true);
  assert.doesNotMatch(r.html, /type="(password|email|text)"/);
  assert.doesNotMatch(t, /mot de passe :|identifiant :/i);
  assert.match(t, /1 champ inconnu du fichier ignoré \(jamais montré, effacé au prochain enregistrement\)/);
});

test('Réglages › le coupe-circuit enclenché par un garde-fou : « Mises suspendues », la raison, l’interrupteur manuel reste le sien ; sans les nouvelles propriétés, rien ne change', options, async () => {
  const auto = { motif: 'perte-semaine-atteinte', texte: 'perte maximale de la semaine atteinte : 60 € perdus depuis lundi, pour un plafond de 50 €' };
  const r = await contexte.rendre(contexte.composants.Risque, { circuitBreakerActive: true, manuel: false, automatique: auto });
  assert.deepEqual(r.avertissements, []);
  assert.match(r.texte, /Mises suspendues/);
  assert.match(r.texte, /Enclenché par un garde-fou : perte maximale de la semaine atteinte : 60 € perdus depuis lundi, pour un plafond de 50 €\. Il se relâche de lui-même/);
  assert.doesNotMatch(r.html, /toggle__switch--on/, 'l’interrupteur manuel : coupé');
  const avant = await contexte.rendre(contexte.composants.Risque, { circuitBreakerActive: true });
  assert.match(avant.html, /toggle__switch--on/, 'sans `manuel` : l’interrupteur suit l’état, comme avant');
  assert.doesNotMatch(avant.texte, /Enclenché par un garde-fou/);
  const manuel = await contexte.rendre(contexte.composants.Risque, { circuitBreakerActive: true, manuel: true, automatique: null });
  assert.match(manuel.html, /toggle__switch--on/);
});

// ------------------------------------------------------------- 3. le ticket

test('le ticket SIGNALE (mise maximale, compte fermé, mise acceptée, solde, perte de la semaine) avec les phrases du serveur — « J’ai parié » reste actif, rien ne manque', options, async () => {
  const selection = { matchId: 'essai-a', homeName: 'Man City', awayName: 'Liverpool', league: 'EPL', market: 'Résultat', pick: 'Man City gagne', marketId: 'result', params: { outcome: 'home' }, cote: 2.3, bookmaker: 'williamhill', bookmakerTitle: 'William Hill', coteReleveeA: '2026-10-05T11:50:00.000Z', coteSource: 'the-odds-api', probabiliteMoteur: 0.489, probabiliteSource: 'cote juste', probabiliteLueA: '2026-10-05T12:00:00.000Z', coteJuste: 2.05, bornes: null };
  const props = {
    selections: [selection],
    edition: { bookmaker: 'williamhill', cotes: {}, coteCombinee: null },
    mise: 100,
    bookmakers: [{ cle: 'williamhill', titre: 'William Hill' }],
    gardeFous: { reglage: { miseMaxParPari: 25, perteMaxParSemaine: 50 }, etat: { bloque: true, motif: 'perte-semaine-atteinte' } },
    comptes: { williamhill: FICHE_WH },
    maintenant: MAINTENANT
  };
  const r = await contexte.rendre(contexte.composants.Ticket, props);
  assert.deepEqual(r.avertissements, []);
  const attendues = GF.alertesDuPari({ mise: 100, bookmaker: 'williamhill', bookmakerTitle: 'William Hill', reglage: props.gardeFous.reglage, compte: FICHE_WH, etat: props.gardeFous.etat });
  assert.equal(attendues.length, 5);
  for (const a of attendues) assert.ok(r.texte.includes(a.texte), a.texte);
  const bouton = /<button[^>]*>(?:(?!<\/button>)[\s\S])*J'ai parié chez William Hill/.exec(r.html.replace(/&#39;/g, "'"))?.[0] ?? '';
  assert.ok(bouton, 'le bouton « J’ai parié »');
  assert.doesNotMatch(bouton, /disabled/, 'jamais bloqué par un garde-fou');
  assert.match(r.texte, /Prêt : le pari sera noté avec William Hill/);
  // Sans garde-fou ni fiche (page d'avant l'étape 11) : aucune alerte.
  const sans = await contexte.rendre(contexte.composants.Ticket, { ...props, gardeFous: null, comptes: null });
  assert.doesNotMatch(sans.html, /tkt__alerte/);
});

// ------------------------------------------------------------- 4. hygiène et câblage

const styleDe = (source) => [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
const NOUVEAUX = [
  ['components', 'betting', 'GainCurvesChart.vue'],
  ['components', 'betting', 'LossStreakBand.vue'],
  ['components', 'betting', 'BetBreakdownTable.vue'],
  ['components', 'betting', 'BetLedgerTable.vue'],
  ['components', 'settings', 'GardeFousPanel.vue'],
  ['components', 'settings', 'BookmakerAccountsPanel.vue']
];

test('hygiène des six composants : aucune couleur en dur, aucun !important, aucune police sous 10 px, jetons existants, icônes connues ; les courbes et la bande jamais en vert ni en rouge ; les composants du suivi n’appellent rien', options, () => {
  const tokens = lireUi('assets', 'styles', 'tokens.css');
  const connues = new Set([...lireUi('components', 'common', 'AppIcon.vue').matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]));
  for (const f of NOUVEAUX) {
    const nom = f.join('/');
    const source = lireUi(...f);
    const css = styleDe(source);
    assert.ok(css.length > 300, `${nom} : un style`);
    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, `${nom} : une couleur hexadécimale en dur`);
    assert.doesNotMatch(css, /\brgba?\(\s*\d/, `${nom} : une couleur rgb en dur`);
    assert.doesNotMatch(css, /!important/, `${nom} : !important`);
    for (const [, taille] of css.matchAll(/font-size:\s*([\d.]+)px/g)) assert.ok(Number(taille) >= 10, `${nom} : police de ${taille}px`);
    for (const [, jeton] of css.matchAll(/var\((--cm-[a-z0-9-]+)/g)) assert.ok(tokens.includes(`${jeton}:`), `${nom} : le jeton ${jeton} n'existe pas`);
    for (const [, icone] of source.matchAll(/<AppIcon name="(\w+)"/g)) assert.ok(connues.has(icone), `${nom} : l'icône « ${icone} »`);
    for (const [, a, b] of source.matchAll(/:name="[^"]*\? '(\w+)' : '(\w+)'"/g)) for (const icone of [a, b]) assert.ok(connues.has(icone), `${nom} : l'icône « ${icone} »`);
  }
  // Les courbes et la bande : un trait se reconnaît à sa couleur ET à son dessin, jamais au vert ou au rouge.
  for (const f of NOUVEAUX.slice(0, 2)) assert.doesNotMatch(styleDe(lireUi(...f)), /--cm-accent|--cm-danger|cm-positive|cm-negative/, f.join('/'));
  // Le vert et le rouge des tableaux : SEULEMENT pour un gain et une perte (cm-positive / cm-negative).
  for (const f of NOUVEAUX.slice(2, 4)) {
    const css = styleDe(lireUi(...f));
    for (const m of css.matchAll(/([^{}]+)\{[^}]*--cm-(accent|danger)[^}]*\}/g)) assert.match(m[1], /cm-positive|cm-negative/, `${f.join('/')} : ${m[1].trim()}`);
  }
  // Les composants du suivi n'appellent rien : la page leur donne tout.
  for (const f of NOUVEAUX.slice(0, 4)) assert.doesNotMatch(lireUi(...f), /@\/services\/|fetch\(|httpClient|@\/stores\//, `${f.join('/')} : aucun appel`);
});

test('câblage : Performance paris lit GET /api/bets/suivi ; Réglages pose les garde-fous sous le coupe-circuit et la carte des comptes ; le ticket reçoit garde-fous et fiches (lues au premier clic sur une cote, jamais au chargement de la page du match) ; la puce du haut mène au suivi', options, () => {
  const page = lireUi('views', 'BetsPerformanceView.vue');
  assert.match(page, /const data = await betsApi\.suivi\(\);/);
  assert.match(page, /<BetBreakdownTable v-for="t in tableauxDuSuivi" :key="t\.cle" :tableau="t" \/>/);
  assert.match(page, /<BetLedgerTable :paris="s\?\.paris \?\? \[\]" \/>/);
  assert.match(page, /<GainCurvesChart :courbe="s\?\.courbe \?\? null" :attendu="attenduDuSuivi" \/>/);
  assert.match(page, /<LossStreakBand :series="s\?\.series \?\? null" \/>/);
  assert.match(lireUi('views', 'PredictionsHistoryView.vue'), /<BetsPerformanceView v-if="activeTab === 'performance'" key="performance" \/>/);
  const reglages = lireUi('views', 'SettingsView.vue');
  const carte = reglages.slice(reglages.indexOf('title="Gestion du risque"'), reglages.indexOf('title="Données"'));
  assert.ok(carte.indexOf('<RiskControlPanel') < carte.indexOf('<GardeFousPanel @enregistre="handleGardeFousEnregistres" />'), 'les garde-fous sous le coupe-circuit, dans la même carte');
  assert.match(carte, /:manuel="configStore\.tilt\?\.coupeCircuitManuel \?\? null"/);
  assert.match(carte, /:automatique="configStore\.tilt\?\.automatique \?\? null"/);
  assert.match(reglages, /title="Comptes bookmakers"[\s\S]*?<BookmakerAccountsPanel \/>/);
  const match = lireUi('views', 'UpcomingMatchView.vue');
  assert.match(match, /<TicketDuPari[\s\S]*?:garde-fous="risque\.pourLeTicket"\s+:comptes="risque\.fiches"/);
  assert.equal(compter(match, /risque\.charger\(/g), 1);
  const prendre = match.slice(match.indexOf('function prendreUneCote(selection) {'), match.indexOf('function retirerDuTicket('));
  assert.match(prendre, /risque\.charger\(\);/, 'au premier clic sur une cote');
  assert.match(match, /<p v-for="a in ticket\.dernier\.alertes \?\? \[\]" :key="a\.code" class="cm-note__text">/);
  const mesParis = lireUi('views', 'MyBetsView.vue');
  assert.match(mesParis, /:garde-fous="risque\.pourLeTicket"\s+:comptes="risque\.fiches"\s+:avec-validation="false"/);
  assert.match(mesParis, /onMounted\(\(\) => \{\n {2}betsStore\.fetchBets\(\);\n {2}risque\.charger\(\);/);
  assert.match(mesParis, /for \(const a of betsStore\.bets\[0\]\?\.alertes \?\? \[\]\) toastStore\.push\(a\.texte/);
  const haut = lireUi('components', 'layout', 'AppTopbar.vue');
  assert.match(haut, /const alertesGardeFous = computed\(\(\) => refresh\.value\?\.gardeFous\?\.alertes \?\? \[\]\);/);
  assert.match(haut, /router\.push\(\{ path: '\/historique-moteur', query: \{ onglet: 'performance' \} \}\)/);
  assert.match(haut, /v-if="alertesGardeFous\.length && isOnline"/);
  // Le ticket : « ce qui manque » n'a pas changé (un garde-fou ne bloque jamais le bouton).
  const ticket = lireUi('components', 'betting', 'TicketDuPari.vue');
  assert.match(ticket, /const manques = computed\(\(\) => controleDuTicket\(\{ selections: props\.selections, edition: props\.edition, mise: props\.mise, bookmakers: props\.bookmakers \}\)\);/);
  assert.match(ticket, /:disabled="manques\.length > 0"/);
});

test('aucun appel hors liste pendant ces rendus — ni API payante, ni FotMob, ni Claude — et aucun avertissement de Vue', options, () => {
  assert.deepEqual(interdits, [], 'appels refusés');
  assert.deepEqual(avertissements, [], 'avertissements de Vue');
  assert.ok(appels.some((u) => /\/api\/bets\/suivi$/.test(u)));
  assert.ok(!appels.some((u) => /odds-api\.com|fotmob\.com|anthropic|\/refresh|\/config\/garde-fous|\/bookmaker-accounts/.test(u)), 'les panneaux de Réglages ne chargent qu’au montage (navigateur)');
});
