/**
 * La page d'un match à venir SE REND dans l'ordre d'une DÉCISION (étape 9 du plan) — rendu côté serveur,
 * sans navigateur ni serveur de développement, comme opportunitesEcran.test.mjs : `fetch` remplacé (tout
 * appel hors liste refusé et compté), routeur de l'appli remplacé par un faux, horloge de l'appli figée,
 * rien écrit dans ui/.
 *
 * Les réponses du serveur ne sont PAS écrites à la main : le VRAI serveur les produit (script-page-match.mjs,
 * dans une copie isolée : moteur, base d'essai, relevé The Odds API fabriqué, cotes gratuites et saisies
 * fabriquées) — la page est essayée sur ce que les routes répondent vraiment. Seuls FotMob, le magasin de
 * statistiques et l'avis de l'IA, que le serveur n'a pas sous la main, sont fabriqués (aides/donneesPageMatch.mjs).
 *
 *  1. L'ORDRE : le verdict par marché, la place du « pourquoi ce pourcentage », les compositions et les
 *     absents, la courbe des cotes, l'avis de l'IA, puis le détail — chaque bloc à sa place, dans le Résumé.
 *  2. LE VERDICT : pour chaque issue du résultat, la probabilité et la cote juste du moteur, la meilleure cote
 *     de vos bookmakers et l'heure de son relevé, la pastille de value (verte pour une seule value), « pas encore
 *     mesurée » ; pour les autres marchés, le pronostic du moteur et la cote saisie à la main quand il y en a une.
 *  3. L'HEURE QUI TOURNE : quatre heures plus tard, plus aucun vert ; compositions officielles + cotes d'avant :
 *     « à rafraîchir ».
 *  4. UN MATCH SANS COTES : dit, ligne par ligne — jamais une cote, une value ni une courbe inventées.
 *  5. RIEN DE PERDU : chaque onglet d'avant garde son contenu ; le pari conseillé est monté en tête du Résumé.
 *  6. Hygiène et câblage des nouveaux composants ; aucun appel hors liste ; aucun avertissement de Vue.
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
// L'écriture d'un avantage (« +12,4 % ») est celle de la pastille : la même fonction, jamais une copie.
const { pourcentSigne } = pret ? await imp(path.join(UI, 'src', 'utils', 'langageParis.js')) : {};
const { MIN, H } = D;
const T0 = D.MAINTENANT;

/** Les seuls appels permis (le reste est refusé et compté). */
const AUTORISES = [
  /\/api\/matches(\?|\/)/,
  /\/api\/analysis\/match\//,
  /\/api\/match-stats\/(preview|team-averages|team\?|team-ids|odds-profile)/,
  /\/api\/match-ai-analysis\/(status|match\/)/,
  /\/api\/odds\/(fixture|saisies|conseil-releve|fraicheur)/,
  /\/api\/team-stats\/team-news/,
  /\/api\/match-notes\//
];
let P; // les réponses du vrai serveur
let scenario = {};
const appels = [];
const interdits = [];
const avertissements = [];
let contexte;
let originaux = {};

const reponseJson = (corps, statut = 200) => ({ ok: statut < 400, status: statut, headers: { get: () => 'application/json' }, json: async () => JSON.parse(JSON.stringify(corps)) });

