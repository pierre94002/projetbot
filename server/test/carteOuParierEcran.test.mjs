/**
 * La carte « où parier » à l'écran (étape 23 du plan, 22/10/2026) : ses règles d'écran et son rendu.
 *   node --test test/carteOuParierEcran.test.mjs        (depuis server/)
 *
 *  1. Les règles de l'écran (ui/src/utils/carteOuParier.js) : une case n'est verte à l'écran QUE si le serveur l'a
 *     dite verte et « prouvé » ; le texte court (« Trop peu · 46 / 200 ») ; la grille, ses Σ, les favoris en tête ;
 *     le bandeau honnête (« information, pas une panne ») et « pas encore mesuré ».
 *  2. Le rendu de la grille (BettingMapGrid) côté serveur, sans navigateur ni serveur de développement : `fetch`
 *     refusé et compté (la grille ne lit rien elle-même), Vite « middleware » sans port, cache dans le dossier
 *     d'essais — avec une carte (rouge, grises, une verte), et sans carte.
 *  3. Le câblage et l'hygiène : la couleur verte seulement dans BettingMapChip et seulement pour « Prouvé » ; la
 *     page Opportunités ne lit la grille qu'au clic ; le Repérage et Opportunités posent la puce.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SERVEUR, RACINE_ESSAIS } from './aides/isolement.mjs';
import * as M from '../src/data/bettingMap.js';
import * as C from '../src/data/bettingMapCalcul.js';
import { REGLE, PROVENANCE } from '../src/api/controllers/bettingMap.controller.js';

const UI = path.resolve(SERVEUR, '..', 'ui');
const pret = ['vite', '@vitejs/plugin-vue', 'vue', 'pinia'].every((p) => fs.existsSync(path.join(UI, 'node_modules', p)));
const imp = (chemin) => import(pathToFileURL(chemin).href);
const options = { skip: pret ? false : 'ui/node_modules (vite, plugin-vue, vue, pinia) manque' };
const E = await imp(path.join(UI, 'src', 'utils', 'carteOuParier.js'));
const lireUi = (...p) => fs.readFileSync(path.join(UI, 'src', ...p), 'utf8');
const sansEspaces = (s) => String(s).replace(/[  ]/g, ' ');
const texteDe = (html) => sansEspaces(html.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')).replace(/\s+/g, ' ').trim();

/** Une réponse de GET /api/betting-map fabriquée avec le VRAI calcul (construireLaCarte) et l'enveloppe de la route. */
function reponse({ verte = false } = {}) {
  const j = (verdict, matchs, gain, blocs = matchs) => ({ verdict, n: { matchs, blocs }, gain, enPourcent: { gain: gain * 100, fourchette: [(gain - 0.03) * 100, (gain + 0.03) * 100], quoi: 'de perte log en moins' }, variantes: 608 });
  const resume = {
    juge: { variantesCarte: 608 },
    carte: [
      { type: 'probabilites', tranche: 'P2', league: 'EPL', marketKey: 'totalGoals', ligne: 2.5, face: 'marche', n: 1520, juge: j('moins-bon', 1520, -0.065) },
      { type: 'probabilites', tranche: 'P2', league: 'EPL', marketKey: 'result', ligne: null, face: 'marche', n: 1520, juge: j('pas-prouve', 1520, 0.0003) },
      ...(verte ? [{ type: 'paris', zone: 'preuve', league: 'Serie B - Italy', marketKey: 'result', n: 600, juge: { ...j('retenu', 600, 0.031, 320), enPourcent: { gain: 3.1, fourchette: [0.4, 5.8], quoi: 'de valeur de clôture en plus' } } }] : [])
    ]
  };
  const lignes = Array.from({ length: 46 }, (_, k) => ({ bloc: `m${k}`, match: `m${k}`, a: 0, b: 0.001 }));
  const carte = C.construireLaCarte({
    banc: C.lectureDuBanc(resume, { rejeuId: 10 }),
    rejeu: { id: 10, etiquette: 'exact' },
    direct: { parCase: new Map([['MLS|result', lignes]]), pronostics: 3924, mesures: 977, ecartees: {}, ligues: new Set(['MLS']) },
    fenetre: C.fenetreDuDirect(null),
    moteur: { empreinte: 'e', empreinteReglages: 'r', version: 4 },
    maintenant: Date.parse('2026-11-01T07:00:00Z'),
    raison: 'mensuelle'
  });
  return { carte: { ...carte, id: 3 }, etat: 'ok', aJour: true, phrase: null, colonnes: M.COLONNES, groupes: M.GROUPES, raisons: M.RAISONS, epreuves: M.EPREUVES, minimum: M.MIN_MATCHS, regle: REGLE, provenance: PROVENANCE };
}

