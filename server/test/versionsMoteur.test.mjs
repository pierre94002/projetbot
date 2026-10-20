/**
 * Les VERSIONS DU MOTEUR (étape 25 du plan, le socle, 07/10/2026).
 *   node --test test/versionsMoteur.test.mjs        (depuis server/)
 *
 * Tout ce qui lit ou écrit les réglages du moteur (engine-config.json) ou le registre des versions
 * (engine-versions.json) tourne dans une COPIE ISOLÉE (isolement.mjs : son data/runtime, sa base d'essai,
 * réseau coupé, heure figée, aucun Claude) — script test/aides/script-versions-moteur.mjs. Jamais le registre
 * de data/runtime, qui est, dans le dépôt, celui de Pierre (un garde le vérifie, test 16). Les calculs sont de
 * VRAIS calculs du moteur sur douze matchs de la base d'essai. Les valeurs attendues sont écrites à la main.
 *
 *  1. Premier démarrage : la version 1 = l'état du moteur, sans rien changer aux chiffres ; un second ne réécrit rien.
 *  2. Chaque enregistrement des réglages fait une version, avec ce qui a changé ; même enregistrement = rien ;
 *     un état déjà vu reprend son numéro (valeurs par défaut comprises).
 *  3. Le retour arrière rend EXACTEMENT les chiffres d'avant, et leur numéro.
 *  4. Ses refus : sans « depuis », « depuis » périmé, double clic, rien avant la première — rien ne bouge.
 *  5. Jamais pendant une passe d'actualisation ou un import (le verrou).
 *  6. Ce que lit la carte.
 *  7. Le code du moteur change : une version « code », le retour arrière refusé.
 *  8. Registre illisible : jamais réécrit, réglages refusés, calculs « sans version ».
 *  9. Réglages modifiés à la main : notés par le serveur seul ; jamais des réglages d'essai.
 * 10. Le journal des pronostics. 11. L'analyse IA (engineSnapshot). 12. Les pronostics gelés (version, distribution).
 * 13-15. Les empreintes et la distribution, fonctions pures. 16. Le garde des essais. 17. Les branchements.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR, RACINE_ESSAIS, MANIFESTE_ECHANTILLON } from './aides/isolement.mjs';
import { empreinteDesReglages, empreinteDuCode, fichiersDuMoteur, changementsEntre, validerCandidate, configDeLaCandidate, MODULES_DU_MOTEUR, CANDIDATE_EN_ESSAI, A_VENIR, __testing as V } from '../src/core/engine/engineVersions.js';
import { memeDistribution, ECART_DE_DISTRIBUTION, __testing as depotEssai } from '../src/data/enregistreurs/depot.js';
import { distributionDuMarche, MARCHES_CONNUS, MARKET_LABELS } from '../src/sports/football/markets.js';
import { DEFAULT_ENGINE_CONFIG_BY_SPORT } from '../src/core/engine/engineConfig.js';

const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-versions-moteur.mjs');
const SRC = path.join(SERVEUR, 'src');

/** Une phase dans une copie neuve (ou dans `copie`, gardée par l'appelant). */
function lancer(phase, { runtime = {}, copie = null } = {}) {
  const propre = copie ?? preparerCopie({ runtime });
  try {
    // Un exécutable Claude qui n'existe pas (dans la copie), même lancé depuis le dépôt : la simulation refuse sinon.
    const env = { CLAUDE_CODE_BIN: path.join(propre.dossier, 'pas-de-claude-ici.exe'), MATCH_STATS_AUTO_REFRESH: 'false' };
    const r = executer(propre, SCRIPT, { args: [phase, MANIFESTE_ECHANTILLON], timeout: 300_000, env });
    assert.equal(r.code, 0, `${phase} a échoué :\n${r.erreurs.slice(-4000)}\n${r.sortie.slice(-2000)}`);
    assert.ok(r.json?.ok, `${phase} : sortie illisible\n${r.sortie.slice(-2000)}`);
    assert.equal(r.reseau, false, `${phase} : un appel réseau a été tenté`);
    return r.json;
  } finally {
    if (!copie) propre.nettoyer();
  }
}
const uneFois = (fabrique) => {
  let valeur;
  return () => (valeur ??= fabrique());
};

const cycle = uneFois(() => lancer('cycle'));

// ------------------------------------------------------- 1. premier démarrage

test('premier démarrage : la version 1 = l’état du moteur (valeurs par défaut, code du processus), notée SANS rien changer aux chiffres de 12 vrais calculs ; un second démarrage ne réécrit rien', () => {
  const s = cycle();
  assert.deepEqual(s.cibles, { total: 12, avecCotes: 11 });
  assert.deepEqual(s.avant, { registre: false, config: false, versions: [null] }, 'avant : « sans version »');
  assert.deepEqual(s.demarrage1, { numero: 1, change: true, nouvelle: true, origine: 'premier-demarrage', candidate: { candidate: null, change: false }, probleme: null, config: false });
  assert.equal(s.demarrage1.config, false, 'engine-config.json ni créé ni réécrit');
  assert.deepEqual(s.registre1.pile, [1]);
  assert.deepEqual(s.registre1.versions, [{ numero: 1, origine: 'premier-demarrage', depuis: null, changements: [], fichiers: fichiersDuMoteur().length }]);
  assert.deepEqual(s.registre1.journal, [{ action: 'creation', version: 1, depuis: null, origine: 'premier-demarrage' }]);
  assert.equal(s.registre1.reglagesParDefaut, true);
  assert.equal(s.registre1.code, s.registre1.codeDuProcessus);
  assert.match(s.registre1.code, /^[0-9a-f]{40}$/);
  assert.deepEqual(s.apresDemarrage, { versions: [1], memesChiffres: true }, 'les mêmes chiffres, avec le numéro 1');
  assert.deepEqual(s.demarrage2, { numero: 1, change: false, intact: true });
});

// ------------------------------------------------- 2. une version par enregistrement

