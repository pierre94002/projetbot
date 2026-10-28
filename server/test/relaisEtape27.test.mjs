/**
 * La boucle de correction (étape 26 du plan, 27/10/2026, partie A) et L'ESSAI DE L'ÉTAPE 27 qui tourne en ce moment.
 *   node --test test/relaisEtape27.test.mjs        (depuis server/)
 * La retouche R1 de engineVersions.js est REPORTÉE (lot 2, après le verdict de la 27) : ici, aucune ligne de
 * engineVersions.js ne change, et on prouve que la partie A ne touche ni l'empreinte du moteur, ni celle de la
 * candidate, ni sa place, ni les deux registres :
 *   T-EV3 — l'empreinte du code du moteur et celle de la candidate de l'étape 27 sont celles du jour ; aucun
 *           fichier de la boucle (data/correction/) n'entre dans l'empreinte ;
 *   T-EV1 réduit — dans une copie isolée qui porte une COPIE FIGÉE des deux registres de Pierre (27/10 : la 27 en
 *           essai n° 2 face à la version 5 ; fixtures, lecture seule), le chemin de la partie A (tri d'octobre,
 *           rangé dans le magasin de la copie), une « nuit » (mettreLaCandidateEnEssai) et le point d'entrée des
 *           candidates proposées : les deux registres restent identiques à l'octet, la 27 garde sa place et son
 *           essai n° 2, rien ne recommence, rien n'est proposé.
 * Partie B (28/10/2026) : la BOUCLE pendant l'essai de la 27 — l'étape de la passe, une correction acceptée (la file
 * attend, proposerUneCandidate n'est jamais appelé), libererLaPlace refusé pour la candidate de la 27 (B17), le
 * formulaire fermé avec sa raison : les deux registres toujours identiques à l'octet, la 27 toujours en essai n° 2.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { preparerCopie, executer, SERVEUR, FIXTURES } from './aides/isolement.mjs';
import { empreinteDuCode, empreinteDeLaCandidate, CANDIDATE_EN_ESSAI, fichiersDuMoteur, MODULES_DU_MOTEUR } from '../src/core/engine/engineVersions.js';

const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-relais-27.mjs');
const SRC = path.join(SERVEUR, 'src');
const VERSIONS_DE_PIERRE = path.join(FIXTURES, 'engine-versions-27-en-essai.json');
const MESURE_DE_PIERRE = path.join(FIXTURES, 'registre-mesure-27-en-essai.json');
const sha1 = (texte) => crypto.createHash('sha1').update(texte).digest('hex');
/** Les empreintes du jour (27/10/2026) : une nouvelle version du moteur les changera — c'est voulu, et cela se dit à Pierre. */
const EMPREINTE_DU_MOTEUR = '16f2459db183a99576365047da98b7777687ef05';
const EMPREINTE_DE_LA_27 = 'f01dd8496f56a415';

test('T-EV3 : l’empreinte du code du moteur reste 16f2459… et celle de la candidate de l’étape 27 f01dd8496f56a415 ; aucun fichier de la boucle de correction (data/correction/) n’entre dans l’empreinte ; la copie figée du registre de Pierre tourne avec CE code', () => {
  assert.equal(empreinteDuCode({ racine: SRC, rafraichir: true }).empreinte, EMPREINTE_DU_MOTEUR);
  assert.equal(empreinteDeLaCandidate(CANDIDATE_EN_ESSAI), EMPREINTE_DE_LA_27);
  const fichiers = fichiersDuMoteur();
  assert.ok(!fichiers.some((f) => f.startsWith('data/correction/')), 'la boucle hors de l’empreinte');
  assert.ok(!MODULES_DU_MOTEUR.dossiers.some((d) => 'data/correction'.startsWith(d)));
  for (const f of fs.readdirSync(path.join(SRC, 'data', 'correction'))) assert.ok(!fichiers.includes(`data/correction/${f}`), f);
  const brut = JSON.parse(fs.readFileSync(VERSIONS_DE_PIERRE, 'utf8'));
  const v5 = brut.versions.find((v) => v.numero === brut.enService);
  assert.equal(v5.code.empreinte, EMPREINTE_DU_MOTEUR, 'la version en service chez Pierre a ce code');
  assert.equal(brut.candidate.id, 'modele-buts-v1');
  assert.equal(brut.candidate.empreinte, EMPREINTE_DE_LA_27);
  assert.equal(brut.candidate.essai.numero, 2);
});

