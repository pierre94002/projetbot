/**
 * bancDeLaCombinaison.js — LE BANC À UN SEUL REGARD DE L'ÉTAPE 38 (lot 1a, 03-04/11/2026 ; conception §4), PUR.
 * -----------------------------------------------------------------------
 * Les 38 variantes déclarées AVANT le regard (VARIANTES_DE_L_ETAPE_38, lancements.js : K = 38, z 3,2125), chacune avec SA
 * fenêtre, SON juge et SON rôle, écrits ici et dans les règles scellées :
 *   - COMBINAISON (perte log, J1 décide ; la clôture, J2, qualifie — elle peut retirer un « retenu », jamais en donner
 *     un ; blocs = match ; graine 38) : E1 (β d'un signal face au marché, appris sur P1 avec l'a priori σ0 = 0,25, jugé
 *     sur P2), E2 (le recalage du marché, appris sur les deux saisons d'avant P2, rapporté saison par saison : « retenu »
 *     seulement si le signe tient chaque saison, T-B18), par championnat (rétréci ; bras A = le commun appris sur P1) ;
 *   - CONFIANCE (bras A = le recalage COMMUN par dixièmes, bras B = le recalage par classe, jamais Cox ; cible = la
 *     clôture ; appris sur P1 ≥ 2012 pour juger P2 ; sur P5-a : DANS chaque origine, l'origine dans les deux bras, deux
 *     plis ; un verdict par origine, jamais réuni ; classe minoritaire ≥ 300 lignes, sinon « non jugeable ici ») ;
 *   - SEUIL (valeur de clôture par décision, une par match, 0 sans pari ; sens max ; blocs = jour|championnat ; graine 1 ;
 *     P1 ≥ 2012 ∪ P2, P2 rapportée seule ; l'utilité sur la variante seule ; la règle des emboîtées) ;
 *   - P5-b (après le lancement) : « non jugeable ici » au lot 1a.
 * L'ÉTALONNAGE passe AVANT la première variante (T-B12) : un écart arrête tout. Les tailles se décident AVANT toute perte
 * (T-B16). Aucune utilité « sur la base » (T-B13), aucune sortie « meilleur seuil » (T-B8).
 * Pur : ni horloge, ni hasard, ni base, ni fichier — les lignes viennent de bancFd.js et lecteurP5.js (l'enfant).
 * -----------------------------------------------------------------------
 */

import { comparer, zPour } from '../../bench/guard.js';
import { VARIANTES_DE_L_ETAPE_38 } from '../../bench/lancements.js';
import {
  melangerEnLogCotes, apprendreLesBetas, apprendreLeRecalageDuMarche, recalerLeMarche3, recalerParCox, logitConditionnel, lignesE1,
  tableDesDixiemes, recalerParDixiemes, apprendreCox, retrecirParChampionnat, entropieCroisee, perteLogDe, pointsDEcart, fnv1a
} from './formulesDeLaCombinaison.js';
import { JUGE, A_PRIORI, AMPLEUR, PERIODES_DU_BANC, SAISONS_DE_P2, ETALONNAGE, PLACEBOS, VERSION_DE_LA_REGLE, SEUIL_EN_SERVICE, REGLES_DE_SEUIL, LIMITES_DU_LOT_1A } from './reglagesCombinaison.js';
import { seuilDe, choisirParmiLesEmboitees } from './reglesDeSeuil.js';
import { degresDUneLigne, etiquetteDe, degreDeA, degreDeD } from './reglesDeConfiance.js';

/** La forme de la sortie du banc (et de la note recopiée). */
export const VERSION_DU_BANC = 1;

/** Les définitions retenues : elles ne lisent aucun résultat (comptées dans K par prudence). */
export const DEFINITIONS = Object.freeze(['combinaison-v1', 'seuil-v1']);

/**
 * LES FORMES : pour chaque variante, l'angle, la fenêtre, le juge et si c'est un placebo. `p5b` : jugée après le lancement
 * seulement (lot 1c) ; `p5a` : sur la fenêtre P5-a, par origine (au lot 1a).
 */
export const FORMES = Object.freeze({
  'combinaison-v1': { angle: 'combinaison', fenetre: 'definition' },
  '1n2-recalage-marche': { angle: 'combinaison', fenetre: 'P2', juge: 'perte-log', e2: '1n2' },
  '1n2-stats-residuel': { angle: 'combinaison', fenetre: 'P2', juge: 'perte-log', signal: 'pS' },
  '1n2-placebo': { angle: 'combinaison', fenetre: 'P2', juge: 'perte-log', signal: 'pSautre', placebo: true },
  'horloge-j2': { angle: 'combinaison', fenetre: 'P2', juge: 'perte-log', signal: 'pSj2' },
  'plusmoins25-recalage-marche': { angle: 'combinaison', fenetre: 'P2', juge: 'perte-log', e2: '25' },
  'poids-par-regime': { angle: 'combinaison', fenetre: 'P2', juge: 'perte-log', signal: 'pS', parRegime: true },
  'poids-par-championnat': { angle: 'combinaison', fenetre: 'P2', juge: 'perte-log', signal: 'pS', parLigue: 'vraie' },
  'faux-championnat': { angle: 'combinaison', fenetre: 'P2', juge: 'perte-log', signal: 'pS', parLigue: 'fausse', placebo: true },
  'repos-court-residuel': { angle: 'combinaison', fenetre: 'P5b' },
  'enchainement-residuel': { angle: 'combinaison', fenetre: 'P5b' },
  'contexte-placebo': { angle: 'combinaison', fenetre: 'P5b', placebo: true },
  'recalage-dixiemes': { angle: 'combinaison', fenetre: 'P5b' },
  'confiance-v1': { angle: 'confiance', fenetre: 'P5a', classe: 'etiquette' },
  'classe-regime': { angle: 'confiance', fenetre: 'P2+P5a', classe: 'regime' },
  'classe-compo': { angle: 'confiance', fenetre: 'P5a', classe: 'compo' },
  'classe-couverture': { angle: 'confiance', fenetre: 'P2', classe: 'couverture' },
  'classe-a-verifier': { angle: 'confiance', fenetre: 'P5b' },
  'classe-accord': { angle: 'confiance', fenetre: 'P2+P5a', classe: 'accord' },
  'confiance-placebo': { angle: 'confiance', fenetre: 'P2', classe: 'placebo', placebo: true },
  'faux-ingredient': { angle: 'confiance', fenetre: 'P2', classe: 'faux-ingredient', placebo: true },
  'seuil-v1': { angle: 'seuil', fenetre: 'definition' },
  'pinnacle-1pc': { angle: 'seuil', fenetre: 'P1pinnacle+P2', emboitee: 'pinnacle' },
  'pinnacle-1-5pc': { angle: 'seuil', fenetre: 'P1pinnacle+P2', emboitee: 'pinnacle' },
  'pinnacle-3pc': { angle: 'seuil', fenetre: 'P1pinnacle+P2', emboitee: 'pinnacle' },
  'pinnacle-5pc': { angle: 'seuil', fenetre: 'P1pinnacle+P2', emboitee: 'pinnacle' },
  'accord-disperse-4pc': { angle: 'seuil', fenetre: 'P1pinnacle+P2', emboitee: 'disperse' },
  'accord-disperse-aucune': { angle: 'seuil', fenetre: 'P1pinnacle+P2', emboitee: 'disperse' },
  'cote-haute-3pc': { angle: 'seuil', fenetre: 'P1pinnacle+P2' },
  'placebo-classe': { angle: 'seuil', fenetre: 'P1pinnacle+P2', placebo: true },
  'palier2-3pc': { angle: 'seuil', fenetre: 'P5b' },
  'palier3-5pc': { angle: 'seuil', fenetre: 'P5b' },
  'palier3-aucune': { angle: 'seuil', fenetre: 'P5b' },
  'a-verifier-aucune': { angle: 'seuil', fenetre: 'P5b' },
  'francais-aucune': { angle: 'seuil', fenetre: 'P5b' },
  'compo-avant-cote': { angle: 'combinaison', fenetre: 'P5b' },
  'ancre-gratuite': { angle: 'combinaison', fenetre: 'P5b' },
  'saisies-ancre': { angle: 'combinaison', fenetre: 'P5b' }
});

