/**
 * Étape 18 — la valeur de chaque statistique (src/bench/statValue.js).
 * -----------------------------------------------------------------------
 * Les règles PURES tournent ici même, sur des séries FABRIQUÉES par le générateur à graine du juge
 * (guard.js) — la même série à chaque passage, la vérité connue d'avance :
 *   1. Spearman-Brown, la stabilisation, la demi-vie : les formules, puis une fiabilité CONNUE retrouvée
 *      (talent σb = 1, bruit σw = 2 : un match vaut 0,2 ; une moitié de 8, 0,667 ; 16 matchs, 0,8 ;
 *      n* = 4) — sans Spearman-Brown on lirait 0,667 ;
 *   2. le découpage dans le temps : le calcul ne lit aucune cible du jugement, une ligne ne voit ni son
 *      jour ni l'avenir, une série en désordre LÈVE, la fenêtre de 10 = la fenêtre de l'étape 17 ;
 *   3. le seuil de minutes des joueurs (ramené à 90 minutes ; 450 par moitié, 270 avant un match) ;
 *   4. les zéros « non relevé » (0-0 au magasin, jaunes à 0 et rouges ; vrais zéros chez football-data) ;
 *   5. au sein d'un championnat : un faux effet de NIVEAU (aucun talent, des championnats de niveaux
 *      différents) disparaît — la corrélation naïve, calculée ici, est forte ; celle du module, nulle ;
 *   6. la demi-vie retrouvée : un talent qui marche au hasard (modèle de niveau local) dont le meilleur
 *      prédicteur connu est une moyenne pondérée de demi-vie 6 ;
 *   7. les verdicts, les options, les périodes.
 * Puis, dans une copie isolée de la base d'essai (test/aides/script-valeur-stats.mjs, réseau coupé, heure
 * figée) : la table du jour J, le calcul complet, son dépôt, la lecture pour les étapes 27/29/30, le
 * contrôle de la fenêtre du moteur face aux colonnes f10, et la route (GET, POST, 409, 202).
 * -----------------------------------------------------------------------
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ConstructeurDeSerie,
  fenetreDuMoteur,
  FENETRES_MOTEUR,
  Serie,
  fiabiliteMoitieMoitie,
  apprendre,
  preparerJugement,
  colonnesDe,
  calculerSurDesSeries,
  spearmanBrown,
  fiabiliteDUnMatch,
  stabilisation,
  poidsDemiVie,
  verdictDuPouvoir,
  verdictDeLaFenetre,
  lireOptions,
  numeroDuJour,
  jourIso,
  FENETRE_ACTUELLE,
  FENETRES,
  DEMI_VIES,
  SEUILS,
  PERIODES_DU_CALCUL,
  VUES_DE_L_ETAPE_18,
  STATISTIQUES_EQUIPE,
  STATISTIQUES_JOUEUR
} from '../src/bench/statValue.js';
import { generateur } from '../src/bench/guard.js';
import { fenetre as fenetreDuJourJ, CONSTANTES, paireRelevee } from '../src/data/db/dayTable.js';
import { STAT_SAMPLE, STAT_MIN_SAMPLE } from '../src/data/db/statInputsRead.js';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';

// ------------------------------------------------------------ fabriques

/** Une loi normale centrée réduite (Box-Muller) sur le générateur à graine. */
const normale = (u) => {
  let a = 0;
  while (a === 0) a = u();
  return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * u());
};
/** Une loi de Poisson (Knuth) sur le générateur à graine. */
const poisson = (u, lambda) => {
  const l = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= u();
  } while (p > l);
  return k - 1;
};
const proche = (x, cible, tolerance, quoi) => assert.ok(Math.abs(x - cible) <= tolerance, `${quoi} : ${x} au lieu de ${cible} ± ${tolerance}`);

/** Un fait d'équipe à la forme de team_day (les colonnes non données sont « absentes »). */
const fait = (x) => ({ coupe: 0, compte: 1, attribue: 0, prolongation: 0, releve: 1, bp: 1, bc: 1, ...x });

/**
 * Des équipes fabriquées : `ligues` championnats de `equipes` équipes, `matchs` matchs chacune (un par
 * semaine depuis `debut`), une statistique `colonne` = 100 + niveau du championnat + 10 × (talent + bruit),
 * talent ~ N(0, σb²) propre à l'équipe, bruit ~ N(0, σw²) propre au match. L'adversaire concède 50.
 */
function equipesFabriquees({ ligues, equipes, matchs, sigmaB, sigmaW, niveau = () => 0, graine, debut = '2024-08-01', colonne = 'corners', source = 'magasin' }) {
  const u = generateur(graine);
  const b = new ConstructeurDeSerie({ echelle: 'equipe', source });
  let rencontre = 0;
  const j0 = numeroDuJour(debut);
  for (let l = 0; l < ligues; l++) {
    for (let e = 0; e < equipes; e++) {
      const talent = sigmaB * normale(u);
      for (let m = 0; m < matchs; m++) {
        const v = Math.round(100 + niveau(l) + 10 * (talent + sigmaW * normale(u)));
        b.ajouter(fait({ club: l * 1000 + e + 1, date: jourIso(j0 + 7 * m), league: `L${l}`, saison: 2024, rencontre: ++rencontre, camp: m % 2, [`${colonne}_p`]: v, [`${colonne}_c`]: 50 }));
      }
    }
  }
  return b.terminerSansPause();
}

const DE = '2024-08-01';
const MI = '2025-02-01';

// ------------------------------------------------------------ 1. Spearman-Brown

