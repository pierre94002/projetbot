/**
 * Le règlement des VRAIS paris : par identifiants FotMob, et à la 90e quand le match est prolongé (correctif du
 * 02/11/2026, décisions de Pierre n° 2 et n° 6).
 *   node --test test/reglementIdentifiants.test.mjs        (depuis server/)
 *
 * Sur le MAGASIN FABRIQUÉ de aides/reglementFabrique.mjs (base NEUVE d'une copie isolée : jamais la base du bac ni la
 * vraie base ; réseau coupé, heure figée au 05/10/2026 midi), avec un carnet, des résultats et des pronostics fabriqués :
 *   T-R1 / T-R1b  match prolongé au déroulé complet : réglé sur le score à la 90e (un match retour non nul à la 90e aussi),
 *                 marqué, jamais revu à la passe suivante ;
 *   T-R2          déroulé incomplet (but manquant, sans minute, sans camp) ou absent : en attente, la raison dite ;
 *   T-R3 à T-R6   tirs au but sans prolongation, but contre son camp à la 88e, but à la 90+4, buts à la 91e et à la 118e ;
 *                 les corners d'un match prolongé attendent ;
 *   T-R7 / T-R8   les noms proches (Port Vale / Portsmouth / FC Porto / Porto B – Wolfsberger AC), deux « Nacional », un club
 *                 que seule la ressemblance rapproche, un match enregistré dans l'autre sens, un pari sans coup d'envoi ;
 *   T-R10         un score saisi à la main fait foi tel quel (1-1 tapé, 2-1 tapé), même différent du magasin ;
 *   T-R11, T-R12  scores qui ne s'accordent pas ; deux rencontres possibles ;
 *   T-R14         la lecture du carnet (GET /api/bets) : `reglement` seulement là où il y a quelque chose à dire ; le carnet
 *                 jamais écrit ;
 *   T-R15         les pronostics réglés comme avant (prolongé en attente, saisie, corners par les noms) ;
 *   T-R16         les phrases ;
 *   T-R17         le magasin illisible (sans team_stats) : la passe rend son rapport, les paris qui en ont besoin attendent,
 *                 une saisie à la main règle quand même ;
 *   T-R18         une statistique NON relevée n'est jamais « 0 corner » : huit libellés, trois façons de manquer ;
 *   T-R19         un pari réglé à la 90e n'est jamais revu sur le score final, même si le club n'est plus reconnu ;
 *   T-R20         un match entré sans page FotMob (fin inconnue) et un match attribué sur tapis vert : en attente.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import { ATTENDUS } from './aides/reglementFabrique.mjs';

const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-reglement-identifiants.mjs');
const R = {};

function lancer(...phases) {
  const copie = preparerCopie({ base: false });
  try {
    const sortie = {};
    for (const phase of phases) {
      const r = executer(copie, SCRIPT, { args: [phase], timeout: 300_000 });
      assert.equal(r.code, 0, `phase ${phase} :\n${r.erreurs.slice(-3000)}`);
      assert.equal(r.reseau, false, `phase ${phase} : un appel réseau`);
      assert.ok(r.json?.ok, `phase ${phase} : sortie illisible\n${r.sortie.slice(-1500)}`);
      sortie[phase] = r.json;
    }
    return sortie;
  } finally {
    copie.nettoyer();
  }
}

before(() => {
  Object.assign(R, lancer('principal'), lancer('erreur'), lancer('revue-a', 'revue-b'));
});

const P = () => R.principal;
const sel = (id) => P().selections[id];
const attente = (id, i = 0) => P().attentes[id]?.[i] ?? null;
function verifier(ids) {
  for (const id of ids) {
    const e = ATTENDUS[id];
    const s = sel(id);
    assert.ok(s, `${id} : au carnet`);
    if (e.code) {
      assert.equal(s.status, 'pending', `${id} : en attente`);
      assert.equal(s.settledBy, null, `${id} : jamais réglé`);
      assert.equal(attente(id)?.code, e.code, `${id} : la raison`);
    } else {
      assert.equal(s.status, e.status, `${id} : statut`);
      assert.equal(s.settledScore, e.score, `${id} : score réglé`);
      assert.equal(s.settledBy, 'auto', `${id} : réglé d'office`);
    }
  }
}

test('T-R1 / T-R1b match prolongé, déroulé complet : les six paris de buts réglés sur 1-1 à la 90e, marqués, jamais revus', () => {
  verifier(['r1-dom', 'r1-nul', 'r1-plus', 'r1-btts', 'r1-ext', 'r1-rt', 'r1b-dom']);
  assert.equal(P().premiere.bets.regleA90, 14, 'réglés à la 90e (T-R1, T-R1b, T-R3, T-R4, T-R5, T-R6, le combiné)');
  assert.equal(P().seconde.bets.settled, 0, '2e passe : rien de réglé');
  assert.equal(P().seconde.bets.resettled, 0, '2e passe : rien de revu');
  assert.deepEqual(P().selections, P().apresPremiere, 'la 2e passe ne change aucune sélection');
});

test('T-R2 déroulé incomplet (but manquant, sans minute, sans camp) ou absent : en attente, compté parmi les prolongations', () => {
  verifier(['r2a', 'r2b', 'r2c', 'r2d']);
  const a = P().premiere.bets.attentes;
  assert.equal(a['prolongation-deroule-incomplet'], 4, 'trois simples et la sélection 1 du combiné');
  assert.equal(a['prolongation-sans-deroule'], 1);
  assert.equal(P().premiere.bets.extraTime, 8, 'les attentes dues à une prolongation (déroulés, statistiques, frein par noms, scores)');
  for (const id of ['r2a', 'r2d']) assert.match(attente(id).texte, /prolongation/);
});

test('T-R3 tirs au but sans prolongation : 1-1 à la 90e ; les corners du même match attendent', () => {
  verifier(['r3-dom', 'r3-nul', 'r3-corners']);
});

test('T-R4 / T-R5 / T-R6 contre son camp à la 88e, but à la 90+4, buts à la 91e et à la 118e', () => {
  verifier(['r4-nul', 'r4-ext', 'r5-dom', 'r6-moins']);
});

test('T-R7 noms proches : chaque pari corners sur les corners de SON club ; jamais Porto B pour Port Vale ; deux « Nacional » en attente', () => {
  verifier(['r7-portvale', 'r7-portsmouth', 'r7-porto', 'r7-piege', 'r7-nacional-1', 'r7-nacional-2', 'r7-nacional-variante']);
  assert.match(attente('r7-piege').texte, /« Wolfsberg AC »/);
  assert.match(attente('r7-nacional-1').texte, /« Nacional »/);
});

test('T-R8 ancien pari sans identifiant : club non reconnu, frein par noms, autre sens, pari sans coup d’envoi', () => {
  verifier(['r8b-corners', 'r8b-1n2', 'r8b-prolonge', 'r8c', 'r8d']);
});

test('T-R10 un score saisi à la main fait foi tel quel, sans marque de 90e, même s’il diffère du magasin', () => {
  verifier(['r10-nul', 'r10-dom']);
});

test('T-R11 / T-R12 scores qui ne s’accordent pas ; deux rencontres possibles', () => {
  verifier(['r11-prolonge', 'r11-corners', 'r12']);
  assert.match(attente('r11-prolonge').texte, /fichier des résultats \(2-1\) et celui de la page FotMob du match \(2-2\)/);
});

test('T-R14 la lecture du carnet : `reglement` seulement où il y a quelque chose à dire ; le carnet n’est jamais écrit', () => {
  const route = P().route.bets;
  const parId = Object.fromEntries(route.map((b) => [b.id, b]));
  assert.equal(P().carnetIntact, true, 'bets.json identique à l’octet après GET /api/bets');
  // Réglé à la 90e : la phrase.
  assert.equal(parId['r1-nul'].reglement[0].etat, 'regle-a-la-90e');
  assert.match(parId['r1-nul'].reglement[0].texte, /^Réglé sur le score à la 90e \(prolongation non comptée\) : 1-1/);
  // Le combiné : chaque sélection sous SON numéro.
  assert.equal(parId['combine-90e'].reglement[0].code, 'regle-a-la-90e');
  assert.equal(parId['combine-90e'].reglement[1].code, 'prolongation-deroule-incomplet');
  assert.equal(P().selections['combine-90e#0'].status, 'won');
  assert.equal(P().selections['combine-90e#1'].status, 'pending');
  // En attente, résultat arrivé : la raison. Sans résultat 6 h après le coup d'envoi : « aucun résultat relevé ».
  assert.equal(parId.r2a.reglement[0].code, 'prolongation-deroule-incomplet');
  assert.equal(parId['sans-resultat'].reglement[0].code, 'pas-de-resultat');
  // Rien à dire : réponse comme avant (pas de champ).
  for (const id of ['r7-portvale', 'r8d', 'r10-nul', 'tout-juste-fini', 'a-venir', 'ancien-main']) assert.equal(parId[id].reglement, undefined, `${id} : pas de champ reglement`);
  // La lecture de la route est celle de reglementPourLaLecture.
  assert.deepEqual(Object.fromEntries(route.filter((b) => b.reglement).map((b) => [b.id, b.reglement])), P().lecture);
});

test('T-R15 les pronostics : réglés comme avant (prolongé en attente, saisie à la main, corners retrouvés par les noms)', () => {
  assert.deepEqual(P().pronostics, {
    'p-prolonge': { status: 'pending', settledScore: null },
    'p-saisie': { status: 'correct', settledScore: '1-1' },
    'p-corners-noms': { status: 'correct', settledScore: '2-0' }
  });
});

test('T-R16 les phrases : en français, sans « undefined » ni code interne, avec le nom du club', () => {
  const phrases = P().phrases;
  assert.ok(Object.keys(phrases).length >= 16);
  for (const [code, texte] of Object.entries(phrases)) {
    assert.equal(typeof texte, 'string', code);
    assert.ok(texte.length > 30, code);
    assert.doesNotMatch(texte, /undefined|null|NaN|\[object/, code);
    assert.ok(!texte.includes(code) || code === 'erreur', `${code} : pas de code interne dans la phrase`);
    assert.match(texte, /^(En attente|Réglé|Résultat arrivé)/, code);
  }
  assert.match(phrases['equipe-non-reconnue'], /« Wolfsberg AC »/);
  assert.deepEqual(P().phrases90e.map((t) => /\(([^)]+)\)/.exec(t)[1]), ['prolongation non comptée', 'tirs au but non comptés', 'prolongation et tirs au but non comptés']);
});

test('T-R17 magasin illisible (sans team_stats) : la passe rend son rapport ; les paris qui en ont besoin attendent ; la saisie règle', () => {
  const E = R.erreur;
  assert.equal(E.ok, true, E.erreur);
  assert.equal(E.selections['e-corners'].status, 'pending');
  assert.equal(E.selections['e-buts'].status, 'pending', 'un pari de buts attend aussi (prudence ; avant, il se réglait par les noms)');
  assert.equal(E.selections['e-saisie'].status, 'won', 'un score saisi à la main n’est jamais rattaché : il règle même magasin en panne');
  assert.equal(E.rapport.bets.erreurs, 2);
  assert.deepEqual(E.rapport.bets.attentes, { erreur: 2 });
  assert.equal(E.pronostics['p-buts'], 'correct', 'les pronostics réglés comme d’habitude');
  assert.equal(E.attentes['e-corners'][0].code, 'erreur');
});

test('T-R18 une statistique non relevée n’est jamais « 0 corner » : huit libellés, trois façons de manquer, tous en attente', () => {
  const ids = ['a', 'b', 'c'].flatMap((s) => [0, 1, 2, 3, 4, 5, 6, 7].map((i) => `r18${s}-${i}`));
  verifier(ids);
  assert.equal(P().premiere.bets.attentes['statistiques-non-relevees'], 24);
});

test('T-R19 réglé à la 90e : jamais revu sur le score final, même quand le club n’est plus reconnu à la passe suivante', () => {
  const A = R['revue-a'];
  const B = R['revue-b'];
  assert.deepEqual(A.selections.r19, { status: 'lost', settledBy: 'auto', settledScore: '0-0 à la 90e (prolongation)', ticket: 'lost' });
  assert.equal(A.retires, 1, 'les écritures du club retirées de l’annuaire');
  assert.equal(B.club, null, 'le club n’est plus reconnu');
  assert.deepEqual(B.selections.r19, A.selections.r19, 'rien n’est revu');
  assert.equal(B.rapport.bets.resettled, 0);
});

test('T-R20 un match entré sans page FotMob (fin inconnue) et un match attribué : en attente, la raison dite ; un marché sans règle aussi', () => {
  verifier(['r20', 'r20-attribue', 'sans-regle']);
});
