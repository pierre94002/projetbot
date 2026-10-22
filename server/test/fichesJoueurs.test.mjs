/**
 * Étape 30 du plan — LES FICHES DES JOUEURS PAR POSTE ET LA FORCE DU ONZE (data/db/playerRatings.js, l'enfant, le
 * banc, l'étape « fichesJoueurs », le lecteur de la page du match, la route).
 *   node --test test/fichesJoueurs.test.mjs        (depuis server/)
 *
 * Deux sortes d'essais :
 *   - PURS, dans ce processus (aucune base) : les pièges FotMob des postes (le fournisseur et la table du jour J),
 *     l'identifiant 0, les drapeaux « a joué » manquants, la feuille sans titulaires, les minutes minimales, les xG
 *     concédés sur le terrain, les corrections (adversaires, championnat), l'ordre du temps (fuite refusée), la
 *     force du onze (hors poste, inconnus), le banc (inclinaison, tirs), le lancement (portée « joueurs ») et la
 *     règle de Pierre (aucun fichier du moteur n'atteint ces modules) ;
 *   - dans des COPIES ISOLÉES de la base d'essai (isolement.mjs), script test/aides/script-fiches-joueurs.mjs : la
 *     nuit (à part, rien, tardive, fusion, interrompu, transactions, calcul lourd, échec, passe, due), L'ORACLE DE
 *     LA COPIE TRONQUÉE (fiches, équipes habituelles et force du onze lues = celles du rejeu avant J ; 9-0 planté ;
 *     contrôle anti-fuite), le lecteur de la page du match et la route.
 * Les valeurs attendues sont recalculées ICI, à la main, jamais recopiées d'une sortie.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import * as P from '../src/data/db/playerRatings.js';
import * as B from '../src/data/db/playerRatingsBanc.js';
import { __testing as FOTMOB } from '../src/data/providers/fotMobProvider.js';
import { LANCEMENTS, PORTEES, VARIANTES_DE_L_ETAPE_30, VUES_DE_L_ETAPE_30, verifierLancements, fenetresDeclarees } from '../src/bench/lancements.js';
import { fichiersDuMoteur, MODULES_DU_MOTEUR } from '../src/core/engine/engineVersions.js';

const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-fiches-joueurs.mjs');
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

const JOUR0 = P.numeroDuJour('2025-01-01');
let numeroRencontre = 1;
/** Une rencontre fabriquée pour le rejeu : `joueurs` = lignes de player_day (colonnes brutes), camp 1 domicile. */
function rencontre({ jour, home = 10, away = 20, league = 'L1', coupe = false, attribue = false, joueurs = [], possession = [50, 50], tirsAdverses = null, xg = [1.2, 0.8], buts = [1, 0] }) {
  const date = P.jourIso(JOUR0 + jour);
  return {
    rencontre: numeroRencontre++,
    matchKey: `${date}-${home}-${away}`,
    jour: JOUR0 + jour,
    date,
    league,
    saison: 2025,
    home,
    away,
    attribue,
    prolongation: false,
    compte: !coupe,
    coupe,
    ligneDom: { matchKey: `${date}-${home}-${away}`, camp: 1, club: home, adversaire: away, date, league, saison: 2025, attribue: attribue ? 1 : 0, prolongation: 0, compte: coupe ? 0 : 1, coupe: coupe ? 1 : 0, bp: buts[0], bc: buts[1], bp90: null, bc90: null, xg_p: xg[0], xg_c: xg[1] },
    possession,
    tirsEquipe: [12, 9],
    tirsAdverses,
    joueurs
  };
}
/** Une ligne de joueur JOUÉE (valeurs brutes de player_day : xG ×1000, note ×100). */
const joueur = (id, { camp = 1, titulaire = 1, poste = 3, minutes = 90, xgnp = 100, xa = 100, xgot = 80, tirs = 2, pc = 1, recup = 5, duels_g = 4, note = 700, buts_evites = null, entre_min = null, sorti_min = null } = {}) => ({
  joueur: id, camp, titulaire, poste, minutes, xgnp, xa, xgot, tirs, pc, recup, duels_g, note, buts_evites, entre_min, sorti_min
});
/** Onze titulaires d'un camp (ids de base..base+10 ; le premier gardien). */
const onze = (base, camp, options = {}) => Array.from({ length: 11 }, (_, i) => joueur(base + i, { camp, poste: i === 0 ? 1 : i < 5 ? 2 : i < 9 ? 3 : 4, ...options }));
function rejouerTout(rencontres, options = {}) {
  const r = new P.RejeuDesFiches(options);
  let dernier = null;
  for (const m of rencontres) {
    if (dernier !== null && m.jour !== dernier) r.finDeJournee();
    dernier = m.jour;
    r.ajouter(m);
  }
  r.finDeJournee();
  return r;
}

// ------------------------------------------------------------ T1. les postes (pièges FotMob)

