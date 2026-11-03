/**
 * LES CARTONS (étape 33, lot 1a, 02/11/2026) — la frontière : rien du moteur ne bouge.
 *   node --test test/cartonsFrontiere.test.mjs        (depuis server/)
 *
 * T-X1 l'empreinte du moteur (16f2459…) et celle de la candidate de l'étape 27 (f01dd8496f56a415) ; aucun fichier de
 *      l'étape 33 sous core/ ni sports/ (quelle qu'en soit l'extension), aucun dans l'empreinte ; les fichiers interdits
 *      (§6.1 de la conception : le chemin de nuit de l'essai 27, les 6 data/… de l'empreinte, runner, entrees, periodes,
 *      matchSources, goalModel, statMarkets, markets, refereeRead.js et tout data/contexte/, leagueBenchmarks, dayTable,
 *      le règlement, saisiesCotes, forcesButs) identiques À L'OCTET à ceux relevés en partie 0 (02/11/2026, 17 h 51) ;
 * T-X2 aucun fichier du moteur n'atteint, même de loin, data/cartons/ ; matchStatsDb.js et lancements.js (atteints par
 *      le moteur et par le chemin de l'essai 27) n'importent rien de data/cartons/ ;
 * T-X3 les modules purs : ni horloge, ni hasard, ni base, ni réseau, ni fichier ; reglagesCartons.js n'importe rien ;
 *      formulesDesCartons.js n'importe QUE statMarkets.js (le lot 2 le mettra dans l'empreinte) ;
 * T-X4 les lecteurs (cache, flux, passe, comptes, formules) n'écrivent rien ;
 * T-X5 la déclaration de l'étape 33 AVANT le regard : portée « cartons-corners » À LA FIN de PORTEES ; vues
 *      `pour: ['cartons-corners']` seulement, jamais après le 23/09/2026 ; les 8 variantes (la retenue en tête, les deux
 *      placebos) ; le lancement daté au premier démarrage ; fenetresVues('27') et compterVariantes('27') = 320 INCHANGÉS ;
 * T-X6 aucun marché de cartons au lot 1 : MARCHES_CONNUS sans totalCards ni teamCards, aucun dans les pronostics figés du
 *      moteur, FAMILLES de MarketPicksBoard.vue inchangé, saisiesCotes.js garde « sansMoteur: SANS_CARTONS » ;
 * T-X7 (le jugement provisoire de l'essai 27 à l'octet) : c'est le T-X7 de contexteFrontiere.test.mjs, gardé vert —
 *      il rejoue l'essai sur une copie avec le registre de ce code, lancement de l'étape 33 compris ;
 * T-X8 openDb sur une copie de forme réelle (la base d'essai) crée les 4 tables des cartons, aucun index ; indexAttendus()
 *      complet ; une seconde ouverture ne change rien ; chaque entrée du DDL commence par son ordre ;
 * T-X9 rien de data/cartons/ n'écrit engine-config.json ; la décision de Pierre (convention C, 02/11/2026) est gelée et
 *      aucun fichier du moteur ne la lit.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { preparerCopie, executer, SERVEUR, FIXTURES, RACINE_ESSAIS } from './aides/isolement.mjs';
import { fichiersDuMoteur, empreinteDuCode, empreinteDeLaCandidate, CANDIDATE_EN_ESSAI, MODULES_DU_MOTEUR } from '../src/core/engine/engineVersions.js';
import * as LANC from '../src/bench/lancements.js';
import { enregistrerLancements, fenetresVues, compterVariantes, lancementDe } from '../src/bench/trialsRegistry.js';
import { MARCHES_CONNUS } from '../src/sports/football/markets.js';
import { DECISION_DE_PIERRE, PERIODES_DU_BANC, PAR_CHAMPIONNAT } from '../src/data/cartons/reglagesCartons.js';

const SRC = path.join(SERVEUR, 'src');
const UI = path.join(SERVEUR, '..', 'ui', 'src');
const CARTONS = path.join(SRC, 'data', 'cartons');
const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex');
const sansCommentaires = (f) => fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const FICHIERS_33 = fs.readdirSync(CARTONS).map((f) => `data/cartons/${f}`);

/** Les fichiers interdits au lot 1 et leur sha1 (octets bruts) relevés en partie 0 (SCR33\partie0\gel-depart.json, = dépôt). */
const INTERDITS = Object.freeze([
  ['data/enregistreurs/gelPronostics.js', '611e99c209a5e211a9425c5d2fb1aac09304e029'],
  ['data/enregistreurs/depot.js', 'd88d29902815b0ad57e861e7816582891e41b25b'],
  ['data/enregistreurs/moteurABlanc.js', 'dcae55b108636346925aec4db5559d8938edb0e5'],
  ['bench/essaiCandidate.js', 'e493518bb9c57be53deeeaf77cac18e21ea6865a'],
  ['core/engine/engineVersions.js', '5765ef8ea759a5413397e6b44aafb6c496fc674b'],
  ['core/engine/engineConfig.js', '87b6ac0fd2ebafa432c2adeb3beac591177a3dfa'],
  ['data/providers/matchEnrichment.js', '22c9be3d901c23c3313e008f48377a1fcf2b369d'],
  ['data/db/statInputsRead.js', '45470ac1777308c673eea1d2a127b956aeac1240'],
  ['data/db/scoreFormRead.js', '46e2c8b26c722becce3192e7fa157ce4738ec21c'],
  ['data/db/matchStatsRead.js', '7dc674629218dc5434ec97e421de3467ba440a0b'],
  ['data/providers/standingsService.js', '5ff06688e36c3035f713138906e6dfababe96930'],
  ['data/db/entreesButs.js', '85ef724fc5749bc95baaa67931df5edcec77e046'],
  ['bench/runner.js', '5e8711c9298b63d2682d61936fe185a308136fef'],
  ['bench/entrees.js', '38fdc199677e61691bc5c56c4fa63f88cd489a93'],
  ['bench/periodes.js', 'd8b5264a88fd7ef241fb16bd209f3928c53ac628'],
  ['data/matchSources.js', 'dc005be4ea560c8e7b168954c3aaa6b548a4e8fa'],
  ['core/engine/goalModel.js', '236a33d7f952b12d4596b02ecb7c6090afca137d'],
  ['sports/football/statMarkets.js', '86fe12b131b4315e9f9020659c93f2ed7461222d'],
  ['sports/football/markets.js', 'c1296b56003be5cb170525d69047ea6745679424'],
  ['data/db/refereeRead.js', '0eb2c468dd9ea492a1e9b3a0de9ce14460f2d22f'],
  ['data/db/leagueBenchmarks.js', '1c5c192ce3ba261f884c37541dd46b14736746c7'],
  ['data/db/dayTable.js', 'afc8d42ccc9028531da8d9efc2700ece449d6a97'],
  // Retouché le 02/11/2026 par le correctif du règlement des vrais paris (pas par l'étape 33) : son sha1 après ce correctif.
  ['data/providers/settlementService.js', 'ee5ed0786f48fb36558184356f26c0a8e95c5436'],
  ['core/settlement/settlementRules.js', '67eac67e465e395b87e71aaa6d7228f0e57b6011'],
  ['data/saisiesCotes.js', '1449bbbdc1fd5f08d94af42dc17a82fc728512b4'],
  ['data/db/forcesButs.js', '4ecda40200d8da352bc8c51adefb1152de4af916'],
  ['data/db/forcesButsEnfant.js', '535aadac696d1b3946c979691a6434f99a115b80'],
  ['data/contexte/bancDuContexte.js', 'beaee6f2ae7064b46fb599e9a588e398e3fce229'],
  ['data/contexte/contexteAuJourJ.js', 'f186e369ff35802dfce11ed33a475b16d610f351'],
  ['data/contexte/contexteBancEnfant.js', '2e81fe97eb163c65f41d2bb75a4aa2851c4c7425'],
  ['data/contexte/contexteEnfant.js', 'c06b6fdfbf5245f14b36a50178143dc5f0206a8c'],
  ['data/contexte/contexteNuit.js', '4737fcae70624a0de88bbe938b321f4bb84e21be'],
  ['data/contexte/contexteRead.js', '50033e8be8df5cec4e9c4ec04a22f71ea53753d6'],
  ['data/contexte/controleDuContexte.js', 'a0a4cc650d5d07f5e5626e67820b0a51d67da4e7'],
  ['data/contexte/formulesDuContexte.js', '537f52a0baef43b4fcb90048ea6d87f5cab105e9'],
  ['data/contexte/lectureDuMagasin.js', '544470fd88e2227265e51f6c6f2109ddcf71b7fa'],
  ['data/contexte/listeDuCalendrier.js', '6f2c22b2625dcbbb2e13adc060e4899e3e123627'],
  ['data/contexte/noteDuContexte.js', '558904a1745b6b8f2d0d156082fe28a8ada4eb50'],
  ['data/contexte/preuveDuContexte.js', '69aa3bb32585d33825210f1efea5444185ea500a'],
  ['data/contexte/reglagesContexte.js', '066ad471fcdcf2be1f36c1aa18b3acbcdfc93262']
]);