test('chaque enregistrement des réglages fait une version avec ce qui a changé ; le même enregistrement n’en fait pas ; un état déjà vu reprend son numéro, valeurs par défaut comprises', () => {
  const s = cycle();
  const rho = { type: 'reglage', sport: 'football', cle: 'defaultCorrelation', libelle: 'Corrélation Dixon-Coles (rho)', format: 'nombre', avant: -0.075, apres: -0.15 };
  assert.deepEqual(s.put1, { code: 200, version: { numero: 2, nouvelle: true, reprise: false, change: true, changements: [rho] }, rho: -0.15 });
  assert.deepEqual(s.apresV2.versions, [2]);
  assert.ok(s.apresV2.changes >= 10, `rho change les marchés de buts de presque tous les matchs (${s.apresV2.changes} sur 12)`);
  assert.deepEqual(s.put2, { code: 200, version: { numero: 2, nouvelle: false, reprise: false, change: false, changements: [] }, registreIntact: true });
  const [edge, livres] = s.put3.version.changements;
  assert.equal(s.put3.version.numero, 3);
  assert.equal(s.put3.version.nouvelle, true);
  assert.deepEqual(edge, { type: 'reglage', sport: 'football', cle: 'edgeThresholdMin', libelle: 'Edge minimum requis', format: 'pourcent', avant: 0.02, apres: 0.03 });
  assert.equal(livres.cle, 'valueBookmakers');
  assert.equal(livres.format, 'liste');
  assert.deepEqual(livres.ajoutes, []);
  assert.deepEqual(livres.retires, ['888sport', 'Nordic Bet', 'Unibet (NL)', 'Unibet (SE)', 'LeoVegas (SE)', 'Tipico (DE)', 'Coolbet'], 'les noms des bookmakers, pas leurs clés');
  assert.deepEqual(s.apresV3.versions, [3]);
  // Des réglages déjà vus : le numéro de cet état (même état = même numéro), dans le sens où l'on va.
  assert.deepEqual(s.put4.version, { numero: 2, nouvelle: false, reprise: true, change: true, changements: [rho] });
  assert.deepEqual(s.reset.version, { numero: 1, nouvelle: false, reprise: true, change: true, changements: [{ ...rho, avant: -0.15, apres: -0.075 }] });
  assert.equal(s.put5.version.numero, 2);
  const journal = s.registreFinal.journal;
  assert.ok(journal.some((j) => j.action === 'remise-en-service' && j.version === 1 && j.origine === 'valeurs-par-defaut'), 'les valeurs par défaut sont dites');
  assert.deepEqual(s.registreFinal.versions.map((v) => [v.numero, v.origine]), [[1, 'premier-demarrage'], [2, 'reglages'], [3, 'reglages']], 'trois états, trois numéros, jamais un doublon');
});

// ------------------------------------------------------ 3. le retour arrière exact

test('le retour arrière rend EXACTEMENT les chiffres d’avant (12 vrais calculs du moteur, résultat complet) et le numéro d’avant ; deux retours ramènent aux chiffres d’avant les versions', () => {
  const s = cycle();
  assert.equal(s.retour1.code, 200);
  assert.deepEqual([s.retour1.de, s.retour1.vers, s.retour1.enServiceRendu], [3, 2, 2]);
  assert.deepEqual(s.retour1.changements.map((c) => [c.cle, c.avant, c.apres].slice(0, c.format === 'liste' ? 1 : 3)), [['edgeThresholdMin', 0.03, 0.02], ['valueBookmakers']]);
  assert.deepEqual([s.retour1.rho, s.retour1.edge, s.retour1.bookmakers], [-0.15, 0.02, DEFAULT_ENGINE_CONFIG_BY_SPORT.football.valueBookmakers], 'les réglages de la version 2, rendus à l’écran');
  assert.equal(s.retour1Exact, true, 'après le retour à la 2 : les résultats du moteur sont ceux calculés sous la 2, champ pour champ');
  assert.deepEqual(s.retour1Versions, [2]);
  assert.deepEqual([s.retour2.code, s.retour2.de, s.retour2.vers], [200, 2, 1]);
  assert.equal(s.retour2Exact, true, 'après le retour à la 1 : ceux du premier démarrage, numéro compris');
  assert.equal(s.retour2CommeAvantLesVersions, true, 'et les chiffres d’avant toute version');
  assert.equal(s.configApresRetour2, true, 'les réglages d’un bloc : exactement ceux de la version 1');
});

// ----------------------------------------------------------- 4. ses refus

test('le retour arrière refuse sans « depuis » (400), avec une version vue qui n’est plus en service (409), au double clic, quand rien n’est avant la première ; rien ne bouge (réglages et registre, octet et date)', () => {
  const s = cycle();
  assert.equal(s.refus7.sansDepuis.code, 400);
  assert.match(s.refus7.sansDepuis.erreur, /« depuis » est requis/);
  assert.deepEqual([s.refus7.perime.code, s.refus7.perime.raison], [409, 'deja-change']);
  assert.match(s.refus7.perime.erreur, /n’est plus la 2 mais la 3 : rien n’a changé/);
  assert.equal(s.refus7.intact, true);
  assert.deepEqual(s.doubleClic, { code: 409, raison: 'deja-change', intact: true }, 'un double clic ne recule jamais de deux versions');
  assert.deepEqual(s.retour3, { code: 409, raison: 'aucune-precedente', intact: true });
  assert.deepEqual(s.get9.retour, { possible: false, vers: null, raison: 'aucune-precedente', texte: 'La version 1 est la première notée : il n’y a pas de version précédente.' });
  assert.deepEqual(s.get9.precedentes, [{ numero: 3, dansLaPile: false }, { numero: 2, dansLaPile: false }], 'les versions défaites restent dans la liste, hors du chemin du retour');
});

// ------------------------------------------------------ 5. jamais pendant une passe

