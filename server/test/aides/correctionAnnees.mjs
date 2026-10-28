/**
 * correctionAnnees.mjs — DES ANNÉES DE TRIS SIMULÉES, jugées par le CODE de la boucle de correction (étape 26,
 * 27/10/2026) : ce n'est PAS un fichier de test. Pur, hasard à graine.
 *
 * Chaque mois, pour chacune des 22 cases, un écart mensuel est tiré (loi normale de moyenne δ, d'écart-type
 * σ / √matchs, éventuellement corrélé entre les cases par une matrice), avec des volumes réalistes et des
 * changements de version ; puis le mois est jugé par jugerLesCases (data/correction/tri.js) TEL QUEL — la fenêtre
 * (fenetreDeLaCase : même lignée, au moins 200 matchs, 2-3 mois), la décision (mesures.js : seuil de 2 points, même
 * sens deux mois de suite), la confiance d'abord, le réglage visé — avec UN SEUL remplacement : le juge, pris en
 * loi normale (écart ± z × σ / √matchs, z = Z_DU_TRI du code) au lieu du rééchantillonnage par matchs, trop lent
 * pour des dizaines de milliers d'années. La concordance des deux juges est mesurée à part
 * (scratchpad etape26\partieA\simulation\validation-juge.mjs).
 *
 * Changement de version (« Q » : au hasard chaque mois ; « plan » : mois imposés ; « aLaVersion » : le défaut arrive
 * avec une version) : la lignée change — la fenêtre repart de zéro ; MOIS PARTIELS (le code) : le mois du changement
 * garde une part tirée au hasard de ses matchs (la nouvelle lignée sert la fin du mois) ; `partiels: false` simule
 * l'ancienne règle (le mois du changement ne compte pas).
 */

import { CASES_DU_TRI, lireLaCase } from '../../src/data/correction/regles.js';
import { jugerLesCases, Z_DU_TRI } from '../../src/data/correction/tri.js';
import { executerSansPause } from '../../src/utils/travailCooperatif.js';
import { hasard } from './correctionFabrique.mjs';

/** Matchs RÉGLÉS par mois, de janvier à décembre (les profils de la critique, annee.mjs). */
export const PROFILS = Object.freeze({
  conception: [1300, 1400, 1500, 1500, 1400, 800, 900, 1500, 1700, 1800, 1700, 1300],
  reel: [950, 1150, 1250, 1450, 1250, 450, 800, 1200, 1300, 1700, 1350, 950],
  mondial: [950, 1150, 1250, 1450, 1250, 150, 550, 1200, 1300, 1700, 1350, 950],
  inegal: [300, 2000, 300, 2000, 300, 2000, 300, 2000, 300, 2000, 300, 2000]
});

/**
 * Le juge en loi normale : sur les agrégats de la fenêtre, écart = (Σb − Σa) / lignes, écart-type = σ(case) /
 * √matchs (σ PAR MATCH, rapporté à la ligne), fourchette = écart ± Z_DU_TRI × écart-type ; « retenu » /
 * « moins-bon » / « pas-prouve » comme comparer, « pas-assez-de-matchs » sous 200 matchs.
 */
export function jugeNormal(sigma) {
  return (cas, fenetre) => {
    const { famille, mesure } = lireLaCase(cas);
    let lignes = 0;
    let matchs = 0;
    let sa = 0;
    let sb = 0;
    for (const m of fenetre) {
      const x = m.familles[famille].agregats[mesure];
      lignes += x.lignes;
      matchs += x.matchs;
      sa += x.sa;
      sb += x.sb;
    }
    const gain = (sb - sa) / lignes;
    const ecartType = sigma[cas] / Math.sqrt(matchs);
    const fourchette = [gain - Z_DU_TRI * ecartType, gain + Z_DU_TRI * ecartType];
    const verdict = matchs < 200 ? 'pas-assez-de-matchs' : fourchette[0] > 0 ? 'retenu' : fourchette[1] < 0 ? 'moins-bon' : 'pas-prouve';
    return { verdict, gain, fourchette, ecartType, z: Z_DU_TRI, lignes, matchs, annonce: sa / lignes, realise: sb / lignes };
  };
}

