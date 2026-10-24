/**
 * Le bloc « Carnet de l'IA » d'Historique moteur (étape 21 du plan, 14/10/2026) : ses règles et son rendu.
 *   node --test test/aiScorecardEcran.test.mjs        (depuis server/)
 *
 * Les réponses de GET /api/match-ai/scorecard sont celles du VRAI serveur : la phase « ecran » de
 * test/aides/script-carnet-ia.mjs les produit dans une copie isolée (analyses de l'IA fabriquées, aucun appel à
 * Claude, base d'essai, heure figée au 05/10/2026) — pas encore calculé, calculé (deux marchés coupés), d'un
 * autre seuil, illisible (503). Le rendu est fait côté serveur, sans navigateur ni serveur de développement :
 * `fetch` remplacé (seule la route du carnet répond, tout le reste est refusé et compté), un Vite « middleware »
 * n'écoute sur aucun port, son cache va dans le dossier d'essais, rien n'est écrit dans ui/. Comme pour les
 * autres cartes, `onMounted` devient `onServerPrefetch` dans le rendu.
 *
 *  1. Les règles de l'écran (ui/src/utils/carnetIA.js) : avis tenus, verdicts face au moteur seul (jamais
 *     vert), états, clôture, onze types toujours, Σ et ⌀, trois confiances, deux fiches.
 *  2. Le bloc dans chacun de ses états : calculé, pas encore calculé, à recalculer, serveur en panne — la
 *     structure toujours là.
 *  3. Le câblage : Historique moteur (après la calibration), le service, aucune écriture.
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
const R = await imp(path.join(UI, 'src', 'utils', 'carnetIA.js'));

/**
 * Les réponses du vrai serveur, produites une fois dans une copie isolée. `actif` : la coupure ACTIVÉE dans la
 * copie du code (COUPURE_ACTIVE = true dans SA copie de aiScorecard.js), jamais dans le code du bac.
 */
