/**
 * La boucle de correction (étape 26 du plan, partie B, 28/10/2026) — LES PROPOSITIONS, pures : des cases du tri aux
 * corrections proposées (les règles écrites d'avance), le formulaire de Pierre, la déclaration d'une correction
 * (T-PR2 : l'objet modeleDeButs ENTIER, accepté par validerCandidate), les identifiants, les valeurs, et la copie
 * profonde des réglages en service (B43), et la place de l'essai lue dans un état des versions donné (etatDeLaPlace).
 * Aucune base, aucun fichier, aucune écriture : des fonctions pures.
 *   node --test test/boucleCorrectionPropositions.test.mjs        (depuis server/)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../src/data/correction/propositions.js';
import * as R from '../src/data/correction/regles.js';
import { etatDeLaPlace } from '../src/data/correction/miseALEssai.js';
import { validerCandidate, CANDIDATE_EN_ESSAI, empreinteDesReglages } from '../src/core/engine/engineVersions.js';
import { DEFAULT_ENGINE_CONFIG_BY_SPORT } from '../src/core/engine/engineConfig.js';

const copie = (x) => JSON.parse(JSON.stringify(x));
const MDB = copie(CANDIDATE_EN_ESSAI.modifications.football.modeleDeButs);
const SERVICE = () => ({ ...copie(DEFAULT_ENGINE_CONFIG_BY_SPORT.football), modeleDeButs: copie(MDB) });
const MAINTENANT = Date.parse('2027-02-01T07:00:00.000Z');
const BASE = 'empreinte-de-la-lignee';
const VALEURS = { 'modeleDeButs.rho': -0.1, 'modeleDeButs.prior': 9, 'modeleDeButs.poidsXg': 0.6, 'modeleDeButs.melange.avecPlusMoins.wT': 0.2, 'modeleDeButs.melange.avecPlusMoins.wS': 0.2, 'modeleDeButs.melange.sans.wT': 0.5, 'modeleDeButs.melange.sans.wS': 0.2, 'modeleDeButs.demarrageAFroid.matchs': 9 };

/** Une case du tri, son réglage visé posé par la règle de regles.js (comme tri.js le fait). */
function uneCase(cas, { statut = 'vrai-defaut', ecart = -0.04, regimes = null, aRevoir = null } = {}) {
  const { famille, mesure } = R.lireLaCase(cas);
  const c = { cas, famille, mesure, statut, sens: ecart < 0 ? 'trop-haut' : 'trop-bas', sensDit: 'annonce trop souvent', aRevoir, courant: { ecart }, fenetre: { mois: ['2026-11', '2026-12', '2027-01'], ecart, matchs: 3900 } };
  return { ...c, levier: R.levierDeLaCase(c, { avecModeleDeButs: true, regimes }) };
}
const leTri = (cases, { mois = '2027-01', empreinte = BASE } = {}) => ({ mois, version: 1, lignee: { empreinte, versionEnService: 7 }, cases });
const proposer = (tri, extra = {}) => P.proposerPourLeTri({ tri, reglagesEnService: SERVICE(), propositions: [], place: { lisible: true, prise: false, par: null, candidate: null }, base: BASE, versionEnService: 7, maintenant: MAINTENANT, ...extra });
const pierre = (corps, extra = {}) => P.propositionDePierre(corps, { reglagesEnService: SERVICE(), propositions: [], place: { lisible: true, prise: false, par: null, candidate: null }, base: BASE, maintenant: MAINTENANT, ...extra });
const refus = (f) => {
  try {
    f();
    return null;
  } catch (error) {
    return { raison: error.raison, statut: error.statut, message: error.message };
  }
};

// ============================================================ T-PR2 : la déclaration

