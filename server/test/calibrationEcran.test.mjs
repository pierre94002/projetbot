/**
 * Le bloc « Calibration du mois » d'Historique moteur (étape 20 du plan, 13/10/2026) : ses règles et son rendu.
 *   node --test test/calibrationEcran.test.mjs        (depuis server/)
 *
 * Les réponses de GET /api/predictions/calibration sont celles du VRAI serveur : la phase « ecran » de
 * test/aides/script-calibration.mjs les calcule dans une copie isolée (pronostics gelés plantés sur la base
 * d'essai, septembre figé par l'étape de la passe, heure figée au 05/10/2026) — octobre en cours, septembre
 * figé, août sans aucun pronostic gelé. Le rendu est fait côté serveur, sans navigateur ni serveur de
 * développement : `fetch` remplacé (seule la route de la calibration répond, tout le reste est refusé et
 * compté), un Vite « middleware » n'écoute sur aucun port, son cache va dans le dossier d'essais, rien n'est
 * écrit dans ui/. Comme pour les autres cartes, `onMounted` devient `onServerPrefetch` dans le rendu.
 *
 *  1. Les règles de l'écran (ui/src/utils/calibration.js) : mois, pourcentages, écarts en points, verdicts
 *     (jamais vert), état du mois (figé, en cours, pas encore figé), dix tranches toujours, Σ et ⌀.
 *  2. Le bloc dans chacun de ses états : en cours, figé, vide, serveur en panne — la structure toujours là.
 *  3. Le câblage : Historique moteur, le service, la courbe du banc d'essai réutilisée (jamais recopiée).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { preparerCopie, executer, SERVEUR, RACINE_ESSAIS } from './aides/isolement.mjs';

const UI = path.resolve(SERVEUR, '..', 'ui');
const pret = ['vite', '@vitejs/plugin-vue', 'vue', 'pinia'].every((p) => fs.existsSync(path.join(UI, 'node_modules', p)));
const imp = (chemin) => import(pathToFileURL(chemin).href);
const options = { skip: pret ? false : 'ui/node_modules (vite, plugin-vue, vue, pinia) manque' };
const R = await imp(path.join(UI, 'src', 'utils', 'calibration.js'));

/** Les réponses du vrai serveur, produites une fois dans une copie isolée. */
function reponsesDuServeur() {
  const copie = preparerCopie({});
  try {
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    const r = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-calibration.mjs'), { args: ['ecran'], timeout: 300_000 });
    assert.equal(r.code, 0, r.erreurs.slice(-3000));
    assert.equal(r.reseau, false);
    return r.json.reponses;
  } finally {
    copie.nettoyer();
  }
}

