/**
 * La page « Santé du moteur » SE RENDUE (étape 24 du plan, 14/10/2026) : ses règles et son rendu.
 *   node --test test/santeMoteurEcran.test.mjs        (depuis server/)
 *
 * Les réponses de GET /api/engine-health sont celles du VRAI serveur : la phase « page » de
 * test/aides/script-sante-moteur.mjs les calcule dans une copie isolée (pronostics gelés plantés sur la base
 * d'essai, août figé et septembre préparé par l'étape de la nuit, heure figée au 30/09/2026) — avant la nuit
 * (rien n'est préparé) et après. Les autres états (feux de toutes les couleurs, liste « à vérifier », version du
 * moteur) viennent de l'assembleur du serveur avec des lectures fabriquées. Le rendu est fait côté serveur, sans
 * navigateur ni serveur de développement : `fetch` remplacé (seule la route de la page répond, tout le reste est
 * refusé et compté), un Vite « middleware » n'écoute sur aucun port, son cache va dans le dossier d'essais,
 * rien n'est écrit dans ui/. `onMounted` devient `onServerPrefetch` dans le rendu.
 *
 *  1. Les règles de l'écran (ui/src/utils/santeMoteur.js) : pastilles, liens, heures, note face au marché,
 *     évolution, calibration, « à vérifier », la structure qui reste.
 *  2. La page dans chacun de ses états : après la nuit, avant la nuit, feux de toutes les couleurs, serveur muet.
 *  3. Le câblage : une seule lecture, la courbe du banc d'essai réutilisée, jetons seulement, aucune écriture.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { preparerCopie, executer, SERVEUR, RACINE_ESSAIS } from './aides/isolement.mjs';

const UI = path.resolve(SERVEUR, '..', 'ui');
const pret = ['vite', '@vitejs/plugin-vue', 'vue', 'pinia', 'vue-router'].every((p) => fs.existsSync(path.join(UI, 'node_modules', p)));
const imp = (chemin) => import(pathToFileURL(chemin).href);
const options = { skip: pret ? false : 'ui/node_modules (vite, plugin-vue, vue, pinia, vue-router) manque' };
const R = await imp(path.join(UI, 'src', 'utils', 'santeMoteur.js'));
const CAL = await imp(path.join(UI, 'src', 'utils', 'calibration.js'));
const S = await imp(path.join(SERVEUR, 'src', 'data', 'santeDuMoteur.js'));
const { NOTE_DE_DEPART } = await imp(path.join(SERVEUR, 'src', 'bench', 'noteDeDepart.js'));

/** Les réponses du vrai serveur, produites une fois dans une copie isolée. */
function reponsesDuServeur() {
  const copie = preparerCopie({});
  try {
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    const r = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-sante-moteur.mjs'), { args: ['page'], maintenant: '2026-09-30T12:00:00.000Z', timeout: 300_000 });
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
    .replace(/[\u202f\u00a0]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
/** Le HTML d'un bloc (de son ouverture au premier </section>), ou null. */
function blocDe(html, cle) {
  const i = html.indexOf(`data-bloc="${cle}"`);
  if (i < 0) return null;
  const debut = html.lastIndexOf('<section', i);
  return html.slice(debut, html.indexOf('</section>', i) + 10);
}
const CLES = ['donnees', 'sauvegardes', 'budget', 'note', 'calibration', 'cloture', 'aVerifier', 'versions', 'corrections'];

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
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    appels.push(`${opts.method ?? 'GET'} ${u}`);
    if (!/\/api\/engine-health$/.test(u) || (opts.method && opts.method !== 'GET')) {
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
  const { createRouter, createMemoryHistory } = await imp(path.join(UI, 'node_modules', 'vue-router', 'dist', 'vue-router.mjs'));
  const prefetch = {
    name: 'ssr-prefetch',
    enforce: 'pre',
    transform(code, id) {
      if (!/EngineHealthView\.vue$/.test(id) || id.includes('?')) return null;
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
  const cache = fs.mkdtempSync(path.join(RACINE_ESSAIS, 'cm-rendu-sante-'));
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
  const Vue = (await vite.ssrLoadModule('/src/views/EngineHealthView.vue')).default;
  const horloge = await vite.ssrLoadModule('/src/utils/liveClock.js');
  const vide = { render: () => null };
  const routeur = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/reglages', name: 'settings', component: vide, meta: { title: 'Réglages', section: 'settings' } },
      { path: '/historique-moteur', name: 'predictions-history', component: vide, meta: { title: 'Historique moteur', section: 'history' } },
      { path: '/feuille-de-route', name: 'roadmap', component: vide, meta: { title: 'Feuille de route', section: 'roadmap' } },
      { path: '/:chemin(.*)*', component: vide }
    ]
  });
  await routeur.push('/historique-moteur');
  await routeur.isReady();
  contexte = {
    vite,
    cache,
    async rendre({ reponse, statut = 200, heure = Date.parse('2026-09-30T14:00:00.000Z') }) {
      scenario = { reponse, statut };
      horloge.liveNow.value = heure;
      const avant = avertissements.length;
      const app = createSSRApp({ render: () => h(Vue) });
      app.use(createPinia());
      app.use(routeur);
      const html = await renderToString(app);
      const trou = /<path(?![^>]*\bd=)[^>]*>/.exec(html);
      assert.equal(trou, null, `une icône inconnue d'AppIcon (tracé vide) : ${trou?.[0]}`);
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
  await contexte?.vite?.close();
  if (contexte?.cache) fs.rmSync(contexte.cache, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

const maintenant = Date.parse('2026-10-14T08:00:00.000Z');
const LECTEURS_RICHES = Object.freeze({
  controle: () => ({
    etat: 'pret',
    feu: 'orange',
    le: '2026-10-14T02:31:00.000Z',
    fichier: 'data/runtime/controle-quotidien.json',
    compte: { vert: 25, orange: 9, rouge: 1, erreur: 0, nonFait: 0 },
    enEchec: [
      { cle: 'scores', libelle: 'Score face à football-data.co.uk', statut: 'rouge', constat: 'Córdoba – Tenerife du 05/10 : 3-2 chez FotMob, 3-1 chez football-data', total: 1 },
      { cle: 'non-releves', libelle: 'Zéros « non relevé »', statut: 'orange', constat: 'cartons jaunes à 0 dans 17 championnats', total: 17 }
    ],
    aVerifier: { clubs: 6, ligues: 17, global: 1 }
  }),
  sauvegardes: () => ({ alertes: [], derniereReussie: { fin: '2026-10-14T00:30:00.000Z' }, derniere: { ok: true }, dossier: 'C:/CoteMaster/sauvegardes', etatPrepareLe: '2026-10-14T01:00:00.000Z' }),
  budget: () => ({ generatedAt: '2026-10-14T08:00:00.000Z', aujourdhui: { part: 1.12, budget: 1_200_000, tokens: { total: 1_340_000 } }, cetteSemaine: { part: 0.4, budget: 6_000_000, tokens: { total: 2_400_000 } }, mode: { econome: true, raison: 'Mode économe : budget du jour dépassé' }, journal: {} }),
  banc: () => ({ note: NOTE_DE_DEPART, dernier: { id: 4, finiLe: '2026-10-13T14:10:11.250Z', ou: 'bac à sable', bilan: { dureeMs: 1568908 } }, rejeux: 4 }),
  calibration: () => ({ moisEnCours: '2026-10', preparation: { etat: 'absente' }, bilan: null, figes: [], prochainGel: { mois: '2026-10', le: '2026-11-01', heure: 6 }, juge: {}, version: 1 }),
  versions: () => ({
    versions: {
      source: 'enregistre',
      fichier: 'data/runtime/engine-versions.json',
      majLe: '2026-10-12T16:14:14.019Z',
      enService: { numero: 2, creeeLe: '2026-10-12T16:14:14.019Z', pourquoi: 'mise à jour du code du moteur' },
      enSynchro: true,
      candidate: { id: 'poids-forme-5', quoi: 'forme sur 5 matchs', statut: 'en-essai', jugement: null },
      adoption: { possible: false, texte: 'pas encore jugée' }
    },
    derive: { dernierMois: { mois: '2026-09', derive: true, signaux: [{ type: 'calibration', libelle: 'Résultat (1N2)' }] }, moisFiges: 1, alerte: { key: 'deriveMoteur' }, probleme: null }
  })
});

// ============================================== 1. les règles de l'écran

test('règles : la pastille de chaque état — « pas encore mesuré » sans couleur, illisible en ambre, le feu avec SES mots (jamais une value), à regarder, mesuré', () => {
  const p = R.pastilleDuBloc;
  assert.deepEqual(p({ etat: 'pas-mesure' }), { texte: 'pas encore mesuré', ton: '', icone: 'clock' });
  assert.deepEqual(p({ etat: 'indisponible' }), { texte: 'illisible', ton: 'is-warning', icone: 'alert' });
  assert.deepEqual(p({ etat: 'chargement' }), { texte: 'lecture en cours', ton: '', icone: 'clock' });
  assert.deepEqual(p({ cle: 'donnees', etat: 'ok', feu: 'vert' }), { texte: 'Données vérifiées', ton: 'is-accent', icone: 'check' });
  assert.deepEqual(p({ cle: 'donnees', etat: 'attention', feu: 'orange' }), { texte: 'Données : à regarder', ton: 'is-warning', icone: 'alert' });
  assert.deepEqual(p({ cle: 'donnees', etat: 'attention', feu: 'rouge' }), { texte: 'Données : à vérifier', ton: 'is-danger', icone: 'alert' });
  assert.equal(p({ cle: 'sauvegardes', etat: 'ok', feu: 'vert' }).texte, 'Sauvegardes en ordre');
  assert.equal(p({ cle: 'sauvegardes', etat: 'attention', feu: 'rouge' }).texte, 'Sauvegardes : en défaut');
  assert.equal(p({ cle: 'budget', etat: 'attention', feu: 'rouge' }).texte, 'Budget dépassé');
  assert.deepEqual(p({ cle: 'versions', etat: 'attention', feu: null }), { texte: 'à regarder', ton: 'is-warning', icone: 'alert' });
  assert.deepEqual(p({ cle: 'note', etat: 'ok', feu: null }), { texte: 'mesuré', ton: '', icone: 'check' });
  assert.deepEqual(p(null), { texte: 'pas encore lu', ton: '', icone: 'clock' });
  // Les mots des données sont ceux du feu déjà affiché en haut de l'appli.
  assert.equal(R.MOTS_DES_FEUX.donnees.vert, 'Données vérifiées');
  assert.equal(R.MOTS_DES_FEUX.donnees.orange, 'Données : à regarder');
});

test('règles : le lien vers la vraie place (adresse + onglet ou carte), l’heure d’un bloc (un jour seul ne reçoit pas d’heure inventée), le bandeau', () => {
  const { apres } = reponses;
  assert.deepEqual(R.lienDuBloc(apres.blocs.note), { to: { path: '/historique-moteur', query: { onglet: 'banc' } }, libelle: 'Historique moteur › Banc d’essai' });
  assert.deepEqual(R.lienDuBloc(apres.feux[0]), { to: { path: '/reglages', query: { carte: 'controle-quotidien' } }, libelle: 'Réglages › Contrôle quotidien des données' });
  assert.deepEqual(R.lienDuBloc(apres.feux[1]).to, { path: '/reglages' });
  assert.equal(R.lienDuBloc({ lien: null }), null);
  assert.equal(R.lienDuBloc(null), null);
  assert.deepEqual(R.mesureDuBloc({ mesureLe: '2026-10-13' }), { instant: '2026-10-13', jourSeul: '13/10/2026' });
  assert.deepEqual(R.mesureDuBloc({ mesureLe: '2026-10-13T14:10:11.250Z' }), { instant: '2026-10-13T14:10:11.250Z', jourSeul: null });
  assert.deepEqual(R.mesureDuBloc({ mesureLe: null }), { instant: null, jourSeul: null });
  assert.deepEqual(R.bandeauDeLaPage(null), { lecture: 'Lecture en cours…', duree: null });
  assert.match(R.bandeauDeLaPage({ genereLe: '2026-09-30T12:00:00.000Z', dureeMs: 33.4 }).lecture, /^Page lue le 30\/09\/2026 à \d{2}:\d{2}$/);
  assert.equal(R.bandeauDeLaPage({ genereLe: '2026-09-30T12:00:00.000Z', dureeMs: 33.4 }).duree, '33 ms');
});

test('règles : la note face au marché (deux marchés, perte du moteur et du marché, écart, verdict du banc — aucun vert hors « retenu »), face au championnat seul, le dernier rejeu', () => {
  const note = reponses.apres.blocs.note;
  const d = R.dualsFaceAuMarche(note);
  assert.deepEqual(d.map((x) => [x.libelle, x.matchs, x.moteur, x.marche, x.ecart, x.verdict.texte, x.verdict.ton]), [
    ['Résultat (1N2)', '30 158', '1,0040', '1,0041', '+0,01 %', 'pas prouvé', ''],
    ['Total buts 2,5', '30 158', '0,7342', '0,6770', '−8,45 %', 'moins bon', 'is-danger']
  ]);
  assert.deepEqual(R.dualsFaceAuMarche(null), []);
  const attendu = { retenu: 0, pasProuve: 0, moinsBon: 0, total: 0 };
  for (const l of Object.values(NOTE_DE_DEPART.depart.P2.marches)) {
    attendu.total++;
    if (l.repere.verdict === 'retenu') attendu.retenu++;
    if (l.repere.verdict === 'pas-prouve') attendu.pasProuve++;
    if (l.repere.verdict === 'moins-bon') attendu.moinsBon++;
  }
  assert.equal(R.faceAuRepereDit(note), `${attendu.retenu} marchés mieux, ${attendu.pasProuve} pas prouvés, ${attendu.moinsBon} moins bien (sur ${attendu.total})`);
  assert.equal(R.faceAuRepereDit({ faceAuRepere: { total: 0 } }), null);
  assert.match(R.dernierRejeuDit(note), /^Aucun rejeu du banc n’a tourné sur cette appli pour l’instant \(il se lance depuis Historique moteur › Banc d’essai, 10 à 13 minutes\)\.$/);
  assert.match(R.dernierRejeuDit({ dernierRejeu: { id: 4, finiLe: '2026-10-13T14:10:11.250Z', dureeMs: 1568908 } }), /^Dernier rejeu du banc sur cette appli : n° 4, fini le 13\/10\/2026 à \d{2}:\d{2}, 26 min\.$/);
});

test('règles : l’évolution mois par mois (une pastille par mois figé, jamais verte), la phrase quand aucun mois n’est figé, les chiffres de la calibration (mêmes mots que le bloc d’Historique moteur)', () => {
  const e = R.evolutionDite(reponses.apres.blocs.note.evolution);
  assert.equal(e.length, 1);
  assert.deepEqual([e[0].cle, e[0].mois, e[0].ecart, e[0].juge, e[0].ton], ['2026-08', 'août 2026', '+12,9 points', 'annonce trop bas', 'is-danger']);
  assert.match(e[0].titre, /^août 2026 : 4 455 pronostics réglés sur 300 matchs — /);
  for (const m of R.evolutionDite([{ mois: '2026-07', verdict: 'dans-le-hasard', ecart: 0.01 }, { mois: '2026-08', verdict: 'trop-peu', ecart: null }, { mois: '2026-09', verdict: null, ecart: 0.02 }])) assert.notEqual(m.ton, 'is-accent', m.cle);
  assert.deepEqual(R.evolutionDite([{ mois: '2026-08', verdict: 'trop-peu', ecart: null }]).map((m) => [m.ecart, m.juge]), [['pas mesuré', 'trop peu de matchs']]);
  assert.deepEqual(R.evolutionDite(undefined), []);
  assert.equal(R.evolutionVideDite({ le: '2026-11-01', heure: 6 }), 'Pas encore mesuré : le premier mois figé arrive le 01/11/2026 à partir de 6 h.');
  assert.equal(R.evolutionVideDite(null), 'Pas encore mesuré : aucun mois n’est figé pour l’instant.');
  const c = R.chiffresDeLaCalibration(reponses.apres.blocs.calibration);
  const g = reponses.apres.blocs.calibration.global;
  assert.equal(c.annonce, `${(g.annonce * 100).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`);
  assert.equal(c.ecart, CAL.ecartDit(g.ecart));
  assert.deepEqual(c.juge, CAL.jugeDit(g.juge));
  assert.equal(R.chiffresDeLaCalibration(reponses.avant.blocs.calibration), null, 'pas de bilan : pas de chiffres inventés');
  assert.equal(R.chiffresDeLaCalibration({ global: { pronostics: 0, matchs: 0, annonce: null, realise: null, ecart: null, juge: null } }), null, 'un bilan sans aucun pronostic réglé : pas de chiffres non plus');
  assert.deepEqual(R.jugeDeCloture({ juge: { verdict: 'negative', matchs: 300, minimum: 200 } }), CAL.jugeDeClotureDit({ verdict: 'negative', matchs: 300, minimum: 200 }));
});

test('règles : la liste « à vérifier » (statut en mots, rouge pour un rouge, ambre pour le reste), le reste à voir dans Réglages ; la structure par défaut a les mêmes neuf cadres, titres et liens que la réponse du serveur', () => {
  const r = S.assemblerLaSante({ maintenant, lecteurs: LECTEURS_RICHES });
  const l = R.lignesAVerifier(r.blocs.aVerifier);
  assert.deepEqual(l.map((x) => [x.libelle, x.statut, x.ton]), [['Score face à football-data.co.uk', 'Rouge', 'is-danger'], ['Zéros « non relevé »', 'Orange', 'is-warning']]);
  assert.equal(R.resteAVerifierDit(r.blocs.aVerifier), null);
  assert.equal(R.resteAVerifierDit({ enEchec: [{}, {}], enEchecTotal: 10 }), '… et 8 autres contrôles dans Réglages.');
  assert.deepEqual(R.lignesAVerifier(null), []);
  for (const variante of [{ chargement: true }, { raison: 'Failed to fetch' }]) {
    const d = R.structureParDefaut(variante);
    assert.deepEqual(d.feux.map((f) => f.cle), ['donnees', 'sauvegardes', 'budget']);
    assert.deepEqual(Object.keys(d.blocs), CLES.slice(3));
    for (const b of [...d.feux, ...Object.values(d.blocs)]) {
      const vrai = [...reponses.apres.feux, ...Object.values(reponses.apres.blocs)].find((x) => x.cle === b.cle);
      assert.equal(b.titre, vrai.titre, `${b.cle} : le même titre que le serveur`);
      assert.deepEqual(b.lien, vrai.lien, `${b.cle} : le même lien que le serveur`);
      assert.equal(b.etat, variante.chargement ? 'chargement' : 'indisponible');
    }
  }
  assert.match(R.structureParDefaut({ raison: 'Failed to fetch' }).blocs.note.phrase, /^Le serveur ne répond pas \(Failed to fetch\) : rien n’est lu pour l’instant\./);
});

// ============================================== 2. la page

test('page après la nuit : les trois feux et les six blocs, chacun avec sa source, son heure et son lien ; la courbe annoncé / réalisé du banc d’essai ; « pas encore mesuré » là où la donnée manque ; aucun vert hors des feux', options, async () => {
  appels.length = 0;
  interdits.length = 0;
  const r = await contexte.rendre({ reponse: reponses.apres });
  assert.deepEqual(r.avertissements, []);
  assert.deepEqual(interdits, []);
  assert.equal(appels.length, 1, 'une seule lecture');
  assert.match(appels[0], /^GET .*\/api\/engine-health$/);
  const tx = r.texte;
  for (const morceau of ['Santé du moteur', 'Page lue le 30/09/2026', 'Relire', 'Rien n’est calculé ici']) assert.ok(tx.includes(morceau), `manque : ${morceau}`);
  // Les neuf cadres, dans l'ordre, avec leur état.
  const ordre = [...r.html.matchAll(/data-bloc="([A-Za-z]+)" data-etat="([a-z-]+)"/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(
    ordre,
    CLES.map((cle) => [cle, [...reponses.apres.feux, ...Object.values(reponses.apres.blocs)].find((b) => b.cle === cle).etat])
  );
  assert.deepEqual(ordre.map(([, e]) => e), ['pas-mesure', 'attention', 'ok', 'ok', 'ok', 'ok', 'pas-mesure', 'pas-mesure', 'pas-mesure']);
  // Chaque cadre : son titre, sa pastille, sa source, son heure, son lien.
  for (const cle of CLES) {
    const b = blocDe(r.html, cle);
    const bloc = [...reponses.apres.feux, ...Object.values(reponses.apres.blocs)].find((x) => x.cle === cle);
    const t = texteDe(b);
    assert.ok(t.includes(bloc.titre), `${cle} : titre`);
    assert.ok(t.includes(bloc.valeur), `${cle} : le chiffre « ${bloc.valeur} »`);
    assert.ok(t.includes(bloc.source.libelle), `${cle} : la source réelle`);
    assert.ok(t.includes(bloc.lien.libelle), `${cle} : le lien « ${bloc.lien.libelle} »`);
    const href = /<a [^>]*href="([^"]+)"/.exec(b)?.[1];
    const attendu = bloc.lien.query ? `${bloc.lien.chemin}?${new URLSearchParams(bloc.lien.query)}` : bloc.lien.chemin;
    assert.equal(href, attendu, `${cle} : le lien mène à sa vraie place`);
    // L'heure : celle de la mesure ; sans heure, elle se dit (« heure du relevé inconnue »), jamais un blanc.
    assert.ok(/(contrôlé|préparé|lu|noté|proposé|figé|calculé) .*(\d{2}\/\d{2}|à \d{2}:\d{2}|aujourd|hier)|heure du (relevé|calcul) inconnue/.test(t), `${cle} : l'heure de la mesure ou son absence dite`);
  }
  assert.ok(texteDe(blocDe(r.html, 'note')).includes('noté le 13/10/2026'), 'le jour de la note de départ, sans heure inventée');
  // Les trois feux : « pas encore mesuré » (jamais contrôlé), orange (aucune sauvegarde), vert (budget).
  assert.ok(texteDe(blocDe(r.html, 'donnees')).includes('pas encore mesuré'));
  assert.ok(texteDe(blocDe(r.html, 'sauvegardes')).includes('Sauvegardes : à regarder'));
  assert.ok(texteDe(blocDe(r.html, 'budget')).includes('Budget en ordre'));
  // La note : les deux marchés face au marché, le championnat seul, l'évolution (août, figé), le rejeu.
  const note = texteDe(blocDe(r.html, 'note'));
  for (const morceau of ['Résultat (1N2)', 'Total buts 2,5', 'pas prouvé', 'moins bon', 'Face au championnat seul', 'Évolution mois par mois', 'août 2026 · +12,9 points · annonce trop bas', 'Aucun rejeu du banc']) assert.ok(note.includes(morceau), `note, manque : ${morceau}`);
  // La calibration : la courbe du banc d'essai (CalibrationChart), les trois chiffres, le verdict du juge.
  const cal = blocDe(r.html, 'calibration');
  assert.match(cal, /<svg class="ccal__svg"/);
  assert.ok((cal.match(/class="ccal__point"/g) ?? []).length >= 5, 'des points sur la courbe');
  const tc = texteDe(cal);
  for (const morceau of ['Annoncé face à réalisé', 'Annoncé', 'Réalisé', 'Écart', 'Tous les marchés · septembre 2026 · première valeur', 'marché par marché et championnat par championnat']) assert.ok(tc.includes(morceau), `calibration, manque : ${morceau}`);
  // La clôture : pas de cotes dans la base d'essai — dite, jamais un tiret.
  assert.ok(texteDe(blocDe(r.html, 'cloture')).includes('pas encore mesurée'));
  // Les blocs vides : « pas encore mesuré » et pourquoi.
  assert.ok(texteDe(blocDe(r.html, 'versions')).includes('aucune version n’est notée pour l’instant'));
  assert.ok(texteDe(blocDe(r.html, 'corrections')).includes('étape 26'));
  assert.ok(texteDe(blocDe(r.html, 'aVerifier')).includes('sans lui, aucun pronostic n’est marqué « à vérifier »'));
  // Le vert est celui d'un feu, jamais celui d'un écart, d'un verdict ou d'une clôture.
  for (const cle of ['note', 'calibration', 'cloture', 'aVerifier', 'versions', 'corrections']) assert.doesNotMatch(blocDe(r.html, cle), /is-accent|cm-positive/, `${cle} : pas de vert`);
  assert.match(blocDe(r.html, 'budget'), /is-accent/, 'le feu du budget, lui, a son vert');
});

test('page avant la nuit : le mois en cours n’est pas préparé — la calibration et la clôture restent là, « pas encore mesuré » avec la raison, la courbe vide, l’évolution dit quand viendra le premier mois', options, async () => {
  const r = await contexte.rendre({ reponse: reponses.avant });
  assert.deepEqual(r.avertissements, []);
  for (const cle of ['calibration', 'cloture']) {
    const t = texteDe(blocDe(r.html, cle));
    assert.ok(t.includes('pas encore mesuré'), cle);
    assert.ok(t.includes('préparé chaque nuit par l’actualisation'), cle);
    assert.ok(t.includes('La page ne le calcule jamais'), cle);
  }
  const cal = texteDe(blocDe(r.html, 'calibration'));
  assert.ok(cal.includes('Pas de point : aucun pronostic mesuré dans cette case.'), 'la courbe reste, vide');
  assert.ok(!cal.includes('Annoncé Réalisé Écart'), 'pas de chiffres inventés');
  assert.ok(texteDe(blocDe(r.html, 'note')).includes('Pas encore mesuré : le premier mois figé arrive le 01/10/2026 à partir de 6 h.'));
  assert.deepEqual(
    [...r.html.matchAll(/data-bloc="([A-Za-z]+)" data-etat="([a-z-]+)"/g)].map((m) => m[2]),
    ['pas-mesure', 'attention', 'ok', 'ok', 'pas-mesure', 'pas-mesure', 'pas-mesure', 'pas-mesure', 'pas-mesure']
  );
});

test('page avec des lectures riches : un feu orange, un rouge, un dépassement de budget, la liste « à vérifier », la version et la dérive — chaque couleur à sa place, la page reste un résumé', options, async () => {
  const r0 = S.assemblerLaSante({ maintenant, lecteurs: LECTEURS_RICHES });
  assert.deepEqual(r0.feux.map((f) => f.feu), ['orange', 'vert', 'rouge']);
  assert.equal(r0.feux[1].phrase.includes('restauration d’essai saine'), true);
  const r = await contexte.rendre({ reponse: r0 });
  assert.deepEqual(r.avertissements, []);
  const d = texteDe(blocDe(r.html, 'donnees'));
  assert.ok(d.includes('Données : à regarder') && d.includes('10 contrôles à regarder') && d.includes('sur 35 contrôles'));
  assert.ok(texteDe(blocDe(r.html, 'sauvegardes')).includes('Sauvegardes en ordre'));
  assert.ok(texteDe(blocDe(r.html, 'budget')).includes('Budget dépassé'));
  assert.match(blocDe(r.html, 'budget'), /is-danger/);
  const v = texteDe(blocDe(r.html, 'aVerifier'));
  for (const morceau of ['2 contrôles en échec', '6 clubs et de 17 championnats', 'Rouge', 'Score face à football-data.co.uk', 'Córdoba – Tenerife', 'Orange', 'Zéros « non relevé »', 'cartons jaunes à 0 dans 17 championnats']) assert.ok(v.includes(morceau), `à vérifier, manque : ${morceau}`);
  const versions = texteDe(blocDe(r.html, 'versions'));
  for (const morceau of ['version n° 2', 'forme sur 5 matchs', 'en essai à blanc', 'Dérive du moteur en septembre 2026', 'à regarder']) assert.ok(versions.includes(morceau), `versions, manque : ${morceau}`);
  const note = texteDe(blocDe(r.html, 'note'));
  assert.ok(note.includes('Dernier rejeu du banc sur cette appli : n° 4'));
  assert.doesNotMatch(blocDe(r.html, 'aVerifier'), /is-accent/);
  assert.ok(r.html.length < 80_000, `la page reste légère : ${r.html.length} octets de HTML`);
});

test('page quand le serveur ne répond pas : l’erreur est dite, les neuf cadres restent (« illisible »), aucun avertissement', options, async () => {
  const r = await contexte.rendre({ reponse: { error: 'Failed to fetch' }, statut: 503 });
  assert.deepEqual(r.avertissements, []);
  assert.ok(r.texte.includes('Santé du moteur indisponible'));
  assert.ok(r.texte.includes('Failed to fetch'));
  assert.deepEqual(
    [...r.html.matchAll(/data-bloc="([A-Za-z]+)" data-etat="([a-z-]+)"/g)].map((m) => m.slice(1)),
    CLES.map((cle) => [cle, 'indisponible'])
  );
  for (const cle of CLES) {
    const t = texteDe(blocDe(r.html, cle));
    assert.ok(t.includes('illisible'), cle);
    assert.ok(t.includes('Le serveur ne répond pas'), cle);
  }
  assert.equal([...r.html.matchAll(/<a [^>]*href="/g)].length, 9, 'chaque cadre garde son lien vers sa vraie place');
});

// ============================================== 3. le câblage

test('câblage : la page lit la route une fois, réutilise la courbe du banc d’essai et le cadre commun, ne dessine rien et n’écrit rien ; jetons seulement', () => {
  const vue = fs.readFileSync(path.join(UI, 'src', 'views', 'EngineHealthView.vue'), 'utf8');
  const cadre = fs.readFileSync(path.join(UI, 'src', 'components', 'analysis', 'HealthBlockCard.vue'), 'utf8');
  const service = fs.readFileSync(path.join(UI, 'src', 'services', 'engineHealthApi.js'), 'utf8');
  assert.match(service, /overview: \(\) => httpClient\.get\('\/engine-health'\)/);
  assert.doesNotMatch(service, /httpClient\.(post|put|patch|delete)/);
  assert.match(vue, /import CalibrationChart from '@\/components\/analysis\/CalibrationChart\.vue';/);
  assert.match(vue, /import HealthBlockCard from '@\/components\/analysis\/HealthBlockCard\.vue';/);
  assert.match(cadre, /import ProvenanceChip from '@\/components\/common\/ProvenanceChip\.vue';/);
  assert.match(cadre, /import AppCard from '@\/components\/common\/AppCard\.vue';/);
  for (const [nom, source] of [['la vue', vue], ['le cadre', cadre]]) {
    assert.doesNotMatch(source, /<svg|<circle|<line /, `${nom} : aucun dessin recopié (la courbe est celle du banc d’essai)`);
    assert.doesNotMatch(source, /httpClient\.|fetch\(|predictionsApi|benchApi/, `${nom} : une seule lecture, par le service de la page`);
    assert.doesNotMatch(source, /#[0-9a-f]{3,6}\b|!important|--cm-section-soft\)/i, `${nom} : jetons seulement`);
  }
  assert.match(vue, /onMounted\(charger\);/);
  assert.equal((vue.match(/engineHealthApi\.overview\(\)/g) ?? []).length, 1);
  // Les deux seuls tableaux de la page suivent le dessin commun, les listes sont des listes.
  assert.match(vue, /<table class="cm-table sante__duels">/);
  assert.doesNotMatch(vue, /<select/, 'jamais de <select> natif');
});