/** Les fichiers atteints par les imports relatifs (statiques et dynamiques) d'un ensemble de départ. */
function atteints(depart) {
  const vus = new Set();
  const pile = [...depart];
  while (pile.length) {
    const f = pile.pop();
    if (vus.has(f) || !fs.existsSync(f)) continue;
    vus.add(f);
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/(?:from\s+|import\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) pile.push(path.resolve(path.dirname(f), m[1]));
  }
  return vus;
}
const tousLesFichiers = (dossier) => (fs.existsSync(dossier) ? fs.readdirSync(dossier, { recursive: true }).map(String).filter((f) => fs.statSync(path.join(dossier, f)).isFile()) : []);

test('T-X1 l’empreinte du moteur et celle de la candidate ne bougent pas ; aucun fichier de l’étape 33 sous core/ ni sports/ ni dans l’empreinte ; les fichiers interdits identiques à l’octet à ceux de la partie 0', () => {
  assert.equal(empreinteDuCode({ rafraichir: true }).empreinte, '16f2459db183a99576365047da98b7777687ef05');
  assert.equal(empreinteDeLaCandidate(CANDIDATE_EN_ESSAI), 'f01dd8496f56a415');
  assert.ok(FICHIERS_33.length >= 5, FICHIERS_33.join(', '));
  for (const racine of ['core', 'sports']) {
    for (const f of tousLesFichiers(path.join(SRC, racine))) {
      assert.doesNotMatch(f, /carton|cards?\b|cardMarket/i, `${racine}/${f} : un fichier de l’étape 33 sous ${racine}/`);
      assert.doesNotMatch(fs.readFileSync(path.join(SRC, racine, f), 'utf8').slice(0, 4000), /[ée]tape 33/i, `${racine}/${f} parle de l’étape 33`);
    }
  }
  const empreinte = fichiersDuMoteur();
  for (const f of FICHIERS_33) assert.ok(!empreinte.includes(f), `${f} dans l’empreinte`);
  assert.ok(!MODULES_DU_MOTEUR.fichiers.some((f) => /carton/i.test(f)));
  for (const [f, attendu] of INTERDITS) assert.equal(sha1(fs.readFileSync(path.join(SRC, f))), attendu, `${f} : retouché (interdit au lot 1 de l’étape 33)`);
  const contexte = fs.readdirSync(path.join(SRC, 'data', 'contexte')).map((f) => `data/contexte/${f}`).sort();
  assert.deepEqual(contexte, INTERDITS.map(([f]) => f).filter((f) => f.startsWith('data/contexte/')).sort(), 'aucun fichier ajouté ni retiré sous data/contexte/');
});

