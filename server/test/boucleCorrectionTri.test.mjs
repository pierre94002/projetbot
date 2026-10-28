/**
 * La boucle de correction (étape 26 du plan, 27/10/2026) — LE TRI DU MOIS : malchance ou vrai défaut.
 *   node --test test/boucleCorrectionTri.test.mjs        (depuis server/)
 * 1. Le calcul réel dans une copie isolée (aides/script-boucle-tri.mjs), heure figée au 01/03/2027 : cinq mois de
 *    pronostics gelés et de rencontres FABRIQUÉS (exactement réalisés, deux défauts posés), deux lignées, un mois
 *    partiel, des pièges ; les lignes gardées et écartées, les écarts et les juges recalculés par un SECOND CHEMIN ;
 *    le tri figé (rien de réécrit, la base refuse UPDATE et DELETE), l'ordre et l'attente du gel de la calibration,
 *    la place de l'essai prise par l'étape 27 (familles de buts « en essai »), les réglages visés sans elle.
 * 2. T-ST3 (pur) : un moteur BRUITÉ sans biais de moyenne (constat 6 de la critique) — sa confiance est un vrai
 *    défaut « trop sûr », son niveau bouge aussi ; la règle « confiance d'abord » ne propose que la confiance.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import path from 'node:path';
import { DEFAULT_ENGINE_CONFIG_BY_SPORT } from '../src/core/engine/engineConfig.js';
import { CANDIDATE_EN_ESSAI } from '../src/core/engine/engineVersions.js';
import { CASES_DU_TRI, FAMILLES_DE_BUTS, REGARDS_PAR_AN } from '../src/data/correction/regles.js';
import { lireDistribution, contributions } from '../src/data/correction/mesures.js';
import { ajouterLeMatch, famillesVides, moisRelu, jugerLesCases, FORME_DES_SOMMES } from '../src/data/correction/tri.js';
import { executerSansPause } from '../src/utils/travailCooperatif.js';
import { versionFabriquee, registreFabrique, hasard, unMatch } from './aides/correctionFabrique.mjs';

const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-boucle-tri.mjs');
const proche = (a, b, eps, quoi) => assert.ok(Math.abs(a - b) <= eps, `${quoi} : ${a} ≠ ${b} (± ${eps})`);
const MDB = JSON.parse(JSON.stringify(CANDIDATE_EN_ESSAI.modifications.football.modeleDeButs));
const AVEC_MDB = { ...JSON.parse(JSON.stringify(DEFAULT_ENGINE_CONFIG_BY_SPORT.football)), modeleDeButs: MDB };

/** Le registre de la copie : v1 et v2 (vos bookmakers seuls : même lignée), v3 (un autre code, le 15/01/2027 à 09 h). */
function registre() {
  return registreFabrique({
    versions: [
      versionFabriquee(1, { code: 'a'.repeat(40), reglages: AVEC_MDB, creeeLe: '2026-09-20T10:00:00.000Z', origine: 'premier-demarrage' }),
      versionFabriquee(2, { code: 'a'.repeat(40), reglages: { ...AVEC_MDB, valueBookmakers: ['pinnacle'] }, creeeLe: '2026-11-10T08:00:00.000Z', origine: 'reglages' }),
      versionFabriquee(3, { code: 'b'.repeat(40), reglages: AVEC_MDB, creeeLe: '2027-01-15T09:00:00.000Z', origine: 'code' })
    ],
    journal: [
      { le: '2026-09-20T10:00:00.000Z', action: 'creation', version: 1, origine: 'premier-demarrage' },
      { le: '2026-11-10T08:00:00.000Z', action: 'creation', version: 2, depuis: 1, origine: 'reglages' },
      { le: '2027-01-15T09:00:00.000Z', action: 'creation', version: 3, depuis: 2, origine: 'code' }
    ]
  });
}