test('T-PR2 : pour CHAQUE levier, la déclaration porte l’objet modeleDeButs ENTIER des réglages en service (toutes ses clés, une seule sous-clé changée), les 4 familles de buts et le témoin du score, l’horizon 800 / 21, l’étape 26 — et validerCandidate l’accepte', () => {
  for (const [levier, valeur] of Object.entries(VALEURS)) {
    const id = P.idDeProposition({ source: 'regle', levier, mois: '2027-01' });
    const d = P.declarationDe({ id, levier, apres: valeur, reglagesEnService: SERVICE(), quoi: 'Q', enMots: 'E' });
    assert.doesNotThrow(() => validerCandidate(d), levier);
    assert.equal(d.etape, '26');
    const m = d.modifications.football.modeleDeButs;
    assert.deepEqual(Object.keys(m).sort(), Object.keys(MDB).sort(), `${levier} : toutes les clés`);
    assert.equal(P.valeurDuLevier(m, levier), valeur, levier);
    assert.deepEqual(P.avecLeLevier(m, levier, P.valeurDuLevier(MDB, levier)), MDB, `${levier} : une seule sous-clé changée`);
    assert.deepEqual(d.marches, ['totalGoals', 'bothTeamsScore', 'teamGoals', 'resultAndTotal']);
    assert.deepEqual(d.temoins, ['scoreExact']);
    assert.deepEqual(d.horizon, { matchs: 800, jours: 21 });
    assert.deepEqual(d.variantes, []);
  }
  const sansModele = refus(() => P.declarationDe({ id: 'c26-x-1', levier: 'modeleDeButs.rho', apres: 0, reglagesEnService: copie(DEFAULT_ENGINE_CONFIG_BY_SPORT.football), quoi: 'Q', enMots: 'E' }));
  assert.equal(sansModele.raison, 'sans-modele-de-buts');
});

test('les identifiants : « c26-<mois>-<levier court>-<n> » (une règle) et « c26-p<AAAAMMJJ>-<levier court>-<n> » (Pierre, jour de Paris) ; le premier numéro libre ; la forme acceptée par validerCandidate', () => {
  assert.equal(P.idDeProposition({ source: 'regle', levier: 'modeleDeButs.rho', mois: '2027-01' }), 'c26-2027-01-rho-1');
  assert.equal(P.idDeProposition({ source: 'regle', levier: 'modeleDeButs.rho', mois: '2027-01', existants: ['c26-2027-01-rho-1', 'c26-2027-01-rho-2'] }), 'c26-2027-01-rho-3');
  assert.equal(P.idDeProposition({ source: 'pierre', levier: 'modeleDeButs.melange.sans.wT', maintenant: Date.parse('2027-01-30T23:30:00.000Z') }), 'c26-p20270131-wt-sans-1', 'le jour de Paris');
  for (const levier of Object.keys(R.LEVIERS)) assert.match(P.idDeProposition({ source: 'pierre', levier, maintenant: MAINTENANT }), /^[a-z0-9][a-z0-9._-]{1,60}$/i);
  assert.equal(refus(() => P.idDeProposition({ source: 'regle', levier: 'defaultCorrelation', mois: '2027-01' })).raison, 'levier-inconnu');
});

test('les valeurs des règles : ρ ± 0,03 (monter = plus haut), borné strictement à ±0,29 ; prior × 1,5 ou ÷ 1,5, entier de [0 ; 40] ; part des statistiques sans plus/moins ÷ 2 au centième ; rien quand la règle est au bout', () => {
  assert.equal(P.valeurProposee('modeleDeButs.rho', -0.05, 'monter'), -0.02);
  assert.equal(P.valeurProposee('modeleDeButs.rho', -0.05, 'descendre'), -0.08);
  assert.equal(P.valeurProposee('modeleDeButs.rho', 0.28, 'monter'), 0.29);
  assert.equal(P.valeurProposee('modeleDeButs.rho', 0.29, 'monter'), null);
  assert.equal(P.valeurProposee('modeleDeButs.rho', -0.29, 'descendre'), null);
  assert.equal(P.valeurProposee('modeleDeButs.prior', 8, 'monter'), 12);
  assert.equal(P.valeurProposee('modeleDeButs.prior', 8, 'descendre'), 5);
  assert.equal(P.valeurProposee('modeleDeButs.prior', 30, 'monter'), 40);
  assert.equal(P.valeurProposee('modeleDeButs.prior', 0, 'monter'), null);
  assert.equal(P.valeurProposee('modeleDeButs.melange.sans.wT', 0.55, 'descendre'), 0.28);
  assert.equal(P.valeurProposee('modeleDeButs.melange.sans.wT', 0, 'descendre'), null);
  assert.equal(P.valeurProposee('modeleDeButs.poidsXg', 0.7, 'monter'), null, 'aucune règle sur poidsXg');
  assert.equal(P.problemeDeValeur('modeleDeButs.rho', -0.02), null);
  assert.match(P.problemeDeValeur('modeleDeButs.rho', 0.3), /strictement entre −0,30 et 0,30/);
  assert.match(P.problemeDeValeur('modeleDeButs.rho', -0.025), /par pas de 0,01/);
  assert.equal(P.problemeDeValeur('modeleDeButs.prior', 40), null);
  assert.match(P.problemeDeValeur('modeleDeButs.prior', 41), /de 0 à 40/);
  assert.match(P.problemeDeValeur('modeleDeButs.prior', 'douze'), /pas un nombre/);
});

