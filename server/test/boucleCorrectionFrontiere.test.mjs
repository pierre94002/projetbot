/**
 * La boucle de correction (étape 26 du plan, partie B, 28/10/2026) — LA FRONTIÈRE, sur le source : ce que la boucle
 * a le droit d'appeler, où elle vit, où tourne son banc, ce que lit Santé du moteur, sa place dans la passe.
 *   T-F1  l'empreinte du code du moteur (16f2459…) et celle de la candidate de l'étape 27 (f01dd8496f56a415) sont
 *         celles du jour ; aucun fichier de la boucle n'entre dans l'empreinte ;
 *   seuls engineVersions.js et miseALEssai.js appellent proposerUneCandidate ; aucun module de la boucle n'écrit les
 *   réglages ni n'adopte (B15, B16) ; le banc d'une correction n'est jugé QUE dans son enfant (B47), lancé sous le
 *   jeton du calcul lourd et le verrou « banc-correction », jamais depuis la passe (aucun crochet dans planifier) ;
 *   Santé du moteur et la route ne trient jamais (B31) ; l'étape « boucleCorrection » entre la carte « où parier » et
 *   la sauvegarde ; aucun test n'appelle un écrivain de la boucle dans son processus.
 *   node --test test/boucleCorrectionFrontiere.test.mjs        (depuis server/)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { empreinteDuCode, empreinteDeLaCandidate, CANDIDATE_EN_ESSAI, fichiersDuMoteur } from '../src/core/engine/engineVersions.js';
import { REFRESH_STEPS } from '../src/jobs/matchStatsAutoRefresh.js';
import { DELAI_DU_BANC_MS, NOM_DU_VERROU, NOM_DU_CALCUL } from '../src/data/correction/bancDesCorrections.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ICI, '..', 'src');
const sansCommentaires = (t) => t.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
const lire = (f) => sansCommentaires(fs.readFileSync(path.join(SRC, f), 'utf8'));
const FICHIERS = fs.readdirSync(SRC, { recursive: true }).filter((f) => String(f).endsWith('.js')).map((f) => String(f).split(path.sep).join('/'));
const avec = (motif) => FICHIERS.filter((f) => motif.test(lire(f))).sort();
const LA_BOUCLE = Object.freeze([
  'data/correction/bancCorrectionEnfant.js',
  'data/correction/bancDesCorrections.js',
  'data/correction/boucle.js',
  'data/correction/depotCorrections.js',
  'data/correction/etatDesCorrections.js',
  // Partie D (28/10/2026) : la fiche du résumé du mois.
  'data/correction/ficheDuMois.js',
  'data/correction/lignee.js',
  'data/correction/mesures.js',
  'data/correction/miseALEssai.js',
  'data/correction/propositions.js',
  'data/correction/regles.js',
  'data/correction/tri.js'
]);
const SES_ROUTES = Object.freeze(['api/controllers/corrections.controller.js', 'api/routes/corrections.routes.js']);

test('T-F1 : l’empreinte du code du moteur reste 16f2459… et celle de la candidate de l’étape 27 f01dd8496f56a415 ; la boucle vit dans data/correction/ (12 fichiers depuis la partie D), hors de l’empreinte ; rien de neuf sous core/engine, sports ni bench', () => {
  assert.equal(empreinteDuCode({ racine: SRC, rafraichir: true }).empreinte, '16f2459db183a99576365047da98b7777687ef05');
  assert.equal(empreinteDeLaCandidate(CANDIDATE_EN_ESSAI), 'f01dd8496f56a415');
  assert.deepEqual(FICHIERS.filter((f) => f.startsWith('data/correction/')), [...LA_BOUCLE]);
  const moteur = fichiersDuMoteur();
  for (const f of [...LA_BOUCLE, ...SES_ROUTES]) assert.ok(!moteur.includes(f), `${f} hors de l’empreinte`);
  assert.ok(!FICHIERS.some((f) => /^(core\/engine|sports|bench)\/.*[Cc]orrection/.test(f)), 'aucun fichier de la boucle sous core/engine, sports ni bench');
});

test('qui écrit quoi : proposerUneCandidate n’est appelé QUE par engineVersions.js et miseALEssai.js ; dans la boucle, miseALEssai.js est le seul à mettre une candidate en essai ou à compter une correction ; AUCUN module de la boucle ni ses routes n’écrit les réglages, n’adopte, ne revient en arrière ni ne note un essai (B15, B16) ; aucun ne lit predictions.json', () => {
  assert.deepEqual(avec(/\bproposerUneCandidate\s*\(/), ['core/engine/engineVersions.js', 'data/correction/miseALEssai.js']);
  for (const f of [...LA_BOUCLE, ...SES_ROUTES]) {
    const t = lire(f);
    assert.doesNotMatch(t, /\b(updateEngineConfig|resetEngineConfig|remplacerReglagesDuMoteur|adopterLaCandidate|revenirALaVersionPrecedente|noterLEssai|noterLeBancDeLaCandidate|declarerLancement|declarerVariantes|enregistrerJugement)\b/, f);
    assert.doesNotMatch(t, /predictions\.json|predictionsRepository/, f);
    if (f !== 'data/correction/miseALEssai.js') assert.doesNotMatch(t, /\b(proposerUneCandidate|mettreLaCandidateEnEssai|declarerVariante)\s*\(/, f);
  }
  assert.match(lire('data/correction/miseALEssai.js'), /proposerUneCandidate\(p\.declaration, \{ origine: 'correction-mensuelle', maintenant \}\)/);
  assert.match(lire('data/correction/miseALEssai.js'), /declarerVariante\('26', \{ id: proposition\.id, quoi: [^}]*, ou: 'banc' \}/);
  assert.match(lire('data/correction/miseALEssai.js'), /mettreLaCandidateEnEssai\(\{ candidate: null, maintenant \}\)/);
  // libererLaPlace : ses trois gardes, AVANT l'appel (B17).
  const liberer = lire('data/correction/miseALEssai.js').split('export function libererLaPlace')[1].split('\nexport ')[0];
  // Le nom est recomposé : le garde des essais (versionsMoteur.test.mjs) ne doit pas y voir un appel.
  const appel = liberer.indexOf('mettreLaCandidateEnEssai' + '(');
  assert.ok(appel > -1, 'libererLaPlace appelle bien le point d’entrée de l’étape 25');
  for (const garde of ["notee.id !== id", "notee.origine !== 'correction-mensuelle'", 'adopteeAuRegistre(brut, candidateDuCode.id)']) {
    assert.ok(liberer.indexOf(garde) > -1 && liberer.indexOf(garde) < appel, `garde avant l’appel : ${garde}`);
  }
});

test('B47 — le banc d’une correction n’est JUGÉ que dans son processus à part : jugerLaCandidateAuBanc( n’est appelé que par l’enfant et par la route du banc de Réglages ; l’enfant ouvre la base en lecture seule et n’écrit rien ; le serveur prend le jeton du calcul lourd, puis le verrou « banc-correction », compte la correction AVANT le fork ; délai 45 min', () => {
  const appels = FICHIERS.filter((f) => /\bjugerLaCandidateAuBanc\s*\(/.test(lire(f).replace(/function jugerLaCandidateAuBanc\s*\(/g, ''))).sort();
  assert.deepEqual(appels, ['api/controllers/config.controller.js', 'data/correction/bancCorrectionEnfant.js']);
  const enfant = lire('data/correction/bancCorrectionEnfant.js');
  assert.match(enfant, /new DatabaseSync\(chemin, \{ readOnly: true \}\)/);
  assert.doesNotMatch(enfant, /\.run\(|INSERT|UPDATE|DELETE|writeJsonAtomic|writeFileSync|changerLEtat|declarerVariante|depotCorrections|engineVersions/);
  assert.match(enfant, /if \(!process\.env\.CM_TEST_DOSSIER\) throw/, 'le rejeu fabriqué : seulement dans une copie d’essai');
  const banc = lire('data/correction/bancDesCorrections.js');
  assert.match(banc, /fork\(ENFANT, \[\], \{ stdio: \['ignore', 'ignore', 'pipe', 'ipc'\] \}\)/);
  assert.equal(DELAI_DU_BANC_MS, 45 * 60_000);
  assert.equal(NOM_DU_VERROU, 'banc-correction');
  assert.equal(NOM_DU_CALCUL, 'banc d’une correction');
  const lancer = banc.split('export function lancerLeBancDUneCorrection')[1].split('\nexport ')[0];
  const jeton = lancer.indexOf('commencerCalculLourd(NOM_DU_CALCUL');
  const verrou = lancer.indexOf('withRefreshLock(() => tacheDuBanc(');
  assert.ok(jeton > -1 && verrou > jeton, 'le jeton du calcul lourd AVANT le verrou et le travail');
  assert.match(lancer, /\{ stamp: false, nom: NOM_DU_VERROU \}/);
  const tache = banc.split('async function tacheDuBanc')[1].split('\nexport ')[0];
  const compter = tache.indexOf('declarerAvantLeBanc');
  assert.ok(compter > -1 && compter < tache.indexOf('jugerAPart('), 'comptée AVANT le fork');
  assert.ok(tache.indexOf("evenement: 'au-banc'") < tache.indexOf('jugerAPart('));
  assert.match(lire('data/correction/bancDesCorrections.js'), /if \(chemin && !process\.env\.CM_TEST_DOSSIER\) throw/);
});

test('le banc part AU CLIC seulement : jamais depuis la passe ni après elle — aucun crochet dans planifier (le banc du mois seul), l’étape de la boucle ne lance aucun banc ; seule la route POST /api/corrections/:id/banc l’appelle', () => {
  const job = fs.readFileSync(path.join(SRC, 'jobs', 'matchStatsAutoRefresh.js'), 'utf8');
  const planifier = job.split('function planifier(')[1].split('\nfunction ')[0];
  assert.doesNotMatch(planifier, /orrection|DUneCorrection|faireLaBoucle/);
  assert.match(planifier, /relancerLeBancDuMoisSiBesoin\(\)/);
  assert.deepEqual(avec(/\blancerLeBancDUneCorrection\s*\(/), ['api/controllers/corrections.controller.js', 'data/correction/bancDesCorrections.js']);
  assert.doesNotMatch(lire('data/correction/boucle.js'), /lancerLeBanc|jugerAPart|tacheDuBanc|fork\(/);
  assert.match(lire('api/routes/corrections.routes.js'), /router\.post\('\/:id\/banc', asyncHandler\(postBanc\)\);/);
});

test('B31 — Santé du moteur et la route ne trient JAMAIS : etatDesCorrections.js ne lit que les tables, le registre des versions et celui de la mesure (aucun tri, aucun juge, aucun calcul en rendant la main) ; Santé du moteur la lit pour son bloc', () => {
  const etat = lire('data/correction/etatDesCorrections.js');
  assert.doesNotMatch(etat, /\b(trierLeMois|sommesDuMois|jugerLesCases|jugeParLesMatchs|moisATrier|executerSansPause|executerEnRendantLaMain|faireLaBoucle|lancerLeBancDUneCorrection|comparer)\b/);
  assert.doesNotMatch(etat, /\.run\(|INSERT|UPDATE|DELETE|writeJsonAtomic/);
  assert.doesNotMatch(etat, /from '\.\/tri\.js'/);
  const sante = lire('data/santeDuMoteur.js');
  assert.match(sante, /corrections: \(\{ maintenant \}\) => etatDesCorrections\(\{ database: openDb\(\), maintenant \}\)/);
  assert.doesNotMatch(sante, /trierLeMois|faireLaBoucle|moisATrier/);
  const controleur = lire('api/controllers/corrections.controller.js');
  assert.deepEqual([...controleur.matchAll(/^import .* from '(.*)';$/gm)].map((m) => m[1]).sort(), ['../../data/calibration.js', '../../data/correction/bancDesCorrections.js', '../../data/correction/boucle.js', '../../data/correction/depotCorrections.js', '../../data/correction/etatDesCorrections.js', '../middlewares/errorHandler.js'].sort());
  assert.doesNotMatch(controleur, /trierLeMois|faireLaBoucle|\.run\(|INSERT|UPDATE|DELETE/);
});

test('l’étape « boucleCorrection » de la passe : juste après la carte « où parier », juste avant la sauvegarde (la copie de la nuit contient le tri et le journal) ; l’ordre du gel, de la candidate à blanc, de la calibration et de la carte ne bouge pas ; une seule fois ; son alerte durable', () => {
  const cles = REFRESH_STEPS.map((e) => e.key);
  assert.equal(cles.filter((k) => k === 'boucleCorrection').length, 1);
  assert.equal(cles.indexOf('boucleCorrection'), cles.indexOf('carteOuParier') + 1);
  assert.equal(cles.indexOf('sauvegarde'), cles.indexOf('boucleCorrection') + 1);
  assert.deepEqual(cles.slice(cles.indexOf('gelPronostics'), cles.indexOf('sauvegarde') + 1), ['gelPronostics', 'moteurABlanc', 'calibrationMensuelle', 'carteOuParier', 'boucleCorrection', 'sauvegarde']);
  const job = fs.readFileSync(path.join(SRC, 'jobs', 'matchStatsAutoRefresh.js'), 'utf8');
  assert.match(job, /key: 'boucleCorrection',\n {4}label: 'Boucle de correction : tri du mois \(malchance ou vrai défaut\), propositions, essai à blanc des corrections acceptées',\n(?: {4}\/\/.*\n)*? {4}due: \(ctx\) => dueBoucleCorrection\(ctx\),\n {4}pourquoiPasDue: \(\) => pourquoiPasDueLaBoucle\(\),\n {4}run: \(ctx\) => passeBoucleCorrection\(ctx\)\n/);
  assert.match(job, /alert: \{ key: CLE_ALERTE_BOUCLE, value: alerte \}/);
  assert.match(job, /const CLE_ALERTE_BOUCLE = 'boucleCorrection';/);
});

test('les routes /api/corrections : branchées une fois ; trois lectures, cinq écritures ; aucune route n’écrit engine-config.json, engine-versions.json ni le registre de la mesure', () => {
  const index = lire('api/routes/index.js');
  assert.equal((index.match(/correctionsRoutes/g) ?? []).length, 2, 'importée et branchée, une fois');
  assert.match(index, /router\.use\('\/corrections', correctionsRoutes\);/);
  const routes = lire('api/routes/corrections.routes.js');
  assert.deepEqual([...routes.matchAll(/router\.(get|post)\('([^']+)'/g)].map((m) => `${m[1]} ${m[2]}`), ['get /', 'get /tri', 'get /journal', 'post /proposer', 'post /:id/banc', 'post /:id/accepter', 'post /:id/refuser', 'post /:id/retirer']);
  const controleur = lire('api/controllers/corrections.controller.js');
  assert.doesNotMatch(controleur, /engine-config|writeJsonAtomic|proposerUneCandidate|adopterLaCandidate|revenirALaVersionPrecedente|declarerVariante/);
});

test('aucun test n’appelle un écrivain de la boucle de correction dans son processus : les écritures passent par des copies isolées (scripts de test/aides)', () => {
  const ecrivains = ['faireLaBoucle', 'passeBoucleCorrection', 'mettreALEssaiLaSuivante', 'libererLaPlace', 'declarerAvantLeBanc', 'synchroniserAvecLesVersions', 'lancerLeBancDUneCorrection', 'proposerUneCorrection', 'accepterUneCorrection', 'refuserUneCorrection', 'creerUneProposition', 'changerLEtat', 'ecrireLeTri', 'ajouterAuJournal'];
  for (const nom of fs.readdirSync(ICI).filter((f) => f.endsWith('.test.mjs'))) {
    const source = fs.readFileSync(path.join(ICI, nom), 'utf8').replace(/const ecrivains = \[[^\]]*\];/, '');
    for (const f of ecrivains) assert.doesNotMatch(source, new RegExp(`\\b${f}\\s*\\(`), `${nom} appelle ${f} dans le processus des tests`);
  }
});
