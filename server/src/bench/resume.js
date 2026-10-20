/**
 * resume.js — le RÉSUMÉ du banc d'essai et ses appels au juge (étape 19 du plan, 13/10/2026).
 * -----------------------------------------------------------------------
 * Le rejeu (runner.js) ne garde AUCUNE ligne : chacune est versée dans sa
 * CASE — (tranche de période, jeu de prix ou « sans-cote », marché, ligne,
 * sous-table ∈ tout | coupes | horsHuisClos) — sous forme de sommes et de
 * trois tableaux compacts (Float32Array : la perte log du moteur, du marché,
 * du repère), puis oubliée. Une ligne par match et par case.
 *
 * À la fin, AVANT toute comparaison, on compte K = le nombre de cases qui
 * recevront un verdict (moteur face au marché, moteur face au repère, jeux
 * de prix face à face sur les matchs communs, valeur de clôture des paris,
 * variantes de prix comprises ; pas la reproduction ni les témoins Brier et
 * RPS, sans fourchette), puis chaque case appelle comparer (guard.js) avec
 * `variantes: K` : sur un millier de cases où rien ne change, une
 * cinquantaine sortiraient sinon « retenu » ou « moins bon » par hasard. Les
 * seuils de preuve ne se baissent jamais (200 blocs). La carte championnat ×
 * marché de l'étape 23 a SON K' (le nombre de ses cases).
 *
 * Sens : perte log 'min' (plus petite = mieux ; a = le marché ou le repère,
 * b = le moteur), valeur de clôture et gain 'max'. Bloc : le match pour les
 * probabilités, la journée d'un championnat pour les paris.
 * Aucun import de providers/ : pur, sauf le juge qui rend la main (les grosses cases jugées dans un fil
 * à part, jugeAPart.js, quand le rejeu rend la main : serveur et script).
 * -----------------------------------------------------------------------
 */

import { comparer } from './guard.js';
import { lignesDuJuge, ouvrirJugeAPart } from './jugeAPart.js';
import { calibrationVide, ajouterACalibration, lireCalibration, TRANCHES_DIXIEMES, TRANCHES_FIABILITE } from './metrics.js';
import { FIABILITE } from '../core/engine/resultPrediction.js';
import { FIABILITE_SCORE } from '../core/engine/scorePrediction.js';
import { resumeDesParis, parisQuiComptent, REGLES_DE_PARI } from './simulateBets.js';
import { DECISIONS_DE_PIERRE, SANS_COTE, BORNES_DES_LIVRES, PERIODES } from './periodes.js';

/** Le seuil de preuve du banc : jamais baissé (les tests, eux, le peuvent). */
export const MIN_BLOCS = 200;

const tranchesDe = (table) => Object.freeze(table.map((t) => Object.freeze({ de: t.de, a: t.a })));
/** Les tranches de calibration de référence : FIABILITE pour le 1N2 (selon la source), les bandes du score exact, les dixièmes ailleurs. */
export const TRANCHES_DE_CALIBRATION = Object.freeze({
  cotes: tranchesDe(FIABILITE.cotes),
  statistiques: tranchesDe(FIABILITE.statistiques),
  'score:cotes': tranchesDe(FIABILITE_SCORE.cotes.bands.map((b) => ({ de: b.range[0] / 100, a: b.range[1] / 100 })).map((t, i, all) => (i === 0 ? { de: 0, a: t.a } : i === all.length - 1 ? { de: t.de, a: 1.01 } : t))),
  'score:statistiques': tranchesDe(FIABILITE_SCORE.statistiques.bands.map((b) => ({ de: b.range[0] / 100, a: b.range[1] / 100 })).map((t, i, all) => (i === 0 ? { de: 0, a: t.a } : i === all.length - 1 ? { de: t.de, a: 1.01 } : t))),
  dixiemes: TRANCHES_DIXIEMES
});

const CAPACITE = 256;
/** Un tableau qui grandit de moitié (pas du double : la mémoire d'un rejeu complet tient surtout dans ces tableaux). */
function grandir(tableau, n) {
  if (n < tableau.length) return tableau;
  const plus = new tableau.constructor(Math.ceil(tableau.length * 1.5));
  plus.set(tableau);
  return plus;
}
const fini = (x) => typeof x === 'number' && Number.isFinite(x);

