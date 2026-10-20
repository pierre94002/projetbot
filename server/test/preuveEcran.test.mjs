/**
 * Le bloc « Preuve après lancement » de la feuille de route (étape 16 du plan) : ses règles et son rendu.
 *   node --test test/preuveEcran.test.mjs        (depuis server/)
 *
 * 15. Les règles pures de ui/src/utils/preuve.js (formatage du gain et de sa fourchette, pastilles des
 *     verdicts, ligne des matchs jugés, les cinq lignes du bloc) et les trois phrases du guide de lecture.
 * 14. Le RENDU côté serveur (sans navigateur ni serveur de développement : `fetch` remplacé et tout appel
 *     refusé, Vite en mode « middleware » sans port, cache dans le dossier d'essais, rien écrit dans ui\)
 *     d'un lot de la feuille de route avec l'état du VRAI serveur — etatFeuilleDeRoute et
 *     etatPourFeuilleDeRoute sur un registre TEMPORAIRE rempli par les fonctions du registre, jugements
 *     FABRIQUÉS : chaque verdict, une étape lancée non jugée, une étape à juger non lancée, un registre
 *     illisible ; les étapes qui ne touchent pas aux chiffres n'ont pas le bloc ; les textes que comptent
 *     les tests d'écran d'avant (« Gain mesuré », « Note de Pierre »…) n'y sont pas repris.
 * Les valeurs attendues sont écrites à la main.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SERVEUR, RACINE_ESSAIS } from './aides/isolement.mjs';
import { etatFeuilleDeRoute } from '../src/data/roadmap/feuilleDeRoute.js';
import { enregistrerLancements, declarerVariante, enregistrerJugement, etatPourFeuilleDeRoute } from '../src/bench/trialsRegistry.js';
import { ETAPES } from '../src/data/roadmap/plan.js';
import { HISTORIQUE } from '../src/data/roadmap/historique.js';

const UI = path.resolve(SERVEUR, '..', 'ui');
const fichierRegles = path.join(UI, 'src', 'utils', 'preuve.js');
const P = fs.existsSync(fichierRegles) ? await import(pathToFileURL(fichierRegles).href) : null;
const G = await import(pathToFileURL(path.join(UI, 'src', 'utils', 'langageParis.js')).href);
const reglesPretes = { skip: P ? false : 'ui/src/utils/preuve.js manque' };
const pret = ['vite', '@vitejs/plugin-vue', 'vue'].every((p) => fs.existsSync(path.join(UI, 'node_modules', p)));
const rendu = { skip: pret ? false : 'ui/node_modules (vite, plugin-vue, vue) manque' };

const NNBSP = '\u202f'; // l'espace fine insécable des milliers, en français
const MOINS = '\u2212'; // le vrai signe moins

// ------------------------------------------------------------ 15. les règles

test('preuve.js : le gain et sa fourchette — une décimale, signe toujours écrit, vrai signe moins, « ; » entre les bornes ; zéro s’écrit +0,0', reglesPretes, () => {
  assert.equal(P.texteGain({ gain: 0.4, fourchette: [-0.2, 1.0], quoi: 'de perte log en moins' }), `+0,4 % [${MOINS}0,2 ; +1,0] de perte log en moins`);
  assert.deepEqual(P.morceauxGain({ gain: 0.4, fourchette: [-0.2, 1.0], quoi: 'de perte log en moins' }), { gain: '+0,4 %', fourchette: `[${MOINS}0,2 ; +1,0]`, quoi: 'de perte log en moins' });
  assert.equal(P.texteGain({ gain: 0, fourchette: [0, 0], quoi: 'par unité misée' }), '+0,0 % [+0,0 ; +0,0] par unité misée');
  assert.equal(P.nombreSigne(-0), '+0,0', '−0 n’existe pas à l’écran');
  assert.equal(P.nombreSigne(-1.25), `${MOINS}1,3`);
  assert.equal(P.nombreSigne(0.04), '+0,0');
  assert.equal(P.nombreSigne(1234.56), `+1${NNBSP}234,6`);
  assert.equal(P.texteGain({ gain: -2.34, fourchette: [-4.1, -0.6], quoi: 'de Brier en moins' }), `${MOINS}2,3 % [${MOINS}4,1 ; ${MOINS}0,6] de Brier en moins`);
  // Sans fourchette : le gain seul ; sans gain : rien (la ligne dit pourquoi).
  assert.equal(P.texteGain({ gain: 1.5, fourchette: null, quoi: 'de valeur de clôture en plus' }), '+1,5 % de valeur de clôture en plus');
  assert.equal(P.texteGain({ gain: null, fourchette: null, quoi: 'x' }), null);
  assert.equal(P.morceauxGain(null), null);
  assert.ok(!P.texteGain({ gain: 0.4, fourchette: [-0.2, 1], quoi: '' }).includes('-'), 'jamais le tiret à la place du signe moins');
});

test('preuve.js : les quatre verdicts (vert pour « retenu » seulement), « pas encore jugée », un verdict inconnu dit tel quel ; la ligne des matchs jugés au jour de Paris', reglesPretes, () => {
  assert.deepEqual(
    ['retenu', 'pas-prouve', 'moins-bon', 'pas-assez-de-matchs'].map((v) => ({ ...P.libelleVerdict(v) })),
    [
      { texte: 'retenu', ton: 'is-accent', icone: 'check' },
      { texte: 'pas prouvé', ton: '', icone: 'info' },
      { texte: 'moins bon', ton: 'is-danger', icone: 'alert' },
      { texte: 'pas assez de matchs', ton: 'is-warning', icone: 'clock' }
    ]
  );
  assert.deepEqual({ ...P.libelleVerdict(null) }, { texte: 'pas encore jugée', ton: '', icone: 'clock' });
  assert.deepEqual(P.libelleVerdict('a-revoir'), { texte: 'a-revoir', ton: '', icone: 'info' });
  // Chaque icône existe dans AppIcon (un nom inconnu s'afficherait vide).
  const connues = new Set([...fs.readFileSync(path.join(UI, 'src', 'components', 'common', 'AppIcon.vue'), 'utf8').matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]));
  for (const v of [...Object.values(P.VERDICTS), P.libelleVerdict(null), P.lignesPreuve({ registre: 'illisible' }).verdict.pastille]) assert.ok(connues.has(v.icone), v.icone);
  // La ligne des matchs : nombre, période, jour du jugement À PARIS (23 h 30 UTC le 25/11 = le 26/11 à Paris).
  const jugement = { n: { matchs: 1240 }, fenetre: { de: '2026-11-10', a: '2026-11-24' }, le: '2026-11-25T02:10:00.000Z' };
  assert.equal(P.ligneMatchs(jugement), `1${NNBSP}240 matchs, du 10/11 au 24/11 (jugé le 25/11/2026)`);
  assert.equal(P.ligneMatchs({ ...jugement, le: '2026-11-25T23:30:00.000Z' }), `1${NNBSP}240 matchs, du 10/11 au 24/11 (jugé le 26/11/2026)`);
  assert.equal(P.ligneMatchs({ n: { matchs: 1 }, fenetre: { de: '2026-11-10', a: '2026-11-10' }, le: '2026-11-11T10:00:00Z' }), '1 match, le 10/11 (jugé le 11/11/2026)');
  assert.equal(P.ligneMatchs({ n: { matchs: 0 }, fenetre: { de: null, a: null }, le: '2026-11-11T10:00:00Z' }), '0 match (jugé le 11/11/2026)');
});

test('preuve.js : les CINQ lignes du bloc, toujours les cinq — jugée, lancée non jugée, pas lancée, registre illisible ; aucune sans mesure', reglesPretes, () => {
  assert.equal(P.lignesPreuve(null), null);
  const jugee = P.lignesPreuve({
    aJuger: true,
    registre: 'enregistre',
    lancement: { version: 'score-marche-v1', quoi: 'x', le: '2026-11-09', heure: null },
    variantes: 3,
    jugement: { le: '2026-11-25T02:10:00.000Z', verdict: 'pas-prouve', raison: 'La fourchette contient zéro.', n: { matchs: 1240 }, fenetre: { de: '2026-11-10', a: '2026-11-24' }, enPourcent: { gain: 0.4, fourchette: [-0.2, 1], quoi: 'de perte log en moins' }, seuil: { variantes: 2 } }
  });
  assert.deepEqual(Object.keys(jugee), ['lancement', 'matchs', 'gain', 'variantes', 'verdict']);
  assert.deepEqual(jugee.lancement, { texte: '09/11/2026 · version score-marche-v1', manque: false });
  assert.deepEqual(jugee.matchs, { texte: `1${NNBSP}240 matchs, du 10/11 au 24/11 (jugé le 25/11/2026)`, manque: false });
  assert.deepEqual(jugee.gain, { valeur: '+0,4 %', reste: `[${MOINS}0,2 ; +1,0] de perte log en moins`, texte: `+0,4 % [${MOINS}0,2 ; +1,0] de perte log en moins`, manque: false });
  assert.deepEqual(jugee.variantes, { texte: '3 (2 au dernier jugement)', manque: false });
  assert.deepEqual(jugee.verdict, { pastille: P.VERDICTS['pas-prouve'], raison: 'La fourchette contient zéro.' });
  const lancee = P.lignesPreuve({ aJuger: true, registre: 'enregistre', lancement: { version: 'v1', le: '2026-11-09' }, variantes: 0, jugement: null });
  assert.deepEqual(
    [lancee.lancement.texte, lancee.matchs, lancee.gain, lancee.variantes, lancee.verdict.pastille.texte],
    ['09/11/2026 · version v1', { texte: 'pas encore jugée', manque: true }, { texte: 'pas encore jugée', manque: true }, { texte: 'aucune déclarée', manque: true }, 'pas encore jugée']
  );
  const pasLancee = P.lignesPreuve({ aJuger: true, registre: 'absent', lancement: null, variantes: 2, jugement: null });
  assert.deepEqual(pasLancee.lancement, { texte: 'pas encore lancée : les matchs d’avant ne comptent pas', manque: true });
  assert.equal(pasLancee.variantes.texte, '2');
  const sansGain = P.lignesPreuve({ registre: 'enregistre', lancement: null, variantes: 1, jugement: { verdict: 'pas-assez-de-matchs', raison: '87 matchs jugés, 200 nécessaires.', n: { matchs: 87 }, enPourcent: { gain: null, fourchette: null, quoi: 'x' } } });
  assert.deepEqual(sansGain.gain, { texte: 'pas de gain calculé : pas assez de matchs', manque: true });
  const illisible = P.lignesPreuve({ aJuger: true, registre: 'illisible', lancement: null, variantes: null, jugement: null });
  for (const cle of ['lancement', 'matchs', 'gain', 'variantes']) assert.deepEqual(illisible[cle], { texte: 'registre de la mesure illisible pour l’instant', manque: true }, cle);
  assert.equal(illisible.verdict.pastille.texte, 'registre illisible');
});

test('guide de lecture : les trois phrases de l’étape 16, simples et figées', () => {
  const g = G.GUIDE_DE_LECTURE;
  assert.deepEqual(
    ['preuve-apres-lancement', 'fourchette-du-hasard', 'variantes-essayees'].map((t) => g[t]?.titre),
    ['Preuve après lancement', 'Gain et fourchette', 'Variantes essayées']
  );
  assert.equal(g['preuve-apres-lancement'].phrase, "Une amélioration ne compte que sur les matchs joués après sa mise en service : ceux d'avant ont servi à la construire, ils ne prouvent rien. On compare l'ancienne et la nouvelle version sur les mêmes matchs.");
  assert.equal(g['fourchette-du-hasard'].phrase, "On rejoue le calcul mille fois en tirant les matchs au sort, pour voir ce que le hasard seul pourrait donner : la fourchette est l'écart qu'il explique. Si elle ne contient pas zéro, le gain dépasse le hasard ; sinon il n'est pas prouvé.");
  assert.equal(g['variantes-essayees'].phrase, "Plus on a essayé de réglages avant d'en garder un, plus il est facile de tomber sur un bon score par chance. Le juge élargit la fourchette d'autant : il faut plus de matchs pour prouver.");
  // Les mots de la statistique restent dans le code : jamais à l'écran.
  for (const t of ['preuve-apres-lancement', 'fourchette-du-hasard', 'variantes-essayees']) assert.doesNotMatch(g[t].phrase, /bootstrap|p-value|Bonferroni|intervalle de confiance/i, t);
  assert.ok(Object.isFrozen(g['variantes-essayees']));
});

// ------------------------------------------------------------- 14. le rendu

fs.mkdirSync(RACINE_ESSAIS, { recursive: true });
const DOSSIER = fs.mkdtempSync(path.join(RACINE_ESSAIS, 'cm-preuve-ecran-'));
const LANCEE_LE = Date.parse('2026-11-09T07:52:10Z');
const MAINTENANT = Date.parse('2026-12-01T10:00:00Z');
const NOTES = { source: 'absent', fichier: 'C:\\essai\\roadmap.json', probleme: null, majLe: null, etapes: {} };
const declaration = (etape, version, quoi, variantes) => ({ etape, version, quoi, le: null, variantes: variantes.map((id) => ({ id, quoi: '' })), vues: [] });
/** Un jugement fabriqué, à la forme de jugerEtape. */
const jugement = (verdict, gain, fourchette, raison, extra = {}) => ({
  le: '2026-11-25T02:10:00.000Z',
  quoi: '1N2, perte log',
  mesure: 'perte-log',
  principal: true,
  verdict,
  raison,
  n: { lignes: 1240, blocs: 1240, matchs: 1240 },
  fenetre: { de: '2026-11-10', a: '2026-11-24' },
  enPourcent: { gain, fourchette, quoi: 'de perte log en moins' },
  seuil: { variantes: 3 },
  ...extra
});

