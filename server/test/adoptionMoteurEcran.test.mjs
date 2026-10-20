/**
 * Étape 25 du plan, SECONDE MOITIÉ (14/10/2026) : l'écran — la carte « Versions du moteur » avec l'essai de la
 * candidate, ses deux verdicts, le bouton « Adopter » et l'alerte de dérive ; la feuille de route.
 *   node --test test/adoptionMoteurEcran.test.mjs        (depuis server/)
 *
 * Les réponses de GET /api/config/versions sont celles du VRAI serveur : le parcours de
 * test/aides/script-adoption-moteur.mjs (une copie isolée, trois candidates fabriquées, un mois figé fabriqué) les
 * rend à chaque moment (au départ, essai en cours, moins bonne, pas prouvée, meilleure, pendant une passe, après
 * l'adoption, avec la dérive). Le rendu est fait côté serveur, sans navigateur ni serveur de développement : `fetch`
 * remplacé (seule la route des versions répond), un Vite « middleware » n'écoute sur aucun port, son cache va dans
 * le dossier d'essais, rien n'est écrit dans ui/. `onMounted` devient `onServerPrefetch` dans le rendu.
 *
 *  1. Les règles de l'écran (ui/src/utils/versionsMoteur.js) sur les vraies réponses.
 *  2. La carte dans chacun de ses états : le bouton « Adopter » actif SEULEMENT sur « retenu », la raison sinon ;
 *     les deux verdicts côte à côte, jamais confondus ; l'alerte de dérive ; un serveur pas encore relancé.
 *  3. L'hygiène du composant et le câblage (confirmation, une seule écriture, le formulaire, la feuille de route).
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
const R = await imp(path.join(UI, 'src', 'utils', 'versionsMoteur.js'));
const MOINS = '−';

/** Les réponses du vrai serveur à chaque moment du parcours, produites une fois dans une copie isolée. */
function leParcours() {
  const copie = preparerCopie({});
  try {
    const r = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-adoption-moteur.mjs'), {
      args: ['parcours'],
      maintenant: '2026-11-20T12:00:00.000Z',
      timeout: 300_000,
      env: { CLAUDE_CODE_BIN: path.join(copie.dossier, 'pas-de-claude-ici.exe'), MATCH_STATS_AUTO_REFRESH: 'false' }
    });
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
    .replace(/[  ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

let parcours;
let etats;
let contexte;
let scenario = { reponse: null, statut: 200 };
const appels = [];
const interdits = [];
const avertissements = [];
let originaux = {};

before(async () => {
  parcours = leParcours();
  etats = parcours.routes;
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
    if (!/\/api\/config\/versions$/.test(u)) {
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
  const prefetch = {
    name: 'ssr-prefetch',
    enforce: 'pre',
    transform(code, id) {
      if (!/EngineVersionsPanel\.vue$/.test(id) || id.includes('?')) return null;
      return code.replace(/import \{ ([^}]*)\bonMounted\b([^}]*)\} from 'vue';/, (m, a, b) => `import { ${a}onMounted, onServerPrefetch${b}} from 'vue';`).replace(/onMounted\(/g, 'onServerPrefetch(');
    }
  };
  fs.mkdirSync(RACINE_ESSAIS, { recursive: true });
  const cache = fs.mkdtempSync(path.join(RACINE_ESSAIS, 'cm-rendu-adoption-'));
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
  const Carte = (await vite.ssrLoadModule('/src/components/settings/EngineVersionsPanel.vue')).default;
  contexte = {
    vite,
    cache,
    async carte({ reponse, statut = 200 }) {
      scenario = { reponse, statut };
      const avant = avertissements.length;
      const avantAppels = appels.length;
      const app = createSSRApp({ render: () => h(Carte, { changementLe: null, passeTermineeLe: null }) });
      const html = await renderToString(app);
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

/** Les boutons rendus : leur texte et s'ils sont désactivés. */
const boutons = (html) => [...html.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)].map((m) => ({ texte: texteDe(m[2]), desactive: /\sdisabled(=|\s|$)/.test(m[1]) }));
const bouton = (html, texte) => boutons(html).find((b) => b.texte === texte) ?? null;
/** Un élément qui porte toutes ces classes, dans n’importe quel ordre (le rendu met les classes liées en premier). */
const avecLesClasses = (html, ...classes) => new RegExp(`class="${classes.map((c) => `(?=[^"]*\\b${c}\\b)`).join('')}[^"]*"`).test(html);

// ============================================== 1. les règles de l'écran

test('versionsMoteur.js (seconde moitié) : pourcentages et points à la française (vrai signe moins), jour et mois de Paris, verdicts en mots et en tons — jamais le vert', () => {
  assert.equal(R.pourcentSigne(17.757), '+17,8 %');
  assert.equal(R.pourcentSigne(-2.1), `${MOINS}2,1 %`);
  assert.equal(R.pourcentSigne(0), '0 %');
  assert.equal(R.pourcentSigne(null), 'non calculé');
  assert.equal(R.points(-0.14), `${MOINS}14 points`);
  assert.equal(R.points(-0.0671), `${MOINS}6,7 points`);
  assert.equal(R.points(0.013), '+1,3 point');
  assert.equal(R.jourParis('2026-10-31T23:30:00.000Z'), '01/11/2026', 'le jour de Paris');
  assert.equal(R.moisDit('2026-10'), 'octobre 2026');
  assert.equal(R.moisDit('n’importe'), 'mois inconnu');
  assert.deepEqual(Object.fromEntries(Object.entries(R.VERDICTS).map(([k, v]) => [k, v.ton])), { retenu: 'is-info', 'pas-prouve': 'is-warning', 'moins-bon': 'is-danger', 'pas-assez-de-matchs': '' });
  assert.equal(R.verdictDit('inconnu').court, 'inconnu');
  assert.equal(R.perteLogDite(0.69314718), '0,6931');
});

test('versionsMoteur.js sur les réponses du VRAI serveur : l’essai (premiers chiffres, puis le chiffre du jugement), les deux verdicts (l’essai décide, le banc indique — « pour mémoire » une fois l’essai jugé), le chiffre clé de l’adoption', () => {
  const enCours = etats.essaiEnCours;
  assert.deepEqual(R.etatDeLEssai(enCours.candidate), {
    progression: '66 matchs joués comparés sur 250, 11 jours sur 14 — le juge se prononce une seule fois, quand les deux sont atteints (au plus tôt le 15/10/2026).',
    horizon: '250 matchs et 14 jours',
    lignes: [
      { nom: 'Version en service (n° 1)', valeur: '0,6931' },
      { nom: 'Candidate « essai-retenu »', valeur: '0,5749' }
    ],
    ecart: 'la candidate devant de 17,1 % (premiers chiffres : pas de verdict avant l’horizon)',
    aVenir: '204 matchs à venir déjà calculés à blanc.',
    ecartees: null
  });
  assert.deepEqual(R.verdictDeLEssai(enCours.candidate).pastille, { texte: 'pas encore', ton: '' });
  const banc = R.verdictDuBanc(enCours.candidate, enCours.banc);
  assert.deepEqual([banc.indicatif, banc.pastille.texte, banc.etiquette], [true, 'retenu', 'indicatif : l’essai à blanc n’a pas encore assez de matchs']);
  assert.equal(banc.details, 'Erreur de prévision +3,6 % en sa faveur (fourchette +2,1 % à +5,2 %) sur 30 158 matchs de P2, rejoués le 12/10/2026.');
  const retenu = etats.retenu;
  assert.equal(R.etatDeLEssai(retenu.candidate).progression, 'Jugée le 20/11/2026 sur 270 matchs joués depuis sa mise à blanc.');
  assert.deepEqual(R.verdictDeLEssai(retenu.candidate), {
    decide: true,
    juge: true,
    pastille: { texte: 'retenu', ton: 'is-info' },
    phrase: 'La candidate est meilleure que la version en service, au-delà du hasard.',
    details: 'Erreur de prévision +17,8 % en sa faveur (fourchette du hasard +9,9 % à +25,7 %) sur 270 matchs joués, 3 variantes essayées ; jugée le 20/11/2026.'
  });
  assert.equal(R.verdictDuBanc(retenu.candidate, retenu.banc).etiquette, 'pour mémoire : l’essai à blanc a décidé');
  assert.equal(R.verdictDuBanc({ id: 'x' }, { enCours: { rejeu: 'candidate' } }).pastille.texte, 'en cours');
  assert.match(R.verdictDuBanc({ id: 'x' }, { dernierRefus: { le: '2026-11-20T12:00:00.000Z', raison: 'Aucun jour à rejouer' } }).details, /Dernier essai du banc pas abouti le 20\/11\/2026 à 13:00 : Aucun jour à rejouer/);
  assert.deepEqual(
    ['depart', 'essaiEnCours', 'retenu', 'moinsBon', 'pasProuve', 'passeEnCours', 'apresAdoption'].map((k) => [k, R.kpiAdoption(etats[k]).valeur]),
    [['depart', 'rien à adopter'], ['essaiEnCours', 'pas maintenant'], ['retenu', 'possible'], ['moinsBon', 'refusée'], ['pasProuve', 'pas prouvé'], ['passeEnCours', 'pas maintenant'], ['apresAdoption', 'rien à adopter']]
  );
});

test('versionsMoteur.js : la confirmation de l’adoption dit exactement ce qui change et comment revenir ; aucune confirmation quand l’adoption n’est pas possible ; le message après l’adoption', () => {
  assert.equal(
    R.texteDeConfirmationAdoption(etats.retenu),
    'Adopter la candidate « essai-retenu » ?\n\n' +
      "Le juge de l'étape 16 la dit meilleure que la version en service : erreur de prévision +17,8 % en sa faveur sur 270 matchs joués depuis sa mise à blanc (au-delà du hasard).\n\n" +
      `Les réglages du moteur deviennent :\n• Corrélation Dixon-Coles (rho) : ${MOINS}0,075 → ${MOINS}0,13\n\n` +
      "Elle devient une nouvelle version du moteur ; les pronostics calculés ensuite la porteront. Vous pourrez revenir à la version 1 en un clic. Rien d'autre ne change : vos paris, les pronostics déjà enregistrés et les données restent tels quels."
  );
  for (const cle of ['depart', 'essaiEnCours', 'moinsBon', 'pasProuve', 'passeEnCours', 'apresAdoption']) assert.equal(R.texteDeConfirmationAdoption(etats[cle]), null, `${cle} : pas de confirmation, le bouton est désactivé`);
  assert.equal(R.messageApresAdoption(parcours.adoption.reponse.corps), "Candidate « essai-retenu » adoptée : c'est maintenant la version 2 du moteur (la version 1 reste dans la liste, un clic pour y revenir). Son lancement est noté au registre de la mesure.");
  assert.match(R.messageApresAdoption({ vers: 3, de: 2, candidate: 'c', lancementADeclarer: { etape: '27' } }), /sera noté au registre de la mesure au prochain démarrage du serveur\.$/);
  assert.equal(R.messageApresAdoption(null), null);
});

test('versionsMoteur.js : la dérive en mots simples — l’alerte et ses signaux (calibration, valeur de clôture), le dernier mois jugé, la règle ; « pas encore jugée » sans mois figé', () => {
  const d = R.etatDeLaDerive(etats.derive);
  assert.equal(d.ton, 'is-danger');
  assert.equal(d.phrase, 'Dérive du moteur en octobre 2026 : l’écart entre ce qu’il annonce et ce qui arrive a grandi au-delà du hasard (Total buts, la valeur de clôture des pronostics).');
  assert.deepEqual(d.signaux, [
    `Total buts : annoncé 62,0 %, arrivé 48,0 % sur 480 matchs (écart ${MOINS}14 points, fourchette du hasard ${MOINS}20 points à ${MOINS}8 points ; au départ ${MOINS}6,7 points) — le moteur promet trop.`,
    `Valeur de clôture des pronostics ${MOINS}2,1 % (fourchette du hasard ${MOINS}3,4 % à ${MOINS}0,8 %) sur 260 matchs : après le gel, le marché va contre le moteur.`
  ]);
  assert.equal(d.dernierMois, 'Dernier mois figé jugé : octobre 2026 — dérive ; 1 marché trop maigre pour juger (moins de 200 matchs).');
  assert.equal(d.regle.length, 3);
  assert.deepEqual(R.kpiDerive(etats.derive).valeur, 'alerte');
  const sans = R.etatDeLaDerive(etats.depart);
  assert.deepEqual([sans.ton, sans.titre, sans.signaux], ['', 'pas encore jugée', []]);
  assert.match(sans.dernierMois, /^Aucun mois figé encore/);
  assert.equal(R.etatDeLaDerive({}).titre, 'non lu', 'un serveur pas encore relancé');
  assert.equal(R.phraseDeLAlerteDerive(null), null);
  assert.equal(R.phraseDeLAlerteDerive(etats.derive.derive.alerte), d.phrase);
});

// ============================================================ 2. la carte

test('la carte, essai en cours : la candidate et son essai (premiers chiffres, tableau des deux versions), les DEUX verdicts côte à côte (l’essai « décide » : pas encore ; le banc « indicatif » : retenu) — le bouton « Adopter » DÉSACTIVÉ, la raison écrite', options, async () => {
  const r = await contexte.carte({ reponse: etats.essaiEnCours });
  assert.deepEqual(r.avertissements, []);
  assert.deepEqual(r.appels.map((u) => u.replace(/^.*\/api/, '/api')), ['/api/config/versions']);
  assert.match(r.texte, /Candidate en essai essai-retenu étape 27/);
  assert.match(r.texte, /Adoption pas maintenant Pas encore de verdict/);
  assert.match(r.texte, /D’où elle vient essai Horizon du verdict 250 matchs joués et 14 jours/);
  assert.match(r.texte, /Essai à blanc de la candidate essai n° 1 depuis le 01\/10\/2026/);
  assert.match(r.texte, /66 matchs joués comparés sur 250, 11 jours sur 14 — le juge se prononce une seule fois/);
  assert.match(r.texte, /Version Erreur de prévision Version en service \(n° 1\) 0,6931 Candidate « essai-retenu » 0,5749 Écart la candidate devant de 17,1 % \(premiers chiffres : pas de verdict avant l’horizon\)/);
  assert.match(r.texte, /Verdict de l’essai à blanc décide pas encore/);
  assert.match(r.texte, /Verdict du banc d’essai indicatif : l’essai à blanc n’a pas encore assez de matchs retenu/);
  const adopter = bouton(r.html, 'Adopter la candidate');
  assert.equal(adopter?.desactive, true, 'désactivé : pas encore de verdict de l’essai, même avec un banc « retenu »');
  assert.match(r.texte, /Adopter la candidate .*Pas encore de verdict : le juge se prononce une seule fois, quand l’essai à blanc a 250 matchs joués et au moins 14 jours \(aujourd’hui : 66 matchs, 11 jours\)\./);
  assert.equal(bouton(r.html, 'Passer au banc d’essai (matchs passés)')?.desactive, false);
  assert.doesNotMatch(r.html, /is-accent|cm-positive|btn--section/, 'aucun vert : rien ici n’est une value');
  assert.deepEqual(interdits, []);
});

test('la carte, « retenu » : le bouton « Adopter la candidate » ACTIF et ce qu’il changerait ; le verdict de l’essai « retenu », celui du banc « pour mémoire »', options, async () => {
  const r = await contexte.carte({ reponse: etats.retenu });
  assert.deepEqual(r.avertissements, []);
  assert.equal(bouton(r.html, 'Adopter la candidate')?.desactive, false, 'actif');
  assert.match(r.texte, /Le juge la dit meilleure que la version en service : l’adopter met ses réglages en service, en une fois : Corrélation Dixon-Coles \(rho\) −0,075 → −0,13/);
  assert.match(r.texte, /Verdict de l’essai à blanc décide retenu/);
  assert.match(r.texte, /Erreur de prévision \+17,8 % en sa faveur \(fourchette du hasard \+9,9 % à \+25,7 %\) sur 270 matchs joués, 3 variantes essayées ; jugée le 20\/11\/2026\./);
  assert.match(r.texte, /Verdict du banc d’essai pour mémoire : l’essai à blanc a décidé retenu/);
  assert.match(r.texte, /Adoption possible le juge la dit meilleure/);
  assert.match(r.html, /class="[^"]*\bis-info\b[^"]*"[^>]*>retenu</, 'le ton de « retenu » : l’information, pas le vert');
  assert.doesNotMatch(r.html, /is-accent|cm-positive|btn--section/);
});

test('la carte, refus : « moins bon » (refusée, en rouge), « pas prouvé » (la raison et comment réessayer), une passe en cours — le bouton « Adopter » toujours DÉSACTIVÉ', options, async () => {
  const cas = [
    ['moinsBon', /Refusée : la candidate fait moins bien que la version en service, au-delà du hasard \(270 matchs joués, 1 variante essayée\)\. Elle ne peut pas être adoptée\./, /Verdict de l’essai à blanc décide moins bon/],
    ['pasProuve', /Pas prouvé : l’écart avec la version en service peut venir du hasard \(270 matchs joués, 2 variantes essayées\)\. Pour réessayer, il faut une nouvelle candidate/, /Verdict de l’essai à blanc décide pas prouvé/],
    ['passeEnCours', /Une passe d’actualisation \(ou un import, ou un banc\) est en cours : l’adoption attend qu’elle soit finie\./, /Verdict de l’essai à blanc décide retenu/]
  ];
  for (const [cle, raison, verdict] of cas) {
    const r = await contexte.carte({ reponse: etats[cle] });
    assert.deepEqual(r.avertissements, [], cle);
    assert.equal(bouton(r.html, 'Adopter la candidate')?.desactive, true, `${cle} : désactivé`);
    assert.match(r.texte, raison, cle);
    assert.match(r.texte, verdict, cle);
  }
  const moins = await contexte.carte({ reponse: etats.moinsBon });
  assert.match(moins.html, /class="[^"]*\bect__danger\b[^"]*"[^>]*>Refusée/, 'la raison d’un refus en rouge');
  assert.match(moins.texte, /Adoption refusée moins bonne que la version en service/);
});

test('la carte, après l’adoption : plus de candidate ni de bouton « Adopter », la version 2 en service « candidate adoptée », la dernière candidate adoptée dite ; le retour arrière vers la 1 possible', options, async () => {
  const r = await contexte.carte({ reponse: etats.apresAdoption });
  assert.deepEqual(r.avertissements, []);
  assert.equal(bouton(r.html, 'Adopter la candidate'), null);
  assert.match(r.texte, /Version en service n° 2 depuis le 20\/11\/2026 à 13:00 — candidate adoptée dans Réglages : le juge de l’étape 16 l’a dite meilleure/);
  assert.match(r.texte, /Dernière candidate adoptée : « essai-retenu » \(étape 27\), devenue la version n° 2 le 20\/11\/2026 à 13:00\./);
  assert.match(r.texte, /Corrélation Dixon-Coles \(rho\) −0,075 → −0,13/);
  assert.equal(bouton(r.html, 'Revenir à la version précédente')?.desactive, false);
});

test('la carte, l’alerte de dérive : la note en rouge, ses signaux, le dernier mois jugé et la règle ; sans mois figé, « pas encore jugée » ; la place de l’étape 26', options, async () => {
  const r = await contexte.carte({ reponse: etats.derive });
  assert.deepEqual(r.avertissements, []);
  assert.ok(avecLesClasses(r.html, 'cm-note', 'is-danger'), 'la note en rouge');
  assert.match(r.texte, /Dérive alerte Dérive du moteur en octobre 2026/);
  assert.match(r.texte, /Alerte de dérive : alerte .*Dérive du moteur en octobre 2026 : l’écart entre ce qu’il annonce et ce qui arrive a grandi au-delà du hasard \(Total buts, la valeur de clôture des pronostics\)\. Total buts : annoncé 62,0 %, arrivé 48,0 % sur 480 matchs/);
  assert.match(r.texte, /Dernier mois figé jugé : octobre 2026 — dérive ; 1 marché trop maigre pour juger \(moins de 200 matchs\)\./);
  assert.match(r.texte, /Jamais sur un mois maigre : moins de 200 matchs dans une case, elle ne dit rien\./);
  const sans = await contexte.carte({ reponse: etats.depart });
  assert.match(sans.texte, /Alerte de dérive : pas encore jugée .*Pas encore de mois figé à juger\./);
  assert.equal(avecLesClasses(sans.html, 'cm-note', 'is-danger'), false);
  assert.match(sans.texte, /Le réglage refait chaque mois étape 26 Le réglage refait chaque mois : la correction du mois proposera elle-même une candidate/);
  assert.equal((sans.texte.match(/après la calibration \(étape 20\)/g) ?? []).length, 0, 'la place d’avant n’est plus montrée');
});

test('la carte, un serveur PAS ENCORE RELANCÉ (d’avant la seconde moitié) : la place d’avant « après la calibration (étape 20) », la dérive « non lue », aucun bouton « Adopter »', options, async () => {
  const vieux = { ...etats.depart, aVenir: { adoption: { quand: 'après la calibration (étape 20)', quoi: 'Adopter une candidate en un clic…' }, derive: { quand: 'après la calibration (étape 20)', quoi: 'Alerter quand l’écart grandit.' } } };
  delete vieux.derive;
  delete vieux.adoption;
  const r = await contexte.carte({ reponse: vieux });
  assert.deepEqual(r.avertissements, []);
  assert.equal((r.texte.match(/après la calibration \(étape 20\)/g) ?? []).length, 2);
  assert.match(r.texte, /Alerte de dérive : non lu .*La dérive n’est pas encore lue par ce serveur \(relancez-le après la mise à jour\)\./);
  assert.match(r.texte, /Adoption non lu/);
  assert.equal(bouton(r.html, 'Adopter la candidate'), null);
});

// ============================================================ 3. hygiène et câblage

test('hygiène du nouveau bloc : jetons seulement, ni couleur en dur ni !important ni police sous 10 px, icônes connues, conteneur ; les termes du guide ; aucun appel réseau à lui — la carte confirme et écrit', () => {
  const vue = fs.readFileSync(path.join(UI, 'src', 'components', 'settings', 'EngineCandidateTrial.vue'), 'utf8');
  const style = vue.slice(vue.indexOf('<style'));
  assert.doesNotMatch(style, /#[0-9a-f]{3,8}\b|rgba?\(\s*\d/i);
  assert.doesNotMatch(vue, /!important/);
  for (const m of style.matchAll(/font-size:\s*([\d.]+)px/g)) assert.ok(Number(m[1]) >= 10, `police ${m[1]} px`);
  const jetons = fs.readFileSync(path.join(UI, 'src', 'assets', 'styles', 'tokens.css'), 'utf8');
  for (const m of style.matchAll(/var\((--cm-[a-z0-9-]+)/g)) assert.ok(jetons.includes(`${m[1]}:`), `jeton inconnu ${m[1]}`);
  const connues = new Set([...fs.readFileSync(path.join(UI, 'src', 'components', 'common', 'AppIcon.vue'), 'utf8').matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]));
  for (const m of vue.matchAll(/<AppIcon name="(\w+)"/g)) assert.ok(connues.has(m[1]), `icône inconnue ${m[1]}`);
  assert.match(style, /container: ect \/ inline-size;/);
  assert.deepEqual([...vue.matchAll(/<HelpTip terme="([^"]+)"/g)].map((m) => m[1]).sort(), ['banc-d-essai', 'fourchette-du-hasard', 'preuve-apres-lancement', 'variantes-essayees']);
  assert.doesNotMatch(vue, /httpClient|configApi|fetch\(|window\.confirm|is-accent|ValueBadge|variant="section"/, 'le bloc n’appelle rien : il émet ; aucun vert');
  assert.match(vue, /:disabled="!adoptionPossible"/);
  assert.match(vue, /const adoptionPossible = computed\(\(\) => Boolean\(adoption\.value\?\.possible\) && Boolean\(candidate\.value\) && !props\.occupe\);/, 'actif SEULEMENT sur « retenu » (adoption.possible du serveur)');
});

test('câblage : la carte confirme TOUJOURS l’adoption (la candidate et la version vues à l’écran), met à jour le formulaire par le magasin de Réglages, lance le banc ; les routes ; la feuille de route dit la dérive', () => {
  const lireUi = (...c) => fs.readFileSync(path.join(UI, 'src', ...c), 'utf8');
  const carte = lireUi('components', 'settings', 'EngineVersionsPanel.vue');
  assert.match(carte, /const texte = texteDeConfirmationAdoption\(d\.value\);\n {2}if \(!texte \|\| !window\.confirm\(texte\)\) return;/);
  assert.match(carte, /await configApi\.adopterLaCandidate\(enService\.value\.numero, d\.value\.candidate\.id\);/);
  assert.match(carte, /useConfigStore\(\)\.appliquerAdoption\(r\);/);
  assert.match(carte, /await configApi\.lancerLeBancDeLaCandidate\(\);/);
  assert.match(carte, /<EngineCandidateTrial\n\s+v-if="candidate"/);
  assert.doesNotMatch(carte, /httpClient|\.put\(|\.delete\(/);
  const api = lireUi('services', 'configApi.js');
  assert.match(api, /adopterLaCandidate: \(depuis, candidate\) => httpClient\.post\('\/config\/versions\/adopter', \{ depuis, candidate \}\),/);
  assert.match(api, /lancerLeBancDeLaCandidate: \(\) => httpClient\.post\('\/config\/versions\/candidate\/banc', \{\}\)/);
  const store = lireUi('stores', 'configStore.js');
  assert.match(store, /appliquerAdoption\(r\) \{\n {6}if \(r\?\.config\) this\.config = r\.config;/);
  const feuille = lireUi('views', 'RoadmapView.vue');
  assert.match(feuille, /const alerteDerive = computed\(\(\) => phraseDeLAlerteDerive\(d\.value\?\.alerteDerive\)\);/);
  assert.match(feuille, /<div v-if="alerteDerive" class="cm-note is-danger">/);
  assert.match(feuille, /Le détail et la règle sont dans Réglages › Versions du moteur\./);
});
