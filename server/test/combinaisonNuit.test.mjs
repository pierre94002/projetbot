/**
 * LA COMBINAISON — LA NUIT (étape 38, lot 1b, 04/11/2026) : l'étape « combinaisonABlanc » de la passe.
 *   node --test test/combinaisonNuit.test.mjs        (depuis server/)
 *
 * Sur une base NEUVE d'une copie isolée (réseau coupé, heure figée) et des pronostics gelés FABRIQUÉS
 * (test/aides/script-combinaison-nuit.mjs : 240 matchs passés réglés, six rencontres à venir, une révision de la candidate
 * écrite par le dépôt, le contrôle de la veille) :
 * T-N1 le jeton du calcul lourd pris par un autre → « reportée », RIEN de rangé, le résumé le dit ; le calcul tourne bien
 *      dans un AUTRE processus (son pid, sa mémoire) ;
 * T-N2 le rangement par tranches (5 ici, 250 par défaut), « en cours » posé puis retiré (la lecture attend), la reprise après
 *      une nuit interrompue ; le serveur jamais tenu plus de 300 ms d'affilée ;
 * T-N3 une ligne rangée n'est JAMAIS réécrite (INSERT OR IGNORE : une ligne marquée à la main reste marquée) ; une révision
 *      neuve a sa propre ligne, rangée une nuit plus tard (`calcule_apres`) ; une révision gelée après le coup d'envoi est
 *      rangée et marquée ; la candidate en essai rangée à part (sa source, son identifiant), jamais lue par la page ;
 * T-N4 le délai dépassé → le processus à part arrêté, rien de rangé, « en échec » ;
 * T-N5 le module qui ne se charge pas → l'étape en échec, la passe ne lève pas ; une panne du calcul → « en échec » ; le
 *      contrôle quotidien de la VEILLE est lu par la passe et passé à la nuit ;
 * T-N6 la fuite plantée (la coupure à odds_at oubliée par la nuit) → le contrôle anti-fuite par un second chemin la nomme,
 *      RIEN n'est rangé, l'étape en échec, l'alerte durable ; sans fuite : 0 écart ;
 * T-N7 la place dans ETAPES : après les joueurs, juste avant le contrôle quotidien (toujours dernier) ; une fois par jour,
 *      reprise si reportée, jamais au clic ; le résumé en une phrase ; le neuvième contrôle anti-fuite de l'écran.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SERVEUR } from './aides/isolement.mjs';
import { nuitFabriquee } from './aides/combinaisonNuitFabriquee.mjs';
import { __testing as JOB, __combinaisonPourLesTests as COMB } from '../src/jobs/matchStatsAutoRefresh.js';
import * as N from '../src/data/combinaison/combinaisonNuit.js';
import { NUIT } from '../src/data/combinaison/reglagesCombinaison.js';

const UI = path.resolve(SERVEUR, '..', 'ui');
const ligne = (s, fixture, market = 'result', revision = 1, source = 'service') => s.lignes2.find((l) => l.source === source && l.fixture_key.includes(fixture) && l.market_key === market && l.revision === revision);

test('T-N1 le jeton pris → « reportée », rien de rangé ; le calcul tourne dans un AUTRE processus', () => {
  const s = nuitFabriquee();
  assert.equal(s.reporte.mode, 'reporte');
  assert.match(s.reporte.raison, /Un autre calcul lourd tourne \(un autre calcul/);
  assert.equal(s.apresReporte, 0, 'rien de rangé');
  assert.equal(s.reporteEtape.status, 'warn');
  assert.equal(s.reporteEtape.details.reporte, true);
  assert.match(s.reporteEtape.summary, /^Reporté : .* — la combinaison à blanc sera rangée à la passe suivante\.$/);
  // La vraie nuit : à part (sa mémoire relevée par l'enfant), 250 révisions rangées.
  assert.equal(s.nuit1.mode, 'complet');
  assert.ok(s.nuit1.bilan.aPart?.rssMaxOctets > 10 * 1048576, 'la mémoire du processus à part');
  assert.ok(s.nuit1.bilan.aPart.rssMaxOctets < NUIT.memoireMo * 1048576 * 1.5);
  assert.deepEqual(s.nuit1.ecrites, { rangees: 250, deja: 0 });
  assert.equal(N.NOM_DU_CALCUL, 'combinaison à blanc');
  assert.deepEqual([...N.OPTIONS_ENFANT], ['--max-old-space-size=512', '--max-semi-space-size=8']);
  assert.equal(N.DELAI_ENFANT_MS, 600_000);
});

test('T-N2 par tranches (5 ici, 250 par défaut), « en cours » posé puis retiré (la lecture attend), la reprise ; le serveur jamais tenu plus de 300 ms', () => {
  const s = nuitFabriquee();
  assert.equal(NUIT.tranche, 250);
  assert.equal(s.nuit1.transactions, 50 + 1, '250 lignes par 5 : 50 transactions, plus la dernière');
  assert.ok(s.nuit1.blocMaxMs < 300, `${s.nuit1.blocMaxMs} ms`);
  assert.equal(s.etat1.enCours, null, '« en cours » retiré');
  assert.equal(s.etat1.nuit.calculeLe, '2026-11-10T00:40:00.000Z');
  assert.deepEqual([s.lectureEnCours.etat, s.lectureEnCours.raison], ['pas-encore-calcule', 'nuit-en-cours']);
  assert.equal(s.nuit3.mode, 'complet');
  assert.equal(s.nuit3.repriseApres, '2026-11-11T00:40:00.000Z', 'la nuit interrompue est reprise');
  assert.equal(s.etat3.enCours, null);
  assert.deepEqual([s.lectureAvant.etat, s.lectureAvant.raison], ['pas-encore-calcule', 'premiere-nuit']);
});

test('T-N3 jamais réécrite ; une révision neuve a sa ligne, rangée une nuit plus tard ; après le coup d’envoi marquée ; la candidate à part', () => {
  const s = nuitFabriquee();
  assert.equal(s.marqueGardee, 'marque-du-test', 'INSERT OR IGNORE : la nuit suivante ne réécrit rien');
  // Même présentée de nouveau au rangement, une ligne rangée n'est pas réécrite (jamais OR REPLACE).
  assert.deepEqual(s.reRangement, { rangees: 0, deja: 1 });
  assert.equal(s.marqueApresReRangement, 'marque-du-test');
  assert.equal(s.nuit2.ecrites.rangees, 1);
  assert.equal(s.lignes2.length, s.lignes1.length + 1);
  const r2 = ligne(s, 'fotmob-1|fotmob-2', 'result', 2);
  assert.equal(r2.origin, 'analyse-avance');
  assert.equal(r2.calcule_apres, 1, 'gelée le 10/11, rangée la nuit du 11/11');
  const r1 = ligne(s, 'fotmob-1|fotmob-2', 'result', 1);
  assert.equal(r1.calcule_apres, 0, 'gelée cette nuit, rangée cette nuit');
  for (const l of s.lignes1) {
    const apres = s.lignes2.find((x) => x.source === l.source && x.candidate_id === l.candidate_id && x.fixture_key === l.fixture_key && x.market_key === l.market_key && x.revision === l.revision);
    if (l.fixture_key.includes('fotmob-5|fotmob-6') && l.market_key === 'result') continue;
    assert.deepEqual(apres, l, 'une ligne rangée ne bouge plus');
  }
  const apresKo = ligne(s, 'fotmob-7|fotmob-8');
  assert.equal(apresKo.apres_coup_d_envoi, 1, 'gelée après le coup d’envoi : rangée, marquée');
  assert.equal(s.nuit1.bilan.apresCoupDEnvoi, 1);
  const cand = s.lignes2.filter((l) => l.source === 'candidate');
  assert.equal(cand.length, 1);
  assert.equal(cand[0].candidate_id, s.candidat);
  assert.equal(cand[0].tranche_verdict, null, 'aucune case F pour la candidate pendant son essai');
  assert.equal(cand[0].famille, 'buts');
  for (const l of s.lignes2) {
    assert.match(l.etiquette, /^(sur|fragile|marque-du-test)$/);
    assert.equal(l.regle_version, '38.1');
    assert.equal(l.p_comb, l.p_marche, 'P_comb = P_M : la note ne retient aucun β');
    assert.equal(l.palier_reconstruit, 1);
    assert.equal(l.note_sha1, 'ccdab114620f6dd26637db3a0175861dfba63771');
  }
  // Les autres tables de la base : identiques avant et après la vraie nuit (seules ses deux tables sont écrites).
  assert.equal(s.autresIdentiques, true);
});

test('T-N4 le délai dépassé → arrêté, rien de rangé, « en échec »', () => {
  const s = nuitFabriquee();
  assert.equal(s.delai.mode, 'echec');
  assert.match(s.delai.erreur, /calcul à part arrêté : aucune réponse en 1 ms/);
  assert.equal(s.apresDelai, 0);
  const etape = N.resultatDeLEtape({ mode: 'echec', erreur: 'calcul à part arrêté : aucune réponse en 10 min', dureeMs: 600_000 });
  assert.equal(etape.status, 'error');
  assert.match(etape.summary, /^En échec : calcul à part arrêté : aucune réponse en 10 min — rien d’avancé, les lignes d’avant restent ; la passe suivante recommence \(10 min 00 s\)\.$/);
});

test('T-N5 le module qui ne se charge pas → l’étape en échec, la passe ne lève pas ; une panne → « en échec » ; le contrôle de la veille lu par la passe', async () => {
  const casse = await COMB.passeCombinaisonABlanc({}, { chargerLeModule: () => Promise.reject(new Error('SyntaxError: module de la combinaison cassé')), lireLeControle: async () => ({ etat: 'absent' }) });
  assert.equal(casse.status, 'error');
  assert.match(casse.summary, /le module de la combinaison ne se charge pas \(SyntaxError: module de la combinaison cassé\) — rien d’avancé ; le reste de la nuit n’en dépend pas/);
  assert.equal(casse.details.module, false);
  const panne = await COMB.passeCombinaisonABlanc({}, { chargerLeModule: async () => ({ faireLaCombinaisonDeLaNuit: async () => { throw new Error('panne fabriquée'); }, resultatDeLEtape: () => null }), lireLeControle: async () => ({ etat: 'absent' }) });
  assert.deepEqual([panne.status, panne.details.erreur], ['error', 'panne fabriquée']);
  // Le contrôle de la veille : lu par la passe (jamais dans data/combinaison/), passé tel quel ; l'heure lue par la passe.
  let recu = null;
  const aVerifier = { clubs: { 'fotmob-3': [{ id: 'x', classe: 'rouge', familles: ['tout'] }] }, ligues: {}, global: [] };
  const ok = await COMB.passeCombinaisonABlanc({}, {
    chargerLeModule: async () => ({ faireLaCombinaisonDeLaNuit: async (opts) => { recu = opts; return { mode: 'reporte', raison: 'essai' }; }, resultatDeLEtape: N.resultatDeLEtape }),
    lireLeControle: async () => ({ etat: 'pret', controle: { le: '2026-11-09T01:00:00.000Z', aVerifier, controles: [] } })
  });
  assert.equal(ok.status, 'warn');
  assert.deepEqual(recu.controle, { le: '2026-11-09T01:00:00.000Z', aVerifier });
  assert.equal(typeof recu.maintenant, 'number');
  await COMB.passeCombinaisonABlanc({}, { chargerLeModule: async () => ({ faireLaCombinaisonDeLaNuit: async (opts) => { recu = opts; return { mode: 'reporte', raison: 'essai' }; }, resultatDeLEtape: N.resultatDeLEtape }), lireLeControle: async () => { throw new Error('illisible'); } });
  assert.equal(recu.controle, null, 'un contrôle illisible : « inconnu », la nuit tourne quand même');
  // La vraie nuit fabriquée a reçu le contrôle : la classe E en vigueur (constat rouge), sinon « inconnu ».
  const s = nuitFabriquee();
  assert.equal(s.nuit1.bilan.controleInconnu, 241, 'les révisions gelées avant le contrôle : « inconnu », comptées');
  const m2 = ligne(s, 'fotmob-3|fotmob-4', 'result', 2);
  assert.equal(JSON.parse(m2.degres).E, 2);
  assert.equal(m2.controle_du, '2026-11-09T01:00:00.000Z');
  assert.deepEqual(JSON.parse(m2.a_verifier), [{ id: 'score:2026-11-01-club-3', classe: 'rouge' }]);
  assert.equal(ligne(s, 'fotmob-3|fotmob-4', 'result', 1).a_verifier, 'inconnu', 'gelée avant le contrôle de la veille');
});

test('T-N6 la fuite plantée → le second chemin la nomme, rien de rangé, l’étape en échec, l’alerte durable ; sans fuite 0 écart', () => {
  const s = nuitFabriquee();
  assert.equal(s.fuite.mode, 'fuite');
  assert.equal(s.apresFuite, 0, 'rien de rangé');
  const e = s.fuite.controle.ecarts;
  assert.equal(e.length, 1);
  assert.deepEqual([e[0].colonne, e[0].nuit, e[0].second], ['palier', 'Pinnacle', 'palier 3']);
  assert.match(e[0].texte, /^fotmob-1 – fotmob-2 du 2026-11-11 \(cotes du pronostic : 2026-11-09T20:05:00\.000Z\) : palier « Pinnacle » la nuit, « palier 3 » par les relevés d’avant le pronostic$/);
  assert.equal(s.fuiteEtape.status, 'error');
  assert.match(s.fuiteEtape.summary, /^En échec : le contrôle anti-fuite a trouvé 1 écart \(.*\) — rien n’est rangé cette nuit ; à regarder\.$/);
  assert.equal(s.fuiteEtape.alert.key, 'combinaisonABlanc');
  assert.deepEqual(Object.keys(s.fuiteEtape.alert.value).sort(), ['ecarts', 'lignes', 'total', 'updatedAt']);
  assert.equal(s.fuiteEtape.alert.value.ecarts[0].texte, e[0].texte);
  // Sans fuite : les couples recomptés, 0 écart, et l'alerte retirée (null).
  assert.equal(s.nuit1.controle.ecarts.length, 0);
  assert.equal(s.nuit1.controle.couples, 2);
  assert.equal(s.nuit1Etape.alert.value, null);
  assert.ok(s.nuit2.controle.couples >= 2 && s.nuit2.controle.ecarts.length === 0);
});

test('T-N7 la place dans ETAPES, une fois par jour, jamais au clic ; le résumé ; le neuvième contrôle anti-fuite de l’écran', async () => {
  const etapes = JOB.ETAPES().map((e) => e.key);
  assert.deepEqual(etapes.slice(-4), ['cartonsEtCorners', 'joueursABlanc', 'combinaisonABlanc', 'controleQuotidien']);
  for (const avant of ['moteurABlanc', 'gelPronostics', 'sauvegarde', 'contexteDuMatch']) assert.ok(etapes.indexOf('combinaisonABlanc') > etapes.indexOf(avant), `après ${avant}`);
  const ctx = (derniere, details = null, manuel = false) => ({ manuel, derniere: () => derniere, derniersDetails: () => details });
  assert.equal(COMB.dueCombinaisonABlanc(ctx(null)), true);
  assert.equal(COMB.dueCombinaisonABlanc(ctx(new Date().toISOString())), false);
  assert.equal(COMB.dueCombinaisonABlanc(ctx(new Date().toISOString(), null, true)), false, 'jamais au clic');
  assert.equal(COMB.dueCombinaisonABlanc(ctx(new Date().toISOString(), { reporte: true })), true, 'reprise si reportée');
  const s = nuitFabriquee();
  assert.equal(s.nuit1Etape.status, 'ok');
  assert.match(s.nuit1Etape.summary, /^Combinaison à blanc : 250 révisions rangées \(dont 243 rangées une nuit plus tard ; 1 gelée après le coup d’envoi, gardée hors de la preuve\) ; contrôle anti-fuite : 2 couples recomptés par un second chemin, 0 écart ; [\d,]+ s à part \(\d+ Mo\), rangement [\d,]+ s, le serveur jamais tenu plus de \d+ ms d'affilée ; 241 révisions gelées avant le contrôle en vigueur : « à vérifier » inconnu\. À blanc : jamais lu par le moteur ni envoyé à l’IA\.$/);
  assert.deepEqual(s.nuit1Etape.details.parSource, { service: 249, candidate: 1 });
  const A = await import(pathToFileURL(path.join(UI, 'src', 'utils', 'controlesAntiFuite.js')).href);
  assert.deepEqual(A.CONTROLES_ANTI_FUITE.at(-1), { cle: 'combinaisonABlanc', nom: 'Combinaison à blanc (palier de la cote juste au jour du pronostic)' });
  assert.deepEqual(A.controlesAntiFuiteDits({ combinaisonABlanc: s.fuiteEtape.alert.value }).map((d) => d.texte), [
    `Combinaison à blanc (palier de la cote juste au jour du pronostic) : 1 écart sur 2 lignes recalculées (contrôle du 10/11/2026 à 01:42) — par exemple ${s.fuite.controle.ecarts[0].texte}.`
  ]);
  // Les modules se chargent.
  for (const [f, nom] of [['combinaisonNuit.js', 'faireLaCombinaisonDeLaNuit'], ['nuitDeLaCombinaison.js', 'calculerLaNuitDeLaCombinaison'], ['combinaisonRead.js', 'combinaisonDuMatch'], ['casesDeLaTranche.js', 'verdictsDesCases'], ['controleDeLaCombinaison.js', 'controlerLesPaliers']]) {
    assert.equal(typeof (await import(`../src/data/combinaison/${f}`))[nom], 'function', f);
  }
});
