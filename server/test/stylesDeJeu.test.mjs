/**
 * Étape 37 du plan — LES STYLES DE JEU DES ÉQUIPES ET DES ENTRAÎNEURS (data/db/teamStyle.js, l'enfant, le banc,
 * l'étape « stylesDeJeu », les routes).
 *   node --test test/stylesDeJeu.test.mjs        (depuis server/)
 *
 * Deux sortes d'essais :
 *   - PURS, dans ce processus (aucune base) : le champ `situation` de la carte des tirs et ses pièges (penalties, buts
 *     contre son camp, situation inconnue, carte absente ≠ zéro), les zéros « non publiés », la possession contrôlée,
 *     l'entraîneur (identifiant gardé, homonymes, découverte datée), le REGROUPEMENT (scores, seuil, cran), la
 *     stabilité d'un mois sur l'autre, le début de saison, l'ordre du temps (rien d'après J), le banc des duels (K,
 *     seuil sévère), le lancement (portée « style ») et la règle « le moteur ne lit pas le style » ;
 *   - dans des COPIES ISOLÉES de la base d'essai (isolement.mjs), script test/aides/script-styles-de-jeu.mjs : la nuit
 *     INCRÉMENTALE (à part, rien, rencontre changée seule relue, disparue, interrompue, transactions, calcul lourd,
 *     échec, passe, due), L'ORACLE DE LA COPIE TRONQUÉE (styles mensuels jusqu'à J identiques, homonyme découvert après
 *     J, rencontre folle le jour J, contrôle anti-fuite qui trouve un cache faussé) et la lecture (routes, duel mesuré).
 * Les valeurs attendues sont recalculées ICI, à la main, jamais recopiées d'une sortie.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import * as S from '../src/data/db/teamStyle.js';
import * as B from '../src/data/db/teamStyleBanc.js';
import { __testing as FOTMOB } from '../src/data/providers/fotMobProvider.js';
import { LANCEMENTS, PORTEES, VARIANTES_DE_L_ETAPE_37, VUES_DE_L_ETAPE_37, ETIQUETTES_DE_L_ETAPE_37_POUR_LES_TESTS, verifierLancements, fenetresDeclarees } from '../src/bench/lancements.js';
import { fichiersDuMoteur, MODULES_DU_MOTEUR } from '../src/core/engine/engineVersions.js';
import { zPour } from '../src/bench/guard.js';

const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-styles-de-jeu.mjs');
const SRC = path.join(SERVEUR, 'src');
const proche = (a, b, eps, quoi) => assert.ok(Math.abs(a - b) <= eps, `${quoi} : ${a} ≠ ${b} (± ${eps})`);

function lancer(phase) {
  const copie = preparerCopie();
  try {
    const r = executer(copie, SCRIPT, { args: [phase], timeout: 600_000 });
    assert.equal(r.code, 0, `${phase} a échoué :\n${r.erreurs.slice(-4000)}\n${r.sortie.slice(-2000)}`);
    assert.ok(r.json?.ok, `${phase} : sortie illisible\n${r.sortie.slice(-2000)}`);
    assert.equal(r.reseau, false, `${phase} : un appel réseau a été tenté`);
    return r.json;
  } finally {
    copie.nettoyer();
  }
}
const uneFois = (fabrique) => {
  let valeur;
  return () => (valeur ??= fabrique());
};
const nuit = uneFois(() => lancer('nuit'));
const oracle = uneFois(() => lancer('oracle'));
const lecture = uneFois(() => lancer('lecture'));

// ------------------------------------------------------------ données fabriquées

/** Une ligne d'ingrédients (championnat « L1 » par défaut), au jour n après le 2025-01-01. */
let rang = 0;
function ligne(club, jour, v = {}) {
  rang++;
  return {
    match_key: `m${String(rang).padStart(5, '0')}`,
    camp: 1,
    club,
    adversaire: 999,
    date: S.jourIso(S.numeroDuJour('2025-01-01') + jour),
    league: 'L1',
    coupe: 0,
    sig: 's',
    coach: null,
    coach_id: null,
    poss: 50,
    passes: 450,
    longs: 70,
    centres: 15,
    tiers: 110,
    carte: 1,
    tirs: 12,
    contre: 1,
    corner: 1,
    coup_franc: 1,
    touche: 0,
    autres: 0,
    ...v
  };
}
/** Les profils d'un championnat de 8 clubs : 1 possession, 2 jeu direct, 3 contre-attaque, 4 coups de pied arrêtés, 5-8 neutres. */
const PROFILS = {
  1: { poss: 65, tiers: 170, longs: 45, passes: 600 },
  2: { poss: 38, longs: 130, passes: 330, tiers: 85 },
  3: { poss: 41, longs: 75, passes: 380, contre: 5, tiers: 95 },
  4: { poss: 50, corner: 4, coup_franc: 2, touche: 1 },
  5: { poss: 51 },
  6: { poss: 49, tiers: 112 },
  7: { poss: 50, longs: 72 },
  8: { poss: 50, tiers: 108 }
};
function championnat({ matchs = 20, debut = 0, league = 'L1', profils = PROFILS } = {}) {
  const out = [];
  for (let k = 0; k < matchs; k++) for (const [club, p] of Object.entries(profils)) out.push(ligne(Number(club), debut + 7 * k, { league, ...p, poss: p.poss + (k % 2 ? 0.5 : -0.5) }));
  return out;
}

