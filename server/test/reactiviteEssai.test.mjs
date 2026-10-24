/**
 * LA RÉACTIVITÉ DE L'ÉTAPE DE NUIT « moteurABlanc » (24/10/2026).
 *   node --test test/reactiviteEssai.test.mjs        (depuis server/)
 *
 * La nuit du 23 au 24/10/2026, l'étape (la candidate « modele-buts-v1 » de l'étape 27, en essai) a tenu le serveur
 * de Pierre jusqu'à 2 191 ms d'affilée — et sa mesure ne comptait même pas l'essai jugé, qui grandit avec le nombre
 * de matchs joués (l'horizon de l'essai : 800). Mesuré dans le bac : l'essai jugé tenait le serveur en trois
 * tronçons d'un seul tenant, ~460 à 510 ms chacun à 800 matchs ; chaque match calculé, ~170 à 340 ms d'un tenant.
 *
 * Dans une COPIE ISOLÉE (isolement.mjs : base d'essai, data/runtime à elle, réseau coupé, aucun Claude), script
 * test/aides/script-reactivite-essai.mjs, un essai FABRIQUÉ de la candidate du code (essaiFabrique.mjs) : 1 200
 * matchs joués (au-delà de l'horizon), 676 à venir, plusieurs révisions par match — ~30 000 lignes à blanc.
 *  1. À l'horizon (le jugement principal) : le serveur jamais tenu plus de SEUIL_MS d'affilée, vu de DEDANS
 *     (blocMaxMs de l'étape, essai jugé compris) et vu de DEHORS (un battement de 1 ms) ; et ce que la nuit a rangé
 *     est IDENTIQUE à ce que rangeait le code d'AVANT le correctif (fixtures/essai-reactivite-fige.json) et au même
 *     essai refait sans jamais rendre la main (les fonctions synchrones).
 *  2. Avant l'horizon (les premiers chiffres) : de même.
 *  3. Les matchs à calculer : la main rendue entre l'enrichissement et chacune des deux analyses, et entre deux matchs.
 *  4. Le code : tout passe par les pauses.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR, FIXTURES } from './aides/isolement.mjs';

const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-reactivite-essai.mjs');
const SRC = path.join(SERVEUR, 'src');
/** Le serveur jamais tenu plus de tant d'affilée (le code mesuré tient ~50 ms ; sans rendre la main, ~600 ms et plus). */
const SEUIL_MS = 300;
/**
 * LA RÉFÉRENCE DES CHIFFRES : ce que la nuit rangeait pour CE MÊME essai fabriqué avec le code d'AVANT le correctif (figé
 * le 24/10/2026 par le script de la mesure, src du bac avant toute retouche) — premiers chiffres, jugement principal,
 * calibration, familles, porte de sûreté, régimes, témoin du score. Le code coopératif doit le redonner à l'identique.
 */
const FIGE = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'essai-reactivite-fige.json'), 'utf8'));
const DEPUIS = '2026-09-23T20:00:00.000Z';
const A_L_HORIZON = '2026-10-19T03:00:00.000Z';
const AVANT_L_HORIZON = '2026-10-12T03:00:00.000Z';

const uneFois = (fabrique) => {
  let valeur;
  return () => (valeur ??= fabrique());
};

/** Une copie, son essai fabriqué, puis les mesures et la référence synchrone, chacune dans son sous-processus. */
const campagne = uneFois(() => {
  const copie = preparerCopie({});
  try {
    const dossier = copie.dossier;
    const fichiers = {
      versionsSource: path.join(dossier, 'versions-essai-0.json'),
      mesureSource: path.join(dossier, 'mesure-essai-0.json')
    };
    const lancer = (phase, options) => {
      const r = executer(copie, SCRIPT, { args: [phase, JSON.stringify(options)], timeout: 600_000, env: { CLAUDE_CODE_BIN: path.join(dossier, 'pas-de-claude-ici.exe'), MATCH_STATS_AUTO_REFRESH: 'false' } });
      assert.equal(r.code, 0, `${phase} a échoué :\n${r.erreurs.slice(-4000)}\n${r.sortie.slice(-2000)}`);
      assert.ok(r.json?.ok, `${phase} : sortie illisible\n${r.sortie.slice(-2000)}`);
      assert.equal(r.reseau, false, `${phase} : un appel réseau a été tenté`);
      return r.json;
    };
    const s = {};
    s.fabrication = lancer('fabriquer', { forces: true, depuis: DEPUIS, maintenant: A_L_HORIZON, joues: 1200, aVenir: 676, revisions: { joues: 3, aVenir: 2 }, magasin: true, versions: fichiers.versionsSource, mesure: fichiers.mesureSource });
    for (const [nom, maintenant] of [['horizon', A_L_HORIZON], ['avant', AVANT_L_HORIZON]]) {
      const run = { ...fichiers, maintenant, versions: path.join(dossier, `versions-${nom}.json`), mesure: path.join(dossier, `mesure-${nom}.json`) };
      s[nom] = { mesure: lancer('mesurer', run), reference: lancer('reference', run) };
    }
    // Quelques matchs à calculer (ceux du 20/09 de la base d'essai, vus « à venir » la veille au soir).
    s.nuit = lancer('nuit', { ...fichiers, maintenant: '2026-09-19T22:00:00.000Z', jours: ['2026-09-20'], limite: 12, versions: path.join(dossier, 'versions-nuit.json'), mesure: path.join(dossier, 'mesure-nuit.json') });
    return s;
  } finally {
    copie.nettoyer();
  }
});