/** Les six placebos (fini quand (b) : tous « pas prouvé »). */
export const PLACEBOS_DU_BANC = Object.freeze(Object.entries(FORMES).filter(([, f]) => f.placebo).map(([id]) => id));

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const moyenne = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const arrondi = (x, d) => (fini(x) ? Number(x.toFixed(d)) : x ?? null);
const normaliser = (p) => {
  const t = p.reduce((s, x) => s + x, 0);
  return p.map((x) => x / t);
};
const dans = (date, f) => date >= f.de && date <= f.a;
const saisonDe = (date) => {
  const an = Number(date.slice(0, 4));
  const debut = date.slice(5) >= '07-01' ? an : an - 1;
  return `${debut}-${String((debut + 1) % 100).padStart(2, '0')}`;
};

/** Le juge de l'étape (comparer) avec K et la graine de l'angle ; rend le résultat de comparer, enrichi du z observé. */
export function juger(lignes, { sens, graine, K = JUGE.K, tirages = JUGE.tirages, minBlocs = JUGE.minBlocs } = {}) {
  const r = comparer(lignes, { mode: 'moyenne', sens, tirages, graine, variantes: K, minBlocs });
  return { ...r, zObserve: fini(r.gain) && fini(r.ecartType) && r.ecartType > 0 ? r.gain / r.ecartType : null };
}

/** Un verdict « non jugeable ici » (une taille décidée AVANT toute perte, T-B16), avec sa raison. */
const nonJugeable = (id, raison, extra = {}) => ({ id, ...FORMES[id], verdict: 'non-jugeable-ici', raisons: [raison], ...extra });

// =============================================================================================== l'étalonnage (T-B12)

/**
 * L'ÉTALONNAGE sur P2, AVANT toute variante : décisions, paris et refus de la règle à 2 % ; valeur de clôture moyenne des
 * paris ; perte log du marché du 2,5 et du 1N2 du moteur. Rend { ok, ecarts, mesure }.
 */
export function etalonner(lignesFd, { attendu = ETALONNAGE.P2 } = {}) {
  const p2 = lignesFd.filter((l) => l.fenetre === 'P2');
  const refus = {};
  let paris = 0;
  const vcs = [];
  for (const l of p2) {
    const d = l.dec[0.02];
    if (d) {
      paris++;
      if (l.q) vcs.push(d.c * l.q[d.o] - 1);
    } else refus[l.refusA] = (refus[l.refusA] ?? 0) + 1;
  }
  const pl25 = p2.filter((l) => l.pM25 && l.y25 !== null && l.y25 !== undefined).map((l) => perteLogDe(l.pM25[l.y25]));
  const pl1n2 = p2.filter((l) => l.y !== null && l.y !== undefined).map((l) => perteLogDe(l.pM[l.y]));
  const mesure = {
    decisions: p2.length,
    paris,
    refus,
    vcN: vcs.length,
    vcMoyenne: moyenne(vcs),
    n25: pl25.length,
    perteLog25: moyenne(pl25),
    n1n2: pl1n2.length,
    perteLog1n2: moyenne(pl1n2)
  };
  const ecarts = [];
  if (mesure.decisions !== attendu.decisions) ecarts.push(`décisions ${mesure.decisions} ≠ ${attendu.decisions}`);
  if (mesure.paris !== attendu.paris) ecarts.push(`paris ${mesure.paris} ≠ ${attendu.paris}`);
  for (const [k, v] of Object.entries(attendu.refus)) if ((mesure.refus[k] ?? 0) !== v) ecarts.push(`refus « ${k} » ${mesure.refus[k] ?? 0} ≠ ${v}`);
  for (const k of Object.keys(mesure.refus)) if (!(k in attendu.refus)) ecarts.push(`refus « ${k} » ${mesure.refus[k]} inattendu`);
  if (fini(attendu.vcMoyenne) && arrondi(mesure.vcMoyenne, attendu.vcDecimales) !== attendu.vcMoyenne) ecarts.push(`valeur de clôture moyenne ${mesure.vcMoyenne} ≠ ${attendu.vcMoyenne}`);
  if (fini(attendu.perteLog25) && arrondi(mesure.perteLog25, attendu.perteLog25Decimales) !== attendu.perteLog25) ecarts.push(`perte log du 2,5 ${mesure.perteLog25} ≠ ${attendu.perteLog25}`);
  if (fini(attendu.n25) && mesure.n25 !== attendu.n25) ecarts.push(`matchs du 2,5 ${mesure.n25} ≠ ${attendu.n25}`);
  if (fini(attendu.perteLog1n2) && arrondi(mesure.perteLog1n2, attendu.perteLog1n2Decimales) !== attendu.perteLog1n2) ecarts.push(`perte log du 1N2 ${mesure.perteLog1n2} ≠ ${attendu.perteLog1n2}`);
  return { ok: ecarts.length === 0, ecarts, mesure };
}

