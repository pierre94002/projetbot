/**
 * La carte « Historique football-data » de Réglages SE REND (étape 13 du plan).
 *   node --test test/historiqueFdEcran.test.mjs        (depuis server/)
 *
 * Les réponses de GET /api/match-stats/fd-history sont celles du VRAI serveur :
 * la phase « ecran » de test/aides/script-historique-fd.mjs importe un site
 * fabriqué dans une copie isolée de la base d'essai (jamais importé, en cours,
 * avec un fichier en échec, complet) et appelle la route (application Express,
 * sans réseau). Le rendu est fait côté serveur, sans navigateur ni serveur de
 * développement : `fetch` remplacé (seule la route de l'historique répond, tout
 * le reste est refusé et compté), un Vite « middleware » n'écoute sur aucun
 * port, son cache va dans le dossier d'essais, rien n'est écrit dans ui/.
 *
 *  1. Les règles de l'écran (utils/historiqueFd.js) : le pied du tableau (Σ, ⌀)
 *     retombe sur les totaux du serveur ; jamais une moyenne de pourcentages ;
 *     seuils, état de l'import, cotes gardées, saison par saison, écarts.
 *  2. La carte : chiffres clés, championnats, cotes, saisons, échecs, écarts,
 *     provenance ; en cours, jamais importé, serveur en erreur ou pas à jour.
 *  3. L'hygiène du composant et le câblage dans Réglages.
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
const U = await imp(path.join(UI, 'src', 'utils', 'historiqueFd.js'));

/** Les réponses du vrai serveur, produites une fois dans une copie isolée. */
function reponsesDuServeur() {
  const copie = preparerCopie({});
  try {
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    const r = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-historique-fd.mjs'), { args: ['ecran'], timeout: 300_000 });
    assert.equal(r.code, 0, r.erreurs.slice(-3000));
    assert.equal(r.reseau, false);
    return r.json;
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
const nombre = (n) => Number(n).toLocaleString('fr-FR').replace(/[  ]/g, ' ');
const pct = (p) => `${Number(p).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`.replace(/[  ]/g, ' ');

let serveur;
let contexte;
let scenario = { reponse: null, statut: 200 };
const interdits = [];
const avertissements = [];
let originaux = {};

before(async () => {
  serveur = reponsesDuServeur();
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
    if (!/\/api\/match-stats\/fd-history$/.test(u)) {
      interdits.push(u);
      throw new Error(`fetch interdit dans ce rendu : ${u}`);
    }
    const corps = scenario.reponse;
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
      if (!/FdHistoryPanel\.vue$/.test(id) || id.includes('?')) return null;
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
  const Carte = (await vite.ssrLoadModule('/src/components/settings/FdHistoryPanel.vue')).default;
  const { useFavoritesStore } = await vite.ssrLoadModule('/src/stores/favoritesStore.js');
  contexte = {
    vite,
    cache,
    async carte({ reponse, statut = 200, favoris = null }) {
      scenario = { reponse, statut };
      const avant = avertissements.length;
      const app = createSSRApp({ render: () => h(Carte, { passeTermineeLe: null }) });
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

const tableaux = (html) => html.split('<table').slice(1).map((t) => t.split('</table>')[0]);
const corps = (t) => (t.split('<tbody')[1] ?? '').split('</tbody>')[0].split(/<tr\b/).slice(1).map((x) => `<tr${x}`);
const pied = (t) => (t.split('<tfoot')[1] ?? '').split('</tfoot>')[0].split(/<tr\b/).slice(1).map((x) => `<tr${x}`);

// ============================================== 1. les règles de l'écran

test('écran = serveur : le pied des championnats (tous) retombe sur les totaux du serveur ; ⌀ = Σ rattachés / Σ matchs de la période, jamais la moyenne des pourcentages', () => {
  const r = serveur.complet.corps.resume;
  const t = U.totauxDesChampionnats(U.filtrerChampionnats(r.championnats, 'tous'));
  assert.deepEqual([t.matchs, t.periode, t.rattachees, t.ecarts, t.nonTraduits, t.introuvables], [r.totaux.matchs, r.totaux.periode, r.totaux.rattachees, r.totaux.ecarts, r.totaux.nonTraduits, r.totaux.introuvables]);
  assert.equal(t.partRattachee, Math.round((1000 * r.totaux.rattachees) / r.totaux.periode) / 10);
  // Deux championnats de tailles très différentes : la part réunie n'est pas la moyenne des deux parts.
  const deux = U.totauxDesChampionnats([
    { matchs: 1000, saisons: 3, clubs: 20, clubsReconnus: 20, periode: 1000, rattachees: 990, ecarts: 1 },
    { matchs: 10, saisons: 1, clubs: 10, clubsReconnus: 5, periode: 10, rattachees: 5, ecarts: 0 }
  ]);
  assert.equal(deux.partRattachee, 98.5, '995 / 1 010');
  assert.notEqual(deux.partRattachee, (99 + 50) / 2);
  assert.equal(deux.partClubs, 83.3);
  assert.equal(U.totauxDesChampionnats([]).partRattachee, null, 'aucun match : aucune part, jamais 0');
  // Suivis = ceux que le magasin suit (league) ; tous = aussi la National League, l'Écosse 2 à 4, le Japon.
  assert.ok(U.filtrerChampionnats(r.championnats, 'suivis').every((l) => l.league));
  assert.equal(U.filtrerChampionnats(r.championnats, 'tous').length, 38);
});

test('les seuils (objectif 95 %), l’état de l’import, les tailles, les cotes gardées, saison par saison, un écart en une phrase', () => {
  assert.deepEqual([95, 94.9, 80, 79.9, 100, null, NaN].map(U.tonRattachement), ['bon', 'partiel', 'partiel', 'faible', 'bon', 'vide', 'vide']);
  assert.equal(U.pourcentTexte(null), 'aucun match');
  assert.deepEqual([U.tailleTexte(71_380_992), U.tailleTexte(1_909_194_752), U.tailleTexte(2048), U.tailleTexte(null)].map((x) => x.replace(/[  ]/g, ' ')), ['68,1 Mo', '1,78 Go', '2 Ko', 'taille inconnue']);
  assert.equal(U.etatDeLImport(serveur.jamais.corps).cle, 'jamais');
  assert.match(U.etatDeLImport(serveur.jamais.corps).texte, /150 par passe/);
  const enCours = U.etatDeLImport(serveur.enCours.corps);
  assert.equal(enCours.cle, 'en-cours');
  assert.equal(enCours.texte, '3 fichier(s) sur 6 ; reste 3, environ 1 passe(s) de l’actualisation');
  assert.equal(U.etatDeLImport(serveur.complet.corps).cle, 'complet');
  assert.equal(U.etatDeLImport({ etat: 'illisible', erreur: 'base illisible' }).ton, 'is-danger');
  const cotes = U.lignesDesCotes(serveur.complet.corps.resume.cotes);
  assert.deepEqual(cotes.map((l) => l.cle), ['moy', 'max', 'pin', 'b365', 'wh']);
  const wh = cotes.find((l) => l.cle === 'wh');
  assert.deepEqual(wh.cases.filter((c) => !c.publie).map((c) => c.marche), ['ou25', 'ou25', 'ah', 'ah'], 'William Hill : 1 N 2 seulement');
  assert.ok(wh.cases.find((c) => c.marche === '1x2' && c.moment === 'avant').matchs > 0);
  const saisons = U.lignesParSaison(serveur.complet.corps.resume.saisons);
  assert.deepEqual(saisons.map((s) => s.saison), ['2026-27', '2025-26', '2000-01'], 'la plus récente d’abord');
  const p = U.totauxParSaison(saisons);
  assert.equal(p.matchs, saisons.reduce((n, s) => n + s.matchs, 0));
  assert.equal(p.parts.wh_1.pct, U.part(p.parts.wh_1.n, p.matchs));
  const e = serveur.complet.corps.resume.ecarts.liste[0];
  assert.match(U.phraseEcart(e), new RegExp(`· .+ - .+ : ${e.scoreFootballData} chez football-data, ${e.scoreMagasin} chez FotMob$`));
  assert.equal(U.codeDrapeau('SWZ'), 'SUI');
  assert.equal(U.codeDrapeau('DNK'), 'DEN');
  assert.equal(U.codeDrapeau('ENG'), 'ENG');
});

// ============================================================ 2. la carte

test('la carte, import complet : chiffres clés, championnats suivis avec Σ et ⌀, cotes gardées, saison par saison, écarts de score, provenance — sans un avertissement de Vue', options, async () => {
  const d = serveur.complet.corps;
  const r = d.resume;
  const { html, texte, avertissements: avert } = await contexte.carte({ reponse: d });
  assert.deepEqual(avert, []);
  assert.match(texte, /Import Complet \d+ fichier\(s\) sur 6 ; ensuite, une mise à jour par semaine/);
  assert.match(texte, /Saisons gardées 27 saisons 2000-01 → 2026-27 ; /);
  const part = U.part(r.totaux.rattachees, r.totaux.periode);
  assert.ok(texte.includes(`Rattachés à FotMob depuis 2023 ${pct(part)} ${nombre(r.totaux.rattachees)} sur ${nombre(r.totaux.periode)} matchs de la période commune, même score (objectif 95 %) ; ${nombre(r.totaux.ecarts)} écart(s) de score`), texte.slice(0, 900));
  assert.ok(texte.includes(`Clubs reconnus ${nombre(r.totaux.clubsReconnus)} sur ${nombre(r.totaux.clubs)}`));
  assert.match(texte, /Taille ajoutée \d+(,\d)? (Ko|Mo) dans la base \(les trois tables de l’historique et leurs index\)/);
  assert.match(texte, /football-data\.co\.uk · fichiers CSV gratuits/);
  assert.match(texte, /Rien pour 1,5 ou 3,5 buts ni pour « les deux marquent »/);
  const [champ, cotes, saisons, echecs, ecarts] = tableaux(html);
  // Championnats suivis (par défaut) : EPL, Championship, MLS ici — chacun avec ses saisons, matchs, clubs, rattachement.
  const suivis = r.championnats.filter((l) => l.league && l.matchs);
  const lignes = corps(champ);
  const avecMatchs = lignes.filter((x) => !/aucune saison/.test(texteDe(x)));
  assert.equal(avecMatchs.length, suivis.length);
  const epl = texteDe(lignes.find((x) => /E0 · Angleterre — Premier League/.test(texteDe(x))));
  const e0 = r.championnats.find((l) => l.code === 'E0');
  assert.ok(epl.includes(`${e0.premiere} → ${e0.derniere}`) && epl.includes(`${nombre(e0.matchs)}`) && epl.includes(`${nombre(e0.rattachees)} sur ${nombre(e0.periode)}`), epl);
  // Le pied : Σ des lignes affichées, ⌀ par la règle de l'écran.
  const t = U.totauxDesChampionnats(U.filtrerChampionnats(r.championnats, 'suivis'));
  const [sigma, moyenne] = pied(champ).map(texteDe);
  assert.ok(sigma.startsWith(`Σ ${t.lignes} championnat(s) ${nombre(t.saisons)} ${nombre(t.matchs)} ${nombre(t.clubsReconnus)} / ${nombre(t.clubs)} ${nombre(t.rattachees)} / ${nombre(t.periode)} ${nombre(t.ecarts)}`), sigma);
  assert.ok(moyenne.startsWith(`⌀ sur tous ces matchs et clubs réunis ${pct(t.partClubs)} ${pct(t.partRattachee)}`), moyenne);
  // Les cotes gardées : cinq livres, William Hill sans plus/moins ni handicap.
  assert.equal(corps(cotes).length, 5);
  assert.match(texteDe(corps(cotes)[4]), /^William Hill .+ pas publié par football-data pas publié par football-data pas publié par football-data pas publié par football-data$/);
  // Saison par saison, puis aucun échec, puis l'écart avec ses deux scores.
  assert.equal(corps(saisons).length, 3);
  assert.match(texteDe(echecs), /Aucun fichier en échec : la passe suivante n’a rien à reprendre\./);
  const e = r.ecarts.liste[0];
  assert.ok(texteDe(corps(ecarts)[0]).includes(`${e.dom} - ${e.ext}`) && texteDe(corps(ecarts)[0]).includes(`${e.scoreFootballData} ${e.scoreMagasin}`));
  assert.match(texte, /Les clubs sont reconnus par le vote \(jour et score\), jamais par la ressemblance des noms\./);
  assert.deepEqual(interdits, []);
});

test('« Tous les fichiers », favoris d’abord, un fichier en échec dit avec sa raison, l’import en cours', options, async () => {
  const d = serveur.avecEchec.corps;
  const { html, texte } = await contexte.carte({ reponse: d, favoris: [{ name: 'MLS', addedAt: '2026-10-01T00:00:00.000Z' }] });
  assert.match(texteDe(corps(tableaux(html)[0])[0]), /MLS/, 'le championnat favori d’abord');
  const echec = texteDe(corps(tableaux(html)[3])[0]);
  assert.match(echec, /^mmz4281\/2627\/EC\.csv HTTP 500 1 /, 'un essai de passe (de trois requêtes)');
  assert.match(texte, /Import En cours/);
  const enCours = await contexte.carte({ reponse: serveur.enCours.corps });
  assert.match(enCours.texte, /Import En cours \d+ fichier\(s\) sur 6 ; reste \d+, environ \d+ passe\(s\) de l’actualisation/);
  assert.deepEqual(interdits, []);
});

test('jamais importé, serveur en erreur, serveur pas encore relancé : les tableaux restent et la raison est dite', options, async () => {
  const jamais = await contexte.carte({ reponse: serveur.jamais.corps });
  assert.match(jamais.texte, /Import Pas encore la première fois, l’actualisation télécharge environ 600 fichiers, 150 par passe \(quatre à cinq passes\)/);
  assert.match(jamais.texte, /Championnat Saisons Matchs Clubs reconnus Rattachés depuis 2023 Écarts Dernier relevé Le tableau se remplira au premier import/);
  assert.match(jamais.texte, /Taille ajoutée non mesurée pas encore d’import/);
  const erreur = await contexte.carte({ reponse: { error: 'Erreur interne du serveur.' }, statut: 500 });
  assert.match(erreur.texte, /Historique football-data illisible Erreur interne du serveur\. — les tableaux ci-dessous restent affichés, sans valeurs\./);
  assert.match(erreur.texte, /Résumé indisponible : rien à afficher\./);
  const ancien = await contexte.carte({ reponse: { error: 'Statistiques introuvables pour le match fd-history.' }, statut: 404 });
  assert.match(ancien.texte, /Le serveur n'est pas à jour : relancez demarrer-cotemaster\.bat pour activer l'historique football-data\./);
  assert.deepEqual(interdits, []);
});

// ====================================================== 3. hygiène et câblage

test('hygiène du composant (jetons, pas de !important, polices ≥ 10 px, icônes connues) et câblage dans Réglages, juste après le carnet de santé', () => {
  const vue = fs.readFileSync(path.join(UI, 'src', 'components', 'settings', 'FdHistoryPanel.vue'), 'utf8');
  const style = vue.split('<style scoped>')[1];
  assert.doesNotMatch(style, /#[0-9a-f]{3,8}\b/i, 'aucune couleur en dur');
  assert.doesNotMatch(style.replace(/rgba?\(var\(--[^)]+\)[^)]*\)/g, '').replace(/rgb\(var\(--[^)]+\) \/ var\(--[^)]+\)\)/g, ''), /rgba?\(/, 'une transparence passe par un jeton');
  assert.doesNotMatch(vue, /!important/);
  for (const m of style.matchAll(/font-size:\s*([\d.]+)px/g)) assert.ok(Number(m[1]) >= 10, `police de ${m[1]} px`);
  const jetons = fs.readFileSync(path.join(UI, 'src', 'assets', 'styles', 'tokens.css'), 'utf8');
  for (const m of style.matchAll(/var\((--cm-[a-z0-9-]+)/g)) assert.ok(jetons.includes(`${m[1]}:`), `jeton inconnu ${m[1]}`);
  // Le vert ne dit ici que « rattaché à l'objectif », comme le tableau de couverture voisin ; jamais une value.
  assert.doesNotMatch(vue, /ValueBadge/);
  assert.doesNotMatch(vue, /<HelpTip\s+terme=/);
  assert.equal((vue.match(/<HelpTip/g) ?? []).length, 4);
  // Aucune promesse au-delà de ce que le site publie.
  assert.doesNotMatch(vue.replace(/\s+/g, ' ').replace('Rien pour 1,5 ou 3,5 buts ni pour « les deux marquent »', ''), /(0,5|1,5|3,5|4,5)( ou \d,5)? buts?|les deux marquent/);
  const reglages = fs.readFileSync(path.join(UI, 'src', 'views', 'SettingsView.vue'), 'utf8');
  assert.match(reglages, /import FdHistoryPanel from '@\/components\/settings\/FdHistoryPanel\.vue';/);
  assert.match(reglages, /title="Historique football-data"[\s\S]*?<FdHistoryPanel :passe-terminee-le="refreshOverview\?\.lastCompletedAt \?\? null" \/>/);
  assert.ok(reglages.indexOf('<DataHealthPanel') < reglages.indexOf('<FdHistoryPanel'), 'juste après le carnet de santé');
  const service = fs.readFileSync(path.join(UI, 'src', 'services', 'matchStatsApi.js'), 'utf8');
  assert.match(service, /fdHistory: \(\) => httpClient\.get\('\/match-stats\/fd-history'\)/);
  assert.doesNotMatch(vue, /httpClient|\.post\(|\.put\(|\.delete\(/);
});
