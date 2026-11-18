/**
 * LA COMBINAISON — LE LOT 2a (étape 38, 16/11/2026) : ce qui protège l'argent, sans changer une probabilité.
 *   - AUCUN CONSEIL DE PARI SUR UN MATCH « À VÉRIFIER » (décision de Pierre du 15/11/2026) : la règle vit dans le verdict du
 *     moteur (core/engine/verdictPari.js, sansConseilAVerifier) ; la donnée vient de l'appelant (data/aVerifierPourLeMoteur.js) ;
 *   - le combiner dans le moteur (core/engine/combiner.js), À L'IDENTITÉ : tous les β sont nuls (le banc n'a rien prouvé) ;
 *   - les traces gelées avec chaque pronostic (engine_picks : confiance, classe_seuil, seuil_applique, palier).
 * Le calcul réel tourne UNE fois, dans une copie isolée (aides/script-combinaison-lot2.mjs) : la base d'essai, des matchs
 * FABRIQUÉS, aucune donnée réelle, aucun réseau. Le « moteur d'avant » y est refait depuis le fichier du jour (le bloc du
 * combiner remplacé par la fusion d'avant) et son sha1 est celui du fichier en service avant ce lot.
 * T-L2-3 et T-L2-4 restent « à faire » : ils viennent avec les candidates de combinaison du lot 2b (pas avant l'adoption de
 * la candidate propre de chaque famille).
 *   node --test test/combinaisonLot2.test.mjs        (depuis server/)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import { combinerLe1N2, combinerLaFamille, melangerEnLogCotes, aLIdentite, poidsDeLaFamille } from '../src/core/engine/combiner.js';
import { POIDS_DE_LA_COMBINAISON } from '../src/core/engine/poidsDeLaCombinaison.js';
import * as CONF from '../src/core/engine/confidence.js';
import { sansConseilAVerifier, RAISON_A_VERIFIER, ETATS_VERDICT } from '../src/core/engine/verdictPari.js';
import { validerCandidate, fichiersDuMoteur, FAMILLES_ANCREES_SUR_LE_1N2 } from '../src/core/engine/engineVersions.js';
import { MARCHES_CONNUS } from '../src/sports/football/markets.js';
import { COMBINAISON_AU_BANC } from '../src/data/combinaison/noteDeLaCombinaison.js';
import { poidsRetenus, texteDesPoids, PoidsARecopierAuLot2b, VARIANTES_A_POIDS, SIGNAUX_DE_LA_COMBINAISON } from '../src/data/combinaison/poidsPourLeMoteur.js';
import { melangerEnLogCotes as melangeDuBanc } from '../src/data/combinaison/formulesDeLaCombinaison.js';
import { degreDeA, degreDeE } from '../src/data/combinaison/reglesDeConfiance.js';
import { aVerifierDuMatch, familleDuMarche } from '../src/data/db/dailyChecks.js';
import { preparerAVerifierDuConseil, preparerAVerifierDuConseilParNoms, avecAVerifierPourLeMoteur, FAMILLE_DU_CONSEIL } from '../src/data/aVerifierPourLeMoteur.js';

const SRC = path.join(SERVEUR, 'src');
const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-combinaison-lot2.mjs');
const lire = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');
const sansCommentaires = (texte) => texte.replace(new RegExp('/[*][^]*?[*]/', 'g'), '').replace(new RegExp('(^|[^:\'"`])//.*$', 'gm'), '$1');
/** Tous les imports d'un fichier : « import … from 'x' », « import 'x' » (sans rien nommer), « export … from 'x' » et import('x'). */
const importsDe = (rel) => {
  const code = sansCommentaires(lire(rel));
  return [...code.matchAll(/^\s*(?:import|export)\s+(?:[^;'"]*?\s+from\s+)?['"]([^'"]+)['"]/gm), ...code.matchAll(/\bimport\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
};

/** Le sha1 de core/engine/oddsEngine.js EN SERVICE avant ce lot (dépôt du 15/11/2026 ; le manifeste de la 46). */
const ODDS_ENGINE_D_AVANT = 'c376393d980ca569b4562191369c1cd8a7ff56b2';

let sortie = null;
function reel() {
  if (sortie) return sortie;
  const copie = preparerCopie({});
  try {
    const r = executer(copie, SCRIPT, { timeout: 600_000 });
    assert.equal(r.code, 0, r.erreurs.slice(-3000));
    assert.equal(r.reseau, false, 'aucun appel réseau');
    assert.ok(r.json?.ok, `sortie illisible : ${r.sortie.slice(-500)}`);
    sortie = r.json;
    return sortie;
  } finally {
    copie.nettoyer();
  }
}

/** Un générateur amorcé (aucun hasard non rejouable). */
function tirage(graine) {
  let s = graine >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const troisProbas = (alea) => {
  const x = [alea() + 0.05, alea() + 0.05, alea() + 0.05];
  const t = x[0] + x[1] + x[2];
  return x.map((v) => v / t);
};

test('T-L2-1 l’identité : le moteur avec le combiner (β nuls) rend les MÊMES sorties, à l’octet, que le moteur d’avant — 4 sortes de cotes × 3 clubs × 4 réglages (dont les anciens poids et le modèle de buts unique) ; une nuit fabriquée gèle les chiffres du moteur d’avant', (t) => {
  // La fusion d'avant, la même expression dans le même ordre : égalité stricte (===) sur 5 000 tirages, poids quelconques.
  const alea = tirage(38);
  for (let i = 0; i < 5000; i++) {
    const marche = troisProbas(alea);
    const [sh, sd, sa] = troisProbas(alea);
    const [eh, ed, ea] = troisProbas(alea);
    const w = i % 3 === 0 ? { market: 1, structural: 0, exogenous: 0 } : { market: alea(), structural: alea(), exogenous: alea() };
    const r = combinerLe1N2({ marche, structurel: { home: sh, draw: sd, away: sa }, exogene: { home: eh, draw: ed, away: ea }, fusion: w });
    assert.ok(r.home === w.market * marche[0] + w.structural * sh + w.exogenous * eh, `tirage ${i} (domicile)`);
    assert.ok(r.draw === w.market * marche[1] + w.structural * sd + w.exogenous * ed, `tirage ${i} (nul)`);
    assert.ok(r.away === w.market * marche[2] + w.structural * sa + w.exogenous * ea, `tirage ${i} (extérieur)`);
    assert.deepEqual(Object.keys(r), ['home', 'draw', 'away']);
  }
  // Toute autre famille, à β nuls : l'ancre elle-même (le même objet), jamais recalculée.
  const ancre = [0.52, 0.48];
  for (const famille of Object.keys(POIDS_DE_LA_COMBINAISON.familles)) assert.equal(combinerLaFamille(famille, ancre, { statistiques: [0.6, 0.4] }), ancre, famille);
  assert.equal(combinerLaFamille('famille-inconnue', ancre, { statistiques: [0.6, 0.4] }), ancre);
  assert.deepEqual(melangerEnLogCotes([0.5, 0.3, 0.2], [[0.4, 0.3, 0.3]], [0]), [0.5, 0.3, 0.2]);
  // Le combiner est le SEUL endroit de la fusion : oddsEngine.js ne l'écrit plus lui-même.
  const moteur = sansCommentaires(lire('core/engine/oddsEngine.js'));
  assert.match(moteur, /const resultat = combinerLe1N2\(\{\s*marche: \[marketProbHome, marketProbDraw, marketProbAway\],\s*structurel: probabilitiesStructural,\s*exogene: probabilitiesExogenous,\s*fusion: config\.weights\s*\}\);/);
  assert.doesNotMatch(moteur, /weights\.market \*/, 'la fusion écrite deux fois');
  assert.match(sansCommentaires(lire('core/engine/combiner.js')), /fusion\.market \* marketProbHome \+ fusion\.structural \* structurel\.home \+ fusion\.exogenous \* exogene\.home/, 'weights.market toujours lu (le banc le lit aussi : bench/runner.js)');
  assert.ok(lire('bench/runner.js').includes('ctx.config.weights?.market === 1'), 'bench/runner.js lit toujours weights.market (referenceDifferente compté comme avant)');

  // Le vrai moteur, avant / après, dans la copie isolée.
  const r = reel();
  assert.equal(r.avant.sha1, ODDS_ENGINE_D_AVANT, 'le moteur d’avant refait dans la copie n’est pas le fichier en service avant ce lot');
  assert.notEqual(r.avant.sha1DuJour, r.avant.sha1);
  assert.equal(r.identite.comparaisons, 48);
  assert.deepEqual(r.identite.ecarts, [], 'une sortie du moteur a changé');
  assert.ok(r.identite.tailleDUneSortie > 10_000, 'la sortie comparée est l’analyse entière');
  // Les quatre sortes de cotes sont bien quatre régimes différents (sinon l'essai ne couvrirait qu'un chemin).
  assert.deepEqual(r.identite.actions, { pinnacle: ['RECOMMENDED:'], palier2: ['RECOMMENDED:'], repli: ['PASS:trop_peu_de_bookmakers'], sansCote: ['PASS:no_market_odds'] });
  assert.deepEqual(r.identite.sources, { pinnacle: ['cotes:Pinnacle'], palier2: ['cotes:palier 2'], repli: ['cotes:'], sansCote: ['statistiques:'] });
  // La nuit fabriquée : ce que le gel écrit (hors les quatre colonnes neuves) = ce que le moteur d'avant aurait gelé.
  assert.equal(r.nuit.echecs, 0);
  assert.equal(r.nuit.ecrits, r.nuit.pronostics);
  assert.ok(r.chiffresDAvant.lignes >= 25, `${r.chiffresDAvant.lignes} lignes comparées`);
  assert.equal(r.chiffresDAvant.identiques, true, 'un chiffre gelé cette nuit n’est pas celui du moteur d’avant');
  t.diagnostic(`${r.identite.comparaisons} analyses comparées à l’octet (${r.identite.tailleDUneSortie} caractères chacune), ${r.chiffresDAvant.lignes} lignes gelées comparées`);
});

test('T-L2-2 aucun poids de la combinaison lu en base ni dans un réglage : les β vivent dans l’empreinte (poidsDeLaCombinaison.js, recopié PAR SCRIPT depuis la note du banc, refait ici à l’octet) ; tous nuls ; un β « retenu » ne se recopie pas', () => {
  // Le fichier du moteur = le texte que le script écrit depuis la note, à l'octet.
  assert.equal(lire('core/engine/poidsDeLaCombinaison.js'), texteDesPoids(poidsRetenus(COMBINAISON_AU_BANC)), 'poidsDeLaCombinaison.js retouché à la main (node scripts/etape38.mjs --recopier-moteur)');
  assert.deepEqual(JSON.parse(JSON.stringify(POIDS_DE_LA_COMBINAISON)), poidsRetenus(COMBINAISON_AU_BANC));
  assert.ok(Object.isFrozen(POIDS_DE_LA_COMBINAISON) && Object.isFrozen(POIDS_DE_LA_COMBINAISON.familles) && Object.isFrozen(POIDS_DE_LA_COMBINAISON.familles['1n2']));
  // Tous les β sont nuls ; chaque famille de la règle a son entrée ; aucune variante à poids n'est « retenu ».
  assert.deepEqual(Object.keys(POIDS_DE_LA_COMBINAISON.familles), Object.keys(SIGNAUX_DE_LA_COMBINAISON));
  for (const [famille, betas] of Object.entries(POIDS_DE_LA_COMBINAISON.familles)) {
    for (const [signal, b] of Object.entries(betas)) assert.equal(b, 0, `${famille}.${signal}`);
    assert.equal(aLIdentite(famille), true, famille);
  }
  assert.deepEqual(poidsDeLaFamille('1n2'), { statistiques: 0 });
  assert.deepEqual(Object.keys(POIDS_DE_LA_COMBINAISON.verdicts), Object.keys(VARIANTES_A_POIDS));
  assert.ok(!Object.values(POIDS_DE_LA_COMBINAISON.verdicts).includes('retenu'));
  assert.equal(POIDS_DE_LA_COMBINAISON.source.banc, COMBINAISON_AU_BANC.version);
  // Le script : --verifier dit « identiques » (code 0), sans rien écrire. Correction du 17/11/2026 (vérification des lots
  // d'argent, « à vérifier » C2) : il tourne dans une copie isolée du harnais — scripts/etape38.mjs refuse, à raison, sous
  // OneDrive et hors du bac ; lancé depuis le dossier du code, l'essai était rouge au dépôt.
  const copie = preparerCopie({});
  try {
    fs.mkdirSync(path.join(copie.serveur, 'scripts'), { recursive: true });
    fs.copyFileSync(path.join(SERVEUR, 'scripts', 'etape38.mjs'), path.join(copie.serveur, 'scripts', 'etape38.mjs'));
    const poidsDeLaCopie = path.join(copie.serveur, 'src', 'core', 'engine', 'poidsDeLaCombinaison.js');
    const avant = fs.readFileSync(poidsDeLaCopie, 'utf8');
    assert.equal(avant, lire('core/engine/poidsDeLaCombinaison.js'));
    const v = executer(copie, path.join(copie.serveur, 'scripts', 'etape38.mjs'), { args: ['--recopier-moteur', '--verifier'] });
    assert.equal(v.code, 0, v.erreurs.slice(-800));
    assert.equal(v.json?.ok, true);
    assert.equal(fs.readFileSync(poidsDeLaCopie, 'utf8'), avant, 'le fichier des poids de la copie a été réécrit');
  } finally {
    copie.nettoyer();
  }
  // Une variante « retenu » ne se recopie JAMAIS (elle passe par une candidate du lot 2b) ; une note absente non plus.
  const retenue = { ...COMBINAISON_AU_BANC, variantes: COMBINAISON_AU_BANC.variantes.map((x) => (x.id === '1n2-stats-residuel' ? { ...x, verdict: 'retenu' } : x)) };
  assert.throws(() => poidsRetenus(retenue), PoidsARecopierAuLot2b);
  assert.throws(() => poidsRetenus(null), RangeError);
  assert.throws(() => poidsRetenus({ ...COMBINAISON_AU_BANC, variantes: COMBINAISON_AU_BANC.variantes.filter((x) => x.id !== 'horloge-j2') }), /manque à la note/);
  // Dans le moteur : le combiner n'importe QUE ses poids, les poids n'importent rien ; ni base, ni fichier, ni réglage lu.
  assert.deepEqual(importsDe('core/engine/combiner.js'), ['./poidsDeLaCombinaison.js']);
  assert.deepEqual(importsDe('core/engine/poidsDeLaCombinaison.js'), []);
  for (const f of ['core/engine/combiner.js', 'core/engine/poidsDeLaCombinaison.js']) {
    assert.doesNotMatch(sansCommentaires(lire(f)), /Date\.now\(|new Date\(|Math\.random|openDb|DatabaseSync|\.prepare\(|fetch\(|node:fs|readFileSync|writeFileSync|process\.env|getEngineConfig|config\.combinaison/, f);
    assert.ok(fichiersDuMoteur().includes(f), `${f} hors de l’empreinte du moteur`);
  }
  assert.ok(!fichiersDuMoteur().some((f) => f.startsWith('data/combinaison/')), 'un fichier de data/combinaison/ dans l’empreinte');
  // Avec un β non nul (jamais en service au lot 2a) : la formule mesurée au banc (E1), à 1e-12 près.
  const alea = tirage(381);
  for (let i = 0; i < 300; i++) {
    const pM = troisProbas(alea);
    const pS = troisProbas(alea);
    const beta = alea() * 0.6;
    const ici = melangerEnLogCotes(pM, [pS], [beta]);
    const banc = melangeDuBanc(pM, [pS], [beta]);
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(ici[k] - banc[k]) < 1e-12, `tirage ${i}, issue ${k} : ${ici[k]} ≠ ${banc[k]}`);
  }
  // Le vrai moteur : une clé « combinaison » posée dans le réglage ne change aucun chiffre (aucun poids lu dans un réglage).
  assert.equal(reel().poidsHorsDesReglages.identique, true);
});

test('T-L2-3 l’identifiant d’une candidate de famille n’est jamais celui d’un lancement', { todo: 'lot 2b de l’étape 38 (candidates de combinaison, après l’adoption de la candidate propre de la famille)' });
test('T-L2-4 les vues « moteur » recopiées dans LANCEMENTS après l’adoption seulement', { todo: 'lot 2b de l’étape 38' });

test('T-L2-5 une candidate dont la combinaison change le 1N2 et qui ne déclare que « result » est refusée par validerCandidate : elle déclare les cinq familles ancrées sur lui (critique, constat 2)', () => {
  assert.deepEqual([...FAMILLES_ANCREES_SUR_LE_1N2], ['result', 'totalGoals', 'teamGoals', 'bothTeamsScore', 'resultAndTotal']);
  for (const m of FAMILLES_ANCREES_SUR_LE_1N2) assert.ok(MARCHES_CONNUS.includes(m), m);
  const base = { id: 'combinaison-1n2-v1', etape: '38', quoi: 'Le 1N2 mêlé aux statistiques', modifications: { football: { combinaison: { '1n2': { statistiques: 0.2 } } } } };
  assert.throws(() => validerCandidate({ ...base, marches: ['result'] }), /déclare les cinq familles .* il manque : totalGoals, teamGoals, bothTeamsScore, resultAndTotal/);
  assert.throws(() => validerCandidate({ ...base, marches: ['result', 'totalGoals', 'teamGoals', 'bothTeamsScore'] }), /il manque : resultAndTotal/);
  const complete = { ...base, marches: [...FAMILLES_ANCREES_SUR_LE_1N2] };
  assert.deepEqual(validerCandidate(complete), complete);
  // Une combinaison qui ne touche pas le 1N2 ne les doit pas ; une combinaison vide ou mal formée est refusée.
  const buts = { ...base, id: 'combinaison-buts-v1', modifications: { football: { combinaison: { buts: { statistiques: 0.2 } } } }, marches: ['totalGoals'] };
  assert.deepEqual(validerCandidate(buts), buts);
  assert.throws(() => validerCandidate({ ...base, modifications: { football: { combinaison: {} } }, marches: ['result'] }), /« combinaison » est un objet non vide/);
  assert.throws(() => validerCandidate({ ...base, modifications: { football: { combinaison: 'tout' } }, marches: ['result'] }), /« combinaison » est un objet non vide/);
  // Une candidate sans combinaison n'est pas concernée (celle de l'étape 27, par exemple).
  const sans = { id: 'score-marche-v1', etape: '27', quoi: 'Modèle de score', modifications: { football: { defaultCorrelation: -0.1 } }, marches: ['totalGoals'] };
  assert.deepEqual(validerCandidate(sans), sans);
});

test('T-L2-6 les quatre colonnes neuves d’engine_picks (confiance, classe_seuil, seuil_applique, palier) remplies sur une nuit fabriquée ; les lignes d’avant intactes à l’octet et sans traces ; une trace seule n’ajoute aucune version ; aucune étiquette de confiance', () => {
  const r = reel();
  // Les colonnes : les quatre neuves à la FIN (ajout pur), avec leur type.
  assert.deepEqual(r.colonnes.slice(-4), ['confiance:TEXT', 'classe_seuil:TEXT', 'seuil_applique:REAL', 'palier:TEXT']);
  assert.equal(r.colonnes.at(-5), 'distribution:TEXT');
  const ddl = lire('data/db/matchStatsDb.js');
  for (const [c, type] of [['confiance', 'TEXT'], ['classe_seuil', 'TEXT'], ['seuil_applique', 'REAL'], ['palier', 'TEXT']]) assert.ok(ddl.includes(`['engine_picks', '${c}', '${type}']`), `ALTER TABLE gardé pour ${c}`);
  // Les lignes d'AVANT (écrites sans traces, la veille) : identiques à l'octet après la nuit, leurs quatre colonnes vides.
  assert.equal(r.lignesDAvantEcrites, 15);
  assert.deepEqual(r.lignesDAvant, { nombre: 15, intactes: true, sansTraces: true });
  // La nuit : M1 (Pinnacle), M2 (cotes gratuites, « à vérifier »), M3 (les cotes arrivent : version 2).
  const confiance = (A, E) => JSON.stringify({ regle: 'confiance-v1', jugee: false, etiquette: null, degres: { A, E }, nonLus: ['C', 'D', 'F', 'G'] });
  assert.deepEqual(r.traces.M1, { lignes: 15, paliers: ['pinnacle'], classes: ['pinnacle'], seuilDuResultat: [r.seuilEnService], seuilsDesAutres: [null], confiances: [confiance(0, 0)], versions: [1] });
  assert.deepEqual(r.traces.M2, { lignes: 14, paliers: ['repli'], classes: ['a-verifier'], seuilDuResultat: [null], seuilsDesAutres: [null], confiances: [confiance(2, 2)], versions: [1] });
  assert.deepEqual(r.traces.M3, { lignes: 15, paliers: ['repli'], classes: ['repli'], seuilDuResultat: [null], seuilsDesAutres: [null], confiances: [confiance(2, 0)], versions: [2] });
  assert.equal(r.seuilEnService, 0.02);
  // Regelé une heure après, « à vérifier » passé d'un match à l'autre : mêmes chiffres → aucune ligne de plus.
  assert.equal(r.regel.ecrits, 0);
  assert.equal(r.apresRegel.lignes, r.apresRegel.avant);
  // Le gel d'une ANALYSE : la donnée « à vérifier » suit jusqu'aux colonnes.
  assert.equal(r.analyse.enFile, true);
  assert.deepEqual(r.analyse.traces.classes, ['a-verifier']);
  assert.deepEqual(r.analyse.traces.paliers, ['palier2']);
  assert.deepEqual(r.analyse.traces.seuilDuResultat, [null]);
  // Correction du 17/11/2026 (vérification des lots d'argent, « à vérifier » C3) : des CORNERS douteux seulement (la vraie règle
  // du contrôle, un état fabriqué) — chaque ligne gelée est jugée par la famille de SON marché : les lignes de corners et de
  // tirs sont « a-verifier », la ligne du 1 / N / 2 ne l'est pas (le conseil reste), ni les buts.
  const c = r.cornersDouteux;
  assert.ok(c.ids.homeId && c.ids.awayId, 'Arsenal – Chelsea reconnus dans la base d’essai');
  assert.equal(c.aVerifierDuConseil, null, 'des corners douteux ne retirent pas le conseil 1 / N / 2');
  assert.equal(c.action, 'RECOMMENDED');
  assert.equal(c.enFile, true);
  assert.ok(['buts', 'corners', 'tirs'].every((f) => c.familles.includes(f)), c.familles.join(', '));
  assert.deepEqual(c.corners, ['a-verifier']);
  assert.deepEqual(c.tirs, ['a-verifier']);
  assert.ok(!c.buts.includes('a-verifier'), c.buts.join(', '));
  assert.deepEqual(c.resultat, [{ classe: 'pinnacle', seuil: r.seuilEnService, confiance: confiance(0, 0) }]);
  assert.deepEqual(c.confiancesCorners, [confiance(0, 2)]);
  // Les traces, sans le moteur : paliers, classes, seuils ; les degrés de l'ancre sont ceux de la règle scellée.
  const seuil = 0.02;
  assert.deepEqual([...CONF.PALIERS], ['pinnacle', 'palier2', 'palier3', 'repli', 'sans-cote']);
  for (const p of CONF.PALIERS) assert.equal(CONF.DEGRE_DE_L_ANCRE[p], degreDeA(p), `degré de l’ancre « ${p} »`);
  assert.equal(CONF.confianceDuMoteur({ palier: 'pinnacle', aVerifier: { raisons: [{ texte: 'x' }], texte: 'x' } }).degres.E, degreDeE('constat-rouge'));
  assert.equal(CONF.confianceDuMoteur({ palier: 'pinnacle' }).degres.E, degreDeE('rien'));
  assert.equal(CONF.palierDe({ basis: 'Pinnacle' }), 'pinnacle');
  assert.equal(CONF.palierDe({ basis: 'palier 2' }), 'palier2');
  assert.equal(CONF.palierDe({ basis: 'palier 3' }), 'palier3');
  assert.equal(CONF.palierDe({ basis: null, surCotes: true }), 'repli');
  assert.equal(CONF.palierDe({}), 'sans-cote');
  assert.deepEqual(CONF.tracesDuPronostic({ basis: 'palier 3', seuil }), { palier: 'palier3', classeSeuil: 'palier3', seuilApplique: 0.02, confiance: confiance(1, 0) });
  assert.deepEqual(CONF.tracesDuPronostic({ basis: 'Pinnacle', seuil, avecSeuil: false }), { palier: 'pinnacle', classeSeuil: 'pinnacle', seuilApplique: null, confiance: confiance(0, 0) });
  assert.deepEqual(CONF.tracesDuPronostic({ basis: 'Pinnacle', seuil, aVerifier: true }), { palier: 'pinnacle', classeSeuil: 'a-verifier', seuilApplique: null, confiance: confiance(0, 2) });
  // Aucune classe ne change le seuil au lot 2a : celui du réglage partout où une cote juste existe, null sinon.
  for (const c of ['pinnacle', 'palier2', 'palier3']) assert.equal(CONF.seuilApplique(c, 0.035), 0.035);
  for (const c of ['repli', 'sans-cote', 'a-verifier']) assert.equal(CONF.seuilApplique(c, seuil), null);
  for (const illisible of [undefined, null, '0.02', NaN]) assert.equal(CONF.seuilApplique('pinnacle', illisible), null);
  assert.doesNotMatch(sansCommentaires(lire('core/engine/confidence.js')), /edgeThresholdMin|config/, 'confidence.js ne lit aucun réglage : le seuil lui est donné');
  // Jamais une étiquette (« sûr »…) tant qu'aucune famille n'est jugée ; confidence.js n'importe rien et ne lit rien.
  for (const p of CONF.PALIERS) {
    const c = CONF.confianceDuMoteur({ palier: p });
    assert.equal(c.etiquette, null);
    assert.equal(c.jugee, false);
  }
  assert.deepEqual(importsDe('core/engine/confidence.js'), []);
  assert.doesNotMatch(sansCommentaires(lire('core/engine/confidence.js')), /Date\.now\(|new Date\(|Math\.random|openDb|DatabaseSync|\.prepare\(|fetch\(|node:fs|readFileSync|process\.env/);
  // Une trace ne compte pas dans « le pronostic a changé » (depot.js, memeValeur).
  const meme = lire('data/enregistreurs/depot.js').match(/const memeValeur = [^;]*;/)?.[0] ?? '';
  assert.ok(meme.length > 100, 'memeValeur introuvable');
  assert.doesNotMatch(meme, /confiance|classeSeuil|seuilApplique|palier/);
});

/** Les fichiers de src/ qui appellent le moteur de pari (hors ses deux fichiers), et ce que chacun fait d'« à vérifier ». */
const PORTES = Object.freeze({
  'api/controllers/analysis.controller.js': ['const avecFraicheur = avecAVerifierPourLeMoteur(avecHeures, sportId === \'football\' ? preparerAVerifierDuConseilParNoms()(avecHeures) : null);', 'analyzeMatch({ ...avecFraicheur, contexteDeMise: contexteDuMoteur(contexteMise, avecFraicheur) }'],
  'core/ai/autoMatchAiTrigger.js': ['const aVerifier = preparerAVerifierDuConseilParNoms()(enrichi);', 'analyzeMatch(avecAVerifierPourLeMoteur(enrichi, aVerifier), getEngineConfig(\'football\')', 'gelerAnalyse({ match, engineResult, lineups, origine, aVerifier })'],
  'data/enregistreurs/gelPronostics.js': ['const aVerifierDe = aVerifierDeLaNuit ?? preparerAVerifierDuConseil({ maintenant });', 'const aVerifier = aVerifierDe({ league: match.league, date, homeId, awayId });', 'analyzeMatch(avecAVerifierPourLeMoteur(enrichi, aVerifier), config, getTiltState(), sport, { maintenant })', 'aVerifierDuMarche: aVerifierParMarche(parFamille, { league: match.league, date, homeId, awayId }, aVerifier)', 'aVerifierDuMarche: aVerifierParMarche(aVerifierParFamilleDe ?? preparerAVerifierParFamille({ maintenant }), { league: match.league, date, homeId, awayId }, aVerifier)'],
  'data/screener.js': ['aVerifierDe ??= preparerAVerifierDuConseil({ maintenant });', 'const match = avecAVerifierPourLeMoteur(avecHeures, aVerifierDe({ league: m.league, commenceTime: m.commenceTime, homeId: m.homeId, awayId: m.awayId }));', 'decisionDePari(match, config, tiltState)']
});
const SANS_PORTE = Object.freeze({
  'api/controllers/simulation.controller.js': 'le prix d’un combiné : il ne lit que les probabilités de l’analyse, jamais le conseil',
  'bench/runner.js': 'le banc d’essai : il rejoue le passé, sans contrôle quotidien',
  'bench/simulateBets.js': 'le banc d’essai : il rejoue la règle de pari sur le passé',
  'data/combinaison/bancFd.js': 'le banc de la combinaison (lot 1) : il rejoue le passé',
  'data/enregistreurs/moteurABlanc.js': 'la candidate à blanc : des probabilités, aucun conseil montré',
  'data/simulation/simulationNuit.js': 'la simulation de la nuit : des probabilités, aucun conseil montré',
  'data/saisiesCotes.js': 'la probabilité du moteur pour une cote saisie : la value d’une saisie ne passe pas par le verdict du moteur ; depuis le 17/11/2026, elle lit « à vérifier » pour la famille du marché saisi (preparerAVerifierParFamille ; cotesVosBookmakers.test.mjs)',
  'data/mise/miseRead.js': 'la mise d’un conseil DÉJÀ décidé par le Repérage (miseDuConseil) : aucune décision n’y est prise'
});

test('T-L2-7 un match « à vérifier » n’a JAMAIS `action: RECOMMENDED` — porte par porte : le moteur (page du match, analyse IA), le Repérage et les Opportunités, le gel ; chaque fichier qui appelle le moteur de pari est une porte qui joint la donnée, ou une exemption nommée', () => {
  const r = reel();
  // 1. LE MOTEUR : le même match, libre puis « à vérifier ».
  const { libre, refuse, parTrue } = r.moteur;
  assert.equal(libre.action, 'RECOMMENDED');
  assert.ok(libre.mise > 0 && libre.verts === 1 && libre.mises === 1 && libre.cellulesVertes === 1 && libre.conseilsDuComparateur === 1);
  for (const x of [refuse, parTrue]) {
    assert.equal(x.action, 'PASS');
    assert.equal(x.raison, RAISON_A_VERIFIER);
    assert.equal(x.mise, null, 'une mise sur un match « à vérifier »');
    assert.equal(x.regleDeMise, null);
    assert.equal(x.verts, 0, 'un verdict vert sur un match « à vérifier »');
    assert.equal(x.mises, 0);
    assert.equal(x.cellulesVertes, 0, 'une cellule verte au comparateur');
    assert.equal(x.conseilsDuComparateur, 0);
    assert.equal(x.retenue, null);
    assert.equal(x.etatsConnus, true, 'un état de verdict inconnu de l’écran');
    assert.deepEqual(x.etats, { home: 'value-secondaire', draw: 'sans-value', away: 'sans-value' });
    // L'avantage reste dit (rien n'est caché), le conseil refusé est nommé, les candidats gardés.
    assert.equal(x.avantage, libre.avantage);
    assert.equal(x.candidats, libre.candidats);
    assert.deepEqual(x.conseilRefuse, { outcome: 'home', label: 'Aston Villa gagne', bookmaker: 'williamhill', bookmakerTitle: 'William Hill', odds: 2.25, displayedOdds: 2.25, ev: 0.0983 });
    assert.match(x.raisons.home, /^Avantage de \+9,8 % chez William Hill, au-dessus du seuil de 2 %, mais ce match est marqué « à vérifier »/);
    assert.match(x.raisons.home, /aucun pari n'est conseillé dessus tant que ses données ne sont pas vérifiées\.$/);
    assert.equal(x.raisons.draw, libre.raisons.draw);
  }
  assert.match(refuse.raisons.home, /« à vérifier » \(Aston Villa – Everton du 28\/09 \(2-1\) : score différent chez football-data \(fabriqué\)\) :/, 'la raison du contrôle est dite');
  assert.equal(refuse.texte, 'Aston Villa – Everton du 28/09 (2-1) : score différent chez football-data (fabriqué)');
  assert.equal(refuse.cellulesAVerifier, 1);
  assert.ok(ETATS_VERDICT.includes('value-secondaire'));
  // Sans raison (absent, null, false, objet vide, liste vide, texte blanc) : la sortie d'avant, à l'octet.
  assert.deepEqual(r.moteur.sansRaisonInchange, [true, true, true, true, true, true]);

  // 2. LE REPÉRAGE ET LES OPPORTUNITÉS (avecVerdicts) : par identifiants FotMob.
  assert.equal(r.reperage.parDefaut.action, 'RECOMMENDED', 'sans contrôle quotidien dans la copie : le conseil d’avant');
  assert.deepEqual(r.reperage.libre, r.reperage.parDefaut);
  assert.deepEqual(r.reperage.refuse, { action: 'PASS', raison: RAISON_A_VERIFIER, conseil: null, verts: 0, conseilsAuxIssues: 0, etats: ['value-secondaire', 'sans-value', 'sans-value'] });
  assert.deepEqual(r.reperage.demande, [{ league: 'EPL', commenceTime: '2026-10-06T19:00:00.000Z', homeId: r.reperage.homeId, awayId: r.reperage.awayId }]);
  assert.ok(r.reperage.homeId && r.reperage.awayId);

  // 3. LE GEL : la nuit (classe « a-verifier » gelée — T-L2-6) et l'analyse d'un match « à vérifier » (aucun conseil).
  assert.deepEqual([r.analyse.action, r.analyse.raison], ['PASS', RAISON_A_VERIFIER]);
  assert.deepEqual(r.traces.M2.classes, ['a-verifier']);

  // 4. LA RÈGLE, sans le moteur : seul un conseil est refusé ; toute autre décision rendue TELLE QUELLE (le même objet).
  const aVerifier = { raisons: [{ texte: 'un constat' }], texte: 'un constat' };
  for (const d of [{ action: 'PASS', stake: null, reason: 'pas_de_value', candidates: [] }, { action: 'CIRCUIT_BREAKER_ACTIVE', stake: null }, { action: 'PASS', reason: 'a_rafraichir', aRafraichir: {} }, null, undefined]) {
    assert.equal(sansConseilAVerifier(d, { aVerifier }), d);
  }
  const conseil = { action: 'RECOMMENDED', stake: 12.5, outcome: 'away', label: 'X gagne', bookmaker: 'unibet_fr', bookmakerTitle: 'Unibet (FR)', odds: 2.4, ev: 0.05, candidates: [{ outcome: 'away' }], regleDeMise: { f: 0.01 }, misePlafonnee: { mise: 10 } };
  for (const v of [undefined, null, false, {}, { raisons: [] }, { texte: ' ' }, 'oui', 1]) assert.equal(sansConseilAVerifier(conseil, { aVerifier: v }), conseil, JSON.stringify(v));
  assert.equal(sansConseilAVerifier(conseil, null), conseil);
  const refus = sansConseilAVerifier(conseil, { aVerifier });
  assert.deepEqual(refus, { action: 'PASS', stake: null, reason: 'a_verifier', candidates: [{ outcome: 'away' }], aVerifier: { texte: 'un constat' }, conseilRefuse: { outcome: 'away', label: 'X gagne', bookmaker: 'unibet_fr', bookmakerTitle: 'Unibet (FR)', odds: 2.4, displayedOdds: 2.4, ev: 0.05 } });
  assert.ok(!('regleDeMise' in refus) && !('misePlafonnee' in refus), 'ni règle de mise ni plafond sur un refus');
  assert.equal(sansConseilAVerifier(conseil, { aVerifier: true }).aVerifier.texte, null);
  assert.equal(CONF.estAVerifier({ raisons: [{}] }), true);
  assert.equal(CONF.raisonAVerifier({ raisons: [{ texte: ' premier constat ' }] }), 'premier constat');
  // La règle est appliquée APRÈS les garde-fous, par le seul stakingDuMatch (toutes les portes passent par lui).
  assert.match(sansCommentaires(lire('core/engine/verdictPari.js')), /return sansConseilAVerifier\(plafonnerLeConseil\(decision, tiltState\), match\);/);
  assert.deepEqual(importsDe('core/engine/verdictPari.js').filter((i) => /confidence/.test(i)), ['./confidence.js']);

  // 5. CE QUE CHAQUE PORTE JOINT : la même définition partout — le badge « à vérifier » du contrôle quotidien POUR LA FAMILLE DU
  // PARI CONSEILLÉ (le 1 / N / 2), celle que la règle mesurée au banc donne d'une ligne « à vérifier » (nuitDeLaCombinaison.js,
  // controleEnVigueur). Un constat sur les seuls corners, tirs ou cartons marque le bandeau du match, pas le conseil.
  assert.equal(FAMILLE_DU_CONSEIL, familleDuMarche('result'));
  assert.equal(typeof FAMILLE_DU_CONSEIL, 'string');
  assert.ok(lire('data/combinaison/nuitDeLaCombinaison.js').includes('famille: familleDuMarche(ligne.market_id), fotmob: null }'), 'la règle mesurée au banc ne définit plus « à vérifier » par la famille du marché');
  {
    // La VRAIE règle du contrôle quotidien (pure), sur un état fabriqué : ce qui retire le conseil, et ce qui ne le retire pas.
    const etat = {
      aVerifier: {
        clubs: {
          'fotmob-1': [{ id: 'a', controle: 'score-football-data', texte: 'Score à vérifier : A – B du 05/09/2026', date: '2026-09-05', familles: ['tout'] }],
          'fotmob-2': [{ id: 'b', controle: 'chiffres-equipe', texte: 'Statistiques impossibles : C – D du 20/09/2026', date: '2026-09-20', familles: ['corners', 'tirs'] }]
        },
        ligues: { EPL: [{ id: 'j', controle: 'jaunes-non-releves', texte: 'Cartons jaunes non relevés par FotMob en EPL depuis le 05/09/2026', date: '2026-09-05', familles: ['cartons'] }] },
        global: []
      }
    };
    const pourLeConseil = preparerAVerifierDuConseil({ verifier: (x) => aVerifierDuMatch(etat, x) });
    const resume = (x) => aVerifierDuMatch(etat, { ...x, famille: null });
    const scoreDouteux = { league: 'Championship', date: '2026-10-06', homeId: 'fotmob-1', awayId: 'fotmob-9' };
    const cornersDouteux = { league: 'Championship', date: '2026-10-06', homeId: 'fotmob-2', awayId: 'fotmob-9' };
    const cartonsDuChampionnat = { league: 'EPL', date: '2026-10-06', homeId: 'fotmob-8', awayId: 'fotmob-9' };
    assert.deepEqual(pourLeConseil(scoreDouteux)?.raisons.map((r) => r.id), ['a'], 'un score douteux retire le conseil');
    assert.equal(CONF.estAVerifier(pourLeConseil(scoreDouteux)), true);
    assert.equal(pourLeConseil(cornersDouteux), null, 'des corners douteux ne retirent pas un conseil 1 / N / 2');
    assert.deepEqual(resume(cornersDouteux)?.raisons.map((r) => r.id), ['b'], '… mais marquent le bandeau du match');
    assert.equal(pourLeConseil(cartonsDuChampionnat), null, 'les cartons non relevés de tout un championnat ne retirent aucun conseil');
    assert.deepEqual(resume(cartonsDuChampionnat)?.raisons.map((r) => r.id), ['j']);
    // Une raison GÉNÉRALE (le magasin pas à jour) marque tous les matchs : aucun conseil nulle part tant qu'elle dure.
    const general = { aVerifier: { clubs: {}, ligues: {}, global: [{ id: 'maj', controle: 'magasin-a-jour', texte: 'Le magasin n’est pas à jour', date: null, familles: ['tout'] }] } };
    const partout = preparerAVerifierDuConseil({ verifier: (x) => aVerifierDuMatch(general, x) });
    assert.deepEqual(partout(cartonsDuChampionnat)?.raisons.map((r) => r.id), ['maj']);
  }
  const vus = [];
  const parIds = preparerAVerifierDuConseil({ verifier: (x) => (vus.push(x), x.homeId === 'h1' ? aVerifier : null) });
  assert.equal(parIds({ league: 'EPL', commenceTime: '2026-10-06T19:00:00.000Z', homeId: 'h1', awayId: 'a1' }), aVerifier);
  assert.equal(parIds({ league: 'EPL', date: '2026-10-07', homeId: 'h2', awayId: 'a2' }), null);
  assert.deepEqual(vus, [{ league: 'EPL', date: '2026-10-06', homeId: 'h1', awayId: 'a1', famille: FAMILLE_DU_CONSEIL }, { league: 'EPL', date: '2026-10-07', homeId: 'h2', awayId: 'a2', famille: FAMILLE_DU_CONSEIL }]);
  const nomsVus = [];
  const parNoms = preparerAVerifierDuConseilParNoms({ verifier: (x) => (nomsVus.push(x), aVerifier) });
  assert.equal(parNoms({ league: 'EPL', commenceTime: '2026-10-06T19:00:00.000Z', home: 'Aston Villa', away: 'Everton' }), aVerifier);
  assert.deepEqual(nomsVus, [{ league: 'EPL', date: '2026-10-06', homeName: 'Aston Villa', awayName: 'Everton', famille: FAMILLE_DU_CONSEIL }]);
  assert.equal(parNoms(null), null);
  // Une lecture qui échoue ne lève jamais : rien à dire, le conseil reste celui d'avant.
  const casse = () => {
    throw new Error('contrôle illisible');
  };
  assert.equal(preparerAVerifierDuConseil({ verifier: casse })({ homeId: 'h1' }), null);
  assert.equal(preparerAVerifierDuConseilParNoms({ verifier: casse })({ home: 'A', away: 'B' }), null);
  // Le match donné au moteur : aucune clé de plus sans raison (le même objet), `aVerifier` sinon.
  const match = { matchId: 'm1' };
  assert.equal(avecAVerifierPourLeMoteur(match, null), match);
  assert.deepEqual(avecAVerifierPourLeMoteur(match, aVerifier), { matchId: 'm1', aVerifier });

  // 6. L'INVENTAIRE DES PORTES : tout fichier de src/ qui appelle le moteur de pari est une porte ou une exemption nommée.
  const appelle = /\b(analyzeMatch|decisionDePari|stakingDuMatch|findValueBet|findValueBetFraiche|miseDuConseil)\(/;
  const duMoteur = new Set(['core/engine/oddsEngine.js', 'core/engine/verdictPari.js', 'core/engine/valueFinder.js', 'core/engine/fraicheurCotes.js']);
  const trouves = fs
    .readdirSync(SRC, { recursive: true })
    .map((f) => String(f).split(path.sep).join('/'))
    .filter((f) => f.endsWith('.js') && !duMoteur.has(f) && appelle.test(sansCommentaires(lire(f))))
    .sort();
  assert.deepEqual(trouves, [...Object.keys(PORTES), ...Object.keys(SANS_PORTE)].sort(), 'un appelant du moteur de pari qui n’est ni une porte « à vérifier » ni une exemption nommée');
  for (const [f, textes] of Object.entries(PORTES)) {
    const code = lire(f);
    for (const x of textes) assert.ok(code.includes(x), `${f} : « ${x} » introuvable — la porte ne joint plus « à vérifier » au match donné au moteur`);
    assert.ok(importsDe(f).some((i) => /aVerifierPourLeMoteur\.js$/.test(i)), `${f} n’importe pas aVerifierPourLeMoteur.js`);
  }
  // Dans une porte, AUCUN appel du moteur de pari ne reçoit un match sans la donnée (hors la passe du Repérage, qui ne garde
  // que des probabilités : la décision est reprise à la lecture par avecVerdicts).
  assert.equal(sansCommentaires(lire('api/controllers/analysis.controller.js')).split('analyzeMatch(').length - 1, 1);
  assert.equal(sansCommentaires(lire('core/ai/autoMatchAiTrigger.js')).split('analyzeMatch(').length - 1, 1);
  assert.equal(sansCommentaires(lire('data/enregistreurs/gelPronostics.js')).split('analyzeMatch(').length - 1, 1);
  assert.equal(sansCommentaires(lire('data/screener.js')).split('decisionDePari(').length - 1, 1);
  // Le moteur ne lit rien : ni data/, ni le contrôle quotidien, depuis l'empreinte.
  for (const f of fichiersDuMoteur()) assert.doesNotMatch(lire(f), /aVerifierPourLeMoteur|controleQuotidien/, `${f} lit « à vérifier » lui-même`);
});

test('T-L2-7 bis par les VRAIES portes — le vrai serveur, un faux relevé de cotes, l’état du contrôle quotidien FABRIQUÉ dans la copie et relu par le serveur lui-même : un score douteux retire le conseil de la page du match, du Repérage, des Opportunités et gèle la classe « a-verifier » ; des corners douteux marquent le bandeau sans retirer le conseil ; le magasin pas à jour le retire ; le contrôle retiré, le conseil revient', (t) => {
  const copie = preparerCopie({});
  let r;
  try {
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    const x = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-a-verifier-portes.mjs'), { timeout: 300_000 });
    assert.equal(x.code, 0, `script-a-verifier-portes.mjs :\n${x.erreurs.slice(-3000)}\n${x.sortie.slice(-1500)}`);
    assert.equal(x.reseau, false, 'un appel réseau a été tenté');
    assert.ok(x.json?.ok, `sortie illisible : ${x.sortie.slice(-500)}`);
    r = x.json;
  } finally {
    copie.nettoyer();
  }
  assert.match(r.manCity, /^fotmob-\d+$/, 'Man City reconnu dans l’annuaire de la base d’essai');
  const { sansControle, scoreDouteux, cornersDouteux, magasinPasAJour, controleRetire } = r.etats;
  // 1 et 5. Sans contrôle (jamais fait, ou retiré) : le conseil d'avant, à chaque porte, et aucun bandeau.
  for (const [nom, e] of [['sans contrôle', sansControle], ['contrôle retiré', controleRetire]]) {
    assert.deepEqual([e.page.action, e.page.raison, e.page.verts, e.page.etatDomicile, e.page.bandeau], ['RECOMMENDED', null, 1, 'value', null], nom);
    assert.deepEqual(e.reperage, { action: 'RECOMMENDED', raison: null, conseil: true, verts: 1 }, nom);
    assert.deepEqual([e.opportunites.lignes, e.opportunites.vertes, e.vertes], [3, 1, 1], nom);
  }
  // 2 et 4. Un score douteux sur une rencontre récente du club, ou le magasin pas à jour : AUCUN conseil, à aucune porte.
  for (const [nom, e, id, texte] of [
    ['score douteux', scoreDouteux, 'essai-score', 'Man City – Everton du 20/09 (2-1) : score différent chez football-data (fabriqué)'],
    ['magasin pas à jour', magasinPasAJour, 'essai-magasin', 'Le magasin n’est pas à jour (fabriqué)']
  ]) {
    assert.deepEqual([e.page.action, e.page.raison, e.page.mise, e.page.verts, e.page.etatDomicile, e.page.conseilRefuse], ['PASS', RAISON_A_VERIFIER, null, 0, 'value-secondaire', 'home'], `${nom} : la page du match`);
    assert.equal(e.page.texteDuRefus, texte, `${nom} : la raison du contrôle est dite`);
    assert.ok(e.page.raisonDomicile.includes(`mais ce match est marqué « à vérifier » (${texte}) : aucun pari n'est conseillé dessus`), `${nom} : la phrase du verdict`);
    assert.deepEqual(e.page.bandeau, [id], `${nom} : le bandeau de la page`);
    assert.deepEqual(e.reperage, { action: 'PASS', raison: RAISON_A_VERIFIER, conseil: false, verts: 0 }, `${nom} : le Repérage`);
    assert.deepEqual([e.opportunites.lignes, e.opportunites.vertes, e.opportunites.etats, e.vertes], [3, 0, ['sans-value', 'value-secondaire'], 0], `${nom} : les Opportunités et leurs notifications`);
  }
  // Le gel de la nuit, lancé pendant que le score est douteux, sans rien lui injecter : la classe « a-verifier », aucun seuil.
  assert.deepEqual(scoreDouteux.gel, { echecs: 0, calcules: 1, ecrits: 15, erreur: null, derniere: { classe: 'a-verifier', palier: 'pinnacle', seuil: null, version: 1 } });
  // 3. Des corners douteux seulement : le bandeau du match le dit, le conseil 1 / N / 2 reste (ses données ne sont pas en cause).
  assert.deepEqual([cornersDouteux.page.action, cornersDouteux.page.verts, cornersDouteux.page.etatDomicile, cornersDouteux.page.bandeau], ['RECOMMENDED', 1, 'value', ['essai-corners']]);
  assert.deepEqual(cornersDouteux.reperage, { action: 'RECOMMENDED', raison: null, conseil: true, verts: 1 });
  assert.deepEqual([cornersDouteux.opportunites.vertes, cornersDouteux.vertes], [1, 1]);
  // Correction du 17/11/2026 (« à vérifier » C1) : un club écrit par le relevé AUTREMENT que dans l'annuaire (« Brighton and
  // Hove Albion » pour « Brighton & Hove Albion ») est reconnu par la page du match comme par le Repérage (clubDuMagasin) :
  // refus sur la page, et la raison dite dans la phrase « aucun pari n'est conseillé ». (Le bandeau de l'étape 14 garde, lui,
  // sa reconnaissance stricte par l'écriture : il n'est pas exigé ici.)
  assert.match(r.brighton, /^fotmob-\d+$/, 'Brighton and Hove Albion reconnu par clubDuMagasin dans la base d’essai');
  for (const [nom, e] of [['sans contrôle', sansControle], ['contrôle retiré', controleRetire], ['corners douteux', cornersDouteux]]) {
    assert.deepEqual([e.brighton.action, e.brighton.raison, e.brighton.verts, e.brighton.etatDomicile], ['RECOMMENDED', null, 1, 'value'], `Brighton, ${nom}`);
  }
  for (const [nom, e, texte] of [
    ['score douteux', scoreDouteux, 'Brighton & Hove Albion – Everton du 20/09 (1-1) : score différent chez football-data (fabriqué)'],
    ['magasin pas à jour', magasinPasAJour, 'Le magasin n’est pas à jour (fabriqué)']
  ]) {
    assert.deepEqual([e.brighton.action, e.brighton.raison, e.brighton.mise, e.brighton.verts, e.brighton.etatDomicile, e.brighton.conseilRefuse], ['PASS', RAISON_A_VERIFIER, null, 0, 'value-secondaire', 'home'], `Brighton, ${nom} : la page du match`);
    assert.equal(e.brighton.texteDuRefus, texte, `Brighton, ${nom} : la raison du contrôle est dite`);
    assert.ok(e.brighton.raisonDomicile.includes(`mais ce match est marqué « à vérifier » (${texte}) : aucun pari n'est conseillé dessus`), `Brighton, ${nom} : la phrase du verdict`);
  }
  // Correction du 17/11/2026 (« à vérifier » C3) : le gel de la nuit de Brighton pendant que ses CORNERS sont douteux — les lignes
  // de corners et de tirs « a-verifier », la ligne du 1 / N / 2 et les buts non (le conseil reste).
  const gb = cornersDouteux.gelBrighton;
  assert.deepEqual([gb.echecs, gb.calcules, gb.erreur], [0, 1, null]);
  assert.ok(gb.ecrits > 0 && gb.ecrits === gb.lignes, `${gb.ecrits} lignes écrites, ${gb.lignes} lues`);
  assert.deepEqual(gb.corners, ['a-verifier']);
  assert.deepEqual(gb.tirs, ['a-verifier']);
  assert.ok(gb.buts.length > 0 && !gb.buts.includes('a-verifier'), gb.buts.join(', '));
  assert.deepEqual(gb.resultat, [{ classe: 'pinnacle', palier: 'pinnacle', seuil: 0.02 }]);
  // Lot A1 (17/11/2026 ; C1 de la vérification des corrections) : le câblage de la pastille d'une cote SAISIE (correction 1.7,
  // saisiesCotes.js, etatDesSaisies) par le vrai module, sur Brighton (essai-b) — une cote de corners et une de buts à + 10 % :
  // « value » sans contrôle ; corners douteux : la cote de corners « value-secondaire » avec la raison, celle des buts reste
  // « value » ; score douteux (famille « tout ») et magasin pas à jour : les deux « value-secondaire », la raison dite.
  assert.ok(r.saisies.pCorners > 0 && r.saisies.pButs > 0, `les probabilités du moteur pour les deux saisies : ${JSON.stringify(r.saisies)}`);
  const saisieDe = (e, id) => e.saisiesBrighton.find((s) => s.marketId === id) ?? null;
  const RAISON_CORNERS_B = 'Statistiques impossibles : Brighton & Hove Albion – Everton du 20/09 (fabriqué)';
  const RAISON_SCORE_B = 'Brighton & Hove Albion – Everton du 20/09 (1-1) : score différent chez football-data (fabriqué)';
  for (const [nom, e, corners, buts] of [
    ['sans contrôle', sansControle, { verdict: 'value', aVerifier: null }, { verdict: 'value', aVerifier: null }],
    ['contrôle retiré', controleRetire, { verdict: 'value', aVerifier: null }, { verdict: 'value', aVerifier: null }],
    ['corners douteux', cornersDouteux, { verdict: 'value-secondaire', aVerifier: RAISON_CORNERS_B }, { verdict: 'value', aVerifier: null }],
    ['score douteux', scoreDouteux, { verdict: 'value-secondaire', aVerifier: RAISON_SCORE_B }, { verdict: 'value-secondaire', aVerifier: RAISON_SCORE_B }],
    ['magasin pas à jour', magasinPasAJour, { verdict: 'value-secondaire', aVerifier: 'Le magasin n’est pas à jour (fabriqué)' }, { verdict: 'value-secondaire', aVerifier: 'Le magasin n’est pas à jour (fabriqué)' }]
  ]) {
    assert.equal(e.saisiesBrighton.length, 2, `${nom} : les deux saisies`);
    assert.deepEqual(saisieDe(e, 'totalCorners'), { marketId: 'totalCorners', ...corners }, `${nom} : la cote de corners saisie`);
    assert.deepEqual(saisieDe(e, 'totalGoals'), { marketId: 'totalGoals', ...buts }, `${nom} : la cote de buts saisie`);
  }
  // Dans les cinq états : les MÊMES cotes justes, le même pronostic, les mêmes buts attendus, à l'octet.
  assert.equal(new Set(Object.values(r.etats).map((e) => e.page.probabilites)).size, 1, 'une probabilité a changé avec l’état du contrôle');
  assert.ok(sansControle.page.probabilites.length > 500);
  t.diagnostic('5 états du contrôle × 4 portes (page du match, Repérage, Opportunités, notifications) + le gel');
});

test('T-PA1 un réglage de pari (le seuil de value) et le refus « à vérifier » ne changent AUCUNE probabilité du moteur — 12 matchs fabriqués × 2 régimes (sans et avec le modèle de buts unique) × 4 variantes', (t) => {
  const r = reel();
  assert.equal(r.pari.comparaisons, 96);
  assert.deepEqual(r.pari.differents, [], 'une probabilité a changé');
  // Aucun module de probabilité ne lit « à vérifier », la classe de seuil ni la confiance : seuls le verdict et le gel.
  const lecteurs = fichiersDuMoteur().filter((f) => /\baVerifier\b|confidence\.js|classeSeuil|seuilApplique/.test(sansCommentaires(lire(f)))).sort();
  assert.deepEqual(lecteurs, ['core/engine/confidence.js', 'core/engine/verdictPari.js']);
  t.diagnostic(`${r.pari.comparaisons} comparaisons, 0 probabilité changée`);
});