/** Une case vide. `ref` : la table de calibration de référence. */
function nouvelleCase(meta) {
  return {
    ...meta,
    n: 0,
    b: new Float32Array(CAPACITE),
    aM: null,
    aR: new Float32Array(CAPACITE),
    blocs: new Int32Array(CAPACITE),
    s: { pl: 0, ecr: 0, brier: 0, nBrier: 0, rps: 0, nRps: 0, plM: 0, nM: 0, brierM: 0, rpsM: 0, ecrM: 0, plMoteurM: 0, plR: 0, nR: 0, brierR: 0, rpsR: 0, ecrR: 0, plMoteurR: 0, plT: 0, nT: 0, plMoteurT: 0 },
    justes: { n: 0, k: 0 },
    top3: { n: 0, k: 0 },
    un11: { n: 0, k: 0 },
    horsGrille: 0,
    calibration: null,
    courbe: calibrationVide(TRANCHES_DIXIEMES),
    sourcesRepere: {},
    vues: { total: 0, parFenetre: {} },
    huisClos: 0,
    coupes: 0,
    sansMoyenneDeLigue: 0
  };
}

/**
 * LES ACCUMULATEURS d'un rejeu : cases, matchs communs, paris, carte, reproduction. `uneCaseParLigne` :
 * la décision 2 de Pierre (true : une case par ligne de buts ; false : les lignes d'un marché réunies).
 */
export class Accumulateurs {
  constructor({ uneCaseParLigne = DECISIONS_DE_PIERRE.uneCaseParLigne, carteSur = ['P2', 'P3'], prixDeLaCarte = 'fd-avant-match' } = {}) {
    this.uneCaseParLigne = uneCaseParLigne;
    this.cases = new Map();
    this.communs = new Map();
    this.carte = new Map();
    this.carteSur = new Set(carteSur);
    this.prixDeLaCarte = prixDeLaCarte;
    this.paris = new Map();
    this.comptes = {};
    this.reproduction = null;
  }

  /** La ligne d'une case : la ligne de buts, « - » sans ligne ou pour les comptes, « * » quand les lignes sont réunies. */
  ligneDeCase(l) {
    if (l.mesure === 'comptes' || l.ligne === null || l.ligne === undefined) return '-';
    return this.uneCaseParLigne ? String(l.ligne) : '*';
  }

  /** Les compteurs d'une tranche (rencontres, écartées par raison) et d'une tranche × jeu de prix. */
  compter(tranche, cle, n = 1, prix = null) {
    const t = (this.comptes[tranche] ??= { tranche, rencontres: 0, parPrix: {} });
    if (prix) {
      const p = (t.parPrix[prix] ??= {});
      p[cle] = (p[cle] ?? 0) + n;
    } else t[cle] = (t[cle] ?? 0) + n;
  }

  caseDe(tranche, prix, l, sousTable) {
    const ligneCase = this.ligneDeCase(l);
    const cle = `${tranche}|${prix}|${l.marketKey}|${ligneCase}|${sousTable}`;
    let c = this.cases.get(cle);
    if (!c) {
      c = nouvelleCase({ cle, tranche, prix, marketKey: l.marketKey, famille: l.famille, ligne: ligneCase === '-' || ligneCase === '*' ? null : Number(ligneCase), lignesReunies: ligneCase === '*', mesure: l.mesure, sousTable });
      this.cases.set(cle, c);
    }
    return c;
  }

  /**
   * Verse une ligne (compacte, cf. runner.js) dans ses cases : `tout`, et `coupes` / `horsHuisClos` quand elle
   * en est. `bloc` : le numéro du match dans le rejeu ; `vues` : les fenêtres « déjà vu » de son jour.
   */
  ajouterLigne({ tranche, prix, bloc, l, vues = [], huisClos = false, coupe = false }) {
    // Une ligne sans mesure (non réglable, sans distribution) ne crée pas de case : elle est comptée par le rejeu.
    if (l.pl === null) return;
    const sousTables = ['tout'];
    if (coupe) sousTables.push('coupes');
    if (tranche === 'P2' && !huisClos) sousTables.push('horsHuisClos');
    for (const st of sousTables) this.verser(this.caseDe(tranche, prix, l, st), bloc, l, { vues, huisClos, coupe });
  }

