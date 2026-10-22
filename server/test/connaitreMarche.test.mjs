/**
 * Connaître le marché et le meilleur moment pour parier (étape 22 du plan, 13/10/2026).
 *   node --test test/connaitreMarche.test.mjs        (depuis server/)
 *
 * Deux sortes de vérifications :
 *  1. les RÈGLES et les ANALYSES de src/data/marketKnowledge.js dans le processus du test, sur des relevés
 *     FABRIQUÉS (la classe Releves, celle que remplit la base) dont la vérité est connue d'avance : la
 *     méthode puissance (second chemin : l'exposant cherché ici), les prix d'échange à part (jamais la
 *     méthode puissance, une commission au lieu d'une marge, jamais de valeur de clôture au prix du milieu),
 *     le panier commun (un livre absent d'un match n'avantage personne), la vitesse sur une série dont le
 *     meneur est connu (avance exacte : +100 % et −50 %), les relevés datés (au changement seulement,
 *     l'historique rattrapé jamais pris pour un relevé), des biais plantés, le meilleur moment de trois
 *     championnats fabriqués, la référence du 23/09 et sa fenêtre « déjà vu » ;
 *  2. la NUIT et les LECTURES dans une copie isolée (test/aides/script-connaitre-marche.mjs, phase « nuit ») :
 *     cotes, football-data et résultats PLANTÉS dans la base d'essai, le calcul dans un processus à part
 *     comme chez Pierre, rien de neuf → rien, une cote de plus → recalcul, un échec → rien d'écrit, et les
 *     lectures des étapes 23 et 31 sur une connexion en lecture seule.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import * as K from '../src/data/marketKnowledge.js';
import { removeMargin } from '../src/core/market/marginRemoval.js';
import { coteJouable } from '../src/core/engine/valueFinder.js';
import { comparer, generateur } from '../src/bench/guard.js';
import { fenetresDeclarees } from '../src/bench/lancements.js';

const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-connaitre-marche.mjs');
const proche = (a, b, eps, quoi) => assert.ok(Math.abs(a - b) <= eps, `${quoi} : ${a} ≠ ${b} (± ${eps})`);
const somme = (t) => t.reduce((a, b) => a + b, 0);
const norm = (p) => p.map((x) => x / somme(p));
/** Des cotes dont la méthode puissance rend EXACTEMENT p : 1 / p^(1/k), k > 1. */
const cotesDe = (p, k = 1.12) => p.map((x) => 1 / x ** (1 / k));
const OPTIONS = { tirages: 300 };
const ligne = (lignes, f) => lignes.find(f) ?? null;

/** Des matchs fabriqués : `n` tirages de probabilités vraies et d'issues, à graine. */
function tirages(n, graine) {
  const u = generateur(graine);
  return Array.from({ length: n }, () => {
    const h = 0.25 + 0.4 * u();
    const d = 0.2 + 0.1 * u();
    const p = norm([h, d, Math.max(0.08, 1 - h - d)]);
    const x = u();
    return { p, issue: x < p[0] ? 0 : x < p[0] + p[1] ? 1 : 2, u };
  });
}

// ------------------------------------------------------------ 1. le retrait de marge

test('retrait de marge : la méthode puissance pour un bookmaker — removeMargin à l’identique, l’exposant k retrouvé par un second chemin, l’outsider moins bien servi que par la proportionnelle ; marge = Σ 1/cote − 1 ; une marge impossible signalée, gardée pour la justesse, écartée des marges', async () => {
  const cotes = [1.8, 3.6, 4.75];
  const j = K.probabilitesJustes({ prix: cotes, type: 'bookmaker' });
  assert.deepEqual(j.p, removeMargin(cotes).probabilities);
  const q = cotes.map((o) => 1 / o);
  let bas = 1;
  let haut = 8;
  for (let i = 0; i < 200; i++) {
    const k = (bas + haut) / 2;
    if (somme(q.map((x) => x ** k)) > 1) bas = k;
    else haut = k;
  }
  q.forEach((x, i) => proche(j.p[i], x ** ((bas + haut) / 2), 1e-9, `issue ${i} : p = q^k`));
  proche(somme(j.p), 1, 1e-12, 'somme à 100 %');
  const prop = q.map((x) => x / somme(q));
  assert.ok(j.p[2] < prop[2] && j.p[0] > prop[0], 'la marge pèse plus sur l’outsider que par la proportionnelle');
  proche(j.marge, (somme(q) - 1) * 100, 1e-12, 'marge en %');
  assert.equal(j.anomalie, false);
  assert.equal(j.ecartA100, null);
  // Des cotes fabriquées pour une probabilité connue : la méthode puissance la rend.
  const p = [0.52, 0.27, 0.21];
  K.probabilitesJustes({ prix: cotesDe(p), type: 'bookmaker' }).p.forEach((x, i) => proche(x, p[i], 1e-9, 'probabilité rendue'));
  // Marge négative (Σ 1/cote < 1) : anomalie, lecture proportionnelle de removeMargin.
  const neg = K.probabilitesJustes({ prix: [2.2, 3.9, 4.2], type: 'bookmaker' });
  assert.equal(neg.anomalie, true);
  assert.ok(neg.marge < 0);
  assert.equal(K.probabilitesJustes({ prix: [1.9, 3.3, null], type: 'bookmaker' }), null, 'une issue manquante : pas de cote');
  // Dans les relevés : la cote incohérente compte pour la justesse, jamais pour la marge.
  const R = new K.Releves();
  const l = R.indiceDuLivre('fd|Bet365');
  for (let i = 0; i < 3; i++) R.match(`m${i}`, { date: '2021-03-0' + (i + 1), ligue: 'L', issue: 0 });
  R.ajouter(0, l, 'cloture', cotes);
  R.ajouter(1, l, 'cloture', [2.2, 3.9, 4.2]);
  R.ajouter(2, l, 'cloture', [1.5, 4.0, 7.0]);
  R.ranger({ fenetres: [] });
  const { lignes } = await K.calculerLaConnaissance({ releves: R, options: { ...OPTIONS, minMatchs: 2, mesures: ['marge', 'justesse'] } });
  assert.equal(ligne(lignes, (x) => x.mesure === 'justesse' && x.portee === '*' && x.livre === 'fd|Bet365' && x.cle === 'propres').detail.anomalies, 1, 'gardée (et comptée) pour la justesse');
  const m = ligne(lignes, (x) => x.mesure === 'marge' && x.portee === '*' && x.livre === 'fd|Bet365');
  assert.equal(m.n, 2);
  assert.equal(m.detail.anomaliesEcartees, 1);
  proche(m.valeur, ((somme(q) - 1) * 100 + (1 / 1.5 + 1 / 4 + 1 / 7 - 1) * 100) / 2, 1e-3, 'marge moyenne sans la cote incohérente');
});

// ------------------------------------------------------------ 2. les prix d'échange