let sortie = null;
function reel() {
  if (sortie) return sortie;
  const copie = preparerCopie({ runtime: { 'engine-versions.json': registre(), 'engine-config.json': { football: { valueBookmakers: ['pinnacle'], modeleDeButs: MDB } } } });
  try {
    const r = executer(copie, SCRIPT, { maintenant: '2027-03-01T07:00:00.000Z', timeout: 600_000 });
    assert.equal(r.code, 0, r.erreurs.slice(-3000));
    assert.equal(r.reseau, false, 'aucun appel réseau');
    assert.ok(r.json, `sortie illisible : ${r.sortie.slice(-500)}`);
    sortie = r.json;
    return sortie;
  } finally {
    copie.nettoyer();
  }
}
const statut = (t, cas) => t.cases[cas].statut;

// ============================================================ 1. le calcul réel

test('le tri lit les lignes de la LIGNÉE en service à la fin du mois — v1 et v2 (vos bookmakers seuls) ensemble, v3 à part —, la dernière révision gelée avant le coup d’envoi ; chaque pronostic écarté l’est avec sa raison, jamais en silence', () => {
  const s = reel();
  const oct = s.tris['2026-10'];
  assert.deepEqual(oct.lignee.versions, [1, 2]);
  assert.equal(oct.lignee.couverture.complet, true);
  assert.equal(oct.lignee.avecModeleDeButs, true);
  const r = Object.fromEntries(oct.resume.ecartees.map((e) => [e.raison, e.n]));
  assert.deepEqual(r, { sansVersion: 4, autreVersion: 3, sansIdentifiant: 3, sansResultat: 2, sansDistribution: 2, statNonRelevee: 1, apresCoupDEnvoi: 1 });
  for (const e of oct.resume.ecartees) assert.ok(e.libelle && e.libelle !== e.raison, `phrase pour ${e.raison}`);
  assert.equal(oct.resume.lignes, 450 * 9);
  assert.equal(oct.resume.matchs, 450);
  assert.deepEqual(s.tris['2026-11'].lignee.versions, [1, 2]);
  assert.equal(s.tris['2026-11'].lignee.couverture.complet, true, 'v1 puis v2 : la même lignée, sans trou');
  assert.equal(s.tris['2026-11'].resume.lignes, 450 * 9, 'trois révisions sur dix matchs : une seule compte');
  const jan = s.tris['2027-01'];
  assert.deepEqual(jan.lignee.versions, [3]);
  assert.equal(jan.lignee.couverture.partiel, true);
  assert.equal(jan.lignee.couverture.depuis, '2027-01-15T09:00:00.000Z');
  assert.equal(jan.resume.partiel, true);
  assert.deepEqual(Object.fromEntries(jan.resume.ecartees.map((e) => [e.raison, e.n])), { autreVersion: 180 * 9 }, 'les matchs gelés par v2 : une autre lignée');
  assert.equal(jan.resume.lignes, 270 * 9);
  assert.equal(s.tris['2027-02'].lignee.couverture.complet, true);
});

