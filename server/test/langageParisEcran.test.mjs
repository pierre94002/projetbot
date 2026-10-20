/**
 * Le langage visuel des paris SE RENDE, avec les vraies règles et les vraies pages (étape 6 du plan).
 *   node --test test/langageParisEcran.test.mjs        (depuis server/)
 *
 * interface.test.mjs prouve que tout COMPILE et se construit ; langageParis.test.mjs prouve les règles ;
 * ceci prouve que les gabarits S'EXÉCUTENT : un rendu côté serveur (sans navigateur ni serveur de
 * développement) des sept composants communs, puis des pages « Repérage » et « Chutes de cotes » et de
 * ce qui porte une pastille ou une bulle d'aide (compositions, valeur de clôture, coupe-circuit), avec des
 * réponses du serveur FABRIQUÉES (test/aides/donneesEcransParis.mjs).
 *
 * Aucun réseau ni fichier de l'appli : fetch est REMPLACÉ (et tout appel hors liste refusé et compté),
 * le routeur de l'appli, qui crée son historique sur window, est remplacé par un faux, un serveur Vite en
 * mode « middleware » n'écoute sur aucun port, son cache va dans le dossier d'essais (effacé ensuite),
 * rien n'est écrit dans ui/. Seule bidouille : dans le rendu, `onMounted` devient `onServerPrefetch` pour
 * que le rendu attende le chargement (le code de l'appli n'est pas modifié). L'horloge de l'appli est
 * figée au 6 octobre 2026, 10 h (heure locale).
 *
 *  1. Chaque composant, dans chacun de ses états — dont « jamais de vert sans vraie value » et
 *     « pas encore mesurée ».
 *  2. La page Repérage : un seul vert sur six matchs, la raison de chaque cote qui n'en est pas une, la
 *     provenance de chaque colonne, la confiance, les bulles d'aide ; seuils inconnus : aucun vert.
 *  3. La page Chutes de cotes : flèches lisibles sans couleur, provenance, compte à rebours.
 *  4. L'état des compositions, la bulle de la valeur de clôture et celle des séries de pertes.
 *  5. Hygiène : aucune couleur en dur, du vert seulement dans la pastille de value, aucun appel hors liste.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SERVEUR, RACINE_ESSAIS } from './aides/isolement.mjs';
import * as D from './aides/donneesEcransParis.mjs';

const UI = path.resolve(SERVEUR, '..', 'ui');
const pret = ['vite', '@vitejs/plugin-vue', 'vue', 'pinia', 'vue-router'].every((p) => fs.existsSync(path.join(UI, 'node_modules', p)));
const imp = (chemin) => import(pathToFileURL(chemin).href);
const options = { skip: pret ? false : 'ui/node_modules (vite, plugin-vue, vue, pinia, vue-router) manque' };

const REGLE = { min: 2, max: 25, coteMax: 5 };
const MIN = 60_000;
const H = 3_600_000;
const JOUR = 86_400_000;

/** Les seuls appels que ces pages ont le droit de faire (le reste est refusé et compté). */
const AUTORISES = [/\/api\/screener(\?|$)/, /\/api\/config$/, /\/api\/sources$/, /\/api\/odds\/dropping\?/, /\/api\/odds\/closing-value\?/];
let scenario = {};
const appels = [];
let totalAppels = 0;
const interdits = [];
const avertissements = [];

let contexte;
let setIntervalOrigine;
let consoleWarnOrigine;
let fetchOrigine;

const reponseJson = (corps, statut = 200) => ({
  ok: statut < 400,
  status: statut,
  headers: { get: () => 'application/json' },
  json: async () => JSON.parse(JSON.stringify(corps))
});

before(async () => {
  if (!pret) return;
  fetchOrigine = globalThis.fetch;
  consoleWarnOrigine = console.warn;
  setIntervalOrigine = globalThis.setInterval;
  // L'horloge partagée de l'appli arme un minuteur à son chargement : « unref », sinon le processus ne se termine pas.
  globalThis.setInterval = (fn, ms) => {
    const t = setIntervalOrigine(fn, ms);
    t.unref?.();
    return t;
  };
  globalThis.fetch = async (url) => {
    const u = String(url);
    appels.push(u);
    totalAppels++;
    if (!AUTORISES.some((motif) => motif.test(u))) {
      interdits.push(u);
      return reponseJson({ error: `fetch interdit dans ce rendu : ${u}` }, 599);
    }
    if (/\/api\/screener/.test(u)) return reponseJson(scenario.reperage ?? D.reperage());
    if (/\/api\/odds\/dropping/.test(u)) return reponseJson(scenario.chutes ?? D.chutes());
    if (/\/api\/odds\/closing-value/.test(u)) return reponseJson({ error: 'pas de mesure dans ce rendu' }, 503);
    if (/\/api\/config$/.test(u)) return scenario.config === 'echec' ? reponseJson({ error: 'config indisponible' }, 503) : reponseJson(D.configurationMoteur());
    if (/\/api\/sources$/.test(u)) return scenario.origines === 'echec' ? reponseJson({ error: 'sources indisponibles' }, 503) : reponseJson(D.origines(scenario.origines));
    return reponseJson({ error: 'inconnu' }, 404);
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
      if (!/(ScreenerView|DroppingOddsView)\.vue$/.test(id) || id.includes('?')) return null;
      return code.replace(/import \{ ([^}]*)\bonMounted\b([^}]*)\} from 'vue';/, (m, a, b) => `import { ${a}onMounted, onServerPrefetch${b}} from 'vue';`).replace(/onMounted\(/g, 'onServerPrefetch(');
    }
  };
  // Le routeur de l'appli crée son historique sur window au chargement : remplacé par un faux (une seule page le lit : le store des équipes).
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

  contexte = {
    vite,
    cache,
    regles: await vite.ssrLoadModule('/src/utils/langageParis.js'),
    composants: {
      ValueBadge: await charger('/src/components/common/ValueBadge.vue'),
      ConfidenceGauge: await charger('/src/components/common/ConfidenceGauge.vue'),
      OddsMoveArrow: await charger('/src/components/common/OddsMoveArrow.vue'),
      LineupStateBadge: await charger('/src/components/common/LineupStateBadge.vue'),
      KickoffCountdown: await charger('/src/components/common/KickoffCountdown.vue'),
      ProvenanceChip: await charger('/src/components/common/ProvenanceChip.vue'),
      HelpTip: await charger('/src/components/common/HelpTip.vue'),
      ScreenerView: await charger('/src/views/ScreenerView.vue'),
      DroppingOddsView: await charger('/src/views/DroppingOddsView.vue'),
      AiLineupSnapshot: await charger('/src/components/analysis/AiLineupSnapshot.vue'),
      ClosingValuePanel: await charger('/src/components/analysis/ClosingValuePanel.vue'),
      RiskControlPanel: await charger('/src/components/settings/RiskControlPanel.vue')
    },
    /** Rend un composant (ou une page) avec ses propriétés et ses emplacements : { html, texte, avertissements }. */
    async rendre(composant, props = {}, emplacements = undefined) {
      const avant = avertissements.length;
      // L'horloge de l'appli, figée : le compte à rebours et les « il y a » se calculent depuis le même instant que les essais.
      horloge.liveNow.value = D.MAINTENANT;
      const app = createSSRApp({ render: () => h(composant, props, emplacements) });
      app.use(createPinia());
      app.use(routeur);
      const html = await renderToString(app);
      // Une icône que AppIcon ne connaît pas s'afficherait vide, sans erreur : un tracé sans « d » le trahit.
      const vide = /<path(?![^>]*\bd=)[^>]*>/.exec(html);
      assert.equal(vide, null, `une icône inconnue d'AppIcon (tracé vide) : ${vide?.[0]}`);
      return { html, texte: texteDe(html), avertissements: avertissements.slice(avant) };
    }
  };
});