function verifierLaMesure(m, quoi) {
  assert.equal(m.bilan.erreur ?? null, null, `${quoi} : ${m.bilan.erreur}`);
  assert.equal(m.bilan.attente, null, `${quoi} : en attente (${m.bilan.attente})`);
  assert.equal(m.bilan.essai?.calcule, true, `${quoi} : l’essai n’a pas été jugé (${JSON.stringify(m.bilan.essai)})`);
  assert.ok(m.bilan.blocMaxMs > 0, `${quoi} : la mesure de l’étape ne mesure rien (${m.bilan.blocMaxMs})`);
  assert.ok(m.bilan.blocMaxMs < SEUIL_MS, `${quoi} : l’étape a tenu le serveur ${m.bilan.blocMaxMs} ms d’affilée (« ${m.bilan.blocMaxOu} »), ${SEUIL_MS} au plus`);
  assert.equal(typeof m.bilan.blocMaxOu, 'string', `${quoi} : où le plus long moment s’est terminé n’est pas dit`);
  assert.ok(m.dehors.battementMaxMs < SEUIL_MS, `${quoi} : vu de dehors, le serveur tenu ${m.dehors.battementMaxMs} ms d’affilée, ${SEUIL_MS} au plus`);
}

// ------------------------------------------------------------ 1. à l'horizon

test('à l’horizon (1 200 matchs joués, jugement principal) : le serveur jamais tenu plus de 300 ms d’affilée, vu de dedans et de dehors ; jugement, calibration et familles IDENTIQUES à ceux du code d’avant et au même essai refait sans rendre la main', (t) => {
  const s = campagne();
  t.diagnostic(`tenu au plus ${s.horizon.mesure.bilan.blocMaxMs} ms (« ${s.horizon.mesure.bilan.blocMaxOu} »), vu de dehors ${s.horizon.mesure.dehors.battementMaxMs} ms ; ${s.fabrication.enBase} lignes à blanc`);
  assert.equal(s.fabrication.forcesAJour, true, 'les forces de buts de la candidate calculées');
  assert.equal(s.fabrication.essai.joues, 1200);
  assert.ok(s.fabrication.enBase > 25_000, `un essai de taille réelle (${s.fabrication.enBase} lignes à blanc)`);
  const { mesure, reference } = s.horizon;
  verifierLaMesure(mesure, 'à l’horizon');
  assert.equal(mesure.bilan.essai.principal, true, 'le jugement principal est pris');
  assert.equal(mesure.bilan.essai.matchs, 1200);
  assert.equal(reference.comparaison.chemin, 'jugement');
  assert.equal(reference.comparaison.identique, true, 'le jugement rangé = celui refait sans pause');
  assert.equal(reference.pages.identiques, true, 'la table relue par pages = la table lue d’un coup');
  assert.equal(mesure.range.jugement.verdict, reference.attendu.verdict);
  assert.deepEqual(mesure.range.jugement.calibration, reference.attendu.calibration, 'même calibration');
  assert.deepEqual(mesure.range.jugement.parFamille, reference.attendu.parFamille, 'même juge par famille');
  assert.equal(mesure.jugementsDeLEtape.filter((j) => j.principal).length, 1, 'rangé une fois au registre de la mesure');
  assert.equal(s.fabrication.enBase, FIGE.lignesABlanc, 'le même essai que la référence figée');
  assert.deepEqual(mesure.bilan.essai, FIGE.horizon.essai, 'même bilan d’essai que le code d’avant');
  assert.deepEqual(mesure.range, FIGE.horizon.range, 'premiers chiffres et jugement IDENTIQUES à ceux du code d’avant');
  assert.deepEqual(mesure.jugementsDeLEtape.filter((j) => j.principal), FIGE.horizon.jugementsPrincipaux, 'le jugement rangé au registre de la mesure, identique');
});

// ------------------------------------------------------- 2. avant l'horizon

