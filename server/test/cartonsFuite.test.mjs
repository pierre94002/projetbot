/**
 * LES CARTONS (étape 33, lot 1a, 02/11/2026) — l'absence de fuite.
 *   node --test test/cartonsFuite.test.mjs        (depuis server/)
 *
 * T-F1 L'ORACLE DE LA COPIE TRONQUÉE : sur un MAGASIN FABRIQUÉ (cartonsFabrique.mjs, copie isolée : base neuve, réseau
 *      coupé), pour 6 jours J, l'état de la passe au jour J (moyennes, tendance et garde des compétitions, fenêtres des
 *      équipes, sommes et indice des arbitres et des faux arbitres) et l'instantané d'avant-match de chaque match de J
 *      sont ÉGAUX à l'octet sur la base entière et sur une copie coupée à J (après J : plus rien ; le jour J : le registre
 *      et l'identité de l'arbitre seulement — déroulés, lignes et scores effacés). Aucune exemption : le statut du match
 *      de J n'est pas un fait d'avant-match (ce sont ses cartons), il n'est donc pas dans l'instantané comparé ;
 * T-F2 9 cartons et 3 rouges plantés le jour J, avec l'arbitre de J, ne changent rien à l'état de J ; le lendemain, ils
 *      comptent ;
 * T-F3 les moyennes d'arbitre que FotMob affiche, plantées absurdes (999), ne changent rien ; aucun fichier de
 *      data/cartons/ ne lit yellowCardsPerMatch, foulsPerMatch, redCards ni referee.matches ;
 * T-F4 les jaunes de la ligne d'équipe plantés à 0 sur des matchs à déroulé complet : rien ne change (le déroulé gagne) ;
 * T-F5 une compétition dont les vrais zéros du FUTUR dépassent 10 % ne change pas le statut d'un match d'avant (la garde
 *      est au jour J).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import { CartonsAuJourJ } from '../src/data/cartons/cartonsAuJourJ.js';

const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-cartons.mjs');
const SRC = path.join(SERVEUR, 'src');

const uneFois = (fabrique) => {
  let valeur;
  return () => (valeur ??= fabrique());
};
const oracle = uneFois(() => {
  const copie = preparerCopie({ base: false });
  try {
    const r = executer(copie, SCRIPT, { args: ['oracle', '{}'], timeout: 300_000 });
    assert.equal(r.code, 0, `oracle :\n${r.erreurs.slice(-3000)}\n${r.sortie.slice(-1500)}`);
    assert.equal(r.reseau, false);
    return r.json;
  } finally {
    copie.nettoyer();
  }
});

test('T-F1 l’oracle de la copie tronquée : pour 6 jours J, l’état de la passe et l’instantané d’avant-match de chaque match de J sont ÉGAUX sur la base entière et sur la copie coupée à J', () => {
  const o = oracle();
  assert.equal(o.jours.length, 6);
  assert.ok(o.matchs > 300, `un magasin fabriqué de taille utile (${o.matchs} matchs)`);
  for (const s of ['accord', 'ecart-1', 'desaccord', 'ligne-a-zero', 'sans-ligne', 'vrai-zero', 'non-releve', 'prolonge', 'attribue']) assert.ok(o.statuts[s] > 0, `le statut « ${s} » est présent dans le magasin fabriqué`);
  let fiches = 0;
  let avecArbitre = 0;
  for (const x of o.oracle) {
    assert.ok(x.fiches > 0, `${x.J} : des matchs ce jour-là`);
    assert.equal(x.etatEgal, true, `${x.J} : l’état de la passe au jour J`);
    assert.equal(x.fichesEgales, true, `${x.J} : l’instantané d’avant-match des matchs de J`);
    assert.ok(x.equipes >= 12 && x.arbitres >= 4 && x.faux >= 4, `${x.J} : des équipes, des arbitres et des faux arbitres (${JSON.stringify(x)})`);
    fiches += x.fiches;
    avecArbitre += x.fichesAvecArbitreConnu;
  }
  assert.ok(fiches >= 15, `${fiches} instantanés comparés`);
  assert.ok(avecArbitre >= 10, `des matchs de J avec un arbitre déjà connu (${avecArbitre})`);
  assert.ok(o.oracle.some((x) => x.gardeActive), 'la garde des vrais zéros est active sur un des jours (Ligue Zéro)');
  assert.ok(o.oracle.every((x) => x.avecMoyenne >= 1), 'au moins une compétition a sa moyenne');
});

/** Une rencontre de la passe (la forme de rencontreDuFlux, le strict nécessaire). */
const r = (date, i, extra = {}) => ({ matchKey: `${date}-${i}`, date, league: 'Ligue 1', home: 10 + (i % 8), away: 20 + (i % 8), statutBase: 'accord', valeur: { home: 2, away: 2, total: 4 }, arbitre: { nom: i % 3 ? 'Arbitre Témoin' : 'Autre Arbitre', pays: 'France' }, ...extra });
const jours = (de, n) => Array.from({ length: n }, (_, k) => new Date(Date.parse(`${de}T00:00:00Z`) + k * 86_400_000).toISOString().slice(0, 10));

