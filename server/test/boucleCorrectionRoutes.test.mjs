/**
 * La boucle de correction (étape 26 du plan, partie B, 28/10/2026) — LES ROUTES /api/corrections et leurs gardes,
 * dans une copie isolée qui porte une COPIE FIGÉE des deux registres de Pierre (la candidate de l'étape 27 en essai
 * n° 2, déclarée dans le code de la copie) : les lectures à vide et leur temps, le formulaire FERMÉ pendant l'essai de
 * la 27 (avec sa raison), les paramètres refusés, une passe en cours (chaque écriture refusée, B24), et une table
 * illisible dite « illisible », jamais « aucune proposition » (B30). Les deux registres restent identiques à l'octet.
 *   node --test test/boucleCorrectionRoutes.test.mjs        (depuis server/)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { preparerCopie, executer, SERVEUR, FIXTURES } from './aides/isolement.mjs';

const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-boucle-routes.mjs');
const VERSIONS_DE_PIERRE = path.join(FIXTURES, 'engine-versions-27-en-essai.json');
const MESURE_DE_PIERRE = path.join(FIXTURES, 'registre-mesure-27-en-essai.json');
const sha1 = (texte) => crypto.createHash('sha1').update(texte).digest('hex');

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

test('GET /api/corrections, à vide, pendant l’essai de l’étape 27 : disponible, aucun tri, aucune proposition ; la place PRISE par « Modèle de buts unique » (verdict au plus tôt le 14/11/2026) ; le formulaire FERMÉ, avec sa raison ; la lecture prend moins de 250 ms (rien n’est calculé)', () => {
  const s = reel();
  assert.equal(s.etat.disponible, true);
  assert.equal(s.etat.dernierTri, null);
  assert.deepEqual(s.etat.propositions, []);
  assert.deepEqual(s.etat.aDecider, []);
  assert.equal(s.etat.place.prise, true);
  assert.equal(s.etat.place.par, 'code');
  // Vérification finale, constat 2 : une phrase juste sans aucune correction en file (ni « une autre », ni « la correction attend »).
  assert.equal(s.etat.place.phrase, 'La candidate « Modèle de buts unique » (étape 27) est en essai à blanc, verdict attendu au plus tôt le 14/11/2026 : aucune correction ne passe à blanc avant son verdict.');
  assert.equal(s.etat.formulaire.ouvert, false);
  assert.equal(s.etat.formulaire.raison, 'Le formulaire est fermé pendant l’essai du modèle de buts (étape 27) : rien ne peut être essayé à blanc avant son verdict (au plus tôt le 14/11/2026).');
  assert.ok(s.etat.formulaire.leviers.every(([, ouvert]) => ouvert === false));
  assert.equal(s.etat.regles.regards, 264);
  assert.match(s.etat.regles.regardsDits, /^22 cases × 12 mois : la marge du hasard en tient compte\.$/);
  assert.doesNotMatch(JSON.stringify(s.etat), /\bK de\b|lignée|variantes? essayées?/i, 'sans jargon');
  assert.ok(s.lectureMs < 250, `${s.lectureMs} ms`);
});

test('Santé du moteur, avant le premier tri : « pas encore mesuré » avec l’étape 26, le premier tri le 1er du mois à partir de 6 h ; le lien vers Historique moteur', () => {
  const b = reel().sante;
  assert.equal(b.etat, 'pas-mesure');
  assert.match(b.phrase, /^Pas encore mesuré : la boucle de correction \(étape 26\) n’a pas encore trié de mois — le premier tri se fait le 1er du mois à partir de 6 h, après le gel de la calibration\./);
  assert.equal(b.lien.chemin, '/historique-moteur');
  assert.deepEqual(b.aAccepter, []);
  assert.equal(b.etape, '26');
});

test('GET /tri et /journal : un mois est requis, lisible, pas à venir (400) ; un mois pas encore trié rend { tri: null } et la raison ; la limite du journal est de 1 à 200 ; « avant » un entier', () => {
  const s = reel();
  assert.equal(s.tri.sansMois.code, 400);
  assert.equal(s.tri.moisIllisible.code, 400);
  assert.equal(s.tri.moisAVenir.code, 400);
  assert.equal(s.tri.pasEncore.tri, null);
  assert.match(s.tri.pasEncore.raison, /pas encore trié/);
  assert.equal(s.journal.tropLong.code, 400);
  assert.equal(s.journal.avantIllisible.code, 400);
  assert.deepEqual(s.journal.vide, { entrees: [], suivant: null });
});

test('POST /proposer pendant l’essai de l’étape 27 : refusé (409) avec la phrase de la décision 8 — rien d’écrit ; une correction inconnue : 404 ; sans « vue » : 400', () => {
  const s = reel();
  assert.deepEqual([s.proposer.code, s.proposer.raison], [409, 'essai-27']);
  assert.equal(s.proposer.error, 'Le formulaire est fermé pendant l’essai du modèle de buts (étape 27) : rien ne peut être essayé à blanc avant son verdict (au plus tôt le 14/11/2026). Rien n’a été proposé.');
  for (const k of ['inconnue', 'bancInconnue', 'retirerInconnue']) assert.equal(s[k].code, 404, k);
  assert.equal(s.sansVue.code, 400);
  assert.equal(s.propositionsApres, 0);
});

test('B24 — pendant une passe (le verrou d’un autre processus), CHAQUE écriture est refusée (409, « réessayez ») ; la lecture répond', () => {
  const p = reel().pendantUnePasse;
  for (const k of ['proposer', 'accepter', 'refuser', 'banc', 'retirer']) {
    assert.equal(p[k].code, 409, k);
    assert.equal(p[k].raison, 'passe-en-cours', k);
  }
  assert.equal(p.lecture, 200);
});

test('B30 — une table qui ne se lit pas (une ligne abîmée) : la route répond 200 { disponible: false, illisible: true, raison }, JAMAIS « aucune proposition » ; Santé du moteur dit « illisible pour l’instant »', () => {
  const s = reel();
  assert.equal(s.illisible.code, 200);
  assert.equal(s.illisible.corps.disponible, false);
  assert.equal(s.illisible.corps.illisible, true);
  assert.match(s.illisible.corps.raison, /^les tables de la boucle de correction ne se lisent pas : /);
  assert.equal(s.illisible.corps.propositions, undefined);
  assert.equal(s.santeIllisible.etat, 'indisponible');
  assert.match(s.santeIllisible.phrase, /^Illisible pour l’instant : les tables de la boucle de correction ne se lisent pas/);
});

test('les deux registres de Pierre (copie figée) restent identiques à l’octet : avant, après les écritures refusées, et à la fin', () => {
  const s = reel();
  const fixtures = { versions: sha1(fs.readFileSync(VERSIONS_DE_PIERRE)), mesure: sha1(fs.readFileSync(MESURE_DE_PIERRE)) };
  assert.deepEqual(s.avant, fixtures);
  assert.deepEqual(s.apresLesEcritures, fixtures);
  assert.deepEqual(s.apres, fixtures);
});