test('Spearman-Brown, stabilisation, poids : les formules exactes', () => {
  proche(spearmanBrown(0.5), 2 / 3, 1e-12, 'SB(0,5)');
  proche(spearmanBrown(0.2, 10), 2 / 2.8, 1e-12, 'SB(0,2) × 10');
  proche(fiabiliteDUnMatch(2 / 3, 8), 0.2, 1e-12, 'la fiabilité d’un match depuis celle de 8');
  proche(spearmanBrown(fiabiliteDUnMatch(0.5, 8), 8), 0.5, 1e-12, 'aller-retour');
  assert.equal(stabilisation(0.5, 8), 8);
  proche(stabilisation(2 / 3, 8), 4, 1e-12, 'n* = k (1 − r) / r');
  assert.equal(stabilisation(0, 8), Infinity);
  assert.equal(stabilisation(-0.1, 8), Infinity);
  assert.equal(poidsDemiVie(0, 6), 1);
  assert.equal(poidsDemiVie(6, 6), 0.5);
  assert.equal(poidsDemiVie(12, 6), 0.25);
  assert.equal(poidsDemiVie(40, Infinity), 1);
});

test('fiabilité connue retrouvée : moitiés alternées, Spearman-Brown, stabilisation (1 000 équipes-saisons fabriquées)', () => {
  // σb = 1, σw = 2 : ρ = 0,2 ; une moitié de 8 matchs : 8ρ / (1 + 7ρ) = 0,667 ; 16 matchs : 0,8 ; n* = σw² / σb² = 4 ; 10 matchs : 0,714.
  const serie = equipesFabriquees({ ligues: 50, equipes: 20, matchs: 16, sigmaB: 1, sigmaW: 2, graine: 11 });
  const f = fiabiliteMoitieMoitie(serie, 'corners_pour', { de: DE, a: '2025-06-30', tirages: 300 });
  assert.equal(f.segments, 1000);
  assert.equal(f.groupes, 50);
  assert.equal(f.k, SEUILS.moitieEquipe);
  proche(f.r, 2 / 3, 0.05, 'r des moitiés');
  proche(f.fiabilite, 0.8, 0.035, 'fiabilité de 16 matchs (Spearman-Brown)');
  assert.ok(f.fiabilite - f.r > 0.1, 'Spearman-Brown appliqué : la fiabilité de l’ensemble dépasse celle d’une moitié');
  proche(f.stabilisation, 4, 1.3, 'point de stabilisation');
  proche(f.fiabilite10, 2 / 2.8, 0.05, 'fiabilité d’une fenêtre de 10');
  assert.ok(f.fourchette[0] <= 0.8 && f.fourchette[1] >= 0.8, `la fourchette ${f.fourchette} contient 0,8`);
  assert.ok(f.stabilisationFourchette[0] <= 4 && f.stabilisationFourchette[1] >= 4, `la fourchette de n* ${f.stabilisationFourchette} contient 4`);
  // La pente apprise pour la fenêtre de 10 = la fiabilité de 10 matchs (0,714) : la régression vers la moyenne.
  const stable = equipesFabriquees({ ligues: 40, equipes: 20, matchs: 40, sigmaB: 1, sigmaW: 2, graine: 14 });
  const appris = apprendre(stable, 'corners_pour', 'corners_pour', { de: jourIso(numeroDuJour(DE) + 7 * 10), a: null, tirages: 100 });
  proche(appris.actuelle.beta, 2 / 2.8, 0.05, 'pente de la fenêtre de 10');
  proche(appris.candidats.find((c) => c.type === 'fenetre' && c.valeur === 3).beta, 3 / 7, 0.05, 'pente de la fenêtre de 3 (3ρ / (1 + 2ρ))');
  // Des équipes qui CHANGENT à mi-saison (±2 écarts-types à partir du 9e match) : les moitiés alternées voient
  // toutes deux le changement (r ≈ (1 + 1) / (2 + 0,5) = 0,8) ; « les 8 premiers contre les 8 derniers » ne
  // s'accorderaient plus (r ≈ 0,35).
  const u = generateur(13);
  const bm = new ConstructeurDeSerie({ echelle: 'equipe', source: 'magasin' });
  let rm = 0;
  for (let l = 0; l < 50; l++) {
    for (let e = 0; e < 20; e++) {
      const talent = normale(u);
      const saut = u() < 0.5 ? -2 : 2;
      for (let m = 0; m < 16; m++) bm.ajouter(fait({ club: l * 1000 + e + 1, date: jourIso(numeroDuJour(DE) + 7 * m), league: `L${l}`, saison: 2024, rencontre: ++rm, camp: m % 2, corners_p: Math.round(100 + 10 * (talent + (m >= 8 ? saut : 0) + 2 * normale(u))), corners_c: 50 }));
    }
  }
  const changeantes = fiabiliteMoitieMoitie(bm.terminerSansPause(), 'corners_pour', { de: DE, a: '2025-06-30', tirages: 100 });
  proche(changeantes.r, 0.8, 0.05, 'moitiés alternées d’équipes qui changent');
  // Aucun signal : la fiabilité tombe vers 0, la stabilisation part à l'infini (ou très loin).
  const bruit = equipesFabriquees({ ligues: 50, equipes: 20, matchs: 16, sigmaB: 0, sigmaW: 2, graine: 12 });
  const g = fiabiliteMoitieMoitie(bruit, 'corners_pour', { de: DE, a: '2025-06-30', tirages: 200 });
  assert.ok(Math.abs(g.r) < 0.1, `sans talent, r = ${g.r}`);
  assert.ok(g.stabilisationSansFin || g.stabilisation > 50, `sans talent, n* = ${g.stabilisation}`);
});

// ------------------------------------------------------------ 2. le découpage dans le temps

