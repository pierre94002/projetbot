/**
 * bancDuDirect.js — LE BANC DU DIRECT (étape 46 du plan, lot 1, partie C, 12/11/2026 ; règles du banc en PROJET § 2 à § 10 ;
 * critique R1, R12 à R17, R19 à R22, R36 ; conception § 5 ; essais T-B1 à T-B10 de directBanc.test.mjs).
 * -----------------------------------------------------------------------
 * PUR : ni base, ni fichier, ni horloge, ni réseau, ni hasard non amorcé. Le script (scripts/etape46.mjs) lit et écrit ;
 * ce module calcule. Il lit l'EXPORT (une ligne d'en-tête, puis une ligne par match : la ligne d'avant-match du modèle
 * jugé et, à part, `resultat`, le déroulé et le score de la 90e) :
 *   lireLExport(texte, { sansResultat })   l'en-tête et les matchs ; `sansResultat` : `resultat` RETIRÉ par le lecteur
 *                                          JSON lui-même (les comptes ne le voient jamais, T-B6) ;
 *   controlerLExport(entete, matchs, d)    une grille, une version du moteur, la colonne, le scellement, le principal de
 *                                          la 28 : ce qui fait refuser AVANT le verrou (aucune issue lue) ;
 *   comptesDeLExport(entete, matchs, d)    les comptes d'avant le regard (R1 point 3, R14 point 3, R19 point 4), sans issue ;
 *   etalonnageEtage1(matchs, d, o)         R20 point 1 : toutes les variantes sur les vraies lignes et les états fabriqués ;
 *   rejouer(matchs, d, o)                  sous verrou : les états réels (rejeuDuDirect.js) et les lectures des variantes ;
 *   etalonnageEtage2(rejeux)               R20 point 2 : les mêmes contrôles sur les états réels, AVANT toute perte ;
 *   lignesDuJuge(rejeux, j)                T-B2 : une ligne par (match, créneau, marché), `bloc` = le match ; les lignes de
 *                                          buts décidées par le score n'y sont pas ; le filet de R22 point 2 ;
 *   jugerLeBanc(rejeux, d, o)              les jugements (J4c d'abord, puis le principal sur la variante qui en résulte :
 *                                          R17 point 2), les tranches (K × 8), au z de K ;
 *   gardeDeCalibration(rejeux, v, o)       R13 : la paire (unité, tranche) écartée au-delà de 4 points ET de 3 écarts-types ;
 *   tableDuVerdict(o)                      R17 : la table, pour les deux regards (sûreté, preuve), et les phrases du § 9 ;
 *   passerLeBanc(o)                        le passage (rejeu, étalonnage 2, F1, jugements, garde, table) ;
 *   aRecopier(sortie, o) / texteDeLaNote   la note (format du PROJET § 10), recopiée PAR SCRIPT (--recopier, T-B9).
 * LES DEUX REGARDS (R15, O11) : la SÛRETÉ (--banc, dès 600 matchs) ne rend que « moins bon » ou « rien de moins bon » —
 * jamais un gain, une fourchette, « retenu » ni « prouvé » ; la PREUVE (--preuve, à T) rend tout.
 * SCELLEMENT (entre ses balises) : null jusqu'au scellement ; rempli PAR SCRIPT (--sceller), jamais à la main. Son sha1
 * propre (celui de ce fichier) est pris « à scellement vide » (le bloc remis à null) : un fichier ne peut pas porter son
 * propre sha1.
 * -----------------------------------------------------------------------
 */

import { comparer, generateur } from '../../bench/guard.js';
import { perteLog, perteLogBinaire } from '../../bench/metrics.js';
import { grilleDesEntrees } from '../simulation/entreesSimulation.js';
import { PARAMS_SANS_EFFETS } from '../simulation/simulationMatchsEnfant.js';
import { lireLeFair } from './calculDuDirect.js';
import { COUPES, RESTE_ADDITIONNEL } from './reglagesDirect.js';
import { etatsDuRejeu, issueDuRejeu, lecturesDuRejeu, CLES_DES_BUTS, familleDe, realiseDe, issue1n2 } from './rejeuDuDirect.js';
import { JUGE, SEUILS, TRANCHES, FAMILLES_DE_BUTS, ETATS_D_ETALONNAGE, CRENEAUX_D_ETALONNAGE, DEBUT_DU_BANC } from './declarationDuDirect.js';

/** La version du format de l'export, de la sortie et de la note. */
export const VERSION_DU_BANC = 1;
/** Le champ de l'export qui porte l'issue : retiré par le lecteur des comptes (T-B6). */
export const CHAMPS_DU_RESULTAT = Object.freeze(['resultat']);
/** Les deux regards nommés (R15). */
export const REGARDS = Object.freeze(['surete', 'preuve']);
/** Les verdicts d'une note (PROJET § 10 ; lectureDuDirect.js les lit). */
export const VERDICTS = Object.freeze(['faits-seuls', 'montre-non-tranche', 'prouve', 'pas-prouve']);

/** Gèle un objet et tout ce qu'il contient (le sceau ne se modifie pas en mémoire). */
const geler = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) geler(v);
  }
  return o;
};

// <SCELLEMENT rempli par script au scellement — ne pas modifier à la main>
export const SCELLEMENT = geler({"format":1,"scelleLe":"2026-11-15T11:24:33.527Z","colonne":"non-adoptee","regles":{"fichier":"banc-regles-etape46.md","sha1":"e34769ed9224ada81ee4205325b6368da52b667e"},"documents":{"conception.md":"7c2e4b5c94d9f26f472e74bad9fefee0b43c9137","decisions-orchestrateur.md":"666925c3775051d8bf8ac33e30f6e17c4644a7d2","critique.md":"bfbedd454c5592edfea7e73ec4a3303542043ed9","consigne-ecriture-lot1.md":"921fcda8027faa507e059de3a6959146a0918153","consigne-partie-C.md":"f92f94ef0ebc5428cac00854516405709677908f","regle-gel-pendant-essai27.md":"8f680adecf164600094c7602bb8b21bd95715fe0","gel-46.json":"a5b2fe5ce5815bbcf3a188e4ddeeb9c4f8db5fb6"},"modules":{"src/data/direct/reglagesDirect.js":"5e03db65fff210862301a3f1542cfa1828afd66a","src/data/direct/calculDuDirect.js":"3afe64ded927fb448bf5caeccfcf7102dd125211","src/data/direct/rejeuDuDirect.js":"78cb9f0f7454e369b6dcfa3567f2422d70670987","src/data/direct/bancDuDirect.js":"9f84c66e961aeb3d5e24c1ba91dd2dba920f3d0e","src/data/direct/declarationDuDirect.js":"c4cf038e4da5558393d3e9a52140aff797c1a79c","scripts/etape46.mjs":"ea7cd3ffc68915ead17be6f473261efea2af250f","src/data/simulation/reglages.js":"6484fa850c00e7d2a956cb230661f61851931c7b","src/data/simulation/simulationMatch.js":"a429d807e19399403887f74cf866a630a3b95b29","src/data/simulation/entreesSimulation.js":"147ef8d392d81eedc9ab957a527be468829c153e","src/data/simulation/simulationNuit.js":"135ca2a95aca899cdd1cb64f2036472cf7f4f884","src/data/simulation/simulationMatchsEnfant.js":"4e93366ba4af35cb81eddcbb2e287c35663a844f","src/data/simulation/simulationRead.js":"e486a3532a3ba32b3fcb2f2e63f6130502852500","src/data/simulation/etatSimulation.js":"50ef305f7cffed8ad158f7c938c142352d8e7c20","src/data/calibration.js":"0aeb1e51aace6724b549b96defbd7df0d43eebba","src/data/db/dayTable.js":"afc8d42ccc9028531da8d9efc2700ece449d6a97","src/bench/guard.js":"60551323d356d5502684ca32276793fcb946ef84","src/bench/metrics.js":"c40ebc02607830dec623d071c0d70778f26cf806","src/core/model/poisson.js":"78be7262cce935f745491e220804da4e8e093aa8","src/core/model/dixonColes.js":"83c4cf5111c071ca7f95422f826125ecd464484f","src/core/engine/goalModel.js":"236a33d7f952b12d4596b02ecb7c6090afca137d","src/core/engine/scorePrediction.js":"44bb6ed76ed724981de01b8d48b5a91ccb59dbed","src/core/market/marginRemoval.js":"b3deabcfcf1fe1d7f875d93a1b327b6efc0e883f","src/core/engine/noteDuModeleDeButs.js":"654e310c28e88de98c2f2ccf247b64ba5c3babaf","src/core/engine/motsDuModeleDeButs.js":"1c81f14ce0e25e3af595318028234c565798eea0"},"declaration":{"K":7,"z":2.69,"zTranches":3.322,"T":2300,"creneaux":[0,3,6,9,12,15,18,21,24,27,30,33,36,39,42,45,46,49,52,55,58,61,64,67,70,73,76,79,82,85,88,91],"variantes":["direct-ancre","direct-v1","direct-sans-effets","temps-restant","direct-rouges-ignores","temps-restant-championnat","temps-restant-ancre"],"affichee":"direct-ancre","principal":{"a":"temps-restant-ancre","b":"direct-ancre"},"repliJ4c":{"a":"temps-restant","b":"direct-v1"},"modele":{"grille":"ancien-81","roles":["service"],"empreinteAdoptee":null}},"juge":{"mode":"moyenne","sens":"min","tirages":2000,"graine":46,"alpha":0.05,"minBlocs":400,"minBlocsJ5":50},"seuils":{"surete":600,"f1":0.00001,"somme":1e-9,"ancre":0.000001,"ecartCalibration":0.04,"ecartsTypes":3,"minMatchsParPaire":50,"horsF1Part":0.01,"horsF1Max":20,"identitePart":0.005,"identiteMax":5},"registre":{"K":7,"version":"direct-ancre","le":"2026-11-14","finDeLaVue":"2026-11-14"}});
// </SCELLEMENT>

