/**
 * goalModel.js — LE MODÈLE DE BUTS UNIQUE (étape 27 du plan, 21/10/2026).
 * -----------------------------------------------------------------------
 * Avant l'étape 27, deux modèles de buts se contredisaient : les marchés de
 * buts venaient des moyennes de buts du classement (xgStructural, ρ −0,075,
 * aucune cote) et le score de l'inversion du 1N2 (scorePrediction.js,
 * ρ −0,04). Ici, UNE grille des scores (Poisson × Dixon-Coles, ρ des
 * réglages, −0,05) d'où sortent tous les marchés de buts ET le score. Ses
 * buts attendus (λ pour l'équipe qui reçoit, μ pour la visiteuse) :
 *   1. LE MARCHÉ : avec une cote plus/moins 2,5 gratuite, « le total par le
 *      plus/moins, l'équilibre par le 1N2 » ; sans, l'inversion du 1N2 seul ;
 *   2. LES STATISTIQUES : forces d'attaque et de défense de chaque club =
 *      moyennes pondérées dans le temps (demi-vies des réglages, en matchs)
 *      des rapports xG (buts quand l'xG manque) / moyenne du championnat du
 *      match AU LIEU, rétrécies vers 1 par `prior` matchs fictifs, remises à
 *      zéro quand le club change de championnat ; λS = L_dom · A_dom · D_ext ;
 *      avec `demarrageAFroid` (mesuré, m7) le TOTAL statistique est rapproché
 *      de celui du championnat tant que le club le moins connu a moins de
 *      `matchs` matchs comptés (l'écart entre les équipes n'est jamais touché) ;
 *   3. LE MÉLANGE en log, total et écart séparés (poids des réglages) ; sans
 *      cote, les statistiques seules.
 * Mesuré (conception de l'étape 27, mesures/modele/m1 à m7) : rien n'est
 * appris ici ni la nuit ; tout poids vient des réglages de la candidate.
 *
 * LA GRILLE DE CALCUL va de 0 à 20 buts par équipe (441 cases, N_CALCUL),
 * renormalisée (la masse au-delà est < 3e-6 même à λ = μ = 6) : l'ancrage, le
 * mélange et TOUS les marchés s'y calculent. On ne RENDS que les 81 cases
 * 0..8 (BUTS_RENDUS), telles quelles — jamais renormalisées : leurs vraies
 * probabilités — et « autre score » (horsGrille = 1 − Σ81). Une grille 0-8
 * renormalisée sous-estimait les lignes hautes des gros favoris de 1 à 4 points.
 *
 * PUR : aucune base, aucun fichier, aucune horloge, aucun hasard. Les entrées
 * viennent de l'appelant : le banc les pose sur le match (`entreesButs`),
 * l'appli les lit dans le magasin (data/db/entreesButs.js, par
 * sports/football/model.js#resolveGoalInputs). Les forces des clubs (état :
 * huit sommes, n, nx, dernier championnat) se calculent par jouerUnMatch,
 * match après match, la nuit (data/db/forcesButs.js) comme au banc.
 *
 * ABSENTE la clé `modeleDeButs` des réglages, rien ici n'est appelé : le
 * moteur rend exactement les chiffres d'avant (oddsEngine.js ; preuve :
 * test/moteurCleEteinte.test.mjs).
 * -----------------------------------------------------------------------
 */

import { poissonProbability } from '../model/poisson.js';
import { removeMargin } from '../market/marginRemoval.js';
import { tauxDuMarche } from './scorePrediction.js';
// Les MOTS (ce que Pierre lit) vivent hors de l'empreinte du moteur : ici, seulement les codes et les calculs.
import { PROVENANCES, NOMS_DES_SOURCES_DU_PLUS_MOINS, MOTS_DES_REGLAGES, MOTS_DES_ERREURS } from './motsDuModeleDeButs.js';

export const VERSION_MODELE_DE_BUTS = 1;
/** La forme des SOMMES rangées dans forces_buts : une autre version refait la table entière (colonne `reglages`). */
export const VERSION_DES_FORCES = 1;
/** La grille de CALCUL : 0 à 20 buts par équipe. */
export const N_CALCUL = 20;
/** Les cases RENDUES (banc, gel, écran) : 0 à 8 buts par équipe, indice home × 9 + away. */
export const BUTS_RENDUS = 8;
const TAILLE = N_CALCUL + 1;
export const LIGNES_DE_BUTS = Object.freeze([0.5, 1.5, 2.5, 3.5]);
const SUFFIXE = Object.freeze({ 0.5: '05', 1.5: '15', 2.5: '25', 3.5: '35' });
/**
 * Les règles des moyennes du championnat (recopiées de scoreFormRead.leagueAveragesBefore et des CONSTANTES de la
 * table du jour J — ce module n'importe rien du magasin) : la saison de J si ≥ 30 matchs, sinon les 365 jours si
 * ≥ 10, sinon 1,45 / 1,15 ; les xG si ≥ 20 matchs relevés, sinon les buts.
 */
export const DEFAUT_LIGUE = Object.freeze({ home: 1.45, away: 1.15 });
export const SEUILS_LIGUE = Object.freeze({ saison: 30, an: 10, jours: 365, xg: 20 });

