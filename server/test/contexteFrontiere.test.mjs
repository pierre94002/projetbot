/**
 * LE CONTEXTE DU MATCH (étape 32, lot 1a, 29/10/2026) — la frontière : rien du moteur ne bouge.
 *   node --test test/contexteFrontiere.test.mjs        (depuis server/)
 *
 * T-X1 l'empreinte du moteur (16f2459…) et celle de la candidate de l'étape 27 (f01dd8496f56a415) ; aucun fichier de
 *      l'étape 32 sous core/ ni sports/ (quelle qu'en soit l'extension), aucun dans l'empreinte ;
 * T-X2 aucun fichier du moteur n'atteint (même de loin) data/contexte/ ni refereeRead.js ;
 * T-X3 les modules purs n'ont ni horloge, ni hasard, ni base, ni réseau, ni fichier ; les formules n'importent que les
 *      constantes (le lot 2 les mettra dans l'empreinte) ;
 * T-X4 le processus à part ouvre la base EN LECTURE SEULE ; les lecteurs n'écrivent rien ;
 * T-X5 la portée « contexte » (à la fin de PORTEES), les vues de l'étape 32 déclarées `pour: ['contexte']` seulement, ses
 *      variantes déclarées AVANT le regard, son lancement ; fenetresVues('27') et compterVariantes('27') INCHANGÉS ;
 * T-X6 rien n'écrit engine-config.json ; la décision de Pierre vaut null et aucun fichier du moteur ne la lit ;
 * T-X7 LE JUGEMENT PROVISOIRE DE L'ESSAI DE L'ÉTAPE 27 (moteurABlanc, essai fabriqué à graine fixe, copie isolée)
 *      IDENTIQUE À L'OCTET à celui du code d'AVANT l'étape 32 (fixtures/essai27-avant-etape32.json, figé le 29/10/2026 sur
 *      le code du bac avant toute retouche, = celui du code du dépôt) — critique, constat 2 : matchStatsDb.js et
 *      lancements.js sont lus par ce chemin ;
 * T-X8 openDb sur une copie de forme réelle (la base d'essai) crée les tables et les index du contexte, indexAttendus()
 *      complet, une seconde ouverture ne change rien ; chaque entrée du DDL commence par son ordre (aucun commentaire devant) ;
 * Q10  les textes EXACTS des poids dans Réglages (critique, constat 12).
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
import { DECISION_DE_PIERRE, PERIODES_DU_BANC, JUGE_DU_BANC, AMPLEUR, COUPES_CONTINENTALES } from '../src/data/contexte/reglagesContexte.js';
import { FOTMOB_LEAGUES } from '../src/data/providers/fotMobProvider.js';

const SRC = path.join(SERVEUR, 'src');
const UI = path.join(SERVEUR, '..', 'ui', 'src');
const sha1 = (t) => crypto.createHash('sha1').update(t).digest('hex');
const sansCommentaires = (f) => fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const FICHIERS_32 = [...fs.readdirSync(path.join(SRC, 'data', 'contexte')).map((f) => `data/contexte/${f}`), 'data/db/refereeRead.js'];

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

test('T-X1 l’empreinte du moteur et celle de la candidate de l’étape 27 ne bougent pas ; aucun fichier de l’étape 32 sous core/ ni sports/, quelle qu’en soit l’extension ; aucun dans l’empreinte', () => {
  assert.equal(empreinteDuCode({ rafraichir: true }).empreinte, '16f2459db183a99576365047da98b7777687ef05');
  assert.equal(empreinteDeLaCandidate(CANDIDATE_EN_ESSAI), 'f01dd8496f56a415');
  assert.ok(FICHIERS_32.length >= 8, FICHIERS_32.join(', '));
  for (const racine of ['core', 'sports']) {
    for (const f of tousLesFichiers(path.join(SRC, racine))) {
      assert.doesNotMatch(f, /contexte|arbitre|referee/i, `${racine}/${f} : un fichier de l’étape 32 sous ${racine}/`);
      assert.doesNotMatch(fs.readFileSync(path.join(SRC, racine, f), 'utf8').slice(0, 4000), /[ée]tape 32/i, `${racine}/${f} parle de l’étape 32`);
    }
  }
  const empreinte = fichiersDuMoteur();
  for (const f of FICHIERS_32) assert.ok(!empreinte.includes(f), `${f} dans l’empreinte`);
  assert.ok(!MODULES_DU_MOTEUR.fichiers.some((f) => /contexte|referee/i.test(f)));
});

test('T-X2 aucun fichier du moteur n’atteint, même de loin, data/contexte/ ni data/db/refereeRead.js', () => {
  const duMoteur = fichiersDuMoteur().map((rel) => path.join(SRC, rel));
  assert.ok(duMoteur.length > 20);
  const graphe = [...atteints(duMoteur)].map((f) => path.relative(SRC, f).split(path.sep).join('/'));
  for (const f of FICHIERS_32) assert.ok(!graphe.includes(f), `${f} atteint depuis le moteur`);
  // matchStatsDb.js est atteint par le moteur : il n'importe rien de data/contexte/ (la règle de l'archive d'avant-match y vit en entier).
  assert.ok(graphe.includes('data/db/matchStatsDb.js'));
  assert.doesNotMatch(fs.readFileSync(path.join(SRC, 'data', 'db', 'matchStatsDb.js'), 'utf8'), /from ['"]\.\.\/contexte\//);
});

test('T-X3 les modules purs : ni horloge, ni hasard, ni base, ni réseau, ni fichier ; les formules n’importent QUE les constantes ; le processus à part ne lit pas l’horloge', () => {
  const purs = ['reglagesContexte.js', 'formulesDuContexte.js', 'contexteAuJourJ.js'].map((f) => path.join(SRC, 'data', 'contexte', f));
  purs.push(path.join(SRC, 'data', 'db', 'refereeRead.js'));
  for (const f of purs) {
    const code = sansCommentaires(f);
    assert.doesNotMatch(code, /Date\.now\(|new Date\(\)|Math\.random|performance\.now|openDb|DatabaseSync|fetch\(|node:fs|from 'fs'|readFileSync|writeFileSync/, path.basename(f));
  }
  const imports = (f) => [...fs.readFileSync(f, 'utf8').matchAll(/^import .* from ['"]([^'"]+)['"];?$/gm)].map((m) => m[1]);
  assert.deepEqual(imports(path.join(SRC, 'data', 'contexte', 'reglagesContexte.js')), []);
  assert.deepEqual(imports(path.join(SRC, 'data', 'contexte', 'formulesDuContexte.js')), ['./reglagesContexte.js'], 'les formules : les constantes seulement (constat 22)');
  assert.deepEqual(imports(path.join(SRC, 'data', 'db', 'refereeRead.js')).sort(), ['../contexte/formulesDuContexte.js', '../contexte/reglagesContexte.js']);
  const enfant = sansCommentaires(path.join(SRC, 'data', 'contexte', 'contexteEnfant.js'));
  assert.doesNotMatch(enfant, /Date\.now\(|new Date\(\)|Math\.random|fetch\(/, 'l’enfant : l’instant de la passe est reçu, jamais lu');
  for (const f of ['contexteNuit.js', 'lectureDuMagasin.js', 'controleDuContexte.js']) assert.doesNotMatch(sansCommentaires(path.join(SRC, 'data', 'contexte', f)), /Date\.now\(|new Date\(\)|Math\.random|fetch\(/, f);
});

test('T-X4 le processus à part ouvre la base EN LECTURE SEULE et n’écrit rien ; les lecteurs (cache, flux, contrôle) n’écrivent rien ; le serveur seul range', () => {
  const enfant = sansCommentaires(path.join(SRC, 'data', 'contexte', 'contexteEnfant.js'));
  assert.match(enfant, /openDb\(\{ file: m\.chemin, readonly: true \}\)/);
  for (const f of ['contexteEnfant.js', 'lectureDuMagasin.js', 'controleDuContexte.js', 'contexteAuJourJ.js']) {
    const code = sansCommentaires(path.join(SRC, 'data', 'contexte', f));
    assert.doesNotMatch(code, /\.run\(|INSERT\s|UPDATE\s|DELETE\s|writeJsonAtomic|writeFileSync|\.exec\(/, `${f} : aucune écriture`);
  }
  const nuit = sansCommentaires(path.join(SRC, 'data', 'contexte', 'contexteNuit.js'));
  assert.match(nuit, /commencerCalculLourd\(NOM_DU_CALCUL\)/, 'le jeton du calcul lourd est pris avant le processus à part');
  assert.match(nuit, /fork\(fichier, \['--enfant-contexte'\]/);
  assert.match(nuit, /'--max-old-space-size=512'/);
});

fs.mkdirSync(RACINE_ESSAIS, { recursive: true });
const DOSSIER = fs.mkdtempSync(path.join(RACINE_ESSAIS, 'cm-contexte-registre-'));
after(() => fs.rmSync(DOSSIER, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));

test('T-X5 la déclaration de l’étape 32 AVANT le regard : portée « contexte » à la fin de PORTEES ; vues `pour: [\'contexte\']` seulement ; les variantes (la retenue en tête, le faux facteur, sans repos-ecart ni arbitre-penalties) ; le lancement daté au premier démarrage ; fenetresVues(\'27\') et compterVariantes(\'27\') inchangés', () => {
  assert.equal(LANC.verifierLancements(), true);
  assert.deepEqual([...LANC.PORTEES], ['tout', 'moteur', 'statistiques', 'marche', 'indice', 'joueurs', 'style', 'simulation', 'contexte']);
  assert.ok(LANC.VUES_DE_L_ETAPE_32.length >= 1);
  for (const v of LANC.VUES_DE_L_ETAPE_32) assert.deepEqual([...v.pour], ['contexte'], `${v.de} → ${v.a}`);
  for (const v of LANC.VUES_DE_L_ETAPE_32) assert.ok(v.a <= '2026-09-23', 'jamais P5 : la preuve après lancement');
  const ids = LANC.VARIANTES_DE_L_ETAPE_32.map((v) => v.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids[0], 'contexte-v1');
  assert.deepEqual(ids, ['contexte-v1', 'repos-court', 'enchainement-serre', 'deplacement-distance', 'deplacement-altitude', 'pelouse-synthetique', 'arbitre-buts', 'entraineur-nouveau', 'placebo']);
  for (const retire of ['repos-ecart', 'arbitre-penalties', 'repos-classes']) assert.ok(!ids.includes(retire), retire);
  const l32 = LANC.LANCEMENTS.find((l) => l.etape === '32');
  assert.deepEqual([l32.version, l32.le], ['contexte-v1', null]);
  assert.equal(l32.variantes, LANC.VARIANTES_DE_L_ETAPE_32);
  assert.equal(l32.vues, LANC.VUES_DE_L_ETAPE_32);
  for (const portee of ['moteur', 'indice', 'joueurs', 'style', 'statistiques', 'marche', 'simulation']) assert.ok(!LANC.fenetresDeclarees({ portee }).some((f) => f.etape === '32'), portee);
  assert.ok(LANC.fenetresDeclarees({ portee: 'contexte' }).some((f) => f.etape === '32'));
  // Le premier démarrage date le lancement ; les fenêtres et le compte de l'étape 27 n'en voient rien.
  const fichier = path.join(DOSSIER, 'registre-t-x5.json');
  const sans32 = { fichier, lancements: LANC.LANCEMENTS.filter((l) => l.etape !== '32') };
  const avant = { f27: JSON.stringify(fenetresVues('27', { fichier })), k27: compterVariantes('27', { fichier }), f27sans: JSON.stringify(fenetresVues('27', sans32)) };
  assert.equal(avant.f27, avant.f27sans, 'le lancement 32 du code ne change pas les fenêtres de 27');
  assert.equal(lancementDe('32', { fichier }), null, 'pas encore lancée');
  const r = enregistrerLancements({ fichier, maintenant: Date.parse('2026-10-29T23:30:00Z') });
  assert.ok(r.nouveaux.some((x) => x.etape === '32' && x.version === 'contexte-v1' && x.le === '2026-10-30'), JSON.stringify(r.nouveaux));
  assert.equal(JSON.stringify(fenetresVues('27', { fichier })), avant.f27);
  assert.equal(compterVariantes('27', { fichier }), avant.k27);
  assert.equal(compterVariantes('32', { fichier }), LANC.VARIANTES_DE_L_ETAPE_32.length);
  assert.ok(LANC.ETAPES_A_JUGER.includes('32'));
  // Ce que le banc appliquera, fixé AVANT le regard (décisions du 29/10) : deux plis, la perte du score exact, l'ampleur sur les 13 marchés.
  assert.equal(PERIODES_DU_BANC.plis.length, 2);
  assert.deepEqual(PERIODES_DU_BANC.plis.map((p) => [p.apprendre.de, p.juger.de]), [['2023-07-01', '2025-07-01'], ['2025-07-01', '2023-07-01']]);
  assert.equal(PERIODES_DU_BANC.dernierJourLu, '2026-09-23');
  assert.equal(JUGE_DU_BANC.mesure, 'perte-log-score-exact');
  assert.deepEqual([AMPLEUR.seuil, AMPLEUR.sur], [0.005, 'plus-grand-des-13-marches']);
  for (const c of COUPES_CONTINENTALES) assert.ok(c in FOTMOB_LEAGUES, c);
});

test('T-X6 rien de l’étape 32 n’écrit engine-config.json ; la décision de Pierre vaut null et aucun fichier du moteur ne la lit', () => {
  for (const f of FICHIERS_32) assert.doesNotMatch(sansCommentaires(path.join(SRC, f)), /engine-config|ecrireReglages|saveEngineConfig|writeEngineConfig/, f);
  assert.equal(DECISION_DE_PIERRE.contexteDansLesChiffres, null);
  assert.ok(Object.isFrozen(DECISION_DE_PIERRE));
  for (const f of fichiersDuMoteur()) assert.doesNotMatch(fs.readFileSync(path.join(SRC, f), 'utf8'), /DECISION_DE_PIERRE|reglagesContexte/, f);
});

test('T-X7 le jugement PROVISOIRE de l’essai de l’étape 27 (moteurABlanc, essai fabriqué, copie isolée) est IDENTIQUE À L’OCTET à celui du code d’avant l’étape 32 — jugement, premiers chiffres rangés, fenêtres vues, registre — alors que le lancement de l’étape 32 est bien dans le registre que lit le juge', () => {
  const figee = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'essai27-avant-etape32.json'), 'utf8'));
  const copie = preparerCopie({});
  let s;
  try {
    const o = { ...figee.options, versions: path.join(copie.dossier, 'versions-essai.json'), mesure: path.join(copie.dossier, 'mesure-essai.json') };
    const r = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-contexte-essai27.mjs'), { args: ['essai27', JSON.stringify(o)], timeout: 600_000, env: { CLAUDE_CODE_BIN: path.join(copie.dossier, 'pas-de-claude-ici.exe'), MATCH_STATS_AUTO_REFRESH: 'false' } });
    assert.equal(r.code, 0, `${r.erreurs.slice(-3000)}\n${r.sortie.slice(-1500)}`);
    assert.equal(r.reseau, false);
    s = r.json;
  } finally {
    copie.nettoyer();
  }
  assert.equal(s.forcesAJour, true);
  assert.deepEqual(s.fabrication, figee.fabrication, 'le même essai fabriqué');
  assert.equal(s.erreur, null);
  assert.equal(s.bilanEssai.calcule, true);
  assert.equal(s.bilanEssai.principal, false, 'avant l’horizon : le jugement provisoire');
  assert.deepEqual(s.bilanEssai, figee.bilanEssai);
  assert.equal(sha1(s.provisoireTexte), figee.sha1.provisoire);
  assert.equal(s.provisoireTexte, figee.provisoireTexte, 'le jugement provisoire, à l’octet');
  assert.equal(s.premiersChiffresTexte, figee.premiersChiffresTexte, 'les premiers chiffres rangés, à l’octet');
  assert.equal(s.jugementRangeTexte, figee.jugementRangeTexte);
  assert.equal(s.fenetresVues27Texte, figee.fenetresVues27Texte, 'fenetresVues(\'27\'), à l’octet — le lancement 32 NOTÉ comme chez Pierre après son premier démarrage');
  // Le registre de la mesure d'essai : à l'octet, au lancement 32 près (noté au premier démarrage, avec sa date).
  const registre = JSON.parse(s.registreMesureTexte);
  assert.deepEqual(registre.etapes['32'].lancements.map((l) => [l.version, l.le, l.source]), [['contexte-v1', '2026-09-23', 'code']]);
  delete registre.etapes['32'];
  assert.equal(JSON.stringify(registre), JSON.stringify(JSON.parse(figee.registreMesureTexte)), 'le registre de la mesure d’essai, à l’octet hors du lancement 32');
  assert.ok(!figee.lancementsNotes.some((x) => x.startsWith('32:')), 'avant : le premier démarrage ne note pas 32');
  assert.deepEqual(s.lancementsNotes, [...figee.lancementsNotes, '32:contexte-v1:2026-09-23'], 'après : 32 noté au premier démarrage, rien d’autre de neuf');
  assert.equal(s.variantes27, figee.variantes27);
  assert.equal(s.variantes27, 320);
  assert.ok(!figee.lancementsVus.includes('32:contexte-v1'), 'avant : pas de lancement 32');
  assert.ok(s.lancementsVus.includes('32:contexte-v1'), 'après : le lancement 32 est dans le registre du juge, et rien ne change');
  assert.deepEqual(s.lancementsVus.filter((x) => x !== '32:contexte-v1'), figee.lancementsVus);
});

test('T-X8 openDb sur une copie de forme réelle (la base d’essai) crée les cinq tables et les deux index du contexte ; indexAttendus() complet ; une seconde ouverture ne change rien ; chaque entrée du DDL du contexte commence par son ordre', () => {
  const copie = preparerCopie({});
  let s;
  try {
    const r = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-contexte.mjs'), { args: ['ddl', '{}'] });
    assert.equal(r.code, 0, r.erreurs.slice(-3000));
    s = r.json;
  } finally {
    copie.nettoyer();
  }
  assert.ok(s.rencontres > 1000, 'une base de forme réelle');
  assert.deepEqual(s.premiere.filter((x) => x.type === 'table').map((x) => x.name), ['contexte_arbitres', 'contexte_avant_match', 'contexte_etat', 'contexte_fiches', 'contexte_rencontres']);
  assert.deepEqual(s.indexAttendus, ['idx_contexte_avant_match_date', 'idx_contexte_fiches_kickoff']);
  assert.deepEqual(s.indexEnBase, s.indexAttendus);
  assert.deepEqual(s.tousLesIndexAttendus, [], 'tous les index attendus sont en base');
  assert.equal(s.secondeOuvertureIdentique, true);
  assert.equal(s.entrees.length, 7);
  for (const e of s.entrees) assert.match(e, /^CREATE (TABLE IF NOT EXISTS contexte_|INDEX IF NOT EXISTS idx_contexte_)/, e);
  const fiches = s.premiere.find((x) => x.name === 'contexte_fiches').sql;
  assert.doesNotMatch(fiches, /WITHOUT ROWID/, 'les fiches (1 à 2 Ko) dans une table à rowid');
  assert.match(fiches, /UNIQUE \(date, home_id, away_id\)/);
});

test('Q10 Réglages › Structure du modèle : les textes EXACTS du constat 12 (sous-titre, marché, structurels, exogènes) ; plus aucune des phrases fausses', () => {
  const vue = fs.readFileSync(path.join(UI, 'views', 'SettingsView.vue'), 'utf8');
  for (const t of [
    'subtitle="Poids de chaque signal dans le pronostic du résultat (1N2). Les marchés de buts ont leur propre modèle."',
    "description: \"Cotes des bookmakers de référence (les plus fiables d'abord), marge retirée.\"",
    "description: \"Le modèle statistique seul (attaque et défense des deux équipes). Poids 0 % : le 1N2 vient du marché. Ses réglages « pressing, fatigue » n'ont jamais reçu de données.\"",
    "description: \"Le même modèle ajusté par la météo et le terrain. Poids 0 %, et l'ajustement n'a jamais reçu de données. Le contexte du match (étape 32) est montré à part.\""
  ]) assert.ok(vue.includes(t), t);
  for (const faux of ['Moyenne des cotes bookmakers', 'Pressing, fatigue et rotation', 'Météo et état du terrain — impact', 'Importance relative des signaux', '±6%', '±2%']) assert.ok(!vue.includes(faux), faux);
});
