/**
 * LA FIN DU CALCUL À PART DES COUPES (correctif du 09/11/2026, après la première vraie nuit de l'étape 36) :
 *   node --test test/coupesFinDuCalcul.test.mjs        (depuis server/)
 *
 *   T-FC1 un enfant qui envoie une rafale de gros morceaux puis sa fin, et s'arrête aussitôt (exit 0 dans le rappel de
 *         l'envoi, comme coupesEnfant.js) : la promesse rend la fin et tous les morceaux, même quand le serveur met du
 *         temps à lire chaque morceau — sous Windows, 'exit' arrive parfois AVANT le dernier message (vu le 09/11 :
 *         « arrêté sans réponse (code 0) ») ; le calcul attend 'close', qui n'arrive qu'une fois le canal vidé ;
 *   T-FC2 un enfant qui s'arrête sans rien répondre : rejet « arrêté sans réponse (code N) », jamais une attente sans fin.
 * Aucune base ouverte, aucun réseau : deux faux enfants écrits dans un dossier temporaire, effacé à la fin.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { calculerAPart } from '../src/data/coupes/coupesNuit.js';

const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-coupes-fin-'));
const RAFALE = path.join(dossier, 'enfant-rafale.cjs');
fs.writeFileSync(
  RAFALE,
  `process.once('message', (m) => {
  const lignes = Array.from({ length: m.taille }, (_, i) => ({ i, grille: new Float64Array(441).fill(i / 7) }));
  for (let k = 0; k < m.n; k++) process.send({ morceau: { type: 'lignes', lignes } });
  process.send({ fin: true, bilan: { n: m.n } }, () => process.exit(0));
});
`
);
const MUET = path.join(dossier, 'enfant-muet.cjs');
fs.writeFileSync(MUET, "process.once('message', () => process.exit(3));\n");
after(() => fs.rmSync(dossier, { recursive: true, force: true }));

test('T-FC1 : la fin arrive toujours, même quand le serveur lit lentement chaque morceau', async () => {
  for (let essai = 1; essai <= 3; essai++) {
    let recus = 0;
    const fin = await calculerAPart({
      message: { n: 10, taille: 200 },
      fichier: RAFALE,
      options: [],
      delaiMs: 60_000,
      surMorceau: (m) => {
        assert.equal(m.type, 'lignes');
        recus++;
        const t = Date.now();
        while (Date.now() - t < 150); // le serveur occupé à autre chose
      }
    });
    assert.equal(fin.fin, true, `essai ${essai} : la fin manque`);
    assert.equal(fin.bilan?.n, 10, `essai ${essai} : bilan inattendu`);
    assert.equal(recus, 10, `essai ${essai} : ${recus} morceaux reçus sur 10`);
  }
});

test('T-FC2 : un enfant muet est rejeté « sans réponse », avec son code', async () => {
  await assert.rejects(calculerAPart({ message: {}, fichier: MUET, options: [], delaiMs: 60_000 }), /arrêté sans réponse \(code 3\)/);
});
