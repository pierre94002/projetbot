/**
 * Étape 21 du plan (14/10/2026) — LE CARNET DE NOTES DE L'IA.
 *   node --test test/aiScorecard.test.mjs        (depuis server/)
 *
 * Les règles PURES de src/data/aiScorecard.js et de matchAiAnalysisRepository.js (l'avis tenu, les bilans, le
 * rattachement, la clôture, la comparaison au moteur seul, la décision de couper) tournent dans le processus du
 * test, sur des cas FABRIQUÉS. Tout ce qui ouvre une base ou lit data\runtime tourne dans des copies isolées de
 * la base d'essai (test/aides/script-carnet-ia.mjs) : analyses de l'IA fabriquées — AUCUN appel à Claude, le
 * seul enregistrement d'une analyse passe par le Claude simulé —, pièges plantés, cotes archivées plantées,
 * réseau coupé, heure figée au 05/10/2026 12 h UTC. Les valeurs attendues des pièges sont recalculées dans le
 * script par un second chemin écrit à la main.
 *
 *  1. La règle de l'avis tenu, et l'expérience de l'IA inchangée (mêmes clés, même ordre).
 *  2. Les avis « nuance » ne sont jamais comptés.
 *  3. Le rattachement par identifiants FotMob, jamais par le rapprocheur de noms souple.
 *  4. Le règlement des pièges, avis par avis, face au second chemin.
 *  5. La clôture, avis par avis, face à removeMargin à la main.
 *  6. La comparaison au moteur seul (le juge de l'étape 16).
 *  7. La coupure, seulement sur preuve.
 *  8. L'étape de la nuit, le fichier, la base seulement lue.
 *  9. Le filtre de la fiche compacte (curateEngineSummary), la ligne de la fiche, la revue.
 * 10. L'ancienne forme à l'octet (référence test/fixtures/fiche-ia-etape-21.json, produite par le code d'avant).
 * 11. La route.
 * 12. Le code : ni Claude, ni réseau, ni rapprocheur souple ; le carnet écrit par atomicJson.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR, FIXTURES, RACINE_ESSAIS } from './aides/isolement.mjs';
import * as S from '../src/data/aiScorecard.js';
import { avisTenu, bilanVide, compterAuBilan, TYPES_DE_MARCHE } from '../src/data/repositories/matchAiAnalysisRepository.js';
import { comparer, generateur } from '../src/bench/guard.js';
import { removeMargin } from '../src/core/market/marginRemoval.js';

const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-carnet-ia.mjs');

/**
 * Une phase du script dans sa copie isolée (avec les scripts du serveur, que l'actualisation importe). Une seule
 * fois par phase et par mode. `actif` : la coupure ACTIVÉE dans la copie du code (COUPURE_ACTIVE = true dans SA
 * copie de aiScorecard.js) — jamais dans le code du bac, où elle reste désactivée tant que Pierre n'a pas décidé.
 */
const memo = new Map();
function phase(nom, { actif = false } = {}) {
  const cle = `${nom}|${actif}`;
  if (!memo.has(cle)) {
    const copie = preparerCopie({});
    try {
      fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
      if (actif) {
        const fichier = path.join(copie.serveur, 'src', 'data', 'aiScorecard.js');
        const texte = fs.readFileSync(fichier, 'utf8');
        assert.equal(texte.split('export const COUPURE_ACTIVE = false;').length, 2, 'la constante, une fois, désactivée dans le code');
        fs.writeFileSync(fichier, texte.replace('export const COUPURE_ACTIVE = false;', 'export const COUPURE_ACTIVE = true;'));
      }
      // Un exécutable Claude qui n'existe pas, même lancé depuis le dépôt (où le vrai existe) : la simulation l'exige.
      const r = executer(copie, SCRIPT, { args: [nom], timeout: 300_000, env: { CLAUDE_CODE_BIN: path.join(copie.dossier, 'pas-de-claude-ici.exe'), MATCH_STATS_AUTO_REFRESH: 'false' } });
      assert.equal(r.code, 0, r.erreurs.slice(-3000));
      assert.equal(r.reseau, false, 'aucun appel réseau');
      assert.equal(r.json.coupureActive, actif, 'la copie tourne dans le mode demandé');
      memo.set(cle, r.json);
    } finally {
      copie.nettoyer();
    }
  }
  return memo.get(cle);
}

// ------------------------------------------------------------ des cas fabriqués

/** Un cas réglé, à la forme de casDesAnalyses. */
function cas({ i, type = 'totalGoals', verdict = 'confirme', realise = true, p = 0.6, league = 'EPL', fiche = 'compacte', confiance = 'moyenne', cloture = null }) {
  const tenu = verdict ? avisTenu(verdict, realise) : null;
  return {
    bloc: `m${i}`,
    cle: `m${i}|${type}`,
    date: '2026-10-01',
    league,
    type,
    fiche,
    verdict,
    confiance,
    realise,
    p,
    tenu,
    gains: tenu === null ? null : S.gainsDeLAvis({ p, realise, verdict }),
    clotureEligible: S.TYPES_AVEC_CLOTURE.includes(type) && tenu !== null,
    cloture,
    raisonCloture: null
  };
}
const JUGE_RAPIDE = Object.freeze({ ...S.JUGE_DU_CARNET, tirages: 400 });

// ============================================================ 1. l'avis tenu

test('l’avis tenu : confirmer un pronostic réalisé ou contredire un pronostic raté, c’est avoir eu raison ; « nuance », un avis absent ou une issue inconnue ne comptent jamais ; l’expérience de l’IA garde ses clés et leur ordre', () => {
  assert.equal(avisTenu('confirme', true), true);
  assert.equal(avisTenu('confirme', false), false);
  assert.equal(avisTenu('contredit', false), true);
  assert.equal(avisTenu('contredit', true), false);
  for (const juste of [true, false, null, undefined]) {
    assert.equal(avisTenu('nuance', juste), null);
    assert.equal(avisTenu(null, juste), null);
    assert.equal(avisTenu('autre', juste), null);
  }
  assert.equal(avisTenu('confirme', null), null);
  assert.equal(avisTenu('contredit', undefined), null);
  assert.equal(avisTenu('confirme', 'juste'), null, 'jamais un texte pris pour vrai');
  // Les bilans de l'expérience (aiMarketExperience) et du carnet : mêmes clés, même ordre qu'avant l'étape (l'ancienne fiche les recopie en JSON).
  const t = { ...bilanVide('result'), recentLessons: [] };
  assert.deepEqual(Object.keys(t), ['marketType', 'label', 'matches', 'engineRight', 'aiVerdicts', 'aiRight', 'byConfidence', 'recentLessons']);
  assert.equal(t.label, 'Résultat');
  compterAuBilan(t, { outcome: 'juste', aiWasRight: true, aiConfidence: 'forte' });
  compterAuBilan(t, { outcome: 'faux', aiWasRight: false, aiConfidence: 'forte' });
  compterAuBilan(t, { outcome: 'faux', aiWasRight: null, aiConfidence: 'faible' });
  compterAuBilan(t, { outcome: 'indéterminé', aiWasRight: true, aiConfidence: null });
  assert.deepEqual([t.matches, t.engineRight, t.aiVerdicts, t.aiRight, t.byConfidence], [3, 1, 3, 2, { forte: { verdicts: 2, right: 1 } }]);
  assert.deepEqual(Object.keys(TYPES_DE_MARCHE), ['result', 'totalGoals', 'bothTeamsScore', 'resultAndTotal', 'teamGoals', 'totalCorners', 'teamCorners', 'totalShots', 'teamShots', 'totalShotsOnTarget', 'teamShotsOnTarget']);
});

