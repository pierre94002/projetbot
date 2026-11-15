/**
 * PARTIE 0 DES LOTS 2 — l'empreinte EN SERVICE (A) et la preuve historique (B), dans CHAQUE copie (dépôt, bac, pistes) :
 *   node --test test/declarationsLots2.test.mjs        (depuis server/)
 *   D1 la liste des fichiers déclarés (aides/enService.mjs) est bien formée et chaque chaîne tient ;
 *   D2 chaque fichier déclaré est épinglé : au manifeste de la 46 quand il est là (bac ; dépôt après la 46), et sa première ligne
 *      part alors du sha1 du manifeste ; ou parmi EPINGLES_HORS_MANIFESTE, et sa première ligne part alors du sha1 de départ noté là
 *      (contrôlé PARTOUT, dépôt compris ; tant qu’il n’est pas déclaré, le fichier du jour a encore ce sha1) ;
 *   D3 chaque fichier déclaré a, aujourd'hui, le sha1 de son dernier « après » (absent s'il est « retire ») ;
 *   D4 l'empreinte relue par le code du moteur = EMPREINTE_EN_SERVICE (moteur, nombre de fichiers, candidate, comptes de MODULES_DU_MOTEUR) ;
 *   D4 bis EMPREINTES_PASSEES : chaque empreinte bien formée ; si l’empreinte en service a quitté le départ, sa dernière entrée est le départ ;
 *   D5 R0 (aucune candidate en essai) : l'aide rend null sans appeler empreinteDeLaCandidate, qui lève sur null.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { SERVEUR, FIXTURES } from './aides/isolement.mjs';
import { DECLARATIONS, EPINGLES_HORS_MANIFESTE, EMPREINTE_EN_SERVICE, EMPREINTE_AVANT_LOTS_2, EMPREINTES_PASSEES, fautesDesDeclarations, empreinteDeLaCandidateOuNull } from './aides/enService.mjs';
import { empreinteDuCode, empreinteDeLaCandidate, CANDIDATE_EN_ESSAI, fichiersDuMoteur, MODULES_DU_MOTEUR } from '../src/core/engine/engineVersions.js';

const RACINE = path.join(SERVEUR, '..');
const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex');
const MANIFESTE = path.join(FIXTURES, 'direct-gel-46.json');
const AJOUTS_46 = path.join(SERVEUR, 'test', 'aides', 'ajouts46.mjs');
const LANCEMENTS = 'server/src/bench/lancements.js';
const premieres = () => { const m = new Map(); for (const d of DECLARATIONS) if (!m.has(d.chemin)) m.set(d.chemin, d); return m; };
const dernieres = () => { const m = new Map(); for (const d of DECLARATIONS) m.set(d.chemin, d); return m; };

test('D1 — la liste des fichiers déclarés : bien formée, chaque chaîne tient', () => {
  assert.deepEqual(fautesDesDeclarations(DECLARATIONS), []);
});

test('D2 — chaque fichier déclaré est épinglé ; sa première ligne part du manifeste de la 46 (quand il est là) ou du sha1 de départ de EPINGLES_HORS_MANIFESTE (partout)', (t) => {
  // Partie 0 des lots 2 (P0-3, vérification du 14/11) : le départ des épingles hors manifeste, contrôlé AVANT le saut « manifeste absent ».
  const premiere = premieres();
  for (const [chemin, depart] of Object.entries(EPINGLES_HORS_MANIFESTE)) {
    const d = premiere.get(chemin);
    if (d) assert.equal(d.avant, depart, `${chemin} : la première ligne (${d.lot}) ne part pas du sha1 de départ (EPINGLES_HORS_MANIFESTE)`);
    else assert.equal(sha1(fs.readFileSync(path.join(RACINE, ...chemin.split('/')))), depart, `${chemin} : retouché sans être déclaré — ajouter une ligne (avant = ${depart})`);
  }
  const manifeste = fs.existsSync(MANIFESTE) ? new Map(JSON.parse(fs.readFileSync(MANIFESTE, 'utf8')).fichiers) : null;
  if (!manifeste) t.diagnostic('manifeste de la 46 absent (dépôt avant la 46) : D2 tenu dans le bac (ici et T-X3 de directFrontiere) ; le départ des épingles hors manifeste est contrôlé ici aussi');
  for (const [chemin, d] of premiere) {
    if (Object.hasOwn(EPINGLES_HORS_MANIFESTE, chemin) || !manifeste) continue;
    assert.ok(manifeste.has(chemin), `${chemin} : ni au manifeste de la 46 ni parmi EPINGLES_HORS_MANIFESTE`);
    assert.equal(d.avant, manifeste.get(chemin), `${chemin} : la première ligne (${d.lot}) ne part pas du manifeste du 11/11`);
  }
});

test('D3 — chaque fichier déclaré a, aujourd’hui, le sha1 de son dernier « après » (absent s’il est retiré)', async () => {
  const sansLa46 = fs.existsSync(AJOUTS_46) ? (await import(pathToFileURL(AJOUTS_46).href)).octetsSansLesAjoutsDe46 : (_f, o) => o;
  for (const [chemin, d] of dernieres()) {
    const absolu = path.join(RACINE, ...chemin.split('/'));
    if (d.apres === 'retire') {
      assert.ok(!fs.existsSync(absolu), `${chemin} : déclaré retiré par ${d.lot}, encore là`);
      continue;
    }
    assert.ok(fs.existsSync(absolu), `${chemin} : absent`);
    const octets = fs.readFileSync(absolu);
    const lu = sha1(chemin === LANCEMENTS ? sansLa46('bench/lancements.js', octets) : octets);
    assert.equal(lu, d.apres, `${chemin} : retouché après sa dernière ligne (${d.lot}, ${d.date}) — ajouter une ligne (avant = ${d.apres})`);
  }
});

test('D4 — l’empreinte EN SERVICE (A), relue par le code du moteur', () => {
  const quoi = 'l’empreinte a changé : mettre à jour EMPREINTE_EN_SERVICE (test/aides/enService.mjs) dans le même lot, avec sa raison et sa date, l’ancienne rangée en tête de EMPREINTES_PASSEES — si ce lot ne devait pas créer de version : ARRÊT, ne pas mettre à jour'; // Partie 0 des lots 2 (P0-5, 14/11)
  const e = empreinteDuCode({ rafraichir: true });
  assert.equal(e.empreinte, EMPREINTE_EN_SERVICE.moteur, quoi);
  assert.equal(Object.keys(e.fichiers).length, EMPREINTE_EN_SERVICE.fichiersDuMoteur, quoi);
  assert.equal(fichiersDuMoteur().length, EMPREINTE_EN_SERVICE.fichiersDuMoteur, quoi);
  assert.equal(empreinteDeLaCandidateOuNull(empreinteDeLaCandidate, CANDIDATE_EN_ESSAI), EMPREINTE_EN_SERVICE.candidate, quoi);
  assert.deepEqual({ dossiers: MODULES_DU_MOTEUR.dossiers.length, fichiers: MODULES_DU_MOTEUR.fichiers.length }, { ...EMPREINTE_EN_SERVICE.modules }, quoi);
});

test('D4 bis — EMPREINTES_PASSEES : chaque empreinte bien formée ; si l’empreinte en service a quitté le départ, la liste n’est pas vide et sa dernière entrée est le départ (EMPREINTE_AVANT_LOTS_2)', () => {
  // Partie 0 des lots 2 (P0-5, vérification du 14/11).
  const valeurs = (e) => JSON.stringify([e?.moteur, e?.fichiersDuMoteur, e?.candidate, e?.modules?.dossiers, e?.modules?.fichiers]);
  [EMPREINTE_EN_SERVICE, ...EMPREINTES_PASSEES].forEach((e, i) => {
    const ou = i === 0 ? 'EMPREINTE_EN_SERVICE' : `EMPREINTES_PASSEES[${i - 1}]`;
    assert.match(String(e?.moteur), /^[0-9a-f]{40}$/, `${ou} : moteur = un sha1`);
    assert.ok(Number.isInteger(e?.fichiersDuMoteur) && e.fichiersDuMoteur > 0, `${ou} : fichiersDuMoteur, un entier`);
    assert.ok(e?.candidate === null || /^[0-9a-f]{16}$/.test(String(e?.candidate)), `${ou} : candidate = 16 hexadécimaux, ou null (R0)`);
    assert.ok(Number.isInteger(e?.modules?.dossiers) && Number.isInteger(e?.modules?.fichiers), `${ou} : modules { dossiers, fichiers }`);
    assert.match(String(e?.depuis), /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/, `${ou} : depuis AAAA-MM-JJ`);
    assert.ok(String(e?.lot ?? '').trim() && String(e?.raison ?? '').trim(), `${ou} : lot et raison obligatoires`);
  });
  if (valeurs(EMPREINTE_EN_SERVICE) !== valeurs(EMPREINTE_AVANT_LOTS_2)) {
    const quoi = 'l’empreinte en service a quitté le départ : l’ancienne se range en tête de EMPREINTES_PASSEES, la dernière entrée est le départ (EMPREINTE_AVANT_LOTS_2) — si ce lot ne devait pas créer de version : ARRÊT, ne pas mettre à jour';
    assert.ok(EMPREINTES_PASSEES.length > 0, quoi);
    assert.equal(valeurs(EMPREINTES_PASSEES.at(-1)), valeurs(EMPREINTE_AVANT_LOTS_2), quoi);
  }
});

test('D5 — R0 (CANDIDATE_EN_ESSAI = null) : l’empreinte de la candidate est null, sans appeler empreinteDeLaCandidate (qui lève sur null)', () => {
  const jamais = () => { throw new Error('empreinteDeLaCandidate appelée sans candidate'); };
  assert.equal(empreinteDeLaCandidateOuNull(jamais, null), null);
  assert.equal(empreinteDeLaCandidateOuNull(jamais, undefined), null);
  // Avec la candidate du code : la même valeur que l'appel direct (aucun écart entre l'aide et le moteur).
  if (CANDIDATE_EN_ESSAI) assert.equal(empreinteDeLaCandidateOuNull(empreinteDeLaCandidate, CANDIDATE_EN_ESSAI), empreinteDeLaCandidate(CANDIDATE_EN_ESSAI));
  else assert.equal(EMPREINTE_EN_SERVICE.candidate, null, 'sans candidate en essai, EMPREINTE_EN_SERVICE.candidate est null');
});