  verser(c, bloc, l, { vues, huisClos, coupe }) {
    if (l.pl === null) return;
    const i = c.n;
    c.b = grandir(c.b, i);
    c.aR = grandir(c.aR, i);
    c.blocs = grandir(c.blocs, i);
    c.b[i] = l.pl;
    // Le tableau du marché n'existe que pour les cases qui en ont un (1N2, plus/moins 2,5) : créé à la première ligne.
    if (fini(l.plM) && !c.aM) c.aM = new Float32Array(c.b.length).fill(Number.NaN);
    if (c.aM) {
      c.aM = grandir(c.aM, i);
      c.aM[i] = fini(l.plM) ? l.plM : Number.NaN;
    }
    c.aR[i] = fini(l.plR) ? l.plR : Number.NaN;
    c.blocs[i] = bloc;
    c.n++;
    const s = c.s;
    s.pl += l.pl;
    if (l.ecr) s.ecr++;
    if (fini(l.brier)) {
      s.brier += l.brier;
      s.nBrier++;
    }
    if (fini(l.rps)) {
      s.rps += l.rps;
      s.nRps++;
    }
    if (fini(l.plM)) {
      s.plM += l.plM;
      s.nM++;
      s.plMoteurM += l.pl;
      if (fini(l.brierM)) s.brierM += l.brierM;
      if (fini(l.rpsM)) s.rpsM += l.rpsM;
      if (l.ecrM) s.ecrM++;
    }
    if (fini(l.plR)) {
      s.plR += l.plR;
      s.nR++;
      s.plMoteurR += l.pl;
      if (fini(l.brierR)) s.brierR += l.brierR;
      if (fini(l.rpsR)) s.rpsR += l.rpsR;
      if (l.ecrR) s.ecrR++;
      c.sourcesRepere[l.sourceR] = (c.sourcesRepere[l.sourceR] ?? 0) + 1;
    }
    if (fini(l.plT)) {
      s.plT += l.plT;
      s.nT++;
      s.plMoteurT += l.pl;
    }
    if (typeof l.justes === 'boolean') {
      c.justes.n++;
      if (l.justes) c.justes.k++;
    }
    if (typeof l.top3 === 'boolean') {
      c.top3.n++;
      if (l.top3) c.top3.k++;
    }
    if (typeof l.un11 === 'boolean') {
      c.un11.n++;
      if (l.un11) c.un11.k++;
    }
    if (l.horsGrille) c.horsGrille++;
    if (l.calib) {
      c.calibration ??= { table: l.calib.table, acc: calibrationVide(TRANCHES_DE_CALIBRATION[l.calib.table] ?? TRANCHES_FIABILITE) };
      if (c.calibration.table === l.calib.table) ajouterACalibration(c.calibration.acc, l.calib.p, l.calib.realise);
      ajouterACalibration(c.courbe, l.calib.p, l.calib.realise);
    }
    if (l.sansMoyenneDeLigue) c.sansMoyenneDeLigue++;
    c.vues.total++;
    for (const id of vues) c.vues.parFenetre[id] = (c.vues.parFenetre[id] ?? 0) + 1;
    if (huisClos) c.huisClos++;
    if (coupe) c.coupes++;
  }

  /** Deux jeux de prix face à face sur le même match et la même ligne (a = le premier, b = le second). */
  ajouterCommun({ tranche, prixA, prixB, bloc, l, plA, plB }) {
    if (!fini(plA) || !fini(plB)) return;
    const ligneCase = this.ligneDeCase(l);
    const cle = `${tranche}|${prixA}~${prixB}|${l.marketKey}|${ligneCase}|communs`;
    let c = this.communs.get(cle);
    if (!c) {
      c = { cle, tranche, prixA, prixB, marketKey: l.marketKey, ligne: ligneCase === '-' || ligneCase === '*' ? null : Number(ligneCase), sousTable: 'communs', n: 0, a: new Float32Array(CAPACITE), b: new Float32Array(CAPACITE), blocs: new Int32Array(CAPACITE), sa: 0, sb: 0 };
      this.communs.set(cle, c);
    }
    const i = c.n;
    c.a = grandir(c.a, i);
    c.b = grandir(c.b, i);
    c.blocs = grandir(c.blocs, i);
    c.a[i] = plA;
    c.b[i] = plB;
    c.blocs[i] = bloc;
    c.n++;
    c.sa += plA;
    c.sb += plB;
  }