/** L'état de la page avec un registre temporaire rempli par les fonctions du registre (fait une fois). */
let etatFait = null;
const etatAvecRegistre = () => (etatFait ??= construireEtat());
function construireEtat() {
  const fichier = path.join(DOSSIER, 'registre-mesure.json');
  const lancements = [
    declaration('26', 'boucle-v1', 'Boucle de correction', ['boucle-v1']),
    declaration('27', 'score-marche-v1', 'Modèle de score ancré sur le marché', ['score-marche-v1', 'score-marche-v0']),
    declaration('28', 'simulation-v1', 'Simulation complète', ['simulation-v1']),
    declaration('29', 'force-v1', 'Indice de force des équipes', ['force-v1']),
    declaration('32', 'contexte-v1', 'Contexte du match', ['contexte-v1']),
    declaration('33', 'cartons-v1', 'Cartons et corners', ['cartons-v1'])
  ];
  const options = { fichier, lancements };
  enregistrerLancements({ ...options, maintenant: LANCEE_LE });
  declarerVariante('27', { id: 'candidat-b', quoi: 'poids du marché 0,7' }, options);
  enregistrerJugement('26', jugement('moins-bon', -1.2, [-2.1, -0.3], 'La nouvelle version fait moins bien, au-delà du hasard : la fourchette est entièrement au-dessous de zéro (1 240 matchs, 1 variante essayée).'), options);
  enregistrerJugement('27', jugement('pas-prouve', 0.4, [-0.2, 1.0], 'La fourchette contient zéro : l’écart peut venir du hasard (1 240 matchs, 3 variantes essayées).'), options);
  enregistrerJugement('28', jugement('retenu', 0.8, [0.3, 1.3], 'L’amélioration dépasse ce que le hasard explique : la fourchette est entièrement au-dessus de zéro (1 240 matchs, 1 variante essayée).'), options);
  enregistrerJugement('32', jugement('pas-assez-de-matchs', null, null, '87 matchs jugés, 200 nécessaires.', { n: { lignes: 87, blocs: 87, matchs: 87 }, fenetre: { de: '2026-11-10', a: '2026-11-12' } }), options);
  // Ce que rend le vrai juge à 87 matchs : « pas assez de matchs », mais le gain et sa fourchette (large) sont calculés et montrés.
  enregistrerJugement(
    '33',
    jugement('pas-assez-de-matchs', 0.9, [-2.8, 4.6], '87 matchs jugés, 200 nécessaires. Écartées : 312 lignes d’avant le lancement du 09/11/2026, 0 ligne déjà vue (elles ont servi à construire ou à régler).', {
      n: { lignes: 87, blocs: 87, matchs: 87 },
      fenetre: { de: '2026-11-10', a: '2026-11-12' },
      seuil: { variantes: 1 }
    }),
    options
  );
  // 29 : lancée, pas encore jugée ; 30 : à juger, pas encore lancée.
  return etatFeuilleDeRoute({ maintenant: MAINTENANT, pierre: NOTES, mesure: etatPourFeuilleDeRoute(options) });
}