// ============================================================ 2. « nuance »

test('« nuance » n’est jamais comptée : ni dans les avis tenus, ni face au moteur seul, ni à la clôture — seulement dans le nombre d’avis donnés', () => {
  assert.equal(S.gainsDeLAvis({ p: 0.6, realise: true, verdict: 'nuance' }), null);
  assert.equal(S.clotureDeLAvis({ q: 0.5, c: 0.6, verdict: 'nuance' }), null);
  const liste = [cas({ i: 1, verdict: 'nuance', realise: true }), cas({ i: 2, verdict: 'nuance', realise: false }), cas({ i: 3, verdict: 'confirme', realise: true }), cas({ i: 4, verdict: null, realise: false })];
  const c = S.carnetDesCas(liste, { juge: JUGE_RAPIDE });
  const t = c.types.find((x) => x.marketType === 'totalGoals');
  assert.deepEqual(t.avis, { confirme: 1, nuance: 2, contredit: 0, aucun: 1 });
  assert.deepEqual([t.bilan.aiVerdicts, t.bilan.aiRight, t.bilan.matches, t.bilan.engineRight], [1, 1, 4, 2]);
  assert.equal(t.matchsJuges, 1, 'un seul match a un avis compté');
  assert.equal(t.juge.issue.lignes, 1, 'une seule ligne pour le juge');
  assert.equal(t.cloture.eligibles, 1);
  assert.equal(c.total.avis.nuance, 2);
  // Pour information seulement : ce que le moteur annonçait et ce qui est arrivé, selon l'avis (la nuance comprise).
  const sansJuge = ({ juge, ...a }) => a;
  assert.deepEqual(sansJuge(t.annonces.nuance), { n: 2, annonce: 0.6, realise: 0.5 });
  assert.deepEqual(sansJuge(t.annonces.confirme), { n: 1, annonce: 0.6, realise: 1 });
  assert.deepEqual(t.annonces.contredit, { n: 0, annonce: null, realise: null });
  assert.equal(t.annonces.contredit.juge, undefined, 'pas de juge pour les « contredit » : trop rares');
  assert.equal(t.annonces.nuance.juge.verdict, 'pas-assez-de-matchs');
  // Le juge « réalisé face à annoncé » : 220 matchs où l'IA nuance des pronostics à 60 % qui n'arrivent que 3 fois
  // sur 10, 220 où elle confirme des pronostics à 60 % qui arrivent 6 fois sur 10 — pour information seulement.
  const nuancesFab = Array.from({ length: 220 }, (_, i) => cas({ i, type: 'result', verdict: 'nuance', realise: i % 10 < 3, p: 0.6 }));
  const confirmesFab = Array.from({ length: 220 }, (_, i) => cas({ i: 1000 + i, type: 'result', verdict: 'confirme', realise: i % 5 < 3, p: 0.6 }));
  const cn = S.carnetDesCas([...nuancesFab, ...confirmesFab], { juge: JUGE_RAPIDE });
  const r = cn.types.find((x) => x.marketType === 'result');
  assert.deepEqual([r.annonces.nuance.n, r.annonces.nuance.juge.verdict, r.annonces.nuance.juge.matchs], [220, 'moins-bon', 220]);
  assert.ok(Math.abs(r.annonces.nuance.juge.ecart - (0.3 - 0.6)) < 1e-9, 'l’écart réalisé − annoncé');
  assert.equal(r.annonces.confirme.juge.verdict, 'pas-prouve');
  assert.equal(cn.juge.variantesAnnonce, 4, 'quatre cases jugées ensemble : résultat et tous les marchés, confirme et nuance');
  assert.equal(r.annonces.nuance.juge.variantes, 4);
  const direct = comparer(nuancesFab.map((k) => ({ bloc: k.bloc, match: k.bloc, cle: k.cle, a: k.p, b: k.realise ? 1 : 0 })), { mode: 'moyenne', sens: 'max', tirages: JUGE_RAPIDE.tirages, graine: JUGE_RAPIDE.graine, variantes: 4, alpha: 0.05, minBlocs: 200 });
  assert.deepEqual([r.annonces.nuance.juge.verdict, r.annonces.nuance.juge.ecart, r.annonces.nuance.juge.fourchette], [direct.verdict, direct.gain, direct.fourchette]);
  assert.deepEqual(cn.total.annonces.nuance.juge.verdict, 'moins-bon');
  // Rien n'en dépend : la nuance n'est ni tenue, ni comptée face au moteur, ni pour la coupure.
  assert.deepEqual([r.bilan.aiVerdicts, r.juge.issue.lignes], [220, 220], 'seuls les 220 avis « confirme » sont comptés');
  // Dans la copie : les pièges donnent leurs « nuance » aux bons comptes, jamais aux tenus.
  const s = phase('tout');
  const nuancesAttendues = s.attendus.filter((a) => a.verdict === 'nuance' && a.realise !== undefined).length;
  assert.equal(s.carnet.total.avis.nuance, nuancesAttendues);
  assert.equal(s.carnet.total.avis.aucun, 1, 'un marché sans avis (composition) : compté « aucun », jamais un avis');
  const nuances = s.attendus.filter((a) => a.verdict === 'nuance' && a.realise !== undefined);
  assert.equal(s.carnet.total.annonces.nuance.n, nuances.length);
  assert.ok(Math.abs(s.carnet.total.annonces.nuance.realise - nuances.filter((a) => a.realise).length / nuances.length) < 1e-12);
  assert.ok(Math.abs(s.carnet.total.annonces.nuance.annonce - nuances.reduce((t, a) => t + 1 / a.predictedOdds, 0) / nuances.length) < 1e-12);
  assert.ok(s.cas.filter((k) => k.verdict === 'nuance').every((k) => k.tenu === null && k.gains === null && k.cloture === null));
});

// ============================================================ 3. le rattachement