test('jamais pendant une passe d’actualisation ou un import : refusé (409) quand un autre processus tient le verrou, et pendant une passe de ce processus ; la carte le dit ; la passe finie, le retour se fait', () => {
  const s = cycle();
  assert.deepEqual([s.pendantLaPasse.code, s.pendantLaPasse.raison, s.pendantLaPasse.intact], [409, 'passe-en-cours', true]);
  assert.match(s.pendantLaPasse.erreur, /Rien n’a changé/);
  assert.deepEqual(s.pendantLaPasse.carte, { possible: false, vers: 1, raison: 'passe-en-cours', texte: 'Une passe d’actualisation (ou un import) est en cours : le retour arrière attend qu’elle soit finie.' });
  assert.deepEqual(s.dansLaPasse, { raison: 'passe-en-cours', statut: 409 });
  assert.deepEqual(s.apresLaPasse, { intact: true });
  assert.deepEqual(s.apresVerrou, { code: 200, de: 2, vers: 1 });
  assert.deepEqual(s.registreFinal.pile, [1, 2, 1], 'la pile du retour : 1 → 2 (reprise) → 1 (valeurs par défaut) → 2 → retour à 1');
  assert.equal(s.configFinale.defaultCorrelation, -0.075);
});

// ----------------------------------------------------------- 6. la carte

test('ce que lit la carte (GET /api/config/versions, lecture seule) : la version en service et ce qu’elle a changé, les précédentes, le retour possible et ce qu’il remettrait, la place de l’adoption et de l’alerte de dérive, aucune candidate', () => {
  const c = cycle().get3.corps;
  assert.equal(cycle().get3.code, 200);
  assert.equal(c.source, 'enregistre');
  assert.equal(c.enService.numero, 3);
  assert.equal(c.enService.origine, 'reglages');
  assert.equal(c.enService.pourquoi, 'réglages enregistrés dans Réglages › Paramètres du moteur');
  assert.equal(c.enService.changements.length, 2);
  assert.match(c.enService.code.empreinte, /^[0-9a-f]{12}$/);
  assert.deepEqual(c.precedentes.map((v) => [v.numero, v.dansLaPile]), [[2, true], [1, true]]);
  assert.equal(c.precedentes[1].pourquoi, 'premier démarrage de l’appli avec les versions : l’état du moteur à ce moment, rien de changé dans les chiffres');
  assert.equal(c.retour.possible, true);
  assert.equal(c.retour.vers, 2);
  assert.deepEqual(c.retour.changements.map((x) => x.cle), ['edgeThresholdMin', 'valueBookmakers']);
  assert.equal(c.enSynchro, true);
  assert.deepEqual(c.aVenir, JSON.parse(JSON.stringify(A_VENIR)));
  // Étape 25, seconde moitié (14/10/2026) : l'adoption et l'alerte de dérive sont faites (adoptionMoteur.test.mjs) ; il
  // reste la place du réglage refait chaque mois (étape 26). Sans candidate, rien à adopter ; la dérive est lue avec.
  assert.deepEqual(Object.keys(c.aVenir), ['correctionMensuelle']);
  assert.equal(c.aVenir.correctionMensuelle.quand, 'étape 26');
  assert.deepEqual([c.adoption.possible, c.adoption.raison], [false, 'aucune-candidate']);
  assert.equal(c.derive.dernierMois, null, 'aucun mois figé dans la copie');
  assert.equal(c.candidate, null);
  assert.deepEqual(c.modules, { dossiers: [...MODULES_DU_MOTEUR.dossiers], fichiers: [...MODULES_DU_MOTEUR.fichiers], horsEmpreinte: [...MODULES_DU_MOTEUR.horsEmpreinte] });
  // Le registre de la copie d'essai (sous le dossier des essais : celui du bac, ou le dossier temporaire depuis le dépôt), jamais celui de data/runtime.
  assert.ok(path.resolve(c.fichier).toLowerCase().startsWith(path.resolve(RACINE_ESSAIS).toLowerCase() + path.sep), c.fichier);
  assert.match(c.fichier, /cm-tests-[^\\/]+[\\/]code[\\/]server[\\/]data[\\/]runtime[\\/]engine-versions\.json$/);
  assert.notEqual(path.resolve(c.fichier).toLowerCase(), path.resolve(SERVEUR, 'data', 'runtime', 'engine-versions.json').toLowerCase());
});

// --------------------------------------------------- 7. le code change

test('le code du moteur change entre deux démarrages (une mise à jour de l’appli) : une version « code » qui dit quel fichier ; un commentaire ne change aucun chiffre mais fait une version ; le retour arrière d’un clic est refusé', () => {
  const copie = preparerCopie();
  try {
    const avant = lancer('code-avant', { copie });
    fs.appendFileSync(path.join(copie.serveur, 'src', 'core', 'engine', 'resultPrediction.js'), '\n// essai de l’étape 25 : un commentaire de plus\n');
    const apres = lancer('code-apres', { copie });
    assert.deepEqual(avant.demarrage, { numero: 1, change: true, nouvelle: true, origine: 'premier-demarrage' });
    assert.equal(avant.put.numero, 2);
    assert.deepEqual(apres.demarrage, { numero: 3, change: true, nouvelle: true, origine: 'code' });
    assert.notEqual(avant.code, apres.code);
    assert.deepEqual(apres.registre.versions.at(-1).changements, [{ type: 'code', modifies: ['core/engine/resultPrediction.js'], ajoutes: [], retires: [] }]);
    assert.equal(apres.carte.enService.pourquoi, 'mise à jour du code du moteur (notée au démarrage de l’appli)');
    const { engineVersion: va, ...chiffresAvant } = avant.dto;
    const { engineVersion: vb, ...chiffresApres } = apres.dto;
    assert.deepEqual([va, vb], [2, 3]);
    assert.deepEqual(chiffresApres, chiffresAvant, 'un commentaire ne change aucun chiffre');
    assert.deepEqual({ possible: apres.carte.retour.possible, raison: apres.carte.retour.raison }, { possible: false, raison: 'code-different' });
    assert.deepEqual([apres.retour.code, apres.retour.raison, apres.retour.intact], [409, 'code-different', true]);
    assert.match(apres.retour.erreur, /La version 2 tournait avec un autre code du moteur \(core\/engine\/resultPrediction\.js\) : un clic remet des réglages, pas du code/);
    assert.equal(apres.reglagesDeLaV1, null, 'les réglages de la 1 avec un autre code ne sont pas la version 1');
  } finally {
    copie.nettoyer();
  }
});