test('avant l’horizon (les premiers chiffres) : le serveur jamais tenu plus de 300 ms d’affilée ; premiers chiffres IDENTIQUES à ceux du code d’avant et au même essai refait sans rendre la main, aucun jugement rangé', (t) => {
  const { mesure, reference } = campagne().avant;
  t.diagnostic(`tenu au plus ${mesure.bilan.blocMaxMs} ms (« ${mesure.bilan.blocMaxOu} »), vu de dehors ${mesure.dehors.battementMaxMs} ms ; ${mesure.bilan.essai.matchs} matchs comparés`);
  verifierLaMesure(mesure, 'avant l’horizon');
  assert.equal(mesure.bilan.essai.principal, false);
  assert.ok(mesure.bilan.essai.matchs >= 200, `des centaines de matchs joués comparés (${mesure.bilan.essai.matchs})`);
  assert.equal(reference.comparaison.chemin, 'premiers-chiffres');
  assert.equal(reference.comparaison.identique, true, 'les premiers chiffres rangés = ceux refaits sans pause');
  assert.equal(reference.comparaison.jugementRange, null);
  assert.equal(mesure.range.premiersChiffres.matchs, reference.attendu.matchs);
  assert.deepEqual(mesure.range.premiersChiffres.calibration, reference.attendu.calibration, 'même calibration rapportée');
  assert.deepEqual(mesure.range.premiersChiffres.temoins, reference.attendu.temoins, 'même témoin du score');
  assert.deepEqual(mesure.jugementsDeLEtape.filter((j) => j.principal), []);
  assert.deepEqual(mesure.bilan.essai, FIGE.avant.essai, 'même bilan d’essai que le code d’avant');
  assert.deepEqual(mesure.range, FIGE.avant.range, 'premiers chiffres IDENTIQUES à ceux du code d’avant');
});

// ------------------------------------------------------- 3. les matchs à calculer

test('les matchs à calculer : la main rendue entre l’enrichissement et chacune des deux analyses, et entre deux matchs ; le plus long moment dit où il s’est terminé', () => {
  const { nuit } = campagne();
  assert.equal(nuit.bilan.erreur, null);
  assert.ok(nuit.bilan.calcules >= 5, `des matchs calculés (${nuit.bilan.calcules})`);
  assert.equal(nuit.bilan.echecs, 0, JSON.stringify(nuit.bilan.echantillons));
  assert.ok(nuit.bilan.pauses >= 4 * nuit.bilan.calcules, `au moins quatre pauses par match (${nuit.bilan.pauses} pour ${nuit.bilan.calcules})`);
  assert.ok(nuit.bilan.blocMaxMs > 0 && nuit.bilan.blocMaxMs < SEUIL_MS, `tenu ${nuit.bilan.blocMaxMs} ms (« ${nuit.bilan.blocMaxOu} »)`);
  assert.equal(typeof nuit.bilan.blocMaxOu, 'string');
});

// ------------------------------------------------------------------- 4. le code

test('le code : toute l’étape passe par UNE série de pauses — chaque match en trois morceaux, la table relue par pages, les lignes, le témoin et les compléments de l’essai en générateurs, chaque juge à part ; plus aucune mesure à l’horloge du calendrier', () => {
  const sansCommentaires = (t) => t.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  const blanc = sansCommentaires(fs.readFileSync(path.join(SRC, 'data', 'enregistreurs', 'moteurABlanc.js'), 'utf8'));
  assert.match(blanc, /pauses = creerPauses\(\) \} = \{\}\) \{/, 'calculerABlanc crée la série de pauses (remplaçable par un essai)');
  assert.match(
    blanc,
    /enrichMatchWithRealAverages\(match, \{ sansRepliPayant: true \}\);\n\s*await pauses\.pause\('enrichissement d’un match'\);[\s\S]*?analyzeMatch\(enrichi, enService, tilt, sport, \{ maintenant \}\);\n\s*await pauses\.pause\('analyse en service d’un match'\);\n\s*const b = await analyzeMatch\(enrichi, configCandidate, tilt, sport, \{ maintenant \}\);\n\s*await pauses\.pause\('analyse de la candidate d’un match'\);/
  );
  assert.match(blanc, /await pauses\.pause\('fin d’un match'\);/);
  assert.match(blanc, /await pauses\.pause\('tranche d’écriture à blanc'\);/);
  assert.match(blanc, /jugerLEssai\(\{ candidate: essaiEnCours, database: base, maintenant, versions, mesure, pauses \}\)/, 'l’essai jugé dans la même série de pauses');
  for (const g of ['pronosticsABlancParPages', 'lignesDeLEssaiParEtapes', 'temoinDuScoreParEtapes', 'complementsDeLEssaiParEtapes']) {
    assert.match(blanc, new RegExp(`executerEnRendantLaMain\\(\\s*${g}\\(`), `${g} exécuté en rendant la main`);
  }
  assert.doesNotMatch(blanc, /\bpronosticsABlanc\(|\blignesDeLEssai\(|\btemoinDuScore\(|\bcomplementsDeLEssai\(/, 'plus aucun appel d’un seul tenant');
  assert.doesNotMatch(blanc, /executerSansPause/, 'jamais sans pause dans la nuit');
  assert.doesNotMatch(blanc, /blocMaxMs = Math\.max|Date\.now\(\) - depuis|Date\.now\(\) - avant/, 'la mesure vient des pauses (horloge du processus), plus de l’horloge du calendrier');
  assert.match(blanc, /return \{ \.\.\.bilan, \.\.\.tenu\(\) \};/, 'blocMaxMs, blocMaxOu et le nombre de pauses rendus au bilan');
});
