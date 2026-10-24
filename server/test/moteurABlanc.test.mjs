/**
 * La VERSION CANDIDATE calculée « à blanc » (étape 25 du plan, le socle, 07/10/2026).
 *   node --test test/moteurABlanc.test.mjs        (depuis server/)
 *
 * Dans une COPIE ISOLÉE (isolement.mjs : sa base d'essai, son data/runtime, réseau coupé — FotMob simulé, vide —,
 * heure figée, aucun Claude), script test/aides/script-moteur-a-blanc.mjs. Le code ne déclare AUCUNE candidate à
 * l'étape 25 (la première viendra de l'étape 27) : la candidate des essais est FABRIQUÉE (une autre corrélation
 * de Dixon-Coles, qui ne déclare changer que « totalGoals » et « bothTeamsScore ») ; le registre de la mesure
 * (étape 16) est un fichier d'essai de la copie.
 *
 *  1. Sans candidate, l'étape de nuit ne fait rien.
 *  2. Avec : seulement les marchés déclarés, les deux distributions sur la même ligne, comptée au registre, rien
 *     de plus à la seconde nuit.
 *  3. Jamais visible, UN PAR UN : la page d'un match et le scan de Mes paris, le verdict et le comparateur, le
 *     Repérage et les opportunités, l'IA, les journaux des paris, des pronostics et des analyses, les pronostics
 *     gelés — identiques avant et après la nuit ; et ce qu'on montre est bien la version en service.
 *  4. Les refus. 5. L'étape de la passe. 6. Le code (qui lit la table à part, qui importe la candidate).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { preparerCopie, executer, sansCandidateDuCode, SERVEUR } from './aides/isolement.mjs';

const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-moteur-a-blanc.mjs');
const SRC = path.join(SERVEUR, 'src');

function lancer(phase) {
  // Étape 27 : « sans-candidate » simule l’état d’avant la déclaration (la candidate du code retirée de la copie) ; les
  // autres phases passent leur candidate explicitement.
  const copie = phase === 'sans-candidate' ? sansCandidateDuCode(preparerCopie({})) : preparerCopie({});
  try {
    // Ni exécutable Claude (un chemin qui n'existe pas, même depuis le dépôt), ni actualisation.
    const r = executer(copie, SCRIPT, { args: [phase], timeout: 300_000, env: { CLAUDE_CODE_BIN: path.join(copie.dossier, 'pas-de-claude-ici.exe'), MATCH_STATS_AUTO_REFRESH: 'false' } });
    assert.equal(r.code, 0, `${phase} a échoué :\n${r.erreurs.slice(-4000)}\n${r.sortie.slice(-2000)}`);
    assert.ok(r.json?.ok, `${phase} : sortie illisible\n${r.sortie.slice(-2000)}`);
    assert.equal(r.reseau, false, `${phase} : un appel réseau a été tenté`);
    return r.json;
  } finally {
    copie.nettoyer();
  }
}
const uneFois = (fabrique) => {
  let valeur;
  return () => (valeur ??= fabrique());
};
const avec = uneFois(() => lancer('avec-candidate'));

// ------------------------------------------------------------ 1. sans candidate

test('sans candidate (le cas jusqu’à l’étape 27), l’étape de nuit ne fait RIEN : aucun match touché, aucune écriture en base, aucun fichier, rien au registre de la mesure', () => {
  const s = lancer('sans-candidate');
  assert.equal(s.code.candidateDuCode, null);
  assert.deepEqual(s.bilan, { candidate: null, matchs: 0, calcules: 0, echecs: 0, echantillons: [], lignes: 0, ecrites: 0, horsDeclaration: {}, reporte: false, erreur: null, dureeMs: s.bilan.dureeMs, blocMaxMs: 0 });
  assert.deepEqual(s.etape, { status: 'ok', summary: 'Aucune version candidate du moteur en essai : rien calculé à blanc.', details: { candidate: null, erreur: null }, changed: false });
  assert.deepEqual(s.apres, { runtimeIntact: true, ecritures: 0, aBlanc: 0, mesure: false });
});

// --------------------------------------------------------- 2. avec une candidate

test('avec une candidate : calculée à côté de la version en service sur les matchs à venir, seulement pour les marchés qu’elle déclare (les deux distributions sur la même ligne), comptée au registre de la mesure (« a-blanc »), rien de plus à la seconde nuit', () => {
  const s = avec();
  assert.deepEqual(s.nuit.candidate, { id: 'essai-rho-015', etape: '27', quoi: 'Corrélation Dixon-Coles à −0,15 (candidate d’essai)', marches: ['totalGoals', 'bothTeamsScore'], empreinte: s.nuit.candidate.empreinte });
  assert.match(s.nuit.candidate.empreinte, /^[0-9a-f]{16}$/);
  assert.deepEqual([s.nuit.matchs, s.nuit.calcules, s.nuit.echecs, s.nuit.erreur, s.nuit.reporte], [2, 2, 0, null, false], 'les deux matchs à venir de la page Matchs (le faux relevé payant)');
  assert.equal(s.nuit.lignes, 4);
  assert.equal(s.nuit.ecrites, 4);
  assert.equal(s.ecrituresDeLaNuit, 4, 'quatre lignes écrites, rien d’autre dans la base');
  assert.deepEqual(s.nuit.horsDeclaration, { resultAndTotal: 2 }, 'rho change aussi le combiné, non déclaré : compté, pas gardé');
  assert.deepEqual([...new Set(s.lignes.map((l) => l.marche))].sort(), ['bothTeamsScore', 'totalGoals'], 'seulement les marchés déclarés');
  for (const l of s.lignes) {
    assert.equal(l.revision, 1);
    assert.equal(l.versionEnService, 1, 'calculée à côté de la version 1');
    assert.equal(l.empreinte, s.nuit.candidate.empreinte);
    assert.ok(l.distribution && l.distributionEnService, `${l.marche} : les deux distributions`);
    assert.deepEqual(Object.keys(l.distribution.issues), Object.keys(l.distributionEnService.issues));
    assert.equal(l.distribution.ligne ?? null, l.distributionEnService.ligne ?? null, `${l.marche} : la même ligne des deux côtés`);
  }
  assert.ok(s.lignes.some((l) => l.marche === 'bothTeamsScore' && JSON.stringify(l.distribution) !== JSON.stringify(l.distributionEnService)), 'la candidate change bien les deux équipes marquent');
  // Comptée parmi les variantes essayées de l'étape 27 (registre de la mesure, étape 16).
  assert.deepEqual(s.variantes.map((v) => [v.id, v.ou, v.source]), [['essai-rho-015', 'a-blanc', 'registre']]);
  assert.equal(s.registreVersions.id, 'essai-rho-015');
  assert.equal(s.registreVersions.enEssaiDepuis, '2026-10-05T12:00:00.000Z');
  assert.equal(s.carte.enEssaiDepuis, '2026-10-05T12:00:00.000Z', 'la carte la montre en essai');
  assert.deepEqual(s.seconde, { ecrites: 0, lignes: 4 }, 'rien de changé : rien de plus');
  // Jamais notée comme une version du moteur : mêmes versions, même version en service, même pile du retour arrière.
  assert.equal(s.versionsDuMoteur.avant.enService, 1);
  assert.deepEqual(s.versionsDuMoteur.apres, s.versionsDuMoteur.avant, 'la candidate n’est jamais une version du moteur');
});

// ------------------------------------------------------- 3. jamais visible, un par un

test('jamais visible, un par un — identiques avant et après la nuit : la page du match et le scan de Mes paris, le verdict et le comparateur, le Repérage, les opportunités et leurs vertes, le message de l’IA, les journaux des paris, des pronostics et des analyses (fichiers et routes), les pronostics gelés', () => {
  const s = avec();
  assert.ok(s.avant.matchsReperes >= 2 && s.avant.opportunites > 0 && s.avant.gel > 0, `de quoi comparer : ${JSON.stringify(s.avant)}`);
  assert.deepEqual(Object.values(s.avant.analyses).map((a) => [a.code, a.version]), [[200, 1], [200, 1]]);
  assert.deepEqual(s.invisible, { analyses: true, verdicts: true, reperage: true, opportunites: true, vertes: true, ia: true, journaux: true, routesDesJournaux: true, gel: true });
  assert.equal(s.ia.candidateDansLeMessage, false, 'ni son nom, ni « candidate », ni « à blanc » dans ce que lit l’IA');
});

test('ce que montre la page du match est la version en service, au chiffre près — jamais la candidate, même quand elle diffère', () => {
  const s = avec();
  assert.equal(s.montre.length, s.lignes.length);
  for (const m of s.montre) {
    assert.equal(m.trouve, true, m.marche);
    assert.equal(m.commeEnService, true, `${m.marche} : la distribution montrée est celle de la version en service`);
    if (m.candidateDifferente) assert.equal(m.commeLaCandidate, false, `${m.marche} : jamais celle de la candidate`);
  }
  assert.ok(s.montre.some((m) => m.candidateDifferente), 'au moins un marché où la candidate diffère (sinon rien ne serait prouvé)');
});

// ------------------------------------------------------------------ 4. les refus

test('refus : registre de la mesure illisible (une candidate qui ne peut pas être comptée n’est pas calculée, le fichier n’est pas réécrit) ; candidate fautive ; une autre tâche tient le verrou (écriture reportée)', () => {
  const s = avec();
  assert.match(s.refusMesure.erreur, /^candidate « essai-refusee » non comptée au registre, rien calculé : Le registre de la mesure .* est illisible/);
  assert.deepEqual([s.refusMesure.candidate, s.refusMesure.lignes, s.refusMesure.fichierIntact], [null, 0, true]);
  assert.match(s.refusFautives.marche, /^candidate refusée, rien calculé : .*marché inconnu « buteurs »/);
  assert.match(s.refusFautives.etape, /^candidate refusée, rien calculé : .*l’étape 17 n’est pas une étape dont les chiffres se jugent/);
  assert.equal(s.refusFautives.lignes, 0);
  assert.deepEqual(s.horsPasse, { reporte: true, ecrites: 0, lignes: 0 });
  // La ligne de comparaison est celle du pronostic de la candidate, des deux côtés (fonction pure).
  assert.equal(s.pur.lignes.length, 1);
  assert.deepEqual(JSON.parse(s.pur.lignes[0].distribution), { ligne: 3.5, issues: { over: 0.28, under: 0.72 } });
  assert.deepEqual(JSON.parse(s.pur.lignes[0].serviceDistribution), { ligne: 3.5, issues: { over: 0.3, under: 0.7 } });
  assert.deepEqual([s.pur.lignes[0].choice, s.pur.lignes[0].serviceChoice, s.pur.lignes[0].serviceParams], ['under', 'over', '{"line":2.5,"side":"over"}']);
});

// ------------------------------------------------------------ 5. l'étape de la passe

test('l’étape « moteurABlanc » de la passe : après le gel et avant la sauvegarde, une fois par jour avec l’interrupteur des enregistreurs ; son bilan dit les interdits et ce qui est à regarder', () => {
  const s = avec();
  assert.equal(s.etape.status, 'warn', 'un marché changé sans être déclaré est à regarder');
  assert.match(s.etape.summary, /^Candidate « essai-rho-015 » \(étape 27\) sur 2 matchs à venir : 4 chiffres à blanc \(totalGoals, bothTeamsScore\), 0 valeur nouvelle gardée à part en .* — jamais montrés comme pronostic, jamais pariés, jamais envoyés à l'IA ; elle change aussi des marchés qu’elle n’a pas déclarés \(resultAndTotal : 2\) — à regarder, rien de gardé pour eux\.$/);
  assert.equal(s.etape.changed, false);
  const job = fs.readFileSync(path.join(SRC, 'jobs', 'matchStatsAutoRefresh.js'), 'utf8');
  const cles = [...job.matchAll(/^ {4}key: '(\w+)',$/gm)].map((m) => m[1]);
  assert.equal(cles.filter((k) => k === 'moteurABlanc').length, 1);
  assert.equal(cles.indexOf('moteurABlanc'), cles.indexOf('gelPronostics') + 1, 'juste après le gel');
  // Étape 20 : la calibration du mois écoulé s'intercale entre la candidate et la sauvegarde (la copie de la nuit contient le mois figé).
  assert.equal(cles.indexOf('calibrationMensuelle'), cles.indexOf('moteurABlanc') + 1, 'puis la calibration du mois écoulé');
  // Étape 23 : la carte « où parier » vient juste après la calibration, et la sauvegarde juste après elle (la copie de la nuit la contient).
  assert.equal(cles.indexOf('carteOuParier'), cles.indexOf('calibrationMensuelle') + 1, 'puis la carte « où parier »');
  assert.equal(cles.indexOf('sauvegarde'), cles.indexOf('carteOuParier') + 1, 'juste avant la sauvegarde');
  assert.match(job, /key: 'moteurABlanc',\n {4}label: 'Version candidate du moteur, calculée à blanc',\n(?: {4}\/\/.*\n)*? {4}due: \(ctx\) => dueMoteurABlanc\(ctx\),\n {4}run: \(ctx\) => passeMoteurABlanc\(ctx\)\n/);
  // Une fois par jour avec l'interrupteur des enregistreurs ; refaite à la passe suivante après une passe « en attente » (étape 27).
  assert.match(job, /const dueMoteurABlanc = \(ctx\) => Boolean\(env\.enregistreurs\?\.enabled\) && \(!faitAujourdhui\(ctx\.derniere\('moteurABlanc'\)\) \|\| Boolean\(ctx\.derniersDetails\?\.\('moteurABlanc'\)\?\.attente\)\);/);
  assert.match(job, /const r = await calculerABlanc\(\{ dansLaPasse: true, \.\.\.options \}\);/);
  const ablanc = fs.readFileSync(path.join(SRC, 'data', 'enregistreurs', 'moteurABlanc.js'), 'utf8');
  // Depuis le 24/10/2026 : la main rendue par UNE série de pauses (creerPauses) — entre deux matchs, entre deux tranches,
  // et bien plus (chaque match en trois morceaux, l'essai jugé) : reactiviteEssai.test.mjs le mesure.
  assert.match(ablanc, /await pauses\.pause\('fin d’un match'\);/, 'la main rendue entre deux matchs');
  assert.match(ablanc, /await pauses\.pause\('tranche d’écriture à blanc'\);/, 'la main rendue entre deux tranches');
});

// ------------------------------------------------------------------- 6. le code

test('le code : la table à part n’est écrite et lue que par le dépôt des enregistreurs ; seule l’étape de nuit l’alimente ; ni le verdict, ni les opportunités, ni le Repérage, ni l’IA, ni les journaux, ni les routes n’importent la candidate ; aucune tâche planifiée', () => {
  const fichiers = fs.readdirSync(SRC, { recursive: true }).filter((f) => String(f).endsWith('.js')).map((f) => String(f).split(path.sep).join('/'));
  const sansCommentaires = (f) => fs.readFileSync(path.join(SRC, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  const avecMotif = (motif) => fichiers.filter((f) => motif.test(sansCommentaires(f))).sort();
  assert.deepEqual(avecMotif(/engine_candidate_picks/), ['data/db/matchStatsDb.js', 'data/enregistreurs/depot.js'], 'la table : son DDL et son dépôt');
  assert.deepEqual(avecMotif(/\becrirePronosticsABlanc\s*\(|\bpronosticsABlanc\s*\(/), ['data/enregistreurs/depot.js', 'data/enregistreurs/moteurABlanc.js']);
  assert.deepEqual(avecMotif(/from '[^']*moteurABlanc\.js'/), ['jobs/matchStatsAutoRefresh.js'], 'seule la passe lance la nuit à blanc');
  assert.deepEqual(avecMotif(/\b(candidateEnEssai|configDeLaCandidate|mettreLaCandidateEnEssai)\s*\(/), ['core/engine/engineVersions.js', 'data/enregistreurs/moteurABlanc.js']);
  // Ce qui se montre, se parie ou part à l'IA n'importe ni la nuit à blanc, ni les fonctions de la candidate.
  const interdits = [
    'core/engine/verdictPari.js',
    'core/engine/oddsEngine.js',
    'data/opportunities.js',
    'data/screener.js',
    'core/ai/matchAiAnalysisService.js',
    'core/ai/compactContext.js',
    'core/ai/matchAiAnalysisPrompt.js',
    'core/ai/autoMatchAiTrigger.js',
    'api/controllers/analysis.controller.js',
    'api/controllers/bets.controller.js',
    'api/controllers/predictions.controller.js',
    'data/repositories/betsRepository.js',
    'data/repositories/predictionsRepository.js',
    'data/enregistreurs/gelPronostics.js'
  ];
  for (const f of interdits) {
    const source = sansCommentaires(f);
    assert.doesNotMatch(source, /moteurABlanc|engine_candidate_picks|candidateEnEssai|configDeLaCandidate|mettreLaCandidateEnEssai|CANDIDATE_EN_ESSAI|pronosticsABlanc/, f);
  }
  // Rien de planifié dans Windows.
  for (const f of ['data/enregistreurs/moteurABlanc.js', 'core/engine/engineVersions.js']) assert.doesNotMatch(sansCommentaires(f), /schtasks|ScheduledTask|setInterval\s*\(|setTimeout\s*\(/, f);
});

// ------------------------------------------------- 7. étape 27 : une candidate au modèle de buts unique

test('étape 27 — une candidate au MODÈLE DE BUTS UNIQUE à blanc : ses quatre familles de buts déclarées, rien « hors déclaration » (le 1N2 ne bouge pas) ; le TÉMOIN du score exact a sa ligne (81 cases et « autre score » de la candidate, la grille du score en service), jamais compté hors déclaration ; même empreinte avec ou sans témoin', () => {
  const s = lancer('modele-de-buts');
  // Vérification du branchement (constat 1) : sans SES forces de buts à jour, rien calculé à blanc — « en attente » —,
  // rien en base ; la passe le dit et l'étape revient à la passe suivante ; à jour, le calcul se fait.
  assert.deepEqual(s.sansForces, { attente: 'forces de buts pas à jour (jamais calculées)', calcules: 0, lignes: 0, ecrites: 0, enBase: 0 });
  assert.equal(s.forcesAJour, true, 'les forces de la candidate calculées');
  assert.deepEqual(s.rangementEnCours, { attente: 'forces de buts pas à jour (rangement en cours)', calcules: 0, lignes: 0, ecrites: 0, enBase: 0 });
  assert.deepEqual(s.passeEnAttente, {
    status: 'warn',
    summary: 'Candidate « essai-buts-unique » (étape 27) en attente : forces de buts pas à jour (rangement en cours) — rien calculé à blanc cette fois, la passe suivante refera le calcul.',
    attente: 'forces de buts pas à jour (rangement en cours)',
    changed: false
  });
  assert.deepEqual(s.due, { apresAttente: true, apresCalcul: false, jamaisFaite: true }, 'refaite à la passe suivante seulement après une attente');
  assert.equal(s.nuit.erreur, null);
  assert.deepEqual([s.nuit.matchs, s.nuit.calcules, s.nuit.echecs], [2, 2, 0]);
  assert.deepEqual(s.nuit.horsDeclaration, {}, 'aucun marché non déclaré ne change — le 1N2 compris');
  const familles = [...new Set(s.lignes.map((l) => l.marche.split(':')[0]))].sort();
  assert.deepEqual(familles, ['bothTeamsScore', 'resultAndTotal', 'scoreExact', 'teamGoals', 'totalGoals']);
  assert.ok(!s.lignes.some((l) => l.marche === 'result'), 'le 1N2 n’est pas déclaré : pas de ligne');
  const temoins = s.lignes.filter((l) => l.marche === 'scoreExact');
  assert.equal(temoins.length, 2, 'une ligne témoin par match');
  for (const t of temoins) {
    assert.equal(Object.keys(t.distribution.issues).length, 81);
    assert.ok(Number.isFinite(t.distribution.horsGrille));
    assert.equal(Object.keys(t.distributionEnService.issues).length, 81, 'la grille du score de la version en service');
    const somme = Object.values(t.distribution.issues).reduce((x, y) => x + y, 0) + t.distribution.horsGrille;
    assert.ok(Math.abs(somme - 1) < 1e-4, `81 cases + autre score = ${somme}`);
    assert.match(t.choix, /^\d-\d$/);
  }
  assert.deepEqual([s.empreintes.avec, s.empreintes.notee], [s.empreintes.sans, s.empreintes.sans], 'le témoin hors de l’empreinte');
});
