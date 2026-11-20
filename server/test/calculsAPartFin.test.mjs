/**
 * LA FIN DES CALCULS À PART (correctif « close » du 14/11/2026 ; patron : coupesFinDuCalcul.test.mjs, piège du 09/11/2026) :
 *   node --test test/calculsAPartFin.test.mjs        (depuis server/)
 *
 * Sous Windows, quand le serveur est occupé à lire de gros messages, l'événement 'exit' d'un enfant (fork) arrive parfois
 * AVANT son dernier message ; 'close' n'arrive qu'une fois le canal vidé. Un calcul à part qui conclut « arrêté sans réponse »
 * sur 'exit' perd alors une fin bel et bien envoyée (vu en vrai sur les coupes le 09/11/2026 ; mesuré sur ce PC le 14/11 avec
 * le faux enfant de T-CF3 : à 'exit', 10 morceaux reçus sur 10 mais pas la fin ; à 'close', la fin aussi — trois fois sur trois).
 *
 *   T-CF1 (statique) aucun fichier sous server/src n'écoute 'exit' d'un enfant ou d'un fil (hors `process`), sauf la LISTE
 *         BLANCHE ci-dessous, exacte (chaque entrée écoute encore 'exit') ; chaque fichier qui lance un enfant (fork) hors de
 *         cette liste écoute 'close' et y conclut « sans réponse » ; les quinze corrigés (treize le 14/11, coupes et débuts
 *         avant) nommés un à un ; l'appel optionnel (`enfant?.on('exit'`) compris ; garde de repli (vérification du 14/11,
 *         constat 6) : aucun littéral 'exit' hors commentaires (hors `process.on` / `process.once`) dans les quinze corrigés,
 *         exactement un (son écoute) par entrée de la liste blanche ;
 *   T-CF2 la raison de l'entrée « fil » de la liste blanche (bench/jugeAPart.js) : un Worker (worker_threads) n'émet jamais
 *         'close', et ses messages arrivent tous AVANT son 'exit' (Node vide ses ports avant de le signaler) — trois essais ;
 *   T-CF3 pour chaque calcul à part exporté qui accepte un `fichier` d'enfant et corrigé le 14/11 (cartons, combinaison,
 *         contexte, joueurs ; les coupes et les débuts ont déjà le leur) : un faux enfant « rafale » (10 gros morceaux puis sa
 *         fin, arrêt aussitôt), le serveur lent (150 ms par morceau) → la fin et les 10 morceaux toujours rendus (trois essais),
 *         le jeton du calcul lourd rendu ;
 *   T-CF4 les mêmes avec un faux enfant muet → rejet « arrêté sans réponse (code 3) », jamais une attente sans fin ; jeton rendu ;
 *   T-CF5 (statique, lot A3 du 17/11/2026) les scripts de banc sous server/scripts qui lancent un enfant (fork) : aucun n'écoute
 *         plus 'exit' pour conclure ; chacun conclut « sans réponse » sur 'close' ; les six nommés un à un (les débuts depuis le
 *         10/11, puis cartons-corners, coupes, etape38, joueurs-a-blanc, match-context le 17/11) ; même garde de repli.
 * Aucune base ouverte, aucun réseau : des faux enfants écrits dans un dossier temporaire, effacé à la fin.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { calculerAPart as cartons } from '../src/data/cartons/cartonsNuit.js';
import { calculerAPart as combinaison } from '../src/data/combinaison/combinaisonNuit.js';
import { calculerAPart as contexte } from '../src/data/contexte/contexteNuit.js';
import { calculerAPart as joueurs } from '../src/data/joueurs/joueursNuit.js';
import { commencerCalculLourd } from '../src/utils/calculLourd.js';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));

/**
 * LA LISTE BLANCHE : les seuls fichiers qui écoutent encore 'exit', chacun avec sa raison.
 */
const LISTE_BLANCHE = Object.freeze({
  // Légitime : un FIL (worker_threads), pas un enfant. Un Worker n'a pas d'événement 'close' (l'écouter ne signalerait jamais
  // un fil mort) et Node vide ses ports de messages AVANT d'émettre 'exit' (T-CF2) : le piège du 09/11 ne le touche pas.
  'bench/jugeAPart.js': 'fil',
  // Laissés : modules du SCEAU de la 46 (24 modules, PROJET de la 46 § 13 ; sommaire des lots 2, § 2 point 4 : « ces fichiers
  // ne se modifient jamais »). Leur correctif attend une décision de l'orchestrateur (après le banc de la 46, ou sous un
  // second sceau) ; d'ici là, ils gardent 'exit' (aucun « sans réponse » dans l'historique des passes).
  'data/db/dayTable.js': 'sceau-46',
  'data/simulation/simulationNuit.js': 'sceau-46'
});