test('T1 postes : la grille (11 gardien, 3x défense, 4x-8x milieu, 9x+ attaque) ; les CODES DE RÔLE reconnus sur le onze (0 gardien seulement s’il est seul) ; le code 0 du poste habituel n’est JAMAIS un gardien (seul le drapeau) ; le libéro compte défenseur ; poste inconnu → poste dominant, égalité → le plus petit', () => {
  assert.deepEqual([11, 34, 75, 105, 0, -1].map(FOTMOB.roleOfGridPosition), ['Goalkeeper', 'Defender', 'Midfielder', 'Forward', null, null]);
  const codes = [0, 1, 1, 1, 1, 2, 2, 2, 3, 3, 3].map((positionId) => ({ positionId }));
  assert.equal(FOTMOB.lineupUsesRoleCodes(codes), true);
  assert.equal(FOTMOB.lineupUsesRoleCodes([11, 32, 34, 36, 38, 73, 75, 77, 103, 105, 107].map((positionId) => ({ positionId }))), false);
  assert.equal(FOTMOB.roleOfLineupEntry({ positionId: 0 }, { starter: true, roleCodes: true, gardiensCode0: 1 }), 'Goalkeeper');
  assert.equal(FOTMOB.roleOfLineupEntry({ positionId: 0 }, { starter: true, roleCodes: true, gardiensCode0: 2 }), null, 'code 0 partout = inconnu (Copa Chile 2023)');
  assert.equal(FOTMOB.roleOfLineupEntry({ positionId: 2 }, { starter: true, roleCodes: true, gardiensCode0: 1 }), 'Midfielder');
  assert.equal(FOTMOB.mapPlayer({ name: 'X', id: 5, usualPosition: 0 }).position, undefined, 'le code 0 du poste habituel ne fait pas un gardien');
  assert.equal(FOTMOB.mapPlayer({ name: 'X', id: 5, isGoalkeeper: true }).position, 'Goalkeeper');
  assert.equal(FOTMOB.mapPlayer({ name: 'X', id: 5, usualPosition: 3 }).position, 'Forward');
  assert.equal(FOTMOB.mapPlayer({ name: 'X', id: 0, usualPosition: 3 }).playerId, undefined, 'l’identifiant 0 n’est jamais une identité');
  // La table du jour J (player_day.poste : 1-5) → ligne : le libéro (5) en défense ; NULL inconnu.
  assert.deepEqual([1, 2, 3, 4, 5, 0, null].map(P.ligneDuPoste), [1, 2, 3, 4, 2, null, null]);
  assert.deepEqual(['Goalkeeper', 'Defender', 'Sweeper', 'Midfielder', 'Forward', 'Substitute', null].map(P.ligneDuRoleAnnonce), [1, 2, 2, 3, 4, null, null]);
  // Poste dominant : minutes pondérées ; à égalité, le code le plus petit ; jamais le poste d'une ligne sans poste.
  const r = rejouerTout([
    rencontre({ jour: 0, joueurs: [joueur(1, { poste: 2, minutes: 90 })] }),
    rencontre({ jour: 1, joueurs: [joueur(1, { poste: 3, minutes: 90 * 2 ** (-1 / 25) })] }),
    rencontre({ jour: 2, joueurs: [joueur(1, { poste: null, minutes: 45 })] })
  ]);
  const f = r.fiche(1);
  assert.equal(f.poste, 2, 'égalité des minutes pondérées : le code le plus petit (défenseur)');
  assert.equal(f.apparitions, 3, 'la ligne sans poste compte comme apparition');
});

test('T2 hors poste : un défenseur aligné au milieu compte dans la ligne MILIEU, avec SES composantes ; un titulaire sans ligne prend celle de sa fiche ; les buts évités (≈ 0 au banc) n’entrent jamais dans la force du onze', () => {
  const fiches = new Map([
    [1, { apport_off: 120, apport_def: 30, poste: 2, etablie: 1, tirs: 900, buts_evites: 400 }],
    [2, { apport_off: 300, apport_def: -10, poste: 4, etablie: 0, tirs: 2000 }]
  ]);
  const f = P.forceDuOnze({ titulaires: [{ joueur: 1, ligne: 3 }, { joueur: 2, ligne: null }], fiches, habituelle: null });
  assert.equal(f.lignes.milieu.aujourdhui, 0.12);
  assert.equal(f.lignes.defense.aujourdhui, 0);
  assert.equal(f.lignes.attaque.aujourdhui, 0.3);
  assert.equal(f.offensif.aujourdhui, 0.42);
  proche(f.defensif.aujourdhui, 0.01, 1e-12, 'moyenne défensive des deux (ses buts évités jamais comptés)');
  assert.equal(f.nonEtablis, 1);
  assert.equal(f.offensif.habituel, null, 'sans équipe habituelle : pas d’écart');
});

// ------------------------------------------------------------ T3-T5. identifiant 0, feuilles, drapeaux

test('T3 identifiant 0 : jamais une fiche ni une lecture ; un titulaire annoncé sans identifiant est un INCONNU (0,80 × la moyenne offensive de sa ligne), compté', () => {
  const habituelle = { parts: [[7, 1000, 0, 4]], gardien: null };
  const fiches = new Map([[7, { apport_off: 250, apport_def: 0, poste: 4, etablie: 1 }]]);
  const f = P.forceDuOnze({ titulaires: [{ joueur: null, ligne: 4 }], inconnus: [{ ligne: 2 }], fiches, habituelle, moyennesOff: [0, 100, 250, 400] });
  // Attaque : −0,2 × 400 (l'inconnu annoncé), défense : −0,2 × 100 (l'inconnu de la liste) ; l'habituel (7) absent.
  assert.equal(f.lignes.attaque.aujourdhui, -0.08);
  assert.equal(f.lignes.defense.aujourdhui, -0.02);
  assert.equal(f.inconnus, 2);
  assert.equal(f.absents, 1);
  assert.equal(f.lignes.attaque.ecart, -0.33);
  // La lecture ne prend jamais l'identifiant 0 (ni un nom) : aucune requête n'est faite.
  const appels = [];
  const fausse = { prepare: (sql) => (appels.push(sql), { all: () => [], get: () => null }) };
  assert.equal(P.lireFiches(['fotmob-0', '0', 0, null, 'nom:x'], { database: fausse }).size, 0);
  assert.equal(appels.length, 0);
  assert.equal(P.lireEquipeHabituelle('fotmob-0', { database: fausse }), null);
});