test('découpage dans le temps : le calcul ne lit aucune cible du jugement ; une ligne ne voit ni son jour ni l’avenir ; une série en désordre lève', () => {
  const base = equipesFabriquees({ ligues: 10, equipes: 10, matchs: 40, sigmaB: 1, sigmaW: 2, graine: 21 });
  const options = { de: DE, a: '2025-01-31', fenetres: FENETRES, demiVies: DEMI_VIES, tirages: 100 };
  const avant = apprendre(base, 'corners_pour', 'corners_pour', options);
  // L'avenir saccagé (toutes les valeurs du jugement à 30 000) : le calcul ne bouge pas d'un bit.
  const saccage = new ConstructeurDeSerie({ echelle: 'equipe', source: 'magasin' });
  for (let i = 0; i < base.n; i++) {
    const date = jourIso(base.col.jour[i]);
    const v = base.col.corners_p[i];
    saccage.ajouter(fait({ club: base.col.entite[i], date, league: base.ligues[base.col.ligue[i]].league, saison: 2024, rencontre: base.col.rencontre[i], camp: i % 2, corners_p: date >= MI ? 30000 : v, corners_c: 50 }));
  }
  const apres = apprendre(saccage.terminerSansPause(), 'corners_pour', 'corners_pour', options);
  assert.deepEqual(apres, avant);
  assert.ok(avant.lignes > 0 && avant.lignes <= 10 * 10 * 40);
  // Le jugement : seulement les jours de sa période ; les prévisions d'un jour ignorent ce jour et la suite.
  const jug = preparerJugement(base, 'corners_pour', 'corners_pour', avant, { de: MI, a: null, tirages: 100 });
  assert.ok(jug.n > 0);
  for (let q = 0; q < jug.n; q++) assert.ok(jug.colonnes.jour[q] >= numeroDuJour(MI));
  // Une équipe : 12 matchs, puis le jour J deux matchs (le second à 999), puis un match à 999 le lendemain.
  const b = new ConstructeurDeSerie({ echelle: 'equipe', source: 'magasin' });
  const valeurs = [10, 12, 14, 9, 11, 13, 10, 12, 8, 15, 11, 9];
  valeurs.forEach((v, m) => b.ajouter(fait({ club: 1, date: jourIso(numeroDuJour('2025-01-01') + 7 * m), league: 'L', saison: 2024, rencontre: m + 1, camp: 1, corners_p: v, corners_c: 5 })));
  const J = jourIso(numeroDuJour('2025-01-01') + 7 * 12);
  b.ajouter(fait({ club: 1, date: J, league: 'L', saison: 2024, rencontre: 100, matchKey: 'a', camp: 1, corners_p: 7, corners_c: 5 }));
  b.ajouter(fait({ club: 1, date: J, league: 'L', saison: 2024, rencontre: 101, matchKey: 'b', camp: 0, corners_p: 999, corners_c: 5 }));
  b.ajouter(fait({ club: 1, date: jourIso(numeroDuJour(J) + 1), league: 'L', saison: 2024, rencontre: 102, camp: 1, corners_p: 999, corners_c: 5 }));
  const une = b.terminerSansPause();
  const appris = { fenetre: { valeur: 5, beta: 1 }, demiVie: { valeur: 3, beta: 1 }, actuelle: { valeur: 10, beta: 1 } };
  const j1 = preparerJugement(une, 'corners_pour', 'corners_pour', appris, { de: J, a: J, tirages: 100 });
  assert.equal(j1.n, 2, 'les deux matchs du jour J sont jugés');
  const dix = valeurs.slice(-10).reduce((s, v) => s + v, 0) / 10;
  const cinq = valeurs.slice(-5).reduce((s, v) => s + v, 0) / 5;
  for (let q = 0; q < 2; q++) {
    proche(j1.colonnes.x10[q], dix, 1e-12, 'fenêtre de 10 au jour J : ni le jour J, ni le lendemain');
    proche(j1.colonnes.xw[q], cinq, 1e-12, 'fenêtre de 5 au jour J');
  }
  // La même fenêtre que celle de l'étape 17 (dayTable.fenetre : attribués et prolongations écartés, 0-0 non relevé).
  const faits = [];
  const u = generateur(5);
  for (let m = 0; m < 30; m++) {
    const zero = m % 9 === 4;
    faits.push({ club: 'fotmob-7', adversaire: 'fotmob-8', date: jourIso(numeroDuJour('2024-09-01') + 4 * m), league: m % 5 === 0 ? 'Coupe' : 'L', saison: 2024, home: m % 2 === 0, rencontre: 500 + m, matchKey: `k${m}`, attribue: m === 7, prolongation: m === 11, compte: true, coupe: m % 5 === 0, releve: true, corners_p: zero ? 0 : 3 + Math.floor(u() * 8), corners_c: zero ? 0 : 2 + Math.floor(u() * 6), bp: 1, bc: 0 });
  }
  const s17 = new ConstructeurDeSerie({ echelle: 'equipe', source: 'magasin' });
  for (const f of faits) s17.ajouter(f);
  const serie17 = s17.terminerSansPause();
  const jug17 = preparerJugement(serie17, 'corners_pour', 'corners_pour', appris, { de: '2024-09-01', a: null, tirages: 100 });
  // Les lignes jugées, comptées ici : championnat (ni coupe), ni attribuée ni prolongée, cible relevée (0-0 non),
  // et au moins 6 relevés d'histoire (attribués et prolongations hors de l'histoire).
  let attendues = 0;
  for (const f of faits) {
    const histoire = faits.filter((x) => x.date < f.date && !x.attribue && !x.prolongation && !(x.corners_p === 0 && x.corners_c === 0)).length;
    if (!f.coupe && !f.attribue && !f.prolongation && !(f.corners_p === 0 && f.corners_c === 0) && histoire >= 6) attendues++;
  }
  assert.equal(jug17.n, attendues);
  assert.ok(jug17.n > 10);
  // Le calcul compte les mêmes lignes cibles (la même règle) : jamais une coupe, un attribué ou un prolongé.
  assert.equal(apprendre(serie17, 'corners_pour', 'corners_pour', { de: '2024-09-01', a: null, tirages: 100 }).lignes, attendues);
  for (let q = 0; q < jug17.n; q++) {
    const jour = jourIso(jug17.colonnes.jour[q]);
    const attendu = fenetreDuJourJ(faits.filter((f) => f.date < jour), { n: 10, stat: 'corners', exclure: ['attribues', 'prolongations'] });
    proche(jug17.colonnes.x10[q], attendu.pour, 1e-12, `fenêtre de 10 au ${jour} = dayTable.fenetre`);
  }
  // Une série en désordre (deux jours inversés dans une entité) : le parcours lève, jamais un calcul faux.
  const col = Object.fromEntries(Object.entries(une.col).map(([k, v]) => [k, v.slice()]));
  [col.jour[3], col.jour[4]] = [col.jour[4], col.jour[3]];
  const desordre = new Serie({ echelle: 'equipe', source: 'magasin', n: une.n, colonnes: col, ligues: une.ligues, debuts: une.debuts });
  assert.throws(() => apprendre(desordre, 'corners_pour', 'corners_pour', options), /fuite refusée/);
});