/** L'étalonnage SANS résultat (`--comptes`) : décisions, paris et refus seulement. */
export function etalonnerSansResultat(lignesFd, { attendu = ETALONNAGE.P2 } = {}) {
  const r = etalonner(lignesFd.map((l) => ({ fenetre: l.fenetre, dec: l.dec, refusA: l.refusA })), { attendu: { decisions: attendu.decisions, paris: attendu.paris, refus: attendu.refus } });
  return { ok: r.ok, ecarts: r.ecarts, mesure: { decisions: r.mesure.decisions, paris: r.mesure.paris, refus: r.mesure.refus } };
}

// =============================================================================================== la combinaison (E1, E2)

/** Le signal du placebo : la partie statistique d'un AUTRE match du même jour (FNV-1a de la clé), null s'il est seul. */
export function signalPlacebo(lignes) {
  const parJour = new Map();
  for (const l of lignes) {
    if (!l.pS) continue;
    let j = parJour.get(l.date);
    if (!j) parJour.set(l.date, (j = []));
    j.push(l);
  }
  const out = new Map();
  for (const j of parJour.values()) {
    if (j.length < 2) continue;
    for (let i = 0; i < j.length; i++) {
      const k = fnv1a(`1n2-placebo|${j[i].cle}`) % (j.length - 1);
      out.set(j[i].cle, j[k >= i ? k + 1 : k].pS);
    }
  }
  return out;
}

/** Le signal d'une ligne pour une variante (pS, pSj2, ou l'autre match du jour). */
const signalDe = (l, signal, placebo) => (signal === 'pSautre' ? placebo.get(l.cle) ?? null : l[signal] ?? null);

/** E1 : les observations d'une fenêtre (marché + un signal, issue réalisée). */
function observationsE1(lignes, signal, placebo) {
  const obs = [];
  for (const l of lignes) {
    const s = signalDe(l, signal, placebo);
    if (!s || l.y === null || l.y === undefined) continue;
    obs.push({ l, pM: l.pM, signaux: [s], y: l.y });
  }
  return obs;
}

/** Les lignes du juge de la combinaison (J1 : perte log ; J2 : entropie croisée face à la clôture) et l'ampleur. */
function lignesCombinaison(obs, predire) {
  const j1 = [];
  const j2 = [];
  const ecarts = [];
  for (const o of obs) {
    const pB = predire(o);
    j1.push({ bloc: o.l.cle, match: o.l.cle, a: perteLogDe(o.pM[o.y]), b: perteLogDe(pB[o.y]) });
    if (o.q) j2.push({ bloc: o.l.cle, match: o.l.cle, a: entropieCroisee(o.pM, o.q), b: entropieCroisee(pB, o.q) });
    ecarts.push(pointsDEcart(o.pM, pB));
  }
  return { j1, j2, ampleur: moyenne(ecarts) ?? 0 };
}

/** Le verdict de la combinaison : J1 décide ; un « retenu » exige l'ampleur ≥ 0,5 point ET une clôture pas « moins bon » (J2 qualifie). */
export function decisionCombinaison(id, { j1, j2, ampleur }, extra = {}, { K = JUGE.K, tirages = JUGE.tirages } = {}) {
  const J1 = juger(j1, { sens: 'min', graine: JUGE.graineCombinaison, K, tirages });
  const J2 = j2.length ? juger(j2, { sens: 'min', graine: JUGE.graineCombinaison, K, tirages }) : null;
  const raisons = [];
  let verdict = J1.verdict;
  if (verdict === 'retenu' && ampleur < AMPLEUR.combinaisonPoints) {
    verdict = 'pas-prouve';
    raisons.push(`ampleur ${ampleur.toFixed(3)} point, sous ${AMPLEUR.combinaisonPoints} (garde secondaire)`);
  }
  if (verdict === 'retenu' && J2 && J2.verdict === 'moins-bon') {
    verdict = 'pas-prouve';
    raisons.push('la clôture (J2) dit « moins bon » : elle qualifie, le « retenu » tombe');
  }
  return { id, ...FORMES[id], verdict, raisons, gain: J1.gain, fourchette: J1.fourchette, z: J1.seuil.z, zObserve: J1.zObserve, ampleur, lignes: J1.n.lignes, blocs: J1.n.blocs, matchs: J1.n.matchs, j2: J2 ? { verdict: J2.verdict, gain: J2.gain, fourchette: J2.fourchette, lignes: J2.n.lignes } : null, moyenneA: J1.a.moyenne, ...extra };
}

/** E1 avec un β commun (appris sur P1, jugé sur P2). */
function varianteE1(id, P1, P2, forme, placebo, opts) {
  const apprendre = observationsE1(P1, forme.signal, placebo);
  const obs = observationsE1(P2, forme.signal, placebo);
  if (!apprendre.length || !obs.length) return nonJugeable(id, 'aucune ligne avec le signal');
  const b = apprendreLesBetas(apprendre);
  for (const o of obs) o.q = o.l.q;
  const L = lignesCombinaison(obs, (o) => melangerEnLogCotes(o.pM, o.signaux, b.betas));
  return decisionCombinaison(id, L, { betas: b.betas, betasSansAPriori: b.sansAPriori, apprisSur: apprendre.length }, opts);
}

/** E1 par régime de l'ancre (r1 Pinnacle, r3 repli) : un β par régime si le pli d'apprentissage en a ≥ 2 000, sinon le commun. */
function variantePoidsParRegime(id, P1, P2, forme, placebo, opts) {
  const repliP2 = P2.filter((l) => l.regime === 'r3').length;
  if (repliP2 < A_PRIORI.matchsParRegime) return nonJugeable(id, `P2 n’a que ${repliP2} lignes de repli (${A_PRIORI.matchsParRegime} exigées, conception §1.2) : jugée sur P5`, { tailles: { repliP2 } });
  const apprendre = observationsE1(P1, forme.signal, placebo);
  const commun = apprendreLesBetas(apprendre).betas;
  const parRegime = {};
  for (const r of ['r1', 'r3']) {
    const a = apprendre.filter((o) => o.l.regime === r);
    parRegime[r] = a.length >= A_PRIORI.matchsParRegime ? apprendreLesBetas(a).betas : commun;
  }
  const obs = observationsE1(P2, forme.signal, placebo);
  for (const o of obs) o.q = o.l.q;
  const L = lignesCombinaison(obs, (o) => melangerEnLogCotes(o.pM, o.signaux, parRegime[o.l.regime] ?? commun));
  // Bras A de cette variante : le marché (R1) ; le gain du β par régime face au commun est rapporté.
  return decisionCombinaison(id, L, { betasParRegime: parRegime, betaCommun: commun }, opts);
}

/** La clé de championnat d'une ligne : le vrai code, ou le faux (FNV-1a de la clé du match mod 40). */
const ligueDe = (l, sorte) => (sorte === 'fausse' ? `faux:${fnv1a(`faux-championnat|${l.cle}`) % PLACEBOS.fauxChampionnats}` : l.code);

