/**
 * Le contrôle quotidien, la santé des sources et le badge « à vérifier » SE
 * RENDENT (étape 14 du plan).
 *   node --test test/controleQuotidienEcran.test.mjs        (depuis server/)
 *
 * Les réponses de GET /api/health/checks, /api/health/sources et du champ
 * `controleQuotidien` de GET /api/refresh sont celles du VRAI serveur : la
 * phase « ecran » de test/aides/script-controle-quotidien.mjs plante les cas
 * dans une copie isolée de la base d'essai, lance le contrôle et appelle les
 * routes (application Express, sans réseau). Retouche du 07/10 au soir : cette
 * copie est rangée dans un BAC SIMULÉ (test/aides/bacSimule.mjs), le même où
 * que le test tourne — le feu d'un serveur « jamais contrôlé » et la carte des
 * sources « coupées par le bac » ne dépendent plus de l'endroit où il est
 * lancé (le bac ou le dépôt). Celles de la page d'un match et
 * des Opportunités viennent des aides des étapes 8 et 9. Le rendu est fait
 * côté serveur, sans navigateur ni serveur de développement : `fetch`
 * remplacé (tout appel hors liste refusé et compté), un Vite « middleware »
 * n'écoute sur aucun port, son cache va dans le dossier d'essais, rien n'est
 * écrit dans ui/. `onMounted` devient `onServerPrefetch` dans le rendu.
 *
 *  1. La carte « Contrôle quotidien » : le feu, les contrôles en échec d'abord
 *     avec leurs constats (« nouveau »), tous les contrôles famille par
 *     famille, Σ au pied, les dernières passes (Σ, ⌀), la provenance ; jamais
 *     contrôlé, serveur en erreur, serveur pas relancé, état illisible : la
 *     structure reste et la raison est dite.
 *  2. La carte « Santé des sources » : six lignes toujours (état, dernier
 *     relevé, limite), le jeton Claude « à confirmer », Σ au pied. Lot 3
 *     (07/10/2026) : la ligne FotMob dit le texte minute par minute de la revue
 *     d'après-match (fichiers lus, langues absentes — un 403 attendu, jamais une
 *     panne —, échecs ; réponses du vrai serveur, script-sante-commentaire.mjs).
 *  3. La puce du feu en haut de l'appli : le mot et la couleur, les contrôles
 *     en échec au survol ; rien quand le serveur ne la connaît pas encore.
 *  4. Le badge « à vérifier » : seul, sur les cartes de marchés (famille du
 *     marché), sur les Opportunités — le vert d'une value ne bouge jamais.
 *     Retouche du 07/10 (réponses du vrai serveur, phase « joueurs » du script) :
 *     un écart de buteurs ou de gardiens reste rouge dans la carte (son club
 *     n'est pas compté parmi les clubs « aux données douteuses »), sans bandeau
 *     ni badge sur les cartes de marchés ; seul un marché de buteur le porte.
 *     Correction du 07/10 (lot 3) : sur la planche des pronostics (MarketPicksBoard),
 *     le badge du TITRE d'une famille (Buts, Corners, Tirs, Tirs cadrés) reçoit
 *     l'identifiant du marché de SA famille — pas l'objet de sa carte, que Vue
 *     refusait (« Expected String ») et qui rangeait toute famille en « buts » :
 *     un constat « corners » n'apparaissait jamais sur le titre « Corners ».
 *  5. L'hygiène des composants et le câblage (Réglages, page du match, journal).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { preparerCopie, executer, SERVEUR, RACINE_ESSAIS } from './aides/isolement.mjs';
import { preparerCopieDeBac, executerDansLeBac } from './aides/bacSimule.mjs';
import * as PM from './aides/donneesPageMatch.mjs';
import * as OP from './aides/donneesOpportunites.mjs';
import * as EP from './aides/donneesEcransParis.mjs';

const UI = path.resolve(SERVEUR, '..', 'ui');
const pret = ['vite', '@vitejs/plugin-vue', 'vue', 'pinia', 'vue-router'].every((p) => fs.existsSync(path.join(UI, 'node_modules', p)));
const imp = (chemin) => import(pathToFileURL(chemin).href);
const options = { skip: pret ? false : 'ui/node_modules (vite, plugin-vue, vue, pinia, vue-router) manque' };
const U = await imp(path.join(UI, 'src', 'utils', 'controleQuotidien.js'));
const lireUi = (...p) => fs.readFileSync(path.join(UI, 'src', ...p), 'utf8').replace(/\r\n/g, '\n');

/** Les réponses du vrai serveur, produites une fois dans une copie isolée rangée dans un bac simulé (phase « ecran », ou « joueurs » : un écart de buteurs et de gardiens plantés, puis un faux score). */
function reponsesDuServeur(phase = 'ecran') {
  const copie = preparerCopieDeBac({});
  try {
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    const r = executerDansLeBac(copie, path.join(SERVEUR, 'test', 'aides', 'script-controle-quotidien.mjs'), { args: [phase], timeout: 300_000 });
    assert.equal(r.code, 0, r.erreurs.slice(-3000));
    assert.equal(r.reseau, false);
    return r.json;
  } finally {
    copie.nettoyer();
  }
}

