/**
 * Le COMPARATEUR et le TICKET SE RENDENT (étape 10 du plan) — rendu côté serveur, sans navigateur ni serveur de
 * développement, comme pageMatchDecisionEcran.test.mjs : `fetch` remplacé (tout appel hors liste refusé et
 * compté), routeur de l'appli remplacé par un faux, horloge de l'appli figée, rien écrit dans ui/.
 *
 * Les réponses du serveur ne sont PAS écrites à la main : le VRAI serveur les produit (aides/script-page-match.mjs,
 * dans une copie isolée : moteur, base d'essai, relevé The Odds API, cotes gratuites et saisies FABRIQUÉS). Seuls
 * FotMob, le magasin de statistiques et l'avis de l'IA sont fabriqués (aides/donneesPageMatch.mjs).
 *
 *  1. La page du match : le comparateur dans la carte du verdict, sous le tableau ; une colonne par bookmaker, son
 *     heure, la pastille de chaque case (le verdict du serveur, mot pour mot), la cote minimale de chaque issue ;
 *     les cotes de référence à part ; le ticket vide ; l'heure qui tourne ; un match sans cote.
 *  2. Le ticket seul (TicketDuPari) : un simple pris dans le comparateur (cote prise, son heure, la cote minimale,
 *     le gain attendu, « J'ai parié chez William Hill »), un combiné du même match (sa cote à taper, l'étape 28,
 *     jamais de gain attendu), un pari sans cote de bookmaker, la version de Mes paris (sans mise ni bouton).
 *  3. Hygiène et câblage : aucune couleur en dur ni vert de value hors pastille ; les composants n'appellent rien ;
 *     « J'ai parié » passe par le carnet (betsStore) au clic seulement ; Mes paris donne au serveur les champs du
 *     ticket ; aucun appel hors liste ; aucun avertissement de Vue.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SERVEUR, RACINE_ESSAIS } from './aides/isolement.mjs';
import * as D from './aides/donneesPageMatch.mjs';

const UI = path.resolve(SERVEUR, '..', 'ui');
const pret = ['vite', '@vitejs/plugin-vue', 'vue', 'pinia', 'vue-router'].every((p) => fs.existsSync(path.join(UI, 'node_modules', p)));
const imp = (chemin) => import(pathToFileURL(chemin).href);
const options = { skip: pret ? false : 'ui/node_modules (vite, plugin-vue, vue, pinia, vue-router) manque' };
const { MIN, H } = D;
const T0 = D.MAINTENANT;

/** Les seuls appels permis pendant un rendu (le reste est refusé et compté) : jamais /api/bets, jamais un relevé. */
const AUTORISES = [
  /\/api\/matches(\?|\/)/,
  /\/api\/analysis\/match\//,
  /\/api\/match-stats\/(preview|team-averages|team\?|team-ids|odds-profile)/,
  /\/api\/match-ai-analysis\/(status|match\/)/,
  /\/api\/odds\/(fixture|saisies|conseil-releve|fraicheur)/,
  /\/api\/team-stats\/team-news/,
  /\/api\/match-notes\//
];
let P;
let scenario = {};
const appels = [];
const interdits = [];
const avertissements = [];
let contexte;
let originaux = {};

const reponseJson = (corps, statut = 200) => ({ ok: statut < 400, status: statut, headers: { get: () => 'application/json' }, json: async () => JSON.parse(JSON.stringify(corps)) });

function lesScenarios() {
  const a = P.analyses['essai-a'].corps;
  const matchA = P.liste.corps.matches.find((m) => m.matchId === 'essai-a');
  return {
    avecCotes: { match: matchA, liste: P.liste.corps.matches, analyse: a, apercu: D.apercu(), fixture: P.fixtureA, saisies: P.saisiesA, ia: D.avisIA(a) },
    sansCotes: {
      match: { ...P.sansCotes.match, commenceTime: '2026-10-07T12:00:00Z' },
      liste: [{ ...P.sansCotes.match, commenceTime: '2026-10-07T12:00:00Z' }],
      analyse: P.sansCotes.analyse,
      apercu: { available: false, reason: 'fixture_not_found', lastLineups: null },
      fixture: P.fixtureSansCotes,
      saisies: { ...P.saisiesVides, saisies: [], retirees: [] },
      ia: null
    }
  };
}