test('fenêtre du moteur = la règle de statInputsRead (30 + 30 rencontres relevées, 0-0 non relevé), sur un club fabriqué : 40 matchs à domicile d’affilée, une saison sans statistiques, des 0-0', () => {
  // Le club : 30 matchs alternés, 40 à domicile d'affilée (dont 6 corners 0-0), 30 à l'extérieur sans statistiques (une saison non relevée), puis 20 alternés.
  const u = generateur(71);
  const lignes = [];
  let m = 0;
  const ajouter = (home, { releve = true, zero = false } = {}) => {
    const date = jourIso(numeroDuJour('2023-01-07') + 4 * m);
    const p = zero ? 0 : 2 + Math.floor(u() * 9);
    const c = zero ? 0 : 1 + Math.floor(u() * 7);
    lignes.push(fait({ club: 9, date, league: 'L', saison: 2023, rencontre: 1000 + m, matchKey: `k${String(m).padStart(3, '0')}`, camp: home ? 1 : 0, releve: releve ? 1 : 0, corners_p: releve ? p : null, corners_c: releve ? c : null, attribue: m === 12 ? 1 : 0, prolongation: m === 17 ? 1 : 0 }));
    m++;
  };
  for (let k = 0; k < 30; k++) ajouter(k % 2 === 0);
  for (let k = 0; k < 40; k++) ajouter(true, { zero: k % 7 === 3 });
  for (let k = 0; k < 30; k++) ajouter(false, { releve: false });
  for (let k = 0; k < 20; k++) ajouter(k % 2 === 1);
  const b = new ConstructeurDeSerie({ echelle: 'equipe', source: 'magasin' });
  for (const l of lignes) b.ajouter(l);
  const serie = b.terminerSansPause();
  const r = fenetreDuMoteur(serie, 'corners', { calcul: { de: '2030-01-01', a: '2030-01-02' }, jugement: { de: '2030-01-03', a: null }, tirages: 100, garderLesFenetres: true });
  const W = r.fenetres.W;
  assert.deepEqual([...W], [...FENETRES_MOTEUR]);
  // L'oracle, écrit ici d'après statInputsRead.moyennesEquipe : les 30 dernières rencontres RELEVÉES à domicile et les 30 à
  // l'extérieur avant le jour (attribuées et prolongées comprises), du plus récent au plus ancien (clé décroissante à jour égal),
  // puis les w premières où la paire est relevée (0-0 = non relevé).
  let comparees = 0;
  for (let i = 0; i < serie.n; i++) {
    const jour = jourIso(serie.col.jour[i]);
    const avant = lignes.filter((l) => l.date < jour && l.releve);
    const dom = avant.filter((l) => l.camp === 1).slice(-30);
    const ext = avant.filter((l) => l.camp === 0).slice(-30);
    const candidats = [...dom, ...ext].sort((x, y) => (x.date !== y.date ? (x.date < y.date ? 1 : -1) : x.matchKey < y.matchKey ? 1 : -1));
    const releves = candidats.filter((l) => paireRelevee(l.corners_p, l.corners_c));
    W.forEach((w, wi) => {
      const pris = releves.slice(0, w);
      const attendu = [pris.reduce((s2, l) => s2 + l.corners_p, 0), pris.reduce((s2, l) => s2 + l.corners_c, 0), pris.length];
      const calcule = [r.fenetres.pour[i * W.length + wi], r.fenetres.contre[i * W.length + wi], r.fenetres.nombre[i * W.length + wi]];
      assert.deepEqual(calcule, attendu, `ligne ${i} (${jour}), fenêtre ${w}`);
      comparees++;
    });
  }
  assert.equal(comparees, 120 * W.length);
});

// ------------------------------------------------------------ 3. le seuil de minutes

/** Des joueurs fabriqués : des titulaires (90 min) au vrai taux de tirs, et des joueurs de 2 minutes qui tirent une fois. */
function joueursFabriques({ titulaires = 160, eclairs = 40, apparitions = 24, graine = 31 }) {
  const u = generateur(graine);
  const b = new ConstructeurDeSerie({ echelle: 'joueur', source: 'magasin', dejaRangee: true });
  const j0 = numeroDuJour('2024-08-03');
  let rencontre = 0;
  for (let p = 1; p <= titulaires + eclairs; p++) {
    const eclair = p > titulaires;
    const taux = Math.max(0.2, 2 + 0.8 * normale(u));
    const ligue = p % 2 ? 'L1' : 'L2';
    for (let m = 0; m < apparitions; m++) {
      const minutes = eclair ? 2 : 90;
      const tirs = eclair ? 1 : poisson(u, (taux * minutes) / 90);
      b.ajouter({ joueur: p, date: jourIso(j0 + 7 * m), rencontre: ++rencontre, poste: 3, minutes, note: null, buts: 0, passes_d: 0, tirs, cadres: 0, xg: null, xa: null, xgnp: null, xgot: null, pc: 0, recup: 0, duels_g: 0, duels_t: 0, buts_evites: null, jaunes: null, rouges: null, groupe: { league: ligue, saison: 2024 }, championnat: true, attribue: false, prolongation: false });
    }
  }
  return b.terminerSansPause();
}