// ------------------------------------------------------------ T1. le champ situation (carte des tirs FotMob)

test('T1 situation : les huit valeurs réelles et leur sens ; penalties et buts contre son camp retirés ; une situation inconnue compte comme un tir sans catégorie ; le fournisseur garde situation en minuscules', () => {
  assert.deepEqual(Object.keys(S.SITUATIONS).sort(), ['fastbreak', 'freekick', 'fromcorner', 'individualplay', 'penalty', 'regularplay', 'setpiece', 'throwinsetpiece']);
  const carte = [
    { side: 'home', situation: 'fastbreak' },
    { side: 'home', situation: 'FastBreak' },
    { side: 'home', situation: 'fromcorner' },
    { side: 'home', situation: 'setpiece' },
    { side: 'home', situation: 'freekick' },
    { side: 'home', situation: 'throwinsetpiece' },
    { side: 'home', situation: 'penalty' },
    { side: 'home', situation: 'regularplay', ownGoal: true },
    { side: 'home', situation: 'individualplay' },
    { side: 'home', situation: 'Nouvelle' },
    { side: 'home' },
    { side: 'away', situation: 'fastbreak' }
  ];
  assert.deepEqual(S.tirsDuCamp(carte, 'home'), { tirs: 9, contre: 2, corner: 1, coupFranc: 2, touche: 1, autres: 2 });
  assert.deepEqual(S.tirsDuCamp(carte, 'away'), { tirs: 1, contre: 1, corner: 0, coupFranc: 0, touche: 0, autres: 0 });
  // Le fournisseur FotMob : situation en minuscules, côté par l'identifiant du club qui reçoit.
  const carteFotMob = FOTMOB.mapShotmap({ general: { homeTeam: { id: 8 } }, content: { shotmap: { shots: [{ teamId: 8, playerName: 'A', situation: 'FastBreak', eventType: 'Miss' }, { teamId: 9, playerName: 'B', situation: 'FromCorner', eventType: 'Goal' }] } } });
  assert.deepEqual(carteFotMob.map((s) => [s.side, s.situation]), [['home', 'fastbreak'], ['away', 'fromcorner']]);
});

test('T2 pièges : carte absente = NON MESURÉ (jamais zéro) ; les zéros « non publiés » ; la possession hors bornes ou dont la somme ne fait pas 100 ; l’identifiant 0 ; les coupes à part', () => {
  const m = { match_key: 'k', date: '2026-01-10', league: 'EPL', home_id: 'fotmob-8', away_id: 'fotmob-9', updated_at: 'u', lineups: null, shotmap: null };
  const stats = { home: { ball_possession: 60, total_passes: 500, long_balls: 0, crosses: 0, final_third_passes: 120 }, away: { ball_possession: 40, total_passes: 0, long_balls: 50, crosses: 12, final_third_passes: 0 } };
  const [d, e] = S.ingredientsDuMatch(m, stats);
  assert.deepEqual([d.club, d.camp, d.adversaire, e.club, e.camp], [8, 1, 9, 9, 0]);
  assert.deepEqual([d.carte, d.tirs, d.contre, e.tirs], [0, null, null, null], 'pas de carte : non mesuré, jamais 0');
  assert.deepEqual([d.poss, d.passes, d.longs, d.centres, d.tiers], [60, 500, null, null, 120], 'les zéros de longs ballons et de centres : non publiés');
  assert.deepEqual([e.passes, e.longs, e.centres, e.tiers], [null, 50, 12, null]);
  assert.deepEqual(S.possessionsLues(60, 40), [60, 40]);
  assert.deepEqual(S.possessionsLues(70, 40), [null, null], 'somme 110 : absente');
  assert.deepEqual(S.possessionsLues(98, 2), [null, null], 'hors de [5 ; 95]');
  assert.deepEqual(S.possessionsLues(55, null), [55, null]);
  assert.deepEqual(S.ingredientsDuMatch({ ...m, home_id: 'fotmob-0' }, stats), [], 'l’identifiant 0 n’est jamais un club');
  assert.deepEqual(S.ingredientsDuMatch({ ...m, away_id: 'fotmob-8' }, stats), [], 'un club contre lui-même : rien');
  assert.equal(S.ingredientsDuMatch({ ...m, league: 'FA Cup - England' }, stats)[0].coupe, 1);
  // Une fenêtre sans carte suffisante : contre-attaque et coups de pied arrêtés non mesurés.
  const s = S.sommesDe([ligne(1, 0), ligne(1, 7), ...Array.from({ length: 6 }, (_, i) => ligne(1, 14 + 7 * i, { carte: 0, tirs: null, contre: null }))]);
  assert.equal(s.nCarte, 2);
  const t = S.tauxDe(s);
  assert.equal(t.contre, null);
  assert.equal(t.cpa, null);
  assert.equal(t.poss, 50);
  // La signature ne lit jamais la carte des tirs : seulement des colonnes courtes.
  assert.equal(S.signatureDe({ ...m, shotmap: '[…énorme…]' }), 'u|fotmob-8|fotmob-9|EPL|2026-01-10');
});

// ------------------------------------------------------------ T3. l'entraîneur

