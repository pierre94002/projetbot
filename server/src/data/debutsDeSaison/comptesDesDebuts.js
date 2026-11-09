/**
 * comptesDesDebuts.js — LES COMPTES D'AVANT LE REGARD des débuts de saison (étape 35 du plan, lot 1a, partie B, 09/11/2026 ;
 * conception §5.8, étape 2).
 * -----------------------------------------------------------------------
 * Pur. AUCUN résultat : il ne reçoit que des passes SANS résultat (passeDesDebuts.js, avecForces: false : ni score, ni but,
 * ni xG — seulement la PRÉSENCE d'un score à la 90e), des minutes, des statuts, des zones officielles de la saison d'avant
 * (un compte de contrôle, jamais un chiffre), et, pour la force de l'effectif, les Δ des fiches de l'étape 30 (la passe des
 * fiches lit les feuilles d'avant J, comme chaque nuit ; aucun score n'est comparé à une prévision). Il ne calcule AUCUNE
 * perte, AUCUN réglage, AUCUN oubli ni centre : il n'importe jamais bancDesDebuts.js (T-B9).
 * Par fenêtre (magasin : A = 2023-07 → 2025-06, B = 2025-07 → 2026-09-23 ; football-data : P1, P2) : les matchs de
 * championnat, les ensembles concernés, les statuts, les montées et descentes par frontière (et leur accord avec la zone
 * officielle), les nouveaux venus par championnat-saison, les faux points, le seuil du faux promu et sa taille, la
 * continuité, la couverture et l'écart-type des Δ ; puis les contrôles « définition cassée » (COMPTES_CASSES).
 * -----------------------------------------------------------------------
 */

import { COMPTES_CASSES, N_PREMIERES, EFFECTIF, NOUVEAUX_VERIFIES_FD } from './reglagesDebuts.js';
import { estFauxPromu, seuilDuFauxPromu, fauxPointDe, saisonCivile } from './formulesDebuts.js';

const MOUVEMENT = new Set(['promu', 'relegue']);
const part = (n, d) => (d ? Math.round((10000 * n) / d) / 10000 : null);
const quantiles = (valeurs) => {
  const v = valeurs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const q = (p) => v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))];
  const m = v.reduce((s, x) => s + x, 0) / v.length;
  const sd = v.length > 1 ? Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)) : null;
  return { n: v.length, min: v[0], q10: q(0.1), q25: q(0.25), mediane: q(0.5), q75: q(0.75), q90: q(0.9), max: v.at(-1), moyenne: m, ecartType: sd };
};

/** Les fenêtres d'une source : leurs noms dans la passe. */
const FENETRES = Object.freeze({ magasin: ['A', 'B'], fd: ['P1', 'P2'] });

/**
 * LES COMPTES D'UNE PASSE (sans résultat). `passe` : { records, comptes } (passeDesDebuts, avecForces: false) ; `source` :
 * 'magasin' | 'fd' ; `zones` : Map « league|saison|club » → description de la zone officielle (magasin) ; `paysDesClubs` :
 * Map club → pays (football-data) ; `niveaux` : la table des divisions ; `dernierJourLu` : le dernier jour de la fenêtre (le
 * faux point ne se compte que sur les clubs-saisons dont le jour du faux point est lu). Rend { parFenetre, statuts,
 * frontieres, nouveaux, fauxPoints, fauxPromu, continuite, effectif }.
 */