test('prix d’échange à part : probabilités ramenées à 100 % (jamais la méthode puissance), pas de marge mais la commission de valueFinder (Betfair 5 %, Smarkets 2 %), un prix « milieu du carnet » jamais pris pour une valeur de clôture ; la clôture de référence = les bookmakers (sans les bourses ni une cote incohérente)', async () => {
  for (const cle of ['kalshi|Kalshi', 'smarkets|Smarkets', 'fd|Betfair Exchange', 'odds-api|betfair_ex_eu', 'odds-api|matchbook']) assert.equal(K.decrireLivre(cle).type, 'bourse', cle);
  for (const cle of ['fd|Pinnacle', 'espn|DraftKings', 'odds-api|williamhill']) assert.equal(K.decrireLivre(cle).type, 'bookmaker', cle);
  assert.equal(K.decrireLivre('fd|Moyenne du marché').type, 'composite');
  assert.equal(K.decrireLivre('fd|Maximum du marché'), null, 'le maximum du marché est écarté');
  // La commission, lue dans valueFinder.js par coteJouable — jamais recopiée.
  assert.equal(K.decrireLivre('fd|Betfair Exchange').commission, 0.05);
  assert.equal(K.decrireLivre('smarkets|Smarkets').commission, 0.02);
  assert.equal(K.commissionDeValueFinder('williamhill'), 0);
  proche(K.prixNet(3, K.decrireLivre('fd|Betfair Exchange')), coteJouable({ key: 'betfair_ex_eu', odds1: 3 }, 'odds1'), 1e-12, 'cote nette = coteJouable');
  assert.equal(K.prixNet(3, K.decrireLivre('fd|Pinnacle')), 3);
  assert.equal(K.decrireLivre('kalshi|Kalshi').prixJouable, false);
  assert.equal(K.decrireLivre('smarkets|Smarkets').prixJouable, false);
  assert.equal(K.decrireLivre('fd|Betfair Exchange').prixJouable, true);
  // Une bourse : la proportionnelle sur les probabilités brutes (somme 102 %), jamais la puissance.
  const probs = [0.48, 0.27, 0.27];
  const b = K.probabilitesJustes({ prix: probs.map((x) => 1 / x), probs, type: 'bourse' });
  b.p.forEach((x, i) => proche(x, probs[i] / 1.02, 1e-12, `bourse, issue ${i}`));
  assert.equal(b.marge, null);
  proche(b.ecartA100, 2, 1e-9, 'écart à 100 %');
  const commeBookmaker = K.probabilitesJustes({ prix: probs.map((x) => 1 / x), type: 'bookmaker' });
  assert.ok(Math.abs(commeBookmaker.p[0] - b.p[0]) > 1e-4, 'la méthode puissance aurait donné autre chose');
  assert.equal(K.probabilitesJustes({ prix: [1.6, 3, 3], probs: [0.5, 0.3, 0.3], type: 'bourse' }).anomalie, true, 'somme à 110 % : prix fictifs');
  // Dans le calcul : les bourses dans la justesse, sans marge ; Kalshi (milieu du carnet) jamais dans le meilleur moment, Betfair (prix d'achat) si.
  const R = new K.Releves();
  const pin = R.indiceDuLivre('fd|Pinnacle');
  const kal = R.indiceDuLivre('kalshi|Kalshi');
  const bfe = R.indiceDuLivre('fd|Betfair Exchange');
  const b365 = R.indiceDuLivre('fd|Bet365');
  const attendu = { somme: 0, n: 0, favori: 0 };
  for (const [i, t] of tirages(300, 5).entries()) {
    const m = R.match(`m${i}`, { date: '2021-04-01', ligue: 'L', issue: t.issue });
    R.ajouter(m, pin, 'releve', cotesDe(t.p, 1.2));
    R.ajouter(m, pin, 'cloture', cotesDe(t.p));
    // Kalshi : un milieu de carnet très « généreux » tôt — s'il était pris pour un prix, il gagnerait ; et sa
    // clôture, décalée : une bourse ne compte pas dans la clôture de référence tant qu'un bookmaker la donne.
    R.ajouter(m, kal, 'ouverture', t.p.map((x) => 1 / (x * 0.8)), t.p.map((x) => x * 0.8));
    const decalee = norm(t.p.map((x, j) => x + (j === 1 ? 0.05 : 0)));
    R.ajouter(m, kal, 'cloture', decalee.map((x) => 1 / x), decalee);
    R.ajouter(m, bfe, 'releve', t.p.map((x) => 1 / (x * 1.01)));
    R.ajouter(m, bfe, 'cloture', t.p.map((x) => 1 / (x * 1.01)));
    // Une clôture incohérente de Bet365 (marge négative, et décalée : sa lecture proportionnelle n'est pas
    // t.p), un match sur deux : jamais dans la référence.
    const faussee = norm(t.p.map((x, j) => x + (j === 0 ? 0.08 : 0)));
    if (i % 2 === 0) R.ajouter(m, b365, 'cloture', faussee.map((x) => 1 / (x * 0.9)));
    // Second chemin : la valeur de clôture attendue — la référence = la clôture de Pinnacle (t.p) ; Betfair au prix net (5 %).
    const fav = t.p[0] >= t.p[2] ? 0 : 2;
    const pinRel = cotesDe(t.p, 1.2);
    const bfeNet = t.p.map((x) => 1 + (1 / (x * 1.01) - 1) * 0.95);
    for (const prix of [pinRel, bfeNet]) {
      attendu.somme += somme(prix.map((o, j) => o * t.p[j])) / 3 - 1;
      attendu.favori += prix[fav] * t.p[fav] - 1;
      attendu.n++;
    }
  }
  R.ranger({ fenetres: [] });
  const { lignes } = await K.calculerLaConnaissance({ releves: R, options: OPTIONS });
  assert.ok(ligne(lignes, (x) => x.mesure === 'justesse' && x.portee === '*' && x.moment === 'cloture' && x.livre === 'kalshi|Kalshi' && x.cle === 'propres'));
  const mk = ligne(lignes, (x) => x.mesure === 'marge' && x.portee === '*' && x.livre === 'kalshi|Kalshi' && x.moment === 'cloture');
  assert.equal(mk.valeur, null, 'une bourse n’a pas de marge');
  assert.equal(mk.detail.type, 'bourse');
  proche(ligne(lignes, (x) => x.mesure === 'marge' && x.portee === '*' && x.livre === 'fd|Betfair Exchange' && x.moment === 'cloture').detail.commission, 0.05, 1e-12, 'la commission à la place');
  const ouverture = ligne(lignes, (x) => x.mesure === 'moment' && x.portee === '*' && x.moment === 'ouverture' && x.cle === 'valeur');
  assert.equal(ouverture, null, 'aucun prix « milieu du carnet » dans le meilleur moment');
  const releve = ligne(lignes, (x) => x.mesure === 'moment' && x.portee === '*' && x.moment === 'releve' && x.cle === 'valeur');
  assert.deepEqual(releve.detail.livres.sort(), ['fd|Betfair Exchange', 'fd|Pinnacle']);
  proche(releve.valeur, (attendu.somme / attendu.n) * 100, 1e-3, 'valeur de clôture au relevé, recalculée à la main');
  proche(releve.detail.parIssue.favori, (attendu.favori / attendu.n) * 100, 1e-3, 'celle du favori');
});