/*
 * Le bloc « vide » (entre ses balises : `export const SCELLEMENT = null;`) : le sha1 de ce fichier est pris avec lui (voir
 * l'en-tête ; les balises et le texte vide vivent dans scripts/etape46.mjs, jamais répétés ici : une balise n'apparaît
 * qu'une fois). Rempli, le bloc vaut `export const SCELLEMENT = geler({ format, scelleLe, colonne, regles: { fichier,
 * sha1 }, documents: { nom: sha1 }, modules: { chemin: sha1 }, declaration, juge, seuils, registre });` (--sceller).
 */

/** Un refus du banc (le script le dit, code 2). */
export class BancRefuse extends Error {}

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const borne01 = (p) => Math.min(1, Math.max(0, p));
const arrondi = (x, n = 8) => (fini(x) ? Number(x.toFixed(n)) : x ?? null);
const trancheDuCreneau = (k) => TRANCHES.find((_, i) => {
  const [, de, a] = TRANCHES_BORNES[i];
  return k >= de && k <= a;
}) ?? null;
const TRANCHES_BORNES = Object.freeze([[TRANCHES[0], 0, 14], [TRANCHES[1], 15, 29], [TRANCHES[2], 30, 44], [TRANCHES[3], 45, 45], [TRANCHES[4], 46, 60], [TRANCHES[5], 61, 75], [TRANCHES[6], 76, 90], [TRANCHES[7], 91, 91]]);
export { trancheDuCreneau };

/** Le centile p (0..1) d'une liste triée, par interpolation linéaire ; null si vide. */
export function centile(tries, p) {
  if (!tries.length) return null;
  const i = (tries.length - 1) * p;
  const b = Math.floor(i);
  return b + 1 < tries.length ? tries[b] + (tries[b + 1] - tries[b]) * (i - b) : tries[b];
}

// ================================================================================================ l'export

/**
 * L'EXPORT lu : la 1re ligne est l'en-tête (type « entete »), les autres les matchs (type « match »). `sansResultat` :
 * `resultat` est retiré PAR LE LECTEUR JSON (reviver) — les comptes et les contrôles d'avant le verrou ne le voient jamais.
 */
export function lireLExport(texte, { sansResultat }) {
  const lignes = String(texte).split('\n').filter((l) => l.trim() !== '');
  if (!lignes.length) throw new BancRefuse('export vide.');
  const sansLeResultat = (cle, valeur) => (CHAMPS_DU_RESULTAT.includes(cle) ? undefined : valeur);
  const entete = JSON.parse(lignes[0]);
  if (entete?.type !== 'entete' || entete.format !== VERSION_DU_BANC) throw new BancRefuse('ce n’est pas un export du banc du direct (en-tête de format 1).');
  const matchs = [];
  for (let i = 1; i < lignes.length; i++) {
    if (!lignes[i].includes('"type":"match"')) continue;
    matchs.push(sansResultat ? JSON.parse(lignes[i], sansLeResultat) : JSON.parse(lignes[i]));
  }
  return { entete, matchs };
}

