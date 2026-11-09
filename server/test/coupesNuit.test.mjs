/**
 * LA NUIT DES COUPES (étape 36, lot 1, 09/11/2026) — sur le magasin fabriqué, dans une copie isolée (réseau coupé, heure
 * figée ; la vraie nuit dans le VRAI processus à part) :
 *   node --test test/coupesNuit.test.mjs        (depuis server/)
 *
 *   T-NU1 la place de l'étape (après la combinaison à blanc, juste avant le contrôle quotidien, toujours dernier) ; due une
 *         fois par jour civil de Paris ou après un report ; jamais au clic ;
 *   T-NU2 le jeton pris → « reporté », rien d'écrit ; l'annuaire pas prêt → « reporté » ; le délai dépassé → l'enfant arrêté,
 *         rien rangé ;
 *   T-NU3 les tranches de 250 (ici 5), `en_cours` posé puis retiré, la reprise d'une nuit interrompue ;
 *   T-NU4 les fiches figées : jamais réécrites après le coup d'envoi (l'heure inconnue : 10 h UTC du jour) ; la dernière
 *         d'avant gagne ; jamais élaguées pour un match joué ; les orphelines parties après 30 jours ;
 *   T-NU5 le résumé et ses contrôles ; un écart planté (le qualifié qui ne rejoue pas) lève l'alerte durable, nommée ;
 *   T-NU6 la grille de la page recopiée de la simulation (rôle « service », d'avant le coup d'envoi) ; absente → la fiche
 *         sans elle, comptée.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import { __testing, __coupesPourLesTests } from '../src/jobs/matchStatsAutoRefresh.js';
import * as N from '../src/data/coupes/coupesNuit.js';

let memo = null;
function nuit() {
  if (memo) return memo;
  const c = preparerCopie({ base: false });
  try {
    const x = executer(c, path.join(SERVEUR, 'test', 'aides', 'script-coupes.mjs'), { args: ['nuit', '{}'], timeout: 300_000 });
    assert.equal(x.code, 0, `script-coupes nuit :\n${x.erreurs.slice(-3000)}`);
    assert.equal(x.reseau, false, 'un appel réseau a été tenté');
    memo = x.json;
    return memo;
  } finally {
    c.nettoyer();
  }
}

test('T-NU1 — la place de l’étape, juste avant le contrôle quotidien ; due une fois par jour de Paris ou après un report ; jamais au clic', () => {
  const cles = __testing.ETAPES().map((e) => e.key);
  const i = cles.indexOf('coupesEtMatchsAPart');
  assert.ok(i > 0);
  assert.equal(cles[i + 1], 'controleQuotidien');
  assert.equal(cles[i - 1], 'combinaisonABlanc');
  assert.equal(cles.at(-1), 'controleQuotidien');
  assert.ok(cles.indexOf('simulationMatchs') < i, 'après la simulation de l’étape 28, qu’elle lit');
  const etape = __testing.ETAPES()[i];
  assert.equal(typeof etape.due, 'function', 'une étape à « due » : jamais forcée par un clic');
  const hier = { derniere: () => '2026-11-08T00:40:00.000Z', derniersDetails: () => null };
  const ceMatin = { derniere: () => new Date().toISOString(), derniersDetails: () => null };
  const reportee = { derniere: () => new Date().toISOString(), derniersDetails: () => ({ reporte: true }) };
  assert.equal(__coupesPourLesTests.dueCoupes(hier), true);
  assert.equal(__coupesPourLesTests.dueCoupes(ceMatin), false);
  assert.equal(__coupesPourLesTests.dueCoupes(reportee), true);
});

test('T-NU2 — jeton pris → « reporté », rien d’écrit ; annuaire pas prêt → « reporté » ; délai dépassé → enfant arrêté, rien rangé', () => {
  const j = nuit();
  assert.equal(j.reporte.mode, 'reporte');
  assert.match(j.reporte.raison, /autre calcul lourd/i);
  assert.equal(j.reporte.resultat.status, 'warn');
  assert.match(j.reporte.resultat.summary, /^Reporté : .* — les coupes seront rangées à la passe suivante\.$/);
  assert.equal(j.annuaire.mode, 'reporte', JSON.stringify(j.annuaire));
  assert.match(j.annuaire.raison, /les annuaires des clubs ne sont pas prêts/);
  assert.doesNotMatch(j.annuaire.raison, /contexte du match|^Error/);
  assert.equal(j.delai.mode, 'echec');
  assert.match(j.delai.erreur, /calcul à part arrêté/);
  assert.deepEqual(j.delai.apres, j.delai.avant, 'rien rangé');
});

test('T-NU3 — tranches, `en_cours` posé puis retiré, la reprise d’une nuit interrompue', () => {
  const j = nuit();
  assert.equal(j.nuit1.mode, 'complet', JSON.stringify(j.nuit1));
  assert.ok(!j.etat1.includes('en_cours'));
  assert.deepEqual(j.etat1, ['calendrier', 'controles', 'nuit']);
  assert.equal(j.rencontresRangees, 104);
  assert.ok(j.stades >= 30);
  assert.equal(j.reprise.mode, 'complet');
  assert.equal(j.reprise.repriseApres, '2026-04-19T00:41:00.000Z');
  assert.equal(j.reprise.enCours, 0);
  assert.ok(j.reprise.transactions >= 10, `${j.reprise.transactions} transactions de 5`);
});

test('T-NU4 — les fiches figées : jamais réécrites après le coup d’envoi ; la dernière d’avant gagne ; jamais élaguées pour un match joué ; orphelines parties', () => {
  const j = nuit();
  const avant = Object.fromEntries(j.fiches1.map((f) => [`${f.date}|${f.home_id}`, f]));
  const apres = Object.fromEntries(j.fiches2.map((f) => [`${f.date}|${f.home_id}`, f]));
  // Les retours du 16/04 (heure connue 19 h, ou inconnue → 10 h UTC) : la seconde nuit (16/04, 21 h) ne les réécrit pas.
  for (const h of ['9021', '9022', '9023', '9024']) {
    assert.equal(apres[`2026-04-16|${h}`].calcule_le, avant[`2026-04-16|${h}`].calcule_le, `fiche ${h} réécrite après le coup d’envoi`);
    assert.equal(apres[`2026-04-16|${h}`].faits, avant[`2026-04-16|${h}`].faits);
    assert.equal(apres[`2026-04-16|${h}`].apres_coup_d_envoi, 1, 'figée');
  }
  // Un match à venir (21/04) : la dernière fiche d'avant son coup d'envoi gagne.
  assert.equal(apres['2026-04-21|9027'].calcule_le, '2026-04-16T21:00:00.000Z');
  assert.equal(j.nuit2.ecrites.fiches.gardees, 4);
  // L'orpheline (aucun match joué) partie ; la fiche d'un match joué gardée.
  assert.deepEqual(j.orphelines.restantes.map((f) => `${f.date}|${f.home_id}|${f.away_id}`), ['2024-01-06|9001|9002']);
  assert.ok(j.orphelines.fiches.orphelines >= 1);
});

test('T-NU5 — le résumé et ses contrôles ; un écart planté lève l’alerte durable, nommée', () => {
  const j = nuit();
  const r = j.resultat1;
  assert.match(r.summary, /^Coupes : 104 rencontres rangées \(toutes, première nuit\)/);
  assert.match(r.summary, /le qualifié rejoue au tour suivant dans/);
  assert.match(r.summary, /Explication seulement : jamais lu par le moteur ni envoyé à l’IA\.$/);
  assert.equal(r.alert.key, 'coupesEtMatchsAPart');
  // L'écart planté : le qualifié ne rejoue au tour suivant que dans 8 cas sur 10 ; des buts à l'extérieur dans une coupe de l'UEFA.
  const a = N.alerteDesCoupes({ controles: { rejoueOk: 8, rejoueN: 10, carte: 10, desaccord: 0, butsExterieur: [{ league: 'UEFA Europa League', saison: 2025, cas: 3 }] }, fuites: [], updatedAt: 'x' });
  assert.equal(a.raisons.length, 2);
  assert.match(a.raisons[0], /^le qualifié ne rejoue au tour suivant que dans 80 % des confrontations/);
  assert.match(a.raisons[1], /UEFA Europa League 2025 : 3 retours décidés à égalité de cumul sans prolongation/);
  const resultat = N.resultatDeLEtape({ mode: 'complet', bilan: {}, ecrites: {}, controles: { rejoueOk: 8, rejoueN: 10 }, fuites: [] }, { updatedAt: 'x' });
  assert.equal(resultat.status, 'warn');
  assert.match(resultat.summary, /à regarder : le qualifié ne rejoue/);
  assert.equal(N.alerteDesCoupes({ controles: { rejoueOk: 10, rejoueN: 10 }, fuites: [] }), null);
});

test('T-NU6 — la grille de la page recopiée de la simulation (« service », d’avant le coup d’envoi) ; absente → fiche sans elle, comptée', () => {
  const j = nuit();
  const avec = j.fiches1.filter((f) => f.grille_page);
  assert.deepEqual(avec.map((f) => `${f.date}|${f.home_id}`), ['2026-04-16|9021']);
  assert.equal(j.nuit1.bilan.avecGrille, 1);
  assert.equal(j.nuit1.bilan.fiches, 7);
  assert.match(j.resultat1.summary, /7 matchs de coupe des 14 prochains jours \(1 avec la grille de la page\)/);
  const faits = JSON.parse(j.fiches1.find((f) => f.home_id === '9021').faits);
  assert.equal(faits.nature.valeur, 'retour');
  assert.equal(faits.nature.aller.avance, -2);
  assert.equal(faits.sources.grille, '2026-04-12T00:20:00.000Z');
});
