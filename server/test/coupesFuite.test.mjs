/**
 * L'ABSENCE DE FUITE (étape 36, lot 1, 09/11/2026) — sur le magasin fabriqué (aides/coupesFabrique.mjs), dans des copies
 * isolées :
 *   node --test test/coupesFuite.test.mjs        (depuis server/)
 *
 *   T-F1 l'ORACLE DE LA COPIE COUPÉE : pour six jours J, les entrées de chaque match décisif du jour J (l'aller et l'avance,
 *        la nature visible au jour J, le format, λS et μS de la passe) sont égales, à l'octet en JSON, sur une copie coupée
 *        à J (tout ce qui est après J retiré ; pour J, la structure gardée, résultats et déroulés effacés) et sur le magasin
 *        entier. La LISTE des matchs décisifs vient de la saison entière : l'exemption NOMMÉE (la forme de la compétition est
 *        connue d'avance en vrai ; critique de l'étape 36, constat 6) — comparée à nature égale ;
 *   T-F2 le tour suivant ne sert qu'aux issues : un match planté après J ne change aucune entrée du jour J ;
 *   T-F3 le format du jour J ignore les matchs de J et d'après ;
 *   T-F4 les fiches de la nuit : une page relevée APRÈS le coup d'envoi n'y entre jamais (comptée) ; la grille de la page
 *        recopiée seulement d'une ligne calculée avant le coup d'envoi.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';

const lancer = (phase, options = {}) => {
  const c = preparerCopie({ base: false });
  try {
    const x = executer(c, path.join(SERVEUR, 'test', 'aides', 'script-coupes.mjs'), { args: [phase, JSON.stringify(options)], timeout: 300_000 });
    assert.equal(x.code, 0, `script-coupes ${phase} :\n${x.erreurs.slice(-3000)}`);
    assert.equal(x.reseau, false, 'un appel réseau a été tenté');
    return x.json;
  } finally {
    c.nettoyer();
  }
};

let memo = null;
const fuite = () => (memo ??= lancer('fuite'));

test('T-F1 — l’oracle de la copie coupée : six jours J, les entrées de chaque match décisif égales à l’octet, à nature égale', () => {
  const j = fuite();
  assert.equal(j.tF1.length, 6);
  let unites = 0;
  for (const x of j.tF1) {
    assert.ok(x.unites > 0, `${x.J} : aucun match décisif ce jour-là`);
    assert.deepEqual(x.ecarts, [], `${x.J} : ${JSON.stringify(x.ecarts).slice(0, 600)}`);
    assert.equal(x.egales, x.unites);
    unites += x.unites;
  }
  assert.ok(unites >= 20, `${unites} matchs décisifs comparés`);
  assert.ok(j.tF1.some((x) => x.natures.includes('retour')) && j.tF1.some((x) => x.natures.includes('match-unique')), 'des retours et des matchs uniques');
  assert.ok(j.tF1.reduce((s, x) => s + x.avecBase, 0) >= 20, 'λS et μS comparés');
});

test('T-F2 — le tour suivant ne sert qu’aux issues : un match planté après J ne change aucune entrée du jour J', () => {
  const j = fuite();
  assert.ok(j.tF2.unites >= 4);
  assert.deepEqual(j.tF2.apres, j.tF2.avant);
  assert.equal(j.tF2.auDela, 0, 'l’appariement au jour J ne lit aucune rencontre d’après J (ni le match planté)');
});

test('T-F3 — le format du jour J ignore les matchs de J et d’après', () => {
  const j = fuite();
  assert.deepEqual([j.tF3.aJ.valeur, j.tF3.aJ.directs, j.tF3.aJ.prolongations], ['direct', 3, 0], 'les deux prolongations du jour J et d’après ne comptent pas');
  assert.deepEqual([j.tF3.apres.valeur, j.tF3.apres.prolongations], ['mixte', 2]);
});

test('T-F4 — les fiches : une page relevée après le coup d’envoi n’y entre jamais (comptée) ; la grille recopiée d’une ligne d’avant le coup d’envoi', () => {
  const j = lancer('nuit', { fuite: true });
  assert.equal(j.nuit1.mode, 'complet', JSON.stringify(j.nuit1));
  // La page lue le 16/04 à 21 h (après le coup d'envoi de 19 h) : comptée, jamais dans la fiche.
  assert.ok(j.nuit1.fuites.some((f) => f.quoi === 'page' && f.home === 9021 && f.away === 9017), JSON.stringify(j.nuit1.fuites));
  const fiche = j.fiches1.find((f) => f.date === '2026-04-16' && f.home_id === '9021');
  const faits = JSON.parse(fiche.faits);
  assert.equal(faits.sources.page, null, 'la page d’après le coup d’envoi n’est pas une source de la fiche');
  assert.notEqual(faits.tour?.brut, 'Quarter-finals');
  // La grille de la page : la ligne « service » calculée avant le coup d'envoi.
  const g = JSON.parse(fiche.grille_page);
  assert.ok(Date.parse(g.calculeLe) < Date.parse('2026-04-16T19:00:00Z'));
  assert.deepEqual([g.lambda, g.mu, g.rho], [1.42, 1.08, -0.05]);
  assert.match(j.resultat1.summary, /à regarder : 1 source de fiche datée après le coup d’envoi/);
});
