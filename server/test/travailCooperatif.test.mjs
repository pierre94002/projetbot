/**
 * Rendre la main à la boucle d'événements pendant un long calcul
 * (utils/travailCooperatif.js) — retouche du 07/10/2026 au soir.
 *   node --test test/travailCooperatif.test.mjs        (depuis server/)
 *
 * Fonctions pures, et des fichiers TEMPORAIRES sous le dossier d'essais (le bac :
 * bac-a-sable\essais-tests ; le dépôt : le dossier temporaire du système) :
 * ni base, ni réseau, ni donnée de Pierre. Le contrôle complet du carnet de
 * santé qui s'en sert est dans carnetSante.test.mjs (section 8).
 *
 *  1. executerSansPause : jusqu'au bout, les points d'arrêt ignorés, la valeur rendue.
 *  2. executerEnRendantLaMain : une pause à chaque point d'arrêt, dans l'ordre, avec
 *     l'étiquette donnée ; une pause qui échoue referme le générateur (ses
 *     requêtes en cours avec lui).
 *  3. creerPauses : `pause` rend toujours la main, `siLongtemps` seulement après
 *     `pasMs` de travail ; le plus long moment sans la rendre est mesuré, et où.
 *  4. lireJsonEnDeuxTemps : le texte, un point d'arrêt, l'analyse ; un fichier
 *     absent ou illisible se traite comme avec readJsonFile.
 *  5. ensureRegistries ne compte plus deux millions de lignes quand l'annuaire est rempli.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { executerSansPause, executerEnRendantLaMain, creerPauses, lireJsonEnDeuxTemps, rendreLaMainParDefaut, PAS_MS } from '../src/utils/travailCooperatif.js';
import { readJsonFile } from '../src/utils/atomicJson.js';
import { ensureRegistries } from '../src/data/db/identityRegistry.js';
import { RACINE_ESSAIS } from './aides/isolement.mjs';

const attendre = (ms) => {
  const debut = performance.now();
  while (performance.now() - debut < ms);
};
function* compte(journal = []) {
  journal.push('départ');
  yield 'a';
  journal.push('milieu');
  yield 'b';
  journal.push('fin');
  return 42;
}
/** Un dossier d'essai à soi, effacé ensuite (aucun lien dedans). */
function dossierDEssai() {
  fs.mkdirSync(RACINE_ESSAIS, { recursive: true });
  return fs.mkdtempSync(path.join(RACINE_ESSAIS, 'cm-cooperatif-'));
}

// ================================================================== 1. sans pause

test('executerSansPause : le générateur va jusqu’au bout sans que rien n’interrompe, les points d’arrêt sont ignorés, sa valeur est rendue', () => {
  const journal = [];
  assert.equal(executerSansPause(compte(journal)), 42);
  assert.deepEqual(journal, ['départ', 'milieu', 'fin']);
  // Un générateur qui ne rend rien : undefined, comme une fonction sans return.
  assert.equal(executerSansPause((function* () {})()), undefined);
  // Une erreur du calcul remonte telle quelle.
  assert.throws(
    () =>
      executerSansPause(
        (function* () {
          yield 1;
          throw new Error('en plein calcul');
        })()
      ),
    /en plein calcul/
  );
});

// ============================================================ 2. en rendant la main

test('executerEnRendantLaMain : une pause à chaque point d’arrêt, dans l’ordre, avec son étiquette ; la valeur rendue est celle du générateur', async () => {
  const journal = [];
  const pauses = [];
  const valeur = await executerEnRendantLaMain(compte(journal), async (ou) => {
    // Quand la pause a lieu, le générateur n'a pas encore repris : il attend à son point d'arrêt.
    pauses.push([ou, journal.length]);
  });
  assert.equal(valeur, 42);
  assert.deepEqual(pauses, [['a', 1], ['b', 2]]);
  assert.deepEqual(journal, ['départ', 'milieu', 'fin']);
});

test('executerEnRendantLaMain : la boucle d’événements passe vraiment entre deux points d’arrêt (une tâche concurrente avance)', async () => {
  let tours = 0;
  let actif = true;
  const concurrent = () => {
    if (!actif) return;
    tours++;
    setImmediate(concurrent);
  };
  setImmediate(concurrent);
  await executerEnRendantLaMain(
    (function* () {
      for (let i = 0; i < 20; i++) yield `tour ${i}`;
    })(),
    () => rendreLaMainParDefaut()
  );
  actif = false;
  assert.ok(tours >= 10, `${tours} tours de la tâche concurrente pour 20 points d'arrêt`);
});