let contexte;
const avertissements = [];
const refuses = [];

before(async () => {
  if (!pret) return;
  const imp = (chemin) => import(pathToFileURL(chemin).href);
  const { createServer } = await imp(path.join(UI, 'node_modules', 'vite', 'dist', 'node', 'index.js'));
  const vuePlugin = (await imp(path.join(UI, 'node_modules', '@vitejs', 'plugin-vue', 'dist', 'index.mjs'))).default;
  const { renderToString } = await imp(path.join(UI, 'node_modules', 'vue', 'server-renderer', 'index.mjs'));
  const { createSSRApp, h } = await imp(path.join(UI, 'node_modules', 'vue', 'index.mjs'));
  // Le bloc ne charge rien : tout appel est refusé et compté.
  globalThis.fetch = async (url) => {
    refuses.push(String(url));
    throw new Error(`fetch interdit dans ce rendu : ${url}`);
  };
  console.warn = (...a) => avertissements.push(a.map(String).join(' ').slice(0, 300));
  const cache = fs.mkdtempSync(path.join(RACINE_ESSAIS, 'cm-rendu-preuve-'));
  const vite = await createServer({
    configFile: false,
    root: UI,
    logLevel: 'error',
    appType: 'custom',
    cacheDir: cache,
    server: { middlewareMode: true, watch: null, hmr: false },
    plugins: [vuePlugin()],
    resolve: { alias: { '@': path.join(UI, 'src') } }
  });
  const Lot = (await vite.ssrLoadModule('/src/components/roadmap/RoadmapLot.vue')).default;
  contexte = {
    vite,
    cache,
    async lot(etat, numero) {
      const avant = avertissements.length;
      const app = createSSRApp(Lot, { lot: etat.lots[numero - 1], reglages: etat.reglages, longueurMax: 4000, notesEcrivables: true, semaineCourante: 9, ouvert: true });
      app.component('RouterLink', { props: ['to'], setup: (p, { slots }) => () => h('a', { href: p.to }, slots.default?.()) });
      const html = await renderToString(app);
      return { html, texte: texteDe(html), avertissements: avertissements.slice(avant), etapes: parEtape(html) };
    }
  };
});