test('rattachement par identifiants FotMob : la composition, puis le gel, puis l’annuaire ; deux sources contradictoires écartent l’avis ; jamais par le rapprocheur de noms souple (« Leeds United » n’est pas DC United)', () => {
  const composition = { home: 'fotmob-1', away: 'fotmob-2' };
  assert.deepEqual(S.identifiantsDeLAnalyse({ composition, gel: [], annuaire: { home: null, away: null } }), { homeId: 'fotmob-1', awayId: 'fotmob-2', sources: { home: 'composition', away: 'composition' } });
  assert.deepEqual(S.identifiantsDeLAnalyse({ gel: [{ home: 'fotmob-1', away: 'fotmob-2' }], annuaire: { home: 'fotmob-1', away: null } }).sources, { home: 'gel', away: 'gel' });
  assert.deepEqual(S.identifiantsDeLAnalyse({ composition: { home: 'fotmob-1', away: null }, annuaire: { home: null, away: 'fotmob-2' } }), { homeId: 'fotmob-1', awayId: 'fotmob-2', sources: { home: 'composition', away: 'annuaire' } });
  assert.deepEqual(S.identifiantsDeLAnalyse({ composition, gel: [{ home: 'fotmob-1', away: 'fotmob-9' }] }), { raison: 'identifiantsContradictoires' });
  assert.deepEqual(S.identifiantsDeLAnalyse({ composition, annuaire: { home: 'fotmob-7', away: 'fotmob-2' } }), { raison: 'identifiantsContradictoires' });
  assert.deepEqual(S.identifiantsDeLAnalyse({ gel: [{ home: 'fotmob-1', away: 'fotmob-2' }, { home: 'fotmob-1', away: 'fotmob-3' }] }), { raison: 'identifiantsContradictoires' }, 'deux gels de clubs différents');
  assert.deepEqual(S.identifiantsDeLAnalyse({ annuaire: { home: 'fotmob-1', away: null } }), { raison: 'sansIdentifiant' });
  assert.deepEqual(S.identifiantsDeLAnalyse({ annuaire: { home: 'fotmob-1', away: 'fotmob-1' } }), { raison: 'identifiantsContradictoires' }, 'un club contre lui-même');
  assert.deepEqual(S.identifiantsDeLaComposition({ source: 'magasin', home: { teamId: 'fotmob-5' }, away: null }), { home: 'fotmob-5', away: null });
  assert.equal(S.identifiantsDeLaComposition(null), null);

  const s = phase('tout');
  const blocs = new Set(s.cas.map((k) => k.bloc));
  // Les trois sources rattachent chacune SA rencontre, même sous des noms que l'annuaire ne connaît pas (gel).
  for (const p of ['composition', 'gel', 'annuaire']) assert.ok(blocs.has(s.plantes[p].matchKey), `${p} : rattaché`);
  // Le piège du rapprocheur souple : il confond « Leeds United » et DC United ; le carnet, jamais.
  assert.equal(s.pieges.leedsRessembleADcUnited, true, 'le piège est réel : le rapprocheur souple les confond');
  assert.ok(!s.casCles.some((c) => c.startsWith(`${s.plantes.dcUnited.matchKey}|`)), 'aucun avis donné au match de DC United');
  assert.ok(!blocs.has(s.plantes.dcUnited.matchKey));
  assert.ok(!s.casCles.some((c) => c.startsWith('null|')));
});

// ============================================================ 4. le règlement des pièges

test('règlement des pièges, avis par avis, face au second chemin : attribué, prolongé (le 1-1 de la 90e, corners non réglables), corners 0-0, analyse après le coup d’envoi, à venir, deux analyses d’un match, avant la règle du 30/09, sans pronostics, sans date — chaque écarté compté', () => {
  const s = phase('tout');
  const parCle = new Map(s.cas.map((k) => [`${k.bloc}|${k.cle.split('|')[1]}`, k]));
  let reglees = 0;
  for (const a of s.attendus.filter((x) => x.piege !== 'volume')) {
    const k = parCle.get(`${a.matchKey}|${a.marketId === 'teamCorners' ? 'teamCorners:home' : a.marketId}`);
    if (a.raison) {
      assert.equal(k, undefined, `${a.piege} ${a.marketId} : écarté (${a.raison})`);
      continue;
    }
    assert.ok(k, `${a.piege} ${a.marketId} : réglé`);
    assert.deepEqual([k.realise, k.tenu, k.verdict, k.confiance], [a.realise, a.tenu, a.verdict, a.confiance], `${a.piege} ${a.marketId}`);
    reglees++;
  }
  assert.ok(reglees >= 30, `${reglees} avis réglés`);
  // Le prolongé : le Résultat réglé sur le 1-1 de la 90e (pas le 2-1 final), les corners non réglables.
  const prol = s.cas.filter((k) => k.bloc === s.plantes.prolonge.matchKey);
  assert.deepEqual(prol.map((k) => [k.type, k.realise]), [['result', false], ['totalGoals', false], ['bothTeamsScore', true]]);
  // Chaque écarté, compté (4 pronostics par analyse-piège).
  const e = Object.fromEntries(s.carnet.ecartes.map((x) => [x.raison, x.n]));
  assert.deepEqual(e, {
    apresCoupDEnvoi: 4,
    attribue: 4,
    avantLaRegle: 4,
    aVenir: 4,
    doublon: 4,
    identifiantsContradictoires: 4,
    sansDate: 4,
    sansPronostics: 4,
    sansResultat: 4,
    prolongationStats: 1,
    statNonRelevee: 1
  });
  for (const x of s.carnet.ecartes) assert.ok(x.libelle && x.libelle !== x.raison, `${x.raison} : sa phrase`);
  // Deux analyses du même match : celle d'avant le coup d'envoi la plus récente compte, une seule fois.
  assert.equal(s.cas.filter((k) => k.bloc === s.plantes.doublon.matchKey).length, s.attendus.filter((a) => a.piege === 'doublon' && !a.raison).length);
  assert.ok(!s.attendus.some((a) => a.piege === 'doublonAncienne'), 'l’ancienne analyse du match n’est jamais comptée');
  assert.deepEqual(s.carnet.analyses, { lues: 248, avecAvis: 248, reglees: 240, aVenir: 1 });
  assert.equal(s.rejeuIdentique, true, 'deux calculs : au bit près');
});

// ============================================================ 5. la clôture