/** Les scénarios : tout ce que la page lit pour UN match. */
function lesScenarios() {
  const a = P.analyses['essai-a'].corps;
  const matchA = P.liste.corps.matches.find((m) => m.matchId === 'essai-a');
  return {
    avecCotes: { match: matchA, liste: P.liste.corps.matches, analyse: a, apercu: D.apercu(), fixture: P.fixtureA, saisies: P.saisiesA, ia: D.avisIA(a) },
    officielle: { match: matchA, liste: P.liste.corps.matches, analyse: a, apercu: D.apercu({ lineups: D.compositionPubliee(45) }), fixture: P.fixtureA, saisies: P.saisiesA, ia: D.avisIA(a) },
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
    if (/\/api\/analysis\/match\//.test(u)) return s.analyseEnPanne ? reponseJson({ error: "Le moteur n'a pas pu analyser ce match (essai)." }, 500) : reponseJson(s.analyse);
    if (/\/api\/match-stats\/preview/.test(u)) return reponseJson(s.apercu);
    if (/\/api\/match-stats\/team-averages\?name=([^&]*)/.test(u)) return reponseJson(D.moyennes(decodeURIComponent(/name=([^&]*)/.exec(u)[1])));
    if (/\/api\/match-stats\/team\?name=([^&]*)/.test(u)) return reponseJson(D.forme(decodeURIComponent(/name=([^&]*)/.exec(u)[1])));
    if (/\/api\/match-stats\/odds-profile/.test(u)) return reponseJson({ available: false, reason: 'essai' });
    if (/\/api\/match-ai-analysis\/match\//.test(u)) return reponseJson({ entry: s.ia });
    if (/\/api\/odds\/fixture/.test(u)) return s.fixtureEnPanne ? reponseJson({ error: 'cotes relevées indisponibles (essai)' }, 503) : reponseJson(s.fixture);
    if (/\/api\/odds\/saisies/.test(u)) return s.saisiesEnPanne ? reponseJson({ error: 'saisies indisponibles (essai)' }, 503) : reponseJson(s.saisies);
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

  // Le rendu attend le chargement : `onMounted` ne s'exécute pas côté serveur, `onServerPrefetch` si. La page charge
  // dans un `watch` immédiat : il devient un `onServerPrefetch`, et chaque chargement lancé sans attente est attendu.
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
        // Les chargements lancés sans attente (chargerAnalyse(); …) sont attendus : le rendu les voit tous arriver.
        c = c.replace(/\n {2}(charger\w+\(\));/g, '\n  await $1;').replace(/\n {2}(aiStore\.fetch\w+\([^)]*\)\.catch\(\(\) => \{\}\));/g, '\n  await $1;');
        // L'onglet voulu (le test choisit lequel rendre).
        remplacer("tab.value = 'resume';\n  liveMatchDetails.value = null;", "tab.value = globalThis.__ONGLET_ESSAI__ ?? 'resume';\n  liveMatchDetails.value = null;");
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
  contexte = {
    vite,
    cache,
    composants: { Page: (await vite.ssrLoadModule('/src/views/UpcomingMatchView.vue')).default },
    /** Rend la page d'un match : { html, texte, avertissements }. `heure` : l'horloge de l'appli ; `onglet` : l'onglet ouvert. */
    async rendre(matchId, { heure = T0, onglet = null } = {}) {
      const avant = avertissements.length;
      horloge.liveNow.value = heure;
      globalThis.__ONGLET_ESSAI__ = onglet ?? undefined;
      const app = createSSRApp({ render: () => h(contexte.composants.Page, { matchId }) });
      app.use(createPinia());
      app.use(routeur);
      const html = (await renderToString(app)).replace(/ data-v-[a-z0-9]+(?==|\s|>)/g, '');
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
  delete globalThis.__ONGLET_ESSAI__;
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
/** Les lignes du verdict, chacune en HTML (le marqueur est la classe de la ligne). */
const lignesDuVerdict = (html) => html.split(/<li class="[^"]*\bmvb__row\b[^"]*">/).slice(1).map((l) => `<li class="mvb__row">${l.split('</li>')[0]}`);
const ligneDe = (html, libelle) => lignesDuVerdict(html).find((l) => decoder(l).includes(`<strong class="mvb__pick">${libelle}</strong>`));
const pourcent = (p) => `${Math.round(p * 100)} %`;
const virgule = (x) => Number(x).toFixed(2);
/** Une position dans le HTML : l'identifiant du bloc. */
const position = (html, id) => html.indexOf(`id="${id}"`);

// ------------------------------------------------------------------ 1. l'ordre

test('l’ordre d’une décision : le sommaire, le verdict, la place du pourquoi, les compositions et les absents, la courbe, l’avis de l’IA, puis le détail', options, async () => {
  scenario = lesScenarios().avecCotes;
  const r = await contexte.rendre('essai-a');
  assert.deepEqual(r.avertissements, [], 'avertissements de Vue');
  const ordre = ['upcoming-verdict', 'upcoming-pourquoi', 'upcoming-compos', 'upcoming-courbe', 'upcoming-ia', 'upcoming-detail'].map((id) => [id, position(r.html, id)]);
  for (const [id, p] of ordre) assert.ok(p > 0, `le bloc ${id} manque`);
  assert.deepEqual(
    [...ordre].sort((x, y) => x[1] - y[1]).map((x) => x[0]),
    ordre.map((x) => x[0]),
    'les six blocs ne sont pas dans l’ordre de la décision'
  );
  // Les absents (actualités d'équipe) suivent les compositions et précèdent la courbe ; le sommaire précède le verdict ; les onglets précèdent le sommaire.
  const absents = r.html.indexOf('Actualités d&#39;équipe');
  assert.ok(position(r.html, 'upcoming-compos') < absents && absents < position(r.html, 'upcoming-courbe'), 'les absents entre les compositions et la courbe');
  const sommaire = r.html.indexOf('class="upcoming__jump"');
  assert.ok(r.html.indexOf('class="upcoming__tabs"') < sommaire && sommaire < position(r.html, 'upcoming-verdict'));
  // Le sommaire : un lien par bloc, dans le même ordre.
  const liens = [...r.html.matchAll(/class="upcoming__jump-btn">([^<]*)</g)].map((m) => decoder(m[1])).slice(0, 6);
  assert.deepEqual(liens, ['Verdict', 'Pourquoi', 'Compositions', 'Courbe des cotes', 'Avis de l’IA', 'Détail']);
  // Le détail d'avant vient APRÈS l'avis de l'IA : le pronostic du résultat, les statistiques, le cadre du match.
  for (const titre of ['Pronostic du résultat', 'Meilleures statistiques', 'Rencontre']) assert.ok(r.html.indexOf(titre) > position(r.html, 'upcoming-detail'), `${titre} dans le détail`);
  // Les onglets sont tous là, comme avant.
  const onglets = [...r.html.matchAll(/role="tab"[^>]*>\s*([^<]*?)\s*</g)].map((m) => m[1]);
  assert.deepEqual(onglets, ['Résumé', 'Compositions', 'Statistiques', 'Forme', 'Marchés', 'Analyse IA', 'Cotes', 'Profilage de cotes']);
});

// ------------------------------------------------------------------ 2. le verdict

test('le verdict par marché : probabilité et cote juste du moteur, meilleure cote de vos bookmakers et son heure, la pastille de value, « pas encore mesurée » — chiffre pour chiffre ceux du serveur', options, async () => {
  scenario = lesScenarios().avecCotes;
  const r = await contexte.rendre('essai-a');
  const a = scenario.analyse;
  // Le résultat : une ligne par issue, avec le verdict du serveur.
  const issues = [
    ['home', 'Man City gagne'],
    ['draw', 'Match nul'],
    ['away', 'Liverpool gagne']
  ];
  for (const [issue, libelle] of issues) {
    const ligne = ligneDe(r.html, libelle);
    assert.ok(ligne, `la ligne « ${libelle} »`);
    const texte = texteDe(ligne);
    const v = a.verdicts[issue];
    assert.ok(texte.includes(pourcent(a.prediction.probabilities[issue])), `${libelle} : ${pourcent(a.prediction.probabilities[issue])}`);
    assert.ok(texte.includes(`cote juste ${virgule(a.trueOdds[issue])}`), `${libelle} : cote juste ${virgule(a.trueOdds[issue])}`);
    assert.ok(texte.includes(`${virgule(v.cote)} ${v.bookmakerTitle} relevée il y a 10 min`), `${libelle} : la meilleure cote, son bookmaker et son heure`);
    assert.ok(texte.endsWith('pas encore mesurée'), `${libelle} : la confiance`);
    // La pastille dit le verdict du serveur, mot pour mot.
    assert.ok(decoder(ligne).includes(`aria-label="${v.raison}"`), `${libelle} : la phrase du verdict`);
    assert.ok(ligne.includes(`vbadge is-${v.etat} `), `${libelle} : l'état ${v.etat}`);
  }
  // LE vert du résultat : l'issue que le moteur recommande, rien d'autre.
  assert.ok(ligneDe(r.html, 'Man City gagne').includes('vbadge is-value '));
  assert.match(texteDe(ligneDe(r.html, 'Man City gagne')), /pronostic du moteur/);
  assert.equal(compter(r.html, /class="mvb__flag"/g), 1, 'un seul pronostic du résultat, celui de l’issue la plus probable');
  assert.equal(a.staking.action, 'RECOMMENDED');
  assert.doesNotMatch(ligneDe(r.html, 'Match nul'), /is-value /);
  assert.doesNotMatch(ligneDe(r.html, 'Liverpool gagne'), /is-value /);
  // Les autres marchés : un pronostic du moteur par ligne, dans l'ordre des familles.
  const pronostics = a.marketPredictions.filter((p) => p.marketId !== 'result');
  const lignes = lignesDuVerdict(r.html);
  for (const p of pronostics) {
    const ligne = lignes.find((l) => decoder(l).includes(`<strong class="mvb__pick">${p.predictedLabel}</strong>`));
    assert.ok(ligne, `le pronostic « ${p.predictedLabel} » a sa ligne`);
    const texte = texteDe(ligne);
    assert.ok(texte.includes(`${Math.round(100 / p.predictedOdds)} %`), `${p.predictedLabel} : ${Math.round(100 / p.predictedOdds)} %`);
    assert.ok(texte.includes(`cote juste ${virgule(p.predictedOdds)}`), `${p.predictedLabel} : cote juste ${virgule(p.predictedOdds)}`);
    assert.ok(texte.endsWith('pas encore mesurée'), `${p.predictedLabel} : la confiance`);
  }
  // Le pronostic « Plus de 7,5 corners » n'a aucune cote saisie : la raison est dite, jamais un tiret.
  assert.match(texteDe(ligneDe(r.html, 'Plus de 7.5 corners')), /Pas de cote chez vos bookmakers · à saisir Value et confiance pas encore mesurée/);
  // Les cotes saisies : « Les 2 équipes marquent » et « Plus de 2,5 buts » rejoignent le pronostic du moteur qui les vise (value « trop beau »)…
  const oui = texteDe(ligneDe(r.html, 'Oui'));
  assert.match(oui, /1\.80 Betsson saisie (à l'instant|il y a)/);
  assert.ok(ligneDe(r.html, 'Oui').includes('vbadge is-trop-beau'));
  assert.match(texteDe(ligneDe(r.html, 'Plus de 2.5 buts')), /1\.95 Unibet \(NL\) saisie (à l'instant|il y a)/);
  // … et celles que le moteur ne pronostique pas (autre ligne de corners, cartons) ont leur propre ligne : sa probabilité, ou pourquoi il n'en a pas.
  const corners = ligneDe(r.html, 'Plus de 9,5 corners');
  assert.match(texteDe(corners), /Plus de 9,5 corners Total corners Moteur 54 % cote juste 1\.85 Meilleure cote chez vos bookmakers 2\.25 William Hill saisie (à l'instant|il y a)/);
  assert.ok(corners.includes('vbadge is-value '), 'la value saisie sur les corners est verte');
  const cartons = ligneDe(r.html, 'Plus de 4,5 cartons');
  assert.match(texteDe(cartons), /Total cartons Moteur non calculée Meilleure cote chez vos bookmakers 1\.90 Tipico \(DE\) saisie/);
  assert.ok(cartons.includes('vbadge is-inconnue'), 'les cartons : valeur inconnue, jamais verte');
  assert.match(decoder(cartons), /Le moteur ne calcule pas encore les cartons \(étape 33 du plan\)/);
  // Au total : trois issues du résultat, quatorze pronostics, deux saisies à part ; deux values vertes (le résultat et les corners saisis).
  assert.equal(lignes.length, 3 + pronostics.length + 2);
  // (La carte du pari conseillé porte la même pastille que sa ligne : on compte dans le tableau — jusqu'au comparateur de
  // vos bookmakers, posé dessous depuis l'étape 10, qui a ses propres cases vertes.)
  assert.equal(compter(r.html.slice(r.html.indexOf('class="mvb"'), position(r.html, 'upcoming-comparateur')), /vbadge is-value /g), 2);
  assert.match(r.texte, /2 values jouables à cette minute 4 cotes saisies/);
  // Les values jouables, DITES une par une (l'issue, l'avantage de la pastille, chez qui) — sous les puces, avant le tableau.
  const saisieCorners = P.saisiesA.saisies.find((s) => s.cle === 'williamhill|corners|over|9.5');
  const dites = `Man City gagne ${pourcentSigne(a.verdicts.home.pourcent)} chez William Hill · Plus de 9,5 corners ${pourcentSigne(saisieCorners.pourcent)} chez William Hill`;
  assert.ok(r.texte.includes(dites), `la ligne des values : ${dites}`);
  assert.ok(r.html.indexOf('class="mvb__valeurs"') > r.html.indexOf('class="mvb__sum"') && r.html.indexOf('class="mvb__valeurs"') < r.html.indexOf('class="mvb__head"'));
  // La provenance de vos cotes (The Odds API, payant) : dans le titre du groupe « Résultat », avec l'heure du relevé (pas seulement dans la carte du pari conseillé).
  const groupe = r.html.slice(r.html.indexOf('data-groupe="resultat"'), r.html.indexOf('<ul class="mvb__list"'));
  assert.match(texteDe(groupe), /Résultat · 1 \/ N \/ 2 The Odds API relevé (aujourd'hui|hier|le \d\d\/\d\d) à \d\d:\d\d payant/);
  // Celle de la confiance et des autres notions : bulles d'aide du guide.
  const aides = [...r.html.matchAll(/aria-label="(Qu&#39;est-ce que « [^"]*» \?)"/g)].map((m) => decoder(m[1]));
  for (const terme of ['Cote juste', 'Value', 'Sûr / fragile']) assert.ok(aides.includes(`Qu'est-ce que « ${terme} » ?`), `bulle « ${terme} »`);
  // La phrase d'ensemble et le compte à rebours.
  assert.match(r.texte, /Verdict par marché .* dans 6 h 30/);
  assert.match(r.texte, /Comment lire ce verdict/);
});

test('le pari conseillé est en tête du verdict (et plus dans l’onglet Marchés, qui renvoie vers lui)', options, async () => {
  scenario = lesScenarios().avecCotes;
  const r = await contexte.rendre('essai-a');
  const s = scenario.analyse.staking;
  assert.equal(s.action, 'RECOMMENDED');
  const debut = position(r.html, 'upcoming-verdict');
  const carte = r.html.indexOf('upcoming__advice"', debut);
  assert.ok(carte > debut && carte < position(r.html, 'upcoming-pourquoi'), 'le pari conseillé est dans le verdict');
  assert.ok(carte < r.html.indexOf('class="mvb"'), 'et AVANT le tableau des marchés');
  assert.match(r.texte, new RegExp(`Pari conseillé par le moteur Man City gagne chez ${s.bookmakerTitle}`));
  assert.match(r.texte, new RegExp(`${virgule(s.displayedOdds ?? s.odds)}`));
  // L'onglet Marchés : plus la carte, mais un renvoi, le tableau des pronostics et la saisie express.
  const m = await contexte.rendre('essai-a', { onglet: 'markets' });
  assert.deepEqual(m.avertissements, []);
  assert.doesNotMatch(m.texte, /Pari conseillé par le moteur Man City/);
  assert.match(m.texte, /Le pari conseillé par le moteur, ou la value à rafraîchir, et le verdict de chaque marché \(cote, heure du relevé, value\) sont en tête du Résumé\. Voir le verdict/);
  assert.match(m.texte, /Pronostics du moteur, marché par marché/);
  assert.ok(m.html.includes('id="upcoming-saisie"'), 'la saisie express a son ancre');
  assert.match(m.texte, /Saisir une cote de vos bookmakers/);
});

test('la place du « pourquoi ce pourcentage » : réservée, discrète, sans aucune explication inventée', options, async () => {
  scenario = lesScenarios().avecCotes;
  const r = await contexte.rendre('essai-a');
  const debut = position(r.html, 'upcoming-pourquoi');
  const bloc = r.html.slice(r.html.lastIndexOf('<section', debut), r.html.indexOf('</section>', debut));
  const texte = texteDe(bloc);
  assert.match(texte, /^Pourquoi ce pourcentage \? à venir · étape 40 du plan Place réservée\./);
  assert.match(texte, /aucune explication inventée/);
  // Rien d'autre que le dire : pas un chiffre, pas une pastille.
  assert.doesNotMatch(bloc, /vbadge|cgauge|<table|otc__svg/);
  assert.doesNotMatch(texte.replace(/étape 40/, ''), /\d/);
});

// ------------------------------------------------------------------ 3. compositions, courbe, avis de l'IA

test('les compositions et les absents, la courbe des cotes et l’avis de l’IA : leurs données, dans le Résumé', options, async () => {
  scenario = lesScenarios().avecCotes;
  const r = await contexte.rendre('essai-a');
  const entre = (a, b) => r.html.slice(position(r.html, a), position(r.html, b));
  // (c) Pas de composition publiée : la dernière alignée, dite, avec son état et son terrain.
  const compos = entre('upcoming-compos', 'upcoming-courbe');
  const textCompos = texteDe(compos);
  assert.match(textCompos, /Compositions et absents/);
  assert.match(textCompos, /Dernière composition alignée FotMob n'a pas encore publié le onze de ce match/);
  assert.match(textCompos, /Dernière alignée/);
  assert.match(textCompos, /Relire chez FotMob/);
  assert.ok(compos.includes('class="lp-wrap"'), 'le terrain');
  // Étape 32 : le changement d'entraîneur est dans « Contexte du match » (une seule place par information).
  assert.match(textCompos, /Actualités d'équipe Blessures et suspensions d'après FotMob, gratuit\./);
  // (d) La courbe : trois issues du résultat, de l'ouverture au dernier relevé, les mêmes cotes justes que l'onglet Cotes.
  const courbe = entre('upcoming-courbe', 'upcoming-ia');
  const mouvements = scenario.fixture.movement.filter((m) => m.market === '1x2');
  assert.equal(mouvements.length, 3);
  assert.equal(compter(courbe, /class="[^"]*otc__serie[^"]*"/g), 3);
  for (const m of mouvements) {
    const ligne = courbe.split(/<li class="otc__row">/).slice(1).find((t) => t.includes(`<strong>${m.label}</strong>`));
    assert.ok(ligne, `la ligne de « ${m.label} »`);
    const t = texteDe(ligne);
    assert.ok(t.includes(`Ouverture ${virgule(1 / m.fromProb)}`) && t.includes(`dernier relevé ${virgule(1 / m.toProb)}`), `${m.label} : ${virgule(1 / m.fromProb)} → ${virgule(1 / m.toProb)}`);
    assert.ok(t.includes(`${m.agreeing} bookmakers sur ${m.bookmakersCount} vont dans ce sens`), `${m.label} : l'accord des bookmakers`);
    const sens = m.dropPct > 0 ? 'baisse' : 'hausse';
    assert.match(ligne, new RegExp(`class="[^"]*omove[^"]*is-${sens}|class="[^"]*is-${sens}[^"]*omove`), `${m.label} : la cote juste ${sens}`);
  }
  const textCourbe = texteDe(courbe);
  assert.match(textCourbe, /Les cotes, de l'ouverture à maintenant La cote juste de chaque issue, de son ouverture au dernier relevé\./);
  assert.match(textCourbe, /365Scores, ESPN relevé (aujourd'hui|hier|le \d\d\/\d\d) à \d\d:\d\d/);
  assert.match(textCourbe, /Ouverture (hier|le \d\d\/\d\d) à \d\d:\d\d Dernier relevé (aujourd'hui|hier|le \d\d\/\d\d) à \d\d:\d\d/);
  assert.match(textCourbe, /Plus\/moins de 2,5 buts/, 'les autres marchés ont leur bouton');
  assert.match(textCourbe, /Cotes de référence, pas les vôtres/);
  assert.doesNotMatch(courbe, /vbadge|is-value|--cm-accent|cm-positive|cm-negative/, 'jamais de vert ni de value sur la courbe');
  // (e) L'avis de l'IA : sa lecture, ses clés et ses avis.
  const ia = texteDe(entre('upcoming-ia', 'upcoming-detail'));
  assert.match(ia, /Avis de l'IA La lecture du match par l'IA, marché par marché/);
  assert.match(ia, /Lecture de l'IA/);
  assert.match(ia, /Man City reçoit un Liverpool amoindri/);
  assert.match(ia, /Les clés du match Forme récente/);
  assert.ok(compter(entre('upcoming-ia', 'upcoming-detail'), /class="aimc /g) >= 3, 'les avis de l’IA, marché par marché');
});

test('des compositions officielles et des cotes d’avant leur annonce : l’état de la compo est « officielle » et la value, « à rafraîchir »', options, async () => {
  scenario = lesScenarios().officielle;
  // 18 h 00 UTC : 30 minutes avant le coup d'envoi ; le relevé payant date de 11 h 50.
  const r = await contexte.rendre('essai-a', { heure: Date.parse('2026-10-05T18:00:00Z') });
  assert.deepEqual(r.avertissements, []);
  const compos = r.html.slice(position(r.html, 'upcoming-compos'), position(r.html, 'upcoming-courbe'));
  assert.match(texteDe(compos), /Compo officielle/);
  assert.doesNotMatch(texteDe(compos), /Dernière composition alignée FotMob n'a pas encore publié/);
  assert.match(texteDe(compos), /Liverpool Blessé/, 'l’absent annoncé');
  const home = ligneDe(r.html, 'Man City gagne');
  assert.ok(home.includes('vbadge is-a-rafraichir'));
  assert.doesNotMatch(r.html.slice(position(r.html, 'upcoming-verdict'), position(r.html, 'upcoming-pourquoi')), /vbadge is-value /);
  assert.match(decoder(home), /Cote à rafraîchir : Le match commence dans|Cote à rafraîchir : Relevée il y a 6 h 10/);
  assert.match(texteDe(r.html.slice(position(r.html, 'upcoming-verdict'), position(r.html, 'upcoming-pourquoi'))), /Value à rafraîchir/);
  assert.match(r.texte, /Aucune value jouable à cette minute/);
});

test('l’heure qui tourne : quatre heures plus tard, la page restée ouverte n’a plus aucun vert — la value passe « à rafraîchir » d’elle-même', options, async () => {
  scenario = lesScenarios().avecCotes;
  const r = await contexte.rendre('essai-a', { heure: T0 + 4 * H });
  assert.deepEqual(r.avertissements, []);
  const verdict = r.html.slice(position(r.html, 'upcoming-verdict'), position(r.html, 'upcoming-pourquoi'));
  assert.equal(compter(verdict, /vbadge is-value /g), 0, 'plus aucune pastille verte');
  assert.ok(ligneDe(r.html, 'Man City gagne').includes('vbadge is-a-rafraichir'));
  assert.ok(ligneDe(r.html, 'Plus de 9,5 corners').includes('vbadge is-a-rafraichir'), 'la cote saisie vieillit aussi');
  assert.doesNotMatch(texteDe(verdict), /Pari conseillé par le moteur/);
  assert.match(texteDe(verdict), /Value à rafraîchir .* Man City gagne chez William Hill/);
  assert.match(r.texte, /Aucune value jouable à cette minute/);
  assert.match(decoder(ligneDe(r.html, 'Man City gagne')), /Relevée il y a 4 h 10, au-delà du délai de 3 h/);
});

// ------------------------------------------------------------------ 4. un match sans cotes

test('un match sans cotes : chaque absence est dite — aucune cote, aucune value, aucune courbe inventées', options, async () => {
  scenario = lesScenarios().sansCotes;
  const m = scenario.match;
  const a = scenario.analyse;
  assert.equal(a.market.available, false, 'le match n’a vraiment aucune cote de marché');
  const r = await contexte.rendre(m.matchId);
  assert.deepEqual(r.avertissements, []);
  const verdict = r.html.slice(position(r.html, 'upcoming-verdict'), position(r.html, 'upcoming-pourquoi'));
  const t = texteDe(verdict);
  // Aucun pari conseillé, et pourquoi.
  assert.match(t, /Aucun pari conseillé Pas de cote de marché pour ce match : le pronostic vient des statistiques/);
  assert.match(t, /dans 2 jours/, 'un match du calendrier : le jour seul, jamais des heures inventées');
  assert.doesNotMatch(verdict, /upcoming__advice|upcoming__stale/);
  // Les trois issues : la probabilité du moteur (statistiques), mais ni cote, ni value, ni couleur.
  for (const [issue, libelle] of [['home', `${m.home} gagne`], ['draw', 'Match nul'], ['away', `${m.away} gagne`]]) {
    const ligne = ligneDe(r.html, libelle);
    assert.ok(ligne, libelle);
    const texte = texteDe(ligne);
    assert.ok(texte.includes(pourcent(a.prediction.probabilities[issue])), `${libelle} : ${pourcent(a.prediction.probabilities[issue])}`);
    assert.match(texte, /cote juste \d\.\d\d statistiques/);
    assert.ok(decoder(ligne).includes('title="Le moteur donne'), `${libelle} : d'où vient le pourcentage`);
    assert.match(decoder(ligne), /d'après les statistiques, faute de cote/);
    assert.match(texte, /Pas de cote de marché pour ce match/);
    assert.ok(ligne.includes('vbadge is-pas-de-cote'), `${libelle} : « pas de cote »`);
    assert.ok(!/<span class="mvb__odds/.test(ligne), `${libelle} : aucune cote affichée`);
    assert.ok(texte.endsWith('pas encore mesurée'));
  }
  // Les autres marchés : le pronostic du moteur, et « pas de cote ».
  const pronostics = a.marketPredictions.filter((p) => p.marketId !== 'result');
  assert.ok(pronostics.length >= 5);
  for (const p of pronostics) {
    const ligne = lignesDuVerdict(r.html).find((l) => decoder(l).includes(`<strong class="mvb__pick">${p.predictedLabel}</strong>`));
    assert.ok(ligne, p.predictedLabel);
    assert.match(texteDe(ligne), /Pas de cote chez vos bookmakers/);
    assert.doesNotMatch(ligne, /vbadge/);
  }
  assert.equal(compter(verdict, /vbadge is-value /g), 0);
  assert.match(r.texte, /Aucune value jouable à cette minute/);
  assert.doesNotMatch(verdict, /class="prov /, 'aucune provenance de cotes qui n’existent pas');
  // La courbe : aucune cote relevée — dit, avec ce qui manque.
  const courbe = texteDe(r.html.slice(position(r.html, 'upcoming-courbe'), position(r.html, 'upcoming-ia')));
  assert.match(courbe, /Aucune cote relevée pour ce match Aucune cote n'a été relevée gratuitement pour ce match/);
  assert.match(courbe, /il n'y a pas de courbe à tracer/);
  assert.match(courbe, /Voir l'onglet Cotes/);
  assert.ok(P.fixtureSansCotes.missing.length >= 4);
  assert.match(courbe, new RegExp(P.fixtureSansCotes.missing[0].label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(r.html.slice(position(r.html, 'upcoming-courbe'), position(r.html, 'upcoming-ia')), /<svg class="otc__svg/);
  // Les compositions : introuvables chez FotMob, dit ; le pourquoi et le détail restent.
  assert.match(texteDe(r.html.slice(position(r.html, 'upcoming-compos'), position(r.html, 'upcoming-courbe'))), /Match introuvable chez FotMob/);
  assert.match(r.texte, /Pourquoi ce pourcentage \? à venir/);
  assert.match(r.texte, /Le détail .* Pronostic du résultat/);
});

test('une analyse du moteur impossible : le verdict le dit, le reste de la page s’affiche', options, async () => {
  scenario = { ...lesScenarios().avecCotes, analyseEnPanne: true };
  const r = await contexte.rendre('essai-a');
  assert.deepEqual(r.avertissements, []);
  const verdict = r.html.slice(position(r.html, 'upcoming-verdict'), position(r.html, 'upcoming-pourquoi'));
  assert.match(texteDe(verdict), /Analyse du moteur impossible Le moteur n'a pas pu analyser ce match \(essai\)\./);
  assert.doesNotMatch(verdict, /class="mvb"/);
  // Compositions, courbe des cotes et avis de l'IA ne dépendent pas de l'analyse : ils sont là.
  assert.match(texteDe(r.html.slice(position(r.html, 'upcoming-compos'), position(r.html, 'upcoming-courbe'))), /Dernière composition alignée/);
  assert.equal(compter(r.html.slice(position(r.html, 'upcoming-courbe'), position(r.html, 'upcoming-ia')), /class="[^"]*otc__serie[^"]*"/g), 3);
  assert.match(r.texte, /Lecture de l'IA/);
});

test('les cotes relevées illisibles : la courbe le dit (« Cotes indisponibles »), le verdict n’en dépend pas', options, async () => {
  scenario = { ...lesScenarios().avecCotes, fixtureEnPanne: true };
  const r = await contexte.rendre('essai-a');
  assert.deepEqual(r.avertissements, []);
  const courbe = r.html.slice(position(r.html, 'upcoming-courbe'), position(r.html, 'upcoming-ia'));
  assert.match(texteDe(courbe), /Cotes indisponibles cotes relevées indisponibles \(essai\)/);
  assert.doesNotMatch(courbe, /<svg class="otc__svg|otc__row|vbadge/);
  assert.ok(ligneDe(r.html, 'Man City gagne').includes('vbadge is-value '), 'le verdict du 1 / N / 2 ne lit pas les cotes gratuites');
});

test('les cotes saisies illisibles : le verdict garde ses lignes et dit « pas de cote », sans rien inventer', options, async () => {
  scenario = { ...lesScenarios().avecCotes, saisiesEnPanne: true };
  const r = await contexte.rendre('essai-a');
  assert.deepEqual(r.avertissements, []);
  const lignes = lignesDuVerdict(r.html);
  const a = scenario.analyse;
  assert.equal(lignes.length, 3 + a.marketPredictions.filter((p) => p.marketId !== 'result').length, 'les trois issues et les quatorze pronostics, aucune saisie');
  assert.doesNotMatch(texteDe(ligneDe(r.html, 'Oui')), /Betsson/);
  assert.match(texteDe(ligneDe(r.html, 'Oui')), /Pas de cote chez vos bookmakers · à saisir/);
  assert.ok(ligneDe(r.html, 'Man City gagne').includes('vbadge is-value '), 'le 1 / N / 2 n’en dépend pas');
});

// ------------------------------------------------------------------ 5. rien de perdu

test('chaque onglet d’avant garde son contenu', options, async () => {
  scenario = lesScenarios().avecCotes;
  const a = scenario.analyse;
  const onglet = async (nom) => {
    const r = await contexte.rendre('essai-a', { onglet: nom });
    assert.deepEqual(r.avertissements, [], `avertissements de Vue (${nom})`);
    return r;
  };
  // Compositions : la carte d'avant, la dernière composition alignée.
  const compositions = await onglet('lineups');
  assert.match(compositions.texte, /Compositions Le onze de chaque équipe, publié par FotMob ; à défaut, le dernier aligné\./);
  assert.match(compositions.texte, /Dernière composition alignée/);
  assert.ok(!compositions.html.includes('id="upcoming-verdict"'), 'l’onglet Compositions n’affiche pas le verdict');
  // Statistiques : corners et tirs attendus, puis les moyennes par groupe.
  const stats = await onglet('stats');
  assert.match(stats.texte, /Corners et tirs attendus/);
  assert.match(stats.texte, /Moyennes par match sur les 10 dernières rencontres\./);
  assert.match(stats.texte, /Possession de balle/);
  // Forme : les cinq derniers matchs de chaque équipe.
  const forme = await onglet('form');
  assert.match(forme.texte, /Man City — 5 derniers matchs/);
  assert.match(forme.texte, /Liverpool — 5 derniers matchs/);
  // Marchés : le tableau des pronostics (toutes les familles) et la saisie express.
  const marches = await onglet('markets');
  for (const famille of ['Le match', 'Buts', 'Corners', 'Tirs', 'Tirs cadrés']) assert.match(marches.texte, new RegExp(famille));
  for (const p of a.marketPredictions.filter((x) => x.marketId !== 'result').slice(0, 5)) assert.ok(marches.texte.includes(p.predictedLabel.replace(/^[^—]+— /, '')), p.predictedLabel);
  assert.match(marches.texte, /Corners et tirs attendus|Total du match/);
  assert.ok(marches.html.includes('id="upcoming-saisie"'));
  assert.match(marches.texte, /Saisir une cote de vos bookmakers Sa value face au moteur aussitôt/);
  // Analyse IA : le panneau d'avant.
  const ia = await onglet('ai');
  assert.match(ia.texte, /Analyse IA La lecture du match par l'IA, marché par marché, à partir des pronostics du moteur\./);
  assert.match(ia.texte, /Lecture de l'IA/);
  // Cotes et profilage de cotes.
  const cotes = await onglet('cotes');
  assert.match(cotes.texte, /Cotes Relevées gratuitement chez ESPN, football-data\.co\.uk, 365Scores, Kalshi et Smarkets\./);
  const profilage = await onglet('odds');
  assert.match(profilage.texte, /Profilage de cotes Comment ont fini les matchs passés cotés comme celui-ci\./);
});

test('rien de ce que montrait le Résumé d’avant ne disparaît : le détail le garde, dans le même ordre', options, async () => {
  scenario = lesScenarios().avecCotes;
  const r = await contexte.rendre('essai-a');
  const detail = r.html.slice(position(r.html, 'upcoming-detail'));
  const t = texteDe(detail);
  // Les cartes d'avant, à leur place relative : résultat et score, statistiques, cadre du match.
  const dans = (motif) => t.search(motif);
  // Étape 32 : « Rencontre » garde le stade et la capacité ; la pelouse, la météo et l'arbitre sont dans « Contexte du match ».
  const rangs = [/Pronostic du résultat/, /Pronostic du score/, /Meilleures statistiques Moyennes par match sur les 10 dernières rencontres\./, /Rencontre Stade et capacité publiés par FotMob\./].map(dans);
  assert.ok(rangs.every((x) => x >= 0), `les quatre cartes du détail : ${rangs}`);
  assert.deepEqual([...rangs].sort((x, y) => x - y), rangs, 'dans l’ordre d’avant');
  assert.match(t, /Etihad Stadium/);
  // Le bas de page renvoie aux onglets.
  assert.match(t, /Plus de détail Statistiques Forme Marchés Cotes Profilage de cotes/);
  // En direct : seulement quand le match est en cours, comme avant.
  assert.doesNotMatch(t, /Voir le direct/);
  const enCours = await contexte.rendre('essai-a', { heure: Date.parse('2026-10-05T19:00:00Z') });
  assert.match(texteDe(enCours.html.slice(position(enCours.html, 'upcoming-detail'))), /En direct Score et statistiques en cours de match \(API-Football, sur demande\)\. Voir le direct/);
});

// ------------------------------------------------------------------ 6. hygiène et câblage

const styleDe = (source) => [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
const NOUVEAUX = [
  ['components', 'analysis', 'MarketVerdictBoard.vue'],
  ['components', 'analysis', 'OddsTimelineChart.vue'],
  ['components', 'analysis', 'PercentageWhyCard.vue']
];

test('hygiène des nouveaux composants : aucune couleur en dur, aucun !important, aucune police sous 10 px, seulement des jetons existants, jamais le vert d’une value, icônes connues', options, () => {
  const tokens = lireUi('assets', 'styles', 'tokens.css');
  const connues = new Set([...lireUi('components', 'common', 'AppIcon.vue').matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]));
  for (const fichier of NOUVEAUX) {
    const source = lireUi(...fichier);
    const css = styleDe(source);
    const nom = fichier.join('/');
    assert.ok(css.length > 300, `${nom} : un style`);
    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, `${nom} : une couleur hexadécimale en dur`);
    assert.doesNotMatch(css, /\brgba?\(\s*\d/, `${nom} : une couleur rgb en dur`);
    assert.doesNotMatch(css, /!important/, `${nom} : !important`);
    assert.doesNotMatch(css, /--cm-accent|--cm-danger|cm-positive|cm-negative/, `${nom} : du vert ou du rouge, qui ne disent pas « value »`);
    for (const [, taille] of css.matchAll(/font-size:\s*([\d.]+)px/g)) assert.ok(Number(taille) >= 10, `${nom} : police de ${taille}px`);
    for (const [, jeton] of css.matchAll(/var\((--cm-[a-z0-9-]+)/g)) assert.ok(tokens.includes(`${jeton}:`), `${nom} : le jeton ${jeton} n'existe pas`);
    for (const [, icone] of source.matchAll(/<AppIcon name="(\w+)"/g)) assert.ok(connues.has(icone), `${nom} : l'icône « ${icone} »`);
    for (const [, icone] of source.matchAll(/:name="\w+\[[\w.]+\] ?\?\? ?'?(\w+)'?"/g)) assert.ok(connues.has(icone), `${nom} : l'icône « ${icone} »`);
    // Chaque pastille de value reçoit la fraîcheur de sa cote ; le verdict du moteur quand il existe.
    for (const m of source.matchAll(/<ValueBadge\b([\s\S]*?)\/?>/g)) assert.match(m[1], /:fraicheur="/, `${nom} : une pastille sans sa fraîcheur`);
  }
  // Les icônes d'un tableau (OddsTimelineChart : « ICONES » dans le script) existent aussi.
  // La partie de la page que l'étape 9 ajoute : les mêmes règles.
  const page = lireUi('views', 'UpcomingMatchView.vue');
  const debut = page.indexOf("la décision d'abord (étape 9)");
  const fin = page.indexOf('/* ------------------------------------------------------ largeurs */');
  assert.ok(debut > 0 && fin > debut, 'le bloc de style de l’étape 9');
  const cssPage = page.slice(debut, fin).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(cssPage.length > 400);
  assert.doesNotMatch(cssPage, /#[0-9a-fA-F]{3,8}\b|\brgba?\(\s*\d|!important|--cm-accent|--cm-danger/);
  for (const [, taille] of cssPage.matchAll(/font-size:\s*([\d.]+)px/g)) assert.ok(Number(taille) >= 10, `page : police de ${taille}px`);
  for (const [, jeton] of cssPage.matchAll(/var\((--cm-[a-z0-9-]+)/g)) assert.ok(tokens.includes(`${jeton}:`), `page : le jeton ${jeton} n'existe pas`);
});

test('câblage : la page pose les trois blocs dans l’ordre, le verdict reçoit les saisies, la courbe les cotes relevées ; aucun achat ni appel payant côté page', options, () => {
  const page = lireUi('views', 'UpcomingMatchView.vue');
  const ids = ['upcoming-verdict', 'upcoming-pourquoi', 'upcoming-compos', 'upcoming-courbe', 'upcoming-ia', 'upcoming-detail'].map((id) => page.indexOf(`id="${id}"`));
  assert.ok(ids.every((x) => x > 0));
  assert.deepEqual([...ids].sort((x, y) => x - y), ids, 'les blocs sont écrits dans l’ordre de la décision');
  // Chaque lien du sommaire mène à un bloc qui existe (« upcoming-<id> »), dans le même ordre.
  const sommaire = [.../const BLOCS = \[([\s\S]*?)\];/.exec(page)[1].matchAll(/id: '(\w+)'/g)].map((m) => m[1]);
  assert.deepEqual(sommaire, ['verdict', 'pourquoi', 'compos', 'courbe', 'ia', 'detail']);
  assert.deepEqual(sommaire.map((id) => page.indexOf(`id="upcoming-${id}"`)), ids, 'chaque lien du sommaire a son ancre, dans l’ordre');
  assert.match(page, /<MarketVerdictBoard :result="analyse\.result" :match="match" :saisies="saisies\.data" @saisir="saisirUneCote" \/>/);
  assert.match(page, /<OddsTimelineChart id="upcoming-courbe" class="upcoming__block" :etat="cotes" @voir-cotes="ouvrirOnglet\('cotes'\)" \/>/);
  assert.match(page, /<PercentageWhyCard id="upcoming-pourquoi" class="upcoming__block" \/>/);
  // Ce que la page appelle de plus : le magasin local (cotes relevées, cotes saisies), jamais un relevé payant.
  assert.match(page, /oddsApi\.fixture\(/);
  assert.match(page, /oddsApi\.saisies\(/);
  assert.doesNotMatch(page, /oddsApi\.(refresh|saisir|retirerSaisie|enregistrerFraicheur)\(/);
  // Les phrases du test des cotes de l'étape 7 tiennent toujours (la page garde ses bulles et sa saisie express).
  assert.match(page, /<ManualOddsEntry :match-id="match\.matchId" :home="match\.home" :away="match\.away" \/>/);
  assert.match(page, /<PaidOddsAdvicePanel variante="compacte" \/>/);
  assert.match(page, /<HelpTip terme="a-rafraichir" \/>/);
  // Les composants n'appellent rien : ni réseau, ni service de l'appli (la page leur donne tout).
  for (const fichier of NOUVEAUX) {
    const source = lireUi(...fichier);
    assert.doesNotMatch(source, /@\/services\/|fetch\(|httpClient/, `${fichier.join('/')} : aucun appel`);
  }
});

// ------------------------------------------------------------------ 7. étape 27 : rien ne change pendant l'essai

test('étape 27 — pendant l’essai à blanc, la page du match ne change pas : le VRAI serveur (réglages en service, la clé `modeleDeButs` absente) ne pose ni le modèle ni sa provenance, et aucun onglet ne porte une marque ou un mot du modèle de buts unique', options, async () => {
  const s = lesScenarios();
  for (const [nom, sc] of [['avecCotes', s.avecCotes], ['sansCotes', s.sansCotes]]) {
    // Ce que le serveur répond : aucune trace du modèle (moteurCleEteinte prouve l'identité à l'octet sur 201 cibles).
    assert.equal('modeleDeButs' in sc.analyse, false, nom);
    assert.equal(sc.analyse.distributions?.scoreExact, undefined, nom);
    assert.equal('autreScore' in (sc.analyse.scorePrediction ?? {}), false, nom);
    for (const d of Object.values(sc.analyse.distributions ?? {})) assert.equal(d?.provenance, undefined, nom);
    scenario = sc;
    const id = nom === 'avecCotes' ? 'essai-a' : sc.match.matchId;
    for (const onglet of ['resume', 'lineups', 'stats', 'form', 'markets', 'ai', 'cotes', 'odds']) {
      const r = await contexte.rendre(id, { onglet });
      assert.deepEqual(r.avertissements, [], `${nom} / ${onglet}`);
      assert.equal(r.html.includes('data-modele-de-buts'), false, `${nom} / ${onglet} : une marque de l’étape 27`);
      for (const mot of [/Ce que disent les/, /autre score/, /Modèle de buts unique/, /Moteur CôteMaster · (cote 1N2|xG FotMob|buts FotMob)/, /Écart sur le 2,5/, /calé sur/i]) {
        assert.doesNotMatch(r.texte, mot, `${nom} / ${onglet} : « ${mot} »`);
      }
    }
  }
});

test('aucun appel hors liste pendant ces rendus — ni API payante, ni FotMob, ni Claude, ni la vraie appli — et aucun avertissement de Vue', options, () => {
  assert.deepEqual(interdits, [], 'appels refusés');
  assert.deepEqual(avertissements, [], 'avertissements de Vue');
  assert.ok(appels.length >= 30, `${appels.length} appels simulés`);
  assert.ok(!appels.some((u) => /odds-api\.com|fotmob\.com|anthropic|localhost:4000\/api\/odds\/refresh/.test(u)));
});