test('T-F2 9 cartons et 3 rouges plantés le jour J, avec l’arbitre de J, ne changent rien à l’état de J ; le lendemain, ils comptent', () => {
  const J = '2026-03-10';
  const avant = jours('2026-01-01', 68).filter((d) => d < J);
  const calcul = (avecLeNeuf) => {
    const acc = new CartonsAuJourJ();
    avant.forEach((d, k) => {
      acc.ajouter(r(d, k));
      acc.ajouter(r(d, k + 100, { home: 30 + (k % 5), away: 40 + (k % 5) }));
      acc.finDeJournee();
    });
    acc.ajouter(r(J, 1, { home: 10, away: 20, ...(avecLeNeuf ? { valeur: { home: 9, away: 3, total: 12 } } : {}) }));
    const instJ = acc.finDeJournee().get(`${J}-1`);
    return { instJ, lendemain: acc.etatAuJourJ('2026-03-11') };
  };
  const a = calcul(false);
  const b = calcul(true);
  assert.deepEqual(b.instJ, a.instJ, 'l’instantané de J ne voit pas les cartons de J');
  assert.ok(a.instJ.arbitre.n > 0);
  assert.equal(a.instJ.arbitre.cle, 'Arbitre Témoin|France');
  assert.equal(b.lendemain.arbitres['Arbitre Témoin|France'].O - a.lendemain.arbitres['Arbitre Témoin|France'].O, 12 - 4, 'le lendemain, l’arbitre de J les compte');
  assert.notDeepEqual(b.lendemain.equipes[10], a.lendemain.equipes[10], 'le lendemain, la fenêtre de l’équipe les compte');
  // Le désordre et la fuite sont refusés : un match du jour publié arrive après coup.
  const acc = new CartonsAuJourJ();
  acc.ajouter(r('2026-01-02', 1));
  acc.finDeJournee();
  assert.throws(() => acc.ajouter(r('2026-01-02', 2)), /fuite ou désordre/);
  assert.throws(() => acc.ajouter(r('2026-01-01', 3)), /fuite ou désordre/);
  assert.throws(() => acc.etatAuJourJ('2026-01-02'), /pas d’avant/);
});

const tousLesFichiers = (dossier) => fs.readdirSync(dossier, { recursive: true }).map(String).filter((f) => fs.statSync(path.join(dossier, f)).isFile());

test('T-F3 les moyennes d’arbitre que FotMob affiche, plantées absurdes, ne changent rien ; aucun fichier de data/cartons/ ne les lit', () => {
  const o = oracle();
  assert.equal(o.absurde.length, 3);
  for (const x of o.absurde) assert.equal(x.egal, true, `${x.J} : état inchangé`);
  for (const f of tousLesFichiers(path.join(SRC, 'data', 'cartons'))) {
    const code = fs.readFileSync(path.join(SRC, 'data', 'cartons', f), 'utf8');
    assert.doesNotMatch(code, /yellowCardsPerMatch|foulsPerMatch|redCards|referee\.matches|\$\.referee\.(matches|redCards|yellow|fouls)/, f);
  }
});

test('T-F4 les jaunes de la ligne d’équipe plantés à 0 sur des matchs à déroulé complet : rien ne change, le déroulé gagne', () => {
  const o = oracle();
  assert.ok(o.jaunesAZero.matchs > 100, `${o.jaunesAZero.matchs} matchs « accord » plantés à 0`);
  for (const x of o.jaunesAZero.jours) {
    assert.equal(x.egal, true, `${x.J} : état inchangé`);
    assert.ok(x.ligneAZero > o.jaunesAZero.matchs, 'ils sont bien devenus « ligne-a-zero »');
  }
});

test('T-F5 les vrais zéros du FUTUR ne changent pas le statut d’un match d’avant : la garde est au jour J', () => {
  const statutDe = (avecFutur) => {
    const acc = new CartonsAuJourJ();
    const liste = jours('2025-01-01', 80);
    let statut = null;
    liste.forEach((d, k) => {
      const zero = k === 40 || (avecFutur && k > 40);
      acc.ajouter(r(d, k, zero ? { statutBase: 'vrai-zero', valeur: { home: 0, away: 0, total: 0 } } : {}));
      const inst = acc.finDeJournee();
      if (k === 40) statut = inst.get(`${d}-${k}`).statut;
    });
    return statut;
  };
  assert.equal(statutDe(false), 'vrai-zero');
  assert.equal(statutDe(true), 'vrai-zero', '39 matchs de vrais zéros APRÈS lui ne changent pas son statut');
});