test('seuil de minutes : ramené à 90 minutes ; 450 minutes par moitié, 270 avant un match ; sans seuil, des joueurs de 2 minutes fabriquent une fausse fiabilité', () => {
  const serie = joueursFabriques({});
  // Par 90 minutes : 3 tirs en 45 minutes = 6 par 90.
  const b = new ConstructeurDeSerie({ echelle: 'joueur', source: 'magasin', dejaRangee: true });
  b.ajouter({ joueur: 1, date: '2024-09-01', rencontre: 1, poste: 4, minutes: 45, tirs: 3, xg: 410, note: 712, groupe: { league: 'L', saison: 2024 }, championnat: true });
  b.ajouter({ joueur: 1, date: '2024-09-08', rencontre: 2, poste: 1, minutes: 90, tirs: 1, buts_evites: -35, groupe: { league: 'L', saison: 2024 }, championnat: true });
  const petite = b.terminerSansPause();
  const tirs = colonnesDe(petite, 'tirs');
  assert.deepEqual([tirs.num[0], tirs.den[0], (tirs.num[0] / tirs.den[0]) * 1], [3, 0.5, 6]);
  assert.ok(Number.isNaN(tirs.num[1]), 'un gardien n’entre pas dans les statistiques de joueurs de champ');
  // Les colonnes des joueurs sont en Float32 (1,7 million de lignes) : sept chiffres.
  proche(colonnesDe(petite, 'xg').num[0], 0.41, 1e-6, 'xG ×1000 → 0,41');
  proche(colonnesDe(petite, 'note').num[0], 7.12, 1e-6, 'note ×100 → 7,12');
  assert.equal(colonnesDe(petite, 'note').den[0], 1, 'la note : par apparition notée');
  proche(colonnesDe(petite, 'buts_evites').num[1], -0.35, 1e-6, 'buts évités ×100 → −0,35');
  assert.ok(Number.isNaN(colonnesDe(petite, 'buts_evites').num[0]), 'buts évités : les gardiens seulement');
  // Avec le seuil : les 40 joueurs de 2 minutes n'atteignent jamais 450 minutes par moitié.
  const f = fiabiliteMoitieMoitie(serie, 'tirs', { de: DE, a: '2025-06-30', tirages: 200 });
  assert.equal(f.segments, 160);
  assert.ok(f.r > 0.3 && f.r < 0.9, `fiabilité des titulaires : r = ${f.r}`);
  proche(f.k, 5, 0.01, 'une moitié = 450 minutes = 5 matchs de 90 minutes');
  // Sans seuil, ils entrent : 45 tirs par 90 minutes dans chaque moitié, une fiabilité de façade.
  const sans = fiabiliteMoitieMoitie(serie, 'tirs', { de: DE, a: '2025-06-30', tirages: 200, minutesMoitie: 1 });
  assert.equal(sans.segments, 200);
  assert.ok(sans.r > 0.95, `sans seuil : r = ${sans.r}`);
  // Avant un match : 270 minutes d'histoire au moins — un titulaire dès sa 4e apparition, un joueur de 2 minutes jamais.
  const a = apprendre(serie, 'tirs', 'tirs', { de: DE, a: '2025-06-30', tirages: 100 });
  assert.equal(a.lignes, 160 * (24 - 3));
  const sansHistoire = apprendre(serie, 'tirs', 'tirs', { de: DE, a: '2025-06-30', tirages: 100, minutesHistoire: 1 });
  assert.equal(sansHistoire.lignes, 200 * (24 - 1));
});

// ------------------------------------------------------------ 4. les zéros « non relevé »

test('zéros « non relevé » : 0-0 au magasin (comptes, jaunes, et les rouges sans jaunes), vrais zéros chez football-data ; le calcul les écarte comme des absents', () => {
  const ligne = (x) => fait({ club: 1, date: '2024-09-01', league: 'L', saison: 2024, rencontre: 1, camp: 1, ...x });
  const une = (source, x) => {
    const b = new ConstructeurDeSerie({ echelle: 'equipe', source });
    b.ajouter(ligne(x));
    return b.terminerSansPause();
  };
  const val = (serie, id) => colonnesDe(serie, id).num[0];
  const m = une('magasin', { corners_p: 0, corners_c: 0, jaunes_p: 0, jaunes_c: 0, rouges_p: 1, rouges_c: 0, bp: 0, bc: 0, tirs_p: 0, tirs_c: 3 });
  assert.ok(Number.isNaN(val(m, 'corners_pour')), 'corners 0-0 : non relevé');
  assert.ok(Number.isNaN(val(m, 'jaunes_pour')), 'jaunes 0-0 : non relevé (20 compétitions en 2026)');
  assert.ok(Number.isNaN(val(m, 'rouges_pour')), 'un rouge relevé sans jaunes relevés ne compte pas');
  assert.equal(val(m, 'tirs_pour'), 0, 'un 0 face à 3 est un vrai 0');
  assert.equal(val(m, 'buts_pour'), 0, 'un 0-0 au score est un vrai score');
  assert.equal(val(m, 'points'), 1);
  const fd = une('football-data', { corners_p: 0, corners_c: 0, jaunes_p: 0, jaunes_c: 0, rouges_p: 1, rouges_c: 0 });
  assert.deepEqual([val(fd, 'corners_pour'), val(fd, 'jaunes_pour'), val(fd, 'rouges_pour')], [0, 0, 1], 'football-data : une case vide est « non publié », un 0 est un 0');
  assert.ok(Number.isNaN(val(une('football-data', { corners_p: null, corners_c: 4 }), 'corners_pour')), 'football-data : une case vide');
  assert.ok(Number.isNaN(val(une('magasin', { xg_p: 1.2, xg_c: null }), 'xg_pour')), 'xG d’un seul côté : non relevé');
  // Une compétition dont les jaunes passent à 0-0 en cours de période : le calcul les traite en ABSENTS — le même résultat qu'en les retirant, pas celui de vrais zéros.
  const fabrique = (remplacer, source = 'magasin') => {
    const u = generateur(41);
    const b = new ConstructeurDeSerie({ echelle: 'equipe', source });
    let r = 0;
    for (let l = 0; l < 8; l++) {
      for (let e = 0; e < 12; e++) {
        const talent = normale(u);
        for (let k = 0; k < 30; k++) {
          const date = jourIso(numeroDuJour('2024-08-01') + 7 * k);
          const jp = Math.max(0, Math.round(2 + 0.6 * talent + normale(u)));
          const jc = Math.max(0, Math.round(2 + normale(u)));
          const muet = l === 0 && k >= 15;
          b.ajouter(fait({ club: l * 100 + e + 1, date, league: `L${l}`, saison: 2024, rencontre: ++r, camp: k % 2, jaunes_p: muet ? remplacer : jp, jaunes_c: muet ? remplacer : jc, rouges_p: muet ? 1 : 0, rouges_c: 0 }));
        }
      }
    }
    return b.terminerSansPause();
  };
  const options = { de: DE, a: '2025-06-30', tirages: 100 };
  const zeros = fabrique(0);
  const absents = fabrique(null);
  assert.deepEqual(fiabiliteMoitieMoitie(zeros, 'jaunes_pour', options), fiabiliteMoitieMoitie(absents, 'jaunes_pour', options));
  assert.deepEqual(apprendre(zeros, 'jaunes_pour', 'jaunes_pour', options), apprendre(absents, 'jaunes_pour', 'jaunes_pour', options));
  assert.deepEqual(apprendre(zeros, 'rouges_pour', 'rouges_pour', options), apprendre(absents, 'rouges_pour', 'rouges_pour', options));
  assert.notDeepEqual(apprendre(fabrique(0, 'football-data'), 'jaunes_pour', 'jaunes_pour', options), apprendre(absents, 'jaunes_pour', 'jaunes_pour', options), 'chez football-data, les mêmes 0 sont de vrais zéros');
});