after(async () => {
  if (contexte) {
    await contexte.vite.close();
    // Le dossier de cache ne contient aucun lien : suppression sans danger.
    fs.rmSync(contexte.cache, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
  fs.rmSync(DOSSIER, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

/** Le texte visible d'un rendu : balises retirées, entités décodées, espaces unifiés. */
const texteDe = (html) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ');
/** Le HTML de chaque étape rendue, par son numéro. */
const parEtape = (html) => Object.fromEntries(html.split(/(?=<article[^>]*data-etape=")/).slice(1).map((morceau) => [/data-etape="([^"]+)"/.exec(morceau)[1], morceau]));
const compter = (texte, motif) => (texte.match(motif) ?? []).length;
/** Les pastilles (`cm-chip`) d'un morceau de HTML qui portent la classe `ton` — quel que soit l'ordre des classes. */
const pastilles = (html, ton) => [...html.matchAll(/<span class="([^"]*)"/g)].map((m) => m[1].split(' ')).filter((c) => c.includes('cm-chip') && c.includes(ton)).length;
const bloc = (htmlEtape) => {
  const debut = htmlEtape.indexOf('rstep__preuve"');
  return debut < 0 ? null : texteDe(htmlEtape.slice(debut, htmlEtape.indexOf('</section>', debut)));
};

test('écran : chaque verdict dans son bloc — lancement, matchs jugés, gain et fourchette, variantes, pastille et raison ; seulement aux étapes qui touchent aux chiffres ; sans avertissement ni appel', rendu, async () => {
  const etat = etatAvecRegistre();
  const lot5 = await contexte.lot(etat, 5);
  assert.deepEqual(lot5.avertissements, []);
  assert.deepEqual(Object.keys(lot5.etapes), ['25', '26', '27', '28', '29', '30', '31']);
  // Le bloc aux étapes à juger (26 à 30), jamais à la 25 (la porte des versions) ni à la 31 (l'écran).
  assert.deepEqual(Object.entries(lot5.etapes).filter(([, h]) => bloc(h)).map(([id]) => id), ['26', '27', '28', '29', '30']);
  assert.equal(compter(lot5.texte, /Preuve après lancement/g), 5 * 2, 'le titre et la bulle d’aide de chaque bloc');
  // 27 : pas prouvé, la fourchette contient zéro.
  const b27 = bloc(lot5.etapes['27']);
  assert.ok(b27.includes('Lancement 09/11/2026 · version score-marche-v1'), b27);
  // (Le texte rendu unifie les espaces : l'espace fine des milliers y devient une espace simple.)
  assert.ok(b27.includes('Matchs jugés 1 240 matchs, du 10/11 au 24/11 (jugé le 25/11/2026)'), b27);
  assert.ok(lot5.etapes['27'].includes(`1${NNBSP}240 matchs, du 10/11`), 'l’espace fine insécable dans le HTML');
  assert.ok(b27.includes(`+0,4 % [${MOINS}0,2 ; +1,0] de perte log en moins`), b27);
  assert.match(b27, /Variantes essayées .*? 3 Verdict pas prouvé La fourchette contient zéro : l’écart peut venir du hasard \(1 240 matchs, 3 variantes essayées\)\./);
  assert.match(lot5.etapes['27'], /<strong class="cm-numeric"[^>]*>\+0,4 %<\/strong>/, 'le gain en gras');
  // 28 : retenu, en vert (le vert « validé » de la page) — une seule pastille verte dans le bloc.
  const b28 = bloc(lot5.etapes['28']);
  assert.ok(b28.includes('+0,8 % [+0,3 ; +1,3] de perte log en moins'), b28);
  assert.match(b28, /Verdict retenu L’amélioration dépasse ce que le hasard explique/);
  const html28 = lot5.etapes['28'].slice(lot5.etapes['28'].indexOf('rstep__preuve"'));
  assert.equal(pastilles(html28, 'is-accent'), 1);
  // 26 : moins bon, en rouge.
  assert.match(bloc(lot5.etapes['26']), /Verdict moins bon La nouvelle version fait moins bien/);
  assert.equal(pastilles(lot5.etapes['26'], 'is-danger'), 1);
  // 29 : lancée, pas encore jugée.
  const b29 = bloc(lot5.etapes['29']);
  assert.ok(b29.includes('Lancement 09/11/2026 · version force-v1'), b29);
  assert.equal(compter(b29, /pas encore jugée/g), 3, 'matchs, gain et verdict');
  assert.match(b29, /Variantes essayées .*? 1 Verdict/);
  // 30 : à juger, pas encore lancée.
  const b30 = bloc(lot5.etapes['30']);
  assert.ok(b30.includes('Lancement pas encore lancée : les matchs d’avant ne comptent pas'), b30);
  assert.match(b30, /aucune déclarée/);
  assert.equal(compter(b30, /pas encore jugée/g), 3);
  // Lot 6 : la 32, pas assez de matchs (ambre), sans gain calculé.
  const lot6 = await contexte.lot(etat, 6);
  assert.deepEqual(lot6.avertissements, []);
  const b32 = bloc(lot6.etapes['32']);
  assert.match(b32, /Matchs jugés 87 matchs, du 10\/11 au 12\/11 \(jugé le 25\/11\/2026\)/);
  assert.match(b32, /pas de gain calculé : pas assez de matchs/);
  assert.match(b32, /Verdict pas assez de matchs 87 matchs jugés, 200 nécessaires\./);
  assert.equal(pastilles(lot6.etapes['32'], 'is-warning'), 1);
  // La 33, comme le vrai juge à 87 matchs : le gain et sa fourchette (large) sont montrés, avec la pastille « pas assez de matchs ».
  const b33 = bloc(lot6.etapes['33']);
  assert.ok(b33.includes(`+0,9 % [${MOINS}2,8 ; +4,6] de perte log en moins`), b33);
  assert.match(lot6.etapes['33'], /<strong class="cm-numeric"[^>]*>\+0,9 %<\/strong>/, 'le gain en gras');
  assert.match(b33, /Verdict pas assez de matchs 87 matchs jugés, 200 nécessaires\. Écartées : 312 lignes d’avant le lancement du 09\/11\/2026, 0 ligne déjà vue/);
  assert.doesNotMatch(b33, /pas de gain calculé/);
  assert.equal(pastilles(lot6.etapes['33'], 'is-warning'), 1);
  assert.equal(pastilles(lot6.etapes['33'], 'is-accent'), 0, 'jamais en vert');
  // La 40 (l'écran, hors liste) n'a pas de bloc.
  assert.equal(bloc(lot6.etapes['40']), null);
  assert.deepEqual(refuses, [], 'aucun appel réseau');
});

test('écran : les bulles d’aide du bloc désignent les trois phrases du guide ; les textes que comptent les tests d’avant ne sont pas repris ; un registre illisible le dit à chaque ligne', rendu, async () => {
  const etat = etatAvecRegistre();
  const lot5 = await contexte.lot(etat, 5);
  for (const titre of ['Preuve après lancement', 'Gain et fourchette', 'Variantes essayées']) {
    assert.equal(compter(lot5.html, new RegExp(`aria-label="Qu&#39;est-ce que « ${titre} » \\?"`, 'g')), 5, titre);
  }
  // « Gain mesuré », « Note de Pierre », « Semaine prévue », « Date de fin » : une fois par étape, comme avant.
  for (const motif of [/Gain mesuré/g, /Note de Pierre/g, /Semaine prévue/g, /Date de fin/g]) assert.equal(compter(lot5.texte, motif), 7, String(motif));
  // Une fois par étape du lot 5 pas encore terminée — compté depuis l'historique du code (depuis le 07/10/2026, la 25, son socle, y a sa ligne).
  const termineesDuLot5 = new Set(HISTORIQUE.map((h) => h.etape).filter((id) => ETAPES.find((e) => e.id === id)?.lot === 5)).size;
  assert.equal(compter(lot5.texte, /pas encore mesuré/g), 7 - termineesDuLot5, 'chaque étape du lot 5 pas encore terminée');
  for (const b of Object.values(lot5.etapes).map(bloc).filter(Boolean)) {
    assert.doesNotMatch(b, /Gain mesuré|pas encore mesuré|Note de Pierre|bootstrap|p-value|Bonferroni|intervalle de confiance/);
  }
  // Registre illisible : la page reste, chaque étape à juger le dit, ligne par ligne.
  const fichier = path.join(DOSSIER, 'illisible.json');
  fs.writeFileSync(fichier, '[]');
  const illisible = etatFeuilleDeRoute({ maintenant: MAINTENANT, pierre: NOTES, mesure: etatPourFeuilleDeRoute({ fichier }) });
  const rendu5 = await contexte.lot(illisible, 5);
  assert.deepEqual(rendu5.avertissements, []);
  const b27 = bloc(rendu5.etapes['27']);
  assert.equal(compter(b27, /registre de la mesure illisible pour l’instant/g), 4, b27);
  assert.match(b27, /Verdict registre illisible Le registre de la mesure ne se lit pas/);
  assert.doesNotMatch(b27, /pas encore lancée/, 'jamais « pas encore lancée » quand on ne peut pas le savoir');
  assert.equal(pastilles(rendu5.etapes['27'], 'is-warning'), 1);
  // Les étapes de la liste à juger qui ont un bloc, telles que le plan les numérote.
  assert.ok(ETAPES.some((e) => e.id === '27'));
});
