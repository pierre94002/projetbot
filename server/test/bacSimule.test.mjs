/**
 * Le BAC À SABLE SIMULÉ des essais (test/aides/bacSimule.mjs) — retouche du
 * 07/10/2026 au soir.
 *   node --test test/bacSimule.test.mjs        (depuis server/)
 *
 * Le code reconnaît le bac à son emplacement : sous
 * <dossier personnel>\CoteMaster\bac-a-sable. Les copies d'essai étaient des
 * bacs quand les tests tournaient DANS le bac et des serveurs ordinaires depuis
 * le dépôt : quatre essais du contrôle quotidien (la santé des sources « coupées
 * par le bac », le feu d'un contrôle jamais fait) échouaient dans le dépôt. Ici,
 * la copie est rangée dans un faux dossier personnel, à la disposition du vrai
 * bac, et son processus a ce dossier pour sien : le code s'y reconnaît dans le
 * bac, où que le test tourne.
 *
 *  1. La disposition : le faux dossier, le faux bac, la copie, sa base.
 *  2. Le code de la copie se reconnaît dans le bac, avec son garde-fou (clés
 *     vidées, actualisation et cotes gratuites coupées) et son dossier personnel
 *     factice — jamais la vraie base, jamais le vrai dossier personnel.
 *  3. Une copie ordinaire n'a pas ce faux dossier ; un faux bac se refuse sans lui.
 *  4. Tout s'efface ensemble : la copie et le faux dossier personnel.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR, RACINE_ESSAIS } from './aides/isolement.mjs';
import { preparerCopieDeBac, executerDansLeBac } from './aides/bacSimule.mjs';

const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-bac-simule.mjs');
const meme = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
const dedans = (fichier, dossier) => path.resolve(fichier).toLowerCase().startsWith(`${path.resolve(dossier).toLowerCase()}${path.sep}`);

test('la disposition du faux bac : <faux dossier personnel>\\CoteMaster\\bac-a-sable\\essais-tests\\cm-tests-…, avec le code et la base de la copie dedans', () => {
  const copie = preparerCopieDeBac({});
  try {
    assert.ok(dedans(copie.maison, RACINE_ESSAIS), 'le faux dossier personnel est dans le dossier d’essais (le bac ou le temporaire), jamais ailleurs');
    const racineDuBac = path.join(copie.maison, 'CoteMaster', 'bac-a-sable');
    assert.ok(dedans(copie.dossier, path.join(racineDuBac, 'essais-tests')), copie.dossier);
    assert.match(path.basename(copie.dossier), /^cm-tests-/);
    assert.ok(fs.existsSync(path.join(copie.serveur, 'src', 'config', 'bacASable.js')), 'le code du serveur est dans la copie');
    assert.ok(fs.existsSync(copie.base) && dedans(copie.base, copie.dossier), 'la base d’essai est DANS la copie');
    assert.ok(dedans(copie.donnees, copie.dossier));
    // Ni le vrai dossier personnel ni la vraie base : le faux est à part.
    assert.ok(!meme(copie.maison, os.homedir()));
    assert.ok(!meme(copie.base, path.join(os.homedir(), 'CoteMaster', 'match-stats.db')));
  } finally {
    copie.nettoyer();
  }
});

test('le code de la copie se reconnaît dans le bac : son dossier personnel est le faux, son garde-fou joue (clés vidées, actualisation et cotes gratuites coupées), la vraie base n’est pas celle d’ici', () => {
  const copie = preparerCopieDeBac({});
  try {
    const r = executerDansLeBac(copie, SCRIPT);
    assert.equal(r.code, 0, r.erreurs.slice(-2000));
    assert.equal(r.reseau, false);
    const v = r.json;
    assert.ok(meme(v.maison, copie.maison), `le dossier personnel vu par la copie : ${v.maison}`);
    assert.equal(v.mode, true, 'le code se reconnaît dans le bac');
    assert.ok(meme(v.racineBac, path.join(copie.maison, 'CoteMaster', 'bac-a-sable')));
    assert.ok(meme(v.dossierDuBac, copie.dossier), `le bac de ce code est sa copie : ${v.dossierDuBac}`);
    assert.ok(meme(v.baseParDefaut, path.join(copie.dossier, 'base', 'match-stats.db')));
    // La « vraie base » vue par la copie est dans le faux dossier : celle de Pierre n'existe pas pour elle.
    assert.ok(meme(v.vraieBase, path.join(copie.maison, 'CoteMaster', 'match-stats.db')));
    assert.ok(!meme(v.vraieBase, path.join(os.homedir(), 'CoteMaster', 'match-stats.db')), 'la vraie base de Pierre n’est pas celle que la copie appelle « la vraie base »');
    // Le garde-fou a nettoyé l'environnement, comme dans le vrai bac.
    assert.equal(v.env.CM_BAC_A_SABLE, '1');
    assert.equal(v.env.MATCH_STATS_AUTO_REFRESH, 'false');
    assert.equal(v.env.FREE_ODDS, 'false');
    assert.equal(v.env.AUTO_AI_ANALYSIS, 'false');
    assert.ok(!v.env.ODDS_API_KEY, 'aucune clé payante');
  } finally {
    copie.nettoyer();
  }
});

test('une copie ORDINAIRE garde le vrai dossier personnel du processus (c’est ce qui la rend dépendante de l’endroit où le test tourne) ; executerDansLeBac refuse une copie qui n’a pas de faux dossier', () => {
  const copie = preparerCopie({});
  try {
    const r = executer(copie, SCRIPT);
    assert.equal(r.code, 0, r.erreurs.slice(-2000));
    assert.ok(meme(r.json.maison, os.homedir()), `la copie ordinaire voit le même dossier personnel que le test : ${r.json.maison}`);
    assert.throws(() => executerDansLeBac(copie, SCRIPT), /doit venir de preparerCopieDeBac/);
  } finally {
    copie.nettoyer();
  }
});

test('tout s’efface ensemble : la copie ET le faux dossier personnel — aucun reste dans le dossier d’essais', () => {
  const copie = preparerCopieDeBac({});
  const { maison, dossier } = copie;
  assert.ok(fs.existsSync(maison) && fs.existsSync(dossier));
  copie.nettoyer();
  assert.equal(fs.existsSync(dossier), false);
  assert.equal(fs.existsSync(maison), false);
  // Rien d'autre n'est tombé dans le dossier d'essais : aucun « cm-maison-… » de ce test n'y traîne.
  assert.ok(!fs.readdirSync(RACINE_ESSAIS).includes(path.basename(maison)));
});

// ------------------------------------------------------------ étape 27 : la première nuit de la candidate

test('étape 27 — la PREMIÈRE NUIT simulée dans un bac, comme chez Pierre après la recopie : « forcesButs » (avant « moteurABlanc ») construit les forces pour l’empreinte de la candidate déclarée ; « moteurABlanc » la met à blanc et le registre de la mesure compte K = 320 (elle « a-blanc », 319 « construction ») ; le banc compte 320 aussi ; la version en service n’a ni la clé ni un réglage changé', () => {
  const copie = preparerCopieDeBac({});
  try {
    const r = executerDansLeBac(copie, path.join(SERVEUR, 'test', 'aides', 'script-premiere-nuit.mjs'), { timeout: 300_000, env: { CLAUDE_CODE_BIN: path.join(copie.dossier, 'pas-de-claude-ici.exe') } });
    assert.equal(r.code, 0, `${r.erreurs.slice(-3000)}\n${r.sortie.slice(-1500)}`);
    assert.equal(r.reseau, false);
    const s = r.json;
    assert.equal(s.bac, true, 'le code se reconnaît dans le bac');
    assert.deepEqual(s.candidate, { id: 'modele-buts-v1', variantes: 319, temoins: ['scoreExact'], horizon: { matchs: 800, jours: 21 } });
    assert.ok(s.ordre.forcesButs >= 0 && s.ordre.forcesButs < s.ordre.moteurABlanc, 'les forces avant la mise à blanc');
    assert.equal(s.forces.status, 'ok', JSON.stringify(s.forces));
    assert.equal(s.forces.mode, 'premier');
    assert.deepEqual(s.forces.empreintes, [s.forces.empreinte]);
    assert.equal(s.forces.empreinte, 'v1|35|25|remise-a-zero');
    assert.deepEqual(s.forces.controle, { lignes: 40, ecarts: 0 });
    assert.equal(s.forces.etat, true, 'forces à jour pour l’empreinte de la candidate');
    assert.equal(s.aBlanc.erreur, null, JSON.stringify(s.aBlanc));
    assert.equal(s.registre.K, 320);
    assert.deepEqual(s.registre.parOu, { 'a-blanc': 1, construction: 319 });
    assert.equal(s.registre.premiere, 'modele-buts-v1');
    assert.equal(s.banc.K, 320);
    assert.equal(s.enService.sansCle, true, 'la clé modeleDeButs reste absente des réglages en service');
    assert.deepEqual(s.enService.apres, s.enService.avant, 'aucun réglage en service changé');
  } finally {
    copie.nettoyer();
  }
});