/** Les comptes d'une liste par une clé. */
const compter = (liste, cle) => {
  const c = {};
  for (const x of liste) {
    const k = String(cle(x));
    c[k] = (c[k] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(c).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
};

/**
 * CE QUI FAIT REFUSER AVANT LE VERROU (aucune issue lue) : la colonne de l'export ≠ celle du code ; une ligne d'une autre
 * grille que celle de la colonne, ou deux grilles mêlées (O9, R1 point 1) ; une ligne « candidate » d'une autre empreinte
 * que l'adoptée (R1 point 2 : jamais jugée) ; deux versions du moteur mêlées (la note n'en porte qu'une, P4) ; une version
 * du moteur inconnue (aucune ligne « service » numérotée, ou une ligne sans version : la note ne s'appliquerait à aucune
 * ligne, P4) ; l'export n'a pas été fait sous le scellement en vigueur ; le principal de la 28 pas rendu (R36 point 9).
 * LES CANDIDATES DE L'EMPREINTE ADOPTÉE (colonne « adoptee », R1 point 2 ; correctif C1 du 13/11) : tant que l'essai de la
 * 27 dure, elles sont rangées SANS version du moteur (engine_version NULL : une candidate n'est aucune version) ; elles
 * sont jugées avec les lignes « service » de la grille, et la version se compte SANS elles — la note porte celle des
 * lignes « service » (la version 6 après l'adoption) et ne s'applique qu'à elles. Un export de candidates seules n'a donc
 * aucune version : refusé ici, avant tout verrou. Rend { refus: [phrases], grilles, versions, roles }.
 */
export function controlerLExport(entete, matchs, declaration, { scellementSha1 = null } = {}) {
  const refus = [];
  const grilles = [...new Set(matchs.map((m) => m.ligne?.grille))].sort();
  const empreinte = declaration.modele.empreinteAdoptee ?? null;
  const candidateAdoptee = (m) => m.ligne?.role === 'candidate' && empreinte !== null && m.ligne?.candidateHash === empreinte;
  // La version se compte sur les seules lignes « service » : les candidates de l’empreinte adoptée n’en ont pas, celles
  // d’une autre empreinte sont refusées à part — jamais comptées (C1 point 2).
  const versions = [...new Set(matchs.filter((m) => m.ligne?.role !== 'candidate').map((m) => m.ligne?.engineVersion))].map(String).sort();
  const numerotees = versions.filter((v) => v !== 'null' && v !== 'undefined');
  const autresCandidates = matchs.filter((m) => m.ligne?.role === 'candidate' && !candidateAdoptee(m)).length;
  if (entete.colonne !== declaration.colonne) refus.push(`l’export a été fait pour la colonne « ${entete.colonne} », le code est fixé sur « ${declaration.colonne} »`);
  if (grilles.length > 1) refus.push(`grilles mêlées : l’export mêle ${grilles.map((g) => `« ${g} »`).join(' et ')} (une seule grille par jugement, R1)`);
  else if (grilles.length === 1 && grilles[0] !== declaration.modele.grille) refus.push(`l’export porte la grille « ${grilles[0]} », la colonne juge « ${declaration.modele.grille} » (O9)`);
  if (autresCandidates) refus.push(`${autresCandidates} ${autresCandidates > 1 ? 'lignes' : 'ligne'} « candidate » d’une autre empreinte que l’adoptée (${empreinte ?? 'aucune dans cette colonne'}) : jamais jugée (R1 point 2)`);
  if (numerotees.length > 1) refus.push(`versions du moteur mêlées (${numerotees.join(' et ')}) : la note ne s’applique qu’à une (P4) — un export d’une seule version`);
  if (numerotees.length === 0 || numerotees.length !== versions.length) refus.push('version du moteur inconnue (aucune ligne « service » numérotée, ou une ligne sans version) : la note ne s’appliquerait à aucune ligne (P4)');
  if (scellementSha1 !== null && entete.scellement?.sha1 !== scellementSha1) refus.push(`l’export n’a pas été fait sous le scellement en vigueur (${entete.scellement?.sha1 ?? 'aucun'} ≠ ${scellementSha1})`);
  if (!entete.principal28) refus.push('le principal de la 28 n’est pas rendu (simulation_state.principal absent de la copie restaurée) : le banc passe APRÈS lui (R36 point 9)');
  return { refus, grilles, versions, roles: compter(matchs, (m) => m.ligne?.role) };
}

/**
 * L'IDENTITÉ DES LIGNES (R15 point 3 ; --preuve, AVANT le verrou, sans aucune issue) entre le premier export (celui du
 * regard de sûreté) et le second (celui du regard de preuve) : pour chaque match COMMUN, la ligne retenue (clé, rôle,
 * calcule_le, λ, μ, ρ, fair) doit être la même. Correctif C12 du 13/11, décision de l'orchestrateur — une petite tolérance
 * NOMMÉE : la ligne retenue dépend de meta.kickoff, qu'une feuille publiée en retard peut compléter ; les matchs communs
 * dont la ligne a changé sont nommés, comptés et retirés des DEUX côtés (ni jugés, ni dans les écarts entre les exports),
 * s'ils sont au plus SEUILS.identiteMax (5) ET au plus SEUILS.identitePart (0,5 %) des matchs communs ; au-delà, refus
 * (rien lu). Rend { communs, rompues: [matchKey], tolere, tolerance: { max, part } }.
 */
export function identiteDesLignes(premier, second) {
  const signature = (m) => JSON.stringify([m.cle, m.ligne?.role, m.ligne?.calculeLe, m.ligne?.lambda, m.ligne?.mu, m.ligne?.rho, m.ligne?.fair ?? null]);
  const avant = new Map(premier.map((m) => [m.matchKey, m]));
  const communs = second.filter((m) => avant.has(m.matchKey));
  const rompues = communs.filter((m) => signature(avant.get(m.matchKey)) !== signature(m)).map((m) => m.matchKey);
  const tolere = rompues.length <= SEUILS.identiteMax && rompues.length <= SEUILS.identitePart * communs.length;
  return { communs: communs.length, rompues, tolere, tolerance: { max: SEUILS.identiteMax, part: SEUILS.identitePart } };
}

const HEURE_MS = 3_600_000;

/** LES COMPTES d'avant le regard, sans aucune issue (R1 point 3, R7, R14 point 3, R19 point 4) ; `ancrages` : par match. */
export function comptesDeLExport(entete, matchs, declaration, { ancrages = null } = {}) {
  const ages = [];
  let inconnus = 0;
  let avecFair = 0;
  const totaux = [];
  for (const m of matchs) {
    const l = m.ligne ?? {};
    if (!l.kickoffConnu) inconnus++;
    if (lireLeFair(l.fair)) avecFair++;
    totaux.push(l.lambda + l.mu);
    const ko = Date.parse(m.kickoff ?? '');
    const calc = Date.parse(l.calculeLe ?? '');
    if (fini(ko) && fini(calc)) ages.push((ko - calc) / HEURE_MS);
  }
  ages.sort((a, b) => a - b);
  totaux.sort((a, b) => a - b);
  const n = matchs.length;
  const part = (x) => (n ? x / n : null);
  const q = (liste) => ({ c5: arrondi(centile(liste, 0.05), 4), c50: arrondi(centile(liste, 0.5), 4), c95: arrondi(centile(liste, 0.95), 4) });
  let ancrage = null;
  if (ancrages) {
    const faits = ancrages.filter((a) => a?.fait);
    const lp = faits.map((a) => a.lambda).sort((a, b) => a - b);
    const mp = faits.map((a) => a.mu).sort((a, b) => a - b);
    ancrage = { part: part(faits.length), faits: faits.length, aLaBorne: faits.filter((a) => a.borne).length, raisons: compter(ancrages.filter((a) => !a?.fait), (a) => a?.raison ?? 'inconnue'), lambdaPrime: q(lp), muPrime: q(mp) };
  }
  return {
    matchs: n,
    parChampionnat: compter(matchs, (m) => m.league ?? '?'),
    parJour: compter(matchs, (m) => m.date ?? '?'),
    roles: compter(matchs, (m) => m.ligne?.role),
    grilles: compter(matchs, (m) => m.ligne?.grille),
    versions: compter(matchs, (m) => m.ligne?.engineVersion),
    empreintes: compter(matchs, (m) => m.ligne?.candidateHash ?? 'aucune'),
    sourcesDesCotes: compter(matchs, (m) => m.ligne?.oddsSource ?? 'aucune'),
    partHeureInconnue: part(inconnus),
    ageAuCoupDEnvoiH: { mesures: ages.length, mediane: arrondi(centile(ages, 0.5), 3), partPlusDe24h: ages.length ? ages.filter((x) => x > 24).length / ages.length : null },
    totalButs: { partSous16: part(totaux.filter((x) => x < 1.6).length), partAuDessus4: part(totaux.filter((x) => x > 4).length), ...q(totaux) },
    partAvecFair: part(avecFair),
    ancrage,
    exclus: entete.exclus ?? null,
    rougesHorsTerrain: entete.rougesHorsTerrain ?? null,
    tailleT: declaration.T,
    regardDeSurete: n >= SEUILS.surete && n < declaration.T ? 'possible' : n >= declaration.T ? 'non : l’export a déjà T matchs, seul le regard de preuve est pris' : `non : moins de ${SEUILS.surete} matchs`
  };
}

// ================================================================================================ l'étalonnage

const UN_DEUX = (g) => {
  let p1 = 0;
  let p2 = 0;
  for (let i = 0; i < 21; i++) {
    for (let j = 0; j < 21; j++) {
      if (i > j) p1 += g[i * 21 + j];
      else if (i < j) p2 += g[i * 21 + j];
    }
  }
  return p1 - p2;
};

/** La minute 0 de direct-ancre (R20 point 1) : P(1) − P(2) de la grille FERMÉE à (λ′, μ′) = fair.home − fair.away, hors borne. */
export function controleDeLAncre(ligne, ancrage) {
  if (!ancrage?.fait || ancrage.borne) return { controle: false, ecart: null };
  const f = lireLeFair(ligne.fair);
  const ecart = UN_DEUX(grilleDesEntrees({ grille: ligne.grille, lambda: ancrage.lambda, mu: ancrage.mu, rho: ligne.rho })) - (f.home - f.away);
  return { controle: true, ecart, ok: Math.abs(ecart) <= SEUILS.ancre };
}

/**
 * Les écarts d'un jeu de points : lectures finies, dans [0 ; 1], somme 1 à 1e-9 masse négligée comprise (lectureCompacte) ;
 * masse négligée + plafonnée sous le seuil de F1 là où `masses(etat)` le dit — les autres masses sont COMPTÉES (`horsSeuil`,
 * la pire nommée). Rend { ecarts, horsSeuil: { n, pire: { masse, ou } } }.
 */
function ecartsDesPoints(cle, points, { masses }) {
  const ecarts = [];
  const horsSeuil = { n: 0, pire: { masse: null, ou: null } };
  for (const p of points) {
    for (const [id, l] of Object.entries(p.lectures)) {
      const ou = `${cle}, créneau ${p.etat.creneau} (${p.etat.h}-${p.etat.a}, rouges ${p.etat.rh}-${p.etat.ra}), ${id}`;
      if (!l.valide) ecarts.push(`${ou} : ${l.pourquoi}`);
      else if (!(l.masse < SEUILS.f1)) {
        if (masses(p.etat)) ecarts.push(`${ou} : masse négligée + plafonnée ${String(l.masse)} ≥ ${SEUILS.f1}`);
        else {
          horsSeuil.n++;
          if (horsSeuil.pire.masse === null || l.masse > horsSeuil.pire.masse) horsSeuil.pire = { masse: l.masse, ou };
        }
      }
    }
  }
  return { ecarts, horsSeuil };
}

/**
 * OÙ L'ÉTAGE 1 EXIGE LES MASSES SOUS F1 : aux états 0-0 (sans rouge) des quatre créneaux — l'état par lequel passe chaque
 * match, le seul possible au créneau 0. Aux états fabriqués 9-0, 4-4 (deux rouges de chaque côté) et 12-1, le plafond de
 * 20 buts par camp de la grille est atteint PAR CONSTRUCTION (masse plafonnée mesurée le 12/11 jusqu'à 6·10⁻² à 12-1 au
 * créneau 0 pour λ = 4,5) : la masse y est comptée et la pire nommée, la finitude et la somme y restent exigées. PROJET § 6
 * point 1, erreur de fait corrigée (journal de la partie C). À l'étage 2 (états réels) et pour F1 : partout (etalonnageEtage2,
 * avec le retrait nommé des matchs hors de F1 du correctif C11).
 */
export const MASSES_EXIGEES_A = (etat) => etat.h === 0 && etat.a === 0 && etat.rh === 0 && etat.ra === 0;

const idsDe = (declaration) => declaration.variantes.map((v) => v.id);

/**
 * L'ÉTALONNAGE, ÉTAGE 1 (R20 point 1 ; dans --comptes, AVANT le verrou, sans aucune issue) : toutes les variantes de la
 * colonne sur chaque vraie ligne et la grille d'états fabriqués (0-0, 9-0, 4-4 à deux rouges de chaque côté, 12-1 ;
 * créneaux 0, 45, 46, 91) ; la minute 0 de direct-ancre ; les masses sous le seuil de F1. Rend { ok, lignes, lectures,
 * ecarts (les 200 premiers), nEcarts, ancrages }.
 */
export function etalonnageEtage1(matchs, declaration, { paramsSansEffets = PARAMS_SANS_EFFETS, coupes = COUPES.banc } = {}) {
  const ids = idsDe(declaration);
  const etats = [];
  for (const c of CRENEAUX_D_ETALONNAGE) for (const e of ETATS_D_ETALONNAGE) etats.push({ creneau: c, part: 0, ...e });
  const ecarts = [];
  const ancrages = [];
  const horsSeuil = { n: 0, pire: { masse: null, ou: null } };
  let lectures = 0;
  for (const m of matchs) {
    const r = lecturesDuRejeu({ ligne: m.ligne, etats, variantes: ids, paramsSansEffets, coupes, championnat: m.league ?? null });
    lectures += r.points.length * ids.length;
    const e = ecartsDesPoints(m.cle, r.points, { masses: MASSES_EXIGEES_A });
    ecarts.push(...e.ecarts);
    horsSeuil.n += e.horsSeuil.n;
    if (e.horsSeuil.pire.masse !== null && (horsSeuil.pire.masse === null || e.horsSeuil.pire.masse > horsSeuil.pire.masse)) horsSeuil.pire = e.horsSeuil.pire;
    ancrages.push(r.ancrage);
    if (ids.includes('direct-ancre')) {
      const a = controleDeLAncre(m.ligne, r.ancrage);
      if (a.controle && !a.ok) ecarts.push(`${m.cle}, minute 0 de direct-ancre : P(1) − P(2) à ${String(a.ecart)} de fair.home − fair.away`);
    }
  }
  return { ok: ecarts.length === 0, lignes: matchs.length, lectures, nEcarts: ecarts.length, ecarts: ecarts.slice(0, 200), massesAuPlafond: horsSeuil, ancrages };
}

// ================================================================================================ le rejeu (sous verrou)

/**
 * LE REJEU de tous les matchs (sous verrou : les états viennent des événements) : pour chacun, l'issue (le score de la
 * 90e, contrôlé contre le déroulé), les états des créneaux évalués et les lectures de toutes les variantes de la colonne,
 * aux coupes du banc. `auFil(i)` est appelé toutes les 50 rencontres (le script y relit la passe de Pierre, R36 point 2).
 */
export function rejouer(matchs, declaration, { paramsSansEffets = PARAMS_SANS_EFFETS, coupes = COUPES.banc, auFil = null } = {}) {
  const ids = idsDe(declaration);
  const rejeux = [];
  for (let i = 0; i < matchs.length; i++) {
    if (auFil && i > 0 && i % 50 === 0) auFil(i);
    const m = matchs[i];
    let issue = null;
    let etats = null;
    let erreur = null;
    try {
      issue = issueDuRejeu(m.resultat);
      etats = etatsDuRejeu(m.resultat, declaration.creneaux);
    } catch (error) {
      erreur = error.message;
    }
    const r = erreur ? null : lecturesDuRejeu({ ligne: m.ligne, etats, variantes: ids, paramsSansEffets, coupes, championnat: m.league ?? null });
    const ancre = r && ids.includes('direct-ancre') ? controleDeLAncre(m.ligne, r.ancrage) : null;
    rejeux.push({ cle: m.cle, date: m.date, issue, erreur, ancrage: r?.ancrage ?? null, ancre, points: r?.points ?? [] });
  }
  return rejeux;
}

/** Le `pourquoi` d'une lecture dont la masse négligée dépasse 1e-4 (rejeuDuDirect.js, lectureCompacte) : une masse hors de F1. */
const MASSE_NEGLIGEE_AU_DELA = 'masse négligée au-delà de 1e-4';

/**
 * L'ÉTALONNAGE, ÉTAGE 2 (R20 point 2) : les mêmes contrôles sur les états RÉELS, avant toute perte — rejeu en forme,
 * lectures finies, dans [0 ; 1], de somme 1 masse négligée comprise, minute 0 de direct-ancre : un écart → arrêt, rien
 * n'est jugé.
 * LES MASSES (F1, sur TOUS les états réels) — correctif C11 du 13/11, décision de l'orchestrateur : un match dont un état
 * réel sort de F1 (masse négligée + plafonnée ≥ 1e-5 pour une variante, ou masse négligée au-delà de 1e-4) est RETIRÉ de
 * TOUS les jugements des deux regards, nommé (son pire état) et compté (`horsF1`) ; le critère ne lit que les masses des
 * lectures du modèle aux états du rejeu, jamais une issue ; toutes les variantes sont jugées sur les mêmes matchs. Si ces
 * matchs dépassent 1 % des matchs du passage OU 20 matchs (SEUILS.horsF1Part, horsF1Max), c'est un problème systématique,
 * qui ne se masque pas : écart, arrêt, rien n'est jugé. Un passage qui n'est pas arrêté ici a donc F1 tenu sur les matchs
 * jugés ; F1 et le filet de R22 ne rendent « faits seuls » que si l'étalonnage est ignoré (copie d'essai seulement).
 * Rend { ok, matchs, lectures, nEcarts, ecarts, horsF1: { n, tolere, seuil, matchs: [{ cle, masse, ou }] } } et, non
 * énumérable (jamais écrit dans la sortie), `retires` : l'ensemble des rejeux retirés des jugements.
 */
export function etalonnageEtage2(rejeux) {
  const ecarts = [];
  const hors = [];
  let lectures = 0;
  for (const r of rejeux) {
    if (r.erreur) ecarts.push(`${r.cle} : ${r.erreur}`);
    lectures += r.points.reduce((s, p) => s + Object.keys(p.lectures).length, 0);
    const masses = [];
    let pire = null;
    for (const p of r.points) {
      for (const [id, l] of Object.entries(p.lectures)) {
        const ou = `${r.cle}, créneau ${p.etat.creneau} (${p.etat.h}-${p.etat.a}, rouges ${p.etat.rh}-${p.etat.ra}), ${id}`;
        const horsDeF1 = (l.valide || l.pourquoi === MASSE_NEGLIGEE_AU_DELA) && fini(l.masse) && !(l.masse < SEUILS.f1);
        if (horsDeF1) {
          masses.push(`${ou} : masse négligée + plafonnée ${String(l.masse)} ≥ ${SEUILS.f1}`);
          if (pire === null || l.masse > pire.masse) pire = { masse: l.masse, ou };
        } else if (!l.valide) ecarts.push(`${ou} : ${l.pourquoi}`);
      }
    }
    if (pire) hors.push({ rejeu: r, cle: r.cle, masse: pire.masse, ou: pire.ou, masses });
    if (r.ancre?.controle && !r.ancre.ok) ecarts.push(`${r.cle}, minute 0 de direct-ancre : P(1) − P(2) à ${String(r.ancre.ecart)} de fair.home − fair.away`);
  }
  const N = rejeux.length;
  const tolere = hors.length <= SEUILS.horsF1Part * N && hors.length <= SEUILS.horsF1Max;
  if (!tolere) {
    ecarts.unshift(`${hors.length} ${hors.length > 1 ? 'matchs' : 'match'} hors de F1 sur ${N} (au-delà de ${SEUILS.horsF1Part * 100} % des matchs du passage ou de ${SEUILS.horsF1Max} matchs) : un problème systématique ne se masque pas — rien n’est jugé`);
    for (const h of hors) ecarts.push(...h.masses);
  }
  const resultat = {
    ok: ecarts.length === 0,
    matchs: N,
    lectures,
    nEcarts: ecarts.length,
    ecarts: ecarts.slice(0, 200),
    horsF1: { n: hors.length, tolere, seuil: { part: SEUILS.horsF1Part, max: SEUILS.horsF1Max }, matchs: hors.slice(0, 200).map(({ cle, masse, ou }) => ({ cle, masse, ou })) }
  };
  Object.defineProperty(resultat, 'retires', { value: new Set(tolere ? hors.map((h) => h.rejeu) : []), enumerable: false });
  return resultat;
}

/** F1 (R21 point 2) : masse négligée + plafonnée < 1e-5 sur TOUS les états du rejeu ; le pire état nommé. */
export function exactitudeF1(rejeux) {
  let pire = { masse: 0, ou: null };
  for (const r of rejeux) {
    for (const p of r.points) {
      for (const [id, l] of Object.entries(p.lectures)) {
        const m = fini(l.masse) ? l.masse : Number.POSITIVE_INFINITY;
        if (m > pire.masse) pire = { masse: m, ou: `${r.cle}, créneau ${p.etat.creneau} (${p.etat.h}-${p.etat.a}, rouges ${p.etat.rh}-${p.etat.ra}), ${id}` };
      }
    }
  }
  return { seuil: SEUILS.f1, pire: { masse: fini(pire.masse) ? pire.masse : null, ou: pire.ou }, tenu: pire.masse < SEUILS.f1 };
}

// ================================================================================================ les lignes du juge

/**
 * LES LIGNES DU JUGE (T-B2) d'un jugement { a, b, sur: '1n2' | 'buts', famille?, tranche?, rouges? } : une ligne par
 * (match, créneau, marché), `bloc` = `match` = la clé du match ; « buts » : les seules lignes OUVERTES au point (une ligne
 * décidée par le score n'entre pas) ; `tranche` : les points de cette bande ; `rouges` : les points où un rouge est déjà
 * tombé (J5). LE FILET (R22 point 2) : une lecture invalide d'une variante NON critique écarte la ligne des DEUX côtés,
 * comptée et nommée ; d'une variante critique (`critiques` : direct-v1, temps-restant, la variante affichée), elle est
 * comptée, nommée, et fait dire « F1 non tenu » (`f1NonTenu`). Rend { lignes, filet: { ecartees, nommees }, f1NonTenu }.
 */
export function lignesDuJuge(rejeux, { a, b, sur, famille = null, tranche = null, rouges = false }, { critiques = [] } = {}) {
  const lignes = [];
  const nommees = [];
  const f1NonTenu = [];
  let ecartees = 0;
  for (const r of rejeux) {
    if (!r.issue) continue;
    const iss = issue1n2(r.issue);
    for (const p of r.points) {
      const k = p.etat.creneau;
      if (tranche !== null && trancheDuCreneau(k) !== tranche) continue;
      if (rouges && p.etat.rh + p.etat.ra === 0) continue;
      const la = p.lectures[a];
      const lb = p.lectures[b];
      if (!la?.valide || !lb?.valide) {
        ecartees++;
        const qui = [!la?.valide ? a : null, !lb?.valide ? b : null].filter(Boolean);
        const nom = `${r.cle}, créneau ${k}, ${qui.join(' et ')} : ${(!la?.valide ? la?.pourquoi : lb?.pourquoi) ?? 'lecture absente'}`;
        if (nommees.length < 100) nommees.push(nom);
        if (qui.some((id) => critiques.includes(id))) f1NonTenu.push(nom);
        continue;
      }
      if (sur === '1n2') {
        lignes.push({ bloc: r.cle, match: r.cle, cle: `${r.cle}|${k}|1n2`, a: perteLog(la.un2.map(borne01), iss).valeur, b: perteLog(lb.un2.map(borne01), iss).valeur });
        continue;
      }
      for (const cle of CLES_DES_BUTS) {
        if (famille !== null && familleDe(cle) !== famille) continue;
        if (!la.ouvertes.includes(cle)) continue;
        const y = realiseDe(cle, r.issue);
        lignes.push({ bloc: r.cle, match: r.cle, cle: `${r.cle}|${k}|${cle}`, a: perteLogBinaire(borne01(la.buts[cle]), y).valeur, b: perteLogBinaire(borne01(lb.buts[cle]), y).valeur });
      }
    }
  }
  return { lignes, filet: { ecartees, nommees }, f1NonTenu };
}

// ================================================================================================ les jugements

/** Le résumé d'un jugement pour la sortie et la note ; au regard de SÛRETÉ, seulement « moins bon » ou pas (R15 point 1). */
function resume(spec, j, { regard, a, b, z }) {
  const n = { lignes: j.n.lignes, blocs: j.n.blocs, matchs: j.n.matchs };
  if (regard === 'surete') return { id: spec.id, a, b, sur: spec.sur, famille: spec.famille ?? null, tranche: spec.tranche ?? null, role: spec.role, verdict: j.verdict === 'moins-bon' ? 'moins-bon' : 'rien-de-moins-bon', gain: null, fourchette: null, n };
  return { id: spec.id, a, b, sur: spec.sur, famille: spec.famille ?? null, tranche: spec.tranche ?? null, role: spec.role, verdict: j.verdict, raison: j.raison, gain: arrondi(j.gain, 8), fourchette: Array.isArray(j.fourchette) ? j.fourchette.map((x) => arrondi(x, 8)) : null, ecartType: arrondi(j.ecartType, 8), z: arrondi(z, 4), n };
}

/**
 * LES JUGEMENTS (PROJET § 4) : J4c d'abord (colonne « non-adoptee ») — direct-ancre « moins bonne » → la variante affichée
 * devient direct-v1 et le principal se relit sur temps-restant → direct-v1 (R17 point 2) ; puis le principal, les autres
 * (`b: 'affichee'` résolu), et par tranche (les 8 bandes) le principal et J2 (toutes les familles de buts), au z de K × 8.
 * `tirages` : 2000 (JUGE) ; un essai seulement peut en passer moins. Rend { affichee, principal, jugements, tranches,
 * filet, f1NonTenu }.
 */
export function jugerLeBanc(rejeux, declaration, { regard, tirages = JUGE.tirages } = {}) {
  if (!REGARDS.includes(regard)) throw new BancRefuse(`regard inconnu (${regard}) : surete ou preuve.`);
  const K = declaration.K;
  const options = (variantes, minBlocs = JUGE.minBlocs) => ({ mode: JUGE.mode, sens: JUGE.sens, tirages, graine: JUGE.graine, variantes, alpha: JUGE.alpha, minBlocs });
  let affichee = declaration.affichee;
  let principal = declaration.principal;
  const filet = { ecartees: 0, nommees: [] };
  const f1NonTenu = [];
  const juger = (spec, a, b, variantes) => {
    const l = lignesDuJuge(rejeux, { a, b, sur: spec.sur, famille: spec.famille ?? null, tranche: spec.tranche ?? null, rouges: Boolean(spec.rouges) }, { critiques: ['direct-v1', 'temps-restant', affichee] });
    filet.ecartees += l.filet.ecartees;
    for (const x of l.filet.nommees) if (filet.nommees.length < 100) filet.nommees.push(`${spec.id} : ${x}`);
    f1NonTenu.push(...l.f1NonTenu.slice(0, 20));
    const j = comparer(l.lignes, options(variantes, spec.rouges ? JUGE.minBlocsJ5 : JUGE.minBlocs));
    return { brut: j, resume: resume(spec, j, { regard, a, b, z: j.seuil.z }) };
  };
  const jugements = [];
  const j4c = declaration.jugements.find((j) => j.id === 'J4c');
  let repli = false;
  if (j4c) {
    const r = juger(j4c, j4c.a, j4c.b, K);
    jugements.push(r.resume);
    if (r.brut.verdict === 'moins-bon') {
      affichee = 'direct-v1';
      principal = declaration.repliJ4c;
      repli = true;
    }
  }
  const specPrincipal = declaration.jugements.find((j) => j.id === 'principal');
  const rp = juger(specPrincipal, principal.a, principal.b, K);
  jugements.push({ ...rp.resume, repliJ4c: repli });
  for (const spec of declaration.jugements) {
    if (spec.id === 'J4c' || spec.id === 'principal') continue;
    const b = spec.b === 'affichee' ? affichee : spec.b;
    if (spec.a === b) {
      jugements.push({ id: spec.id, a: spec.a, b, sur: spec.sur, famille: spec.famille ?? null, role: spec.role, verdict: 'sans-objet', raison: 'A et B sont la même variante', gain: null, fourchette: null, n: null });
      continue;
    }
    jugements.push(juger(spec, spec.a, b, K).resume);
  }
  const tranches = [];
  for (const t of TRANCHES) {
    tranches.push(juger({ id: `principal@${t}`, sur: '1n2', tranche: t, role: 'tranche' }, principal.a, principal.b, K * TRANCHES.length).resume);
    tranches.push(juger({ id: `J2@${t}`, sur: 'buts', tranche: t, role: 'tranche' }, 'temps-restant', affichee, K * TRANCHES.length).resume);
  }
  return { affichee, principal: { ...principal, repliJ4c: repli }, jugements, tranches, filet, f1NonTenu: [...new Set(f1NonTenu)] };
}

// ================================================================================================ la garde de calibration

/** Les UNITÉS de la garde (R13 point 1) : chaque issue du 1N2 et chaque ligne de buts, côté annoncé fixe (« plus de », « oui »). */
export const UNITES_DE_CALIBRATION = Object.freeze(['result.home', 'result.draw', 'result.away', ...CLES_DES_BUTS]);

/**
 * LA GARDE DE CALIBRATION (R13) de la variante affichée : pour chaque paire (unité, tranche) — liste FERMÉE, 16 × 8 = 128,
 * comptée — l'annoncé moyen et le réalisé sur les points ouverts de la tranche ; l'écart-type de (réalisé − annoncé) par
 * blocs de matchs (le rééchantillonnage du juge : `tirages`, graine du JUGE) ; « écartée » si |écart| > 4 points ET > 3
 * écarts-types ; « à surveiller » si une seule des deux conditions tient — au regard de PREUVE seulement (au regard de
 * sûreté la garde ne sert qu'aux très gros écarts : R13 point 4). Une paire de moins de `minMatchsParPaire` matchs n'est
 * pas jugée (comptée). Rend { unites, tranches, paires, jugees, nonJugees, ecartees, aSurveiller }.
 */
export function gardeDeCalibration(rejeux, variante, { regard, tirages = JUGE.tirages, graine = JUGE.graine } = {}) {
  const valides = rejeux.filter((r) => r.issue);
  const M = valides.length;
  const P = UNITES_DE_CALIBRATION.length * TRANCHES.length;
  const sp = new Float64Array(P * M);
  const sy = new Float64Array(P * M);
  const sn = new Float64Array(P * M);
  valides.forEach((r, m) => {
    const iss = issue1n2(r.issue);
    for (const pt of r.points) {
      const l = pt.lectures[variante];
      if (!l?.valide) continue;
      const t = TRANCHES.indexOf(trancheDuCreneau(pt.etat.creneau));
      if (t < 0) continue;
      UNITES_DE_CALIBRATION.forEach((u, iu) => {
        let p;
        let y;
        if (u.startsWith('result.')) {
          const i = ['result.home', 'result.draw', 'result.away'].indexOf(u);
          p = l.un2[i];
          y = iss === i ? 1 : 0;
        } else {
          if (!l.ouvertes.includes(u)) return;
          p = l.buts[u];
          y = realiseDe(u, r.issue) ? 1 : 0;
        }
        const c = (iu * TRANCHES.length + t) * M + m;
        sp[c] += p;
        sy[c] += y;
        sn[c] += 1;
      });
    }
  });
  const ecartees = [];
  const aSurveiller = [];
  let jugees = 0;
  let nonJugees = 0;
  const u = generateur(graine);
  // Les tirages : M matchs avec remise, LES MÊMES pour toutes les paires (un seul générateur, créé ici).
  const tirs = new Int32Array(tirages * M);
  for (let i = 0; i < tirs.length; i++) tirs[i] = Math.floor(u() * M);
  for (let iu = 0; iu < UNITES_DE_CALIBRATION.length; iu++) {
    for (let t = 0; t < TRANCHES.length; t++) {
      const base = (iu * TRANCHES.length + t) * M;
      let SP = 0;
      let SY = 0;
      let SN = 0;
      let matchs = 0;
      for (let m = 0; m < M; m++) {
        if (sn[base + m] > 0) {
          SP += sp[base + m];
          SY += sy[base + m];
          SN += sn[base + m];
          matchs++;
        }
      }
      if (!matchs) continue;
      if (matchs < SEUILS.minMatchsParPaire) {
        nonJugees++;
        continue;
      }
      jugees++;
      const annonce = SP / SN;
      const realise = SY / SN;
      const ecart = realise - annonce;
      let s1 = 0;
      let s2 = 0;
      let gardes = 0;
      for (let k = 0; k < tirages; k++) {
        let a = 0;
        let b = 0;
        let c = 0;
        const o = k * M;
        for (let j = 0; j < M; j++) {
          const m = tirs[o + j];
          a += sp[base + m];
          b += sy[base + m];
          c += sn[base + m];
        }
        if (c === 0) continue;
        const e = b / c - a / c;
        s1 += e;
        s2 += e * e;
        gardes++;
      }
      const sigma = gardes > 1 ? Math.sqrt(Math.max(0, (s2 - (s1 * s1) / gardes) / (gardes - 1))) : null;
      const gros = Math.abs(ecart) > SEUILS.ecartCalibration;
      const sur = sigma !== null && Math.abs(ecart) > SEUILS.ecartsTypes * sigma;
      const paire = { unite: UNITES_DE_CALIBRATION[iu], tranche: TRANCHES[t], annonce: arrondi(annonce, 4), realise: arrondi(realise, 4), n: matchs, points: SN, ecart: arrondi(ecart, 4), sigma: arrondi(sigma, 4) };
      if (gros && sur) ecartees.push(paire);
      else if (regard === 'preuve' && (gros || sur)) aSurveiller.push(paire);
    }
  }
  return { variante, unites: UNITES_DE_CALIBRATION.length, tranches: TRANCHES.length, paires: P, jugees, nonJugees, ecartees, aSurveiller };
}

// ================================================================================================ le temps additionnel

/** Le plancher et le compte minimal de la table du temps additionnel (conception § 2.5). */
export const Q_MIN = 200;
export const PLANCHER = 0.05;

/**
 * LA TABLE du temps additionnel (conception § 2.5), d'un tableau de comptes q[x] (x = 1, 2, … ; q[0] ignoré) :
 *   x* = l'indice du plus grand q (le premier) ; S(x) = 1 pour x ≤ x*, S(x) = min(S(x − 1), q(x) / q(x*)) ensuite ;
 *   reste(x) = (q(x)/2 + Σ_{y > x} q(y)) / S(x) / Σ_y q(y) ;
 *   puis reste(x) ≤ reste(x − 1) imposé ; x plafonné à X = le dernier x où q(x) ≥ 200 ; plancher 0,05.
 * Rend { xEtoile, X, total, S, resteBrut, reste } (tableaux indexés par x, l'indice 0 à null). Partie A : écrite dans
 * scripts/etape46.mjs (--mesurer-additionnel), déplacée ici en partie C pour servir aussi au contrôle de --banc.
 */
export function tableDuTempsAdditionnel(q, { qMin = Q_MIN, plancher = PLANCHER } = {}) {
  const xs = [];
  for (let x = 1; x < q.length; x++) xs.push(x);
  const total = xs.reduce((s, x) => s + (q[x] ?? 0), 0);
  let X = 0;
  for (const x of xs) if ((q[x] ?? 0) >= qMin) X = x;
  if (!total || !X) return { xEtoile: null, X: 0, total, S: [null], resteBrut: [null], reste: [null] };
  let xEtoile = 1;
  for (const x of xs) if ((q[x] ?? 0) > (q[xEtoile] ?? 0)) xEtoile = x;
  const S = [null];
  for (const x of xs) S[x] = x <= xEtoile ? 1 : Math.min(S[x - 1], (q[x] ?? 0) / q[xEtoile]);
  const resteBrut = [null];
  const reste = [null];
  for (let x = 1; x <= X; x++) {
    let apres = 0;
    for (let y = x + 1; y < q.length; y++) apres += q[y] ?? 0;
    resteBrut[x] = ((q[x] ?? 0) / 2 + apres) / S[x] / total;
    let r = resteBrut[x];
    if (x > 1) r = Math.min(r, reste[x - 1]);
    reste[x] = r;
  }
  for (let x = 1; x <= X; x++) reste[x] = Math.max(reste[x], plancher);
  return { xEtoile, X, total, S, resteBrut, reste };
}

/**
 * LE CONTRÔLE DE LA TABLE DU TEMPS ADDITIONNEL SUR P5 (R36 point 6 ; dans --banc, APRÈS le verrou : des comptes de buts,
 * aucune probabilité) : la même table refaite sur les buts de 45+x et 90+x des matchs exportés (sans plafond de compte :
 * P5 est petite), comparée à RESTE_ADDITIONNEL pour x de 1 à X ; l'écart maximal va dans la note.
 */
export function controleDuTempsAdditionnel(matchs, table = RESTE_ADDITIONNEL) {
  const q45 = [0];
  const q91 = [0];
  for (const m of matchs) {
    for (const x of m.resultat?.ajouts?.['45'] ?? []) if (Number.isInteger(x) && x >= 1) q45[x] = (q45[x] ?? 0) + 1;
    for (const x of m.resultat?.ajouts?.['91'] ?? []) if (Number.isInteger(x) && x >= 1) q91[x] = (q91[x] ?? 0) + 1;
  }
  for (const q of [q45, q91]) for (let x = 0; x < q.length; x++) q[x] ??= 0;
  const comparer1 = (q, reste, X) => {
    const t = tableDuTempsAdditionnel(q, { qMin: 1 });
    let ecartMax = null;
    let ou = null;
    for (let x = 1; x <= Math.min(X, t.X); x++) {
      const e = Math.abs(t.reste[x] - reste[x]);
      if (ecartMax === null || e > ecartMax) {
        ecartMax = e;
        ou = x;
      }
    }
    return { buts: t.total, X: t.X, ecartMax: arrondi(ecartMax, 4), x: ou };
  };
  const p = comparer1(q45, table.reste45, table.X45);
  const s = comparer1(q91, table.reste91, table.X91);
  const max = [p.ecartMax, s.ecartMax].filter(fini);
  return { premiere: p, seconde: s, ecartMax: max.length ? Math.max(...max) : null };
}

// ================================================================================================ la table du verdict

const fr = (x, n = 1) => Number(x).toLocaleString('fr-FR', { maximumFractionDigits: n, minimumFractionDigits: 0 });
const millieme = (x) => `${fr(Math.abs(x) * 1000, 2)} ${Math.abs(x) * 1000 >= 2 ? 'millièmes' : 'millième'}`;
const accordMatchs = (n) => `${fr(n, 0)} ${n > 1 ? 'matchs' : 'match'}`;
/** Les familles de buts en mots (la phrase de la sortie et de la note ; l'écran a ses propres mots). */
const NOMS_DES_FAMILLES = Object.freeze({ totalGoals: 'plus/moins de buts', bothTeamsScore: 'les deux marquent', teamGoals: 'buts par équipe' });

/**
 * LA TABLE DU VERDICT (R17, PROJET § 8) et ses phrases (§ 9), pour les deux regards :
 *   étalonnage en écart → aucune note (le passage s'arrête, rien n'est jugé) ; F1 non tenu → « faits-seuls » ;
 *   principal « moins bon » → « faits-seuls » ; une tranche « moins bon » (principal ou J2 de la tranche) → pas de
 *   pourcentage dans cette tranche ; J2 ou J2s « moins bon » pour une famille → la famille n'est pas montrée ; paire
 *   écartée → la ligne dit pourquoi ; sinon : SÛRETÉ → « montre-non-tranche » ; PREUVE → « prouve » (principal
 *   « retenu ») ou « pas-prouve ».
 * Correctif C7 point 4 (13/11) : « il en faut environ T » seulement si n < T ; au regard de sûreté, « ; non montré : … »
 * nomme les familles et les tranches non montrées quand il y en a.
 */
export function tableDuVerdict({ regard, f1, f1NonTenu = [], principal, jugements, tranches, paires, declaration, n }) {
  const famillesNonMontrees = [];
  for (const f of FAMILLES_DE_BUTS) {
    if (jugements.some((j) => (j.id === `J2-${f}` || j.id === `J2s-${f}`) && j.verdict === 'moins-bon')) famillesNonMontrees.push(f);
  }
  const tranchesNonMontrees = TRANCHES.filter((t) => tranches.some((j) => (j.id === `principal@${t}` || j.id === `J2@${t}`) && j.verdict === 'moins-bon'));
  const T = declaration.T;
  const nonMontre = [...famillesNonMontrees.map((f) => `« ${NOMS_DES_FAMILLES[f] ?? f} »`), ...tranchesNonMontrees.map((t) => `la tranche ${t}`)];
  const encore = n < T ? ` ; il en faut environ ${fr(T, 0)}` : '';
  let verdict;
  let phrase;
  let pourquoi = null;
  if (!f1.tenu || f1NonTenu.length) {
    verdict = 'faits-seuls';
    pourquoi = 'f1';
    phrase = `F1 non tenu : pas montré (${f1NonTenu.length ? `lecture invalide d’une variante qui compte : ${f1NonTenu[0]}` : `masse négligée + plafonnée ${String(f1.pire.masse)} au pire état, ${f1.pire.ou}`}).`;
  } else if (principal.verdict === 'moins-bon') {
    verdict = 'faits-seuls';
    pourquoi = 'principal';
    phrase = regard === 'surete' ? `Moins bon : pas montré — sur ${accordMatchs(n)} rejoués, le calcul en direct fait moins bien que la simple règle du temps restant (perte log du 1N2).` : `Moins bon : pas montré — sur ${accordMatchs(n)} rejoués, le calcul en direct fait moins bien que la simple règle du temps restant, au-delà du hasard (perte log du 1N2).`;
  } else if (regard === 'surete') {
    verdict = 'montre-non-tranche';
    phrase = `Rien de moins bon : montré, pas encore jugé (${accordMatchs(n)} rejoués sur les ${fr(T, 0)} prévus)${nonMontre.length ? ` ; non montré : ${nonMontre.join(', ')}` : ''}.`;
  } else if (principal.verdict === 'retenu') {
    verdict = 'prouve';
    phrase = `Meilleur que la simple règle du temps restant sur ${accordMatchs(n)} rejoués : prouvé sur la perte log du 1N2, à point de départ égal ; ${paires.ecartees.length ? `${paires.ecartees.length} ${paires.ecartees.length > 1 ? 'paires écartées' : 'paire écartée'} par la garde de calibration` : 'aucun écart de calibration prouvé'}.`;
  } else {
    verdict = 'pas-prouve';
    const [lo, hi] = principal.fourchette ?? [null, null];
    phrase = fini(lo) && fini(hi)
      ? `Pas encore tranché : sur ${accordMatchs(n)} rejoués, ce calcul fait entre ${lo < 0 ? millieme(lo) : '0 millième'} de moins bien et ${hi > 0 ? millieme(hi) : '0 millième'} de mieux que la simple règle du temps restant (perte log du 1N2)${encore}.`
      : `Pas encore tranché : sur ${accordMatchs(n)} rejoués, ce calcul n’est ni prouvé meilleur ni prouvé moins bon que la simple règle du temps restant${encore}.`;
  }
  return { verdict, pourquoi, phrase, famillesNonMontrees, tranchesNonMontrees };
}

// ================================================================================================ le passage

/**
 * LE PASSAGE (sous verrou, après le refus éventuel de controlerLExport) : le rejeu, l'étalonnage de l'étage 2 (un écart →
 * `arret: true`, rien n'est jugé), F1, les jugements, la garde de calibration de la variante affichée, le contrôle du temps
 * additionnel, la table du verdict. `ignorerEtalonnage` et `tirages` réduits : copie d'essai seulement (le script refuse
 * ailleurs). Rend { etalonnage, arret, banc }.
 */
export function passerLeBanc({ matchs, declaration, regard, tirages = JUGE.tirages, ignorerEtalonnage = false, auFil = null, paramsSansEffets = PARAMS_SANS_EFFETS }) {
  const ordre = [...matchs].sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.cle < y.cle ? -1 : x.cle > y.cle ? 1 : 0));
  const rejeux = rejouer(ordre, declaration, { paramsSansEffets, auFil });
  const etalonnage = etalonnageEtage2(rejeux);
  if (!etalonnage.ok && !ignorerEtalonnage) return { etalonnage, arret: true, banc: null };
  // C11 : les matchs hors de F1 (tolérés) sont retirés de TOUS les jugements, nommés et comptés ; les mêmes matchs pour
  // toutes les variantes.
  const juges = etalonnage.retires.size ? rejeux.filter((r) => !etalonnage.retires.has(r)) : rejeux;
  const f1 = exactitudeF1(juges);
  const j = jugerLeBanc(juges, declaration, { regard, tirages });
  const principal = j.jugements.find((x) => x.id === 'principal');
  const paires = gardeDeCalibration(juges, j.affichee, { regard, tirages });
  const additionnel = controleDuTempsAdditionnel(ordre);
  const n = juges.filter((r) => r.issue).length;
  const table = tableDuVerdict({ regard, f1, f1NonTenu: j.f1NonTenu, principal, jugements: j.jugements, tranches: j.tranches, paires, declaration, n });
  return {
    etalonnage,
    arret: false,
    banc: {
      regard,
      colonne: declaration.colonne,
      K: declaration.K,
      z: declaration.z,
      zTranches: declaration.zTranches,
      T: declaration.T,
      tirages,
      graine: JUGE.graine,
      creneaux: declaration.creneaux,
      n,
      points: juges.reduce((s, r) => s + r.points.length, 0),
      exclus: { horsF1: etalonnage.retires.size },
      horsF1: { n: etalonnage.retires.size, seuil: etalonnage.horsF1.seuil, matchs: etalonnage.retires.size ? etalonnage.horsF1.matchs : [], regle: 'C11 : un match dont un état réel sort de F1 est retiré de tous les jugements des deux regards, nommé et compté ; au-delà de 1 % des matchs du passage ou de 20 matchs, rien n’est jugé.' },
      affichee: j.affichee,
      principal: j.principal,
      jugements: j.jugements,
      tranches: j.tranches,
      filet: j.filet,
      f1: { ...f1, nonTenuPar: j.f1NonTenu.slice(0, 20) },
      paires: regard === 'surete' ? { ...paires, aSurveiller: [] } : paires,
      additionnel,
      verdict: table.verdict,
      pourquoi: table.pourquoi,
      phrase: table.phrase,
      famillesNonMontrees: table.famillesNonMontrees,
      tranchesNonMontrees: table.tranchesNonMontrees
    }
  };
}