before(async () => {
  if (!pret) return;
  P = D.payloadsDuServeur();
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
    const s = scenario;
    if (/\/api\/matches\?/.test(u)) return reponseJson({ source: 'odds-api', count: s.liste.length, matches: s.liste });
    if (/\/api\/matches\//.test(u)) return reponseJson(s.match);
    if (/\/api\/analysis\/match\//.test(u)) return reponseJson(s.analyse);
    if (/\/api\/match-stats\/preview/.test(u)) return reponseJson(s.apercu);
    if (/\/api\/match-stats\/team-averages\?name=([^&]*)/.test(u)) return reponseJson(D.moyennes(decodeURIComponent(/name=([^&]*)/.exec(u)[1])));
    if (/\/api\/match-stats\/team\?name=([^&]*)/.test(u)) return reponseJson(D.forme(decodeURIComponent(/name=([^&]*)/.exec(u)[1])));
    if (/\/api\/match-stats\/odds-profile/.test(u)) return reponseJson({ available: false, reason: 'essai' });
    if (/\/api\/match-ai-analysis\/match\//.test(u)) return reponseJson({ entry: s.ia });
    if (/\/api\/odds\/fixture/.test(u)) return reponseJson(s.fixture);
    if (/\/api\/odds\/saisies/.test(u)) return reponseJson(s.saisies);
    if (/\/api\/odds\/conseil-releve/.test(u)) return reponseJson(P.conseil);
    if (/\/api\/odds\/fraicheur/.test(u)) return reponseJson({ reglage: { maxAgeMinutes: 180, avantCompos: true }, source: 'defaut', bornes: { min: 15, max: 1440 } });
    if (/\/api\/team-stats\/team-news/.test(u)) return reponseJson(D.actualites());
    const neutre = D.neutre(u);
    if (neutre) return reponseJson(neutre);
    return reponseJson({ error: 'inconnu' }, 404);
  };
  console.warn = (...a) => avertissements.push(a.map(String).join(' ').slice(0, 300));

  const { createServer } = await imp(path.join(UI, 'node_modules', 'vite', 'dist', 'node', 'index.js'));
  const vuePlugin = (await imp(path.join(UI, 'node_modules', '@vitejs', 'plugin-vue', 'dist', 'index.mjs'))).default;
  const { renderToString } = await imp(path.join(UI, 'node_modules', 'vue', 'server-renderer', 'index.mjs'));
  const { createSSRApp, h } = await imp(path.join(UI, 'node_modules', 'vue', 'index.mjs'));
  const { createPinia } = await imp(path.join(UI, 'node_modules', 'pinia', 'dist', 'pinia.mjs'));
  const { createRouter, createMemoryHistory } = await imp(path.join(UI, 'node_modules', 'vue-router', 'dist', 'vue-router.mjs'));

  // Le chargement de la page attendu par le rendu (la même transformation que l'essai de l'étape 9).
  const prefetch = {
    name: 'ssr-prefetch',
    enforce: 'pre',
    transform(code, id) {
      if (id.includes('?')) return null;
      if (/UpcomingMatchView\.vue$/.test(id)) {
        let c = code;
        const remplacer = (a, b) => {
          assert.ok(c.includes(a), `la page a changé : « ${a.slice(0, 70)} » introuvable`);
          c = c.replace(a, b);
        };
        remplacer("import { computed, nextTick, ref, watch } from 'vue';", "import { computed, nextTick, ref, watch, onServerPrefetch } from 'vue';");
        remplacer('watch(() => props.matchId, load, { immediate: true });', 'onServerPrefetch(load);');
        c = c.replace(/\n {2}(charger\w+\(\));/g, '\n  await $1;').replace(/\n {2}(aiStore\.fetch\w+\([^)]*\)\.catch\(\(\) => \{\}\));/g, '\n  await $1;');
        return c;
      }
      if (!/(ManualOddsEntry|PaidOddsAdvicePanel)\.vue$/.test(id)) return null;
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
  const routeur = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:chemin(.*)*', component: { render: () => null } }] });
  await routeur.push('/');
  await routeur.isReady();
  const horloge = await vite.ssrLoadModule('/src/utils/liveClock.js');
  const nettoyer = (html) => html.replace(/ data-v-[a-z0-9]+(?==|\s|>)/g, '');
  const rendreApp = async (racine, heure) => {
    const avant = avertissements.length;
    horloge.liveNow.value = heure;
    const app = createSSRApp({ render: racine });
    app.use(createPinia());
    app.use(routeur);
    const html = nettoyer(await renderToString(app));
    const vide = /<path(?![^>]*\bd=)[^>]*>/.exec(html);
    assert.equal(vide, null, `une icône inconnue d'AppIcon (tracé vide) : ${vide?.[0]}`);
    return { html, texte: texteDe(html), avertissements: avertissements.slice(avant) };
  };
  contexte = {
    vite,
    cache,
    Page: (await vite.ssrLoadModule('/src/views/UpcomingMatchView.vue')).default,
    Ticket: (await vite.ssrLoadModule('/src/components/betting/TicketDuPari.vue')).default,
    ticket: await vite.ssrLoadModule('/src/utils/ticket.js'),
    comparateur: await vite.ssrLoadModule('/src/utils/comparateur.js'),
    /** La page d'un match à venir. */
    rendre: (matchId, { heure = T0 } = {}) => rendreApp(() => h(contexte.Page, { matchId }), heure),
    /** Le ticket seul, avec ses props. */
    rendreTicket: (props, { heure = T0 } = {}) => rendreApp(() => h(contexte.Ticket, props), heure)
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
const decoder = (v) => v.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const compter = (texte, motif) => (texte.match(motif) ?? []).length;
const lireUi = (...p) => fs.readFileSync(path.join(UI, 'src', ...p), 'utf8');
const position = (html, id) => html.indexOf(`id="${id}"`);
const virgule = (x) => Number(x).toFixed(2).replace('.', ',');
/** Le comparateur rendu : de la balise qui porte son ancre au bloc suivant (la place du « pourquoi »). */
const leComparateur = (html) => html.slice(html.lastIndexOf('<', position(html, 'upcoming-comparateur')), position(html, 'upcoming-pourquoi'));
/** Une table du comparateur, par sa clé (de sa balise d'ouverture à sa fin). */
const tableDe = (html, cle) => {
  const debut = html.indexOf(`data-table="${cle}"`);
  return debut < 0 ? null : html.slice(html.lastIndexOf('<', debut), html.indexOf('</section>', debut));
};
/** Une ligne d'une table, par son libellé (Vue écrit les classes d'état avant la classe fixe : « is-kept bkc__row »). */
const ligneDe = (table, libelle) =>
  table
    .split(/<tr class="[^"]*\bbkc__row\b[^"]*">/)
    .slice(1)
    .map((l) => l.split('</tr>')[0])
    .find((l) => decoder(l).includes(`<strong class="bkc__label">${libelle}</strong>`));

// ------------------------------------------------------------------ 1. la page du match

test('la page du match : le comparateur est dans la carte du verdict, sous le tableau des marchés, avant le « pourquoi » — une table par marché, une colonne par bookmaker', options, async () => {
  scenario = lesScenarios().avecCotes;
  const r = await contexte.rendre('essai-a');
  assert.deepEqual(r.avertissements, [], 'avertissements de Vue');
  const ordre = [r.html.indexOf('class="mvb"'), position(r.html, 'upcoming-comparateur'), position(r.html, 'upcoming-pourquoi')];
  assert.ok(ordre.every((x) => x > 0) && ordre[0] < ordre[1] && ordre[1] < ordre[2], `ordre ${ordre}`);
  const comp = leComparateur(r.html);
  assert.match(texteDe(comp), /^Comparateur de vos bookmakers la cote de chacun, son heure, sa value et la cote minimale à prendre/);
  // Les tables, dans l'ordre : le 1 / N / 2, puis les familles de marchés, puis les autres cotes saisies.
  const tables = [...comp.matchAll(/data-table="(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(tables, ['resultat', 'match', 'buts', 'corners', 'tirs', 'cadres', 'autres']);
  // Le 1 / N / 2 : William Hill seul de vos bookmakers, l'heure de son relevé, la provenance payante.
  const res = tableDe(comp, 'resultat');
  assert.match(texteDe(res), /Résultat · 1 \/ N \/ 2 · relevé The Odds API The Odds API relevé (aujourd'hui|hier) à \d\d:\d\d payant/);
  assert.deepEqual([...res.matchAll(/<span class="bkc__book">([^<]*)</g)].map((m) => m[1]), ['William Hill']);
  assert.match(texteDe(res), /William Hill relevée il y a 10 min/);
  // Le résumé : les bookmakers de toutes les tables (William Hill au 1 / N / 2 ; Betsson, Unibet et Tipico par leurs saisies).
  assert.match(texteDe(r.html.slice(r.html.lastIndexOf('<', r.html.indexOf('class="bkc__sum"')), r.html.indexOf('data-table="resultat"'))), /^4 bookmakers comparés 2 cases en value à cette minute/);
});

test('chaque case dit le verdict du serveur, mot pour mot ; chaque issue sa cote minimale à prendre ; la case du pari du moteur est verte et marquée', options, async () => {
  scenario = lesScenarios().avecCotes;
  const r = await contexte.rendre('essai-a');
  const a = scenario.analyse;
  const c = a.comparateur;
  const res = tableDe(leComparateur(r.html), 'resultat');
  for (const issue of c.issues) {
    const ligne = ligneDe(res, issue.libelle);
    assert.ok(ligne, issue.libelle);
    const t = texteDe(ligne);
    const k = c.livres[0].cellules[issue.issue];
    assert.ok(t.includes(`${Math.round(issue.probabilite * 100)} % juste ${virgule(issue.coteJuste)}`), `${issue.libelle} : le moteur`);
    assert.ok(t.includes(virgule(k.cote)), `${issue.libelle} : la cote de William Hill`);
    assert.ok(decoder(ligne).includes(`aria-label="${k.raison}"`), `${issue.libelle} : la phrase du verdict`);
    assert.ok(ligne.includes(`vbadge is-${k.etat} `), `${issue.libelle} : l'état ${k.etat}`);
    assert.ok(t.includes(`à prendre à ${virgule(issue.bornes.coteMinimale)} minimum jusqu'à ${virgule(issue.bornes.coteMaximale)}`), `${issue.libelle} : la cote minimale`);
    assert.match(t, /Prendre/);
    assert.match(t, /Autre cote$/);
  }
  const home = ligneDe(res, 'Man City gagne');
  assert.ok(home.includes('vbadge is-value '));
  assert.match(texteDe(home), /retenue par le moteur/);
  assert.match(texteDe(home), /pari du moteur/);
  assert.match(decoder(home), /c'est le pari du moteur, à la meilleure cote de vos bookmakers/);
  assert.doesNotMatch(ligneDe(res, 'Match nul'), /is-value /);
  // Les autres marchés : le pronostic du moteur (sa cote minimale), la cote saisie rangée sous lui ou à part.
  const comp = leComparateur(r.html);
  const corners = tableDe(comp, 'corners');
  const neuf = ligneDe(corners, 'Plus de 9,5 corners');
  assert.match(texteDe(neuf), /2,25 .*Value \+21,6 % .*saisie (à l'instant|il y a)/);
  assert.match(texteDe(neuf), /à prendre à 1,89 minimum jusqu'à 2,31/);
  assert.ok(neuf.includes('vbadge is-value '));
  assert.match(texteDe(ligneDe(corners, 'Plus de 7.5 corners')), /pronostic du moteur .* pas de cote à prendre à \d,\d\d minimum/);
  assert.match(texteDe(ligneDe(tableDe(comp, 'match'), 'Oui')), /1,80 .* trop beau pour être vrai/);
  const cartons = ligneDe(tableDe(comp, 'autres'), 'Plus de 4,5 cartons');
  assert.match(texteDe(cartons), /non calculée 1,90 valeur inconnue .*pas de cote minimale/);
  // Exactement deux cases vertes : Man City chez William Hill, les corners saisis.
  assert.equal(compter(comp, /vbadge is-value /g), 2);
});

test('les cotes de référence, à part et marquées « référence, non jouable » : Pinnacle (cote juste), Betclic, DraftKings et Bet365 — jamais de pastille', options, async () => {
  scenario = lesScenarios().avecCotes;
  const r = await contexte.rendre('essai-a');
  const comp = leComparateur(r.html);
  const refs = comp.slice(comp.lastIndexOf('<', comp.indexOf('class="bkc__refs"')));
  assert.match(texteDe(refs), /^Cotes de référence · référence, non jouable : elles mesurent le marché, jamais une value/);
  assert.match(texteDe(refs), /Pinnacle The Odds API, pas un de vos bookmakers · cote juste/);
  assert.match(texteDe(refs), /Betclic \(FR\) The Odds API, pas un de vos bookmakers/);
  assert.match(texteDe(refs), /DraftKings ESPN/);
  assert.match(texteDe(refs), /Bet365 365Scores/);
  assert.match(texteDe(refs), /Plus\/moins de 2,5 buts/);
  assert.match(texteDe(refs), /2,00 relevée il y a 1 h/);
  assert.doesNotMatch(refs, /vbadge|bkc__take/, 'ni pastille ni bouton dans une référence');
});

test('le ticket de la page, vide au chargement : il le dit ; rien n’est lu ni écrit côté paris', options, async () => {
  scenario = lesScenarios().avecCotes;
  const r = await contexte.rendre('essai-a');
  const comp = leComparateur(r.html);
  assert.match(texteDe(comp), /Aucune sélection Combiner les paris d'un même match Désactivé : un seul pari par match, comme avant\. Aucune sélection : prenez une cote dans le comparateur/);
  assert.doesNotMatch(comp, /upcoming__bet-done/);
  assert.ok(!appels.some((u) => /\/api\/bets/.test(u)), 'aucune lecture du carnet pendant le rendu');
});

test('l’heure qui tourne : quatre heures plus tard, plus aucune case verte, le relevé en ambre ; les cotes minimales restent', options, async () => {
  scenario = lesScenarios().avecCotes;
  const r = await contexte.rendre('essai-a', { heure: T0 + 4 * H });
  assert.deepEqual(r.avertissements, []);
  const comp = leComparateur(r.html);
  assert.equal(compter(comp, /vbadge is-value /g), 0);
  const res = tableDe(comp, 'resultat');
  assert.ok(ligneDe(res, 'Man City gagne').includes('vbadge is-a-rafraichir'));
  assert.match(res, /class="[^"]*\bis-stale\b[^"]*">relevée il y a 4 h</);
  assert.match(texteDe(ligneDe(res, 'Man City gagne')), /à prendre à 2,09 minimum/);
  assert.match(texteDe(r.html.slice(r.html.indexOf('class="bkc__sum"'), r.html.indexOf('data-table="resultat"'))), /Aucune case en value à cette minute/);
});

test('un match sans cote : pas de table du 1 / N / 2, dit ; les autres marchés gardent la cote minimale de leur pronostic, sans colonne', options, async () => {
  scenario = lesScenarios().sansCotes;
  const r = await contexte.rendre(scenario.match.matchId);
  assert.deepEqual(r.avertissements, []);
  const comp = leComparateur(r.html);
  assert.match(texteDe(comp), /Pas de cote de marché pour ce match : aucun relevé The Odds API ne le cote/);
  assert.equal(tableDe(comp, 'resultat'), null);
  assert.ok(compter(comp, /data-table="/g) >= 3);
  assert.match(texteDe(comp), /Aucune cote de vos bookmakers sur ce marché : The Odds API ne relève que le 1 \/ N \/ 2/);
  assert.match(texteDe(comp), /à prendre à \d,\d\d minimum/);
  assert.equal(compter(comp, /vbadge/g), 0);
  assert.match(texteDe(comp), /0 bookmaker comparé Aucune case en value à cette minute/);
});

// ------------------------------------------------------------------ 2. le ticket seul

const BOOKMAKERS = () => P.analyses['essai-a'].corps.comparateur.vosBookmakers;
function selectionsDuComparateur() {
  const C = contexte.comparateur;
  const K = contexte.ticket;
  const match = { matchId: 'essai-a', home: 'Man City', away: 'Liverpool', league: 'EPL', commenceTime: '2026-10-05T18:30:00Z' };
  const lu = C.lireLeComparateur({ result: P.analyses['essai-a'].corps, saisies: P.saisiesA, cotes: P.fixtureA, match, maintenant: T0 });
  const home = lu.tables[0].lignes[0];
  const corners = lu.tables.flatMap((t) => t.lignes).find((l) => l.libelle === 'Plus de 9,5 corners');
  const sept = lu.tables.flatMap((t) => t.lignes).find((l) => l.libelle === 'Plus de 7.5 corners');
  return {
    home: K.selectionDeLaLigne({ match, ligne: home, case: home.cases.williamhill, calculeLe: lu.calculeLe }),
    corners: K.selectionDeLaLigne({ match, ligne: corners, case: corners.cases.williamhill, calculeLe: lu.calculeLe }),
    sept: K.selectionDeLaLigne({ match, ligne: sept, case: null, calculeLe: lu.calculeLe })
  };
}

test('le ticket, un pari simple pris dans le comparateur : la probabilité du moteur et d’où elle vient, la cote prise et l’heure de son relevé, la cote minimale, le gain attendu — et « J’ai parié chez William Hill »', options, async () => {
  const s = selectionsDuComparateur();
  const r = await contexte.rendreTicket({ selections: [s.home], edition: { bookmaker: 'williamhill', cotes: {}, coteCombinee: null }, mise: 10, bookmakers: BOOKMAKERS() });
  assert.deepEqual(r.avertissements, []);
  const t = r.texte;
  assert.match(t, /^Pari simple · 1 sélection/);
  assert.match(t, /Bookmaker où vous avez parié William Hill/);
  assert.ok(t.includes(`Moteur : ${(s.home.probabiliteMoteur * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} % · cote juste ${virgule(s.home.coteJuste)} · cote juste des bookmakers de référence (Pinnacle), marge retirée · calculée à l'instant`));
  assert.match(r.html, /<input[^>]*value="2\.3"/, 'la cote prise, préremplie avec celle du relevé');
  assert.match(t, /relevé The Odds API, relevée il y a 10 min chez William Hill\./);
  assert.match(t, /à prendre à 2,09 minimum/);
  assert.match(t, /2,30 : au moins 2,09, encore une value au seuil du moteur\./);
  const attendu = Math.round(10 * (s.home.probabiliteMoteur * 2.3 - 1) * 100) / 100;
  assert.ok(t.includes(`Cote du ticket 2,30 Gain potentiel à vos cotes 23,00 € Gain attendu +${attendu.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €`), `gain attendu ${attendu}`);
  assert.match(t, /J'ai parié chez William Hill/);
  assert.match(decoder(r.html), /<button type="button" class="btn btn--primary btn--md">(?:(?!<\/button>)[\s\S])*J'ai parié chez William Hill/, 'le bouton est actif');
  assert.match(t, /Prêt : le pari sera noté avec William Hill, la cote prise, la probabilité du moteur et l'heure de chaque cote/);
  // La phrase d'aide de la cote minimale.
  assert.match(decoder(r.html), /aria-label="Qu'est-ce que « Cote minimale » \?"/);
  // Jamais le vert de la value ici : ce n'est pas une pastille.
  assert.doesNotMatch(r.html, /vbadge|is-value/);
});

test('le ticket, un combiné du même match : la cote est celle du bookmaker (à taper), le prix juste attend l’étape 28 — ni value ni gain attendu, et pas de « J’ai parié » sans elle', options, async () => {
  const s = selectionsDuComparateur();
  const r = await contexte.rendreTicket({ selections: [s.home, s.corners], edition: { bookmaker: 'williamhill', cotes: {}, coteCombinee: null }, mise: 4, bookmakers: BOOKMAKERS(), memeMatch: true });
  const t = r.texte;
  assert.match(t, /^Combiné du même match · 2 sélections/);
  assert.match(t, /Cote du combiné chez le bookmaker/);
  assert.match(t, /Les sélections d'un même match sont liées : la cote est celle que donne le bookmaker, jamais le produit des cotes\./);
  assert.ok(t.includes(contexte.ticket.PRIX_JUSTE_COMBINE));
  assert.match(t, /Cote du ticket — Gain potentiel à vos cotes — Gain attendu pas encore \(étape 28\)/);
  assert.match(t, /tapez la cote que donne le bookmaker pour le combiné/);
  assert.match(decoder(r.html), /<button[^>]*disabled[^>]*>(?:(?!<\/button>)[\s\S])*J'ai parié/, 'le bouton est désactivé');
  // Avec la cote du bookmaker : la cote du ticket est la sienne, toujours sans gain attendu.
  const avec = await contexte.rendreTicket({ selections: [s.home, s.corners], edition: { bookmaker: 'williamhill', cotes: {}, coteCombinee: 4.6 }, mise: 4, bookmakers: BOOKMAKERS(), memeMatch: true });
  assert.match(avec.texte, /Cote du ticket 4,60 Gain potentiel à vos cotes 18,40 € Gain attendu pas encore \(étape 28\)/);
  assert.match(avec.texte, /Prêt : le pari sera noté avec William Hill/);
});

test('le ticket, un pronostic sans cote de bookmaker : la cote prise est à taper, et le dit ; la version de Mes paris n’a ni mise ni bouton (ceux du bordereau d’avant)', options, async () => {
  const s = selectionsDuComparateur();
  const r = await contexte.rendreTicket({ selections: [s.sept], edition: { bookmaker: null, cotes: {}, coteCombinee: null }, mise: 10, bookmakers: BOOKMAKERS() });
  assert.match(r.texte, /à taper : la cote que vous avez eue chez le bookmaker\./);
  assert.match(r.texte, /Choisissez le bookmaker chez qui vous avez parié\./);
  assert.match(r.texte, /Cote prise de « Plus de 7\.5 corners » : la cote que vous avez eue chez le bookmaker/);
  assert.match(r.texte, /Gain attendu inconnu/);
  assert.match(decoder(r.html), /<button[^>]*disabled[^>]*>(?:(?!<\/button>)[\s\S])*J'ai parié/, 'pas de « J’ai parié » sans bookmaker ni cote');
  const mesParis = await contexte.rendreTicket({ selections: [s.home], edition: { bookmaker: 'williamhill', cotes: {}, coteCombinee: null }, mise: 10, bookmakers: BOOKMAKERS(), avecValidation: false, origine: 'mes-paris' });
  assert.doesNotMatch(mesParis.texte, /J'ai parié|Mise \(€\)|Vider le ticket/);
  assert.match(mesParis.texte, /Gain attendu \+/);
  // Vide : il le dit.
  const vide = await contexte.rendreTicket({ selections: [], edition: { bookmaker: null, cotes: {}, coteCombinee: null }, mise: 10, bookmakers: BOOKMAKERS() });
  assert.match(vide.texte, /Aucune sélection : prenez une cote dans le comparateur \(ou cochez un pari dans Mes paris\)/);
});

// ------------------------------------------------------------------ 3. hygiène et câblage

const styleDe = (source) => [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
const NOUVEAUX = [
  ['components', 'betting', 'BookmakerComparator.vue'],
  ['components', 'betting', 'TicketDuPari.vue']
];

test('hygiène des deux composants et de la partie de la page ajoutée : aucune couleur en dur, aucun !important, aucune police sous 10 px, jetons existants, jamais le vert hors pastille, icônes connues, chaque pastille avec sa fraîcheur', options, () => {
  const tokens = lireUi('assets', 'styles', 'tokens.css');
  const connues = new Set([...lireUi('components', 'common', 'AppIcon.vue').matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]));
  const verifier = (nom, css, source = '') => {
    assert.ok(css.length > 300, `${nom} : un style`);
    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, `${nom} : une couleur hexadécimale en dur`);
    assert.doesNotMatch(css, /\brgba?\(\s*\d/, `${nom} : une couleur rgb en dur`);
    assert.doesNotMatch(css, /!important/, `${nom} : !important`);
    assert.doesNotMatch(css, /--cm-accent|--cm-danger|cm-positive|cm-negative/, `${nom} : du vert ou du rouge hors de la pastille de value`);
    for (const [, taille] of css.matchAll(/font-size:\s*([\d.]+)px/g)) assert.ok(Number(taille) >= 10, `${nom} : police de ${taille}px`);
    for (const [, jeton] of css.matchAll(/var\((--cm-[a-z0-9-]+)/g)) assert.ok(tokens.includes(`${jeton}:`), `${nom} : le jeton ${jeton} n'existe pas`);
    for (const [, icone] of source.matchAll(/<AppIcon name="(\w+)"/g)) assert.ok(connues.has(icone), `${nom} : l'icône « ${icone} »`);
    for (const [, a, b] of source.matchAll(/:name="[^"]*\? '(\w+)' : '(\w+)'"/g)) for (const icone of [a, b]) assert.ok(connues.has(icone), `${nom} : l'icône « ${icone} »`);
    for (const m of source.matchAll(/<ValueBadge\b([\s\S]*?)\/?>/g)) assert.match(m[1], /:fraicheur="/, `${nom} : une pastille sans sa fraîcheur`);
  };
  for (const f of NOUVEAUX) {
    const source = lireUi(...f);
    verifier(f.join('/'), styleDe(source), source);
  }
  const page = lireUi('views', 'UpcomingMatchView.vue');
  const debut = page.indexOf('le comparateur et le ticket (étape 10)');
  const fin = page.indexOf('/* ------------------------------------------------------ largeurs */');
  assert.ok(debut > 0 && fin > debut, 'le bloc de style de l’étape 10');
  verifier('page (étape 10)', page.slice(debut, fin).replace(/\/\*[\s\S]*?\*\//g, '') + ' '.repeat(300));
});

test('câblage : la page donne au comparateur l’analyse, les saisies et les cotes relevées, au ticket vos bookmakers ; « J’ai parié » passe par le carnet, au clic seulement ; Mes paris envoie les champs du ticket ; les composants n’appellent rien', options, () => {
  const page = lireUi('views', 'UpcomingMatchView.vue');
  assert.match(page, /<BookmakerComparator :result="analyse\.result" :match="match" :saisies="saisies\.data" :cotes="cotes\.data" :pris="ticket\.selections" @prendre="prendreUneCote" \/>/);
  assert.match(page, /<TicketDuPari\s+v-model:edition="ticket\.edition"\s+v-model:mise="ticket\.mise"\s+v-model:memeMatch="ticket\.memeMatch"\s+:selections="ticket\.selections"\s+:bookmakers="vosBookmakersDuMatch"/);
  assert.match(page, /@jai-parie="enregistrerLePari"/);
  // Le pari part par le carnet (POST /api/bets), dans la fonction du clic, et nulle part ailleurs.
  assert.equal(compter(page, /betsStore\.createBet\(/g), 1);
  assert.match(page, /async function enregistrerLePari\(corps\) \{\n {2}ticket\.enCours = true;\n {2}try \{\n {4}const pari = await betsStore\.createBet\(corps\);/);
  assert.doesNotMatch(page, /betsApi|fetchBets/);
  // Le comparateur est dans la carte du verdict, après le tableau des marchés.
  assert.ok(page.indexOf('<MarketVerdictBoard') < page.indexOf('<BookmakerComparator') && page.indexOf('<BookmakerComparator') < page.indexOf('<PercentageWhyCard'));
  // Mes paris : le ticket dans le bordereau, sans sa mise ni son bouton ; « J'ai parié » contrôle et envoie les champs du ticket.
  const mesParis = lireUi('views', 'MyBetsView.vue');
  assert.match(mesParis, /<TicketDuPari\s+v-model:edition="editionDuTicket"\s+v-model:memeMatch="combinerMemeMatch"[\s\S]*?:avec-validation="false"\s+origine="mes-paris"/);
  // Rien ne part tant que le ticket n'est pas complet : le contrôle, son refus, AVANT l'envoi.
  const envoi = mesParis.slice(mesParis.indexOf('async function submitSlip() {'), mesParis.indexOf('onMounted(() => {'));
  assert.match(envoi, /const manquesDuTicket = controleDuTicket\(\{ selections: selectionsDuTicket\.value, edition: editionDuTicket\.value, mise: Number\(slipStake\.value\), bookmakers: vosBookmakersDuScan\.value \}\);\n {2}if \(manquesDuTicket\.length\) \{\n {4}toastStore\.error\(manquesDuTicket\[0\]\);\n {4}return;\n {2}\}/);
  assert.ok(envoi.indexOf('if (manquesDuTicket.length) {') < envoi.indexOf('await betsStore.createBet('), 'le contrôle avant l’envoi');
  assert.match(mesParis, /\.map\(\(jambe, i\) => \(\{ \.\.\.jambe, \.\.\.corpsDuTicket\.legs\[i\] \}\)\),/);
  assert.match(mesParis, /J'ai parié : \{\{ selectedLegs\.length > 1/);
  // Le bordereau d'avant est toujours là (une sélection par match tant que le combiné du même match n'est pas coché).
  assert.match(mesParis, /if \(current\) toastStore\.push\('Un seul pari par match sur le ticket — remplacé\.', 'info'\);/);
  assert.match(mesParis, /if \(combinerMemeMatch\.value && basculerDansLeCombine\(candidate\)\) return;/);
  // Les composants n'appellent rien : ni réseau, ni service de l'appli (la page leur donne tout).
  for (const f of NOUVEAUX) assert.doesNotMatch(lireUi(...f), /@\/services\/|fetch\(|httpClient|@\/stores\//, `${f.join('/')} : aucun appel`);
});

test('aucun appel hors liste pendant ces rendus — ni le carnet, ni API payante, ni FotMob, ni Claude — et aucun avertissement de Vue', options, () => {
  assert.deepEqual(interdits, [], 'appels refusés');
  assert.deepEqual(avertissements, [], 'avertissements de Vue');
  assert.ok(appels.length >= 20, `${appels.length} appels simulés`);
  assert.ok(!appels.some((u) => /\/api\/bets|odds-api\.com|fotmob\.com|anthropic|\/refresh/.test(u)));
});