test('T4 feuille sans titulaires identifiés (moins de 9) : ni apparition de l’équipe habituelle ni vieillissement de ses parts ; T5 drapeaux « a joué » manquants : avec minutes, jouée (sans titularisation) ; sans minutes, INCONNUE (ni apparition, ni « non titularisé »)', () => {
  const base = [rencontre({ jour: 0, joueurs: onze(100, 1) }), rencontre({ jour: 1, joueurs: onze(100, 1) })];
  const avant = rejouerTout(base).habituelle(10);
  // Une feuille de 8 titulaires identifiés : l'équipe habituelle ne bouge pas.
  const courte = rencontre({ jour: 2, joueurs: onze(100, 1).slice(0, 8) });
  const apres = rejouerTout([...base, courte]);
  assert.deepEqual(apres.habituelle(10).parts, avant.parts);
  assert.equal(apres.clubs.get(10).feuilles, 2);
  // Drapeaux manquants : titulaire null + minutes → une apparition, pas une titularisation ; minutes null → rien.
  const sansDrapeau = rencontre({ jour: 3, joueurs: [...onze(100, 1), joueur(500, { titulaire: null, minutes: 30 }), joueur(501, { titulaire: null, minutes: null })] });
  const r = rejouerTout([...base, sansDrapeau]);
  assert.equal(r.fiche(500).apparitions, 1);
  assert.equal(r.fiche(500).minutes, 30);
  assert.equal(r.fiche(501), null, 'une ligne sans minutes n’est jamais une apparition à 0 minute');
  assert.ok(!r.habituelle(10).parts.some((p) => p[0] === 500 || p[0] === 501), 'ni l’un ni l’autre titularisé');
  assert.equal(r.ecartees.sansMinutes, 1);
  // Un match attribué n'entre nulle part.
  const attr = rejouerTout([...base, rencontre({ jour: 4, attribue: true, joueurs: onze(100, 1, { xgnp: 5000 }) })]);
  assert.equal(attr.fiche(109).apparitions, 2);
  assert.equal(attr.ecartees.attribuees, 1);
});

// ------------------------------------------------------------ T6. minutes minimales et rétrécissement

test('T6 minutes minimales : un remplaçant de 5 minutes avec 1 xG garde la note que donne la formule à la main (rétrécie vers la moyenne) ; « établie » à 270 minutes, pas à 269 ; sans rétrécissement il serait à 18 xG par 90', () => {
  // Une population : 20 attaquants à 0,30 xG hors penalty par 90 (assez de matchs de 90 pour la moyenne du poste),
  // face à des clubs jamais vus (facteur d'adversaire 1).
  const population = [];
  for (let d = 0; d < 6; d++) population.push(rencontre({ jour: d, home: 100 + d, away: 200 + d, joueurs: Array.from({ length: 20 }, (_, i) => joueur(1000 + i, { camp: i % 2, poste: 4, xgnp: 300, xa: 0 })) }));
  const court = rencontre({ jour: 6, home: 300, away: 400, joueurs: [joueur(42, { poste: 4, minutes: 5, titulaire: 0, entre_min: 85, xgnp: 1000, xa: 0 })] });
  const r = rejouerTout([...population, court]);
  const f = r.fiche(42);
  const { IX } = P.__pourLesTests;
  const m = f.moyennes[IX.xgnp];
  // La moyenne du poste au lendemain : 120 matchs de 90 à 0,30, plus ses 5 minutes à 1 xG.
  proche(m, (0.3 * 120 + 1) / (120 + 5 / 90), 1e-12, 'la moyenne du poste');
  const k = P.COMPOSANTES[IX.xgnp].k;
  // Peu joué (< 270 min) : rétréci vers 0,85 × la moyenne ; d = 5/90 ; S = 1 (adversaire inconnu : facteur 1, championnat L1 : 1).
  const attendu = (1 + k * 0.85 * m) / (5 / 90 + k);
  proche(f.valeurs[IX.xgnp], attendu, 1e-12, 'la note à la main');
  assert.ok(f.valeurs[IX.xgnp] < 0.5, `${f.valeurs[IX.xgnp]} : jamais 18 xG par 90 (sa moyenne brute)`);
  assert.equal(f.etablie, false);
  const a269 = rejouerTout([rencontre({ jour: 0, joueurs: [joueur(43, { minutes: 179 })] }), rencontre({ jour: 1, joueurs: [joueur(43, { minutes: 90 })] })]).fiche(43);
  const a270 = rejouerTout([rencontre({ jour: 0, joueurs: [joueur(44, { minutes: 180 })] }), rencontre({ jour: 1, joueurs: [joueur(44, { minutes: 90 })] })]).fiche(44);
  assert.deepEqual([a269.minutes, a269.etablie, a270.minutes, a270.etablie], [269, false, 270, true]);
});

// ------------------------------------------------------------ T7. xG concédés sur le terrain