// ------------------------------------------------------------ les réglages

/** Des réglages `modeleDeButs` fautifs : une candidate mal écrite n'est jamais calculée à moitié. */
export class ReglagesDuModeleDeButsInvalides extends Error {}

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const objet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const CLES = Object.freeze({
  racine: ['version', 'rho', 'demiVies', 'prior', 'statistique', 'poidsXg', 'changementDeChampionnat', 'ancrage', 'melange', 'demarrageAFroid', 'bornes'],
  demiVies: ['attaque', 'defense'],
  ancrage: ['ligne', 'methode'],
  melange: ['avecPlusMoins', 'sans'],
  poids: ['wT', 'wS'],
  demarrageAFroid: ['matchs']
});
const clesEnTrop = (o, permises) => Object.keys(o ?? {}).filter((k) => !permises.includes(k));

/**
 * Les réglages du modèle, lus dans les réglages du moteur (clé `modeleDeButs`) ; null si la clé est absente ou
 * nulle (le chemin d'avant, inchangé). Une clé présente mais fautive (valeur hors bornes, clé inconnue) LÈVE.
 */
export function reglagesDuModeleDeButs(config) {
  const r = config?.modeleDeButs;
  if (r === undefined || r === null) return null;
  const fautes = [];
  if (!objet(r)) throw new ReglagesDuModeleDeButsInvalides(MOTS_DES_REGLAGES.objetAttendu);
  const enTrop = [
    ...clesEnTrop(r, CLES.racine),
    ...clesEnTrop(r.demiVies, CLES.demiVies).map((k) => `demiVies.${k}`),
    ...clesEnTrop(r.ancrage, CLES.ancrage).map((k) => `ancrage.${k}`),
    ...clesEnTrop(r.melange, CLES.melange).map((k) => `melange.${k}`),
    ...clesEnTrop(r.melange?.avecPlusMoins, CLES.poids).map((k) => `melange.avecPlusMoins.${k}`),
    ...clesEnTrop(r.melange?.sans, CLES.poids).map((k) => `melange.sans.${k}`),
    ...(r.demarrageAFroid !== undefined ? clesEnTrop(r.demarrageAFroid, CLES.demarrageAFroid).map((k) => `demarrageAFroid.${k}`) : [])
  ];
  if (enTrop.length) fautes.push(MOTS_DES_REGLAGES.clesInconnues(enTrop));
  if (r.version !== VERSION_MODELE_DE_BUTS) fautes.push(MOTS_DES_REGLAGES.version(r.version, VERSION_MODELE_DE_BUTS));
  if (!(fini(r.rho) && r.rho > -0.5 && r.rho < 0.5)) fautes.push('rho');
  if (!(objet(r.demiVies) && fini(r.demiVies.attaque) && r.demiVies.attaque > 0 && fini(r.demiVies.defense) && r.demiVies.defense > 0)) fautes.push('demiVies');
  if (!(fini(r.prior) && r.prior >= 0)) fautes.push('prior');
  if (!['mix', 'xg', 'buts'].includes(r.statistique)) fautes.push('statistique');
  if (!(fini(r.poidsXg) && r.poidsXg >= 0 && r.poidsXg <= 1)) fautes.push('poidsXg');
  if (!['remise-a-zero', 'garder'].includes(r.changementDeChampionnat)) fautes.push('changementDeChampionnat');
  if (!(objet(r.ancrage) && r.ancrage.ligne === 2.5 && r.ancrage.methode === 'total-equilibre')) fautes.push(MOTS_DES_REGLAGES.ancrage);
  const poidsOk = (p) => objet(p) && [p.wT, p.wS].every((w) => fini(w) && w >= 0 && w <= 1);
  if (!(objet(r.melange) && poidsOk(r.melange.avecPlusMoins) && poidsOk(r.melange.sans))) fautes.push('melange');
  if (r.demarrageAFroid !== undefined && !(objet(r.demarrageAFroid) && fini(r.demarrageAFroid.matchs) && r.demarrageAFroid.matchs > 0)) fautes.push('demarrageAFroid');
  if (!(Array.isArray(r.bornes) && r.bornes.length === 2 && fini(r.bornes[0]) && fini(r.bornes[1]) && r.bornes[0] > 0 && r.bornes[0] < r.bornes[1])) fautes.push('bornes');
  if (fautes.length) throw new ReglagesDuModeleDeButsInvalides(MOTS_DES_REGLAGES.fautifs(fautes));
  return r;
}

/**
 * L'empreinte de ce qui fait les SOMMES de la table forces_buts (sa colonne `reglages`) : la version des forces,
 * les deux demi-vies, la règle du changement de championnat. `prior`, `poidsXg` et `statistique` s'appliquent à la
 * LECTURE (forcesDe) : une candidate qui ne change qu'eux réutilise les mêmes sommes.
 */
export const empreinteDesForces = (r) => `v${VERSION_DES_FORCES}|${r.demiVies.attaque}|${r.demiVies.defense}|${r.changementDeChampionnat}`;

// ------------------------------------------------------------ les faits et les forces

const vrai = (v) => v === true || v === 1;
const nombre = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
/** La saison en nombre : celle du magasin (un entier) ou l'année de début d'un libellé football-data (« 2019-20 » → 2019). */
export const saisonEnNombre = (s) => (typeof s === 'number' ? s : Number(String(s ?? '').slice(0, 4)));