test('clôture : la probabilité juste du marché à l’heure de l’analyse face à la clôture (removeMargin à la main) — confirmer suit le pronostic, contredire l’issue contraire ; « dans son sens » ; seuls le 1N2, le plus/moins et les deux marquent', () => {
  // Règle pure.
  const conf = S.clotureDeLAvis({ q: 0.5, c: 0.55, verdict: 'confirme' });
  assert.ok(Math.abs(conf.a - 0.1) < 1e-12 && conf.b === conf.a && conf.sens === 1);
  const contre = S.clotureDeLAvis({ q: 0.5, c: 0.55, verdict: 'contredit' });
  assert.ok(Math.abs(contre.b - (0.45 / 0.5 - 1)) < 1e-12 && Math.abs(contre.a - 0.1) < 1e-12 && contre.sens === -1);
  assert.equal(S.clotureDeLAvis({ q: 0.4, c: 0.4, verdict: 'contredit' }).sens, 0);
  assert.equal(S.clotureDeLAvis({ q: 0, c: 0.4, verdict: 'confirme' }), null);
  assert.equal(S.clotureDeLAvis({ q: 0.4, c: 1, verdict: 'confirme' }), null);
  assert.deepEqual(S.TYPES_AVEC_CLOTURE, ['result', 'totalGoals', 'bothTeamsScore']);
  // Dans la copie : trois matchs cotés, avis par avis.
  const s = phase('tout');
  const proba = (prix, issue) => {
    const cles = Object.keys(prix);
    return removeMargin(cles.map((k) => prix[k])).probabilities[cles.indexOf(issue)];
  };
  const marches = [
    ['result', '1x2', 'home'],
    ['totalGoals', 'ou', 'over'],
    ['bothTeamsScore', 'btts', 'yes']
  ];
  let mesures = 0;
  for (const c of s.cotes) {
    marches.forEach(([type, marche, issue], i) => {
      const k = s.cas.find((x) => x.bloc === c.matchKey && x.type === type);
      const verdict = c.verdicts[i];
      if (verdict === 'nuance') {
        assert.equal(k.cloture, null, `${c.piege} ${type} : nuance, pas de clôture`);
        return;
      }
      const q = proba(c.prix[marche].snapshot, issue);
      const cl = proba(c.prix[marche].close, issue);
      const attendu = verdict === 'confirme' ? cl / q - 1 : (1 - cl) / (1 - q) - 1;
      assert.ok(Math.abs(k.cloture.b - attendu) < 1e-9, `${c.piege} ${type} : ${k.cloture.b} ≠ ${attendu}`);
      assert.ok(Math.abs(k.cloture.a - (cl / q - 1)) < 1e-9, 'le moteur seul : son pronostic');
      assert.equal(k.cloture.sens, Math.sign(cl - q) * (verdict === 'confirme' ? 1 : -1));
      assert.equal(k.cloture.approx, false, 'un relevé daté avant l’analyse : pas l’ouverture');
      mesures++;
    });
  }
  assert.equal(mesures, 6);
  const parType = Object.fromEntries(s.carnet.types.map((t) => [t.marketType, t]));
  assert.equal(parType.result.cloture.mesures + parType.totalGoals.cloture.mesures + parType.bothTeamsScore.cloture.mesures, 6);
  for (const t of ['teamCorners', 'totalCorners', 'totalShots']) assert.equal(parType[t].cloture.mesures, 0, `${t} : pas de cote gratuite`);
  // Seuls les avis COMPTÉS d'un marché coté sont mesurés à la clôture : chacun mesuré, ou sa raison dite.
  for (const t of S.TYPES_AVEC_CLOTURE) {
    const c = parType[t].cloture;
    assert.equal(c.eligibles, s.cas.filter((k) => k.type === t && k.tenu !== null).length, `${t} : les avis comptés, jamais les nuances`);
    assert.equal(c.mesures + c.raisons.reduce((n, r) => n + r.n, 0), c.eligibles, `${t} : chaque avis compté mesuré ou sa raison`);
    for (const r of c.raisons) assert.ok(r.libelle && r.libelle !== r.raison, `${t} : la phrase de « ${r.raison} »`);
  }
  const total = s.carnet.total.cloture;
  assert.equal(total.dansSonSens + total.contre + total.immobile, total.mesures);
});

// ============================================================ 6. face au moteur seul

test('face au moteur seul : à mise fixe et à la cote juste du moteur, sur les MÊMES avis — le moteur joue toujours son pronostic, suivre l’IA joue l’issue contraire quand elle contredit ; le juge de l’étape 16, fourchette élargie pour les types jugés ensemble', () => {
  // Règle pure : un avis qui confirme ne change rien ; contredire paie l'issue contraire à sa cote juste.
  assert.deepEqual(S.gainsDeLAvis({ p: 0.5, realise: true, verdict: 'confirme' }), { a: 1, b: 1 });
  assert.deepEqual(S.gainsDeLAvis({ p: 0.5, realise: false, verdict: 'confirme' }), { a: -1, b: -1 });
  assert.deepEqual(S.gainsDeLAvis({ p: 0.8, realise: false, verdict: 'contredit' }), { a: -1, b: 1 / (1 - 0.8) - 1 });
  assert.deepEqual(S.gainsDeLAvis({ p: 0.8, realise: true, verdict: 'contredit' }), { a: 1 / 0.8 - 1, b: -1 });
  assert.equal(S.gainsDeLAvis({ p: null, realise: true, verdict: 'confirme' }), null);
  assert.equal(S.gainsDeLAvis({ p: 0.5, realise: null, verdict: 'confirme' }), null);
  // Un avis qui ne sait rien (contredire au hasard, l'issue tirée selon la probabilité du moteur) ne gagne rien en moyenne.
  const u = generateur(5);
  let somme = 0;
  const n = 40_000;
  for (let i = 0; i < n; i++) {
    const p = 0.3 + 0.5 * u();
    const g = S.gainsDeLAvis({ p, realise: u() < p, verdict: 'contredit' });
    somme += g.b - g.a;
  }
  assert.ok(Math.abs(somme / n) < 0.03, `un avis au hasard : ${somme / n} en moyenne`);
  // Les lignes du juge : celles des avis comptés, a = moteur seul, b = l'IA ; le même verdict qu'un appel direct.
  const liste = [];
  for (let i = 0; i < 260; i++) liste.push(cas({ i, type: 'totalShots', verdict: i % 5 === 0 ? 'contredit' : 'confirme', realise: i % 3 !== 0, p: 0.62 }));
  for (let i = 0; i < 230; i++) liste.push(cas({ i: 1000 + i, type: 'totalCorners', verdict: 'confirme', realise: i % 2 === 0, p: 0.55 }));
  for (let i = 0; i < 50; i++) liste.push(cas({ i: 2000 + i, type: 'result', verdict: 'contredit', realise: false, p: 0.45 }));
  const c = S.carnetDesCas(liste, { juge: JUGE_RAPIDE });
  const t = c.types.find((x) => x.marketType === 'totalShots');
  const direct = comparer(
    liste.filter((k) => k.type === 'totalShots').map((k) => ({ bloc: k.bloc, match: k.bloc, cle: k.cle, ...k.gains })),
    { mode: 'moyenne', sens: 'max', tirages: JUGE_RAPIDE.tirages, graine: JUGE_RAPIDE.graine, variantes: 2, alpha: 0.05, minBlocs: 200 }
  );
  assert.equal(c.juge.variantesIssue, 2, 'deux types jugeables (200 matchs ou plus) : jugés ensemble');
  assert.deepEqual([t.juge.issue.verdict, t.juge.issue.gain, t.juge.issue.fourchette, t.juge.issue.variantes], [direct.verdict, direct.gain, direct.fourchette, 2]);
  assert.equal(t.moteurJusteSurLesAvis, liste.filter((k) => k.type === 'totalShots' && k.realise).length);
  // Toujours d'accord avec le moteur : exactement zéro, quelle que soit l'issue.
  const corners = c.types.find((x) => x.marketType === 'totalCorners');
  assert.deepEqual([corners.juge.issue.gain, corners.juge.issue.fourchette], [0, [0, 0]]);
  // Dans la copie : l'IA toujours d'accord (corners), toujours juste (tirs), toujours fausse (tirs cadrés), 230 matchs chacun.
  const s = phase('tout');
  const v = Object.fromEntries(s.carnet.types.map((x) => [x.marketType, x]));
  assert.deepEqual([v.totalCorners.juge.issue.verdict, v.totalShots.juge.issue.verdict, v.totalShotsOnTarget.juge.issue.verdict], ['pas-prouve', 'retenu', 'moins-bon']);
  assert.deepEqual([v.totalCorners.matchsJuges, v.totalShots.matchsJuges, v.totalShotsOnTarget.matchsJuges], [230, 230, 230]);
  assert.equal(s.carnet.juge.variantesIssue, 3);
  assert.equal(v.totalShots.bilan.aiRight, 230, 'l’avis toujours juste');
  assert.equal(v.totalShotsOnTarget.bilan.aiRight, 0, 'l’avis toujours faux');
});