test('T7 xG concédés quand il joue : entré à la 70e → les tirs de la 70e et après ; sorti à la 70e → ceux d’avant ; exclu sans sortie → jusqu’à ses minutes ; temps additionnel compté ; penalties retirés et carte incomplète (somme ≠ xG d’équipe, minute manquante) → non relevé ; l’apport défensif = la moyenne du poste MOINS ses xG concédés', () => {
  const tirs = Float32Array.from([10, 0.1, 69, 0.2, 70, 0.3, 89, 0.05, 93, 0.4]);
  assert.equal(P.xgaSurLeTerrain(tirs, { titulaire: 0, entre: 70, sorti: null, minutes: 25 }), Math.fround(0.3) + Math.fround(0.05) + Math.fround(0.4));
  proche(P.xgaSurLeTerrain(tirs, { titulaire: 1, entre: null, sorti: 70, minutes: 70 }), 0.3, 1e-7, 'sorti à la 70e');
  proche(P.xgaSurLeTerrain(tirs, { titulaire: 1, entre: null, sorti: null, minutes: 60 }), 0.1, 1e-7, 'exclu à la 60e sans sortie notée : les tirs d’avant la 60e');
  proche(P.xgaSurLeTerrain(tirs, { titulaire: 1, entre: null, sorti: null, minutes: 90 }), 1.05, 1e-6, 'tout le match, temps additionnel compris');
  assert.equal(P.xgaSurLeTerrain(tirs, { titulaire: 0, entre: null, sorti: null, minutes: 20 }), null, 'remplaçant sans minute d’entrée : présence inconnue');
  const carte = [
    { side: 'home', minute: 5, xg: 0.76, situation: 'penalty' },
    { side: 'home', minute: 30, xg: 0.2, situation: 'regularplay' },
    { side: 'away', minute: 40, xg: 0.5, situation: 'regularplay' }
  ];
  const t = P.tirsAdversesDeLaCarte(JSON.stringify(carte), { xgDom: 0.96, xgExt: 0.5 });
  assert.deepEqual([...t.dom], [40, 0.5].map(Math.fround), 'le camp qui reçoit subit les tirs du visiteur');
  assert.deepEqual([...t.ext], [30, 0.2].map(Math.fround), 'le penalty retiré');
  assert.equal(P.tirsAdversesDeLaCarte(carte, { xgDom: 1.5, xgExt: 0.5 }), null, 'somme ≠ xG d’équipe : incomplète');
  assert.equal(P.tirsAdversesDeLaCarte([...carte, { side: 'away', xg: 0.1 }], { xgDom: 0.96, xgExt: 0.6 }), null, 'une minute manque');
  // L'apport défensif : 120 défenseurs-matchs à 0,5 xG concédé ; le jour 6, l'un n'en concède aucun (apport > 0),
  // l'autre en concède 2 (apport < 0) — le signe : la moyenne du poste MOINS ses xG concédés.
  const vingt = () => Array.from({ length: 20 }, (_, i) => joueur(2000 + i, { camp: i % 2, poste: 2 }));
  const tirsPop = { dom: Float32Array.from([10, 0.5]), ext: Float32Array.from([10, 0.5]) };
  const pop = Array.from({ length: 6 }, (_, d) => rencontre({ jour: d, home: 500 + d, away: 600 + d, joueurs: vingt(), tirsAdverses: tirsPop }));
  const r = rejouerTout([...pop, rencontre({ jour: 6, home: 700, away: 701, joueurs: [joueur(61, { poste: 2 }), joueur(62, { camp: 0, poste: 2 })], tirsAdverses: { dom: Float32Array.from([]), ext: Float32Array.from([20, 2]) } })]);
  assert.ok(r.fiche(61).apportDef > 0 && r.fiche(62).apportDef < 0, JSON.stringify([r.fiche(61).apportDef, r.fiche(62).apportDef]));
  assert.equal(r.ficheEnLigne(61).apport_def, Math.round(r.fiche(61).apportDef * 1000));
});

/** Le code d'un fichier sans ses commentaires (blocs et lignes) : ce qui s'exécute. */
const codeSansCommentaires = (f) => fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

test('T8 les dribbles (tentés relevés depuis le 01/10/2026 seulement) ne sont jamais lus par les fiches', () => {
  for (const f of ['playerRatings.js', 'playerRatingsBanc.js', 'playerRatingsEnfant.js']) assert.doesNotMatch(codeSansCommentaires(path.join(SRC, 'data', 'db', f)), /dribble/i, f);
});

// ------------------------------------------------------------ T9. corrections

test('T9 corrections : deux joueurs identiques, l’un face à des défenses FAIBLES (qui concèdent beaucoup) → sa note corrigée est plus basse ; un transfert : la note est rendue × F du championnat de son club', () => {
  // Deux clubs : 30 (défense faible, xG concédés élevés), 40 (défense solide). Leurs adversaires habituels : 10 et 20.
  const histoire = [];
  for (let d = 0; d < 10; d++) {
    histoire.push(rencontre({ jour: d, home: 10, away: 30, xg: [3.0, 0.5], joueurs: [] }));
    histoire.push(rencontre({ jour: d, home: 20, away: 40, xg: [0.3, 0.5], joueurs: [] }));
  }
  const face = [rencontre({ jour: 11, home: 1, away: 30, joueurs: [joueur(51, { xgnp: 500 })] }), rencontre({ jour: 11, home: 2, away: 40, joueurs: [joueur(52, { xgnp: 500 })] })];
  const r = rejouerTout([...histoire, ...face]);
  assert.ok(r.facteursDe(30).def > 1.3 && r.facteursDe(40).def < 0.8, JSON.stringify([r.facteursDe(30), r.facteursDe(40)]));
  const { IX } = P.__pourLesTests;
  assert.ok(r.sommes(51).s[IX.xgnp] < r.sommes(52).s[IX.xgnp], 'face à la défense faible, la même production vaut moins');
  // La possession : récupérations et duels gagnés × 50 / (100 − la possession de SON camp) ; inconnue : rien de corrigé.
  const ligne = { minutes: 90, recup: 6, duels_g: 4 };
  const v70 = P.valeursDUneApparition(ligne, { possession: 70 });
  proche(v70[IX.recup][0], (6 * 50) / 30, 1e-12, 'récupérations à 70 % de possession');
  proche(v70[IX.duels][0], (4 * 50) / 30, 1e-12, 'duels gagnés à 70 %');
  assert.equal(P.valeursDUneApparition(ligne, { possession: null })[IX.recup][0], 6);
  // Le championnat : 0,5 xG par 90 en « L2 » (F = 1,5) vaut 0,5 / 1,5 en unités de référence, rendu × F du club.
  const facteurs = { L1: 1, L2: 1.5 };
  const t = rejouerTout([rencontre({ jour: 0, league: 'L2', home: 60, away: 61, joueurs: [joueur(70, { xgnp: 500 })] })], { facteurs });
  proche(t.sommes(70).s[IX.xgnp], 0.5 / 1.5, 1e-12, 'divisé par F du match');
  assert.equal(t.fiche(70).facteur, 1.5, 'rendu dans le championnat de son club (L2)');
  assert.equal(P.facteurDe('inconnu'), 1);
});

