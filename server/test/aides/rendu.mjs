/**
 * Le RENDU des écrans côté serveur, sans navigateur ni serveur de développement — ce n'est PAS un fichier de test.
 * Commun aux tests d'écran de l'étape 31 (fichesEcran, bookmakersEcran) : le patron de reperesEcran.test.mjs et de
 * santeMoteurEcran.test.mjs, écrit une fois.
 *
 *   `fetch` remplacé : seules les routes données répondent, tout le reste est REFUSÉ et compté (`interdits`) ;
 *   un Vite « middleware » n'écoute sur aucun port, son cache va dans le dossier d'essais, rien n'est écrit dans ui/ ;
 *   `onMounted` devient `onServerPrefetch` dans les fichiers visés (le rendu serveur attend la lecture) ;
 *   le routeur de l'appli (qui crée son historique sur window au chargement) est remplacé par un faux ;
 *   l'horloge partagée (liveClock.js) est figée : « il y a 17 jours » ne dépend pas du jour du test.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SERVEUR, RACINE_ESSAIS } from './isolement.mjs';

export const UI = path.resolve(SERVEUR, '..', 'ui');
export const imp = (chemin) => import(pathToFileURL(chemin).href);

/**
 * Les règles d'un écran (ui/src/utils) sont PURES : leurs seuls imports sont d'autres règles pures du même dossier
 * (« ./x.js »), jamais Vue, Pinia, le routeur, un service ni « @/… », et rien n'y touche au réseau ni au navigateur.
 * Rend l'ensemble des fichiers lus (le fichier et ce qu'il importe, de proche en proche).
 */
export function reglesPures(nom, vus = new Set()) {
  if (vus.has(nom)) return vus;
  vus.add(nom);
  const texte = fs.readFileSync(path.join(UI, 'src', 'utils', nom), 'utf8');
  for (const m of texte.matchAll(/^import [^;]* from '([^']+)';$/gm)) {
    assert.match(m[1], /^\.\/[A-Za-z]+\.js$/, `${nom} importe « ${m[1]} » : une règle pure n'importe que d'autres règles pures du même dossier`);
    reglesPures(m[1].slice(2), vus);
  }
  assert.doesNotMatch(texte, /\bfetch\(|\bdocument\.|\bwindow\.|localStorage|from 'vue'|from 'pinia'/, `${nom} : pas d'effet de bord ni de Vue`);
  return vus;
}
export const interfacePrete = ['vite', '@vitejs/plugin-vue', 'vue', 'pinia', 'vue-router'].every((p) => fs.existsSync(path.join(UI, 'node_modules', p)));
export const optionsDuRendu = { skip: interfacePrete ? false : 'ui/node_modules (vite, plugin-vue, vue, pinia, vue-router) manque' };

