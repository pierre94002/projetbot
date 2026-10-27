/**
 * Étape 28 du plan — LA FORME DE LA NOTE DE LA SIMULATION (la porte 1 sur football-data P2, partie C1) :
 *   node --test test/noteDeLaSimulation.test.mjs        (depuis server/)
 *
 * La note est recopiée par script depuis le passage UNIQUE de la porte 1 ; ce test n'en vérifie que la FORME, jamais
 * les chiffres (un second passage serait un second regard) : figée ; porte « ouverte » ou « fermee » selon la règle de
 * l'orchestrateur ; règles écrites avant le regard (sha1) ; 14 combinés et 16 marchés de mi-temps, éteints selon leurs
 * seuils (1,5 pt et 1 pt) ; un fichier pur de data/simulation, hors de l'empreinte du moteur.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SERVEUR } from './aides/isolement.mjs';
import { fichiersDuMoteur } from '../src/core/engine/engineVersions.js';
import { NOTE_DE_LA_SIMULATION as NOTE } from '../src/data/simulation/noteDeLaSimulation.js';
import * as BANC from '../src/data/simulation/simulationBanc.js';

const FICHIER = path.join(SERVEUR, 'src', 'data', 'simulation', 'noteDeLaSimulation.js');
const figeeEnProfondeur = (o) => !o || typeof o !== 'object' || (Object.isFrozen(o) && Object.values(o).every(figeeEnProfondeur));
const fourchette = (f) => Array.isArray(f) && f.length === 2 && f.every((x) => typeof x === 'number' && Number.isFinite(x)) && f[0] <= f[1];

test('la note est figée, vient du passage réel et dit sa porte ; règles écrites avant le regard (sha1)', () => {
  assert.ok(figeeEnProfondeur(NOTE));
  assert.equal(NOTE.format, 1);
  assert.equal(NOTE.essai, false);
  assert.ok(['ouverte', 'fermee'].includes(NOTE.porte));
  assert.match(NOTE.regles.sha1, /^[0-9a-f]{40}$/);
  assert.equal(NOTE.regles.ecritesAvantLeRegard, true);
  // Vérification du 27/10 (constat 8) : les pièces citées là où elles sont GARDÉES — le dossier du dépôt, copiées telles
  // quelles (SHA1.txt) —, jamais le scratchpad temporaire ; la sortie du passage avec son sha1.
  assert.equal(NOTE.regles.fichier, 'docs/etape28-porte1-2026-10-27/porte1-regles.md');
  assert.equal(NOTE.sortie.fichier, 'docs/etape28-porte1-2026-10-27/porte1-resultat.json');
  assert.match(NOTE.sortie.sha1, /^[0-9a-f]{40}$/);
  assert.doesNotMatch(JSON.stringify(NOTE), /scratchpad/);
  assert.match(NOTE.calculeeLe, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(Number.isInteger(NOTE.n) && NOTE.n >= 1000, 'N ≥ 1 000 (V C5)');
  assert.ok(NOTE.echantillon.rencontres >= 20000, 'au moins 20 000 rencontres rejouées (conception §3.3)');
  assert.equal(NOTE.juge.variantes, 27);
  assert.equal(NOTE.empreinteDuMoteur.sha1, '16f2459db183a99576365047da98b7777687ef05');
});

test('F3a : les 14 combinés du banc, le bloc « grille contre produit » et les éteints selon |net| > 1,5 pt', () => {
  assert.deepEqual(NOTE.f3a.combines.map((c) => c.nom), BANC.COMBINES_DU_BANC.map((c) => c.nom));
  assert.ok(fourchette(NOTE.f3a.bloc.fourchetteMillieme));
  assert.equal(NOTE.f3a.retenu, NOTE.f3a.bloc.verdict === 'retenu');
  for (const c of NOTE.f3a.combines) {
    for (const k of ['annonce', 'realise', 'brut', 'herite', 'net']) assert.equal(typeof c[k], 'number', `${c.nom} : ${k}`);
    assert.equal(c.eteint, Math.abs(c.net) > 1.5, c.nom);
  }
  assert.deepEqual(NOTE.f3a.eteints, NOTE.f3a.combines.filter((c) => c.eteint).map((c) => c.nom));
});

test('F2c : 15 marchés au bloc « avec contre sans effets », 17 marchés jugés un par un sur le NET EXACT, éteints si |net exact| > 1 pt ou si plus de 1 % des rencontres est écarté', () => {
  const duBloc = BANC.BLOC_DEROULE.filter((k) => !BANC.BESOIN_DES_MINUTES.includes(k));
  assert.equal(duBloc.length, 15);
  const dansLaPorte = NOTE.f2c.marches.filter((m) => m.dansLaPorte).map((m) => m.cle);
  assert.deepEqual(dansLaPorte, [...duBloc, 'h2plusQueH1', 'rougeAuMoinsUn']);
  assert.deepEqual(NOTE.f2c.parMarche.marches, [...duBloc, 'h2plusQueH1', 'rougeAuMoinsUn']);
  assert.equal(NOTE.f2c.parMarche.nonVerifie, NOTE.f2c.parMarche.ecartees > 0.01 * NOTE.echantillon.rencontres);
  assert.ok(fourchette(NOTE.f2c.bloc.fourchetteMillieme));
  assert.equal(NOTE.f2c.moinsBon, !(NOTE.f2c.bloc.verdict !== 'pas-assez-de-matchs' && NOTE.f2c.bloc.fourchetteMillieme[1] > 0));
  for (const m of NOTE.f2c.marches) {
    if (!m.dansLaPorte) {
      assert.equal(m.eteint, null, `${m.cle} : hors de la règle`);
      continue;
    }
    assert.equal(typeof m.netExact, 'number', m.cle);
    assert.equal(m.eteint, NOTE.f2c.parMarche.nonVerifie || Math.abs(m.netExact) > 1, m.cle);
  }
  assert.deepEqual(NOTE.f2c.eteints, NOTE.f2c.marches.filter((m) => m.eteint).map((m) => m.cle));
});

test('la porte suit la règle de l’orchestrateur : fermée si F3a n’est pas « retenu » ou si F2c est prouvé moins bon', () => {
  assert.equal(NOTE.porte, NOTE.f3a.retenu && !NOTE.f2c.moinsBon ? 'ouverte' : 'fermee');
});

test('un fichier pur de data/simulation, hors de l’empreinte du moteur : aucun import, aucune horloge, ne nomme pas le banc', () => {
  assert.ok(!fichiersDuMoteur().includes('data/simulation/noteDeLaSimulation.js'));
  const texte = fs.readFileSync(FICHIER, 'utf8');
  assert.doesNotMatch(texte, /\bimport\b|\brequire\(|Date\.now|new Date\(|Math\.random|process\./);
  assert.doesNotMatch(texte, /simulationBanc/);
});