// ------------------------------------------------------------ T10. l'ordre du temps

test('T10 anti-fuite : une journée qui arrive dans le désordre LÈVE ; deux matchs le même jour ne se voient pas ; un 9-0 planté le jour J ne change rien d’avant J', () => {
  const r = new P.RejeuDesFiches();
  r.ajouter(rencontre({ jour: 5, joueurs: [joueur(1)] }));
  r.finDeJournee();
  assert.throws(() => r.ajouter(rencontre({ jour: 5, joueurs: [joueur(1)] })), /fuite refusée/);
  assert.throws(() => r.ajouter(rencontre({ jour: 4, joueurs: [joueur(1)] })), /fuite refusée/);
  const r2 = new P.RejeuDesFiches();
  r2.ajouter(rencontre({ jour: 6, joueurs: [joueur(2)] }));
  assert.throws(() => r2.ajouter(rencontre({ jour: 7, joueurs: [joueur(2)] })), /avant la fin de la journée/);
  // Avant J : ce qu'on lit au début de la journée J ne dépend pas des matchs de J (même joueur deux fois le même jour, puis un 9-0).
  const lire = (planter) => {
    let vu = null;
    const rr = new P.RejeuDesFiches({ avantJournee: (jour, x) => (jour === JOUR0 + 2 ? (vu = JSON.stringify(x.fiche(3))) : null) });
    const ms = [rencontre({ jour: 0, joueurs: [joueur(3)] }), rencontre({ jour: 1, joueurs: [joueur(3, { xgnp: 300 })] }), rencontre({ jour: 2, joueurs: [joueur(3, { xgnp: planter ? 9000 : 100, tirs: planter ? 30 : 2 })] }), rencontre({ jour: 2, home: 11, away: 21, joueurs: [joueur(3)] })];
    let dernier = null;
    for (const m of ms) {
      if (dernier !== null && m.jour !== dernier) rr.finDeJournee();
      dernier = m.jour;
      rr.ajouter(m);
    }
    rr.finDeJournee();
    return { vu, apres: JSON.stringify(rr.fiche(3)) };
  };
  const sans = lire(false);
  const avec = lire(true);
  assert.equal(avec.vu, sans.vu, 'avant J : identique');
  assert.notEqual(avec.apres, sans.apres, 'après J, le 9-0 compte');
});

// ------------------------------------------------------------ le banc (pur)

test('banc : la méthode puissance fait 100 % ; l’inclinaison est nulle à x = 0 et monotone ; Newton retrouve une inclinaison connue ; le coefficient des tirs aussi ; la perte de la binomiale négative tend vers Poisson', () => {
  const p = B.methodePuissance([2.1, 3.4, 3.6]);
  proche(p.reduce((s, x) => s + x, 0), 1, 1e-12, 'somme');
  assert.equal(B.methodePuissance([1, 2, 3]), null);
  assert.deepEqual(B.incliner([0.5, 0.3, 0.2], 0).map((x) => Math.round(x * 1e12) / 1e12), [0.5, 0.3, 0.2]);
  assert.ok(B.incliner([0.5, 0.3, 0.2], 0.2)[0] > 0.5 && B.incliner([0.5, 0.3, 0.2], 0.2)[2] < 0.2);
  // Des issues tirées d'une inclinaison connue (off 0,4) : Newton la retrouve à quelques centièmes.
  let s = 7;
  const alea = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const lignes = [];
  for (let i = 0; i < 30000; i++) {
    const dOff = alea() * 2 - 1;
    const q = B.incliner([0.45, 0.27, 0.28], 0.4 * dOff);
    const u = alea();
    lignes.push({ clo: [0.45, 0.27, 0.28], dOff, dDef: 0, issue: u < q[0] ? 0 : u < q[0] + q[1] ? 1 : 2 });
  }
  const inc = B.apprendreInclinaison(lignes, 'clo');
  proche(inc.off, 0.4, 0.06, 'inclinaison retrouvée');
  // Les tirs : y ~ base × exp(0,05 × écart) (moyennes exactes) → b = 0,05.
  const tirsLignes = [{ tirsReleves: true, tirs: [-4, -2, 0, 2, 4].map((e) => ({ y: 12 * Math.exp(0.05 * e), base: 12, ecart: e })) }];
  proche(B.apprendreTirs(tirsLignes).tirs, 0.05, 1e-6, 'coefficient des tirs');
  proche(B.perteBinomialeNegative(3, 2.5, 1e-6), 2.5 - 3 * Math.log(2.5) + Math.log(6), 1e-4, 'Poisson à la limite');
  // Les lignes du juge : une par match, perte du marché (a) face au marché incliné (b) ; sans cote ou sans issue : rien.
  const j = B.lignesDuJuge1N2([{ cle: 'm1', issue: 0, clo: [0.5, 0.3, 0.2], dOff: 1, dDef: 0 }, { cle: 'm2', issue: null, clo: [0.5, 0.3, 0.2], dOff: 0, dDef: 0 }, { cle: 'm3', issue: 1, clo: null, dOff: 0, dDef: 0 }], 'clo', { off: 0.1, def: 0 });
  assert.equal(j.length, 1);
  proche(j[0].a, -Math.log(0.5), 1e-12, 'perte du marché');
  proche(j[0].b, -Math.log(B.incliner([0.5, 0.3, 0.2], 0.1)[0]), 1e-12, 'perte inclinée');
});

