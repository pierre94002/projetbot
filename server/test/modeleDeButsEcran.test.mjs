/**
 * Étape 27 du plan — LES ÉCRANS du modèle de buts unique (conception §4), et la PREUVE que, pendant l'essai à blanc,
 * aucun écran de match ne change.
 *   node --test test/modeleDeButsEcran.test.mjs        (depuis server/)
 *
 * Les analyses ne sont PAS écrites à la main : le VRAI moteur les calcule dans une copie isolée
 * (test/aides/script-modele-de-buts.mjs, phase « ecran » : table du jour J, plus/moins 2,5 plantés, forces de buts
 * calculées par l'étape de nuit) — pour chaque match, la version EN SERVICE (réglages sans la clé `modeleDeButs`) et la
 * CANDIDATE (avec la clé), deux matchs par régime du modèle. Le rendu se fait côté serveur, sans navigateur ni serveur de
 * développement (comme pageMatchDecisionEcran.test.mjs) : `fetch` remplacé (une écriture serait refusée et comptée),
 * routeur de l'appli remplacé par un faux, horloge figée, cache de Vite dans le dossier d'essais, rien écrit dans ui/.
 *
 *  1. Les MOTS (ui/src/utils/modeleDeButs.js) sur les vraies analyses : sans la clé, tout rend null ; avec, la
 *     provenance dit le vrai fournisseur de chaque morceau, l'heure du relevé du plus/moins, la cote absente — jamais
 *     un libellé vague ; « Ce que disent les xG », « autre score », la fiabilité mesurée sur 2019-2023.
 *  2. LA PREUVE « rien ne change pendant l'essai » : la carte du score, la planche des pronostics et le verdict par
 *     marché, rendus avec l'analyse EN SERVICE, ne portent aucune marque ni aucun mot de l'étape 27 ; rendus avec
 *     l'analyse de la CANDIDATE, ils les portent (le contrôle positif : les marques existent bien).
 *  3. Le Repérage : la pastille par match et la bulle de la colonne 2,5, seulement sur une ligne du modèle.
 *  4. Réglages : la carte de la candidate du modèle de buts (familles, calibration, régimes, porte de l'adoption,
 *     horizon, porte 1 du banc et sa réserve ACCEPTÉE, écrite telle quelle) ; le modèle dans « Paramètres du moteur » ;
 *     l'avertissement de « Réinitialiser les valeurs par défaut ».
 *  5. La feuille de route : le bloc « avant / après » lu dans le code, complet même avant la mesure.
 *  6. Hygiène : jetons, jamais le vert d'une value, pas de jargon, vrai signe moins, termes du guide, câblage.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { preparerCopie, executer, SERVEUR, RACINE_ESSAIS, MANIFESTE_ECHANTILLON } from './aides/isolement.mjs';
import * as D from './aides/donneesEcransParis.mjs';
import { CANDIDATE_EN_ESSAI, empreinteDeLaCandidate, porte1DeLaCandidate } from '../src/core/engine/engineVersions.js';
import { FIABILITE_SCORE_MODELE_DE_BUTS } from '../src/core/engine/noteDuModeleDeButs.js';
import { blocDuBancEtape27, LIGNES_DU_BANC_27, PHRASE_SANS_XG } from '../src/data/roadmap/bancEtape27.js';
import { etatFeuilleDeRoute } from '../src/data/roadmap/feuilleDeRoute.js';
import { etatPourFeuilleDeRoute } from '../src/bench/trialsRegistry.js';

const UI = path.resolve(SERVEUR, '..', 'ui');
const pret = ['vite', '@vitejs/plugin-vue', 'vue', 'pinia', 'vue-router'].every((p) => fs.existsSync(path.join(UI, 'node_modules', p)));
const imp = (chemin) => import(pathToFileURL(chemin).href);
const options = { skip: pret ? false : 'ui/node_modules (vite, plugin-vue, vue, pinia, vue-router) manque' };
const M = await imp(path.join(UI, 'src', 'utils', 'modeleDeButs.js'));
const V = await imp(path.join(UI, 'src', 'utils', 'versionsMoteur.js'));
const L = await imp(path.join(UI, 'src', 'utils', 'langageParis.js'));
const B = await imp(path.join(UI, 'src', 'utils', 'bancAvantApres.js'));
const MOINS = '−';
const MARQUE = 'data-modele-de-buts';
/** Les mots que l'étape 27 ajoute aux écrans de match : aucun ne doit paraître sans la clé. */
const MOTS_DE_L_ETAPE = [/Ce que disent les/, /Ce que dit le championnat/, /autre score/, /Moteur CôteMaster · (cote 1N2|xG FotMob|buts FotMob|moyennes du championnat)/, /Modèle de buts unique/, /Mesurée sur 2019-2023/, /Écart sur le 2,5/, /calé sur/i, /cotes \+ (xG|buts)/, /xG seuls|buts seuls/];

// ------------------------------------------------------------ les vraies analyses (une fois)

let memo = null;
/** Les paires (en service, candidate) du vrai moteur, deux par régime. */
function paires() {
  if (memo) return memo;
  const copie = preparerCopie();
  try {
    const r = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-modele-de-buts.mjs'), { args: [MANIFESTE_ECHANTILLON, 'ecran'], timeout: 300_000 });
    assert.equal(r.code, 0, `le calcul a échoué :\n${r.erreurs.slice(-4000)}`);
    assert.equal(r.reseau, false, 'aucun appel réseau');
    assert.ok(r.json?.ok && Array.isArray(r.json.paires), r.sortie.slice(-2000));
    memo = r.json;
    return memo;
  } finally {
    copie.nettoyer();
  }
}
const deRegime = (prefixe) => paires().paires.filter((p) => p.regime.startsWith(prefixe));

// ------------------------------------------------------------ le rendu

