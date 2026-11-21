/**
 * Étape 46 du plan (« Prédiction en direct »), lot 1, partie B — LA FRONTIÈRE ET LE GEL (conception § 7.1, critique R24, R25,
 * R32, R34, R37) :
 *   node --test test/directFrontiere.test.mjs        (depuis server/)
 *
 *   T-X1  les empreintes ne bougent pas, RELUES par le code du moteur : 16f2459… (37 fichiers) et la candidate f01dd849… ;
 *         rien de la 46 dans l'empreinte ;
 *   T-X2  rien de la 46 sous core/ ni sports/ (nom de fichier ou mention) ; depuis TOUTES les racines de la règle du gel (celles
 *         de debutsFrontiere.test.mjs, T-X2), data/direct/ n'est jamais atteint, par aucun import, blocs « étape 46 » de
 *         liveWatch.js compris ; hors de data/direct/, seuls jobs/liveWatch.js et le contrôleur du direct la chargent, et par
 *         import() DYNAMIQUE ; le contrôleur n'importe en statique que matchStatsDb.js et errorHandler.js (R24) ;
 *   T-X3  les 235 fichiers de CODE gelés (fixtures/direct-gel-46.json : le manifeste de la partie 0, 11/11/2026 à 21 h 05, sans
 *         engine-config.json, donnée d'exécution) identiques à l'octet ; historique.js SANS son entrée 46 (l'ajout pur de la
 *         partie D), aucune ligne perdue ; depuis la partie C (13/11), bench/lancements.js SANS la 46 que la manœuvre du
 *         scellement y pose (retrait de aides/ajouts46.mjs) ;
 *   T-X4  T-X7 de la 32 (le jugement provisoire de l'essai 27, REJOUÉ sur une copie par contexteFrontiere.test.mjs, dans la
 *         même suite) : sa fixture et ses aides inchangées, le test toujours là ;
 *   T-X5  aucune écriture depuis data/direct/ ni le contrôleur : ni INSERT, UPDATE, DELETE, CREATE, writeJsonAtomic,
 *         mettreEnFile, ni fs.write dans leurs sources ;
 *   T-X6  aucune requête de plus : le graphe COMPLET des quatre modules purs (calcul, libellé, état, mémoire) n'atteint ni
 *         FotMob, ni API-Football, ni un fournisseur, ni fetch ; la lecture, les entrées, les réglages, le contrôleur et la
 *         route n'en importent directement aucun (le reste : T-M5, le comptage réel des requêtes de la boucle) ;
 *   T-X7  rien n'est envoyé à l'IA : rien de core/ai/ (fiches et bulletins compris) n'atteint data/direct/ ; aucune source de
 *         la 46 ne lit ni n'écrit engine-config.json ni la configuration de l'IA ;
 *   T-X8  jobs/liveWatch.js SANS ses blocs « étape 46 » = le fichier qui a produit la fixture « avant » (sha1 e811e6f5…), à
 *         l'octet ; les blocs bien formés ;
 *   T-X9  (correctif R7 du 13/11 après-midi, constat 7 du rebanc) LE CALCUL JUGÉ A CHANGÉ : quand NOTE_DU_DIRECT n'est pas
 *         null, chaque module de note.modules sous src/data/direct/ et src/data/simulation/, plus src/core/model/poisson.js
 *         et src/core/model/dixonColes.js, a le sha1 noté (bancDuDirect.js pris « à scellement vide », comme au scellement)
 *         — sinon l'essai tombe et dit « --note-nulle, ou un nouveau banc » ; note nulle (aujourd'hui) : « sans objet », vert.
 *         Correctif K3 (13/11 fin d'après-midi) : les QUATRE modules descellés (etatDuDirect.js, memoireDuDirect.js,
 *         libelleDuDirect.js, entreesDuDirect.js) n'en sont jamais : seuls les modules jugés (les 24 du sceau, sous
 *         data/direct/ et data/simulation/, plus poisson.js et dixonColes.js) sont relus.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
// Correctif R7 (13/11 après-midi, AJOUT) : T-X9 charge la note du banc comme lectureDuDirect.js, par import().
import { pathToFileURL } from 'node:url';
import { SERVEUR, FIXTURES } from './aides/isolement.mjs';
import { sansBlocs36 } from './aides/ajouts36.mjs';
import { sansBlocs35 } from './aides/ajouts35.mjs';
import { blocs46, sansBlocs46 } from './aides/ajouts46.mjs';
// Partie C (13/11/2026, AJOUT) : T-X3 retire la 46 du registre de la mesure (posée à la manœuvre du scellement) avant de comparer.
import { octetsSansLesAjoutsDe46 } from './aides/ajouts46.mjs';
import { fichiersDuMoteur, empreinteDuCode, empreinteDeLaCandidate, CANDIDATE_EN_ESSAI } from '../src/core/engine/engineVersions.js';
import { EMPREINTE_EN_SERVICE, EMPREINTE_AVANT_LOTS_2, declarationsDe } from './aides/enService.mjs';

const SRC = path.join(SERVEUR, 'src');
const RACINE = path.join(SERVEUR, '..');
const DIRECT = path.join(SRC, 'data', 'direct');
const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex');
const sansCommentaires = (f) => fs.readFileSync(f, 'utf8').replace(new RegExp('/[*][^]*?[*]/', 'g'), '').replace(new RegExp('(^|[^:\'"`])//.*$', 'gm'), '$1');
const rel = (f) => path.relative(SRC, f).split(path.sep).join('/');
const tousLesFichiers = (dossier) => (fs.existsSync(dossier) ? fs.readdirSync(dossier, { recursive: true }).map(String).filter((f) => fs.statSync(path.join(dossier, f)).isFile()) : []);

/** Les fichiers de la 46 sous src/ : data/direct/, son contrôleur et sa route. */
const FICHIERS_46 = Object.freeze([...tousLesFichiers(DIRECT).map((f) => `data/direct/${f.split(path.sep).join('/')}`), 'api/controllers/direct.controller.js', 'api/routes/direct.routes.js']);
const dansDirect = (absolu) => !path.relative(DIRECT, absolu).startsWith('..') && !path.isAbsolute(path.relative(DIRECT, absolu));

