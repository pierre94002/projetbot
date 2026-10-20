/**
 * Les écrans de l'étape 7 SE RENDENT (cotes de vos bookmakers : fraîches, archivées, saisies).
 *   node --test test/cotesVosBookmakersEcran.test.mjs        (depuis server/)
 *
 * Un rendu côté serveur (sans navigateur ni serveur de développement), comme
 * langageParisEcran.test.mjs : la pastille de value « à rafraîchir », la saisie
 * express (ManualOddsEntry), le conseil de relevé (PaidOddsAdvicePanel, complet et
 * court), la note « value » du pronostic du résultat (ResultPredictionCard).
 *
 * Aucun réseau ni fichier de l'appli : fetch est REMPLACÉ (trois routes de l'étape 7
 * permises, tout le reste refusé et compté), les réponses sont FABRIQUÉES avec les
 * vraies règles du serveur (fraicheurCote, conseilDeReleve), un serveur Vite en mode
 * « middleware » n'écoute sur aucun port, son cache va dans le dossier d'essais
 * (effacé ensuite), rien n'est écrit dans ui/. L'horloge de l'appli est figée au
 * 5 octobre 2026, 14 h (heure LOCALE : les « aujourd'hui à … » ne dépendent pas du
 * fuseau de la machine). Seule bidouille : dans le rendu, `onMounted` devient
 * `onServerPrefetch` pour que le rendu attende le chargement.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SERVEUR, RACINE_ESSAIS } from './aides/isolement.mjs';
import { fraicheurCote } from '../src/core/engine/fraicheurCotes.js';
import { conseilDeReleve } from '../src/data/conseilReleve.js';
import { MARCHES_SAISIE, SENS, TITRES_BOOKMAKERS } from '../src/data/saisiesCotes.js';

const UI = path.resolve(SERVEUR, '..', 'ui');
const pret = ['vite', '@vitejs/plugin-vue', 'vue', 'pinia', 'vue-router'].every((p) => fs.existsSync(path.join(UI, 'node_modules', p)));
const imp = (chemin) => import(pathToFileURL(chemin).href);
const options = { skip: pret ? false : 'ui/node_modules (vite, plugin-vue, vue, pinia, vue-router) manque' };

const MAINTENANT = new Date(2026, 9, 5, 14, 0, 0).getTime();
const MIN = 60_000;
const H = 3_600_000;
const iso = (decalage) => new Date(MAINTENANT + decalage).toISOString();
const REGLE = { min: 2, max: 25, coteMax: 5 };
const REGLAGE = { maxAgeMinutes: 180, avantCompos: true };
const COUP = iso(29 * H);
const fraicheur = (releveAt, maintenant = MAINTENANT) => fraicheurCote({ releveAt, maintenant, coupDEnvoi: COUP, heureSure: true, reglage: REGLAGE });

// ---------------------------------------------------- les réponses fabriquées

const saisie = (extra) => ({
  bookmaker: 'williamhill',
  marketId: 'totalCorners',
  sens: 'over',
  equipe: null,
  joueur: null,
  ligne: 9.5,
  bookmakerTitre: 'William Hill',
  marche: 'Total corners',
  versions: 1,
  corrigee: false,
  coteAvant: null,
  enAttente: false,
  provenance: 'Saisie à la main dans CôteMaster (page du match)',
  jouable: true,
  regle: REGLE,
  ...extra,
  premiereSaisieA: extra.premiereSaisieA ?? extra.releveAt,
  fraicheur: fraicheur(extra.releveAt)
});

/** L'état des saisies d'un match : cinq cas que l'écran doit savoir dire, et une saisie retirée. */
export function etatSaisies() {
  return {
    genereLe: iso(0),
    match: { matchId: 'essai-city-liverpool', home: 'Man City', away: 'Liverpool', league: 'EPL', coupDEnvoi: COUP, heureSure: true, cleArchive: 'fotmob:fotmob-8456|fotmob-8650|2026-10-06' },
    saisies: [
      // Une vraie value, corrigée une fois : verte.
      saisie({ cle: 'williamhill|corners|over|9.5', libelle: 'Plus de 9,5 corners', cote: 2.25, releveAt: iso(-10 * MIN), premiereSaisieA: iso(-70 * MIN), versions: 2, corrigee: true, coteAvant: 2.1, moteur: { probabilite: 1 / 1.85, coteJuste: 1.85, origine: 'corners attendus par le moteur (binomiale négative mesurée)', raison: null }, pourcent: 21.62, verdict: 'value' }),
      // Une value saisie il y a quatre heures : à rafraîchir.
      saisie({ cle: 'betsson|btts|yes|0', bookmaker: 'betsson', bookmakerTitre: 'Betsson', marketId: 'bothTeamsScore', sens: 'yes', ligne: null, marche: 'Les 2 équipes marquent', libelle: 'Les 2 équipes marquent : Oui', cote: 1.8, releveAt: iso(-4 * H), moteur: { probabilite: 0.6, coteJuste: 1.67, origine: 'modèle de buts du moteur', raison: null }, pourcent: 8, verdict: 'a-rafraichir' }),
      // Les cartons : gardée sans value.
      saisie({ cle: 'tipico_de|cards|over|4.5', bookmaker: 'tipico_de', bookmakerTitre: 'Tipico (DE)', marketId: 'totalCards', ligne: 4.5, marche: 'Total cartons', libelle: 'Plus de 4,5 cartons', cote: 1.9, releveAt: iso(-20 * MIN), moteur: { probabilite: null, coteJuste: null, origine: null, raison: 'Le moteur ne calcule pas encore les cartons (étape 33 du plan) : la cote est gardée avec son heure, sans value.' }, pourcent: null, verdict: 'inconnue' }),
      // Sous le seuil, et en attente d'écriture (un import tient la base).
      saisie({ cle: 'nordicbet|team_corners|home_over|4.5', bookmaker: 'nordicbet', bookmakerTitre: 'Nordic Bet', marketId: 'teamCorners', equipe: 'home', ligne: 4.5, marche: 'Corners d’une équipe', libelle: 'Man City — Plus de 4,5 corners', cote: 1.9, releveAt: iso(-2 * MIN), enAttente: true, moteur: { probabilite: 0.533, coteJuste: 1.88, origine: 'corners attendus par le moteur (binomiale négative mesurée)', raison: null }, pourcent: 1.27, verdict: 'sous-seuil' })
    ],
    retirees: [{ cle: 'unibet_nl|ou|over|2.5', bookmaker: 'unibet_nl', marketId: 'totalGoals', sens: 'over', equipe: null, joueur: null, ligne: 2.5, bookmakerTitre: 'Unibet (NL)', libelle: 'Plus de 2,5 buts', retireeA: iso(-30 * MIN), enAttente: false }],
    bookmakers: Object.entries(TITRES_BOOKMAKERS).map(([cle, titre]) => ({ cle, titre })),
    marches: MARCHES_SAISIE.map((m) => ({ id: m.id, libelle: m.libelle, sens: m.sens.map((x) => ({ valeur: x, libelle: m.joueur ? 'marque' : SENS[x] })), ligne: m.ligne, equipe: m.equipe, joueur: m.joueur, unite: m.unite, avecMoteur: Boolean(m.moteur), sansMoteur: m.sansMoteur })),
    regle: REGLE,
    reglage: { ...REGLAGE, source: 'defaut' },
    moteur: { disponible: true, raison: null },
    provenance: 'Saisie à la main dans CôteMaster (page du match)'
  };
}