// ============================================================ 7. la coupure, sur preuve, et désactivée

test('coupure DÉSACTIVÉE tant que Pierre n’a pas décidé (COUPURE_ACTIVE = false) : la règle dit ce qu’elle ferait (« serait retiré »), rien n’est retiré ; activée dans le test, seulement sur preuve — jamais sous le seuil (199 matchs d’accord avec le moteur : « trop tôt »), coupé à 200 (« pas prouvé ») et sur « moins bon », gardé sur « retenu », à l’issue ou à la clôture', () => {
  assert.equal(S.COUPURE_ACTIVE, false, 'désactivée par défaut, tant que Pierre n’a pas décidé de la règle');
  assert.equal(S.SEUIL_MATCHS_POUR_COUPER, 200);
  assert.equal(S.JUGE_DU_CARNET.minBlocs, S.SEUIL_MATCHS_POUR_COUPER, 'le juge ne conclut pas sous le seuil');
  assert.equal(S.DECISION_EN_ATTENTE, 'Aucun marché n’est retiré pour l’instant : c’est à vous de décider de la règle.');
  const j = (verdict, matchs) => ({ verdict, matchs });
  assert.equal(S.decisionDuType({ issue: null }), 'aucun');
  assert.equal(S.decisionDuType({ issue: j('pas-assez-de-matchs', 199) }), 'tropTot');
  assert.equal(S.decisionDuType({ issue: j('pas-prouve', 150) }), 'tropTot', 'même un « pas prouvé » sous le seuil ne coupe pas');
  assert.equal(S.decisionDuType({ issue: j('moins-bon', 199) }), 'tropTot');
  assert.equal(S.decisionDuType({ issue: j('pas-prouve', 200) }), 'coupe');
  assert.equal(S.decisionDuType({ issue: j('moins-bon', 250) }), 'coupe');
  assert.equal(S.decisionDuType({ issue: j('retenu', 250) }), 'garde');
  assert.equal(S.decisionDuType({ issue: j('pas-prouve', 400), cloture: j('retenu', 300) }), 'garde', 'la clôture prouve un apport : gardé');
  assert.equal(S.decisionDuType({ issue: j('pas-prouve', 400), cloture: j('pas-prouve', 300) }), 'coupe');
  assert.equal(S.decisionDuType({ issue: j('pas-prouve', 300), seuil: 400 }), 'tropTot');
  // De bout en bout, sur des cas fabriqués : 199 puis 200 matchs où l'IA confirme tout — la coupure ACTIVÉE.
  const ACTIF = { juge: JUGE_RAPIDE, coupureActive: true };
  const accord = (nb) => Array.from({ length: nb }, (_, i) => cas({ i, type: 'teamShots', verdict: 'confirme', realise: i % 3 !== 0, p: 0.6 }));
  const c199 = S.carnetDesCas(accord(199), ACTIF);
  assert.deepEqual([c199.types[0].etat, c199.coupes, c199.seraientRetires], ['tropTot', [], []]);
  assert.equal(c199.types[0].etiquette, 'trop tôt pour juger : elle commente');
  const c200 = S.carnetDesCas(accord(200), ACTIF);
  assert.deepEqual([c200.coupureActive, c200.types[0].etat, c200.types[0].retire, c200.coupes], [true, 'coupe', true, ['teamShots']]);
  assert.equal(c200.types[0].etiquette, 'l’IA n’apporte rien ici, elle ne commente plus');
  // La même règle, la coupure DÉSACTIVÉE (le défaut) : elle dit ce qu'elle ferait, rien n'est retiré.
  const d200 = S.carnetDesCas(accord(200), { juge: JUGE_RAPIDE });
  assert.deepEqual([d200.coupureActive, d200.types[0].etat, d200.types[0].retire, d200.coupes, d200.seraientRetires], [false, 'coupe', false, [], ['teamShots']]);
  assert.equal(d200.types[0].etiquette, 'serait retiré : l’IA n’apporte rien ici');
  // L'IA sait quelque chose : elle contredit les pronostics qui ratent → gardée.
  const sait = Array.from({ length: 220 }, (_, i) => cas({ i, type: 'teamShots', verdict: i % 4 === 0 ? 'contredit' : 'confirme', realise: i % 4 !== 0, p: 0.6 }));
  assert.equal(S.carnetDesCas(sait, ACTIF).types[0].etat, 'garde');
  // La clôture prouve un apport sur un marché coté : gardé malgré l'issue.
  const cote = Array.from({ length: 220 }, (_, i) => cas({ i, type: 'result', verdict: i % 2 ? 'contredit' : 'confirme', realise: i % 4 < 2, p: 0.5, cloture: i % 2 ? { ...S.clotureDeLAvis({ q: 0.5, c: 0.4, verdict: 'contredit' }), approx: false } : { ...S.clotureDeLAvis({ q: 0.5, c: 0.5, verdict: 'confirme' }), approx: false } }));
  const cc = S.carnetDesCas(cote, ACTIF);
  assert.equal(cc.types[0].juge.cloture.verdict, 'retenu');
  assert.equal(cc.types[0].etat, 'garde');
  // Dans une copie où la coupure est ACTIVÉE : les corners (sans apport) et les tirs cadrés (moins bon) coupés, les tirs (retenu) gardés, les pièges trop maigres jamais.
  const a = phase('tout', { actif: true });
  assert.deepEqual([a.carnet.coupureActive, a.carnet.coupes], [true, ['totalCorners', 'totalShotsOnTarget']]);
  const etats = Object.fromEntries(a.carnet.types.map((x) => [x.marketType, x.etat]));
  assert.deepEqual(etats, { result: 'tropTot', totalGoals: 'tropTot', bothTeamsScore: 'tropTot', teamCorners: 'tropTot', totalCorners: 'coupe', totalShots: 'garde', totalShotsOnTarget: 'coupe' });
  assert.ok(a.carnet.parChampionnat.filter((l) => l.marketType === 'totalCorners').every((l) => l.etat === 'coupe' && l.retire === true), 'l’étiquette sur chaque championnat du marché coupé');
  // Le code du bac (coupure désactivée) : la même règle, rien de retiré, ce qu'elle ferait dit.
  const d = phase('tout');
  assert.deepEqual([d.carnet.coupureActive, d.carnet.coupes, d.carnet.seraientRetires], [false, [], ['totalCorners', 'totalShotsOnTarget']]);
  assert.deepEqual(
    d.carnet.types.filter((x) => x.etat === 'coupe').map((x) => [x.marketType, x.retire, x.etiquette]),
    [
      ['totalCorners', false, 'serait retiré : l’IA n’apporte rien ici'],
      ['totalShotsOnTarget', false, 'serait retiré : l’IA n’apporte rien ici']
    ]
  );
  assert.ok(d.carnet.parChampionnat.every((l) => l.retire === false));
  assert.deepEqual(d.coupesApres, [], 'l’analyse ne lit aucun marché coupé');
  // Les deux modes : le même carnet, à la coupure près.
  const sansCoupure = (c) => JSON.stringify({ ...c, calculeLe: null, coupureActive: null, coupes: null, types: c.types.map(({ retire, etiquette, ...t }) => t), parChampionnat: c.parChampionnat.map(({ retire, ...l }) => l) });
  assert.equal(sansCoupure(d.carnet), sansCoupure(a.carnet));
});