/** Le texte visible d'un rendu : sans style ni balise, les espaces insécables ramenés à une espace. */
export const texteDe = (html) =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[  ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Le même texte, les espaces insécables des nombres ramenées à une espace (pour comparer à toLocaleString). */
export const espaces = (t) => String(t).replace(/[  ]/g, ' ');

/** Les tableaux d'un rendu : leur HTML, leurs en-têtes, leur corps et leur pied, ligne par ligne. */
export const tableaux = (html) => html.split('<table').slice(1).map((t) => `<table${t.split('</table>')[0]}</table>`);
export const corps = (t) => (t.split('<tbody')[1] ?? '').split('</tbody>')[0].split(/<tr\b/).slice(1).map((x) => `<tr${x}`);
export const pied = (t) => (t.split('<tfoot')[1] ?? '').split('</tfoot>')[0].split(/<tr\b/).slice(1).map((x) => `<tr${x}`);
export const entetes = (t) => [...(t.split('<thead')[1] ?? '').split('</thead>')[0].matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map((m) => texteDe(m[1]));
/**
 * L'élément (<section> par défaut) qui porte `data-bloc="cle"`, de son ouverture à SA fermeture — les éléments du même
 * nom qu'il contient sont comptés —, ou null.
 */
export function blocDe(html, cle, balise = 'section') {
  const i = html.indexOf(`data-bloc="${cle}"`);
  if (i < 0) return null;
  const debut = html.lastIndexOf(`<${balise}`, i);
  const re = new RegExp(`<(/?)${balise}\\b`, 'g');
  re.lastIndex = debut;
  let profondeur = 0;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    profondeur += m[1] ? -1 : 1;
    if (profondeur === 0) return html.slice(debut, html.indexOf('>', m.index) + 1);
  }
  return html.slice(debut);
}

/** Le tableau portant data-tableau="…" (le premier), ou null. */
export const tableauDe = (html, cle) => tableaux(html).find((t) => t.includes(`data-tableau="${cle}"`)) ?? null;

/**
 * Ouvre le rendu. `cibles` : une expression sur les chemins des fichiers dont `onMounted` devient `onServerPrefetch`.
 * Rend { rendre, charger, pinia, fermer, interdits, avertissements, appels }.
 */
export async function ouvrirLeRendu({ cibles, heure = '2026-10-22T18:00:00.000Z', routes = ['/'] }) {
  const originaux = { fetch: globalThis.fetch, warn: console.warn, setInterval: globalThis.setInterval, setTimeout: globalThis.setTimeout };
  const interdits = [];
  const avertissements = [];
  const appels = [];
  let scenario = [];
  // L'horloge partagée de l'appli (liveClock.js, lue par la pastille de provenance) arme un minuteur dès son import.
  globalThis.setInterval = (fn, ms, ...a) => {
    const t = originaux.setInterval(fn, ms, ...a);
    t.unref?.();
    return t;
  };
  globalThis.setTimeout = (fn, ms, ...a) => {
    const t = originaux.setTimeout(fn, ms, ...a);
    t.unref?.();
    return t;
  };
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    const methode = opts.method ?? 'GET';
    appels.push(`${methode} ${u}`);
    const trouve = scenario.find(([motif]) => motif.test(u) && methode === 'GET');
    if (!trouve) {
      interdits.push(`${methode} ${u}`);
      throw new Error(`fetch interdit dans ce rendu : ${methode} ${u}`);
    }
    const r = typeof trouve[1] === 'function' ? trouve[1](u) : trouve[1];
    return { ok: r.code < 400, status: r.code, headers: { get: () => 'application/json' }, json: async () => JSON.parse(JSON.stringify(r.corps)) };
  };
  console.warn = (...a) => avertissements.push(a.map(String).join(' ').slice(0, 300));

  const { createServer } = await imp(path.join(UI, 'node_modules', 'vite', 'dist', 'node', 'index.js'));
  const vuePlugin = (await imp(path.join(UI, 'node_modules', '@vitejs', 'plugin-vue', 'dist', 'index.mjs'))).default;
  const { renderToString } = await imp(path.join(UI, 'node_modules', 'vue', 'server-renderer', 'index.mjs'));
  const { createSSRApp, h } = await imp(path.join(UI, 'node_modules', 'vue', 'index.mjs'));
  const { createPinia } = await imp(path.join(UI, 'node_modules', 'pinia', 'dist', 'pinia.mjs'));
  const { createRouter, createMemoryHistory } = await imp(path.join(UI, 'node_modules', 'vue-router', 'dist', 'vue-router.mjs'));
  const prefetch = {
    name: 'ssr-prefetch',
    enforce: 'pre',
    transform(code, id) {
      if (!cibles.test(id) || id.includes('?')) return null;
      return code.replace(/import \{ ([^}]*)\bonMounted\b([^}]*)\} from 'vue';/, (m, a, b) => `import { ${a}onMounted, onServerPrefetch${b}} from 'vue';`).replace(/onMounted\(/g, 'onServerPrefetch(');
    }
  };
  const ID_FAUX = '\0routeur-faux';
  const routeurFaux = {
    name: 'routeur-faux',
    enforce: 'pre',
    resolveId: (source) => (/(^@\/router\/index\.js$)|([\\/]src[\\/]router[\\/]index\.js$)/.test(source) ? ID_FAUX : null),
    load: (id) => (id === ID_FAUX ? 'export const router = { push: async () => null, resolve: () => ({ href: "/" }) };' : null)
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
  const horloge = await vite.ssrLoadModule('/src/utils/liveClock.js');
  horloge.liveNow.value = Date.parse(heure);
  const vide = { render: () => null };
  const routeur = createRouter({ history: createMemoryHistory(), routes: [...routes.filter((r) => r !== '/').map((r) => ({ path: r, component: vide })), { path: '/:chemin(.*)*', component: vide }] });
  await routeur.push(routes[0]);
  await routeur.isReady();

  return {
    vite,
    interdits,
    avertissements,
    appels,
    routeur,
    horloge,
    /** Un module de l'interface, chargé par Vite (le même que celui des composants). */
    charger: async (chemin) => vite.ssrLoadModule(chemin),
    /**
     * Rend `composant` avec ses `props`. `reponses` : [[expression de l'adresse, { code, corps }]]. `avant(pinia)` :
     * prépare les magasins (les favoris). Rend { html, texte, avertissements, appels }.
     */
    async rendre(composant, props = {}, reponses = [], { avant = null } = {}) {
      scenario = reponses;
      appels.length = 0;
      const debut = avertissements.length;
      const pinia = createPinia();
      if (avant) await avant(pinia);
      const app = createSSRApp({ render: () => h(composant, props) });
      app.use(pinia);
      app.use(routeur);
      const html = await renderToString(app);
      const trou = /<path(?![^>]*\bd=)[^>]*>/.exec(html);
      if (trou) throw new Error(`une icône inconnue d'AppIcon (tracé vide) : ${trou[0]}`);
      return { html, texte: texteDe(html), avertissements: avertissements.slice(debut), appels: [...appels] };
    },
    async fermer() {
      globalThis.fetch = originaux.fetch;
      console.warn = originaux.warn;
      globalThis.setInterval = originaux.setInterval;
      globalThis.setTimeout = originaux.setTimeout;
      await vite.close();
      fs.rmSync(cache, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  };
}