// ------------------------------------------------------------ 3. le panier commun

test('panier commun : un livre présent seulement sur les matchs faciles ne gagne rien — sur leurs matchs communs, deux livres aux mêmes probabilités font jeu égal (écart 0, « pas prouvé ») ; un livre plus juste sur les matchs communs est meneur et retenu ; un livre sous 200 matchs communs n’est pas jugé et ne compte pas dans K', async () => {
  const R = new K.Releves();
  const A = R.indiceDuLivre('espn|Caesars');
  const B = R.indiceDuLivre('espn|Unibet');
  const C = R.indiceDuLivre('espn|FanDuel');
  for (const [i, t] of tirages(800, 11).entries()) {
    const m = R.match(`m${i}`, { date: '2021-05-01', ligue: 'L', issue: t.issue });
    R.ajouter(m, A, 'cloture', cotesDe(t.p));
    const favori = t.p[0] >= t.p[2] ? 0 : 2;
    // B : les MÊMES probabilités que A, mais seulement sur les matchs où le favori a gagné.
    if (t.issue === favori) R.ajouter(m, B, 'cloture', cotesDe(t.p, 1.07));
    if (i < 150) R.ajouter(m, C, 'cloture', cotesDe(t.p));
  }
  // Les fenêtres « déjà vu » du code : des matchs de 2021, jamais vus.
  R.ranger();
  assert.ok(R.matchs.every((m) => m.vue === -1));
  const { lignes, bilan } = await K.calculerLaConnaissance({ releves: R, options: { ...OPTIONS, mesures: ['justesse'] } });
  const propres = (cle) => ligne(lignes, (x) => x.mesure === 'justesse' && x.portee === '*' && x.moment === 'cloture' && x.livre === cle && x.cle === 'propres');
  assert.ok(propres('espn|Unibet').valeur < propres('espn|Caesars').valeur - 0.2, 'sur SES matchs, B paraît bien plus juste');
  const paire = ligne(lignes, (x) => x.mesure === 'justesse' && x.portee === '*' && x.moment === 'cloture' && x.cle.startsWith('paire|') && [x.livre, x.detail.autre].sort().join() === 'espn|Caesars,espn|Unibet');
  proche(paire.detail.perteLog, paire.detail.perteLogAutre, 1e-12, 'sur les matchs communs : jeu égal');
  const face = ligne(lignes, (x) => x.mesure === 'justesse' && x.portee === '*' && x.moment === 'cloture' && x.cle.startsWith('face|') && [x.livre, x.detail.autre].sort().join() === 'espn|Caesars,espn|Unibet');
  assert.equal(face.verdict, 'pas-prouve');
  proche(face.valeur, 0, 1e-12, 'écart nul');
  assert.equal(face.n, paire.n);
  // Jamais vus : la même comparaison sur les seules lignes jamais vues — ici toutes.
  const jamais = ligne(lignes, (x) => x.mesure === 'justesse' && x.portee === '*' && x.cle === `${face.cle}|jamais-vues`);
  assert.deepEqual([jamais.n, jamais.detail.vues.dejaVues], [face.n, 0]);
  // FanDuel : 150 matchs communs, jamais jugé, hors de K, hors du classement du meneur.
  assert.equal(ligne(lignes, (x) => x.mesure === 'justesse' && x.cle.startsWith('face|') && (x.livre === 'espn|FanDuel' || x.detail.autre === 'espn|FanDuel')), null);
  const men0 = ligne(lignes, (x) => x.mesure === 'justesse' && x.portee === '*' && x.moment === 'cloture' && x.cle === 'meneur');
  assert.ok(!men0.detail.classement.some((c) => c.livre === 'espn|FanDuel'), 'une paire sous 200 matchs ne compte pas pour le meneur');
  assert.equal(bilan.comptes.justesse.K, lignes.filter((x) => x.mesure === 'justesse' && x.cle.startsWith('face|') && x.n >= 200).length);
  assert.equal(face.detail.variantes, bilan.comptes.justesse.K, 'la fourchette élargie pour toutes les comparaisons jugées');
  // Même juge que l'étape 16 : la ligne du verdict est celle de comparer sur les mêmes lignes, même graine.
  const lignesJuge = [];
  for (let m = 0; m < R.matchs.length; m++) {
    const ks = [];
    for (let j = R.debuts[m]; j < R.debuts[m + 1]; j++) ks.push(R.ordre[j]);
    const kA = ks.find((k) => R.eLivre[k] === A);
    const kB = ks.find((k) => R.eLivre[k] === B);
    if (kA === undefined || kB === undefined) continue;
    const pl = (k) => -Math.log(R.eP[k * 3 + R.matchs[m].issue]);
    const [a, b] = face.livre === 'espn|Caesars' ? [pl(kB), pl(kA)] : [pl(kA), pl(kB)];
    lignesJuge.push({ bloc: m, a, b });
  }
  const r = comparer(lignesJuge, { sens: 'min', variantes: bilan.comptes.justesse.K, tirages: 300, graine: 1 });
  assert.deepEqual([r.verdict, r.n.matchs], [face.verdict, face.n]);
  // Un livre B plus juste sur les matchs communs : meneur, et retenu face à A.
  const R2 = new K.Releves();
  const A2 = R2.indiceDuLivre('espn|Caesars');
  const B2 = R2.indiceDuLivre('espn|Unibet');
  for (const [i, t] of tirages(3000, 12).entries()) {
    const m = R2.match(`m${i}`, { date: '2021-05-01', ligue: 'L', issue: t.issue });
    R2.ajouter(m, B2, 'cloture', cotesDe(t.p));
    R2.ajouter(m, A2, 'cloture', cotesDe(norm(t.p.map((x) => x + (t.u() - 0.5) * 0.2))));
  }
  R2.ranger({ fenetres: [] });
  const r2 = await K.calculerLaConnaissance({ releves: R2, options: { ...OPTIONS, mesures: ['justesse'] } });
  const men = ligne(r2.lignes, (x) => x.mesure === 'justesse' && x.portee === '*' && x.moment === 'cloture' && x.cle === 'meneur');
  assert.equal(men.livre, 'espn|Unibet');
  assert.equal(ligne(r2.lignes, (x) => x.mesure === 'justesse' && x.portee === '*' && x.cle === 'face|espn|Caesars').verdict, 'retenu');
  // Le piège du panier : B moins juste que A sur leurs matchs communs, mais présent seulement sur les matchs
  // faciles — sur SES matchs, B paraît le plus juste ; le meneur, jugé sur les matchs communs, est A.
  const R3 = new K.Releves();
  const A3 = R3.indiceDuLivre('espn|Caesars');
  const B3 = R3.indiceDuLivre('espn|Unibet');
  const D3 = R3.indiceDuLivre('espn|DraftKings');
  for (const [i, t] of tirages(1500, 13).entries()) {
    const m = R3.match(`m${i}`, { date: '2021-05-01', ligue: 'L', issue: t.issue });
    R3.ajouter(m, A3, 'cloture', cotesDe(t.p));
    // Un troisième livre, partout et moins juste : là où B manque, A et lui restent (deux livres sur le match).
    R3.ajouter(m, D3, 'cloture', cotesDe(norm(t.p.map((x) => x + (t.u() - 0.5) * 0.3))));
    const favori = t.p[0] >= t.p[2] ? 0 : 2;
    if (t.issue === favori) R3.ajouter(m, B3, 'cloture', cotesDe(norm(t.p.map((x) => x + (t.u() - 0.5) * 0.2))));
  }
  R3.ranger({ fenetres: [] });
  const r3 = await K.calculerLaConnaissance({ releves: R3, options: { ...OPTIONS, mesures: ['justesse'] } });
  const propres3 = (cle) => ligne(r3.lignes, (x) => x.mesure === 'justesse' && x.portee === '*' && x.livre === cle && x.cle === 'propres').valeur;
  assert.ok(propres3('espn|Unibet') < propres3('espn|Caesars'), 'sur SES matchs, B paraît le plus juste');
  assert.equal(ligne(r3.lignes, (x) => x.mesure === 'justesse' && x.portee === '*' && x.moment === 'cloture' && x.cle === 'meneur').livre, 'espn|Caesars', 'jugé sur les matchs communs, A mène');
  const faceB = ligne(r3.lignes, (x) => x.mesure === 'justesse' && x.portee === '*' && x.cle === 'face|espn|Unibet');
  const paireB = ligne(r3.lignes, (x) => x.mesure === 'justesse' && x.portee === '*' && x.cle.startsWith('paire|') && [x.livre, x.detail.autre].sort().join() === 'espn|Caesars,espn|Unibet');
  assert.equal(faceB.n, paireB.n, 'le juge sur les seuls matchs où les DEUX livres cotent');
});