// ============================================================ 8. l'étape de la nuit

test('l’étape « carnetIA » : après la sauvegarde, avant le contrôle quotidien (toujours dernier) ; le carnet refait et écrit d’un bloc ; la base seulement lue ; coupure désactivée : « aucun marché retiré » et ce que la règle retirerait ; activée : « nouveau cette nuit » la première fois seulement', () => {
  const s = phase('tout');
  const i = s.etapes.indexOf('carnetIA');
  // Étape 28 (27/10/2026) : la simulation complète (fins de saison, puis déroulé des matchs) s'intercale entre la sauvegarde
  // et le carnet ; le carnet reste après la sauvegarde.
  assert.deepEqual(s.etapes.slice(i - 3, i), ['sauvegarde', 'simulationSaisons', 'simulationMatchs']);
  // Étape 42 (22/10/2026) : le bulletin du jour et le bilan de la semaine (deux textes de l'IA, dont le bilan lit CE carnet refait
  // cette nuit) s'intercalent entre le carnet et le contrôle quotidien, qui reste le dernier. Étape 44 (23/10/2026) : la mémoire de
  // l'IA (ses leçons ne se confirment que par CE carnet, dont elle reprend les cas) le suit immédiatement. Étape 26 (partie D, 28/10/2026) :
  // le résumé du mois de la boucle de correction (un texte de l'IA, une fois par mois) suit le bilan de la semaine.
  assert.deepEqual(s.etapes.slice(i + 1), ['dossiersIA', 'bulletin', 'bilanSemaine', 'resumeCorrection', 'controleQuotidien']);
  assert.equal(s.etapes.at(-1), 'controleQuotidien');
  assert.equal(s.etapes.filter((k) => k === 'carnetIA').length, 1);
  assert.equal(s.ecrituresDuCalcul, 0, 'le calcul n’écrit rien dans la base');
  assert.equal(s.ecrituresEtape, 0, 'l’étape non plus');
  // La coupure désactivée (le code du bac).
  assert.equal(s.etape.status, 'ok', 'rien de retiré : rien à regarder');
  assert.match(
    s.etape.summary,
    /^240 matchs analysés et joués : 716 avis comptés, 394 tenus \(55 %\), 7 avis nuancés jamais comptés ; aucun marché retiré de sa liste : la coupure est désactivée tant que Pierre n'a pas décidé de la règle \(la règle retirerait : Total corners, Total tirs cadrés\) ; en .* \(le serveur jamais tenu plus de \d+ ms d'affilée\)\. Aucun appel à Claude\. Le détail est dans Historique moteur › Carnet de l'IA\.$/
  );
  assert.deepEqual([s.coupesAvant, s.coupesApres], [[], []]);
  assert.deepEqual(s.etape.details.seraientRetires, ['totalCorners', 'totalShotsOnTarget']);
  assert.equal(s.etape.changed, false);
  assert.deepEqual({ ...s.fichier, calculeLe: null }, { ...s.carnet, calculeLe: null }, 'le fichier est le carnet');
  assert.equal(s.fichier.version, S.VERSION_CARNET);
  assert.equal(s.fichier.seuil, S.SEUIL_MATCHS_POUR_COUPER);
  assert.equal(s.fichier.coupureActive, false);
  assert.deepEqual(s.fichier.typeArgument, { disponible: false, phrase: 'Type d’argument : à ajouter au prompt, décision de Pierre.', pourquoi: S.TYPE_ARGUMENT.pourquoi });
  // La coupure activée dans la copie : deux marchés retirés cette nuit, puis rien de nouveau.
  const a = phase('tout', { actif: true });
  assert.equal(a.etape.status, 'warn', 'deux marchés retirés cette nuit : à regarder');
  assert.match(
    a.etape.summary,
    /^240 matchs analysés et joués : 716 avis comptés, 394 tenus \(55 %\), 7 avis nuancés jamais comptés ; 2 marchés retirés de sa liste \(Total corners, Total tirs cadrés\) — nouveau cette nuit : Total corners, Total tirs cadrés, retirés dès la prochaine analyse ; en .* \(le serveur jamais tenu plus de \d+ ms d'affilée\)\. Aucun appel à Claude\. Le détail est dans Historique moteur › Carnet de l'IA\.$/
  );
  assert.deepEqual([a.coupesAvant, a.coupesApres], [[], ['totalCorners', 'totalShotsOnTarget']]);
  assert.equal(a.etape2.status, 'ok', 'la nuit suivante, rien de nouveau');
  assert.doesNotMatch(a.etape2.summary, /nouveau cette nuit/);
});

// ============================================================ 9. le filtre de la fiche compacte