// ============================================================ les règles, sur le dernier tri

test('une règle sur le DERNIER tri : « Les 2 équipes marquent », niveau, trop haut → ρ −0,05 → −0,02, la fenêtre du tri en « vues », la phrase pour Pierre (sans jargon) ; validerCandidate l’accepte', () => {
  const r = proposer(leTri([uneCase('bothTeamsScore|niveau'), uneCase('totalGoals|niveau', { statut: 'dans-la-marge' })]));
  assert.equal(r.aCreer.length, 1);
  const { proposition: p, phrase } = r.aCreer[0];
  assert.deepEqual([p.id, p.source, p.levier, p.avant, p.apres, p.triMois, p.base], ['c26-2027-01-rho-1', 'regle', 'modeleDeButs.rho', -0.05, -0.02, '2027-01', BASE]);
  assert.deepEqual(p.cas, ['bothTeamsScore|niveau']);
  assert.deepEqual(p.declaration.vues.map((v) => [v.de, v.a]), [['2026-11-01', '2027-01-31']]);
  assert.doesNotThrow(() => validerCandidate(p.declaration));
  assert.match(phrase, /^Proposée par le tri de janvier 2027 : « Les 2 équipes marquent » .* \(4,0 points sur novembre 2026-janvier 2027, 3\s900 matchs\) ; corrélation des petits scores : −0,05 → −0,02\. À mesurer au banc d’essai, ou à refuser\.$/);
  for (const t of [phrase, p.declaration.enMots]) assert.doesNotMatch(t, /\bK\b|lignée|variante|\bz\b/i, t);
  // Trop bas : ρ descend.
  assert.equal(proposer(leTri([uneCase('bothTeamsScore|niveau', { ecart: 0.04 })])).aCreer[0].proposition.apres, -0.08);
});

test('confiance d’abord : une confiance de famille de buts « trop sûr » ne propose QUE prior (8 → 12) ; le niveau attend (« à revoir après la correction de la confiance ») ; deux confiances dans le même sens : UNE proposition (une par réglage et par mois) ; en sens contraires : aucune', () => {
  const cases = [uneCase('totalGoals|confiance'), uneCase('bothTeamsScore|confiance'), uneCase('bothTeamsScore|niveau', { aRevoir: 'apres-la-confiance' })];
  const r = proposer(leTri(cases));
  assert.deepEqual(r.aCreer.map((x) => [x.proposition.levier, x.proposition.avant, x.proposition.apres]), [['modeleDeButs.prior', 8, 12]]);
  assert.deepEqual(r.aCreer[0].proposition.cas, ['totalGoals|confiance', 'bothTeamsScore|confiance']);
  assert.ok(r.ecartees.some((e) => e.cas === 'bothTeamsScore|niveau' && e.raison === 'confiance-d-abord'));
  const contraires = proposer(leTri([uneCase('totalGoals|confiance'), uneCase('teamGoals|confiance', { ecart: 0.04 })]));
  assert.deepEqual(contraires.aCreer, []);
  assert.ok(contraires.ecartees.every((e) => e.raison === 'sens-contraires'));
});

test('la part des statistiques sans cote plus/moins (wT) : seulement si l’écart vient des matchs cotés en 1N2 seul (55 % → 28 %) ; sinon « demande du code » ; corners, tirs et 1N2 : « demande du code », jamais une proposition', () => {
  const regimes1n2 = { 'cotes-1n2-xg': { lignes: 1200, matchs: 1200, sa: 700, sb: 600 }, 'cotes-plusmoins-xg': { lignes: 2700, matchs: 2700, sa: 1400, sb: 1395 } };
  const r = proposer(leTri([uneCase('totalGoals|niveau', { regimes: regimes1n2 })]));
  assert.deepEqual(r.aCreer.map((x) => [x.proposition.levier, x.proposition.avant, x.proposition.apres]), [['modeleDeButs.melange.sans.wT', 0.55, 0.28]]);
  const autres = { 'cotes-1n2-xg': { lignes: 1200, matchs: 1200, sa: 600, sb: 598 }, 'cotes-plusmoins-xg': { lignes: 2700, matchs: 2700, sa: 1500, sb: 1380 } };
  const code = proposer(leTri([uneCase('totalGoals|niveau', { regimes: autres }), uneCase('totalCorners|niveau'), uneCase('result|confiance')]));
  assert.deepEqual(code.aCreer, []);
  assert.deepEqual(code.demandesDuCode.map((d) => d.cas), ['totalGoals|niveau', 'totalCorners|niveau', 'result|confiance']);
  for (const d of code.demandesDuCode) assert.match(d.phrase, /^Tri de janvier 2027 : « .* » \(\w+\) .* — demande du code : /);
  assert.equal(code.demandesDuCode[0].details.lignee, BASE, 'notée une fois par lignée (l’appelant compare)');
});