// ------------------------------------------------------------ 4. la vitesse

test('vitesse : sur une série fabriquée où un livre est déjà au prix de clôture au relevé et les deux autres pas encore, son avance vaut exactement +100 % et la leur −50 % ; il est meneur et « bouge avant » les deux au-delà du hasard ; aucun match sans le moment tôt n’emprunte les livres d’un autre', async () => {
  const R = new K.Releves();
  const L = R.indiceDuLivre('fd|Pinnacle');
  const F1 = R.indiceDuLivre('fd|Bet365');
  const F2 = R.indiceDuLivre('fd|William Hill');
  for (const [i, t] of tirages(400, 21).entries()) {
    const m = R.match(`m${i}`, { date: '2020-02-01', ligue: 'L', issue: t.issue });
    const avant = norm(t.p.map((x) => x + (t.u() - 0.5) * 0.1));
    R.ajouter(m, L, 'releve', cotesDe(t.p));
    R.ajouter(m, F1, 'releve', cotesDe(avant, 1.15));
    R.ajouter(m, F2, 'releve', cotesDe(avant, 1.2));
    for (const l of [L, F1, F2]) R.ajouter(m, l, 'cloture', cotesDe(t.p, 1.1));
  }
  // Des matchs avec des relevés datés « h-3 » seulement pour UN livre : jamais mêlés à la paire du relevé.
  for (let i = 0; i < 50; i++) {
    const m = R.match(`x${i}`, { date: '2020-03-01', ligue: 'L', issue: 0 });
    R.ajouter(m, L, 'h-3', cotesDe([0.5, 0.3, 0.2]));
  }
  R.ranger({ fenetres: [] });
  const { lignes } = await K.calculerLaConnaissance({ releves: R, options: { ...OPTIONS, mesures: ['vitesse'] } });
  const avance = (cle) => ligne(lignes, (x) => x.mesure === 'vitesse' && x.portee === '*' && x.moment === 'releve' && x.livre === cle && x.cle === 'avance');
  proche(avance('fd|Pinnacle').valeur, 1, 1e-6, 'le meneur : tout le mouvement déjà fait');
  proche(avance('fd|Bet365').valeur, -0.5, 1e-6, 'un suiveur');
  proche(avance('fd|William Hill').valeur, -0.5, 1e-6, 'l’autre suiveur');
  assert.equal(avance('fd|Pinnacle').n, 400);
  assert.equal(ligne(lignes, (x) => x.mesure === 'vitesse' && x.portee === '*' && x.moment === 'releve' && x.cle === 'meneur').livre, 'fd|Pinnacle');
  for (const autre of ['fd|Bet365', 'fd|William Hill']) {
    const f = ligne(lignes, (x) => x.mesure === 'vitesse' && x.portee === '*' && x.moment === 'releve' && x.cle === `face|${autre}`);
    assert.equal(f.verdict, 'retenu', autre);
    proche(f.detail.avanceMeneur, 1, 1e-6, 'sur les matchs communs');
    proche(f.detail.avanceAutre, -0.5, 1e-6, 'sur les matchs communs');
  }
  assert.equal(ligne(lignes, (x) => x.mesure === 'vitesse' && x.moment === 'h-3'), null, 'un seul livre à trois heures : rien à mesurer');
});