/**
 * Un fait d'équipe pour les forces : une ligne de team_day (table du jour J, magasin) ou un fait de faitsDepuisFd
 * (football-data), vu du club. Rend { club, adversaire, domicile, jour, league, saison, coupe, compte, butsPour,
 * butsContre (90e minute), xgPour, xgContre (null si un côté manque ou si le match est prolongé) }, ou null pour
 * un match attribué (il n'entre nulle part). Comme la mesure, un match prolongé sans score de la 90e compte 0-0.
 */
export function faitPourLesForces(f) {
  if (!f || vrai(f.attribue)) return null;
  const prolonge = vrai(f.prolongation);
  const bp = prolonge ? nombre(f.bp90) : nombre(f.bp);
  const bc = prolonge ? nombre(f.bc90) : nombre(f.bc);
  const xp = prolonge ? null : nombre(f.xg_p);
  const xc = prolonge ? null : nombre(f.xg_c);
  const avecXg = xp !== null && xc !== null;
  return {
    club: Number(f.club),
    adversaire: Number(f.adversaire),
    domicile: f.camp !== undefined ? f.camp === 1 : vrai(f.home),
    jour: String(f.date).slice(0, 10),
    league: f.league,
    saison: saisonEnNombre(f.saison),
    coupe: vrai(f.coupe),
    compte: vrai(f.compte),
    butsPour: bp ?? 0,
    butsContre: bc ?? 0,
    xgPour: avecXg ? xp : null,
    xgContre: avecXg ? xc : null
  };
}

/**
 * Les deux faits d'une rencontre (le club qui reçoit, puis le visiteur), tirés de la ligne du camp qui REÇOIT
 * (team_day camp 1, ou le fait football-data `home`) — comme la mesure : le visiteur voit les mêmes buts et xG,
 * retournés. null pour un match attribué ; lève si la ligne n'est pas celle du camp qui reçoit.
 */
export function faitsDeLaRencontre(ligneDuCampQuiRecoit) {
  const dom = faitPourLesForces(ligneDuCampQuiRecoit);
  if (!dom) return null;
  if (!dom.domicile) throw new Error(MOTS_DES_ERREURS.pasLeCampQuiRecoit);
  const ext = { ...dom, club: dom.adversaire, adversaire: dom.club, domicile: false, butsPour: dom.butsContre, butsContre: dom.butsPour, xgPour: dom.xgContre, xgContre: dom.xgPour };
  return { dom, ext };
}

export const ETAT_VIDE = Object.freeze({ sa: 0, wa: 0, sd: 0, wd: 0, sga: 0, wga: 0, sgd: 0, wgd: 0, n: 0, nx: 0, ligue: null });

/**
 * L'état d'un club APRÈS un match (pur : l'état d'avant n'est pas modifié). `m` : { xgPour, xgContre (null sans xG
 * des deux côtés, ou match prolongé), butsPour, butsContre (90e minute), moyennes: { buts: { lieu, adverse },
 * xg: { lieu, adverse } } — celles du championnat DU MATCH avant son jour, au lieu du club et à celui de
 * l'adversaire —, championnat (null pour une coupe) }. Changement de championnat (un match de championnat dans un
 * autre que le dernier) : les huit sommes remises à zéro AVANT d'ajouter le match (« remise-a-zero ») ; n et nx
 * comptent tous les matchs. α = 2^(−1/h) par demi-vie : exactement la pondération 2^(−k/h) par rang.
 */
export function jouerUnMatch(etat, m, r) {
  const e = { ...(etat ?? ETAT_VIDE) };
  if (m.championnat && e.ligue && m.championnat !== e.ligue && r.changementDeChampionnat === 'remise-a-zero') {
    e.sa = e.wa = e.sd = e.wd = e.sga = e.wga = e.sgd = e.wgd = 0;
  }
  if (m.championnat) e.ligue = m.championnat;
  const aA = Math.pow(2, -1 / r.demiVies.attaque);
  const aD = Math.pow(2, -1 / r.demiVies.defense);
  const aXg = m.xgPour !== null && m.xgPour !== undefined && m.xgContre !== null && m.xgContre !== undefined;
  const bp = m.butsPour ?? 0;
  const bc = m.butsContre ?? 0;
  const xa = aXg ? m.xgPour / m.moyennes.xg.lieu : bp / m.moyennes.buts.lieu;
  const xd = aXg ? m.xgContre / m.moyennes.xg.adverse : bc / m.moyennes.buts.adverse;
  e.sa = e.sa * aA + xa;
  e.wa = e.wa * aA + 1;
  e.sd = e.sd * aD + xd;
  e.wd = e.wd * aD + 1;
  e.sga = e.sga * aA + bp / m.moyennes.buts.lieu;
  e.wga = e.wga * aA + 1;
  e.sgd = e.sgd * aD + bc / m.moyennes.buts.adverse;
  e.wgd = e.wgd * aD + 1;
  e.n++;
  if (aXg) e.nx++;
  return e;
}