// ================================================================================================ la note

/** La date de Paris d'un instant ISO (AAAA-MM-JJ). */
const jourDeParis = (iso) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(new Date(iso));

/**
 * CE QUI EST RECOPIÉ dans noteDuDirect.js (PROJET § 10), tiré de la sortie d'un passage (sûreté ou preuve) — pur (recopie
 * PAR SCRIPT, T-B9). `sortie` : { fichier, sha1 } de la copie gardée dans test/fixtures. Lève sur une sortie arrêtée à
 * l'étalonnage (aucune note : l'écran reste « pas encore jugé »).
 */
export function aRecopier(s, { sortie = null } = {}) {
  const b = s?.banc;
  if (!b || s.format !== VERSION_DU_BANC) throw new BancRefuse('ce n’est pas une sortie du banc du direct (format 1), ou le passage s’est arrêté à l’étalonnage : aucune note.');
  const roles = s.export?.roles ?? {};
  const role = Object.keys(roles).length === 1 && roles.candidate ? 'candidate' : 'service';
  return {
    format: VERSION_DU_BANC,
    modele: s.modele.grille,
    version: s.modele.engineVersion,
    role,
    candidateHash: role === 'candidate' ? s.modele.candidateHash ?? null : null,
    variante: b.affichee,
    regard: b.regard,
    verdict: b.verdict,
    passeLe: jourDeParis(s.premierRegard),
    modules: s.scellement?.modules ?? {},
    regles: { sha1: s.regles?.sha1 ?? null, fichier: s.regles?.copie ?? null },
    scellement: { sha1: s.scellement?.sha1 ?? null, colonne: b.colonne },
    sortie,
    export: { sha1: s.export.sha1, matchs: b.n, de: s.export.de, a: s.export.a },
    k: b.K,
    n: b.n,
    t: b.T,
    jugements: b.jugements.map((j) => ({ id: j.id, a: j.a, b: j.b, verdict: j.verdict, gain: j.gain ?? null, fourchette: j.fourchette ?? null, n: j.n?.matchs ?? null })),
    tranchesNonMontrees: b.tranchesNonMontrees,
    famillesNonMontrees: b.famillesNonMontrees,
    paires: { jugees: b.paires.jugees, nonJugees: b.paires.nonJugees, ecartees: b.paires.ecartees.map((p) => ({ unite: p.unite, tranche: p.tranche, annonce: p.annonce, realise: p.realise, n: p.n })), aSurveiller: b.paires.aSurveiller.map((p) => ({ unite: p.unite, tranche: p.tranche, annonce: p.annonce, realise: p.realise, n: p.n })) },
    rouges: s.rouges ?? null,
    additionnelSurP5: { ecartMax: b.additionnel?.ecartMax ?? null },
    preuve: s.preuve ?? null,
    phrase: b.phrase
  };
}