test('des réglages enregistrés avant tout démarrage avec les versions : la version 1 est l’état d’AVANT (valeurs par défaut), la 2 celui d’après, avec ce qui a changé', () => {
  const s = lancer('premier-reglage');
  assert.equal(s.put.code, 200);
  assert.deepEqual([s.put.version.numero, s.put.version.nouvelle], [2, true]);
  assert.deepEqual(s.registre.versions.map((v) => [v.numero, v.origine, v.changements.map((c) => c.cle)]), [[1, 'etat-initial', []], [2, 'reglages', ['defaultCorrelation']]]);
  assert.equal(s.v1ParDefaut, true);
});

// ------------------------------------------------------ 8. registre illisible

test('registre illisible (forme inattendue, puis tronqué) : jamais pris pour vide ni réécrit au démarrage ; réglages et valeurs par défaut refusés (503) sans rien écrire ; calculs « sans version », sans jamais attendre le registre ; la carte et le retour le disent', () => {
  const s = lancer('illisible', { runtime: { 'engine-versions.json': '{"format":1,"versions":"pas une liste"}' } });
  assert.equal(s.demarrage.source, 'illisible');
  assert.match(s.demarrage.probleme, /forme inattendue \(« versions » n’est pas une liste de versions\)/);
  assert.equal(s.demarrage.intact, true);
  assert.equal(s.version, null);
  // Tronqué : le démarrage le relit ~1,5 s avant de le dire illisible ; le calcul du moteur, lui, n'attend jamais.
  assert.equal(s.tronque.source, 'illisible');
  assert.match(s.tronque.probleme, /illisible/);
  assert.equal(s.tronque.version, null);
  assert.equal(s.tronque.intact, true);
  assert.ok(s.tronque.calculMs < 1200, `le calcul n'attend pas le registre (${s.tronque.calculMs} ms)`);
  assert.equal(s.routes.put.code, 503);
  assert.match(s.routes.put.erreur, /registre des versions du moteur .* est illisible/);
  assert.equal(s.routes.reset.code, 503);
  assert.deepEqual([s.routes.get.code, s.routes.get.source, s.routes.get.enService], [200, 'illisible', null]);
  assert.deepEqual(s.routes.get.retour, { possible: false, vers: null, raison: 'registre-illisible', texte: 'Le registre des versions est illisible pour l’instant.' });
  assert.deepEqual(s.routes.retour, { code: 503, raison: 'registre-illisible' });
  assert.equal(s.intact, true, 'registre et réglages : octets et dates inchangés');
  assert.equal(s.configAbsente, true);
});

// ------------------------------------------------------ 9. hors de l'appli

test('réglages modifiés à la main pendant que le serveur tourne : notés par le serveur au calcul suivant (« hors de l’écran Réglages ») ; des réglages d’essai jamais notés ; un autre processus ne fait que lire', () => {
  const copie = preparerCopie();
  try {
    const s = lancer('hors-appli', { copie });
    assert.deepEqual([s.v1, s.v2], [1, 2]);
    assert.deepEqual(s.registre.versions[1].origine, 'reglages-hors-appli');
    assert.deepEqual(s.registre.versions[1].changements.map((c) => [c.cle, c.avant, c.apres]), [['defaultCorrelation', -0.075, -0.1]]);
    assert.deepEqual(s.essai, { version: null, registreIntact: true }, 'un objet de réglages d’essai : « sans version », jamais noté');
    assert.equal(s.commeLaV1, 1, 'des réglages égaux à ceux de la 1 portent son numéro');
    const l = lancer('lecteur', { copie });
    assert.deepEqual(l, { ok: true, phase: 'lecteur', lu: 2, inconnu: null, registreIntact: true, ecrivain: false });
  } finally {
    copie.nettoyer();
  }
});

// ------------------------------------------------ 10. le journal des pronostics

test('journal des pronostics : la version gardée avec chaque pronostic du scan ; jamais un numéro deviné ; un rescan la remplace ou la retire ; les entrées d’avant jamais réécrites (« sans version »)', () => {
  const ancien = (id, matchId, extra = {}) => ({ id, day: '2026-10-04', matchId, homeName: 'A', awayName: 'B', league: 'EPL', commenceTime: '2026-10-06T18:00:00.000Z', market: 'Résultat', marketId: 'result', params: { outcome: 'home' }, predictedOutcome: 'home', predictedLabel: 'A gagne', predictedOdds: 1.95, action: null, edgePercent: 0, status: 'pending', settledAt: null, firstSeenAt: '2026-10-04T10:00:00.000Z', lastSeenAt: '2026-10-04T10:00:00.000Z', ...extra });
  const s = lancer('journal', { runtime: { 'predictions.json': [ancien('a1', 'ancien-1', { status: 'correct', settledAt: '2026-10-02T21:00:00.000Z' }), ancien('a2', 'ancien-2'), ancien('a3', 'ancien-3', { market: 'Total buts' })] } });
  assert.equal(s.p1.code, 201);
  assert.deepEqual(s.nouveau, { avecVersion: 1, sansVersion: false, versionIllisible: false });
  assert.deepEqual(s.ancienRescanne, { version: 1, cote: 2.05 }, 'rescanné : ses nouveaux chiffres et leur version');
  assert.equal(s.anciensIntacts, true, 'les entrées non rescannées : octet pour octet');
  assert.equal(s.anciensSansVersion, true);
  assert.equal(s.rescanSansVersion, false, 'un rescan sans version retire l’ancien numéro');
  assert.deepEqual(s.route.code, 200);
  assert.equal(s.route.versions['ancien-2'], 1);
  assert.equal(s.route.versions['ancien-1'], null);
});

// ------------------------------------------------------------ 11. l'IA

