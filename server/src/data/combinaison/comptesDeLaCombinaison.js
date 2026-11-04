/**
 * comptesDeLaCombinaison.js — LES COMPTES D'AVANT LE REGARD DE L'ÉTAPE 38 (lot 1a, 03-04/11/2026 ; T-B9, T-B16), PUR.
 * -----------------------------------------------------------------------
 * Sur les lignes SANS résultat (bancFd.js en comptes, lecteurP5.js en comptes) : tailles des fenêtres, régimes de
 * l'ancre, classes (accord, couverture, faux ingrédient, placebo), présence d'une clôture, décisions et paris de chaque
 * règle du seuil (des COMPTES : aucune valeur de clôture, aucune issue, aucune perte), l'étalonnage sans résultat
 * (décisions, paris, refus de la note de départ), et, pour CHAQUE variante, « jugeable ici » ou non — les tailles
 * décidées AVANT toute perte (T-B16). Pur : ni horloge, ni hasard, ni base, ni fichier.
 * -----------------------------------------------------------------------
 */

import { A_PRIORI, PERIODES_DU_BANC, REGLES_DE_SEUIL } from './reglagesCombinaison.js';
import { FORMES, classeFd, classeP5, decisionSousRegle, etalonnerSansResultat } from './bancDeLaCombinaison.js';

const dans = (date, f) => date >= f.de && date <= f.a;

/** Les tailles des classes d'une liste (avec clôture seulement) et la minoritaire. */
function tailles(liste, classeDe, avecCloture) {
  const t = {};
  for (const l of liste) {
    if (!avecCloture(l)) continue;
    const c = classeDe(l);
    if (c === null || c === undefined) continue;
    t[c] = (t[c] ?? 0) + 1;
  }
  const v = Object.values(t);
  return { parClasse: t, minoritaire: v.length >= 2 ? Math.min(...v) : 0 };
}

/**
 * LES COMPTES. `fd` : lignes de bancFd sans résultat ; `p5` : lignes de lecteurP5 sans résultat. Rend { fenetres,
 * etalonnage, seuil, classes, p5, jugeables, controles }.
 */