  /** La carte championnat × marché (étape 23) : moteur face au marché quand il existe, sinon au repère. */
  ajouterALaCarte({ tranche, prix, league, bloc, l }) {
    if (!this.carteSur.has(tranche) || prix !== this.prixDeLaCarte || l.pl === null) return;
    const a = fini(l.plM) ? l.plM : fini(l.plR) ? l.plR : null;
    if (a === null) return;
    const face = fini(l.plM) ? 'marche' : 'repere';
    const ligneCase = this.ligneDeCase(l);
    const cle = `${tranche}|${league}|${l.marketKey}|${ligneCase}|${face}`;
    let c = this.carte.get(cle);
    if (!c) {
      c = { cle, type: 'probabilites', jouable: false, tranche, league, marketKey: l.marketKey, ligne: ligneCase === '-' || ligneCase === '*' ? null : Number(ligneCase), face, n: 0, a: new Float32Array(CAPACITE), b: new Float32Array(CAPACITE), blocs: new Int32Array(CAPACITE), sa: 0, sb: 0 };
      this.carte.set(cle, c);
    }
    const i = c.n;
    c.a = grandir(c.a, i);
    c.b = grandir(c.b, i);
    c.blocs = grandir(c.blocs, i);
    c.a[i] = a;
    c.b[i] = l.pl;
    c.blocs[i] = bloc;
    c.n++;
    c.sa += a;
    c.sb += l.pl;
  }

  /** Un pari (ou un refus) d'une règle, sur une tranche et un jeu de prix. */
  ajouterDecision({ tranche, prix, regle, pari = null, refus = null, nonReglable = null }) {
    const cle = `${tranche}|${prix}|${regle}`;
    const p = this.paris.get(cle) ?? { cle, tranche, prix, regle, decisions: 0, refus: {}, nonReglables: 0, paris: [] };
    this.paris.set(cle, p);
    p.decisions++;
    if (pari) p.paris.push(pari);
    else if (refus) p.refus[refus] = (p.refus[refus] ?? 0) + 1;
    else if (nonReglable) p.nonReglables++;
  }
}

// ------------------------------------------------------------------ le juge

const moyenne = (somme, n) => (n ? somme / n : null);
const p100 = (k, n) => (n ? (100 * k) / n : null);

/** Le gain en pourcentage, comme jugerEtape : gain / |moyenne de A| × 100 (perte log : « de perte log en moins »). */
function enPourcent(j, relatif = true) {
  const base = j.a?.moyenne;
  const ok = relatif && typeof base === 'number' && base !== 0;
  const echelle = ok ? 100 / Math.abs(base) : 100;
  return {
    gain: j.gain === null ? null : j.gain * echelle,
    fourchette: j.fourchette ? j.fourchette.map((x) => x * echelle) : null,
    quoi: relatif ? 'de perte log en moins' : 'de valeur de clôture en plus'
  };
}

/** Le jugement d'une case, réduit à ce que lit l'écran. */
function jugement(j, relatif = true) {
  return {
    n: j.n,
    gain: j.gain,
    fourchette: j.fourchette,
    ecartType: j.ecartType,
    ecartDetectable: j.ecartType === null ? null : j.seuil.z * j.ecartType,
    p: j.p,
    verdict: j.verdict,
    raison: j.raison,
    variantes: j.seuil.variantes,
    z: j.seuil.z,
    enPourcent: enPourcent(j, relatif),
    a: j.a.moyenne,
    b: j.b.moyenne
  };
}

/**
 * Le nombre de cases qui recevront un verdict (K) et celui de la carte (K'). Une case compte dès qu'elle a une
 * ligne comparable, même si elle sortira « pas assez de matchs » : toutes les cases jugées, même non montrées.
 */
