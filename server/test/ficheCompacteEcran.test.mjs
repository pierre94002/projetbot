/**
 * La carte « Budget Claude » de Réglages après l'étape 41 SE REND : la fiche
 * envoyée à l'IA et le coût moyen d'une analyse par forme, face à la référence
 * du 04/10 et à l'objectif.
 *   node --test test/ficheCompacteEcran.test.mjs        (depuis server/)
 *
 * L'état affiché est celui du VRAI serveur (etatBudgetClaude), produit dans une
 * copie isolée sur un journal FABRIQUÉ (test/aides/script-fiche-etat.mjs), avec
 * la fiche compacte puis avec AI_ANALYSIS_FICHE=ancienne. Rendu côté serveur
 * sans navigateur ni serveur de développement : `fetch` remplacé (seule
 * /api/claude-budget répond), un Vite « middleware » n'écoute sur aucun port,
 * son cache va dans le dossier d'essais, rien n'est écrit dans ui/. Comme pour
 * la feuille de route, `onMounted` devient `onServerPrefetch` dans le rendu.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { preparerCopie, executer, SERVEUR, RACINE_ESSAIS } from './aides/isolement.mjs';

const UI = path.resolve(SERVEUR, '..', 'ui');
const pret = ['vite', '@vitejs/plugin-vue', 'vue'].every((p) => fs.existsSync(path.join(UI, 'node_modules', p)));
const imp = (chemin) => import(pathToFileURL(chemin).href);
const options = { skip: pret ? false : 'ui/node_modules (vite, plugin-vue, vue) manque' };

/** L'état du serveur, dans une copie neuve. */
function etatDuServeur(env = {}) {
  const copie = preparerCopie({});
  try {
    const r = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-fiche-etat.mjs'), { env: { CLAUDE_CODE_BIN: path.join(copie.dossier, 'pas-de-claude-ici.exe'), MATCH_STATS_AUTO_REFRESH: 'false', ...env } });
    assert.equal(r.code, 0, r.erreurs.slice(-3000));
    assert.equal(r.reseau, false);
    return r.json.etat;
  } finally {
    copie.nettoyer();
  }
}

const texteDe = (html) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/[  ]/g, ' ')
    .replace(/\s+/g, ' ');

let contexte;
const avertissements = [];

before(async () => {
  if (!pret) return;
  const etats = { compacte: etatDuServeur(), ancienne: etatDuServeur({ AI_ANALYSIS_FICHE: 'ancienne' }) };
  const { createServer } = await imp(path.join(UI, 'node_modules', 'vite', 'dist', 'node', 'index.js'));
  const vuePlugin = (await imp(path.join(UI, 'node_modules', '@vitejs', 'plugin-vue', 'dist', 'index.mjs'))).default;
  const { renderToString } = await imp(path.join(UI, 'node_modules', 'vue', 'server-renderer', 'index.mjs'));
  const { createSSRApp } = await imp(path.join(UI, 'node_modules', 'vue', 'index.mjs'));
  let courant = null;
  const refus = [];
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (!/\/api\/claude-budget(\?|$)/.test(u)) {
      refus.push(u);
      throw new Error(`fetch interdit dans ce rendu : ${u}`);
    }
    if (!courant) return { ok: false, status: 503, headers: { get: () => 'application/json' }, json: async () => ({ error: 'Serveur injoignable (essai).' }) };
    return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => JSON.parse(JSON.stringify(courant)) };
  };
  console.warn = (...a) => avertissements.push(a.map(String).join(' ').slice(0, 300));
  const prefetch = {
    name: 'ssr-prefetch',
    enforce: 'pre',
    transform(code, id) {
      if (!/ClaudeBudgetPanel\.vue$/.test(id) || id.includes('?')) return null;
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
  const Carte = (await vite.ssrLoadModule('/src/components/settings/ClaudeBudgetPanel.vue')).default;
  contexte = {
    vite,
    cache,
    etats,
    refus,
    async carte(nom) {
      courant = nom ? etats[nom] : null;
      const avant = avertissements.length;
      const html = await renderToString(createSSRApp(Carte, { variante: 'complete', reglable: true }));
      return { html, texte: texteDe(html), avertissements: avertissements.slice(avant) };
    }
  };
});

after(async () => {
  if (!contexte) return;
  await contexte.vite.close();
  // Le dossier de cache ne contient aucun lien : suppression sans danger.
  fs.rmSync(contexte.cache, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

/** Le bloc de la carte entre deux titres. */
const bloc = (texte, debut, fin) => texte.slice(texte.indexOf(debut), fin ? texte.indexOf(fin, texte.indexOf(debut)) : undefined);

test('carte « Budget Claude » : la fiche compacte en vigueur, l’essai sans mise en cache prévu, le coût moyen par forme face au 04/10 et à l’objectif', options, async () => {
  const { texte, avertissements: avert } = await contexte.carte('compacte');
  assert.deepEqual(avert, [], 'avertissements de Vue pendant le rendu');
  const b = bloc(texte, "Fiche envoyée à l'IA et coût moyen d'une analyse", "Derniers appels d'aujourd'hui");
  assert.match(b, /Fiche compacte envoyée à l'IA \(petits tableaux, consignes fixes relues depuis la mémoire cache de Claude\), en mode normal comme en mode économe — depuis l'étape 41\./);
  assert.match(b, /Essai sans mise en cache : prévu, pas activé\./);
  assert.match(b, /Analyse Avant \(04\/10\) Objectif Ancienne fiche Fiche compacte/);
  assert.match(b, /Analyse d'avant-match 24 400 17 000 24 400 1 appel\(s\) · entrée [\d ]+ · sortie [\d ]+ 16 000 2 appel\(s\) · entrée [\d ]+ · sortie [\d ]+ · 19 833 caractères envoyés/);
  assert.match(b, /Revue d'après-match 10 800 7 000 10 800 1 appel\(s\) · [^·]+· sortie [\d ]+ 9 400 1 appel\(s\) · [^·]+· sortie [\d ]+ · 10 456 caractères envoyés/);
  assert.match(b, /lus dans le journal du lun\. 05\/10 à aujourd'hui/);
  assert.match(b, /Référence : mesuré le 04\/10\/2026/);
  // Le compactage n'est plus une règle du mode économe : la liste n'a que ses quatre règles.
  const econome = bloc(texte, 'Mode économe', "Fiche envoyée à l'IA");
  assert.ok(!/Compacter ce qu'on envoie/.test(econome));
  assert.match(econome, /Les favoris passent d’abord dans chaque liste/);
  assert.deepEqual(contexte.refus, []);
});

test('carte « Budget Claude » : avec AI_ANALYSIS_FICHE=ancienne, la carte dit l’ancienne forme et son réglage ; serveur injoignable : le tableau reste, « non lu »', options, async () => {
  const ancienne = await contexte.carte('ancienne');
  assert.deepEqual(ancienne.avertissements, []);
  assert.match(ancienne.texte, /Ancienne forme envoyée à l'IA \(réglage AI_ANALYSIS_FICHE=ancienne\), pour comparer\./);
  assert.ok(!ancienne.texte.includes('Fiche compacte envoyée'));
  const vide = await contexte.carte(null);
  const b = bloc(vide.texte, "Fiche envoyée à l'IA et coût moyen d'une analyse", "Derniers appels d'aujourd'hui");
  assert.match(b, /Forme de la fiche non lue : état indisponible\./);
  assert.match(b, /Analyse d'avant-match non lu non lu non lu non lu Revue d'après-match non lu non lu non lu non lu/);
  assert.deepEqual(contexte.refus, []);
});
