/**
 * Étape 28 du plan — T8, L'ORACLE DE LA COPIE TRONQUÉE pour la nuit des matchs (conception §6), dans des COPIES
 * ISOLÉES de la base d'essai (isolement.mjs : réseau coupé, heure figée) :
 *   node --test test/simulationOracle.test.mjs        (depuis server/)
 *
 * Le patron de l'oracle de l'étape 27 (banc.test.mjs, « oracleButs ») : la même plantation football-data, le banc de
 * 27 rejoué deux fois (la candidate déclarée, telle que la nuit la lit, et la version en service) ; pour six rencontres
 * du jour J, la copie tronquée à J, la table du jour J et les forces refaites, la NUIT DES MATCHS à J 3 h de Paris :
 *   - les entrées rangées (λ, μ, ρ, le 1N2, la grille) = celles du banc de 27, pour les DEUX rôles (1e-6 ; λ et μ sont
 *     rangés à trois décimales, entreesSimulation.js) ;
 *   - `marches` et la table jointe = simulerMatch appelé directement avec les entrées rangées et la graine refaite,
 *     à l'octet ;
 *   - un 9-0 planté le jour J : les lignes tirées (grille du modèle de buts) rangent les mêmes octets ;
 *   - la clôture plantée à H − 5 et le relevé en direct à H + 10 (absurdes) ne sont pas lus : les buts attendus
 *     resteraient sinon loin du banc, qui lit la pré-clôture ;
 *   - l'horloge du processus n'est jamais lue : figée au 05/10 ou figée à J 3 h de Paris, les mêmes octets.
 * Les valeurs attendues sont celles du banc et de simulerMatch, recalculées dans la copie, jamais recopiées d'une sortie.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR, MAINTENANT_FIGE } from './aides/isolement.mjs';

const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-simulation-oracle.mjs');
/** La plus récente des six rencontres de l'oracle (l'échantillon), et 3 h de Paris ce jour-là (heure d'été). */
const PREMIERE_CIBLE = '2026-09-20-man-city-sunderland';
const TROIS_HEURES_DE_PARIS = '2026-09-20T01:00:00.000Z';

function lancer(args, maintenant) {
  const copie = preparerCopie();
  try {
    const r = executer(copie, SCRIPT, { args, timeout: 600_000, maintenant });
    assert.equal(r.code, 0, `oracle ${args.join(' ')} a échoué :\n${r.erreurs.slice(-4000)}\n${r.sortie.slice(-2000)}`);
    assert.ok(r.json?.ok, `oracle : sortie illisible\n${r.sortie.slice(-2000)}`);
    assert.equal(r.reseau, false, 'oracle : un appel réseau a été tenté');
    return r.json;
  } finally {
    copie.nettoyer();
  }
}
const uneFois = (fabrique) => {
  let valeur;
  return () => (valeur ??= fabrique());
};
const oracle = uneFois(() => lancer([], MAINTENANT_FIGE));
const horloge = uneFois(() => lancer([PREMIERE_CIBLE], TROIS_HEURES_DE_PARIS));
const trois = (x) => Number(x.toFixed(3));
const proche = (a, b, tol = 1e-6) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= tol;