test('T3 entraîneur : l’identifiant FotMob gardé par l’import (jamais 0) et préféré ; un HOMONYME (A, B, A en moins de 120 jours, ou deux clubs le même jour) suivi club par club, découvert à sa date ; un vrai changement de club n’en est pas un', () => {
  const lu = FOTMOB.mapLineups({ content: { lineup: { homeTeam: { formation: '4-3-3', coach: { id: 30723, name: 'Alessandro Nesta' } }, awayTeam: { coach: [{ id: 0, name: 'Sans Id' }] } } } });
  assert.deepEqual(lu.home, { formation: '4-3-3', coach: 'Alessandro Nesta', coachId: 30723 });
  assert.deepEqual(lu.away, { coach: 'Sans Id' }, 'l’identifiant 0 n’est jamais gardé');
  const c = (club, jour, coach, coach_id = null) => ligne(club, jour, { coach, coach_id });
  const lignes = [
    // Carrière normale : club 1 puis club 2, sans retour.
    c(1, 0, 'Jean Normal'), c(1, 7, 'Jean Normal'), c(2, 200, 'Jean Normal'), c(2, 207, 'Jean Normal'),
    // Homonyme par alternance : 3, 4, 3 en 30 jours → découvert au retour au club 3 (jour 30).
    c(3, 0, 'Diego Martinez'), c(4, 10, 'Diego Martinez'), c(3, 30, 'Diego Martinez'), c(3, 37, 'Diego Martinez'),
    // Homonyme par double match le même jour.
    c(5, 50, 'Jumeau'), c(6, 50, 'Jumeau'),
    // Un retour au même club après 400 jours n'est pas une alternance.
    c(7, 0, 'Revenant'), c(8, 100, 'Revenant'), c(7, 500, 'Revenant'),
    // L'identifiant l'emporte toujours, même sur un nom homonyme.
    c(9, 0, 'Diego Martinez', 4242)
  ];
  const k = S.clesDesEntraineurs(lignes);
  const cle = (i) => k.cles.get(lignes[i]);
  assert.deepEqual([cle(0), cle(2)], ['nom:Jean Normal', 'nom:Jean Normal']);
  assert.deepEqual([cle(4), cle(5)], ['nom:Diego Martinez|club:3', 'nom:Diego Martinez|club:4']);
  assert.deepEqual([cle(8), cle(9)], ['nom:Jumeau|club:5', 'nom:Jumeau|club:6']);
  assert.deepEqual([cle(10), cle(12)], ['nom:Revenant', 'nom:Revenant']);
  assert.equal(cle(13), 'id:4242');
  assert.deepEqual([...k.homonymes].sort(), ['Diego Martinez', 'Jumeau']);
  // ANTI-FUITE : au jour 30 (le retour), l'homonyme n'est pas encore vu ; le lendemain, si.
  const j30 = lignes[6].date;
  assert.equal(k.depuis.get('Diego Martinez'), j30);
  assert.equal(k.cleAuJour(lignes[4], j30), 'nom:Diego Martinez');
  assert.equal(k.cleAuJour(lignes[4], S.jourIso(S.numeroDuJour(j30) + 1)), 'nom:Diego Martinez|club:3');
  assert.equal(S.nomDEntraineur('  Jean   Normal '), 'Jean Normal');
  assert.equal(S.nomDEntraineur(''), null);
});

test('T4 entraîneur : son style suit SES matchs (tous clubs, chacun comparé à son championnat) ; « nouvel entraîneur » compte ses matchs consécutifs à la tête du club', () => {
  const lignes = championnat({ matchs: 20 });
  // L'entraîneur du club 1 (possession) part au club 6 (neutre) pour ses 8 derniers matchs : son style reste « possession »
  // tant que ses matchs avec le club 1 dominent sa fenêtre ; le club 6 compte 8 matchs sous lui.
  for (const l of lignes) {
    if (l.club === 1 && l.date < '2025-03-20') l.coach = 'Pep';
    else if (l.club === 6 && l.date >= '2025-03-20') l.coach = 'Pep';
    else l.coach = `Coach ${l.club}`;
  }
  const calc = new S.CalculDesStyles(lignes);
  const J = calc.jourActuel;
  const e = calc.entraineurs(J).get('nom:Pep');
  assert.ok(e, 'Pep a un style');
  assert.equal(e.n, 20);
  assert.deepEqual(e.clubs.map((c) => c.club).sort(), [1, 6]);
  assert.equal(e.style, 'possession', JSON.stringify(e.scores));
  const inst = calc.instantane(J);
  const six = inst.get(6);
  assert.equal(six.entraineur, 'nom:Pep');
  const apres = lignes.filter((l) => l.club === 6 && l.date >= '2025-03-20').length;
  assert.equal(six.sousLui, apres);
});

// ------------------------------------------------------------ T5. le regroupement