test('les écarts de chaque case, de chaque mois, égaux à ceux recalculés à la main (règlement, issue de référence, favori) ; le juge du tri = comparer sur les lignes BRUTES (même gain, même écart-type, même fourchette) ; 264 regards, z ≈ 3,733', () => {
  const s = reel();
  let comparees = 0;
  for (const [mois, t] of Object.entries(s.tris)) {
    for (const cas of CASES_DU_TRI) {
      const c = t.cases[cas];
      const a = s.attendus[mois][cas];
      if (!a) {
        assert.equal(c.courant.lignes, 0, `${mois} ${cas}`);
        continue;
      }
      assert.equal(c.courant.lignes, a.lignes, `${mois} ${cas} lignes`);
      assert.equal(c.courant.matchs, a.matchs, `${mois} ${cas} matchs`);
      proche(c.courant.ecart, a.ecart, 1e-6, `${mois} ${cas} écart`);
      comparees++;
      const j = s.juges[mois][cas];
      if (!c.fenetre) {
        assert.equal(j, undefined);
        continue;
      }
      proche(c.fenetre.ecart, j.gain, 1e-6, `${mois} ${cas} gain`);
      proche(c.fenetre.ecartType, j.ecartType, 1e-6, `${mois} ${cas} écart-type`);
      proche(c.fenetre.fourchette[0], j.fourchette[0], 1e-6, `${mois} ${cas} fourchette`);
      proche(c.fenetre.fourchette[1], j.fourchette[1], 1e-6, `${mois} ${cas} fourchette`);
      assert.equal(c.fenetre.verdictDuJuge, j.verdict, `${mois} ${cas} verdict`);
      assert.equal(c.fenetre.lignes, j.lignes);
      assert.equal(c.fenetre.matchs, j.matchs);
      assert.equal(c.fenetre.regards, REGARDS_PAR_AN);
      proche(c.fenetre.z, 3.7328, 5e-4, 'z');
    }
  }
  assert.equal(comparees, 5 * 14, 'cinq mois × sept familles plantées × deux mesures');
  // Les défauts posés, vus par la mesure : « oui » annoncé 0,45 pour 30/90 ; « plus de 2,5 » annoncé 0,12 pour 24/90.
  proche(s.tris['2026-11'].cases['bothTeamsScore|niveau'].fenetre.ecart, 30 / 90 - 0.45, 1e-6, 'les deux marquent, niveau');
  proche(s.tris['2026-11'].cases['bothTeamsScore|confiance'].fenetre.ecart, 60 / 90 - 0.55, 1e-6, 'les deux marquent, confiance (favori « non »)');
  proche(s.tris['2027-02'].cases['totalGoals|confiance'].fenetre.ecart, 66 / 90 - 0.88, 1e-6, 'total buts, confiance (favori « moins »)');
});

test('la fenêtre : 2 ou 3 mois de la MÊME lignée, chacun d’au moins 200 matchs ; un mois seul « trop tôt » ; un mois PARTIEL assez fourni compte (janvier : 270 matchs de v3) mais ne se joint pas aux mois d’une autre lignée ; une famille sans pronostic : « trop peu », ou « mois de changement » dans un mois partiel', () => {
  const s = reel();
  assert.deepEqual(s.tris['2026-12'].cases['result|niveau'].mois, ['2026-10', '2026-11', '2026-12']);
  assert.deepEqual(s.tris['2026-11'].cases['result|niveau'].mois, ['2026-10', '2026-11']);
  assert.equal(statut(s.tris['2026-10'], 'result|niveau'), 'trop-tot');
  assert.equal(statut(s.tris['2026-11'], 'result|niveau'), 'dans-la-marge');
  assert.equal(statut(s.tris['2026-12'], 'teamCorners|confiance'), 'dans-la-marge');
  assert.deepEqual(s.tris['2027-01'].cases['result|niveau'].mois, ['2027-01'], 'décembre est une autre lignée');
  assert.equal(statut(s.tris['2027-01'], 'result|niveau'), 'trop-tot');
  assert.equal(s.tris['2027-01'].cases['result|niveau'].courant.matchs, 270);
  assert.deepEqual(s.tris['2027-02'].cases['totalCorners|niveau'].mois, ['2027-01', '2027-02']);
  assert.equal(statut(s.tris['2027-02'], 'totalCorners|niveau'), 'dans-la-marge');
  assert.equal(statut(s.tris['2026-12'], 'totalShots|niveau'), 'trop-peu');
  assert.equal(statut(s.tris['2027-01'], 'teamShots|confiance'), 'mois-de-changement');
  for (const t of Object.values(s.tris)) assert.equal(t.resume.statuts['vrai-defaut'], 0, 'la place est prise : aucun vrai défaut hors des familles en essai');
});