/** Le TEXTE de noteDuDirect.js pour une note (null = le banc n'est pas passé, ou éteint) ; T-B9 le refait à l'octet. */
export function texteDeLaNote(note) {
  return [
    '/**',
    ' * noteDuDirect.js — CE QUE DIT LE BANC DU DIRECT (étape 46 du plan, lot 1).',
    ' * -----------------------------------------------------------------------',
    ' * ÉCRIT PAR SCRIPT, jamais à la main : `node scripts/etape46.mjs --recopier <sortie du passage>` (la note du regard de',
    ' * sûreté ou de preuve), ou `--note-nulle` (null : le banc n’est pas passé, ou les probabilités en direct sont éteintes).',
    ' * Le test T-B9 (directBanc.test.mjs) refait ce texte à l’octet. La note est le SEUL interrupteur (P5) : lectureDuDirect.js',
    ' * la charge une fois et ne l’applique qu’aux lignes de SA grille et de SA version du moteur (P4).',
    ' * Hors de l’empreinte du moteur (data/direct/). Pur : ne lit rien.',
    ' * -----------------------------------------------------------------------',
    ' */',
    '',
    '/** Gèle un objet et tout ce qu’il contient : la note ne se modifie pas en mémoire. */',
    'const gele = (o) => {',
    "  if (o && typeof o === 'object' && !Object.isFrozen(o)) {",
    '    Object.freeze(o);',
    '    for (const v of Object.values(o)) gele(v);',
    '  }',
    '  return o;',
    '};',
    '',
    '/** Le banc du direct (null = pas encore jugé, ou éteint : l’écran montre les faits, aucun pourcentage). */',
    `export const NOTE_DU_DIRECT = ${note === null ? 'null' : `gele(${JSON.stringify(note)})`};`,
    ''
  ].join('\n');
}

/** Le premier jour de la période du banc (rappel pour le script : une fenêtre d'export ne commence jamais avant). */
export const DEBUT_DE_LA_FENETRE = DEBUT_DU_BANC;