let sortie = null;
function reel() {
  if (sortie) return sortie;
  const copie = preparerCopie({ runtime: { 'engine-versions.json': fs.readFileSync(VERSIONS_DE_PIERRE, 'utf8'), 'registre-mesure.json': fs.readFileSync(MESURE_DE_PIERRE, 'utf8') } });
  try {
    const r = executer(copie, SCRIPT, { maintenant: '2026-11-01T07:00:00.000Z', timeout: 300_000 });
    assert.equal(r.code, 0, r.erreurs.slice(-3000));
    assert.equal(r.reseau, false, 'aucun appel réseau');
    assert.ok(r.json, `sortie illisible : ${r.sortie.slice(-500)}`);
    sortie = r.json;
    return sortie;
  } finally {
    copie.nettoyer();
  }
}

test('T-EV1 réduit : avec les registres de Pierre, le tri d’octobre se fait (lignée {4, 5}, mois PARTIEL depuis le 22/10, familles de buts « en essai ») ; les deux registres restent identiques À L’OCTET, après le tri comme après une nuit', () => {
  const s = reel();
  const fixtures = { versions: sha1(fs.readFileSync(VERSIONS_DE_PIERRE)), mesure: sha1(fs.readFileSync(MESURE_DE_PIERRE)) };
  assert.deepEqual(s.avant, fixtures, 'la copie porte les registres de Pierre');
  assert.deepEqual(s.apresLeTri, fixtures, 'le tri n’écrit aucun registre');
  assert.deepEqual(s.apres, fixtures, 'ni la nuit, ni le point d’entrée refusé');
  assert.deepEqual(s.aTrier, ['2026-10']);
  assert.equal(s.tri.ecrit, true);
  assert.deepEqual(s.tri.lignee.versions, [4, 5]);
  assert.equal(s.tri.lignee.versionEnService, 5);
  assert.equal(s.tri.lignee.couverture.partiel, true);
  assert.equal(s.tri.lignee.couverture.depuis, '2026-10-22T15:45:40.528Z');
  assert.equal(s.tri.statuts['bothTeamsScore|niveau'], 'en-essai');
  assert.equal(s.tri.statuts['result|niveau'], 'trop-tot', 'un mois partiel assez fourni : compté, mais seul');
  assert.deepEqual(s.tri.leviers, [], 'rien n’est visé pendant l’essai de la 27');
  assert.ok(s.tri.ecartees.some(([raison, n]) => raison === 'autreVersion' && n > 0), 'les pronostics de la version 3 : une autre lignée');
});

test('T-EV1 réduit : la candidate de l’étape 27 garde sa place et son essai n° 2 — la carte, la nuit (aucun recommencement), et le point d’entrée des candidates proposées reste fermé (« déclarée dans le code »)', () => {
  const s = reel();
  assert.deepEqual(s.carteAvant, { candidate: 'modele-buts-v1', statut: 'en-essai', essai: 2, enService: 5, adoption: 'pas-encore-jugee' });
  assert.deepEqual(s.carteApres, s.carteAvant);
  assert.deepEqual(s.candidateAvant, { id: 'modele-buts-v1', essai: 2, empreinte: EMPREINTE_DE_LA_27 });
  assert.deepEqual(s.candidateApres, s.candidateAvant);
  assert.deepEqual(s.nuit, { change: false, recommence: false, candidate: 'modele-buts-v1', essai: 2 });
  assert.equal(s.place.prise, true);
  assert.equal(s.place.candidate.id, 'modele-buts-v1');
  assert.match(s.proposer, /^CandidateInvalide : Une candidate est déclarée dans le code \(« modele-buts-v1 »\)/);
});