test('relevés datés : la cote d’un instant est celle du dernier relevé avant lui (une série s’écrit au changement), suivie jusqu’à la clôture ; un historique rattrapé (relevé après le coup d’envoi) n’est jamais un relevé daté ; « après les compos » 45 min avant, « juste avant » au plus 15 min avant ; le relevé payant : le dernier complet avant le coup d’envoi', () => {
  const K0 = Date.parse('2026-10-04T18:00:00.000Z');
  const t = (min) => K0 - min * 60_000;
  const trois = (kind, ti, prix) => ['home', 'draw', 'away'].map((selection, i) => ({ selection, kind, t: ti, price: prix[i], prob: null }));
  const lignes = [
    ...trois('open', t(2000), [2.0, 3.4, 3.9]),
    ...trois('snapshot', t(2000), [2.0, 3.4, 3.9]),
    // Au changement seulement : le domicile seul bouge à H−4 h, l'extérieur à H−50 min, le nul à H−30 min.
    { selection: 'home', kind: 'snapshot', t: t(240), price: 1.9, prob: null },
    { selection: 'away', kind: 'snapshot', t: t(50), price: 4.0, prob: null },
    { selection: 'draw', kind: 'snapshot', t: t(30), price: 3.6, prob: null },
    ...trois('close', t(8), [1.88, 3.6, 4.1])
  ];
  const ms = K.momentsDUnLivre(lignes, { kickoffMs: K0, serieDatee: true });
  const de = (m) => ms.find((x) => x.moment === m) ?? null;
  assert.deepEqual(de('ouverture').prix, [2.0, 3.4, 3.9]);
  assert.deepEqual(de('cloture').prix, [1.88, 3.6, 4.1]);
  assert.deepEqual(de('h-3').prix, [1.9, 3.4, 3.9], 'à H−3 h : le domicile de H−4 h, le reste de l’ouverture');
  assert.deepEqual(de('apres-compos').prix, [1.9, 3.4, 4.0], 'à H−45 min : l’extérieur de H−50 min, le nul pas encore bougé');
  assert.deepEqual(de('juste-avant').prix, [1.88, 3.6, 4.1], 'le dernier relevé, à H−8 min');
  // Le relevé du vendredi/mardi (football-data) : un moment à lui, jamais l'ouverture.
  assert.deepEqual(K.momentsDUnLivre(trois('preclose', t(1500), [2.1, 3.3, 3.6]), { kickoffMs: K0 }).map((x) => x.moment), ['releve']);
  // Un historique rattrapé : ouverture et clôture datées APRÈS le coup d'envoi, aucune série — pas de moment daté.
  const histo = [...trois('open', K0 + 86_400_000, [2.0, 3.4, 3.9]), ...trois('close', K0 + 86_400_000, [1.9, 3.5, 4.0])];
  assert.deepEqual(K.momentsDUnLivre(histo, { kickoffMs: K0, serieDatee: true }).map((x) => x.moment).sort(), ['cloture', 'ouverture']);
  // Une série d'avant-match suivie jusqu'au coup d'envoi, sa clôture écrite APRÈS lui (comme ESPN) : la cote de
  // H−3 h et de H−45 min est celle du dernier changement (H−4 h) ; pas de « juste avant » daté (dernier relevé H−4 h).
  const espn = [...trois('snapshot', t(2000), [2.0, 3.4, 3.9]), { selection: 'home', kind: 'snapshot', t: t(240), price: 1.9, prob: null }, ...trois('close', K0 + 600_000, [1.85, 3.5, 4.3])];
  const me = K.momentsDUnLivre(espn, { kickoffMs: K0, serieDatee: true });
  assert.deepEqual(me.map((x) => x.moment).sort(), ['apres-compos', 'cloture', 'h-3']);
  assert.deepEqual(me.find((x) => x.moment === 'h-3').prix, [1.9, 3.4, 3.9]);
  // Une série commencée APRÈS H−3 h : ni h-3 ; terminée 40 min avant sans clôture écrite : ni après les compos (pas suivie à H−45 ? si : relevé à H−40), ni juste avant.
  const tard = [...trois('snapshot', t(100), [2.0, 3.4, 3.9]), ...trois('snapshot', t(40), [2.1, 3.4, 3.7])];
  assert.deepEqual(K.momentsDUnLivre(tard, { kickoffMs: K0, serieDatee: true }).map((x) => x.moment).sort(), ['apres-compos']);
  // Le relevé payant : le dernier relevé complet avant le coup d'envoi (un relevé après est ignoré).
  const payant = [...trois('snapshot', t(3000), [2.0, 3.4, 3.9]), ...trois('snapshot', t(600), [2.05, 3.4, 3.8]), ...trois('snapshot', K0 + 60_000, [1.5, 4, 6])];
  assert.deepEqual(K.momentsDUnLivre(payant, { kickoffMs: K0, payant: true }).find((x) => x.moment === 'releve-payant').prix, [2.05, 3.4, 3.8]);
  assert.deepEqual(K.momentsDUnLivre(payant, { kickoffMs: K0 }).map((x) => x.moment), [], 'sans « payant » ni « série datée », un instantané n’est rien');
});

// ------------------------------------------------------------ 5. les biais

test('biais : un livre qui annonce le nul 4 points trop bas et une grande équipe 6 points trop bas — « sous-estime » les deux, au-delà du hasard ; le domicile juste : pas de biais prouvé ; les grandes équipes sont les 3 premiers de la SAISON D’AVANT (jamais celle du match)', async () => {
  const R = new K.Releves();
  const B = R.indiceDuLivre('fd|Bet365');
  const tables = new Map();
  // La saison d'avant : les clubs 1, 2, 3 en tête (assez de matchs par équipe) ; le club 9 gagne tout CETTE saison.
  const saison = (s, gagnants) => {
    const t = new Map();
    for (let c = 1; c <= 10; c++) t.set(`fd:${c}`, { pts: gagnants.includes(c) ? 80 - gagnants.indexOf(c) : 20 + c, diff: 0, pour: 0, joues: 18 });
    tables.set(`fd:E0|${s}`, t);
  };
  saison('2019-20', [1, 2, 3]);
  saison('2020-21', [9, 8, 7]);
  // Une saison trop courte (5 matchs par équipe) n'a pas de grandes équipes.
  tables.set('fd:E0|2018-19', new Map([...Array(10).keys()].map((c) => [`fd:${c + 1}`, { pts: 30 - c, diff: 0, pour: 0, joues: 5 }])));
  const premiers = K.premiersDesTables(tables);
  assert.deepEqual([...premiers.get('fd:E0|2019-20')].sort(), ['fd:1', 'fd:2', 'fd:3']);
  assert.equal(premiers.has('fd:E0|2018-19'), false);
  const u = generateur(31);
  let outsiderAnnonce = 0;
  let outsiders = 0;
  for (let i = 0; i < 6000; i++) {
    const grand = i % 3 === 0;
    const dom = grand ? 1 + (Math.floor(i / 3) % 3) : 4 + (i % 6);
    const ext = 9 - (i % 2);
    const h = grand ? 0.62 : 0.35 + 0.2 * u();
    const p = norm([h, 0.27, Math.max(0.08, 1 - h - 0.27)]);
    const x = u();
    const issue = x < p[0] ? 0 : x < p[0] + p[1] ? 1 : 2;
    // L'annonce : le nul toujours 4 points trop bas ; la grande équipe (à domicile) 6 points trop bas ; le
    // domicile des autres matchs 3 points trop haut — en moyenne, le domicile est juste (2/3 × −3 + 1/3 × +6 = 0).
    const a = grand ? [p[0] - 0.06, p[1] - 0.04, p[2] + 0.1] : [p[0] + 0.03, p[1] - 0.04, p[2] + 0.01];
    if (a[0] !== a[2]) {
      outsiderAnnonce += Math.min(a[0], a[2]);
      outsiders++;
    }
    const m = R.match(`m${i}`, { date: '2020-10-01', ligue: 'L', issue, grp: 'fd:E0', saison: '2020-21', dom: `fd:${dom}`, ext: `fd:${ext}` });
    R.ajouter(m, B, 'cloture', cotesDe(a));
    // Le même livre au relevé, autrement : ses biais se mesurent à la clôture, qu'il a pour plus de 200 matchs.
    R.ajouter(m, B, 'releve', cotesDe(p));
  }
  R.ranger({ fenetres: [], premiers });
  assert.equal(R.matchs[0].grande, 1, 'le club 1, 3e ou mieux la saison d’avant, à domicile');
  assert.equal(R.matchs[1].grande, 0, 'les clubs 7 à 9 (en tête CETTE saison) ne sont pas de grandes équipes');
  const { lignes } = await K.calculerLaConnaissance({ releves: R, options: { ...OPTIONS, mesures: ['biais'] } });
  const b = (cat) => ligne(lignes, (x) => x.mesure === 'biais' && x.portee === '*' && x.livre === 'fd|Bet365' && x.cle === cat);
  assert.equal(b('nuls').verdict, 'retenu');
  assert.equal(b('nuls').detail.dit, 'sous-estime');
  proche(b('nuls').valeur, 4, 1.5, 'environ +4 points');
  assert.equal(b('grandes-equipes').verdict, 'retenu');
  proche(b('grandes-equipes').valeur, 6, 2.5, 'environ +6 points');
  assert.equal(b('grandes-equipes').n, 2000);
  assert.equal(b('domicile').verdict, 'pas-prouve');
  assert.equal(b('nuls').moment, 'cloture');
  assert.equal(b('outsiders').n, outsiders);
  proche(b('outsiders').detail.annonce, outsiderAnnonce / outsiders, 1e-5, 'l’outsider : l’équipe la moins probable selon le livre');
  assert.ok(b('nuls').bas > 0 && b('nuls').haut > b('nuls').valeur, 'la fourchette du juge, en points');
  assert.equal(b('nuls').detail.variantes, lignes.filter((x) => x.mesure === 'biais' && x.n >= 200).length, 'K = toutes les cases d’au moins 200 matchs');
});