test('analyse IA (Claude SIMULÉ) : la version dans engineSnapshot ; jamais dans ce que lit l’IA — message d’avant-match, message envoyé, revue d’après-match, fiche compacte et ancienne à l’octet', () => {
  const s = lancer('ia');
  assert.equal(s.versionDuMoteur, 1);
  assert.equal(s.resumeIdentique, true, 'le résumé du moteur que lit l’IA : le même avec ou sans numéro');
  for (const fiche of ['compacte', 'ancienne']) {
    assert.deepEqual(s[`avant-${fiche}`], { version: false, forme: fiche }, `avant-match, fiche ${fiche}`);
    assert.deepEqual(s[`revue-${fiche}`], { identique: true, version: false }, `revue, fiche ${fiche}`);
  }
  assert.equal(s.snapshot.version, 1);
  assert.deepEqual(s.snapshot.cles, ['label', 'expectedGoals', 'trueOdds', 'market', 'edgePercent', 'staking', 'statExpectations', 'marketPredictions', 'engineVersion']);
  assert.deepEqual(s.messageEnvoye, { nombre: 1, version: false });
});

// ------------------------------------------------------ 12. les pronostics gelés

const gel = uneFois(() => lancer('gel'));

test('pronostics gelés : chaque pronostic avec la version du moteur et la DISTRIBUTION COMPLÈTE de son marché (toutes les issues, à sa ligne) ; les lignes d’avant jamais réécrites', () => {
  const s = gel();
  assert.deepEqual([s.anciennes, s.g1.ecrits, s.g1.echecs], [2, s.g1.pronostics, 0]);
  assert.equal(s.anciennesIntactes, true);
  assert.equal(s.nouvelles.length, s.g1.ecrits);
  assert.ok(s.nouvelles.every((n) => n.engineVersion === 1), 'la version 1 sur chaque nouvelle ligne');
  const issues = { result: ['home', 'draw', 'away'], bothTeamsScore: ['yes', 'no'], resultAndTotal: ['homeOver', 'homeUnder', 'drawOver', 'drawUnder', 'awayOver', 'awayUnder'] };
  const familles = new Set();
  for (const n of s.nouvelles) {
    familles.add(n.marketId);
    const d = n.distribution;
    assert.ok(d, `${n.marche} : une distribution`);
    assert.deepEqual(Object.keys(d.issues), issues[n.marketId] ?? ['over', 'under'], `${n.marche} : toutes les issues`);
    const somme = Object.values(d.issues).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(somme - 1) <= 0.0006, `${n.marche} : la somme des issues fait 1 (${somme})`);
    const params = JSON.parse(n.params);
    if ('line' in params) assert.equal(d.ligne, params.line, `${n.marche} : la ligne du pronostic`);
    if ('team' in params) assert.equal(d.equipe, params.team, `${n.marche} : l’équipe du pronostic`);
    // L'issue choisie : sa probabilité dans la distribution est celle de la cote juste (1 / cote, à l'arrondi près de la cote).
    const p = d.issues[n.choix];
    assert.ok(Math.abs(p - 1 / n.cote) <= 0.006, `${n.marche} : ${p} contre 1 / ${n.cote}`);
    if (/Corners|Shots/.test(n.marketId)) assert.ok(d.attendu > 0, `${n.marche} : l’attendu de la loi`);
  }
  for (const f of ['result', 'totalGoals', 'bothTeamsScore', 'resultAndTotal', 'teamGoals', 'totalCorners', 'teamCorners', 'totalShots', 'teamShots', 'totalShotsOnTarget', 'teamShotsOnTarget']) assert.ok(familles.has(f), `famille ${f} gelée`);
  // Les deux pronostics de M1 gelés avant l'étape (sans version) : une révision 2, les autres marchés commencent à 1.
  assert.deepEqual(s.revisionsM1.filter((r) => r.version === 2).map((r) => r.marche).sort(), ['result', 'totalGoals']);
});

test('pronostics gelés : regelés sans changement, rien ; une nouvelle version du moteur, une révision qui la porte pour chaque pronostic ; premières valeurs et lignes d’avant intactes, colonne par colonne', () => {
  const s = gel();
  assert.equal(s.g2.ecrits, 0);
  assert.ok(s.g3.ecrits >= s.g1.pronostics, `une révision par pronostic (${s.g3.ecrits})`);
  assert.deepEqual(s.versionsApresG3, [2]);
  assert.equal(s.anciennesToujoursIntactes, true);
  assert.equal(s.premieresIntactes, true);
  const result = s.lecture.filter((r) => r.marche === 'result');
  assert.deepEqual(result.map((r) => [r.version, r.engineVersion, r.distribution]), [[1, null, false], [2, 1, true], [3, 2, true]], 'sans version, puis la 1, puis la 2');
});

// --------------------------------------------- 13. l'empreinte du code (pure)

fs.mkdirSync(RACINE_ESSAIS, { recursive: true });
const DOSSIER = fs.mkdtempSync(path.join(RACINE_ESSAIS, 'cm-versions-moteur-'));
after(() => fs.rmSync(DOSSIER, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));

