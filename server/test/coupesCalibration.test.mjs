/**
 * LA CALIBRATION DE LA CHANCE DE QUALIFICATION (étape 36, lot 1, 09/11/2026) — le SEUL regard de l'étape, rapporté :
 *   node --test test/coupesCalibration.test.mjs        (depuis server/)
 *
 *   T-B4  K = VARIANTES_DE_L_ETAPE_36.length = 1 (la fiche coupes-v1 : aucune variante comparée) ; le script refuse un autre K ;
 *   T-B6  chaque confrontation est calculée avec le recalage appris sur l'AUTRE pli ; une unité d'après le 23/09/2026 lève ;
 *   T-B7  noteDesCoupes.js = texteDeLaNote(aRecopier(la sortie gardée dans test/fixtures)) à l'octet ; null = « pas encore
 *         mesurée » ; jamais un statut « mesuré » (le vert est interdit sur la chance de la page) ;
 *   T-B9  les comptes ne calculent ni base, ni probabilité, ni perte : comptesDesCoupes.js n'importe ni calibrationDesCoupes.js
 *         ni qualification.js, n'appelle ni modeleDeButs ni comparer ;
 *   T-B10 le script : K, règles vérifiées par sha1, verrou obligatoire et posé AVANT de lire, passe de Pierre attendue, sortie
 *         jamais écrasée, second passage refusé sans --rejouer-apres-correction ; --comptes sans force ni probabilité ;
 *         --recopier écrit la note par script ;
 *   T-B11 la calibration : un monde calibré → les fourchettes de α et β contiennent 0 et 1, le mot « calibrée » ; un monde
 *         trop sûr de lui (logit × 1,5) → β exclut 1, « trop sûre d'elle » ; pas assez sûr (× 0,6) → « pas assez sûre
 *         d'elle » ; sous 200 unités → « pas assez de matchs ».
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import * as K from '../src/data/coupes/calibrationDesCoupes.js';
import * as E from '../src/data/coupes/coupesEnfant.js';
import { VARIANTES_DE_L_ETAPE_36 } from '../src/bench/lancements.js';
import { COUPES_AU_BANC } from '../src/data/coupes/noteDesCoupes.js';
import { MOTS_DE_LA_CALIBRATION, PERIODES_DU_BANC, CALIBRATION } from '../src/data/coupes/reglagesCoupes.js';

const SRC = path.join(SERVEUR, 'src');
const sha1 = (t) => crypto.createHash('sha1').update(t).digest('hex');

test('T-B4 — K = 1 : la fiche coupes-v1 seule, aucune variante comparée', () => {
  assert.equal(VARIANTES_DE_L_ETAPE_36.length, 1);
  assert.deepEqual(VARIANTES_DE_L_ETAPE_36.map((v) => v.id), ['coupes-v1']);
});

test('T-B6 — chaque confrontation calculée avec le recalage appris sur l’AUTRE pli ; rien après le 23/09/2026', () => {
  // Pli A (2023-07 → 2025-06) : deux fois plus de buts que λS ; pli B : autant.
  const u = (date, l, m, b90) => ({ cle: date, date, nature: 'match-unique', avance: 0, lambdaS: l, muS: m, qualifieDom: 1, buts90: b90 });
  const unites = [u('2024-01-10', 1, 1, { dom: 2, ext: 2 }), u('2024-02-10', 1, 1, { dom: 2, ext: 2 }), u('2025-09-10', 1, 1, { dom: 1, ext: 1 }), u('2025-10-10', 1, 1, { dom: 1, ext: 1 })];
  const r = K.recalagesDesPlis(unites);
  assert.ok(Math.abs(r[0].cDom - Math.log(2)) < 1e-12, 'le pli 0 (jugé sur B) apprend sur A');
  assert.ok(Math.abs(r[1].cDom) < 1e-12, 'le pli 1 (jugé sur A) apprend sur B');
  assert.equal(K.pliDuJour('2025-09-10'), 0);
  assert.equal(K.pliDuJour('2024-01-10'), 1);
  assert.equal(K.pliDuJour('2023-03-01'), null, 'la mise en route n’est jamais jugée');
  const surB = K.chanceDeLUnite(unites[2], r[K.pliDuJour('2025-09-10')]);
  assert.ok(Math.abs(surB.lambda - 2) < 1e-12, 'une unité de B prend le niveau appris sur A');
  assert.throws(() => K.calibrationDesCoupes([...unites, u('2026-09-24', 1, 1, null)], { tirages: 10 }), /après le dernier jour lu/);
  // Le score À LA 90e du match décisif (le recalage et le 1N2 à 90 minutes) : jamais celui de la 120e.
  assert.deepEqual(E.butsA90DuDecisif({ fin: null, hg: 2, ag: 1 }), { dom: 2, ext: 1 });
  assert.deepEqual(E.butsA90DuDecisif({ fin: 'afterextra', hg: 2, ag: 1, bp90: 1, bc90: 1 }), { dom: 1, ext: 1 });
  assert.deepEqual(E.butsA90DuDecisif({ fin: 'afterpenalties', hg: 1, ag: 1, bp90: 0, bc90: 0 }), { dom: 0, ext: 0 });
  assert.equal(E.butsA90DuDecisif({ fin: 'afterextra', hg: 2, ag: 1, bp90: null, bc90: null }), null, 'sans déroulé : inconnu, jamais le score final');
});

test('T-B7 — la note : refaite à l’octet depuis la sortie gardée (ou nulle avant le regard) ; jamais un statut « mesuré »', () => {
  const note = fs.readFileSync(path.join(SRC, 'data', 'coupes', 'noteDesCoupes.js'), 'utf8');
  const fixture = path.join(SERVEUR, 'test', 'fixtures', 'calibration-coupes-etape36.json');
  if (fs.existsSync(fixture)) {
    const brut = fs.readFileSync(fixture);
    const attendu = K.texteDeLaNote(K.aRecopier(JSON.parse(brut.toString('utf8')), { sortie: { fichier: 'test/fixtures/calibration-coupes-etape36.json', sha1: sha1(brut) } }));
    assert.equal(note, attendu, 'noteDesCoupes.js retouché à la main ?');
    assert.equal(sha1(fs.readFileSync(path.join(SERVEUR, 'test', 'fixtures', 'banc-regles-etape36.md'))), JSON.parse(brut.toString('utf8')).regles.sha1, 'les règles gardées = celles du passage');
    assert.ok(COUPES_AU_BANC && Object.isFrozen(COUPES_AU_BANC));
    assert.ok(Object.values(MOTS_DE_LA_CALIBRATION).includes(COUPES_AU_BANC.calibration.toutes.mot));
    for (const l of Object.values(COUPES_AU_BANC.lignes)) assert.notEqual(l.statut, 'mesure');
  } else {
    assert.equal(note, K.texteDeLaNote(null));
    assert.equal(COUPES_AU_BANC, null);
  }
  assert.match(K.texteDeLaNote(null), /export const COUPES_AU_BANC = null;/);
});

test('T-B9 — les comptes : ni base, ni probabilité, ni perte (aucun import du calcul, aucun appel du modèle ni du juge)', () => {
  const texte = fs.readFileSync(path.join(SRC, 'data', 'coupes', 'comptesDesCoupes.js'), 'utf8');
  const imports = [...texte.matchAll(/^import [^;]* from '([^']+)';$/gm)].map((m) => m[1]);
  assert.deepEqual(imports, ['./reglagesCoupes.js']);
  const code = texte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /modeleDeButs|comparer\(|grilleDesButs|chanceDe|calibr/);
});

/** Un monde de `n` confrontations : la vraie chance p, la chance annoncée sigma(f · logit p), l'issue tirée avec p. */
function monde(n, facteur, graine) {
  const alea = K.generateur(graine);
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = 0.08 + 0.84 * alea();
    const annonce = 1 / (1 + Math.exp(-facteur * Math.log(p / (1 - p))));
    out.push({ cle: `u${i}`, p: annonce, y: alea() < p ? 1 : 0 });
  }
  return out;
}