test('T5 regroupement : un championnat de huit clubs fabriqués — possession, jeu direct, contre-attaque, coups de pied arrêtés, quatre neutres ; un z recalculé à la main ; les parts de tirs RÉTRÉCIES vers le championnat', () => {
  const calc = new S.CalculDesStyles(championnat({ matchs: 20 }));
  const inst = calc.instantane(calc.jourActuel);
  const style = (c) => inst.get(c).style;
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8].map(style), ['possession', 'direct', 'contre', 'cpa', 'equilibre', 'equilibre', 'equilibre', 'equilibre']);
  // Le z de la possession du club 1, à la main : moyenne et écart-type (n − 1) des huit possessions moyennes.
  const poss = [1, 2, 3, 4, 5, 6, 7, 8].map((c) => PROFILS[c].poss);
  const m = poss.reduce((a, b) => a + b, 0) / 8;
  const sd = Math.sqrt(poss.reduce((a, b) => a + (b - m) ** 2, 0) / 7);
  proche(inst.get(1).z.poss, (65 - m) / sd, 1e-9, 'z de la possession');
  // La part de contres du club 3 : 5 sur 12 tirs × 20 matchs, ramenée vers le championnat avec 150 tirs.
  const tirs = 8 * 20 * 12;
  const pool = (7 * 20 * 1 + 20 * 5) / tirs;
  proche(S.partRetrecie(100, 240, pool), (100 + 150 * pool) / (240 + 150), 1e-12, 'rétrécissement');
  assert.ok(inst.get(3).t.contre === 100 / 240, 'la part brute est gardée pour l’écran');
  // La référence du championnat : ses moyennes brutes, ce que l'écran met à côté.
  proche(inst.get(1).ref.brut.poss, m, 1e-9, 'moyenne brute');
  assert.equal(inst.get(1).ref.equipes, 8);
  // Les lignes rangées : arrondies, avec leur championnat et les réglages.
  const l = S.ligneDeStyle(inst.get(1), { actuel: true });
  assert.equal(l.style, 'possession');
  assert.equal(l.actuel, 1);
  assert.equal(l.l_equipes, 8);
  assert.equal(l.reglages, S.empreinteDesReglages());
});

test('T6 scores et seuil : « contre-attaque » exige de laisser le ballon ; le seuil 0,75 ; à égalité l’ordre des styles ; la seconde tendance ; le CRAN (hystérésis)', () => {
  assert.deepEqual(S.scoresDe({ poss: 1, tiers: 0.6, longs: -1, contre: 2, cpa: 0 }), { possession: 0.8, direct: -1, contre: null, cpa: 0 }, 'pas de contre-attaque avec plus de ballon que la moyenne');
  assert.equal(S.scoresDe({ poss: -0.5, tiers: null, longs: 0.5, contre: 1, cpa: null }).possession, -0.5);
  assert.equal(S.scoresDe({ poss: -0.5, tiers: null, longs: 0.5, contre: 1, cpa: null }).direct, 0.5);
  assert.equal(S.scoresDe({ poss: null, tiers: null, longs: 1, contre: 1, cpa: null }).direct, null);
  const et = (sc, prec = null) => S.etiquetteDe({ possession: null, direct: null, contre: null, cpa: null, ...sc }, prec);
  assert.deepEqual(et({ possession: 0.74 }), { style: 'equilibre', second: null });
  assert.deepEqual(et({ possession: 0.75 }), { style: 'possession', second: null });
  assert.deepEqual(et({ possession: 1, cpa: 1 }), { style: 'possession', second: 'cpa' }, 'égalité : l’ordre des styles');
  assert.deepEqual(et({ possession: 0.8, cpa: 1.2 }), { style: 'cpa', second: 'possession' });
  // Le cran : garder « possession » à 0,55 (≥ 0,5) ; le perdre à 0,49 ; changer seulement si l'autre le dépasse de 0,25.
  assert.equal(et({ possession: 0.55 }, 'possession').style, 'possession');
  assert.equal(et({ possession: 0.49 }, 'possession').style, 'equilibre');
  assert.equal(et({ possession: 0.8, cpa: 1.0 }, 'possession').style, 'possession');
  assert.equal(et({ possession: 0.8, cpa: 1.06 }, 'possession').style, 'cpa');
  // Quitter « sans style marqué » demande 1,0.
  assert.equal(et({ direct: 0.9 }, 'equilibre').style, 'equilibre');
  assert.equal(et({ direct: 1.0 }, 'equilibre').style, 'direct');
  // Un style précédent qui n'est plus mesuré (null) ne retient rien.
  assert.equal(et({ possession: 0.9 }, 'contre').style, 'possession');
});

// ------------------------------------------------------------ T7. la stabilité, le début de saison

test('T7 stabilité d’un mois sur l’autre : comptée sur les clubs établis aux deux mois ; le témoin sans le cran ; le plus mauvais mois ; les débuts de saison', () => {
  const e = (style, n = 20, nSaison = 20, scores = { possession: null, direct: null, contre: null, cpa: null }) => ({ style, n, nSaison, scores });
  const sc = (x) => ({ possession: x, direct: null, contre: null, cpa: null });
  const suite = [
    ['2025-01-01', new Map([[1, e('possession', 20, 20, sc(0.8))], [2, e('direct')], [3, e('equilibre', 8)]])],
    ['2025-02-01', new Map([[1, e('possession', 20, 20, sc(0.6))], [2, e('equilibre')], [3, e('possession')]])],
    ['2025-03-01', new Map([[1, e('possession', 20, 3, sc(0.7))], [2, e('equilibre', 20, 2)]])],
    ['2025-03-15', new Map([[1, e('cpa')]])]
  ];
  const s = B.mesurerLaStabilite(suite);
  // Paires établies : (1, 2) en février — le 3 a 8 matchs en janvier ; (1, 2) en mars. Mêmes : 1 en février, 2 en mars.
  assert.equal(s.paires, 4);
  assert.equal(s.part, 3 / 4);
  assert.deepEqual(s.plusBas, { jour: '2025-02-01', paires: 2, part: 0.5 });
  // Sans le cran, le club 1 (0,6 puis 0,7 : sous le seuil) serait « sans style » : il change en février, pas en mars.
  assert.equal(s.sansCran, 3 / 4);
  assert.deepEqual(s.debutSaison, { paires: 2, part: 1 });
  // Le jour non mensuel (le 15) ne compte pas.
  assert.equal(s.parMois.length, 2);
});

