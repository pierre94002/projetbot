/**
 * Le bloc « Repères du championnat » de l'onglet Statistiques ligue SE REND (étape 15 du plan).
 *   node --test test/reperesEcran.test.mjs        (depuis server/)
 *
 * Les réponses de GET /api/match-stats/benchmarks sont celles du VRAI serveur :
 * la phase « ecran » de test/aides/script-reperes.mjs calcule les repères
 * d'une copie isolée de la base d'essai (saisons football-data plantées) et
 * appelle la route (application Express, sans réseau) : jamais calculé, prêt,
 * coupe. Le rendu est fait côté serveur, sans navigateur ni serveur de
 * développement : `fetch` remplacé (seule la route des repères répond, tout le
 * reste est refusé et compté), un Vite « middleware » n'écoute sur aucun port,
 * son cache va dans le dossier d'essais, rien n'est écrit dans ui/.
 *
 *  1. Les règles de l'écran (utils/reperes.js) : la ligne « toutes les
 *     saisons » retombe sur celle du serveur ; jamais une somme ni une moyenne
 *     de pourcentages ; les textes, la courbe, la dispersion, le recoupement.
 *  2. Le bloc : chiffres clés, provenance, courbe, tableau saison par saison
 *     avec la source de chaque saison, pied, dispersion, recoupement ; jamais
 *     calculé, coupe, serveur en erreur ou pas à jour : la structure reste.
 *  3. L'hygiène du composant et le câblage dans l'onglet.
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
const U = await imp(path.join(UI, 'src', 'utils', 'reperes.js'));

/** Les réponses du vrai serveur, produites une fois dans une copie isolée. */
function reponsesDuServeur() {
  const copie = preparerCopie({});
  try {
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    const r = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-reperes.mjs'), { args: ['ecran'], timeout: 300_000 });
    assert.equal(r.code, 0, r.erreurs.slice(0, 3000));
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
const espaces = (t) => String(t).replace(/[  ]/g, ' ');

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
    if (!/\/api\/match-stats\/benchmarks\?league=/.test(u)) {
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
      if (!/LeagueBenchmarksPanel\.vue$/.test(id) || id.includes('?')) return null;
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
  const Bloc = (await vite.ssrLoadModule('/src/components/team-stats/LeagueBenchmarksPanel.vue')).default;
  contexte = {
    vite,
    cache,
    async bloc({ reponse, statut = 200, league = 'EPL' }) {
      scenario = { reponse, statut };
      const avant = avertissements.length;
      const app = createSSRApp({ render: () => h(Bloc, { league }) });
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

const tableaux = (html) => html.split('<table').slice(1).map((t) => t.split('</table>')[0]);
const corps = (t) => (t.split('<tbody')[1] ?? '').split('</tbody>')[0].split(/<tr\b/).slice(1).map((x) => `<tr${x}`);
const pied = (t) => (t.split('<tfoot')[1] ?? '').split('</tfoot>')[0].split(/<tr\b/).slice(1).map((x) => `<tr${x}`);
const entetes = (t) => [...(t.split('<thead')[1] ?? '').split('</thead>')[0].matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map((m) => texteDe(m[1]));

// ============================================== 1. les règles de l'écran

test('écran = serveur : la ligne « toutes les saisons » des saisons affichées retombe sur celle du serveur ; une part = Σ (part × matchs) / Σ matchs, jamais une moyenne de pourcentages', () => {
  const r = serveur.pret.corps;
  const t = U.toutesLesSaisons(r.saisons, U.CLES_DU_TABLEAU.map((cle) => U.DEFINITIONS[cle]));
  assert.equal(t.matchs, r.toutes.matchs);
  for (const cle of U.CLES_DU_TABLEAU) {
    const serveurCle = r.toutes.reperes[cle];
    assert.equal(t.reperes[cle].matchs, serveurCle.matchs, cle);
    if (serveurCle.matchs) assert.ok(Math.abs(t.reperes[cle].valeur - serveurCle.valeur) < 1e-9, `${cle} : ${t.reperes[cle].valeur} contre ${serveurCle.valeur}`);
    else assert.equal(t.reperes[cle].valeur, null);
  }
  const deux = U.toutesLesSaisons(
    [
      { matchs: 10, reperes: { nuls: { valeur: 0.5, matchs: 10 } } },
      { matchs: 100, reperes: { nuls: { valeur: 0.2, matchs: 100 } } }
    ],
    [U.DEFINITIONS.nuls]
  );
  assert.ok(Math.abs(deux.reperes.nuls.valeur - 25 / 110) < 1e-12, '25 nuls sur 110 matchs');
  assert.notEqual(deux.reperes.nuls.valeur, 0.35, 'pas la moyenne des deux parts');
});

test('les textes : une part en %, une moyenne à deux décimales, l’avantage signé ; une case vide dit pourquoi ; les scores ; l’état du bloc', () => {
  assert.equal(espaces(U.valeurTexte(0.54, 'part')), '54,0 %');
  assert.equal(U.valeurTexte(2.8234, 'moyenne'), '2,82');
  assert.equal(U.valeurTexte(0.3, 'moyenne', { signe: true }), '+0,30');
  assert.equal(U.valeurTexte(-0.08, 'moyenne', { signe: true }), '-0,08');
  assert.equal(U.valeurTexte(null), null);
  assert.equal(U.texteCase({ valeur: null, matchs: 0, nonReleve: 'non relevé par football-data.co.uk' }, U.DEFINITIONS.penalties), 'non relevé par football-data.co.uk');
  assert.equal(U.texteCase(undefined, U.DEFINITIONS.corners), 'non relevé', 'jamais un tiret');
  assert.equal(espaces(U.scoresTexte([['1-1', 47], ['2-1', 37]], 380)), '1-1 (12,4 %), 2-1 (9,7 %)');
  assert.equal(U.scoresTexte([], 0), 'aucun match');
  assert.equal(U.etatDuBloc(null, 'Statistiques introuvables pour le match benchmarks.').cle, 'pas-a-jour');
  assert.equal(U.etatDuBloc(null, 'Erreur interne du serveur.').cle, 'erreur');
  assert.equal(U.etatDuBloc({ etat: 'coupe', league: 'EFL Cup' }).cle, 'coupe');
  assert.equal(U.etatDuBloc({ etat: 'jamais' }).cle, 'jamais');
  assert.equal(U.etatDuBloc({ etat: 'pret' }).texte, null);
  assert.deepEqual(U.notesDeSaison({ enCours: true, source: 'football-data', fichier: 'new/USA', exclus: { horsClassement: 2, attribues: 1 } }), [
    'saison en cours',
    'fichier new/USA.csv (par pays : score final seulement, playoffs compris)',
    'écartés : 2 hors classement, 1 attribué(s)'
  ]);
  assert.equal(U.libelleSource('football-data'), 'football-data.co.uk');
  assert.equal(U.texteSaisons('2000-01', '2026-27'), '2000-01 → 2026-27');
});

test('la petite courbe : saison par saison de la plus ancienne à la plus récente, la source de chaque point, la moyenne en tirets ; mois par mois dans l’ordre de la saison (juillet → juin, ou janvier → décembre)', () => {
  const r = serveur.pret.corps;
  const c = U.courbeDesSaisons(r.saisons, 'buts', { largeur: 600, hauteur: 130, moyenne: r.toutes.reperes.buts.valeur });
  assert.equal(c.vide, false);
  assert.deepEqual(c.points.map((p) => p.saison), [...r.saisons].reverse().filter((s) => s.reperes.buts.matchs).map((s) => s.saison));
  assert.ok(c.points.every((p, i) => i === 0 || p.x > c.points[i - 1].x), 'de gauche à droite');
  assert.deepEqual(c.points.map((p) => p.source), ['football-data', 'football-data', 'fotmob', 'fotmob']);
  assert.ok(c.points.at(-1).enCours);
  assert.match(c.chemin, /^M[\d.]+,[\d.]+( L[\d.]+,[\d.]+){3}$/);
  assert.ok(c.moyenneY !== null);
  // Plus haut dans le dessin = plus grande valeur.
  const max = c.points.reduce((a, b) => (b.valeur > a.valeur ? b : a));
  assert.equal(Math.min(...c.points.map((p) => p.y)), max.y);
  assert.equal(U.courbeDesSaisons([r.saisons[0]], 'buts').vide, true, 'une seule saison : pas de courbe');
  assert.deepEqual(U.ordreDesMois('2025-26').slice(0, 3), ['07', '08', '09']);
  assert.deepEqual(U.ordreDesMois('2026').slice(0, 3), ['01', '02', '03']);
  const m = U.courbeDesMois({ toutes: [{ mois: '01', valeur: 2.6, matchs: 40 }, { mois: '08', valeur: 2.9, matchs: 30 }, { mois: '05', valeur: 2.7, matchs: 5 }], saison: [{ mois: '09', valeur: 3.1, matchs: 8 }] }, '2025-26');
  assert.deepEqual(m.mois.map((x) => x.mois), ['08', '09', '01'], 'mai écarté (moins de 10 matchs toutes saisons réunies)');
  assert.equal(m.pointsSaison.length, 1);
});

test('la dispersion et le facteur de terrain : chaque mesure avec son intervalle, sa valeur retenue et celle du moteur ; le moteur hors de l’intervalle est signalé (ambre) ; le recoupement en lignes', () => {
  const r = serveur.pret.corps;
  const lignes = U.lignesDeDispersion(r.dispersion);
  assert.equal(lignes.length, 6, 'corners, tirs, tirs cadrés × ce championnat, tous');
  assert.deepEqual(lignes.map((l) => l.portee), ['Ce championnat', 'Tous les championnats', 'Ce championnat', 'Tous les championnats', 'Ce championnat', 'Tous les championnats']);
  const c = U.caseDeMesure({ mesure: 1.18, ic95: [1.15, 1.21], retenue: 1.17, moteur: 1.1, matchs: 900 }, { chiffresMoteur: 2 });
  assert.deepEqual([c.texte, c.ic, c.retenue, c.moteur, c.horsIntervalle], ['1,180', '1,150 – 1,210', '1,170', '1,10', true]);
  assert.equal(U.caseDeMesure({ mesure: 1.09, ic95: [1.05, 1.13], moteur: 1.1 }).horsIntervalle, false);
  assert.equal(U.caseDeMesure(null).texte, 'pas assez de matchs relevés');
  // Chaque signe, pour une moyenne comme pour une part (en points de pourcentage).
  const rec = U.lignesDuRecoupement(
    {
      reperes: {
        buts: { fotmob: 2.77, footballData: 2.76, ecart: -0.0097, matchsFotmob: 79, matchsFootballData: 80 },
        nuls: { fotmob: 0.278, footballData: 0.2875, ecart: 0.009, matchsFotmob: 79, matchsFootballData: 80 },
        plus_2_5: { fotmob: 0.6, footballData: 0.588, ecart: -0.012, matchsFotmob: 79, matchsFootballData: 80 },
        corners: { fotmob: 10.3, footballData: 10.336, ecart: 0.036, matchsFotmob: 79, matchsFootballData: 80 }
      }
    },
    [
      { ...U.DEFINITIONS.buts, libelle: 'Buts par match' },
      { ...U.DEFINITIONS.nuls, libelle: 'Matchs nuls' },
      { ...U.DEFINITIONS.plus_2_5, libelle: 'Plus de 2,5 buts' },
      { ...U.DEFINITIONS.corners, libelle: 'Corners par match' }
    ]
  );
  assert.deepEqual(rec.map((l) => [l.ecart, espaces(l.matchs)]), [['−0,010', '79 / 80'], ['+0,9 pt', '79 / 80'], ['−1,2 pt', '79 / 80'], ['+0,036', '79 / 80']]);
});

// ============================================================ 2. le bloc

test('le bloc, prêt : chiffres clés, vraie provenance, courbe, tableau saison par saison (la source sur chaque ligne, « non relevé » dit), pied « toutes les saisons » / valeur retenue / moyenne des championnats, dispersion, recoupement — sans avertissement de Vue', options, async () => {
  const r = serveur.pret.corps;
  const { html, texte, avertissements: avert } = await contexte.bloc({ reponse: r });
  assert.deepEqual(avert, []);
  assert.match(texte, /Saisons 4 saisons 2021-22 → 2026-27 ; 2 football-data\.co\.uk, 2 FotMob/);
  assert.ok(texte.includes(`Matchs ${espaces(Number(r.toutes.matchs).toLocaleString('fr-FR'))} matchs de championnat (barrages, résultats attribués et prolongations écartés)`));
  assert.ok(espaces(texte).includes(`Buts par match ${espaces(U.valeurTexte(r.toutes.reperes.buts.valeur))} retenue ${espaces(U.valeurTexte(r.toutes.reperes.buts.retenue))} ; moyenne des 16 championnats`));
  assert.match(texte, /Avantage du terrain [+-]?\d,\d\d but victoires à domicile/);
  assert.match(texte, /football-data\.co\.uk \(fd_history\) · FotMob \(magasin\)/, 'la vraie provenance');
  assert.match(texte, /Une saison, une seule source FotMob quand la saison est entière au magasin \(depuis 2023\), sinon football-data\.co\.uk/);
  // La courbe : un tracé et quatre points (deux creux football-data, deux pleins FotMob, la saison en cours cerclée).
  assert.match(html, /<path class="lbp__ligne" d="M[\d.,LM ]+"/);
  const points = (html.match(/<span class="[^"]*\blbp__point\b[^"]*"/g) ?? []).map((x) => x.split('"')[1].split(' '));
  assert.equal(points.length, 4);
  assert.equal(points.filter((c) => c.includes('is-fd')).length, 2, 'deux points creux (football-data)');
  assert.equal(points.filter((c) => c.includes('is-fotmob')).length, 2, 'deux points pleins (FotMob)');
  assert.equal(points.filter((c) => c.includes('is-en-cours')).length, 1, 'la saison en cours cerclée');
  const [saisons, dispersion, recoupement] = tableaux(html);
  assert.deepEqual(entetes(saisons), ['Saison', ...U.COLONNES.map((c) => c.titre), 'Scores fréquents']);
  const lignes = corps(saisons).map(texteDe);
  assert.equal(lignes.length, 4);
  assert.match(lignes[0], /^2026-27 FotMob \d+ matchs saison en cours/);
  assert.match(lignes[2], /^2022-23 football-data\.co\.uk 8 matchs fichier mmz4281\/2223\/E0\.csv 2,75 /);
  assert.match(lignes[3], /^2021-22 football-data\.co\.uk 10 matchs fichier mmz4281\/2122\/E0\.csv 2,50 \+0,50 50,0 % 30,0 % 20,0 % 70,0 % 50,0 % 30,0 % 40,0 % 1,33 1,22 8,11 22,10 8,30 2,60 0,20 non relevé par football-data\.co\.uk non relevé par football-data\.co\.uk 0-0 \(10,0 %\), 0-1 \(10,0 %\), 1-0 \(10,0 %\)$/);
  const [toutes, retenue, moyenne] = pied(saisons).map(texteDe);
  assert.ok(toutes.startsWith(`Toutes les saisons Σ ${espaces(Number(r.toutes.matchs).toLocaleString('fr-FR'))} matchs, 4 saison(s) ${espaces(U.valeurTexte(r.toutes.reperes.buts.valeur))}`), toutes);
  assert.match(retenue, /^Valeur retenue ramenée vers la moyenne des championnats selon ses matchs \d,\d\d /);
  assert.match(moyenne, /^Moyenne des 16 championnats chacun compte pour un \d,\d\d /);
  // La dispersion : six lignes (trois statistiques, ce championnat et tous), les valeurs du moteur dites.
  const d = corps(dispersion).map(texteDe);
  assert.equal(d.length, 6);
  assert.match(d[0], /^Corners Ce championnat \d+ \d,\d{3} 95 % : .+ moteur 1,10/);
  assert.match(d[1], /^Corners Tous les championnats /);
  assert.match(d[1], /moteur 0,105/);
  assert.match(texte, /Mesuré seulement : le moteur garde 1,10 \/ 0,90 et ses dispersions fixes/);
  // Le recoupement : la saison commune et une ligne par repère relevé des deux côtés.
  assert.match(texte, /Saisons 2025-26 : chaque repère calculé chez FotMob et chez football-data\.co\.uk\./);
  const rc = corps(recoupement).map(texteDe);
  assert.ok(rc.length >= 5 && rc[0].startsWith('Buts par match '), rc[0]);
  assert.deepEqual(interdits, []);
});

test('jamais calculé, coupe, serveur en erreur, serveur pas encore relancé : la raison est dite et les tableaux gardent leur structure', options, async () => {
  const titres = ['Saison', ...U.COLONNES.map((c) => c.titre), 'Scores fréquents'];
  const jamais = await contexte.bloc({ reponse: serveur.jamais.corps });
  assert.match(jamais.texte, /Pas encore calculés : ils le seront à la prochaine passe de nuit de l’actualisation/);
  assert.deepEqual(entetes(tableaux(jamais.html)[0]), titres);
  assert.match(jamais.texte, /Saisons non lu repères indisponibles/);
  assert.match(jamais.texte, /Toutes les saisons Σ 0 matchs, 0 saison\(s\) non relevé/);
  const coupe = await contexte.bloc({ reponse: serveur.coupe.corps, league: 'EFL Cup' });
  assert.match(coupe.texte, /Les coupes sont tenues à part \(terrain neutre, prolongations, tirs au but\) : aucun repère de championnat pour EFL Cup/);
  assert.deepEqual(entetes(tableaux(coupe.html)[0]), titres);
  const erreur = await contexte.bloc({ reponse: { error: 'Erreur interne du serveur.' }, statut: 500 });
  assert.match(erreur.texte, /Repères du championnat illisibles Repères illisibles : Erreur interne du serveur\. — les tableaux ci-dessous restent affichés, sans valeurs\./);
  assert.deepEqual(entetes(tableaux(erreur.html)[0]), titres);
  assert.equal(tableaux(erreur.html).length, 3, 'saisons, dispersion, recoupement');
  assert.match(erreur.texte, /Mesure indisponible : rien à afficher\./);
  const ancien = await contexte.bloc({ reponse: { error: 'Statistiques introuvables pour le match benchmarks.' }, statut: 404 });
  assert.match(ancien.texte, /Le serveur n'est pas à jour : relancez demarrer-cotemaster\.bat pour activer les repères du championnat\./);
  assert.deepEqual(interdits, []);
});

// ====================================================== 3. hygiène et câblage

test('hygiène du bloc (jetons, pas de !important, polices ≥ 10 px, jamais le vert d’une value) et câblage dans l’onglet Statistiques ligue, après les moyennes de la ligue', () => {
  const vue = fs.readFileSync(path.join(UI, 'src', 'components', 'team-stats', 'LeagueBenchmarksPanel.vue'), 'utf8');
  const style = vue.split('<style scoped>')[1];
  assert.doesNotMatch(style, /#[0-9a-f]{3,8}\b/i, 'aucune couleur en dur');
  assert.doesNotMatch(style.replace(/rgba?\(var\(--[^)]+\)[^)]*\)/g, '').replace(/rgb\(var\(--[^)]+\) \/ var\(--[^)]+\)\)/g, ''), /rgba?\(/, 'une transparence passe par un jeton');
  assert.doesNotMatch(vue, /!important/);
  for (const m of style.matchAll(/font-size:\s*([\d.]+)px/g)) assert.ok(Number(m[1]) >= 10, `police de ${m[1]} px`);
  const jetons = fs.readFileSync(path.join(UI, 'src', 'assets', 'styles', 'tokens.css'), 'utf8');
  for (const m of style.matchAll(/var\((--cm-[a-z0-9-]+)/g)) assert.ok(jetons.includes(`${m[1]}:`), `jeton inconnu ${m[1]}`);
  // Une tendance n'est ni bonne ni mauvaise, un écart au moteur non plus : ni vert de value, ni rouge.
  assert.doesNotMatch(vue, /ValueBadge|--cm-accent|--cm-danger\b(?!-)/);
  assert.doesNotMatch(vue, /httpClient|\.post\(|\.put\(|\.delete\(/);
  assert.equal((vue.match(/<HelpTip/g) ?? []).length, 4);
  assert.doesNotMatch(vue, /<HelpTip\s+terme=/);
  const vueOnglet = fs.readFileSync(path.join(UI, 'src', 'views', 'TeamStatsView.vue'), 'utf8');
  assert.match(vueOnglet, /import LeagueBenchmarksPanel from '@\/components\/team-stats\/LeagueBenchmarksPanel\.vue';/);
  assert.match(vueOnglet, /<AppCard\s+v-if="selectedLeague"[\s\S]*?title="Repères du championnat"[\s\S]*?<LeagueBenchmarksPanel :league="selectedLeague" \/>/);
  assert.ok(vueOnglet.indexOf('title="Domicile face à extérieur"') < vueOnglet.indexOf('<LeagueBenchmarksPanel'), 'après les moyennes de la ligue');
  const service = fs.readFileSync(path.join(UI, 'src', 'services', 'matchStatsApi.js'), 'utf8');
  assert.match(service, /benchmarks: \(league\) => httpClient\.get\(`\/match-stats\/benchmarks\?league=\$\{encodeURIComponent\(league\)\}`\)/);
});