test('T-X2 aucun fichier du moteur n’atteint, même de loin, data/cartons/ ; matchStatsDb.js et lancements.js n’importent rien de data/cartons/', () => {
  const duMoteur = fichiersDuMoteur().map((rel) => path.join(SRC, rel));
  assert.ok(duMoteur.length > 20);
  const graphe = [...atteints(duMoteur)].map((f) => path.relative(SRC, f).split(path.sep).join('/'));
  for (const f of FICHIERS_33) assert.ok(!graphe.includes(f), `${f} atteint depuis le moteur`);
  assert.ok(graphe.includes('data/db/matchStatsDb.js'));
  for (const f of ['data/db/matchStatsDb.js', 'bench/lancements.js']) assert.doesNotMatch(fs.readFileSync(path.join(SRC, f), 'utf8'), /from ['"][./]*(data\/)?cartons\//, f);
  // Le chemin de nuit de l'essai 27 non plus.
  const essai = [...atteints(['data/enregistreurs/moteurABlanc.js', 'data/enregistreurs/gelPronostics.js', 'bench/essaiCandidate.js'].map((f) => path.join(SRC, f)))].map((f) => path.relative(SRC, f).split(path.sep).join('/'));
  for (const f of FICHIERS_33) assert.ok(!essai.includes(f), `${f} atteint depuis le chemin de l’essai 27`);
});

test('T-X3 les modules purs : ni horloge, ni hasard, ni base, ni réseau, ni fichier ; reglagesCartons.js n’importe rien ; formulesDesCartons.js n’importe que statMarkets.js', () => {
  const purs = ['reglagesCartons.js', 'formulesDesCartons.js', 'cartonsAuJourJ.js', 'comptesDesCartons.js'].map((f) => path.join(CARTONS, f));
  if (fs.existsSync(path.join(CARTONS, 'bancDesCartons.js'))) purs.push(path.join(CARTONS, 'bancDesCartons.js'));
  for (const f of purs) {
    const code = sansCommentaires(f);
    assert.doesNotMatch(code, /Date\.now\(|new Date\(\)|Math\.random|performance\.now|openDb|DatabaseSync|fetch\(|node:fs|from 'fs'|readFileSync|writeFileSync/, path.basename(f));
  }
  const imports = (f) => [...fs.readFileSync(f, 'utf8').matchAll(/^import .* from ['"]([^'"]+)['"];?$/gm)].map((m) => m[1]);
  assert.deepEqual(imports(path.join(CARTONS, 'reglagesCartons.js')), []);
  assert.deepEqual(imports(path.join(CARTONS, 'formulesDesCartons.js')), ['../../sports/football/statMarkets.js'], 'les formules : la loi du moteur seulement (critique de la 32, constat 22)');
  for (const f of ['lectureDesCartons.js']) assert.doesNotMatch(sansCommentaires(path.join(CARTONS, f)), /Date\.now\(|new Date\(\)|Math\.random|fetch\(/, f);
  // Le plancher et le seuil de la variance entre championnats : égaux à ceux du code qu'ils recopient.
  assert.match(fs.readFileSync(path.join(SRC, 'data', 'db', 'leagueBenchmarks.js'), 'utf8'), new RegExp(`const MINIMUM_DISPERSION = ${PAR_CHAMPIONNAT.minTau2};`), 'minTau2 = MINIMUM_DISPERSION de leagueBenchmarks.js (critique, constat 15)');
});

test('T-X4 les lecteurs (cache, flux, passe, comptes, formules, banc) n’écrivent rien ; le processus à part ouvre la base EN LECTURE SEULE, sans horloge', () => {
  for (const f of ['lectureDesCartons.js', 'cartonsAuJourJ.js', 'comptesDesCartons.js', 'formulesDesCartons.js', 'reglagesCartons.js', 'bancDesCartons.js', 'cartonsEnfant.js', 'noteDesCartons.js']) {
    if (!fs.existsSync(path.join(CARTONS, f))) continue;
    const code = sansCommentaires(path.join(CARTONS, f));
    assert.doesNotMatch(code, /\.run\(|INSERT\s|UPDATE\s|DELETE\s|writeJsonAtomic|writeFileSync|\.exec\(/, `${f} : aucune écriture`);
  }
  // Partie B : l'enfant (un seul fichier, à modes) ouvre la base en lecture seule et ne lit pas l'horloge (des durées seulement).
  const enfant = sansCommentaires(path.join(CARTONS, 'cartonsEnfant.js'));
  assert.equal((enfant.match(/openDb\(/g) ?? []).length, 1);
  assert.match(enfant, /openDb\(\{ file: m\.chemin, readonly: true \}\)/);
  assert.doesNotMatch(enfant, /Date\.now\(|new Date\(\)|Math\.random|fetch\(/, 'l’enfant : aucune horloge du jour');
});

fs.mkdirSync(RACINE_ESSAIS, { recursive: true });
const DOSSIER = fs.mkdtempSync(path.join(RACINE_ESSAIS, 'cm-cartons-registre-'));
after(() => fs.rmSync(DOSSIER, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));

test('T-X5 la déclaration de l’étape 33 AVANT le regard : portée à la fin de PORTEES ; vues `pour: [\'cartons-corners\']` seulement ; les 8 variantes ; le lancement daté au premier démarrage ; fenetresVues(\'27\') et compterVariantes(\'27\') = 320 inchangés', () => {
  assert.equal(LANC.verifierLancements(), true);
  // Étape 34 (03/11/2026) : « paris-joueurs » ajoutée APRÈS « cartons-corners » (joueursFrontiere T-X5).
  assert.deepEqual([...LANC.PORTEES], ['tout', 'moteur', 'statistiques', 'marche', 'indice', 'joueurs', 'style', 'simulation', 'contexte', 'cartons-corners', 'paris-joueurs']);
  assert.equal(LANC.VUES_DE_L_ETAPE_33.length, 2);
  for (const v of LANC.VUES_DE_L_ETAPE_33) {
    assert.deepEqual([...v.pour], ['cartons-corners'], `${v.de} → ${v.a}`);
    assert.ok(v.a <= '2026-09-23', 'jamais P5 : la preuve après lancement');
  }
  assert.match(LANC.VUES_DE_L_ETAPE_33[1].quoi, /la conception et la critique y ont lu/);
  const ids = LANC.VARIANTES_DE_L_ETAPE_33.map((v) => v.id);
  assert.deepEqual(ids, ['cartons-corners-v1', 'cartons-equipes', 'cartons-arbitre', 'cartons-placebo', 'corners-championnat', 'tirs-championnat', 'cadres-championnat', 'championnat-placebo']);
  const l33 = LANC.LANCEMENTS.find((l) => l.etape === '33');
  assert.deepEqual([l33.version, l33.le], ['cartons-corners-v1', null]);
  assert.equal(l33.variantes, LANC.VARIANTES_DE_L_ETAPE_33);
  assert.equal(l33.vues, LANC.VUES_DE_L_ETAPE_33);
  // Étape 34 (03/11/2026) : le lancement 33 n'est plus suivi que du lancement 34.
  assert.deepEqual(LANC.LANCEMENTS.slice(LANC.LANCEMENTS.indexOf(l33)).map((l) => l.etape), ['33', '34'], 'le lancement 33 ajouté à la fin, puis le seul lancement 34');
  for (const portee of LANC.PORTEES.filter((p) => !['tout', 'cartons-corners'].includes(p))) assert.ok(!LANC.fenetresDeclarees({ portee }).some((f) => f.etape === '33'), portee);
  assert.ok(LANC.fenetresDeclarees({ portee: 'cartons-corners' }).some((f) => f.etape === '33'));
  // Le premier démarrage date le lancement ; les fenêtres et le compte de l'étape 27 n'en voient rien.
  const fichier = path.join(DOSSIER, 'registre-t-x5.json');
  const sans33 = { fichier, lancements: LANC.LANCEMENTS.filter((l) => l.etape !== '33') };
  const avant = { f27: JSON.stringify(fenetresVues('27', { fichier })), k27: compterVariantes('27', { fichier }), f27sans: JSON.stringify(fenetresVues('27', sans33)) };
  assert.equal(avant.f27, avant.f27sans, 'le lancement 33 du code ne change pas les fenêtres de 27');
  assert.equal(lancementDe('33', { fichier }), null, 'pas encore lancée');
  const r = enregistrerLancements({ fichier, maintenant: Date.parse('2026-11-02T23:30:00Z') });
  assert.ok(r.nouveaux.some((x) => x.etape === '33' && x.version === 'cartons-corners-v1' && x.le === '2026-11-03'), JSON.stringify(r.nouveaux));
  assert.equal(JSON.stringify(fenetresVues('27', { fichier })), avant.f27);
  assert.equal(compterVariantes('27', { fichier }), avant.k27, 'le compte de l’essai 27 inchangé (ses 320 variantes : T-X7 de contexteFrontiere.test.mjs, sur le registre complet)');
  assert.equal(compterVariantes('33', { fichier }), 8);
  assert.ok(LANC.ETAPES_A_JUGER.includes('33'));
  assert.equal(PERIODES_DU_BANC.plis.length, 2);
  assert.equal(PERIODES_DU_BANC.dernierJourLu, '2026-09-23');
});

test('T-X6 aucun marché de cartons au lot 1 : ni dans le moteur, ni dans ses pronostics figés, ni dans MarketPicksBoard ; la saisie garde « sans value »', () => {
  assert.ok(!MARCHES_CONNUS.includes('totalCards'));
  assert.ok(!MARCHES_CONNUS.includes('teamCards'));
  for (const f of ['moteur-complet-figes.json', 'pronostics-figes.json']) assert.doesNotMatch(fs.readFileSync(path.join(FIXTURES, f), 'utf8'), /"marketId":\s*"(totalCards|teamCards)"/, f);
  const board = fs.readFileSync(path.join(UI, 'components', 'analysis', 'MarketPicksBoard.vue'), 'utf8');
  const familles = /const FAMILLES = \[([\s\S]*?)\];/.exec(board)[1];
  assert.deepEqual([...familles.matchAll(/cle: '(\w+)'/g)].map((m) => m[1]), ['buts', 'corners', 'tirs', 'cadres']);
  assert.doesNotMatch(familles, /Cartons|cards/i);
  const saisies = fs.readFileSync(path.join(SRC, 'data', 'saisiesCotes.js'), 'utf8');
  assert.match(saisies, /marche\('totalCards', 'Total cartons', 'cards', \{ unite: 'cartons', sansMoteur: SANS_CARTONS \}\)/);
  assert.match(saisies, /marche\('teamCards', [^\n]*sansMoteur: SANS_CARTONS \}\)/);
});

test('T-X8 openDb sur une copie de forme réelle crée les 4 tables des cartons, aucun index ; indexAttendus() complet ; une seconde ouverture ne change rien ; chaque entrée du DDL commence par son ordre', () => {
  const copie = preparerCopie({});
  let s;
  try {
    const r = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-cartons.mjs'), { args: ['ddl', '{}'] });
    assert.equal(r.code, 0, r.erreurs.slice(-3000));
    s = r.json;
  } finally {
    copie.nettoyer();
  }
  assert.ok(s.rencontres > 1000, 'une base de forme réelle');
  assert.deepEqual(s.premiere.filter((x) => x.type === 'table').map((x) => x.name), ['cartons_arbitres', 'cartons_equipes', 'cartons_etat', 'cartons_rencontres']);
  assert.deepEqual(s.indexDesCartons, [], 'aucun index (un DDL bon marché sur la vraie base)');
  assert.deepEqual(s.tousLesIndexAttendus, [], 'tous les index attendus sont en base');
  assert.equal(s.secondeOuvertureIdentique, true);
  assert.equal(s.entrees.length, 4);
  for (const e of s.entrees) assert.match(e, /^CREATE TABLE IF NOT EXISTS cartons_/, e);
  assert.match(s.premiere.find((x) => x.name === 'cartons_rencontres').sql, /WITHOUT ROWID/);
  const { COLONNES_RENCONTRES } = { COLONNES_RENCONTRES: s.colonnesRencontres };
  assert.equal(COLONNES_RENCONTRES[0], 'match_key');
  assert.ok(!COLONNES_RENCONTRES.some((c) => /multiplicateur/.test(c)));
});

test('T-X9 rien de data/cartons/ n’écrit engine-config.json ; la décision de Pierre est gelée (convention C, 02/11/2026) et aucun fichier du moteur ne la lit', () => {
  for (const f of FICHIERS_33) assert.doesNotMatch(sansCommentaires(path.join(SRC, f)), /engine-config|ecrireReglages|saveEngineConfig|writeEngineConfig/, f);
  assert.ok(Object.isFrozen(DECISION_DE_PIERRE) && Object.isFrozen(DECISION_DE_PIERRE.convention));
  assert.deepEqual([DECISION_DE_PIERRE.convention.valeur, DECISION_DE_PIERRE.convention.date, DECISION_DE_PIERRE.lignesABlanc], ['C', '2026-11-02', null]);
  for (const f of fichiersDuMoteur()) assert.doesNotMatch(fs.readFileSync(path.join(SRC, f), 'utf8'), /DECISION_DE_PIERRE|reglagesCartons|data\/cartons/, f);
});