test('T8 début de saison : la fenêtre enjambe la trêve (45 jours) ; « provisoire » sous 12 matchs, rien sous 6 ; 400 jours au plus', () => {
  const lignes = championnat({ matchs: 15 });
  const suite = championnat({ matchs: 3, debut: 7 * 15 + 60 });
  const calc = new S.CalculDesStyles([...lignes, ...suite]);
  const inst = calc.instantane(calc.jourActuel);
  assert.equal(inst.get(1).n, 18);
  assert.equal(inst.get(1).nSaison, 3, 'trois matchs depuis la trêve');
  assert.equal(inst.get(1).style, 'possession', 'le style de la saison passée tient');
  const court = new S.CalculDesStyles(championnat({ matchs: 8 }));
  const i8 = court.instantane(court.jourActuel);
  assert.equal(i8.get(1).provisoire, true);
  const tropCourt = new S.CalculDesStyles(championnat({ matchs: 5 }));
  assert.equal(tropCourt.instantane(tropCourt.jourActuel).size, 0, 'moins de 6 matchs : pas de style');
  const vieux = new S.CalculDesStyles(championnat({ matchs: 20 }));
  assert.equal(vieux.instantane(S.jourIso(S.numeroDuJour('2025-01-01') + 7 * 19 + 401 + 7 * 14)).size, 0, 'au-delà de 400 jours : plus rien');
  assert.deepEqual(S.premiersDuMois('2025-01-20', '2025-04-01'), ['2025-02-01', '2025-03-01', '2025-04-01']);
});

test('T9 ordre du temps : un instantané au jour J ne lit RIEN du jour J ni d’après — une rencontre folle plantée à J ne change ni les styles, ni les références, ni le cran', () => {
  const lignes = championnat({ matchs: 20 });
  const calc = new S.CalculDesStyles(lignes);
  const J = S.jourIso(S.numeroDuJour('2025-01-01') + 7 * 12);
  const prec = calc.instantane(S.jourIso(S.numeroDuJour(J) - 31));
  const avant = calc.instantane(J, prec);
  const fou = [ligne(5, 7 * 12, { poss: 95, contre: 12, tirs: 12 }), ligne(5, 7 * 12 + 3, { poss: 95, contre: 12, tirs: 12 }), ligne(42, 7 * 12, { poss: 5 })];
  const calc2 = new S.CalculDesStyles([...lignes, ...fou]);
  const apres = calc2.instantane(J, calc2.instantane(S.jourIso(S.numeroDuJour(J) - 31)));
  const sansRef = (m) => JSON.stringify([...m.values()].map((e) => ({ ...e, ref: e.ref.m })));
  assert.equal(sansRef(apres), sansRef(avant));
  assert.equal(apres.has(42), false);
});

// ------------------------------------------------------------ T10. le banc des duels

test('T10 banc des duels : un duel qui surprend vraiment le marché est RETENU malgré K = 53 ; un duel au prix juste ne l’est pas ; le seuil est sévère (z ≈ 3,31) ; les petites règles', () => {
  assert.equal(B.K_VARIANTES, 53);
  proche(zPour(0.05, 53), 3.31, 0.01, 'z de Bonferroni pour 53 variantes');
  // Les petites règles : inclinaison et décalage neutres à 0, une somme à 1, un décalage appris = 0 sans données.
  assert.deepEqual(B.incliner([0.5, 0.3, 0.2], 0), [0.5, 0.3, 0.2]);
  proche(B.incliner([0.5, 0.3, 0.2], 0.4).reduce((a, b) => a + b, 0), 1, 1e-12, 'somme');
  proche(B.decaler(0.55, 0), 0.55, 1e-12, 'décalage nul');
  proche(B.apprendreUnDecalage(() => 0), 0, 1e-6, 'sans données, le décalage reste à 0');
  const p = [0.45, 0.27, 0.28];
  const cycle = (n, h, d) => Array.from({ length: n }, (_, i) => ((i % 100) < h ? 0 : (i % 100) < h + d ? 1 : 2));
  const matchs = [];
  let k = 0;
  const pousser = (date, dom, ext, issue, pm = 0.5, plus = k % 2 === 0) => matchs.push({ cle: `b${k++}`, date, dom, ext, un2: p, pm, issue, plus });
  // Case « possession × contre » : le visiteur gagne 60 % alors que la cote dit 28 %.
  for (const issue of cycle(800, 25, 15)) pousser('2024-03-01', 'possession', 'contre', issue);
  for (const issue of cycle(600, 25, 15)) pousser('2025-10-01', 'possession', 'contre', issue);
  // Case « sans style × sans style » : au prix juste (45, 27, 28 sur 100).
  for (const issue of cycle(800, 45, 27)) pousser('2024-03-01', 'equilibre', 'equilibre', issue);
  for (const issue of cycle(600, 45, 27)) pousser('2025-10-01', 'equilibre', 'equilibre', issue);
  const r = B.jugerLesDuels(matchs, { tirages: 300 });
  const caseDe = (dom, ext, marche) => r.cases.find((c) => c.dom === dom && c.ext === ext && c.marche === marche);
  assert.equal(caseDe('possession', 'contre', 'un2').verdict, 'retenu');
  assert.ok(caseDe('possession', 'contre', 'un2').decalage < 0, 'vers l’extérieur');
  assert.ok(caseDe('possession', 'contre', 'un2').effet < 0, 'moins de victoires à domicile que la cote');
  assert.notEqual(caseDe('equilibre', 'equilibre', 'un2').verdict, 'retenu');
  assert.equal(caseDe('direct', 'direct', 'un2').verdict, 'pas-assez-de-matchs');
  assert.equal(r.cases.length, 50, '25 cases × 2 marchés');
  assert.equal(r.K, 53);
  assert.equal(r.apprentissage, 1600);
  assert.equal(r.verification, 1200);
  // Le plus/moins 2,5 au prix juste (un sur deux) : rien de retenu.
  assert.notEqual(r.global.pm.verdict, 'retenu');
});

