/**
 * Le fil du match SE REND avec le penalty manqué que FotMob donne depuis
 * l'étape 43 (ui/src/components/matches/MatchEventList.vue).
 *   node --test test/deroulePourIAEcran.test.mjs        (depuis server/)
 *
 * Pourquoi : la lecture FotMob range maintenant un penalty manqué dans les
 * événements du match (type « missedpenalty »). Sans libellé, le fil de
 * l'écran l'aurait dessiné comme une carte VIDE. Rendu côté serveur, sans
 * navigateur ni serveur de développement : `fetch` est remplacé et refuse
 * tout, un Vite « middleware » n'écoute sur aucun port, son cache va dans le
 * dossier d'essais, rien n'est écrit dans ui/.
 *
 *  1. Le penalty manqué a son nom et sa mention ; le but contre son camp, le
 *     détail d'un but (« Penalty »), la passe, le carton et le remplacement sont
 *     dessinés comme avant ; aucune carte vide, aucun avertissement de Vue.
 *  2. Les événements d'AVANT l'étape (sans aucun champ neuf) se rendent à
 *     l'identique.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SERVEUR, RACINE_ESSAIS } from './aides/isolement.mjs';

const UI = path.resolve(SERVEUR, '..', 'ui');
const pret = ['vite', '@vitejs/plugin-vue', 'vue'].every((p) => fs.existsSync(path.join(UI, 'node_modules', p)));
const imp = (chemin) => import(pathToFileURL(chemin).href);
const options = { skip: pret ? false : 'ui/node_modules (vite, plugin-vue, vue) manque' };

const texteDe = (html) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/[  ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

let contexte;
const avertissements = [];
const refus = [];
let fetchOrigine;
let avertirOrigine;

before(async () => {
  if (!pret) return;
  fetchOrigine = globalThis.fetch;
  avertirOrigine = console.warn;
  globalThis.fetch = async (url) => {
    refus.push(String(url));
    throw new Error(`fetch interdit dans ce rendu : ${url}`);
  };
  console.warn = (...a) => avertissements.push(a.map(String).join(' ').slice(0, 300));
  const { createServer } = await imp(path.join(UI, 'node_modules', 'vite', 'dist', 'node', 'index.js'));
  const vuePlugin = (await imp(path.join(UI, 'node_modules', '@vitejs', 'plugin-vue', 'dist', 'index.mjs'))).default;
  const { renderToString } = await imp(path.join(UI, 'node_modules', 'vue', 'server-renderer', 'index.mjs'));
  const { createSSRApp } = await imp(path.join(UI, 'node_modules', 'vue', 'index.mjs'));
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
  const Fil = (await vite.ssrLoadModule('/src/components/matches/MatchEventList.vue')).default;
  contexte = {
    vite,
    cache,
    async fil(events) {
      const avant = avertissements.length;
      const html = await renderToString(createSSRApp(Fil, { events, homeName: 'Domicile', awayName: 'Extérieur', league: 'EPL', homeId: null, awayId: null }));
      return { html, texte: texteDe(html), avertissements: avertissements.slice(avant) };
    }
  };
});

after(async () => {
  globalThis.fetch = fetchOrigine;
  console.warn = avertirOrigine;
  if (!contexte) return;
  await contexte.vite.close();
  // Le dossier de cache ne contient aucun lien : suppression sans danger.
  fs.rmSync(contexte.cache, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

/** Le nombre de cartes d'événement qui portent un nom (tout sauf les remplacements). */
const nbCartesNommees = (html) => (html.match(/class="events__name"/g) ?? []).length;

const ANCIENS = [
  { type: 'goal', minute: 28, side: 'home', player: 'Josef Martínez', detail: 'Penalty' },
  { type: 'goal', minute: 79, side: 'home', player: 'Hakeem Odoffin', ownGoal: true, detail: 'Own goal' },
  { type: 'card', minute: 80, side: 'away', player: 'Dániel Pintér', card: 'yellow' },
  { type: 'substitution', minute: 83, side: 'home', addedTime: 0, playerIn: 'Jamal Thiaré', playerOut: 'Josef Martínez' }
];

test('le fil du match dessine un penalty manqué avec son nom et sa mention — jamais une carte vide —, et le reste comme avant', options, async () => {
  const neufs = [
    ...ANCIENS.slice(0, 2),
    { type: 'missedpenalty', minute: 57, side: 'home', player: 'Kevin Diks', playerId: 'fotmob-566158' },
    { type: 'missedpenalty', minute: 62, side: 'away', player: 'Joueur Z' },
    { type: 'card', minute: 70, side: 'away', player: 'Luis Barraza', card: 'yellow', note: 'not_on_pitch', reason: 'foul' },
    { type: 'substitution', minute: 65, side: 'away', addedTime: 0, playerIn: 'Danny da Costa', playerOut: 'Anthony Caci', injured: true }
  ];
  const { html, texte, avertissements: avert } = await contexte.fil(neufs);
  assert.deepEqual(avert, [], 'avertissements de Vue pendant le rendu');
  assert.match(texte, /Kevin Diks \(penalty manqué\)/);
  assert.match(texte, /Joueur Z \(penalty manqué\)/);
  assert.match(texte, /57'/);
  // Les penalties manqués sont des événements du fil (icône « ✕ »), de leur côté, avec leur minute.
  assert.equal((html.match(/events__icon--missedpenalty/g) ?? []).length, 2);
  assert.ok(html.includes('✕'));
  // Le but à penalty garde son détail, le but contre son camp son « (CSC) ».
  assert.match(texte, /Josef Martínez[^']*Penalty 28'/);
  assert.match(texte, /Hakeem Odoffin \(CSC\)/);
  // Un nom pour chaque événement qui n'est pas un remplacement : deux buts, deux penalties manqués, un carton.
  assert.equal(nbCartesNommees(html), 5);
  assert.match(texte, /Danny da Costa/);
  assert.deepEqual(refus, [], 'aucun appel réseau');
});

test('les événements d’AVANT l’étape (sans aucun champ neuf) se rendent comme avant : buts, détail, passe, carton, remplacement', options, async () => {
  const { html, texte, avertissements: avert } = await contexte.fil(ANCIENS);
  assert.deepEqual(avert, []);
  assert.equal(nbCartesNommees(html), 3);
  assert.match(texte, /Josef Martínez[^']*Penalty 28'/);
  assert.match(texte, /Hakeem Odoffin \(CSC\)[^']*Own goal 79'/);
  assert.match(texte, /80' EXT Dániel Pintér/);
  assert.ok(!html.includes('events__icon--missedpenalty'));
  assert.match(texte, /Jamal Thiaré/);
  assert.match(texte, /83'/);
  // Pas de déroulé du tout : l'écran le dit.
  const vide = await contexte.fil([]);
  assert.match(vide.texte, /Pas de fil du match/);
});
