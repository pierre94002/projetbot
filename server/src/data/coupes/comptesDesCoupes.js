/**
 * comptesDesCoupes.js — LES COMPTES D'AVANT LE REGARD (étape 36 du plan, lot 1, 09/11/2026).
 * -----------------------------------------------------------------------
 * Pur : aucune base, aucun fichier, aucune horloge, aucun hasard. N'importe NI calibrationDesCoupes.js NI qualification.js
 * et n'appelle ni modeleDeButs ni comparer (T-B9) : il lit des scores et des suites (les issues en dépendent), jamais une
 * force, une probabilité ni une perte — il ne dit rien de la calibration.
 *
 * Par fenêtre (la mise en route, A = 2023-07 → 2025-06, B = 2025-07 → 2026-09-23) et par compétition-saison : les
 * rencontres, doublons et intitulés `brut:` ; les blocs par nature et les paires ; les rejouages ; les unités par nature
 * et les exclusions par raison ; les fins ; les observations du format ; les séances (carte, tour suivant, les deux,
 * désaccord, inconnues) ; les contrôles (le qualifié rejoue, l'accord carte / tour suivant) ; les buts à l'extérieur ; les
 * unités jugeables ; les retours à avance non nulle avec un score à la 90e ; le lieu ; la couverture de la base. Puis les
 * contrôles « définition cassée » (reglagesCoupes.js, COMPTES_CASSES), sur A et sur B.
 * -----------------------------------------------------------------------
 */

import { COMPTES_CASSES, COUPES_UEFA, PERIODES_DU_BANC } from './reglagesCoupes.js';

const dans = (jour, p) => jour >= p.de && jour <= p.a;
const part = (n, d) => (d ? Math.round((1e4 * n) / d) / 1e4 : null);
const plus = (o, cle, n = 1) => {
  o[cle] = (o[cle] ?? 0) + n;
};
const connu = (x) => x !== null && x !== undefined && x !== '';

/** Les fenêtres des comptes : la mise en route, A (2023-07 → 2025-06) et B (2025-07 → 2026-09-23). */
export function fenetresDesComptes(periodes = PERIODES_DU_BANC) {
  const A = periodes.plis[0].apprendre;
  const B = periodes.plis[0].juger;
  return { miseEnRoute: periodes.miseEnRoute, A, B };
}

/** Une case de comptes vide. */
const caseVide = () => ({
  rencontres: 0,
  doublons: 0,
  brut: 0,
  natures: {},
  paires: 0,
  rejouages: 0,
  sansPaire: 0,
  unites: {},
  exclusions: {},
  fins: {},
  observations: {},
  seances: {},
  qualifieRejoue: { ok: 0, n: 0 },
  accordCarte: { ok: 0, n: 0 },
  butsExterieur: 0,
  jugeables: 0,
  retoursAvanceA90: 0,
  lieux: {},
  sansMatchAvant: 0
});

/**
 * LES COMPTES. `saisons` : [{ league, saison, cs (confrontations.coupeSaison), controles (controlesDeLaCoupeSaison),
 * lieux (Map clé du décisif → valeur du lieu), premiers (Map club → premier jour au magasin) }]. Rend { fenetres,
 * parFenetre, parCoupeSaison, intitulesBruts, controles, casse }.
 */