export function comptesDeLaCombinaison({ fd, p5 = [], bilanFd = null, bilanP5 = null }) {
  const P1 = fd.filter((l) => l.fenetre === 'P1');
  const P2 = fd.filter((l) => l.fenetre === 'P2');
  const P1pin = P1.filter((l) => dans(l.date, PERIODES_DU_BANC.P1pinnacle));
  const seuilFenetre = [...P1pin, ...P2];
  const compte = (liste, f) => liste.filter(f).length;
  const fenetres = {
    P1: { lignes: P1.length, r1: compte(P1, (l) => l.regime === 'r1'), r3: compte(P1, (l) => l.regime === 'r3'), avec25: compte(P1, (l) => l.pM25), E2: compte(P1, (l) => dans(l.date, PERIODES_DU_BANC.E2)) },
    P1pinnacle: { lignes: P1pin.length, r1: compte(P1pin, (l) => l.regime === 'r1'), avecCloture: compte(P1pin, (l) => l.aCloture), avec25: compte(P1pin, (l) => l.pM25), avecCloture25: compte(P1pin, (l) => l.aCloture25) },
    P2: { lignes: P2.length, r1: compte(P2, (l) => l.regime === 'r1'), r3: compte(P2, (l) => l.regime === 'r3'), avecCloture: compte(P2, (l) => l.aCloture), avec25: compte(P2, (l) => l.pM25), avecCloture25: compte(P2, (l) => l.aCloture25), huisClos: compte(P2, (l) => dans(l.date, PERIODES_DU_BANC.huisClos)) },
    bilan: bilanFd
  };
  const seuil = {};
  for (const id of Object.keys(REGLES_DE_SEUIL)) {
    if (FORMES[id]?.fenetre !== 'P1pinnacle+P2' && id !== 'seuil-v1') continue;
    let paris = 0;
    let ajoutes = 0;
    let retires = 0;
    const regleA = REGLES_DE_SEUIL[id]?.brasA ?? 'seuil-v1';
    for (const l of seuilFenetre) {
      const a = decisionSousRegle(l, regleA);
      const b = decisionSousRegle(l, id);
      if (b) paris++;
      if (b && !a) ajoutes++;
      if (a && !b) retires++;
    }
    seuil[id] = { decisions: seuilFenetre.length, paris, ajoutes, retires };
  }
  const classes = {
    'classe-accord (P2, 1N2)': tailles(P2, (l) => classeFd(l, 'accord'), (l) => l.aCloture),
    'classe-regime (P2, 1N2)': tailles(P2, (l) => classeFd(l, 'regime'), (l) => l.aCloture),
    'classe-couverture (P2, 2,5)': tailles(P2.filter((l) => l.pM25), (l) => classeFd(l, 'couverture'), (l) => l.aCloture25),
    'confiance-placebo (P2, 1N2)': tailles(P2, (l) => classeFd(l, 'placebo'), (l) => l.aCloture),
    'faux-ingredient (P2, 1N2)': tailles(P2, (l) => classeFd(l, 'faux-ingredient'), (l) => l.aCloture)
  };
  const parOrigine = {};
  for (const origine of ['nuit', 'coup-d-envoi']) {
    const L = p5.filter((l) => l.origine === origine);
    parOrigine[origine] = {
      lignes: L.length,
      avecCloture: compte(L, (l) => l.aCloture),
      etiquette: tailles(L, (l) => classeP5(l, 'etiquette'), (l) => l.aCloture),
      regime: tailles(L, (l) => classeP5(l, 'regime'), (l) => l.aCloture),
      accord: tailles(L, (l) => classeP5(l, 'accord'), (l) => l.aCloture)
    };
  }
  const min = A_PRIORI.lignesParClasse;
  const jugeable = (t) => t.minoritaire >= min;
  const p5Jugeable = (cle) => ['nuit', 'coup-d-envoi'].some((o) => jugeable(parOrigine[o][cle]));
  const jugeables = {};
  for (const [id, f] of Object.entries(FORMES)) {
    if (f.fenetre === 'definition') jugeables[id] = 'definition';
    else if (f.fenetre === 'P5b') jugeables[id] = 'non (P5-b, après le lancement)';
    else if (f.angle === 'seuil') jugeables[id] = 'oui (P1 ≥ 2012 ∪ P2 : toutes les décisions)';
    else if (id === 'poids-par-regime') jugeables[id] = fenetres.P2.r3 >= A_PRIORI.matchsParRegime ? 'oui' : `non (${fenetres.P2.r3} lignes de repli sur P2, ${A_PRIORI.matchsParRegime} exigées)`;
    else if (f.angle === 'combinaison') jugeables[id] = 'oui (P2)';
    else if (id === 'classe-compo') jugeables[id] = 'non (buts des versions ≤ 5 écartés ; le 1N2 ne lit pas la compo)';
    else if (id === 'confiance-v1') jugeables[id] = p5Jugeable('etiquette') ? 'oui (P5-a, par origine)' : 'non (classe minoritaire < 300 dans chaque origine)';
    else if (id === 'classe-regime') jugeables[id] = fenetres.P2.r3 >= A_PRIORI.matchsParRegime || p5Jugeable('regime') ? 'oui' : 'non (P2 : repli < 2 000 ; P5-a : minoritaire < 300 par origine)';
    else if (id === 'classe-accord') jugeables[id] = jugeable(classes['classe-accord (P2, 1N2)']) || p5Jugeable('accord') ? 'oui' : 'non (P2 et P5-a : classe minoritaire < 300)';
    else if (id === 'classe-couverture') jugeables[id] = jugeable(classes['classe-couverture (P2, 2,5)']) ? 'oui (P2)' : 'non (classe minoritaire < 300)';
    else if (id === 'confiance-placebo') jugeables[id] = jugeable(classes['confiance-placebo (P2, 1N2)']) ? 'oui (P2)' : 'non';
    else if (id === 'faux-ingredient') jugeables[id] = jugeable(classes['faux-ingredient (P2, 1N2)']) ? 'oui (P2)' : 'non';
    else jugeables[id] = '?';
  }
  const etalonnage = etalonnerSansResultat(fd);
  return {
    aucunResultatLu: true,
    fenetres,
    etalonnageSansResultat: etalonnage,
    seuil,
    classes,
    p5: { parOrigine, bilan: bilanP5 },
    jugeables,
    controles: [
      { id: 'etalonnage-sans-resultat', casse: !etalonnage.ok, detail: etalonnage.ecarts },
      { id: 'p2-sans-apprentissage', casse: false, detail: 'aucune ligne de P2 dans un ensemble d’apprentissage (vérifié au banc, T-F5)' }
    ]
  };
}