after(async () => {
  if (!pret) return;
  globalThis.fetch = fetchOrigine;
  console.warn = consoleWarnOrigine;
  globalThis.setInterval = setIntervalOrigine;
  if (!contexte) return;
  await contexte.vite.close();
  // Le dossier de cache ne contient aucun lien : suppression sans danger.
  fs.rmSync(contexte.cache, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

/** Le texte visible d'un rendu : styles et balises retirés, entités décodées, espaces unifiés. */
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
const decoder = (valeur) => valeur.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
/** La valeur d'un attribut du premier élément qui porte `classe`. */
const attribut = (html, classe, nom) => {
  const balise = new RegExp(`<[^>]*class="[^"]*\\b${classe}\\b[^"]*"[^>]*>`).exec(html)?.[0] ?? '';
  const valeur = new RegExp(`\\b${nom}="([^"]*)"`).exec(balise)?.[1];
  return valeur === undefined ? undefined : decoder(valeur);
};
const iso = D.iso;

// --------------------------------------------------- 1. les composants

test('ValueBadge : le vert seulement pour une vraie value ; tout le reste neutre, ambre ou grisé — et dit en toutes lettres', options, async () => {
  const { rendre, composants } = contexte;
  const cas = [
    [{ pourcent: 4.1, jouable: true, cote: 2.3, regle: REGLE, bookmaker: 'William Hill' }, 'value', /Value \+4,1 %/],
    [{ pourcent: 0.4, jouable: true, cote: 2.3, regle: REGLE }, 'sous-seuil', /\+0,4 % sous le seuil/],
    [{ pourcent: -3.2, jouable: true, cote: 2.3, regle: REGLE }, 'sans-value', /−3,2 %/],
    [{ pourcent: 31, jouable: true, cote: 2.6, regle: REGLE }, 'trop-beau', /\+31,0 % trop beau pour être vrai/],
    [{ pourcent: 12, jouable: true, cote: 6.5, regle: REGLE }, 'cote-haute', /\+12,0 % cote trop haute/],
    [{ pourcent: 12, jouable: false, cote: 2.5, regle: REGLE }, 'non-jouable', /non jouable/],
    [{ pourcent: 12, jouable: true, reference: true, cote: 2.5, regle: REGLE }, 'reference', /référence/],
    [{ pourcent: 12, jouable: true, cote: 2.5, regle: null }, 'seuil-inconnu', /\+12,0 % seuil inconnu/],
    [{ jouable: true, cote: 2.5, regle: REGLE }, 'inconnue', /valeur inconnue/],
    [{}, 'non-jouable', /non jouable/]
  ];
  for (const [props, etat, texte] of cas) {
    const r = await rendre(composants.ValueBadge, props);
    assert.deepEqual(r.avertissements, [], etat);
    assert.ok(r.html.includes(`vbadge is-${etat} `), `état « ${etat} » : ${r.html.slice(0, 120)}`);
    assert.match(r.texte, texte, etat);
    // Le vert : cette classe-là, et pas une autre.
    assert.equal(r.html.includes('is-value'), etat === 'value', `${etat} : vert ?`);
    // Lisible sans la couleur : une phrase complète pour les lecteurs d'écran et au survol.
    assert.ok(attribut(r.html, 'vbadge', 'aria-label').length > 40, `${etat} : phrase complète`);
    assert.equal(attribut(r.html, 'vbadge', 'role'), 'img');
    assert.equal(attribut(r.html, 'vbadge', 'title'), attribut(r.html, 'vbadge', 'aria-label'));
  }
  // Qui paie la cote, et la raison, dans la phrase.
  const vraie = await rendre(composants.ValueBadge, cas[0][0]);
  assert.equal(attribut(vraie.html, 'vbadge', 'aria-label'), "Value : avantage de +4,1 % chez l'un de vos bookmakers, au-dessus du seuil de 2 % du moteur. Cote de William Hill.");
  const reference = await rendre(composants.ValueBadge, cas[6][0]);
  assert.match(attribut(reference.html, 'vbadge', 'aria-label'), /jamais à parier/);
  assert.doesNotMatch(attribut(reference.html, 'vbadge', 'aria-label'), /Cote de [A-Z]/, "une cote de référence n'a pas de bookmaker à vous");
  // Ce que la page ne voit pas se dit dans la phrase d'une value, et d'elle seule.
  const AVERTI = 'La page du match le vérifie.';
  assert.match(attribut((await rendre(composants.ValueBadge, { ...cas[0][0], precision: AVERTI })).html, 'vbadge', 'aria-label'), /Cote de William Hill\. La page du match le vérifie\.$/);
  assert.doesNotMatch(attribut((await rendre(composants.ValueBadge, { ...cas[1][0], precision: AVERTI })).html, 'vbadge', 'aria-label'), /La page du match/);
  // Un texte de l'appelant remplace le texte visible, jamais la décision.
  const slot = await rendre(composants.ValueBadge, cas[0][0], { default: () => 'valeur +4,1 %' });
  assert.ok(slot.html.includes('is-value'));
  assert.match(slot.texte, /^valeur \+4,1 %$/);
  const slotNeutre = await rendre(composants.ValueBadge, cas[1][0], { default: () => 'valeur +0,4 %' });
  assert.ok(!slotNeutre.html.includes('is-value'), 'un texte de l\'appelant ne rend pas la pastille verte');
  // Petite taille.
  assert.ok((await rendre(composants.ValueBadge, { ...cas[0][0], taille: 'sm' })).html.includes('vbadge--sm'));
});

test('ConfidenceGauge : sans valeur, « pas encore mesurée » — jamais un faux niveau ; mesurée, sûr en bleu, fragile en ambre', options, async () => {
  const { rendre, composants } = contexte;
  for (const props of [{}, { valeur: null }, { valeur: 72 }, { valeur: -1 }, { valeur: Number.NaN }, { etiquette: 'solide' }]) {
    const r = await rendre(composants.ConfidenceGauge, props);
    assert.deepEqual(r.avertissements, [], JSON.stringify(props));
    assert.ok(r.html.includes('is-non-mesuree'), JSON.stringify(props));
    assert.match(r.texte, /pas encore mesurée/);
    assert.equal(attribut(r.html, 'cgauge', 'role'), 'img', 'pas de mesure : jamais un « meter »');
    assert.equal(attribut(r.html, 'cgauge', 'aria-label'), 'Confiance : pas encore mesurée');
    assert.ok(!r.html.includes('cgauge__fill'), 'aucun remplissage inventé');
    assert.ok(!r.html.includes('is-sur') && !r.html.includes('is-fragile'));
    assert.match(attribut(r.html, 'cgauge', 'title'), /étape 38 du plan.*aucun niveau/);
  }
  const puce = await rendre(composants.ConfidenceGauge, { variante: 'puce' });
  assert.match(puce.texte, /^Confiance : pas encore mesurée$/);
  assert.match(attribut(puce.html, 'cgauge', 'title'), /« sûr » ou « fragile »/, 'la puce garde les mots « sûr » et « fragile » au survol');
  assert.ok(puce.html.includes('cgauge--puce'));
  // Mesurée : le serveur dit « sûr » ou « fragile ».
  const sur = await rendre(composants.ConfidenceGauge, { valeur: 0.82, etiquette: 'sur' });
  assert.equal(attribut(sur.html, 'cgauge', 'role'), 'meter');
  assert.equal(attribut(sur.html, 'cgauge', 'aria-valuenow'), '0.82');
  assert.equal(attribut(sur.html, 'cgauge', 'aria-valuemin'), '0');
  assert.equal(attribut(sur.html, 'cgauge', 'aria-valuemax'), '1');
  assert.equal(attribut(sur.html, 'cgauge', 'aria-valuetext'), 'sûr');
  assert.ok(sur.html.includes('is-sur') && sur.html.includes('width:82%'));
  assert.equal(sur.texte.trim(), 'sûr');
  const fragile = await rendre(composants.ConfidenceGauge, { valeur: 0.3, etiquette: 'fragile' });
  assert.ok(fragile.html.includes('is-fragile') && fragile.html.includes('width:30%'));
  assert.equal(fragile.texte.trim(), 'fragile');
  // L'étiquette seule : aucun niveau inventé.
  const seule = await rendre(composants.ConfidenceGauge, { etiquette: 'sur' });
  assert.ok(seule.html.includes('is-mesuree') && !seule.html.includes('cgauge__fill'));
  assert.equal(attribut(seule.html, 'cgauge', 'role'), 'img');
  // Ni vert ni rouge.
  for (const r of [sur, fragile, seule, puce]) assert.doesNotMatch(r.html, /is-accent|cm-positive|cm-negative|is-danger/);
});

test('OddsMoveArrow : direction et ampleur lisibles sans la couleur — flèche, signe, phrase ; jamais vert ni rouge', options, async () => {
  const { rendre, composants } = contexte;
  const TREND_DOWN = 'M3 7l6 6 4-4 8 8M21 11v6h-6';
  const TREND_UP = 'M3 17l6-6 4 4 8-8M15 7h6v6';
  const baisse = await rendre(composants.OddsMoveArrow, { pourcent: -12.34 });
  assert.deepEqual(baisse.avertissements, []);
  assert.ok(baisse.html.includes('is-baisse') && baisse.html.includes(TREND_DOWN) && !baisse.html.includes(TREND_UP));
  assert.equal(baisse.texte.trim(), '−12,3 %');
  assert.equal(attribut(baisse.html, 'omove', 'aria-label'), 'Cote en baisse de 12,3 %.');
  assert.equal(attribut(baisse.html, 'omove', 'role'), 'img');
  const hausse = await rendre(composants.OddsMoveArrow, { de: 2.0, vers: 2.2 });
  assert.ok(hausse.html.includes('is-hausse') && hausse.html.includes(TREND_UP) && !hausse.html.includes(TREND_DOWN));
  assert.equal(hausse.texte.trim(), '+10,0 %');
  assert.equal(attribut(hausse.html, 'omove', 'aria-label'), 'Cote en hausse de 10,0 %.');
  const stable = await rendre(composants.OddsMoveArrow, { pourcent: 0.02 });
  assert.ok(stable.html.includes('is-stable') && !stable.html.includes(TREND_UP) && !stable.html.includes(TREND_DOWN));
  assert.equal(stable.texte.trim(), 'stable');
  const inconnu = await rendre(composants.OddsMoveArrow, {});
  assert.ok(inconnu.html.includes('is-inconnu'));
  assert.equal(inconnu.texte.trim(), 'inconnu');
  assert.match(attribut(inconnu.html, 'omove', 'aria-label'), /^Mouvement inconnu/);
  // Direction seule, sans le chiffre (la ligne d'un bookmaker) ; le sujet se dit ; une phrase de l'appelant au survol.
  const sens = await rendre(composants.OddsMoveArrow, { de: 2.3, vers: 2.0, ampleur: false, taille: 'sm' });
  assert.ok(sens.html.includes('is-baisse') && !sens.html.includes('omove__text') && sens.html.includes('omove--sm'));
  assert.equal(sens.texte.trim(), '');
  assert.equal(attribut(sens.html, 'omove', 'aria-label'), 'Cote en baisse de 13,0 %.', 'même sans le chiffre, la phrase le dit');
  const sujet = await rendre(composants.OddsMoveArrow, { pourcent: -5, sujet: 'Cote juste', titre: 'Une phrase plus précise.', taille: 'lg' });
  assert.equal(attribut(sujet.html, 'omove', 'aria-label'), 'Cote juste en baisse de 5,0 %.');
  assert.equal(attribut(sujet.html, 'omove', 'title'), 'Une phrase plus précise.');
  assert.ok(sujet.html.includes('omove--lg'));
  const slot = await rendre(composants.OddsMoveArrow, { pourcent: -12 }, { default: () => '−12,0 %' });
  assert.equal(slot.texte.trim(), '−12,0 %');
  for (const r of [baisse, hausse, stable, inconnu, sens, sujet, slot]) assert.doesNotMatch(r.html, /is-accent|cm-positive|cm-negative|is-danger/);
});

test("LineupStateBadge : officielle, probable, dernière alignée, pas publiée — l'état se déduit, la raison se dit", options, async () => {
  const { rendre, composants } = contexte;
  const dit = async (props) => {
    const r = await rendre(composants.LineupStateBadge, props);
    assert.deepEqual(r.avertissements, []);
    return r;
  };
  const officielle = await dit({ snapshot: D.compositionFotMob(45) });
  assert.ok(officielle.html.includes('is-officielle'));
  assert.equal(officielle.texte.trim(), 'Compo officielle');
  assert.match(attribut(officielle.html, 'lstate', 'title'), /FotMob ne signale pas lui-même si elle l'est/);
  assert.equal((await dit({ snapshot: D.compositionFotMob(60) })).texte.trim(), 'Compo officielle');
  assert.equal((await dit({ snapshot: D.compositionFotMob(-15) })).texte.trim(), 'Compo officielle');
  const probable = await dit({ snapshot: D.compositionFotMob(300) });
  assert.ok(probable.html.includes('is-probable'));
  assert.equal(probable.texte.trim(), 'Compo probable');
  const contredite = await dit({ snapshot: D.compositionFotMob(30, { contradiction: true }) });
  assert.equal(contredite.texte.trim(), 'Compo probable');
  assert.match(attribut(contredite.html, 'lstate', 'title'), /indisponible/);
  const derniere = await dit({ snapshot: D.derniereComposition() });
  assert.ok(derniere.html.includes('is-derniere'));
  assert.equal(derniere.texte.trim(), 'Dernière alignée');
  const absente = await dit({ snapshot: null });
  assert.ok(absente.html.includes('is-absente'));
  assert.equal(absente.texte.trim(), 'Compo non publiée');
  assert.equal((await dit({})).texte.trim(), 'Compo non publiée');
  // Un état déjà connu.
  assert.equal((await dit({ etat: 'probable' })).texte.trim(), 'Compo probable');
  assert.equal((await dit({ etat: 'n’importe quoi' })).texte.trim(), 'Compo non publiée');
  assert.ok((await dit({ etat: 'officielle', taille: 'sm' })).html.includes('lstate--sm'));
  // Ni vert ni rouge.
  for (const r of [officielle, probable, derniere, absente]) assert.doesNotMatch(r.html, /is-accent|cm-positive|cm-negative|is-danger/);
});

test("KickoffCountdown : dans combien de temps, puis « en cours » et « terminé » ; le jour seul du calendrier ne compte pas d'heures", options, async () => {
  const { rendre, composants } = contexte;
  const compte = async (props) => {
    const r = await rendre(composants.KickoffCountdown, { maintenant: D.MAINTENANT, ...props });
    assert.deepEqual(r.avertissements, []);
    return r;
  };
  const avant = await compte({ coupDEnvoi: iso(3 * H + 20 * MIN), heureSure: true });
  assert.equal(avant.texte.trim(), 'dans 3 h 20');
  assert.ok(avant.html.includes('is-avant') && avant.html.includes('kcount--pastille'));
  assert.match(attribut(avant.html, 'kcount', 'title'), /^Coup d'envoi /);
  const bientot = await compte({ coupDEnvoi: iso(12 * MIN), heureSure: true });
  assert.equal(bientot.texte.trim(), 'dans 12 min');
  const enCours = await compte({ coupDEnvoi: iso(-40 * MIN), heureSure: true });
  assert.equal(enCours.texte.trim(), 'en cours');
  assert.ok(enCours.html.includes('is-en-cours') && enCours.html.includes('cm-live-dot'), 'le point qui pulse, comme « Direct »');
  assert.match(attribut(enCours.html, 'kcount', 'title'), /pas d'après un flux en direct/);
  const termine = await compte({ coupDEnvoi: iso(-3 * H), heureSure: true });
  assert.equal(termine.texte.trim(), 'terminé');
  assert.ok(termine.html.includes('is-termine') && !termine.html.includes('cm-live-dot'));
  // Un match du calendrier : le jour seulement, dit.
  const demain = await compte({ coupDEnvoi: '2026-10-07', heureSure: false });
  assert.equal(demain.texte.trim(), 'demain');
  assert.ok(demain.html.includes('is-jour'));
  assert.match(attribut(demain.html, 'kcount', 'title'), /heure du coup d'envoi à confirmer/);
  assert.equal((await compte({ coupDEnvoi: '2026-10-08T12:00:00Z' })).texte.trim(), 'dans 2 jours', 'le midi UTC de repli est lu comme un jour seul');
  assert.equal((await compte({ coupDEnvoi: '2026-10-06', heureSure: false })).texte.trim(), "aujourd'hui");
  // Rien : dit.
  const inconnu = await compte({ coupDEnvoi: null });
  assert.equal(inconnu.texte.trim(), 'heure inconnue');
  assert.ok(inconnu.html.includes('is-inconnu'));
  // En ligne, sans fond.
  assert.ok((await compte({ coupDEnvoi: iso(2 * H), heureSure: true, variante: 'texte' })).html.includes('kcount--texte'));
  // Sans « maintenant » donné : l'horloge de l'appli (figée ici au même instant).
  const horloge = await rendre(composants.KickoffCountdown, { coupDEnvoi: iso(2 * H), heureSure: true });
  assert.equal(horloge.texte.trim(), 'dans 2 h 00');
  for (const r of [avant, enCours, termine, demain, inconnu]) assert.doesNotMatch(r.html, /is-accent|cm-positive/);
});

test('ProvenanceChip : le fournisseur réel et l\'heure du relevé ; ancien, sans heure, sans source — toujours dits', options, async () => {
  const { rendre, composants } = contexte;
  const chip = async (props, emplacements) => {
    const r = await rendre(composants.ProvenanceChip, { maintenant: D.MAINTENANT, ...props }, emplacements);
    assert.deepEqual(r.avertissements, []);
    return r;
  };
  const recent = await chip({ source: 'ESPN, football-data.co.uk', releveLe: iso(-20 * MIN) });
  assert.ok(recent.html.includes('is-recent'));
  assert.match(recent.texte, /^ESPN, football-data\.co\.uk relevé aujourd'hui à 09:40$/);
  assert.match(attribut(recent.html, 'prov', 'title'), /^ESPN, football-data\.co\.uk : relevé aujourd'hui à 09:40 \(il y a 20 min\)\.$/);
  // Ancien : l'ambre ET les mots, et la source payante nommée comme telle.
  const ancien = await chip({ source: 'The Odds API', releveLe: new Date(2026, 8, 21, 18, 35).toISOString(), payant: true, fichier: 'C:\\essai\\odds-snapshot.json' });
  assert.ok(ancien.html.includes('is-ancien'));
  assert.match(ancien.texte, /^The Odds API relevé le 21\/09 à 18:35 · il y a 15 jours payant$/);
  assert.match(attribut(ancien.html, 'prov', 'title'), /Ce relevé est ancien : les cotes ont pu bouger depuis\. Lu dans C:\\essai\\odds-snapshot\.json\. Source payante\.$/);
  // Heure inconnue, source absente : dites.
  const sansHeure = await chip({ source: 'ESPN', releveLe: null });
  assert.ok(sansHeure.html.includes('is-sans-heure'));
  assert.match(sansHeure.texte, /^ESPN heure du relevé inconnue$/);
  assert.match((await chip({ source: 'Moteur', releveLe: null, action: 'calculé' })).texte, /heure du calcul inconnue/);
  const sansSource = await chip({ source: null, releveLe: iso(-5 * MIN) });
  assert.ok(sansSource.html.includes('is-sans-source'));
  assert.equal(sansSource.texte.trim(), 'source non indiquée');
  assert.ok(!sansSource.texte.includes('relevé'), 'sans source, pas d\'heure qui ferait croire à une provenance');
  // Les mots de l'appelant : le nom, ou la partie « quand » (avec l'ambre et le « il y a » à sa disposition).
  const nom = await chip({ source: 'ESPN', releveLe: iso(-20 * MIN) }, { source: () => 'Cotes relevées chez ESPN' });
  assert.match(nom.texte, /^Cotes relevées chez ESPN relevé aujourd'hui à 09:40$/);
  const quand = await chip(
    { source: 'Moteur CôteMaster', releveLe: iso(-3 * H), vieuxApresHeures: 1 },
    { quand: ({ ancien, ilYA }) => `Calculé à 07:00${ancien ? ` · ${ilYA}` : ''}` }
  );
  assert.ok(quand.html.includes('is-ancien'));
  assert.match(quand.texte, /^Moteur CôteMaster Calculé à 07:00 · il y a 3 h$/);
  // Une précision de plus au survol ; la ligne de pied de carte.
  assert.match(attribut((await chip({ source: 'ESPN', releveLe: iso(-20 * MIN), detail: 'Sur sept jours.' })).html, 'prov', 'title'), /Sur sept jours\.$/);
  assert.ok((await chip({ source: 'ESPN', releveLe: iso(-20 * MIN), variante: 'ligne' })).html.includes('prov--ligne'));
  // « Jamais ancien » quand l'appelant le dit.
  assert.ok((await chip({ source: 'ESPN', releveLe: iso(-30 * JOUR), vieuxApresHeures: null })).html.includes('is-recent'));
  for (const r of [recent, ancien, sansHeure, sansSource]) assert.doesNotMatch(r.html, /is-accent|cm-positive|is-danger/);
});

test('HelpTip : un bouton « ? » accessible, la phrase toujours dans la page pour les lecteurs d\'écran, la bulle fermée au départ', options, async () => {
  const { rendre, composants, regles } = contexte;
  for (const [terme, { titre, phrase }] of Object.entries(regles.GUIDE_DE_LECTURE)) {
    const r = await rendre(composants.HelpTip, { terme });
    assert.deepEqual(r.avertissements, [], terme);
    assert.match(r.html, /<button[^>]*type="button"[^>]*class="helptip__btn"/);
    assert.equal(attribut(r.html, 'helptip__btn', 'aria-label'), `Qu'est-ce que « ${titre} » ?`);
    // Le bouton désigne la phrase, qui est dans la page et masquée à l'œil.
    const idPhrase = attribut(r.html, 'helptip__btn', 'aria-describedby');
    assert.ok(idPhrase, terme);
    const phraseCachee = new RegExp(`<span id="${idPhrase}" class="cm-visually-hidden" aria-hidden="true"[^>]*>([^<]*)</span>`).exec(r.html)?.[1];
    assert.equal(decoder(phraseCachee ?? ''), `${titre} : ${phrase}`);
    // Fermée : pas de bulle dans la page (elle se pose dans <body> à l'ouverture, côté navigateur).
    assert.ok(!r.html.includes('helptip__bulle'));
    assert.equal(r.texte.replace(/\?/, '').trim(), `${titre} : ${phrase}`);
  }
  // Une notion qui n'est pas au guide : ses propres mots.
  const perso = await rendre(composants.HelpTip, { titre: 'Marge', texte: 'La part que garde le bookmaker.' });
  assert.equal(attribut(perso.html, 'helptip__btn', 'aria-label'), "Qu'est-ce que « Marge » ?");
  assert.match(perso.texte, /Marge : La part que garde le bookmaker\./);
  // Ni terme connu ni texte : rien (pas de bulle vide), et le test des pages vérifie que tout terme posé existe.
  for (const props of [{}, { terme: 'inconnu' }]) {
    const rien = await rendre(composants.HelpTip, props);
    assert.ok(!rien.html.includes('helptip__btn'), JSON.stringify(props));
  }
});

// ------------------------------------------------ 2. la page Repérage

test('Repérage : un seul vert sur six matchs, la raison de chaque cote qui n\'en est pas une, rien de ce qui s\'affichait n\'a disparu', options, async () => {
  scenario = {};
  appels.length = 0;
  const { rendre, composants } = contexte;
  const r = await rendre(composants.ScreenerView);
  assert.deepEqual(r.avertissements, [], 'avertissements de Vue');
  // Les six matchs, chacun avec sa date et son heure (ou « heure à confirmer »)…
  assert.match(r.texte, /6 matchs 7 prochains jours/);
  for (const [nom, quand] of [
    ['Arsenal – Chelsea', 'mar. 06/10 · 13:20'],
    ['Lyon – Nice', 'mer. 07/10 · 13:00'],
    ['Real Madrid – Betis', 'jeu. 08/10 · 10:00'],
    ['Ajax – PSV', 'mar. 06/10 · 15:00'],
    ['Porto – Benfica', 'jeu. 08/10 heure à confirmer'],
    ['Milan – Inter', 'mer. 07/10 · 12:00']
  ]) {
    assert.ok(r.texte.includes(nom), nom);
    assert.ok(r.texte.includes(quand), `${nom} : ${quand}`);
  }
  // … et, dans le bandeau, le compte à rebours du prochain coup d'envoi (une heure exacte seulement : jamais celle d'un match du calendrier).
  assert.match(r.texte, /Prochain match Arsenal – Chelsea dans 3 h 20/);
  assert.equal(compter(r.html, /kcount is-avant kcount--texte/g), 1);
  assert.doesNotMatch(r.texte, /Prochain match Porto/);
  // LE vert : une seule pastille, celle d'Arsenal – Chelsea (William Hill, +19,6 %).
  assert.equal(compter(r.html, /is-value/g), 1);
  const rangees = r.html.split(/<tr\b/).slice(2);
  const ligneDe = (nom) => rangees.find((x) => x.includes(nom));
  assert.ok(ligneDe('Arsenal').includes('is-value'));
  assert.match(texteDe(ligneDe('Arsenal')), /2\.30 William Hill valeur \+19,6 %/);
  assert.ok(ligneDe('Arsenal').includes('Value : avantage de +19,6 %'));
  assert.match(decoder(ligneDe('Arsenal')), /le moteur l'écarte alors\) : la page du match le vérifie\./, "le Repérage dit ce qu'il ne voit pas (le bookmaker qui a fixé la cote juste)");
  // Les autres : dites, jamais vertes.
  assert.ok(ligneDe('Lyon').includes('is-trop-beau'));
  assert.match(texteDe(ligneDe('Lyon')), /valeur \+31,0 % trop beau pour être vrai/);
  assert.ok(ligneDe('Real Madrid').includes('is-cote-haute'));
  assert.match(texteDe(ligneDe('Real Madrid')), /6\.50 Coolbet valeur \+10,5 % cote trop haute/);
  assert.ok(ligneDe('Milan').includes('is-inconnue'));
  assert.match(texteDe(ligneDe('Milan')), /valeur : moteur absent/);
  // Pas de cote chez vos bookmakers : la raison, pas de pastille.
  assert.match(texteDe(ligneDe('Ajax')), /pas de relevé The Odds API/);
  assert.ok(!ligneDe('Ajax').includes('vbadge'));
  assert.match(texteDe(ligneDe('Porto')), /sans marché pas de relevé The Odds API/);
  assert.ok(!ligneDe('Porto').includes('vbadge'));
  // Le vert n'existe nulle part ailleurs sur la page : ni la couleur positive, ni l'accent.
  assert.doesNotMatch(r.html, /cm-positive|cm-negative|is-accent/);
  // L'écart moteur – marché garde son signe et son chiffre, sans couleur de verdict.
  assert.match(texteDe(ligneDe('Arsenal')), /\+5,0 pts/);
  assert.ok(ligneDe('Arsenal').includes('is-up'));
  // La confiance : pas mesurée, et la page le dit, avec sa bulle d'aide.
  assert.match(r.texte, /Confiance : pas encore mesurée \? Sûr \/ fragile : « Sûr » veut dire/);
  assert.equal(compter(r.html, /cgauge is-non-mesuree/g), 1);
  // Les trois bulles d'aide de la page : cote juste, value, sûr / fragile.
  const aides = [...r.html.matchAll(/class="helptip__btn"[^>]*aria-label="([^"]*)"|aria-label="([^"]*)"[^>]*class="helptip__btn"/g)].map((m) => decoder(m[1] ?? m[2]));
  assert.deepEqual(aides.sort(), ["Qu'est-ce que « Cote juste » ?", "Qu'est-ce que « Sûr / fragile » ?", "Qu'est-ce que « Value » ?"]);
  // D'où viennent les chiffres : le fournisseur réel et l'heure, colonne par colonne.
  assert.match(r.texte, /Moteur et saison Moteur CôteMaster · magasin FotMob et cotes relevées Calculé à 09:35 en 1 min 20 s/);
  assert.match(r.texte, /Marché ESPN, football-data\.co\.uk, Kalshi relevé aujourd'hui à 09:48/);
  assert.match(r.texte, /Cote jouable The Odds API relevé le 21\/09 à 18:35 · il y a 15 jours payant/);
  assert.equal(compter(r.html, /prov is-ancien/g), 1, 'le relevé payant de 15 jours est en ambre');
  assert.equal(compter(r.html, /prov is-recent/g), 2);
  assert.match(texteDe(r.html), /Le vert n'apparaît que pour une vraie value/);
  // Les appels : le calcul, les seuils du moteur, les sources — rien d'autre.
  assert.deepEqual(
    [...new Set(appels.map((u) => u.replace(/^https?:\/\/[^/]+/, '')))].sort(),
    ['/api/config', '/api/screener', '/api/sources']
  );
});

test('Repérage : seuils du moteur illisibles, aucun vert — la pastille dit « seuil inconnu » ; origines illisibles : la provenance le dit', options, async () => {
  scenario = { config: 'echec', origines: 'echec' };
  appels.length = 0;
  const { rendre, composants } = contexte;
  const r = await rendre(composants.ScreenerView);
  assert.deepEqual(r.avertissements, []);
  assert.equal(compter(r.html, /is-value/g), 0, 'sans les seuils du moteur, jamais de vert');
  assert.equal(compter(r.html, /is-seuil-inconnu/g), 3, 'Arsenal, Lyon, Real Madrid : une cote de chez vous, mais pas de seuil pour la juger');
  assert.match(r.texte, /\+19,6 % seuil inconnu/);
  // Les chiffres, eux, sont toujours là.
  assert.match(r.texte, /2\.30 William Hill valeur \+19,6 %/);
  // Sans /api/sources : la liste des sources que l'appli sait lire, et « heure du relevé inconnue » — jamais une date inventée.
  assert.match(r.texte, /Marché ESPN, football-data\.co\.uk, 365Scores, Kalshi, Smarkets heure du relevé inconnue/);
  assert.match(r.texte, /Cote jouable The Odds API heure du relevé inconnue payant/);
  assert.equal(compter(r.html, /prov is-sans-heure/g), 2);
});

test('Repérage : aucune cote gratuite en base — la pastille du marché est remplacée par ce constat, dit', options, async () => {
  scenario = { origines: 'sans-cotes-gratuites' };
  const { rendre, composants } = contexte;
  const r = await rendre(composants.ScreenerView);
  assert.deepEqual(r.avertissements, []);
  assert.match(r.texte, /Marché Aucune cote gratuite relevée sur ce PC/);
  assert.equal(compter(r.html, /prov is-ancien/g), 1, 'le relevé payant reste affiché');
  assert.equal(compter(r.html, /is-value/g), 1);
});

// ---------------------------------------------- 3. la page Chutes de cotes

test('Chutes de cotes : la flèche de mouvement et le compte à rebours, jamais de vert, la provenance de chaque rencontre ; les chiffres d\'avant sont tous là', options, async () => {
  scenario = {};
  appels.length = 0;
  const { rendre, composants } = contexte;
  const r = await rendre(composants.DroppingOddsView);
  assert.deepEqual(r.avertissements, []);
  // Les chiffres de la page, comme avant.
  assert.match(r.texte, /2 rencontres ESPN, 365Scores, Kalshi Calculé à 09:57/);
  assert.match(r.texte, /Arsenal gagne Résultat 2\.27 2\.00 −12,0 %/);
  assert.match(r.texte, /DraftKings · ESPN 2\.30 → 2\.00/);
  assert.match(r.texte, /Kalshi · bourse 44 % → 51 % 15 000 \$ échangés hors moyenne/);
  assert.match(r.texte, /Plus de 2,5 buts Total de buts 2\.00 1\.89 −5,7 %/);
  assert.match(r.texte, /1 bookmaker sur 2 va dans ce sens/);
  assert.match(r.texte, /Bet365 · 365Scores 1\.90 → 1\.95 sens inverse/);
  // La flèche : la chute principale de chaque issue, lisible sans couleur (phrase, flèche qui descend, signe).
  const principales = [...r.html.matchAll(/class="omove is-baisse omove--lg"[^>]*aria-label="([^"]*)"/g)].map((m) => decoder(m[1]));
  assert.deepEqual(principales, ['Cote juste en baisse de 12,0 %.', 'Cote juste en baisse de 5,7 %.', 'Cote juste en baisse de 10,7 %.']);
  // La plus forte chute de chaque rencontre, en tête de sa carte : la même flèche, jamais la couleur de la section.
  const resumes = [...r.html.matchAll(/class="omove is-baisse omove--md"[^>]*aria-label="([^"]*)"/g)].map((m) => decoder(m[1]));
  assert.deepEqual(resumes, ['Cote juste en baisse de 12,0 %.', 'Cote juste en baisse de 10,7 %.']);
  // Une flèche de sens devant les deux cotes de chaque bookmaker qui en publie : baisse, baisse, hausse, baisse, hausse, baisse.
  const sens = [...r.html.matchAll(/class="omove is-(baisse|hausse) omove--sm"/g)].map((m) => m[1]);
  assert.deepEqual(sens, ['baisse', 'baisse', 'baisse', 'hausse', 'baisse']);
  // Jamais de vert, nulle part (l'accord de tous les bookmakers passe en bleu).
  assert.doesNotMatch(r.html, /is-accent|cm-positive|cm-negative/);
  assert.match(r.html, /class="is-info cm-chip" title="Les 3 bookmakers mesurés vont tous dans le même sens/);
  // Le compte à rebours : l'heure connue, puis le jour seul d'un match sans heure.
  assert.match(r.texte, /Premier League dans 3 h 20/);
  assert.match(r.texte, /Primeira Liga dans 2 jours heure à confirmer/);
  // La provenance de chaque rencontre : ses sources, avec leurs mots, et l'heure du dernier relevé ; ancien : dit.
  assert.match(r.texte, /Cotes relevées chez ESPN, 365Scores, Kalshi dernier relevé aujourd'hui à 09:20/);
  assert.match(r.texte, /Cotes relevées chez 365Scores dernier relevé hier à 04:00 Lecture/);
  assert.equal(compter(r.html, /prov is-recent prov--ligne/g), 1);
  assert.equal(compter(r.html, /prov is-ancien prov--ligne/g), 1);
  // La bulle d'aide de la cote juste.
  assert.match(r.texte, /Cote juste \? Cote juste : C'est la cote sans la marge du bookmaker/);
  assert.deepEqual([...new Set(appels.map((u) => u.replace(/^https?:\/\/[^/]+/, '')))], ['/api/odds/dropping?days=3&minDrop=5']);
});

// ----------------------------------------- 4. compositions, clôture, séries

test("AiLineupSnapshot : l'état de la composition à côté de sa source, dans les trois cas", options, async () => {
  const { rendre, composants } = contexte;
  const officielle = await rendre(composants.AiLineupSnapshot, { snapshot: D.compositionFotMob(45) });
  assert.deepEqual(officielle.avertissements, []);
  assert.match(officielle.texte, /Compositions FotMob relevées .* 45 min avant le coup d'envoi Compo officielle/);
  assert.ok(officielle.html.includes('is-officielle'));
  const probable = await rendre(composants.AiLineupSnapshot, { snapshot: D.compositionFotMob(600) });
  assert.match(probable.texte, /600 min avant le coup d'envoi Compo probable/);
  const derniere = await rendre(composants.AiLineupSnapshot, { snapshot: D.derniereComposition() });
  assert.deepEqual(derniere.avertissements, []);
  assert.match(derniere.texte, /Dernière alignée Composition du match pas encore publiée : voici la dernière composition alignée par chaque équipe/);
  assert.ok(derniere.html.includes('is-derniere'));
  // Tout ce que la composition montrait avant est toujours là.
  for (const r of [officielle, derniere]) {
    assert.match(r.texte, /Arsenal 4-3-3/);
    assert.match(r.texte, /Chelsea 4-3-3/);
    assert.match(r.texte, /Ars Gardien/);
  }
  assert.match(derniere.texte, /Dernier match .*Arsenal 2-0 Everton/);
});

test('valeur de clôture et coupe-circuit : leur bulle d\'aide est posée, le reste de la carte n\'a rien perdu', options, async () => {
  scenario = {};
  const { rendre, composants } = contexte;
  const cloture = await rendre(composants.ClosingValuePanel, { scope: 'predictions' });
  assert.deepEqual(cloture.avertissements, []);
  assert.match(cloture.texte, /Valeur de clôture Le marché a-t-il donné raison au moteur \?/);
  assert.equal(attribut(cloture.html, 'helptip__btn', 'aria-label'), "Qu'est-ce que « Valeur de clôture » ?");
  assert.match(cloture.texte, /Valeur de clôture : Elle compare la cote au moment du choix à la dernière cote avant le coup d'envoi/);
  assert.match(cloture.texte, /Recalculer/);
  for (const actif of [false, true]) {
    const risque = await rendre(composants.RiskControlPanel, { circuitBreakerActive: actif });
    assert.deepEqual(risque.avertissements, []);
    assert.equal(attribut(risque.html, 'helptip__btn', 'aria-label'), "Qu'est-ce que « Séries de pertes normales » ?");
    assert.match(risque.texte, actif ? /Mises suspendues/ : /Mises autorisées/);
    assert.match(risque.texte, /Perdre plusieurs paris d'affilée est normal/);
    assert.match(risque.texte, /Coupe-circuit manuel/);
    assert.match(risque.texte, /Réinitialiser l'état de risque/);
  }
});

// -------------------------------------------------------- 5. hygiène

const COMPOSANTS_PARIS = ['ValueBadge', 'ConfidenceGauge', 'OddsMoveArrow', 'LineupStateBadge', 'KickoffCountdown', 'ProvenanceChip', 'HelpTip'];
const styleDe = (nom) => {
  const source = fs.readFileSync(path.join(UI, 'src', 'components', 'common', `${nom}.vue`), 'utf8');
  return [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
};

test('les sept composants : aucune couleur en dur, aucun !important, aucune police sous 10 px — uniquement les jetons de tokens.css', options, () => {
  for (const nom of COMPOSANTS_PARIS) {
    const css = styleDe(nom);
    assert.ok(css.length > 200, `${nom} : un style`);
    const sansCommentaires = css.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(sansCommentaires, /#[0-9a-fA-F]{3,8}\b/, `${nom} : une couleur hexadécimale en dur`);
    assert.doesNotMatch(sansCommentaires, /\brgba?\(\s*\d/, `${nom} : une couleur rgb en dur`);
    assert.doesNotMatch(sansCommentaires, /!important/, `${nom} : !important`);
    for (const [, taille] of sansCommentaires.matchAll(/font-size:\s*([\d.]+)px/g)) assert.ok(Number(taille) >= 10, `${nom} : police de ${taille}px`);
    // Les jetons employés existent bien dans tokens.css.
    const tokens = fs.readFileSync(path.join(UI, 'src', 'assets', 'styles', 'tokens.css'), 'utf8');
    for (const [, jeton] of sansCommentaires.matchAll(/var\((--cm-[a-z0-9-]+)/g)) {
      assert.ok(tokens.includes(`${jeton}:`), `${nom} : le jeton ${jeton} n'existe pas dans tokens.css`);
    }
  }
});

test('le vert (--cm-accent) : dans la pastille de value et nulle part ailleurs parmi les sept composants, et là seulement pour la classe « value »', options, () => {
  for (const nom of COMPOSANTS_PARIS.filter((n) => n !== 'ValueBadge')) {
    assert.doesNotMatch(styleDe(nom), /--cm-accent|--cm-section|cm-positive/, `${nom} : du vert (ou la couleur de la section) qui ne dit pas « value »`);
  }
  // Le rouge : seulement le « en cours » du compte à rebours.
  for (const nom of COMPOSANTS_PARIS.filter((n) => n !== 'KickoffCountdown')) assert.doesNotMatch(styleDe(nom), /--cm-danger/, `${nom} : du rouge`);
  // Dans ValueBadge : chaque règle qui emploie le vert est celle de « .is-value ».
  const css = styleDe('ValueBadge').replace(/\/\*[\s\S]*?\*\//g, '');
  const regles = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selecteur: m[1].trim(), corps: m[2] }));
  const vertes = regles.filter((x) => /--cm-accent/.test(x.corps));
  assert.ok(vertes.length >= 1);
  for (const x of vertes) assert.match(x.selecteur, /\.vbadge\.is-value$/, `règle verte hors « .is-value » : ${x.selecteur}`);
  // La carte du Repérage et celle des chutes : plus de vert pour un écart ni une chute.
  for (const fichier of ['ScreenerView.vue', 'DroppingOddsView.vue']) {
    const source = fs.readFileSync(path.join(UI, 'src', 'views', fichier), 'utf8');
    const style = source.slice(source.indexOf('<style'));
    assert.doesNotMatch(style, /--cm-accent|cm-positive/, `${fichier} : du vert dans son style`);
  }
});

test("HelpTip : le clic ne remonte pas (un en-tête de colonne triable ne se déclenche pas) et la souris ne lui donne pas le focus", options, () => {
  // Un rendu côté serveur ne voit pas les événements : on garde ici les deux modificateurs qui les règlent. Le comportement
  // lui-même (Tab, Échap, survol, clic, bords de l'écran, tri non déclenché) a été essayé dans Chrome le 06/10/2026.
  const source = fs.readFileSync(path.join(UI, 'src', 'components', 'common', 'HelpTip.vue'), 'utf8');
  assert.match(source, /@click\.stop\.prevent="evenement\('clic'\)"/);
  assert.match(source, /@mousedown\.prevent/);
  assert.match(source, /@keydown\.esc="echapSurLeBouton"/);
  assert.match(source, /<Teleport to="body">/, 'la bulle se pose dans <body> : un tableau qui défile ne la coupe pas');
});

test("aucun appel hors liste pendant ces rendus : ni API payante, ni FotMob, ni Claude, ni la vraie appli — et aucun avertissement de Vue", options, () => {
  assert.deepEqual(interdits, [], 'appels refusés');
  assert.deepEqual(avertissements, [], 'avertissements de Vue');
  assert.ok(totalAppels >= 6, `des appels ont bien été simulés (${totalAppels})`);
});