export function compterLesCases(acc) {
  let K = 0;
  for (const c of acc.cases.values()) {
    if (c.s.nM > 0) K++;
    if (c.s.nR > 0) K++;
  }
  for (const c of acc.communs.values()) if (c.n > 0) K++;
  for (const p of acc.paris.values()) if (p.paris.some((x) => x.valeurCloture !== null)) K++;
  let Kc = 0;
  for (const c of acc.carte.values()) if (c.n > 0) Kc++;
  return { K, Kc };
}

/**
 * LE RÉSUMÉ : toutes les cases, leurs verdicts (variantes = K partout), les paris, la carte (K'), la
 * reproduction. `pause(ou)` : rendre la main entre deux appels au juge. `aPart` : les grosses cases (moteur
 * face au marché ou au repère, jeux de prix face à face) jugées dans un fil à part (jugeAPart.js) — un appel
 * y tient 0,3 à 3 s, que le fil principal n'attend plus d'un seul tenant ; le juge de l'étape 16 n'est pas
 * retouché et le verdict est le même. Sans `aPart` (tests purs), tout est jugé sur place.
 */
export async function resumer(acc, { tirages = 1000, graine = 1, minBlocs = MIN_BLOCS, pause = async () => {}, attendre = (promesse) => promesse, avancement = null, aPart = false } = {}) {
  const juge = aPart ? ouvrirJugeAPart() : null;
  try {
    return await resumerAvec(acc, { tirages, graine, minBlocs, pause, attendre, avancement, juge });
  } finally {
    await juge?.fermer();
  }
}