test('pas de nouvelle proposition pour un réglage déjà OUVERT, refusé / rejeté / retiré depuis moins de 6 mois, ou déjà proposé par ce tri ; après 6 mois, la règle repropose', () => {
  const tri = leTri([uneCase('bothTeamsScore|niveau')]);
  const p = (etat, etatLe, extra = {}) => ({ id: `x-${etat}`, levier: 'modeleDeButs.rho', etat, etatLe, source: 'regle', triMois: '2026-10', ...extra });
  for (const etat of P.ETATS_OUVERTS) assert.deepEqual(proposer(tri, { propositions: [p(etat, '2027-01-20T00:00:00.000Z')] }).aCreer, [], etat);
  for (const etat of ['refusee', 'rejetee', 'retiree']) {
    assert.deepEqual(proposer(tri, { propositions: [p(etat, '2026-09-01T00:00:00.000Z')] }).aCreer, [], `${etat} il y a 5 mois`);
    assert.equal(proposer(tri, { propositions: [p(etat, '2026-07-31T00:00:00.000Z')] }).aCreer.length, 1, `${etat} il y a plus de 6 mois`);
  }
  assert.equal(proposer(tri, { propositions: [p('perimee', '2027-01-20T00:00:00.000Z')] }).aCreer.length, 1, 'une périmée ne bloque rien');
  assert.deepEqual(proposer(tri, { propositions: [p('rejetee', '2026-01-01T00:00:00.000Z', { triMois: '2027-01' })] }).aCreer, [], 'déjà proposée par ce tri');
  const r = proposer(tri, { propositions: [p('rejetee', '2026-01-01T00:00:00.000Z', { id: 'c26-2027-01-rho-1', triMois: '2026-06' })] });
  assert.equal(r.aCreer[0].proposition.id, 'c26-2027-01-rho-2', 'le premier numéro libre');
});

test('B12 — une famille EN ESSAI (la correction qui occupe la place) n’est jamais visée, même si le tri l’a jugée vrai défaut ; pendant l’essai de l’étape 27 (la candidate du code dans la place), RIEN n’est proposé ; ni quand la version en service n’est plus celle du mois trié ; ni sans le modèle de buts en service', () => {
  const tri = leTri([uneCase('bothTeamsScore|niveau'), uneCase('totalGoals|confiance')]);
  const enEssai = proposer(tri, { place: { lisible: true, prise: true, par: 'correction', candidate: { id: 'c26-autre', marches: ['totalGoals', 'bothTeamsScore', 'teamGoals', 'resultAndTotal'] } } });
  assert.deepEqual(enEssai.aCreer, []);
  assert.ok(enEssai.ecartees.some((e) => e.raison === 'famille-en-essai'));
  const pendantLa27 = proposer(tri, { place: { lisible: true, prise: true, par: 'code', candidate: { id: 'modele-buts-v1', marches: [] } } });
  assert.deepEqual(pendantLa27.aCreer, []);
  assert.ok(pendantLa27.ecartees.every((e) => e.raison === 'essai-27'));
  assert.deepEqual(proposer(tri, { base: 'une-autre-lignee' }).aCreer, []);
  assert.deepEqual(proposer(tri, { reglagesEnService: copie(DEFAULT_ENGINE_CONFIG_BY_SPORT.football) }).aCreer, []);
  assert.equal(proposer(tri).aCreer.length, 2, 'sans tout cela : ρ et prior');
});

// ============================================================ le formulaire de Pierre

