/**
 * Étape 28 du plan — B10 : LES ÉCRANS de la simulation complète (conception §5), rendus côté serveur, sans navigateur
 * ni serveur de développement — le patron de l'étape 27 (modeleDeButsEcran, pageMatchDecisionEcran) : `fetch` remplacé
 * (seules les routes données répondent, tout le reste est refusé et compté), routeur de l'appli remplacé par un faux,
 * horloge figée, cache de Vite dans le dossier d'essais, rien écrit dans ui/.
 *   node --test test/simulationEcrans.test.mjs        (depuis server/)
 *
 * Les réponses ne sont pas écrites à la main : le VRAI serveur les produit dans des copies isolées — un championnat
 * planté, ses nuits et les routes (aides/script-simulation-lecteurs.mjs), la page d'un match (aides/script-page-match.mjs).
 * Seules quelques cases sont posées à la main pour les extrêmes, leurs textes faits par le VRAI lecteur
 * (simulationRead.texteDeProbabilite).
 *   1. les règles des écrans (ui/src/utils/simulation.js), pures, sur les vraies réponses ;
 *   2. « Fin de saison » : « ≥ 90 % » et « ≤ 10 % », le gris « acquis sauf surprise », la loi nommée dans les trois cas
 *      (l'avertissement de la loi « table »), la mesure, l'ordre officiel, TeamCrest sur chaque ligne, favoris en or ;
 *      non calculée ; une scission (le lecteur, sur une base en mémoire) ;
 *   3. EnjeuBadge : bleu d'information, gris, gris pointillé — jamais vert ni rouge ; la phrase au survol et en aria-label ;
 *   4. « TOUT ÉTEINT » IDENTIQUE À L'AVANT : les classements, les cartes et la page du match — le serveur d'avant (aucune
 *      route de l'étape 28), la réponse « éteint », « éteint » avec des données présentes : le même HTML ; allumé, les
 *      ajouts paraissent (le contrôle positif) ;
 *   5. le déroulé simulé : « Information, pas un pronostic », l'écart mesuré au survol, les marchés écartés absents ;
 *   6. le ticket : le prix juste et son heure, la cote tapée en écart NEUTRE (jamais ValueBadge ni vert), « si les
 *      sélections étaient indépendantes » en gris, la précision, la provenance, éteint, « impossible », la mi-temps qui
 *      « se lit, ne se parie pas », un marché écarté refusé en mots ;
 *   7. Réglages : la porte 1 en mots, la dernière nuit, l'avancement, les deux interrupteurs ;
 *   8. hygiène : jetons, jamais de vert dans un écran de l'étape 28, AppSelect, termes du guide, câblage.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { preparerCopie, executer, SERVEUR, RACINE_ESSAIS } from './aides/isolement.mjs';
import { REGLAGES_MODELE_DE_BUTS } from './aides/modeleDeButsCommun.mjs';
import { reglesPures, texteDe, interfacePrete, optionsDuRendu, UI, espaces } from './aides/rendu.mjs';
import * as D from './aides/donneesPageMatch.mjs';
import * as SR from '../src/data/simulation/simulationRead.js';
import { ECARTS_MESURES_V } from '../src/data/simulation/reglages.js';
import { __testing as BASE } from '../src/data/db/matchStatsDb.js';

const imp = (chemin) => import(pathToFileURL(chemin).href);
const options = optionsDuRendu;
const S = interfacePrete ? await imp(path.join(UI, 'src', 'utils', 'simulation.js')) : null;
const K = interfacePrete ? await imp(path.join(UI, 'src', 'utils', 'ticket.js')) : null;
const lireUi = (...p) => fs.readFileSync(path.join(UI, 'src', ...p), 'utf8');
const compter = (texte, motif) => (texte.match(motif) ?? []).length;
const sansCommentaires = (html) => html.replace(/<!--[\s\S]*?-->/g, '');
const VERT = /is-accent|cm-positive|--cm-accent|vbadge|is-value/;
const M = '2026-10-05T01:00:00.000Z';

// ------------------------------------------------------------ les réponses du vrai serveur (une fois)

let memo = null;
/** Le script des lecteurs (le même que simulationLecteurs.test.mjs), dans une copie isolée : routes, nuits, écrans. */
function lecteurs() {
  if (memo) return memo;
  const copie = preparerCopie({ runtime: { 'engine-config.json': { football: { modeleDeButs: REGLAGES_MODELE_DE_BUTS } } } });
  try {
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    const r = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-simulation-lecteurs.mjs'), { timeout: 600_000, maintenant: M });
    assert.equal(r.code, 0, `script des lecteurs :\n${r.erreurs.slice(-4000)}`);
    assert.equal(r.reseau, false);
    memo = r.json;
    return memo;
  } finally {
    copie.nettoyer();
  }
}
const copie = (x) => JSON.parse(JSON.stringify(x));

/** La fin de saison planté avec des cases EXTRÊMES posées à la main, leurs textes faits par le vrai lecteur. */
function saisonAuxExtremes() {
  const s = copie(lecteurs().ecrans.saisonService);
  const clubs = s.tables[0].clubs;
  const poser = (club, famille, p, unanime = false) => {
    clubs[club].familles[famille] = { p, unanime, ...SR.texteDeProbabilite(p, { loi: 'forces', unanime }) };
  };
  poser(0, 'premiere', 0.97);
  poser(0, 'promotion', 0.93);
  poser(1, 'premiere', 0.9999);
  poser(2, 'premiere', 1, true);
  poser(19, 'relegation', 0.04);
  poser(18, 'relegation', 0.08);
  poser(17, 'premiere', 0, true);
  return s;
}

// ------------------------------------------------------------ le rendu

const appels = [];
const interdits = [];
const avertissements = [];
let routes = [];
let contexte;
let originaux = {};
const reponseJson = (corps, statut = 200) => ({ ok: statut < 400, status: statut, headers: { get: () => 'application/json' }, json: async () => JSON.parse(JSON.stringify(corps)) });
const ROUTE_ABSENTE = (u) => ({ code: 404, corps: { error: `Route introuvable : GET ${u.replace(/^https?:\/\/[^/]+/, '')}` } });

before(async () => {
  if (!interfacePrete) return;
  originaux = { fetch: globalThis.fetch, warn: console.warn, setInterval: globalThis.setInterval, setTimeout: globalThis.setTimeout };
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
    const methode = opts.method ?? 'GET';
    appels.push(`${methode} ${u}`);
    const r = routes.find(([motif, , meth]) => motif.test(u) && (meth ?? 'GET') === methode);
    if (!r) {
      interdits.push(`${methode} ${u}`);
      return reponseJson({ error: `fetch interdit dans ce rendu : ${u}` }, 599);
    }
    const x = typeof r[1] === 'function' ? r[1](u) : r[1];
    return reponseJson(x.corps, x.code ?? 200);
  };
  console.warn = (...a) => avertissements.push(a.map(String).join(' ').slice(0, 300));

  const { createServer } = await imp(path.join(UI, 'node_modules', 'vite', 'dist', 'node', 'index.js'));
  const vuePlugin = (await imp(path.join(UI, 'node_modules', '@vitejs', 'plugin-vue', 'dist', 'index.mjs'))).default;
  const { renderToString } = await imp(path.join(UI, 'node_modules', 'vue', 'server-renderer', 'index.mjs'));
  const { createSSRApp, h } = await imp(path.join(UI, 'node_modules', 'vue', 'index.mjs'));
  const { createPinia } = await imp(path.join(UI, 'node_modules', 'pinia', 'dist', 'pinia.mjs'));
  const { createRouter, createMemoryHistory } = await imp(path.join(UI, 'node_modules', 'vue-router', 'dist', 'vue-router.mjs'));
  // Le rendu attend les lectures : `onMounted` devient `onServerPrefetch` dans les écrans de l'étape 28 et la carte de
  // rencontre ; le classement attend sa table ; la page du match attend ses chargements (le patron de pageMatchDecisionEcran).
  const prefetch = {
    name: 'ssr-prefetch',
    enforce: 'pre',
    transform(code, id) {
      if (id.includes('?')) return null;
      let c = code;
      const remplacer = (a, b) => {
        assert.ok(c.includes(a), `${path.basename(id)} a changé : « ${a.slice(0, 70)} » introuvable`);
        c = c.replace(a, b);
      };
      if (/UpcomingMatchView\.vue$/.test(id)) {
        remplacer("import { computed, nextTick, ref, watch } from 'vue';", "import { computed, nextTick, ref, watch, onServerPrefetch } from 'vue';");
        remplacer('watch(() => props.matchId, load, { immediate: true });', 'onServerPrefetch(load);');
        c = c.replace(/\n {2}(charger\w+\(\));/g, '\n  await $1;').replace(/\n {2}(aiStore\.fetch\w+\([^)]*\)\.catch\(\(\) => \{\}\));/g, '\n  await $1;');
        return c;
      }
      if (!/(FinDeSaisonTable|LeagueStandingsPanel|EngineSimulationTrial|MatchCard)\.vue$/.test(id)) return null;
      c = c.replace(/import \{ ([^}]*)\bonMounted\b([^}]*)\} from 'vue';/, (m, a, b) => `import { ${a}onMounted, onServerPrefetch${b}} from 'vue';`).replace(/onMounted\(/g, 'onServerPrefetch(');
      if (/LeagueStandingsPanel\.vue$/.test(id)) remplacer('watch(\n  () => [props.league, props.season, props.currentSeason],', 'onServerPrefetch(charger);\nwatch(\n  () => [props.league, props.season, props.currentSeason],');
      return c;
    }
  };
  const ID_FAUX = '\0routeur-faux';
  const routeurFaux = {
    name: 'routeur-faux',
    enforce: 'pre',
    resolveId: (source) => (/(^@\/router\/index\.js$)|([\\/]src[\\/]router[\\/]index\.js$)/.test(source) ? ID_FAUX : null),
    load: (id) => (id === ID_FAUX ? 'export const router = { push: async () => null, resolve: () => ({ href: "/" }) };' : null)
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
  const favoris = await vite.ssrLoadModule('/src/stores/favoritesStore.js');
  contexte = {
    vite,
    cache,
    composants: {
      FinDeSaison: await charger('/src/components/matches/FinDeSaisonTable.vue'),
      Classement: await charger('/src/components/matches/LeagueStandingsPanel.vue'),
      Badge: await charger('/src/components/common/EnjeuBadge.vue'),
      Carte: await charger('/src/components/matches/MatchCard.vue'),
      Enjeu: await charger('/src/components/matches/EnjeuDuMatch.vue'),
      Deroule: await charger('/src/components/analysis/DerouleSimuleCard.vue'),
      Ticket: await charger('/src/components/betting/TicketDuPari.vue'),
      Reglages: await charger('/src/components/settings/EngineSimulationTrial.vue'),
      Actualisation: await charger('/src/components/settings/RefreshStatusPanel.vue'),
      Page: await charger('/src/views/UpcomingMatchView.vue')
    },
    /** Rend un composant : { html, texte, avertissements, appels }. `r` : les routes ; `favorites` : les équipes favorites. */
    async rendre(composant, props = {}, { r = [], heure = Date.parse(M), favorites = [] } = {}) {
      // Les logos demandés par nom (teamIds.js, un lot différé) : toujours répondus, quel que soit le rendu en cours.
      routes = [...r, [/\/api\/match-stats\/team-ids/, { corps: { results: [] } }, 'POST']];
      appels.length = 0;
      const avant = avertissements.length;
      horloge.liveNow.value = heure;
      const pinia = createPinia();
      const app = createSSRApp({ render: () => h(composant, props) });
      app.use(pinia);
      app.use(routeur);
      if (favorites.length) {
        const store = favoris.useFavoritesStore(pinia);
        store.$patch({ teams: favorites.map((x) => ({ aliases: [], addedAt: '2026-10-01T00:00:00.000Z', ...x })), leagues: [], loaded: true });
      }
      const html = (await renderToString(app)).replace(/ data-v-[a-z0-9]+(?==|\s|>)/g, '');
      const vide = /<path(?![^>]*\bd=)[^>]*>/.exec(html);
      assert.equal(vide, null, `une icône inconnue d'AppIcon (tracé vide) : ${vide?.[0]}`);
      return { html, texte: texteDe(html), avertissements: avertissements.slice(avant), appels: [...appels] };
    }
  };
});