// ============================================== 1. les règles de l'écran

test('règles : une case n’est verte à l’écran QUE si le serveur l’a dite verte ET « prouvé » ; rouge que si rouge ET « moins bon » ; tout le reste gris', () => {
  assert.equal(E.ditDeLaCase({ couleur: 'vert', raison: 'prouve' }).ton, 'vert');
  assert.equal(E.ditDeLaCase({ couleur: 'gris', raison: 'prouve' }).ton, 'gris', 'un mot « prouvé » sans la couleur du serveur : gris');
  assert.equal(E.ditDeLaCase({ couleur: 'vert', raison: 'pas-prouve' }).ton, 'gris', 'une couleur sans le mot : gris');
  assert.equal(E.ditDeLaCase({ couleur: 'rouge', raison: 'moins-bon' }).ton, 'rouge');
  assert.equal(E.ditDeLaCase({ couleur: 'gris', raison: 'moins-bon' }).ton, 'gris');
  assert.equal(E.ditDeLaCase({ couleur: 'gris', raison: 'sans-cote' }).ton, 'hachure');
  assert.equal(E.ditDeLaCase({ raison: 'inconnue' }).mot, 'Pas prouvé');
  assert.equal(E.ditDeLaCase(null).ton, 'gris');
  assert.equal(sansEspaces(E.texteCourt({ couleur: 'gris', raison: 'trop-peu', matchs: 46 })), 'Trop peu · 46 / 200');
  assert.equal(sansEspaces(E.texteCourt({ couleur: 'rouge', raison: 'moins-bon', matchs: 2208 })), 'Moins bien · 2 208 matchs');
  assert.equal(E.texteCourt({ couleur: 'gris', raison: 'sans-cote', matchs: null }), 'Pas de cote');
  assert.equal(E.texteCourt({ couleur: 'gris', raison: 'pas-mesuree', matchs: null }), 'Pas mesurée');
  assert.equal(E.ecartDeLaCase({ couleur: 'rouge', epreuves: [{ id: 'H-PL', verdict: 'moins-bon', matchs: 9, enPourcent: { gain: -9.49 } }] }), '−9,5 %');
  assert.equal(E.ecartDeLaCase({ couleur: 'gris', epreuves: [] }), null);
});

test('règles : la grille (championnats × colonnes du groupe), ses Σ par couleur, les favoris en tête, le filtre « seulement les championnats jugés »', () => {
  const r = reponse();
  const g = E.grilleDeLaCarte(r, { groupe: 'buts' });
  assert.deepEqual(g.colonnes.map((c) => c.id), ['result', 'totalGoals:1.5', 'totalGoals:2.5', 'totalGoals:3.5', 'bothTeamsScore']);
  assert.deepEqual(g.lignes.map((l) => l.league), ['EPL', 'MLS'], 'les championnats jugés d’abord (EPL : une rouge), puis l’ordre alphabétique');
  assert.deepEqual(g.sommes[2], { vert: 0, rouge: 1, gris: 1 });
  assert.equal(g.total, 10);
  const fav = E.grilleDeLaCarte(r, { groupe: 'buts', favori: (l) => l === 'MLS' });
  assert.equal(fav.lignes[0].league, 'MLS');
  assert.equal(fav.lignes[0].favori, true);
  assert.deepEqual(E.grilleDeLaCarte(r, { groupe: 'buts', seulementJugees: true }).lignes.map((l) => l.league), ['EPL']);
  assert.equal(E.grilleDeLaCarte({ carte: null }), null);
  assert.equal(E.grilleDeLaCarte(r, { groupe: 'corners' }).colonnes.length, 2);
});

test('règles : le bandeau dit les comptes (Σ), « information, pas une panne » quand rien n’est vert, et « pas encore mesuré » sans carte', () => {
  const b = E.bandeauDeLaCarte(reponse());
  assert.equal(sansEspaces(b.titre), 'Carte de novembre 2026 : 0 case verte, 1 rouge, 25 grises (Σ 26)');
  assert.match(sansEspaces(b.phrase), /^Rien n’est prouvé gagnant aujourd’hui : c’est une information, pas une panne\. Il faut au moins 200 matchs dans une case pour juger ; la plus remplie en direct en a 46\.$/);
  const avecVerte = E.bandeauDeLaCarte(reponse({ verte: true }));
  assert.doesNotMatch(avecVerte.phrase, /pas une panne/);
  const sans = E.bandeauDeLaCarte({ carte: null, etat: 'pas-encore-mesure', phrase: 'Pas encore mesuré : … « Lancer le banc » …' });
  assert.equal(sans.titre, 'Pas encore mesuré');
  assert.match(sans.phrase, /Lancer le banc/);
  assert.match(E.provenanceDeLaCarte(reponse()), /^banc d’essai n° 10 \(2019-2023\) · direct : 977 pronostics mesurés sur 3.924 gelés · juge de l’étape 16 : 1 case jugée × 24 regards · calculée le 01\/11\/2026$/);
  assert.equal(E.championnatsAAjouter(reponse()).length, 0);
});

