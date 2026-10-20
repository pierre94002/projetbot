/**
 * La carte « Carnet de santé des données » de Réglages SE REND (étape 12 du plan).
 *   node --test test/carnetSanteEcran.test.mjs        (depuis server/)
 *
 * Les réponses de GET /api/match-stats/health sont celles du VRAI serveur : la
 * phase « ecran » de test/aides/script-carnet-sante.mjs plante une anomalie de
 * chaque sorte dans une copie isolée de la base d'essai, lance le contrôle
 * complet (scripts/data-health.mjs) puis appelle la route (application Express,
 * sans réseau). Le rendu est fait côté serveur, sans navigateur ni serveur de
 * développement : `fetch` remplacé (seule la route du carnet répond, tout le
 * reste est refusé et compté), un Vite « middleware » n'écoute sur aucun port,
 * son cache va dans le dossier d'essais, rien n'est écrit dans ui/. Comme pour
 * les autres cartes, `onMounted` devient `onServerPrefetch` dans le rendu.
 *
 *  1. Les règles de l'écran (utils/carnetSante.js) : le pied du tableau = la
 *     règle du serveur (totauxDuCarnet) sur 300 tirages ; les seuils de couleur ;
 *     les notes d'une ligne ; les onglets des anomalies.
 *  2. La carte : chiffres clés, carnet (saison en cours, favoris d'abord), Σ et
 *     ⌀ des lignes affichées, couleurs, anomalies (match, sorte, gravité, date du
 *     contrôle), « Voir plus », provenance ; jamais contrôlé ; serveur en erreur
 *     ou pas encore relancé : le tableau reste.
 *  3. L'hygiène du composant et le câblage dans Réglages.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { preparerCopie, executer, SERVEUR, RACINE_ESSAIS } from './aides/isolement.mjs';
import { totauxDuCarnet as totauxServeur } from '../src/data/db/dataHealth.js';

const UI = path.resolve(SERVEUR, '..', 'ui');
const pret = ['vite', '@vitejs/plugin-vue', 'vue', 'pinia'].every((p) => fs.existsSync(path.join(UI, 'node_modules', p)));
const imp = (chemin) => import(pathToFileURL(chemin).href);
const options = { skip: pret ? false : 'ui/node_modules (vite, plugin-vue, vue, pinia) manque' };
const U = await imp(path.join(UI, 'src', 'utils', 'carnetSante.js'));

/** Les réponses du vrai serveur, produites une fois dans une copie isolée. */
function reponsesDuServeur() {
  const copie = preparerCopie({});
  try {
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    const r = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-carnet-sante.mjs'), { args: ['ecran'], timeout: 300_000 });
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
    .replace(/[  ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const nombre = (n) => Number(n).toLocaleString('fr-FR').replace(/[  ]/g, ' ');
const pct = (p) => `${Number(p).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;

let serveur;
let contexte;
let scenario = { reponse: null, statut: 200 };
const appels = [];
const interdits = [];
const avertissements = [];
let originaux = {};

before(async () => {
  serveur = reponsesDuServeur();
  if (!pret) return;
  originaux = { fetch: globalThis.fetch, warn: console.warn, setInterval: globalThis.setInterval, setTimeout: globalThis.setTimeout };
  // L'horloge partagée de l'appli (liveClock.js, lue par la pastille de provenance) arme un
  // minuteur dès son import : « unref », sinon le processus du test ne se termine jamais.
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
    if (!/\/api\/match-stats\/health(\?|$)/.test(u)) {
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
      if (!/DataHealthPanel\.vue$/.test(id) || id.includes('?')) return null;
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
  const Carte = (await vite.ssrLoadModule('/src/components/settings/DataHealthPanel.vue')).default;
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

/** Les rangées d'un tableau (après l'en-tête), chacune en HTML. */
const tableaux = (html) => html.split('<table').slice(1).map((t) => t.split('</table>')[0]);
const corps = (t) => (t.split('<tbody')[1] ?? '').split('</tbody>')[0].split(/<tr\b/).slice(1).map((x) => `<tr${x}`);
const pied = (t) => (t.split('<tfoot')[1] ?? '').split('</tfoot>')[0].split(/<tr\b/).slice(1).map((x) => `<tr${x}`);

// ============================================== 1. les règles de l'écran

test('écran = serveur : le pied du tableau (Σ, ⌀) sur 300 tirages de lignes est exactement celui de totauxDuCarnet du serveur', () => {
  const carnet = serveur.pret.corps.carnet;
  let graine = 12;
  const hasard = () => ((graine = (graine * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 300; i++) {
    const lignes = carnet.filter(() => hasard() < 0.4);
    // Et des lignes fabriquées : des tailles très différentes, une ligne vide.
    for (let k = 0; k < 3; k++) {
      const matchs = Math.floor(hasard() * 400);
      const avec = Object.fromEntries(['xg', 'tirs', 'corners', 'cartons', 'joueurs', 'compos'].map((c) => [c, Math.floor(hasard() * (matchs + 1))]));
      lignes.push({ league: `Fabriquée ${k}`, season: 2026, rencontres: matchs + 2, matchs, attribues: 1, horsJeu: 1, sansFeuille: Math.floor(hasard() * matchs), avec });
    }
    assert.deepEqual(U.totauxDuCarnet(lignes), totauxServeur(lignes), `tirage ${i}`);
  }
  assert.deepEqual(U.totauxDuCarnet([]), totauxServeur([]));
  assert.equal(U.totauxDuCarnet([]).moyenne, null, 'aucun match : aucune moyenne, jamais 0');
});

test('les seuils de couleur, les pourcentages dits, les notes d’une ligne, les onglets des anomalies', () => {
  const s = { bon: 90, partiel: 50 };
  assert.deepEqual([90, 89.9, 50, 49.9, 0, 100, null, undefined, NaN].map((p) => U.tonDe(p, s)), ['bon', 'partiel', 'partiel', 'faible', 'faible', 'bon', 'vide', 'vide', 'vide']);
  assert.equal(U.tonDe(80, { bon: 75, partiel: 40 }), 'bon', 'les seuils du serveur priment');
  assert.equal(U.pourcentTexte(89.3).replace(/[  ]/g, ' '), '89,3 %');
  assert.equal(U.pourcentTexte(null), 'aucun match');
  const lettonie = serveur.pret.corps.carnet.find((l) => l.league === 'Virsliga - Latvia');
  assert.deepEqual(U.noteDeLigne(lettonie).map((n) => n.replace(/[  ]/g, ' ')), ['xG non publiés par FotMob pour 64 des 64 matchs (couverture « lower »)', 'saison en cours']);
  assert.deepEqual(U.noteDeLigne({ couverture: { xG: 10 }, pourcent: { xg: 100 }, sansFeuille: 2, attribues: 1, partielle: 'le magasin commence le 2023-01-04', enCours: false }), [
    '2 sans feuille chez la source',
    '1 résultat(s) attribué(s), hors calcul',
    'saison partielle : le magasin commence le 2023-01-04'
  ]);
  assert.deepEqual(U.filtrerCarnet([{ league: 'A', enCours: true }, { league: 'A', enCours: false }, { league: 'B', enCours: true }], { ligue: 'A', saisons: 'en-cours' }), [{ league: 'A', enCours: true }]);
  assert.equal(U.filtrerCarnet([{ league: 'A', enCours: false }], { saisons: 'toutes' }).length, 1);
  const p = serveur.pret.corps;
  const onglets = U.ongletsAnomalies(p.types, p.parType, p.anomaliesTotal);
  assert.deepEqual(onglets.map((o) => [o.cle, o.compte]), [['', p.anomaliesTotal], ...p.types.map((t) => [t.cle, p.parType[t.cle].total])]);
});

// ============================================================ 2. la carte

test('la carte : chiffres clés, carnet de la saison en cours, Σ et ⌀ des lignes affichées, couleurs, anomalies, provenance — sans un avertissement de Vue', options, async () => {
  const p = serveur.pret.corps;
  const { html, texte, avertissements: avert } = await contexte.carte({ reponse: p });
  assert.deepEqual(avert, []);
  // Chiffres clés.
  assert.match(texte, /Dernier contrôle Complet le /);
  assert.ok(texte.includes(`Rencontres au magasin ${nombre(p.controle.rencontresAuMagasin)} toutes relues à ce contrôle`), texte.slice(0, 600));
  const erreurs = Object.values(p.parType).reduce((n, t) => n + t.erreur, 0);
  assert.ok(texte.includes(`Anomalies ${nombre(p.anomaliesTotal)} dont ${nombre(erreurs)} erreur(s)`));
  assert.ok(texte.includes(`Complétude moyenne ${pct(p.totaux.moyenne)} des six données, sur ${nombre(p.totaux.matchs)} matchs joués de toutes les saisons`));
  assert.match(texte, /Magasin FotMob · base SQLite \(lecture seule\)/);
  // Le carnet : la saison en cours par défaut, une ligne par championnat.
  const [carnetHtml, anomaliesHtml] = tableaux(html);
  const enCours = p.carnet.filter((l) => l.enCours);
  const rangees = corps(carnetHtml);
  assert.equal(rangees.length, enCours.length);
  assert.ok(texteDe(carnetHtml).includes('Championnat Saison Total xG Tirs Corners Cartons Joueurs Compos Moyenne'));
  // Chaque case : le pourcentage du serveur et sa couleur.
  // Le ton de chaque case de pourcentage (les six données puis la moyenne), dans l'ordre, quel que soit l'ordre des classes.
  const tons = (r) => [...r.matchAll(/<td class="([^"]*\bsante__pct\b[^"]*)"/g)].map((m) => m[1].split(/\s+/).find((c) => /^is-(bon|partiel|faible|vide)$/.test(c)));
  for (const [i, l] of enCours.entries()) {
    const r = rangees[i];
    assert.deepEqual(tons(r), [...p.donnees.map((d) => `is-${U.tonDe(l.pourcent[d.cle], p.seuils)}`), `is-${U.tonDe(l.moyenne, p.seuils)}`], `${l.league} ${l.saison}`);
    assert.ok(texteDe(r).includes(l.saison));
    assert.ok(texteDe(r).includes(pct(l.moyenne)) || l.moyenne === null);
  }
  // Le pied : Σ des comptes et ⌀ sur tous les matchs AFFICHÉS — la règle du serveur.
  const t = totauxServeur(enCours);
  const [sigma, moyenne] = pied(carnetHtml).map(texteDe);
  assert.equal(sigma, `Σ ${enCours.length} ligne(s) ${nombre(t.matchs)} ${p.donnees.map((d) => nombre(t.avec[d.cle])).join(' ')} cases remplies`);
  assert.equal(moyenne, `⌀ sur tous ces matchs ${nombre(t.matchs)} ${p.donnees.map((d) => pct(t.pourcent[d.cle])).join(' ')} ${pct(t.moyenne)}`);
  // La Lettonie dit pourquoi ses xG sont rouges.
  assert.match(texteDe(carnetHtml), /xG non publiés par FotMob pour 64 des 64 matchs \(couverture « lower »\)/);
  // Les anomalies : toutes (208 ≤ 300), chacune avec son match, sa sorte, sa gravité et la date du contrôle.
  const lignesAnomalies = corps(anomaliesHtml);
  assert.equal(lignesAnomalies.length, p.anomalies.length);
  const premiere = texteDe(lignesAnomalies[0]);
  const a0 = p.anomalies[0];
  assert.ok(premiere.startsWith(a0.label), premiere);
  assert.ok(premiere.includes(a0.detail));
  assert.ok(premiere.includes(p.sortes[a0.sorte].libelle));
  assert.ok(/Erreur/.test(premiere));
  assert.ok(texteDe(anomaliesHtml).includes('Everton (fotmob-8668) joue deux fois le 2026-09-19'));
  const puces = (ton) => [...anomaliesHtml.matchAll(/class="([^"]*)"/g)].filter((m) => /\bcm-chip\b/.test(m[1]) && new RegExp(`\\b${ton}\\b`).test(m[1])).length;
  assert.equal(puces('is-danger'), erreurs, 'une puce rouge par erreur');
  assert.equal(puces('is-warning'), Object.values(p.parType).reduce((n, t) => n + t['a-verifier'], 0), 'une puce ambre par « à vérifier »');
  assert.match(texte, /Toutes 208 Rencontre en double 8 Mauvaise compétition 3 Match manquant 121 Chiffre impossible 4 Zéro « non relevé » 65 Club ou joueur mal identifié 7/);
  assert.doesNotMatch(texte, /Voir \d+ de plus/);
  assert.match(texte, /Rien n'est corrigé automatiquement|ne corrige rien/);
  assert.deepEqual(interdits, []);
});

test('« Voir plus », favoris d’abord, recoupement avec le tableau de couverture', options, async () => {
  const p = serveur.pret.corps;
  const limite = await contexte.carte({ reponse: serveur.limite.corps });
  assert.equal(corps(tableaux(limite.html)[1]).length, 2);
  assert.ok(limite.texte.includes(`2 affichée(s) sur ${nombre(p.anomaliesTotal)} — les erreurs d'abord, puis les plus récentes. Voir ${nombre(Math.min(300, p.anomaliesTotal - 2))} de plus`));
  // Les championnats favoris d'abord (une LISTE ; un classement, lui, ne se réordonne jamais).
  const favoris = await contexte.carte({ reponse: p, favoris: [{ name: 'Virsliga - Latvia', addedAt: '2026-10-01T00:00:00.000Z' }] });
  assert.match(texteDe(corps(tableaux(favoris.html)[0])[0]), /Virsliga/);
  // Le recoupement, quand le contrôle complet a pu lire le calendrier.
  const avecRecoupement = { ...p, recoupement: { le: '2026-10-05T12:00:00.000Z', totaux: { finis: 38254, parNom: 38157, joueursDomicile: 36781, parIdsSeulement: 36, introuvables: 61, joueursCarnet: 36817 }, parLigue: [] } };
  const r = await contexte.carte({ reponse: avecRecoupement });
  assert.match(r.texte, /sur 38 254 matchs terminés du calendrier, 38 157 trouvés des deux façons, 36 seulement par les identifiants \(le tableau les compte sans statistiques\), 61 absents du magasin/);
  // Les pages de compétition FotMob : pas relues à ce contrôle (réseau), puis relues avec ce qui est avant le magasin compté à part.
  assert.match(r.texte, /Pages de compétition FotMob \(le calendrier complet\) : pas relues toutes saisons à ce contrôle \(réseau, à la demande\) ; la saison en cours l'est à chaque passe par l'étape « omissions »/);
  const fotmob = { lu: true, le: '2026-10-06T18:10:12.888Z', competitions: 67, saisons: 341, jouees: 73812, signalees: 0, ecartees: { avantLeMagasin: 11383, horsPerimetre: 5482, importeesDepuis: 0, autreIdentifiant: 0 }, saisonMin: 2023, horsPerimetre: [{ league: 'League 2', season: 2022, saison: '2022-23', matchs: 5000 }, { league: 'EPL', season: 2022, saison: '2022-23', matchs: 482 }], echecs: [] };
  const lues = await contexte.carte({ reponse: { ...p, controle: { ...p.controle, fotmob } } });
  assert.match(lues.texte, /Pages de compétition FotMob \(le calendrier complet\) lues le .+ : 67 compétitions, 341 saisons — 0 rencontre\(s\) jouée\(s\) absente\(s\) du magasin ; avant sa première saison, 5 482 rencontres jouées que le magasin n'a jamais tenues \(saison 2022-23\), comptées à part, pas comme des anomalies\./);
  assert.deepEqual(interdits, []);
});

test('jamais contrôlé, serveur en erreur, serveur pas encore relancé : la structure du tableau reste et la raison est dite', options, async () => {
  const jamais = await contexte.carte({ reponse: serveur.jamais.corps });
  assert.match(jamais.texte, /Dernier contrôle Pas encore le premier contrôle, complet, se fait à la prochaine passe de nuit/);
  assert.match(jamais.texte, /Pas encore de contrôle Le premier contrôle, complet \(tout le magasin\), se fait à la prochaine passe de nuit/);
  assert.match(jamais.texte, /Championnat Saison Total xG Tirs Corners Cartons Joueurs Compos Moyenne Le carnet se remplira au premier contrôle\./);
  assert.match(jamais.texte, /La liste se remplira au premier contrôle\./);
  assert.match(jamais.html, /disabled/);
  const erreur = await contexte.carte({ reponse: { error: 'Erreur interne du serveur.' }, statut: 500 });
  assert.match(erreur.texte, /Carnet de santé illisible Erreur interne du serveur\. — le tableau ci-dessous reste affiché, sans valeurs\./);
  assert.match(erreur.texte, /Championnat Saison Total xG Tirs Corners Cartons Joueurs Compos Moyenne Carnet indisponible : rien à afficher\./);
  assert.match(erreur.texte, /Rencontres au magasin non lu carnet indisponible/);
  const ancien = await contexte.carte({ reponse: { error: 'Statistiques introuvables pour le match health.' }, statut: 404 });
  assert.match(ancien.texte, /Le serveur n'est pas à jour : relancez demarrer-cotemaster\.bat pour activer le carnet de santé\./);
  const illisible = await contexte.carte({ reponse: { ...serveur.jamais.corps, etat: 'illisible', erreur: 'carnet-sante.json illisible (essai)' } });
  assert.match(illisible.texte, /Dernier contrôle Illisible carnet-sante\.json illisible \(essai\)/);
  assert.deepEqual(interdits, []);
});

// ====================================================== 3. hygiène et câblage

test('hygiène du composant (jetons, pas de !important, polices ≥ 10 px, icônes connues) et câblage dans Réglages', () => {
  const vue = fs.readFileSync(path.join(UI, 'src', 'components', 'settings', 'DataHealthPanel.vue'), 'utf8');
  const style = vue.split('<style scoped>')[1];
  assert.doesNotMatch(style, /#[0-9a-f]{3,8}\b/i, 'aucune couleur en dur');
  assert.doesNotMatch(style.replace(/rgba?\(var\(--[^)]+\)[^)]*\)/g, ''), /rgba?\(/, 'une transparence passe par un jeton');
  assert.doesNotMatch(vue, /!important/);
  for (const m of style.matchAll(/font-size:\s*([\d.]+)px/g)) assert.ok(Number(m[1]) >= 10, `police de ${m[1]} px`);
  for (const m of style.matchAll(/var\((--cm-[a-z0-9-]+)/g)) {
    const jetons = fs.readFileSync(path.join(UI, 'src', 'assets', 'styles', 'tokens.css'), 'utf8');
    assert.ok(jetons.includes(`${m[1]}:`), `jeton inconnu ${m[1]}`);
  }
  // Le vert ne dit ici que « donnée présente à 90 % ou plus », comme le tableau de couverture voisin ; jamais une value.
  assert.doesNotMatch(vue, /ValueBadge/);
  // Les bulles d'aide posent leur propre phrase (titre + texte), aucune clé inconnue du guide.
  assert.doesNotMatch(vue, /<HelpTip\s+terme=/);
  assert.equal((vue.match(/<HelpTip/g) ?? []).length, 2);
  // Le câblage : la carte dans Réglages, relue à la fin de chaque passe ; la route du service.
  const reglages = fs.readFileSync(path.join(UI, 'src', 'views', 'SettingsView.vue'), 'utf8');
  assert.match(reglages, /import DataHealthPanel from '@\/components\/settings\/DataHealthPanel\.vue';/);
  assert.match(reglages, /title="Carnet de santé des données"[\s\S]*?<DataHealthPanel :passe-terminee-le="refreshOverview\?\.lastCompletedAt \?\? null" \/>/);
  assert.ok(reglages.indexOf('<MatchStatsCoveragePanel') < reglages.indexOf('<DataHealthPanel'), 'juste après la couverture des statistiques');
  const service = fs.readFileSync(path.join(UI, 'src', 'services', 'matchStatsApi.js'), 'utf8');
  assert.match(service, /health: \(\{ type = '', gravite = '', ligue = '', saison = '', limite = null \} = \{\}\) =>/);
  assert.match(service, /httpClient\.get\(`\/match-stats\/health\$\{requete \? `\?\$\{requete\}` : ''\}`\)/);
  // La carte n'appelle que sa route, en lecture.
  assert.doesNotMatch(vue, /httpClient|\.post\(|\.put\(|\.delete\(/);
});