test('T-B11 — la calibration : calibrée, trop sûre d’elle, pas assez sûre d’elle, pas assez de matchs (les bornes fixées d’avance)', () => {
  const cal = K.calibrer(monde(6000, 1, 11), { avecMot: true, tirages: 200 });
  assert.ok(cal.betaIc[0] <= 1 && cal.betaIc[1] >= 1, JSON.stringify(cal.betaIc));
  assert.ok(cal.alphaIc[0] <= 0 && cal.alphaIc[1] >= 0, JSON.stringify(cal.alphaIc));
  assert.equal(cal.mot, MOTS_DE_LA_CALIBRATION.calibree);
  assert.equal(cal.dixiemes.length, 10);
  assert.ok(cal.ecartMoyen <= 0.03);
  const trop = K.calibrer(monde(6000, 1.5, 12), { avecMot: true, tirages: 200 });
  assert.ok(trop.betaIc[1] < 1, JSON.stringify(trop.betaIc));
  assert.equal(trop.mot, MOTS_DE_LA_CALIBRATION.tropSure);
  const pasAssez = K.calibrer(monde(6000, 0.6, 13), { avecMot: true, tirages: 200 });
  assert.equal(pasAssez.mot, MOTS_DE_LA_CALIBRATION.pasAssezSure);
  assert.equal(K.calibrer(monde(150, 1, 14), { avecMot: true, tirages: 50 }).mot, MOTS_DE_LA_CALIBRATION.pasAssez);
  // Les bornes : celles des règles scellées avant le regard (banc-regles-etape36.md, § 5) ; un cas juste à côté de chacune.
  assert.deepEqual(JSON.parse(JSON.stringify(CALIBRATION.bornes)), { beta: [0.85, 1.15], alpha: [-0.15, 0.15], ecartMoyenMax: 0.03 });
  assert.equal(CALIBRATION.minUnites, 200);
  const mot = (x) => K.motDeLaCalibration({ n: 1000, beta: 0.9, alphaIc: [-0.1, 0.1], betaIc: [0.86, 1.1], ecartMoyen: 0.02, ...x });
  assert.equal(mot({}), MOTS_DE_LA_CALIBRATION.calibree);
  assert.equal(mot({ betaIc: [0.84, 1.1] }), MOTS_DE_LA_CALIBRATION.nonTranche, 'la fourchette de β déborde de 0,85');
  assert.equal(mot({ alphaIc: [-0.16, 0.1] }), MOTS_DE_LA_CALIBRATION.nonTranche, 'celle de α déborde de −0,15');
  assert.equal(mot({ ecartMoyen: 0.031 }), MOTS_DE_LA_CALIBRATION.nonTranche, 'l’écart moyen dépasse 3 points');
  assert.equal(mot({ beta: 0.84, betaIc: [0.8, 0.88] }), MOTS_DE_LA_CALIBRATION.tropSure);
  assert.equal(mot({ beta: 1.16, betaIc: [1.1, 1.2] }), MOTS_DE_LA_CALIBRATION.pasAssezSure);
  assert.equal(mot({ n: 199 }), MOTS_DE_LA_CALIBRATION.pasAssez);
  // Les mêmes tirages donnent les mêmes fourchettes (la graine 36).
  assert.deepEqual(K.calibrer(monde(500, 1, 15), { tirages: 100 }).betaIc, K.calibrer(monde(500, 1, 15), { tirages: 100 }).betaIc);
  // La favorite : annoncé / réalisé.
  const ar = K.annonceRealise([{ p: 0.7, y: 1 }, { p: 0.2, y: 0 }]);
  assert.deepEqual([ar.annonce, ar.realise], [0.75, 1]);
  // La sortie complète porte le 1N2 à 90 minutes à côté, sans mot.
  const unites = monde(400, 1, 16).map((x, i) => ({ cle: x.cle, date: i % 2 ? '2024-03-01' : '2025-10-01', nature: i % 3 ? 'match-unique' : 'retour', avance: 0, lambdaS: 1 + (i % 7) / 10, muS: 1.1, qualifieDom: x.y, buts90: { dom: i % 3, ext: i % 2 } }));
  const c = K.calibrationDesCoupes(unites, { tirages: 20 });
  assert.equal(c.toutes.n, 400);
  assert.equal(c.retours.mot, null, 'les retours : rapportés, sans mot');
  assert.equal(c.unNDeuxA90.n, 400);
  assert.equal(c.unNDeuxA90.home.mot, null);
  assert.deepEqual(c.unitesParPli, [200, 200]);
});