/**
 * PAR CHAMPIONNAT, RÉTRÉCI : β commun appris sur P1 ; pour chaque championnat, l'écart δ̂ (Newton, offset du commun,
 * sans a priori) et sa variance (1 / information) ; τ² par les moments ; δ retenu = δ̂ · τ²/(τ² + var). Bras A = le commun
 * de P1 (jamais les constantes du moteur, T-B3) ; bras B = commun + δ du championnat ; jugés sur P2.
 */
function variantePoidsParLigue(id, P1, P2, forme, placebo, opts) {
  const apprendre = observationsE1(P1, forme.signal, placebo);
  const commun = apprendreLesBetas(apprendre).betas[0];
  const parLigue = new Map();
  for (const o of apprendre) {
    const k = ligueDe(o.l, forme.parLigue);
    let x = parLigue.get(k);
    if (!x) parLigue.set(k, (x = []));
    x.push(o);
  }
  const ecarts = [];
  for (const [ligue, obs] of parLigue) {
    if (obs.length < 50) continue;
    const lignes = lignesE1(obs).map((l) => ({ o: l.o.map((v, i) => v + commun * l.x[0][i]), x: l.x, y: l.y }));
    const r = logitConditionnel(lignes, { nParams: 1, precision: [0] });
    const info = r.information?.[0]?.[0];
    if (fini(r.theta[0]) && fini(info) && info > 0) ecarts.push({ ligue, delta: r.theta[0], variance: 1 / info, n: obs.length });
  }
  const retreci = retrecirParChampionnat(ecarts);
  const obsA = observationsE1(P2, forme.signal, placebo);
  for (const o of obsA) o.q = o.l.q;
  const j1 = [];
  const j2 = [];
  const pts = [];
  for (const o of obsA) {
    const pA = melangerEnLogCotes(o.pM, o.signaux, [commun]);
    const d = retreci.parLigue[ligueDe(o.l, forme.parLigue)] ?? 0;
    const pB = melangerEnLogCotes(o.pM, o.signaux, [commun + d]);
    j1.push({ bloc: o.l.cle, match: o.l.cle, a: perteLogDe(pA[o.y]), b: perteLogDe(pB[o.y]) });
    if (o.q) j2.push({ bloc: o.l.cle, match: o.l.cle, a: entropieCroisee(pA, o.q), b: entropieCroisee(pB, o.q) });
    pts.push(pointsDEcart(pA, pB));
  }
  return decisionCombinaison(id, { j1, j2, ampleur: moyenne(pts) ?? 0 }, { betaCommun: commun, tau2: retreci.tau2, championnats: ecarts.length }, opts);
}

/**
 * E2 — LE RECALAGE DU MARCHÉ : appris sur les deux saisons d'avant P2 (2017-07 → 2019-06), jugé sur P2 ; gain rapporté
 * saison par saison et le huis clos à part ; « retenu » refusé si le signe change d'une saison à l'autre (T-B18).
 */
function varianteE2(id, P1, P2, forme, opts) {
  const binaire = forme.e2 === '25';
  const prendre = (l) => (binaire ? (l.pM25 && l.y25 !== null && l.y25 !== undefined ? { pM: l.pM25, y: l.y25, q: l.q25 } : null) : l.y !== null && l.y !== undefined ? { pM: l.pM, y: l.y, q: l.q } : null);
  const apprendre = P1.filter((l) => dans(l.date, PERIODES_DU_BANC.E2)).map((l) => prendre(l)).filter(Boolean);
  if (!apprendre.length) return nonJugeable(id, 'aucune ligne sur les deux saisons d’avant P2');
  const r = apprendreLeRecalageDuMarche(apprendre);
  const predire = (pM) => (binaire ? ((p) => [p, 1 - p])(recalerParCox(pM[0], { alpha: r.alpha, beta: r.beta })) : recalerLeMarche3(pM, r));
  const obs = [];
  for (const l of P2) {
    const x = prendre(l);
    if (x) obs.push({ l, pM: x.pM, y: x.y, q: x.q });
  }
  const L = lignesCombinaison(obs, (o) => predire(o.pM));
  const parSaison = {};
  for (const s of SAISONS_DE_P2) {
    const lignes = L.j1.filter((_, i) => saisonDe(obs[i].l.date) === s);
    parSaison[s] = { lignes: lignes.length, gain: lignes.length ? moyenne(lignes.map((x) => x.a - x.b)) : null };
  }
  const hc = L.j1.filter((_, i) => dans(obs[i].l.date, PERIODES_DU_BANC.huisClos));
  const d = decisionCombinaison(id, L, { recalage: r, parSaison, huisClos: { lignes: hc.length, gain: hc.length ? moyenne(hc.map((x) => x.a - x.b)) : null } }, opts);
  if (d.verdict === 'retenu' && Object.values(parSaison).some((s) => !fini(s.gain) || s.gain <= 0)) {
    d.verdict = 'pas-prouve';
    d.raisons.push('le signe du gain ne tient pas saison par saison (T-B18)');
  }
  return d;
}

// =============================================================================================== la confiance

/**
 * LE JUGE D'UNE CLASSE DE CONFIANCE, contre la clôture : bras A = le recalage COMMUN par dixièmes, bras B = le recalage
 * PAR CLASSE ; tables apprises sur `apprendre`, appliquées à `juger`. Chaque ligne : { cle, p: [..], q: [..], c, y? }.
 * Rend { lignes du juge, ampleur, tailles } ou { nonJugeable }.
 */