test('la place de l’essai PRISE par la candidate de l’étape 27 (déclarée dans le code, pas adoptée) : ses quatre familles de buts « en essai » — chiffres gardés et jugés, jamais « à corriger », aucun réglage visé', () => {
  const s = reel();
  assert.equal(s.place.prise, true);
  assert.equal(s.place.candidate.id, 'modele-buts-v1');
  for (const [mois, t] of Object.entries(s.tris)) {
    for (const f of FAMILLES_DE_BUTS) {
      for (const m of ['niveau', 'confiance']) {
        const c = t.cases[`${f}|${m}`];
        assert.equal(c.statut, 'en-essai', `${mois} ${f}|${m}`);
        assert.deepEqual(c.enEssai, { candidate: 'modele-buts-v1', etape: '27', enMots: CANDIDATE_EN_ESSAI.enMots });
        assert.equal(c.levier, null);
      }
    }
    assert.equal(t.resume.enEssai.candidate, 'modele-buts-v1');
  }
  // Jugées quand même (comptées dans les 264 regards).
  assert.equal(s.tris['2026-11'].cases['bothTeamsScore|niveau'].fenetre.verdictDuJuge, 'moins-bon');
});

test('sans candidate dans la place : le défaut posé sur « les deux marquent » est un VRAI DÉFAUT dès deux mois (niveau trop haut → rho monte ; confiance « pas assez sûr » → prior descend) ; celui de « plus de 2,5 » sur la lignée B : confiance « trop sûr » → prior monte, et son niveau ATTEND la correction de la confiance', () => {
  const s = reel();
  const nov = s.variantes['2026-11'];
  assert.equal(nov['bothTeamsScore|niveau'].statut, 'vrai-defaut');
  assert.equal(nov['bothTeamsScore|niveau'].sens, 'trop-haut');
  assert.equal(nov['bothTeamsScore|niveau'].sensDit, 'annonce trop souvent « les deux équipes marquent »');
  assert.deepEqual([nov['bothTeamsScore|niveau'].levier.cle, nov['bothTeamsScore|niveau'].levier.sens], ['modeleDeButs.rho', 'monter']);
  assert.equal(nov['bothTeamsScore|confiance'].statut, 'vrai-defaut');
  assert.deepEqual([nov['bothTeamsScore|confiance'].levier.cle, nov['bothTeamsScore|confiance'].levier.sens], ['modeleDeButs.prior', 'descendre']);
  assert.equal(nov['totalGoals|niveau'].statut, 'dans-la-marge');
  assert.equal(s.variantes['2026-10']['bothTeamsScore|niveau'].statut, 'trop-tot', 'un seul mois : jamais un vrai défaut');
  assert.equal(s.variantes['2026-12']['bothTeamsScore|niveau'].statut, 'vrai-defaut');
  const fev = s.variantes['2027-02'];
  assert.equal(fev['totalGoals|confiance'].statut, 'vrai-defaut');
  assert.equal(fev['totalGoals|confiance'].sens, 'trop-haut');
  assert.deepEqual([fev['totalGoals|confiance'].levier.cle, fev['totalGoals|confiance'].levier.sens], ['modeleDeButs.prior', 'monter']);
  assert.equal(fev['totalGoals|niveau'].statut, 'vrai-defaut');
  assert.equal(fev['totalGoals|niveau'].aRevoir, 'apres-la-confiance');
  assert.equal(fev['totalGoals|niveau'].levier.attente, 'confiance');
  assert.equal(fev['bothTeamsScore|niveau'].statut, 'dans-la-marge', 'la lignée B n’a pas le défaut de la lignée A');
  assert.deepEqual(s.variantes['2027-01']['totalGoals|confiance'].statut, 'trop-tot');
  for (const v of Object.values(s.variantes)) for (const c of Object.values(v)) if (c.levier?.cle) assert.match(c.levier.cle, /^modeleDeButs\.(rho|prior|melange\.sans\.wT)$/);
});