// ------------------------------------------------------------ 5. au sein d'un championnat

test('au sein d’un championnat : un faux effet de niveau (aucun talent, des championnats de niveaux différents) disparaît ; le vrai talent reste', async () => {
  // 30 championnats, la moitié 30 corners au-dessus de l'autre ; AUCUNE différence entre équipes d'un même championnat.
  const niveau = (l) => (l % 2 ? 30 : 0);
  const serie = equipesFabriquees({ ligues: 30, equipes: 16, matchs: 32, sigmaB: 0, sigmaW: 2, niveau, graine: 51 });
  // La corrélation NAÏVE des moitiés (sans centrer par championnat), calculée ici : forte, par le seul niveau.
  const moities = [];
  for (let e = 0; e < serie.nEntites; e++) {
    const v = [];
    for (let i = serie.debuts[e]; i < serie.debuts[e + 1] && v.length < 16; i++) v.push(serie.col.corners_p[i]);
    moities.push([v.filter((_, k) => k % 2 === 0), v.filter((_, k) => k % 2 === 1)].map((h) => h.reduce((s, x) => s + x, 0) / h.length));
  }
  const moy = (k) => moities.reduce((s, m) => s + m[k], 0) / moities.length;
  const [ma, mb] = [moy(0), moy(1)];
  const cov = moities.reduce((s, m) => s + (m[0] - ma) * (m[1] - mb), 0);
  const naive = cov / Math.sqrt(moities.reduce((s, m) => s + (m[0] - ma) ** 2, 0) * moities.reduce((s, m) => s + (m[1] - mb) ** 2, 0));
  assert.ok(naive > 0.6, `corrélation naïve, tous championnats mêlés : ${naive}`);
  const f = fiabiliteMoitieMoitie(serie, 'corners_pour', { de: DE, a: '2025-06-30', tirages: 200 });
  assert.ok(Math.abs(f.r) < 0.12, `au sein du championnat : r = ${f.r}`);
  const a = apprendre(serie, 'corners_pour', 'corners_pour', { de: DE, a: '2024-12-31', tirages: 100 });
  for (const c of a.candidats) assert.ok(Math.abs(c.r) < 0.08, `${c.type} ${c.valeur ?? '∞'} : r = ${c.r}`);
  // Le tableau : la statistique « trompe » ; avec un vrai talent (σb = 1), elle « compte ».
  const options = { echelles: ['equipe'], sources: ['magasin'], statistiques: ['corners_pour'], moteur: false, tirages: 200, minBlocs: 20, periodes: { magasin: { calcul: { de: DE, a: '2024-12-31', tranches: ['essai'] }, jugement: { de: '2025-01-01', a: null, tranches: ['essai'] } } } };
  const sans = await calculerSurDesSeries({ equipe: { magasin: serie } }, { options });
  assert.equal(sans.lignes.length, 1);
  assert.equal(sans.lignes[0].verdict, 'trompe');
  assert.ok(Math.abs(sans.lignes[0].pouvoir.r) < 0.08, `pouvoir au sein du championnat : ${sans.lignes[0].pouvoir.r}`);
  const vrai = equipesFabriquees({ ligues: 30, equipes: 16, matchs: 32, sigmaB: 1, sigmaW: 2, niveau, graine: 52 });
  const avec = await calculerSurDesSeries({ equipe: { magasin: vrai } }, { options });
  assert.equal(avec.lignes[0].verdict, 'compte');
  assert.ok(avec.lignes[0].pouvoir.r > 0.3, `pouvoir d’un vrai talent : ${avec.lignes[0].pouvoir.r}`);
  assert.equal(avec.variantes.pouvoir, 1, 'une seule ligne jugée : une variante');
  assert.ok(avec.lignes[0].comparaisons.pouvoir.vues.total > 0);
});

// ------------------------------------------------------------ 6. la demi-vie