test('le formulaire de Pierre : FERMÉ pendant l’essai du modèle de buts (étape 27), avec la phrase de la décision 8 ; les réglages de pari, les réglages retirés, un réglage inconnu, le modèle de buts absent, les bornes et le pas, la même valeur, une famille en essai, un réglage déjà ouvert, une phrase trop longue : refusés en mots (400 / 409)', () => {
  const ferme = refus(() => pierre({ levier: 'modeleDeButs.rho', valeur: -0.02 }, { place: { lisible: true, prise: true, par: 'code', auPlusTotLe: '2026-11-14T14:48:24.000Z', candidate: { id: 'modele-buts-v1', marches: [] } } }));
  assert.deepEqual([ferme.raison, ferme.statut], ['essai-27', 409]);
  assert.equal(ferme.message, 'Le formulaire est fermé pendant l’essai du modèle de buts (étape 27) : rien ne peut être essayé à blanc avant son verdict (au plus tôt le 14/11/2026). Rien n’a été proposé.');
  const cas = [
    [{ levier: 'valueBookmakers', valeur: 1 }, {}, 'reglage-de-pari', 400],
    [{ levier: 'defaultCorrelation', valeur: -0.1 }, {}, 'levier-retire', 400],
    [{ levier: 'homeAdvantage', valeur: 1.02 }, {}, 'levier-retire', 400],
    [{ levier: 'modeleDeButs.bornes', valeur: 3 }, {}, 'levier-inconnu', 400],
    [{ valeur: 3 }, {}, 'levier-absent', 400],
    [{ levier: 'modeleDeButs.rho', valeur: -0.02 }, { reglagesEnService: copie(DEFAULT_ENGINE_CONFIG_BY_SPORT.football) }, 'sans-modele-de-buts', 409],
    [{ levier: 'modeleDeButs.rho', valeur: 0.3 }, {}, 'valeur', 400],
    [{ levier: 'modeleDeButs.prior', valeur: 8.5 }, {}, 'valeur', 400],
    [{ levier: 'modeleDeButs.rho', valeur: -0.05 }, {}, 'meme-valeur', 400],
    [{ levier: 'modeleDeButs.rho', valeur: -0.02 }, { place: { lisible: true, prise: true, par: 'correction', candidate: { id: 'c26-autre', marches: ['bothTeamsScore'] } } }, 'famille-en-essai', 409],
    [{ levier: 'modeleDeButs.rho', valeur: -0.02 }, { propositions: [{ id: 'c26-2027-01-rho-1', levier: 'modeleDeButs.rho', etat: 'bancee' }] }, 'deja-ouverte', 409],
    [{ levier: 'modeleDeButs.rho', valeur: -0.02, phrase: 'x'.repeat(301) }, {}, 'phrase', 400],
    [{ levier: 'modeleDeButs.rho', valeur: -0.02 }, { base: null }, 'version-inconnue', 503]
  ];
  for (const [corps, extra, raison, statut] of cas) {
    const r = refus(() => pierre(corps, extra));
    assert.deepEqual([r?.raison, r?.statut], [raison, statut], JSON.stringify(corps));
    assert.match(r.message, /Rien n’a été proposé|rien à essayer/, raison);
  }
});

test('la proposition de Pierre : « à mesurer », source « pierre », ses valeurs (« 55 % → 50 % », virgule acceptée), sa phrase ; la déclaration passe validerCandidate ; un réglage refusé ou périmé ne bloque pas une nouvelle proposition', () => {
  const r = pierre({ levier: 'modeleDeButs.melange.sans.wT', valeur: '0,5', phrase: '  plus  près   du marché ' });
  assert.deepEqual([r.proposition.id, r.proposition.source, r.proposition.avant, r.proposition.apres], ['c26-p20270201-wt-sans-1', 'pierre', 0.55, 0.5]);
  assert.equal(r.phrase, 'Proposée par vous : part des statistiques dans le total, sans cote plus/moins : 55 % → 50 % — « plus près du marché ». À mesurer au banc d’essai, ou à refuser.');
  assert.doesNotThrow(() => validerCandidate(r.proposition.declaration));
  assert.doesNotMatch(r.proposition.declaration.enMots, /\n/);
  assert.equal(pierre({ levier: 'modeleDeButs.rho', valeur: -0.02 }, { propositions: [{ id: 'x', levier: 'modeleDeButs.rho', etat: 'refusee' }, { id: 'y', levier: 'modeleDeButs.rho', etat: 'perimee' }] }).proposition.apres, -0.02);
});