export function jugeDUneClasse({ apprendre, juger: aJuger, minoritaire = A_PRIORI.lignesParClasse, brasA = 'dixiemes' }) {
  const tailles = {};
  for (const l of aJuger) if (l.q) tailles[l.c] = (tailles[l.c] ?? 0) + 1;
  const classes = Object.keys(tailles);
  const mini = classes.length >= 2 ? Math.min(...Object.values(tailles)) : 0;
  if (classes.length < 2 || mini < minoritaire) return { nonJugeable: `classe minoritaire : ${mini} lignes avec clôture (${minoritaire} exigées)`, tailles };
  const points = (liste) => liste.filter((l) => l.q).flatMap((l) => l.p.map((p, i) => ({ p, y: l.q[i] })));
  const commun = tableDesDixiemes(points(apprendre));
  const cox = brasA === 'cox' ? coxParLesLogits(points(apprendre)) : null;
  const parClasse = {};
  // Le recalage par classe est ramené vers le recalage commun (20 lignes fictives à la fréquence commune) : sans écart propre
  // à la classe, les deux bras se rejoignent (un faux ingrédient ne paie pas le seul bruit de sa table).
  for (const c of classes) parClasse[c] = tableDesDixiemes(points(apprendre.filter((l) => l.c === c)), { vers: commun });
  const lignes = [];
  let s = 0;
  let n = 0;
  for (const l of aJuger) {
    if (!l.q) continue;
    // Le bras A est TOUJOURS le recalage commun par dixièmes ; « cox » n'existe que pour montrer le piège du monde COURBE (T-B5).
    const pA = normaliser(l.p.map((p) => (brasA === 'cox' ? recalerParCox(p, cox) : recalerParDixiemes(p, commun))));
    const pB = normaliser(l.p.map((p) => recalerParDixiemes(p, parClasse[l.c] ?? commun)));
    const bin = (x, q) => -(q[0] * Math.log(Math.max(1e-6, x[0])) + q[1] * Math.log(Math.max(1e-6, x[1])));
    lignes.push({ bloc: l.cle, match: l.cle, a: l.p.length === 2 ? bin(pA, l.q) : entropieCroisee(pA, l.q), b: l.p.length === 2 ? bin(pB, l.q) : entropieCroisee(pB, l.q) });
    // L'ampleur : l'écart moyen, en points, entre les deux bras sur les lignes jugées (garde secondaire, jamais seule).
    for (let i = 0; i < l.p.length; i++) {
      s += Math.abs(pA[i] - pB[i]) * 100;
      n++;
    }
  }
  return { lignes, ampleur: n ? s / n : 0, tailles };
}

/** Un recalage linéaire en log-cotes (moindres carrés de ℓ(y) sur ℓ(p)) : la forme de Cox, pour T-B5 seulement. */
function coxParLesLogits(points) {
  const lg = (x) => Math.log(Math.min(1 - 1e-6, Math.max(1e-6, x)) / (1 - Math.min(1 - 1e-6, Math.max(1e-6, x))));
  const xs = points.map((pt) => lg(pt.p));
  const ys = points.map((pt) => lg(pt.y));
  const mx = moyenne(xs);
  const my = moyenne(ys);
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  const beta = sxx > 0 ? sxy / sxx : 1;
  return { alpha: my - beta * mx, beta };
}

/** Le verdict d'une classe : comparer (sens min, graine 38) ; « retenu » exige l'ampleur ≥ 1 point (garde secondaire). */
export function decisionConfiance(base, J, { K = JUGE.K, tirages = JUGE.tirages } = {}) {
  if (J.nonJugeable) return { ...base, verdict: 'non-jugeable-ici', raisons: [J.nonJugeable], tailles: J.tailles };
  const r = juger(J.lignes, { sens: 'min', graine: JUGE.graineConfiance, K, tirages });
  const raisons = [];
  let verdict = r.verdict;
  if (verdict === 'retenu' && J.ampleur < AMPLEUR.confiancePoints) {
    verdict = 'pas-prouve';
    raisons.push(`ampleur ${J.ampleur.toFixed(3)} point de dixième, sous ${AMPLEUR.confiancePoints}`);
  }
  return { ...base, verdict, raisons, gain: r.gain, fourchette: r.fourchette, z: r.seuil.z, zObserve: r.zObserve, ampleur: J.ampleur, lignes: r.n.lignes, blocs: r.n.blocs, tailles: J.tailles };
}

/** La classe d'une ligne football-data (1N2 ou 2,5) pour une variante de confiance jugée sur P2. */
export function classeFd(l, sorte) {
  if (sorte === 'accord') return fini(l.g) ? (l.g > 0.03 ? 'disperse' : 'serre') : null;
  if (sorte === 'regime') return degreDeA(l.regime === 'r1' ? 'pinnacle' : 'repli') === 0 ? 'ancre-sure' : 'ancre-fragile';
  if (sorte === 'couverture') return degreDeD({ nMin: l.nMin, famille: 'buts' }) === 0 ? 'couvert' : 'peu-couvert';
  if (sorte === 'placebo') return fnv1a(`confiance-placebo|${l.cle}`) % 10 < 3 ? 'fragile' : 'sur';
  if (sorte === 'faux-ingredient') {
    const faux = fnv1a(l.cle) % PLACEBOS.fauxIngredient.modulo < PLACEBOS.fauxIngredient.moins ? 2 : 0;
    const vrai = degresDUneLigne({ ancre: l.regime === 'r1' ? 'pinnacle' : 'repli', accord: l.g, ancreSurUnPrix: l.regime === 'r1' }, '1n2');
    return etiquetteDe({ ...vrai, faux });
  }
  return null;
}

/** Une variante de confiance sur P2 : appris sur P1 ≥ 2012, jugé sur P2, contre la clôture (1N2 ; 2,5 pour la couverture). */
function varianteConfianceP2(id, P1, P2, sorte, opts) {
  const deux = sorte === 'couverture';
  const forme = (l) => {
    const c = classeFd(l, sorte);
    if (c === null) return null;
    return deux ? (l.pM25 ? { cle: l.cle, p: l.pM25, q: l.q25, c } : null) : { cle: l.cle, p: l.pM, q: l.q, c };
  };
  const apprendre = P1.filter((l) => dans(l.date, PERIODES_DU_BANC.P1pinnacle)).map(forme).filter(Boolean);
  const aJuger = P2.map(forme).filter(Boolean);
  return decisionConfiance({ id, ...FORMES[id], fenetreJugee: 'P2' }, jugeDUneClasse({ apprendre, juger: aJuger }), opts);
}

/**
 * Une variante de confiance sur P5-a, DANS CHAQUE ORIGINE (critique, constat 1) : deux plis (FNV-1a de la clé mod 2),
 * tables apprises sur l'autre pli de la MÊME origine (l'origine dans les deux bras). Un verdict par origine, jamais réuni.
 */