export function comptesDesCoupes(saisons, { periodes = PERIODES_DU_BANC, premiers = new Map() } = {}) {
  const fenetres = fenetresDesComptes(periodes);
  const parFenetre = Object.fromEntries(Object.keys(fenetres).map((k) => [k, caseVide()]));
  const parCoupeSaison = [];
  const intitulesBruts = new Map();
  const uefa = [];
  const ou = (jour) => Object.entries(fenetres).filter(([, p]) => dans(jour, p)).map(([k]) => parFenetre[k]);
  for (const s of saisons) {
    const cs = s.cs;
    const ici = caseVide();
    const cases = (jour) => [ici, ...ou(jour)];
    for (const x of cs.rencontres) {
      for (const c of cases(x.r.date)) {
        c.rencontres++;
        plus(c.natures, x.nature);
        if (x.bloc.code.startsWith('brut:')) c.brut++;
      }
      if (x.bloc.code.startsWith('brut:')) intitulesBruts.set(x.bloc.code, (intitulesBruts.get(x.bloc.code) ?? 0) + 1);
    }
    for (const d of cs.doublons) for (const c of cases(d.date)) c.doublons++;
    for (const b of cs.blocs) {
      const n = cs.natures.get(b.id);
      for (const p of n.paires) {
        for (const c of cases(p.retour.date)) {
          if (n.nature === 'aller-retour') c.paires++;
          if (n.nature === 'un-match-rejouages') c.rejouages++;
        }
      }
    }
    const sansPaire = new Set(cs.sansPaire);
    for (const x of cs.rencontres) if (sansPaire.has(x.r.matchKey)) for (const c of cases(x.r.date)) c.sansPaire++;
    for (const o of cs.observations) for (const c of cases(o.date)) plus(c.observations, o.observation);
    const verif = new Map((s.controles?.verifications ?? []).map((v) => [v.cle, v]));
    for (const u of cs.unites) {
      const i = u.issue;
      const v = verif.get(u.cle) ?? {};
      const idsConnus = connu(u.decisif.home) && connu(u.decisif.away);
      for (const c of cases(u.date)) {
        plus(c.unites, u.nature);
        if (!idsConnus) plus(c.exclusions, 'identifiant-inconnu');
        else if (i.raison) plus(c.exclusions, i.raison);
        if (i.comment) plus(c.fins, i.comment);
        if (v.seance) plus(c.seances, v.seance);
        if (v.qualifieRejoue !== null && v.qualifieRejoue !== undefined) {
          c.qualifieRejoue.n++;
          if (v.qualifieRejoue) c.qualifieRejoue.ok++;
        }
        if (v.accord !== null && v.accord !== undefined) {
          c.accordCarte.n++;
          if (v.accord) c.accordCarte.ok++;
        }
        if (v.butsExterieur) c.butsExterieur++;
        if (idsConnus && i.qualifie) {
          c.jugeables++;
          const buts90 = u.decisif.fin === 'afterextra' || u.decisif.fin === 'afterpenalties' ? connu(u.decisif.bp90) && connu(u.decisif.bc90) : true;
          if (u.nature === 'retour' && u.avance !== 0 && buts90) c.retoursAvanceA90++;
        }
        plus(c.lieux, s.lieux?.get(u.cle) ?? 'inconnu');
        const avant = (club) => connu(club) && premiers.has(club) && premiers.get(club) < u.date;
        if (idsConnus && (!avant(u.decisif.home) || !avant(u.decisif.away))) c.sansMatchAvant++;
      }
    }
    parCoupeSaison.push({ league: s.league, saison: s.saison, ...ici, qualifieRejoue: { ...ici.qualifieRejoue, part: part(ici.qualifieRejoue.ok, ici.qualifieRejoue.n) }, accordCarte: { ...ici.accordCarte, part: part(ici.accordCarte.ok, ici.accordCarte.n) } });
    if (COUPES_UEFA.includes(s.league)) uefa.push({ league: s.league, saison: s.saison, cas: ici.butsExterieur });
  }
  // LES CONTRÔLES « définition cassée », sur A et sur B.
  const controles = [];
  for (const nom of ['A', 'B']) {
    const c = parFenetre[nom];
    const seances = Object.values(c.seances).reduce((t, n) => t + n, 0);
    const ambigu = c.natures.ambigu ?? 0;
    controles.push(
      { pli: nom, id: 'ambigu', valeur: part(ambigu, c.rencontres), seuil: COMPTES_CASSES.ambiguMax, casse: c.rencontres > 0 && ambigu / c.rencontres > COMPTES_CASSES.ambiguMax },
      { pli: nom, id: 'qualifie-rejoue', valeur: part(c.qualifieRejoue.ok, c.qualifieRejoue.n), seuil: COMPTES_CASSES.qualifieRejoueMin, casse: c.qualifieRejoue.n > 0 && c.qualifieRejoue.ok / c.qualifieRejoue.n < COMPTES_CASSES.qualifieRejoueMin },
      { pli: nom, id: 'accord-carte', valeur: part(c.accordCarte.ok, c.accordCarte.n), seuil: COMPTES_CASSES.accordCarteMin, casse: c.accordCarte.n > 0 && c.accordCarte.ok / c.accordCarte.n < COMPTES_CASSES.accordCarteMin },
      { pli: nom, id: 'seances-inconnues', valeur: part((c.seances.inconnue ?? 0) + (c.seances.desaccord ?? 0), seances), seuil: COMPTES_CASSES.seanceInconnueMax, casse: seances > 0 && ((c.seances.inconnue ?? 0) + (c.seances.desaccord ?? 0)) / seances > COMPTES_CASSES.seanceInconnueMax },
      { pli: nom, id: 'unites-jugeables', valeur: c.jugeables, seuil: COMPTES_CASSES.unitesMin, casse: c.jugeables < COMPTES_CASSES.unitesMin }
    );
  }
  const uefaCasses = uefa.filter((x) => x.cas >= COMPTES_CASSES.butsExterieurUefa);
  controles.push({ pli: 'A+B', id: 'buts-exterieur-uefa', valeur: uefaCasses.map((x) => `${x.league} ${x.saison}`), seuil: COMPTES_CASSES.butsExterieurUefa, casse: uefaCasses.length > 0 });
  return {
    fenetres,
    parFenetre,
    parCoupeSaison,
    intitulesBruts: Object.fromEntries([...intitulesBruts.entries()].sort()),
    controles,
    casse: controles.some((c) => c.casse)
  };
}