test('banc : les périodes sont la seule fenêtre permise (2023-07-01 → 2026-09-23), K = 19 ; le banc refuse une rencontre hors de la fenêtre ; la mesure à blanc ne mesure rien tant que l’étape n’est pas lancée', () => {
  assert.deepEqual(B.PERIODES_DU_BANC.donnees, { de: '2023-07-01', a: '2026-09-23' });
  assert.ok(B.PERIODES_DU_BANC.apprentissage.a < B.PERIODES_DU_BANC.verification.de);
  assert.equal(B.K_VARIANTES, 19);
  const m = B.mesureABlanc({ depuis: null });
  m.attacher([]);
  assert.deepEqual({ lancee: m.resultat().lancee, matchs: m.resultat().matchs }, { lancee: false, matchs: 0 });
  // Lancée le jour 3 : seuls les matchs d'après le lancement sont mesurés (deux clubs aux onzes identifiés, un match
  // par jour ; l'équipe habituelle existe dès le lendemain du premier : sans la date, les jours 1 à 5 compteraient).
  const lancee = B.mesureABlanc({ depuis: P.jourIso(JOUR0 + 3) });
  const ms = Array.from({ length: 6 }, (_, d) => rencontre({ jour: d, joueurs: [...onze(100, 1), ...onze(200, 0)] }));
  lancee.attacher(ms);
  rejouerTout(ms, { avantJournee: (jour, r) => lancee.avantJournee(jour, r) });
  assert.deepEqual([lancee.resultat().lancee, lancee.resultat().matchs], [true, 3], 'les jours 3, 4 et 5 seulement');
  assert.match(fs.readFileSync(path.join(SRC, 'data', 'db', 'playerRatingsBanc.js'), 'utf8'), /hors de la fenêtre permise/);
});

// ------------------------------------------------------------ T12, T15 : la règle de Pierre et le lancement

/** Les fichiers atteints par les imports statiques et dynamiques relatifs d'un ensemble de départ (graphe des modules). */
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