/**
 * P4b-1 (RC-13, 17/11/2026) : l'écoute du processus LUI-MÊME (pas d'un enfant, pas d'un fil), sous un autre nom que
 * `process` (le processus y est injectable pour les essais). Un ensemble à part, jamais la liste blanche : sautée par
 * l'étape 1, et vérifiée : le fichier ne lance ni enfant (fork) ni fil (new Worker).
 */
const ECOUTE_DU_PROCESSUS = Object.freeze({
  'data/recette/journalDeLaRecette.js': 'CR-14 : écoute du processus lui-même'
});

/** Les quinze calculs à part qui concluent sur 'close' : les coupes (09/11), les débuts (10/11), puis les treize du 14/11. */
const CORRIGES = Object.freeze([
  'data/coupes/coupesNuit.js',
  'data/debutsDeSaison/debutsNuit.js',
  'data/bettingMapCalcul.js',
  'data/cartons/cartonsNuit.js',
  'data/combinaison/combinaisonNuit.js',
  'data/contexte/contexteNuit.js',
  'data/correction/bancDesCorrections.js',
  'data/db/bancAPart.js',
  'data/db/forcesButs.js',
  'data/db/playerRatings.js',
  'data/db/teamStrength.js',
  'data/db/teamStyle.js',
  'data/db/valeurStatsAPart.js',
  'data/joueurs/joueursNuit.js',
  'data/marketKnowledge.js'
]);

/** Le code sans ses commentaires (blocs et lignes entières) : un commentaire qui cite 'exit' n'est pas une écoute. */
function sansCommentaires(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
}