after(async () => {
  if (!interfacePrete) return;
  globalThis.fetch = originaux.fetch;
  console.warn = originaux.warn;
  globalThis.setInterval = originaux.setInterval;
  globalThis.setTimeout = originaux.setTimeout;
  if (!contexte) return;
  await contexte.vite.close();
  fs.rmSync(contexte.cache, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

/** La route de la fin de saison d'un championnat, répondant `corps`. */
const routeSaison = (corps) => [/\/api\/simulation\/saison\?league=/, { corps }];

// ================================================================ 1. les règles

test('B10 les règles des écrans (ui/src/utils/simulation.js) sont PURES et disent les vraies réponses du serveur : fin de saison, enjeu, déroulé, prix juste, porte 1, interrupteurs', options, () => {
  const vus = reglesPures('simulation.js');
  assert.ok(vus.has('langageParis.js'));
  const s = lecteurs();
  // La fin de saison : l'ordre officiel, une colonne par famille présente, les textes du serveur.
  const f = S.finDeSaisonDite(s.ecrans.saisonService);
  assert.equal(f.etat, 'calcule');
  assert.deepEqual(f.tables[0].lignes.map((l) => l.rang), Array.from({ length: 20 }, (_, i) => i + 1), 'jamais réordonné');
  assert.deepEqual(f.tables[0].familles.map((x) => x.cle), s.ecrans.saisonService.tables[0].familles.map((x) => x.cle));
  assert.ok(f.tables[0].lignes.every((l) => /^fotmob-\d+$/.test(l.teamId)), 'un numéro FotMob pour chaque logo');
  assert.equal(f.loi.phrase, 'Loi : forces de buts du modèle de buts en service');
  assert.deepEqual(S.finDeSaisonDite(s.ecrans.saisonCoupe), { etat: 'non-calcule', titre: 'Fin de saison non calculée', raison: 'Pas de fin de saison pour une coupe.' });
  assert.equal(S.finDeSaisonDite({ calcule: false, raison: 'Fin de saison non calculée — 2 club(s) du calendrier non reconnu(s) : SC Paderborn, SV Elversberg — non calculé' }).raison, '2 club(s) du calendrier non reconnu(s) : SC Paderborn, SV Elversberg — non calculé');
  // L'enjeu : trois pastilles, aucune entre les deux seuils.
  const ligne = s.enjeux.corps.enjeux[0];
  assert.deepEqual(['gros-enjeu', 'sans-enjeu', 'enjeu'].map((categorie) => S.enjeuDit({ ...ligne, categorie })).map((x) => [x.visible, x.libelle, x.ton]), [[true, 'Gros enjeu', 'info'], [true, 'Sans enjeu', 'gris'], [false, null, null]]);
  const nc = S.enjeuDit({ calcule: false, libelle: 'Enjeu non calculé', raison: 'rencontre sans identifiants FotMob' });
  assert.deepEqual([nc.visible, nc.libelle, nc.ton, nc.titre], [true, 'Enjeu non calculé', 'pointille', 'Enjeu non calculé : rencontre sans identifiants FotMob.']);
  assert.equal(S.enjeuDit({ ...ligne, categorie: 'gros-enjeu' }).titre, `${ligne.phrase} Calculé la nuit du 05/10, refait chaque nuit jusqu’à la veille du match, puis gardé tel quel.`);
  // Quand (vérification du 27/10, constat 19) : une rencontre APRÈS le jour de sa nuit est refaite chaque nuit jusqu'à sa
  // veille ; la forme courte reste pour une rencontre du jour même de la nuit.
  assert.equal(SR.quandDeLEnjeu({ date: '2026-10-06', calcule_le: M }), 'calculé la nuit du 05/10, refait chaque nuit jusqu’à la veille du match, puis gardé tel quel');
  assert.equal(SR.quandDeLEnjeu({ date: '2026-10-05', calcule_le: M }), 'calculé la nuit du 05/10, gardé tel quel jusqu’au coup d’envoi');
  assert.equal(S.cleDEnjeu({ league: 'L', date: '2026-10-06', homeId: 'fotmob-990108', awayId: 990107 }), 'L|2026-10-06|990108|990107');
  assert.equal(S.cleDEnjeu({ league: 'L', date: '2026-10-06', homeId: 'Essai H', awayId: 990107 }), null, 'jamais un nom');
  // Le déroulé : 20 lignes en 4 groupes, jamais un marché écarté.
  const d = S.derouleDit(s.page.simulation.deroule, { home: 'Man City', away: 'Liverpool' });
  assert.equal(d.groupes.flatMap((g) => g.lignes).length, 20);
  assert.ok(!d.groupes.flatMap((g) => g.lignes).some((l) => ['deuxMiTemps05', 'rougeAuMoinsUn'].includes(l.cle)));
  assert.match(d.phrase, /^Information, pas un pronostic\./);
  const htFt6 = d.groupes.flatMap((g) => g.lignes).find((l) => l.cle === 'htFt6');
  assert.equal(htFt6.libelle, '2/1 — Liverpool mène à la pause, Man City gagne');
  assert.equal(htFt6.titre, `Écart au réel mesuré sur 17 818 matchs de juillet 2025 à septembre 2026, avec les cotes de clôture : annoncé 2,4 %, arrivé 2,9 % (−0,5 point). Le hasard du tirage seul vaut ± 0,5 point.`);
  assert.deepEqual(htFt6.jambe, { marketId: 'halfTimeFullTime', params: { ht: 'away', ft: 'home' } });
  // Le prix juste : son heure, la cote tapée en écart neutre, « si indépendantes », la précision, la provenance.
  const score = s.prix.score.corps;
  const pj = S.prixJusteDit(score, { cote: 4.2, bookmaker: 'Winamax' });
  assert.equal(pj.etat, 'prix');
  assert.equal(pj.prix, `Prix juste : ${(1 / score.probabilite).toFixed(2).replace('.', ',')} (${(100 * score.probabilite).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %) à 3 h 00`);
  const ecart = 4.2 * score.probabilite - 1;
  assert.equal(pj.ecart, `Chez Winamax (cote tapée) : 4,20, soit ${Math.round(Math.abs(ecart) * 100)} % ${ecart < 0 ? 'sous le' : 'au-dessus du'} prix juste`);
  assert.equal(pj.siIndependants, `si les sélections étaient indépendantes : ${(1 / score.siIndependants).toFixed(2).replace('.', ',')}`);
  assert.equal(pj.precision, S.PRECISION_DU_PRIX_JUSTE);
  assert.equal(pj.provenance, 'Calculé par le serveur : grille du moteur (modèle de buts unique) de 3 h 00, alignée sur le 1N2 affiché.');
  assert.deepEqual([S.prixJusteDit(s.prix.eteint.corps).etat, S.prixJusteDit(s.prix.contradictoires.corps).etat, S.prixJusteDit(s.prix.butsDeuxMiTemps.corps).etat, S.prixJusteDit(null).etat], ['eteint', 'impossible', 'refuse', 'attente']);
  assert.equal(S.prixJusteDit(s.prix.contradictoires.corps).phrase, 'ces sélections ne peuvent pas gagner ensemble');
  // La porte 1, en mots : réussie, la date, les combinés, les effets, les deux marchés écartés et pourquoi.
  const p = S.porte1Dite(s.ecrans.etat.porte1);
  assert.deepEqual([p.titre, p.date], ['Porte 1 réussie', 'le 27/10/2026']);
  assert.equal(p.lignes[1], 'Combinés : sur les 14 combinés essayés, la grille du moteur a mieux prévu que le produit des simples — 15,5 millièmes d’erreur de prévision en moins [14,5 ; 16,4], au-delà du hasard (retenu, 27 variantes comptées).');
  assert.equal(p.ecartesTitre, 'Deux marchés écartés, jamais montrés sur un match ni dans un combiné :');
  assert.deepEqual(p.ecartes, [
    '« un but dans chaque mi-temps » : annoncé 53,7 %, arrivé 54,7 % — même à score final connu, il annonçait 1,3 point de trop peu (règle : 1,0 point).',
    '« au moins un rouge » : annoncé 21,7 %, arrivé 18,0 % — il annonçait 3,6 points de trop (règle : 1,0 point).'
  ]);
  // Les interrupteurs : rangés et effectifs.
  const i = S.interrupteursDits(s.relus ? { affichage: s.relus.autreLancement.affichage, effectif: s.relus.autreLancement.effectif, conditions: { manques: ['x'], possible: false } } : null);
  assert.deepEqual([i.matchs.range, i.matchs.effectif], ['tout', 'eteint']);
  assert.match(i.matchs.pourquoi, /^Déroulé simulé et prix de combinés éteints/);
  assert.equal(S.avancementDit({ matchs: 312, joursEcoules: 9, horizon: { matchs: 800, jours: 21 } }), '312 matchs sur 800, 9 jours sur 21');
  // Jamais « 34 jours sur 21 » (constat 26) ; après le jugement principal, le rapport des 60 derniers jours (constat 16).
  assert.equal(S.avancementDit({ matchs: 0, joursEcoules: 34, horizon: { matchs: 800, jours: 21 } }), '0 match sur 800, 21 jours sur 21 (atteints)');
  assert.equal(S.avancementDit({ matchs: 21, joursEcoules: 21, horizon: { matchs: 800, jours: 21 } }), '21 matchs sur 800, 21 jours sur 21 (atteints)');
  assert.equal(S.avancementDit({ matchs: 1234, joursEcoules: 90, rapportJours: 60, horizon: { matchs: 800, jours: 21 } }), `jugement pris à l’horizon ; chiffres des 60 derniers jours : ${(1234).toLocaleString('fr-FR')} matchs comparés`);
  // La garde de sûreté, une INFORMATION de Réglages (constats 7 et 12) ; absente → rien.
  assert.equal(S.interrupteursDits({ conditions: { possible: true, manques: [], information: 'la garde de sûreté a éteint « x »' } }).garde, 'La garde de sûreté a éteint « x ».');
  assert.equal(S.interrupteursDits({ conditions: { possible: true, manques: [] } }).garde, null);
  // L'alerte durable des noms inconnus (constat 14) : une phrase, ou rien.
  assert.equal(S.nomsInconnusDits({ simulationSaisons: { inconnus: [{ league: 'Bundesliga - Germany', noms: ['SV Elversberg'] }], updatedAt: M } }), 'Fins de saison : 1 championnat bloqué par un nom du calendrier inconnu (Bundesliga - Germany) — le détail est dans Réglages › Versions du moteur.');
  assert.equal(S.nomsInconnusDits({ simulationSaisons: null }), null);
  assert.equal(S.nomsInconnusDits(null), null);
});

// ================================================================ 2. la fin de saison

test('B10 « Fin de saison » : « ≥ 90 % » et « ≤ 10 % » aux extrêmes (jamais 93 %, 97 %, « ≥ 95 % » ni « 100 % »), le gris « acquis sauf surprise », l’ordre officiel, TeamCrest sur CHAQUE ligne, un favori en or, une colonne par famille, la provenance avec l’heure, la mesure 2023-2026', options, async () => {
  const { rendre, composants } = contexte;
  const saison = saisonAuxExtremes();
  const r = await rendre(composants.FinDeSaison, { league: lecteurs().ecrans.ligue }, { r: [routeSaison(saison)], favorites: [{ name: 'Essai C', league: lecteurs().ecrans.ligue, id: 'fotmob-990103' }] });
  assert.deepEqual(r.avertissements, []);
  assert.deepEqual(interdits, []);
  const tableau = r.html.slice(r.html.indexOf('data-tableau="fin-de-saison"'));
  // Chaque ligne : sa classe (l'ordre des classes de Vue n'est pas garanti) et son contenu.
  const lignes = [...tableau.matchAll(/<tr class="([^"]*\bfds__ligne\b[^"]*)">([\s\S]*?)<\/tr>/g)].map((m) => ({ classe: m[1], html: m[2] }));
  assert.equal(lignes.length, 20, tableau.slice(0, 3000));
  // L'ordre officiel, et un logo par ligne (TeamCrest : le numéro FotMob du club).
  assert.deepEqual(lignes.map((l) => Number(texteDe(l.html).split(' ')[0])), Array.from({ length: 20 }, (_, i) => i + 1));
  for (const l of lignes) assert.match(l.html, /class="crest"[^>]*><img src="[^"]*\/teamlogo\/9901\d\d\.png"/, 'TeamCrest sur chaque ligne, par son numéro FotMob');
  // Les extrêmes : « ≥ 90 % », « ≤ 10 % », gris « acquis sauf surprise » ; jamais plus précis.
  const t = espaces(r.texte);
  // Les cases du tableau (la légende, elle, cite les 97 % mesurés) : jamais plus précises que la mesure.
  const cases = [...tableau.matchAll(/<td class="[^"]*\bfds__case\b[^"]*"[^>]*>([^<]*)</g)].map((m) => espaces(m[1]));
  assert.equal(cases.length, 20 * saison.tables[0].familles.length);
  for (const c of cases) assert.doesNotMatch(c, /^(≥ 9[1-9] %|9\d %|100 %|≤ \d %|0 %)$/, `jamais plus précis que la mesure : ${c}`);
  for (const c of cases) assert.match(c, /^(≥ 90 %|≤ 10 %|[1-8]\d %|acquis sauf surprise)$/, c);
  const caseDe = (club, famille) => {
    const i = saison.tables[0].familles.findIndex((f) => f.cle === famille);
    return espaces(lignes[club].html.split(/<td class="[^"]*\bfds__case\b/)[i + 1].split('</td>')[0].replace(/^[^>]*>/, ''));
  };
  assert.deepEqual([caseDe(0, 'premiere'), caseDe(0, 'promotion'), caseDe(1, 'premiere'), caseDe(19, 'relegation'), caseDe(18, 'relegation')], ['≥ 90 %', '≥ 90 %', '≥ 90 %', '≤ 10 %', '≤ 10 %'], '97 %, 93 %, 99,99 % → « ≥ 90 % » ; 4 % et 8 % → « ≤ 10 % »');
  assert.ok(compter(t, /≥ 90 %/g) >= 3, t.slice(0, 400));
  assert.ok(t.includes('acquis sauf surprise'));
  const gris = [...tableau.matchAll(/<td class="([^"]*\bfds__case\b[^"]*)"[^>]*>([^<]*)</g)].filter((m) => /\bis-gris\b/.test(m[1])).map((m) => espaces(m[2]));
  assert.deepEqual(gris, ['acquis sauf surprise', '≤ 10 %'], 'les deux cases unanimes (10 000 sur 10 000) en gris, jamais « 100 % » ni « 0 % »');
  assert.ok(t.includes(espaces(S.LEGENDE_DES_EXTREMES)) && t.includes(espaces(S.LEGENDE_UNANIME)));
  // Le favori : sa ligne en or, son étoile ; l'ordre ne bouge pas.
  const iFavori = saison.tables[0].clubs.findIndex((c) => c.teamId === '990103');
  assert.ok(iFavori >= 0);
  assert.deepEqual(lignes.map((l, i) => (/\bis-favorite\b/.test(l.classe) ? i : null)).filter((i) => i !== null), [iFavori], 'la ligne du favori (Essai C), à sa place officielle');
  assert.match(lignes[iFavori].html, /class="fav fav--mark is-on"/, 'son étoile');
  // Une colonne par famille présente, au nom de la famille.
  const entetes = [...tableau.split('</thead>')[0].matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map((m) => texteDe(m[1]));
  assert.deepEqual(entetes, ['#', 'Équipe', 'Pts', ...saison.tables[0].familles.map((f) => f.libelle)]);
  // La provenance réelle avec l'heure, la loi, la mesure.
  assert.ok(t.includes('Simulation CôteMaster, classement FotMob'));
  // Le détail de la nuit, écrit — sans la loi, que le serveur range au bout (conception §5) et que l'écran dit sur sa
  // propre ligne : jamais deux fois la même phrase (vu dans le bac le 27/10/2026).
  const finDeLoi = ` · ${saison.loi.phrase}`;
  assert.ok(saison.provenance.detail.endsWith(finDeLoi), 'le serveur range la loi au bout du détail');
  assert.ok(t.includes(espaces(saison.provenance.detail.slice(0, -finDeLoi.length))), 'le détail de la nuit, écrit');
  assert.ok(t.includes('Loi : forces de buts du modèle de buts en service.'));
  assert.equal(compter(t, /forces de buts du modèle de buts en service/gi), 1, 'la loi dite une seule fois');
  assert.ok(t.includes('Mesuré sur les saisons 2023-2026 (149 phases) avec le calendrier connu après coup, pas encore sur la saison en cours.'));
  assert.doesNotMatch(r.html, VERT, 'aucun vert');
});

test('B10 « Fin de saison » : la loi NOMMÉE dans les trois cas — forces du modèle en service, forces du modèle en essai, classement seul (en ambre, avec la phrase « trop sûre d’elle » et pourquoi cette nuit, pourcentages arrondis à 10) ; non calculée → la raison ; une coupe → pas de fin de saison', options, async () => {
  const { rendre, composants } = contexte;
  const e = lecteurs().ecrans;
  const service = await rendre(composants.FinDeSaison, { league: e.ligue }, { r: [routeSaison(e.saisonService)] });
  const essai = await rendre(composants.FinDeSaison, { league: e.ligue }, { r: [routeSaison(e.saisonEssai)] });
  const table = await rendre(composants.FinDeSaison, { league: e.ligue }, { r: [routeSaison(e.saisonTable)] });
  assert.ok(service.html.includes('data-loi="forces"') && service.texte.includes('Loi : forces de buts du modèle de buts en service.'));
  assert.ok(essai.html.includes('data-loi="forces"') && essai.texte.includes('Loi : forces de buts du modèle en essai (étape 27, pas encore adopté).'));
  assert.match(table.html, /<p class="cm-note is-warning fds__loi" data-loi="table">/);
  // Les forces de la nuit sont seulement trop vieilles à la lecture : la vraie cause, jamais « pas en service » (constat 20).
  assert.ok(table.texte.includes('Loi : classement officiel seul — les forces de buts du modèle manquent ou ne sont pas à jour. Sur 2023-2026, cette loi est trop sûre d’elle (Europe : 85 % annoncés, 77 % arrivés) : lisez les pourcentages comme des ordres de grandeur.'));
  assert.ok(!table.texte.includes('n’est pas en service'));
  assert.match(table.texte, /Pourquoi : forces de buts plus vieilles que 3 jours\./, 'la raison est calculée à la lecture : « Pourquoi : », jamais « Cette nuit : »');
  assert.doesNotMatch(table.texte, /Cette nuit :/);
  const cases = [...table.html.matchAll(/<td class="[^"]*\bfds__case\b[^"]*"[^>]*>([^<]*)</g)].map((m) => espaces(m[1]));
  assert.ok(cases.length >= 60);
  for (const c of cases) assert.match(c, /^(≥ 90 %|≤ 10 %|[1-8]0 %|acquis sauf surprise)$/, `loi « table » : ${c}`);
  // Non calculée : la raison du serveur ; une coupe, pareil.
  const nc = await rendre(composants.FinDeSaison, { league: 'Bundesliga - Germany' }, { r: [routeSaison({ calcule: false, raison: 'Fin de saison non calculée — 2 club(s) du calendrier non reconnu(s) : SC Paderborn, SV Elversberg — non calculé' })] });
  assert.match(nc.texte, /^Fin de saison non calculée 2 club\(s\) du calendrier non reconnu\(s\) : SC Paderborn, SV Elversberg — non calculé$/);
  const coupe = await rendre(composants.FinDeSaison, { league: 'EFL Cup' }, { r: [routeSaison(e.saisonCoupe)] });
  assert.match(coupe.texte, /^Fin de saison non calculée Pas de fin de saison pour une coupe\.$/);
  for (const r of [service, essai, table, nc, coupe]) {
    assert.deepEqual(r.avertissements, []);
    assert.doesNotMatch(r.html, VERT);
  }
  assert.deepEqual(interdits, []);
});

test('B10 une fin de saison à SCISSION (le vrai lecteur, sur une base en mémoire) : « jusqu’à la scission : titre, Europe et descente se jouent ensuite », les colonnes « Haut du tableau » et « Groupe de relégation », le départage simplifié, la pénalité « −8 pts »', options, async () => {
  const db = new DatabaseSync(':memory:');
  for (const s of BASE.DDL.filter((x) => /CREATE TABLE IF NOT EXISTS (standings_official|saisons_etat|saisons_simulees|simulation_state)\b/.test(x))) db.exec(s);
  const L = 'Belgium First Div';
  const nuit = '2026-10-19T01:00:00.000Z';
  const rows = Array.from({ length: 4 }, (_, i) => ({ rank: i + 1, teamId: `fotmob-${8000 + i}`, teamName: `Club ${i + 1}`, points: 20 - 3 * i, deduction: i === 3 ? -8 : null, description: i < 2 ? 'Championship playoff' : 'Relegation qualification' }));
  db.prepare('INSERT INTO standings_official (league, season, table_name, ord, fetched_at, rows) VALUES (?, ?, ?, 0, ?, ?)').run(L, 2026, 'First Division A', '2026-10-18T18:00:00.000Z', JSON.stringify(rows));
  db.prepare('INSERT INTO saisons_etat (league, calcule_le, season, tables, complet, raison, restants, a_dater, table_relevee_le, forces_empreinte, version, n) VALUES (?, ?, ?, ?, 1, NULL, 12, 0, ?, NULL, 1, 10000)').run(L, nuit, '2026', JSON.stringify(['First Division A']), '2026-10-18T18:00:00.000Z');
  for (const [i, r] of rows.entries()) {
    db.prepare("INSERT INTO saisons_simulees VALUES (?, '2026', 'First Division A', ?, ?, 'table', 'playoff', ?, 0)").run(L, String(8000 + i), nuit, [0.95, 0.7, 0.3, 0.05][i]);
    db.prepare("INSERT INTO saisons_simulees VALUES (?, '2026', 'First Division A', ?, ?, 'table', 'relegation_barrage', ?, 0)").run(L, String(8000 + i), nuit, [0.05, 0.3, 0.7, 0.95][i]);
    if (i === 0) db.prepare("INSERT INTO saisons_simulees VALUES (?, '2026', 'First Division A', ?, ?, 'table', 'premiere', 0.6, 0)").run(L, String(8000 + i), nuit);
  }
  db.prepare("INSERT INTO simulation_state VALUES ('nuit_saisons', ?)").run(JSON.stringify({ calculeLe: nuit, jourD: '2026-10-19', bilan: {} }));
  const saison = SR.saisonDe(L, { database: db, maintenant: Date.parse('2026-10-19T10:00:00Z') });
  db.close();
  assert.equal(saison.calcule, true);
  assert.deepEqual(saison.mentions, ['jusqu’à la scission : titre, Europe et descente se jouent ensuite', 'départage simplifié (différence de buts)']);
  assert.deepEqual(saison.tables[0].familles.map((f) => f.libelle), ['1re place', 'Haut du tableau', 'Groupe de relégation']);
  const r = await contexte.rendre(contexte.composants.FinDeSaison, { league: L }, { r: [routeSaison(saison)] });
  assert.deepEqual(r.avertissements, []);
  assert.ok(r.texte.includes('Jusqu’à la scission : titre, Europe et descente se jouent ensuite') && r.texte.includes('Départage simplifié (différence de buts)'));
  assert.ok(r.texte.includes('Haut du tableau') && r.texte.includes('Groupe de relégation'));
  assert.match(r.texte, /Club 4 −8 pts/);
  // La phrase de l'enjeu d'une table à scission.
  const detail = { noms: { dom: 'Club 1', ext: 'Club 3' }, dom: { parFamille: { 'First Division A|playoff': { gagne: 0.98, perd: 0.82 } } }, ext: { parFamille: { 'First Division A|relegation_barrage': { gagne: 0.55, perd: 0.8 } } } };
  // Jamais « 100 % » ni « 0 % » dans la phrase (rien n'est certain, comme la fin de saison) ; aux extrêmes, les seuils du
  // tableau (« ≥ 90 % » dès p ≥ 0,9, « ≤ 10 % » dès p ≤ 0,1 : vérification du 27/10, constat 2) ; chaque chiffre dit s'il va
  // avec la victoire ou avec la défaite (constat 22).
  assert.equal(SR.phraseDeLEnjeu(detail, { league: L }), 'Club 1 joue le haut du tableau : ≥ 90 % en cas de victoire, 80 % en cas de défaite ; Club 3 joue pour éviter le groupe de relégation : 55 % de groupe de relégation en cas de victoire, 80 % en cas de défaite.');
  assert.equal(SR.phraseDeLEnjeu(detail, { league: 'EPL' }), 'Club 1 joue la phase finale : ≥ 90 % en cas de victoire, 80 % en cas de défaite ; Club 3 joue sa place (barrage de descente) : 55 % de barrage de descente en cas de victoire, 80 % en cas de défaite.');
  // Les seuils sur p lui-même, comme le tableau : 0,9 → « ≥ 90 % », 0,89 → « 90 % » (arrondi à 5), 0,1 → « ≤ 10 % ».
  const une = (gagne, perd, famille = 'europe') => SR.phraseDeLEnjeu({ noms: { dom: 'A', ext: 'B' }, dom: { parFamille: { [`T|${famille}`]: { gagne, perd } } }, ext: { parFamille: { 'T|europe': { gagne: 0.5, perd: 0.5 } } } }, { league: 'EPL' }).split(' ; ')[0];
  assert.equal(une(0.9, 0.5), 'A joue l’Europe : ≥ 90 % en cas de victoire, 50 % en cas de défaite');
  assert.equal(une(0.89, 0.5), 'A joue l’Europe : 90 % en cas de victoire, 50 % en cas de défaite');
  assert.equal(une(0.6, 0.1), 'A joue l’Europe : 60 % en cas de victoire, ≤ 10 % en cas de défaite');
  // Deux arrondis égaux (constat 18) : « autour de X % quelle que soit l'issue », jamais deux fois le même chiffre.
  assert.equal(une(0.62, 0.6), 'A joue l’Europe : autour de 60 % quelle que soit l’issue');
  assert.equal(une(0.97, 0.91), 'A joue l’Europe : ≥ 90 % quelle que soit l’issue');
  assert.equal(une(0.42, 0.39, 'relegation'), 'A joue sa survie : autour de 40 % de descente quelle que soit l’issue');
  // Un camp qui n'a presque rien en jeu (moins de 2 points dans toutes ses zones) le dit, au lieu de « joue la 1re place :
  // 0 % en cas de victoire, 0 % en cas de défaite » (vu dans le bac le 27/10/2026) ; l'autre camp garde sa phrase.
  const unSeul = { noms: { dom: 'Club 1', ext: 'Club 3' }, dom: { parFamille: { 'T|premiere': { gagne: 0.004, perd: 0.001 }, 'T|europe': { gagne: 0.9991, perd: 0.9989 } } }, ext: { parFamille: { 'T|relegation': { gagne: 0.02, perd: 0.4 } } } };
  assert.equal(SR.phraseDeLEnjeu(unSeul, { league: 'EPL' }), 'Club 1 n’a presque rien à jouer : ses chances ne changent presque pas entre une victoire et une défaite, quelle que soit la zone ; Club 3 joue sa survie : ≤ 10 % de descente en cas de victoire, 40 % en cas de défaite.');
  // Les deux camps sans rien à jouer (« Sans enjeu ») : une seule phrase.
  const aucun = { ...unSeul, ext: { parFamille: { 'T|relegation': { gagne: 0.011, perd: 0.012 } } } };
  assert.equal(SR.phraseDeLEnjeu(aucun, { league: 'EPL' }), 'Club 1 et Club 3 n’ont presque rien à jouer : leurs chances ne changent presque pas entre une victoire et une défaite, quelle que soit la zone.');
  for (const phrase of [SR.phraseDeLEnjeu(unSeul, { league: 'EPL' }), SR.phraseDeLEnjeu(aucun, { league: 'EPL' })]) assert.doesNotMatch(phrase, /points d’écart|≥ 95|≤ 5 %/, phrase);
  for (const phrase of [SR.phraseDeLEnjeu(detail, { league: L }), SR.phraseDeLEnjeu(unSeul, { league: 'EPL' }), SR.phraseDeLEnjeu(aucun, { league: 'EPL' })]) assert.doesNotMatch(phrase, /(?<![≥≤] )\b(100|0) %/, phrase);
});

// ================================================================ 3. la pastille d'enjeu

test('B10 EnjeuBadge : « Gros enjeu » en bleu d’information, « Sans enjeu » en gris, « Enjeu non calculé » en gris pointillé — jamais vert ni rouge ; la phrase du serveur (arrondie à 5) au survol ET dans aria-label ; rien entre les deux seuils', options, async () => {
  const { rendre, composants } = contexte;
  const ligne = lecteurs().enjeux.corps.enjeux[0];
  const cas = { 'gros-enjeu': 'enjeu--info', 'sans-enjeu': 'enjeu--gris' };
  for (const [categorie, classe] of Object.entries(cas)) {
    const r = await rendre(composants.Badge, { enjeu: { ...ligne, categorie } });
    assert.deepEqual(r.avertissements, []);
    assert.ok(r.html.includes(classe), categorie);
    assert.equal(r.texte, categorie === 'gros-enjeu' ? 'Gros enjeu' : 'Sans enjeu');
    const titre = `${ligne.phrase} Calculé la nuit du 05/10, refait chaque nuit jusqu’à la veille du match, puis gardé tel quel.`;
    assert.ok(r.html.includes(`aria-label="${titre.replace(/'/g, '&#39;')}"`), r.html);
    assert.ok(r.html.includes(`title="${titre.replace(/'/g, '&#39;')}"`));
    assert.match(ligne.phrase, /\d+ %/);
    for (const [, n] of ligne.phrase.matchAll(/(\d+) %/g)) assert.equal(Number(n) % 5, 0, 'arrondi à 5');
    assert.doesNotMatch(r.html, /--cm-accent|--cm-danger|is-accent|is-danger|cm-positive|cm-negative/);
  }
  const nc = await rendre(composants.Badge, { enjeu: { calcule: false, libelle: 'Enjeu non calculé', raison: 'pas d’enjeu rangé pour cette rencontre' } });
  assert.ok(nc.html.includes('enjeu--pointille') && nc.texte === 'Enjeu non calculé');
  const entre = await rendre(composants.Badge, { enjeu: { ...ligne, categorie: 'enjeu' } });
  assert.equal(sansCommentaires(entre.html), '', 'entre les deux seuils : pas de pastille');
  // Le dessin : jamais le vert ni le rouge (jetons d'information et de gris seulement).
  const source = lireUi('components', 'common', 'EnjeuBadge.vue');
  const css = source.slice(source.indexOf('<style'));
  assert.doesNotMatch(css, /--cm-accent|--cm-danger|--cm-section|#[0-9a-f]{3,8}\b|rgba?\(\s*\d/i);
  assert.match(css, /\.enjeu--info \{[^}]*--cm-info/);
  assert.match(css, /\.enjeu--pointille \{[^}]*border-style: dashed/);
  assert.deepEqual(interdits, []);
});

// ================================================================ 4. tout éteint : identique à l'avant

const routeEnjeux = (corps, code = 200) => [/\/api\/simulation\/enjeux\?du=2026-10-06&au=2026-10-06$/, { code, corps }];

test('B10 TOUT ÉTEINT, les cartes de rencontre : sans route de l’étape 28 (le serveur d’avant), avec la réponse « éteint », et « éteint » malgré un enjeu présent → la carte d’avant, au même HTML ; allumé avec une ligne pour SES identifiants → la pastille (contrôle positif) ; jamais par un nom ; un match joué ne lit rien', options, async () => {
  const { rendre, composants } = contexte;
  const ligne = lecteurs().enjeux.corps.enjeux[0];
  const gros = { ...ligne, categorie: 'gros-enjeu' };
  const match = { matchId: ligne.matchId, date: ligne.date, league: ligne.league, homeName: 'Essai H', awayName: 'Essai G', homeId: `fotmob-${ligne.homeId}`, awayId: `fotmob-${ligne.awayId}`, status: 'scheduled' };
  assert.equal(ligne.date, '2026-10-06');
  const avant = await rendre(composants.Carte, { match }, { r: [[/\/api\/simulation\/enjeux/, ROUTE_ABSENTE]] });
  const eteint = await rendre(composants.Carte, { match }, { r: [routeEnjeux({ affichage: 'eteint', enjeux: [], phrase: 'Fins de saison et enjeu : calculés à blanc chaque nuit, pas encore montrés.' })] });
  const eteintAvecDonnees = await rendre(composants.Carte, { match }, { r: [routeEnjeux({ affichage: 'eteint', enjeux: [gros] })] });
  for (const r of [avant, eteint, eteintAvecDonnees]) assert.deepEqual(r.avertissements, []);
  assert.equal(eteint.html, avant.html, 'éteint = la carte d’avant');
  assert.equal(eteintAvecDonnees.html, avant.html, 'éteint, même avec un enjeu présent');
  assert.ok(!avant.html.includes('data-enjeu'));
  assert.equal(eteint.appels.filter((x) => /\/api\/simulation\//.test(x)).length, 1, 'une seule lecture : celle du jour de la carte');
  assert.match(eteint.appels.find((x) => /\/api\/simulation\//.test(x)), /^GET \S+\/api\/simulation\/enjeux\?du=2026-10-06&au=2026-10-06$/);
  const allume = await rendre(composants.Carte, { match }, { r: [routeEnjeux({ affichage: 'allume', enjeux: [gros] })] });
  assert.equal(compter(allume.html, /data-enjeu/g), 1);
  assert.match(allume.texte, /Gros enjeu$/);
  assert.ok(allume.html.includes('class="mcard__enjeu"'));
  // Le même nom, un autre numéro FotMob : rien.
  const autre = await rendre(composants.Carte, { match: { ...match, awayId: 'fotmob-990199' } }, { r: [routeEnjeux({ affichage: 'allume', enjeux: [gros] })] });
  assert.ok(!autre.html.includes('data-enjeu'), 'jamais par un nom');
  const joue = await rendre(composants.Carte, { match: { ...match, homeGoals: 1, awayGoals: 0, status: 'finished' } }, { r: [] });
  assert.deepEqual(joue.appels.filter((x) => /\/api\/simulation\//.test(x)), []);
  assert.deepEqual(interdits, []);
});

test('B10 TOUT ÉTEINT, les classements : sans route de l’étape 28, « éteint », ou allumé pour une coupe → les deux onglets d’avant, au même HTML ; allumé pour un championnat simulé → « Fin de saison » s’ajoute APRÈS « Classement » et « Corrigé par les xG », le reste identique', options, async () => {
  const { rendre, composants } = contexte;
  const e = lecteurs().ecrans;
  const rows = e.saisonService.tables[0].clubs.map((c) => ({ rank: c.rang, teamId: `fotmob-${c.teamId}`, teamName: c.nom, shortName: null, played: 3, won: 1, drawn: 1, lost: 1, goalsFor: 3, goalsAgainst: 3, goalDiff: 0, points: c.points, description: null }));
  const base = (league) => [
    [/\/api\/match-stats\/seasons\?league=/, { corps: { seasons: [] } }],
    [/\/api\/standings\?/, { corps: { league, season: 2026, seasonLabel: '2026-27', official: true, fetchedAt: '2026-10-04T20:00:00.000Z', table: 'Ligue 2', tables: ['Ligue 2'], rows, postponed: [] } }]
  ];
  const etat = (corps) => [/\/api\/simulation\/etat$/, { corps }];
  const onglets = (html) => [...html.matchAll(/role="tab" class="[^"]*\btabs__tab\b[^"]*"[^>]*>([^<]+)/g)].map((m) => m[1].trim());
  const eteintEtat = { ...e.etat, affichage: { ...e.etat.affichage, saisons: 'eteint' }, effectif: { ...e.etat.effectif, saisons: 'eteint' } };
  const avant = await rendre(composants.Classement, { league: e.ligue }, { r: [...base(e.ligue), [/\/api\/simulation\/etat$/, ROUTE_ABSENTE]] });
  const eteint = await rendre(composants.Classement, { league: e.ligue }, { r: [...base(e.ligue), etat(eteintEtat)] });
  assert.deepEqual(avant.avertissements, []);
  assert.ok(avant.texte.includes(rows[0].teamName), 'la table est rendue');
  assert.deepEqual(onglets(avant.html), ['Classement', 'Corrigé par les xG'], avant.html.slice(avant.html.indexOf('role="tablist"') - 40, avant.html.indexOf('role="tablist"') + 600));
  assert.equal(eteint.html, avant.html, 'éteint = le classement d’avant');
  const coupeAvant = await rendre(composants.Classement, { league: 'EFL Cup' }, { r: [...base('EFL Cup'), [/\/api\/simulation\/etat$/, ROUTE_ABSENTE]] });
  const coupe = await rendre(composants.Classement, { league: 'EFL Cup' }, { r: [...base('EFL Cup'), etat(e.etat)] });
  assert.equal(coupe.html, coupeAvant.html, 'jamais pour une coupe, même allumé');
  const allume = await rendre(composants.Classement, { league: e.ligue }, { r: [...base(e.ligue), etat(e.etat)] });
  assert.deepEqual(onglets(allume.html), ['Classement', 'Corrigé par les xG', 'Fin de saison']);
  const sansOnglets = (html) => html.replace(/<div class="tabs[^"]*" role="tablist">[\s\S]*?<\/div>/, '');
  assert.equal(sansOnglets(allume.html), sansOnglets(avant.html), 'le reste du classement ne bouge pas');
  assert.deepEqual(interdits, []);
});

/** Les routes de la page d'un match (les réponses du vrai serveur, script-page-match.mjs ; FotMob, le magasin et l'IA fabriqués). */
function routesDeLaPage(analyse) {
  const P = D.payloadsDuServeur();
  const matchA = P.liste.corps.matches.find((m) => m.matchId === 'essai-a');
  const ia = D.avisIA(P.analyses['essai-a'].corps);
  return [
    [/\/api\/matches\?/, { corps: { source: 'odds-api', count: P.liste.corps.matches.length, matches: P.liste.corps.matches } }],
    [/\/api\/matches\//, { corps: matchA }],
    [/\/api\/analysis\/match\//, { corps: analyse }],
    [/\/api\/match-stats\/preview/, { corps: D.apercu() }],
    [/\/api\/match-stats\/team-averages\?name=/, (u) => ({ corps: D.moyennes(decodeURIComponent(/name=([^&]*)/.exec(u)[1])) })],
    [/\/api\/match-stats\/team\?name=/, (u) => ({ corps: D.forme(decodeURIComponent(/name=([^&]*)/.exec(u)[1])) })],
    [/\/api\/match-stats\/odds-profile/, { corps: { available: false, reason: 'essai' } }],
    [/\/api\/match-ai-analysis\/status/, { corps: { connected: false } }],
    [/\/api\/match-ai-analysis\/match\//, { corps: { entry: ia } }],
    [/\/api\/odds\/fixture/, { corps: P.fixtureA }],
    [/\/api\/odds\/saisies/, { corps: P.saisiesA }],
    [/\/api\/odds\/conseil-releve/, { corps: P.conseil }],
    [/\/api\/odds\/fraicheur/, { corps: { reglage: { maxAgeMinutes: 180, avantCompos: true }, source: 'defaut', bornes: { min: 15, max: 1440 } } }],
    [/\/api\/team-stats\/team-news/, { corps: D.actualites() }],
    [/\/api\/match-notes\//, { corps: { text: '', updatedAt: null } }]
  ];
}

test('B10 TOUT ÉTEINT, la page du match : l’analyse sans le bloc de l’étape 28 (le serveur d’avant), avec le bloc « éteint » du vrai serveur, et « éteint » malgré un enjeu et un déroulé présents → la page d’avant, au même HTML, sans aucune lecture de l’étape 28 ; allumée → l’encadré « Enjeu » après le verdict et le « Déroulé simulé » dans le détail', options, async () => {
  const { rendre, composants } = contexte;
  const P = D.payloadsDuServeur();
  const s = lecteurs();
  const a = copie(P.analyses['essai-a'].corps);
  assert.deepEqual(a.simulation, { affichage: { saisons: 'eteint', matchs: 'eteint' }, enjeu: null, deroule: null }, 'le vrai serveur, tout éteint');
  const sansBloc = copie(a);
  delete sansBloc.simulation;
  const enjeu = { calcule: true, ...s.enjeux.corps.enjeux[0], categorie: 'gros-enjeu', libelle: 'Gros enjeu' };
  const deroule = s.page.simulation.deroule;
  const eteintAvecDonnees = { ...copie(a), simulation: { affichage: { saisons: 'eteint', matchs: 'eteint' }, enjeu, deroule } };
  const page = (analyse) => rendre(composants.Page, { matchId: 'essai-a' }, { r: routesDeLaPage(analyse), heure: D.MAINTENANT });
  const avant = await page(sansBloc);
  const eteint = await page(a);
  const eteintDonnees = await page(eteintAvecDonnees);
  assert.deepEqual(avant.avertissements, []);
  assert.ok(avant.html.includes('id="upcoming-verdict"') && avant.html.includes('id="upcoming-detail"'), 'la page est rendue');
  assert.equal(eteint.html, avant.html, 'tout éteint = la page d’avant');
  assert.equal(eteintDonnees.html, avant.html, 'éteint, même avec un enjeu et un déroulé présents');
  for (const r of [avant, eteint, eteintDonnees]) {
    assert.ok(!r.html.includes('upcoming-enjeu') && !r.html.includes('upcoming-deroule') && !r.html.includes('data-enjeu'));
    assert.deepEqual(r.appels.filter((x) => /\/api\/simulation\//.test(x)), [], 'aucune lecture de l’étape 28');
  }
  // Allumée : l'encadré après le verdict, le déroulé dans le détail.
  const allumee = await page({ ...copie(a), simulation: { affichage: { saisons: 'allume', matchs: 'tout' }, enjeu, deroule } });
  assert.deepEqual(allumee.avertissements, []);
  const pos = (id) => allumee.html.indexOf(`id="${id}"`);
  assert.ok(pos('upcoming-verdict') < pos('upcoming-enjeu') && pos('upcoming-enjeu') < pos('upcoming-pourquoi'), 'l’encadré « Enjeu » après le verdict');
  assert.ok(pos('upcoming-detail') < pos('upcoming-deroule'), 'le déroulé dans le détail');
  const debutDe = (id) => allumee.html.lastIndexOf('<', pos(id));
  const blocEnjeu = texteDe(allumee.html.slice(debutDe('upcoming-enjeu'), debutDe('upcoming-pourquoi')));
  assert.ok(blocEnjeu.includes('Gros enjeu') && blocEnjeu.includes(enjeu.phrase), blocEnjeu.slice(0, 300));
  assert.ok(blocEnjeu.includes('Calculé la nuit du 05/10, refait chaque nuit jusqu’à la veille du match, puis gardé tel quel.'));
  assert.ok(blocEnjeu.includes('Loi : forces de buts du modèle de buts en service.'));
  assert.ok(blocEnjeu.includes('Simulation CôteMaster, classement FotMob'));
  const blocDeroule = texteDe(allumee.html.slice(debutDe('upcoming-deroule')));
  assert.ok(blocDeroule.startsWith('Déroulé simulé'));
  assert.ok(blocDeroule.includes('Information, pas un pronostic.'));
  // Le reste de la page : identique à celle d'avant, aux deux blocs près.
  const sansEtape28 = (html) => sansCommentaires(html.replace(/<section[^>]*id="upcoming-enjeu"[\s\S]*?<\/section>/, '').replace(/<section[^>]*id="upcoming-deroule"[\s\S]*?<\/section>/, ''));
  // (Les identifiants générés par Vue — useId, « v-0-7 » — se décalent des blocs ajoutés : ramenés à un seul nom.)
  const memesIds = (html) => html.replace(/\bv-\d+(?:-\d+)+/g, 'v-id');
  const a1 = memesIds(sansEtape28(allumee.html));
  const a0 = memesIds(sansCommentaires(avant.html));
  let k = 0;
  while (k < Math.min(a1.length, a0.length) && a1[k] === a0[k]) k++;
  assert.equal(a1, a0, `aucun autre changement de la page — premier écart au caractère ${k} :\n${a0.slice(Math.max(0, k - 300), k + 300)}\n---\n${a1.slice(Math.max(0, k - 300), k + 300)}`);
  assert.deepEqual(interdits, []);
});

// ================================================================ 5. le déroulé simulé

test('B10 le « Déroulé simulé » : « Information, pas un pronostic. … », 20 lignes en quatre groupes, l’écart MESURÉ au survol de chaque ligne (les chiffres du serveur, ECARTS_MESURES_V), les deux marchés écartés absents — ni ligne, ni nom, ni chiffre — et dits sans les nommer ; « Ni pronostic ni règlement automatique. » ; jamais de vert', options, async () => {
  const { rendre, composants } = contexte;
  const deroule = lecteurs().page.simulation.deroule;
  const match = { matchId: 'essai-a', home: 'Man City', away: 'Liverpool', league: 'EPL', commenceTime: '2026-10-05T18:30:00Z' };
  const r = await rendre(composants.Deroule, { deroule, match });
  assert.deepEqual(r.avertissements, []);
  assert.ok(espaces(r.texte).includes(espaces(deroule.phrase)), 'la phrase du serveur, entière');
  assert.match(espaces(r.texte), /Information, pas un pronostic\. Ces pourcentages viennent de 10 000 matchs simulés la nuit du 05\/10\./);
  const lignes = [...r.html.matchAll(/<li class="dsc__ligne" data-cle="([^"]+)" title="([^"]*)"/g)].map((m) => ({ cle: m[1], titre: espaces(m[2].replace(/&#39;/g, "'")) }));
  assert.equal(lignes.length, 20);
  for (const l of lignes) {
    const v = ECARTS_MESURES_V.marches[l.cle];
    assert.ok(v, l.cle);
    assert.equal(l.titre, espaces(S.ecartMesureDit({ ecart: v.ecart, annonce: v.annonce, realise: v.realise })), `${l.cle} : l’écart mesuré au survol`);
  }
  assert.ok(!lignes.some((l) => ['deuxMiTemps05', 'rougeAuMoinsUn'].includes(l.cle)), 'les marchés écartés absents');
  assert.doesNotMatch(r.texte, /un but dans chaque mi-temps|rouge/i, 'ni leur nom');
  assert.ok(espaces(r.texte).includes(espaces(deroule.ecartes.phrase)));
  assert.ok(r.texte.includes('Ni pronostic ni règlement automatique.'));
  assert.deepEqual([...r.html.matchAll(/<h4 class="cm-group-title dsc__titre">([^<]+)</g)].map((m) => m[1].replace(/&#39;/g, "'")), ['À la mi-temps', 'Mi-temps / fin', 'Le premier but', 'D’une mi-temps à l’autre']);
  assert.equal(compter(r.html, /class="dsc__prendre/g), 18, 'une sélection du ticket pour chaque ligne qu’un marché dit exactement');
  assert.doesNotMatch(r.html, VERT);
  assert.deepEqual(interdits, []);
});

// ================================================================ 6. le ticket

const jambeUI = (marketId, params, pick, market, cote) => ({ matchId: 'essai-a', homeName: 'Man City', awayName: 'Liverpool', league: 'EPL', commenceTime: '2026-10-05T18:30:00Z', market, pick, marketId, params, cote, bookmaker: 'winamax', bookmakerTitle: 'Winamax', coteReleveeA: null, coteSource: null, probabiliteMoteur: 0.5, probabiliteSource: 'cote juste du moteur', probabiliteLueA: M, coteJuste: 2, bornes: null });
const UN = jambeUI('result', { outcome: 'home' }, 'Man City', 'Résultat', 2.0);
const DEUX = jambeUI('result', { outcome: 'away' }, 'Liverpool', 'Résultat', 3.9);
const PLUS25 = jambeUI('totalGoals', { line: 2.5, side: 'over' }, 'Plus de 2,5 buts', 'Total buts', 1.9);
const BTTS = jambeUI('bothTeamsScore', { outcome: 'yes' }, 'Oui', 'Les 2 équipes marquent', 1.8);
const BOOKMAKERS = [{ cle: 'winamax', titre: 'Winamax' }];
const ticket = (selections, prixJuste, coteCombinee = 4.2) => ({ selections, edition: { bookmaker: 'winamax', cotes: {}, coteCombinee }, mise: 10, bookmakers: BOOKMAKERS, memeMatch: true, prixJuste, maintenant: Date.parse(M) });
const decoder = (v) => v.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');

test('B10 le ticket, un combiné du même match AVEC son prix juste : « Prix juste : x (y %) à 3 h 00 », la cote tapée en écart NEUTRE (jamais ValueBadge, jamais de vert), « si les sélections étaient indépendantes » en gris, la précision, la provenance réelle ; le gain attendu ; « J’ai parié » emporte le prix juste', options, async () => {
  const { rendre, composants } = contexte;
  const score = lecteurs().prix.score.corps;
  const r = await rendre(composants.Ticket, ticket([UN, PLUS25, BTTS], { enCours: false, reponse: score, erreur: null }));
  assert.deepEqual(r.avertissements, []);
  assert.ok(r.html.includes('data-prix-juste="prix"'));
  const bloc = r.html.slice(r.html.indexOf('data-prix-juste="prix"'));
  const p = score.probabilite;
  const t = espaces(r.texte);
  assert.ok(t.includes(`Prix juste : ${(1 / p).toFixed(2).replace('.', ',')} (${(100 * p).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %) à 3 h 00`), t);
  const ecart = 4.2 * p - 1;
  assert.ok(t.includes(`Chez Winamax (cote tapée) : 4,20, soit ${Math.round(Math.abs(ecart) * 100)} % ${ecart < 0 ? 'sous le' : 'au-dessus du'} prix juste`));
  assert.match(bloc, /<p class="tkt__prix-gris cm-numeric">si les sélections étaient indépendantes : \d+,\d\d<\/p>/, 'en gris');
  assert.ok(t.includes(espaces(S.PRECISION_DU_PRIX_JUSTE)));
  assert.ok(t.includes('Calculé par le serveur : grille du moteur (modèle de buts unique) de 3 h 00, alignée sur le 1N2 affiché.'));
  // JAMAIS de vert sur un combiné : ni ValueBadge, ni jeton vert, ni classe de value.
  assert.doesNotMatch(r.html, VERT, 'pas de vert pour un combiné');
  assert.match(bloc, /<p class="tkt__prix-ecart cm-numeric">Chez Winamax/, 'l’écart en texte neutre');
  // Le gain attendu du combiné : mise × (p × cote − 1).
  const montant = Math.round(10 * (p * 4.2 - 1) * 100) / 100;
  const attendu = `Gain attendu ${montant >= 0 ? '+' : '−'}${Math.abs(montant).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  assert.ok(t.includes(espaces(attendu)), t.slice(t.indexOf('Gain attendu'), t.indexOf('Gain attendu') + 60));
  // « J'ai parié » : le prix juste part avec le pari (le corps de POST /api/bets).
  const corps = K.pariAEnregistrer({ selections: [UN, PLUS25, BTTS], edition: { bookmaker: 'winamax', cotes: {}, coteCombinee: 4.2 }, mise: 10, origine: 'page-du-match', maintenant: Date.parse(M), bookmakers: BOOKMAKERS, prixJuste: { probabilite: p, source: 'x', lueA: M } });
  assert.deepEqual(corps.prixJuste, { probabilite: p, source: 'x', lueA: M });
  assert.match(decoder(r.html), /J'ai parié chez Winamax/);
  assert.deepEqual(interdits, []);
});

test('B10 le ticket, les autres cas : éteint → la ligne « il attend » (la phrase §5) ; contradictoires → « impossible » ; une sélection de mi-temps → chiffrée, « se lit, ne se parie pas » et « J’ai parié » refusé ; un marché écarté par la preuve → refusé en mots ; jamais de vert', options, async () => {
  const { rendre, composants } = contexte;
  const s = lecteurs();
  const eteint = await rendre(composants.Ticket, ticket([UN, PLUS25], { enCours: false, reponse: s.prix.eteint.corps, erreur: null }));
  assert.ok(espaces(eteint.texte).includes(espaces(K.PRIX_JUSTE_COMBINE)));
  assert.ok(K.PRIX_JUSTE_COMBINE.startsWith('Prix juste : calculé à blanc chaque nuit, pas encore montré : il attend le modèle de buts (étape 27) et la preuve de l’étape 28.'));
  // Vérification du 27/10, constat 25 : ni redite (« même match… liées », déjà dite par le ticket) ni « jamais le produit des
  // cotes » à côté du produit des cotes prises d’un combiné de matchs différents.
  assert.doesNotMatch(K.PRIX_JUSTE_COMBINE, /produit des cotes|même match sont liées/);
  assert.ok(!eteint.html.includes('data-prix-juste="prix"'));
  const sansProp = await rendre(composants.Ticket, ticket([UN, PLUS25], null));
  assert.ok(espaces(sansProp.texte).includes(espaces(K.PRIX_JUSTE_COMBINE)), 'sans réponse : il attend');
  const impossible = await rendre(composants.Ticket, ticket([UN, DEUX], { reponse: s.prix.contradictoires.corps }));
  assert.ok(impossible.texte.includes('Prix juste : impossible — ces sélections ne peuvent pas gagner ensemble.'));
  const mt = S.selectionDuDeroule({ cle: 'htH', libelle: 'Mi-temps : Man City mène', p: 0.4, jambe: S.jambeDuDeroule('htH') }, { matchId: 'essai-a', home: 'Man City', away: 'Liverpool', league: 'EPL', commenceTime: '2026-10-05T18:30:00Z' }, { calculeLe: M });
  assert.deepEqual([mt.marketId, mt.pariable], ['halfTimeResult', false]);
  const miTemps = await rendre(composants.Ticket, ticket([UN, mt], { reponse: s.prix.mtEnTout.corps }));
  assert.ok(miTemps.html.includes('data-prix-juste="prix"'), 'chiffrée');
  assert.match(miTemps.texte, /ne se parie pas : ce pari ne se règle pas automatiquement/);
  assert.ok(miTemps.texte.includes('« Mi-temps : Man City mène » se lit, ne se parie pas : ce pari ne se règle pas automatiquement.'), 'dans ce qui manque');
  assert.match(decoder(miTemps.html), /<button[^>]*disabled[^>]*>(?:(?!<\/button>)[\s\S])*J'ai parié/, '« J’ai parié » refusé en v1');
  const ecarte = await rendre(composants.Ticket, ticket([mt, UN], { reponse: s.prix.butsDeuxMiTemps.corps }));
  assert.ok(ecarte.html.includes('data-prix-juste="refuse"'));
  assert.ok(ecarte.texte.includes('« Un but dans chaque mi-temps » : ce marché a été écarté par la preuve sur 2019-2023'));
  for (const r of [eteint, sansProp, impossible, miTemps, ecarte]) {
    assert.deepEqual(r.avertissements, []);
    assert.doesNotMatch(r.html, VERT);
  }
  // Le source : jamais ValueBadge dans le ticket.
  const source = lireUi('components', 'betting', 'TicketDuPari.vue');
  assert.doesNotMatch(source.replace(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/g, ''), /import ValueBadge|<ValueBadge/);
  assert.deepEqual(interdits, []);
});

test('B10 le ticket PENDANT un recalcul (vérification du 27/10, constats 11 et 23) : jamais le prix d’un AUTRE ticket — une réponse d’avant présente, le ticket ne la chiffre pas, pas de gain attendu ; « calcul en cours » seulement quand l’affichage est connu comme allumé (Mes paris, tout éteint : rien de visible ne change) ; le composable retire la réponse d’avant dès que le ticket change', options, async () => {
  const { rendre, composants } = contexte;
  const score = lecteurs().prix.score.corps;
  const sansPrix = (r) => !r.html.includes('data-prix-juste="prix"') && !r.texte.includes('Prix juste : ' + (1 / score.probabilite).toFixed(2).replace('.', ','));
  // Une réponse VALIDE d'un ticket d'avant, le recalcul en cours : rien de chiffré, gain attendu « pas encore ».
  const encours = await rendre(composants.Ticket, ticket([UN, PLUS25, BTTS], { enCours: true, reponse: score, erreur: null }));
  assert.ok(sansPrix(encours), 'jamais le prix d’un autre ticket');
  assert.match(espaces(encours.texte), /Gain attendu pas encore \(étape 28\)/);
  assert.ok(!encours.html.includes('data-prix-juste="calcul"'), 'allumé inconnu : pas de « calcul en cours »');
  assert.ok(espaces(encours.texte).includes(espaces(K.PRIX_JUSTE_COMBINE)), 'la phrase « il attend », comme éteint');
  // Mes paris tout éteint (constat 23) : en cours, aucune réponse → aucune ligne « calcul en cours ».
  const mesParis = await rendre(composants.Ticket, ticket([UN, PLUS25], { enCours: true, reponse: null, erreur: null }));
  assert.ok(!mesParis.texte.includes('calcul en cours'));
  // L'affichage connu comme allumé : « calcul en cours », et jamais la phrase « il attend » (fausse quand c'est allumé).
  const allume = await rendre(composants.Ticket, ticket([UN, PLUS25], { enCours: true, reponse: null, erreur: null, allume: true }));
  assert.ok(allume.html.includes('data-prix-juste="calcul"') && allume.texte.includes('Prix juste : calcul en cours au serveur…'));
  assert.ok(!espaces(allume.texte).includes(espaces(K.PRIX_JUSTE_COMBINE)));
  assert.ok(sansPrix(allume));
  for (const r of [encours, mesParis, allume]) {
    assert.deepEqual(r.avertissements, []);
    assert.doesNotMatch(r.html, VERT);
  }
  // Le composable lui-même : la réponse d'avant retirée DÈS que le ticket change (jamais montrée ni enregistrée pendant les
  // 350 ms et le temps du serveur), puis la bonne réponse ; l'affichage connu comme allumé après une réponse.
  const vue = await imp(path.join(UI, 'node_modules', 'vue', 'index.mjs'));
  const { usePrixJuste, PAUSE_DU_PRIX_JUSTE_MS } = await contexte.vite.ssrLoadModule('/src/composables/usePrixJuste.js');
  const reponses = [];
  routes = [[/\/api\/simulation\/prix-combine$/, () => ({ corps: reponses.shift() }), 'POST'], [/\/api\/match-stats\/team-ids/, { corps: { results: [] } }, 'POST']];
  const attendre = (ms) => new Promise((r) => originaux.setTimeout(r, ms));
  const selections = vue.ref([UN]);
  const portee = vue.effectScope();
  const etat = portee.run(() => usePrixJuste(() => selections.value, () => 4.2, () => null));
  reponses.push({ ...score, probabilite: 0.31 });
  selections.value = [UN, PLUS25];
  await vue.nextTick();
  assert.deepEqual([etat.enCours, etat.reponse, etat.allume], [true, null, null]);
  await attendre(PAUSE_DU_PRIX_JUSTE_MS + 150);
  assert.deepEqual([etat.enCours, etat.reponse?.probabilite, etat.allume], [false, 0.31, true]);
  reponses.push({ ...score, probabilite: 0.17 });
  selections.value = [UN, BTTS];
  await vue.nextTick();
  assert.deepEqual([etat.enCours, etat.reponse, etat.allume], [true, null, true], 'le ticket a changé : la réponse d’avant retirée tout de suite');
  await attendre(PAUSE_DU_PRIX_JUSTE_MS + 150);
  assert.deepEqual([etat.enCours, etat.reponse?.probabilite], [false, 0.17]);
  portee.stop();
  routes = [[/\/api\/match-stats\/team-ids/, { corps: { results: [] } }, 'POST']];
});

// ================================================================ 7. Réglages

test('B10 Réglages › Versions du moteur, la simulation à blanc : LA PORTE 1 en mots simples (réussie, la date, les combinés meilleurs que le produit, les effets du score, les deux marchés écartés et pourquoi, la règle), la dernière nuit (durées, mémoire, refus nommés), « N matchs sur 800, J jours sur 21 », les deux interrupteurs (AppSelect) et ce qui manque', options, async () => {
  const { rendre, composants } = contexte;
  const e = lecteurs().ecrans;
  const r = await rendre(composants.Reglages, {}, { r: [[/\/api\/simulation\/etat$/, { corps: e.etat }]] });
  assert.deepEqual(r.avertissements, []);
  const t = espaces(r.texte);
  const p = S.porte1Dite(e.etat.porte1);
  assert.ok(t.includes('Porte 1 réussie, le 27/10/2026'));
  for (const l of [...p.lignes, p.ecartesTitre, ...p.ecartes, p.regle]) assert.ok(t.includes(espaces(l)), l);
  assert.ok(t.includes('Aucun combiné écarté'));
  assert.ok(t.includes(espaces(S.nuitDesSaisonsDite(e.etat.nuits.saisons).titre)));
  assert.ok(t.includes(espaces(S.nuitDesMatchsDite(e.etat.nuits.matchs, e.etat.controle).texte)));
  // L'état des lecteurs porte le principal « retenu » du lancement en cours : la nuit rapporte les 60 derniers jours (constat 16).
  assert.ok(e.etat.jugement?.rapportJours === 60, 'le principal est pris dans cet état');
  assert.match(t, /La preuve sur vos matchs : jugement pris à l’horizon ; chiffres des 60 derniers jours : \d+ match/);
  assert.ok(t.includes('Fins de saison et enjeu') && t.includes('Combinés et déroulé simulé'));
  assert.ok(t.includes('Allumé : fins de saison et enjeu montrés') && t.includes('Éteint : calculé à blanc, pas montré'));
  assert.doesNotMatch(r.html, /<select\b/, 'jamais la liste native');
  // La provenance en mots (constat 26) : jamais le nom d'une table.
  assert.ok(t.includes('Simulation CôteMaster, état rangé par le serveur dans le magasin'));
  assert.doesNotMatch(r.html, /simulation_state/);
  assert.ok(!r.html.includes('data-garde-de-surete'), 'aucune garde rangée : rien');
  // La garde de sûreté a éteint un marché : une information en libellés (constats 7 et 12), jamais un manque.
  const etatGarde = { ...e.etat, conditions: { ...e.etat.conditions, possible: true, manques: [], information: 'La garde de sûreté a éteint, pour cette version de l’étape 28, un marché ou combiné : « 2e mi-temps plus de buts » — sur vos matchs, il s’est écarté de plus de 4 points de ce qui est arrivé ; il n’est jamais montré, le reste l’est' } };
  const r3 = await rendre(composants.Reglages, {}, { r: [[/\/api\/simulation\/etat$/, { corps: etatGarde }]] });
  assert.match(r3.html, /<p class="est__texte" data-garde-de-surete>La garde de sûreté a éteint, pour cette version de l’étape 28, un marché ou combiné : « 2e mi-temps plus de buts »/);
  assert.doesNotMatch(r3.html, /h2plusQueH1/);
  assert.deepEqual(r3.avertissements, []);
  // Un « tout » resté ouvert sans ses conditions : dit en ambre, avec ce qui manque.
  const relu = lecteurs().relus.autreLancement;
  const etatRelu = { ...e.etat, affichage: relu.affichage, effectif: relu.effectif, conditions: { possible: false, manques: ['pas encore jugé pour cette version de l’étape 28 : le jugement rangé est celui d’un autre lancement'] } };
  const r2 = await rendre(composants.Reglages, {}, { r: [[/\/api\/simulation\/etat$/, { corps: etatRelu }]] });
  assert.ok(espaces(r2.texte).includes(espaces(relu.effectif.pourquoi.matchs)));
  assert.match(r2.html, /<p class="est__attention">Déroulé simulé et prix de combinés éteints/);
  assert.ok(r2.texte.includes('Ce qui manque pour montrer les combinés et le déroulé :'));
  for (const x of [r, r2]) assert.doesNotMatch(x.html, VERT);
  assert.deepEqual(interdits, []);
});

test('B10 Réglages › Actualisation : l’alerte durable des fins de saison (alerts.simulationSaisons) dite en UNE ligne quand un nom du calendrier inconnu bloque des championnats, rien sinon ; le contrôle des déroulés simulés (alerts.simulationMatchs) parmi les contrôles anti-fuite, son écart dit par sa phrase (vérification du 27/10, constat 14)', options, async () => {
  const { rendre, composants } = contexte;
  const base = { enabled: true, running: null, lastPass: null, steps: [], history: [], alerts: {} };
  const sans = await rendre(composants.Actualisation, { overview: base });
  assert.ok(!sans.html.includes('data-simulation-noms-inconnus') && !sans.html.includes('data-controle-anti-fuite'));
  const avec = await rendre(composants.Actualisation, { overview: { ...base, alerts: { simulationSaisons: { inconnus: [{ league: 'Bundesliga - Germany', noms: ['SV Elversberg', 'SC Paderborn'] }, { league: 'Primera A - Colombia', noms: ['Llaneros'] }], updatedAt: M }, simulationMatchs: { ecarts: [{ type: 'apresCoupDEnvoi', fixtureKey: 'k', role: 'service', calculeLe: M, texte: 'Man City – Liverpool du 2026-10-05 (moteur en service, nuit du 05/10 à 3 h 00) : calculée après le coup d’envoi — gardée, comptée, écartée du jugement' }], total: 1, updatedAt: M } } } });
  assert.deepEqual(avec.avertissements, []);
  assert.equal(compter(avec.html, /data-simulation-noms-inconnus/g), 1, 'une ligne, une seule');
  assert.ok(espaces(avec.texte).includes('Fins de saison : 2 championnats bloqués par un nom du calendrier inconnu (Bundesliga - Germany, Primera A - Colombia) — le détail est dans Réglages › Versions du moteur.'));
  assert.ok(avec.html.includes('data-controle-anti-fuite'));
  assert.match(espaces(avec.texte), /Déroulés simulés \(lignes de la nuit relues\) : 1 écart \(contrôle du 05\/10\/2026 à 03:00\) — par exemple Man City – Liverpool du 2026-10-05 \(moteur en service, nuit du 05\/10 à 3 h 00\) : calculée après le coup d’envoi/);
});

// ================================================================ 8. hygiène et câblage

test('B10 hygiène : jetons seulement, jamais le vert d’une value dans un écran de l’étape 28, polices ≥ 10 px, icônes connues, termes du guide, AppSelect pour les choix ; le câblage (onglet, cartes, page, ticket, Réglages)', options, () => {
  const tokens = lireUi('assets', 'styles', 'tokens.css');
  const connues = new Set([...lireUi('components', 'common', 'AppIcon.vue').matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]));
  const ECRANS = [
    ['components', 'common', 'EnjeuBadge.vue'],
    ['components', 'matches', 'FinDeSaisonTable.vue'],
    ['components', 'matches', 'EnjeuDuMatch.vue'],
    ['components', 'analysis', 'DerouleSimuleCard.vue'],
    ['components', 'settings', 'EngineSimulationTrial.vue']
  ];
  for (const f of ECRANS) {
    const source = lireUi(...f);
    const css = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
    const nom = f.join('/');
    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b|\brgba?\(\s*\d|!important/, nom);
    assert.doesNotMatch(css, /--cm-accent|cm-positive/, `${nom} : le vert est celui d’une value`);
    for (const [, t] of css.matchAll(/font-size:\s*([\d.]+)px/g)) assert.ok(Number(t) >= 10, `${nom} : police de ${t}px`);
    for (const [, j] of css.matchAll(/var\((--cm-[a-z0-9-]+)/g)) assert.ok(tokens.includes(`${j}:`), `${nom} : jeton ${j}`);
    for (const [, i] of source.matchAll(/<AppIcon name="(\w+)"/g)) assert.ok(connues.has(i), `${nom} : icône ${i}`);
    assert.doesNotMatch(source.replace(/<style[\s\S]*$/, ''), /is-accent|ValueBadge|<select\b/, nom);
  }
  // Les termes du guide posés par l'étape 28, et chacun posé dans un écran.
  const lp = lireUi('utils', 'langageParis.js');
  for (const terme of ['fin-de-saison', 'enjeu', 'deroule-simule', 'prix-juste-combine']) {
    assert.ok(lp.includes(`'${terme}': Object.freeze({`) || lp.includes(`${terme}: Object.freeze({`), terme);
  }
  // Le câblage : l'onglet seulement allumé et pour un championnat simulé ; la carte lit par jour ; la page suit l'affichage effectif.
  const panneau = lireUi('components', 'matches', 'LeagueStandingsPanel.vue');
  assert.ok(panneau.includes("const finDeSaisonPossible = computed(() => simulation.value?.effectif?.saisons === 'allume' && (simulation.value?.championnats ?? []).includes(props.league));"));
  assert.ok(panneau.includes(`<FinDeSaisonTable v-else-if="vue === 'fin-de-saison'" :league="league" />`));
  const carte = lireUi('components', 'matches', 'MatchCard.vue');
  assert.ok(carte.includes('enjeux.demander(jourDeLaRencontre.value)'));
  assert.ok(carte.includes('<EnjeuBadge :enjeu="enjeu" compacte />'));
  const page = lireUi('views', 'UpcomingMatchView.vue');
  assert.ok(page.includes("const enjeuMontre = computed(() => (simulationDuMatch.value?.affichage?.saisons === 'allume' ?"));
  assert.ok(page.includes("const derouleMontre = computed(() => (simulationDuMatch.value?.affichage?.matchs === 'tout' ?"));
  assert.ok(page.includes(':prix-juste="prixJuste"'));
  assert.ok(lireUi('views', 'MyBetsView.vue').includes(':prix-juste="prixJusteDuBordereau"'));
  // Mes paris n'enregistre jamais le prix juste d'un ticket en recalcul (vérification du 27/10, constat 11).
  assert.ok(lireUi('views', 'MyBetsView.vue').includes(`if (!prixJusteDuBordereau.enCours && prixDuCombine.etat === 'prix'`));
  // Réglages vide les pastilles d'enjeu des cartes à chaque clic, réussi ou refusé (constat 21).
  const reglages = lireUi('components', 'settings', 'EngineSimulationTrial.vue');
  const changer = reglages.slice(reglages.indexOf('async function changer('), reglages.indexOf('</script>'));
  assert.ok(changer.indexOf('await simulationApi.changerAffichage(cle, valeur);') < changer.indexOf('enjeux.$reset();'), '$reset après le clic réussi');
  assert.equal(compter(changer, /enjeux\.\$reset\(\)/g), 2, 'dans le succès ET dans l’échec');
  assert.ok(reglages.includes("import { useEnjeuxStore } from '@/stores/enjeuxStore.js';"));
  assert.ok(lireUi('components', 'matches', 'FinDeSaisonTable.vue').includes(' Pourquoi : {{ dit.loi.pourquoi }}.'), 'constat 20');
  const versions = lireUi('components', 'settings', 'EngineVersionsPanel.vue');
  assert.ok(versions.includes('<EngineSimulationTrial />'));
  assert.ok(versions.indexOf('<EngineSimulationTrial') > versions.indexOf('<EngineCandidateTrial'), 'après l’essai et l’adoption de la candidate');
  // Pas de calcul lourd à l'ouverture : les écrans ne lisent que des routes de lecture ; le ticket demande le prix juste au clic.
  const api = lireUi('services', 'simulationApi.js');
  assert.deepEqual([...api.matchAll(/httpClient\.(\w+)\(/g)].map((m) => m[1]), ['get', 'get', 'get', 'post', 'put']);
  // Le guide de design dit les trois règles de l'étape (conception §5) : la pastille d'enjeu (§ 3 bis), le motif « Fin de
  // saison » (§ 5), « Pas de vert pour un combiné » (§ 6).
  const design = fs.readFileSync(path.join(UI, 'DESIGN.md'), 'utf8');
  const section = (debut, fin) => design.slice(design.indexOf(debut), design.indexOf(fin));
  assert.match(section('## 3 bis.', '## 4.'), /\| Enjeu d'une rencontre \(étape 28\) \| `EnjeuBadge` \|/);
  assert.match(section('## 5.', '## 6.'), /- \*\*Fin de saison\*\* \(étape 28, 27\/10\/2026\) → un onglet « Fin de saison » APRÈS « Classement »/);
  assert.ok(section('## 6.', '## 7.').includes("- Pas de vert pour un combiné : aucune value de combiné n'est prouvée (aucun prix de combiné relevé ; la grille est jugée contre le\n  produit des simples, pas contre les bookmakers)."));
});