// ============================================== 2. le rendu de la grille

let contexte;
const interdits = [];
let originaux = {};

before(async () => {
  if (!pret) return;
  originaux = { fetch: globalThis.fetch, setInterval: globalThis.setInterval, setTimeout: globalThis.setTimeout };
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
  globalThis.fetch = async (url) => {
    interdits.push(String(url));
    throw new Error(`fetch interdit dans ce rendu : ${url}`);
  };
  const { createServer } = await imp(path.join(UI, 'node_modules', 'vite', 'dist', 'node', 'index.js'));
  const vuePlugin = (await imp(path.join(UI, 'node_modules', '@vitejs', 'plugin-vue', 'dist', 'index.mjs'))).default;
  const { renderToString } = await imp(path.join(UI, 'node_modules', 'vue', 'server-renderer', 'index.mjs'));
  const { createSSRApp, h } = await imp(path.join(UI, 'node_modules', 'vue', 'index.mjs'));
  const { createPinia } = await imp(path.join(UI, 'node_modules', 'pinia', 'dist', 'pinia.mjs'));
  fs.mkdirSync(RACINE_ESSAIS, { recursive: true });
  const cache = fs.mkdtempSync(path.join(RACINE_ESSAIS, 'cm-rendu-carte-'));
  const vite = await createServer({ configFile: false, root: UI, logLevel: 'error', appType: 'custom', cacheDir: cache, server: { middlewareMode: true, watch: null, hmr: false, ws: false }, plugins: [vuePlugin()], resolve: { alias: { '@': path.join(UI, 'src') } } });
  const Grille = (await vite.ssrLoadModule('/src/components/analysis/BettingMapGrid.vue')).default;
  const Puce = (await vite.ssrLoadModule('/src/components/common/BettingMapChip.vue')).default;
  contexte = {
    vite,
    cache,
    async rendre(composant, props) {
      const app = createSSRApp({ render: () => h(composant === 'puce' ? Puce : Grille, props) });
      app.use(createPinia());
      const html = await renderToString(app);
      const vide = /<path(?![^>]*\bd=)[^>]*>/.exec(html);
      assert.equal(vide, null, `une icône inconnue d'AppIcon : ${vide?.[0]}`);
      return { html, texte: texteDe(html) };
    }
  };
});