test('T11 ce qui est recopié du banc : DUELS_AU_BANC porte l’empreinte des réglages EN SERVICE (sinon rien n’est dit « mesuré ») ; K = 53 ; aucune case retenue sur le magasin ; la case retenue n’est lue qu’avec les mêmes réglages', () => {
  assert.equal(S.DUELS_AU_BANC.reglages, S.empreinteDesReglages(), 'réglages changés : relancer scripts/team-style.mjs --banc et recopier');
  assert.equal(S.DUELS_AU_BANC.K, VARIANTES_DE_L_ETAPE_37.length);
  assert.deepEqual(S.DUELS_AU_BANC.cases, []);
  assert.equal(S.DUELS_AU_BANC.casesJugees + S.DUELS_AU_BANC.casesTropPetites, 50);
  assert.deepEqual(S.DUELS_AU_BANC.periode, { apprentissage: B.PERIODES_DU_BANC.apprentissage, verification: B.PERIODES_DU_BANC.verification });
  for (const g of Object.values(S.DUELS_AU_BANC.global)) assert.notEqual(g.verdict, 'retenu');
  const banc = { reglages: S.empreinteDesReglages(), cases: [{ dom: 'possession', ext: 'contre', marche: 'un2', verdict: 'retenu', matchs: 300 }, { dom: 'direct', ext: 'cpa', marche: 'un2', verdict: 'pas-prouve' }] };
  assert.equal(S.caseMesuree('possession', 'contre', banc).matchs, 300);
  assert.equal(S.caseMesuree('direct', 'cpa', banc), null, 'pas prouvé : pas d’effet');
  assert.equal(S.caseMesuree('possession', 'contre', { ...banc, reglages: 'v0-autre' }), null, 'd’autres réglages : rien de mesuré');
  // Le banc ne lit que la fenêtre permise du magasin : 2023-07-01 → 2026-09-23, jamais 2023-S1 ni après.
  assert.deepEqual(B.PERIODES_DU_BANC.donnees, { de: '2023-07-01', a: '2026-09-23' });
  assert.ok(B.PERIODES_DU_BANC.apprentissage.a < B.PERIODES_DU_BANC.verification.de);
});

// ------------------------------------------------------------ T12. le lancement, la règle du moteur

test('T12 lancement : l’étape 37 déclarée (style-v1, datée du premier démarrage, 53 variantes, la retenue en tête), portée « style » seulement — jamais « déjà vue » par le moteur, l’indice ou les joueurs', () => {
  assert.equal(verifierLancements(LANCEMENTS), true);
  assert.ok(PORTEES.includes('style'));
  const l = LANCEMENTS.find((x) => x.etape === '37');
  assert.deepEqual([l.version, l.le, l.variantes.length, l.variantes[0].id], ['style-v1', null, 53, 'style-v1']);
  assert.deepEqual([...new Set(l.vues.flatMap((v) => v.pour))], ['style']);
  assert.deepEqual(l.vues.map((v) => [v.de, v.a]), VUES_DE_L_ETAPE_37.map((v) => [v.de, v.a]));
  assert.deepEqual(ETIQUETTES_DE_L_ETAPE_37_POUR_LES_TESTS, S.STYLES_ET_EQUILIBRE, 'les cases déclarées = les étiquettes du calcul');
  assert.deepEqual(B.casesDuDuel().length * 2 + 3, 53);
  for (const c of B.casesDuDuel()) for (const m of ['un2', 'pm']) assert.ok(VARIANTES_DE_L_ETAPE_37.some((v) => v.id === `case-${m}-${c.replace('|', '-')}`), c);
  assert.ok(fenetresDeclarees({ portee: 'style' }).some((f) => f.etape === '37'));
  for (const portee of ['moteur', 'indice', 'joueurs', 'statistiques', 'marche']) assert.ok(!fenetresDeclarees({ portee }).some((f) => f.etape === '37'), portee);
});

