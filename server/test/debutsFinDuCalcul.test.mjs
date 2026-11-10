/**
 * LA FIN DU CALCUL À PART DES DÉBUTS DE SAISON (étape 35, lot 1b, 10/11/2026 ; le piège du 09/11/2026, patron de
 * coupesFinDuCalcul.test.mjs) :
 *   node --test test/debutsFinDuCalcul.test.mjs        (depuis server/)
 *
 *   T-FC1 un enfant qui envoie une rafale de gros morceaux puis sa fin, et s'arrête aussitôt (exit 0 dans le rappel de
 *         l'envoi, comme debutsEnfant.js) : la promesse rend la fin et tous les morceaux, même quand le serveur met du
 *         temps à lire chaque morceau — sous Windows, 'exit' arrive parfois AVANT le dernier message ; le calcul attend
 *         'close', qui n'arrive qu'une fois le canal vidé (trois essais) ;
 *   T-FC2 un enfant qui s'arrête sans rien répondre : rejet « arrêté sans réponse (code N) », jamais une attente sans fin ;
 *         le jeton du calcul lourd rendu dans les deux cas.
 * Aucune base ouverte, aucun réseau : deux faux enfants écrits dans un dossier temporaire, effacé à la fin.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { calculerAPart } from '../src/data/debutsDeSaison/debutsNuit.js';
import { commencerCalculLourd } from '../src/utils/calculLourd.js';

const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-debuts-fin-'));
const RAFALE = path.join(dossier, 'enfant-rafale.cjs');
fs.writeFileSync(
  RAFALE,
  `process.once('message', (m) => {
  const lignes = Array.from({ length: m.taille }, (_, i) => ({ club: i, entrees: 'x'.repeat(1500), bras: new Float64Array(64).fill(i / 7) }));
  for (let k = 0; k < m.n; k++) process.send({ morceau: { type: k % 2 ? 'fiches' : 'clubs', lignes } });
  process.send({ fin: true, bilan: { n: m.n } }, () => process.exit(0));
});
`
);
const MUET = path.join(dossier, 'enfant-muet.cjs');
fs.writeFileSync(MUET, "process.once('message', () => process.exit(3));\n");
after(() => fs.rmSync(dossier, { recursive: true, force: true }));

/** Le jeton est-il libre ? (pris puis rendu aussitôt). */
function jetonLibre() {
  try {
    commencerCalculLourd('essai du jeton')();
    return true;
  } catch {
    return false;
  }
}

test('T-FC1 : la fin arrive toujours, même quand le serveur lit lentement chaque morceau', async () => {
  for (let essai = 1; essai <= 3; essai++) {
    let recus = 0;
    const fin = await calculerAPart({
      message: { n: 10, taille: 250 },
      fichier: RAFALE,
      options: [],
      delaiMs: 60_000,
      surMorceau: (m) => {
        assert.ok(['clubs', 'fiches'].includes(m.type));
        assert.equal(m.lignes.length, 250);
        recus++;
        const t = Date.now();
        while (Date.now() - t < 150); // le serveur occupé à autre chose
      }
    });
    assert.equal(fin.fin, true, `essai ${essai} : la fin manque`);
    assert.equal(fin.bilan?.n, 10, `essai ${essai} : bilan inattendu`);
    assert.equal(recus, 10, `essai ${essai} : ${recus} morceaux reçus sur 10`);
    assert.ok(jetonLibre(), `essai ${essai} : le jeton n’est pas rendu`);
  }
});

test('T-FC2 : un enfant muet est rejeté « sans réponse », avec son code ; le jeton rendu', async () => {
  await assert.rejects(calculerAPart({ message: {}, fichier: MUET, options: [], delaiMs: 60_000 }), /arrêté sans réponse \(code 3\)/);
  assert.ok(jetonLibre(), 'le jeton n’est pas rendu');
});