test('le filtre (curateEngineSummary) : coupure désactivée, la fiche compacte reste celle d’avant à l’octet (0 token de différence) même avec un carnet qui liste des marchés à couper ; activée dans le test, elle ne reçoit plus les marchés coupés ni leur bilan, UNE ligne le dit, les consignes fixes ne bougent pas ; la liste gardée avec l’analyse ; la revue ne redonne pas à juger', () => {
  const ref = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'fiche-ia-etape-21.json'), 'utf8'));
  const avant = ref.sans.avant.compacte;
  // La coupure désactivée (le code du bac) : un carnet écrit « coupure active », listant deux types, ne retire rien.
  const d = phase('fiches');
  assert.deepEqual(d.coupesLues, []);
  assert.equal(d.avec.avant.compacte.system, avant.system);
  assert.equal(d.avec.avant.compacte.user, avant.user, 'la fiche compacte d’avant, à l’octet : 0 token de différence');
  assert.deepEqual(d.avec.avant.compacte.marches, avant.marches);
  assert.deepEqual(d.avec.avant.compacte.marchesRetires, []);
  assert.deepEqual(d.enregistree, { avecCoupe: null, fichierAvecCoupe: null, apres: 'absent', appels: 2 }, 'rien de retiré : rien gardé avec l’analyse');
  // La coupure activée dans la copie.
  const f = phase('fiches', { actif: true });
  assert.deepEqual(f.coupesLues, ['totalCorners', 'teamCorners']);
  const avec = f.avec.avant.compacte;
  assert.equal(avec.system, avant.system, 'les consignes fixes, à l’octet');
  assert.deepEqual(avec.marches, ['Résultat', 'Total buts', 'Les 2 équipes marquent', 'Total tirs']);
  assert.deepEqual(avec.marchesRetires, ['totalCorners', 'teamCorners']);
  const la = avant.user.split('\n');
  const lb = avec.user.split('\n');
  const retirees = la.filter((l) => !lb.includes(l));
  const ajoutees = lb.filter((l) => !la.includes(l));
  assert.deepEqual(ajoutees, [
    '## marketPredictions — 4 pronostic(s) du moteur (minOdds 1,2) : un avis par ligne, dans cet ordre',
    'Retirés de ta liste : Total corners · Corners d’une équipe — ton carnet montre que, sur assez de matchs, tes avis n’y font pas mieux que le moteur seul.'.replace(/’/g, "'"),
    'Matchs des leçons : [a] Passé 1 A - Passé 1 B'
  ]);
  assert.deepEqual(retirees, [
    '## marketPredictions — 7 pronostic(s) du moteur (minOdds 1,2) : un avis par ligne, dans cet ordre',
    'Total corners | Plus de 8.5 corners | 66 % | 1,52',
    'Corners — Everton | Everton — Plus de 3.5 corners | 74 % | 1,36',
    'Corners — Man United | Man United — Plus de 3.5 corners | 68 % | 1,48',
    'Matchs des leçons : [a] Passé 1 A - Passé 1 B · [b] Passé 2 A - Passé 2 B · [c] Passé 3 A - Passé 3 B',
    'Total corners : moteur 0/1 · tes avis 0/1 (moyenne 0/1)',
    '- [b] essai · faux · confirme : Leçon 2 sur Total corners.',
    "Corners d'une équipe : moteur 1/1 · tes avis 1/1 (moyenne 1/1)",
    '- [c] essai · juste · confirme : Leçon 3 sur Corners — Passé 3 A.'
  ]);
  // La ligne, juste sous le tableau des marchés, une seule fois.
  const iRetires = lb.findIndex((l) => l.startsWith('Retirés de ta liste'));
  assert.equal(lb[iRetires - 1], 'Total tirs | Plus de 22.5 tirs | 71 % | 1,4');
  assert.equal(lb.filter((l) => l.startsWith('Retirés de ta liste')).length, 1);
  assert.ok(avec.user.length < avant.user.length);
  // Un carnet d'un autre seuil, puis illisible : rien de coupé, la fiche d'avant à l'octet.
  assert.deepEqual([f.autreSeuil.coupes, f.illisible.coupes], [[], []]);
  assert.equal(f.autreSeuil.compacte.user, avant.user);
  assert.equal(f.illisible.compacte.user, avant.user);
  // L'analyse enregistrée (Claude simulé) garde sa liste ; la suivante, sans coupe, l'efface.
  assert.deepEqual(f.enregistree, { avecCoupe: ['totalCorners', 'teamCorners'], fichierAvecCoupe: ['totalCorners', 'teamCorners'], apres: 'absent', appels: 2 });
  // La revue d'une analyse faite avec des marchés retirés : ils ne sont pas redonnés à juger (dans les deux modes : la
  // revue suit ce que l'analyse a reçu), leur issue reste notée.
  for (const x of [d, f]) {
    const rRef = ref.priorCoupe.revue.compacte;
    const rNew = x.priorCoupe.revue.compacte;
    assert.equal(rNew.system, rRef.system);
    assert.deepEqual(rNew.aJuger, ['Résultat', 'Total buts', 'Les 2 équipes marquent', 'Total tirs']);
    assert.deepEqual(rNew.issues, rRef.issues, 'l’issue de chaque marché, comme avant');
    const ra = rRef.user.split('\n');
    const rb = rNew.user.split('\n');
    assert.ok(rb.every((l) => ra.includes(l) || /^## marketOutcomes — 4 marché/.test(l)), 'rien d’autre n’apparaît dans la revue');
    assert.ok(ra.filter((l) => !rb.includes(l)).every((l) => /corners|^## marketOutcomes — 7 marché/i.test(l)), 'seuls les marchés de corners et l’en-tête s’en vont');
  }
});

// ============================================================ 10. l'ancienne forme

test('l’ancienne forme à l’octet : avant-match et revue, sans carnet, avec un carnet qui coupe (coupure activée ou non), et pour une analyse faite avec des marchés retirés — identiques à la référence produite par le code d’avant l’étape ; la fiche compacte sans coupe aussi', () => {
  const ref = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'fiche-ia-etape-21.json'), 'utf8'));
  const pareil = (a, b, quoi) => {
    assert.equal(a.system, b.system, `${quoi} : consignes`);
    assert.equal(a.user, b.user, `${quoi} : message`);
  };
  for (const [mode, f] of [
    ['coupure désactivée', phase('fiches')],
    ['coupure activée', phase('fiches', { actif: true })]
  ]) {
    pareil(f.sans.avant.ancienne, ref.sans.avant.ancienne, `${mode}, avant-match, ancienne`);
    pareil(f.sans.avant.compacte, ref.sans.avant.compacte, `${mode}, avant-match, compacte sans carnet`);
    pareil(f.sans.revue.ancienne, ref.sans.revue.ancienne, `${mode}, revue, ancienne`);
    pareil(f.sans.revue.compacte, ref.sans.revue.compacte, `${mode}, revue, compacte`);
    assert.deepEqual(f.sans.revue.compacte.issues, ref.sans.revue.compacte.issues, 'la tenue de chaque avis : la règle unique ne change rien');
    pareil(f.avec.avant.ancienne, ref.sans.avant.ancienne, `${mode}, avant-match, ancienne, AVEC un carnet qui coupe`);
    assert.deepEqual(f.avec.avant.ancienne.marches, ref.sans.avant.ancienne.marches, 'l’ancienne forme reçoit tous les marchés');
    assert.deepEqual(f.avec.avant.ancienne.marchesRetires, []);
    pareil(f.priorCoupe.revue.ancienne, ref.priorCoupe.revue.ancienne, `${mode}, revue, ancienne, d’une analyse aux marchés retirés`);
    assert.deepEqual(f.priorCoupe.revue.ancienne.aJuger, ref.priorCoupe.revue.ancienne.aJuger);
  }
  assert.match(ref.note, /code d’AVANT l’étape/);
});