export function varianteConfianceParOrigine(id, lignesP5, classeDe, opts = {}) {
  const strates = {};
  for (const origine of ['nuit', 'coup-d-envoi']) {
    const L = lignesP5.filter((l) => l.origine === origine && l.p).map((l) => ({ cle: l.cle, p: l.p, q: l.q, c: classeDe(l), pli: fnv1a(l.cle) % 2 })).filter((l) => l.c !== null);
    const tailles = {};
    for (const l of L) if (l.q) tailles[l.c] = (tailles[l.c] ?? 0) + 1;
    const classes = Object.keys(tailles);
    const mini = classes.length >= 2 ? Math.min(...Object.values(tailles)) : 0;
    if (classes.length < 2 || mini < A_PRIORI.lignesParClasse) {
      strates[origine] = { verdict: 'non-jugeable-ici', raisons: [`classe minoritaire : ${mini} lignes avec clôture dans l’origine « ${origine} » (${A_PRIORI.lignesParClasse} exigées)`], tailles };
      continue;
    }
    const lignes = [];
    let ampleur = 0;
    for (const pli of [0, 1]) {
      const J = jugeDUneClasse({ apprendre: L.filter((l) => l.pli !== pli), juger: L.filter((l) => l.pli === pli), minoritaire: 0 });
      if (J.lignes) {
        lignes.push(...J.lignes);
        ampleur += J.ampleur / 2;
      }
    }
    strates[origine] = decisionConfiance({}, { lignes, ampleur, tailles }, opts);
  }
  const jugees = Object.values(strates).filter((s) => s.verdict !== 'non-jugeable-ici');
  return { id, ...FORMES[id], fenetreJugee: 'P5a', verdict: jugees.length ? 'par-origine' : 'non-jugeable-ici', strates, raisons: jugees.length ? [] : ['aucune origine jugeable'] };
}

/** La classe d'une ligne gelée de P5-a pour une variante (étiquette de confiance-v1, régime, accord). */
export function classeP5(l, sorte) {
  const i = l.ingredients;
  if (sorte === 'regime') return degreDeA(i.ancre) === 0 ? 'ancre-sure' : 'ancre-fragile';
  if (sorte === 'accord') return fini(i.accord) ? (i.accord > 0.03 ? 'disperse' : 'serre') : null;
  if (sorte === 'etiquette') return etiquetteDe(degresDUneLigne(i, '1n2'));
  return null;
}

// =============================================================================================== le seuil

/** La décision d'une ligne sous une règle : { o, c } ou null (aucun pari). */
export function decisionSousRegle(l, regle) {
  const classe = { ancre: l.regime === 'r1' ? 'pinnacle' : 'repli', accord: fini(l.g) && l.g > 0.03 ? 'disperse' : 'serre', aVerifier: false, livre: 'etranger-mesure', coteHaute: l.coteHaute, coteHautePermutee: l.coteHautePermutee, coteHautePermutee2: l.coteHautePermutee2 };
  const s = seuilDe(classe, regle);
  if (s === null) return null;
  const d = l.dec[s];
  if (d === undefined) throw new RangeError(`décision non calculée au seuil ${s}`);
  return d;
}

/** La valeur de clôture d'une décision sur une ligne (null sans clôture). */
const vcDe = (d, l) => (d && l.q ? d.c * l.q[d.o] - 1 : null);

/**
 * UNE RÈGLE DU SEUIL face à la règle en service (seuil-v1) : toutes les décisions cotées de la fenêtre, une par match, a =
 * VC sous A (0 sans pari), b = VC sous B ; sens max ; blocs = jour|championnat ; graine 1. L'UTILITÉ sur la variante
 * seule : des paris AJOUTÉS → leur VC « retenu » seule ; des paris RETIRÉS → leur VC ≤ 0, sinon « choix de prudence ».
 */
export function jugerUneRegle(id, lignes, { K = JUGE.K, tirages = JUGE.tirages } = {}) {
  const j = [];
  const ajoutes = [];
  const retires = [];
  let sansCloture = 0;
  let gA = 0;
  let gB = 0;
  let nA = 0;
  let nB = 0;
  // Le bras A : la règle en service, sauf pour le placebo (une autre permutation de la même classe : rien ne doit sortir).
  const regleA = REGLES_DE_SEUIL[id]?.brasA ?? 'seuil-v1';
  for (const l of lignes) {
    const a = decisionSousRegle(l, regleA);
    const b = decisionSousRegle(l, id);
    if ((a || b) && !l.q) {
      sansCloture++;
      continue;
    }
    const va = vcDe(a, l) ?? 0;
    const vb = vcDe(b, l) ?? 0;
    j.push({ bloc: `${l.date}|${l.code}`, match: l.cle, a: va, b: vb });
    if (b && !a) ajoutes.push({ bloc: `${l.date}|${l.code}`, match: l.cle, a: 0, b: vb });
    if (a && !b) retires.push(va);
    if (l.y !== null && l.y !== undefined) {
      if (a) {
        nA++;
        gA += a.o === l.y ? a.c - 1 : -1;
      }
      if (b) {
        nB++;
        gB += b.o === l.y ? b.c - 1 : -1;
      }
    }
  }
  const r = juger(j, { sens: 'max', graine: JUGE.graineSeuil, K, tirages });
  let utile = null;
  let utilite = null;
  if (ajoutes.length) {
    const u = juger(ajoutes, { sens: 'max', graine: JUGE.graineSeuil, K, tirages });
    utile = u.verdict === 'retenu';
    utilite = { sorte: 'ajoutes', n: ajoutes.length, verdict: u.verdict, gain: u.gain, fourchette: u.fourchette };
  } else if (retires.length) {
    const m = moyenne(retires);
    utile = m <= 0;
    utilite = { sorte: 'retires', n: retires.length, vcMoyenne: m, phrase: m <= 0 ? 'les paris retirés n’avaient pas de valeur de clôture' : 'choix de prudence : les paris retirés avaient une valeur de clôture positive' };
  }
  return { verdict: r.verdict, gain: r.gain, fourchette: r.fourchette, z: r.seuil.z, zObserve: r.zObserve, lignes: r.n.lignes, blocs: r.n.blocs, matchs: r.n.matchs, sansCloture, parisA: nA, parisB: nB, rendement: { A: nA ? gA / nA : null, B: nB ? gB / nB : null, rapporteSeulement: true }, utile, utilite };
}

// =============================================================================================== l'ensemble

/** Le contexte partagé par les variantes : les fenêtres, le signal placebo, les options du juge (T-F5 vérifié ici). */
export function contexteDuBanc({ fd, p5 = [], K = JUGE.K, tirages = JUGE.tirages } = {}) {
  const P1 = fd.filter((l) => l.fenetre === 'P1');
  const P2 = fd.filter((l) => l.fenetre === 'P2');
  // T-F5 : rien n'apprend sur P2 — les ensembles d'apprentissage ne contiennent aucune ligne de P2.
  if (P1.some((l) => l.date >= PERIODES_DU_BANC.P2.de)) throw new Error('jugerLesVariantes : une ligne de P2 dans l’apprentissage (T-F5)');
  return { fd, p5, P1, P2, placebo: signalPlacebo([...P1, ...P2]), opts: { K, tirages }, seuilFenetre: fd.filter((l) => l.fenetre === 'P2' || dans(l.date, PERIODES_DU_BANC.P1pinnacle)) };
}

