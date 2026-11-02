/**
 * comptesDesCartons.js — LES COMPTES D'AVANT LE REGARD (étape 33 du plan, lot 1a, 02/11/2026).
 * -----------------------------------------------------------------------
 * Pur. Il compte, par pli et par compétition-saison, ce qui dit si les DÉFINITIONS tiennent, AVANT le regard unique du
 * banc : les statuts des cartons relevés, l'accord de la ligne d'équipe avec le déroulé (et, à côté, les deux autres
 * conventions de ligne), les cartons hors terrain, les cartons notés après la 90e, la garde des vrais zéros, les arbitres
 * (clés, pays vides, homonymes, couverture), les faux arbitres, les fenêtres d'équipe (leurs TAILLES n), les lignes
 * jugeables des corners, tirs et tirs cadrés, les compétitions-saisons aux jaunes « fabriqués ».
 * Il lit des comptes de cartons (les statuts en dépendent) mais ne calcule RIEN qui dise quelle variante gagne : aucun
 * attendu, aucune perte, aucune moyenne par équipe ni par arbitre (test T-B9). Il n'importe que formulesDesCartons.js
 * (les statuts), cartonsAuJourJ.js (la passe : garde, tailles des fenêtres, couverture des arbitres) et reglagesCartons.js
 * (les seuils des contrôles) ; jamais bancDesCartons.js.
 * -----------------------------------------------------------------------
 */

import { STATUTS, estReleve, cleDArbitre } from './formulesDesCartons.js';
import { CartonsAuJourJ } from './cartonsAuJourJ.js';
import { PERIODES_DU_BANC, COMPTES_CASSES } from './reglagesCartons.js';

const dans = (jour, p) => jour >= p.de && jour <= p.a;
const part = (a, b) => (b > 0 ? a / b : null);
const ordre = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function nouveauCompte() {
  return {
    rencontres: 0,
    statuts: Object.fromEntries(STATUTS.map((s) => [s, 0])),
    gardeAppliquee: 0,
    releves: 0,
    jouesNonProlongesNonAttribues: 0,
    compares: 0,
    accordsParType: { convention: 0, jaunesEgalYellow: 0, jaunesEgalYellowPlusDeuxieme: 0 },
    horsTerrain: { cartons: 0, matchs: 0 },
    apres90: { cartons: 0, matchs: 0 },
    deuxiemesJaunes: 0,
    arbitreNomme: 0,
    arbitreAvecUnMatchDAvant: 0,
    fauxAvecUnMatchDAvant: 0,
    fauxSurLignesAArbitre: 0,
    avecMoyenne: 0,
    deuxFenetresAuMoins5: 0,
    fenetres: { n0: 0, n1a4: 0, n5a9: 0, n10a19: 0, n20: 0 },
    jugeables: { corners: 0, tirs: 0, cadres: 0 }
  };
}

const tranche = (n) => (n === 0 ? 'n0' : n < 5 ? 'n1a4' : n < 10 ? 'n5a9' : n < 20 ? 'n10a19' : 'n20');

/**
 * LES COMPTES (générateur : un point d'arrêt par journée) sur le flux `rencontres` (rencontresChronologiques, dans l'ordre),
 * mise en route comprise (elle accumule les fenêtres). Rend { periodes, plis: { miseEnRoute, A, B }, parCompetitionSaison,
 * arbitres, controles: [...], casse }.
 */