const BILAN = { source: 'enregistre', fichier: 'C:\\essai\\releve-payant.json', bilan: { at: iso(-26 * H), quota: { restants: 378, utilises: 122 }, cout: 18, matchsParCle: { soccer_epl: 10 } } };
const proche = (extra) => ({ matchId: 'm', home: 'Man City', away: 'Liverpool', league: 'EPL', coupDEnvoi: iso(40 * MIN), heureSure: true, vosCotes: true, releveAt: iso(-5 * H), compos: { publiee: true, lueA: iso(-15 * MIN) }, ...extra });
/** Le conseil, fabriqué par la VRAIE règle du serveur (conseilReleve.js). */
const CONSEILS = {
  maintenant: () => conseilDeReleve({ maintenant: MAINTENANT, matchs: [proche(), proche({ matchId: 'm2', home: 'Arsenal', away: 'Chelsea', vosCotes: false, compos: null })], reglage: REGLAGE, dernierReleve: BILAN }),
  plusTard: () => conseilDeReleve({ maintenant: MAINTENANT, matchs: [proche({ coupDEnvoi: iso(5 * H), releveAt: iso(-30 * MIN), compos: null })], reglage: REGLAGE, dernierReleve: BILAN }),
  inconnus: () => conseilDeReleve({ maintenant: MAINTENANT, matchs: [proche()], reglage: REGLAGE, dernierReleve: { source: 'absent', fichier: 'C:\\essai\\releve-payant.json', bilan: null } })
};
const REGLAGE_LU = { reglage: REGLAGE, source: 'enregistre', fichier: 'C:\\essai\\fraicheur-cotes.json', enregistreLe: iso(-H), defaut: REGLAGE, bornes: { min: 15, max: 1440 }, composAnnonceesMinutes: 60 };