test('executerEnRendantLaMain : une pause qui échoue referme le générateur (son finally s’exécute : les requêtes en cours sont refermées) avant que l’erreur ne remonte', async () => {
  let ferme = false;
  function* avecRequete() {
    try {
      yield 'x';
      yield 'y';
    } finally {
      ferme = true;
    }
  }
  await assert.rejects(
    executerEnRendantLaMain(avecRequete(), async () => {
      throw new Error('refus de la pause');
    }),
    /refus de la pause/
  );
  assert.equal(ferme, true);
  // Une erreur du calcul lui-même passe aussi, et le générateur est fini.
  await assert.rejects(
    executerEnRendantLaMain(
      (function* () {
        yield 1;
        throw new Error('calcul en échec');
      })(),
      async () => {}
    ),
    /calcul en échec/
  );
});

// ======================================================================= 3. les pauses

test('creerPauses : `pause` rend toujours la main (avec l’étiquette), `siLongtemps` seulement après `pasMs` de travail ; pasMs 0 = à chaque fois, pasMs infini = jamais', async () => {
  assert.equal(PAS_MS, 25);
  const appels = [];
  const toujours = creerPauses({ pasMs: 0, rendreLaMain: async (ou) => appels.push(ou) });
  await toujours.siLongtemps('a');
  await toujours.siLongtemps('b');
  assert.deepEqual(appels, ['a', 'b']);
  appels.length = 0;
  const jamais = creerPauses({ pasMs: Infinity, rendreLaMain: async (ou) => appels.push(ou) });
  await jamais.siLongtemps('a');
  await jamais.siLongtemps('b');
  assert.deepEqual(appels, []);
  await jamais.pause('fin d’étape');
  assert.deepEqual(appels, ['fin d’étape'], '`pause` rend la main même quand `siLongtemps` ne le fait jamais');
  assert.equal(jamais.bilan().pauses, 1);
});

test('creerPauses : le plus long moment passé sans rendre la main est mesuré, avec l’endroit où il s’est terminé ; le dernier tronçon compte aussi (« bilan »)', async () => {
  const appels = [];
  const p = creerPauses({ pasMs: 25, rendreLaMain: async (ou) => appels.push(ou) });
  await p.pause('départ'); // le premier tronçon, depuis la création : presque rien
  attendre(40);
  await p.siLongtemps('lent'); // 40 ms de travail depuis la dernière pause : elle a lieu
  attendre(5);
  await p.siLongtemps('court'); // 5 ms : pas de pause
  assert.deepEqual(appels, ['départ', 'lent']);
  let b = p.bilan();
  assert.equal(b.blocMaxOu, 'lent');
  assert.ok(b.blocMaxMs >= 39 && b.blocMaxMs < 500, `${b.blocMaxMs} ms`);
  assert.equal(b.pauses, 2);
  assert.equal(Number.isInteger(b.blocMaxMs), true, 'arrondi à la milliseconde, comme aux autres étapes');
  // Un dernier tronçon plus long que tous les autres : « bilan ».
  attendre(60);
  b = p.bilan();
  assert.equal(b.blocMaxOu, 'bilan');
  assert.ok(b.blocMaxMs >= 59, `${b.blocMaxMs} ms`);
  // La mesure ne dépend pas de l'heure figée des essais : elle part de l'horloge du processus.
  const dateReelle = Date.now;
  Date.now = () => 0;
  try {
    const figee = creerPauses({ pasMs: 25, rendreLaMain: async () => {} });
    attendre(30);
    await figee.siLongtemps('x');
    assert.equal(figee.bilan().pauses, 1, 'une pause malgré Date.now() figée');
  } finally {
    Date.now = dateReelle;
  }
});