test('l’empreinte du code : stable (fins de ligne Windows, marque d’ordre des octets) ; sensible à chaque fichier du moteur ; insensible au reste de l’appli et au registre lui-même', () => {
  const racine = path.join(DOSSIER, 'src');
  fs.cpSync(SRC, racine, { recursive: true });
  const e0 = empreinteDuCode({ racine, rafraichir: true });
  assert.deepEqual(e0, empreinteDuCode(), 'la copie du code a l’empreinte du code');
  assert.deepEqual(Object.keys(e0.fichiers), fichiersDuMoteur());
  for (const f of MODULES_DU_MOTEUR.fichiers) assert.ok(e0.fichiers[f] && e0.fichiers[f] !== 'absent', f);
  assert.ok(!('core/engine/engineVersions.js' in e0.fichiers));
  for (const f of ['core/engine/oddsEngine.js', 'core/engine/resultPrediction.js', 'sports/football/markets.js', 'sports/football/statMarkets.js', 'core/risk/staking.js', 'data/db/statInputsRead.js']) assert.ok(f in e0.fichiers, f);
  const modifier = (rel, f) => {
    const chemin = path.join(racine, rel);
    const avant = fs.readFileSync(chemin, 'utf8');
    fs.writeFileSync(chemin, f(avant));
    const e = empreinteDuCode({ racine, rafraichir: true }).empreinte;
    fs.writeFileSync(chemin, avant);
    return e;
  };
  assert.equal(modifier('core/engine/oddsEngine.js', (t) => t.replace(/\r?\n/g, '\r\n')), e0.empreinte, 'fins de ligne Windows : même empreinte');
  assert.equal(modifier('sports/football/model.js', (t) => `\uFEFF${t}`), e0.empreinte, 'marque d’ordre des octets : même empreinte');
  assert.notEqual(modifier('core/engine/scorePrediction.js', (t) => t.replace('0.04', '0.05')), e0.empreinte, 'une constante du moteur');
  assert.notEqual(modifier('data/db/scoreFormRead.js', (t) => `${t}\n`), e0.empreinte, 'une entrée du moteur');
  assert.equal(modifier('api/routes/index.js', (t) => `${t}\n// rien\n`), e0.empreinte, 'un fichier hors du moteur');
  assert.equal(modifier('core/engine/engineVersions.js', (t) => `${t}\n// rien\n`), e0.empreinte, 'le registre lui-même');
  // Un fichier ajouté dans un dossier du moteur compte ; un fichier retiré se voit.
  fs.writeFileSync(path.join(racine, 'core', 'engine', 'nouveauModele.js'), 'export const x = 1;\n');
  const ajoute = empreinteDuCode({ racine, rafraichir: true });
  assert.ok('core/engine/nouveauModele.js' in ajoute.fichiers);
  assert.notEqual(ajoute.empreinte, e0.empreinte);
  fs.rmSync(path.join(racine, 'core', 'engine', 'nouveauModele.js'));
  fs.rmSync(path.join(racine, 'data', 'db', 'statInputsRead.js'));
  const retire = empreinteDuCode({ racine, rafraichir: true });
  assert.equal(retire.fichiers['data/db/statInputsRead.js'], 'absent');
  assert.deepEqual(
    changementsEntre({ reglages: {}, code: e0 }, { reglages: {}, code: retire }),
    [{ type: 'code', modifies: ['data/db/statInputsRead.js'], ajoutes: [], retires: [] }]
  );
});

// ------------------------------------------- 14. l'empreinte des réglages (pure)

test('l’empreinte des réglages : clés dans un autre ordre, nombre écrit à 12 chiffres, bookmakers dans un autre ordre ou en double = le même état ; une vraie valeur = un autre état ; les noms et formats des réglages', () => {
  const base = DEFAULT_ENGINE_CONFIG_BY_SPORT.football;
  const e = empreinteDesReglages(base);
  assert.match(e, /^[0-9a-f]{40}$/);
  assert.equal(empreinteDesReglages(Object.fromEntries(Object.entries(base).reverse())), e, 'ordre des clés');
  assert.equal(empreinteDesReglages({ ...base, edgeThresholdMin: 0.01 + 0.01 }), e, '0,01 + 0,01 vaut 0,02');
  assert.equal(empreinteDesReglages({ ...base, edgeThresholdMin: 0.020000000000000004 }), e, 'un curseur qui revient à 0,02');
  assert.equal(empreinteDesReglages({ ...base, valueBookmakers: [...base.valueBookmakers].reverse() }), e, 'ordre des bookmakers');
  assert.equal(empreinteDesReglages({ ...base, valueBookmakers: [...base.valueBookmakers, 'williamhill'] }), e, 'un bookmaker en double');
  assert.equal(empreinteDesReglages({ ...base, weights: { exogenous: 0, structural: 0, market: 1 } }), e, 'ordre des poids');
  assert.notEqual(empreinteDesReglages({ ...base, edgeThresholdMin: 0.021 }), e);
  assert.notEqual(empreinteDesReglages({ ...base, valueBookmakers: base.valueBookmakers.slice(1) }), e);
  assert.notEqual(empreinteDesReglages({ ...base, weights: { ...base.weights, market: 0.9, structural: 0.1 } }), e);
  assert.notEqual(empreinteDesReglages({ ...base, nouveauReglage: true }), e, 'un réglage de plus');
  // Ce qui a changé : chaque réglage nommé, imbriqués compris, et les bookmakers par leur nom.
  const ch = changementsEntre({ reglages: { football: base }, code: { empreinte: 'a' } }, { reglages: { football: { ...base, maxStakePercent: 0.01, weights: { ...base.weights, market: 0.9, structural: 0.1 }, valueBookmakers: ['coolbet', 'pinnacle'] } }, code: { empreinte: 'a' } });
  assert.deepEqual(ch.map((c) => [c.cle, c.libelle, c.format]), [
    ['maxStakePercent', 'Mise max (% bankroll)', 'pourcent'],
    ['valueBookmakers', 'Vos bookmakers (un pari n’est recommandé que chez eux)', 'liste'],
    ['weights.market', 'Poids du marché dans le 1N2', 'pourcent'],
    ['weights.structural', 'Poids des facteurs structurels', 'pourcent']
  ]);
  assert.deepEqual(ch[1].ajoutes, ['pinnacle']);
  assert.equal(ch[1].retires.length, 9);
  assert.equal(V.formeStable(-0), 0);
  assert.equal(V.problemeDeForme({ versions: [] }), '« versions » n’est pas une liste de versions');
});

// --------------------------------------- 15. la distribution complète (pure)