test('le détail par régime (pour comprendre, jamais jugé) : lignes, matchs et réalisés par provenance du modèle de buts ou par source des cotes, et le match nul du 1N2 à part ; égal au second chemin', () => {
  const s = reel();
  const reg = s.tris['2026-10'].regimes.mois;
  for (const f of [...FAMILLES_DE_BUTS, 'result']) {
    const attendu = s.attendus['2026-10'][`regimes|${f}`];
    assert.deepEqual(Object.keys(reg[f]).sort(), Object.keys(attendu).sort(), f);
    for (const [k, a] of Object.entries(attendu)) {
      assert.equal(reg[f][k].lignes, a.lignes, `${f} ${k}`);
      assert.equal(reg[f][k].matchs, a.matchs, `${f} ${k}`);
      assert.equal(reg[f][k].sb, a.sb, `${f} ${k}`);
    }
  }
  assert.deepEqual(Object.keys(reg.result).sort(), ['aucune-cote', 'cotes']);
  assert.deepEqual(Object.keys(reg.totalGoals).sort(), ['cotes-1n2-xg', 'cotes-plusmoins-xg', 'xg-seuls']);
  assert.equal(reg.nul.cotes.lignes + reg.nul['aucune-cote'].lignes, 450, 'le match nul : chaque 1N2 compté');
  for (const c of Object.values(s.tris['2026-11'].cases)) assert.ok(!('regimes' in c), 'le détail n’est pas rangé dans les cases');
});

test('le tri FIGÉ : moisATrier attend le gel de la calibration et garde l’ordre (décembre attend : janvier aussi), au plus N par passe ; un mois trié ne l’est jamais deux fois ; le second passage ne réécrit rien ; la base refuse modification et effacement du tri et du journal ; une entrée « tri » au journal par mois ; la lecture prend la forme la plus haute, sans les sommes', () => {
  const s = reel();
  assert.deepEqual(s.aTrier1, ['2026-10', '2026-11']);
  assert.deepEqual(s.aTrier2, [], 'décembre n’est pas encore figé par la calibration');
  assert.deepEqual(s.aTrier3Limite2, ['2026-12', '2027-01']);
  assert.deepEqual(s.aTrier3, ['2026-12', '2027-01', '2027-02']);
  assert.deepEqual(s.aTrier4, []);
  for (const t of Object.values(s.tris)) assert.equal(t.ecrit, true);
  assert.equal(s.second.ecrit, false);
  assert.notEqual(s.second.calculeLeGarde, '2027-03-02T00:00:00.000Z', 'le tri d’origine fait foi');
  assert.equal(s.second.memeCases, true);
  assert.match(s.refus.updateTri, /un tri figé ne se réécrit jamais/);
  assert.match(s.refus.deleteTri, /un tri figé ne s’efface jamais/);
  assert.match(s.refus.updateJournal, /le journal ne se réécrit jamais/);
  assert.match(s.refus.deleteJournal, /le journal ne s’efface jamais/);
  assert.deepEqual(s.journal.map((e) => [e.evenement, e.mois]), [['tri', '2027-02'], ['tri', '2027-01'], ['tri', '2026-12'], ['tri', '2026-11'], ['tri', '2026-10']]);
  assert.ok(s.journal.every((e) => e.source === 'nuit' && /^Tri de \d{4}-\d{2} figé/.test(e.phrase)));
  assert.deepEqual(s.listeDesTris, ['2027-02#1', '2027-01#1', '2026-12#1', '2026-11#1', '2026-10#1']);
  assert.equal(s.relu.sansSommes, true);
  assert.deepEqual(s.relu.cases, s.tris['2026-12'].cases, 'relu tel qu’écrit');
  for (const t of Object.values(s.tris)) assert.ok(t.octetsSommes < 400_000, `sommes rangées : ${t.octetsSommes} octets`);
});

test('les réglages en service ne sont jamais modifiés par le tri ni par la lignée (copie profonde, B43) ; aucun tri n’écrit les réglages', () => {
  const s = reel();
  assert.equal(s.reglages.avecModeleDeButs, true, 'des réglages imbriqués : la copie doit être profonde');
  assert.equal(s.reglages.inchanges, true);
  assert.equal(s.reglages.empreinte, true);
});