async function resumerAvec(acc, { tirages, graine, minBlocs, pause, attendre, avancement, juge }) {
  // Dans le fil à part, l'attente ne tient pas la main (attendre) ; sur place, le juge la tient (mesuré par pause).
  const jugerUneCase = (blocs, a, b, n, opts, ou) => (juge ? attendre(juge.comparer({ blocs, a, b, n }, opts), ou) : Promise.resolve(comparer(lignesDuJuge(blocs, a, b, n), opts)));
  const { K, Kc } = compterLesCases(acc);
  const groupesDeParis = groupesDeLaCarteDesParis(acc);
  // K' : TOUTES les cases de la carte, probabilités et paris, comptées avant le premier verdict.
  const Kcarte = Kc + groupesDeParis.size;
  const options = { sens: 'min', tirages, graine, variantes: K, minBlocs };
  const total = acc.cases.size + acc.communs.size + acc.paris.size + acc.carte.size;
  let fait = 0;
  const etape = async (ou) => {
    fait++;
    if (avancement) avancement({ partie: 'juge', fait, total });
    await pause(ou);
  };

  const tranches = {};
  for (const c of acc.cases.values()) {
    const s = c.s;
    const sortie = {
      cle: c.cle,
      prix: c.prix,
      marketKey: c.marketKey,
      famille: c.famille,
      ligne: c.ligne,
      lignesReunies: c.lignesReunies,
      sousTable: c.sousTable,
      n: c.n,
      moteur: {
        perteLog: moyenne(s.pl, c.n),
        brier: moyenne(s.brier, s.nBrier),
        rps: moyenne(s.rps, s.nRps),
        ecretees: s.ecr,
        justes: c.justes.n ? { n: c.justes.n, justes: c.justes.k, taux: p100(c.justes.k, c.justes.n) } : null,
        top3: c.top3.n ? { n: c.top3.n, taux: p100(c.top3.k, c.top3.n) } : null
      },
      marche: s.nM ? { n: s.nM, perteLog: moyenne(s.plM, s.nM), brier: moyenne(s.brierM, s.nM), rps: moyenne(s.rpsM, s.nM), ecretees: s.ecrM, moteurPerteLog: moyenne(s.plMoteurM, s.nM), juge: null } : null,
      repere: s.nR ? { n: s.nR, perteLog: moyenne(s.plR, s.nR), brier: moyenne(s.brierR, s.nR), rps: moyenne(s.rpsR, s.nR), ecretees: s.ecrR, moteurPerteLog: moyenne(s.plMoteurR, s.nR), sources: c.sourcesRepere, un11: c.un11.n ? { n: c.un11.n, taux: p100(c.un11.k, c.un11.n) } : null, juge: null } : null,
      temoin: s.nT ? { n: s.nT, perteLog: moyenne(s.plT, s.nT), moteurPerteLog: moyenne(s.plMoteurT, s.nT), quoi: 'moyenne de clôture football-data, lue directement' } : null,
      calibration: c.calibration ? { table: c.calibration.table, tranches: lireCalibration(c.calibration.acc) } : null,
      courbe: lireCalibration(c.courbe),
      horsGrille: c.horsGrille,
      sansMoyenneDeLigue: c.sansMoyenneDeLigue,
      vues: c.vues,
      huisClos: c.huisClos,
      coupes: c.coupes
    };
    if (s.nM) sortie.marche.juge = jugement(await jugerUneCase(c.blocs, c.aM, c.b, c.n, options, `${c.cle} (marché)`));
    if (s.nR) sortie.repere.juge = jugement(await jugerUneCase(c.blocs, c.aR, c.b, c.n, options, `${c.cle} (repère)`));
    // La mémoire de la case est rendue dès qu'elle est jugée.
    c.b = c.aM = c.aR = c.blocs = null;
    const t = (tranches[c.tranche] ??= { tranche: c.tranche, cases: [] });
    t.cases.push(sortie);
    await etape(c.cle);
  }

  const communs = [];
  for (const c of acc.communs.values()) {
    communs.push({ cle: c.cle, tranche: c.tranche, prixA: c.prixA, prixB: c.prixB, marketKey: c.marketKey, ligne: c.ligne, n: c.n, perteLogA: moyenne(c.sa, c.n), perteLogB: moyenne(c.sb, c.n), juge: jugement(await jugerUneCase(c.blocs, c.a, c.b, c.n, options, c.cle)) });
    c.a = c.b = c.blocs = null;
    await etape(c.cle);
  }

  const paris = [];
  for (const p of acc.paris.values()) {
    const vosParis = p.prix === 'vos-bookmakers' && p.regle === 'moteur';
    const retenus = vosParis ? parisQuiComptent(p.paris) : p.paris;
    const r = resumeDesParis(retenus, { decisions: p.decisions, refus: p.refus, nonReglables: p.nonReglables, tirages, graine, variantes: K, minBlocs });
    paris.push({
      cle: p.cle,
      tranche: p.tranche,
      prix: p.prix,
      regle: p.regle,
      titre: REGLES_DE_PARI[p.regle]?.titre ?? p.regle,
      vosParis: REGLES_DE_PARI[p.regle]?.vosParis === true,
      phrase: REGLES_DE_PARI[p.regle]?.phrase ?? '',
      ...(vosParis ? { tousLesReleves: p.paris.length, relevesFrais: p.paris.filter((x) => x.fraicheur === 'fraiche').length, decisionDePierre: DECISIONS_DE_PIERRE.parisDeP5 } : {}),
      ...r
    });
    await etape(p.cle);
  }

  // La carte : K' cases ; les cases « paris » (1N2) en plus, sur 27/07/2012 → 30/06/2023, et à part P3/P4a (indicatif).
  const carte = [];
  const optionsCarte = { ...options, variantes: Kcarte };
  for (const c of acc.carte.values()) {
    const lignes = [];
    for (let i = 0; i < c.n; i++) lignes.push({ bloc: c.blocs[i], a: c.a[i], b: c.b[i] });
    carte.push({ cle: c.cle, type: c.type, jouable: c.jouable, tranche: c.tranche, league: c.league, marketKey: c.marketKey, ligne: c.ligne, face: c.face, n: c.n, perteLogFace: moyenne(c.sa, c.n), perteLogMoteur: moyenne(c.sb, c.n), juge: jugement(comparer(lignes, optionsCarte)) });
    c.a = c.b = c.blocs = null;
    await etape(c.cle);
  }
  const parisCarte = carteDesParis(acc, groupesDeParis, { tirages, graine, variantes: Kcarte, minBlocs });

  return {
    juge: { variantes: K, variantesCarte: Kcarte, tirages, graine, minBlocs, sens: { perteLog: 'min', valeurCloture: 'max' } },
    tranches,
    communs,
    paris,
    carte: [...carte, ...parisCarte.lignes],
    reproduction: acc.reproduction ? lireReproduction(acc.reproduction) : null,
    comptes: acc.comptes
  };
}