test('T12 RÈGLE DE PIERRE : aucun fichier de l’empreinte du moteur n’atteint (même de loin) les fiches ni le lecteur de la page du match ; ces modules sont HORS de l’empreinte ; l’analyse IA ne reçoit pas la force du onze ; l’enfant lit en lecture seule, sans horloge', () => {
  const duMoteur = fichiersDuMoteur().map((rel) => path.join(SRC, rel));
  assert.ok(duMoteur.length > 20);
  const graphe = [...atteints(duMoteur)].map((f) => path.relative(SRC, f).split(path.sep).join('/'));
  for (const interdit of ['data/db/playerRatings.js', 'data/db/playerRatingsBanc.js', 'data/db/playerRatingsEnfant.js', 'data/providers/lineupContext.js']) {
    assert.ok(!graphe.includes(interdit), `${interdit} atteint depuis le moteur`);
    assert.ok(!fichiersDuMoteur().includes(interdit), `${interdit} dans l’empreinte`);
  }
  assert.ok(!MODULES_DU_MOTEUR.fichiers.some((f) => /playerRatings|lineupContext/.test(f)));
  // La force du onze n'est ajoutée qu'à la page du match : jamais dans la composition de l'analyse IA.
  const lineup = fs.readFileSync(path.join(SRC, 'data', 'providers', 'lineupContext.js'), 'utf8');
  const appels = [...lineup.matchAll(/avecForceDuOnze\(/g)].length;
  assert.equal(appels, 3, 'la définition et les deux appels de buildMatchPreview');
  const debutIA = lineup.indexOf('export async function compositionPourAnalyseIA');
  const ia = lineup.slice(debutIA, lineup.indexOf('/** La clé', debutIA));
  assert.ok(ia.length > 100 && !/ForceDuOnze/.test(ia), 'compositionPourAnalyseIA sans la force du onze');
  // L'enfant ouvre la base EN LECTURE SEULE : jamais un second écrivain (le serveur seul range).
  assert.match(codeSansCommentaires(path.join(SRC, 'data', 'db', 'playerRatingsEnfant.js')), /new DatabaseSync\(chemin, \{ readOnly: true \}\)/);
  // Aucune horloge lue dans les fiches (« maintenant » passé par l'appelant).
  for (const f of ['playerRatings.js', 'playerRatingsBanc.js', 'playerRatingsEnfant.js']) assert.doesNotMatch(codeSansCommentaires(path.join(SRC, 'data', 'db', f)), /Date\.now\(\)|new Date\(\)/, f);
});

test('T15 lancement : l’étape 30 déclarée (fiches-v1, datée du premier démarrage, 19 variantes regardées, la retenue en tête), portée « joueurs » seulement — jamais comptée « déjà vue » par le moteur, ni par l’indice', () => {
  assert.equal(verifierLancements(LANCEMENTS), true);
  assert.ok(PORTEES.includes('joueurs'));
  const l30 = LANCEMENTS.find((l) => l.etape === '30');
  assert.deepEqual([l30.version, l30.le, l30.variantes.length, l30.variantes[0].id], ['fiches-v1', null, 19, 'fiches-v1']);
  assert.equal(VARIANTES_DE_L_ETAPE_30.length, 19);
  assert.deepEqual([...new Set(l30.vues.flatMap((v) => v.pour))], ['joueurs']);
  assert.deepEqual(l30.vues.map((v) => [v.de, v.a]), VUES_DE_L_ETAPE_30.map((v) => [v.de, v.a]));
  // Aucune vue de l'étape 30 n'est sur P2 (football-data 2019-07 → 2023-06) ni sur 2023-S1 (le magasin jamais vu).
  for (const v of l30.vues) assert.ok(v.de >= '2023-07-01', `${v.de}`);
  const joueurs = fenetresDeclarees({ portee: 'joueurs' });
  assert.ok(joueurs.some((f) => f.etape === '30'));
  for (const portee of ['moteur', 'indice', 'statistiques', 'marche']) assert.ok(!fenetresDeclarees({ portee }).some((f) => f.etape === '30'), portee);
});

test('T17 l’alerte durable « fichesJoueurs » dite à l’écran (Réglages › Actualisation, puce du haut) : son nom, ses écarts, le joueur et le jour en mots simples ; rien quand la nuit n’a trouvé aucun écart', async () => {
  const A = await import(pathToFileURL(path.join(SERVEUR, '..', 'ui', 'src', 'utils', 'controlesAntiFuite.js')).href);
  assert.deepEqual(A.CONTROLES_ANTI_FUITE.map((c) => c.cle), ['tableJourJ', 'forcesButs', 'fichesJoueurs'], 'dans l’ordre de la nuit');
  assert.deepEqual(A.controlesAntiFuiteDits({ fichesJoueurs: null }), []);
  const alerte = { ecarts: [{ joueur: 123, J: '2026-10-12', colonne: 'S.xgnp', attendu: 1, lu: 2 }, { joueur: 123, J: '2026-10-12', colonne: 'W.xgnp', attendu: 1, lu: 2 }], total: 2, lignes: 40, updatedAt: '2026-10-22T03:20:00.000Z' };
  assert.deepEqual(A.controlesAntiFuiteDits({ fichesJoueurs: alerte }).map((d) => d.texte), ['Fiches des joueurs (force du onze) : 2 écarts sur 40 lignes recalculées (contrôle du 22/10/2026 à 05:20) — par exemple joueur n° 123 avant le 12/10/2026.']);
});

// ------------------------------------------------------------ la nuit (copie isolée)

test('T13 la nuit : « maintenant » obligatoire ; table du jour J pas à jour → attente ; le calcul À PART (autre processus, base intacte) ; premier calcul = la reconstruction ; rien de changé → rien ; feuille tardive et fusion → la table = la reconstruction, l’ancienne fiche retirée ; rangement interrompu → pas à jour, due, puis repris ; aucune transaction ouverte ; un banc → reporté ; un échec n’écrit rien ; l’étape après « forcesButs » et avant le gel', () => {
  const s = nuit();
  const i = s.etapes.indexOf('fichesJoueurs');
  assert.equal(s.etapes[i - 1], 'forcesButs');
  assert.equal(s.etapes[i + 1], 'gelPronostics');
  assert.ok(s.etapes.indexOf('sauvegarde') > i && s.etapes.indexOf('tableJourJ') < i);
  assert.equal(s.etapes.filter((k) => k === 'fichesJoueurs').length, 1);
  assert.match(s.sansMaintenant, /« maintenant » .* est obligatoire/);
  assert.equal(s.attente.mode, 'attente');
  assert.match(s.attente.summary, /La table du jour J n’est pas à jour \(jamais construite\)/);
  assert.equal(s.attente.etat.absent, true);
  assert.equal(s.enfant.autrePid, true);
  assert.equal(s.enfant.baseIntacte, true, 'l’enfant n’a écrit ni dans la base ni dans son journal');
  assert.ok(s.enfant.fiches > 50 && s.enfant.equipes > 2, JSON.stringify(s.enfant));
  assert.ok(s.enfant.controle.lignes >= 20 && s.enfant.controle.ecarts === 0, JSON.stringify(s.enfant.controle));
  assert.equal(s.premier.mode, 'premier');
  assert.equal(s.premier.face.identiques, true, JSON.stringify(s.premier.face));
  assert.deepEqual(s.premier.etat, { aJour: true, enCours: null, version: 1 });
  assert.equal(s.premier.controle.ecarts, 0);
  assert.equal(s.second.mode, 'rien');
  assert.equal(s.tardive.mode, 'complet');
  assert.equal(s.tardive.face.identiques, true, JSON.stringify(s.tardive.face));
  assert.ok(s.tardive.changees > 0 && s.tardive.changees < s.tardive.toutes, `seules des fiches touchées réécrites (${s.tardive.changees} sur ${s.tardive.toutes})`);
  assert.equal(s.fusion.ancienne, 0, 'l’ancienne fiche RETIRÉE');
  assert.equal(s.fusion.nouvelle, s.fusion.apparitions);
  assert.ok(s.fusion.retirees >= 1);
  assert.equal(s.fusion.face, true);
  assert.ok(s.interrompu.pas >= 3);
  assert.equal(s.interrompu.transactionOuverte, false);
  assert.deepEqual(s.interrompu.etat, { aJour: false, enCours: s.maintenant });
  assert.equal(s.interrompu.due, true);
  assert.notEqual(s.interrompu.lecteur, true, 'le lecteur dit « pas à jour »');
  assert.equal(s.reprise.face, true);
  assert.deepEqual(s.reprise.etat, { aJour: true, enCours: null });
  assert.ok(s.transactions.pointsDArret > 5);
  assert.equal(s.transactions.ouvertes, 0);
  assert.equal(s.transactions.face, true);
  assert.equal(s.reporte.fiches.mode, 'reporte');
  assert.match(s.reporte.fiches.raison, /Un autre calcul lourd tourne \(banc d’essai/);
  assert.equal(s.reporte.passe.status, 'warn');
  assert.match(s.reporte.passe.summary, /^Reporté : .* — les fiches des joueurs seront calculées à la passe suivante\.$/);
  assert.equal(s.reporte.due, true);
  assert.equal(s.jetonRendu, null);
  assert.deepEqual(s.echec, { mode: 'echec', erreur: true, inchange: true });
  assert.equal(s.passe.status, 'ok');
  assert.match(s.passe.summary, /^Fiches des joueurs : .* joueurs \(.* fiches établies\), .* équipes habituelles ; .* contrôle anti-fuite : .* joueurs recalculés par un second chemin, 0 écart\. Affichage seulement : le moteur ne lit pas les fiches\.$/);
  assert.deepEqual(s.passe.alerte, { key: 'fichesJoueurs', value: null }, 'aucun écart : l’alerte durable est levée');
  assert.deepEqual(s.passe.mesure, { lancee: false, depuis: null, matchs: 0 }, 'l’étape pas encore lancée : rien mesuré à blanc');
  assert.equal(s.passe.changed, false);
  assert.equal(s.passe.face, true);
  assert.equal(s.passeRienANeuf.mode, 'rien');
  assert.match(s.passeRienANeuf.summary, /^Rien à refaire : la table du jour J n’a pas bougé/);
  assert.deepEqual(s.due, { faitAujourdhuiAJour: false, jamaisFait: true, clic: true });
});

test('T11 ORACLE DE LA COPIE TRONQUÉE : tout ce qui suit J supprimé (la table du jour J refaite), la nuit range EXACTEMENT les fiches et les équipes habituelles du rejeu avant J, et la force du onze LUE (comme la page du match) = celle du rejeu ; un 9-0 planté le jour J ne change rien d’avant J ; le contrôle anti-fuite : 0 écart honnête, la fuite plantée trouvée', () => {
  const s = oracle();
  const o = s.oracle;
  assert.ok(o.rencontresDuJour >= 1 && o.fichesComparees >= 20 && o.equipesComparees >= 2, JSON.stringify(o));
  assert.equal(o.ecartsFiches, 0, JSON.stringify(o.exempleFiche));
  assert.equal(o.ecartsEquipes, 0);
  assert.equal(o.ecartsForce, 0, JSON.stringify(o.exempleForce));
  assert.ok(o.forceExemple && o.forceExemple.offensif.habituel !== null, JSON.stringify(o.forceExemple));
  assert.ok(o.nuit.jusqua < s.J, `la nuit tronquée s’arrête avant J (${o.nuit.jusqua} < ${s.J})`);
  assert.equal(o.nuit.controle.ecarts, 0);
  assert.equal(s.neufZero.identique, true, 'le 9-0 du jour J ne change rien d’avant J');
  assert.equal(s.neufZero.lendemainChange, true, 'après J, il compte');
  assert.ok(s.controle.honnetes.lignes >= 6);
  assert.equal(s.controle.honnetes.ecarts, 0);
  assert.ok(s.controle.fuites.joueursTrouves >= 1, JSON.stringify(s.controle));
});

test('T14 T16 le lecteur de la page du match (force du onze en quelques millisecondes ; un titulaire sans identifiant = inconnu ; le gardien habituel absent dit ; club sans équipe habituelle → null ; avant tout calcul → null, rien ne casse ; une ligne 0 plantée jamais lue) et la route GET /api/match-stats/player-ratings (200, 400, 404)', () => {
  const s = lecture();
  assert.equal(s.avant.page, null);
  assert.equal(s.avant.route.corps.etat, 'jamais');
  assert.equal(s.avant.route.corps.lecture, null);
  assert.ok(s.page.ms < 50, `${s.page.ms} ms`);
  const h = s.page.home;
  assert.ok(h && typeof h.offensif.aujourdhui === 'number' && typeof h.offensif.ecart === 'number', JSON.stringify(h));
  assert.deepEqual(Object.keys(h.lignes), ['gardien', 'defense', 'milieu', 'attaque']);
  assert.equal(h.titulaires, 11);
  assert.equal(h.source, 'fiches des joueurs (étape 30)');
  assert.match(h.regle, /jamais dans les chiffres du moteur/);
  assert.equal(s.page.autresChampsIntacts, true, 'la composition décrite n’est pas touchée');
  assert.deepEqual(s.page.inconnu, { titulaires: 11, inconnus: 1 });
  assert.equal(s.page.sansGardienHabituel, false);
  assert.equal(s.page.clubInconnu, null);
  assert.deepEqual(s.page.lectureIds0, []);
  assert.equal(s.route.etat, 'a-jour');
  assert.equal(s.route.joueur.code, 200);
  assert.ok(s.route.joueur.joueur > 0 && s.route.joueur.courbe);
  assert.match(s.route.joueur.regle, /n’entrent jamais dans les chiffres du moteur/);
  assert.ok(s.route.club.code === 200 && s.route.club.fiches > 5 && s.route.club.habituelle);
  assert.ok(s.route.ligue.code === 200 && s.route.ligue.tous && s.route.ligue.postes.every((p) => p === 4), JSON.stringify(s.route.ligue));
  assert.deepEqual([s.route.inconnu, s.route.mauvais, s.route.mauvaisPoste], [404, 400, 400]);
  // L'identifiant 0 : une ligne 0 plantée dans la table n'est jamais lue (lecture, page du match, route).
  assert.deepEqual(s.zero, { plantee: 1, lecture: [], page: { titulaires: 11, inconnus: 1 }, route: 400 });
});