test('l’état du formulaire : fermé pendant l’essai de l’étape 27 (sa phrase), fermé sans le modèle de buts ; sinon chaque réglage avec sa valeur en service en mots, ses bornes et son pas, fermé un par un (famille en essai, déjà ouvert) ; la phrase des réglages de pari', () => {
  const ferme = P.etatDuFormulaire({ place: { par: 'code', prise: true, candidate: { marches: [] } }, reglagesEnService: SERVICE() });
  assert.equal(ferme.ouvert, false);
  assert.match(ferme.raison, /^Le formulaire est fermé pendant l’essai du modèle de buts \(étape 27\)/);
  assert.ok(ferme.leviers.every((l) => !l.ouvert));
  assert.equal(P.etatDuFormulaire({ place: null, reglagesEnService: copie(DEFAULT_ENGINE_CONFIG_BY_SPORT.football) }).ouvert, false);
  const ouvert = P.etatDuFormulaire({ place: null, reglagesEnService: SERVICE(), propositions: [{ id: 'c26-x', levier: 'modeleDeButs.prior', etat: 'acceptee' }] });
  assert.equal(ouvert.ouvert, true);
  assert.deepEqual(ouvert.leviers.map((l) => l.cle), Object.keys(R.LEVIERS));
  const rho = ouvert.leviers.find((l) => l.cle === 'modeleDeButs.rho');
  assert.deepEqual([rho.valeur, rho.valeurDite, rho.min, rho.max, rho.pas, rho.ouvertes, rho.ouvert], [-0.05, '−0,05', -0.3, 0.3, 0.01, true, true]);
  assert.match(ouvert.leviers.find((l) => l.cle === 'modeleDeButs.prior').raison, /déjà ouverte/);
  assert.match(ouvert.reglagesDePari, /ne changent aucune probabilité/);
});

// ============================================================ B43 : la copie profonde

test('B43 — rien ne MODIFIE les réglages reçus : declarationDe, propositionDePierre, proposerPourLeTri, etatDuFormulaire et partDesReglagesEnService, pour chaque levier, laissent l’objet reçu identique (même texte, même empreinte des réglages)', () => {
  const vivant = SERVICE();
  const texte = JSON.stringify(vivant);
  const empreinte = empreinteDesReglages(vivant);
  const tri = leTri([uneCase('bothTeamsScore|niveau'), uneCase('totalGoals|confiance'), uneCase('totalGoals|niveau', { regimes: { 'cotes-1n2-xg': { lignes: 1200, matchs: 1200, sa: 700, sb: 600 } } })]);
  for (const [levier, valeur] of Object.entries(VALEURS)) {
    const d = P.declarationDe({ id: 'c26-essai-1', levier, apres: valeur, reglagesEnService: vivant, quoi: 'Q', enMots: 'E' });
    P.propositionDePierre({ levier, valeur }, { reglagesEnService: vivant, propositions: [], place: null, base: BASE, maintenant: MAINTENANT });
    P.partDesReglagesEnService(d, levier, P.valeurDuLevier(MDB, levier), vivant);
    d.modifications.football.modeleDeButs.melange.sans.wT = 0.99; // modifier la déclaration ne touche pas l'objet reçu
  }
  P.proposerPourLeTri({ tri, reglagesEnService: vivant, propositions: [], place: null, base: BASE, versionEnService: 7, maintenant: MAINTENANT });
  P.etatDuFormulaire({ place: null, reglagesEnService: vivant, propositions: [] });
  assert.equal(JSON.stringify(vivant), texte);
  assert.equal(empreinteDesReglages(vivant), empreinte);
});

test('« part des réglages en service » : la déclaration, le levier remis à sa valeur d’avant, est EXACTEMENT le modèle de buts en service ; un autre réglage du modèle changé depuis (ou le levier lui-même) la rend « périmée »', () => {
  const d = P.declarationDe({ id: 'c26-x-1', levier: 'modeleDeButs.rho', apres: -0.02, reglagesEnService: SERVICE(), quoi: 'Q', enMots: 'E' });
  assert.equal(P.partDesReglagesEnService(d, 'modeleDeButs.rho', -0.05, SERVICE()), true);
  const autre = SERVICE();
  autre.modeleDeButs.poidsXg = 0.6;
  assert.equal(P.partDesReglagesEnService(d, 'modeleDeButs.rho', -0.05, autre), false);
  const levier = SERVICE();
  levier.modeleDeButs.rho = -0.04;
  assert.equal(P.partDesReglagesEnService(d, 'modeleDeButs.rho', -0.05, levier), false);
  assert.equal(P.partDesReglagesEnService(d, 'modeleDeButs.rho', -0.05, copie(DEFAULT_ENGINE_CONFIG_BY_SPORT.football)), false);
});