/**
 * Les cases « paris » de la carte (1N2 seul) : la valeur de clôture des paris de la règle du moteur, par
 * championnat, sur 27/07/2012 → 30/06/2023 (P1 et P2, quand P1 est rejouée) ; P3 et P4a à part, « indicatif ».
 */
function groupesDeLaCarteDesParis(acc) {
  const groupes = new Map();
  for (const p of acc.paris.values()) {
    if (p.regle !== 'moteur' || p.prix !== 'fd-avant-match') continue;
    const zone = p.tranche === 'P1' || p.tranche === 'P2' ? 'preuve' : p.tranche === 'P3' || p.tranche === 'P4a' ? 'indicatif' : null;
    if (!zone) continue;
    for (const x of p.paris) {
      if (x.valeurCloture === null || x.date < BORNES_DES_LIVRES.premierPinnacle) continue;
      const cle = `${zone}|${x.league}`;
      const g = groupes.get(cle) ?? { zone, league: x.league, paris: [] };
      g.paris.push(x);
      groupes.set(cle, g);
    }
  }
  return groupes;
}

function carteDesParis(acc, groupes, { tirages, graine, variantes, minBlocs }) {
  const p1Rejouee = [...acc.paris.values()].some((p) => p.tranche === 'P1');
  const lignes = [];
  for (const g of groupes.values()) {
    const j = comparer(g.paris.map((x) => ({ bloc: x.bloc, match: x.fixtureKey, cle: x.cle, date: x.date, a: 0, b: x.valeurCloture })), { sens: 'max', tirages, graine, variantes, minBlocs });
    lignes.push({
      cle: `paris|${g.zone}|${g.league}`,
      type: 'paris',
      jouable: true,
      zone: g.zone,
      indicatif: g.zone === 'indicatif',
      league: g.league,
      marketKey: 'result',
      n: g.paris.length,
      juge: jugement(j, false),
      periode: g.zone === 'preuve' ? (p1Rejouee ? `${BORNES_DES_LIVRES.premierPinnacle} → ${PERIODES.P2.a}` : `${PERIODES.P2.de} → ${PERIODES.P2.a} (P1 non rejouée)`) : `${PERIODES.P3.de} → ${PERIODES.P4.sous.P4a.a}`
    });
  }
  return { lignes };
}

// ------------------------------------------------------------ la reproduction

/** L'accumulateur de la reproduction du 23/09 (P4b, moyenne de clôture), rempli par le rejeu. */
export function nouvelleReproduction() {
  return {
    direct: { n: 0, justes: 0, pl: 0, brier: 0, rps: 0, anomalies: 0, tranches: calibrationVide(TRANCHES_DE_CALIBRATION.cotes) },
    moteur: { n: 0, justes: 0, pl: 0, brier: 0, rps: 0, cotesIncoherentes: 0, maxEcartP: 0, maxEcartPerteLog: 0, sommeEcartPerteLog: 0 },
    attribuees: 0,
    prolongees: 0
  };
}

function lireReproduction(r) {
  const d = r.direct;
  const m = r.moteur;
  return {
    periode: 'P4b',
    prix: 'fd-cloture',
    lectureDirecte: {
      matchs: d.n,
      justes: p100(d.justes, d.n),
      perteLog: moyenne(d.pl, d.n),
      brier: moyenne(d.brier, d.n),
      rps: moyenne(d.rps, d.n),
      anomalies: d.anomalies,
      tranches: lireCalibration(d.tranches)
    },
    moteur: {
      matchs: m.n,
      cotesIncoherentes: m.cotesIncoherentes,
      justes: p100(m.justes, m.n),
      perteLog: moyenne(m.pl, m.n),
      brier: moyenne(m.brier, m.n),
      rps: moyenne(m.rps, m.n),
      maxEcartP: m.maxEcartP,
      maxEcartPerteLog: m.maxEcartPerteLog,
      ecartMoyenPerteLog: moyenne(m.sommeEcartPerteLog, m.n)
    },
    attribuees: r.attribuees,
    prolongees: r.prolongees,
    attendu: { source: 't24, 07/10/2026', matchs: 12997, justes: 50.26, perteLog: 1.0034, brier: 0.6003, rps: 0.2043, tranches: [2393, 4808, 3029, 1647, 828, 292] },
    tolerance: 1e-4
  };
}

export const __pourLesTests = { SANS_COTE };
