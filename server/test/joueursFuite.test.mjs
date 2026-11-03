/**
 * LES CHIFFRES DES JOUEURS (étape 34, lot 1a, 03/11/2026) — l'absence de fuite.
 *   node --test test/joueursFuite.test.mjs        (depuis server/)
 *
 * Sur un MAGASIN FABRIQUÉ (joueursFabrique.mjs, copie isolée : base neuve, réseau coupé, heure figée) :
 * T-F1   L'ORACLE DE LA COPIE TRONQUÉE : pour 6 jours J, l'état de la passe au jour J (sommes des joueurs et des faux
 *        joueurs, repères des postes, rapports des compétitions, minutes, chance d'entrer, dernières feuilles) et
 *        l'observation de chaque match de J (base λ, S et C ; entrées des compositions ; dernières feuilles) sont ÉGAUX à
 *        l'octet sur la base entière et sur une copie coupée à J (après J : plus rien ; le jour J : la composition seule —
 *        minutes, statistiques, note, déroulé, score, entrées en jeu et minutes de remplacement effacés : critique,
 *        constat 13). Aucune exemption ;
 * T-F2   buts, cartons, tirs cadrés, xG et minutes plantés le jour J ne changent rien à l'état de J ; le lendemain, ils
 *        comptent ;
 * T-F3   minutes, statistiques, note, déroulé, entrées en jeu du jour J plantés absurdes → les entrées et la base de J
 *        inchangées ;
 * T-F3bis le banc listé de J réduit aux seuls entrants (les feuilles « remplaçants seuls » : critique, constat 2) →
 *        titulaires et bloc des remplaçants identiques à l'octet (le banc listé n'entre jamais dans Σ_L) ;
 * T-F4   la dernière feuille de l'accumulateur = derniereFeuille(club, J) de derniereComposition.js (règle exacte), jamais
 *        une feuille de J ni d'après ;
 * T-F5   la base λ = celle de passeDuBanc de la 32, à l'octet ; la base S = statExpectations des fenêtres f10 ; la base C =
 *        la moyenne de la compétition de CartonsAuJourJ de la 33 (la même base au banc et à l'écran : critique, constat 7).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import { JoueursAuJourJ } from '../src/data/joueurs/joueursAuJourJ.js';

const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-joueurs.mjs');
const uneFois = (fabrique) => {
  let valeur;
  return () => (valeur ??= fabrique());
};
const oracle = uneFois(() => {
  const copie = preparerCopie({ base: false });
  try {
    const r = executer(copie, SCRIPT, { args: ['oracle', '{}'], timeout: 600_000 });
    assert.equal(r.code, 0, `oracle :\n${r.erreurs.slice(-3000)}\n${r.sortie.slice(-1500)}`);
    assert.equal(r.reseau, false);
    return r.json;
  } finally {
    copie.nettoyer();
  }
});

test('T-F1 l’oracle de la copie tronquée : pour 6 jours J, l’état de la passe et l’observation de chaque match de J sont ÉGAUX sur la base entière et sur la copie coupée à J', () => {
  const o = oracle();
  assert.equal(o.jours.length, 6);
  assert.ok(o.matchs > 300, `un magasin fabriqué de taille utile (${o.matchs} matchs)`);
  let obs = 0;
  let titulaires = 0;
  for (const x of o.oracle) {
    assert.ok(x.observations > 0, `${x.J} : des matchs ce jour-là`);
    assert.equal(x.etatEgal, true, `${x.J} : l’état de la passe au jour J`);
    assert.equal(x.observationsEgales, true, `${x.J} : les observations des matchs de J (base, entrées, dernières feuilles)`);
    assert.ok(x.joueurs > 100 && x.faux > 100 && x.ligues >= 2 && x.feuilles >= 12, `${x.J} : des joueurs, des faux joueurs, des compétitions, des feuilles (${JSON.stringify(x)})`);
    obs += x.observations;
    titulaires += x.titulaires;
  }
  assert.ok(obs >= 20 && titulaires >= 400, `${obs} observations, ${titulaires} titulaires comparés`);
  assert.ok(o.oracle.slice(2).every((x) => x.avecBase > 0), 'des matchs avec leurs trois bases');
});

test('T-F2 des faits plantés le jour J ne changent rien à l’état de J ; le lendemain, ils comptent', () => {
  const o = oracle();
  assert.equal(o.TF2.etatJIdentique, true, JSON.stringify(o.TF2));
  assert.equal(o.TF2.lendemainChange, true, JSON.stringify(o.TF2));
});

test('T-F3 la feuille du jour J ne prête que la composition : minutes, statistiques, note, déroulé, entrées en jeu absurdes → entrées et base de J inchangées', () => {
  const o = oracle();
  assert.ok(o.TF3.matchs > 0);
  assert.equal(o.TF3.absurdeIdentique, true, JSON.stringify(o.TF3));
});

test('T-F3bis le banc listé de J réduit aux entrants → titulaires et bloc des remplaçants identiques à l’octet', () => {
  assert.equal(oracle().TF3bis.titulairesEtBlocIdentiques, true);
});

test('T-F4 la dernière feuille de l’accumulateur = derniereFeuille(club, J) de derniereComposition.js', () => {
  const o = oracle();
  assert.ok(o.TF4.compares >= 60, JSON.stringify(o.TF4));
  assert.equal(o.TF4.egaux, o.TF4.compares, JSON.stringify(o.TF4));
});

test('T-F5 la base λ = passeDuBanc de la 32 à l’octet ; S = statExpectations des fenêtres f10 ; C = la moyenne de CartonsAuJourJ', () => {
  const o = oracle();
  assert.ok(o.TF5.lambdaCompares > 300, JSON.stringify(o.TF5));
  assert.equal(o.TF5.lambdaEgaux, o.TF5.lambdaCompares, JSON.stringify(o.TF5));
  assert.equal(o.TF5.sEgaux, o.TF5.sCompares, JSON.stringify(o.TF5));
  assert.equal(o.TF5.cEgaux, o.TF5.cCompares, JSON.stringify(o.TF5));
  assert.ok(o.TF5.avecCartons > 50, 'des matchs avec la moyenne des cartons');
});

test('T-F1 (accumulateur) : le désordre et la fuite sont refusés ; l’état ne se lit pas avec une journée en attente', () => {
  const acc = new JoueursAuJourJ();
  const r = (date) => ({ matchKey: `k-${date}`, date, league: 'L', home: 1, away: 2, joue: true, attribue: false, prolongation: false, evenements: [], camps: { home: { club: 1, lignes: [] }, away: { club: 2, lignes: [] } } });
  acc.ajouter(r('2023-01-05'));
  assert.throws(() => acc.ajouter(r('2023-01-06')), /pas publiée/);
  assert.throws(() => acc.etatAuJourJ('2023-01-07'), /pas publiée/);
  acc.finDeJournee();
  assert.throws(() => acc.ajouter(r('2023-01-05')), /fuite ou désordre/);
  assert.throws(() => acc.etatAuJourJ('2023-01-05'), /pas d’avant/);
  assert.throws(() => acc.entreesDUneComposition({ cle: 'x', league: 'L', club: 1, joueurs: [], jour: '2023-01-04' }), /pas d’avant/);
  // Un titulaire SANS poste et sans aucune apparition (poste 0) : publié sans faute ; il ne nourrit aucun repère de poste.
  const l = (id, poste) => ({ id, titulaire: true, poste, minutes: 90, entre: false, xg: 0.2, xgnp: 0.2, shotsOnTarget: 1, assists: null, xa: 0.1, rating: 7, touches: 30, passes: 20 });
  const sansPoste = { ...r('2023-01-09'), evenements: [], camps: { home: { club: 1, buts: 0, cadresDEquipe: 2, lignes: [l(501, null), l(502, 4)] }, away: { club: 2, buts: 0, cadresDEquipe: 0, lignes: [l(503, 2)] } } };
  sansPoste.camps.away.lignes[0].shotsOnTarget = null;
  acc.ajouter(sansPoste);
  assert.doesNotThrow(() => acc.finDeJournee());
  const e = acc.etatAuJourJ('2023-01-10');
  assert.equal(e.joueurs[501].apparitions, 1);
  assert.equal(e.reperes[4].global[2], 0.5, 'le repère des attaquants : 1 tir cadré sur une exposition de 2 (le joueur sans poste n’y entre pas)');
  // Le repère du poste est GLISSANT (90 jours, J exclu) : 91 jours plus tard, la journée en est sortie.
  assert.equal(acc.etatAuJourJ('2023-04-09').reperes[4].global[2], 0.5, '90 jours après : encore dedans');
  assert.equal(acc.etatAuJourJ('2023-04-10').reperes[4].global[2], null, '91 jours après : sortie du repère');
});