// ------------------------------------------------------------ 6. le meilleur moment

test('meilleur moment : trois championnats fabriqués — relevé moins chargé qu’à la clôture → « tôt (relevé du vendredi/mardi) », l’inverse → « juste avant », pareil → « pas de moment meilleur prouvé » ; l’ouverture et le relevé jamais mêlés ; la règle de conclusion', async () => {
  const R = new K.Releves();
  const P = R.indiceDuLivre('fd|Pinnacle');
  const D = R.indiceDuLivre('espn|DraftKings');
  const tot = { somme: 0, n: 0 };
  for (const [i, t] of tirages(1800, 41).entries()) {
    const ligue = ['Tôt', 'Tard', 'Pareil'][i % 3];
    const m = R.match(`m${i}`, { date: '2021-09-01', ligue, issue: t.issue });
    const k = { Tôt: [1.03, 1.12], Tard: [1.12, 1.03], Pareil: [1.06, 1.06] }[ligue];
    R.ajouter(m, P, 'releve', cotesDe(t.p, k[0]));
    R.ajouter(m, P, 'cloture', cotesDe(t.p, k[1]));
    if (i < 300) {
      R.ajouter(m, D, 'ouverture', cotesDe(t.p, 1.2));
      R.ajouter(m, D, 'cloture', cotesDe(t.p, 1.06));
    }
    // Second chemin : la référence = la moyenne des clôtures justes (toutes égales à t.p ici).
    if (ligue === 'Tôt') {
      tot.somme += somme(cotesDe(t.p, k[0]).map((o, j) => o * t.p[j])) / 3 - 1;
      tot.n++;
    }
  }
  R.ranger({ fenetres: [] });
  const { lignes, bilan } = await K.calculerLaConnaissance({ releves: R, options: { ...OPTIONS, mesures: ['moment'] } });
  proche(ligne(lignes, (x) => x.mesure === 'moment' && x.portee === 'Tôt' && x.moment === 'releve' && x.cle === 'valeur').valeur, (tot.somme / tot.n) * 100, 1e-3, 'valeur de clôture au relevé, à la main');
  const faces = lignes.filter((x) => x.mesure === 'moment' && x.cle.startsWith('face|'));
  assert.equal(bilan.comptes.moment.K, faces.filter((x) => x.n >= 200).length);
  for (const f of faces) assert.equal(f.detail.variantes, bilan.comptes.moment.K, 'chaque comparaison élargie pour toutes celles jugées');
  const conclusion = (portee) => ligne(lignes, (x) => x.mesure === 'moment' && x.portee === portee && x.cle === 'conclusion');
  assert.equal(conclusion('Tôt').detail.conclusion, 'releve');
  assert.equal(conclusion('Tôt').detail.phrase, 'mieux vaut parier tôt (relevé du vendredi/mardi)');
  assert.equal(conclusion('Tard').detail.conclusion, 'juste-avant');
  assert.equal(conclusion('Pareil').detail.conclusion, null);
  assert.equal(conclusion('Pareil').detail.phrase, 'pas de moment meilleur prouvé');
  assert.equal(conclusion('Pareil').n, 600);
  // L'ouverture (DraftKings) et le relevé (Pinnacle) : jamais comparés entre eux, chacun face à SA clôture.
  assert.equal(ligne(lignes, (x) => x.mesure === 'moment' && x.moment === 'releve' && x.cle === 'face|ouverture'), null);
  assert.equal(ligne(lignes, (x) => x.mesure === 'moment' && x.moment === 'ouverture' && x.cle === 'face|releve'), null);
  const ouv = ligne(lignes, (x) => x.mesure === 'moment' && x.portee === '*' && x.moment === 'ouverture' && x.cle === 'face|juste-avant');
  assert.equal(ouv.detail.cotes, 300, 'l’ouverture face à la clôture du MÊME livre seulement');
  // Par type d'issue, pour tous les championnats : une conclusion par type.
  assert.deepEqual(lignes.filter((x) => x.mesure === 'moment' && x.portee === '*' && x.cle.startsWith('conclusion|')).map((x) => x.cle).sort(), ['conclusion|favori', 'conclusion|nul', 'conclusion|outsider']);
  // La règle seule.
  const c = (comps) => K.conclusionDuMoment(comps);
  assert.equal(c([{ tot: 'releve', tard: 'juste-avant', verdict: 'moins-bon' }]).conclusion, 'releve');
  assert.equal(c([{ tot: 'releve', tard: 'juste-avant', verdict: 'moins-bon' }, { tot: 'ouverture', tard: 'juste-avant', verdict: 'moins-bon' }]).conclusion, 'tot');
  assert.equal(c([{ tot: 'apres-compos', tard: 'juste-avant', verdict: 'retenu' }, { tot: 'releve', tard: 'apres-compos', verdict: 'retenu' }]).conclusion, 'juste-avant', 'juste avant bat après les compos, qui bat le relevé');
  assert.equal(c([{ tot: 'releve', tard: 'juste-avant', verdict: 'moins-bon' }, { tot: 'ouverture', tard: 'apres-compos', verdict: 'retenu' }]).conclusion, null, 'deux gagnants qui ne sont pas tous deux « tôt » : rien');
  assert.equal(c([{ tot: 'releve', tard: 'juste-avant', verdict: 'moins-bon' }, { tot: 'releve', tard: 'apres-compos', verdict: 'pas-prouve' }]).conclusion, null, 'le relevé bat « juste avant » mais pas « après les compos » : rien');
  assert.equal(c([{ tot: 'releve', tard: 'juste-avant', verdict: 'pas-prouve' }]).phrase, 'pas de moment meilleur prouvé');
  assert.equal(c([{ tot: 'releve', tard: 'juste-avant', verdict: 'pas-assez-de-matchs' }]).phrase, 'trop peu de matchs pour juger');
});

// ------------------------------------------------------------ 7. le 23/09