test('creerPauses.attendre (étape 19) : un travail fait AILLEURS (le fil du juge du banc) s’attend sans compter comme un moment passé sans rendre la main ; le tronçon d’avant compte ; une erreur remonte', async () => {
  const p = creerPauses({ pasMs: 25, rendreLaMain: async () => {} });
  await p.pause('départ');
  attendre(30);
  // 30 ms de travail ici, puis 120 ms d'attente d'un autre fil (le fil principal est libre pendant ce temps).
  const r = await p.attendre(new Promise((fin) => setTimeout(() => fin('verdict'), 120)), 'case lourde');
  assert.equal(r, 'verdict');
  let b = p.bilan();
  assert.equal(b.blocMaxOu, 'case lourde', 'le tronçon d’avant l’envoi est mesuré');
  assert.ok(b.blocMaxMs >= 29 && b.blocMaxMs < 110, `${b.blocMaxMs} ms : l’attente ne compte pas`);
  assert.equal(b.pauses, 2);
  // Après l'attente, la mesure repart de zéro ; une erreur de l'autre fil remonte telle quelle.
  await assert.rejects(p.attendre(Promise.reject(new Error('panne du fil')), 'x'), /panne du fil/);
  b = p.bilan();
  assert.ok(b.blocMaxMs < 110);
});

// ============================================================== 4. lire un fichier JSON

test('lireJsonEnDeuxTemps : le texte, un point d’arrêt, l’analyse — la même valeur que readJsonFile ; absent : la valeur donnée, sans rien lire', async () => {
  const dossier = dossierDEssai();
  try {
    const fichier = path.join(dossier, 'calendrier.json');
    const contenu = Array.from({ length: 500 }, (_, i) => ({ id: `e${i}`, date: '2026-10-05', homeName: `Équipe ${i}`, awayName: 'Autre', homeGoals: i % 5, awayGoals: null, imbrique: { liste: [1, 2, { x: 'a"b\\c\n' }] } }));
    fs.writeFileSync(fichier, JSON.stringify(contenu, null, 2));
    const etiquettes = [];
    const lu = await executerEnRendantLaMain(lireJsonEnDeuxTemps(fichier, [], 'calendrier'), async (ou) => etiquettes.push(ou));
    assert.deepEqual(lu, contenu);
    assert.deepEqual(lu, readJsonFile(fichier, []));
    assert.deepEqual(etiquettes, ['calendrier', 'calendrier'], 'un point d’arrêt avant la lecture, un autre entre la lecture et l’analyse');
    // Absent : la valeur donnée, aucun point d'arrêt.
    const absent = [];
    assert.deepEqual(await executerEnRendantLaMain(lireJsonEnDeuxTemps(path.join(dossier, 'absent.json'), ['rien'], 'x'), async (ou) => absent.push(ou)), ['rien']);
    assert.deepEqual(absent, []);
    assert.equal(executerSansPause(lireJsonEnDeuxTemps(path.join(dossier, 'absent.json'), null, 'x')), null);
  } finally {
    fs.rmSync(dossier, { recursive: true, force: true });
  }
});

test('lireJsonEnDeuxTemps : un fichier illisible (écriture en cours, OneDrive) se traite comme avec readJsonFile — nouvelles tentatives, puis la même erreur « illisible », jamais un fichier pris pour vide', async () => {
  const dossier = dossierDEssai();
  try {
    const fichier = path.join(dossier, 'abime.json');
    fs.writeFileSync(fichier, '{ pas du json');
    await assert.rejects(executerEnRendantLaMain(lireJsonEnDeuxTemps(fichier, [], 'x'), async () => {}), /abime\.json illisible/);
  } finally {
    fs.rmSync(dossier, { recursive: true, force: true });
  }
});

// =================================================================== 5. l'annuaire

test('ensureRegistries : avec un annuaire rempli, les deux millions de lignes de joueurs ne sont PAS comptées (400 ms au premier classement lu de chaque processus) ; le résultat est le même', () => {
  const requetes = [];
  const faux = {
    prepare: (sql) => {
      requetes.push(sql);
      return { get: () => ({ n: /FROM people/.test(sql) ? 87_590 : 2_226_891 }) };
    }
  };
  ensureRegistries({ database: faux });
  assert.deepEqual(requetes, ['SELECT COUNT(*) n FROM people']);
  // Une fois par processus : la seconde lecture ne demande rien.
  ensureRegistries({ database: faux });
  assert.equal(requetes.length, 1);
});