// ============================================================ 11. la route

test('la route GET /api/match-ai/scorecard rend le carnet tel qu’écrit par la nuit (lecture seule), les types de marché toujours tous, la règle, la coupure désactivée et sa phrase, le type d’argument', () => {
  const s = phase('tout');
  assert.equal(s.route.code, 200);
  const r = s.route.corps;
  assert.equal(r.etat, 'lu');
  assert.equal(r.aJour, true);
  assert.deepEqual({ ...r.carnet, calculeLe: null }, { ...s.fichier, calculeLe: null });
  assert.equal(r.seuil, 200);
  assert.equal(r.coupureActive, false);
  assert.equal(r.decisionEnAttente, 'Aucun marché n’est retiré pour l’instant : c’est à vous de décider de la règle.');
  assert.deepEqual(r.carnet.coupes, []);
  assert.deepEqual(r.typesDeMarche.map((t) => t.marketType), Object.keys(TYPES_DE_MARCHE));
  assert.deepEqual(r.typesDeMarche.filter((t) => t.avecCloture).map((t) => t.marketType), ['result', 'totalGoals', 'bothTeamsScore']);
  assert.equal(r.typeArgument.phrase, 'Type d’argument : à ajouter au prompt, décision de Pierre.');
  assert.equal(r.etats.coupe, 'l’IA n’apporte rien ici, elle ne commente plus');
  assert.equal(r.etats.seraitRetire, 'serait retiré : l’IA n’apporte rien ici');
  assert.deepEqual(r.depuis, { jour: '2026-09-30', regle: 'pronostics à cote minimale 1,20' });
  // La coupure activée : la route le dit, sans phrase d'attente.
  const a = phase('tout', { actif: true }).route.corps;
  assert.deepEqual([a.coupureActive, a.decisionEnAttente, a.aJour], [true, null, true]);
});

// ============================================================ 12. le code

test('le code : le carnet n’appelle ni Claude ni le réseau, ne rapproche jamais par le nom souple, n’écrit que son fichier (atomicJson) ; le service lit les marchés coupés sans jamais échouer ; aucun fichier du moteur touché', () => {
  const lire = (...p) => fs.readFileSync(path.join(SERVEUR, 'src', ...p), 'utf8');
  const carnet = lire('data', 'aiScorecard.js');
  assert.doesNotMatch(carnet, /claudeCodeClient|anthropicClient|callClaude|fetch\(|https?:\/\//);
  assert.doesNotMatch(carnet, /teamNamesLikelyMatch|findBestTeamNameMatch|teamNameMatch|findAnalysisForFixture|findPreMatchAnalysisByTeams/, 'jamais le rapprocheur souple');
  assert.doesNotMatch(carnet, /predictionsRepository|listPredictions/, 'jamais predictions.json');
  assert.match(carnet, /writeJsonAtomic\(fichier, carnet\)/);
  assert.equal((carnet.match(/writeJsonAtomic\(/g) ?? []).length, 1, 'une seule écriture : le fichier du carnet');
  assert.doesNotMatch(carnet, /\.prepare\(\s*['`"]\s*(INSERT|UPDATE|DELETE|CREATE|DROP)/i, 'la base n’est que lue');
  const service = lire('core', 'ai', 'matchAiAnalysisService.js');
  assert.match(service, /const coupes = lireLesMarchesCoupes\(\);/);
  assert.match(service, /if \(forme === FICHES\.ancienne\) \{\n {4}\/\/ L'ancienne forme est celle d'avant l'étape 41, octet pour octet : jamais filtrée par le carnet \(étape 21\)\.\n {4}if \(compo\) context\.lineups = compositionPourIA\(compo\);\n {4}marches = engineSummary\.marketPredictions;/);
  // Les consignes fixes ne parlent pas du carnet : la ligne est dans la fiche du match.
  const prompt = lire('core', 'ai', 'matchAiAnalysisPrompt.js');
  const consignes = prompt.slice(prompt.indexOf('export const CONSIGNES_AVANT_MATCH'), prompt.indexOf('export const CONSIGNES_APRES_MATCH'));
  assert.doesNotMatch(consignes, /Retirés|carnet/);
  // Aucun fichier de l'empreinte du moteur (étape 25) ne lit le carnet.
  for (const dossier of ['core/engine', 'core/market', 'core/model', 'core/risk', 'core/signals', 'core/xg', 'sports'].filter((d) => fs.existsSync(path.join(SERVEUR, 'src', d)))) {
    for (const fichier of fs.readdirSync(path.join(SERVEUR, 'src', dossier), { recursive: true }).filter((x) => String(x).endsWith('.js'))) {
      assert.doesNotMatch(lire(dossier, String(fichier)), /aiScorecard|carnet-ia/, `${dossier}/${fichier}`);
    }
  }
  // lireLesMarchesCoupes : jamais d'exception, un Set vide hors d'un carnet lisible au bon seuil, écrit coupure
  // active — et TOUJOURS vide tant que la coupure est désactivée (le défaut), quel que soit le fichier.
  fs.mkdirSync(RACINE_ESSAIS, { recursive: true });
  const dossier = fs.mkdtempSync(path.join(RACINE_ESSAIS, 'cm-carnet-ia-'));
  try {
    const f = path.join(dossier, 'carnet-ia.json');
    const actif = { fichier: f, coupureActive: true };
    assert.deepEqual([...S.lireLesMarchesCoupes(actif)], [], 'absent');
    fs.writeFileSync(f, '{ "coupes": [');
    assert.deepEqual([...S.lireLesMarchesCoupes(actif)], [], 'illisible');
    fs.writeFileSync(f, JSON.stringify({ version: S.VERSION_CARNET, seuil: S.SEUIL_MATCHS_POUR_COUPER, coupureActive: true, types: [], coupes: ['totalCorners', 'inconnu', 3] }));
    assert.deepEqual([...S.lireLesMarchesCoupes(actif)], ['totalCorners'], 'un type inconnu jamais retenu');
    assert.deepEqual([...S.lireLesMarchesCoupes({ fichier: f })], [], 'la coupure désactivée (le défaut) : rien, même ce fichier');
    fs.writeFileSync(f, JSON.stringify({ version: S.VERSION_CARNET, seuil: S.SEUIL_MATCHS_POUR_COUPER, coupureActive: false, types: [], coupes: ['totalCorners'] }));
    assert.deepEqual([...S.lireLesMarchesCoupes(actif)], [], 'un carnet calculé coupure désactivée ne coupe rien, même une fois la coupure activée');
    fs.writeFileSync(f, JSON.stringify({ version: S.VERSION_CARNET + 1, seuil: S.SEUIL_MATCHS_POUR_COUPER, coupureActive: true, types: [], coupes: ['totalCorners'] }));
    assert.deepEqual([...S.lireLesMarchesCoupes(actif)], [], 'une autre forme');
  } finally {
    fs.rmSync(dossier, { recursive: true, force: true });
  }
});