test('les mots : nombres à la française au vrai signe moins (−0,05), « 1 350 », « d’octobre 2026 », « de décembre 2026 » ; la valeur d’un levier comme à l’écran (« 55 % ») ; son nom sans « rho »', () => {
  assert.equal(P.nombreDit(-0.05, 2), '−0,05');
  assert.equal(P.nombreDit(1350), (1350).toLocaleString('fr-FR'));
  assert.equal(P.deMois('2026-10'), 'd’octobre 2026');
  assert.equal(P.deMois('2026-08'), 'd’août 2026');
  assert.equal(P.deMois('2026-12'), 'de décembre 2026');
  assert.equal(P.valeurDite('modeleDeButs.melange.sans.wT', 0.55), '55 %');
  assert.equal(P.valeurDite('modeleDeButs.prior', 12), '12');
  assert.equal(P.libelleDuLevier('modeleDeButs.rho'), 'corrélation des petits scores');
  assert.equal(P.pointsDits(-0.031), '3,1 points');
});

// ============================================================ la place de l'essai (miseALEssai.js, etatDeLaPlace, sur un état donné)

test('la place de l’essai : registre absent ou illisible → prise, rien n’est mis à l’essai ; la candidate du code en essai → « en essai à blanc », verdict au plus tôt le 14/11/2026 ; adoptée mais encore déclarée dans le code → TOUJOURS prise (proposerUneCandidate refuserait) ; sans candidate du code : une correction de la boucle (son réglage, avant → après), une autre candidate, ou libre', () => {
  const vide = { source: 'enregistre', candidate: null, candidateAdoptee: null };
  // 1. le registre
  const absent = etatDeLaPlace({ etat: { source: 'absent' } });
  assert.deepEqual([absent.lisible, absent.prise, absent.par], [false, true, null]);
  assert.equal(absent.phrase, 'Le registre des versions du moteur n’existe pas encore : rien n’est mis à l’essai.');
  const illisible = etatDeLaPlace({ etat: { source: 'illisible' } });
  assert.deepEqual([illisible.lisible, illisible.prise], [false, true]);
  assert.ok(illisible.phrase.includes('ne se lit pas pour l’instant'), illisible.phrase);
  // 2. la candidate du code (étape 27) en essai
  const code = { id: CANDIDATE_EN_ESSAI.id, etape: CANDIDATE_EN_ESSAI.etape, marches: [...CANDIDATE_EN_ESSAI.marches], origine: 'code', statut: 'a-blanc', essai: { depuis: '2026-10-24T14:48:31.802Z' }, horizon: { matchs: 800, jours: 21 } };
  const enEssai = etatDeLaPlace({ etat: { ...vide, candidate: code }, candidateDuCode: CANDIDATE_EN_ESSAI });
  assert.deepEqual([enEssai.lisible, enEssai.prise, enEssai.par, enEssai.candidate?.id], [true, true, 'code', CANDIDATE_EN_ESSAI.id]);
  assert.equal(enEssai.auPlusTotLe, '2026-11-14T14:48:31.802Z');
  assert.equal(enEssai.phrase, 'La candidate « Modèle de buts unique » (étape 27) est en essai à blanc, verdict attendu au plus tôt le 14/11/2026 : aucune correction ne passe à blanc avant son verdict.');
  // 3. adoptée mais encore déclarée dans le code : la place reste PRISE (écart E-B3)
  const adoptee = etatDeLaPlace({ etat: { ...vide, candidateAdoptee: { id: CANDIDATE_EN_ESSAI.id } }, candidateDuCode: CANDIDATE_EN_ESSAI });
  assert.deepEqual([adoptee.lisible, adoptee.prise, adoptee.par, adoptee.candidate], [true, true, 'code-adoptee', null]);
  assert.ok(adoptee.phrase.includes('est adoptée mais encore déclarée dans le code de l’appli'), adoptee.phrase);
  // 4. déclarée dans le code, pas encore au registre
  const declaree = etatDeLaPlace({ etat: vide, candidateDuCode: CANDIDATE_EN_ESSAI });
  assert.deepEqual([declaree.prise, declaree.par], [true, 'code']);
  assert.equal(declaree.phrase, 'La candidate « Modèle de buts unique » (étape 27) est déclarée dans le code : la file attend son tour.');
  // 5. sans candidate dans le code : une correction de la boucle en essai
  const correction = { id: 'c26-2026-12-rho-1', etape: '26', marches: ['bothTeamsToScore'], origine: 'correction-mensuelle', statut: 'a-blanc', essai: { depuis: '2027-01-02T06:00:00.000Z' }, horizon: { matchs: 800, jours: 21 } };
  const propositions = [{ id: 'c26-2026-12-rho-1', levier: 'modeleDeButs.rho', avant: -0.05, apres: -0.02 }];
  const parLaBoucle = etatDeLaPlace({ etat: { ...vide, candidate: correction }, candidateDuCode: null, propositions });
  assert.deepEqual([parLaBoucle.prise, parLaBoucle.par, parLaBoucle.auPlusTotLe], [true, 'correction', '2027-01-23T06:00:00.000Z']);
  assert.equal(parLaBoucle.phrase, 'Une correction est déjà en essai à blanc (« corrélation des petits scores : −0,05 → −0,02 », verdict au plus tôt le 23/01/2027) : la suivante attend son tour.');
  const jugee = etatDeLaPlace({ etat: { ...vide, candidate: { ...correction, statut: 'jugee' } }, candidateDuCode: null, propositions });
  assert.equal(jugee.phrase, 'Une correction est déjà en essai à blanc (« corrélation des petits scores : −0,05 → −0,02 », jugée) : la suivante attend son tour.');
  // 6. une autre candidate (pas de la boucle)
  const autre = etatDeLaPlace({ etat: { ...vide, candidate: { ...correction, id: 'autre-1', origine: 'code' } }, candidateDuCode: null });
  assert.deepEqual([autre.prise, autre.par], [true, 'autre']);
  // 7. libre
  assert.deepEqual(etatDeLaPlace({ etat: vide, candidateDuCode: null }), { lisible: true, prise: false, par: null, candidate: null, auPlusTotLe: null, phrase: 'Place de l’essai à blanc : libre.' });
});