const codeSansCommentaires = (f) => fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
function atteints(depart) {
  const vus = new Set();
  const pile = [...depart];
  while (pile.length) {
    const f = pile.pop();
    if (vus.has(f) || !fs.existsSync(f)) continue;
    vus.add(f);
    const texte = fs.readFileSync(f, 'utf8');
    for (const m of texte.matchAll(/(?:from\s+|import\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) pile.push(path.resolve(path.dirname(f), m[1]));
  }
  return vus;
}

test('T13 LE MOTEUR NE LIT PAS LE STYLE : aucun fichier de l’empreinte du moteur n’atteint (même de loin) les styles ; ces modules sont HORS de l’empreinte ; aucun fichier du moteur ne nomme leurs tables ; l’enfant lit en lecture seule, sans horloge', () => {
  const duMoteur = fichiersDuMoteur().map((rel) => path.join(SRC, rel));
  assert.ok(duMoteur.length > 20);
  const graphe = [...atteints(duMoteur)].map((f) => path.relative(SRC, f).split(path.sep).join('/'));
  for (const interdit of ['data/db/teamStyle.js', 'data/db/teamStyleBanc.js', 'data/db/teamStyleEnfant.js']) {
    assert.ok(!graphe.includes(interdit), `${interdit} atteint depuis le moteur`);
    assert.ok(!fichiersDuMoteur().includes(interdit), `${interdit} dans l’empreinte`);
  }
  for (const d of MODULES_DU_MOTEUR.dossiers) assert.ok(!'data/db/teamStyle.js'.startsWith(`${d}/`), d);
  for (const f of duMoteur) assert.doesNotMatch(codeSansCommentaires(f), /team_style|coach_style|teamStyle|stylesDeJeu|style-duel/, path.relative(SRC, f));
  assert.match(codeSansCommentaires(path.join(SRC, 'data', 'db', 'teamStyleEnfant.js')), /new DatabaseSync\(chemin, \{ readOnly: true \}\)/);
  for (const f of ['teamStyle.js', 'teamStyleBanc.js', 'teamStyleEnfant.js']) assert.doesNotMatch(codeSansCommentaires(path.join(SRC, 'data', 'db', f)), /Date\.now\(\)|new Date\(\)/, f);
  // Le banc lit des résultats : jamais importé par la nuit ni par la lecture de l'écran.
  assert.doesNotMatch(codeSansCommentaires(path.join(SRC, 'data', 'db', 'teamStyle.js')), /teamStyleBanc/);
  assert.doesNotMatch(codeSansCommentaires(path.join(SRC, 'jobs', 'matchStatsAutoRefresh.js')), /teamStyleBanc/);
});

// ------------------------------------------------------------ la nuit (copie isolée)

test('T14 la nuit INCRÉMENTALE : « maintenant » obligatoire ; le calcul À PART (autre processus, base intacte) ; premier calcul = la reconstruction ; rien de changé → rien ; une rencontre changée → SEULE elle est relue ; une disparue retirée ; un rangement interrompu → tout relu ; aucune transaction ouverte ; un banc → reporté ; un échec n’écrit rien', () => {
  const s = nuit();
  assert.match(s.sansMaintenant, /« maintenant »/);
  assert.equal(s.enfant.autrePid, true);
  assert.equal(s.enfant.baseIntacte, true, 'l’enfant n’écrit rien');
  assert.deepEqual(s.enfant.controle, { lignes: 20, ecarts: 0 });
  assert.equal(s.premier.mode, 'premier');
  assert.equal(s.premier.face.identiques, true, JSON.stringify(s.premier.face));
  assert.ok(s.premier.actuels > 100 && s.premier.entraineurs > 20, JSON.stringify(s.premier));
  assert.ok(s.premier.repartition.contre > 0 && s.premier.repartition.cpa > 0, 'les profils plantés se retrouvent');
  assert.equal(s.premier.homonymes, 1, 'l’homonyme planté');
  assert.equal(s.premier.etat.aJour, true);
  assert.equal(s.rien.mode, 'rien');
  assert.equal(s.incremental.mode, 'incremental');
  assert.equal(s.incremental.relues, 1, 'la lecture INCRÉMENTALE : une seule rencontre relue, carte des tirs comprise');
  assert.deepEqual(s.incremental.possLue, [71, 29]);
  assert.equal(s.incremental.face.identiques, true, JSON.stringify(s.incremental.face));
  assert.equal(s.disparue.disparues, 1);
  assert.equal(s.disparue.restantes, 0);
  assert.equal(s.disparue.face.identiques, true);
  assert.equal(s.interrompu.avant.aJour, false);
  assert.equal(s.interrompu.mode, 'complet');
  assert.equal(s.interrompu.toutRelu, true);
  assert.equal(s.interrompu.face.identiques, true);
  assert.equal(s.interrompu.etat.enCours, null);
  assert.ok(s.transactions.points > 10);
  assert.deepEqual(s.transactions.ouvertes, []);
  assert.equal(s.reporte.mode, 'reporte');
  assert.equal(s.reporte.inchange, true);
  assert.equal(s.echec.mode, 'echec');
  assert.equal(s.echec.inchange, true);
});

test('T15 l’étape « stylesDeJeu » de la passe : après « fichesJoueurs », avant le gel et la sauvegarde ; son résumé (explication seulement, contrôle), son alerte durable, quand elle est due', () => {
  const s = nuit();
  const i = s.etapes.indexOf('stylesDeJeu');
  assert.equal(s.etapes[i - 1], 'fichesJoueurs');
  assert.equal(s.etapes[i + 1], 'gelPronostics');
  assert.ok(s.etapes.indexOf('sauvegarde') > i);
  assert.equal(s.passe.status, 'ok');
  assert.match(s.passe.summary, /Explication seulement : le moteur ne lit pas les styles\./);
  assert.match(s.passe.summary, /contrôle anti-fuite : 20 instantanés recalculés par un second chemin, 0 écart/);
  assert.deepEqual(s.passe.alerte, { key: 'stylesDeJeu', value: null });
  assert.equal(s.passe.changed, false);
  assert.deepEqual(s.due, { jamais: true, aujourdhui: false, reporte: true, manuel: true });
});

test('T16 L’ORACLE DE LA COPIE TRONQUÉE : tout ce qui suit J supprimé, les styles mensuels jusqu’à J sont EXACTEMENT ceux de la copie entière (cran, références, entraîneur) ; l’homonyme découvert après J n’est pas séparé avant J ; une rencontre folle à J ne change rien d’avant', () => {
  const o = oracle();
  assert.equal(o.oracle.identiques, true, JSON.stringify(o.oracle.ecart));
  assert.ok(o.oracle.lignes > 300 && o.oracle.moisDeJ > 100, JSON.stringify(o.oracle));
  assert.ok(o.oracle.tronqueeJusqua < o.oracle.J && o.oracle.entiereJusqua > o.oracle.J);
  assert.ok(o.plante.dB > o.oracle.J, 'l’alternance n’est vue qu’après J');
  assert.deepEqual(o.oracle.homonyme.auJourJ, { entiere: 'nom:Diego Martinez', tronquee: 'nom:Diego Martinez' });
  assert.equal(o.oracle.homonyme.actuelEntiere, `nom:Diego Martinez|club:${o.plante.clubA}`, 'aujourd’hui, séparé');
  assert.equal(o.folle.identiques, true);
  assert.ok(o.folle.changeApres > 0, 'la rencontre folle compte bien après J');
});

test('T17 le contrôle anti-fuite par un second chemin : 0 écart sur la base honnête ; un cache faussé est trouvé, par l’outil et par la passe de nuit', () => {
  const o = oracle();
  assert.deepEqual(o.controle.honnetes, { lignes: 20, ecarts: 0 });
  assert.ok(o.controle.fausse.ecarts > 0, JSON.stringify(o.controle));
  assert.deepEqual(o.controle.fausse.colonnes, ['poss']);
  assert.ok(o.controle.nuit.ecarts > 0, 'la nuit le voit aussi');
});

test('T18 la lecture : GET /team-style et /style-duel — jamais calculé (même forme), prêt, par noms (annuaire), club inconnu (404), paramètres faux (400) ; le duel MESURÉ seulement avec une case retenue et les réglages en service ; quelques millisecondes', () => {
  const l = lecture();
  assert.equal(l.avant.equipe.code, 200);
  assert.equal(l.avant.equipe.absent, true);
  assert.equal(l.avant.equipe.style, null);
  assert.equal(l.avant.duel.duel, null);
  const r = l.route;
  assert.equal(r.equipe.code, 200);
  assert.ok(S.STYLES_ET_EQUILIBRE.includes(r.equipe.style));
  assert.ok(r.equipe.historique >= 1);
  assert.equal(r.equipe.entraineur, 'Diego Martinez');
  assert.equal(r.equipe.source, 'FotMob (magasin) : statistiques d’équipe, carte des tirs et compositions');
  assert.match(r.equipe.regle, /^explication seulement/);
  assert.ok(r.equipe.base.endsWith('match-stats.db'));
  assert.equal(r.duel.code, 200);
  assert.equal(r.duel.duel.explicationSeulement, true);
  assert.equal(r.duel.duel.mesure, null);
  assert.equal(r.duel.banc.valable, true);
  assert.equal(r.duel.banc.K, 53);
  assert.match(r.duel.homeId, /^fotmob-\d+$/);
  assert.deepEqual([r.duelParNoms.code, r.duelParNoms.homeId, r.duelParNoms.awayId], [200, r.duel.homeId, r.duel.awayId], 'par les noms : les mêmes clubs');
  assert.equal(r.nomInconnu, 404);
  assert.equal(r.sansClub, 400);
  assert.equal(r.mauvais, 400);
  assert.equal(r.zero, 400);
  assert.deepEqual(r.inconnu, { code: 200, style: null });
  assert.equal(l.mesure.duel.explicationSeulement, false);
  assert.equal(l.mesure.duel.mesure.verdict, 'retenu');
  assert.equal(l.mesure.autresReglages.mesure, null);
  assert.equal(l.mesure.autresReglages.explicationSeulement, true);
  assert.equal(l.mesure.bancAutre, false);
  assert.ok(l.lectureMs.equipe < 50 && l.lectureMs.duel < 50, JSON.stringify(l.lectureMs));
});