/** Les imports RELATIFS d'un texte (statiques, dynamiques, réexports). */
const RE_IMPORT = /(?:from\s+|import\s*\(\s*|import\s+)['"](\.{1,2}\/[^'"]+)['"]/g;
const resoudre = (fichier, s) => {
  let cible = path.resolve(path.dirname(fichier), s);
  if (!/\.(m?js|json)$/.test(cible) && fs.existsSync(`${cible}.js`)) cible += '.js';
  return cible;
};

/**
 * Les fichiers atteints par les imports relatifs (statiques et dynamiques) d'un ensemble de départ — les blocs « ajout pur »
 * de la 35 et de la 36 retirés comme dans debutsFrontiere.test.mjs, ceux de la 46 GARDÉS (un chemin par eux compte).
 */
function atteints(depart) {
  const vus = new Set();
  const pile = [...depart];
  while (pile.length) {
    const f = pile.pop();
    if (vus.has(f) || !fs.existsSync(f)) continue;
    vus.add(f);
    const texte = sansBlocs35(sansBlocs36(fs.readFileSync(f, 'utf8')));
    for (const m of texte.matchAll(RE_IMPORT)) pile.push(resoudre(f, m[1]));
  }
  return vus;
}

/** Le manifeste de la partie 0 (fichiers de code seulement). */
const GEL = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'direct-gel-46.json'), 'utf8'));
const HISTORIQUE = 'server/src/data/roadmap/historique.js';
/** Partie C (AJOUT) : le registre de la mesure, où la manœuvre du scellement pose la 46 (poser-registre-46.mjs). */
const REGISTRE_46 = 'server/src/bench/lancements.js';
/** L'entrée 46 de historique.js (partie D) : de la fin de l'entrée d'avant à la fin de la liste, remplacée par cette fin. */
const DEBUT_ENTREE_46 = "  }),\n  ligne({\n    etape: '46',";
function sansLEntree46(texte) {
  const i = texte.indexOf(DEBUT_ENTREE_46);
  const j = i >= 0 ? texte.indexOf('\n]);', i + DEBUT_ENTREE_46.length) : -1;
  if (i < 0 || j < 0 || texte.indexOf(DEBUT_ENTREE_46, i + 1) >= 0) return texte;
  return `${texte.slice(0, i)}  })${texte.slice(j)}`;
}