test('le 23/09 : sa fenêtre (07/2023 → 23/09/2026, la justesse des bookmakers) est déclarée jour par jour ; « retrouvé » = Pinnacle meneur, 0,9925 à 0,0005 près, 15 885 matchs à 1 % près ; le panier : relevé football-data, 18 championnats à fichier saisonnier, rencontres rattachées', async () => {
  const fenetres = fenetresDeclarees({ portee: 'marche' });
  for (let t = Date.parse(`${K.FENETRE_23_09.de}T12:00:00Z`); t <= Date.parse(`${K.FENETRE_23_09.a}T12:00:00Z`); t += 86_400_000) {
    const j = new Date(t).toISOString().slice(0, 10);
    assert.ok(fenetres.some((f) => j >= f.de && j <= f.a), `${j} : déjà vu par le 23/09`);
  }
  assert.equal(K.referenceRetrouvee({ meneur: 'fd|Pinnacle', mesure: { perteLog: 0.9925, matchs: 15_878 } }), true);
  assert.equal(K.referenceRetrouvee({ meneur: 'fd|Pinnacle', mesure: { perteLog: 0.9931, matchs: 15_878 } }), false, 'perte log trop loin');
  assert.equal(K.referenceRetrouvee({ meneur: 'fd|Pinnacle', mesure: { perteLog: 0.9925, matchs: 15_600 } }), false, 'panier trop différent');
  assert.equal(K.referenceRetrouvee({ meneur: 'fd|Bet365', mesure: { perteLog: 0.9925, matchs: 15_885 } }), false, 'un autre meneur');
  // Le panier : seuls les matchs rattachés (lien 1) des 18 championnats, dans la fenêtre, au relevé.
  const R = new K.Releves();
  const P = R.indiceDuLivre('fd|Pinnacle');
  const B = R.indiceDuLivre('fd|Bet365');
  for (const [i, t] of tirages(900, 51).entries()) {
    const dedans = i % 3 !== 0;
    const m = R.match(`m${i}`, { date: dedans ? '2024-01-10' : '2023-06-30', ligue: 'EPL', issue: t.issue, lien: i % 9 === 1 ? 0 : 1, code: i % 9 === 2 ? 'ARG' : 'E0' });
    R.ajouter(m, P, 'releve', cotesDe(t.p));
    R.ajouter(m, B, 'releve', cotesDe(norm(t.p.map((x) => x + (t.u() - 0.5) * 0.15))));
    R.ajouter(m, P, 'cloture', cotesDe(t.p));
  }
  // Les fenêtres du code : le 10/01/2024 est déjà vu (règle de value du 23/09), le 30/06/2023 jamais.
  R.ranger();
  assert.ok(R.matchs.filter((m) => m.date === '2024-01-10').every((m) => m.vue >= 0));
  assert.ok(R.matchs.filter((m) => m.date === '2023-06-30').every((m) => m.vue === -1));
  const { lignes, resume } = await K.calculerLaConnaissance({ releves: R, options: { ...OPTIONS, mesures: ['reproduction'] } });
  const pin = ligne(lignes, (x) => x.mesure === 'reproduction' && x.livre === 'fd|Pinnacle' && x.cle === 'propres');
  const attendus = R.matchs.filter((m) => m.lien === 1 && m.code === 'E0' && m.date === '2024-01-10').length;
  assert.equal(pin.n, attendus);
  assert.equal(resume.reproduction.meneur, 'fd|Pinnacle');
  assert.equal(resume.reproduction.retrouve, false, 'des matchs fabriqués ne sont pas la référence');
});

// ------------------------------------------------------------ 8. la nuit et les lectures

/** La nuit réelle, une fois pour le fichier : une copie isolée, des cotes plantées, le calcul à part comme chez Pierre. */
let nuit = null;
function laNuit() {
  if (nuit) return nuit;
  const copie = preparerCopie({});
  try {
    // Les scripts du serveur avec : l'actualisation (dont l'étape est essayée ici) en importe.
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    const r = executer(copie, SCRIPT, { args: ['nuit'], timeout: 240_000 });
    assert.equal(r.code, 0, r.erreurs.slice(-3000));
    assert.equal(r.reseau, false, 'aucun appel réseau');
    assert.ok(r.json, `sortie illisible : ${r.sortie.slice(-500)}`);
    nuit = r.json;
    return nuit;
  } finally {
    copie.nettoyer();
  }
}

test('le chargement : le 1N2 d’un match prolongé réglé sur la 90e minute, un match attribué sans issue, les livres de football-data pris dans fd_history seulement (jamais deux fois), le maximum du marché écarté, chaque source à son moment, les grandes équipes de la saison d’avant', () => {
  const c = laNuit().chargement;
  assert.equal(c.prolongee, 1, '1-1 à la 90e, 2-1 après prolongation : le nul');
  assert.equal(c.attribuee, -1, 'attribué : aucune issue');
  assert.equal(c.fd, 300);
  assert.deepEqual(c.bilan.fdEcartees, { scoreDifferent: 1, rattachementIncertain: 0 }, 'la ligne au score différent du magasin écartée');
  assert.equal(c.pinnacleSurLeMagasin, 0, 'Pinnacle de football-data : fd_history seulement');
  assert.ok(!c.livres.includes('fd|Maximum du marché'));
  assert.deepEqual(c.livres, ['espn|DraftKings', 'fd|Bet365', 'fd|Betfair Exchange', 'fd|Moyenne du marché', 'fd|Pinnacle', 'fd|William Hill', 'kalshi|Kalshi', 'odds-api|pinnacle']);
  for (const [cle, n] of [['espn|DraftKings|ouverture', 400], ['espn|DraftKings|cloture', 401], ['fd|Betfair Exchange|releve', 400], ['fd|Betfair Exchange|cloture', 400], ['kalshi|Kalshi|cloture', 400], ['odds-api|pinnacle|releve-payant', 40], ['fd|Pinnacle|releve', 300], ['fd|Pinnacle|cloture', 300], ['fd|William Hill|cloture', 300]]) {
    assert.equal(c.parLivreMoment[cle], n, cle);
  }
  assert.equal(Object.keys(c.parLivreMoment).filter((k) => k.endsWith('|ouverture')).length, 1, 'l’ouverture : DraftKings seul (le relevé de football-data n’en est jamais une)');
  assert.equal(c.grandes['2024'], 0, 'la première saison du magasin : pas de saison d’avant');
  assert.ok(c.grandes['2025'] > 0, 'la saison d’après : les 3 premiers de 2024');
  assert.equal(c.bilan.rencontres, 700);
});