const COPIES = [];
after(() => {
  for (const c of COPIES) c.nettoyer();
});

test('T-B10 — le script : un seul regard (K, règles par sha1, verrou posé avant de lire, passe attendue, sortie jamais écrasée, rejeu sur raison) ; comptes ; recopie par script', () => {
  const copie = preparerCopie({ base: false });
  COPIES.push(copie);
  const cli = path.join(copie.serveur, 'scripts', 'coupes.mjs');
  fs.mkdirSync(path.dirname(cli), { recursive: true });
  fs.copyFileSync(path.join(SERVEUR, 'scripts', 'coupes.mjs'), cli);
  const fab = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-coupes.mjs'), { args: ['fabriquer', '{}'], timeout: 300_000 });
  assert.equal(fab.code, 0, fab.erreurs.slice(-3000));
  const d = (n) => path.join(copie.dossier, n);
  fs.writeFileSync(d('regles.md'), '# Règles de la calibration (essai)\nK = 1\n');
  fs.writeFileSync(d('passe-libre.json'), JSON.stringify({ running: null }));
  fs.writeFileSync(d('passe-occupee.json'), JSON.stringify({ running: { reason: 'au démarrage' } }));
  const sR = sha1(fs.readFileSync(d('regles.md')));
  const cal = (sortie, enPlus = [], { k = '1', regles = sR, passe = 'passe-libre.json', verrou = true } = {}) =>
    executer(copie, cli, { args: ['--calibration', '--regles', d('regles.md'), '--sha1-regles', regles, '--k', k, ...(verrou ? ['--verrou', d('cal.lock')] : []), '--passe', d(passe), '--attente-minutes', '0', '--sortie', d(sortie), '--tirages', '50', ...enPlus], timeout: 300_000 });
  assert.match(cal('a.json', [], { k: '2' }).json.refus, /K doit valoir le nombre de regards déclarés \(1/);
  assert.match(cal('a.json', [], { regles: '0'.repeat(40) }).json.refus, /les règles ont changé/);
  assert.match(cal('a.json', [], { verrou: false }).json.refus, /--verrou <fichier> est obligatoire/);
  assert.match(cal('a.json', [], { passe: 'passe-occupee.json' }).json.refus, /la passe de Pierre tourne/);
  fs.writeFileSync(d('existe.json'), '{}');
  assert.match(cal('existe.json').json.refus, /jamais écrasée/);
  assert.ok(!fs.existsSync(d('cal.lock')), 'aucun verrou posé par un refus');
  const premier = cal('premier.json');
  assert.equal(premier.code, 0, `${premier.erreurs.slice(-3000)}\n${premier.sortie.slice(-1500)}`);
  const verrou = JSON.parse(fs.readFileSync(d('cal.lock'), 'utf8'));
  assert.match(verrou.pose, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(verrou.regles.sha1, sR);
  const sortie = JSON.parse(fs.readFileSync(d('premier.json'), 'utf8'));
  assert.equal(sortie.premierRegard, verrou.pose);
  assert.equal(sortie.base.lectureSeule, true);
  assert.equal(sortie.empreinteDuMoteur.sha1, '16f2459db183a99576365047da98b7777687ef05');
  assert.equal(sortie.empreinteDuMoteur.candidate, 'f01dd8496f56a415');
  assert.ok(sortie.comptes.unites > 0, JSON.stringify(sortie.comptes));
  assert.equal(sortie.comptes.dernierJourLu, PERIODES_DU_BANC.dernierJourLu);
  assert.ok(Object.values(MOTS_DE_LA_CALIBRATION).includes(sortie.calibration.toutes.mot));
  assert.match(cal('second.json').json.refus, /DÉJÀ été passée/);
  const rejeu = cal('rejeu.json', ['--rejouer-apres-correction', 'correction technique X']);
  assert.equal(rejeu.code, 0, rejeu.erreurs.slice(-3000));
  assert.equal(JSON.parse(fs.readFileSync(d('rejeu.json'), 'utf8')).rejeu.raison, 'correction technique X');
  assert.equal(JSON.parse(fs.readFileSync(d('cal.lock'), 'utf8')).rejeux.length, 1);
  // La recopie, par script.
  const rec = executer(copie, cli, { args: ['--recopier', d('premier.json')], timeout: 120_000 });
  assert.equal(rec.code, 0, rec.erreurs.slice(-3000));
  const fixture = path.join(copie.serveur, 'test', 'fixtures', 'calibration-coupes-etape36.json');
  const attendu = K.texteDeLaNote(K.aRecopier(JSON.parse(fs.readFileSync(fixture, 'utf8')), { sortie: { fichier: 'test/fixtures/calibration-coupes-etape36.json', sha1: sha1(fs.readFileSync(fixture)) } }));
  assert.equal(fs.readFileSync(path.join(copie.serveur, 'src', 'data', 'coupes', 'noteDesCoupes.js'), 'utf8'), attendu);
  assert.equal(sha1(fs.readFileSync(path.join(copie.serveur, 'test', 'fixtures', 'banc-regles-etape36.md'))), sR);
  // Les comptes : aucune force, aucune probabilité, aucune perte ; T-T1 bis ; la sortie jamais écrasée.
  const c = executer(copie, cli, { args: ['--comptes', '--sortie', d('comptes.json'), '--passe', d('passe-libre.json')], timeout: 300_000 });
  assert.equal(c.code, 0, c.erreurs.slice(-3000));
  const comptes = JSON.parse(fs.readFileSync(d('comptes.json'), 'utf8'));
  assert.equal(comptes.aucuneForceNiProbabiliteNiPerte, true);
  assert.equal(comptes.tT1bis.ecarts.length, 0);
  assert.doesNotMatch(JSON.stringify(comptes.comptes), /"(lambda|mu|chance|perte|beta|alpha)"/);
  assert.match(executer(copie, cli, { args: ['--comptes', '--sortie', d('comptes.json')], timeout: 120_000 }).json.refus, /jamais écrasée/);
  // La note nulle, par script.
  const nulle = executer(copie, cli, { args: ['--note-nulle'], timeout: 120_000 });
  assert.equal(nulle.code, 0);
  assert.equal(fs.readFileSync(path.join(copie.serveur, 'src', 'data', 'coupes', 'noteDesCoupes.js'), 'utf8'), K.texteDeLaNote(null));
});