after(async () => {
  if (!pret) return;
  globalThis.fetch = originaux.fetch;
  globalThis.setInterval = originaux.setInterval;
  globalThis.setTimeout = originaux.setTimeout;
  if (!contexte) return;
  await contexte.vite.close();
  fs.rmSync(contexte.cache, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

test('rendu : la grille avec une carte — bandeau, colonnes du groupe, la case rouge dite en mots, Σ, la règle ; aucun appel réseau', options, async () => {
  const { html, texte } = await contexte.rendre('grille', { reponse: reponse() });
  assert.match(texte, /Carte de novembre 2026 : 0 case verte, 1 rouge, 25 grises \(Σ 26\)/);
  assert.match(texte, /Rien n’est prouvé gagnant aujourd’hui : c’est une information, pas une panne\./);
  const entete = html.split('<thead')[1].split('</thead>')[0];
  assert.deepEqual([...entete.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map((m) => m[1].trim()), ['Championnat', '1N2', '± 1,5', '± 2,5', '± 3,5', '2 marquent']);
  assert.match(html, /class="bmc bmc--rouge"/);
  assert.doesNotMatch(html, /bmc--vert/, 'aucune case verte : aucun vert');
  assert.match(texte, /Moins bien · 1 520 matchs −6,5 %/);
  assert.match(texte, /Trop peu · 46 \/ 200/);
  assert.match(texte, /Pas mesurée/);
  assert.match(html, /role="note" aria-label="Carte « où parier » : Moins bien que le marché : ici le moteur se trompe plus que la cote/);
  assert.match(texte, /Σ 2 championnats 0 · 0 · 2 0 · 0 · 2 0 · 1 · 1/);
  assert.match(texte, /Verte seulement si l’avantage du moteur AU PRIX est prouvé/);
  assert.deepEqual(interdits, []);
});

test('rendu : une case « Prouvé » en vert (le vert de la value, avec son mot et sa coche) ; une puce compacte ne dit que le mot', options, async () => {
  const { html, texte } = await contexte.rendre('grille', { reponse: reponse({ verte: true }) });
  assert.match(html, /class="bmc bmc--vert"/);
  assert.match(texte, /Prouvé · 600 matchs \+3,1 %/);
  const p = await contexte.rendre('puce', { caseCarte: { couleur: 'vert', raison: 'prouve', matchs: 600, phrase: 'Prouvé : …' }, compacte: true });
  assert.equal(p.texte, 'Prouvé');
  const g = await contexte.rendre('puce', { caseCarte: { couleur: 'vert', raison: 'pas-prouve', matchs: 600, phrase: '…' } });
  assert.doesNotMatch(g.html, /bmc--vert/, 'vert sans « prouvé » : jamais vert');
});

test('rendu : sans carte — « Pas encore mesuré » et quoi faire, pas de tableau', options, async () => {
  const { html, texte } = await contexte.rendre('grille', { reponse: { carte: null, etat: 'pas-encore-mesure', phrase: 'Pas encore mesuré : la carte a besoin d’un premier rejeu du banc d’essai. Ouvrez Historique moteur › Banc d’essai et cliquez « Lancer le banc ».', regle: REGLE } });
  assert.match(texte, /^Pas encore mesuré .*Pas encore mesuré : la carte a besoin d’un premier rejeu du banc d’essai\. .*« Lancer le banc »/);
  assert.doesNotMatch(html, /<table/);
});

// ============================================== 3. le câblage et l'hygiène

test('hygiène : le vert (--cm-accent) seulement dans BettingMapChip, seulement pour « .bmc--vert » ; ni vert ni couleur en dur dans la grille ; jetons existants', () => {
  const tokens = lireUi('assets', 'styles', 'tokens.css');
  const style = (s) => [...s.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
  const puce = style(lireUi('components', 'common', 'BettingMapChip.vue'));
  const regles = [...puce.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selecteur: m[1].trim(), corps: m[2] }));
  const vertes = regles.filter((x) => /--cm-accent/.test(x.corps));
  assert.ok(vertes.length >= 1);
  for (const x of vertes) assert.equal(x.selecteur, '.bmc--vert');
  const grille = style(lireUi('components', 'analysis', 'BettingMapGrid.vue'));
  for (const css of [puce, grille]) {
    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b|\brgba?\(\s*\d|!important/);
    for (const [, jeton] of css.matchAll(/var\((--cm-[a-z0-9-]+)/g)) assert.ok(tokens.includes(`${jeton}:`), `le jeton ${jeton} n'existe pas`);
    for (const [, taille] of css.matchAll(/font-size:\s*([\d.]+)px/g)) assert.ok(Number(taille) >= 10);
  }
  assert.doesNotMatch(grille, /--cm-accent/);
  for (const vue of ['OpportunitiesView.vue', 'ScreenerView.vue']) assert.doesNotMatch(style(lireUi('views', vue)), /--cm-accent|cm-positive/, vue);
  assert.match(fs.readFileSync(path.join(UI, 'DESIGN.md'), 'utf8'), /L'exception de l'étape 23 \(22\/10\/2026\) : « Prouvé » sur la carte « où parier »/);
});

test('câblage : Opportunités pose la puce et l’avertissement rouge, lit la grille AU CLIC seulement ; le Repérage pose la puce (vert/rouge) et trie « cases vertes d’abord »', () => {
  const o = lireUi('views', 'OpportunitiesView.vue');
  assert.match(o, /<BettingMapChip v-if="r\.l\.carte" :case-carte="r\.l\.carte" compacte/);
  assert.match(o, /<small v-if="r\.l\.carte\?\.couleur === 'rouge'" class="opps__avert" role="note">\{\{ r\.l\.carte\.phrase \}\}<\/small>/);
  assert.match(o, /async function afficherLaCarte\(\) \{[\s\S]*?bettingMapApi\.get\(\)/);
  const monte = o.slice(o.indexOf('onMounted('), o.indexOf('onBeforeUnmount('));
  assert.doesNotMatch(monte, /bettingMap|afficherLaCarte/, 'rien n’est lu au chargement de la page');
  assert.equal((o.match(/bettingMapApi\.get\(/g) ?? []).length, 1);
  const s = lireUi('views', 'ScreenerView.vue');
  assert.match(s, /<BettingMapChip v-if="r\.carte && r\.carte\.couleur !== 'gris'" :case-carte="r\.carte" compacte/);
  assert.match(s, /TRIS\.carte = 'Carte « où parier » \(cases vertes d’abord\)';/);
  assert.match(s, /if \(tri\.value === 'carte'\) rangees\.sort\(\(a, b\) => rangCarte\(a\.k\) - rangCarte\(b\.k\)\);/);
  assert.match(lireUi('services', 'bettingMapApi.js'), /httpClient\.get\(`\/betting-map/);
});