/** Cholesky d'une matrice de corrélation (un léger lissage si elle n'est pas tout à fait définie positive). */
export function cholesky(R) {
  const n = R.length;
  for (let eps = 0; eps < 0.2; eps += 0.01) {
    const A = R.map((ligne, i) => ligne.map((v, j) => (i === j ? 1 : v * (1 - eps))));
    const L = Array.from({ length: n }, () => new Float64Array(n));
    let ok = true;
    for (let i = 0; i < n && ok; i++) {
      for (let j = 0; j <= i; j++) {
        let s = A[i][j];
        for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
        if (i === j) {
          if (s <= 1e-9) {
            ok = false;
            break;
          }
          L[i][i] = Math.sqrt(s);
        } else L[i][j] = s / L[j][j];
      }
    }
    if (ok) return { L, lissage: eps };
  }
  throw new Error('matrice de corrélation non définie positive');
}

/**
 * DES ANNÉES DE TRIS. Options :
 *   annees, graine, profil ('reel'…), Q (part des mois qui changent de version), plan ([booléens] à partir du
 *   13e mois), partiels (true : la règle du code), sigma { cas: σ par match }, part { cas: part des matchs du mois
 *   qui ont la case }, lpm { cas: lignes par match }, chol (Cholesky des 22 cases, ou null : indépendantes),
 *   defaut { cas, delta, aLaVersion }, derive { cas, max, mois, aLaVersion }, biais { cas: δ } (un moteur bruité),
 *   debutFixe, moisDepartFixe.
 * Sans défaut : { anneesAvecAuMoinsUnVraiDefaut, vraisDefautsParAn, casMoisSignalesParAn, signalesParCas } sur
 * l'année jugée (mois 13 à 24). Avec un défaut : la part détectée au plus tard en 2, 3, 4, 6, 9, 12 mois.
 */