function reponsesDuServeur({ actif = false } = {}) {
  const copie = preparerCopie({});
  try {
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    if (actif) {
      const fichier = path.join(copie.serveur, 'src', 'data', 'aiScorecard.js');
      const texte = fs.readFileSync(fichier, 'utf8');
      assert.equal(texte.split('export const COUPURE_ACTIVE = false;').length, 2);
      fs.writeFileSync(fichier, texte.replace('export const COUPURE_ACTIVE = false;', 'export const COUPURE_ACTIVE = true;'));
    }
    const r = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-carnet-ia.mjs'), { args: ['ecran'], timeout: 300_000, env: { CLAUDE_CODE_BIN: path.join(copie.dossier, 'pas-de-claude-ici.exe'), MATCH_STATS_AUTO_REFRESH: 'false' } });
    assert.equal(r.code, 0, r.erreurs.slice(-3000));
    assert.equal(r.reseau, false);
    assert.equal(r.json.reponses.calcule.coupureActive, actif);
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
    .replace(/[  ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const sansEspaces = (s) => String(s).replace(/[  ]/g, ' ');
const tableaux = (html) => html.split('<table').slice(1).map((t) => t.split('</table>')[0]);
const corps = (t) => (t.split('<tbody')[1] ?? '').split('</tbody>')[0].split(/<tr\b/).slice(1).map((x) => `<tr${x}`);
const pied = (t) => (t.split('<tfoot')[1] ?? '').split('</tfoot>')[0].split(/<tr\b/).slice(1).map((x) => `<tr${x}`);

let reponses;
let reponsesActives;
let contexte;
let scenario = { reponse: null, statut: 200 };
const appels = [];
const interdits = [];
const avertissements = [];
let originaux = {};

before(async () => {
  reponses = reponsesDuServeur();
  reponsesActives = reponsesDuServeur({ actif: true });
  if (!pret) return;
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
  globalThis.fetch = async (url) => {
    const u = String(url);
    appels.push(u);
    if (!/\/api\/match-ai\/scorecard$/.test(u)) {
      interdits.push(u);
      throw new Error(`fetch interdit dans ce rendu : ${u}`);
    }
    return { ok: scenario.statut < 400, status: scenario.statut, headers: { get: () => 'application/json' }, json: async () => JSON.parse(JSON.stringify(scenario.reponse)) };
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
      if (!/AiScorecardPanel\.vue$/.test(id) || id.includes('?')) return null;
      return code.replace(/import \{ ([^}]*)\bonMounted\b([^}]*)\} from 'vue';/, (m, a, b) => `import { ${a}onMounted, onServerPrefetch${b}} from 'vue';`).replace(/onMounted\(/g, 'onServerPrefetch(');
    }
  };
  fs.mkdirSync(RACINE_ESSAIS, { recursive: true });
  const cache = fs.mkdtempSync(path.join(RACINE_ESSAIS, 'cm-rendu-carnet-ia-'));
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
  const Bloc = (await vite.ssrLoadModule('/src/components/analysis/AiScorecardPanel.vue')).default;
  contexte = {
    vite,
    cache,
    async rendre({ reponse, statut = 200 }) {
      scenario = { reponse, statut };
      const avant = avertissements.length;
      const app = createSSRApp({ render: () => h(Bloc) });
      app.use(createPinia());
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

// ============================================== 1. les règles de l'écran

test('règles : avis tenus, avis donnés, verdicts face au moteur seul (jamais de vert ; ambre « trop peu de matchs (N sur 200) »), états (« serait retiré » quand la coupure est désactivée), clôture, la règle et la phrase de la décision', () => {
  assert.equal(sansEspaces(R.tenusDits(12, 17)), '12 sur 17 (70,6 %)');
  assert.equal(R.tenusDits(0, 0), 'aucun avis compté');
  assert.equal(R.tauxDit(1, 3).replace(/[  ]/g, ' '), '33,3 %');
  assert.equal(R.tauxDit(1, 0), '—');
  assert.equal(R.avisDits({ confirme: 28, nuance: 30, contredit: 1 }), '28 confirme · 30 nuance · 1 contredit');
  assert.equal(R.avisDits(null), '0 confirme · 0 nuance · 0 contredit');
  const peu = R.faceAuMoteurDit({ verdict: 'pas-assez-de-matchs', matchs: 37, minimum: 200 });
  assert.deepEqual([peu.texte, peu.ton], ['trop peu de matchs (37 sur 200)', 'is-warning']);
  assert.deepEqual([R.faceAuMoteurDit({ verdict: 'retenu', matchs: 230 }).ton, R.faceAuMoteurDit({ verdict: 'moins-bon', matchs: 230 }).ton, R.faceAuMoteurDit({ verdict: 'pas-prouve', matchs: 230 }).ton], ['is-info', 'is-danger', '']);
  assert.match(R.faceAuMoteurDit({ verdict: 'pas-prouve', matchs: 230, fourchette: [-0.01, 0.02], variantes: 3 }).detail, /^Sur 230 matchs, ses avis ne font pas mieux que le moteur seul : l’écart reste dans le hasard\. Fourchette \[−0,01 ; \+0,02\] par avis, 3 marchés jugés ensemble\.$/);
  assert.equal(R.faceAuMoteurDit(null).texte, 'aucun avis compté');
  for (const v of ['retenu', 'moins-bon', 'pas-prouve', 'pas-assez-de-matchs']) assert.notEqual(R.faceAuMoteurDit({ verdict: v, matchs: 1 }).ton, 'is-accent', v);
  // Les états : retiré (coupure activée), ou ce que la règle ferait (coupure désactivée).
  assert.deepEqual(R.etatDit('coupe', null, { retire: true }), { texte: 'l’IA n’apporte rien ici, elle ne commente plus', ton: 'is-warning', coupe: true, seraitRetire: false });
  assert.deepEqual(R.etatDit('coupe', null, { retire: false }), { texte: 'serait retiré : l’IA n’apporte rien ici', ton: 'is-warning', coupe: false, seraitRetire: true });
  assert.equal(R.etatDit('garde').ton, 'is-info');
  assert.equal(R.etatDit('inconnu').texte, 'aucun avis compté : elle commente');
  assert.equal(R.clotureDite(null, { avecCloture: false }).texte, 'pas de cote gratuite');
  assert.equal(R.clotureDite({ mesures: 0 }).texte, 'aucun avis mesuré');
  const cl = R.clotureDite({ mesures: 28, dansSonSens: 16, contre: 11, immobile: 1, moyenneIA: 1.97, moyenneMoteur: 1.5, approx: 2 });
  assert.equal(cl.texte, '16 dans son sens · 11 contre · 1 sans mouvement');
  assert.equal(sansEspaces(cl.moyenne), '+2,0 %');
  assert.match(sansEspaces(cl.detail), /^28 avis mesurés entre l’heure de l’analyse et la clôture \(2 au prix d’ouverture, faute de relevé daté\)\. Valeur de clôture moyenne en suivant l’IA : \+2,0 % \(moteur seul : \+1,5 %\)\.$/);
  assert.match(R.regleDeCoupure(200), /^Un marché n’est retiré de la liste de l’IA que sur preuve : au moins 200 matchs jugés/);
  // La phrase de la décision : la coupure désactivée, c'est elle qui parle, avec ce que la règle ferait.
  assert.equal(R.DECISION_EN_ATTENTE, 'Aucun marché n’est retiré pour l’instant : c’est à vous de décider de la règle.');
  const types = [{ marketType: 'totalCorners', label: 'Total corners' }];
  assert.equal(R.coupesDites(null, { coupureActive: false }), R.DECISION_EN_ATTENTE);
  assert.equal(R.coupesDites({ coupureActive: false, coupes: [], seraientRetires: ['totalCorners'], types }), `${R.DECISION_EN_ATTENTE} Si la règle était en service, elle retirerait : Total corners.`);
  assert.equal(R.coupesDites({ coupureActive: false, coupes: [], seraientRetires: [], types }), `${R.DECISION_EN_ATTENTE} Même en service, la règle ne retirerait aucun marché aujourd’hui.`);
  assert.equal(R.coupesDites({ coupureActive: true, coupes: [] }), 'Aucun marché retiré : l’IA commente tous les marchés de sa liste.');
  assert.equal(R.coupesDites({ coupureActive: true, coupes: ['totalCorners'], types }), 'Retiré de la liste de l’IA dès sa prochaine analyse : Total corners.');
  // Le juge « réalisé face à annoncé » (les nuances, pour information) : jamais de vert.
  const moins = R.realiseFaceAAnnonceDit({ verdict: 'moins-bon', matchs: 220, ecart: -0.3, fourchette: [-0.37, -0.23], variantes: 4 });
  assert.deepEqual([moins.texte, moins.ton], ['arrive moins souvent qu’annoncé', 'is-warning']);
  assert.match(sansEspaces(moins.detail), /^Au-delà du hasard\. Écart réalisé − annoncé : −30,0 points, fourchette \[−37,0 points ; −23,0 points\], 220 matchs, 4 cases jugées ensemble\.$/);
  assert.deepEqual([R.realiseFaceAAnnonceDit({ verdict: 'retenu', matchs: 220 }).ton, R.realiseFaceAAnnonceDit({ verdict: 'pas-prouve', matchs: 220 }).texte], ['is-info', 'dans le hasard']);
  assert.equal(R.realiseFaceAAnnonceDit({ verdict: 'pas-assez-de-matchs', matchs: 12, minimum: 200 }).texte, 'trop peu de matchs (12 sur 200)');
  assert.equal(R.realiseFaceAAnnonceDit(null).texte, 'aucun avis');
  for (const v of ['retenu', 'moins-bon', 'pas-prouve', 'pas-assez-de-matchs']) assert.notEqual(R.realiseFaceAAnnonceDit({ verdict: v, matchs: 1 }).ton, 'is-accent', v);
});

test('règles : onze types toujours (un type vide le dit), le total du carnet ; par championnat Σ (les comptes, le pourcentage de tous les avis) et ⌀ (chaque ligne pèse autant) ; trois confiances, deux fiches, toujours ; les « nuance » marché par marché, avec leur juge', () => {
  const c = reponses.calcule.carnet;
  const t = R.tableauDesTypes(c, { types: reponses.calcule.typesDeMarche });
  assert.equal(t.lignes.length, 11);
  assert.deepEqual(t.lignes.filter((l) => l.vide).map((l) => l.cle), ['resultAndTotal', 'teamGoals', 'teamShots', 'teamShotsOnTarget']);
  assert.ok(t.lignes.filter((l) => l.vide).every((l) => l.tenus === 'aucun avis compté' && l.juge.texte === 'aucun avis compté'));
  // La coupure désactivée : rien de retiré, deux marchés que la règle retirerait.
  assert.deepEqual(t.lignes.filter((l) => l.etat.coupe).map((l) => l.cle), []);
  assert.deepEqual(t.lignes.filter((l) => l.etat.seraitRetire).map((l) => l.cle), ['totalCorners', 'totalShotsOnTarget']);
  assert.ok(t.lignes.filter((l) => l.etat.seraitRetire).every((l) => l.etat.texte === 'serait retiré : l’IA n’apporte rien ici'));
  // La coupure activée (dans la copie) : les deux mêmes, retirés.
  const ta = R.tableauDesTypes(reponsesActives.calcule.carnet, { types: reponsesActives.calcule.typesDeMarche });
  assert.deepEqual(ta.lignes.filter((l) => l.etat.coupe).map((l) => l.cle), ['totalCorners', 'totalShotsOnTarget']);
  assert.deepEqual(ta.lignes.filter((l) => l.etat.seraitRetire).map((l) => l.cle), []);
  assert.equal(sansEspaces(t.total.tenus), sansEspaces(R.tenusDits(c.total.bilan.aiRight, c.total.bilan.aiVerdicts)));
  assert.equal(R.tableauDesTypes(null).lignes.length, 11, 'même sans carnet');
  const l = R.tableauDesChampionnats(c);
  assert.equal(l.lignes.length, c.parChampionnat.length);
  const comptes = c.parChampionnat.reduce((s, x) => s + x.bilan.aiVerdicts, 0);
  const tenus = c.parChampionnat.reduce((s, x) => s + x.bilan.aiRight, 0);
  assert.equal(sansEspaces(l.total.comptes), sansEspaces(R.nombreDit(comptes)));
  assert.equal(sansEspaces(l.total.tenus), sansEspaces(R.tenusDits(tenus, comptes)), 'le % de tous les avis, jamais une somme de pourcentages');
  // Deux lignes très inégales : le total pèse chaque avis, la moyenne pèse chaque ligne.
  const inegal = R.tableauDesChampionnats({ parChampionnat: [{ marketType: 'result', league: 'A', bilan: { aiVerdicts: 10, aiRight: 9 } }, { marketType: 'result', league: 'B', bilan: { aiVerdicts: 90, aiRight: 45 } }] });
  assert.deepEqual([sansEspaces(inegal.total.taux), sansEspaces(inegal.moyenne.taux), inegal.moyenne.comptes, inegal.moyenne.tenus], ['54,0 %', '70,0 %', '50,0', '27,0']);
  const corners = R.tableauDesChampionnats(c, { marche: 'totalCorners' });
  assert.ok(corners.lignes.length >= 1 && corners.lignes.every((x) => x.marche === 'Total corners' && x.etat.seraitRetire && !x.etat.coupe));
  const cornersActifs = R.tableauDesChampionnats(reponsesActives.calcule.carnet, { marche: 'totalCorners' });
  assert.ok(cornersActifs.lignes.every((x) => x.etat.coupe));
  assert.deepEqual(R.lignesDeConfiance(null).map((x) => x.niveau), ['Confiance faible', 'Confiance moyenne', 'Confiance forte']);
  assert.deepEqual(R.lignesDesFiches(null).map((x) => x.cle), ['compacte', 'ancienne']);
  assert.equal(R.optionsDesTypes()[0].value, 'tous');
  assert.equal(R.optionsDesTypes().length, 12);
  assert.ok(R.ecartesDits(c).length >= 5);
  // Les « nuance », marché par marché : l'annoncé, le réalisé et le juge, pour « confirme » et pour « nuance ».
  assert.equal(sansEspaces(R.annonceDite({ n: 30, annonce: 0.442, realise: 0.3 })), '30 · annoncé 44,2 % → réalisé 30,0 %');
  assert.equal(R.annonceDite({ n: 0 }), 'aucun');
  const nu = R.lignesDesNuances(c);
  assert.deepEqual(nu.lignes.map((x) => x.cle), c.types.filter((x) => x.annonces.confirme.n || x.annonces.nuance.n).map((x) => x.marketType));
  const vide = R.lignesDesNuances(null);
  assert.deepEqual([vide.lignes, vide.total.confirmes.texte, vide.total.nuances.texte, vide.total.nuances.juge.texte], [[], 'aucun', 'aucun', 'aucun avis']);
  assert.deepEqual([nu.total.confirmes.texte, nu.total.nuances.texte], [R.annonceDite(c.total.annonces.confirme), R.annonceDite(c.total.annonces.nuance)]);
  assert.deepEqual(nu.total.confirmes.juge, R.realiseFaceAAnnonceDit(c.total.annonces.confirme.juge));
  assert.deepEqual(nu.total.nuances.juge, R.realiseFaceAAnnonceDit(c.total.annonces.nuance.juge));
  const res = nu.lignes.find((x) => x.cle === 'result');
  const brut = c.types.find((x) => x.marketType === 'result').annonces;
  assert.deepEqual([res.nuances.texte, res.nuances.juge.texte, res.confirmes.juge.texte], [R.annonceDite(brut.nuance), R.realiseFaceAAnnonceDit(brut.nuance.juge).texte, R.realiseFaceAAnnonceDit(brut.confirme.juge).texte]);
  // Les corners du volume : 230 matchs « confirme » — assez pour que le juge conclue.
  const tc = nu.lignes.find((x) => x.cle === 'totalCorners');
  assert.ok(!/trop peu de matchs/.test(tc.confirmes.juge.texte), `230 matchs : un verdict (${tc.confirmes.juge.texte})`);
});

// ============================================== 2. le bloc

test('écran : le carnet calculé, la coupure DÉSACTIVÉE — « Aucun marché n’est retiré pour l’instant : c’est à vous de décider de la règle. », ce que la règle ferait (« serait retiré »), les chiffres clés, les onze marchés, les championnats (Σ, ⌀), confiance, fiches, les « nuance » jugées, le type d’argument, les écartés, la provenance ; une seule lecture, rien d’autre', options, async () => {
  appels.length = 0;
  interdits.length = 0;
  const r = await contexte.rendre({ reponse: reponses.calcule });
  assert.deepEqual(r.avertissements, []);
  assert.deepEqual(interdits, []);
  assert.deepEqual(appels.map((u) => u.replace(/^.*\/api/, '/api')), ['/api/match-ai/scorecard']);
  const tx = r.texte;
  for (const morceau of [
    'Carnet de l’IA',
    'À jour',
    'Avis comptés',
    'Avis tenus',
    'Avis nuancés',
    'La cote dans son sens',
    'Marchés retirés',
    'règle en attente de votre décision : 2 marchés à retirer si elle était en service',
    'Aucun marché n’est retiré pour l’instant : c’est à vous de décider de la règle. Si la règle était en service, elle retirerait : Total corners, Total tirs cadrés.',
    'Par marché',
    'Face au moteur seul',
    'Σ Tous les marchés',
    'Par championnat',
    'Σ Total',
    '⌀ Par ligne',
    'Par confiance annoncée',
    'Confiance forte',
    'Par forme de fiche',
    'Fiche compacte (depuis le 06/10)',
    'Par type d’argument',
    'Type d’argument : à ajouter au prompt, décision de Pierre.',
    'Ce que disent ses avis « nuance »',
    'Jamais comptés dans les avis tenus ni pour retirer un marché',
    'Quand elle confirme',
    'Quand elle nuance',
    'Pronostics commentés qui n’entrent pas dans le carnet',
    'Analyses de l’IA · magasin FotMob · cotes gratuites archivées',
    'serait retiré : l’IA n’apporte rien ici',
    'l’IA fait mieux que le moteur seul : elle commente',
    'pas de cote gratuite'
  ]) assert.ok(tx.includes(morceau), `manque : ${morceau}`);
  assert.ok(!tx.includes('elle ne commente plus'), 'rien n’est retiré : jamais « elle ne commente plus »');
  assert.ok(!tx.includes('dès sa prochaine analyse'));
  assert.match(tx, /Calculé le 05\/10\/2026 à 14 h 00 par l’actualisation/);
  const [marches, ligues, confiance, fiches, nuances] = tableaux(r.html);
  assert.equal(corps(marches).length, 11, 'les onze types de marché');
  assert.equal(corps(marches).filter((x) => /class="[^"]*is-coupe/.test(x)).length, 0, 'aucune ligne retirée');
  assert.equal(corps(marches).filter((x) => /class="[^"]*is-serait-retire/.test(x)).length, 2);
  assert.match(texteDe(pied(marches)[0]), /^Σ Tous les marchés/);
  assert.equal(corps(ligues).length, reponses.calcule.carnet.parChampionnat.length);
  assert.deepEqual(pied(ligues).map((x) => texteDe(x).split(' ')[0]), ['Σ', '⌀']);
  assert.equal(corps(confiance).length, 3);
  assert.equal(corps(fiches).length, 2);
  // Les « nuance », marché par marché : cinq colonnes (marché, confirme et son juge, nuance et son juge).
  assert.equal(corps(nuances).length, R.lignesDesNuances(reponses.calcule.carnet).lignes.length);
  assert.ok(corps(nuances).every((x) => (x.match(/<td\b/g) ?? []).length === 5));
  assert.match(texteDe(pied(nuances)[0]), /^Σ Tous les marchés \d+ · annoncé [\d,]+ % → réalisé [\d,]+ % .+ \d+ · annoncé [\d,]+ % → réalisé [\d,]+ % .+$/);
  assert.doesNotMatch(r.html, /is-accent|cm-positive/, 'aucun vert : ce n’est pas une value');
  assert.match(r.html, /class="helptip__btn"/);
});

test('écran : la coupure ACTIVÉE (dans une copie du code) — les deux marchés retirés le disent (« elle ne commente plus »), sans la phrase d’attente', options, async () => {
  const r = await contexte.rendre({ reponse: reponsesActives.calcule });
  assert.deepEqual(r.avertissements, []);
  const tx = r.texte;
  assert.ok(tx.includes('Retirés de la liste de l’IA dès sa prochaine analyse : Total corners, Total tirs cadrés.'));
  assert.ok(tx.includes('l’IA n’apporte rien ici, elle ne commente plus'));
  assert.ok(!tx.includes('c’est à vous de décider de la règle'));
  assert.ok(!tx.includes('serait retiré'));
  const [marches] = tableaux(r.html);
  assert.equal(corps(marches).filter((x) => /class="[^"]*is-coupe/.test(x)).length, 2);
  assert.doesNotMatch(r.html, /is-accent|cm-positive/);
});

test('écran : pas encore calculé, puis d’un autre seuil, puis le serveur en panne (503) — la structure reste (onze marchés, totaux, trois confiances, deux fiches), ce qui manque est dit, et la phrase de la décision', options, async () => {
  const absent = await contexte.rendre({ reponse: reponses.absent });
  assert.deepEqual(absent.avertissements, []);
  assert.ok(absent.texte.includes('Pas encore calculé : le carnet se remplit tout seul à la prochaine actualisation'));
  assert.ok(absent.texte.includes('Aucun championnat : aucun avis réglé pour l’instant.'));
  assert.ok(absent.texte.includes('Aucun marché n’est retiré pour l’instant : c’est à vous de décider de la règle.'));
  const [m1, l1, c1, f1] = tableaux(absent.html);
  assert.deepEqual([corps(m1).length, corps(c1).length, corps(f1).length], [11, 3, 2]);
  assert.deepEqual(pied(l1).map((x) => texteDe(x).split(' ')[0]), ['Σ', '⌀']);
  const autre = await contexte.rendre({ reponse: reponses.autreSeuil });
  assert.equal(reponses.autreSeuil.aJour, false);
  assert.ok(autre.texte.includes('À recalculer'));
  assert.ok(autre.texte.includes('il ne retire aucun marché jusqu’au prochain calcul'));
  assert.equal(reponses.codeIllisible, 503);
  assert.match(reponses.illisible.error, /^Carnet de l’IA illisible pour l’instant : /);
  const panne = await contexte.rendre({ reponse: reponses.illisible, statut: 503 });
  assert.ok(panne.texte.includes('Carnet de l’IA indisponible'));
  for (const morceau of ['Par marché', 'Σ Tous les marchés', 'Par championnat', 'Par confiance annoncée', 'Par type d’argument', 'c’est à vous de décider de la règle']) assert.ok(panne.texte.includes(morceau), `panne, manque : ${morceau}`);
  assert.equal(corps(tableaux(panne.html)[0]).length, 11);
});

// ============================================== 3. le câblage

test('câblage : Historique moteur pose le carnet juste après la calibration ; le service lit la route ; le bloc n’écrit rien ; jetons seulement', () => {
  const vue = fs.readFileSync(path.join(UI, 'src', 'views', 'PredictionsHistoryView.vue'), 'utf8');
  assert.match(vue, /import AiScorecardPanel from '@\/components\/analysis\/AiScorecardPanel\.vue';/);
  assert.ok(vue.indexOf('<CalibrationPanel />') < vue.indexOf('<AiScorecardPanel />'), 'juste après la calibration');
  assert.equal((vue.match(/<AiScorecardPanel \/>/g) ?? []).length, 1, 'une seule place');
  const service = fs.readFileSync(path.join(UI, 'src', 'services', 'matchAiAnalysisApi.js'), 'utf8');
  assert.match(service, /scorecard: \(\) => httpClient\.get\('\/match-ai\/scorecard'\)/);
  const bloc = fs.readFileSync(path.join(UI, 'src', 'components', 'analysis', 'AiScorecardPanel.vue'), 'utf8');
  assert.doesNotMatch(bloc, /httpClient\.(post|put|patch|delete)|runPreMatch|runPostMatch/);
  assert.doesNotMatch(bloc, /#[0-9a-f]{3,6}\b|!important|--cm-section-soft\)/i);
  // Aucun autre écran ne recopie ce bloc : une seule place pour le BLOC « Carnet de l'IA ».
  // Étape 45 : la page « Bulletin » est la seconde place du CARNET (par marché et par championnat, avec Σ et ⌀), dans son propre composant
  // AiReliabilityTable que la page nourrit — jamais par ce bloc ni par une lecture de la route dans un composant (bulletinPageEcran.test.mjs).
  // Ces deux fichiers parlent de la route en commentaire ; ils ne montent ni n'importent AiScorecardPanel.
  const pageBulletin = /AiReliabilityTable|BulletinView/;
  const ailleurs = fs.readdirSync(path.join(UI, 'src'), { recursive: true }).filter((f) => /\.vue$/.test(String(f)) && !/AiScorecardPanel|PredictionsHistoryView/.test(String(f)));
  for (const f of ailleurs) {
    const code = fs.readFileSync(path.join(UI, 'src', String(f)), 'utf8');
    if (pageBulletin.test(String(f))) assert.doesNotMatch(code, /import AiScorecardPanel|<AiScorecardPanel/, String(f));
    else assert.doesNotMatch(code, /AiScorecardPanel|match-ai\/scorecard/, String(f));
  }
});