const appels = [];
const interdits = [];
const avertissements = [];
let contexte;
let originaux = {};
let scenario = {};
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
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    appels.push(`${opts.method ?? 'GET'} ${u}`);
    if (opts.method && opts.method !== 'GET') {
      interdits.push(`${opts.method} ${u}`);
      return reponseJson({ error: 'écriture interdite dans ce rendu' }, 599);
    }
    if (/\/api\/screener/.test(u)) return reponseJson(scenario.reperage ?? D.reperage());
    if (/\/api\/config$/.test(u)) return reponseJson(D.configurationMoteur());
    if (/\/api\/sources$/.test(u)) return reponseJson(D.origines());
    if (/\/api\/config\/versions$/.test(u)) return reponseJson(scenario.versions ?? { error: 'pas de versions dans ce rendu' }, scenario.versions ? 200 : 503);
    if (/\/api\/match-stats\/team-ids/.test(u)) return reponseJson({ ids: {} });
    interdits.push(u);
    return reponseJson({ error: `fetch interdit dans ce rendu : ${u}` }, 599);
  };
  console.warn = (...a) => avertissements.push(a.map(String).join(' ').slice(0, 300));

  const { createServer } = await imp(path.join(UI, 'node_modules', 'vite', 'dist', 'node', 'index.js'));
  const vuePlugin = (await imp(path.join(UI, 'node_modules', '@vitejs', 'plugin-vue', 'dist', 'index.mjs'))).default;
  const { renderToString } = await imp(path.join(UI, 'node_modules', 'vue', 'server-renderer', 'index.mjs'));
  const { createSSRApp, h } = await imp(path.join(UI, 'node_modules', 'vue', 'index.mjs'));
  const { createPinia } = await imp(path.join(UI, 'node_modules', 'pinia', 'dist', 'pinia.mjs'));
  const { createRouter, createMemoryHistory } = await imp(path.join(UI, 'node_modules', 'vue-router', 'dist', 'vue-router.mjs'));
  // Le rendu attend le chargement (onMounted → onServerPrefetch) ; le Repérage s'ouvre sur le marché demandé par l'essai.
  const prefetch = {
    name: 'ssr-prefetch',
    enforce: 'pre',
    transform(code, id) {
      if (id.includes('?') || !/(ScreenerView|EngineVersionsPanel)\.vue$/.test(id)) return null;
      let c = code.replace(/import \{ ([^}]*)\bonMounted\b([^}]*)\} from 'vue';/, (m, a, b) => `import { ${a}onMounted, onServerPrefetch${b}} from 'vue';`).replace(/onMounted\(/g, 'onServerPrefetch(');
      if (/ScreenerView\.vue$/.test(id)) {
        assert.ok(c.includes("const marche = ref('home');"), 'le Repérage a changé : son marché de départ introuvable');
        c = c.replace("const marche = ref('home');", "const marche = ref(globalThis.__MARCHE_ESSAI__ ?? 'home');");
      }
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
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    plugins: [routeurFaux, prefetch, vuePlugin()],
    resolve: { alias: { '@': path.join(UI, 'src') } }
  });
  const charger = async (chemin) => (await vite.ssrLoadModule(chemin)).default;
  const routeur = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:chemin(.*)*', component: { render: () => null } }] });
  await routeur.push('/');
  await routeur.isReady();
  const horloge = await vite.ssrLoadModule('/src/utils/liveClock.js');
  contexte = {
    vite,
    cache,
    composants: {
      Score: await charger('/src/components/analysis/ScorePredictionCard.vue'),
      Picks: await charger('/src/components/analysis/MarketPicksBoard.vue'),
      Verdicts: await charger('/src/components/analysis/MarketVerdictBoard.vue'),
      Provenance: await charger('/src/components/analysis/GoalModelProvenance.vue'),
      Reperage: await charger('/src/views/ScreenerView.vue'),
      Candidate: await charger('/src/components/settings/EngineGoalModelTrial.vue'),
      Versions: await charger('/src/components/settings/EngineVersionsPanel.vue'),
      Reglages: await charger('/src/components/settings/EngineConfigForm.vue'),
      Etape: await charger('/src/components/roadmap/RoadmapStep.vue'),
      Actualisation: await charger('/src/components/settings/RefreshStatusPanel.vue')
    },
    /** Rend un composant : { html, texte, avertissements }. `heure` : l'horloge de l'appli. */
    async rendre(composant, props = {}, { s = {}, heure = Date.parse('2026-10-05T12:00:00Z'), marche = null } = {}) {
      scenario = s;
      globalThis.__MARCHE_ESSAI__ = marche ?? undefined;
      const avant = avertissements.length;
      horloge.liveNow.value = heure;
      const app = createSSRApp({ render: () => h(composant, props) });
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
  delete globalThis.__MARCHE_ESSAI__;
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
    .replace(/[\u202f\u00a0]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const compter = (texte, motif) => (texte.match(motif) ?? []).length;
const lireUi = (...p) => fs.readFileSync(path.join(UI, 'src', ...p), 'utf8');
const aucunMot = (texte, ou) => {
  for (const m of MOTS_DE_L_ETAPE) assert.doesNotMatch(texte, m, `${ou} : « ${m} » sans la clé`);
};

// ================================================================ 1. les mots

test('les vraies analyses : chaque régime du modèle représenté ; la version EN SERVICE n’a aucune trace du modèle (ni clé, ni provenance, ni score à 81 cases, ni « autre score »)', () => {
  const p = paires();
  for (const code of ['cotes-plusmoins-xg', 'cotes-plusmoins-buts', 'cotes-1n2-xg', 'cotes-1n2-buts', 'xg-seuls', 'buts-seuls']) assert.ok(p.regimes[code] > 0, `régime ${code} : ${JSON.stringify(p.regimes)}`);
  assert.equal(p.maintenant, '2026-10-05T12:00:00.000Z');
  for (const x of p.paires) {
    assert.equal('modeleDeButs' in x.sans, false, x.cle);
    assert.equal(x.sans.distributions?.scoreExact, undefined, x.cle);
    for (const d of Object.values(x.sans.distributions ?? {})) assert.equal(d?.provenance, undefined, `${x.cle} : provenance gelée sans la clé`);
    assert.equal('autreScore' in (x.sans.scorePrediction ?? {}), false, x.cle);
    // Les mots de l'écran : rien sans la clé.
    assert.equal(M.provenanceDesButs(x.sans), null);
    assert.equal(M.forcesDites(x.sans), null);
    assert.equal(M.deuxCinqCale(x.sans), false);
    assert.equal(M.autreScoreDit(x.sans.scorePrediction), null);
    // La candidate : la clé et son régime.
    assert.equal(x.avec.modeleDeButs?.provenance?.code, x.regime, x.cle);
  }
});

test('la provenance des pourcentages de buts dit le VRAI fournisseur de chaque morceau, l’heure du relevé du plus/moins ou celle du calcul, et la cote absente — jamais un libellé vague', () => {
  for (const x of paires().paires) {
    const pr = M.provenanceDesButs(x.avec);
    const m = x.avec.modeleDeButs;
    const nom = `${x.regime} ${x.cle}`;
    assert.ok(pr.source.startsWith('Moteur CôteMaster · '), nom);
    assert.doesNotMatch(pr.source, /Odds API|undefined|null|—|\bNaN\b/, nom);
    assert.equal(pr.court, m.provenance.court);
    assert.equal(pr.detail, `${m.provenance.phrase.charAt(0).toUpperCase()}${m.provenance.phrase.slice(1)}.`);
    const cotes = x.regime.startsWith('cotes-');
    assert.equal(/ · cote 1N2 /.test(pr.source), cotes, nom);
    assert.ok(pr.source.endsWith(x.regime.endsWith('-xg') || x.regime === 'xg-seuls' ? 'xG FotMob' : 'buts FotMob'), nom);
    if (x.regime.includes('plusmoins')) {
      assert.ok(pr.source.includes(` + plus/moins 2,5 ${m.plusMoins.source} + `), nom);
      assert.match(m.plusMoins.source, /^(football-data \(moyenne du marché\)|ESPN \(moyenne de \d+ livres?\))$/);
      assert.equal(pr.releveLe, m.plusMoins.releveAt);
      assert.equal(pr.action, 'plus/moins relevé');
      assert.equal(pr.vieuxApresHeures, 24, 'ambre au-delà de 24 h');
      assert.equal(pr.manque, null);
    } else {
      assert.equal(pr.releveLe, x.avec.comparateur.calculeLe, 'l’heure du calcul');
      assert.equal(pr.action, 'calculé');
      assert.equal(pr.manque, cotes ? 'aucune cote plus/moins relevée pour ce match' : 'aucune cote pour ce match · 1N2 : ancien modèle statistique', nom);
    }
    // Les bookmakers de la cote 1N2 : ceux de référence, sinon les cotes relevées, nommées.
    if (cotes) {
      const titres = x.avec.market.byBookmaker.map((b) => b.title);
      const attendu = x.avec.prediction.referenceBooks?.length ? `cote 1N2 ${M.listeFr(x.avec.prediction.referenceBooks)}` : `cote 1N2 ${titres.length === 1 ? titres[0] : `moyenne de ${M.listeFr(titres.slice(0, 3))}`}`;
      assert.ok(pr.source.includes(attendu), `${nom} : ${pr.source}`);
    }
  }
  // Les cas qui ne viennent pas de l'échantillon : livres de référence, moyenne nommée de plusieurs livres, nombre seul.
  const base = { code: 'cotes-plusmoins-xg', court: 'cotes + xG', phrase: 'p', plusMoins: { source: 'football-data (moyenne du marché)', releveAt: '2026-10-05T10:00:00Z' } };
  assert.equal(M.provenanceDuRegime({ ...base, livres: ['Pinnacle'] }).source, 'Moteur CôteMaster · cote 1N2 Pinnacle + plus/moins 2,5 football-data (moyenne du marché) + xG FotMob', 'l’exemple de la conception');
  assert.match(M.provenanceDuRegime({ ...base, titres: ['Bet365', 'Unibet', 'Betclic', 'Winamax', 'PMU'] }).source, /cote 1N2 moyenne de Bet365, Unibet, Betclic et 2 autres \+/);
  assert.match(M.provenanceDuRegime({ ...base, bookmakers: 4 }).source, /cote 1N2 moyenne de 4 bookmakers relevés \+/);
  assert.match(M.provenanceDuRegime({ ...base, plusMoins: { source: null, releveAt: null } }).source, /plus\/moins 2,5 source non indiquée/);
  assert.equal(M.provenanceDuRegime({ code: 'moyennes-seules', court: 'moyennes du championnat' }).manque, 'aucune cote, clubs inconnus du magasin · 1N2 : ancien modèle statistique');
  assert.equal(M.provenanceDuRegime(null), null);
  // Vérification des écrans (constat 3) : la liste des livres n'est jamais coupée — 12 titres, « et 9 autres » ; le Repérage ne la coupe plus.
  const douze = Array.from({ length: 12 }, (_, i) => `Livre${i + 1}`);
  assert.match(M.provenanceDuRegime({ ...base, titres: douze }).source, /cote 1N2 moyenne de Livre1, Livre2, Livre3 et 9 autres \+/);
  const ecran = fs.readFileSync(path.join(SERVEUR, 'src', 'data', 'screener.js'), 'utf8');
  assert.match(ecran, /titres: surCotes \? \(resultat\.market\?\.byBookmaker \?\? \[\]\)\.map\(\(x\) => x\?\.title \?\? x\?\.key \?\? null\)\.filter\(Boolean\) : null,/);
  assert.doesNotMatch(ecran, /\.slice\(0, 8\)/);
  // Constat 10 : des moyennes par défaut du moteur (championnat inconnu du magasin) sont dites telles quelles, jamais « du magasin FotMob ».
  assert.match(M.provenanceDuRegime({ ...base, livres: ['Pinnacle'], ligueSource: 'défaut' }).source, /\+ plus\/moins 2,5 football-data \(moyenne du marché\) \+ moyennes par défaut du moteur \+ xG FotMob$/);
  assert.equal(M.provenanceDuRegime({ code: 'moyennes-seules', court: 'moyennes du championnat', ligueSource: 'défaut' }).source, 'Moteur CôteMaster · moyennes par défaut du moteur (championnat inconnu du magasin)');
  assert.equal(M.provenanceDuRegime({ code: 'moyennes-seules', court: 'moyennes du championnat', ligueSource: 'magasin' }).source, 'Moteur CôteMaster · moyennes du championnat (magasin FotMob)');
  assert.match(fs.readFileSync(path.join(SERVEUR, 'src', 'data', 'screener.js'), 'utf8'), /ligueSource: m\.statistiques\?\.ligue\?\.source \?\? null/);
  // … et le bloc des forces non plus ne dit pas « la moyenne de leur championnat » pour des moyennes par défaut.
  const inconnus = (source) => M.forcesDites({ modeleDeButs: { provenance: { code: 'moyennes-seules' }, statistiques: { ligue: { source }, forces: { home: null, away: null } } } });
  const fd = inconnus('défaut');
  assert.equal(fd.note, 'Aucun match de ces clubs ni de leur championnat au magasin FotMob : les moyennes par défaut du moteur.');
  assert.deepEqual([fd.equipes.home.resume, fd.equipes.home.titre], ['moyennes par défaut', 'Club inconnu du magasin : les moyennes par défaut du moteur.']);
  const fm = inconnus('saison');
  assert.equal(fm.note, 'Aucun match de ces clubs au magasin FotMob : la moyenne de leur championnat.');
  assert.deepEqual([fm.equipes.home.resume, fm.equipes.home.titre], ['moyenne du championnat', 'Club inconnu du magasin : la moyenne de son championnat.']);
  // Constat 1 : le régime « buts » est décidé CLUB PAR CLUB — plus jamais « pas d’xG pour ce championnat ».
  for (const x of paires().paires) {
    const pr = M.provenanceDesButs(x.avec);
    const f = M.forcesDites(x.avec);
    assert.doesNotMatch(`${pr.detail} ${f.note} ${x.avec.modeleDeButs.provenance.phrase}`, /pour ce championnat/, x.cle);
    if (x.regime.endsWith('-buts') || x.regime === 'buts-seuls') {
      assert.match(x.avec.modeleDeButs.provenance.phrase, /trop peu d’xG connus pour l’une des deux équipes/, x.cle);
      assert.match(f.note, /surtout les buts marqués et encaissés .* Trop peu d’xG connus pour l’une des deux équipes \(moins de la moitié de ses matchs\) : les buts comptent à leur place\./, x.cle);
    }
  }
});

test('« Ce que disent les xG », « autre score », la fiabilité : en mots simples, signe moins vrai, virgule décimale, la mesure et son périmètre dits', () => {
  for (const x of paires().paires) {
    const f = M.forcesDites(x.avec);
    const nom = `${x.regime} ${x.cle}`;
    const xg = x.regime.endsWith('-xg') || x.regime === 'xg-seuls';
    assert.equal(f.titre, xg ? 'Ce que disent les xG' : 'Ce que disent les buts', nom);
    for (const cote of ['home', 'away']) {
      const e = f.equipes[cote];
      const forces = x.avec.modeleDeButs.statistiques.forces[cote];
      if (!forces || !(forces.matchs > 0)) {
        // Un championnat (ou une coupe) lui-même inconnu du magasin : les moyennes par défaut du moteur, dites telles quelles.
        const parDefaut = x.avec.modeleDeButs.statistiques.ligue?.source === 'défaut';
        assert.deepEqual([e.resume, e.matchs], [parDefaut ? 'moyennes par défaut' : 'moyenne du championnat', 'aucun match connu'], nom);
        continue;
      }
      assert.match(e.resume, new RegExp(`^${xg ? 'crée' : 'marque'} (autant|[+${MOINS}]\\d+ %) · concède (autant|[+${MOINS}]\\d+ %)$`), `${nom} : ${e.resume}`);
      assert.doesNotMatch(e.resume, /-\d/, 'vrai signe moins');
      // Le pourcentage est celui de la force face à la moyenne (1 = une équipe moyenne de son championnat).
      const pct = Math.round((forces.attaque - 1) * 100);
      if (pct !== 0) assert.ok(e.resume.includes(`${pct > 0 ? '+' : MOINS}${Math.abs(pct)} %`), `${nom} : ${e.resume} / ${forces.attaque}`);
      assert.match(e.titre, /une équipe moyenne de son championnat/);
      assert.match(e.matchs, /^\d+ matchs? connus?/);
    }
    // Le démarrage à froid : dit quand les statistiques s'appuient encore sur la moyenne du championnat.
    const d = x.avec.modeleDeButs.statistiques.demarrage;
    if (d && d.part < 1) assert.match(f.demarrage, d.nMin === 0 ? /^Aucun match connu pour l’une des deux équipes : côté statistiques/ : new RegExp(`\\(${d.nMin}\\) : côté statistiques, le total de buts s’appuie encore pour ${Math.round((1 - d.part) * 100)} %`), nom);
    else assert.equal(f.demarrage, null, nom);
    // « autre score » : dès 0,5 % seulement.
    const a = x.avec.scorePrediction.autreScore;
    assert.equal(M.autreScoreDit(x.avec.scorePrediction), a >= 0.005 ? `autre score : ${(a * 100).toFixed(1).replace('.', ',')} %` : null, nom);
    // La fiabilité : celle du banc P2 (2019-2023), son périmètre dit — selon le RÉGIME (vérification des écrans, constat 2) :
    // la mesure « avec cotes » ne compte que des matchs avec une cote plus/moins 2,5 ; la cote 1N2 seule n'est pas mesurée.
    const fi = M.fiabiliteDuModele(x.avec.scorePrediction, x.regime);
    if (x.regime.startsWith('cotes-1n2')) {
      assert.deepEqual(fi, { mesuree: false, texte: 'Fiabilité du score : pas encore mesurée pour un match sans cote plus/moins relevée (le banc 2019-2023 n’en comptait que 2 sur 30 158).' }, nom);
    } else {
      assert.equal(fi.mesuree, true);
      assert.ok(
        fi.texte.startsWith(
          x.regime.startsWith('cotes-plusmoins')
            ? 'Mesurée sur 2019-2023, championnats européens, matchs avec une cote plus/moins 2,5, sans xG : sur 30 158 matchs, le score annoncé a été le bon 13,3 % du temps'
            : 'Mesurée sur 2019-2023, championnats d’Europe, d’Amérique et d’Asie, matchs sans cote d’avant-match, sans xG : sur 16 349 matchs'
        ),
        `${nom} : ${fi.texte}`
      );
    }
  }
  assert.ok(paires().paires.some((x) => M.autreScoreDit(x.avec.scorePrediction)), 'au moins un match dit « autre score »');
  assert.deepEqual(M.fiabiliteDuModele({ reliability: null }), { mesuree: false, texte: 'Fiabilité du score : pas encore mesurée.' });
  // Le périmètre vient de la note (mesuré au banc : les 22 championnats européens de football-data à cotes d'avant-match).
  assert.equal(Object.keys(FIABILITE_SCORE_MODELE_DE_BUTS.cotes.championnats).length, 22);
  assert.equal(FIABILITE_SCORE_MODELE_DE_BUTS.cotes.perimetre, 'championnats européens');
});

test('la bulle de la colonne 2,5 : « petit écart attendu » quand le moteur part de la cote plus/moins, « vraie information » sur la cote 1N2 seule ; la part des statistiques est celle appliquée au match', () => {
  for (const x of paires().paires) {
    const m = x.avec.modeleDeButs;
    const b = M.bulleDuDeuxCinq({ ...m.provenance, plusMoins: m.plusMoins, poids: m.poids });
    if (!x.regime.startsWith('cotes-')) {
      assert.equal(b, null, 'sans cote : pas d’écart à lire');
      continue;
    }
    assert.equal(b.titre, 'Écart sur le 2,5');
    if (m.plusMoins) {
      assert.match(b.texte, new RegExp(`relevée chez ${m.plusMoins.source.replace(/[()]/g, '\\$&')} ; les (xG|buts) des deux équipes ne comptent que pour ${Math.round(m.poids.wT * 100)} % dans le total de buts\\. Un petit écart avec la colonne Marché est donc attendu`));
      assert.doesNotMatch(b.texte, /déplacent/, 'jamais « déplacer de 10 % » (vérification des écrans, constat 5)');
    } else {
      assert.match(b.texte, new RegExp(`^Aucune cote plus/moins relevée pour ce match : le moteur part de la cote 1N2 et le total de buts vient pour ${Math.round(m.poids.wT * 100)} % des (xG|buts) des deux équipes\\. L’écart avec la colonne Marché est ici une vraie information\\.$`));
    }
  }
});

// ================================================================ 2. la preuve : rien ne change sans la clé

test('LA PREUVE : avec l’analyse EN SERVICE (la clé absente), la carte du score, la planche des pronostics et le verdict par marché ne portent aucune marque ni aucun mot de l’étape 27 ; avec celle de la CANDIDATE, ils les portent', options, async () => {
  const { rendre, composants } = contexte;
  let vus = 0;
  for (const x of paires().paires) {
    const match = { home: x.avec.teamStats?.home?.name ?? x.match.home, away: x.avec.teamStats?.away?.name ?? x.match.away, league: x.match.league };
    const nom = `${x.regime} ${x.cle}`;
    // --- sans la clé : la carte du score, la planche (comme la page la passe : provenanceDesButs → null), le verdict.
    const rendus = [
      await rendre(composants.Score, { result: x.sans }),
      await rendre(composants.Picks, { predictions: x.sans.marketPredictions ?? [], match, aVerifier: null, views: [], provenanceButs: M.provenanceDesButs(x.sans) }),
      await rendre(composants.Verdicts, { result: x.sans, match, saisies: null })
    ];
    for (const r of rendus) {
      assert.deepEqual(r.avertissements, [], nom);
      assert.equal(r.html.includes(MARQUE), false, `${nom} : une marque de l’étape 27 sans la clé`);
      aucunMot(r.texte, nom);
    }
    // La puce d'avant, ses mots d'avant.
    assert.match(rendus[0].texte, x.sans.scorePrediction.source === 'cotes' ? /d'après les cotes, la forme et la saison/ : /d'après la forme et la saison, faute de cote/);
    // --- avec la clé : les marques et les mots.
    const avecScore = await rendre(composants.Score, { result: x.avec });
    assert.deepEqual(avecScore.avertissements, [], nom);
    const pr = M.provenanceDesButs(x.avec);
    const f = M.forcesDites(x.avec);
    assert.ok(avecScore.html.includes(MARQUE), nom);
    assert.ok(avecScore.texte.includes(`Pronostic du score ${pr.court}`) || avecScore.texte.includes(pr.court), `${nom} : la puce dit le régime`);
    assert.ok(avecScore.texte.includes(`${pr.court} · ${pr.source}`), `${nom} : la provenance réelle`);
    assert.ok(avecScore.texte.includes(f.titre), nom);
    assert.ok(avecScore.texte.includes(f.equipes.home.resume) && avecScore.texte.includes(f.equipes.away.resume), nom);
    assert.ok(avecScore.texte.includes(M.NOTE_DE_LA_FORME), `${nom} : la forme n’est plus qu’un contexte`);
    assert.ok(avecScore.texte.includes(M.fiabiliteDuModele(x.avec.scorePrediction, x.regime).texte), nom);
    assert.equal(avecScore.texte.includes('autre score'), Boolean(M.autreScoreDit(x.avec.scorePrediction)), nom);
    assert.equal(compter(avecScore.html, /aria-label="Qu&#39;est-ce que « Modèle de buts unique » \?"/g), 1, `${nom} : la bulle du guide`);
    if (pr.manque) assert.ok(avecScore.texte.includes(pr.manque), `${nom} : la cote absente dite`);
    const avecPicks = await rendre(composants.Picks, { predictions: x.avec.marketPredictions ?? [], match, aVerifier: null, views: [], provenanceButs: pr });
    assert.deepEqual(avecPicks.avertissements, [], nom);
    const buts = (x.avec.marketPredictions ?? []).some((q) => ['totalGoals', 'teamGoals'].includes(q.marketId));
    const cartes = (x.avec.marketPredictions ?? []).filter((q) => ['bothTeamsScore', 'resultAndTotal'].includes(q.marketId)).length;
    assert.equal(compter(avecPicks.html, /data-modele-de-buts/g), (buts ? 1 : 0) + cartes, `${nom} : sous « Buts » et sur « Les 2 équipes marquent » / « Résultat + total »`);
    vus += buts ? 1 : 0;
  }
  assert.ok(vus >= 6, 'la planche « Buts » vue avec la provenance');
});

test('le verdict par marché : sur la ligne 2,5 du plus/moins calée sur la cote du marché, la phrase « une value ne vient que d’un écart entre votre bookmaker et ce marché » — jamais sans la clé, jamais sans plus/moins', options, async () => {
  const { rendre, composants } = contexte;
  const [x] = deRegime('cotes-plusmoins');
  const [y] = deRegime('cotes-1n2');
  const match = { home: x.match.home, away: x.match.away, league: x.match.league };
  // Le pronostic « Plus/moins » posé sur la ligne 2,5 (l'issue la plus probable dépend du match).
  const surLeDeuxCinq = (a) => ({ ...a, marketPredictions: (a.marketPredictions ?? []).map((q) => (q.marketId === 'totalGoals' ? { ...q, params: { ...q.params, line: 2.5 } } : q)) });
  assert.ok((x.avec.marketPredictions ?? []).some((q) => q.marketId === 'totalGoals'), 'un pronostic du total');
  const avec = await rendre(composants.Verdicts, { result: surLeDeuxCinq(x.avec), match, saisies: null });
  assert.deepEqual(avec.avertissements, []);
  assert.equal(compter(avec.texte, new RegExp(M.PHRASE_DE_LA_VALUE_DU_DEUX_CINQ.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'), 'g')), 1);
  const sansCle = await rendre(composants.Verdicts, { result: surLeDeuxCinq(x.sans), match, saisies: null });
  assert.equal(sansCle.html.includes(MARQUE), false);
  const sansPlusMoins = await rendre(composants.Verdicts, { result: surLeDeuxCinq(y.avec), match: { ...match, home: y.match.home, away: y.match.away }, saisies: null });
  assert.equal(sansPlusMoins.texte.includes(M.PHRASE_DE_LA_VALUE_DU_DEUX_CINQ), false, 'cote 1N2 seule : le 2,5 n’est pas calé sur le marché');
});

// ================================================================ 3. le Repérage

/** Une ligne du Repérage comme data/screener.js la fait (butsProvenanceDe) à partir d'une vraie analyse de la candidate. */
const butsProvenance = (a) => ({
  ...a.modeleDeButs.provenance,
  plusMoins: a.modeleDeButs.plusMoins ? { source: a.modeleDeButs.plusMoins.source, releveAt: a.modeleDeButs.plusMoins.releveAt } : null,
  poids: a.modeleDeButs.poids,
  livres: a.prediction?.source === 'cotes' ? (a.prediction.referenceBooks ?? null) : null,
  titres: a.prediction?.source === 'cotes' ? a.market.byBookmaker.map((b) => b.title) : null,
  bookmakers: a.market?.bookmakersCount ?? null
});

test('le Repérage : la pastille du régime par match et, sur la colonne 2,5, la bulle « petit écart attendu » ou « vraie information » — seulement sur les lignes du modèle ; sans lui, la page d’avant', options, async () => {
  const { rendre, composants } = contexte;
  const [x] = deRegime('cotes-plusmoins');
  const [y] = deRegime('cotes-1n2');
  const page = D.reperage();
  const ligne = (id) => page.data.matches.find((m) => m.matchId === id);
  ligne('odds-arsenal-chelsea').butsProvenance = butsProvenance(x.avec);
  ligne('odds-lyon-nice').butsProvenance = butsProvenance(y.avec);
  // L'écart sur le 2,5 des deux lignes (le reste de la page fabriquée n'en a pas).
  for (const id of ['odds-arsenal-chelsea', 'odds-lyon-nice']) {
    const k = ligne(id).markets.find((q) => q.key === 'over25');
    Object.assign(k, { engineProb: 0.55, marketProb: 0.54, marketBookmakers: 3, gapPoints: 1 });
  }
  const rangees = (html) => html.split(/<tr\b/).slice(2);
  const sur25 = await rendre(composants.Reperage, {}, { s: { reperage: page }, marche: 'over25' });
  assert.deepEqual(sur25.avertissements, []);
  const r25 = rangees(sur25.html);
  const arsenal = r25.find((r) => r.includes('Arsenal'));
  const lyon = r25.find((r) => r.includes('Lyon'));
  assert.ok(arsenal.includes(MARQUE) && lyon.includes(MARQUE), 'la pastille des deux lignes du modèle');
  assert.equal(r25.filter((r) => r.includes(MARQUE)).length, 2, 'seulement elles');
  assert.ok(texteDe(arsenal).includes(x.avec.modeleDeButs.provenance.court));
  assert.ok(arsenal.includes('Écart sur le 2,5') && arsenal.includes('Un petit écart avec la colonne Marché est donc attendu'), 'la bulle « petit écart »');
  assert.ok(lyon.includes('L’écart avec la colonne Marché est ici une vraie information'), 'la bulle « vraie information »');
  // Le survol de la case du moteur dit d'où viennent les buts attendus.
  assert.match(arsenal, /\(modèle de buts unique : calé sur les cotes/);
  // Sur le 1N2 : la pastille, mais pas de bulle du 2,5.
  const sur1 = await rendre(composants.Reperage, {}, { s: { reperage: page }, marche: 'home' });
  assert.equal(compter(sur1.html, /Écart sur le 2,5/g), 0);
  assert.equal(rangees(sur1.html).filter((r) => r.includes(MARQUE)).length, 2);
  // La page d'avant (aucune ligne du modèle) : aucune marque, aucun mot.
  const avant = await rendre(composants.Reperage, {}, { s: { reperage: D.reperage() }, marche: 'over25' });
  assert.equal(avant.html.includes(MARQUE), false);
  aucunMot(avant.texte, 'Repérage sans le modèle');
  assert.deepEqual(interdits, [], 'aucun appel hors liste ni écriture');
});

// ================================================================ 4. Réglages

/** La candidate telle que GET /api/config/versions la donne (vueDeLaCandidate), à un moment de son essai. */
function candidateAuMoment({ essai = null, premiersChiffres = null, jugement = null } = {}) {
  const c = CANDIDATE_EN_ESSAI;
  const empreinte = empreinteDeLaCandidate(c);
  const porte1 = porte1DeLaCandidate(c, empreinte);
  return JSON.parse(JSON.stringify({ ...c, origine: 'code', origineDite: 'déclarée dans le code', horizon: c.horizon, empreinte, statut: jugement ? 'jugee' : essai ? 'en-essai' : 'pas-en-essai', essai, premiersChiffres, jugement, banc: null, ...(porte1 ? { porte1 } : {}) }));
}
const calib = (biais, n, verdict) => ({ pronostics: n, matchs: n, biais, ece: Math.abs(biais), ...(verdict ? { verdict } : {}) });
const PREMIERS = {
  calculeLe: '2026-11-03T05:00:00.000Z',
  matchs: 412,
  joursEcoules: 11,
  regimes: { 'cotes-plusmoins-xg': 230, 'cotes-plusmoins-buts': 21, 'cotes-1n2-xg': 120, 'cotes-1n2-buts': 20, 'xg-seuls': 15, 'buts-seuls': 6 },
  calibration: {
    a: { totalGoals: calib(-0.071, 412), bothTeamsScore: calib(-0.052, 380), teamGoals: calib(-0.031, 400), resultAndTotal: calib(-0.044, 410) },
    b: { totalGoals: calib(-0.004, 412), bothTeamsScore: calib(0.006, 380), teamGoals: calib(-0.002, 400), resultAndTotal: calib(0.011, 410) }
  }
};
const JUGEMENT = {
  le: '2026-11-14T05:10:00.000Z',
  verdict: 'retenu',
  matchs: 846,
  variantes: 320,
  parFamille: {
    totalGoals: { verdict: 'retenu', gainPct: 4.2, matchs: 846 },
    bothTeamsScore: { verdict: 'pas-prouve', gainPct: 1.1, matchs: 846 },
    teamGoals: { verdict: 'retenu', gainPct: 5.0, matchs: 846 },
    resultAndTotal: { verdict: 'moins-bon', gainPct: -1.4, matchs: 846 }
  },
  calibration: {
    a: { totalGoals: calib(-0.095, 846, 'trop-haut'), bothTeamsScore: calib(-0.071, 800, 'trop-haut'), teamGoals: calib(-0.03, 840, 'dans-le-hasard'), resultAndTotal: calib(0.02, 120, 'trop-peu') },
    b: { totalGoals: calib(-0.005, 846, 'dans-le-hasard'), bothTeamsScore: calib(0.004, 800, 'dans-le-hasard'), teamGoals: calib(0.001, 840, 'dans-le-hasard'), resultAndTotal: calib(0.03, 150, 'trop-peu') }
  },
  surete: { 'totalGoals|2.5': calib(-0.006, 300, 'dans-le-hasard'), bothTeamsScore: calib(0.004, 800, 'dans-le-hasard') },
  regimes: PREMIERS.regimes
};

test('Réglages › la carte de la candidate du modèle de buts : la porte 1 du banc et sa réserve ACCEPTÉE telle quelle, un chiffre par famille, la calibration, les régimes, la porte de l’adoption, l’horizon et « pas prouvé est l’issue normale »', options, async () => {
  const { rendre, composants } = contexte;
  // Avant la mise à blanc.
  const declaree = candidateAuMoment();
  assert.ok(V.estUnModeleDeButs(declaree));
  assert.equal(declaree.porte1.franchie, true, 'la porte 1 mesurée pour CETTE candidate');
  const r0 = await rendre(composants.Candidate, { candidate: declaree });
  assert.deepEqual(r0.avertissements, []);
  assert.ok(r0.html.includes(MARQUE));
  assert.match(r0.texte, /Le modèle de buts unique, famille par famille Pas encore à blanc : en essai dès le redémarrage de l’appli, puis calculée à blanc chaque nuit \(horizon : 800 matchs et 21 jours\)\./);
  assert.doesNotMatch(r0.texte, /première nuit/, 'la candidate est en essai dès le redémarrage (vérification du branchement, constat 6)');
  assert.match(r0.texte, /Porte 1 franchie au banc d’essai/);
  assert.match(r0.texte, /Sur 30 158 matchs jamais vus \(2019-2023\), aux cotes d’avant-match : en bloc \+6,1 % \[\+5,5 ; \+6,7\] d’erreur de prévision en moins, retenu \(320 variantes comptées\)\. Football-data n’a pas d’xG : ce banc juge le modèle « cotes \+ buts »\./);
  assert.ok(r0.texte.includes('Réserve acceptée : trop peu de pronostics pour juger la calibration de résultat + total 2,5 ; l’écart va du côté prudent'), 'la réserve, telle quelle');
  assert.match(r0.texte, /Plus\/moins buts pas encore verdict à l’horizon de l’essai · au banc 2019-2023 : \+7,9 % d’erreur de prévision en moins, retenu/);
  assert.match(r0.texte, /Les 2 équipes marquent pas encore verdict à l’horizon de l’essai · au banc 2019-2023 : \+5,6 % d’erreur de prévision en moins, retenu/);
  assert.ok(r0.texte.includes(V.PHRASES_DU_MODELE_DE_BUTS.pasProuveNormal), '« pas prouvé » : l’issue normale, dès la déclaration');
  assert.equal(V.PHRASES_DU_MODELE_DE_BUTS.pasProuveNormal, 'Une famille « pas prouvé » à 800 matchs est l’issue normale ; seul « moins bon » est un échec.');
  assert.match(r0.texte, /Pas encore de match calculé à blanc : les régimes/);
  assert.ok(r0.texte.includes('Pour être adoptée : aucune famille « moins bon »') && r0.texte.includes('environ ± 3,5 points à 800 matchs') && r0.texte.includes('« pas prouvé » sur une famille est toléré'));
  // En essai : les premiers chiffres, sans verdict.
  const enEssai = candidateAuMoment({ essai: { numero: 1, depuis: '2026-10-23T05:00:00.000Z', versionEnService: 4 }, premiersChiffres: PREMIERS });
  const r1 = await rendre(composants.Candidate, { candidate: enEssai });
  assert.ok(r1.texte.includes('412 matchs sur 800, jour 11 sur 21.'), 'l’horizon');
  assert.ok(r1.texte.includes(`Plus/moins buts — en service : écart ${MOINS}7,1 points sur 412 matchs ; candidate : écart ${MOINS}0,4 point sur 412 matchs`), r1.texte);
  assert.ok(r1.texte.includes('cotes + plus/moins 61 % · cotes 1N2 seule 34 % : trop peu pour juger — sur ces 34 %, le plus/moins ne vient pas du marché · sans cote 5 % : trop peu pour juger (sur 412 matchs calculés à blanc).'), r1.texte);
  // À 800 matchs, la part « cotes 1N2 seule » se juge (200 matchs ou plus).
  assert.equal(V.regimesDuModele({ premiersChiffres: { regimes: { 'cotes-plusmoins-xg': 488, 'cotes-1n2-xg': 272, 'xg-seuls': 40 } } }).texte, 'cotes + plus/moins 61 % · cotes 1N2 seule 34 % — sur ces 34 %, le plus/moins ne vient pas du marché · sans cote 5 % : trop peu pour juger (sur 800 matchs calculés à blanc).');
  assert.equal(compter(r1.texte, /pas encore verdict à l’horizon/g), 4, 'jamais de verdict par famille avant l’horizon');
  // Jugée : chaque famille en mots, la sûreté.
  const jugee = candidateAuMoment({ essai: { numero: 1, depuis: '2026-10-23T05:00:00.000Z', versionEnService: 4 }, premiersChiffres: PREMIERS, jugement: JUGEMENT });
  const familles = V.famillesDuModele(jugee);
  assert.deepEqual(familles.map((f) => [f.nom, f.valeur, f.ton]), [['Plus/moins buts', 'retenu', ''], ['Les 2 équipes marquent', 'pas prouvé', 'is-warn'], ['Buts d’une équipe', 'retenu', ''], ['Résultat + total', 'moins bon', 'is-danger']]);
  assert.match(familles[1].detail, /^normal à 800 matchs : l’écart peut venir du hasard · \+1,1 % d’erreur de prévision en moins sur 846 matchs · au banc 2019-2023 : \+5,6 % d’erreur de prévision en moins, retenu$/);
  assert.match(familles[3].detail, /refuse toute l’adoption/);
  const r2 = await rendre(composants.Candidate, { candidate: jugee });
  assert.deepEqual(r2.avertissements, []);
  assert.ok(r2.texte.includes(`Plus/moins buts — en service : annonce trop haut de 9,5 points (au-delà du hasard) ; candidate : dans le hasard (écart ${MOINS}0,5 point)`), r2.texte);
  assert.ok(r2.texte.includes(`Porte de sûreté : plus/moins 2,5 : dans le hasard (écart ${MOINS}0,6 point) ; les 2 équipes marquent : dans le hasard (écart +0,4 point).`), r2.texte);
  // Jamais le vert : rien ici n'est une value.
  for (const r of [r0, r1, r2]) assert.doesNotMatch(r.html, /is-accent|cm-positive|vbadge/);
  // Une autre candidate (fabriquée, sans modèle de buts) : pas de bloc ; la même retouchée : pas de porte 1.
  assert.equal(V.estUnModeleDeButs({ id: 'essai-rho-015', modifications: { football: { defaultCorrelation: -0.15 } } }), false);
  assert.equal(porte1DeLaCandidate(CANDIDATE_EN_ESSAI, 'autre-empreinte'), null);
  assert.equal(V.porte1DuBanc({ ...declaree, porte1: undefined }), null);
});

test('Réglages › la carte « Versions du moteur » : la fiche dit les marchés et le témoin en mots, et montre le bloc du modèle de buts seulement pour sa candidate', options, async () => {
  const { rendre, composants } = contexte;
  const etat = (candidate) => ({
    format: 1,
    source: 'enregistre',
    majLe: '2026-10-21T10:00:00.000Z',
    fichier: 'C:\\essai\\engine-versions.json',
    enService: { numero: 4, creeeLe: '2026-10-21T10:00:00.000Z', pourquoi: 'mise à jour du code du moteur', changements: [] },
    precedentes: [],
    enSynchro: true,
    premiereLe: '2026-10-07T10:00:00.000Z',
    retour: { possible: false, vers: null, raison: 'aucune-precedente', texte: 'La version 4 est la première notée.' },
    candidate,
    adoption: { possible: false, raison: 'pas-encore-jugee', texte: 'Pas encore de verdict.' },
    candidateAdoptee: null,
    lancementADeclarer: null,
    candidatesPassees: [],
    derive: null
  });
  const r = await rendre(composants.Versions, {}, { s: { versions: etat(candidateAuMoment()) } });
  assert.deepEqual(r.avertissements, []);
  assert.match(r.texte, /Marchés calculés à blanc Plus\/moins buts, Les 2 équipes marquent, Buts d’une équipe, Résultat \+ total Témoins \(regardés, jamais jugés\) Score exact/);
  assert.match(r.html, /title="totalGoals, bothTeamsScore, teamGoals, resultAndTotal"/, 'les identifiants au survol');
  assert.equal(compter(r.texte, /Le modèle de buts unique, famille par famille/g), 1);
  // La phrase en mots simples (`enMots`), jamais le jargon : le « quoi » technique seulement dans « Détail technique », replié.
  const enMots = CANDIDATE_EN_ESSAI.enMots;
  assert.equal(enMots, 'Un seul modèle pour tous les marchés de buts et le score : les pourcentages partent des cotes (1N2, et plus/moins 2,5 quand il est relevé) et sont ajustés par les xG des deux équipes ; sans cote, les xG (ou, à défaut, les buts) seuls.');
  assert.ok(r.texte.includes(`Étape 27 — ${enMots} Détail technique ${CANDIDATE_EN_ESSAI.quoi}`), 'la fiche : la phrase, puis le détail replié');
  assert.ok(r.texte.includes(`Candidate en essai modele-buts-v1 étape 27 · ${enMots}`), 'le chiffre clé : la phrase en mots');
  const details = /<details class="ev__technique">([\s\S]*?)<\/details>/.exec(r.html);
  assert.ok(details && !/\bopen\b/.test(details[0].slice(0, 40)), '« Détail technique » replié');
  const horsDetails = texteDe(r.html.replace(/<details[\s\S]*?<\/details>/g, ''));
  assert.doesNotMatch(horsDetails, /Poisson|Dixon|\brho\b|demi-vies|\(m7\)|2001-2012/, 'aucun jargon hors du détail replié');
  assert.match(texteDe(details[1]), /Poisson et Dixon-Coles, rho −0,05/, 'le « quoi » technique, dans le détail');
  // Une candidate sans modèle de buts : pas de bloc.
  const autre = await rendre(composants.Versions, {}, { s: { versions: etat({ ...candidateAuMoment(), id: 'essai-rho-015', modifications: { football: { defaultCorrelation: -0.15 } }, marches: ['totalGoals'], temoins: [], porte1: undefined }) } });
  assert.equal(compter(autre.texte, /Le modèle de buts unique, famille par famille/g), 0);
  assert.deepEqual(interdits, []);
});

test('Réglages › Paramètres du moteur : le modèle de buts dit en mots (absent pendant l’essai, activé après l’adoption) ; « Réinitialiser les valeurs par défaut » prévient qu’il serait retiré — et seulement alors', options, async () => {
  const { rendre, composants } = contexte;
  const config = D.configurationMoteur().config ?? D.configurationMoteur();
  const sans = await rendre(composants.Reglages, { config: { ...config } });
  assert.deepEqual(sans.avertissements, []);
  assert.match(sans.texte, /Modèle de buts unique : absent — ancien modèle de buts \(son essai éventuel se lit dans la carte « Versions du moteur »\)\./);
  assert.doesNotMatch(sans.texte, /La candidate de l’étape 27 se juge à blanc/, 'une phrase qui ne vieillit pas (vérification des écrans, constat 6)');
  const avec = await rendre(composants.Reglages, { config: { ...config, modeleDeButs: CANDIDATE_EN_ESSAI.modifications.football.modeleDeButs } });
  assert.match(avec.texte, /Modèle de buts unique : activé — calé sur les cotes, ajusté par les xG \(étape 27\)\./);
  assert.equal(M.avertissementDeLaRemiseAZero({ ...config }), null, 'sans le modèle : la remise à zéro d’avant, sans question');
  const a = M.avertissementDeLaRemiseAZero({ ...config, modeleDeButs: {} });
  assert.match(a, /^Réinitialiser les valeurs par défaut \?\n\nCela retire le modèle de buts unique \(étape 27\)/);
  // Le câblage : Réglages confirme AVANT la remise à zéro ; le bouton du formulaire émet comme avant.
  const reglages = lireUi('views', 'SettingsView.vue');
  assert.match(reglages, /async function handleResetConfig\(\) \{\n[\s\S]*?const avertissement = avertissementDeLaRemiseAZero\(configStore\.config\);\n {2}if \(avertissement && !window\.confirm\(avertissement\)\) return;\n {2}try \{\n {4}await configStore\.resetConfig\(\);/);
  assert.match(lireUi('components', 'settings', 'EngineConfigForm.vue'), /<AppButton variant="ghost" type="button" @click="emit\('reset'\)">/);
});

// ================================================================ 5. la feuille de route

test('la feuille de route : le bloc « Banc d’essai sur des matchs jamais vus (2019-2023) : avant / après » de l’étape 27, lu dans le code — 17 lignes, verdict en mots, calibration, la phrase des xG, la réserve acceptée, où en est l’étape ; complet même avant la mesure', options, async () => {
  const { rendre, composants } = contexte;
  const MESURE_ABSENTE = etatPourFeuilleDeRoute({ fichier: path.join(RACINE_ESSAIS, `cm-registre-absent-${process.pid}.json`) });
  const etat = etatFeuilleDeRoute({ maintenant: Date.parse('2026-10-21T12:00:00Z'), pierre: { source: 'absent', fichier: 'C:\\essai\\roadmap.json', probleme: null, majLe: null, etapes: {} }, mesure: MESURE_ABSENTE });
  const etapes = etat.lots.flatMap((l) => l.etapes);
  assert.deepEqual(etapes.filter((e) => e.bancAvantApres).map((e) => e.id), ['27'], 'seulement l’étape 27');
  const e27 = etapes.find((e) => e.id === '27');
  // L'étape n'est finie qu'à l'adoption : « en cours », ce qui reste dit, aucune date de fin ; la page compte 1 en cours.
  assert.deepEqual([e27.etat, e27.reste, e27.fin], ['en-cours', 'en essai à blanc, adoption à venir', null]);
  assert.equal(etat.avancement.enCours, 1);
  const bloc = e27.bancAvantApres;
  assert.deepEqual(bloc, JSON.parse(JSON.stringify(blocDuBancEtape27())), 'lu dans le code');
  assert.deepEqual(bloc.lignes.map((l) => l.cle), LIGNES_DU_BANC_27);
  assert.equal(bloc.phrase, PHRASE_SANS_XG);
  const r = await rendre(composants.Etape, { etape: e27, reglages: etat.reglages, semaineCourante: 4 });
  assert.deepEqual(r.avertissements, []);
  assert.match(r.texte, /^27 Modèle de score ancré sur le marché En cours /, 'la pastille « En cours »');
  assert.match(r.texte, /Date de fin pas encore terminée en essai à blanc, adoption à venir /, 'ce qui reste, sous « pas encore terminée »');
  const debut = r.html.indexOf('rstep__banc"');
  const html = r.html.slice(r.html.indexOf('>', debut) + 1, r.html.indexOf('</section>', debut));
  const texte = texteDe(html);
  assert.ok(texte.startsWith('Banc d’essai sur des matchs jamais vus (2019-2023) : avant / après'), texte.slice(0, 120));
  assert.match(texte, /30 158 matchs du 01\/07\/2019 au 30\/06\/2023, cotes d’avant-match de football-data ; 320 variantes comptées par le juge\./);
  assert.equal(compter(html, /<tr>/g), 1 + 17 + 1, 'en-tête, 17 lignes, pied');
  // Des en-têtes qui restent justes après l'adoption (vérification des écrans, constat 7).
  assert.ok(texte.includes('Avant (ancien modèle)') && texte.includes('Après (modèle de buts unique)'), 'les en-têtes avant / après');
  assert.ok(!html.includes('>Version en service</th>') && !texte.includes('Nouveau modèle'), 'jamais « version en service » pour l’ancien modèle');
  assert.ok(html.includes('title="Erreur de prévision (perte log) de l’ancien modèle de buts, en service avant l’étape 27 : plus petite = mieux"'));
  assert.match(texte, /Plus\/moins 2,5 buts 0,7342 0,6772 retenu \+7,8 % \[\+6,7 ; \+8,9\] −14,4 points \(annonce trop haut\) → −0,5 point \(dans le hasard\)/);
  assert.match(texte, /Résultat \+ total 2,5 1,6902 1,6360 retenu \+3,2 % \[\+2,7 ; \+3,7\] \+1,9 point \(trop peu de pronostics\) → \+4,1 points \(trop peu de pronostics\)/);
  assert.match(texte, /Score exact \(témoin\) 2,8553 2,8511 retenu \+0,1 % \[\+0,1 ; \+0,2\] témoin : regardé, jamais jugé sur la calibration/);
  assert.match(texte, /Σ 16 lignes de buts en bloc \+6,1 % \[\+5,5 ; \+6,7\] d’erreur de prévision en moins, retenu ; le score exact à part \(témoin\)/);
  assert.ok(texte.includes(PHRASE_SANS_XG));
  assert.ok(texte.includes('Porte 1 franchie au banc d’essai.'));
  assert.ok(texte.includes('Réserve acceptée : trop peu de pronostics pour juger la calibration de résultat + total 2,5 ; l’écart va du côté prudent'));
  assert.ok(texte.includes('En service comme candidate à blanc') && texte.includes('Adoption à venir'), 'où en est l’étape');
  // Le bloc vient AVANT la preuve après lancement.
  assert.ok(debut > 0 && debut < r.html.indexOf('rstep__preuve"'));
  // Avant la mesure : la structure complète, chaque chiffre « pas encore mesuré ».
  const vide = B.blocDuBancAvantApres(blocDuBancEtape27({ depart: null, modele: null }), null);
  assert.equal(vide.lignes.length, 17);
  assert.ok(vide.lignes.every((l) => l.avant === 'pas encore mesuré' && l.apres === 'pas encore mesuré' && l.verdict.texte === 'pas encore jugé'));
  assert.match(vide.entete, /^Pas encore mesuré : le tableau se remplira au banc d’essai/);
  assert.equal(vide.pied.texte, 'en bloc : pas encore jugé');
  // Adoptée (un lancement noté au registre) : l'étape le dit.
  assert.match(B.blocDuBancAvantApres(bloc, { lancement: { le: '2026-11-15', version: 'modele-buts-v1' } }).etat, /^Adopté : le modèle de buts unique est en service depuis le 15\/11\/2026/);
  assert.equal(B.blocDuBancAvantApres(null), null);
});

// ================================================================ 6. hygiène et câblage

test('hygiène : jetons seulement, jamais le vert d’une value, polices ≥ 10 px, icônes connues ; le terme « modele-de-buts » au guide ; pas de jargon ; câblage de la page du match, du Repérage, de la carte des versions', () => {
  const tokens = lireUi('assets', 'styles', 'tokens.css');
  const connues = new Set([...lireUi('components', 'common', 'AppIcon.vue').matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]));
  for (const f of [['components', 'analysis', 'GoalModelProvenance.vue'], ['components', 'settings', 'EngineGoalModelTrial.vue']]) {
    const source = lireUi(...f);
    const css = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
    const nom = f.join('/');
    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b|\brgba?\(\s*\d|!important/, nom);
    assert.doesNotMatch(css, /--cm-accent|cm-positive/, `${nom} : le vert est celui d’une value`);
    for (const [, t] of css.matchAll(/font-size:\s*([\d.]+)px/g)) assert.ok(Number(t) >= 10, `${nom} : police de ${t}px`);
    for (const [, j] of css.matchAll(/var\((--cm-[a-z0-9-]+)/g)) assert.ok(tokens.includes(`${j}:`), `${nom} : jeton ${j}`);
    for (const [, i] of source.matchAll(/<AppIcon name="(\w+)"/g)) assert.ok(connues.has(i), `${nom} : icône ${i}`);
    assert.doesNotMatch(source, /httpClient|fetch\(|Api\./, `${nom} : n’appelle rien`);
  }
  const g = L.GUIDE_DE_LECTURE['modele-de-buts'];
  assert.equal(g.titre, 'Modèle de buts unique');
  assert.match(g.phrase, /^Les pourcentages de buts partent des cotes ; les xG des deux équipes les ajustent de 10 % quand une cote plus\/moins existe, de moitié pour le total sinon ; sans cote, les xG \(ou, à défaut, les buts\) seuls\./);
  // Pas de jargon dans les mots de l'écran (« calé sur la cote », jamais « ancrage »).
  for (const f of [['utils', 'modeleDeButs.js'], ['utils', 'bancAvantApres.js'], ['components', 'analysis', 'GoalModelProvenance.vue'], ['components', 'settings', 'EngineGoalModelTrial.vue']]) {
    const chaines = [...lireUi(...f).matchAll(/'([^'\n]*)'|`([^`\n]*)`/g)].map((m) => m[1] ?? m[2]).join(' ');
    assert.doesNotMatch(chaines, /ancrage|ancr[ée]|anchor|lambda|\brho\b|Dixon|Poisson|log-?loss/i, f.join('/'));
  }
  // Le câblage.
  const page = lireUi('views', 'UpcomingMatchView.vue');
  assert.match(page, /const provenanceButs = computed\(\(\) => provenanceDesButs\(analyse\.value\.result\)\);/);
  assert.match(page, /<MarketPicksBoard [^>]*:a-verifier="analyse\.result\.aVerifier \?\? null" :provenance-buts="provenanceButs" \/>/);
  assert.match(page, /<ScorePredictionCard :result="analyse\.result" \/>/, 'la carte du score lit l’analyse, comme avant');
  const reperage = lireUi('views', 'ScreenerView.vue');
  assert.match(reperage, /<GoalModelProvenance v-if="r\.buts" :provenance="r\.buts" compacte class="screener__buts" \/>/);
  assert.match(reperage, /<HelpTip v-if="r\.bulleDeuxCinq" :titre="r\.bulleDeuxCinq\.titre" :texte="r\.bulleDeuxCinq\.texte" \/>/);
  const carte = lireUi('components', 'settings', 'EngineVersionsPanel.vue');
  assert.match(carte, /<EngineGoalModelTrial v-if="candidate && estUnModeleDeButs\(candidate\)" :candidate="candidate" \/>\n\n {4}<!-- 4 ter\./);
  assert.ok(carte.indexOf('<EngineGoalModelTrial') < carte.indexOf('<EngineCandidateTrial'), 'le détail du modèle avant l’essai et l’adoption');
  // Le serveur : la ligne du Repérage ne porte le régime qu'avec le modèle (data/screener.js).
  const ecran = fs.readFileSync(path.join(SERVEUR, 'src', 'data', 'screener.js'), 'utf8');
  assert.match(ecran, /\.\.\.\(resultat\?\.modeleDeButs \? \{ butsProvenance: butsProvenanceDe\(resultat\) \} : \{\}\),/);
});

test('Réglages › Actualisation automatique : les contrôles anti-fuite de la nuit (table du jour J, forces de buts) dits en mots simples quand ils trouvent un écart, rien sinon ; la puce du haut les compte (vérification du branchement, constat 4)', options, async () => {
  const { rendre, composants } = contexte;
  const A = await imp(path.join(UI, 'src', 'utils', 'controlesAntiFuite.js'));
  const base = { enabled: true, running: null, lastPass: null, history: [], nextRunAt: null };
  // Aucun écart (la dernière nuit a levé l'alerte) ou un serveur qui ne les connaît pas : rien.
  for (const alerts of [{ forcesButs: null, tableJourJ: null }, {}, undefined]) {
    const r = await rendre(composants.Actualisation, { overview: { ...base, alerts } });
    assert.deepEqual(r.avertissements, []);
    assert.ok(!r.html.includes('data-controle-anti-fuite'));
    assert.doesNotMatch(r.texte, /anti-fuite/);
  }
  const alerts = {
    tableJourJ: { ecarts: [{ matchKey: '2026-10-05-arsenal-chelsea', colonne: 'buts' }], total: 1, lignes: 200, updatedAt: '2026-10-22T03:05:00.000Z' },
    forcesButs: {
      ecarts: [
        { empreinte: 'v1|35|25|remise-a-zero', club: 8456, J: '2026-10-12', colonne: 'n', attendu: 3, lu: 4 },
        { empreinte: 'v1|35|25|remise-a-zero', club: 8456, J: '2026-10-12', colonne: 'sa', attendu: 1.2, lu: 2.1 }
      ],
      total: 2,
      lignes: 80,
      updatedAt: '2026-10-22T03:10:00.000Z'
    }
  };
  const avec = await rendre(composants.Actualisation, { overview: { ...base, alerts } });
  assert.deepEqual(avec.avertissements, []);
  assert.equal(compter(avec.html, /data-controle-anti-fuite/g), 1);
  assert.ok(avec.texte.includes('Contrôle anti-fuite de la nuit : à regarder'), avec.texte);
  assert.ok(avec.texte.includes('Table du jour J (ce que l’appli savait la veille) : 1 écart sur 200 lignes recalculées (contrôle du 22/10/2026 à 05:05) — par exemple match 2026-10-05-arsenal-chelsea.'), avec.texte);
  assert.ok(avec.texte.includes('Forces de buts du modèle de buts : 2 écarts sur 80 lignes recalculées (contrôle du 22/10/2026 à 05:10) — par exemple club n° 8456 avant le 12/10/2026.'), avec.texte);
  assert.ok(avec.texte.includes('Un écart veut dire qu\'un chiffre « d\'avant le match » a pu voir le match lui-même.'));
  assert.doesNotMatch(avec.texte, /ecarts|forcesButs|tableJourJ|empreinte|v1\|35/, 'pas de jargon');
  // Pendant une passe, rien (comme les autres alertes durables).
  const pendant = await rendre(composants.Actualisation, { overview: { ...base, running: { startedAt: '2026-10-22T03:00:00.000Z', stepIndex: 3, steps: 20, stepLabel: 'Forces de buts' }, alerts } });
  assert.ok(!pendant.html.includes('data-controle-anti-fuite'));
  // Les mots, purs : un joueur ou un championnat de la table du jour J ; rien sans alerte.
  assert.deepEqual(A.controlesAntiFuiteDits(null), []);
  assert.equal(A.ecartDit({ joueur: 123, date: '2026-10-01' }), 'joueur n° 123 le 01/10/2026');
  assert.equal(A.ecartDit({ league: 'Ligue 1', date: '2026-10-01' }), 'Ligue 1 le 01/10/2026');
  // La puce du haut (AppTopbar) compte ces alertes et les dit au survol.
  const barre = fs.readFileSync(path.join(UI, 'src', 'components', 'layout', 'AppTopbar.vue'), 'utf8');
  assert.match(barre, /const alertesFuite = computed\(\(\) => controlesAntiFuiteDits\(refresh\.value\?\.alerts \?\? null\)\);/);
  // (Les lignes d'avant gardées telles quelles : la nouvelle s'insère avant elles — rien de « disparu » au contrôle de l'interface.)
  assert.match(barre, /alertesSauvegarde\.value\.length \|\|\n {6}alertesFuite\.value\.length \|\|\n {6}alertesEnregistreurs\.value\.length\n/);
  assert.match(barre, /\.\.\.alertesFuite\.value\.map\(\(f\) => `Contrôle anti-fuite de la nuit — \$\{f\.texte\}`\),\n {4}\.\.\.alertesEnregistreurs\.value\.map/);
});
