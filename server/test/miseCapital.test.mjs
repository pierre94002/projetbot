/**
 * LE CAPITAL DE PIERRE (étape 39 « La mise juste », lot 1a, 04/11/2026).
 *   node --test test/miseCapital.test.mjs        (depuis server/)
 *
 * T-C1 la route /api/config/capital dans une copie isolée (le VRAI serveur, aides/script-mise.mjs) : capital.json écrit par
 *      atomicJson (aucun fichier temporaire laissé), PUT idempotent, mot de passe / numéro de compte / champ inconnu / date
 *      future / montant en texte refusés (400, rien d'écrit), DELETE → « non indiqué », garde-fous.json au même sha1 ;
 * T-C2 la base = le montant + les gains nets des paris RÉGLÉS depuis le départ du suivi (annulé = 0, attentes exclues) ;
 *      réglé le jour même : depuis l'INSTANT du réglage (un gain du matin n'est pas compté deux fois), sinon depuis minuit
 *      (Paris) ; `suitLeCarnet: false` → le montant tapé ; capital ou carnet illisible → « non indiqué », aucun euro ;
 * T-C3 deux conseils simultanés : identiques, la même part quel que soit l'ordre (jamais un capital « disponible »
 *      diminué des attentes : la base ne dépend pas des paris en attente) ;
 * T-C4 le plancher X (« jamais plus bas que X € sous mon plus haut ») : conseil 0 au-dessous ; sans X, rien.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import * as K from '../src/data/mise/capitalDePierre.js';
import * as R from '../src/data/mise/regleDeMise.js';

const REGLAGE = Object.freeze({ kellyFraction: 0.125, maxStakePercent: 0.02 });
const H = 3_600_000;

function lancer(phase) {
  const copie = preparerCopie({});
  try {
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    const r = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-mise.mjs'), { args: [phase, '{}'], timeout: 300_000 });
    assert.equal(r.code, 0, `script-mise.mjs ${phase} :\n${r.erreurs.slice(-3000)}\n${r.sortie.slice(-1500)}`);
    assert.equal(r.reseau, false, 'un appel réseau a été tenté');
    return r.json;
  } finally {
    copie.nettoyer();
  }
}

test('T-C1 la route du capital (copie isolée) : capital.json par atomicJson, PUT idempotent, mot de passe / numéro de compte / champ inconnu / date future refusés, DELETE, garde-fous.json intact', () => {
  const s = lancer('capital');
  const e = Object.fromEntries(s.etapes.map((x) => [x.nom, x]));
  assert.equal(e['lecture-vide'].code, 200);
  assert.equal(e['lecture-vide'].corps.reglage, null);
  assert.equal(e['lecture-vide'].corps.moment.indique, false);
  assert.equal(e['put-montant'].corps.ecrit, true);
  assert.deepEqual(
    { montant: e['put-montant'].fichier.montant, le: e['put-montant'].fichier.le, suit: e['put-montant'].fichier.suitLeCarnet, plancher: e['put-montant'].fichier.plancher, devise: e['put-montant'].fichier.devise },
    { montant: 2000, le: '2026-10-05', suit: true, plancher: null, devise: 'EUR' },
    'le jour du réglage par défaut, « suit mes paris » oui par défaut'
  );
  assert.equal(e['put-montant'].corps.moment.montant, 2000);
  assert.equal(e['put-meme'].corps.ecrit, false, 'idempotent');
  assert.equal(e['put-meme'].sha1, e['put-montant'].sha1, 'rien de réécrit');
  assert.equal(e['put-suit-non'].fichier.suitLeCarnet, false);
  assert.equal(e['put-plancher'].fichier.plancher, 150);
  assert.equal(e['put-plancher-vide'].fichier.plancher, null, 'plancher vide = rien');
  for (const nom of ['refus-mot-de-passe', 'refus-numero-de-compte', 'refus-inconnu', 'refus-date-future', 'refus-montant', 'refus-vide']) {
    assert.equal(e[nom].code, 400, nom);
    assert.equal(e[nom].sha1, e['put-plancher-vide'].sha1, `${nom} : rien d'écrit`);
  }
  assert.match(e['refus-mot-de-passe'].corps.error, /JAMAIS de mot de passe/);
  assert.match(e['refus-numero-de-compte'].corps.error, /numéro de compte/);
  assert.match(e['refus-inconnu'].corps.error, /Champ inconnu/);
  assert.equal(e.retrait.corps.ecrit, true);
  assert.equal(e.retrait.corps.reglage, null);
  assert.equal(e.retrait.fichier.montant, null, 'retiré par une écriture atomique, jamais un effacement');
  assert.equal(e['retrait-meme'].corps.ecrit, false);
  assert.equal(e['lecture-apres'].corps.moment.indique, false);
  assert.deepEqual(s.temporaires, [], 'aucun fichier temporaire laissé');
  assert.equal(s.gardeFousApres, s.gardeFousAvant, 'garde-fous.json au même sha1');
  assert.deepEqual(s.fichiersRuntime, ['capital.json', 'garde-fous.json'], 'aucun autre fichier de réglage écrit');
  // Aucune donnée d'un pari précis dans la réponse : des sommes seulement.
  for (const x of s.etapes) if (x.corps?.moment?.indique) assert.deepEqual(Object.keys(x.corps.moment).sort(), ['c0', 'depuis', 'enAttente', 'gainsDepuis', 'indique', 'le', 'montant', 'plancher', 'plusHaut', 'suitLeCarnet']);
  // Le code : capital.json par readJsonFile / writeJsonAtomic SEULEMENT, jamais garde-fous.json.
  const texte = fs.readFileSync(path.join(SERVEUR, 'src', 'data', 'mise', 'capitalDePierre.js'), 'utf8');
  assert.match(texte, /from '\.\.\/\.\.\/utils\/atomicJson\.js'/);
  assert.doesNotMatch(texte, /writeFileSync|renameSync|unlinkSync|rmSync|garde-fous\.json'|gardeFousRepository/);
});

const pari = (id, statut, mise, cote, regleA, creeA = regleA) => ({ id, status: statut, stake: mise, odds: cote, createdAt: creeA, settledAt: statut === 'pending' ? null : regleA, legs: [{ matchId: `m-${id}`, odds: cote, status: statut }] });

test('T-C2 la base = le montant + les gains nets réglés depuis le départ du suivi (annulé = 0, attentes exclues) ; réglé le jour même : depuis l’instant du réglage ; « fixe » ; illisible → non indiqué', () => {
  const maintenant = Date.parse('2026-11-10T18:00:00Z');
  const reglage = { montant: 1000, le: '2026-11-05', suitLeCarnet: true, plancher: null, regleA: '2026-11-05T15:00:00.000Z' };
  const paris = [
    pari('a', 'won', 20, 2.5, '2026-11-05T09:00:00.000Z'), // le matin du réglage, AVANT l'instant : déjà dans le montant tapé
    pari('b', 'won', 10, 3, '2026-11-05T20:00:00.000Z'), // +20
    pari('c', 'lost', 15, 1.9, '2026-11-06T20:00:00.000Z'), // −15
    pari('d', 'void', 30, 2, '2026-11-07T20:00:00.000Z'), // annulé : 0
    pari('e', 'pending', 40, 2, null, '2026-11-08T10:00:00.000Z'), // en attente : hors de la base
    pari('f', 'won', 5, 2, '2026-11-04T20:00:00.000Z') // avant le jour du réglage
  ];
  const c = K.capitalDuMoment({ reglage, paris, maintenant });
  assert.equal(c.indique, true);
  assert.equal(c.montant, 1005, '1 000 + 20 − 15');
  assert.equal(c.gainsDepuis, 5);
  assert.equal(c.enAttente, 40);
  assert.equal(c.plusHaut, 1020, 'le plus haut atteint depuis le départ (après le gain de b)');
  assert.equal(c.depuis, '2026-11-05T15:00:00.000Z', 'réglé le jour même : depuis l’instant du réglage');
  // Une date passée : depuis minuit (Paris) de ce jour, le gain du matin compte.
  const passe = K.capitalDuMoment({ reglage: { ...reglage, le: '2026-11-05', regleA: '2026-11-08T12:00:00.000Z' }, paris, maintenant });
  assert.equal(passe.depuis, new Date(K.minuitParis('2026-11-05')).toISOString());
  assert.equal(passe.depuis, '2026-11-04T23:00:00.000Z', 'minuit de Paris (heure d’hiver)');
  assert.equal(passe.montant, 1035, '1 000 + 30 + 20 − 15');
  // Fixe.
  const fixe = K.capitalDuMoment({ reglage: { ...reglage, suitLeCarnet: false }, paris, maintenant });
  assert.equal(fixe.montant, 1000);
  assert.equal(fixe.gainsDepuis, null);
  // La base passée au moteur.
  assert.equal(K.baseDeCalcul(c), 1005);
  assert.equal(K.baseDeCalcul(K.capitalDuMoment({ reglage: null })), K.BASE_INTERNE_SANS_CAPITAL);
  assert.equal(K.BASE_INTERNE_SANS_CAPITAL, 10000);
  assert.deepEqual(K.vueDuCapital(K.capitalDuMoment({ reglage: null })), { indique: false, montant: null, raison: 'non-indique' });
  // La validation.
  assert.throws(() => K.validerCapital({ montant: 0.5 }), /de 1 à/);
  assert.throws(() => K.validerCapital({ montant: 1000, iban: 'x' }), /JAMAIS/);
  assert.throws(() => K.validerCapital({ montant: 1000, le: '2026-02-30' }, { maintenant }), /AAAA-MM-JJ/);
  assert.deepEqual(K.validerCapital({ montant: 1234.567, suitLeCarnet: false, plancher: null }), { montant: 1234.57, suitLeCarnet: false, plancher: null });
  assert.throws(() => K.capitalLu({ montant: 'beaucoup', le: '2026-11-05' }), (e) => e.statut === 503);
  assert.equal(K.capitalLu({ montant: null, retireLe: '2026-11-05T10:00:00Z' }), null);
});

test('T-C3 deux conseils simultanés : identiques, la même part quel que soit l’ordre ; la base ne dépend pas des paris en attente', () => {
  const maintenant = Date.parse('2026-11-10T18:00:00Z');
  const reglage = { montant: 2000, le: '2026-11-05', suitLeCarnet: true, plancher: null, regleA: '2026-11-05T15:00:00.000Z' };
  const regles = [pari('b', 'won', 10, 3, '2026-11-06T20:00:00.000Z')];
  const sansAttente = K.capitalDuMoment({ reglage, paris: regles, maintenant });
  const avecAttente = K.capitalDuMoment({ reglage, paris: [...regles, pari('x', 'pending', 300, 2, null, '2026-11-09T10:00:00.000Z'), pari('y', 'pending', 150, 2, null, '2026-11-09T11:00:00.000Z')], maintenant });
  assert.equal(avecAttente.montant, sansAttente.montant, 'jamais un capital « disponible » : les attentes vivent dans les plafonds et les paris liés');
  assert.equal(K.baseDeCalcul(avecAttente), K.baseDeCalcul(sansAttente));
  const capital = { indique: true, montant: K.baseDeCalcul(avecAttente) };
  const conseil = (ev, cote) => R.fractionDeMise({ decision: 'RECOMMENDED', ev, cote, reglageMoteur: REGLAGE, capital });
  const a1 = conseil(0.05, 2.1);
  const b1 = conseil(0.08, 1.7);
  const b2 = conseil(0.08, 1.7);
  const a2 = conseil(0.05, 2.1);
  assert.deepEqual(a1, a2, 'le même conseil, avant ou après l’autre');
  assert.deepEqual(b1, b2);
  assert.equal(a1.euros, Number((R.partDeMise({ ev: 0.05, cote: 2.1, reglageMoteur: REGLAGE }) * capital.montant).toFixed(2)));
});

test('T-C4 le plancher X : conseil 0 au-dessous de « plus haut − X », la place qui reste au-dessus ; sans X, rien', () => {
  const base = { decision: 'RECOMMENDED', ev: 0.06, cote: 2.0, reglageMoteur: REGLAGE };
  const sansX = R.fractionDeMise({ ...base, capital: { indique: true, montant: 900, plusHaut: 1200 } });
  assert.ok(sansX.f > 0 && !sansX.raisons.some((r) => r.code === 'plancher'), 'sans chiffre de Pierre : aucun plancher (aucun défaut inventé)');
  const sous = R.fractionDeMise({ ...base, capital: { indique: true, montant: 900, plusHaut: 1200 }, creuxDePierre: 250 });
  assert.equal(sous.f, 0, '900 ≤ 1 200 − 250 : conseil 0');
  assert.equal(sous.euros, 0);
  assert.equal(sous.raisons.at(-1).code, 'plancher');
  assert.match(sous.raisons.at(-1).texte, /votre plancher : 250 € sous votre plus haut, il reste 0 €/);
  const juste = R.fractionDeMise({ ...base, capital: { indique: true, montant: 1000, plusHaut: 1200 }, creuxDePierre: 202 });
  assert.equal(juste.euros, 2, 'il reste 2 € avant le plancher');
  assert.equal(juste.raisons.at(-1).code, 'plancher');
  const loin = R.fractionDeMise({ ...base, capital: { indique: true, montant: 1000, plusHaut: 1000 }, creuxDePierre: 500 });
  assert.ok(!loin.raisons.some((r) => r.code === 'plancher'), 'loin du plancher : rien ne mord');
  // Le plancher ne s'applique jamais sans capital (des euros).
  const sansCapital = R.fractionDeMise({ ...base, capital: { indique: false }, creuxDePierre: 250 });
  assert.equal(sansCapital.euros, null);
  assert.ok(!sansCapital.raisons.some((r) => r.code === 'plancher'));
});