/**
 * Le match d'un fait pour jouerUnMatch : les moyennes du championnat du match (moyennesAvant) vues du club — au
 * lieu du club et à celui de l'adversaire —, le championnat (null pour une coupe : pas de remise à zéro).
 */
export function matchPourLesForces(fait, ligue) {
  const lieu = fait.domicile ? 'home' : 'away';
  const adverse = fait.domicile ? 'away' : 'home';
  return {
    xgPour: fait.xgPour,
    xgContre: fait.xgContre,
    butsPour: fait.butsPour,
    butsContre: fait.butsContre,
    moyennes: { buts: { lieu: ligue.buts[lieu], adverse: ligue.buts[adverse] }, xg: { lieu: ligue.xg[lieu], adverse: ligue.xg[adverse] } },
    championnat: fait.coupe ? null : fait.league
  };
}

/** Les forces d'un club lues dans son état (k0 matchs fictifs vers 1 ; mélange xG/buts en log) ; sans état : 1 et 1. */
export function forcesDe(etat, r) {
  if (!etat || !etat.n) return { attaque: 1, defense: 1, matchs: 0, matchsXg: 0 };
  const k0 = r.prior;
  const att = (etat.sa + k0) / (etat.wa + k0);
  const def = (etat.sd + k0) / (etat.wd + k0);
  if (r.statistique === 'xg') return { attaque: att, defense: def, matchs: etat.n, matchsXg: etat.nx };
  const gatt = (etat.sga + k0) / (etat.wga + k0);
  const gdef = (etat.sgd + k0) / (etat.wgd + k0);
  if (r.statistique === 'buts') return { attaque: gatt, defense: gdef, matchs: etat.n, matchsXg: etat.nx };
  const w = r.poidsXg;
  return { attaque: Math.exp(w * Math.log(att) + (1 - w) * Math.log(gatt)), defense: Math.exp(w * Math.log(def) + (1 - w) * Math.log(gdef)), matchs: etat.n, matchsXg: etat.nx };
}

// ------------------------------------------------------------ les moyennes du championnat à la 90e

/**
 * La journée d'un championnat pour ses moyennes (une ligne de forces_buts_ligues) : les matchs qui comptent au
 * classement, ni attribués ; buts de la 90e minute ; xG seulement d'un match non prolongé avec les deux xG.
 */
export function ajouterALaJournee(j, fait) {
  j.n += 1;
  j.bd += fait.butsPour;
  j.be += fait.butsContre;
  if (fait.xgPour !== null && fait.xgContre !== null) {
    j.nx += 1;
    j.xd += fait.xgPour;
    j.xe += fait.xgContre;
  }
  return j;
}

