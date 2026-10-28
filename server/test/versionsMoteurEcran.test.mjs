/**
 * La carte « Versions du moteur » de Réglages (étape 25 du plan, le socle) : ses règles et son rendu.
 *   node --test test/versionsMoteurEcran.test.mjs        (depuis server/)
 *
 * Les réponses de GET /api/config/versions sont celles du VRAI serveur : la phase « etats » de
 * test/aides/script-versions-moteur.mjs les calcule dans une copie isolée (premier démarrage, trois versions,
 * une candidate fabriquée, une candidate fautive, une passe en cours, un code changé, un registre abîmé, pas de
 * registre). Le rendu est fait côté serveur, sans navigateur ni serveur de développement : `fetch` remplacé
 * (seule la route des versions répond, tout le reste est refusé et compté), un Vite « middleware » n'écoute sur
 * aucun port, son cache va dans le dossier d'essais, rien n'est écrit dans ui/. Comme pour les autres cartes,
 * `onMounted` devient `onServerPrefetch` dans le rendu.
 *
 *  1. Les règles de l'écran (ui/src/utils/versionsMoteur.js) : dates à Paris, valeurs des réglages, ce qui a
 *     changé, chiffres clés, confirmation du retour arrière.
 *  2. La carte, dans chacun de ses états : version en service, précédentes (tableau complet, Σ), candidate
 *     (« aucune »), bouton du retour (actif, ou désactivé avec sa raison) ; depuis la seconde moitié (14/10/2026),
 *     l'alerte de dérive et la place de l'étape 26, et aucun bouton « Adopter » sans candidate (la carte avec une
 *     candidate, ses verdicts et l'adoption : adoptionMoteurEcran.test.mjs).
 *  3. L'hygiène du composant et le câblage dans Réglages (et la version passée avec chaque pronostic du scan).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { preparerCopie, executer, sansCandidateDuCode, SERVEUR, RACINE_ESSAIS, MANIFESTE_ECHANTILLON } from './aides/isolement.mjs';

const UI = path.resolve(SERVEUR, '..', 'ui');
const pret = ['vite', '@vitejs/plugin-vue', 'vue', 'pinia'].every((p) => fs.existsSync(path.join(UI, 'node_modules', p)));
const imp = (chemin) => import(pathToFileURL(chemin).href);
const options = { skip: pret ? false : 'ui/node_modules (vite, plugin-vue, vue, pinia) manque' };
const R = await imp(path.join(UI, 'src', 'utils', 'versionsMoteur.js'));
const MOINS = '−';

/** Les réponses du vrai serveur, produites une fois dans une copie isolée (étape 27 : sans la candidate du code — le cycle des versions sans candidate). */
function etatsDuServeur() {
  const copie = sansCandidateDuCode(preparerCopie({}));
  try {
    const env = { CLAUDE_CODE_BIN: path.join(copie.dossier, 'pas-de-claude-ici.exe'), MATCH_STATS_AUTO_REFRESH: 'false' };
    const r = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-versions-moteur.mjs'), { args: ['etats', MANIFESTE_ECHANTILLON], timeout: 300_000, env });
    assert.equal(r.code, 0, r.erreurs.slice(-3000));
    assert.equal(r.reseau, false);
    return r.json.etats;
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
const compter = (texte, motif) => (texte.match(motif) ?? []).length;

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
  const cache = fs.mkdtempSync(path.join(RACINE_ESSAIS, 'cm-rendu-versions-'));
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
const corpsDuTableau = (html) => (html.split('<tbody')[1] ?? '').split('</tbody>')[0].split(/<tr\b/).slice(1).map((x) => `<tr${x}`);

// ============================================== 1. les règles de l'écran

test('versionsMoteur.js : la date à Paris (heure d’été et d’hiver), la valeur d’un réglage (pourcent, nombre et vrai signe moins, liste), ce qui a changé (réglage, bookmakers, code), une version sans changement', () => {
  assert.equal(R.quandParis('2026-10-07T12:32:00.000Z'), '07/10/2026 à 14:32');
  assert.equal(R.quandParis('2026-12-01T09:05:00.000Z'), '01/12/2026 à 10:05');
  assert.equal(R.quandParis('2026-10-05T22:30:00.000Z'), '06/10/2026 à 00:30', 'le jour de Paris');
  assert.equal(R.quandParis(null), 'date inconnue');
  assert.equal(R.quandParis('n’importe quoi', 'jamais'), 'jamais');
  assert.equal(R.valeurDuReglage(0.02, 'pourcent'), '2 %');
  assert.equal(R.valeurDuReglage(0.035, 'pourcent'), '3,5 %');
  assert.equal(R.valeurDuReglage(-0.075, 'nombre'), `${MOINS}0,075`);
  assert.equal(R.valeurDuReglage(0.125, 'nombre'), '0,125');
  assert.equal(R.valeurDuReglage(['williamhill', 'betsson'], 'liste'), '2 bookmakers');
  assert.equal(R.valeurDuReglage([], 'liste'), 'tous les bookmakers');
  assert.equal(R.valeurDuReglage(null, 'pourcent'), 'non réglé');
  assert.equal(R.valeurDuReglage(true, 'brut'), 'oui');
  assert.deepEqual(R.phraseDuChangement({ type: 'reglage', cle: 'defaultCorrelation', libelle: 'Corrélation Dixon-Coles (rho)', format: 'nombre', avant: -0.075, apres: -0.15 }), { titre: 'Corrélation Dixon-Coles (rho)', texte: `${MOINS}0,075 → ${MOINS}0,15` });
  assert.deepEqual(R.phraseDuChangement({ type: 'reglage', cle: 'edgeThresholdMin', libelle: 'Edge minimum requis', format: 'pourcent', avant: 0.02, apres: 0.03 }), { titre: 'Edge minimum requis', texte: '2 % → 3 %' });
  assert.deepEqual(R.phraseDuChangement({ type: 'reglage', cle: 'valueBookmakers', libelle: 'Vos bookmakers', format: 'liste', avant: ['a'], apres: ['a', 'b'], ajoutes: ['Coolbet'], retires: [] }), { titre: 'Vos bookmakers', texte: 'ajouté : Coolbet' });
  assert.deepEqual(R.phraseDuChangement({ type: 'reglage', cle: 'valueBookmakers', libelle: 'Vos bookmakers', format: 'liste', ajoutes: ['A', 'B'], retires: ['C'] }), { titre: 'Vos bookmakers', texte: 'ajoutés : A, B ; retiré : C' });
  assert.deepEqual(R.phraseDuChangement({ type: 'code', modifies: ['core/engine/resultPrediction.js'], ajoutes: [], retires: [] }), { titre: 'Code du moteur', texte: 'fichier modifié : core/engine/resultPrediction.js' });
  assert.deepEqual(R.phraseDuChangement({ type: 'code', modifies: ['a.js', 'b.js'], ajoutes: ['c.js'], retires: [] }), { titre: 'Code du moteur', texte: 'fichiers modifiés : a.js, b.js ; fichier ajouté : c.js' });
  assert.deepEqual(R.lignesDesChangements({ origine: 'premier-demarrage', changements: [] }), [{ titre: 'Rien de changé', texte: 'c’est l’état du moteur au premier démarrage avec les versions' }]);
  assert.equal(R.phraseDeLEnregistrement({ numero: 3, nouvelle: true }), 'Nouvelle version du moteur : n° 3.');
  assert.equal(R.phraseDeLEnregistrement({ numero: 1, nouvelle: false, reprise: true }), 'Retour à l’état de la version 1 du moteur.');
  assert.equal(R.phraseDeLEnregistrement({ numero: 2, nouvelle: false, reprise: false }), 'Rien de changé : toujours la version 2 du moteur.');
  assert.equal(R.phraseDeLEnregistrement(undefined), null, 'un serveur pas encore relancé : rien à dire de plus');
  assert.equal(R.messageApresRetour({ de: 3, vers: 2 }), 'Version 2 remise en service (la version 3 est gardée dans la liste) : les réglages du moteur sont exactement ceux de la version 2.');
});

test('versionsMoteur.js sur les réponses du VRAI serveur : chiffres clés, place de chaque version dans le retour, et la confirmation qui dit exactement ce qui revient', () => {
  const t = etats.troisVersions;
  assert.deepEqual(R.kpiEnService(t), { valeur: 'n° 3', detail: `depuis le ${R.quandParis(t.enService.creeeLe)} — réglages enregistrés dans Réglages › Paramètres du moteur`, ton: 'is-ok' });
  assert.deepEqual(R.kpiRetour(t), { valeur: 'vers la n° 2', detail: 'en un clic, avec une confirmation', ton: '' });
  assert.deepEqual(R.kpiCandidate(t), { valeur: 'aucune', detail: 'la première viendra de l’étape 27', ton: '' });
  assert.equal(R.placeDansLeRetour(t.precedentes[0], t), 'la prochaine si vous revenez en arrière');
  assert.equal(R.placeDansLeRetour(t.precedentes[1], t), 'plus loin en arrière');
  assert.equal(R.placeDansLeRetour(etats.codeDifferent.precedentes[0], etats.codeDifferent), 'la précédente, mais avec un autre code : pas de retour d’un clic');
  assert.equal(R.placeDansLeRetour(etats.passeEnCours.precedentes[0], etats.passeEnCours), 'la précédente : retour arrière pas possible pour l’instant');
  assert.equal(R.placeDansLeRetour({ numero: 9, dansLaPile: false }, t), 'défaite par un retour arrière : on y revient en remettant ses réglages');
  const confirmation = R.texteDeConfirmation(t);
  assert.equal(
    confirmation,
    `Revenir à la version 2 (du ${R.quandParis(t.precedentes[0].creeeLe)}) ?\n\n` +
      'Les réglages du moteur redeviennent exactement ceux de cette version :\n' +
      '• Edge minimum requis : 3 % → 2 %\n' +
      '• Vos bookmakers (un pari n’est recommandé que chez eux) : ajoutés : 888sport, Nordic Bet, Unibet (NL), Unibet (SE), LeoVegas (SE), Tipico (DE), Coolbet\n\n' +
      "Les pronostics calculés ensuite porteront la version 2. Rien d'autre ne change : vos paris, les pronostics déjà enregistrés et les données restent tels quels."
  );
  for (const cle of ['premier', 'passeEnCours', 'codeDifferent', 'illisible', 'absent']) assert.equal(R.texteDeConfirmation(etats[cle]), null, `${cle} : pas de confirmation, le bouton est désactivé`);
  assert.deepEqual(R.kpiRetour(etats.codeDifferent), { valeur: 'pas maintenant', detail: 'La version 3 tournait avec un autre code du moteur : un clic remet des réglages, pas du code.', ton: '' });
  assert.equal(R.kpiRetour(etats.illisible).ton, 'is-danger');
  assert.deepEqual(R.kpiEnService(etats.absent), { valeur: 'pas encore', detail: 'la version 1 sera notée au prochain démarrage du serveur, sans rien changer aux chiffres', ton: 'is-warn' });
  assert.equal(R.kpiEnService(etats.illisible).valeur, 'illisible');
  assert.deepEqual(R.kpiCandidate(etats.avecCandidate), { valeur: 'essai-rho-015', detail: 'étape 27 · Corrélation Dixon-Coles à −0,15 (candidate d’essai)', ton: '' });
  assert.equal(R.kpiCandidate(etats.candidateFautive).valeur, 'refusée');
  // Les états eux-mêmes, tels que le serveur les a rendus.
  assert.deepEqual([etats.passeEnCours.retour.possible, etats.passeEnCours.retour.raison], [false, 'passe-en-cours']);
  assert.deepEqual([etats.codeDifferent.enService.numero, etats.codeDifferent.retour.raison], [4, 'code-different']);
  assert.deepEqual(etats.codeDifferent.enService.changements, [{ type: 'code', modifies: ['core/engine/valueFinder.js'], ajoutes: [], retires: [] }]);
});

// ============================================================ 2. la carte

test('la carte, trois versions : la version en service, ce qu’elle a changé, les précédentes (tableau, Σ), « aucune » candidate, le bouton du retour ACTIF, l’alerte de dérive et la place de l’étape 26 — aucun bouton « Adopter » sans candidate, aucun vert, rien d’autre appelé', options, async () => {
  const r = await contexte.carte({ reponse: etats.troisVersions });
  assert.deepEqual(r.avertissements, []);
  assert.deepEqual(r.appels.map((u) => u.replace(/^.*\/api/, '/api')), ['/api/config/versions']);
  assert.match(r.texte, /Version en service n° 3 depuis le \d{2}\/10\/2026 à \d{2}:\d{2} — réglages enregistrés dans Réglages › Paramètres du moteur/);
  assert.match(r.texte, /Versions notées 3 la première le/);
  assert.match(r.texte, /Candidate en essai aucune la première viendra de l’étape 27/);
  assert.match(r.texte, /Retour arrière vers la n° 2 en un clic, avec une confirmation/);
  assert.match(r.texte, /Ce qui a changé avec la version en service .*Edge minimum requis 2 % → 3 % Vos bookmakers \(un pari n’est recommandé que chez eux\) retirés : 888sport, Nordic Bet/);
  const lignes = corpsDuTableau(r.html);
  assert.equal(lignes.length, 2);
  assert.match(texteDe(lignes[0]), /^n° 2 \d{2}\/10\/2026 à \d{2}:\d{2} réglages enregistrés dans Réglages › Paramètres du moteur Corrélation Dixon-Coles \(rho\) : −0,075 → −0,15 la prochaine si vous revenez en arrière$/);
  assert.match(texteDe(lignes[1]), /^n° 1 .* premier démarrage de l’appli avec les versions .* Rien de changé : c’est l’état du moteur au premier démarrage avec les versions plus loin en arrière$/);
  assert.match(r.texte, /Σ 3 versions la n° 3 en service, 2 précédentes/);
  assert.match(r.texte, /Aucune version candidate en essai pour l’instant\. La première viendra de l’étape 27/);
  assert.match(r.texte, /jamais montrés comme pronostic, jamais pariés, jamais envoyés à l’IA/);
  assert.match(r.texte, /Remet la version 2 telle qu’elle était : Edge minimum requis 3 % → 2 %/);
  const b = boutons(r.html);
  const retour = b.find((x) => x.texte === 'Revenir à la version précédente');
  assert.ok(retour, JSON.stringify(b));
  assert.equal(retour.desactive, false, 'actif');
  // Étape 25, seconde moitié (14/10/2026) : la place d'avant est remplie. Sans candidate, aucun bouton « Adopter »
  // (rien à adopter) ; l'alerte de dérive (pas encore de mois figé) et la place de l'étape 26 sont là
  // (adoptionMoteurEcran.test.mjs teste la carte avec une candidate et une dérive).
  assert.ok(!b.some((x) => /Adopter/i.test(x.texte)), 'aucun bouton « Adopter » sans candidate');
  assert.equal(compter(r.texte, /après la calibration \(étape 20\)/g), 0);
  assert.match(r.texte, /Adoption rien à adopter aucune candidate en essai/);
  assert.match(r.texte, /Alerte de dérive : pas encore jugée/);
  assert.match(r.texte, /Le réglage refait chaque mois étape 26/);
  assert.match(r.texte, /Les pronostics enregistrés avant la première version restent tels quels : « sans version »/);
  assert.match(r.texte, /Registre des versions du moteur, sur ce PC/);
  assert.match(r.html, /title="[^"]*engine-versions\.json/, 'le fichier sur ce PC, au survol');
  assert.doesNotMatch(r.html, /is-accent|cm-positive/, 'aucun vert : rien ici n’est une value');
  assert.deepEqual(interdits, []);
});

test('la carte, chaque état où le retour n’est pas possible : bouton DÉSACTIVÉ et la raison écrite — première version, passe en cours, code changé ; registre illisible ; pas encore de version ; serveur pas encore relancé (le tableau reste)', options, async () => {
  const cas = [
    ['premier', /La version 1 est la première notée : il n’y a pas de version précédente\./, /Aucune : la version 1 est la première notée\./],
    ['passeEnCours', /Une passe d’actualisation \(ou un import\) est en cours : le retour arrière attend qu’elle soit finie\./, /n° 2/],
    ['codeDifferent', /La version 3 tournait avec un autre code du moteur : un clic remet des réglages, pas du code\./, /Code du moteur : fichier modifié : core\/engine\/valueFinder\.js|Code du moteur fichier modifié : core\/engine\/valueFinder\.js/],
    ['illisible', /Le registre des versions est illisible pour l’instant\./, /Version en service illisible/],
    ['absent', /Aucune version notée pour l’instant : la première le sera au prochain démarrage du serveur\./, /Version en service pas encore la version 1 sera notée au prochain démarrage du serveur, sans rien changer aux chiffres/]
  ];
  for (const [cle, raison, autre] of cas) {
    const r = await contexte.carte({ reponse: etats[cle] });
    assert.deepEqual(r.avertissements, [], cle);
    assert.match(r.texte, raison, cle);
    assert.match(r.texte, autre, cle);
    const retour = boutons(r.html).find((x) => x.texte === 'Revenir à la version précédente');
    assert.equal(retour?.desactive, true, `${cle} : bouton désactivé`);
    assert.match(r.html, /<table/, `${cle} : le tableau reste`);
  }
  // Le serveur d'avant l'étape 25 : la route n'existe pas (404) — la carte le dit, garde ses blocs, sans valeurs.
  const vieux = await contexte.carte({ reponse: { error: 'Route introuvable : GET /api/config/versions' }, statut: 404 });
  assert.deepEqual(vieux.avertissements, []);
  assert.match(vieux.texte, /Versions du moteur illisibles Le serveur n'est pas à jour : relancez demarrer-cotemaster\.bat pour activer cette fonction\. — la carte garde ses blocs, sans valeurs\./);
  assert.match(vieux.texte, /Version en service non lu/);
  assert.match(vieux.texte, /Non lu\./);
  assert.match(vieux.html, /<table/);
  assert.equal(boutons(vieux.html).find((x) => x.texte === 'Revenir à la version précédente')?.desactive, true);
  assert.deepEqual(interdits, []);
});

test('la carte, une candidate en essai (fabriquée) : sa fiche — identifiant, étape, marchés calculés à blanc, en essai depuis — et ce qu’elle ne fait jamais ; une candidate fautive est dite refusée', options, async () => {
  const r = await contexte.carte({ reponse: etats.avecCandidate });
  assert.deepEqual(r.avertissements, []);
  assert.match(r.texte, /Version candidate en essai essai-rho-015/);
  assert.match(r.texte, /Identifiant essai-rho-015 Étape 27 — Corrélation Dixon-Coles à −0,15 \(candidate d’essai\) Marchés calculés à blanc Plus\/moins buts, Les 2 équipes marquent En essai depuis pas encore mise en essai : au prochain démarrage du serveur/);
  assert.match(r.texte, /jamais montrés comme pronostic, jamais pariés, jamais envoyés à l’IA/);
  const fautive = await contexte.carte({ reponse: etats.candidateFautive });
  assert.match(fautive.texte, /Candidate en essai refusée Candidate « essai-rho-015 » : marché inconnu « buteurs »/);
});

// ============================================================ 3. hygiène et câblage

test('hygiène : jetons de couleur seulement, ni couleur en dur ni !important ni police sous 10 px, icônes connues, conteneur pour les petites largeurs', () => {
  const vue = fs.readFileSync(path.join(UI, 'src', 'components', 'settings', 'EngineVersionsPanel.vue'), 'utf8');
  const style = vue.slice(vue.indexOf('<style'));
  assert.doesNotMatch(style, /#[0-9a-f]{3,8}\b|rgba?\(\s*\d/i, 'aucune couleur en dur');
  assert.doesNotMatch(vue, /!important/);
  for (const m of style.matchAll(/font-size:\s*([\d.]+)px/g)) assert.ok(Number(m[1]) >= 10, `police ${m[1]} px`);
  const jetons = fs.readFileSync(path.join(UI, 'src', 'assets', 'styles', 'tokens.css'), 'utf8');
  for (const m of style.matchAll(/var\((--cm-[a-z0-9-]+)/g)) assert.ok(jetons.includes(`${m[1]}:`), `jeton inconnu ${m[1]}`);
  const connues = new Set([...fs.readFileSync(path.join(UI, 'src', 'components', 'common', 'AppIcon.vue'), 'utf8').matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]));
  for (const m of vue.matchAll(/<AppIcon name="(\w+)"/g)) assert.ok(connues.has(m[1]), `icône inconnue ${m[1]}`);
  assert.match(style, /container: ev \/ inline-size;/);
  assert.doesNotMatch(vue, /ValueBadge|is-accent/, 'le vert reste celui des paris');
  // Une seule écriture : le retour arrière, avec la version vue à l'écran.
  assert.match(vue, /await configApi\.revenirALaVersionPrecedente\(enService\.value\.numero\);/);
  assert.match(vue, /if \(!texte \|\| !window\.confirm\(texte\)\) return;/, 'toujours une confirmation');
  assert.doesNotMatch(vue, /httpClient|\.put\(|\.delete\(/);
});

test('câblage : la carte dans Réglages juste sous « Paramètres du moteur », relue après un enregistrement et une passe ; le retour remet le formulaire ; les routes ; la version du moteur passée avec chaque pronostic du scan de Mes paris', () => {
  const lireUi = (...c) => fs.readFileSync(path.join(UI, 'src', ...c), 'utf8');
  const reglages = lireUi('views', 'SettingsView.vue');
  assert.match(reglages, /import EngineVersionsPanel from '@\/components\/settings\/EngineVersionsPanel\.vue';/);
  // Étape 26 (partie E, 28/10/2026) : la carte émet l’état lu (`@lu`), Réglages en tire l’avertissement de « Paramètres du moteur ».
  assert.match(reglages, /title="Versions du moteur"[\s\S]*?<EngineVersionsPanel\n\s+:changement-le="configStore\.derniereVersion\?\.le \?\? null"\n\s+:passe-terminee-le="refreshOverview\?\.lastCompletedAt \?\? null"\n\s+@retour="handleRetourVersion"(?:\n\s+@lu="\(d\) => \(etatDesVersions = d\)")?\n\s+\/>/);
  assert.ok(reglages.indexOf('<EngineConfigForm') < reglages.indexOf('<EngineVersionsPanel') && reglages.indexOf('<EngineVersionsPanel') < reglages.indexOf('title="Gestion du risque"'), 'juste sous les paramètres du moteur');
  // La carte suit DIRECTEMENT celle des paramètres du moteur, toujours affichée (ni v-if ni v-show sur elle).
  assert.match(reglages, /<EngineConfigForm [^\n]*\/>\n\s+<\/AppCard>\n\n\s+<!-- Les versions du moteur [^\n]*-->\n\s+<AppCard\n\s+title="Versions du moteur"\n\s+subtitle="[^"\n]+"\n\s+eyebrow="Moteur"\n\s+icon="history"\n\s+>\n\s+<EngineVersionsPanel\n/);
  assert.match(reglages, /function handleRetourVersion\(r\) \{\n {2}configStore\.appliquerRetour\(r\);/);
  assert.match(reglages, /phraseDeLEnregistrement\(configStore\.derniereVersion\)/);
  const api = lireUi('services', 'configApi.js');
  assert.match(api, /versions: \(\) => httpClient\.get\('\/config\/versions'\),/);
  assert.match(api, /revenirALaVersionPrecedente: \(depuis\) => httpClient\.post\('\/config\/versions\/retour', \{ depuis \}\)/);
  const store = lireUi('stores', 'configStore.js');
  assert.match(store, /const \{ config, version \} = await configApi\.update\(partialConfig\);/);
  assert.match(store, /appliquerRetour\(r\) \{/);
  const mesParis = lireUi('views', 'MyBetsView.vue');
  assert.match(mesParis, /\/\/ Étape 25 du plan : la version du moteur qui a calculé ce pronostic, gardée avec lui au journal\.\n\s+engineVersion: data\.engineVersion \?\? null,\n\s+\.\.\.marketPrediction\n/);
  // Les messages d'avant restent mot pour mot ; la version est dite dans un second message.
  assert.match(reglages, /toastStore\.success\('Configuration enregistrée\.'\);\n\s+direLaVersion\(\);/);
  assert.match(reglages, /toastStore\.success\('Configuration réinitialisée aux valeurs par défaut\.'\);\n\s+direLaVersion\(\);/);
});