const texteDe = (html) =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[  ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const sansEspaces = (s) => String(s).replace(/[  ]/g, ' ');

let reponses;
let contexte;
let scenario = { reponse: null, statut: 200 };
const appels = [];
const interdits = [];
const avertissements = [];
let originaux = {};

before(async () => {
  reponses = reponsesDuServeur();
  if (!pret) return;
  originaux = { fetch: globalThis.fetch, warn: console.warn, setInterval: globalThis.setInterval, setTimeout: globalThis.setTimeout };
  // L'horloge partagée de l'appli (liveClock.js, lue par la pastille de provenance) arme un minuteur dès son import.
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
    const u = String(url);
    appels.push(u);
    if (!/\/api\/predictions\/calibration(\?|$)/.test(u)) {
      interdits.push(u);
      throw new Error(`fetch interdit dans ce rendu : ${u}`);
    }
    const corps = typeof scenario.reponse === 'function' ? scenario.reponse(u) : scenario.reponse;
    return { ok: scenario.statut < 400, status: scenario.statut, headers: { get: () => 'application/json' }, json: async () => JSON.parse(JSON.stringify(corps)) };
  };
  console.warn = (...a) => avertissements.push(a.map(String).join(' ').slice(0, 300));
  const { createServer } = await imp(path.join(UI, 'node_modules', 'vite', 'dist', 'node', 'index.js'));
  const vuePlugin = (await imp(path.join(UI, 'node_modules', '@vitejs', 'plugin-vue', 'dist', 'index.mjs'))).default;
  const { renderToString } = await imp(path.join(UI, 'node_modules', 'vue', 'server-renderer', 'index.mjs'));
  const { createSSRApp, h } = await imp(path.join(UI, 'node_modules', 'vue', 'index.mjs'));
  const { createPinia } = await imp(path.join(UI, 'node_modules', 'pinia', 'dist', 'pinia.mjs'));
  const prefetch = {
    name: 'ssr-prefetch',
    enforce: 'pre',
    transform(code, id) {
      if (!/CalibrationPanel\.vue$/.test(id) || id.includes('?')) return null;
      return code.replace(/import \{ ([^}]*)\bonMounted\b([^}]*)\} from 'vue';/, (m, a, b) => `import { ${a}onMounted, onServerPrefetch${b}} from 'vue';`).replace(/onMounted\(/g, 'onServerPrefetch(');
    }
  };
  fs.mkdirSync(RACINE_ESSAIS, { recursive: true });
  const cache = fs.mkdtempSync(path.join(RACINE_ESSAIS, 'cm-rendu-calibration-'));
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
  const Bloc = (await vite.ssrLoadModule('/src/components/analysis/CalibrationPanel.vue')).default;
  const { useFavoritesStore } = await vite.ssrLoadModule('/src/stores/favoritesStore.js');
  contexte = {
    vite,
    cache,
    async rendre({ reponse, statut = 200, favoris = null }) {
      scenario = { reponse, statut };
      const avant = avertissements.length;
      const app = createSSRApp({ render: () => h(Bloc) });
      const pinia = createPinia();
      app.use(pinia);
      if (favoris) useFavoritesStore(pinia).$patch({ teams: [], leagues: favoris, loaded: true });
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

/** Les tableaux d'un rendu, et les rangées du corps et du pied de chacun. */
const tableaux = (html) => html.split('<table').slice(1).map((t) => t.split('</table>')[0]);
const corps = (t) => (t.split('<tbody')[1] ?? '').split('</tbody>')[0].split(/<tr\b/).slice(1).map((x) => `<tr${x}`);
const pied = (t) => (t.split('<tfoot')[1] ?? '').split('</tfoot>')[0].split(/<tr\b/).slice(1).map((x) => `<tr${x}`);

// ============================================== 1. les règles de l'écran

test('règles : mois, pourcentages, écarts en points (vrai signe moins, pluriel à 2), valeurs de clôture, jour et heure de Paris', () => {
  assert.equal(R.moisDit('2026-10'), 'octobre 2026');
  assert.equal(R.moisDit(null), 'mois inconnu');
  assert.equal(sansEspaces(R.pourcentDit(0.6123)), '61,2 %');
  assert.equal(R.pourcentDit(null), 'pas mesuré');
  assert.equal(R.ecartDit(-0.0231), '−2,3 points');
  assert.equal(R.ecartDit(0.004), '+0,4 point');
  assert.equal(R.ecartDit(-0.00001), '+0,0 point', 'un écart nul ne s’écrit jamais −0');
  assert.equal(R.ecartDit(0.02), '+2,0 points');
  assert.equal(R.ecartDit(0.015), '+1,5 point', 'singulier sous 2');
  assert.equal(R.cloturePourcentDit(-3.5054), '−3,5 %');
  assert.equal(R.cloturePourcentDit(null), 'pas mesurée');
  assert.equal(R.jourHeureDit('2026-10-05T12:00:00.000Z'), '05/10/2026 à 14 h 00', 'heure d’été de Paris');
  assert.equal(R.jourHeureDit('2026-11-01T05:10:00.000Z'), '01/11/2026 à 06 h 10', 'heure d’hiver');
  assert.equal(R.jourDit('2026-11-01'), '01/11/2026');
  assert.equal(R.pluriel(1, 'match', 'matchs'), '1 match');
  assert.equal(sansEspaces(R.pluriel(1764, 'match', 'matchs')), '1 764 matchs');
});

test('règles : les verdicts — rouge pour un écart prouvé, ambre pour « trop peu de matchs (N sur 200) », sans ton dans le hasard ; jamais de vert, ni pour la valeur de clôture', () => {
  assert.deepEqual(R.jugeDit({ verdict: 'trop-peu', matchs: 37, minimum: 200 }).texte, 'trop peu de matchs (37 sur 200)');
  assert.equal(R.jugeDit({ verdict: 'trop-peu', matchs: 37, minimum: 200 }).ton, 'is-warning');
  const haut = R.jugeDit({ verdict: 'trop-haut', matchs: 400, minimum: 200, ecart: -0.122, fourchette: [-0.194, -0.05], variantes: 9 });
  assert.deepEqual([haut.texte, haut.ton], ['annonce trop haut', 'is-danger']);
  assert.match(haut.detail, /promet trop\. Écart −12,2 points, fourchette \[−19,4 ; −5,0\] points, 400 matchs, 9 cases jugées ensemble\.$/);
  assert.deepEqual([R.jugeDit({ verdict: 'trop-bas', matchs: 300, variantes: 2 }).ton, R.jugeDit({ verdict: 'dans-le-hasard', matchs: 300, variantes: 2 }).ton], ['is-danger', '']);
  assert.equal(R.jugeDit(null).texte, 'pas jugé');
  for (const v of ['positive', 'negative', 'dans-le-hasard', 'trop-peu']) assert.notEqual(R.jugeDeClotureDit({ verdict: v, matchs: 250, minimum: 200 }).ton, 'is-accent', v);
  assert.equal(R.jugeDeClotureDit({ verdict: 'negative' }).ton, 'is-danger');
  assert.equal(R.jugeDeClotureDit({ verdict: 'positive' }).ton, '', 'une valeur de clôture positive n’est pas une value : pas de vert');
  for (const v of Object.values(R.VERDICTS)) assert.notEqual(v.ton, 'is-accent');
  assert.match(R.SEULS_TROIS_MARCHES, /^Seuls le 1N2, le plus\/moins de buts et « les deux équipes marquent » ont des cotes de clôture gratuites/);
});

test('règles : l’état du mois (figé, en cours, pas encore figé), dix tranches toujours, le tableau des championnats (Σ des comptes, pourcentages de tous les pronostics, ⌀ par championnat), les mois figés', () => {
  const fige = reponses.fige;
  const enCours = reponses.enCours;
  assert.equal(R.etatDuBilan(fige.bilan, { prochainGel: fige.prochainGel, version: fige.version }).phrase, 'Figé le 05/10/2026 à 14 h 00 : ce bilan ne sera jamais recalculé.');
  assert.match(R.etatDuBilan({ ...fige.bilan, version: 1 }, { version: 2 }).phrase, /version 1 du calcul \(l’appli est à la 2\) : à comparer avec prudence/);
  const e = R.etatDuBilan(enCours.bilan, { prochainGel: enCours.prochainGel, version: enCours.version });
  assert.deepEqual([e.titre, e.ton], ['En cours', 'is-info']);
  assert.match(e.phrase, /^Mois en cours, préparé par l’actualisation le 05\/10\/2026 à 14 h 00, matchs jusqu’au 05\/10\/2026 : il bouge encore\. Il sera figé le 01\/11\/2026 à partir de 6 h, à la première actualisation\.$/);
  assert.equal(R.etatDuBilan({ ...enCours.bilan, enCours: false }).titre, 'Pas encore figé');
  // Les dix tranches, toujours les dix ; une tranche vide le dit.
  const t = R.lignesDesTranches(fige.bilan.vues.premiere.global);
  assert.equal(t.length, 10);
  assert.deepEqual(t.filter((x) => x.vide).map((x) => x.annonce), Array(t.filter((x) => x.vide).length).fill('aucun pronostic'));
  assert.equal(t[6].tranche.replace(/[  ]/g, ' '), '60 – 70 %');
  // Le tableau des championnats.
  const vue = fige.bilan.vues.premiere;
  const tab = R.tableauDesChampionnats(vue);
  assert.equal(tab.lignes.length, vue.parChampionnat.length);
  assert.equal(sansEspaces(tab.total.pronostics), sansEspaces(R.nombreDit(vue.parChampionnat.reduce((s, l) => s + l.pronostics, 0))));
  assert.equal(tab.total.annonce, R.pourcentDit(vue.global.annonce), 'le % du total : celui de tous les pronostics, jamais une somme');
  const moyenne = vue.parChampionnat.reduce((s, l) => s + l.realise, 0) / vue.parChampionnat.length;
  assert.equal(tab.moyenne.realise, R.pourcentDit(moyenne));
  // Deux championnats très inégaux : le total pèse chaque pronostic (celui de tous les pronostics), la moyenne pèse
  // chaque championnat — les deux se distinguent nettement.
  const inegaux = R.tableauDesChampionnats({
    parChampionnat: [
      { league: 'A', pronostics: 10, matchs: 5, annonce: 0.5, realise: 0.9, ecart: 0.4 },
      { league: 'B', pronostics: 90, matchs: 45, annonce: 0.5, realise: 0.5, ecart: 0 }
    ],
    global: { pronostics: 100, matchs: 50, annonce: 0.5, realise: 0.54, ecart: 0.04 }
  });
  assert.deepEqual(
    [inegaux.total.pronostics, inegaux.total.matchs, sansEspaces(inegaux.total.realise), inegaux.total.ecart],
    ['100', '50', '54,0 %', '+4,0 points']
  );
  assert.deepEqual(
    [inegaux.moyenne.pronostics, inegaux.moyenne.matchs, sansEspaces(inegaux.moyenne.annonce), sansEspaces(inegaux.moyenne.realise), inegaux.moyenne.ecart],
    ['50,0', '25,0', '50,0 %', '70,0 %', '+20,0 points']
  );
  const vide = R.tableauDesChampionnats(null);
  assert.deepEqual([vide.lignes.length, vide.total.pronostics, vide.moyenne.annonce], [0, '0', 'pas mesuré']);
  // Les favoris d'abord (l'ordre donné par le magasin des favoris), le total inchangé.
  const ordonne = R.tableauDesChampionnats(vue, { ordonner: (l) => [...l].reverse() });
  assert.deepEqual(ordonne.lignes.map((l) => l.cle), [...tab.lignes.map((l) => l.cle)].reverse());
  assert.deepEqual(ordonne.total, tab.total);
  // Les mois figés : leurs chiffres tels que figés.
  const mois = R.lignesDesMoisFiges(enCours.figes);
  assert.deepEqual(mois.map((m) => [m.cle, m.mois, m.figeLe]), [['2026-09', 'septembre 2026', '05/10/2026 à 14 h 00']]);
  // La courbe : une tranche avec des pronostics = un point, son nombre de matchs.
  const pts = R.pointsDeLaCourbe(vue.global);
  assert.deepEqual(pts.map((p) => p.n), vue.global.tranches.filter((x) => x.pronostics > 0).map((x) => x.matchs));
  assert.equal(R.casDuMarche(vue, 'result').marche, 'result');
  assert.equal(R.casDuMarche(vue, 'inconnu'), null);
  assert.equal(R.optionsDesMarches(vue)[0].value, 'tous');
});

// ============================================== 2. le bloc

test('écran : le mois en cours — son état, les chiffres clés, la courbe et ses dix tranches, les marchés, les championnats (Σ, ⌀), la valeur de clôture et la phrase des trois marchés, les écartés, le mois figé dans la liste, la provenance ; une seule lecture, rien d’autre', options, async () => {
  appels.length = 0;
  interdits.length = 0;
  const r = await contexte.rendre({ reponse: reponses.enCours });
  assert.deepEqual(r.avertissements, []);
  assert.deepEqual(interdits, []);
  assert.deepEqual(appels.map((u) => u.replace(/^.*\/api/, '/api')), ['/api/predictions/calibration'], 'une seule lecture, sans mois : le mois en cours');
  const tx = r.texte;
  for (const morceau of [
    'Calibration du mois',
    'octobre 2026 · en cours',
    'Première valeur',
    'Dernière avant le coup d’envoi',
    'En cours',
    'Pronostics réglés',
    'Annoncé',
    'Réalisé',
    'Écart',
    'Clôture des pronostics',
    'Clôture de vos paris',
    'Annoncé et réalisé, tranche par tranche',
    'Par marché',
    'Par championnat',
    'Σ Total',
    '⌀ Par championnat',
    'Valeur de clôture du mois',
    'Pronostics gelés qui n’entrent pas dans cette lecture',
    'Mois précédents',
    'septembre 2026',
    'Pronostics gelés du moteur · magasin FotMob · cotes gratuites archivées'
  ]) assert.ok(tx.includes(morceau), `manque : ${morceau}`);
  assert.ok(tx.includes(R.SEULS_TROIS_MARCHES), 'la phrase des trois marchés cotés gratuitement');
  assert.match(tx, /Mois en cours, préparé par l’actualisation le 05\/10\/2026 à 14 h 00/);
  assert.doesNotMatch(r.html, /data-raison-sans-bilan/, 'un bilan est là : aucune raison d’absence à dire');
  const b = reponses.enCours.bilan;
  assert.match(tx, new RegExp(`sur ${b.pronostics.geles} gelés`), 'les pronostics gelés du mois');
  const [tranches, marches, ligues, mois] = tableaux(r.html);
  assert.equal(corps(tranches).length, 10, 'les dix tranches');
  assert.ok(corps(tranches).filter((x) => /aucun pronostic/.test(x)).length >= 1);
  assert.ok(corps(tranches).every((x) => /trop peu de matchs \(\d+ sur 200\)/.test(texteDe(x))), 'octobre : chaque tranche trop maigre pour juger');
  assert.equal(corps(marches).length, b.vues.premiere.parMarche.length);
  assert.match(texteDe(pied(marches)[0]), /^Σ Tous les marchés/);
  assert.equal(corps(ligues).length, b.vues.premiere.parChampionnat.length);
  assert.deepEqual(pied(ligues).map((x) => texteDe(x).split(' ')[0]), ['Σ', '⌀']);
  assert.equal(corps(mois).length, 1);
  assert.match(texteDe(corps(mois)[0]), /^septembre 2026 05\/10\/2026 à 14 h 00/);
  assert.match(tx, /1 pari sur un match à venir : sa clôture n’est pas encore connue\./);
  assert.match(tx, /Corners ou tirs non relevés au magasin \(absents, ou 0 des deux côtés\) : 13/);
  assert.match(tx, /Versions du moteur \(première valeur des pronostics joués\) : sans version : \d+/);
  // Aucun vert, nulle part : ce n'est pas une value.
  assert.doesNotMatch(r.html, /is-accent|cm-positive/);
  assert.match(r.html, /role="radiogroup"/);
  assert.match(r.html, /aria-checked="true"[^>]*>\s*Première valeur/);
  assert.match(r.html, /class="helptip__btn"[^>]*aria-label="Qu&#39;est-ce que « Calibration » \?"/);
});

test('écran : un mois figé — « figé le … : jamais recalculé », les verdicts du juge (le domicile annoncé trop haut, le reste dans le hasard ou trop maigre), la valeur de clôture mesurée des pronostics et des paris', options, async () => {
  const r = await contexte.rendre({ reponse: reponses.fige });
  assert.deepEqual(r.avertissements, []);
  const tx = r.texte;
  assert.ok(tx.includes('Figé le 05/10/2026 à 14 h 00 : ce bilan ne sera jamais recalculé.'));
  assert.ok(tx.includes('septembre 2026 · figé le 05/10'));
  const [, marches] = tableaux(r.html);
  const resultat = corps(marches).find((x) => /Résultat \(1N2\)/.test(x));
  assert.match(texteDe(resultat), /annonce trop haut$/);
  assert.match(resultat, /class="is-danger cm-chip calib__juge"/);
  assert.match(texteDe(pied(marches)[0]), /dans le hasard$/);
  const c = reponses.fige.bilan.vues.premiere.cloture;
  assert.ok(tx.includes(`${R.cloturePourcentDit(c.moyenne)} sur 9 pronostics mesurés`.replace(/[  ]/g, ' ')), 'la valeur de clôture des pronostics');
  assert.match(tx, /Résultat \(1N2\) : [+−]\d+,\d % sur 3/);
  assert.match(tx, /sur 2 paris simples mesurés \(\d au-dessus de zéro\), 3 paris simples ce mois-là/);
  assert.match(tx, /1 combiné non mesuré : un combiné n’a pas de valeur de clôture d’ensemble\./);
  assert.match(r.html, /class="(?:is-choisi calib__mois-ligne|calib__mois-ligne is-choisi)"/, 'le mois regardé est marqué dans la liste');
  assert.doesNotMatch(r.html, /is-accent|cm-positive/);
});

test('écran : un mois sans aucun pronostic gelé, puis le serveur en panne — la structure reste (chiffres clés, dix tranches, tableaux, totaux), ce qui manque est dit', options, async () => {
  const vide = await contexte.rendre({ reponse: reponses.vide });
  assert.deepEqual(vide.avertissements, []);
  assert.ok(vide.texte.includes('Pronostics réglés 0 sur 0 gelé · 0 match'));
  assert.ok(vide.texte.includes('Aucun pronostic réglé pour l’instant.'));
  assert.ok(vide.texte.includes('Aucun championnat : aucun pronostic réglé pour l’instant.'));
  assert.ok(vide.texte.includes('aucun pronostic mesuré'));
  const [tranches, , ligues] = tableaux(vide.html);
  assert.equal(corps(tranches).length, 10, 'les dix tranches, même vides');
  assert.deepEqual(pied(ligues).map((x) => texteDe(x).split(' ')[0]), ['Σ', '⌀']);
  const panne = await contexte.rendre({ reponse: { error: 'Calibration indisponible pour l’instant : base occupée' }, statut: 503 });
  assert.ok(panne.texte.includes('Calibration indisponible'));
  assert.ok(panne.texte.includes('Calibration indisponible pour l’instant : base occupée'));
  for (const morceau of ['Pronostics réglés', 'Annoncé', 'Réalisé', 'Par championnat', 'Σ Total', 'Mois précédents']) assert.ok(panne.texte.includes(morceau), `panne, manque : ${morceau}`);
  assert.equal(tableaux(panne.html).length, 4, 'les quatre tableaux, même sans réponse');
});

test('écran (étape 24) : avant la préparation de la nuit, le mois en cours dit « pas encore mesuré » et pourquoi ; la route n’a rien calculé, les dix tranches et les tableaux restent', options, async () => {
  const r0 = reponses.avantLaNuit;
  assert.equal(r0.bilan, null, 'la route ne calcule plus le mois en cours');
  assert.equal(r0.preparation.etat, 'absente');
  assert.equal(r0.tranches.length, 10);
  const e = R.etatDuBilan(r0.bilan, { prochainGel: r0.prochainGel, version: r0.version });
  assert.deepEqual([e.titre, e.ton], ['Pas encore mesuré', 'is-warning']);
  assert.match(e.phrase, /la raison est juste en dessous/);
  assert.match(R.raisonDeLAbsence(r0.preparation), /^Pas encore mesuré : le bilan du mois en cours est préparé chaque nuit par l’actualisation/);
  // Chaque raison de la route a ses mots ; sans raison (un bilan est là, ou rien reçu), rien à dire.
  for (const [etat, debutDeLaPhrase] of [['illisible', 'Le bilan préparé du mois en cours ne se lit pas'], ['ancienne', 'Le bilan préparé date d’un autre mois'], ['a-figer', 'Mois terminé, pas encore figé'], ['sans-pronostic', 'Aucun pronostic du moteur']]) {
    assert.ok(R.raisonDeLAbsence({ etat }).startsWith(debutDeLaPhrase), etat);
  }
  assert.equal(R.raisonDeLAbsence({ etat: 'prepare' }), null);
  assert.equal(R.raisonDeLAbsence(null), null);
  assert.deepEqual([R.etatDuBilan(null).titre, R.etatDuBilan(null).ton], ['Pas encore lu', 'is-warning'], 'rien reçu du serveur');
  // Les dix tranches sont celles du serveur (les dixièmes de metrics.js), vides sans bilan.
  const { TRANCHES_DIXIEMES } = await imp(path.join(SERVEUR, 'src', 'bench', 'metrics.js'));
  assert.deepEqual(R.DIX_TRANCHES.map((t) => ({ ...t })), TRANCHES_DIXIEMES.map((t) => ({ ...t })));
  assert.deepEqual(r0.tranches, TRANCHES_DIXIEMES.map((t) => ({ de: t.de, a: t.a })));
  const dix = R.lignesDesTranches(null);
  assert.equal(dix.length, 10);
  assert.ok(dix.every((t) => t.vide && t.annonce === 'aucun pronostic'));
  const rendu = await contexte.rendre({ reponse: r0 });
  assert.deepEqual(rendu.avertissements, []);
  assert.ok(rendu.texte.includes('Pas encore mesuré'));
  assert.ok(rendu.texte.includes('Le prochain passage l’écrira'));
  assert.match(rendu.html, /data-raison-sans-bilan/, 'la raison de l’absence est dite à part');
  assert.ok(rendu.texte.includes('Pronostics réglés 0 sur 0 gelé · 0 match'));
  const [tranches] = tableaux(rendu.html);
  assert.equal(corps(tranches).length, 10, 'les dix tranches, même sans bilan');
  assert.equal(tableaux(rendu.html).length, 4, 'les quatre tableaux');
});

// ============================================== 3. le câblage

test('câblage : Historique moteur pose le bloc après la valeur de clôture ; le service lit la route (mois encodé) ; la courbe est celle du banc d’essai, jamais recopiée ; aucune écriture', () => {
  const vue = fs.readFileSync(path.join(UI, 'src', 'views', 'PredictionsHistoryView.vue'), 'utf8');
  assert.match(vue, /import CalibrationPanel from '@\/components\/analysis\/CalibrationPanel\.vue';/);
  assert.ok(vue.indexOf('<ClosingValuePanel scope="predictions" />') < vue.indexOf('<CalibrationPanel />'), 'juste après la valeur de clôture');
  const service = fs.readFileSync(path.join(UI, 'src', 'services', 'predictionsApi.js'), 'utf8');
  assert.match(service, /calibration: \(mois = null\) => httpClient\.get\(mois \? `\/predictions\/calibration\?mois=\$\{encodeURIComponent\(mois\)\}` : '\/predictions\/calibration'\)/);
  const bloc = fs.readFileSync(path.join(UI, 'src', 'components', 'analysis', 'CalibrationPanel.vue'), 'utf8');
  assert.match(bloc, /import CalibrationChart from '@\/components\/analysis\/CalibrationChart\.vue';/);
  assert.doesNotMatch(bloc, /<svg|<circle|<line /, 'aucun dessin recopié : la courbe du banc d’essai');
  assert.doesNotMatch(bloc, /httpClient\.(post|put|patch|delete)|predictionsApi\.(record|updateStatus|remove)/);
  assert.match(bloc, /<HelpTip terme="calibration" \/>/);
  assert.doesNotMatch(bloc, /#[0-9a-f]{3,6}\b|!important|--cm-section-soft\)/i, 'jetons seulement, et pas le fond « soft » émeraude');
});
