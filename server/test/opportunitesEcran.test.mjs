/**
 * La page « Opportunités du jour » SE REND (étape 8 du plan) — rendu côté serveur, sans navigateur ni serveur de
 * développement, comme langageParisEcran.test.mjs : `fetch` remplacé (tout appel hors liste refusé et compté), routeur
 * de l'appli remplacé par un faux, horloge de l'appli figée au 6 octobre 2026, 10 h (heure locale), rien écrit dans ui/.
 * Les réponses du serveur sont FABRIQUÉES (test/aides/donneesOpportunites.mjs).
 *
 *  1. La page : un pari par ligne, la seule value verte en tête, la raison de chaque autre (pas retenue, à rafraîchir,
 *     juge et partie, cote trop haute, pas de cote chez vos bookmakers), la probabilité et la cote juste, la cote de vos
 *     bookmakers et son heure, le mouvement, la composition, le compte à rebours, la confiance « pas encore mesurée ».
 *  2. L'heure qui tourne : la pastille verte passe d'elle-même « à rafraîchir ».
 *  3. Favoris en tête ; « ce qui manque » quand aucune cote de vos bookmakers ; calcul en cours ; serveur injoignable.
 *  4. Le Repérage avec le verdict du moteur : le vert suit le verdict (juge et partie écarté).
 *  5. Le câblage : onglet de la page Matchs, adresse /opportunites, Mes paris (même pastille), hygiène du style.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SERVEUR, RACINE_ESSAIS } from './aides/isolement.mjs';
import * as D from './aides/donneesOpportunites.mjs';
import * as P from './aides/donneesEcransParis.mjs';

const UI = path.resolve(SERVEUR, '..', 'ui');
const pret = ['vite', '@vitejs/plugin-vue', 'vue', 'pinia', 'vue-router'].every((p) => fs.existsSync(path.join(UI, 'node_modules', p)));
const imp = (chemin) => import(pathToFileURL(chemin).href);
const options = { skip: pret ? false : 'ui/node_modules (vite, plugin-vue, vue, pinia, vue-router) manque' };
const MIN = 60_000;
const H = 3_600_000;

/** Les seuls appels permis (le reste est refusé et compté) : la page, les sources, et pour le Repérage ses deux lectures. */
const AUTORISES = [/\/api\/opportunities(\?|$)/, /\/api\/sources$/, /\/api\/odds\/conseil-releve$/, /\/api\/screener(\?|$)/, /\/api\/config$/];
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
  // L'horloge de l'appli et le suivi d'un calcul arment des minuteurs : « unref », sinon le processus ne se termine pas.
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
    if (/\/api\/opportunities/.test(u)) {
      if (scenario.page === 'injoignable') throw new TypeError('Failed to fetch');
      return reponseJson(scenario.page ?? D.opportunites());
    }
    if (/\/api\/odds\/conseil-releve$/.test(u)) return reponseJson({ error: 'pas de conseil dans ce rendu' }, 503);
    if (/\/api\/screener/.test(u)) return reponseJson(scenario.reperage ?? P.reperage());
    if (/\/api\/config$/.test(u)) return reponseJson(P.configurationMoteur());
    return reponseJson(P.origines());
  };
  console.warn = (...a) => avertissements.push(a.map(String).join(' ').slice(0, 300));

  const { createServer } = await imp(path.join(UI, 'node_modules', 'vite', 'dist', 'node', 'index.js'));
  const vuePlugin = (await imp(path.join(UI, 'node_modules', '@vitejs', 'plugin-vue', 'dist', 'index.mjs'))).default;
  const { renderToString } = await imp(path.join(UI, 'node_modules', 'vue', 'server-renderer', 'index.mjs'));
  const { createSSRApp, h } = await imp(path.join(UI, 'node_modules', 'vue', 'index.mjs'));
  const { createPinia } = await imp(path.join(UI, 'node_modules', 'pinia', 'dist', 'pinia.mjs'));
  const { createRouter, createMemoryHistory } = await imp(path.join(UI, 'node_modules', 'vue-router', 'dist', 'vue-router.mjs'));

  // Le rendu attend le chargement : onMounted ne s'exécute pas côté serveur, onServerPrefetch si.
  const prefetch = {
    name: 'ssr-prefetch',
    enforce: 'pre',
    transform(code, id) {
      if (!/(OpportunitiesView|ScreenerView)\.vue$/.test(id) || id.includes('?')) return null;
      return code.replace(/import \{ ([^}]*)\bonMounted\b([^}]*)\} from 'vue';/, (m, a, b) => `import { ${a}onMounted, onServerPrefetch${b}} from 'vue';`).replace(/onMounted\(/g, 'onServerPrefetch(');
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
  const charger = async (chemin) => (await vite.ssrLoadModule(chemin)).default;
  const routeur = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:chemin(.*)*', component: { render: () => null } }] });
  await routeur.push('/');
  await routeur.isReady();
  const horloge = await vite.ssrLoadModule('/src/utils/liveClock.js');
  const { useFavoritesStore } = await vite.ssrLoadModule('/src/stores/favoritesStore.js');
  contexte = {
    vite,
    cache,
    composants: {
      OpportunitiesView: await charger('/src/views/OpportunitiesView.vue'),
      ScreenerView: await charger('/src/views/ScreenerView.vue')
    },
    /** Rend une page : { html, texte, avertissements }. `heure` : l'horloge de l'appli ; `favoris` : { teams, leagues }. */
    async rendre(composant, { heure = D.MAINTENANT, favoris = null } = {}) {
      const avant = avertissements.length;
      horloge.liveNow.value = heure;
      const app = createSSRApp({ render: () => h(composant) });
      const pinia = createPinia();
      app.use(pinia);
      app.use(routeur);
      if (favoris) useFavoritesStore(pinia).$patch({ teams: favoris.teams ?? [], leagues: favoris.leagues ?? [], loaded: true });
      const html = await renderToString(app);
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
const decoder = (v) => v.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
/** Les lignes du tableau (après l'en-tête), chacune en HTML. */
const rangees = (html) => html.split(/<tr\b/).slice(2);
const ordreDes = (html, noms) => rangees(html).map((r) => noms.find((n) => r.includes(n)) ?? '?');
const NOMS = ['Arsenal', 'Leeds', 'Real Madrid', 'Lyon', 'Fulham', 'Milan'];
const lireUi = (...p) => fs.readFileSync(path.join(UI, 'src', ...p), 'utf8');

// ------------------------------------------------------------- 1. la page

test('la page : un pari par ligne, la seule value verte en tête, la raison de chaque autre, et tout ce qu’une ligne doit dire', options, async () => {
  scenario = {};
  appels.length = 0;
  const { rendre, composants } = contexte;
  const r = await rendre(composants.OpportunitiesView);
  assert.deepEqual(r.avertissements, [], 'avertissements de Vue');
  // Triée par value : la verte, puis les lectures réelles (à rafraîchir +5,4, pas retenue +3,0), puis l'écarté (juge, cote trop haute), puis la chute seule.
  assert.deepEqual(ordreDes(r.html, NOMS), ['Arsenal', 'Real Madrid', 'Leeds', 'Lyon', 'Fulham', 'Milan']);
  // LE vert : une seule pastille, celle d'Arsenal gagne.
  assert.equal(compter(r.html, /vbadge is-value /g), 1);
  const ligne = (nom) => rangees(r.html).find((x) => x.includes(nom));
  assert.ok(ligne('Arsenal').includes('vbadge is-value '));
  assert.match(texteDe(ligne('Arsenal')), /Arsenal gagne Résultat 38,7 % cote juste 2\.58 2\.75 Unibet \(NL\) relevée il y a 10 min Value \+6,4 % −12,0 % chute · 3 sur 3 Compo officielle dans 3 h 20 pas encore mesurée/);
  assert.match(decoder(ligne('Arsenal')), /aria-label="Value : Unibet \(NL\) paie 2\.75 pour une cote juste de 2\.58, soit un avantage de \+6,4 %, au-dessus du seuil de 2 % du moteur\."/);
  // Chaque autre dit pourquoi, jamais en vert.
  assert.match(texteDe(ligne('Leeds')), /Match nul .* \+3,0 % pas retenue/);
  assert.ok(ligne('Leeds').includes('vbadge is-value-secondaire'));
  assert.match(texteDe(ligne('Real Madrid')), /\+5,4 % à rafraîchir/);
  assert.ok(ligne('Real Madrid').includes('vbadge is-a-rafraichir'));
  assert.match(decoder(ligne('Real Madrid')), /Cote à rafraîchir : Relevée il y a 4 h, au-delà du délai de 3 h/);
  assert.match(texteDe(ligne('Lyon')), /2\.45 Betsson relevée il y a 10 min \+4,3 % juge et partie .* Dernière alignée/);
  assert.ok(ligne('Lyon').includes('vbadge is-juge'));
  assert.match(texteDe(ligne('Fulham')), /\+3,8 % cote trop haute/);
  // La chute sans cote chez vos bookmakers : dite, sans pastille de value.
  assert.match(texteDe(ligne('Milan')), /heure à confirmer .* Plus de 2,5 buts Buts 55 % cote juste 1\.82 pas de cote chez vos bookmakers pas de verdict −8,0 % chute · 2 sur 2 Compo non publiée dans 2 jours/);
  assert.ok(!ligne('Milan').includes('vbadge'));
  // La confiance : pas encore mesurée, sur chaque ligne (étape 38), jamais un niveau.
  assert.equal(compter(r.html, /cgauge is-non-mesuree/g), 6);
  // Le bandeau : les comptes, la value jouable (neutre), les chutes, le prochain coup d'envoi.
  assert.match(r.texte, /Opportunités du jour 6 paris 1 value jouable 2 chutes de cote Prochain match Arsenal – Chelsea dans 3 h 20/);
  // La provenance : le moteur, vos cotes (The Odds API, payant), les mouvements (relevés gratuits).
  assert.match(r.texte, /Moteur Moteur CôteMaster · magasin FotMob et cotes relevées Calculé à 09:35 en 1 min 20 s/);
  assert.match(r.texte, /Cotes de vos bookmakers The Odds API relevé aujourd'hui à 09:50 payant/);
  assert.match(r.texte, /Mouvements ESPN, football-data\.co\.uk, Kalshi relevé aujourd'hui à 09:48/);
  // La notification : l'interrupteur, et ce qu'en dit le navigateur (ici, aucun : rendu sans navigateur).
  assert.match(r.texte, /Me prévenir d'une nouvelle value verte Notification Windows, sans son, une par opportunité Ce navigateur ne sait pas afficher de notification/);
  // Les filtres.
  for (const champ of ['Compétition', 'Marché', 'Value minimale', 'Période']) assert.match(r.texte, new RegExp(champ));
  // Ce qui manque : un match sans vos cotes, et les saisies à la main, dites.
  assert.match(r.texte, /1 match sur 6 n'a aucune cote de vos bookmakers/);
  assert.match(r.texte, /Les cotes saisies à la main \(page du match, saisie express\) ne sont pas dans cette liste/);
  // Les bulles d'aide : cote juste, value, sûr / fragile, juge et partie.
  const aides = [...r.html.matchAll(/class="helptip__btn"[^>]*aria-label="([^"]*)"|aria-label="([^"]*)"[^>]*class="helptip__btn"/g)].map((m) => decoder(m[1] ?? m[2]));
  assert.deepEqual(aides.sort(), ["Qu'est-ce que « Cote juste » ?", "Qu'est-ce que « Juge et partie » ?", "Qu'est-ce que « Sûr / fragile » ?", "Qu'est-ce que « Value » ?"]);
  // Un clic sur un match ouvre sa page.
  assert.match(r.html, /href="\/match-a-venir\/odds-arsenal-chelsea"/);
  // Le vert n'existe nulle part ailleurs sur la page.
  assert.doesNotMatch(r.html, /cm-positive|cm-negative|is-accent/);
  assert.deepEqual([...new Set(appels.map((u) => u.replace(/^https?:\/\/[^/]+/, '')))].sort(), ['/api/opportunities', '/api/sources']);
});

test('l’heure qui tourne : trois heures après son relevé, la value d’Arsenal passe d’elle-même « à rafraîchir » — plus aucun vert', options, async () => {
  scenario = {};
  const { rendre, composants } = contexte;
  const r = await rendre(composants.OpportunitiesView, { heure: D.MAINTENANT + 3 * H });
  assert.deepEqual(r.avertissements, []);
  assert.equal(compter(r.html, /vbadge is-value /g), 0);
  const arsenal = rangees(r.html).find((x) => x.includes('Arsenal'));
  assert.ok(arsenal.includes('vbadge is-a-rafraichir'));
  assert.match(decoder(arsenal), /Cote à rafraîchir : Relevée il y a 3 h 10, au-delà du délai de 3 h : à relever de nouveau avant de parier\. Au dernier relevé, l'avantage chez Unibet \(NL\) était de \+6,4 %/);
  assert.match(r.texte, /0 value jouable/);
});

test('favoris en tête : la ligne d’une équipe favorite, puis celles d’un championnat favori, puis les autres — triées par value dans chaque bloc', options, async () => {
  scenario = {};
  const { rendre, composants } = contexte;
  const r = await rendre(composants.OpportunitiesView, { favoris: { teams: [{ id: 'fotmob-9748', name: 'Lyon', league: 'Ligue 1 - France', aliases: [] }], leagues: [{ name: 'Serie A - Italy' }] } });
  assert.deepEqual(r.avertissements, []);
  assert.deepEqual(ordreDes(r.html, NOMS), ['Lyon', 'Milan', 'Arsenal', 'Real Madrid', 'Leeds', 'Fulham']);
  const favorites = rangees(r.html).filter((x) => /^[^>]*class="is-favorite"/.test(x));
  assert.equal(favorites.length, 2, 'les deux lignes favorites sont marquées');
  assert.match(r.texte, /vos favoris en tête/);
});

test('aucune cote de vos bookmakers (relevé du 21/09) : la page le dit, avec le conseil de relevé ; les chutes restent', options, async () => {
  scenario = { page: D.opportunites({ sansVosCotes: true }) };
  appels.length = 0;
  const { rendre, composants } = contexte;
  const r = await rendre(composants.OpportunitiesView);
  assert.deepEqual(r.avertissements, []);
  assert.match(r.texte, /Aucune cote de vos bookmakers pour les matchs des 7 prochains jours : le dernier relevé The Odds API date du 21\/09 à 18:35\. Sans relevé, aucune value ne peut se lire/);
  assert.ok(r.html.includes('paidadvice') || /conseil|Relevé/i.test(r.texte), 'le conseil de relevé est posé');
  assert.deepEqual(ordreDes(r.html, NOMS), ['Milan']);
  assert.equal(compter(r.html, /vbadge/g), 0);
  assert.match(r.texte, /The Odds API relevé le 21\/09 à 18:35 · il y a 15 jours payant/);
});

test('premier calcul en cours : l’avancement ; serveur injoignable : dit, avec « Réessayer » — jamais une liste vide sans raison', options, async () => {
  const { rendre, composants } = contexte;
  scenario = { page: D.enCalcul() };
  const calcul = await rendre(composants.OpportunitiesView);
  assert.deepEqual(calcul.avertissements, []);
  assert.match(calcul.texte, /Le moteur passe en revue les matchs de la semaine .* 120 matchs sur 370 analysés/);
  assert.match(calcul.texte, /Calcul en cours · 32 %/);
  scenario = { page: 'injoignable' };
  const panne = await rendre(composants.OpportunitiesView);
  assert.deepEqual(panne.avertissements, []);
  assert.match(panne.texte, /Opportunités indisponibles Failed to fetch Vérifiez que CôteMaster tourne, puis réessayez\. Réessayer/);
});

// ------------------------------------------ 2. le Repérage, avec le verdict du moteur

test('Repérage : avec le verdict du moteur, le vert le suit — Arsenal (vert avant l’étape 8) n’est plus vert, son bookmaker ayant fixé la cote juste ; une value chez un autre bookmaker que la meilleure cote est dite', options, async () => {
  const reperage = P.reperage();
  const arsenal = reperage.data.matches.find((m) => m.matchId === 'odds-arsenal-chelsea');
  const accueil = arsenal.markets.find((k) => k.key === 'home');
  accueil.verdict = {
    etat: 'juge',
    vert: false,
    pourcent: 19.6,
    cote: 2.3,
    coteNette: 2.3,
    bookmaker: 'williamhill',
    bookmakerTitle: 'William Hill',
    fraicheur: null,
    juges: { palier: 'palier 3', livres: ['William Hill', 'Betsson'], cles: ['williamhill', 'betsson'] },
    offreJuge: null,
    raison: "William Hill a servi à fixer la cote juste de ce match (palier 3 : William Hill, Betsson) : sa cote, c'est la cote juste plus sa marge — juge et partie, jamais une value."
  };
  // Real Madrid : la meilleure cote est chez Coolbet (6,50), mais Coolbet a fixé la cote juste ; le moteur retient Unibet à 4,60.
  const real = reperage.data.matches.find((m) => m.matchId === 'odds-real-betis').markets.find((k) => k.key === 'home');
  real.verdict = {
    etat: 'value',
    vert: true,
    pourcent: 3.1,
    cote: 4.6,
    coteNette: 4.6,
    bookmaker: 'unibet_nl',
    bookmakerTitle: 'Unibet (NL)',
    fraicheur: null,
    offreJuge: { bookmaker: 'coolbet', bookmakerTitle: 'Coolbet', cote: 6.5, coteNette: 6.5, pourcent: 45.7 },
    raison: 'Value : Unibet (NL) paie 4.60 pour une cote juste de 4.46, soit un avantage de +3,1 %, au-dessus du seuil de 2 % du moteur. Coolbet paie davantage (6.50) mais a servi à fixer la cote juste (palier 3 : Coolbet, Tipico (DE)) : écarté, juge et partie.'
  };
  scenario = { reperage };
  const { rendre, composants } = contexte;
  const r = await rendre(composants.ScreenerView);
  assert.deepEqual(r.avertissements, []);
  // Marché « Victoire à domicile » (le premier) : Arsenal n'est plus vert — juge et partie.
  const ligneArsenal = rangees(r.html).find((x) => x.includes('Arsenal'));
  assert.ok(ligneArsenal.includes('vbadge is-juge'));
  assert.equal(compter(r.html, /vbadge is-value /g), 1, 'un seul vert : celui que le moteur retient (Real Madrid chez Unibet)');
  assert.match(texteDe(ligneArsenal), /2\.30 William Hill valeur \+19,6 % juge et partie/);
  assert.match(decoder(ligneArsenal), /aria-label="William Hill a servi à fixer la cote juste de ce match/);
  assert.doesNotMatch(decoder(ligneArsenal), /la page du match le vérifie/, 'la limite du Repérage est levée quand le verdict est là');
  // Les autres matchs, sans verdict (serveur d'avant l'étape 8) : la lecture d'avant, inchangée.
  assert.ok(rangees(r.html).find((x) => x.includes('Lyon')).includes('vbadge is-trop-beau'));
  // Real Madrid : la cote que le moteur a jugée (Unibet 4,60), pas la meilleure de tous (Coolbet 6,50, juge et partie) — dit.
  const ligneReal = rangees(r.html).find((x) => x.includes('Real Madrid'));
  assert.ok(ligneReal.includes('vbadge is-value '));
  assert.match(texteDe(ligneReal), /4\.60 Unibet \(NL\) valeur \+3,1 % Coolbet 6\.50 écarté \(juge et partie\)/);
  assert.doesNotMatch(texteDe(ligneReal), /6\.50 Coolbet valeur/);
  // La phrase de la pastille est celle du verdict : elle nomme Unibet, jamais « Cote de Coolbet », sans la précision d'avant l'étape 8.
  assert.match(decoder(ligneReal), /aria-label="Value : Unibet \(NL\) paie 4\.60 pour une cote juste de 4\.46, soit un avantage de \+3,1 %, au-dessus du seuil de 2 % du moteur\. Coolbet paie davantage \(6\.50\) mais a servi à fixer la cote juste \(palier 3 : Coolbet, Tipico \(DE\)\) : écarté, juge et partie\."/);
  assert.doesNotMatch(decoder(ligneReal), /Cote de Coolbet|la page du match le vérifie/);
  const source = lireUi('views', 'ScreenerView.vue');
  assert.match(source, /:verdict="r\.verdict"/);
  assert.match(source, /:fraicheur="r\.fraicheur"/);
});

// ------------------------------------------------------------ 3. le câblage

test('câblage : l’onglet « Opportunités » de la page Matchs, l’adresse /opportunites, la surveillance montée une fois ; Mes paris pose la même pastille', options, () => {
  const matchs = lireUi('views', 'MatchesView.vue');
  assert.match(matchs, /\{ value: 'opportunites', label: 'Opportunités' \}/);
  assert.match(matchs, /<OpportunitiesView v-else-if="activeTab === 'opportunites'" key="opportunites" \/>/);
  assert.match(matchs, /watch\(\s*\(\) => route\.query\.onglet,/);
  const routeur = lireUi('router', 'index.js');
  assert.match(routeur, /path: '\/opportunites',[\s\S]*?redirect: \{ path: '\/matches', query: \{ onglet: 'opportunites' \} \}/);
  // Le menu garde ses cinq sections ; l'étape 24 (14/10/2026) y ajoute « Santé du moteur » (même couleur qu'Historique moteur), l'étape 31
  // (22/10/2026) « Bookmakers » (même couleur que Mes paris) : sept entrées.
  assert.equal(compter(lireUi('components', 'layout', 'AppSidebar.vue'), /\{ to: '\//g), 7);
  // Mes paris : la pastille du verdict, le même que la page ; l'avantage n'est plus vert à part.
  const mesParis = lireUi('views', 'MyBetsView.vue');
  assert.match(mesParis, /verdict: data\.verdicts\?\.\[pari\.outcome\] \?\? null,/);
  assert.match(mesParis, /<ValueBadge v-if="c\.verdict" taille="sm" :verdict="c\.verdict" :fraicheur="c\.verdict\.fraicheur \?\? null"/);
  assert.match(mesParis, /<dd class="cm-numeric figure__edge">/);
  assert.match(mesParis, /<RouterLink to="\/opportunites"/);
  const styleMesParis = mesParis.slice(mesParis.indexOf('<style'));
  const probabilite = /\.probability \{([^}]*)\}/.exec(styleMesParis)?.[1] ?? '';
  assert.doesNotMatch(probabilite, /--cm-accent/, 'la probabilité juste n’est plus verte');
});

test('hygiène de la page : aucune couleur en dur, aucun !important, aucune police sous 10 px, seulement des jetons existants, jamais le vert', options, () => {
  const source = lireUi('views', 'OpportunitiesView.vue');
  const css = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(css.length > 500);
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(css, /\brgba?\(\s*\d/);
  assert.doesNotMatch(css, /!important/);
  for (const [, taille] of css.matchAll(/font-size:\s*([\d.]+)px/g)) assert.ok(Number(taille) >= 10, `police de ${taille}px`);
  const tokens = fs.readFileSync(path.join(UI, 'src', 'assets', 'styles', 'tokens.css'), 'utf8');
  for (const [, jeton] of css.matchAll(/var\((--cm-[a-z0-9-]+)/g)) assert.ok(tokens.includes(`${jeton}:`), `le jeton ${jeton} n'existe pas`);
  assert.doesNotMatch(css, /--cm-accent|cm-positive/);
  // Les icônes nommées existent.
  const icones = lireUi('components', 'common', 'AppIcon.vue');
  for (const [, nom] of source.matchAll(/<AppIcon name="(\w+)"/g)) assert.ok(new RegExp(`\\b${nom}\\b`).test(icones), `icône ${nom}`);
  // Chaque pastille de value de la page reçoit le verdict ET la fraîcheur de sa cote.
  for (const m of source.matchAll(/<ValueBadge\b([\s\S]*?)\/?>/g)) {
    assert.match(m[1], /:verdict="/);
    assert.match(m[1], /:fraicheur="/);
  }
});

test('aucun appel hors liste pendant ces rendus — ni API payante, ni FotMob, ni Claude, ni la vraie appli — et aucun avertissement de Vue', options, () => {
  assert.deepEqual(interdits, []);
  assert.deepEqual(avertissements, []);
  assert.ok(appels.length >= 8, `${appels.length} appels simulés`);
});