export function comptesDUnePasse(passe, { source, zones = null, paysDesClubs = null, niveaux = {}, dernierJourLu = null }) {
  const fenetres = FENETRES[source];
  const { records, comptes } = passe;
  const clubsSaisons = [...comptes.clubsSaisons.values()];
  // 1. les statuts des clubs-saisons (au premier match de championnat), par fenêtre
  const statuts = {};
  for (const f of [...fenetres, 'miseEnRoute', 'avant']) statuts[f] = {};
  for (const c of clubsSaisons) {
    const f = c.fenetre && statuts[c.fenetre] ? c.fenetre : 'avant';
    statuts[f][c.statut] = (statuts[f][c.statut] ?? 0) + 1;
  }
  // 2. les montées et descentes par frontière (ancien → nouveau championnat), et leur zone officielle de la saison d'avant
  const frontieres = {};
  let zonesLues = 0;
  let zonesContraires = 0;
  let zonesAbsentes = 0;
  const contraires = [];
  for (const c of clubsSaisons) {
    if (!MOUVEMENT.has(c.statut) || !fenetres.includes(c.fenetre)) continue;
    const cle = `${c.ligueAvant} → ${c.league}`;
    const fr = (frontieres[cle] ??= { sens: c.statut, parFenetre: {} });
    fr.parFenetre[c.fenetre] = (fr.parFenetre[c.fenetre] ?? 0) + 1;
    if (zones) {
      const z = zones.get(`${c.ligueAvant}|${c.saison - 1}|${c.club}`) ?? null;
      if (z === null) zonesAbsentes += 1;
      else {
        zonesLues += 1;
        const monte = /promotion/i.test(z);
        const descend = /relegation/i.test(z);
        if ((c.statut === 'promu' && descend && !monte) || (c.statut === 'relegue' && monte && !descend)) {
          zonesContraires += 1;
          contraires.push({ club: c.club, saison: c.saison, de: c.ligueAvant, vers: c.league, statut: c.statut, zone: z });
        }
      }
    }
  }
  // 3. les nouveaux venus par championnat-saison (part des clubs du championnat-saison)
  const parLigueSaison = new Map();
  for (const c of clubsSaisons) {
    if (!fenetres.includes(c.fenetre)) continue;
    const k = `${c.league}|${c.saison}`;
    const v = parLigueSaison.get(k) ?? { league: c.league, saison: c.saison, clubs: 0, nouveaux: 0, numeros: [] };
    v.clubs += 1;
    if (c.statut === 'nouveau') {
      v.nouveaux += 1;
      v.numeros.push(c.club);
    }
    parLigueSaison.set(k, v);
  }
  // une division-saison football-data VÉRIFIÉE (NOUVEAUX_VERIFIES_FD) : ses nouveaux venus sont exactement les numéros listés
  const verifiee = (v) => source === 'fd' && NOUVEAUX_VERIFIES_FD.some((x) => x.league === v.league && x.saison === v.saison && x.clubs.length === v.numeros.length && x.clubs.every((n) => v.numeros.includes(n)));
  const nouveaux = [...parLigueSaison.values()].map((v) => ({ ...v, numeros: [...v.numeros].sort((a, b) => a - b), part: part(v.nouveaux, v.clubs), verifiee: verifiee(v) })).sort((a, b) => b.part - a.part || (a.league < b.league ? -1 : 1));
  // 4. le seuil du faux promu de la fenêtre (taille des vrais promus et relégués)
  const mouv = clubsSaisons.filter((c) => fenetres.includes(c.fenetre) && MOUVEMENT.has(c.statut)).length;
  const deb = clubsSaisons.filter((c) => fenetres.includes(c.fenetre) && c.statut === 'debut');
  const seuil = seuilDuFauxPromu({ mouvements: mouv, debuts: deb.length });
  const fauxPromus = deb.filter((c) => estFauxPromu(c.club, c.saison, seuil)).length;
  // 5. les faux points : les clubs-saisons qui jouent dans la fenêtre et n'en ont pas ; le contrôle, sur ceux dont le JOUR du
  //    faux point est lu (au plus `dernierJourLu`) — une saison coupée par la fin de la fenêtre n'en a pas, par construction
  const joueurs = [...comptes.clubsDeLaFenetre.entries()].filter(([, v]) => fenetres.includes(v.fenetre));
  const sansFauxPoint = joueurs.filter(([k]) => !comptes.fauxPoints.has(k)).length;
  const jourLu = ([k, v]) => {
    if (!dernierJourLu) return true;
    const [club, saison] = k.split('|').map(Number);
    return fauxPointDe(club, saison, saisonCivile(v.league, { fd: source === 'fd' })) <= dernierJourLu;
  };
  const joueursLus = joueurs.filter(jourLu);
  const sansFauxPointLus = joueursLus.filter(([k]) => !comptes.fauxPoints.has(k)).length;
  // 6. les ensembles et la continuité, par fenêtre
  const parFenetre = {};
  for (const f of fenetres) {
    const rs = records.filter((r) => r.fenetre === f);
    const compte = (pred) => rs.filter(pred).length;
    const conts = rs.flatMap((r) => [r.h, r.a]).filter((c) => c.valide && c.statut === 'debut' && c.rang >= 2 && c.rang <= N_PREMIERES);
    const fauxP = (r) => [r.h, r.a].some((c) => c.valide && c.statut === 'debut' && c.rang <= N_PREMIERES && estFauxPromu(c.club, c.saison, seuil));
    const eff = rs.flatMap((r) => [r.h, r.a]).filter((c) => c.valide && c.statut === 'debut' && c.rang >= EFFECTIF.rangMin && c.rang <= EFFECTIF.rangMax);
    parFenetre[f] = {
      championnat: comptes.parFenetre[f]?.championnat ?? 0,
      sansScore90: comptes.parFenetre[f]?.sansScore90 ?? 0,
      ensembles: {
        rappel: compte((r) => r.ens.rappel),
        promus: compte((r) => r.ens.promus),
        nouveaux: compte((r) => r.ens.nouveaux),
        fausse: compte((r) => r.ens.fausse),
        fauxPromu: compte((r) => r.ens.rappel && fauxP(r)),
        rappel1120: compte((r) => r.ens.rappel1120 && !r.ens.rappel),
        tout: rs.length
      },
      clubsSaisons: {
        promusEtRelegues: clubsSaisons.filter((c) => c.fenetre === f && MOUVEMENT.has(c.statut)).length,
        nouveaux: clubsSaisons.filter((c) => c.fenetre === f && c.statut === 'nouveau').length,
        debut: clubsSaisons.filter((c) => c.fenetre === f && c.statut === 'debut').length
      },
      continuite: source === 'magasin' ? { clubsMatchs: conts.length, nulle: conts.filter((c) => c.continuite === null).length, distribution: quantiles(conts.map((c) => c.continuite)) } : null,
      effectif: source === 'magasin' ? { clubsMatchs: eff.length, avecDelta: eff.filter((c) => c.effectif).length, couverture: quantiles(eff.filter((c) => c.effectif).map((c) => c.effectif.couverture)) } : null
    };
  }
  // 7. les Δ de la force de l'effectif (plis A ∪ B) : écart-type (la standardisation), quantiles
  let effectif = null;
  if (source === 'magasin') {
    const cs = records.filter((r) => fenetres.includes(r.fenetre)).flatMap((r) => [r.h, r.a]).filter((c) => c.valide && c.statut === 'debut' && c.rang >= EFFECTIF.rangMin && c.rang <= EFFECTIF.rangMax && c.effectif);
    effectif = { clubsMatchs: cs.length, dOff: quantiles(cs.map((c) => c.effectif.dOff)), dDef: quantiles(cs.map((c) => c.effectif.dDef)), faux: cs.filter((c) => c.effectifFaux).length };
  }
  // 8. football-data : un club rangé dans des divisions de deux pays ?
  let deuxPays = null;
  if (source === 'fd' && paysDesClubs) {
    const pays = new Map();
    for (const c of clubsSaisons) {
      const p = niveaux[c.league]?.pays ?? null;
      if (!pays.has(c.club)) pays.set(c.club, new Set());
      pays.get(c.club).add(p);
      if (paysDesClubs.get(c.club) && p && paysDesClubs.get(c.club) !== p) pays.get(c.club).add(`fd_teams:${paysDesClubs.get(c.club)}`);
    }
    deuxPays = [...pays.entries()].filter(([, s]) => s.size > 1).map(([club, s]) => ({ club, pays: [...s] }));
  }
  return {
    source,
    lues: comptes.lues,
    deChampionnat: comptes.deChampionnat,
    attribuees: comptes.attribuees,
    statuts,
    frontieres,
    zones: zones ? { lues: zonesLues, absentes: zonesAbsentes, contraires: zonesContraires, part: part(zonesContraires, zonesLues), liste: contraires } : null,
    nouveaux: { pire: nouveaux.slice(0, 10), pireNonVerifiee: nouveaux.find((v) => !v.verifiee) ?? null, verifiees: nouveaux.filter((v) => v.verifiee), parLigueSaison: nouveaux },
    fauxPromu: { mouvements: mouv, debuts: deb.length, seuil, fauxPromus, ecart: mouv ? (fauxPromus - mouv) / mouv : null },
    fauxPoints: {
      clubsSaisonsQuiJouent: joueurs.length,
      sansFauxPoint,
      part: part(sansFauxPoint, joueurs.length),
      dernierJourLu,
      jourLu: { clubsSaisons: joueursLus.length, sansFauxPoint: sansFauxPointLus, part: part(sansFauxPointLus, joueursLus.length) },
      coupeesParLaFin: joueurs.length - joueursLus.length
    },
    parFenetre,
    effectif,
    deuxPays
  };
}