/** UNE variante déclarée, avec SA forme, SA fenêtre et SON juge (écrits avant le regard). */
export function jugerUneVariante(id, { P1, P2, p5, placebo, opts, seuilFenetre }) {
  const f = FORMES[id];
  if (!f) throw new RangeError(`jugerUneVariante : variante « ${id} » sans forme écrite avant le regard`);
  if (f.fenetre === 'definition') return { id, ...f, verdict: 'definition', raisons: ['la définition retenue ne lit aucun résultat (comptée dans K par prudence)'] };
  if (f.fenetre === 'P5b') return nonJugeable(id, 'jugée après le lancement (P5-b, preuve du lot 1c)');
  if (f.angle === 'combinaison') {
    if (f.e2) return varianteE2(id, P1, P2, f, opts);
    if (f.parRegime) return variantePoidsParRegime(id, P1, P2, f, placebo, opts);
    if (f.parLigue) return variantePoidsParLigue(id, P1, P2, f, placebo, opts);
    return varianteE1(id, P1, P2, f, placebo, opts);
  }
  if (f.angle === 'confiance') {
    if (id === 'classe-compo') return nonJugeable(id, 'P5-a : les buts des versions ≤ 5 sont écartés de la preuve (ancien modèle) et le 1N2 ne lit pas la compo ; jugée sur P5-b');
    if (f.fenetre === 'P2') return varianteConfianceP2(id, P1, P2, f.classe, opts);
    if (f.fenetre === 'P5a') return varianteConfianceParOrigine(id, p5, (l) => classeP5(l, f.classe), opts);
    // P2 + P5-a : deux verdicts, jamais réunis (classe-regime, classe-accord).
    const repliP2 = P2.filter((l) => l.regime === 'r3').length;
    const surP2 = f.classe === 'regime' && repliP2 < A_PRIORI.matchsParRegime
      ? { verdict: 'non-jugeable-ici', raisons: [`P2 n’a que ${repliP2} lignes de repli (${A_PRIORI.matchsParRegime} exigées)`] }
      : varianteConfianceP2(id, P1, P2, f.classe, opts);
    const surP5 = varianteConfianceParOrigine(id, p5, (l) => classeP5(l, f.classe), opts);
    const jugees = [surP2, surP5].filter((x) => x.verdict !== 'non-jugeable-ici');
    return {
      id,
      ...f,
      verdict: jugees.length ? 'par-fenetre' : 'non-jugeable-ici',
      fenetres: { P2: { verdict: surP2.verdict, raisons: surP2.raisons, gain: surP2.gain ?? null, fourchette: surP2.fourchette ?? null, lignes: surP2.lignes ?? null, tailles: surP2.tailles ?? null }, P5a: { verdict: surP5.verdict, strates: surP5.strates } },
      raisons: jugees.length ? [] : ['aucune fenêtre jugeable']
    };
  }
  if (f.angle === 'seuil') {
    const r = jugerUneRegle(id, seuilFenetre, opts);
    const surP2 = jugerUneRegle(id, P2, opts);
    return { id, ...f, ...r, raisons: r.utile === false && r.verdict === 'retenu' ? ['retenu mais pas utile sur la variante seule'] : [], P2: { gain: surP2.gain, fourchette: surP2.fourchette, lignes: surP2.lignes, rapporteSeulement: true } };
  }
  throw new Error(`variante « ${id} » sans juge`);
}

/**
 * LES 38 VARIANTES. `fd` : les lignes de bancFd (avec résultats) ; `p5` : celles de lecteurP5 (avec résultats). Les K
 * déclarées sont exigées (T-B4) : une variante non déclarée est refusée, une forme absente aussi. Rend { K, z,
 * variantes, placebos, emboitees, rapports }.
 */
export function jugerLesVariantes({ fd, p5 = [], K = JUGE.K, declarees = VARIANTES_DE_L_ETAPE_38, tirages = JUGE.tirages } = {}) {
  if (K !== declarees.length) throw new RangeError(`jugerLesVariantes : K = ${K}, mais ${declarees.length} variantes déclarées`);
  for (const v of declarees) if (!FORMES[v.id]) throw new RangeError(`jugerLesVariantes : variante « ${v.id} » sans forme écrite avant le regard`);
  for (const id of Object.keys(FORMES)) if (!declarees.some((v) => v.id === id)) throw new RangeError(`jugerLesVariantes : variante « ${id} » non déclarée (lancements.js)`);
  const ctx = contexteDuBanc({ fd, p5, K, tirages });
  const { P1, P2 } = ctx;
  const variantes = declarees.map(({ id }) => jugerUneVariante(id, ctx));
  // La règle des emboîtées (T-B17) : parmi les « retenu » d'une même classe, la plus proche de la règle en service.
  const retenus = variantes.filter((v) => v.verdict === 'retenu').map((v) => v.id);
  const emboitees = { pinnacle: choisirParmiLesEmboitees(retenus, { classe: 'pinnacle' }), disperse: choisirParmiLesEmboitees(retenus, { classe: 'disperse' }) };
  const placebos = Object.fromEntries(PLACEBOS_DU_BANC.map((id) => [id, variantes.find((v) => v.id === id)?.verdict ?? null]));
  const horlogeRole = (() => {
    const s = variantes.find((v) => v.id === '1n2-stats-residuel')?.verdict;
    const h = variantes.find((v) => v.id === 'horloge-j2')?.verdict;
    return s === 'retenu' && h !== 'retenu' ? 'avance-d-horloge' : null;
  })();
  return { K, z: zPour(JUGE.alpha, K), version: VERSION_DE_LA_REGLE, variantes, placebos, emboitees, horloge: horlogeRole, rapports: rapportsDuBanc({ fd, P1, P2 }) };
}

/**
 * LES RAPPORTS, hors K, sans verdict : VC de la règle en service par bande et par classe, ρ (pente VC / avantage) par
 * classe, le huis clos à 5 % (classe rétroactive, inactionnable), Cox par classe d'accord (rapporté).
 */