test('vérification finale, constat 2 : la phrase de la place occupée par une candidate est juste avec ou sans correction en file — en essai, « aucune correction ne passe à blanc avant son verdict » ; jugée, avant ce qui libérera la place ; jamais « Une autre candidate » ni « la correction attend son tour »', () => {
  const vide = { source: 'enregistre', candidate: null, candidateAdoptee: null };
  const code = { id: CANDIDATE_EN_ESSAI.id, etape: CANDIDATE_EN_ESSAI.etape, marches: [...CANDIDATE_EN_ESSAI.marches], origine: 'code', statut: 'en-essai', essai: { depuis: '2026-10-24T14:48:31.802Z' }, horizon: { matchs: 800, jours: 21 } };
  const place = (candidate, candidateDuCode = CANDIDATE_EN_ESSAI) => etatDeLaPlace({ etat: { ...vide, candidate }, candidateDuCode });
  // La candidate du code (l'étape 27), pendant son essai : la phrase que Pierre lit dès le premier jour.
  const enEssai = place(code);
  assert.equal(enEssai.phrase, 'La candidate « Modèle de buts unique » (étape 27) est en essai à blanc, verdict attendu au plus tôt le 14/11/2026 : aucune correction ne passe à blanc avant son verdict.');
  assert.equal(place({ ...code, essai: null, enEssaiDepuis: null }).phrase, 'La candidate « Modèle de buts unique » (étape 27) est en essai à blanc : aucune correction ne passe à blanc avant son verdict.', 'sans date connue');
  // Jugée (avant la mise à jour qui suit son verdict) : plus de « verdict attendu ».
  assert.equal(place({ ...code, statut: 'jugee' }).phrase, 'La candidate « Modèle de buts unique » (étape 27) est jugée : aucune correction ne passe à blanc avant la mise à jour de l’appli qui suit son verdict.');
  // Une candidate qui n'est ni celle du code ni une correction de la boucle.
  const autre = { id: 'autre-1', etape: '30', origine: 'code', statut: 'en-essai', enMots: 'Autre réglage', essai: { depuis: '2027-03-01T06:00:00.000Z' }, horizon: { matchs: 800, jours: 21 } };
  assert.equal(place(autre, null).phrase, 'La candidate « Autre réglage » (étape 30) est en essai à blanc, verdict attendu au plus tôt le 22/03/2027 : aucune correction ne passe à blanc avant son verdict.');
  assert.equal(place({ ...autre, statut: 'jugee' }, null).phrase, 'La candidate « Autre réglage » (étape 30) est jugée : aucune correction ne passe à blanc avant qu’elle libère la place.');
  for (const c of [code, { ...code, statut: 'jugee' }]) assert.doesNotMatch(place(c).phrase, /Une autre candidate|attend son tour/);
  for (const c of [autre, { ...autre, statut: 'jugee' }]) assert.doesNotMatch(place(c, null).phrase, /Une autre candidate|attend son tour/);
  // Avec une correction en file, la passe dit « File d’attente : » suivi de cette phrase (relaisEtape27.test.mjs) ; sans file, la phrase telle quelle.
});