// ============================================================ 2. T-ST3 : un moteur bruité

/** Un mois simulé par le code du tri (contributions de mesures.js, ajouterLeMatch et moisRelu de tri.js). */
function moisSimule(h, mois, n, bruit) {
  const familles = famillesVides();
  for (let k = 0; k < n; k++) {
    const comptees = [];
    for (const l of unMatch(h, { bruit, statistiques: false }).lignes) {
      const c = contributions(l.familleId, lireDistribution(l.familleId, l.distribution), l.issue);
      if (!c.raison) comptees.push({ familleId: l.familleId, contribution: c });
    }
    ajouterLeMatch(familles, comptees);
  }
  return moisRelu({ mois, lignee: { empreinte: `bruit-${bruit}`, couverture: { partiel: false } }, sommes: JSON.parse(JSON.stringify({ forme: FORME_DES_SOMMES, familles })), regimes: {} });
}

test('T-ST3 : un moteur BRUITÉ (30 % sur les buts attendus, bruit qui garde la moyenne), trois mois de 4 000 matchs jugés par le vrai juge — sa confiance est un vrai défaut « trop sûr » ; son niveau bouge AUSSI (« les deux marquent ») ; la règle « confiance d’abord » ne propose alors QUE le réglage de la confiance (aucun rho, aucun wT) ; un moteur juste ne montre aucun vrai défaut', (t) => {
  const h = hasard(2603);
  const [m1, m2, m3] = ['2027-01', '2027-02', '2027-03'].map((m) => moisSimule(h, m, 4000, 0.3));
  const cases = Object.fromEntries(executerSansPause(jugerLesCases({ mois: '2027-03', lignee: { avecModeleDeButs: true }, courant: m3, precedents: [m2, m1], enSlot: null })).map((c) => [c.cas, c]));
  t.diagnostic(FAMILLES_DE_BUTS.map((f) => `${f} : niveau ${(cases[`${f}|niveau`].fenetre.ecart * 100).toFixed(2)} pts ${cases[`${f}|niveau`].statut}, confiance ${(cases[`${f}|confiance`].fenetre.ecart * 100).toFixed(2)} pts ${cases[`${f}|confiance`].statut}`).join(' ; '));
  const tropSurs = FAMILLES_DE_BUTS.filter((f) => cases[`${f}|confiance`].statut === 'vrai-defaut' && cases[`${f}|confiance`].sens === 'trop-haut');
  assert.ok(tropSurs.length >= 3, `confiance « trop sûr » : ${tropSurs.join(', ')}`);
  const btts = cases['bothTeamsScore|niveau'];
  assert.equal(btts.statut, 'vrai-defaut', 'le niveau n’est pas insensible au bruit (constat 6)');
  assert.equal(btts.sens, 'trop-bas');
  assert.equal(btts.aRevoir, 'apres-la-confiance');
  assert.equal(btts.levier.attente, 'confiance');
  for (const c of Object.values(cases)) {
    assert.notEqual(c.levier?.cle, 'modeleDeButs.rho', `${c.cas} : aucun réglage de niveau quand la confiance est trop sûre`);
    assert.notEqual(c.levier?.cle, 'modeleDeButs.melange.sans.wT', c.cas);
  }
  for (const f of tropSurs) assert.equal(cases[`${f}|confiance`].levier.cle, 'modeleDeButs.prior');
  // Le témoin : un moteur juste, mêmes volumes — aucun vrai défaut.
  const h0 = hasard(2604);
  const [j1, j2, j3] = ['2027-01', '2027-02', '2027-03'].map((m) => moisSimule(h0, m, 4000, 0));
  const justes = executerSansPause(jugerLesCases({ mois: '2027-03', lignee: { avecModeleDeButs: true }, courant: j3, precedents: [j2, j1], enSlot: null }));
  assert.deepEqual(justes.filter((c) => c.statut === 'vrai-defaut').map((c) => c.cas), []);
});