test('la distribution complète d’un marché (règle du sport) et la règle « même distribution » des révisions : un dixième de point', () => {
  const dto = {
    distributions: {
      result: { home: 0.512345, draw: 0.25, away: 0.237655 },
      totalGoals: { 2.5: { over: 0.55, under: 0.45 } },
      bothTeamsScore: { yes: 0.6, no: 0.4 },
      teamGoals: { home: { 1.5: { over: 0.4, under: 0.6 } }, away: { 0.5: { over: 0.7, under: 0.3 } } },
      resultAndTotal: { 2.5: { homeOver: 0.3, homeUnder: 0.21, drawOver: 0.05, drawUnder: 0.2, awayOver: 0.14, awayUnder: 0.1 } }
    },
    statExpectations: { corners: { home: 5.5, away: 4.5, total: 10 } }
  };
  assert.deepEqual(distributionDuMarche(dto, { marketId: 'result', params: { outcome: 'home' } }), { issues: { home: 0.5123, draw: 0.25, away: 0.2377 } });
  assert.deepEqual(distributionDuMarche(dto, { marketId: 'totalGoals', params: { line: 2.5, side: 'over' } }), { ligne: 2.5, issues: { over: 0.55, under: 0.45 } });
  assert.deepEqual(distributionDuMarche(dto, { marketId: 'teamGoals', params: { team: 'away', line: 0.5, side: 'over' } }), { equipe: 'away', ligne: 0.5, issues: { over: 0.7, under: 0.3 } });
  assert.deepEqual(distributionDuMarche(dto, { marketId: 'resultAndTotal', params: { line: 2.5, key: 'homeOver' } }).issues.drawUnder, 0.2);
  assert.deepEqual(distributionDuMarche(dto, { marketId: 'bothTeamsScore', params: { outcome: 'yes' } }), { issues: { yes: 0.6, no: 0.4 } });
  const corners = distributionDuMarche(dto, { marketId: 'totalCorners', params: { line: 9.5, side: 'over' } });
  assert.equal(corners.ligne, 9.5);
  assert.equal(corners.attendu, 10);
  assert.ok(Math.abs(corners.issues.over + corners.issues.under - 1) < 1e-9);
  assert.equal(distributionDuMarche(dto, { marketId: 'teamCorners', params: { line: 4.5, side: 'over' } }), null, 'un marché d’équipe sans équipe');
  assert.equal(distributionDuMarche(dto, { marketId: 'totalGoals', params: { line: 3.5 } }), null, 'une ligne absente : rien, jamais 0');
  assert.equal(distributionDuMarche({}, { marketId: 'result' }), null);
  assert.equal(distributionDuMarche(dto, { marketId: 'buteurs' }), null);
  assert.deepEqual(MARCHES_CONNUS, Object.keys(MARKET_LABELS));
  // La règle des révisions : un écart d'un dixième de point ou plus est un nouveau pronostic.
  const d = (over) => JSON.stringify({ ligne: 2.5, issues: { over, under: Number((1 - over).toFixed(4)) } });
  assert.equal(ECART_DE_DISTRIBUTION, 0.001);
  assert.equal(memeDistribution(d(0.55), d(0.5509)), true);
  assert.equal(memeDistribution(d(0.55), d(0.551)), false);
  assert.equal(memeDistribution(null, null), true);
  assert.equal(memeDistribution(null, d(0.55)), false, 'une ligne gelée avant l’étape 25 n’a pas de distribution');
  assert.equal(memeDistribution(d(0.55), JSON.stringify({ ligne: 3.5, issues: { over: 0.55, under: 0.45 } })), false, 'une autre ligne');
  assert.equal(memeDistribution(JSON.stringify({ issues: { yes: 0.5, no: 0.5 } }), JSON.stringify({ issues: { yes: 0.5 } })), false, 'une issue de moins');
  // … et elle compte dans une révision : même choix, mêmes cotes (la cote juste à deux décimales ne bouge pas),
  // même version, mais le nul et l'extérieur qui s'échangent un dixième de point : un nouveau pronostic.
  const params = JSON.stringify({ outcome: 'home' });
  const commun = { choice: 'home', params, predictedOdds: 1.95, marketOdds: 2.1, minOdds: 1.9, oddsSource: 'odds-api', lineupState: 'officielle' };
  const gele = { ...commun, engineVersion: 1, distribution: JSON.stringify({ issues: { home: 0.5123, draw: 0.25, away: 0.2377 } }) };
  const nouveau = (issues) => ({ ...commun, distribution: JSON.stringify({ issues }) });
  assert.equal(depotEssai.memeValeur(gele, nouveau({ home: 0.5123, draw: 0.2504, away: 0.2373 }), 1), true, 'moins d’un dixième de point : pas de révision');
  assert.equal(depotEssai.memeValeur(gele, nouveau({ home: 0.5123, draw: 0.252, away: 0.2357 }), 1), false, 'une autre issue bouge d’un dixième de point : une révision');
  assert.equal(depotEssai.memeValeur(gele, nouveau({ home: 0.5123, draw: 0.25, away: 0.2377 }), 2), false, 'une autre version du moteur : une révision');
  assert.equal(depotEssai.memeValeur({ ...gele, engineVersion: null, distribution: null }, nouveau({ home: 0.5123, draw: 0.25, away: 0.2377 }), 1), false, 'une ligne gelée avant l’étape 25 : une révision, avec sa version et sa distribution');
});

// ------------------------------------------------------------ candidate (pure)

