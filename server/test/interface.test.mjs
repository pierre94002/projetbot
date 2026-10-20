/**
 * L'interface se construit (étape 3 du plan).
 *   node --test test/interface.test.mjs        (depuis server/)
 *
 * Lance ui/scripts/verifier-interface.mjs : chaque composant .vue compile (et
 * importe les composants qu'il emploie), puis Vite construit l'interface dans
 * un dossier TEMPORAIRE du système, effacé ensuite. Rien n'est écrit dans
 * ui/ : ni dist, ni fichier temporaire de configuration, ni cache.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { SERVEUR } from './aides/isolement.mjs';
import * as bac from '../src/config/bacASable.js';

const UI = path.resolve(SERVEUR, '..', 'ui');
const SCRIPT = path.join(UI, 'scripts', 'verifier-interface.mjs');
const pret = fs.existsSync(path.join(UI, 'node_modules', 'vite')) && fs.existsSync(SCRIPT);

/** Ce qui se voit de ui/ : ses entrées, et la date de dist s'il existe (construction de Pierre). */
function etatUi() {
  const dist = path.join(UI, 'dist');
  return { entrees: fs.readdirSync(UI).sort(), dist: fs.existsSync(dist) ? fs.statSync(dist).mtimeMs : null, dossier: fs.statSync(UI).mtimeMs };
}

test("l'interface compile et se construit, hors du dossier de l'interface", { skip: pret ? false : 'ui/node_modules ou le script de vérification manque', timeout: 180_000 }, () => {
  const avant = etatUi();
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !bac.MOTIF_SECRET.test(k) && !bac.SECRETS.includes(k) && !/^NODE_TEST/.test(k)));
  const r = spawnSync(process.execPath, [SCRIPT], { cwd: UI, env, encoding: 'utf8', timeout: 170_000 });
  const ligne = (r.stdout ?? '').trim().split(/\r?\n/).pop();
  let rapport = null;
  try {
    rapport = JSON.parse(ligne);
  } catch {
    // laissé à null
  }
  assert.ok(rapport, `sortie illisible : ${r.stdout}\n${r.stderr}`);
  assert.deepEqual(rapport.vue.erreurs, [], 'composants qui ne compilent pas');
  assert.ok(rapport.vue.fichiers >= 50, `${rapport.vue.fichiers} composants`);
  assert.equal(rapport.build.ok, true, `construction : ${JSON.stringify(rapport.build)}\n${r.stderr.slice(-2000)}`);
  assert.ok(rapport.build.scripts >= 10);
  assert.equal(rapport.dossierIntact, true);
  assert.equal(r.status, 0, r.stderr.slice(-2000));
  assert.deepEqual(etatUi(), avant, 'quelque chose a été écrit dans ui/');
});