export function simulerDesAnnees(o) {
  const { annees, graine = 1, profil = 'reel', Q = 0, plan = null, partiels = true, sigma, part, lpm, chol = null, defaut = null, derive = null, biais = null, debutFixe = null, moisDepartFixe = null } = o;
  const h = hasard(graine);
  const V = PROFILS[profil];
  const K = CASES_DU_TRI.length;
  const juge = jugeNormal(sigma);
  const familles = [...new Set(CASES_DU_TRI.map((c) => lireLaCase(c).famille))];
  let anneesAvecFaux = 0;
  let evenements = 0;
  let casMois = 0;
  const parCas = Object.fromEntries(CASES_DU_TRI.map((c) => [c, 0]));
  const horizons = [2, 3, 4, 6, 9, 12, 18, 24];
  const detecte = Object.fromEntries(horizons.map((x) => [x, 0]));
  const ecartsALaDetection = [];
  let essais = 0;
  const z = new Float64Array(K);
  const e = new Float64Array(K);
  const cible = defaut ?? derive;
  for (let an = 0; an < annees; an++) {
    const moisDepart = moisDepartFixe ?? Math.floor(h.u() * 12);
    const debut = cible ? debutFixe ?? 12 + Math.floor(h.u() * 12) : null;
    const T = cible ? debut + 25 : 24;
    let lignee = 0;
    const historique = [];
    const enCours = Object.fromEntries(CASES_DU_TRI.map((c) => [c, false]));
    let faux = 0;
    let trouve = null;
    for (let t = 0; t < T; t++) {
      const n0 = V[(moisDepart + t) % 12];
      let change = h.u() < Q;
      if (plan && t >= 12 && t - 12 < plan.length) change = plan[t - 12];
      if (cible?.aLaVersion && t === debut) change = true;
      let fraction = 1;
      if (change) {
        lignee++;
        fraction = partiels ? h.u() : 0;
      }
      for (let i = 0; i < K; i++) z[i] = h.gauss();
      if (chol) {
        for (let i = 0; i < K; i++) {
          let s = 0;
          for (let j = 0; j <= i; j++) s += chol[i][j] * z[j];
          e[i] = s;
        }
      } else e.set(z);
      const agregats = {};
      for (const f of familles) agregats[f] = { tableau: [], agregats: {} };
      for (let i = 0; i < K; i++) {
        const cas = CASES_DU_TRI[i];
        const { famille, mesure } = lireLaCase(cas);
        // Les deux mesures d'une famille portent sur les mêmes lignes : le volume de la case « niveau ».
        const volumeDe = `${famille}|niveau`;
        const n = Math.round(n0 * part[volumeDe] * fraction);
        let delta = biais?.[cas] ?? 0;
        if (defaut && cas === defaut.cas && t >= debut) delta += defaut.delta;
        if (derive && cas === derive.cas && t >= debut) delta += Math.min(derive.max, (derive.max * (t - debut + 1)) / derive.mois);
        const D = n > 0 ? delta + (sigma[cas] / Math.sqrt(n)) * e[i] : 0;
        const lignes = Math.round(n * lpm[volumeDe]);
        const sa = 0.5 * lignes;
        agregats[famille].agregats[mesure] = { lignes, matchs: n, sa, sb: sa + D * lignes, ecart: lignes ? D : null };
      }
      const courant = { mois: `m${t}`, empreinte: `lignee-${lignee}`, partiel: change, familles: agregats, regimes: {} };
      const precedents = [historique.at(-1) ?? null, historique.at(-2) ?? null];
      const cases = executerSansPause(jugerLesCases({ mois: courant.mois, lignee: { avecModeleDeButs: true }, courant, precedents, enSlot: null, juge }));
      historique.push(courant);
      if (historique.length > 3) historique.shift();
      for (const c of cases) {
        const signale = c.statut === 'vrai-defaut';
        if (!cible && t >= 12 && t < 24 && signale) {
          casMois++;
          parCas[c.cas]++;
          if (!enCours[c.cas]) {
            faux++;
            evenements++;
          }
        }
        if (cible && c.cas === cible.cas && t >= debut && signale && trouve === null) {
          trouve = t - debut + 1;
          if (derive) ecartsALaDetection.push(Math.min(derive.max, (derive.max * (t - debut + 1)) / derive.mois));
        }
        enCours[c.cas] = signale;
      }
    }
    if (cible) {
      essais++;
      for (const x of horizons) if (trouve !== null && trouve <= x) detecte[x]++;
    } else if (faux) anneesAvecFaux++;
  }
  if (cible) {
    const r = { profil, Q, partiels, plan: plan ? plan.map(Number).join('') : null, defaut, derive, essais, detecteAuPlusTardEn: Object.fromEntries(horizons.map((x) => [`${x} mois`, Number((detecte[x] / essais).toFixed(3))])) };
    if (derive) {
      ecartsALaDetection.sort((a, b) => a - b);
      r.ecartALaDetectionMediane = ecartsALaDetection.length ? Number(ecartsALaDetection[Math.floor(ecartsALaDetection.length / 2)].toFixed(4)) : null;
      r.jamais = Number((1 - ecartsALaDetection.length / essais).toFixed(3));
    }
    return r;
  }
  return {
    profil,
    Q,
    partiels,
    plan: plan ? plan.map(Number).join('') : null,
    annees,
    anneesAvecAuMoinsUnVraiDefaut: Number((anneesAvecFaux / annees).toFixed(4)),
    vraisDefautsParAn: Number((evenements / annees).toFixed(4)),
    casMoisSignalesParAn: Number((casMois / annees).toFixed(4)),
    signalesParCas: Object.fromEntries(Object.entries(parCas).filter(([, v]) => v > 0).map(([k, v]) => [k, Number((v / annees).toFixed(4))]))
  };
}
