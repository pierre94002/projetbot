/**
 * L'onglet « Banc d'essai » d'Historique moteur (étape 19 du plan) : ses règles et son rendu.
 *   node --test test/bancEcran.test.mjs        (depuis server/)
 *
 * Les réponses de GET /api/bench sont celles du VRAI serveur : la phase « ecran » de test/aides/script-banc.mjs
 * les produit dans une copie isolée (avant tout rejeu, juste après « Lancer le banc », après le rejeu par défaut
 * — P2 à P5, avant-match football-data, cotes gratuites, vos bookmakers — et une demande refusée). Le rendu est
 * fait côté serveur, sans navigateur ni serveur de développement : `fetch` remplacé (seule /api/bench répond,
 * tout le reste est refusé et compté), un Vite « middleware » n'écoute sur aucun port, son cache va dans le
 * dossier d'essais, rien n'est écrit dans ui/. `onMounted` devient `onServerPrefetch` dans le rendu.
 *
 *  1. Les règles de l'écran (ui/src/utils/banc.js) : écarts « +x % [a ; b] » et pastilles, déjà vu, état du
 *     rejeu, reproduction du 23/09, confirmation, paris, fiabilité, écartées, ce qui se prouve.
 *  2. La page dans ses quatre états : aucun rejeu (la note de départ), en cours, après un rejeu, panne de
 *     lecture — toujours les sept blocs.
 *  3. L'hygiène des quatre fichiers et le câblage (onglet, adresse, service).
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
const B = await imp(path.join(UI, 'src', 'utils', 'banc.js'));
const MOINS = '−';
const FICHIERS = [
  ['views', 'BenchView.vue'],
  ['components', 'analysis', 'BenchSummaryTable.vue'],
  ['components', 'analysis', 'CalibrationChart.vue'],
  ['components', 'analysis', 'SimulatedBetsPanel.vue']
];
const TITRES_DES_BLOCS = ['Note de départ', 'Rejeu sur cette appli', 'Moteur, marché, repère', 'Ce qu’il annonçait, ce qui est arrivé', 'Paris simulés', 'Carte championnat × marché', 'D’où viennent ces chiffres'];

/** Les réponses du vrai serveur, produites une fois dans une copie isolée. */
function etatsDuServeur() {
  const copie = preparerCopie({});
  try {
    // L'appli entière (app.js) charge des fournisseurs qui importent scripts/ : la copie en a besoin.
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    const r = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-banc.mjs'), { args: ['ecran'], timeout: 300_000 });
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
    .replace(/[\u202f\u00a0]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

let etats;
let contexte;
let scenario = { reponse: null, statut: 200 };
const appels = [];
const interdits = [];
const avertissements = [];
let originaux = {};

before(async () => {
  etats = etatsDuServeur();
  if (!pret) return;
  originaux = { fetch: globalThis.fetch, warn: console.warn, setInterval: globalThis.setInterval, setTimeout: globalThis.setTimeout };
  // L'horloge partagée de l'appli (liveClock.js) arme un minuteur dès son import : jamais retenu par le test.
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
    if (!/\/api\/bench$/.test(u)) {
      interdits.push(u);
      throw new Error(`fetch interdit dans ce rendu : ${u}`);
    }
    const corps = scenario.statut < 400 ? scenario.reponse : { error: 'Erreur interne du serveur' };
    return { ok: scenario.statut < 400, status: scenario.statut, headers: { get: () => 'application/json' }, json: async () => JSON.parse(JSON.stringify(corps)) };
  };
  console.warn = (...a) => avertissements.push(a.map(String).join(' ').slice(0, 300));
  const { createServer } = await imp(path.join(UI, 'node_modules', 'vite', 'dist', 'node', 'index.js'));
  const vuePlugin = (await imp(path.join(UI, 'node_modules', '@vitejs', 'plugin-vue', 'dist', 'index.mjs'))).default;
  const { renderToString } = await imp(path.join(UI, 'node_modules', 'vue', 'server-renderer', 'index.mjs'));
  const { createSSRApp, h } = await imp(path.join(UI, 'node_modules', 'vue', 'index.mjs'));
  const prefetch = {
    name: 'ssr-prefetch',
    enforce: 'pre',
    transform(code, id) {
      if (!/BenchView\.vue$/.test(id) || id.includes('?')) return null;
      return code.replace(/import \{ ([^}]*)\bonMounted\b([^}]*)\} from 'vue';/, (m, a, b) => `import { ${a}onMounted, onServerPrefetch${b}} from 'vue';`).replace(/onMounted\(/g, 'onServerPrefetch(');
    }
  };
  fs.mkdirSync(RACINE_ESSAIS, { recursive: true });
  const cache = fs.mkdtempSync(path.join(RACINE_ESSAIS, 'cm-rendu-banc-'));
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
  const Page = (await vite.ssrLoadModule('/src/views/BenchView.vue')).default;
  contexte = {
    vite,
    cache,
    async page({ reponse, statut = 200 }) {
      scenario = { reponse, statut };
      const avant = avertissements.length;
      const avantAppels = appels.length;
      const app = createSSRApp({ render: () => h(Page) });
      const html = await renderToString(app, {});
      const vide = /<path(?![^>]*\bd=)[^>]*>/.exec(html);
      assert.equal(vide, null, `une icône inconnue d'AppIcon (tracé vide) : ${vide?.[0]}`);
      return { html, texte: texteDe(html), avertissements: avertissements.slice(avant), appels: appels.slice(avantAppels) };
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

const boutons = (html) => [...html.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)].map((m) => ({ texte: texteDe(m[2]), desactive: /\sdisabled(=|\s|$)/.test(m[1]) }));
const lireUi = (...c) => fs.readFileSync(path.join(UI, 'src', ...c), 'utf8');
/** Les sept blocs, dans l'ordre de la page. */
function septBlocs(texte) {
  let depuis = -1;
  for (const titre of TITRES_DES_BLOCS) {
    const i = texte.indexOf(titre, depuis + 1);
    assert.ok(i > depuis, `le bloc « ${titre} » manque ou n'est pas à sa place`);
    depuis = i;
  }
}

// ============================================== 1. les règles de l'écran

test('banc.js : l’écart du juge « +0,4 % [−0,1 ; +0,9] » et sa pastille (vert seulement « retenu ») ; le déjà vu ; les marchés nommés ; les pertes et pourcentages dits, jamais un tiret', () => {
  const retenu = B.ecartDuJuge({ verdict: 'retenu', enPourcent: { gain: 0.4, fourchette: [-0.1, 0.9] }, raison: 'au-dessus de zéro', variantes: 12 });
  assert.equal(retenu.texte, `+0,4 % [${MOINS}0,1 ; +0,9]`);
  assert.deepEqual(retenu.pastille, { texte: 'retenu', ton: 'is-accent', icone: 'check' });
  assert.equal(retenu.variantes, 12);
  assert.equal(B.ecartDuJuge({ verdict: 'moins-bon', enPourcent: { gain: -8.45, fourchette: [-9.74, -7.17] } }).texte, `${MOINS}8,5 % [${MOINS}9,7 ; ${MOINS}7,2]`);
  assert.equal(B.ecartDuJuge({ verdict: 'moins-bon', enPourcent: { gain: -1, fourchette: [-2, -0.5] } }).pastille.ton, 'is-danger');
  assert.equal(B.ecartDuJuge({ verdict: 'pas-prouve', enPourcent: { gain: 0.01, fourchette: [-0.04, 0.05] } }).pastille.ton, '');
  assert.equal(B.ecartDuJuge({ verdict: 'pas-prouve', enPourcent: { gain: 0.01, fourchette: [-0.04, 0.05] } }).texte, `+0,01 % [${MOINS}0,04 ; +0,05]`, 'deux décimales sous 0,1 %');
  assert.equal(B.ecartDuJuge({ verdict: 'pas-assez-de-matchs', enPourcent: null }).texte, 'pas de gain calculé');
  assert.equal(B.ecartDuJuge(null), null);
  assert.deepEqual(B.texteDesVues({ total: 10, parFenetre: { 'mesures-du-23-09': 10 } }), { texte: 'déjà vues (vérification du 23/09)', vues: true });
  assert.deepEqual(B.texteDesVues({ total: 10, parFenetre: { 'regle-de-value-23-09': 5 } }), { texte: 'déjà vues par le choix du livre de référence et la règle de pari — 50 % des matchs', vues: true });
  assert.deepEqual(B.texteDesVues({ total: 10, parFenetre: {} }), { texte: 'jamais vues', vues: false });
  assert.equal(B.libelleDuMarche('totalGoals', 2.5), 'Total buts 2,5');
  assert.equal(B.libelleDuMarche('teamCorners:home', 4.5), 'Corners à domicile 4,5');
  assert.equal(B.perteDite(1.00344499), '1,0034');
  assert.equal(B.perteDite(null), 'pas mesurée');
  assert.equal(B.pourcentDit(50.2578), '50,3 %');
  assert.equal(B.pourcentDit(undefined), 'pas mesuré');
  assert.deepEqual(B.TRANCHES.map((t) => t.id), ['P1', 'P2', 'P3', 'P4a', 'P4b', 'P5']);
});

test('banc.js : l’état du rejeu (aucun, en cours avec la passe football-data, refusé, arrêté, fini), la reproduction du 23/09 (à l’identique dans le bac, à la tolérance chez Pierre), la confirmation (10 à 13 minutes, rien de changé)', () => {
  assert.match(B.etatDuRejeu({}).texte, /^Aucun rejeu encore sur cette appli : la note de départ vient du bac à sable\.$/);
  assert.equal(B.etatDuRejeu({ enCours: { partie: 'football-data', fait: 12400, total: 30204, date: '2021-03-14' } }).texte.replace(/\u202f/g, ' '), 'En cours : football-data 12 400 / 30 204 (14/03/2021).');
  assert.equal(B.etatDuRejeu({ enCours: { partie: 'préparation', fait: 0, total: null } }).enCours, true);
  // Le refus en langage simple (correction du 19/10 : « processus » n'est pas un mot pour Pierre).
  assert.equal(B.etatDuRejeu({ dernierRefus: { raison: 'verrou détenu par un autre processus' } }).texte, 'Pas lancé : une autre tâche tenait la base (un import ou une actualisation lancés à la main).');
  assert.equal(B.etatDuRejeu({ dernierRefus: { raison: 'actualisation en cours dans ce processus' } }).texte, 'Pas lancé : actualisation tournait déjà.');
  assert.equal(B.raisonDite('Une actualisation tient la base'), 'Une actualisation tient la base', 'une raison déjà simple, telle quelle');
  const arrete = B.etatDuRejeu({ dernierRejeu: { finiLe: '2026-10-13T12:00:00.000Z', bilan: { erreur: 'Fuite : un fait du 2021-03-14 au jour J' } } });
  assert.equal(arrete.ton, 'is-danger');
  assert.match(arrete.texte, /^Dernier rejeu arrêté : Fuite/);
  const fini = B.etatDuRejeu({ dernierRejeu: { finiLe: '2026-10-13T12:59:13.614Z', bilan: { dureeMs: 689026, rencontres: { rejouees: 106662 } }, options: { periodes: ['P2', 'P3', 'P4', 'P5'] } } });
  assert.equal(fini.texte.replace(/\u202f/g, ' '), 'Dernier rejeu le 13/10 à 14:59, 11,5 min, 106 662 rencontres (P2, P3, P4, P5).');
  // La reproduction : la note du bac la retrouve à l'identique.
  const rp = etats.vide.noteDeDepart.reproduction;
  const bac = B.phraseDeLaReproduction(rp);
  assert.equal(bac.egal, true);
  assert.match(bac.texte.replace(/\u202f/g, ' '), /^Référence du 23\/09 retrouvée : 12 997 matchs de 2025-26, 50,26 % de résultats justes, perte log 1,0034 sur les cotes de clôture \(attendu : 12 997, 50,26 %, 1,0034\)\.$/);
  assert.match(bac.moteur, /même chose sur 12.973 matchs \(24 cotes incohérentes refusées/);
  // Chez Pierre, sa base a vécu : ± 1 % de matchs et 0,001 de perte log ; au-delà, « pas retrouvée ».
  const proche = { ...rp, lectureDirecte: { ...rp.lectureDirecte, matchs: 13050, perteLog: 1.0041 } };
  assert.equal(B.phraseDeLaReproduction(proche, { ici: true }).egal, true);
  assert.match(B.phraseDeLaReproduction(proche, { ici: true }).texte, /retrouvée \(à ± 1 % de matchs et 0,001 de perte log près\)/);
  assert.equal(B.phraseDeLaReproduction(proche).egal, false, 'dans le bac, l’égalité exacte');
  assert.equal(B.phraseDeLaReproduction({ ...rp, lectureDirecte: { ...rp.lectureDirecte, matchs: 12000 } }, { ici: true }).egal, false);
  assert.match(B.phraseDeLaReproduction({ ...rp, moteur: { ...rp.moteur, maxEcartP: 0.02 } }).moteur, /s’écarte de la lecture directe : jusqu’à 2,00 point/);
  assert.equal(B.phraseDeLaReproduction(null), null);
  assert.match(B.CONFIRMATION_DU_LANCEMENT, /environ 10 à 13 minutes/);
  assert.match(B.CONFIRMATION_DU_LANCEMENT, /aucune actualisation ne tourne/);
  assert.match(B.CONFIRMATION_DU_LANCEMENT, /Rien n’est changé dans vos chiffres, vos paris ou vos réglages/);
});

test('banc.js : les tuiles de la note de départ (P2 jamais vue, P4b à côté, déjà vue), le tableau de la note (P2 et P4b), la courbe et la fiabilité de la note, les paris de la note ; ce qui se prouve', () => {
  const note = etats.vide.noteDeDepart;
  const tuiles = B.tuilesDeLaNote(note);
  const r2 = note.depart.P2.marches.result;
  assert.equal(tuiles.resultat.valeur, B.perteDite(r2.moteur.perteLog));
  assert.match(tuiles.resultat.detail, /matchs de 2019-2023 \(jamais vus\)/);
  assert.match(tuiles.resultat.aCote, /^2025-26 \(déjà vue\) : /);
  assert.equal(tuiles.score.valeur, B.pourcentDit(note.depart.P2.marches.scoreExact.moteur.justes));
  assert.match(tuiles.paris.detail, /\(rapporté\) · valeur de clôture/);
  assert.equal(tuiles.paris.valeur.replace(/\u202f/g, ' '), `${note.depart.P2.paris.paris} paris`);
  assert.equal(B.tuilesDeLaNote(null), null);
  const tableau = B.tableauDeLaNote(note);
  assert.deepEqual(tableau.colonnes.map((c) => c.id), ['P2', 'P4b']);
  assert.equal(tableau.lignes.length, 27, 'une ligne par ligne de marché');
  assert.equal(tableau.lignes[0].marketKey, 'result');
  assert.deepEqual(tableau.lignes[0].cellules.P4b.vues, { texte: 'déjà vues (vérification du 23/09)', vues: true });
  assert.deepEqual(tableau.lignes[0].cellules.P2.vues, { texte: 'jamais vues', vues: false });
  // Les vues de la note : lues dans la note, jamais redites en dur (correction du 19/10) — une P2 « vue » le dirait partout.
  assert.match(B.phraseDeLaNote(note).detail, /2019-2023 : jamais vu par les réglages ; 2025-26 : déjà vu \(vérification du 23\/09\)\./);
  const noteVue = { ...note, depart: { ...note.depart, P2: { ...note.depart.P2, vues: ['27:v1:1'] } } };
  assert.match(B.tuilesDeLaNote(noteVue).resultat.detail, /matchs de 2019-2023 \(déjà vus\)/);
  assert.match(B.phraseDeLaNote(noteVue).detail, /2019-2023 : déjà vu \(étape 27, version v1\) ; 2025-26 : déjà vu \(vérification du 23\/09\)\./);
  assert.deepEqual(B.tableauDeLaNote(noteVue).lignes[0].cellules.P2.vues, { texte: 'déjà vues (étape 27, version v1)', vues: true });
  // Le commit du dépôt qui porte le moteur (correction du 19/10) : dit, qu'il existe ou non — sans lui, l'étape 47 ne le rejoue pas.
  assert.match(B.phraseDeLaNote({ ...note, moteur: { ...note.moteur, commit: null } }).commit, /^Aucun commit du dépôt ne porte encore ce moteur : la preuve finale \(étape 47\) attend/);
  assert.equal(B.phraseDeLaNote({ ...note, moteur: { ...note.moteur, commit: 'ab'.repeat(20) } }).commit, 'Commit du dépôt : abababab….');
  assert.match(B.phraseDeLaNote({ ...note, moteur: { ...note.moteur, commit: 'abc1234' } }).commit, /^Aucun commit/, 'un commit abrégé ne compte pas');
  const courbe = B.courbeDeLaNote(note, { tranche: 'P2', marketKey: 'result' });
  assert.equal(courbe.calibration.table, 'cotes');
  const fiab = B.fiabiliteFaceAuBanc(courbe.calibration, etats.vide.fiabilite);
  assert.equal(fiab.lignes.length, 6);
  assert.equal(fiab.lignes[1].appli.replace(/\u202f/g, ' '), '44,3 % sur 4 822 matchs');
  assert.equal(fiab.lignes[1].tranche, '40 – 50 %');
  assert.equal(B.fiabiliteFaceAuBanc({ table: 'dixiemes', tranches: [{ de: 0, a: 0.1, n: 0 }] }, etats.vide.fiabilite).sansReference, true);
  const paris = B.parisDeLaNote(note, etats.vide.regles);
  assert.equal(paris.length, 1);
  assert.equal(paris[0].vosParis, true);
  assert.equal(paris[0].lignes[0].paris, note.depart.P2.paris.paris);
  assert.equal(paris[0].lignes[0].detail, null, 'la note ne garde pas le détail par cote et par championnat');
  assert.equal(B.CE_QUI_SE_PROUVE.length, 7);
  assert.match(B.CE_QUI_SE_PROUVE.find((p) => p.quoi === 'Paris : rendement').preuve, /^jamais : rapporté/);
  assert.match(etats.vide.decisions.phraseParisP5, /fin mars 2027/);
});

test('banc.js : sur un vrai rejeu (la route du serveur) — le tableau par jeu de prix, les paris (la règle du moteur d’abord, les variantes « pas vos paris »), la carte par groupe, les écartées avec le lien 4 dit même à zéro', () => {
  const rejeu = etats.fini.dernierRejeuReussi;
  const resume = rejeu.resume;
  // La reproduction du 23/09, calculée par le bouton (correction du 19/10) : toutes les lignes lien = 1 de 2025-26 à clôture
  // complète, comptées en SQL dans la copie ; le moteur rejoué la redonne (cotes incohérentes refusées et comptées).
  const rp = resume.reproduction;
  assert.ok(rp, 'la reproduction calculée sans le jeu « fd-cloture »');
  assert.equal(rp.lectureDirecte.matchs, etats.reproductionAttendue);
  assert.equal(rp.moteur.matchs + rp.moteur.cotesIncoherentes, rp.lectureDirecte.matchs);
  assert.ok(rp.moteur.maxEcartP <= 1e-9, `écart du moteur : ${rp.moteur.maxEcartP}`);
  assert.ok(rejeu.bilan.reproductionAnalyses >= rp.lectureDirecte.matchs, `ses analyses comptées à part : ${rejeu.bilan.reproductionAnalyses} pour ${rp.lectureDirecte.matchs} matchs`);
  const tableau = B.tableauDuRejeu(resume, { prix: 'fd-avant-match' });
  assert.ok(tableau.colonnes.some((c) => c.id === 'P2'));
  for (const l of tableau.lignes) for (const c of Object.values(l.cellules)) assert.ok(Number.isInteger(c.n) && c.n > 0);
  const avecTemoins = tableau.lignes.find((l) => l.marketKey === 'result').cellules.P2.temoins;
  assert.match(avecTemoins, /^Brier \d,\d{4} \(marché \d,\d{4}\) · RPS \d,\d{4} \(marché \d,\d{4}\)$/, 'Brier et RPS en témoins, sans pastille');
  const jeux = B.jeuxDuRejeu(resume, etats.fini.jeux);
  assert.equal(jeux[0].value, 'fd-avant-match', 'l’avant-match d’abord');
  const regles = B.parisDuRejeu(resume);
  assert.equal(regles[0].regle, 'moteur');
  assert.equal(regles[0].vosParis, true);
  for (const r of regles.slice(1)) assert.equal(r.vosParis, false, `${r.regle} n’est pas « vos paris »`);
  const ligne = regles[0].lignes.find((l) => l.paris > 0);
  assert.ok(ligne.detail.parCote.length > 0);
  assert.equal(ligne.detail.total.n, ligne.paris);
  assert.equal(ligne.detail.parLigue.reduce((s, x) => s + x.n, 0), ligne.paris, 'Σ des championnats = les paris');
  const carte = B.carteDuRejeu(resume, { tranche: 'P2', groupe: 'buts' });
  assert.ok(carte.lignes.length > 0);
  assert.ok(carte.marches.every((m) => B.GROUPES_DE_LA_CARTE[0].cles.includes(m.cle.split('|')[0])));
  const corners = B.carteDuRejeu(resume, { tranche: 'P2', groupe: 'corners' });
  assert.ok(corners.marches.every((m) => m.cle.startsWith('totalCorners') || m.cle.startsWith('teamCorners')));
  const ecartees = B.ecarteesDuRejeu(rejeu);
  assert.ok(ecartees.globales.some((e) => e.cle === 'lien4' && /lien 4\) : écartées et comptées \(décision de Pierre\)/.test(e.texte)));
  assert.ok(ecartees.parTranche.some((t) => t.raisons.some((r) => /moins de 6 relevés de corners/.test(r.texte))));
  assert.ok(ecartees.parTranche.some((t) => t.raisons.some((r) => /^statistique non relevée : corners \d/.test(r.texte))));
  assert.equal(B.ecarteesDuRejeu({ bilan: { ecartees: {}, liensFd: { E0: { 0: 10, 4: 2 } } }, resume: null }).globales.find((e) => e.cle === 'lien4').texte.startsWith('2 ligne(s)'), true);
  assert.equal(B.ecarteesDuRejeu(null), null);
  // Les lignes football-data jamais rejouées d'après juin 2023 : comptées par code, et nommées (correction du 19/10 : elles
  // n'étaient pas « laissées au magasin », qui ne suit pas ces championnats).
  assert.equal(Object.values(rejeu.bilan.fdHorsSourceParCode ?? {}).reduce((s, n) => s + n, 0), rejeu.bilan.ecartees.fdHorsSource);
  const hors = B.ecarteesDuRejeu({ bilan: { ecartees: { fdHorsSource: 5 }, fdHorsSourceParCode: { JPN: 2, EC: 3 } }, resume: null }).globales.find((e) => e.cle === 'fdHorsSource');
  assert.match(hors.texte, /^5 ligne\(s\) football-data d’après juin 2023 non rejouées : .* il ne suit pas ces championnats \(National League 3, J-League 2\)$/);
});

// ============================================== 2. la page

test('la page sans rejeu : les sept blocs, la note de départ du bac (tuiles, reproduction, tableau P2 et P4b), « Lancer le banc » actif, la carte qui attend le premier rejeu ; seule /api/bench est lue', options, async () => {
  const { html, texte, avertissements: av, appels: lus } = await contexte.page({ reponse: etats.vide });
  septBlocs(texte);
  assert.deepEqual(av, [], 'aucun avertissement de Vue');
  assert.deepEqual(lus.map((u) => u.replace(/^.*\/api/, '/api')), ['/api/bench']);
  assert.match(texte, /Aucun rejeu encore sur cette appli : la note de départ vient du bac à sable\./);
  assert.match(texte, /Référence du 23\/09 retrouvée : 12 997 matchs/);
  assert.match(texte, /1N2 sur les cotes d’avant-match/);
  assert.match(texte, /P2 · preuve ancienne/);
  assert.match(texte, /P4b · déjà vu/);
  assert.match(texte, /déjà vues \(vérification du 23\/09\)/);
  assert.match(texte, /jamais vues/);
  assert.match(texte, /Le moteur est Pinnacle : l’écart au marché mesure Pinnacle face à la moyenne\./);
  assert.match(texte, /Fourchette élargie pour 999 cases jugées/);
  assert.match(texte, /44,3 % sur 4 822 matchs/, 'la fiabilité affichée face au banc');
  assert.match(html, /<svg class="ccal__svg"/, 'la courbe de la note');
  assert.match(texte, /Règle du moteur/);
  assert.match(texte, /fin mars 2027/);
  assert.match(texte, /La carte vient avec le premier rejeu sur cette appli/);
  assert.match(texte, /football-data\.co\.uk, fichiers CSV gardés sur ce PC/);
  const lancer = boutons(html).find((b) => /Lancer le banc/.test(b.texte));
  assert.ok(lancer, 'le bouton est là');
  assert.equal(lancer.desactive, false);
});

test('la page pendant un rejeu : « En cours : préparation », le bouton désactivé ; l’avancement relu sans le résumé ; la demande refusée par la route dit pourquoi (400)', options, async () => {
  const { html, texte } = await contexte.page({ reponse: etats.pendant });
  septBlocs(texte);
  assert.match(texte, /En cours : préparation 0/);
  assert.equal(boutons(html).find((b) => /Lancer le banc/.test(b.texte)).desactive, true);
  assert.equal(etats.lance.code, 202);
  assert.deepEqual(etats.lance.options.periodes, ['P2', 'P3', 'P4', 'P5'], 'les périodes par défaut');
  assert.deepEqual(etats.lance.options.prix, ['fd-avant-match', 'gratuites-avant-match', 'vos-bookmakers'], 'les prix par défaut');
  assert.equal(etats.refuse.code, 400);
  // La relecture de l'avancement : le même dernier rejeu, son bilan, jamais son résumé.
  assert.deepEqual([etats.leger.id, etats.leger.aUnResume, etats.leger.bilan], [etats.fini.dernierRejeuReussi.id, false, true]);
  assert.ok(etats.leger.octets < etats.leger.octetsComplet / 2, `${etats.leger.octets} octets au lieu de ${etats.leger.octetsComplet}`);
});

test('la page après un rejeu : le dernier rejeu dit, le tableau du rejeu (« +x % [a ; b] », pastilles retenu et moins bon), les variantes « pas le prix d’un de vos bookmakers », la carte, les écartées', options, async () => {
  const { html, texte, avertissements: av } = await contexte.page({ reponse: etats.fini });
  septBlocs(texte);
  assert.deepEqual(av, []);
  assert.match(texte, /Dernier rejeu le \d\d\/\d\d à \d\d:\d\d, \d+,\d min, [\d ]+ rencontres \(P2, P3, P4, P5\)\./);
  assert.match(texte, /Rejeu n° 1 de cette appli\./);
  assert.match(texte, /[+−]\d+,\d % \[[+−]\d+,\d ; [+−]\d+,\d\]/, 'un écart et sa fourchette');
  // Les classes rendues côté serveur : « is-accent cm-chip » (la liée d'abord) ; vert = « retenu », rouge = « moins bon ».
  const pastilles = (ton) => [...html.matchAll(/<span class="([^"]*)"[^>]*>((?:(?!<\/span>)[\s\S])*)<\/span>/g)].filter((m) => m[1].split(' ').includes('cm-chip') && m[1].split(' ').includes(ton)).map((m) => texteDe(m[2]));
  assert.ok(pastilles('is-accent').some((t) => /retenu/.test(t)), 'une pastille verte « retenu »');
  assert.ok(pastilles('is-danger').some((t) => /moins bon/.test(t)), 'une pastille rouge « moins bon »');
  for (const t of pastilles('is-accent')) assert.match(t, /retenu/, 'le vert n’est jamais que « retenu »');
  assert.match(texte, /Brier \d,\d{4}/);
  assert.match(texte, /pas le prix d’un de vos bookmakers/);
  assert.match(texte, /Pire série/);
  assert.match(texte, /Championnat/);
  assert.match(texte, /lien 4\) : écartées et comptées \(décision de Pierre\)/);
  assert.match(texte, /Rencontres rejouées/);
  assert.equal(boutons(html).find((b) => /Lancer le banc/.test(b.texte)).desactive, false);
});

test('la page quand le serveur ne répond pas : la panne dite, et toujours les sept blocs (structure complète)', options, async () => {
  const { texte } = await contexte.page({ reponse: null, statut: 500 });
  assert.match(texte, /Le banc ne se lit pas Erreur interne du serveur/);
  septBlocs(texte);
  assert.match(texte, /Pas encore de note de départ/);
  assert.deepEqual(interdits, [], 'aucune autre adresse lue');
});

// ============================================== 3. hygiène et câblage

test('hygiène : jetons de couleur seulement, ni couleur en dur ni !important ni police sous 10 px, icônes connues ; le vert n’est que la pastille « retenu » ; une seule écriture, confirmée', () => {
  const jetons = fs.readFileSync(path.join(UI, 'src', 'assets', 'styles', 'tokens.css'), 'utf8');
  const connues = new Set([...fs.readFileSync(path.join(UI, 'src', 'components', 'common', 'AppIcon.vue'), 'utf8').matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]));
  for (const f of FICHIERS) {
    const vue = lireUi(...f);
    const style = vue.slice(vue.indexOf('<style'));
    assert.doesNotMatch(style, /#[0-9a-f]{3,8}\b|rgba?\(\s*\d/i, `${f.at(-1)} : aucune couleur en dur`);
    assert.doesNotMatch(vue, /!important/);
    for (const m of style.matchAll(/font-size:\s*([\d.]+)px/g)) assert.ok(Number(m[1]) >= 10, `${f.at(-1)} : police ${m[1]} px`);
    for (const m of style.matchAll(/var\((--cm-[a-z0-9-]+)/g)) assert.ok(jetons.includes(`${m[1]}:`), `${f.at(-1)} : jeton inconnu ${m[1]}`);
    for (const m of vue.matchAll(/<AppIcon name="(\w+)"/g)) assert.ok(connues.has(m[1]), `${f.at(-1)} : icône inconnue ${m[1]}`);
    assert.doesNotMatch(vue, /ValueBadge|class="[^"]*is-accent/, `${f.at(-1)} : le vert reste celui des verdicts`);
    assert.doesNotMatch(vue, /\bfetch\s*\(|httpClient/, `${f.at(-1)} : aucune lecture directe`);
  }
  const page = lireUi('views', 'BenchView.vue');
  assert.match(page, /container: banc \/ inline-size;/);
  assert.match(page, /if \(typeof window !== 'undefined' && !window\.confirm\(CONFIRMATION_DU_LANCEMENT\)\) return;/, 'toujours une confirmation');
  assert.match(page, /await benchApi\.lancer\(\{\}\);/);
  assert.equal([...page.matchAll(/benchApi\.\w+\(/g)].length, 3, 'une lecture, l’avancement (sans le résumé) et un lancement, rien d’autre');
  assert.match(page, /const leger = await benchApi\.avancement\(\);/);
  assert.match(page, /if \(typeof window === 'undefined' \|\| !etat\.value\?\.enCours\) return;/, 'relu seulement pendant un rejeu, dans le navigateur');
  for (const f of FICHIERS.slice(1)) assert.doesNotMatch(lireUi(...f), /benchApi|services\//, `${f.at(-1)} : le composant n’appelle rien`);
});

test('câblage : l’onglet « Banc d’essai » d’Historique moteur, /banc-d-essai qui y mène, le service (GET /bench, POST /bench/run)', () => {
  const historique = lireUi('views', 'PredictionsHistoryView.vue');
  assert.match(historique, /\{ value: 'banc', label: 'Banc d’essai' \}/);
  assert.match(historique, /import BenchView from '@\/views\/BenchView\.vue';/);
  assert.match(historique, /<BenchView v-else-if="activeTab === 'banc'" key="banc" \/>/);
  const routeur = lireUi('router', 'index.js');
  assert.match(routeur, /path: '\/banc-d-essai',\n\s+name: 'bench',\n\s+redirect: \{ path: '\/historique-moteur', query: \{ onglet: 'banc' \} \}/);
  const api = lireUi('services', 'benchApi.js');
  assert.match(api, /etat: \(\) => httpClient\.get\('\/bench'\),/);
  assert.match(api, /avancement: \(\) => httpClient\.get\('\/bench\?resume=non'\),/);
  assert.match(api, /lancer: \(options = \{\}\) => httpClient\.post\('\/bench\/run', options\)/);
});