export function rapportsDuBanc({ fd, P1, P2 }) {
  const fen = fd.filter((l) => l.fenetre === 'P2' || dans(l.date, PERIODES_DU_BANC.P1pinnacle));
  const bandes = {};
  for (const t of [0.01, 0.015, 0.02, 0.03, 0.04, 0.05]) {
    const v = fen.map((l) => vcDe(l.dec[t], l)).filter(fini);
    bandes[t] = { paris: v.length, vcMoyenne: moyenne(v) };
  }
  const rho = {};
  for (const [nom, filtre] of [['serre', (l) => !(fini(l.g) && l.g > 0.03)], ['disperse', (l) => fini(l.g) && l.g > 0.03], ['cote-haute', (l) => l.coteHaute], ['cote-basse', (l) => !l.coteHaute]]) {
    const pts = fen.filter(filtre).map((l) => ({ ev: l.dec[0.01]?.ev, vc: vcDe(l.dec[0.01], l) })).filter((x) => fini(x.ev) && fini(x.vc));
    const mx = moyenne(pts.map((x) => x.ev));
    const my = moyenne(pts.map((x) => x.vc));
    const cov = pts.reduce((s, x) => s + (x.ev - mx) * (x.vc - my), 0);
    const va = pts.reduce((s, x) => s + (x.ev - mx) ** 2, 0);
    rho[nom] = { paris: pts.length, rho: va > 0 ? cov / va : null };
  }
  const hc = P2.filter((l) => dans(l.date, PERIODES_DU_BANC.huisClos));
  const hcVc = hc.map((l) => ({ a: vcDe(l.dec[0.02], l), b: vcDe(l.dec[0.05], l) }));
  const cox = {};
  for (const c of ['serre', 'disperse']) {
    const pts = P2.filter((l) => l.y !== null && l.y !== undefined && fini(l.g) && (l.g > 0.03 ? 'disperse' : 'serre') === c).flatMap((l) => l.pM.map((p, i) => ({ p, y: l.y === i ? 1 : 0 })));
    cox[c] = pts.length ? apprendreCox(pts) : null;
  }
  return {
    bandesParSeuil: bandes,
    rhoParClasse: rho,
    huisClos5pc: { matchs: hc.length, paris2pc: hcVc.filter((x) => fini(x.a)).length, paris5pc: hcVc.filter((x) => fini(x.b)).length, vc2pc: moyenne(hcVc.map((x) => x.a).filter(fini)), vc5pc: moyenne(hcVc.map((x) => x.b).filter(fini)), rapporteSeulement: true },
    coxParClasseDAccord: cox,
    lignes: { P1: P1.length, P2: P2.length, seuil: fen.length }
  };
}

// =============================================================================================== la note

/** CE QUI EST RECOPIÉ dans noteDeLaCombinaison.js, tiré de la sortie du passage unique — pur (recopie PAR SCRIPT, T-B7). */
export function aRecopier(sortieDuBanc, { sortie } = {}) {
  const b = sortieDuBanc?.banc;
  if (!b || sortieDuBanc.format !== VERSION_DU_BANC) throw new Error('aRecopier : ce n’est pas une sortie du banc de la combinaison (format 1)');
  return {
    format: VERSION_DU_BANC,
    version: VERSION_DE_LA_REGLE,
    calculeLe: String(sortieDuBanc.premierRegard ?? '').slice(0, 10),
    premierRegard: sortieDuBanc.premierRegard ?? null,
    ou: 'bac à sable',
    regles: { fichier: sortieDuBanc.regles?.copie ?? null, sha1: sortieDuBanc.regles?.sha1 ?? null, ecritesAvantLeRegard: true },
    sortie: sortie ?? null,
    empreinteDuMoteur: sortieDuBanc.empreinteDuMoteur ?? null,
    modulesScelles: sortieDuBanc.modulesScelles ?? null,
    etalonnage: sortieDuBanc.etalonnage ?? null,
    K: b.K,
    z: arrondi(b.z, 4),
    variantes: b.variantes.map((v) => ({
      id: v.id,
      angle: v.angle,
      fenetre: v.fenetre,
      placebo: Boolean(v.placebo),
      verdict: v.verdict,
      raisons: v.raisons ?? [],
      gain: arrondi(v.gain, 6),
      fourchette: Array.isArray(v.fourchette) ? v.fourchette.map((x) => arrondi(x, 6)) : null,
      zObserve: arrondi(v.zObserve, 3),
      ampleur: arrondi(v.ampleur, 4),
      lignes: v.lignes ?? null,
      blocs: v.blocs ?? null,
      utile: v.utile ?? null,
      strates: v.strates ?? null,
      fenetres: v.fenetres ?? null
    })),
    placebos: b.placebos,
    emboitees: b.emboitees,
    horloge: b.horloge ?? null,
    limites: LIMITES_DU_LOT_1A
  };
}

/** Le TEXTE de noteDeLaCombinaison.js pour une note (la recopie l'écrit tel quel ; T-B7 le refait à l'octet). */
export function texteDeLaNote(note) {
  return [
    '/**',
    ' * noteDeLaCombinaison.js — CE QUE DIT LE BANC DE LA COMBINAISON, DE LA CONFIANCE ET DU SEUIL (étape 38 du plan, lot 1a).',
    ' * -----------------------------------------------------------------------',
    ' * RECOPIÉ PAR SCRIPT (server/scripts/etape38.mjs --recopier, sur la sortie du passage unique du banc), jamais retapé à',
    ' * la main : le test T-B7 (combinaisonBanc.test.mjs) refait ce texte à l’octet depuis la sortie gardée dans test/fixtures',
    ' * (banc-etape38.json, et les règles écrites avant le regard : banc-regles-etape38.md).',
    ' * COMBINAISON_AU_BANC : pour chacune des 38 variantes, son verdict (retenu / pas prouvé / moins bon / non jugeable ici /',
    ' * définition), son gain et sa fourchette, son ampleur, ses strates par origine ; les placebos ; la règle des emboîtées ;',
    ' * l’étalonnage. null = pas encore mesuré : l’écran ne dit jamais « mesuré ».',
    ' * Hors de l’empreinte du moteur (data/combinaison/) : aucun chiffre du moteur n’en dépend. Pur : ne lit rien.',
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
    '/** Le banc de la combinaison (null = pas encore mesuré). */',
    `export const COMBINAISON_AU_BANC = ${note === null ? 'null' : `gele(${JSON.stringify(note)})`};`,
    '',
    '/** Le verdict d’une variante (null avant le banc ou pour un identifiant inconnu). */',
    'export const verdictDe = (id) => COMBINAISON_AU_BANC?.variantes?.find((v) => v.id === id)?.verdict ?? null;',
    '',
    '/** Les mots de l’écran pour une variante : « mesuré » seulement après un verdict (T-E4). */',
    'export function motsDe(id) {',
    '  const v = verdictDe(id);',
    "  if (v === null) return 'pas encore mesuré';",
    "  return { retenu: 'mesuré : retenu', 'pas-prouve': 'mesuré : pas prouvé', 'moins-bon': 'mesuré : moins bon', 'non-jugeable-ici': 'non jugeable ici', definition: 'définition', 'par-origine': 'mesuré par origine', 'par-fenetre': 'mesuré par fenêtre', 'pas-assez-de-matchs': 'pas assez de matchs' }[v] ?? 'pas encore mesuré';",
    '}',
    ''
  ].join('\n');
}

export { SEUIL_EN_SERVICE };