test('la partie A ne retouche AUCUNE ligne du chemin de nuit de l’essai : engineVersions.js, gelPronostics.js, depot.js, moteurABlanc.js, essaiCandidate.js et engineConfig.js ne citent pas la boucle de correction ; aucun module de la boucle n’est importé par eux', () => {
  for (const f of ['core/engine/engineVersions.js', 'data/enregistreurs/gelPronostics.js', 'data/enregistreurs/depot.js', 'data/enregistreurs/moteurABlanc.js', 'bench/essaiCandidate.js', 'core/engine/engineConfig.js']) {
    assert.doesNotMatch(fs.readFileSync(path.join(SRC, f), 'utf8'), /data\/correction|\.\.\/correction\/|correction_tri|depotCorrections/, f);
  }
});

test('partie B — pendant l’essai de la 27, l’étape de la passe ne retrie rien (octobre est figé), ne propose RIEN, laisse la place à la 27 ; une correction ACCEPTÉE attend en file, dit en mots (proposerUneCandidate n’est jamais appelé) ; les deux registres restent identiques à l’octet, la 27 garde son essai n° 2', () => {
  const s = reel();
  const fixtures = { versions: sha1(fs.readFileSync(VERSIONS_DE_PIERRE)), mesure: sha1(fs.readFileSync(MESURE_DE_PIERRE)) };
  const p = s.partieB.passe;
  assert.equal(p.status, 'ok', JSON.stringify(p.erreurs));
  assert.deepEqual(p.tris, [], 'octobre est déjà figé');
  assert.deepEqual(p.creees, []);
  assert.equal(p.place.par, 'code');
  assert.equal(p.place.candidate, 'modele-buts-v1');
  const a = s.partieB.avecUneAcceptee;
  assert.equal(a.miseALEssai.attend, true);
  assert.equal(a.miseALEssai.mise, null);
  // Vérification finale, constat 2 : la même phrase, juste aussi avec une correction en file.
  assert.equal(a.miseALEssai.phrase, 'La candidate « Modèle de buts unique » (étape 27) est en essai à blanc, verdict attendu au plus tôt le 14/11/2026 : aucune correction ne passe à blanc avant son verdict.');
  assert.match(a.summary, /^File d’attente : La candidate « Modèle de buts unique » \(étape 27\) est en essai à blanc, verdict attendu au plus tôt le 14\/11\/2026 : aucune correction ne passe à blanc avant son verdict( ;|\.)/);
  assert.equal(s.partieB.etatDeLaFile, 'acceptee');
  assert.deepEqual(s.apresPartieB, fixtures);
  assert.deepEqual(s.carteApresPartieB, s.carteAvant);
});

test('partie B — B17 : libererLaPlace REFUSE la candidate de l’étape 27 (elle ne vient pas de la boucle de correction) ; le formulaire est fermé pendant son essai, avec sa raison (409) ; l’état de la boucle le dit (place prise, formulaire fermé, familles de buts « en essai » au dernier tri)', () => {
  const b = reel().partieB;
  assert.deepEqual(b.liberer, { libere: false, raison: 'autre-origine' });
  assert.deepEqual([b.proposer.code, b.proposer.raison], [409, 'essai-27']);
  assert.ok(b.proposer.error.startsWith('Le formulaire est fermé pendant l’essai du modèle de buts (étape 27) : rien ne peut être essayé à blanc avant son verdict'), b.proposer.error);
  assert.equal(b.etat.place.par, 'code');
  assert.equal(b.etat.formulaireOuvert, false);
  assert.equal(b.etat.dernierTri, '2026-10');
  assert.equal(b.etat.enEssai.candidate, 'modele-buts-v1');
});