test('demi-vie retrouvée : un talent qui marche au hasard, dont le meilleur prédicteur est une moyenne pondérée de demi-vie 6', () => {
  // Modèle de niveau local : θ(t) = θ(t − 1) + η, x(t) = θ(t) + ε ; gain de Kalman K = 1 − 2^(−1/6), σ²η / σ²ε = K² / (1 − K).
  const K = 1 - 2 ** (-1 / 6);
  const sigmaEta = Math.sqrt((K * K) / (1 - K));
  const u = generateur(61);
  const b = new ConstructeurDeSerie({ echelle: 'equipe', source: 'magasin' });
  let r = 0;
  for (let l = 0; l < 10; l++) {
    for (let e = 0; e < 20; e++) {
      let theta = normale(u);
      for (let m = 0; m < 260; m++) {
        theta += sigmaEta * normale(u);
        b.ajouter(fait({ club: l * 100 + e + 1, date: jourIso(numeroDuJour('2020-01-01') + 7 * m), league: `L${l}`, saison: 2020, rencontre: ++r, camp: m % 2, corners_p: Math.round(1000 + 30 * (theta + normale(u))), corners_c: 50 }));
      }
    }
  }
  const serie = b.terminerSansPause();
  const a = apprendre(serie, 'corners_pour', 'corners_pour', { de: jourIso(numeroDuJour('2020-01-01') + 7 * 40), a: null, tirages: 200 });
  assert.ok([4, 6, 8].includes(a.demiVie.valeur), `demi-vie retrouvée : ${a.demiVie.valeur}`);
  assert.ok(a.demiVie.fourchette[0] <= 6 && a.demiVie.fourchette[1] >= 6, `fourchette ${a.demiVie.fourchette}`);
  const r2 = (valeur) => a.candidats.find((c) => c.type === 'demi-vie' && (valeur === Infinity ? c.sansFin : c.valeur === valeur)).r ** 2;
  assert.ok(r2(6) > r2(2) && r2(6) > r2(Infinity) && r2(6) > r2(25), 'la demi-vie de 6 explique plus que 2, 25 et l’infini');
  // Un talent fixe (aucune marche) : plus on garde de matchs, mieux c'est — la demi-vie part vers l'infini.
  const fixe = equipesFabriquees({ ligues: 10, equipes: 20, matchs: 120, sigmaB: 1, sigmaW: 2, graine: 62, debut: '2022-01-01' });
  const af = apprendre(fixe, 'corners_pour', 'corners_pour', { de: '2023-01-01', a: null, tirages: 100 });
  assert.ok(af.demiVie.valeur === Infinity || af.demiVie.valeur >= 35, `talent fixe : demi-vie ${af.demiVie.valeur}`);
  assert.ok(af.fenetre.valeur >= 25, `talent fixe : fenêtre ${af.fenetre.valeur}`);
});

// ------------------------------------------------------------ 7. verdicts, options, périodes

test('verdicts, options, périodes : « compte » au-delà de 1 % prouvé, 10 confirmée sauf preuve, P3 jamais lue, calcul avant jugement', () => {
  const juge = (verdict, bas) => ({ verdict, fourchetteRelative: [bas, bas + 0.02] });
  assert.equal(verdictDuPouvoir(juge('retenu', 0.012)), 'compte');
  assert.equal(verdictDuPouvoir(juge('retenu', 0.01)), 'compte');
  assert.equal(verdictDuPouvoir(juge('retenu', 0.004)), 'faible');
  assert.equal(verdictDuPouvoir(juge('pas-prouve', -0.01)), 'trompe');
  assert.equal(verdictDuPouvoir(juge('moins-bon', -0.05)), 'trompe');
  assert.equal(verdictDuPouvoir(juge('pas-assez-de-matchs', 0)), 'pas-assez');
  assert.equal(verdictDuPouvoir(null), 'pas-assez');
  assert.deepEqual(verdictDeLaFenetre(10, null), { verdict: 'confirmee', conseillee: 10 });
  assert.deepEqual(verdictDeLaFenetre(20, { verdict: 'retenu' }), { verdict: 'proposee', conseillee: 20 });
  assert.deepEqual(verdictDeLaFenetre(20, { verdict: 'pas-prouve' }), { verdict: 'confirmee', conseillee: 10 });
  assert.deepEqual(verdictDeLaFenetre(5, { verdict: 'moins-bon' }), { verdict: 'confirmee', conseillee: 10 });
  assert.deepEqual(verdictDeLaFenetre(20, { verdict: 'pas-assez-de-matchs' }), { verdict: 'pas-assez', conseillee: 10 });
  assert.deepEqual(verdictDeLaFenetre(null, null), { verdict: 'pas-assez', conseillee: 10 });
  // La fenêtre d'aujourd'hui est celle du moteur (non touchée) : 10 et 6.
  assert.deepEqual([FENETRE_ACTUELLE, STAT_SAMPLE, CONSTANTES.minimumFenetre, STAT_MIN_SAMPLE], [10, 10, 6, 6]);
  assert.ok(FENETRES.includes(10) && DEMI_VIES.includes(Infinity));
  assert.throws(() => lireOptions({ inconnue: 1 }), /Option inconnue/);
  assert.throws(() => lireOptions({ fenetres: [5, 20] }), /fenêtre d'aujourd'hui/);
  assert.throws(() => lireOptions({ echelles: ['club'] }), /Échelle inconnue/);
  // Calcul AVANT jugement, pour chaque source ; P3 (2023-01-01 → 2024-06-30) jamais lue par le magasin.
  for (const [source, p] of Object.entries(PERIODES_DU_CALCUL)) assert.ok(p.calcul.a < p.jugement.de, `${source} : le calcul finit avant le jugement`);
  assert.deepEqual([PERIODES_DU_CALCUL.magasin.calcul.de, PERIODES_DU_CALCUL.magasin.calcul.a, PERIODES_DU_CALCUL.magasin.jugement.de], ['2024-07-01', '2025-06-30', '2025-07-01']);
  assert.deepEqual([PERIODES_DU_CALCUL['football-data'].calcul.de, PERIODES_DU_CALCUL['football-data'].calcul.a, PERIODES_DU_CALCUL['football-data'].jugement.a], ['2000-07-01', '2019-06-30', '2023-06-30']);
  assert.equal(VUES_DE_L_ETAPE_18.length, 3);
  assert.ok(VUES_DE_L_ETAPE_18.every((v) => v.de && v.a && v.quoi));
  assert.deepEqual(VUES_DE_L_ETAPE_18.map((v) => [v.de, v.a]), [['2024-07-01', '2025-06-30'], ['2000-07-01', '2019-06-30'], ['2019-07-01', '2023-06-30']]);
  // Le catalogue : des identifiants uniques, chaque cible lisible, football-data sans xG ni occasions ni possession.
  assert.equal(new Set(STATISTIQUES_EQUIPE.map((s) => s.id)).size, STATISTIQUES_EQUIPE.length);
  assert.equal(new Set(STATISTIQUES_JOUEUR.map((s) => s.id)).size, STATISTIQUES_JOUEUR.length);
  for (const s of STATISTIQUES_EQUIPE.filter((x) => /xg|occasions|possession|finition/.test(x.id))) assert.deepEqual(s.sources, ['magasin'], s.id);
});