/** Les seuls appels permis (le reste est refusé et compté). */
const AUTORISES = [
  /\/api\/health\/(checks|sources)$/,
  /\/api\/health$/,
  /\/api\/refresh$/,
  /\/api\/opportunities(\?|$)/,
  /\/api\/sources$/,
  /\/api\/config$/,
  /\/api\/screener(\?|$)/,
  /\/api\/odds\/conseil-releve$/,
  /\/api\/match-stats\/team-ids/
];
const texteDe = (html) =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[  ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const decoder = (v) => v.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const compter = (texte, motif) => (texte.match(motif) ?? []).length;
/** Combien d'éléments portent TOUTES ces classes, dans n'importe quel ordre (le rendu serveur met parfois la classe dynamique d'abord). */
const avecClasses = (html, ...classes) => [...html.matchAll(/class="([^"]*)"/g)].filter((m) => classes.every((c) => m[1].split(/\s+/).includes(c))).length;
const nombre = (n) => Number(n).toLocaleString('fr-FR').replace(/[  ]/g, ' ');
/** La valeur d'un attribut du premier élément qui porte `classe` dans `html`. */
const attribut = (html, classe, nom) => {
  const balise = new RegExp(`<[^>]*class="[^"]*\\b${classe}\\b[^"]*"[^>]*>`).exec(html)?.[0] ?? '';
  const valeur = new RegExp(`\\b${nom}="([^"]*)"`).exec(balise)?.[1];
  return valeur === undefined ? undefined : decoder(valeur);
};
const tableaux = (html) => html.split('<table').slice(1).map((t) => t.split('</table>')[0]);
/** Les rangées de tous les corps d'un tableau (un tableau peut en avoir un par famille), chacune en HTML. */
const corpsDe = (t) =>
  t
    .split(/<tbody\b/)
    .slice(1)
    .map((b) => b.replace(/^[^>]*>/, '').split('</tbody>')[0])
    .join('')
    .split(/<tr\b/)
    .slice(1)
    .map((x) => `<tr${x}`);
const piedDe = (t) => (t.split('<tfoot')[1] ?? '').split('</tfoot>')[0].split(/<tr\b/).slice(1).map((x) => `<tr${x}`);

let serveur;
let serveurJoueurs;
let pageMatch;
let contexte;
let scenario = {};
const appels = [];
const interdits = [];
const avertissements = [];
let originaux = {};

const reponseJson = (corps, statut = 200) => ({ ok: statut < 400, status: statut, headers: { get: () => 'application/json' }, json: async () => JSON.parse(JSON.stringify(corps)) });

before(async () => {
  serveur = reponsesDuServeur();
  if (!pret) return;
  serveurJoueurs = reponsesDuServeur('joueurs');
  pageMatch = PM.payloadsDuServeur();
  originaux = { fetch: globalThis.fetch, warn: console.warn, setInterval: globalThis.setInterval, setTimeout: globalThis.setTimeout };
  // L'horloge partagée et les relectures de la puce arment des minuteurs : « unref », sinon le processus ne se termine pas.
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
    appels.push(`${opts.method ?? 'GET'} ${u}`);
    if (!AUTORISES.some((m) => m.test(u)) || (opts.method && opts.method !== 'GET')) {
      interdits.push(u);
      return reponseJson({ error: `fetch interdit dans ce rendu : ${u}` }, 599);
    }
    const s = scenario;
    const repondre = (x) => (x?.statut ? reponseJson(x.corps, x.statut) : reponseJson(x));
    if (/\/api\/health\/checks$/.test(u)) return repondre(s.checks);
    if (/\/api\/health\/sources$/.test(u)) return repondre(s.sources);
    if (/\/api\/health$/.test(u)) return s.horsLigne ? reponseJson({ error: 'hors ligne' }, 503) : reponseJson({ status: 'ok', service: 'cotemaster-server' });
    if (/\/api\/refresh$/.test(u)) return repondre(s.refresh);
    if (/\/api\/opportunities/.test(u)) return reponseJson(s.opportunites ?? OP.opportunites());
    if (/\/api\/odds\/conseil-releve$/.test(u)) return reponseJson({ error: 'pas de conseil dans ce rendu' }, 503);
    if (/\/api\/screener/.test(u)) return reponseJson(EP.reperage());
    if (/\/api\/config$/.test(u)) return reponseJson(EP.configurationMoteur());
    if (/\/api\/match-stats\/team-ids/.test(u)) return reponseJson({ ids: {} });
    return reponseJson(EP.origines());
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
      if (id.includes('?')) return null;
      if (/useApiHealth\.js$/.test(id)) {
        // La vérification de l'API : attendue une fois, sans minuteur.
        return code
          .replace("import { onMounted, onUnmounted, ref } from 'vue';", "import { onMounted, onServerPrefetch, onUnmounted, ref } from 'vue';")
          .replace(/onMounted\(\(\) => \{\s*check\(\);\s*intervalId = setInterval\(check, CHECK_INTERVAL_MS\);\s*\}\);/, 'onServerPrefetch(() => check());');
      }
      if (!/(DailyChecksPanel|SourceHealthPanel|AppTopbar|OpportunitiesView)\.vue$/.test(id)) return null;
      return code.replace(/import \{ ([^}]*)\bonMounted\b([^}]*)\} from 'vue';/, (m, a, b) => `import { ${a}onMounted, onServerPrefetch${b}} from 'vue';`).replace(/onMounted\(/g, 'onServerPrefetch(');
    }
  };
  // Le routeur de l'appli crée son historique sur window au chargement : remplacé par un faux.
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
  const routeur = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'matches', component: { render: () => null }, meta: { title: 'Matchs', section: 'matches' } },
      { path: '/reglages', name: 'settings', component: { render: () => null }, meta: { title: 'Réglages', section: 'settings' } },
      { path: '/:chemin(.*)*', component: { render: () => null } }
    ]
  });
  await routeur.push('/');
  await routeur.isReady();
  const horloge = await vite.ssrLoadModule('/src/utils/liveClock.js');
  contexte = {
    vite,
    cache,
    composants: {
      Controle: await charger('/src/components/settings/DailyChecksPanel.vue'),
      Sources: await charger('/src/components/settings/SourceHealthPanel.vue'),
      Badge: await charger('/src/components/common/AVerifierBadge.vue'),
      Topbar: await charger('/src/components/layout/AppTopbar.vue'),
      Verdicts: await charger('/src/components/analysis/MarketVerdictBoard.vue'),
      Opportunites: await charger('/src/views/OpportunitiesView.vue'),
      Picks: await charger('/src/components/analysis/MarketPicksBoard.vue')
    },
    /** Rend un composant avec ses propriétés, après avoir posé le scénario des réponses : { html, texte, avertissements }. */
    async rendre(composant, props = {}, { s = {}, heure = PM.MAINTENANT } = {}) {
      scenario = s;
      const avant = avertissements.length;
      horloge.liveNow.value = heure;
      const app = createSSRApp({ render: () => h(composant, props) });
      app.use(createPinia());
      app.use(routeur);
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

// ======================================================= 1. la carte du contrôle

test('la carte « Contrôle quotidien » : le feu, les échecs d’abord avec leurs constats, tous les contrôles par famille, Σ et ⌀, la provenance — sans un avertissement de Vue', options, async () => {
  const p = serveur.pret.corps;
  const { html, texte, avertissements: avert } = await contexte.rendre(contexte.composants.Controle, {}, { s: { checks: p } });
  assert.deepEqual(avert, []);
  const comptes = U.compter(p.controles);
  assert.equal(comptes.total, p.controles.length);
  assert.deepEqual([comptes.vert, comptes.orange, comptes.rouge, comptes['non-fait']], [p.compte.vert, p.compte.orange, p.compte.rouge, p.compte.nonFait], 'écran = serveur');
  // Les chiffres clés.
  assert.ok(texte.includes(`Feu rouge Données : à vérifier — contrôle du ${U.quand(p.le)}`), texte.slice(0, 500));
  assert.ok(texte.includes(`Contrôles ${p.controles.length} ${comptes.vert} verts, ${comptes.orange} orange, ${comptes.rouge} rouges, 0 en panne, ${comptes['non-fait']} pas faits`));
  assert.ok(texte.includes(`Durée de la passe ${U.duree(p.dureeMs)} ${nombre(p.fenetre.rencontres)} rencontres du 05/09/2026 au 05/10/2026 ; le serveur jamais tenu plus de ${p.blocMaxMs} ms d'affilée`));
  assert.ok(texte.includes(`Pronostics « à vérifier » ${U.pluriel(p.aVerifier.clubs, 'club', 'clubs')} aux données douteuses`));
  assert.match(texte, /Magasin FotMob · base SQLite \(lecture seule\) et notes des sources/);
  assert.match(texte, /Rouge : des données impossibles ou contradictoires .* trouvées depuis moins de 24 h ; ensuite « connu », orange/);
  // Les contrôles en échec, rouges d'abord, chacun avec son constat et ses premiers constats (« nouveau »).
  // Un bloc par contrôle en échec : la classe « cq__echec » elle-même (pas « cq__echec-tete »).
  const echecs = html.split(/class="(?:[^"]*\s)?cq__echec(?:\s[^"]*)?"/).slice(1).map((b) => texteDe(`<div ${b}`.replace(/<div\s*$/, '')));
  const attendus = U.enEchecDabord(p.controles).filter((c) => ['rouge', 'orange', 'erreur'].includes(c.statutLe));
  assert.equal(echecs.length, attendus.length);
  assert.ok(echecs[0].startsWith('Rouge Score différent de football-data Scores 1 constat : Millwall – Bolton du 05/09/2026 : FotMob 4-0, football-data 3-0'), echecs[0]);
  assert.match(echecs[0], /aucune prolongation, séance de tirs au but ni résultat attribué ne l’explique\. nouveau$/);
  assert.ok(echecs[1].startsWith('Rouge Classement officiel Chiffres impossibles'), echecs[1]);
  assert.ok(attendus.slice(2).every((c) => c.statutLe !== 'rouge'));
  assert.match(texte, /Voir les \d+ autres/, 'les constats au-delà de cinq se déplient');
  // Tous les contrôles : une ligne par famille puis ses contrôles, dans l'ordre du serveur ; Σ au pied.
  const [tous, passes] = tableaux(html);
  const rangees = corpsDe(tous).map(texteDe);
  assert.equal(rangees.length, p.familles.length + p.controles.length);
  // Chaque famille, puis chacun de ses contrôles : nom, ce qu'il regarde, son état, ce qu'il a trouvé, ses constats.
  const plat = (t) => String(t).replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
  const attendues = p.familles.flatMap((f) => [
    f.libelle,
    ...p.controles.filter((c) => c.famille === f.cle).map((c) => plat(`${c.libelle} ${c.quoi} ${U.STATUTS[c.statutLe].libelle} ${c.constat} ${nombre(c.total ?? 0)}`))
  ]);
  assert.deepEqual(rangees, attendues);
  const constats = p.controles.reduce((n, c) => n + c.total, 0);
  assert.equal(texteDe(piedDe(tous)[0]), `Σ ${p.controles.length} contrôle(s) ${comptes.vert} vert(s) · ${comptes.orange} orange · ${comptes.rouge} rouge(s) · 0 en panne · ${comptes['non-fait']} pas fait(s) constats de tous les contrôles ${nombre(constats)}`);
  // Les dernières passes : Σ et ⌀ de la durée.
  assert.equal(corpsDe(passes).length, p.historique.length);
  assert.equal(texteDe(piedDe(passes)[0]), `Σ ${p.historique.length} passe(s) 1 au rouge ${p.historique[0].rouges} ${p.historique[0].oranges} ⌀ ${U.duree(p.historique[0].dureeMs)}`);
  // Les couleurs : une puce rouge par contrôle rouge (liste des échecs + tableau) et par passe au rouge, jamais la pastille de value.
  assert.equal(avecClasses(html, 'cm-chip', 'is-danger'), comptes.rouge * 2 + p.historique.filter((h) => h.feu === 'rouge').length);
  assert.equal(avecClasses(html, 'cm-chip', 'is-warning'), comptes.orange * 2);
  assert.doesNotMatch(html, /vbadge|is-value/);
  assert.match(texte, /Le contrôle ne corrige jamais rien et n'écrit jamais dans la base/);
  assert.deepEqual(interdits, []);
});

test('un écart de buteurs et de gardiens (réponse du VRAI serveur, retouche du 07/10) : la carte les garde en rouge avec leurs constats, mais ne compte pas leurs clubs parmi ceux « aux données douteuses »', options, async () => {
  const j = serveurJoueurs;
  const p = j.ecartsDeJoueurs.carte.corps;
  const { html, texte, avertissements: avert } = await contexte.rendre(contexte.composants.Controle, {}, { s: { checks: p } });
  assert.deepEqual(avert, []);
  // Les deux contrôles, rouges comme avant, parmi les contrôles en échec, avec le texte exact de leur constat.
  const echecs = html.split(/class="(?:[^"]*\s)?cq__echec(?:\s[^"]*)?"/).slice(1).map((b) => texteDe(`<div ${b}`.replace(/<div\s*$/, '')));
  const buteurs = echecs.find((x) => x.startsWith('Rouge Buteurs et score'));
  const gardiens = echecs.find((x) => x.startsWith('Rouge Gardiens et score'));
  assert.ok(buteurs, echecs.map((x) => x.slice(0, 40)).join(' | '));
  assert.ok(gardiens);
  assert.ok(buteurs.includes('Bournemouth – Brentford du 12/09/2026 (2-2) — 0 buts crédités aux joueurs (+ 0 csc adverses) pour un score de 2 : 2 buteurs manquants'), buteurs);
  assert.ok(gardiens.includes('Coventry – Brighton du 13/09/2026 (0-5) — les gardiens de Coventry encaissent 0 alors que l\'adversaire marque 5'), gardiens);
  assert.ok(buteurs.endsWith('nouveau') && gardiens.endsWith('nouveau'), 'rouges et nouveaux, comme avant');
  // Le compte des clubs : celui des clubs dont le prochain pari peut porter le badge (121), pas celui de l'index (125, avec les quatre clubs de joueurs).
  assert.equal(p.aVerifier.clubs, j.propre.carte.aVerifier.clubs);
  assert.equal(j.ecartsDeJoueurs.index.clubs, p.aVerifier.clubs + 4);
  assert.ok(texte.includes(`Pronostics « à vérifier » ${U.pluriel(p.aVerifier.clubs, 'club', 'clubs')} aux données douteuses`), texte.slice(texte.indexOf('Pronostics'), texte.indexOf('Pronostics') + 120));
  assert.ok(!texte.includes(`Pronostics « à vérifier » ${U.pluriel(j.ecartsDeJoueurs.index.clubs, 'club', 'clubs')} aux données douteuses`), 'pas le compte de l’index, qui garde les clubs de joueurs');
  // Les mêmes tableaux qu'avant : 35 contrôles, rien de retiré ni de renommé.
  const [tous] = tableaux(html);
  assert.equal(corpsDe(tous).length, p.familles.length + p.controles.length);
  assert.deepEqual(interdits, []);
});

test('un contrôle qui a trouvé plus que les 40 constats gardés : Σ compte TOUS les constats, et la carte dit combien sont gardés', options, async () => {
  // Comme sur la base du bac (42 « autres zéros non relevé ») : le serveur garde les 40 plus récents, il compte tout.
  const p = structuredClone(serveur.pret.corps);
  const zeros = p.controles.find((c) => c.cle === 'zeros-non-releves');
  assert.equal(zeros.statutLe, 'orange');
  zeros.total = zeros.constats.length + 60;
  zeros.parClasse = { ...zeros.parClasse, orange: zeros.total };
  const { html, texte, avertissements: avert } = await contexte.rendre(contexte.composants.Controle, {}, { s: { checks: p } });
  assert.deepEqual(avert, []);
  const constats = p.controles.reduce((n, c) => n + c.total, 0);
  assert.ok(texteDe(piedDe(tableaux(html)[0])[0]).endsWith(`constats de tous les contrôles ${nombre(constats)}`), 'Σ de tous les constats, pas des seuls gardés');
  assert.ok(texte.includes(`${nombre(zeros.total)} constat(s) en tout : les ${nombre(zeros.constats.length)} gardés sont les rouges et les plus récents.`));
  assert.ok(texte.includes(`Autres zéros « non relevé » ${zeros.quoi} Orange ${zeros.constat.replace(/[  ]/g, ' ')} ${nombre(zeros.total)}`), 'la ligne du tableau dit le total');
  assert.deepEqual(interdits, []);
});

test('jamais contrôlé, serveur en erreur, serveur pas relancé, état illisible : la structure reste (sept familles, deux tableaux) et la raison est dite — jamais « vert » sans contrôle', options, async () => {
  const jamais = await contexte.rendre(contexte.composants.Controle, {}, { s: { checks: serveur.jamais.corps } });
  assert.deepEqual(jamais.avertissements, []);
  assert.equal(serveur.jamais.corps.feu, 'vert', 'les sources seules, coupées dans le bac : vert');
  assert.match(jamais.texte, /Feu pas encore pas encore de contrôle des données : il se fait à la fin de la prochaine passe ; les sources, elles, sont lues/);
  assert.doesNotMatch(jamais.texte, /Données vérifiées/);
  assert.match(jamais.texte, /Pas encore de contrôle des données\./);
  assert.match(jamais.texte, /Pas encore de passe contrôlée\./);
  const [tous] = tableaux(jamais.html);
  // Sept familles ; seules les sources ont des lignes, les autres disent pourquoi elles sont vides.
  assert.equal(compter(tous, /class="cq__famille-ligne"/g), 7);
  assert.equal(compter(texteDe(tous), /Aucun contrôle de cette famille dans l’état lu\./g), 6);
  const erreur = await contexte.rendre(contexte.composants.Controle, {}, { s: { checks: { statut: 500, corps: { error: 'Erreur interne du serveur.' } } } });
  assert.match(erreur.texte, /Contrôle quotidien illisible Erreur interne du serveur\. — les tableaux ci-dessous restent affichés, sans valeurs\./);
  assert.match(erreur.texte, /Feu non lu état indisponible/);
  assert.equal(compter(texteDe(tableaux(erreur.html)[0]), /Non lu : le serveur ne répond pas\./g), 7);
  const ancien = await contexte.rendre(contexte.composants.Controle, {}, { s: { checks: { statut: 404, corps: { error: 'Route introuvable : GET /api/health/checks' } } } });
  assert.match(ancien.texte, /Le serveur n'est pas à jour : relancez demarrer-cotemaster\.bat pour activer cette fonction\./);
  const illisible = await contexte.rendre(contexte.composants.Controle, {}, { s: { checks: { ...serveur.jamais.corps, etat: 'illisible', raison: 'état du contrôle illisible (controle-quotidien.json illisible (essai))' } } });
  assert.match(illisible.texte, /Feu illisible état du contrôle illisible \(controle-quotidien\.json illisible \(essai\)\)/);
  assert.deepEqual(interdits, []);
});

// ======================================================== 2. la santé des sources

test('la carte « Santé des sources » : six lignes (état, dernier relevé, limite, détail), Σ au pied, le jeton Claude ; dans le bac, les clés coupées le disent', options, async () => {
  const bac = await contexte.rendre(contexte.composants.Sources, {}, { s: { sources: serveur.sourcesBac } });
  assert.deepEqual(bac.avertissements, []);
  const [t] = tableaux(bac.html);
  const lignes = corpsDe(t).map(texteDe);
  assert.equal(lignes.length, 6);
  assert.deepEqual(lignes.map((l) => l.split(' ')[0]), ['FotMob', 'football-data.co.uk', 'The', 'API-Football', 'Claude', 'Cotes']);
  for (const [i, s] of serveur.sourcesBac.sources.entries()) {
    assert.ok(lignes[i].includes(U.ETATS_SOURCE[s.etat].libelle), `${s.cle} : ${lignes[i]}`);
    assert.ok(lignes[i].includes(s.resume), s.cle);
    assert.ok(lignes[i].includes(s.limite.texte), s.cle);
    assert.ok(lignes[i].includes(s.dernierReleve.le ? U.quand(s.dernierReleve.le) : 'aucun relevé noté'), s.cle);
  }
  assert.match(lignes[2], /payant/);
  assert.match(lignes[3], /payant/);
  assert.doesNotMatch(lignes[0], /payant/);
  assert.match(bac.texte, /Coupées ou inconnues \d+ le bac à sable coupe les clés, Claude et les boucles/);
  const pied = texteDe(piedDe(t)[0]);
  const n = (etat) => serveur.sourcesBac.sources.filter((s) => s.etat === etat).length;
  assert.equal(pied, `Σ 6 sources ${n('ok')} en bon état · ${n('a-surveiller')} à surveiller · ${n('en-panne')} en panne · ${n('coupe')} coupée(s) · ${n('inconnu')} inconnue(s)`);
  assert.match(bac.texte, /le plan de secours est dans docs\/plan-secours-fotmob\.md\. Rien ne bascule vers une autre source sans votre accord/);
  // Le jeton : la date du réglage dans le champ ; par défaut, « à confirmer ».
  const claude = serveur.sourcesBac.sources.find((s) => s.cle === 'claude');
  assert.ok(bac.html.includes(`value="${claude.limite.expireLe}"`));
  assert.equal(claude.limite.aConfirmer, true, 'aucun réglage enregistré dans la copie : la date par défaut');
  assert.match(bac.texte, /à confirmer Le jeton de Claude Code dure un an, et rien ne dit à l'appli quand il expire : c'est une date que vous saisissez ici — celle proposée, le 30\/09\/2027, est la date notée à la création du jeton/);
  assert.doesNotMatch(bac.html, /vbadge|is-value/);
  assert.deepEqual(interdits, []);
});

test('un serveur réel en difficulté : FotMob en panne (le plan de secours dit), crédits bas, jeton bientôt expiré ; serveur en erreur : six lignes « non lu »', options, async () => {
  const r = await contexte.rendre(contexte.composants.Sources, {}, { s: { sources: serveur.sourcesReelles } });
  assert.deepEqual(r.avertissements, []);
  const lignes = corpsDe(tableaux(r.html)[0]).map(texteDe);
  assert.match(lignes[0], /^FotMob .* En panne FotMob ne répond plus : 6 réponses en échec de suite \(accès refusé \(401\/403\) : FotMob refuse l’appli\)\./);
  assert.match(lignes[0], /plan de secours : docs\/plan-secours-fotmob\.md \(rien ne bascule sans votre accord\)/);
  assert.match(lignes[2], /À surveiller 20 crédits restants \(480 consommés\) au relevé du 05\/10\/2026 à \d\d:00\. 20 crédits restants : moins qu’un relevé complet \(37\)\./);
  assert.match(lignes[2], /20 crédits restants sur 500 par mois/);
  assert.match(lignes[3], /4 appels aujourd’hui sur 100 \(plan gratuit : 100 par jour\)/);
  assert.match(lignes[4], /À surveiller Jeton valable jusqu’au 20\/10\/2026 \(dans 15 jours\)/);
  assert.ok(r.html.includes('value="2026-10-20"'));
  assert.match(r.texte, /En panne 1 la source ne répond plus, ou le jeton a expiré/);
  assert.equal(avecClasses(r.html, 'cm-chip', 'is-danger'), 1, 'une seule source en panne : FotMob');
  const erreur = await contexte.rendre(contexte.composants.Sources, {}, { s: { sources: { statut: 500, corps: { error: 'Erreur interne du serveur.' } } } });
  assert.match(erreur.texte, /Santé des sources illisible Erreur interne du serveur\. — le tableau ci-dessous garde ses six lignes, sans valeurs\./);
  const vides = corpsDe(tableaux(erreur.html)[0]).map(texteDe);
  assert.equal(vides.length, 6);
  assert.ok(vides.every((l) => /non lu Non lu : le serveur ne répond pas\. aucun relevé noté non lue/.test(l)), vides.join('\n'));
  assert.equal(texteDe(piedDe(tableaux(erreur.html)[0])[0]), 'Σ 6 sources 0 en bon état · 0 à surveiller · 0 en panne · 0 coupée(s) · 0 inconnue(s) · 6 non lue(s)');
  assert.match(erreur.html, /disabled/, 'pas de réglage à enregistrer sans serveur');
  assert.deepEqual(interdits, []);
});

test('la ligne FotMob de « Santé des sources » dit le texte minute par minute (réponses du VRAI serveur, lot 3) : fichiers lus et langues absentes — un 403 attendu, jamais une panne —, puis trois échecs : « à surveiller », jamais « en panne »', options, async () => {
  const copie = preparerCopie({});
  let reponses;
  try {
    const r = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-sante-commentaire.mjs'), { timeout: 180_000 });
    assert.equal(r.code, 0, `${r.erreurs.slice(-2000)}\n${r.sortie.slice(-1000)}`);
    assert.equal(r.reseau, false);
    reponses = r.json.reponses;
  } finally {
    copie.nettoyer();
  }
  const ligneFotMob = (r) => r.sources.find((s) => s.cle === 'fotmob');
  const detail = (r) => ligneFotMob(r).details.find((d) => d.startsWith('texte minute par minute'));

  // Un fichier lu, une langue absente : la ligne dit les deux ; FotMob reste « en bon état » (vert), rien en rouge ni en orange.
  const lue = await contexte.rendre(contexte.composants.Sources, {}, { s: { sources: reponses.lectureEtAbsente } });
  assert.deepEqual(lue.avertissements, []);
  const [fotmobLue] = corpsDe(tableaux(lue.html)[0]).map(texteDe);
  assert.ok(fotmobLue.includes(detail(reponses.lectureEtAbsente)), 'la ligne de détail du texte, mot pour mot');
  assert.match(fotmobLue, /texte minute par minute \(revue d’après-match, data\.fotmob\.com\) : 1 fichier lu, 1 langue absente \(403 attendu : le fichier n’existe pas dans cette langue, jamais une panne\), 0 échec/);
  assert.ok(fotmobLue.includes(U.ETATS_SOURCE.ok.libelle));
  assert.ok(!fotmobLue.includes(U.ETATS_SOURCE['en-panne'].libelle) && !fotmobLue.includes(U.ETATS_SOURCE['a-surveiller'].libelle));
  assert.equal(avecClasses(lue.html, 'cm-chip', 'is-danger'), 0, 'une langue absente n’est jamais en rouge');

  // Trois échecs de suite : « à surveiller » avec sa raison — jamais « en panne », jamais le message « FotMob ne répond plus ».
  const trois = await contexte.rendre(contexte.composants.Sources, {}, { s: { sources: reponses.troisEchecs } });
  assert.deepEqual(trois.avertissements, []);
  const [fotmobTrois] = corpsDe(tableaux(trois.html)[0]).map(texteDe);
  assert.ok(fotmobTrois.includes(U.ETATS_SOURCE['a-surveiller'].libelle));
  assert.ok(fotmobTrois.includes(ligneFotMob(reponses.troisEchecs).resume));
  assert.match(fotmobTrois, /À surveiller : texte minute par minute de la revue \(data\.fotmob\.com\) : 3 fichiers en échec de suite/);
  assert.ok(fotmobTrois.includes(detail(reponses.troisEchecs)));
  assert.match(fotmobTrois, /1 fichier lu, 1 langue absente \(.*\), 3 échecs ; dernier échec le 05\/10\/2026 à 14:00/);
  assert.doesNotMatch(fotmobTrois, /FotMob ne répond plus|plan de secours : docs\/plan-secours-fotmob\.md \(rien ne bascule/);
  assert.equal(avecClasses(trois.html, 'cm-chip', 'is-danger'), 0, 'à surveiller, jamais une source en panne');
  assert.deepEqual(interdits, []);
});

// ============================================================ 3. la puce du haut

const refreshAvec = (controleQuotidien) => ({
  enabled: true,
  running: null,
  intervalMinutes: 180,
  lastPass: { finishedAt: new Date(PM.MAINTENANT - 30 * 60_000).toISOString(), outcome: 'ok' },
  alerts: {},
  ...(controleQuotidien === undefined ? {} : { controleQuotidien })
});

test('la puce du feu en haut de l’appli : le mot ET la couleur, les contrôles en échec au survol, le chemin vers Réglages ; rien sur un serveur qui ne la connaît pas', options, async () => {
  const rouge = await contexte.rendre(contexte.composants.Topbar, {}, { s: { refresh: refreshAvec(serveur.refreshPret) } });
  assert.deepEqual(rouge.avertissements, []);
  assert.equal(avecClasses(rouge.html, 'topbar__feu', 'topbar__feu--rouge'), 1);
  const titre = attribut(rouge.html, 'topbar__feu', 'title');
  assert.equal(titre, attribut(rouge.html, 'topbar__feu', 'aria-label'));
  const lignes = titre.split('\n');
  assert.equal(lignes[0], `Données : à vérifier — contrôle du ${U.quand(serveur.refreshPret.le)}`);
  assert.ok(lignes[1].startsWith('Rouge · Score différent de football-data : 1 constat : Millwall – Bolton du 05/09/2026'), lignes[1]);
  assert.equal(lignes.at(-1), '— le détail dans Réglages › Contrôle quotidien');
  assert.equal(lignes.length, 2 + serveur.refreshPret.enEchec.length + (serveur.refreshPret.enEchecTotal > serveur.refreshPret.enEchec.length ? 1 : 0));
  assert.equal(texteDe(/<button[^>]*topbar__feu--rouge[^>]*>([\s\S]*?)<\/button>/.exec(rouge.html)[1]), 'Données : à vérifier rouge', 'le mot long et le mot court (petit écran)');
  // Jamais contrôlé, sources coupées : pas de vert « données vérifiées ».
  const jamais = await contexte.rendre(contexte.composants.Topbar, {}, { s: { refresh: refreshAvec(serveur.refreshJamais) } });
  assert.equal(avecClasses(jamais.html, 'topbar__feu', 'topbar__feu--aucun'), 1);
  assert.match(texteDe(jamais.html), /Contrôle : pas encore fait contrôle/);
  // Un serveur d'avant l'étape 14 (pas de champ) ou l'API hors ligne : aucune puce.
  const ancien = await contexte.rendre(contexte.composants.Topbar, {}, { s: { refresh: refreshAvec(undefined) } });
  assert.doesNotMatch(ancien.html, /topbar__feu/);
  const horsLigne = await contexte.rendre(contexte.composants.Topbar, {}, { s: { refresh: refreshAvec(serveur.refreshPret), horsLigne: true } });
  assert.doesNotMatch(horsLigne.html, /topbar__feu/);
  // Un clic mène à la carte du contrôle, dans Réglages.
  const code = lireUi('components', 'layout', 'AppTopbar.vue');
  assert.match(code, /router\.push\(\{ name: 'settings', query: \{ carte: 'controle-quotidien' \} \}\)/);
  assert.match(code, /@click="voirLeControle"/);
  assert.deepEqual(interdits, []);
});

// ====================================================== 4. le badge « à vérifier »

const RAISONS = {
  raisons: [
    { id: 'score-football-data:x', controle: 'score-football-data', texte: 'Score à vérifier : Man City – Brighton du 20/09/2026 (FotMob 3-1, football-data 2-1)', familles: ['tout'], date: '2026-09-20' },
    { id: 'corners-non-releves:EPL', controle: 'corners-non-releves', texte: 'Corners non relevés par FotMob en EPL depuis le 05/09/2026', familles: ['corners'], date: '2026-09-05' }
  ],
  texte: 'Score à vérifier : Man City – Brighton du 20/09/2026 (FotMob 3-1, football-data 2-1) (et 1 autre raison)'
};

test('le badge seul : ambre, une icône et un mot, la raison au survol et pour les lecteurs d’écran ; seules les raisons de la famille du marché ; rien sans raison', options, async () => {
  const { rendre, composants } = contexte;
  const tout = await rendre(composants.Badge, { aVerifier: RAISONS, avecRaison: true });
  assert.deepEqual(tout.avertissements, []);
  assert.equal(tout.texte, `À vérifier ${RAISONS.texte}`);
  assert.equal(attribut(tout.html, 'averif', 'role'), 'note');
  const phrase = attribut(tout.html, 'averif', 'title');
  assert.equal(phrase, attribut(tout.html, 'averif', 'aria-label'));
  assert.equal(phrase, `À vérifier : ${RAISONS.raisons[0].texte} ; ${RAISONS.raisons[1].texte}. Le pronostic et son verdict ne changent pas : les données qu’il a lues sont à vérifier.`);
  // Un marché de buts : la raison des corners ne le touche pas.
  const buts = await rendre(composants.Badge, { aVerifier: RAISONS, marche: 'result' });
  assert.equal(buts.texte, 'À vérifier');
  assert.doesNotMatch(attribut(buts.html, 'averif', 'title'), /Corners/);
  const corners = await rendre(composants.Badge, { aVerifier: RAISONS, marche: 'totalCorners' });
  assert.match(attribut(corners.html, 'averif', 'title'), /Corners non relevés/);
  // Seulement des corners, sur un marché de buts : aucun badge.
  const rien = await rendre(composants.Badge, { aVerifier: { raisons: [RAISONS.raisons[1]], texte: RAISONS.raisons[1].texte }, marche: 'totalGoals' });
  assert.equal(rien.html, '<!---->');
  assert.equal((await rendre(composants.Badge, { aVerifier: null })).html, '<!---->');
  assert.doesNotMatch(tout.html, /is-value|vbadge/);
});

test('les cartes de marchés de la page du match : le badge sur le résumé et sur chaque ligne (famille du marché), le vert des values intact', options, async () => {
  const { rendre, composants } = contexte;
  const analyse = pageMatch.analyses['essai-a'].corps;
  const match = pageMatch.liste.corps.matches.find((m) => m.matchId === 'essai-a');
  const props = (aVerifier) => ({ result: aVerifier ? { ...analyse, aVerifier } : analyse, match: { home: match.homeName ?? match.home, away: match.awayName ?? match.away, league: match.league }, saisies: pageMatch.saisiesA });
  const sans = await rendre(composants.Verdicts, props(null));
  const avec = await rendre(composants.Verdicts, props(RAISONS));
  assert.deepEqual(avec.avertissements, []);
  assert.doesNotMatch(sans.html, /class="averif/);
  // Le résumé : la raison écrite à côté du mot.
  const resume = avec.html.slice(avec.html.indexOf('class="mvb__sum"'), avec.html.indexOf('class="mvb__head"'));
  assert.match(texteDe(resume), new RegExp(`À vérifier ${RAISONS.raisons[0].texte.replace(/[()]/g, '\\$&')} \\(et 1 autre raison\\)`));
  // Chaque ligne porte le badge (la raison « tout ») ; seules les lignes de corners citent les corners.
  const lignes = avec.html.split(/<li class="[^"]*\bmvb__row\b[^"]*"[^>]*>/).slice(1).map((l) => l.split('</li>')[0]);
  assert.ok(lignes.length >= 3);
  const deCorners = (l) => /mvb__pick"[^>]*>[^<]*[Cc]orners?/.test(decoder(l));
  assert.ok(lignes.some(deCorners) && lignes.some((l) => !deCorners(l)), 'la page d’essai a des lignes de corners et d’autres');
  for (const l of lignes) {
    const titre = attribut(l, 'averif', 'title');
    assert.ok(titre?.includes('Score à vérifier'), 'une raison « tout » : chaque ligne');
    assert.equal(titre.includes('Corners non relevés'), deCorners(l), decoder(l).slice(0, 160));
  }
  // Le vert des values ne bouge pas : mêmes pastilles, mêmes classes.
  assert.equal(compter(avec.html, /vbadge is-value /g), compter(sans.html, /vbadge is-value /g));
  assert.ok(compter(sans.html, /vbadge is-value /g) >= 1, 'la page d’essai a au moins une value');
  const pastilles = (html) => [...html.matchAll(/class="(vbadge[^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(pastilles(avec.html), pastilles(sans.html));
  assert.deepEqual(interdits, []);
});

test('un écart de buteurs ou de gardiens (réponses du VRAI serveur, retouche du 07/10) : ni bandeau ni badge sur les cartes de marchés ; le badge d’un marché de buteur, lui, dit la raison ; un score faux marque toujours tout', options, async () => {
  const { rendre, composants } = contexte;
  const j = serveurJoueurs;
  const analyse = pageMatch.analyses['essai-a'].corps;
  const match = pageMatch.liste.corps.matches.find((m) => m.matchId === 'essai-a');
  const props = (aVerifier) => ({ result: aVerifier ? { ...analyse, aVerifier } : analyse, match: { home: match.homeName ?? match.home, away: match.awayName ?? match.away, league: match.league }, saisies: pageMatch.saisiesA });
  const lignesDe = (html) => html.slice(html.indexOf('class="mvb__head"'));
  // 1. Façon Celtic – Ferencváros : le résumé que le serveur joint à l'analyse du prochain match de ses clubs est VIDE (donc le champ n'existe pas).
  const celtic = j.ecartsDeJoueurs.prochains.buteurs.bandeau;
  assert.equal(celtic, null);
  const sans = await rendre(composants.Verdicts, props(celtic));
  assert.deepEqual(sans.avertissements, []);
  assert.doesNotMatch(sans.html, /class="averif/);
  // 2. Un score faux : le bandeau et chaque ligne le disent — le score et son classement, jamais « buteurs » ni « gardiens ».
  const leeds = j.fauxScore.prochains.faux.bandeau;
  assert.deepEqual(leeds.raisons.map((r) => r.controle), ['score-football-data', 'classement-officiel']);
  const faux = await rendre(composants.Verdicts, props(leeds));
  assert.deepEqual(faux.avertissements, []);
  const resume = faux.html.slice(faux.html.indexOf('class="mvb__sum"'), faux.html.indexOf('class="mvb__head"'));
  assert.match(texteDe(resume), /À vérifier Score à vérifier : Leeds – Newcastle du 14\/09\/2026 \(FotMob 4-3, football-data 4-1\) \(et 1 autre raison\)/);
  assert.doesNotMatch(faux.html, /buteurs et score|gardiens et score/);
  const lignes = faux.html.split(/<li class="[^"]*\bmvb__row\b[^"]*"[^>]*>/).slice(1).map((l) => l.split('</li>')[0]);
  assert.ok(lignes.length >= 3);
  for (const l of lignes) assert.match(attribut(l, 'averif', 'title') ?? '', /^À vérifier : Score à vérifier : Leeds – Newcastle/, 'une raison « tout » : chaque ligne');
  // 3. Même si un serveur joignait quand même des raisons de joueurs, aucune ligne d'un marché d'aujourd'hui ne les porterait.
  const joueursSeuls = { raisons: [{ id: 'b', controle: 'buteurs-score', texte: 'Score à vérifier : A – B du 12/09/2026 (buteurs et score ne collent pas)', familles: ['joueurs'], date: '2026-09-12' }], texte: 'Score à vérifier : A – B du 12/09/2026 (buteurs et score ne collent pas)' };
  const fabrique = await rendre(composants.Verdicts, props(joueursSeuls));
  assert.deepEqual(fabrique.avertissements, []);
  assert.doesNotMatch(lignesDe(fabrique.html), /class="averif/, 'aucune ligne de marché d’aujourd’hui ne porte une raison de joueurs');
  // 4. Le badge d'un marché de buteur FABRIQUÉ, avec ce que le journal du vrai serveur a joint : il dit la raison ; les marchés d'aujourd'hui, rien.
  const joint = j.journal.parId['b-buteur'].brut;
  assert.equal(joint.texte, 'Score à vérifier : Bournemouth – Brentford du 12/09/2026 (buteurs et score ne collent pas)');
  const buteur = await rendre(composants.Badge, { aVerifier: joint, marche: 'anytimeScorer', avecRaison: true });
  assert.deepEqual(buteur.avertissements, []);
  assert.equal(buteur.texte, `À vérifier ${joint.texte}`);
  assert.match(attribut(buteur.html, 'averif', 'title'), /buteurs et score ne collent pas/);
  for (const marche of ['result', 'totalGoals', 'bothTeamsScore', 'totalCorners', 'totalShots', 'totalCards']) {
    assert.equal((await rendre(composants.Badge, { aVerifier: joint, marche })).html, '<!---->', marche);
  }
  // 5. Les pastilles de value ne bougent pas : mêmes classes avec le bandeau d'un score faux, avec des raisons de joueurs, ou sans rien.
  const pastilles = (html) => [...html.matchAll(/class="(vbadge[^"]*)"/g)].map((m) => m[1]);
  assert.ok(pastilles(sans.html).length >= 1);
  assert.deepEqual(pastilles(faux.html), pastilles(sans.html));
  assert.deepEqual(pastilles(fabrique.html), pastilles(sans.html));
  assert.deepEqual(interdits, []);
});

// Correction du 07/10 (lot 3) : la planche des pronostics (MarketPicksBoard) posait sur le titre de chaque famille un badge dont la
// propriété « marche » recevait la CARTE du total de la famille (un objet) : Vue avertissait « Expected String », la famille était lue
// « [object Object] », donc rangée en « buts », et — sans pronostic de total — « aucun marché » (toutes les raisons). Un constat
// « corners » n'apparaissait donc jamais sur le titre « Corners » ; une raison de cartons, elle, pouvait y apparaître.
const RAISON_TIRS = { id: 'tirs-non-releves:EPL', controle: 'tirs-non-releves', texte: 'Tirs non relevés par FotMob en EPL depuis le 05/09/2026', familles: ['tirs'], date: '2026-09-05' };
const RAISON_CARTONS = { id: 'jaunes-non-releves:EPL', controle: 'jaunes-non-releves', texte: 'Cartons jaunes non relevés par FotMob en EPL depuis le 05/09/2026', familles: ['cartons'], date: '2026-09-05' };
const RAISON_BUTS = { id: 'buts-ecart:EPL', controle: 'buts-ecart', texte: 'Buts à vérifier : un but de Man City – Brighton du 20/09/2026 manque', familles: ['buts'], date: '2026-09-20' };
const RAISON_JOUEURS = { id: 'buteurs-score:x', controle: 'buteurs-score', texte: 'Score à vérifier : A – B du 12/09/2026 (buteurs et score ne collent pas)', familles: ['joueurs'], date: '2026-09-12' };
const [RAISON_TOUT, RAISON_CORNERS] = RAISONS.raisons;
const dossierDe = (...raisons) => ({ raisons, texte: raisons[0].texte });

/** Les titres de la planche des pronostics, dans l'ordre : { titre, badge } — `badge` = la phrase complète du badge de ce titre, ou null s'il n'en porte pas. */
function titresDeLaPlanche(html) {
  return [...html.matchAll(/<p class="mboard__title"[^>]*>([\s\S]*?)<\/p>/g)].map((m) => ({
    titre: texteDe(m[1].split('<span class="averif')[0]),
    badge: attribut(m[1], 'averif', 'title') ?? null
  }));
}

test('la planche des pronostics (correction du 07/10) : le badge du titre d’une famille reçoit l’identifiant d’un marché de SA famille — un constat « corners » paraît sur « Corners » et sur lui seul, sans avertissement de Vue', options, async () => {
  const { rendre, composants } = contexte;
  const analyse = pageMatch.analyses['essai-a'].corps;
  const match = pageMatch.liste.corps.matches.find((m) => m.matchId === 'essai-a');
  const propsDe = (aVerifier, predictions = analyse.marketPredictions) => ({ predictions, match: { home: match.homeName ?? match.home, away: match.awayName ?? match.away, league: match.league }, aVerifier });
  // Rend la planche (aucun avertissement de Vue : une propriété « marche » qui n'est pas une chaîne en ferait un) et lit le badge de chaque titre.
  const lire = async (aVerifier, predictions) => {
    const r = await rendre(composants.Picks, propsDe(aVerifier, predictions));
    assert.deepEqual(r.avertissements, [], 'aucun avertissement de Vue');
    return { html: r.html, badges: Object.fromEntries(titresDeLaPlanche(r.html).map((t) => [t.titre, t.badge])) };
  };
  const titresAvecBadge = (l) => Object.entries(l.badges).filter(([, phrase]) => phrase).map(([titre]) => titre);

  // La page d'essai a ses quatre familles et leur total ; le moteur et l'écran rangent leurs marchés dans les mêmes familles.
  const ids = new Set(analyse.marketPredictions.map((p) => p.marketId));
  for (const id of ['totalGoals', 'totalCorners', 'totalShots', 'totalShotsOnTarget', 'teamCorners']) assert.ok(ids.has(id), id);
  assert.deepEqual(['totalGoals', 'totalCorners', 'totalShots', 'totalShotsOnTarget'].map(U.familleDuMarche), ['buts', 'corners', 'tirs', 'tirs']);
  assert.deepEqual(Object.keys((await lire(null)).badges), ['Le match', 'Buts', 'Corners', 'Tirs', 'Tirs cadrés']);

  // 1. Un constat de toutes familles et un constat « corners » : le premier sur les quatre titres, le second sur « Corners » seulement.
  const deux = await lire(dossierDe(RAISON_TOUT, RAISON_CORNERS));
  assert.deepEqual(titresAvecBadge(deux), ['Buts', 'Corners', 'Tirs', 'Tirs cadrés']);
  for (const famille of ['Buts', 'Corners', 'Tirs', 'Tirs cadrés']) assert.ok(deux.badges[famille].includes(RAISON_TOUT.texte), `${famille} : le constat de toutes familles`);
  assert.ok(deux.badges.Corners.includes(RAISON_CORNERS.texte), 'le constat « corners » est sur le titre « Corners »');
  for (const famille of ['Buts', 'Tirs', 'Tirs cadrés']) assert.ok(!deux.badges[famille].includes(RAISON_CORNERS.texte), `${famille} : jamais le constat des corners`);
  assert.equal(deux.badges['Le match'], null, 'le titre « Le match » n’a pas de badge : ce sont ses cartes qui en portent');
  // … et les cartes de « Le match » (résultat, résultat + total buts, les deux équipes marquent : des buts) : le constat de toutes familles, jamais celui des corners.
  const cartes = deux.html.split('class="mboard__card"').slice(1).map((c) => c.split('</section>')[0]);
  assert.equal(cartes.length, 3);
  for (const c of cartes) {
    assert.match(attribut(c, 'averif', 'title') ?? '', /Score à vérifier : Man City – Brighton/);
    assert.doesNotMatch(attribut(c, 'averif', 'title') ?? '', /Corners non relevés/);
  }

  // 2. Un constat de CHAQUE famille, seul : seule sa famille le porte.
  assert.deepEqual(titresAvecBadge(await lire(dossierDe(RAISON_CORNERS))), ['Corners']);
  assert.deepEqual(titresAvecBadge(await lire(dossierDe(RAISON_BUTS))), ['Buts']);
  // « Tirs » et « Tirs cadrés » sont la même famille pour le serveur (totalShotsOnTarget → tirs) : les deux titres le portent.
  const tirs = await lire(dossierDe(RAISON_TIRS));
  assert.deepEqual(titresAvecBadge(tirs), ['Tirs', 'Tirs cadrés']);
  assert.ok(tirs.badges['Tirs cadrés'].includes(RAISON_TIRS.texte));
  // La planche n'a pas de famille « cartons » ni « joueurs » : ces constats ne se posent sur aucun titre — ni sur les cartes.
  for (const raison of [RAISON_CARTONS, RAISON_JOUEURS]) {
    const l = await lire(dossierDe(raison));
    assert.deepEqual(titresAvecBadge(l), [], raison.familles[0]);
    assert.equal(compter(l.html, /class="averif /g), 0, `${raison.familles[0]} : aucun badge sur la planche`);
  }
  // Le compte de tous les badges : un constat de buts, trois cartes de « Le match » et le titre « Buts » ; un de toutes familles, ces trois cartes et les quatre titres.
  assert.equal(compter((await lire(dossierDe(RAISON_BUTS))).html, /class="averif /g), 4);
  assert.equal(compter(deux.html, /class="averif /g), 7);

  // 3. Une famille SANS pronostic de total (les corners d'une équipe seulement) reste une famille : son titre suit sa famille, pas l'absence de total.
  const sansTotal = analyse.marketPredictions.filter((p) => p.marketId !== 'totalCorners');
  assert.ok(sansTotal.some((p) => p.marketId === 'teamCorners') && !sansTotal.some((p) => p.marketId === 'totalCorners'));
  assert.deepEqual(titresAvecBadge(await lire(dossierDe(RAISON_CORNERS), sansTotal)), ['Corners']);
  assert.deepEqual(titresAvecBadge(await lire(dossierDe(RAISON_CARTONS), sansTotal)), [], 'des cartons ne touchent pas une famille de corners sans total');
  const toutSansTotal = await lire(dossierDe(RAISON_TOUT, RAISON_CORNERS), sansTotal);
  assert.ok(toutSansTotal.badges.Corners.includes(RAISON_CORNERS.texte));
  for (const famille of ['Buts', 'Tirs', 'Tirs cadrés']) assert.ok(!toutSansTotal.badges[famille].includes(RAISON_CORNERS.texte), famille);
  // Plus aucun pronostic de corners : plus de famille « Corners », et rien d'autre ne bouge.
  const sansCorners = analyse.marketPredictions.filter((p) => !/Corners$/.test(p.marketId));
  assert.deepEqual(titresAvecBadge(await lire(dossierDe(RAISON_TOUT, RAISON_CORNERS), sansCorners)), ['Buts', 'Tirs', 'Tirs cadrés']);

  // 4. Sans constat : pas un badge, pas un avertissement.
  const rien = await lire(null);
  assert.deepEqual(titresAvecBadge(rien), []);
  assert.equal(compter(rien.html, /class="averif/g), 0);

  // 5. Le câblage : le badge du titre reçoit l'identifiant du marché de la famille, plus jamais sa carte (hors commentaires du gabarit).
  const vue = lireUi('components', 'analysis', 'MarketPicksBoard.vue').replace(/<!--[\s\S]*?-->/g, '');
  assert.doesNotMatch(vue, /:marche="fam\.total"/);
  assert.match(vue, /<AVerifierBadge v-if="aVerifier" :a-verifier="aVerifier" :marche="fam\.idMarche" class="mboard__averif" \/>/);
  assert.deepEqual(interdits, []);
});

test('la page Opportunités : le badge sur la ligne dont les données sont douteuses (par la famille de son marché), le tri et les pastilles de value intacts', options, async () => {
  const { rendre, composants } = contexte;
  const sans = await rendre(composants.Opportunites, {}, { s: { opportunites: OP.opportunites() }, heure: OP.MAINTENANT });
  const page = OP.opportunites();
  const arsenal = page.data.lignes.find((l) => l.home === 'Arsenal');
  arsenal.aVerifier = { raisons: [{ id: 's', controle: 'score-football-data', texte: 'Score à vérifier : Arsenal – Spurs du 20/09/2026 (FotMob 2-0, football-data 2-1)', familles: ['tout'] }], texte: 'Score à vérifier : Arsenal – Spurs du 20/09/2026 (FotMob 2-0, football-data 2-1)' };
  // Une raison de cartons seulement, sur la ligne d'un marché de buts (Leeds – Everton, match nul) : pas de badge.
  const autre = page.data.lignes.find((l) => l.home === 'Leeds');
  autre.aVerifier = { raisons: [{ id: 'j', controle: 'jaunes-non-releves', texte: 'Cartons jaunes non relevés', familles: ['cartons'] }], texte: 'Cartons jaunes non relevés' };
  assert.equal(U.familleDuMarche(autre.marche), 'buts');
  const avec = await rendre(composants.Opportunites, {}, { s: { opportunites: page }, heure: OP.MAINTENANT });
  assert.deepEqual(avec.avertissements, []);
  const rangees = (html) => html.split(/<tr\b/).slice(2);
  const ligneArsenal = rangees(avec.html).find((r) => r.includes('Arsenal'));
  assert.match(attribut(ligneArsenal, 'averif', 'title'), /^À vérifier : Score à vérifier : Arsenal – Spurs du 20\/09\/2026/);
  assert.equal(compter(avec.html, /class="averif /g), 1, 'une seule ligne marquée');
  const ordre = (html) => rangees(html).map((r) => ['Arsenal', 'Leeds', 'Real Madrid', 'Lyon', 'Fulham', 'Milan'].find((n) => r.includes(n)) ?? '?');
  assert.deepEqual(ordre(avec.html), ordre(sans.html), 'le tri ne bouge pas');
  const pastilles = (html) => [...html.matchAll(/class="(vbadge[^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(pastilles(avec.html), pastilles(sans.html), 'les pastilles de value, identiques');
  assert.deepEqual(interdits, []);
});

// ====================================================== 5. hygiène et câblage

test('hygiène des trois composants (jetons, pas de !important, polices ≥ 10 px, l’ambre pour « à vérifier ») et câblage : Réglages, page du match, journal, service', () => {
  const jetons = lireUi('assets', 'styles', 'tokens.css');
  for (const f of [['components', 'settings', 'DailyChecksPanel.vue'], ['components', 'settings', 'SourceHealthPanel.vue'], ['components', 'common', 'AVerifierBadge.vue']]) {
    const vue = lireUi(...f);
    const style = vue.split('<style scoped>')[1];
    assert.doesNotMatch(style, /#[0-9a-f]{3,8}\b/i, `${f.at(-1)} : aucune couleur en dur`);
    assert.doesNotMatch(style.replace(/rgba?\(var\(--[^)]+\)[^)]*\)/g, ''), /rgba?\(/, `${f.at(-1)} : une transparence passe par un jeton`);
    assert.doesNotMatch(vue, /!important/);
    for (const m of style.matchAll(/font-size:\s*([\d.]+)px/g)) assert.ok(Number(m[1]) >= 10, `${f.at(-1)} : police de ${m[1]} px`);
    for (const m of style.matchAll(/var\((--cm-[a-z0-9-]+)/g)) assert.ok(jetons.includes(`${m[1]}:`), `${f.at(-1)} : jeton inconnu ${m[1]}`);
    assert.doesNotMatch(vue, /<ValueBadge/, `${f.at(-1)} : jamais la pastille de value`);
  }
  // Le badge : l'ambre (--cm-warning), jamais le vert ni le rouge.
  const badge = lireUi('components', 'common', 'AVerifierBadge.vue').split('<style scoped>')[1];
  assert.match(badge, /var\(--cm-warning\)/);
  assert.doesNotMatch(badge, /--cm-accent|--cm-danger|--cm-section/);
  // Les cartes n'appellent que leurs routes ; une seule écriture : la date du jeton.
  const service = lireUi('services', 'healthApi.js');
  assert.match(service, /checks: \(\) => httpClient\.get\('\/health\/checks'\)/);
  assert.match(service, /sources: \(\) => httpClient\.get\('\/health\/sources'\)/);
  assert.match(service, /setJetonClaude: \(expireLe\) => httpClient\.put\('\/health\/jeton-claude', \{ expireLe \}\)/);
  assert.doesNotMatch(lireUi('components', 'settings', 'DailyChecksPanel.vue'), /httpClient|healthApi\.(?!checks\b|js')/, 'la carte du contrôle ne fait que lire');
  // Réglages : les deux cartes, après l'actualisation automatique ; la puce y mène (« ?carte=controle-quotidien »).
  const reglages = lireUi('views', 'SettingsView.vue');
  assert.match(reglages, /import DailyChecksPanel from '@\/components\/settings\/DailyChecksPanel\.vue';/);
  assert.match(reglages, /import SourceHealthPanel from '@\/components\/settings\/SourceHealthPanel\.vue';/);
  assert.match(reglages, /title="Contrôle quotidien des données"[\s\S]*?<DailyChecksPanel :passe-terminee-le="refreshOverview\?\.lastCompletedAt \?\? null" :montrer="montrerLeControle" \/>/);
  assert.match(reglages, /title="Santé des sources"[\s\S]*?<SourceHealthPanel :passe-terminee-le="refreshOverview\?\.lastCompletedAt \?\? null" \/>/);
  assert.match(reglages, /route\?\.query\?\.carte === 'controle-quotidien'/);
  assert.ok(reglages.indexOf('<RefreshStatusPanel') < reglages.indexOf('<DailyChecksPanel') && reglages.indexOf('<DailyChecksPanel') < reglages.indexOf('<SourceHealthPanel'));
  // Le badge là où un verdict est affiché.
  assert.match(lireUi('views', 'UpcomingMatchView.vue'), /<MarketPicksBoard [^>]*:a-verifier="analyse\.result\.aVerifier \?\? null"/);
  assert.match(lireUi('components', 'analysis', 'MarketPicksBoard.vue'), /<AVerifierBadge v-if="aVerifier" :a-verifier="aVerifier" :marche=/);
  assert.match(lireUi('components', 'analysis', 'MarketVerdictBoard.vue'), /<AVerifierBadge v-if="aVerifier" :a-verifier="aVerifier" :marche="l\.marketId \?\? null" \/>/);
  assert.match(lireUi('views', 'OpportunitiesView.vue'), /<AVerifierBadge v-if="r\.l\.aVerifier" :a-verifier="r\.l\.aVerifier" :marche="r\.l\.marche"/);
  assert.match(lireUi('views', 'PredictionMatchDetailView.vue'), /<AVerifierBadge v-if="entry\.aVerifier" :a-verifier="entry\.aVerifier" \/>/);
  assert.match(lireUi('views', 'PredictionsHistoryView.vue'), /<AVerifierBadge v-if="aVerifierDuGroupe\(group\)" :a-verifier="aVerifierDuGroupe\(group\)" avec-raison \/>/);
  // Jamais une pastille de value conditionnée par « à vérifier ».
  for (const f of [['components', 'analysis', 'MarketVerdictBoard.vue'], ['components', 'analysis', 'MarketPicksBoard.vue'], ['views', 'OpportunitiesView.vue'], ['views', 'PredictionMatchDetailView.vue'], ['views', 'PredictionsHistoryView.vue']]) {
    assert.doesNotMatch(lireUi(...f), /<ValueBadge[^>]*aVerifier/, f.join('/'));
  }
});