test('T-X1 — les empreintes sont celles EN SERVICE (aides/enService.mjs, (A)), relues par le code du moteur ; le manifeste garde celles d’avant les lots 2 ; rien de la 46 dans l’empreinte', () => {
  const e = empreinteDuCode({ rafraichir: true });
  assert.equal(e.empreinte, EMPREINTE_EN_SERVICE.moteur); // Partie 0 des lots 2 (A)
  assert.equal(Object.keys(e.fichiers).length, EMPREINTE_EN_SERVICE.fichiersDuMoteur); // Partie 0 des lots 2 (A)
  assert.equal(fichiersDuMoteur().length, EMPREINTE_EN_SERVICE.fichiersDuMoteur); // Partie 0 des lots 2 (A)
  assert.equal(empreinteDeLaCandidate(CANDIDATE_EN_ESSAI), EMPREINTE_EN_SERVICE.candidate); // Partie 0 des lots 2 (A)
  // Le manifeste (historique, jamais touché) : l'état d'avant les lots 2. // Partie 0 des lots 2 (A)
  assert.deepEqual({ ...GEL.empreintes }, { moteur: EMPREINTE_AVANT_LOTS_2.moteur, fichiersDuMoteur: EMPREINTE_AVANT_LOTS_2.fichiersDuMoteur, candidate: EMPREINTE_AVANT_LOTS_2.candidate }); // Partie 0 des lots 2 (A)
  assert.ok(FICHIERS_46.length >= 9, FICHIERS_46.join(', '));
  for (const f of fichiersDuMoteur()) {
    assert.ok(!FICHIERS_46.includes(f), `${f} : la 46 dans l’empreinte`);
    assert.doesNotMatch(f, /direct/i, `${f} : la 46 dans l’empreinte`);
  }
});