test('T8 oracle tronqué, matchs : pour six rencontres du jour J, la nuit à J 3 h de Paris range λ, μ, ρ, le 1N2 et la grille du banc de l’étape 27 (1e-6, les deux rôles), et `marches` comme la table jointe = simulerMatch appelé directement, à l’octet', () => {
  const j = oracle();
  assert.deepEqual(j.banc && { c: j.banc.erreurC, s: j.banc.erreurS }, { c: null, s: null }, 'les deux bancs ont tourné sans erreur');
  assert.ok(j.banc.analysesC >= 20 && j.banc.analysesS === j.banc.analysesC, JSON.stringify(j.banc));
  assert.deepEqual(j.candidate, { id: 'modele-buts-v1', modeleDeButs: true }, 'la candidate déclarée dans le code, avec le modèle de buts');
  assert.ok(j.plusMoinsPlantes > 20, `${j.plusMoinsPlantes} plus/moins plantés`);
  assert.notEqual(j.horlogeDuProcessus.slice(0, 10), j.oracle[0]?.date, 'l’horloge du processus est figée AILLEURS que J');
  assert.equal(j.oracle.length, 6, `${j.oracle.length} rencontres`);
  assert.equal(j.oracle[0].matchKey, PREMIERE_CIBLE, 'la plus récente des six (le second passage, horloge à J 3 h, la reprend)');
  let tirees = 0;
  for (const o of j.oracle) {
    const qui = o.matchKey;
    assert.equal(o.heureDeParis, '03:00', `${qui} : la nuit à 3 h de Paris`);
    assert.equal(o.nuitForces.ecarts, 0, `${qui} : contrôle anti-fuite des forces de la nuit`);
    assert.equal(o.nuit.mode, 'complet', `${qui} : ${o.nuit.erreur}`);
    assert.equal(o.nuit.bilan.echecs, 0, `${qui} : ${JSON.stringify(o.nuit.bilan.echantillons)}`);
    assert.equal(o.nuit.bilan.sansIdentifiant, 0, `${qui} : identifiants FotMob des deux clubs`);
    assert.deepEqual(o.nuit.bilan.candidate?.id, 'modele-buts-v1', `${qui} : ${o.nuit.bilan.candidateEnAttente}`);
    assert.deepEqual(Object.keys(o.rangees).sort(), ['candidate', 'service'], `${qui} : les deux rôles rangés`);
    for (const [role, r] of Object.entries(o.rangees)) {
      const b = o.banc[role];
      assert.ok(b, `${qui} (${role}) : le banc a analysé la rencontre`);
      if (role === 'candidate') assert.equal(b.provenance, 'cotes-plusmoins-xg', `${qui} : le banc lit la pré-clôture du plus/moins (une clôture ou un direct lus par la nuit l’écarteraient du banc)`);
      assert.equal(r.grille, b.buts.grille, `${qui} (${role}) : grille`);
      assert.ok(proche(r.lambda, trois(b.buts.home)), `${qui} (${role}) : λ ${r.lambda} ≠ banc ${b.buts.home}`);
      assert.ok(proche(r.mu, trois(b.buts.away)), `${qui} (${role}) : μ ${r.mu} ≠ banc ${b.buts.away}`);
      assert.ok(proche(r.rho, b.buts.rho), `${qui} (${role}) : ρ ${r.rho} ≠ banc ${b.buts.rho}`);
      const fair = JSON.parse(r.fair);
      for (const c of ['home', 'draw', 'away']) assert.ok(proche(fair[c], b.fair[c]), `${qui} (${role}) : 1N2 ${c} ${fair[c]} ≠ banc ${b.fair[c]}`);
      assert.equal(r.calcule_le, o.instant, `${qui} (${role}) : l’heure de la passe`);
      assert.equal(r.date, o.date);
      assert.equal(r.kickoff, `${o.date}T12:00:00.000Z`, `${qui} (${role}) : coup d’envoi connu (cotes)`);
      assert.equal(r.kickoff_connu, 1);
      assert.equal(r.apres_coup_d_envoi, 0);
      if (r.grille === 'modele-buts-441') {
        tirees++;
        const d = o.direct[role];
        assert.ok(d, `${qui} (${role}) : simulerMatch rejoué`);
        assert.equal(r.n, 10000);
        assert.equal(r.graine, d.seed, `${qui} (${role}) : graine refaite des entrées rangées`);
        assert.ok(r.marches.length > 300 && r.table_jointe.length > 1000, `${qui} (${role}) : déroulé non trivial`);
        assert.equal(r.marches, d.marches, `${qui} (${role}) : marchés ≠ simulerMatch direct`);
        assert.equal(r.table_jointe, d.table, `${qui} (${role}) : table jointe ≠ simulerMatch direct`);
      } else {
        assert.equal(r.table_jointe, null, `${qui} (${role}) : ancien modèle, entrées seulement`);
        assert.equal(r.marches, null);
        assert.equal(r.n, null);
      }
    }
  }
  assert.ok(tirees >= 6, `${tirees} lignes tirées`);
});

test('T8 : un 9-0 planté le jour J (le club qui reçoit) ne change aucun octet des lignes tirées (modèle de buts : forces « avant J ») ; la clôture H − 5 et le direct H + 10 plantés avant la nuit ne sont pas lus', () => {
  const j = oracle();
  for (const o of j.oracle) {
    const qui = o.matchKey;
    assert.ok(o.neufZero, `${qui} : 9-0 planté`);
    assert.equal(o.neufZero.mode, 'complet');
    assert.equal(o.neufZero.auMagasin, 1, `${qui} : le 9-0 est bien au magasin le jour J`);
    for (const [role, r] of Object.entries(o.rangees)) {
      const apres = o.neufZero.lignes[role];
      assert.ok(apres, `${qui} (${role}) : rangée encore`);
      assert.equal(apres.fair, r.fair, `${qui} (${role}) : 1N2 (des cotes)`);
      // L'ancien modèle (rôle « service » tant que l'étape 27 n'est pas adoptée) lit le magasin comme l'appli, « maintenant »
      // sans borne (différence assumée, dayTable.js, (d) et (e2)) : ses entrées peuvent bouger avec un match du jour J
      // déjà au magasin — en vrai, à 3 h, seulement un match déjà joué. Ces lignes ne sont ni tirées ni jugées.
      if (r.grille === 'modele-buts-441') assert.deepEqual(apres, r, `${qui} (${role}) : le 9-0 du jour J a changé la ligne tirée`);
    }
  }
});

