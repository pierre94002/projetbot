/**
 * « Mes paris » dit pourquoi (correctif du règlement, 02/11/2026) — T-E1, rendu côté serveur, sans navigateur ni serveur
 * de développement (comme suiviParisEcran.test.mjs) ; `fetch` interdit (le composant n'appelle rien), rien écrit dans ui/.
 *   1. ReglementDeLaSelection rend la phrase du serveur telle quelle (réglé à la 90e, ou la raison de l'attente), et
 *      rien quand le serveur n'a rien à dire.
 *   2. MyBetsView le branche sous la sélection d'un pari simple (`reglement[0]`) et sous CHAQUE sélection d'un combiné,
 *      avec SON numéro (`reglement[i]` dans la boucle des sélections) ; les boutons Gagné / Perdu / Annulé restent.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SERVEUR, RACINE_ESSAIS } from './aides/isolement.mjs';

const UI = path.resolve(SERVEUR, '..', 'ui');
const pret = ['vite', '@vitejs/plugin-vue', 'vue'].every((p) => fs.existsSync(path.join(UI, 'node_modules', p)));
const options = { skip: pret ? false : 'ui/node_modules (vite, plugin-vue, vue) manque' };
const imp = (chemin) => import(pathToFileURL(chemin).href);
const lireUi = (...p) => fs.readFileSync(path.join(UI, 'src', ...p), 'utf8');

const A_LA_90E = { etat: 'regle-a-la-90e', code: 'regle-a-la-90e', texte: 'Réglé sur le score à la 90e (prolongation non comptée) : 1-1, recompté but par but dans le déroulé FotMob du match, comme chez les bookmakers.' };
const ATTENTE = { etat: 'en-attente', code: 'prolongation-deroule-incomplet', texte: "En attente : le match est allé en prolongation, et FotMob n'a pas donné la minute de tous les buts. Le score à la 90e n'est pas sûr : réglez ce pari à la main." };

let contexte = null;
const appels = [];
let fetchOriginal;
before(async () => {
  if (!pret) return;
  fetchOriginal = globalThis.fetch;
  globalThis.fetch = async (url) => {
    appels.push(String(url));
    throw new Error(`fetch interdit dans ce rendu : ${url}`);
  };
  const { createServer } = await imp(path.join(UI, 'node_modules', 'vite', 'dist', 'node', 'index.js'));
  const vuePlugin = (await imp(path.join(UI, 'node_modules', '@vitejs', 'plugin-vue', 'dist', 'index.mjs'))).default;
  const { renderToString } = await imp(path.join(UI, 'node_modules', 'vue', 'server-renderer', 'index.mjs'));
  const { createSSRApp, h } = await imp(path.join(UI, 'node_modules', 'vue', 'index.mjs'));
  fs.mkdirSync(RACINE_ESSAIS, { recursive: true });
  const cache = fs.mkdtempSync(path.join(RACINE_ESSAIS, 'cm-rendu-'));
  const vite = await createServer({
    configFile: false,
    root: UI,
    logLevel: 'error',
    appType: 'custom',
    cacheDir: cache,
    server: { middlewareMode: true, watch: null, hmr: false },
    plugins: [vuePlugin()],
    resolve: { alias: { '@': path.join(UI, 'src') } }
  });
  const Composant = (await vite.ssrLoadModule('/src/components/betting/ReglementDeLaSelection.vue')).default;
  const nettoyer = (html) => html.replace(/ data-v-[a-z0-9]+(?==|\s|>)/g, '');
  contexte = {
    vite,
    cache,
    rendre: async (props) => nettoyer(await renderToString(createSSRApp({ render: () => h(Composant, props) })))
  };
});

after(async () => {
  if (fetchOriginal) globalThis.fetch = fetchOriginal;
  if (contexte) {
    await contexte.vite.close();
    fs.rmSync(contexte.cache, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

const texteDe = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

test('T-E1 la phrase du serveur sous la sélection : réglé à la 90e, la raison d’une attente, rien sinon ; MyBetsView branché par numéro', options, async () => {
  const regle = await contexte.rendre({ reglement: A_LA_90E });
  assert.equal(texteDe(regle), A_LA_90E.texte);
  assert.match(regle, /class="reglement-selection is-regle-a-la-90e"/);
  assert.match(regle, /data-code="regle-a-la-90e"/);
  const attend = await contexte.rendre({ reglement: ATTENTE });
  assert.equal(texteDe(attend), ATTENTE.texte);
  assert.match(attend, /is-en-attente/);
  for (const rien of [null, undefined, {}, { etat: 'en-attente', code: 'x' }]) {
    assert.equal(texteDe(await contexte.rendre({ reglement: rien })), '', `rien à dire : ${JSON.stringify(rien)}`);
  }
  const vide = /<path(?![^>]*\bd=)[^>]*>/.exec(regle + attend);
  assert.equal(vide, null, `une icône inconnue d'AppIcon : ${vide?.[0]}`);
  assert.deepEqual(appels, [], 'aucun appel réseau');

  // Le branchement dans Mes paris : le pari simple lit la sélection 0 ; le combiné, la sélection i de SA boucle.
  const page = lireUi('views', 'MyBetsView.vue');
  assert.match(page, /import ReglementDeLaSelection from '@\/components\/betting\/ReglementDeLaSelection\.vue';/);
  const simple = page.indexOf('<template v-if="bet.legs.length === 1">');
  const finSimple = page.indexOf('</template>', simple);
  assert.ok(simple > 0 && page.slice(simple, finSimple).includes('<ReglementDeLaSelection :reglement="bet.reglement?.[0]" />'), 'le pari simple : reglement[0]');
  const boucle = page.indexOf('<div v-for="(leg, i) in bet.legs" :key="i" class="bet-leg"');
  const finBoucle = page.indexOf('<span class="bet-status is-sm"', boucle);
  assert.ok(boucle > 0 && page.slice(boucle, finBoucle).includes('<ReglementDeLaSelection :reglement="bet.reglement?.[i]" />'), 'le combiné : reglement[i], dans la boucle de ses sélections');
  assert.equal(page.split('<ReglementDeLaSelection').length - 1, 2, 'deux emplacements, pas plus');
  // Les boutons d'avant restent (simple et combiné).
  for (const bouton of ["setLegStatus(bet, 0, 'won')", "setLegStatus(bet, 0, 'lost')", "setLegStatus(bet, 0, 'void')", "setLegStatus(bet, i, 'won')", "setLegStatus(bet, i, 'lost')", "setLegStatus(bet, i, 'void')"]) {
    assert.ok(page.includes(bouton), bouton);
  }
});