// ------------------------------------------------------------ 8. la copie : table du jour J, calcul, dépôt, route

test('dans une copie de la base d’essai : calcul complet, fenêtre du moteur = colonnes f10 (0 écart), dépôt, lecture pour 27/29/30, route GET/POST', () => {
  const copie = preparerCopie();
  try {
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    const r = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-valeur-stats.mjs'), { args: ['tout'], timeout: 180_000 });
    assert.equal(r.code, 0, r.erreurs.slice(-2000));
    assert.equal(r.reseau, false);
    const j = r.json;
    // Avant tout calcul : la forme complète, aucun calcul.
    assert.deepEqual(Object.keys(j.vide), ['dernier', 'lignes', 'enCours', 'dernierRefus', 'calculs', 'regles', 'provenance']);
    assert.equal(j.vide.dernier, null);
    assert.deepEqual(j.vide.lignes, []);
    assert.equal(j.vide.regles.fenetreActuelle, 10);
    // Le calcul : sans erreur, la main rendue, toutes les lignes du magasin (équipes, joueurs, moteur).
    assert.equal(j.bilan.erreur, null);
    assert.ok(j.pauses > 5, `la main rendue ${j.pauses} fois`);
    assert.equal(j.depot.lignesEnBase, 26 + 16 + 3);
    // Les fourchettes sont élargies pour TOUTES les lignes du tableau jugées (équipes 26, joueurs 16 ; moteur 3).
    assert.deepEqual(j.bilan.variantes, { pouvoir: 42, fenetre: 42, demiVie: 42, moteur: 3 });
    // La base d'essai finit le 21/09/2026 : tous les matchs jugés sont dans la fenêtre « mesures-du-23-09 » — indicatif.
    const xgLigne = j.lignes.find((l) => l.statistique === 'xg_pour');
    const vues = xgLigne.comparaisons.pouvoir.vues;
    assert.deepEqual([vues.indicatif, vues.horsVues, vues.parFenetre['mesures-du-23-09']], [true, 0, vues.total]);
    assert.ok(vues.total > 100);
    for (const c of j.bilan.controleF10) assert.deepEqual([c.statistique.startsWith('moteur_'), c.lignes > 1000, c.ecarts], [true, true, 0], JSON.stringify(c));
    for (const c of j.depot.colonnes) {
      assert.equal(c.fenetre_actuelle, 10);
      assert.ok(['confirmee', 'proposee', 'pas-assez'].includes(c.verdict_fenetre), c.statistique);
      if (!c.statistique.startsWith('moteur_')) assert.ok(['compte', 'faible', 'trompe', 'pas-assez'].includes(c.verdict), c.statistique);
    }
    // Le dépôt : un INSERT ouvert, une fin, une seconde fin refusée.
    assert.deepEqual(j.depot.ouvert, { fini_le: null, bilan: null });
    assert.equal(j.depot.second, 'CalculDejaFini');
    // La lecture pour les étapes 27, 29, 30.
    const xg = j.parametres.xg;
    assert.equal(xg.statistique, 'xg_pour');
    assert.equal(xg.fenetreActuelle, 10);
    // Tous les matchs jugés de la base d'essai sont déjà vus : une fenêtre proposée y serait indicative.
    assert.equal(xg.fenetreIndicatif, xg.verdictFenetre === 'proposee' || xg.meilleureFenetreAuCalcul !== 10);
    assert.ok(typeof xg.demiVieMatchs === 'number' || xg.demiVieMatchs === null);
    assert.ok(xg.calcul.id >= 1 && xg.apprisSur.de === '2026-02-01');
    assert.equal(j.parametres.inconnue, null);
    // La route : 409 sous un verrou tenu, 202, 409 pendant, une passe d'actualisation reportée, puis le calcul du serveur.
    assert.equal(j.sousVerrou.code, 409);
    assert.match(j.sousVerrou.corps.error, /tient la base/);
    assert.deepEqual(j.lance, { code: 202, enCours: true });
    assert.equal(j.pendant, 409);
    assert.match(j.passePendant.skipped, /valeur-des-stats en cours/);
    assert.equal(j.apres.enCours, null);
    assert.equal(j.apres.refus, null);
    assert.deepEqual([j.apres.dernier.ou, j.apres.dernier.fini, j.apres.dernier.erreur], ['serveur', true, null]);
    assert.ok(j.apres.lignes > 0);
    assert.equal(j.calculsAjoutes, 1);
    // Le calcul à part (le chemin du serveur) : un enfant qui ne répond pas à temps est arrêté, rien n'est écrit.
    assert.match(j.delai, /calcul à part arrêté : aucune réponse en 1 ms/);
    assert.equal(j.apresDelai, 1);
  } finally {
    copie.nettoyer();
  }
});