test('la nuit : l’étape « connaitreMarche » après les cotes gratuites et avant le gel ; premier calcul (processus à part) puis rien quand rien n’a bougé ; une cote de plus → recalcul, les lignes de l’ancien calcul retirées ; un échec n’écrit rien et le précédent reste lu', () => {
  const n = laNuit();
  const i = n.etapes.indexOf('connaitreMarche');
  assert.equal(n.etapes[i - 1], 'cotesGratuites');
  // Étape 29 (14/10/2026) : l'indice de force s'intercale juste après, toujours avant le gel.
  assert.equal(n.etapes[i + 1], 'indiceForce');
  // Étape 27 (21/10/2026) : les forces de buts s'intercalent après l'indice de force, toujours avant le gel.
  assert.equal(n.etapes[i + 2], 'forcesButs');
  // Étape 30 (22/10/2026) : les fiches des joueurs s'intercalent après les forces de buts, toujours avant le gel.
  assert.equal(n.etapes[i + 3], 'fichesJoueurs');
  assert.equal(n.etapes[i + 4], 'gelPronostics');
  assert.ok(n.etapes.indexOf('sauvegarde') > i, 'dans la sauvegarde de la nuit');
  assert.equal(n.etapes.filter((k) => k === 'connaitreMarche').length, 1);
  assert.equal(n.dueAvant, true);
  assert.deepEqual(n.due, { jamais: true, aujourdhui: false, hier: true, clic: true });
  // Le premier calcul.
  assert.equal(n.premier.details.mode, 'premier');
  assert.ok(['ok', 'warn'].includes(n.premier.status));
  assert.match(n.premier.summary, /^Premier calcul n° 1 : .* rencontres, .* cotes de .* livres, .* lignes rangées en .* \(calcul à part .* Mo chez lui ; rangement .*, le serveur jamais tenu plus de \d+ ms d'affilée\) — le plus juste : .* ; bouge le premier : .* ; .* ; meilleur moment \(tous championnats\) : .*\. Mesuré seulement : le moteur ne lit rien d’ici\.$/);
  assert.deepEqual([n.premier.comptes.runs, n.premier.comptes.finis, n.premier.comptes.calculs], [1, 1, [1]]);
  assert.ok(n.premier.comptes.lignes > 50);
  assert.ok(n.premier.details.calculAPart.rssMax > 0, 'la mémoire de l’enfant');
  assert.equal(n.premier.details.calculAPart.comptes.justesse.doublons, 1, 'le second événement ESPN de la même rencontre : compté, jamais pris');
  // Rien de neuf : rien.
  assert.equal(n.rien.mode, 'rien');
  assert.match(n.rien.summary, /^Rien à refaire : aucune cote, aucun résultat ni historique football-data n’a bougé depuis le calcul n° 1 /);
  assert.deepEqual(n.rien.comptes, n.premier.comptes, 'rien écrit, pas même une fiche de calcul');
  // Une cote de plus : recalcul, une seule série de lignes, celle du calcul n° 2.
  assert.equal(n.recalcul.mode, 'recalcul');
  assert.equal(n.recalcul.calcul, 2);
  assert.deepEqual([n.recalcul.comptes.runs, n.recalcul.comptes.finis, n.recalcul.comptes.calculs], [2, 2, [2]]);
  // Un échec : la fiche reste « pas finie » avec son erreur, les lignes du n° 2 restent, et c'est lui qu'on lit.
  assert.equal(n.echec.mode, 'echec');
  assert.equal(n.echec.finiLe, null);
  assert.ok(n.echec.bilan.erreur.length > 5);
  assert.deepEqual(n.echec.comptes.calculs, [2]);
  assert.equal(n.echec.dernier, 2);
  assert.equal(n.apresEchec.mode, 'recalcul');
  assert.deepEqual(n.apresEchec.comptes.calculs, [n.apresEchec.calcul]);
  assert.equal(n.apresEchec.comptes.finis, 3);
});

test('les lectures des étapes 23 et 31 (sur une connexion en lecture seule) : null avant tout calcul ; puis le dernier calcul fini, chaque ligne avec son nombre de matchs ; filtres par championnat, livre et mesure ; le plus juste, le meilleur moment, la marge (la bourse : sa commission)', () => {
  const n = laNuit();
  assert.deepEqual(n.avant, { lire: null, juste: null, moment: null, marge: null });
  const l = n.lecture;
  assert.equal(l.calcul.id, n.apresEchec.calcul);
  assert.equal(l.calcul.version, K.VERSION_CONNAISSANCE);
  for (const m of ['justesse', 'vitesse', 'biais', 'marges', 'moments', 'reproduction']) assert.ok(l.comptes[m] > 0 || m === 'reproduction', m);
  assert.ok(l.livres.some((x) => x.cle === 'fd|Pinnacle' && x.type === 'bookmaker'));
  assert.ok(l.livres.some((x) => x.cle === 'kalshi|Kalshi' && x.type === 'bourse' && x.prixJouable === false));
  assert.ok(!l.livres.some((x) => x.cle === 'fd|Maximum du marché'), 'le maximum du marché écarté');
  assert.ok(l.livres.some((x) => x.cle === 'odds-api|pinnacle'), 'vos bookmakers (relevé payant)');
  for (const m of ['justesse', 'vitesse', 'biais', 'marges', 'moments']) for (const x of l.ligue[m]) assert.equal(x.portee, 'Ligue Essai');
  for (const x of [...l.pinnacle.justesse, ...l.pinnacle.marges]) assert.ok(['fd|Pinnacle', '-'].includes(x.livre));
  assert.deepEqual([l.pinnacle.vitesse.length, l.pinnacle.biais.length], [0, 0], 'mesures filtrées');
  assert.ok(l.pinnacleMoments > 0, 'le filtre d’un livre garde les lignes de toute la portée (livre « - »)');
  for (const m of ['justesse', 'vitesse', 'biais', 'marges', 'moments']) for (const x of [...l.ligue[m]]) assert.ok(Number.isInteger(x.n) && x.n >= 0, 'chaque ligne porte son nombre de matchs');
  assert.ok(l.juste && typeof l.juste.livre === 'string' && l.juste.n > 0 && Array.isArray(l.juste.jugements));
  assert.ok(l.justeReleve);
  assert.ok(['releve', 'ouverture', 'apres-compos', 'juste-avant', 'tot', null].includes(l.moment.conclusion));
  assert.match(l.moment.phrase, /^(mieux vaut parier |pas de moment meilleur prouvé|trop peu de matchs pour juger)/);
  assert.ok(l.moment.comparaisons.length > 0);
  assert.equal(l.moment.comparaisons.length, l.momentsFacesTous, 'les comparaisons d’une issue au hasard, celles-là seulement');
  for (const c of l.moment.comparaisons) assert.ok(['releve', 'ouverture', 'apres-compos'].includes(c.tot) && ['juste-avant', 'apres-compos'].includes(c.tard), `${c.tot} → ${c.tard} : une issue au hasard, jamais un type`);
  assert.deepEqual(Object.keys(l.moment.parType).sort(), ['favori', 'nul', 'outsider']);
  for (const t of Object.values(l.moment.parType)) for (const c of t.comparaisons) assert.ok(['juste-avant', 'apres-compos'].includes(c.tard));
  assert.ok(l.momentLigue);
  assert.deepEqual(l.momentLigue.parType, {}, 'par type : tous les championnats seulement');
  assert.ok(l.marge.n > 0 && l.marge.moyenne > 0 && l.marge.type === 'bookmaker');
  assert.equal(l.margeBourse.moyenne, null);
  assert.equal(l.margeBourse.commission, 0.05);
  assert.equal(l.margeInconnue, null);
  assert.equal(l.resume.reproduction.retrouve, false, 'la base d’essai n’est pas l’historique du 23/09');
});