test('T-X2 — rien de la 46 sous core/ ni sports/ ; depuis TOUTES les racines du gel, data/direct/ jamais atteint (blocs de la 46 compris) ; hors de data/direct/, seuls liveWatch.js et le contrôleur la chargent, par import() dynamique', () => {
  for (const racine of ['core', 'sports']) {
    for (const f of tousLesFichiers(path.join(SRC, racine))) {
      assert.ok(!(/direct/i.test(path.basename(f)) && /Direct\.(m?js|json)$/.test(f)), `${racine}/${f} : un fichier de la 46 sous ${racine}/`);
      assert.doesNotMatch(fs.readFileSync(path.join(SRC, racine, f), 'utf8'), /data\/direct\/|[ÉEée]tape 46\b/, `${racine}/${f} : mention de l’étape 46 ou de data/direct/`);
    }
  }
  // Les racines de la règle du gel (debutsFrontiere.test.mjs, T-X2) : le moteur, le chemin de nuit de l'essai 27, les producteurs,
  // les producteurs cachés, les deux fichiers de l'IA.
  const racines = [
    ...fichiersDuMoteur(),
    'data/enregistreurs/gelPronostics.js', 'data/enregistreurs/depot.js', 'data/enregistreurs/moteurABlanc.js', 'bench/essaiCandidate.js', 'bench/runner.js',
    'core/engine/engineVersions.js', 'core/engine/engineConfig.js', 'data/db/dayTable.js', 'data/db/forcesButs.js', 'data/db/forcesButsEnfant.js',
    'api/controllers/statValue.controller.js', 'data/contexte/contexteNuit.js', 'data/db/dayTableControle.js', 'data/marketKnowledge.js',
    'data/providers/espnOdds.js', 'data/providers/footballDataHistory.js', 'data/providers/fotMobRefresh.js', 'data/providers/freeOdds.js',
    'data/providers/kalshiOdds.js', 'data/providers/lineupContext.js', 'data/providers/smarketsOdds.js', 'jobs/matchStatsAutoRefresh.js',
    'core/ai/autoMatchAiTrigger.js', 'core/ai/matchAiAnalysisService.js'
  ].map((f) => path.join(SRC, f));
  for (const f of racines) assert.ok(fs.existsSync(f), `racine absente : ${rel(f)}`);
  const graphe = [...atteints(racines)].map(rel);
  assert.ok(graphe.length > 150, `${graphe.length} fichiers atteints`);
  assert.deepEqual(
    graphe.filter((f) => FICHIERS_46.includes(f)),
    [],
    'la 46 atteinte depuis une racine du gel'
  );
  // Hors de data/direct/ : qui charge la 46 ? Deux fichiers, par import() dynamique (une erreur dans data/direct/ ne les empêche
  // jamais de se charger : la boucle de E tourne sans la mémoire, les autres routes répondent).
  const PAR_IMPORT_DYNAMIQUE = {
    'api/controllers/direct.controller.js': ['../../data/direct/lectureDuDirect.js'],
    'jobs/liveWatch.js': ['../data/direct/memoireDuDirect.js']
  };
  const chargeurs = {};
  for (const f of tousLesFichiers(SRC)) {
    const absolu = path.join(SRC, f);
    const r = rel(absolu);
    if (dansDirect(absolu) || !/\.m?js$/.test(r)) continue;
    const vers = [...fs.readFileSync(absolu, 'utf8').matchAll(RE_IMPORT)].map((m) => m[1]).filter((s) => dansDirect(resoudre(absolu, s)));
    if (vers.length) chargeurs[r] = vers;
  }
  assert.deepEqual(chargeurs, PAR_IMPORT_DYNAMIQUE);
  for (const [r, cibles] of Object.entries(PAR_IMPORT_DYNAMIQUE)) {
    const texte = fs.readFileSync(path.join(SRC, r), 'utf8');
    assert.doesNotMatch(texte, /^\s*(import|export)\s[^;(]*data\/direct\//m, `${r} : un import statique de la 46`);
    for (const c of cibles) assert.ok(texte.includes(`await import('${c}')`) || texte.includes(`() => import('${c}')`), `${r} : ${c} hors d’un import() dynamique`);
  }
  // Le contrôleur (R24) : en statique, la base et l'erreur d'API seulement.
  const statiques = [...fs.readFileSync(path.join(SRC, 'api', 'controllers', 'direct.controller.js'), 'utf8').matchAll(/^import [^;]* from ['"]([^'"]+)['"];?$/gm)].map((m) => m[1]);
  assert.deepEqual(statiques, ['../../data/db/matchStatsDb.js', '../middlewares/errorHandler.js']);
});

test('T-X3 — le manifeste de la partie 0 (11/11/2026, jamais touché) MOINS les fichiers déclarés par les lots 2 (aides/enService.mjs, preuve historique (B)) : les autres identiques à l’octet ; historique.js SANS son entrée 46, aucune ligne perdue ; lancements.js SANS la 46', (t) => { // Partie 0 des lots 2 (B)
  assert.equal(GEL.fichiers.length, 235);
  assert.ok(!GEL.fichiers.some(([f]) => /engine-config\.json$/.test(f)), 'sans engine-config.json (donnée d’exécution)');
  assert.equal(new Set(GEL.fichiers.map(([f]) => f)).size, 235);
  let avecEntree46 = 0;
  let avecLa46AuRegistre = 0; // partie C (AJOUT)
  let declares = 0; // Partie 0 des lots 2 (AJOUT)
  for (const [f, attendu] of GEL.fichiers) {
    // Partie 0 des lots 2 (AJOUT, (B)) : un fichier déclaré sort de la comparaison au manifeste ; sa première ligne en part ; la
    // chaîne et le sha1 du jour : declarationsLots2.test.mjs (D1, D3).
    const declarees = declarationsDe(f);
    if (declarees.length) {
      assert.equal(declarees[0].avant, attendu, `${f} : sa première déclaration (${declarees[0].lot}) ne part pas du manifeste du 11/11`);
      declares++;
      continue;
    }
    const chemin = path.join(RACINE, f);
    assert.ok(fs.existsSync(chemin), `${f} : absent`);
    const octets = fs.readFileSync(chemin);
    if (sha1(octets) === attendu) continue;
    // Partie C (13/11/2026, AJOUT) : la 46 posée au registre de la mesure par la manœuvre du scellement ; retirée par le retrait
    // de aides/ajouts46.mjs (celui du script de pose), le fichier doit être le manifeste à l'octet — et il devait la porter.
    if (f === REGISTRE_46) {
      const sans = octetsSansLesAjoutsDe46('bench/lancements.js', octets);
      assert.notEqual(sha1(sans), sha1(octets), `${f} : retouché, et pas par la 46 (rien à retirer)`);
      assert.equal(sha1(sans), attendu, `${f} SANS la 46 = le manifeste, à l’octet`);
      avecLa46AuRegistre++;
      continue;
    }
    assert.equal(f, HISTORIQUE, `${f} : retouché (gelé pendant l’essai 27)`);
    const texte = octets.toString('utf8');
    assert.equal(texte.split(DEBUT_ENTREE_46).length - 1, 1, 'historique.js : une seule entrée 46');
    const avant = sansLEntree46(texte);
    assert.equal(sha1(Buffer.from(avant, 'utf8')), attendu, 'historique.js SANS son entrée 46 = le manifeste, à l’octet');
    const lignes = new Set(texte.split('\n'));
    assert.deepEqual(
      avant.split('\n').filter((l) => !lignes.has(l)),
      [],
      'historique.js : aucune ligne perdue'
    );
    avecEntree46++;
  }
  t.diagnostic(avecEntree46 ? 'historique.js porte l’entrée 46 (ajout pur), sans elle = le manifeste' : 'historique.js = le manifeste (l’entrée 46 viendra en partie D)');
  t.diagnostic(avecLa46AuRegistre ? 'lancements.js porte la 46 (posée au scellement), sans elle = le manifeste' : 'lancements.js = le manifeste (la 46 y sera posée au scellement)'); // partie C (AJOUT)
  t.diagnostic(`${declares} fichier(s) du manifeste déclaré(s) par les lots 2 (aides/enService.mjs)`); // Partie 0 des lots 2 (AJOUT)
});

test('T-X4 — T-X7 de la 32 (le jugement provisoire de l’essai 27, rejoué sur une copie par contexteFrontiere.test.mjs) : sa fixture et ses aides inchangées, le test toujours là', () => {
  const ATTENDUS = [
    ['test/fixtures/essai27-avant-etape32.json', 'a3c2b65abd995ef0a9cdd68f65484c6172d5390d'],
    ['test/aides/script-contexte-essai27.mjs', '9f5ee5078f5d65b06e20ce2dfc05fb7ca2ba0806'],
    ['test/aides/essaiFabrique.mjs', '768e3bb0b182d66e8fce5c919366a32e02ba8486']
  ];
  for (const [f, attendu] of ATTENDUS) assert.equal(sha1(fs.readFileSync(path.join(SERVEUR, f))), attendu, `${f} : retouché`);
  assert.match(fs.readFileSync(path.join(SERVEUR, 'test', 'contexteFrontiere.test.mjs'), 'utf8'), /^test\('T-X7 /m, 'T-X7 de la 32 toujours là');
});

test('T-X5 — aucune écriture depuis data/direct/ ni le contrôleur : ni INSERT, UPDATE, DELETE, CREATE, writeJsonAtomic, mettreEnFile, ni fs.write dans leurs sources', () => {
  for (const f of FICHIERS_46) {
    const code = sansCommentaires(path.join(SRC, f));
    assert.doesNotMatch(code, /\b(INSERT|UPDATE|DELETE|CREATE|REPLACE|DROP|ALTER)\b/, `${f} : une écriture SQL`);
    assert.doesNotMatch(code, /writeJsonAtomic|mettreEnFile|\bfs\.write|\bwrite(File|FileSync|Sync)\(|append(File|FileSync)\(|createWriteStream|\b(database|db)\.exec\(|\.run\(|'BEGIN|'COMMIT/, `${f} : une écriture`);
  }
});

const INTERDIT_RESEAU = /(^|\/)(providers\/|fotMobProvider|apiFootballClient|oddsApiAdapter)/;
const REQUETE = /\bfetch\s*\(|['"]node:https?['"]|['"]https?['"]|['"](axios|undici|got|node-fetch)['"]/;

test('T-X6 — aucune requête de plus : le graphe COMPLET des quatre modules purs n’atteint ni FotMob, ni API-Football, ni un fournisseur, ni fetch ; la lecture, les entrées, les réglages, le contrôleur et la route n’en importent directement aucun', () => {
  const purs = ['calculDuDirect.js', 'libelleDuDirect.js', 'etatDuDirect.js', 'memoireDuDirect.js'].map((f) => path.join(DIRECT, f));
  const graphe = [...atteints(purs)].map(rel).sort();
  assert.ok(graphe.length >= 5 && graphe.length < 40, graphe.join(', '));
  for (const f of graphe) {
    assert.doesNotMatch(f, INTERDIT_RESEAU, `${f} : atteint depuis un module pur`);
    assert.doesNotMatch(sansCommentaires(path.join(SRC, f)), REQUETE, `${f} : une requête`);
  }
  for (const f of ['data/direct/lectureDuDirect.js', 'data/direct/entreesDuDirect.js', 'data/direct/reglagesDirect.js', 'api/controllers/direct.controller.js', 'api/routes/direct.routes.js']) {
    const absolu = path.join(SRC, f);
    for (const m of fs.readFileSync(absolu, 'utf8').matchAll(RE_IMPORT)) assert.doesNotMatch(rel(resoudre(absolu, m[1])), INTERDIT_RESEAU, `${f} importe ${m[1]}`);
    assert.doesNotMatch(sansCommentaires(absolu), REQUETE, `${f} : une requête`);
  }
});

test('T-X7 — rien n’est envoyé à l’IA : rien de core/ai/ (fiches et bulletins compris) n’atteint data/direct/ ; aucune source de la 46 ne lit ni n’écrit engine-config.json ni la configuration de l’IA', () => {
  const ia = tousLesFichiers(path.join(SRC, 'core', 'ai'))
    .filter((f) => /\.m?js$/.test(f))
    .map((f) => path.join(SRC, 'core', 'ai', f));
  assert.ok(ia.length >= 5, `${ia.length} fichiers de l’IA`);
  assert.ok(ia.some((f) => /bulletinFiches\.js$/.test(f)), 'les fiches de l’IA parmi les racines');
  const graphe = [...atteints(ia)].map(rel);
  assert.deepEqual(
    graphe.filter((f) => FICHIERS_46.includes(f)),
    [],
    'la 46 atteinte depuis l’IA'
  );
  for (const f of FICHIERS_46) assert.doesNotMatch(fs.readFileSync(path.join(SRC, f), 'utf8'), /engine-config|engineConfig|ai-config|aiConfigStore|anthropicClient/, `${f} : touche la configuration ou l’IA`);
});

test('T-X8 — jobs/liveWatch.js SANS ses blocs « étape 46 » = le fichier qui a produit la fixture « avant » (sha1 e811e6f5…), à l’octet ; les blocs bien formés', () => {
  const texte = fs.readFileSync(path.join(SRC, 'jobs', 'liveWatch.js'), 'utf8');
  const blocs = blocs46(texte);
  assert.ok(Array.isArray(blocs), 'les repères « étape 46 » vont par paires bien formées');
  assert.ok(blocs.length >= 5, `${blocs.length} blocs`);
  const avant = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'direct-boucle-avant-46.json'), 'utf8'));
  assert.equal(avant.liveWatch.sha1, 'e811e6f5360e0ca31b88fc780374eeb8e097d07a');
  assert.notEqual(sha1(Buffer.from(texte, 'utf8')), avant.liveWatch.sha1, 'les blocs de la 46 sont là');
  assert.equal(sha1(Buffer.from(sansBlocs46(texte), 'utf8')), avant.liveWatch.sha1, 'sans ses blocs, le fichier d’avant la 46 à l’octet');
});

/**
 * T-X9 — correctif R7 du 13/11 après-midi (constat 7 du rebanc) : LE CALCUL JUGÉ A CHANGÉ. data/direct/ et data/simulation/
 * sont hors de l'empreinte du moteur : les changer ne crée pas de version, et l'écran garderait la note d'un calcul qui n'est
 * plus celui qu'il montre. La note porte les sha1 des modules jugés (note.modules, relevés au scellement) : on les relit.
 * bancDuDirect.js est pris « à scellement vide », comme au scellement (scripts/etape46.mjs, sha1DuModule : son bloc
 * SCELLEMENT remis à null — un fichier ne porte pas son propre sha1). Les autres modules scellés (core/engine/ : l'empreinte
 * du moteur, une version neuve ; le banc, l'export, la mesure) ne changent pas le calcul montré à l'écran sous la même version.
 */
const BALISES_DU_SCELLEMENT = Object.freeze(['// <SCELLEMENT rempli par script au scellement — ne pas modifier à la main>', '// </SCELLEMENT>']);
const SCELLEMENT_VIDE = 'export const SCELLEMENT = null;';
const BANC_RELATIF = 'src/data/direct/bancDuDirect.js';
const MODELES_JUGES = Object.freeze(['src/core/model/poisson.js', 'src/core/model/dixonColes.js']);
// Correctif K3 (13/11 fin d'après-midi, constat 3 du calcul) : l'état, la mémoire, le libellé et les entrées du direct ne sont
// plus scellés (le banc ne les importe pas : ils ne calculent aucun chiffre jugé) — T-X9 ne les relit jamais, même si une note
// les portait ; leurs correctifs (rodage du lot 1b) n'éteignent pas la note.
const DESCELLES = Object.freeze(['src/data/direct/etatDuDirect.js', 'src/data/direct/memoireDuDirect.js', 'src/data/direct/libelleDuDirect.js', 'src/data/direct/entreesDuDirect.js']);
const estJuge = (f) => !DESCELLES.includes(f) && (f.startsWith('src/data/direct/') || f.startsWith('src/data/simulation/') || MODELES_JUGES.includes(f));
/** Le sha1 d'un module jugé tel que le scellement le relève (null : fichier absent, ou balises de bancDuDirect.js abîmées). */
function sha1DuModuleJuge(relatif) {
  const c = path.join(SERVEUR, ...relatif.split('/'));
  if (!fs.existsSync(c)) return null;
  const octets = fs.readFileSync(c);
  if (relatif !== BANC_RELATIF) return sha1(octets);
  const texte = octets.toString('utf8');
  const [debut, fin] = BALISES_DU_SCELLEMENT;
  const i = texte.indexOf(debut);
  const j = texte.indexOf(fin);
  if (i < 0 || j < i || texte.indexOf(debut, i + 1) >= 0 || texte.indexOf(fin, j + 1) >= 0) return null;
  return sha1(Buffer.from(`${texte.slice(0, i + debut.length)}\n${SCELLEMENT_VIDE}\n${texte.slice(j)}`, 'utf8'));
}

test('T-X9 — le calcul jugé a changé (correctif R7) : NOTE_DU_DIRECT non nulle → chaque module jugé de note.modules (data/direct/, data/simulation/, poisson.js, dixonColes.js) a le sha1 noté ; note nulle → sans objet', async (t) => {
  const fichier = path.join(DIRECT, 'noteDuDirect.js');
  assert.ok(fs.existsSync(fichier), 'noteDuDirect.js introuvable');
  const { NOTE_DU_DIRECT: note } = await import(pathToFileURL(fichier).href);
  if (note === null) {
    t.diagnostic('sans objet : NOTE_DU_DIRECT est null (le banc n’est pas passé, ou le direct est éteint) — l’essai s’active dès qu’une note est recopiée.');
    return;
  }
  const modules = note && typeof note.modules === 'object' && note.modules !== null ? note.modules : {};
  const juges = [...new Set([...Object.keys(modules).filter(estJuge), ...MODELES_JUGES])].sort();
  assert.ok(
    juges.some((f) => f.startsWith('src/data/direct/')),
    `la note ne porte pas les sha1 des modules jugés (note.modules : ${Object.keys(modules).length} entrée(s)) : --note-nulle, ou un nouveau banc`
  );
  const changes = juges.filter((f) => sha1DuModuleJuge(f) !== modules[f]).map((f) => `${f} (noté ${modules[f] ?? 'absent'}, relu ${sha1DuModuleJuge(f) ?? 'fichier absent'})`);
  t.diagnostic(`${juges.length} modules jugés relus, ${changes.length} changé(s)`);
  assert.deepEqual(changes, [], `le calcul jugé a changé depuis le banc — ${changes.join(' ; ')} : --note-nulle, ou un nouveau banc`);
});