export function* comptesDesCartons(rencontres, { periodes = PERIODES_DU_BANC, seuils = COMPTES_CASSES } = {}) {
  const acc = new CartonsAuJourJ();
  const A = periodes.plis[0].apprendre;
  const B = periodes.plis[0].juger;
  const plis = { miseEnRoute: nouveauCompte(), A: nouveauCompte(), B: nouveauCompte() };
  const parCS = new Map();
  const nomsPays = new Map();
  const clesVues = new Set();
  let jour = null;
  let duJour = [];
  let apres = 0;
  const compter = (r, x) => {
    const pli = dans(r.date, A) ? plis.A : dans(r.date, B) ? plis.B : dans(r.date, periodes.miseEnRoute) ? plis.miseEnRoute : null;
    if (!pli) return;
    const cleCS = `${r.league}|${r.saison ?? '?'}`;
    let cs = parCS.get(cleCS);
    if (!cs) {
      cs = { league: r.league, saison: r.saison ?? null, rencontres: 0, statuts: Object.fromEntries(STATUTS.map((s) => [s, 0])), horsTerrain: 0, gardeAppliquee: 0 };
      parCS.set(cleCS, cs);
    }
    for (const c of [pli, cs]) {
      c.rencontres += 1;
      c.statuts[x.statut] += 1;
      if (x.statut !== r.statutBase) c.gardeAppliquee += 1;
    }
    cs.horsTerrain += r.deroule.horsTerrain;
    if (!r.attribue && !r.prolongation && !r.nonJoue) pli.jouesNonProlongesNonAttribues += 1;
    if (x.releve) pli.releves += 1;
    if (['accord', 'ecart-1', 'desaccord'].includes(r.statutBase)) {
      pli.compares += 1;
      const L = r.ligne;
      const d = r.deroule;
      const rDom = d.ligneDom - d.jaunesDom;
      const rExt = d.ligneExt - d.jaunesExt;
      const egal = (jd, je, rd, re) => L.jDom === jd && L.jExt === je && L.rDom === rd && L.rExt === re;
      if (egal(d.jaunesDom - d.jrDom, d.jaunesExt - d.jrExt, rDom + d.jrDom, rExt + d.jrExt)) pli.accordsParType.convention += 1;
      if (egal(d.jaunesDom, d.jaunesExt, rDom + d.jrDom, rExt + d.jrExt)) pli.accordsParType.jaunesEgalYellow += 1;
      if (egal(d.jaunesDom + d.jrDom, d.jaunesExt + d.jrExt, rDom, rExt)) pli.accordsParType.jaunesEgalYellowPlusDeuxieme += 1;
    }
    if (estReleve(r.statutBase) || ['desaccord', 'zero-non-confirme'].includes(r.statutBase)) {
      pli.horsTerrain.cartons += r.deroule.horsTerrain;
      if (r.deroule.horsTerrain) pli.horsTerrain.matchs += 1;
      if (!r.prolongation) {
        pli.apres90.cartons += r.deroule.apres90;
        if (r.deroule.apres90) pli.apres90.matchs += 1;
      }
      pli.deuxiemesJaunes += r.deroule.deuxiemesJaunes;
    }
    if (!x.releve) return;
    if (x.arbitre) pli.arbitreNomme += 1;
    if (x.arbitre && x.arbitre.n >= 1) {
      pli.arbitreAvecUnMatchDAvant += 1;
      if (x.faux && x.faux.n >= 1) pli.fauxSurLignesAArbitre += 1;
    }
    if (x.faux && x.faux.n >= 1) pli.fauxAvecUnMatchDAvant += 1;
    if (x.m) {
      pli.avecMoyenne += 1;
      const nh = x.equipes.home.n;
      const na = x.equipes.away.n;
      pli.fenetres[tranche(nh)] += 1;
      pli.fenetres[tranche(na)] += 1;
      if (nh >= seuils.fenetreMatchs && na >= seuils.fenetreMatchs) pli.deuxFenetresAuMoins5 += 1;
    }
  };
  const compterStats = (r) => {
    const pli = dans(r.date, A) ? plis.A : dans(r.date, B) ? plis.B : null;
    if (!pli || r.coupe || r.attribue || r.prolongation || r.nonJoue) return;
    for (const s of ['corners', 'tirs', 'cadres']) if (r.stats?.[s]?.x && r.stats[s].neutres) pli.jugeables[s] += 1;
  };
  const publier = () => {
    if (!duJour.length) return;
    const inst = acc.finDeJournee();
    for (const r of duJour) {
      compter(r, inst.get(r.matchKey));
      compterStats(r);
      const cle = cleDArbitre(r.arbitre);
      if (cle && !clesVues.has(cle) && (dans(r.date, A) || dans(r.date, B) || dans(r.date, periodes.miseEnRoute))) {
        clesVues.add(cle);
        const nom = r.arbitre.nom;
        if (!nomsPays.has(nom)) nomsPays.set(nom, new Set());
        nomsPays.get(nom).add(r.arbitre.pays ?? '');
      }
    }
    duJour = [];
  };
  for (const r of rencontres) {
    if (r.date > periodes.dernierJourLu) {
      apres += 1;
      continue;
    }
    if (jour !== null && r.date < jour) throw new Error(`comptes des cartons : rencontres dans le désordre (${r.date} après ${jour})`);
    if (jour !== null && r.date !== jour) {
      publier();
      yield jour;
    }
    jour = r.date;
    acc.ajouter(r);
    duJour.push(r);
  }
  publier();
  const homonymes = [...nomsPays].filter(([, p]) => p.size > 1).map(([nom, p]) => ({ nom, pays: [...p].sort(ordre) })).sort((a, b) => ordre(a.nom, b.nom));
  const arbitres = { cles: clesVues.size, paysVide: [...clesVues].filter((c) => c.endsWith('|')).length, homonymes: homonymes.length, exemplesHomonymes: homonymes.slice(0, 15) };
  const parCompetitionSaison = [...parCS.values()].sort((a, b) => ordre(a.league, b.league) || (a.saison ?? 0) - (b.saison ?? 0));
  const aJaunesFabriques = parCompetitionSaison.filter((c) => c.statuts['ligne-a-zero'] > 0).map((c) => ({ league: c.league, saison: c.saison, ligneAZero: c.statuts['ligne-a-zero'], rencontres: c.rencontres })).sort((a, b) => b.ligneAZero - a.ligneAZero);
  // Les contrôles « définition cassée » (reglagesCartons.js, COMPTES_CASSES), sur A et sur B.
  const controles = [];
  for (const nom of ['A', 'B']) {
    const p = plis[nom];
    const c = (id, valeur, seuil, sens) => controles.push({ pli: nom, id, valeur, seuil, casse: valeur === null || (sens === 'min' ? valeur < seuil : valeur > seuil) });
    c('releves', part(p.releves, p.jouesNonProlongesNonAttribues), seuils.releveMin, 'min');
    c('accord', part(p.statuts.accord, p.compares), seuils.accordMin, 'min');
    c('desaccord', part(p.statuts.desaccord, p.compares), seuils.desaccordMax, 'max');
    c('vraiZero', part(p.statuts['vrai-zero'] - 0, p.releves), seuils.vraiZeroMax, 'max');
    c('arbitreConnu', part(p.arbitreNomme, p.releves), seuils.arbitreMin, 'min');
    c('deuxFenetres', part(p.deuxFenetresAuMoins5, p.avecMoyenne), seuils.fenetresMin, 'min');
    c('cornersJugeables', p.jugeables.corners, seuils.cornersMin, 'min');
    c('fauxArbitre', part(p.fauxSurLignesAArbitre, p.arbitreAvecUnMatchDAvant), seuils.fauxMin, 'min');
  }
  return {
    periodes,
    rencontresApresLeDernierJour: apres,
    plis,
    parCompetitionSaison,
    aJaunesFabriques,
    arbitres,
    controles,
    casse: controles.some((x) => x.casse)
  };
}