// ------------------------------------------------------------------ le rendu

/** Les seules routes que ces écrans ont le droit d'appeler (le reste est refusé et compté). */
const AUTORISES = [/\/api\/odds\/saisies\?matchId=/, /\/api\/odds\/conseil-releve$/, /\/api\/odds\/fraicheur$/];
let scenario = {};
const appels = [];
const interdits = [];
const avertissements = [];
let contexte;
let fetchOrigine;
let consoleWarnOrigine;
let setIntervalOrigine;

const reponseJson = (corps, statut = 200) => ({ ok: statut < 400, status: statut, headers: { get: () => 'application/json' }, json: async () => JSON.parse(JSON.stringify(corps)) });

before(async () => {
  if (!pret) return;
  fetchOrigine = globalThis.fetch;
  consoleWarnOrigine = console.warn;
  setIntervalOrigine = globalThis.setInterval;
  globalThis.setInterval = (fn, ms) => {
    const minuteur = setIntervalOrigine(fn, ms);
    minuteur.unref?.();
    return minuteur;
  };
  globalThis.fetch = async (url) => {
    const u = String(url);
    appels.push(u);
    if (!AUTORISES.some((motif) => motif.test(u))) {
      interdits.push(u);
      return reponseJson({ error: `fetch interdit dans ce rendu : ${u}` }, 599);
    }
    if (/\/api\/odds\/saisies/.test(u)) return scenario.saisies === 'echec' ? reponseJson({ error: 'Match introuvable : essai' }, 404) : reponseJson(etatSaisies());
    if (/\/api\/odds\/conseil-releve$/.test(u)) return reponseJson(CONSEILS[scenario.conseil ?? 'maintenant']());
    if (/\/api\/odds\/fraicheur$/.test(u)) return reponseJson(REGLAGE_LU);
    return reponseJson({ error: 'inconnu' }, 404);
  };
  console.warn = (...a) => avertissements.push(a.map(String).join(' ').slice(0, 300));

  const { createServer } = await imp(path.join(UI, 'node_modules', 'vite', 'dist', 'node', 'index.js'));
  const vuePlugin = (await imp(path.join(UI, 'node_modules', '@vitejs', 'plugin-vue', 'dist', 'index.mjs'))).default;
  const { renderToString } = await imp(path.join(UI, 'node_modules', 'vue', 'server-renderer', 'index.mjs'));
  const { createSSRApp, h } = await imp(path.join(UI, 'node_modules', 'vue', 'index.mjs'));
  const { createPinia } = await imp(path.join(UI, 'node_modules', 'pinia', 'dist', 'pinia.mjs'));
  const { createRouter, createMemoryHistory } = await imp(path.join(UI, 'node_modules', 'vue-router', 'dist', 'vue-router.mjs'));
  const prefetch = {
    name: 'ssr-prefetch',
    enforce: 'pre',
    transform(code, id) {
      if (!/(ManualOddsEntry|PaidOddsAdvicePanel)\.vue$/.test(id) || id.includes('?')) return null;
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
  const charger = async (chemin) => (await vite.ssrLoadModule(chemin)).default;
  const routeur = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:chemin(.*)*', component: { render: () => null } }] });
  await routeur.push('/');
  await routeur.isReady();
  const horloge = await vite.ssrLoadModule('/src/utils/liveClock.js');
  contexte = {
    vite,
    cache,
    horloge,
    composants: {
      ValueBadge: await charger('/src/components/common/ValueBadge.vue'),
      ManualOddsEntry: await charger('/src/components/analysis/ManualOddsEntry.vue'),
      PaidOddsAdvicePanel: await charger('/src/components/settings/PaidOddsAdvicePanel.vue'),
      ResultPredictionCard: await charger('/src/components/analysis/ResultPredictionCard.vue')
    },
    /** Rend un composant : { html, texte, avertissements }. `heure` : l'horloge de l'appli (défaut : MAINTENANT). */
    async rendre(composant, props = {}, { heure = MAINTENANT } = {}) {
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
  globalThis.fetch = fetchOrigine;
  console.warn = consoleWarnOrigine;
  globalThis.setInterval = setIntervalOrigine;
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
const decoder = (valeur) => valeur.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const attribut = (html, classe, nom) => {
  const balise = new RegExp(`<[^>]*class="[^"]*\\b${classe}\\b[^"]*"[^>]*>`).exec(html)?.[0] ?? '';
  const valeur = new RegExp(`\\b${nom}="([^"]*)"`).exec(balise)?.[1];
  return valeur === undefined ? undefined : decoder(valeur);
};
/** Les pastilles de value d'un rendu, dans l'ordre : leur état. */
const etatsDesPastilles = (html) => [...html.matchAll(/class="vbadge is-([a-z-]+) /g)].map((m) => m[1]);

// --------------------------------------------------------- la pastille

test('ValueBadge : une value sur une cote fraîche est verte ; trop vieille, « à rafraîchir » en ambre, une horloge, la raison — jamais vert ; elle se périme d’elle-même quand l’heure tourne', options, async () => {
  const { rendre, composants } = contexte;
  const base = { pourcent: 19.6, jouable: true, cote: 2.3, regle: REGLE, bookmaker: 'William Hill' };
  const fraiche = await rendre(composants.ValueBadge, { ...base, fraicheur: fraicheur(iso(-20 * MIN)) });
  assert.deepEqual(fraiche.avertissements, []);
  assert.deepEqual(etatsDesPastilles(fraiche.html), ['value']);
  assert.match(fraiche.texte, /^Value \+19,6 %$/);
  const vieille = await rendre(composants.ValueBadge, { ...base, fraicheur: fraicheur(iso(-4 * H)) });
  assert.deepEqual(etatsDesPastilles(vieille.html), ['a-rafraichir']);
  assert.ok(!vieille.html.includes('is-value'), 'aucun vert');
  assert.match(vieille.texte, /^\+19,6 % à rafraîchir$/);
  assert.equal(attribut(vieille.html, 'vbadge', 'aria-label'), "Cote à rafraîchir : Relevée il y a 4 h, au-delà du délai de 3 h : à relever de nouveau avant de parier. Au dernier relevé, l'avantage était de +19,6 % : ce n'est pas une value tant que la cote n'est pas relevée de nouveau. Cote de William Hill.");
  assert.ok(vieille.html.includes('M12 6v6l4 2'), 'l’icône horloge (clock d’AppIcon)');
  // Fraîche quand le serveur l'a jugée, la page restée ouverte trois heures de plus : à rafraîchir sans rien recharger.
  const tard = await rendre(composants.ValueBadge, { ...base, fraicheur: fraicheur(iso(-20 * MIN)) }, { heure: MAINTENANT + 3 * H });
  assert.deepEqual(etatsDesPastilles(tard.html), ['a-rafraichir']);
  // Un instant donné par l'appelant prime sur l'horloge.
  assert.deepEqual(etatsDesPastilles((await rendre(composants.ValueBadge, { ...base, fraicheur: fraicheur(iso(-20 * MIN)), maintenant: MAINTENANT })).html), ['value']);
  // La référence et un bookmaker qui n'est pas à vous restent ce qu'ils étaient.
  assert.deepEqual(etatsDesPastilles((await rendre(composants.ValueBadge, { ...base, reference: true, fraicheur: fraicheur(iso(-4 * H)) })).html), ['reference']);
  assert.deepEqual(etatsDesPastilles((await rendre(composants.ValueBadge, { ...base, jouable: false, fraicheur: fraicheur(iso(-4 * H)) })).html), ['non-jouable']);
  // Sans valeur : « cote » et le mot.
  assert.match((await rendre(composants.ValueBadge, { jouable: true, cote: 1.9, regle: REGLE, fraicheur: fraicheur(iso(-5 * H)) })).texte, /^cote à rafraîchir$/);
});

// ------------------------------------------------------- la saisie express

test('ManualOddsEntry : le formulaire (vos bookmakers, les marchés, issue, ligne, cote), la règle du 1N2 dite, les bulles « value » et « à rafraîchir » — sans avertissement', options, async () => {
  scenario = {};
  const { rendre, composants } = contexte;
  const r = await rendre(composants.ManualOddsEntry, { matchId: 'essai-city-liverpool', home: 'Man City', away: 'Liverpool' });
  assert.deepEqual(r.avertissements, []);
  for (const libelle of ['Bookmaker', 'Marché', 'Issue', 'Ligne', 'Cote']) assert.ok(r.texte.includes(libelle), `champ « ${libelle} »`);
  assert.ok(!/Équipe|Buteur/.test(r.texte.split('Cotes saisies')[0]), 'le marché par défaut (Total corners) n’a ni équipe ni buteur');
  assert.match(r.texte, /William Hill/, 'le premier de vos bookmakers, déjà choisi');
  assert.match(r.texte, /Total corners/);
  assert.match(r.texte, /demi-ligne : 2,5 ; 9,5…/);
  assert.match(r.texte, /Le 1N2 se relève dans Réglages › Données\./);
  assert.match(r.texte, /Enregistrer la cote/);
  assert.match(r.texte, /Tapez la cote vue chez le bookmaker \(1,01 au moins\)\./, 'la cote manque : dit, et le bouton désactivé');
  assert.match(r.html, /<button[^>]*disabled[^>]*>(?:(?!<\/button>)[\s\S])*Enregistrer la cote/);
  const termes = [...decoder(r.html).matchAll(/aria-label="Qu'est-ce que « ([^»]+) » \?"/g)].map((m) => m[1].trim());
  assert.deepEqual(termes.slice(0, 2), ['Value', 'À rafraîchir']);
});

test('ManualOddsEntry : chaque cote saisie avec sa pastille — vraie value verte, saisie vieille « à rafraîchir », cartons sans value, sous le seuil ; le moteur, l’heure, « corrigée », « en attente » ; les retirées', options, async () => {
  scenario = {};
  const { rendre, composants } = contexte;
  const r = await rendre(composants.ManualOddsEntry, { matchId: 'essai-city-liverpool', home: 'Man City', away: 'Liverpool' });
  assert.deepEqual(etatsDesPastilles(r.html), ['value', 'a-rafraichir', 'inconnue', 'sous-seuil']);
  assert.equal(compter(r.html, /is-value/g), 1, 'un seul vert');
  const items = r.html.split('manual-odds__item').slice(1).map(texteDe);
  assert.match(items[0], /Plus de 9,5 corners William Hill · Total corners 2\.25 Value \+21,6 %/);
  assert.match(items[0], /Moteur : 54,1 % · cote juste 1\.85 \(corners attendus par le moteur \(binomiale négative mesurée\)\)\./);
  assert.match(items[0], /Saisie à la main saisie aujourd'hui à 13:50/);
  assert.match(items[0], /corrigée · avant 2\.10/);
  assert.match(items[0], /Corriger Retirer/);
  assert.match(items[1], /Les 2 équipes marquent : Oui Betsson · Les 2 équipes marquent 1\.80 \+8,0 % à rafraîchir/);
  assert.match(items[2], /Plus de 4,5 cartons Tipico \(DE\) · Total cartons 1\.90 valeur inconnue/);
  assert.match(items[2], /Le moteur ne calcule pas encore les cartons \(étape 33 du plan\)/);
  assert.match(items[3], /Man City — Plus de 4,5 corners Nordic Bet/);
  assert.match(items[3], /\+1,3 % sous le seuil/);
  assert.match(items[3], /en attente d'écriture/);
  // La précision d'une value : la probabilité vient d'un modèle, pas encore jugé sur l'historique.
  assert.match(decoder(r.html), /Probabilité : corners attendus par le moteur \(binomiale négative mesurée\)\. Une value sur ce marché n'a pas encore été vérifiée sur l'historique \(banc d'essai, étape 19 du plan\)\./);
  // La provenance au survol : saisie à la main, deux versions, archives.
  assert.match(decoder(r.html), /Saisie à la main dans CôteMaster — 2 versions, la première aujourd'hui à 12:50 ; gardée dans les archives des cotes \(source « saisie »\)\./);
  assert.match(r.texte, /Cotes saisies 4 en vigueur, la plus récente d'abord/);
  // (Le texte du rendu met une espace entre la balise de la dernière retirée et le point qui la suit.)
  assert.match(r.texte, /Retirées \(gardées dans les archives\) : « Plus de 2,5 buts » chez Unibet \(NL\), retirée aujourd'hui à 13:30 ?\./);
});

test('ManualOddsEntry : le serveur ne répond pas — la saisie le dit, jamais un formulaire vide qui ferait croire que tout va bien', options, async () => {
  scenario = { saisies: 'echec' };
  const { rendre, composants } = contexte;
  const r = await rendre(composants.ManualOddsEntry, { matchId: 'essai', home: 'A', away: 'B' });
  assert.deepEqual(r.avertissements, []);
  assert.match(r.texte, /Saisie indisponible Match introuvable : essai/);
  assert.ok(!r.texte.includes('Enregistrer la cote'));
  scenario = {};
});

// ----------------------------------------------------- le conseil de relevé

test('PaidOddsAdvicePanel (Réglages) : « relevé conseillé maintenant », les championnats et les matchs, les crédits en chiffres clés, « c’est vous qui cliquez », et le réglage de fraîcheur', options, async () => {
  scenario = { conseil: 'maintenant' };
  const { rendre, composants } = contexte;
  const r = await rendre(composants.PaidOddsAdvicePanel, {});
  assert.deepEqual(r.avertissements, []);
  assert.match(r.texte, /^Relevé conseillé maintenant Compositions annoncées pour 2 matchs \(EPL\), coup d'envoi d'ici/);
  assert.match(r.texte, /FotMob les a déjà publiées pour 1 match\./);
  assert.match(r.texte, /2 matchs · premier coup d'envoi .* · compositions publiées pour 1/);
  assert.match(r.texte, /Man City – Liverpool dans 40 min compositions publiées chez FotMob \(lues aujourd'hui à 13:45\) · vos cotes relevées aujourd'hui à 09:00 : à rafraîchir/);
  assert.match(r.texte, /Arsenal – Chelsea dans 40 min .* · pas encore de cote de vos bookmakers/);
  assert.match(r.texte, /Coût d'un relevé 37 crédits au plus \(37 compétitions, une requête chacune\)/);
  assert.match(r.texte, /Crédits restants 378 selon The Odds API, au relevé hier à 12:00 \(forfait de 500 par mois\)/);
  assert.match(r.texte, /Après ce relevé 341 au pire, soit 10 relevés complets possibles/);
  assert.match(r.texte, /Dernier relevé 18 crédits décomptés au relevé hier à 12:00/);
  assert.match(r.texte, /Le bouton relève les 37 compétitions suivies, une requête chacune \(1 région « eu » × 1 marché « h2h »\) : 37 crédits au plus par clic\./);
  assert.match(r.texte, /C'est vous qui cliquez Rien ne part tout seul : le relevé ne se fait que si vous cliquez « Actualiser »\. Le bouton : Réglages › Données › Cotes marché \(The Odds API\) › « Actualiser »\./);
  assert.match(r.texte, /Conseil calculé par CôteMaster calculé aujourd'hui à 14:00/);
  assert.ok(!/<button[^>]*>(?:(?!<\/button>)[\s\S])*Actualiser/.test(r.html), 'aucun bouton de relevé dans l’encart');
  // Le réglage : délai, règle des compositions, d'où il vient.
  assert.match(r.texte, /Fraîcheur de vos cotes \? À rafraîchir : .* au-delà, une value n'est plus montrée comme value : « à rafraîchir »/);
  assert.match(r.texte, /Plus vieille que 3 heures \(proposé\)/);
  assert.match(r.texte, /Relevée avant l'annonce des compositions/);
  assert.match(r.texte, /Réglage enregistré aujourd'hui à 13:00 dans C:\\essai\\fraicheur-cotes\.json\./);
  assert.ok(!r.html.includes('is-value') && !/--cm-accent/.test(r.html), 'aucun vert dans le conseil');
});

test('PaidOddsAdvicePanel : « vers 16 h 00 » quand les compositions ne sont pas encore annoncées ; crédits inconnus dits inconnus ; version courte pour la page du match', options, async () => {
  const { rendre, composants } = contexte;
  scenario = { conseil: 'plusTard' };
  const tard = await rendre(composants.PaidOddsAdvicePanel, {});
  assert.match(tard.texte, /^Relevé conseillé vers \d{2} h \d{2} Le bon moment : vers \d{2} h \d{2}, à l'annonce des compositions de 1 match \(EPL\), une heure avant le coup d'envoi\./);
  scenario = { conseil: 'inconnus' };
  const inconnus = await rendre(composants.PaidOddsAdvicePanel, {});
  assert.match(inconnus.texte, /Crédits restants inconnus inconnus : aucun relevé fait depuis la mise à jour \(le prochain les donnera\)/);
  assert.match(inconnus.texte, /Après ce relevé inconnu inconnu tant que les crédits restants ne le sont pas/);
  assert.match(inconnus.texte, /Dernier relevé aucun aucun relevé gardé/);
  scenario = { conseil: 'maintenant' };
  const lecturesDuReglage = () => appels.filter((u) => /\/api\/odds\/fraicheur$/.test(u)).length;
  const avantCourt = lecturesDuReglage();
  const court = await rendre(composants.PaidOddsAdvicePanel, { variante: 'compacte' });
  assert.equal(lecturesDuReglage(), avantCourt, 'la version courte ne lit pas le réglage');
  assert.deepEqual(court.avertissements, []);
  assert.match(court.texte, /^Relevé conseillé maintenant : 1 championnat, 37 crédits au plus, maintenant \(compositions publiées\)\. 378 crédits restants\. Bouton : Réglages › Données › Cotes marché \(The Odds API\) › « Actualiser » — rien ne part tout seul\. Réglages$/);
  assert.match(court.html, /<a [^>]*href="\/reglages"/);
  assert.ok(!court.texte.includes('Fraîcheur de vos cotes'), 'la version courte n’a pas le réglage');
  scenario = {};
});

// ------------------------------------- la note « value » du pronostic du résultat

const PREDICTION = { outcome: 'home', label: 'Man City gagne', confidence: 0.48, probabilities: { home: 0.48, draw: 0.27, away: 0.25 }, source: 'cotes', referenceBooks: ['Pinnacle'], reliability: null, doubleChance: null, bookmakersCount: 3 };
const LIMITES = { edgeThresholdMin: 0.02, edgeThresholdMax: 0.25, maxValueOdds: 5 };
const PARI = { outcome: 'home', label: 'Man City gagne', odds: 2.3, displayedOdds: 2.3, bookmaker: 'williamhill', bookmakerTitle: 'William Hill', fairOdds: 2.07, ev: 0.1111 };

test('ResultPredictionCard : une value fraîche dit l’heure de sa cote ; une value « à rafraîchir » (dite par le serveur, ou vieillie depuis) n’est jamais conseillée — note ambre, la raison', options, async () => {
  const { rendre, composants } = contexte;
  const resultat = (staking) => ({ result: { prediction: PREDICTION, staking, label: 'Man City vs Liverpool', league: 'EPL' } });
  const fraicheStaking = { action: 'RECOMMENDED', ...PARI, stake: 119.13, releveAt: iso(-H), origineReleve: 'archive', fraicheur: fraicheur(iso(-H)), candidates: [], limits: LIMITES };
  const fraiche = await rendre(composants.ResultPredictionCard, resultat(fraicheStaking));
  assert.deepEqual(fraiche.avertissements, []);
  // (« MC » : les initiales du logo du club, dessinées devant le pari quand l'image n'est pas chargée.)
  assert.match(fraiche.texte, /Pari value chez vos bookmakers (?:MC )?Man City gagne à 2\.30 chez William Hill\. Cote juste 2\.07, soit un avantage de 11,1 %\. Mise conseillée : 119,13 €\. Cote relevée aujourd'hui à 13:00\./);
  const serveur = await rendre(composants.ResultPredictionCard, resultat({ action: 'PASS', reason: 'a_rafraichir', stake: null, candidates: [], limits: LIMITES, aRafraichir: { ...PARI, releveAt: iso(-5 * H), fraicheur: fraicheur(iso(-5 * H)) } }));
  assert.match(serveur.texte, /Value à rafraîchir (?:MC )?« Man City gagne » à 2\.30 chez William Hill paierait au-dessus de la cote juste de 2\.07 \(avantage de 11,1 % au dernier relevé\), mais la cote est à rafraîchir : Relevée il y a 5 h, au-delà du délai de 3 h : à relever de nouveau avant de parier\. Relevez les cotes \(Réglages › Données\) avant de parier : aucun pari recommandé d'ici là\./);
  assert.ok(!serveur.html.includes('is-positif'), 'pas la note verte');
  const classeNote = /class="([^"]*\brpc__value\b[^"]*)"/.exec(serveur.html)?.[1] ?? '';
  assert.match(classeNote, /\bis-warning\b/, `la note en ambre (classe « ${classeNote} »)`);
  // Recommandée à l'analyse, la page restée ouverte deux heures de plus : à rafraîchir.
  const vieillie = await rendre(composants.ResultPredictionCard, resultat(fraicheStaking), { heure: MAINTENANT + 2 * H + MIN });
  assert.match(vieillie.texte, /Value à rafraîchir (?:MC )?« Man City gagne » à 2\.30 chez William Hill .*Relevée il y a 3 h 01, au-delà du délai de 3 h/);
  assert.ok(!vieillie.html.includes('is-positif'));
});

// --------------------------------------------------------------- hygiène

const lireUi = (...chemin) => fs.readFileSync(path.join(UI, 'src', ...chemin), 'utf8');
const styleDe = (source) => [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');

test('hygiène : la saisie et le conseil — aucune couleur en dur, aucun !important, aucune police sous 10 px, seulement les jetons de tokens.css, jamais le vert ; chaque icône existe', options, () => {
  const tokens = lireUi('assets', 'styles', 'tokens.css');
  const connues = new Set([...lireUi('components', 'common', 'AppIcon.vue').matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]));
  for (const fichier of [['components', 'analysis', 'ManualOddsEntry.vue'], ['components', 'settings', 'PaidOddsAdvicePanel.vue']]) {
    const source = lireUi(...fichier);
    const css = styleDe(source);
    const nom = fichier.join('/');
    assert.ok(css.length > 300, `${nom} : un style`);
    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, `${nom} : une couleur hexadécimale en dur`);
    assert.doesNotMatch(css, /\brgba?\(\s*\d/, `${nom} : une couleur rgb en dur`);
    assert.doesNotMatch(css, /!important/, `${nom} : !important`);
    assert.doesNotMatch(css, /--cm-accent|cm-positive/, `${nom} : du vert qui ne dit pas « value »`);
    for (const [, taille] of css.matchAll(/font-size:\s*([\d.]+)px/g)) assert.ok(Number(taille) >= 10, `${nom} : police de ${taille}px`);
    for (const [, jeton] of css.matchAll(/var\((--cm-[a-z0-9-]+)/g)) assert.ok(tokens.includes(`${jeton}:`), `${nom} : le jeton ${jeton} n'existe pas`);
    const icones = [...source.matchAll(/<AppIcon name="(\w+)"|name: '(\w+)'|: '(\w+)'(?=[,}])/g)].map((m) => m[1] ?? m[2] ?? m[3]).filter((x) => /^[a-z][a-zA-Z]+$/.test(x));
    for (const icone of [...source.matchAll(/<AppIcon name="(\w+)"/g)].map((m) => m[1])) assert.ok(connues.has(icone), `${nom} : l'icône « ${icone} »`);
    assert.ok(icones.length > 0);
  }
  // La pastille « à rafraîchir » : ambre, jamais le vert ; le vert reste la seule règle « .is-value ».
  const css = styleDe(lireUi('components', 'common', 'ValueBadge.vue'));
  const regles = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selecteur: m[1].trim(), corps: m[2] }));
  const rafraichir = regles.find((x) => x.selecteur === '.vbadge.is-a-rafraichir');
  assert.ok(rafraichir && /--cm-warning/.test(rafraichir.corps) && !/--cm-accent/.test(rafraichir.corps));
  for (const x of regles.filter((y) => /--cm-accent/.test(y.corps))) assert.match(x.selecteur, /\.vbadge\.is-value$/);
});

test('câblage : CHAQUE pastille de value de l’interface reçoit la fraîcheur de sa cote ; la page du match pose la saisie et la version courte du conseil ; Réglages, le conseil complet', options, () => {
  const fichiers = fs.readdirSync(path.join(UI, 'src'), { recursive: true }).filter((f) => f.endsWith('.vue'));
  let pastilles = 0;
  for (const f of fichiers) {
    const source = fs.readFileSync(path.join(UI, 'src', f), 'utf8');
    for (const m of source.matchAll(/<ValueBadge\b([\s\S]*?)\/?>/g)) {
      if (f.endsWith('ValueBadge.vue')) continue;
      pastilles++;
      assert.match(m[1], /:fraicheur="/, `${f} : une pastille de value sans sa fraîcheur`);
    }
  }
  assert.ok(pastilles >= 4, `${pastilles} pastilles posées (Repérage, page du match, saisie)`);
  const page = lireUi('views', 'UpcomingMatchView.vue');
  assert.match(page, /<ManualOddsEntry :match-id="match\.matchId" :home="match\.home" :away="match\.away" \/>/);
  assert.match(page, /<PaidOddsAdvicePanel variante="compacte" \/>/);
  assert.match(page, /<HelpTip terme="a-rafraichir" \/>/);
  assert.match(lireUi('views', 'SettingsView.vue'), /<PaidOddsAdvicePanel \/>/);
  assert.match(lireUi('views', 'ScreenerView.vue'), /:fraicheur="r\.fraicheur"/);
  assert.match(lireUi('views', 'MyBetsView.vue'), /valuesARafraichir/);
});

test('aucun appel hors liste pendant ces rendus : ni API payante, ni FotMob, ni Claude, ni la vraie appli — et aucun avertissement de Vue', options, () => {
  assert.deepEqual(interdits, [], 'appels refusés');
  assert.deepEqual(avertissements, [], 'avertissements de Vue');
  assert.ok(appels.length >= 6, `des appels ont bien été simulés (${appels.length})`);
});