test('une candidate déclarée se vérifie (étape à juger, marchés connus, au moins une modification) ; ses réglages sont ceux en service plus les siens ; aucune n’est déclarée à l’étape 25', () => {
  assert.equal(CANDIDATE_EN_ESSAI, null, 'la première viendra de l’étape 27');
  const ok = { id: 'score-marche-v1', etape: '27', quoi: 'Modèle de score ancré sur le marché', modifications: { football: { defaultCorrelation: -0.1, weights: { market: 0.9 } } }, marches: ['totalGoals'] };
  assert.deepEqual(validerCandidate(ok), ok);
  for (const [faute, motif] of [
    [{ ...ok, id: '' }, /identifiant court/],
    [{ ...ok, id: 'avec espace' }, /identifiant court/],
    [{ ...ok, etape: '99' }, /inconnue du plan/],
    [{ ...ok, etape: '17' }, /ne se jugent pas|n’est pas une étape dont les chiffres se jugent/],
    [{ ...ok, etape: 27 }, /inconnue du plan/],
    [{ ...ok, quoi: ' ' }, /« quoi » est vide/],
    [{ ...ok, modifications: {} }, /aucune modification/],
    [{ ...ok, modifications: { tennis: { a: 1 } } }, /sport inconnu/],
    [{ ...ok, modifications: { football: {} } }, /vides/],
    [{ ...ok, marches: [] }, /quels marchés/],
    [{ ...ok, marches: ['buteurs'] }, /marché inconnu « buteurs »/],
    [{ ...ok, marches: ['totalGoals', 'totalGoals'] }, /écrit deux fois/],
    [null, /est un objet/]
  ]) {
    assert.throws(() => validerCandidate(faute), motif);
  }
  const enService = DEFAULT_ENGINE_CONFIG_BY_SPORT.football;
  const c = configDeLaCandidate(enService, ok);
  assert.equal(c.defaultCorrelation, -0.1);
  assert.deepEqual(c.weights, { market: 0.9, structural: 0, exogenous: 0 });
  assert.equal(c.edgeThresholdMin, enService.edgeThresholdMin);
  assert.notEqual(c, enService, 'un objet neuf : jamais les réglages en service eux-mêmes');
  assert.equal(enService.defaultCorrelation, -0.075, 'les réglages en service ne bougent pas');
});

// --------------------------------------------------- 16. le garde des essais

test('les essais ne touchent jamais au registre de data/runtime (dans le dépôt, celui de Pierre) : aucune fonction qui écrit les versions ou les réglages n’est appelée dans le processus des tests', () => {
  const ecrivains = ['demarrerVersions', 'synchroniserVersions', 'avecUneVersion', 'revenirALaVersionPrecedente', 'mettreLaCandidateEnEssai', 'remplacerReglagesDuMoteur', 'updateEngineConfig', 'resetEngineConfig'];
  const dossier = path.join(SERVEUR, 'test');
  for (const nom of fs.readdirSync(dossier).filter((f) => f.endsWith('.test.mjs'))) {
    const source = fs.readFileSync(path.join(dossier, nom), 'utf8');
    for (const f of ecrivains) {
      // Le nom est recomposé pour que ce test ne se trouve pas lui-même.
      const appel = new RegExp(`\\b${f}\\s*\\(`);
      assert.doesNotMatch(source.replace(new RegExp(`const ecrivains = \\[[^\\]]*\\];`), ''), appel, `${nom} appelle ${f} dans le processus des tests`);
    }
  }
  // Les scripts d'essai, eux, vérifient d'abord que le registre est celui de LEUR copie.
  assert.match(fs.readFileSync(SCRIPT, 'utf8'), /if \(path\.resolve\(V\.FICHIER_VERSIONS\)\.toLowerCase\(\) !== path\.resolve\(FICHIER_VERSIONS\)\.toLowerCase\(\)\) throw/);
});

// ---------------------------------------------------- 17. les branchements

test('branchements : le serveur accorde les versions AVANT d’écouter, sans jamais bloquer ; analyzeMatch pose engineVersion et la distribution ; le registre hors de l’empreinte des données ; les deux routes ; un seul écrivain des réglages', () => {
  const lire = (...chemin) => fs.readFileSync(path.join(SRC, ...chemin), 'utf8');
  const serveur = lire('server.js');
  assert.match(serveur, /^import \{ demarrerVersions \} from '\.\/core\/engine\/engineVersions\.js';$/m);
  assert.equal((serveur.match(/demarrerVersions\(\)/g) ?? []).length, 1);
  // (Le nom est recomposé : le garde du test 16 ne doit pas le prendre pour un appel.)
  const APPEL = ['demarrer', 'Versions()'].join('');
  assert.ok(serveur.indexOf(APPEL) < serveur.indexOf('app.listen('), 'avant d’écouter le port');
  assert.match(serveur.slice(serveur.lastIndexOf('try {', serveur.indexOf(APPEL)), serveur.indexOf('app.listen(')), /\} catch \(error\) \{\n {2}console\.warn\(/);
  const moteur = lire('core', 'engine', 'oddsEngine.js');
  assert.match(moteur, /result\.engineVersion = numeroDeVersion\(config, sport\.id \?\? 'football'\);/);
  assert.match(moteur, /result\.distributions = distributionsDuMoteur\(probabilities\);/);
  assert.match(lire('data', 'repositories', 'dataVersionRepository.js'), /SETTINGS_FILES = new Set\([^)]*'engine-versions\.json'/);
  const routes = lire('api', 'routes', 'config.routes.js');
  assert.match(routes, /router\.get\('\/versions', asyncHandler\(getVersions\)\);/);
  assert.match(routes, /router\.post\('\/versions\/retour', asyncHandler\(postRetourVersion\)\);/);
  // Seul engineConfig.js écrit engine-config.json, et seul engineVersions.js appelle le remplacement d'un bloc.
  const fichiers = fs.readdirSync(SRC, { recursive: true }).filter((f) => String(f).endsWith('.js')).map((f) => String(f).split(path.sep).join('/'));
  const avec = (motif) => fichiers.filter((f) => motif.test(fs.readFileSync(path.join(SRC, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''))).sort();
  assert.deepEqual(avec(/remplacerReglagesDuMoteur\s*\(/), ['core/engine/engineConfig.js', 'core/engine/engineVersions.js']);
  assert.deepEqual(avec(/avecUneVersion\s*\(|revenirALaVersionPrecedente\s*\(/), ['api/controllers/config.controller.js', 'core/engine/engineVersions.js']);
  // Le résumé donné à l'IA ne prend pas le numéro : il n'est ajouté qu'au résumé GARDÉ, et retiré avant la revue.
  const ia = lire('core', 'ai', 'matchAiAnalysisService.js');
  assert.match(ia, /engineSnapshot: avecLaVersion\(engineSummary, engineResult\),/);
  assert.equal((ia.match(/engineSummary: pourIA\(prior\.engineSnapshot\),/g) ?? []).length, 2);
});