/**
 * LES CONTRÔLES « DÉFINITION CASSÉE » (COMPTES_CASSES, fixés dans les règles AVANT le regard) sur les comptes du magasin et de
 * football-data. Rend [{ id, fenetre, valeur, seuil, casse, quoi }] ; une définition cassée se corrige avant le regard.
 */
export function controlesDesComptes({ magasin, fd }) {
  const C = COMPTES_CASSES;
  const out = [];
  const ajouter = (id, fenetre, valeur, seuil, casse, quoi) => out.push({ id, fenetre, valeur, seuil, casse: Boolean(casse), quoi });
  if (magasin) {
    for (const f of ['A', 'B']) {
      const pf = magasin.parFenetre[f];
      ajouter('rappel-min', f, pf.ensembles.rappel, C.rappelMinParPeriode, pf.ensembles.rappel < C.rappelMinParPeriode, 'matchs du rappel (au moins un club « debut » de rang ≤ 10)');
      ajouter('promus-min', f, pf.clubsSaisons.promusEtRelegues, C.promusMinClubsSaisonsParPeriode, pf.clubsSaisons.promusEtRelegues < C.promusMinClubsSaisonsParPeriode, 'clubs-saisons promus ou relégués suivis');
      if (pf.effectif) {
        const manque = pf.effectif.clubsMatchs ? 1 - pf.effectif.avecDelta / pf.effectif.clubsMatchs : 0;
        ajouter('effectif-manquant', f, Math.round(manque * 10000) / 10000, C.effectifManquantMaxPart, manque > C.effectifManquantMaxPart, 'part des clubs « debut » de rang 3 à 10 sans Δ de la force de l’effectif');
      }
    }
    const pire = magasin.nouveaux.pire[0];
    ajouter('nouveaux-max', 'A∪B', pire?.part ?? 0, C.nouveauxMaxPartDUnChampionnat, (pire?.part ?? 0) > C.nouveauxMaxPartDUnChampionnat, `part des nouveaux venus du championnat-saison le plus touché${pire ? ` (${pire.league} ${pire.saison})` : ''}`);
    if (magasin.zones) ajouter('zones-contraires', 'A∪B', magasin.zones.part ?? 0, C.zoneContraireMaxPart, (magasin.zones.part ?? 0) > C.zoneContraireMaxPart, 'montées et descentes dont la zone officielle de la saison d’avant dit le sens contraire');
    const fp = magasin.fauxPoints.jourLu ?? magasin.fauxPoints;
    ajouter('faux-point-manquant', 'A∪B', fp.part ?? 0, C.fauxPointManquantMaxPart, (fp.part ?? 0) > C.fauxPointManquantMaxPart, `clubs-saisons qui jouent dans la fenêtre sans faux point, parmi ceux dont le jour du faux point est lu (${magasin.fauxPoints.coupeesParLaFin ?? 0} saisons coupées par la fin de la fenêtre à part)`);
    const e = magasin.fauxPromu.ecart;
    ajouter('faux-promu-taille', 'A∪B', e === null ? null : Math.round(e * 10000) / 10000, C.fauxPromuEcartMaxPart, e === null || Math.abs(e) > C.fauxPromuEcartMaxPart, 'écart du nombre de faux promus au nombre de vrais promus et relégués');
  }
  if (fd) {
    ajouter('p2-promus-min', 'P2', fd.parFenetre.P2.clubsSaisons.promusEtRelegues, C.p2PromusMinClubsSaisons, fd.parFenetre.P2.clubsSaisons.promusEtRelegues < C.p2PromusMinClubsSaisons, 'clubs-saisons promus ou relégués de P2');
    ajouter('p1-min', 'P1', fd.parFenetre.P1.ensembles.tout, C.p1MinMatchs, fd.parFenetre.P1.ensembles.tout < C.p1MinMatchs, 'matchs de championnat de P1 (le k0 du commun fd s’y apprend)');
    const e = fd.fauxPromu.ecart;
    ajouter('faux-promu-taille-fd', 'P1∪P2', e === null ? null : Math.round(e * 10000) / 10000, C.fauxPromuEcartMaxPart, e === null || Math.abs(e) > C.fauxPromuEcartMaxPart, 'écart du nombre de faux promus au nombre de vrais promus et relégués');
    ajouter('club-deux-pays', 'fd', fd.deuxPays?.length ?? 0, C.clubFdDansDeuxPays, (fd.deuxPays?.length ?? 0) > C.clubFdDansDeuxPays, 'clubs football-data rangés dans des divisions de deux pays');
    const pire = fd.nouveaux.pireNonVerifiee ?? null;
    const verifiees = (fd.nouveaux.verifiees ?? []).map((v) => `${v.league} ${v.saison}`).join(', ');
    ajouter('nouveaux-max-fd', 'P1∪P2', pire?.part ?? 0, C.nouveauxMaxPartDUnChampionnat, (pire?.part ?? 0) > C.nouveauxMaxPartDUnChampionnat, `part des nouveaux venus de la division-saison la plus touchée${pire ? ` (${pire.league} ${pire.saison})` : ''}${verifiees ? ` ; vérifiées une par une, à part : ${verifiees}` : ''}`);
  }
  return out;
}