/** Le premier jour des 365 avant J (bornes comprises : un jour d ≥ ce jour compte). */
export function debutDes365Jours(jour) {
  const t = new Date(`${jour}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - SEUILS_LIGUE.jours);
  return t.toISOString().slice(0, 10);
}

/**
 * Les moyennes d'un championnat AVANT le jour J, à la 90e minute, depuis ses sommes QUOTIDIENNES `jours`
 * ([{ jour, saison, n, bd, be, nx, xd, xe }], dans l'ordre des jours ; celles de J et d'après sont ignorées) : la
 * saison de J si ≥ 30 matchs, sinon les 365 jours si ≥ 10, sinon 1,45 / 1,15 ; xG si ≥ 20 matchs relevés, sinon
 * les buts. Jamais nulle. Les sommes se font dans l'ordre des jours : le direct, la nuit et le banc donnent le
 * même nombre à l'octet.
 */
export function moyennesAvant(jours, { jour, saison }) {
  const somme = (garder) => {
    const s = { n: 0, bd: 0, be: 0, nx: 0, xd: 0, xe: 0 };
    for (const d of jours ?? []) {
      if (!(d.jour < jour) || !garder(d)) continue;
      s.n += d.n;
      s.bd += d.bd;
      s.be += d.be;
      s.nx += d.nx;
      s.xd += d.xd;
      s.xe += d.xe;
    }
    return s;
  };
  let s = somme((d) => d.saison === saison);
  let source = 'saison';
  if (s.n < SEUILS_LIGUE.saison) {
    const debut = debutDes365Jours(jour);
    s = somme((d) => d.jour >= debut);
    source = '365 jours';
  }
  if (s.n < SEUILS_LIGUE.an) return { buts: { ...DEFAUT_LIGUE }, xg: { ...DEFAUT_LIGUE }, matchs: s.n, matchsXg: 0, source: 'défaut' };
  const buts = { home: s.bd / s.n, away: s.be / s.n };
  return { buts, xg: s.nx >= SEUILS_LIGUE.xg ? { home: s.xd / s.nx, away: s.xe / s.nx } : { ...buts }, matchs: s.n, matchsXg: s.nx, source };
}

// ------------------------------------------------------------ la grille et ses marchés

/**
 * LA GRILLE DE CALCUL 0-20 × 0-20 (indice home × 21 + away), Dixon-Coles (τ de l'appli, borné à 0,01), renormalisée
 * (somme 1 : seule la masse au-delà de 20 buts est retirée ; τ conserve la masse).
 */
export function grilleDesButs(lambda, mu, rho) {
  const px = new Float64Array(TAILLE);
  const py = new Float64Array(TAILLE);
  for (let k = 0; k <= N_CALCUL; k++) {
    px[k] = poissonProbability(k, lambda);
    py[k] = poissonProbability(k, mu);
  }
  const g = new Float64Array(TAILLE * TAILLE);
  let total = 0;
  for (let i = 0; i <= N_CALCUL; i++) {
    for (let j = 0; j <= N_CALCUL; j++) {
      let tau = 1;
      if (i === 0 && j === 0) tau = Math.max(0.01, 1 - lambda * mu * rho);
      else if (i === 1 && j === 0) tau = Math.max(0.01, 1 + mu * rho);
      else if (i === 0 && j === 1) tau = Math.max(0.01, 1 + lambda * rho);
      else if (i === 1 && j === 1) tau = Math.max(0.01, 1 - rho);
      const p = Math.max(0, px[i] * py[j] * tau);
      g[i * TAILLE + j] = p;
      total += p;
    }
  }
  for (let k = 0; k < g.length; k++) g[k] /= total;
  return g;
}

/**
 * Les marchés d'une grille de calcul, à la forme de computeScoreMatrix (sports/football/scoreMatrix.js) : 1N2,
 * plus/moins 0,5 … 3,5, buts de chaque équipe, les deux marquent, résultat + total (6 issues par ligne). Tout
 * vient des MÊMES cases.
 */
export function marchesDeLaGrille(g) {
  let home = 0;
  let draw = 0;
  let away = 0;
  let btts = 0;
  const over = [0, 0, 0, 0];
  const dom = [0, 0, 0, 0];
  const ext = [0, 0, 0, 0];
  const rt = LIGNES_DE_BUTS.map(() => ({ homeOver: 0, homeUnder: 0, drawOver: 0, drawUnder: 0, awayOver: 0, awayUnder: 0 }));
  for (let i = 0; i <= N_CALCUL; i++) {
    for (let j = 0; j <= N_CALCUL; j++) {
      const p = g[i * TAILLE + j];
      if (p === 0) continue;
      const r = i > j ? 'home' : i === j ? 'draw' : 'away';
      if (r === 'home') home += p;
      else if (r === 'draw') draw += p;
      else away += p;
      if (i > 0 && j > 0) btts += p;
      for (let k = 0; k < 4; k++) {
        const L = LIGNES_DE_BUTS[k];
        const o = i + j > L;
        if (o) over[k] += p;
        rt[k][o ? `${r}Over` : `${r}Under`] += p;
        if (i > L) dom[k] += p;
        if (j > L) ext[k] += p;
      }
    }
  }
  const equipe = (b) => ({
    over05: b[0],
    over15: b[1],
    over25: b[2],
    over35: b[3],
    under05: 1 - b[0],
    under15: 1 - b[1],
    under25: 1 - b[2],
    under35: 1 - b[3]
  });
  return {
    home,
    draw,
    away,
    over05: over[0],
    over15: over[1],
    over25: over[2],
    over35: over[3],
    homeTeamGoals: equipe(dom),
    awayTeamGoals: equipe(ext),
    bothTeamsScore: btts,
    resultAndTotal: { 0.5: rt[0], 1.5: rt[1], 2.5: rt[2], 3.5: rt[3] }
  };
}

/** Les 81 cases RENDUES (0..8, indice home × 9 + away), telles quelles (jamais renormalisées), et « autre score ». */
export function casesRendues(g) {
  const cases = [];
  let somme = 0;
  for (let i = 0; i <= BUTS_RENDUS; i++) {
    for (let j = 0; j <= BUTS_RENDUS; j++) {
      const p = g[i * TAILLE + j];
      cases.push({ home: i, away: j, p });
      somme += p;
    }
  }
  return { cases, horsGrille: Math.max(0, 1 - somme) };
}

// ------------------------------------------------------------ l'ancrage sur le marché

/** H, A et P(total > ligne) de la grille de calcul. */
function hao(lambda, mu, rho, ligne) {
  const g = grilleDesButs(lambda, mu, rho);
  let H = 0;
  let A = 0;
  let O = 0;
  for (let i = 0; i <= N_CALCUL; i++) {
    for (let j = 0; j <= N_CALCUL; j++) {
      const p = g[i * TAILLE + j];
      if (i > j) H += p;
      else if (i < j) A += p;
      if (i + j > ligne) O += p;
    }
  }
  return [H, A, O];
}

/** Gauss-Newton sur (ln λ, ln μ), jacobien numérique, bornes [0,05 ; 6], 60 tours, recherche linéaire de 20 pas. */
function resoudre(residu, depart) {
  const bas = Math.log(0.05);
  const haut = Math.log(6);
  const norme = (r) => r[0] * r[0] + r[1] * r[1];
  let u = Math.min(haut, Math.max(bas, Math.log(depart.lambda)));
  let v = Math.min(haut, Math.max(bas, Math.log(depart.mu)));
  for (let it = 0; it < 60; it++) {
    const r0 = residu(u, v);
    const e = 1e-5;
    const ru = residu(u + e, v);
    const rv = residu(u, v + e);
    const J = [[(ru[0] - r0[0]) / e, (rv[0] - r0[0]) / e], [(ru[1] - r0[1]) / e, (rv[1] - r0[1]) / e]];
    const det = J[0][0] * J[1][1] - J[0][1] * J[1][0] || 1e-12;
    const du = (-r0[0] * J[1][1] + r0[1] * J[0][1]) / det;
    const dv = (-r0[1] * J[0][0] + r0[0] * J[1][0]) / det;
    const n0 = norme(r0);
    if (n0 === 0) break;
    let pas = 1;
    for (let k = 0; k < 20; k++) {
      const nu = Math.min(haut, Math.max(bas, u + pas * du));
      const nv = Math.min(haut, Math.max(bas, v + pas * dv));
      if (norme(residu(nu, nv)) < n0 || k === 19) {
        u = nu;
        v = nv;
        break;
      }
      pas /= 2;
    }
    if (Math.abs(du) + Math.abs(dv) < 1e-12) break;
  }
  return { lambda: Math.exp(u), mu: Math.exp(v), norme: norme(residu(u, v)) };
}

/** Résolu : résidu sous 1e-12 (sa norme au carré sous 1e-24). */
const RESOLU = 1e-24;
/** Les départs de secours, quand celui de tauxDuMarche reste collé à une borne (cotes extrêmes : 1,03 contre 41). */
const DEPARTS_DE_SECOURS = Object.freeze([
  Object.freeze({ lambda: 1.3, mu: 1.3 }),
  Object.freeze({ lambda: 1.4, mu: 1.1 }),
  Object.freeze({ lambda: 1.1, mu: 1.4 })
]);

/**
 * Le Gauss-Newton depuis `depart`, puis — seulement s'il n'a pas résolu (une borne l'a arrêté loin de la solution,
 * cas des très gros favoris) — depuis les départs de secours ; la solution au plus petit résidu. Un départ qui
 * résout donne exactement le même résultat qu'avant : les secours ne servent qu'aux cas bloqués.
 */
function resoudreSurPlusieursDeparts(residu, depart) {
  let meilleur = resoudre(residu, depart);
  for (const d of DEPARTS_DE_SECOURS) {
    if (meilleur.norme <= RESOLU) break;
    const x = resoudre(residu, d);
    if (x.norme < meilleur.norme) meilleur = x;
  }
  return { lambda: meilleur.lambda, mu: meilleur.mu };
}

/**
 * Les buts attendus du MARCHÉ, sur la grille de calcul. `fair` [pH, pN, pA] (la référence du 1N2 du moteur) ;
 * `plusMoins` { ligne, pOver } ou null.
 *   - avec un plus/moins : (λ, μ) tels que P(total > ligne) = pOver et H/(H+A) = pH/(pH+pA) — « le total par le
 *     plus/moins, l'équilibre par le 1N2 » (le nul n'est pas imposé) ;
 *   - sans : (λ, μ) tels que H = pH et A = pA — l'inversion du 1N2 de tauxDuMarche (scorePrediction.js), refaite
 *     sur la grille de calcul (le nul fixe alors le total).
 * Départ : tauxDuMarche (grille 0-8), inchangé ; s'il reste bloqué à une borne, des départs de secours.
 */
export function ancrerSurLeMarche({ fair, plusMoins, rho }) {
  const depart = tauxDuMarche(fair[0], fair[2], rho);
  if (!plusMoins) {
    const x = resoudreSurPlusieursDeparts((a, b) => {
      const [H, A] = hao(Math.exp(a), Math.exp(b), rho, 2.5);
      return [H - fair[0], A - fair[2]];
    }, depart);
    return { ...x, methode: '1N2-seul' };
  }
  const cible = fair[0] / (fair[0] + fair[2]);
  const x = resoudreSurPlusieursDeparts((a, b) => {
    const [H, A, O] = hao(Math.exp(a), Math.exp(b), rho, plusMoins.ligne);
    return [O - plusMoins.pOver, H / (H + A) - cible];
  }, depart);
  return { ...x, methode: 'total-equilibre' };
}

/** Le mélange en log : total (demi-somme) et écart (demi-différence) pondérés à part. */
export function melanger(m, s, { wT, wS }) {
  const T = (1 - wT) * (Math.log(m.lambda) + Math.log(m.mu)) / 2 + wT * (Math.log(s.lambda) + Math.log(s.mu)) / 2;
  const S = (1 - wS) * (Math.log(m.lambda) - Math.log(m.mu)) / 2 + wS * (Math.log(s.lambda) - Math.log(s.mu)) / 2;
  return { lambda: Math.exp(T + S), mu: Math.exp(T - S) };
}

/**
 * LE DÉMARRAGE À FROID (E6, retenu par la mesure m7) : le TOTAL statistique rapproché de celui du championnat tant
 * que le club le moins connu a moins de `n0` matchs comptés — f = min(1, nMin/n0) ;
 *   T' = (1−f)·(ln L.home + ln L.away)/2 + f·(ln λS + ln μS)/2 ; l'écart S n'est jamais touché.
 * `stats` { lambda, mu } ; `ligue` les moyennes du championnat (buts).
 */
export function attenuerLeTotal(stats, ligue, nMin, n0) {
  const f = Math.min(1, Math.max(0, nMin) / n0);
  // Assez de matchs : les statistiques telles quelles, à l'octet (pas d'aller-retour par le logarithme).
  if (f >= 1) return { lambda: stats.lambda, mu: stats.mu, f: 1 };
  const TL = (Math.log(ligue.buts.home) + Math.log(ligue.buts.away)) / 2;
  const TS = (Math.log(stats.lambda) + Math.log(stats.mu)) / 2;
  const S = (Math.log(stats.lambda) - Math.log(stats.mu)) / 2;
  const T = (1 - f) * TL + f * TS;
  return { lambda: Math.exp(T + S), mu: Math.exp(T - S), f };
}

// ------------------------------------------------------------ le plus/moins 2,5 relevé (direct et banc)

/** Les sources et livres qui peuvent caler le total, dans l'ordre mesuré (m4) : la moyenne football-data, sinon ESPN. */
export const SOURCE_FD_PLUS_MOINS = Object.freeze({ source: 'football-data.co.uk', bookmaker: 'Moyenne du marché' });
export const SOURCE_ESPN_PLUS_MOINS = 'espn';
const RANG_DU_RELEVE = Object.freeze({ open: 0, preclose: 1, snapshot: 2, close: 3 });

/** Un relevé est-il admis à la coupure ? open/preclose toujours ; snapshot/close relevés au plus tard à la coupure ; live jamais. */
export function releveAdmis(kind, releveAt, coupure) {
  if (kind === 'open' || kind === 'preclose') return true;
  if (kind !== 'snapshot' && kind !== 'close') return false;
  const t = typeof releveAt === 'string' ? Date.parse(releveAt) : Number.NaN;
  const c = Date.parse(coupure?.instant ?? '');
  if (!Number.isFinite(t) || !Number.isFinite(c)) return false;
  return coupure.heureSure ? t <= c : t < c;
}

/**
 * Les LIVRES du plus/moins 2,5 d'un match, tels qu'ils étaient à la coupure : `cotes` = relevés { source,
 * bookmaker, selection ('over' | 'under'), line, kind, releveAt, price } (marché 'ou') ; seules la moyenne
 * football-data et les livres ESPN comptent (Smarkets, cotes payantes et saisies jamais : non mesurés). Par livre
 * et par sélection, le DERNIER relevé admis (par heure, puis open < preclose < snapshot < close). Rend
 * [{ source, bookmaker, over, under, releveAt }] (livres complets seulement).
 */
export function livresDuPlusMoins(cotes, coupure) {
  const parLivre = new Map();
  for (const q of cotes ?? []) {
    if (Number(q.line) !== 2.5 || !(Number(q.price) > 1)) continue;
    const fd = q.source === SOURCE_FD_PLUS_MOINS.source && q.bookmaker === SOURCE_FD_PLUS_MOINS.bookmaker;
    if (!fd && q.source !== SOURCE_ESPN_PLUS_MOINS) continue;
    if (q.selection !== 'over' && q.selection !== 'under') continue;
    if (!releveAdmis(q.kind, q.releveAt, coupure)) continue;
    const cle = `${q.source}|${q.bookmaker}`;
    const livre = parLivre.get(cle) ?? { source: q.source, bookmaker: q.bookmaker, selections: {} };
    const t = Date.parse(q.releveAt ?? '');
    const temps = Number.isFinite(t) ? t : -Infinity;
    const rang = RANG_DU_RELEVE[q.kind];
    const actuel = livre.selections[q.selection];
    if (!actuel || temps > actuel.temps || (temps === actuel.temps && rang > actuel.rang)) livre.selections[q.selection] = { temps, rang, price: Number(q.price), releveAt: q.releveAt ?? null };
    parLivre.set(cle, livre);
  }
  const livres = [];
  for (const l of parLivre.values()) {
    const o = l.selections.over;
    const u = l.selections.under;
    if (!o || !u) continue;
    livres.push({ source: l.source, bookmaker: l.bookmaker, over: o.price, under: u.price, releveAt: [o.releveAt, u.releveAt].filter(Boolean).sort().at(-1) ?? null });
  }
  return livres.sort((a, b) => (`${a.source}|${a.bookmaker}` < `${b.source}|${b.bookmaker}` ? -1 : 1));
}

/**
 * L'ANCRE du total : la probabilité juste de « plus de 2,5 buts » (marge retirée par la méthode puissance à deux
 * issues) — la moyenne football-data quand elle existe et qu'elle est cohérente, sinon la moyenne des cotes des
 * livres ESPN admis. Rend { ligne: 2.5, pOver, source, releveAt } ou null (aucun livre, marge incohérente).
 */
export function ancrageDuPlusMoins(livres) {
  const essayer = (over, under, source, releveAt) => {
    const r = removeMargin([over, under]);
    return r.anomaly ? null : { ligne: 2.5, pOver: r.probabilities[0], source, releveAt: releveAt ?? null };
  };
  const fd = (livres ?? []).find((l) => l.source === SOURCE_FD_PLUS_MOINS.source && l.bookmaker === SOURCE_FD_PLUS_MOINS.bookmaker);
  if (fd) {
    const a = essayer(fd.over, fd.under, NOMS_DES_SOURCES_DU_PLUS_MOINS.footballData, fd.releveAt);
    if (a) return a;
  }
  const espn = (livres ?? []).filter((l) => l.source === SOURCE_ESPN_PLUS_MOINS);
  if (!espn.length) return null;
  const over = espn.reduce((s, l) => s + l.over, 0) / espn.length;
  const under = espn.reduce((s, l) => s + l.under, 0) / espn.length;
  return essayer(over, under, NOMS_DES_SOURCES_DU_PLUS_MOINS.espn(espn.length), espn.map((l) => l.releveAt).filter(Boolean).sort().at(-1));
}

// ------------------------------------------------------------ la provenance (ce que voit Pierre)

/**
 * Les régimes (leurs CODES : cotes-plusmoins-xg, cotes-1n2-buts, xg-seuls…) : leur mot court et leur phrase vivent dans
 * motsDuModeleDeButs.js, hors de l'empreinte — ré-exportés ici pour les lecteurs d'avant.
 */
export { PROVENANCES };

/** Le régime d'un match : « xG » quand les deux clubs ont un xG sur au moins la moitié de leurs matchs comptés. */
export function provenanceDe({ avecCotes, plusMoins, fH, fA }) {
  const connues = fH.matchs > 0 || fA.matchs > 0;
  const xg = fH.matchs > 0 && fA.matchs > 0 && fH.matchsXg * 2 >= fH.matchs && fA.matchsXg * 2 >= fA.matchs;
  const stat = xg ? 'xg' : 'buts';
  const code = avecCotes ? `cotes-${plusMoins ? 'plusmoins' : '1n2'}-${stat}` : connues ? `${stat}-seuls` : 'moyennes-seules';
  return { code, ...PROVENANCES[code] };
}

// ------------------------------------------------------------ le modèle

const LIGUE_PAR_DEFAUT = Object.freeze({ buts: DEFAUT_LIGUE, xg: DEFAUT_LIGUE, matchs: 0, matchsXg: 0, source: 'défaut' });

/**
 * LE MODÈLE. `fair` [pH, pN, pA] (la référence du 1N2 du moteur) ou null (aucune cote) ; `entrees` { forces:
 * { home, away } (états ou null), ligue (moyennesAvant), plusMoins ({ ligne, pOver, source, releveAt } ou null) } ;
 * `reglages` (reglagesDuModeleDeButs). Rend { lambda, mu, rho, avecCotes, provenance: { code, court, phrase },
 * parties: { marche, statistiques, poids, plusMoins }, grille (Float64Array de 441), cases (81 { home, away, p },
 * jamais renormalisées), horsGrille, probabilites (forme de computeScoreMatrix) }.
 */
export function modeleDeButs({ fair, entrees, reglages: r }) {
  const ligue = entrees?.ligue ?? LIGUE_PAR_DEFAUT;
  const fH = forcesDe(entrees?.forces?.home ?? null, r);
  const fA = forcesDe(entrees?.forces?.away ?? null, r);
  const brutes = { lambda: ligue.buts.home * fH.attaque * fA.defense, mu: ligue.buts.away * fA.attaque * fH.defense };
  let stats = brutes;
  let demarrage = null;
  if (r.demarrageAFroid) {
    const nMin = Math.min(fH.matchs, fA.matchs);
    const a = attenuerLeTotal(brutes, ligue, nMin, r.demarrageAFroid.matchs);
    stats = { lambda: a.lambda, mu: a.mu };
    demarrage = { nMin, f: a.f };
  }
  const avecCotes = Array.isArray(fair) && fair.length === 3 && fair.every((p) => fini(p) && p > 0);
  const pm = entrees?.plusMoins ?? null;
  const plusMoins = avecCotes && pm && fini(pm.pOver) && pm.pOver > 0 && pm.pOver < 1 && pm.ligne === 2.5 ? pm : null;
  let marche = null;
  let poids = null;
  let lm;
  if (avecCotes) {
    marche = ancrerSurLeMarche({ fair, plusMoins, rho: r.rho });
    poids = plusMoins ? r.melange.avecPlusMoins : r.melange.sans;
    lm = melanger(marche, stats, poids);
  } else {
    lm = stats;
  }
  const borne = (x) => Math.min(r.bornes[1], Math.max(r.bornes[0], x));
  const lambda = borne(lm.lambda);
  const mu = borne(lm.mu);
  const grille = grilleDesButs(lambda, mu, r.rho);
  const { cases, horsGrille } = casesRendues(grille);
  return {
    lambda,
    mu,
    rho: r.rho,
    avecCotes,
    provenance: provenanceDe({ avecCotes, plusMoins, fH, fA }),
    parties: {
      marche: marche ? { lambda: marche.lambda, mu: marche.mu, methode: marche.methode } : null,
      statistiques: {
        lambda: stats.lambda,
        mu: stats.mu,
        brutes,
        demarrage,
        forces: { home: fH, away: fA },
        ligue: { buts: { ...ligue.buts }, xg: { ...ligue.xg }, matchs: ligue.matchs ?? null, source: ligue.source ?? null }
      },
      poids,
      plusMoins: plusMoins ? { ligne: plusMoins.ligne, pOver: plusMoins.pOver, source: plusMoins.source ?? null, releveAt: plusMoins.releveAt ?? null } : null
    },
    grille,
    cases,
    horsGrille,
    probabilites: marchesDeLaGrille(grille)
  };
}