/** Une écoute de 'exit' ou de 'close' (`x.on(`, once, addListener…) ; l'appel optionnel `x?.on(` compris (vérification du 14/11, constat 6). */
const ECOUTE = /([A-Za-z_$][\w$]*)\s*\??\.\s*(on|once|addListener|prependListener|prependOnceListener)\(\s*(['"`])(exit|close)\3/g;

/** Pour un fichier : ses écoutes de 'exit' et de 'close' (hors `process`), s'il lance un enfant ou un fil, et ce qui suit chaque 'close'. */
function lire(relatif) {
  const code = sansCommentaires(fs.readFileSync(path.join(SRC, relatif), 'utf8'));
  const exits = [];
  const closes = [];
  for (const m of code.matchAll(ECOUTE)) {
    if (m[1] === 'process') continue;
    if (m[4] === 'exit') exits.push(m.index);
    else closes.push(code.slice(m.index, m.index + 600));
  }
  return { exits, closes, enfant: /\bfork\(/.test(code), fil: /\bnew Worker\(/.test(code) };
}

const tousLesFichiers = () =>
  fs
    .readdirSync(SRC, { recursive: true })
    .map((f) => String(f).split(path.sep).join('/'))
    .filter((f) => /\.(m?js|cjs)$/.test(f))
    .sort();

/**
 * LA GARDE DE REPLI (vérification du 14/11/2026, constat 6) : le nombre de littéraux 'exit' d'un fichier, hors commentaires et
 * hors l'écoute du processus lui-même (`process.on('exit'`, `process.once('exit'`). Elle voit ce qu'ECOUTE ne voit pas
 * (`events.once(enfant, 'exit')`, un nom d'événement mis dans une constante) ; seul un nom recollé (`'ex' + 'it'`) lui échappe.
 */
const LITTERAL_EXIT = /(['"`])exit\1/g;
const EXIT_DU_PROCESSUS = /\bprocess\s*\.\s*(on|once)\(\s*(['"`])exit\2/g;
const litterauxExit = (relatif) => [...sansCommentaires(fs.readFileSync(path.join(SRC, relatif), 'utf8')).replace(EXIT_DU_PROCESSUS, '').matchAll(LITTERAL_EXIT)].length;

test('T-CF1 (statique) : aucune écoute de « exit » pour conclure, hors de la liste blanche exacte ; chaque enfant conclut « sans réponse » sur « close »', () => {
  const fichiers = tousLesFichiers();
  assert.ok(fichiers.length > 300, `le relevé a trouvé ${fichiers.length} fichiers sous server/src`);
  const lus = new Map(fichiers.map((f) => [f, lire(f)]));
  // 1. Qui écoute encore 'exit' : la liste blanche, exactement.
  const ecouteExit = fichiers.filter((f) => lus.get(f).exits.length && !Object.hasOwn(ECOUTE_DU_PROCESSUS, f));
  for (const f of Object.keys(ECOUTE_DU_PROCESSUS)) {
    const l = lus.get(f);
    assert.ok(l, `${f} : absent (ECOUTE_DU_PROCESSUS)`);
    assert.ok(!l.enfant && !l.fil, `${f} : l'écoute du processus lui-même ne vaut que sans enfant (fork) ni fil (new Worker)`);
  }
  const enTrop = ecouteExit.filter((f) => !Object.hasOwn(LISTE_BLANCHE, f));
  assert.deepEqual(enTrop, [], `écoute « exit » pour conclure : passer à « close » (piège du 09/11/2026) — ${enTrop.join(', ')}`);
  const plusLa = Object.keys(LISTE_BLANCHE).filter((f) => !ecouteExit.includes(f));
  assert.deepEqual(plusLa, [], `n’écoute plus « exit » : retirer de la liste blanche — ${plusLa.join(', ')}`);
  // 2. Chaque entrée de la liste blanche a encore sa raison.
  for (const [f, raison] of Object.entries(LISTE_BLANCHE)) {
    const l = lus.get(f);
    if (raison === 'fil') {
      assert.ok(l.fil && !l.enfant, `${f} : la liste blanche le dit « fil » (un Worker), il doit lancer un fil et aucun enfant`);
      assert.equal(l.closes.length, 0, `${f} : un Worker n’émet jamais « close » (T-CF2) — garder « exit »`);
    } else {
      assert.equal(raison, 'sceau-46', `${f} : raison inconnue`);
      assert.ok(l.enfant, `${f} : un module du sceau de la 46 qui lance un enfant`);
    }
  }
  // 3. Tout fichier qui lance un enfant, hors liste blanche, conclut « sans réponse » sur 'close'.
  const enfants = fichiers.filter((f) => lus.get(f).enfant && !Object.hasOwn(LISTE_BLANCHE, f));
  for (const f of enfants) {
    const { closes } = lus.get(f);
    assert.ok(closes.length >= 1, `${f} : lance un enfant sans écouter « close »`);
    assert.ok(closes.some((c) => c.includes('sans réponse')), `${f} : « close » écouté, mais la conclusion « sans réponse » n’y est pas`);
  }
  // 4. Les quinze corrigés, un à un (un relevé qui ne trouverait rien ne passe pas en silence).
  for (const f of CORRIGES) {
    const l = lus.get(f);
    assert.ok(l, `${f} : absent`);
    assert.equal(l.exits.length, 0, `${f} : écoute encore « exit »`);
    assert.ok(l.enfant && l.closes.some((c) => c.includes('sans réponse')), `${f} : ne conclut pas « sans réponse » sur « close »`);
  }
  assert.deepEqual([...enfants].sort(), [...CORRIGES].sort(), 'les calculs à part (fork) hors liste blanche : exactement les quinze corrigés (un nouveau ? l’ajouter ici, avec son essai)');
  // 5. La garde de repli (vérification du 14/11, constat 6) : aucun littéral 'exit' hors commentaires (hors `process`) dans les
  //    quinze corrigés ; exactement un, son écoute, dans chaque entrée de la liste blanche.
  for (const f of CORRIGES) assert.equal(litterauxExit(f), 0, `${f} : un littéral « exit » hors commentaires (une écoute cachée : events.once, une constante ?) — conclure sur « close »`);
  for (const f of Object.keys(LISTE_BLANCHE)) assert.equal(litterauxExit(f), 1, `${f} : exactement un littéral « exit » attendu (son écoute de la liste blanche)`);
});

/** Lot A3 (17/11/2026) : les scripts de banc qui lancent un enfant — tous concluent sur 'close' (aucune liste blanche ici). */
const SCRIPTS = fileURLToPath(new URL('../scripts/', import.meta.url));
const SCRIPTS_CORRIGES = Object.freeze(['cartons-corners.mjs', 'coupes.mjs', 'debuts-de-saison.mjs', 'etape38.mjs', 'joueurs-a-blanc.mjs', 'match-context.mjs']);

test('T-CF5 (statique, lot A3) : les scripts de banc qui lancent un enfant concluent « sans réponse » sur « close », jamais sur « exit »', () => {
  const tous = fs
    .readdirSync(SCRIPTS, { recursive: true })
    .map((f) => String(f).split(path.sep).join('/'))
    .filter((f) => /\.(m?js|cjs)$/.test(f))
    .sort();
  assert.ok(tous.length > 40, `le relevé a trouvé ${tous.length} scripts sous server/scripts`);
  const lus = new Map(tous.map((f) => [f, lire(path.relative(SRC, path.join(SCRIPTS, f)))]));
  const ecouteExit = tous.filter((f) => lus.get(f).exits.length);
  assert.deepEqual(ecouteExit, [], `un script de banc écoute « exit » pour conclure : passer à « close » (piège du 09/11/2026) — ${ecouteExit.join(', ')}`);
  const enfants = tous.filter((f) => lus.get(f).enfant);
  assert.deepEqual(enfants, [...SCRIPTS_CORRIGES].sort(), 'les scripts de banc qui lancent un enfant : exactement les six nommés (un nouveau ? l’ajouter ici)');
  for (const f of SCRIPTS_CORRIGES) {
    const l = lus.get(f);
    assert.ok(l.closes.some((c) => c.includes('sans réponse')), `${f} : ne conclut pas « sans réponse » sur « close »`);
    assert.equal(litterauxExit(path.relative(SRC, path.join(SCRIPTS, f))), 0, `${f} : un littéral « exit » hors commentaires — conclure sur « close »`);
  }
});

const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-calculs-fin-'));
after(() => fs.rmSync(dossier, { recursive: true, force: true }));

test('T-CF2 : un Worker n’émet jamais « close », et tous ses messages arrivent avant son « exit » (la raison de l’entrée « fil »)', async () => {
  const FIL = path.join(dossier, 'fil-rafale.mjs');
  fs.writeFileSync(
    FIL,
    `import { parentPort } from 'node:worker_threads';
parentPort.once('message', (m) => {
  const lignes = Array.from({ length: m.taille }, (_, i) => ({ i, grille: new Float64Array(441).fill(i / 7) }));
  for (let k = 0; k < m.n; k++) parentPort.postMessage({ morceau: { type: 'lignes', lignes } });
  parentPort.postMessage({ fin: true });
  process.exit(0);
});
`
  );
  for (let essai = 1; essai <= 3; essai++) {
    const vu = await new Promise((resolve) => {
      const fil = new Worker(FIL);
      let recus = 0;
      let fin = false;
      let close = 0;
      fil.on('message', (m) => {
        if (m?.fin) fin = true;
        else {
          recus++;
          const t = Date.now();
          while (Date.now() - t < 150); // le serveur occupé à autre chose
        }
      });
      fil.on('close', () => close++);
      fil.on('exit', (code) => {
        const aLExit = { code, recus, fin };
        setTimeout(() => resolve({ ...aLExit, close }), 200);
      });
      fil.postMessage({ n: 10, taille: 200 });
    });
    assert.deepEqual(vu, { code: 0, recus: 10, fin: true, close: 0 }, `essai ${essai}`);
  }
});

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

const CALCULS = [
  ['cartons', 'data/cartons/cartonsNuit.js', cartons],
  ['combinaison', 'data/combinaison/combinaisonNuit.js', combinaison],
  ['contexte', 'data/contexte/contexteNuit.js', contexte],
  ['joueurs', 'data/joueurs/joueursNuit.js', joueurs]
];

/** Le jeton du calcul lourd est rendu : on peut le reprendre aussitôt. */
function jetonRendu(nom) {
  const rendre = commencerCalculLourd(`essai de la fin (${nom})`);
  rendre();
}

for (const [nom, fichier, calculerAPart] of CALCULS) {
  test(`T-CF3 (${nom}, ${fichier}) : la fin arrive toujours, même quand le serveur lit lentement chaque morceau`, async () => {
    for (let essai = 1; essai <= 3; essai++) {
      let recus = 0;
      const fin = await calculerAPart({
        message: { n: 10, taille: 200 },
        fichier: RAFALE,
        options: [],
        delaiMs: 60_000,
        surMorceau: (m) => {
          // combinaisonNuit passe les lignes du morceau ; les autres, le morceau entier.
          assert.ok(Array.isArray(m) ? m.length === 200 : m?.type === 'lignes', `essai ${essai} : morceau inattendu`);
          recus++;
          const t = Date.now();
          while (Date.now() - t < 150); // le serveur occupé à autre chose
        }
      });
      assert.equal(fin.fin, true, `essai ${essai} : la fin manque`);
      assert.equal(fin.bilan?.n, 10, `essai ${essai} : bilan inattendu`);
      assert.equal(recus, 10, `essai ${essai} : ${recus} morceaux reçus sur 10`);
    }
    jetonRendu(nom);
  });

  test(`T-CF4 (${nom}, ${fichier}) : un enfant muet est rejeté « sans réponse », avec son code`, async () => {
    await assert.rejects(calculerAPart({ message: {}, fichier: MUET, options: [], delaiMs: 60_000 }), /arrêté sans réponse \(code 3\)/);
    jetonRendu(nom);
  });
}