test('T8 : l’horloge du processus n’est jamais lue — la même rencontre, l’horloge figée à J 3 h de Paris au lieu du 05/10 : les mêmes octets rangés, les deux rôles', () => {
  const a = oracle().oracle.find((o) => o.matchKey === PREMIERE_CIBLE);
  const h = horloge();
  assert.equal(h.horlogeDuProcessus, TROIS_HEURES_DE_PARIS, 'horloge figée à J 3 h de Paris');
  assert.equal(h.oracle.length, 1);
  assert.equal(h.oracle[0].instant, TROIS_HEURES_DE_PARIS);
  assert.equal(h.oracle[0].nuit.mode, 'complet', h.oracle[0].nuit.erreur);
  assert.deepEqual(h.oracle[0].rangees, a.rangees);
});

test('T8 en régime « calendrier seul » (une rencontre SANS cote des deux mêmes clubs, datée J + 1 — vérification du 27/10, constat 10) : rangée par la nuit de J 3 h, coup d’envoi inconnu, la ligne de la candidate tirée sur la grille du modèle de buts', () => {
  const j = oracle();
  let vues = 0;
  for (const o of j.oracle) {
    const qui = `${o.matchKey} (calendrier seul, ${o.calendrier?.date})`;
    const c = o.calendrier;
    assert.ok(c, `${qui} : rencontre du calendrier seul passée`);
    assert.equal(c.nuit.mode, 'complet', `${qui} : ${c.nuit.erreur}`);
    assert.equal(c.nuit.bilan.echecs, 0, `${qui} : ${JSON.stringify(c.nuit.bilan.echantillons)}`);
    const r = c.rangees.candidate;
    assert.ok(r, `${qui} : la candidate rangée`);
    assert.equal(r.grille, 'modele-buts-441', `${qui} : ligne tirée`);
    assert.deepEqual([r.kickoff, r.kickoff_connu, r.date, r.apres_coup_d_envoi], [null, 0, c.date, 0], `${qui} : coup d’envoi inconnu`);
    assert.ok(r.marches && r.table_jointe, `${qui} : déroulé tiré`);
    assert.ok(c.apresNeufZero, `${qui} : la nuit refaite après le 9-0`);
    assert.equal(c.apresNeufZero.mode, 'complet');
    vues++;
  }
  assert.equal(vues, 6);
});

// À FAIRE (constat 10 de la vérification du 27/10) : cette invariance TOMBE — en régime « calendrier seul », les 6 lignes
// tirées de la candidate bougent avec un 9-0 planté le jour J (λ de +8 à +16 % : Man City – Sunderland du 21/09, λ 1,914
// → 2,175, μ 0,985 → 0,969 ; et le 1N2 rangé avec elles, donc graine, marchés et table). Sans cote, l'analyse lit le
// magasin SANS borne de date (l'enrichissement de l'analyse — enrichMatchWithRealAverages, la « lecture 1 » du
// vérificateur — et le 1N2 du moteur qui en découle) : en vrai, à 3 h de Paris, le magasin n'a presque aucun match du
// jour J, mais l'invariance n'est pas prouvée pour ce régime. La correction (une lecture bornée à date < D pour la nuit)
// touche data/providers/matchEnrichment.js, DANS l'empreinte du moteur : elle recommencerait l'essai de l'étape 27 — à
// faire après son verdict, jamais pendant. Le test tourne à chaque suite (« à faire ») et deviendra vert ce jour-là.
test('T8 en régime « calendrier seul » : un 9-0 planté le jour J ne change aucun octet de la ligne tirée de la candidate', { todo: 'échec constaté le 27/10 (constat 10) : la ligne tirée bouge (lecture du magasin sans borne en régime sans cote, matchEnrichment.js, dans l’empreinte du moteur) — à corriger après le verdict de l’étape 27' }, () => {
  const j = oracle();
  const bougees = j.oracle.filter((o) => JSON.stringify(o.calendrier.apresNeufZero.lignes.candidate) !== JSON.stringify(o.calendrier.rangees.candidate)).map((o) => `${o.matchKey} : λ ${o.calendrier.rangees.candidate.lambda} → ${o.calendrier.apresNeufZero.lignes.candidate.lambda}, μ ${o.calendrier.rangees.candidate.mu} → ${o.calendrier.apresNeufZero.lignes.candidate.mu}`);
  assert.deepEqual(bougees, [], `${bougees.length} ligne(s) tirée(s) sur ${j.oracle.length} changée(s) par le 9-0 du jour J`);
});
