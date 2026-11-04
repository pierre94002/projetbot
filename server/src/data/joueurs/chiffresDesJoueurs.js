/**
 * chiffresDesJoueurs.js — LES CHIFFRES À BLANC DES JOUEURS D'UN MATCH À VENIR (étape 34 du plan, lot 1b, 03/11/2026).
 * -----------------------------------------------------------------------
 * Pur : ni base, ni fichier, ni horloge, ni hasard. UNE SEULE formule pour la nuit (l'archive « dernière alignée »),
 * l'enregistreur d'avant-match (l'archive « publiée ») et l'écran (joueursRead.js) — c'est celle du banc (bancDesJoueurs.js :
 * partsDuCamp, lignesDuCamp), appliquée avec les VALEURS FINALES de la note recopiée (noteDesJoueurs.js : κ, recalages de la
 * base, q_csc, q_pen, a, κ_av, 1/k, recalage par dixièmes) et le modèle retenu de chaque famille (bras B si la famille est
 * « mesurée » au banc, sinon le repère du poste ; les penalties au tireur seulement si « buteur-tireur » est utile) :
 *   - LES ENTRÉES d'une composition (entreesDepuisLesFiches) : la même chose que JoueursAuJourJ.entreesDUneComposition,
 *     mais depuis les fiches rangées la nuit (joueurs_fiches) et les repères du jour de la nuit (joueurs_etat « reperes ») ;
 *   - LES PARTS d'un camp : les titulaires et le BLOC des remplaçants dans la normalisation (critique, constat 2) ; le
 *     chiffre d'un remplaçant (« s'il entre en jeu ») se calcule HORS de la somme, avec ses minutes d'entrant ;
 *   - LA DERNIÈRE ALIGNÉE (critique, constat 3) : les absents annoncés RETIRÉS (leurs minutes vont au bloc) ; le chiffre est
 *     « s'il joue » : P(· | joue) = [p_t · P(· | titulaire) + p_e · P(· | entre)] / (p_t + p_e), p_t et p_e = les COMPTES de
 *     compositions de `--comptes` (aucun résultat ; DERNIERE_ALIGNEE, recopiés de la fixture et vérifiés par un test) ;
 *   - LES GARDIENS : chiffre du poste (ils ne sont pas jugés au banc : reglagesJoueurs.GARDIENS_JUGES).
 * Rien ici n'entre dans le moteur : hors de l'empreinte (data/joueurs/), aucun fichier du moteur ne l'importe.
 * -----------------------------------------------------------------------
 */

import { SIGNAUX, BORNES_LAMBDA, GARDIENS_JUGES, MINUTES_DU_MATCH, VERSION_JOUEURS } from './reglagesJoueurs.js';
import { minutesAttendues, chanceDEntrer, partDesButs, loiDesTirsCadres, probaAverti, recaler, coteJuste, nombre } from './formulesDesJoueurs.js';

const gele = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) gele(v);
  }
  return o;
};
const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const NS = SIGNAUX.length;
const S = Object.freeze(Object.fromEntries(SIGNAUX.map((s, i) => [s, i])));
const R = 5;
const identifie = (id) => Number.isSafeInteger(id) && id > 0;
const vide5 = () => [0, 0, 0, 0, 0];
const arrondi = (x, d = 6) => (fini(x) ? Number(x.toFixed(d)) : null);
/** La base recalée d'un camp (la formule de bancDesJoueurs.baseRecalee, recopiée pour ne pas charger le banc dans le serveur ; égalité testée). */
export const baseRecalee = (r, dom, base, bornes = null) => {
  if (!fini(base) || !(base > 0)) return NaN;
  const v = Math.exp((dom ? r.cDom : r.cExt) + r.beta * Math.log(base));
  return bornes ? Math.min(bornes[1], Math.max(bornes[0], v)) : v;
};

/**
 * LES COMPTES DE COMPOSITIONS de la dernière alignée (--comptes du 03/11/2026, `comptes-joueurs-2.json`, sha1
 * 8814bfe73ff10753b276ca628888268696cc0df0, plis A et B réunis ; copie dans test/fixtures/comptes-joueurs-etape34.json,
 * égalité vérifiée par joueursEcran.test.mjs) : des titulaires de la dernière feuille d'un club, combien ont été
 * titulaires au match suivant, combien sont entrés en jeu, combien n'ont pas joué. Aucun résultat de match.
 */
export const DERNIERE_ALIGNEE = gele({
  source: 'comptes d’avant le regard du banc (--comptes, 03/11/2026), plis A et B réunis',
  titulairesDeLaFeuille: 1108769,
  titulairesAuMatch: 817305,
  entres: 116110,
  absents: 175354
});
/** p_t et p_e de la dernière alignée (parts parmi les titulaires de la dernière feuille). */
export const P_T = DERNIERE_ALIGNEE.titulairesAuMatch / DERNIERE_ALIGNEE.titulairesDeLaFeuille;
export const P_E = DERNIERE_ALIGNEE.entres / DERNIERE_ALIGNEE.titulairesDeLaFeuille;

/** Les états de la compo, et les états de la lecture. */
export const ETATS_DE_LA_COMPO = Object.freeze(['publiee', 'derniere-alignee']);

/** La variante dont les dixièmes recalent chaque famille, selon son bras (et le tireur pour la marque). */
function varianteDesDixiemes(famille, bras, tireur) {
  if (famille === 'marque') return bras === 'B' && tireur ? 'buteur-tireur' : 'buteur-parts';
  return { cadres: 'cadres-parts', averti: 'averti-parts', passeur: 'passeur-parts' }[famille];
}

/**
 * LES PARAMÈTRES DE L'ÉCRAN, tirés de la note du banc (null sans note : « pas encore mesuré », aucun pourcentage). Rend
 * { version, kappa: { np, pen, sot, av, xa } (bras B, en unités du signal), bras: { marque, cadres, averti, passeur },
 * tireur, recalageLambda, recalageCadres, qCsc, qPen, a, kAv, invK: { A, B }, dixiemes: { famille: table }, statuts }.
 */
export function parametresDeLEcran(note) {
  const f = note?.final;
  if (!note || !f) return null;
  const st = note.statuts ?? {};
  const bras = Object.fromEntries(['marque', 'cadres', 'averti', 'passeur'].map((fam) => [fam, st[fam]?.statut === 'mesure' ? 'B' : 'A']));
  const tireur = bras.marque === 'B' && st.marque?.tireur === true;
  const kappa = Object.fromEntries(SIGNAUX.map((s) => [s, fini(f.kappaMatchs?.[`${s}:B`]) ? f.kappaMatchs[`${s}:B`] * (f.Tbar?.[s] || 1) : Infinity]));
  const dixiemes = {};
  for (const fam of ['marque', 'cadres', 'averti', 'passeur']) dixiemes[fam] = f.dixiemes?.[`${varianteDesDixiemes(fam, bras[fam], tireur)}:${bras[fam]}`] ?? null;
  return {
    version: note.version ?? VERSION_JOUEURS,
    calculeLe: note.calculeLe ?? null,
    kappa,
    bras,
    tireur,
    recalageLambda: f.recalageLambda,
    recalageCadres: f.recalageCadres,
    qCsc: f.qCsc,
    qPen: f.qPen,
    a: f.a,
    kAv: f.kAv,
    invK: { A: f.invK?.['sot:A'] ?? 0, B: f.invK?.['sot:B'] ?? 0 },
    dixiemes,
    statuts: JSON.parse(JSON.stringify(st))
  };
}

/** Le repère du bras A d'un poste dans une compétition : repère global × rapport de la compétition (null s'il manque). */
export function repereDe(reperes, league, poste) {
  const g = reperes?.global?.[poste] ?? null;
  const r = reperes?.ligues?.[league]?.[poste] ?? null;
  return SIGNAUX.map((_, i) => {
    const gi = g?.[i];
    if (!fini(gi)) return null;
    const ri = fini(r?.[i]) ? r[i] : 1;
    return gi * ri;
  });
}

/** Le poste d'une ligne de composition (« Goalkeeper »… ou 1 à 4) ; null sinon. */
const POSTES_TEXTE = { Goalkeeper: 1, Defender: 2, Sweeper: 2, Midfielder: 3, Forward: 4 };
export function posteDeLaCompo(position) {
  if (typeof position === 'number') return position >= 1 && position <= 4 ? position : null;
  return POSTES_TEXTE[String(position ?? '')] ?? null;
}

/**
 * LES ENTRÉES D'UNE COMPOSITION depuis les fiches de la nuit (même forme que JoueursAuJourJ.entreesDUneComposition, sans
 * les faux joueurs) : `joueurs` [{ id (numéro FotMob après fusion, ou null), poste (code 1-4 de la ligne, ou null),
 * titulaire }], `fiches` Map(id → ligne de joueurs_fiches), `reperes` (joueurs_etat « reperes »), `league`, `club`.
 */
export function entreesDepuisLesFiches({ joueurs, fiches, reperes, league, club }) {
  const m0 = (p) => (fini(reperes?.minutes?.[p]) ? reperes.minutes[p] : fini(reperes?.minutes?.[0]) ? reperes.minutes[0] : null);
  const r0 = fini(reperes?.minutes?.[R]) ? reperes.minutes[R] : null;
  const e0 = fini(reperes?.entree) ? reperes.entree : null;
  const titulaires = [];
  const remplacants = [];
  for (const x of joueurs ?? []) {
    const id = identifie(x.id) ? x.id : null;
    const f = id ? fiches?.get(id) ?? null : null;
    const poste = x.poste || (f && f.poste) || 0;
    const X = f ? [nombre(f.np_x) ?? 0, nombre(f.pen_x) ?? 0, nombre(f.sot_x) ?? 0, nombre(f.av_x) ?? 0, nombre(f.xa_x) ?? 0] : vide5();
    const E = f ? [nombre(f.np_e) ?? 0, nombre(f.pen_e) ?? 0, nombre(f.sot_e) ?? 0, nombre(f.av_e) ?? 0, nombre(f.xa_e) ?? 0] : vide5();
    if (f && Number(f.pen_club) !== Number(club)) {
      X[S.pen] = 0;
      E[S.pen] = 0;
    }
    if (x.titulaire) {
      titulaires.push({ id, poste, m: minutesAttendues(nombre(f?.tit_min), nombre(f?.tit_n), m0(poste)), mEntre: minutesAttendues(nombre(f?.entre_min), nombre(f?.entre_n), r0), X, E, repere: repereDe(reperes, league, poste), apparitions: f ? Number(f.apparitions) : 0 });
    } else {
      remplacants.push({ id, poste, pEntre: chanceDEntrer(nombre(f?.banc_entrees), nombre(f?.banc_n), e0), mEntre: minutesAttendues(nombre(f?.entre_min), nombre(f?.entre_n), r0), X, E, repere: repereDe(reperes, league, poste), apparitions: f ? Number(f.apparitions) : 0 });
    }
  }
  return { titulaires, remplacants, bloc: { repere: repereDe(reperes, league, R) }, r0, e0 };
}

/** La part rappelée d'un joueur pour un signal (bras 'A' : le repère ; 'B' : ses sommes rappelées par κ) — la règle de partsDuCamp. */
function pi(j, s, bras, kappa) {
  const rep = j.repere?.[s];
  if (!fini(rep)) return null;
  if (bras !== 'B' || kappa === Infinity) return rep;
  return (j.X[s] + kappa * rep) / (j.E[s] + kappa);
}
/** Le chiffre MONTRÉ est-il celui du poste ? Un gardien (non jugé au banc : GARDIENS_JUGES) — la normalisation, elle, reste celle du banc. */
const auPoste = (j) => !GARDIENS_JUGES && j.poste === 1;

/**
 * LES PARTS d'un signal dans un camp, la normalisation du banc à l'identique (partsDuCamp : 11 titulaires et le bloc,
 * critique constat 2) ; rend { tit: [p_i], titPoste: [part au repère, même somme], remp: [p_r « s'il entre », hors de la
 * somme], bloc: p du bloc, somme } ou null si un repère manque.
 */
export function partsDUnSignal(entrees, s, bras, kappa) {
  const repBloc = entrees.bloc?.repere?.[s];
  if (!fini(repBloc)) return null;
  let somme = 0;
  let minutes = 0;
  const w = [];
  for (const j of entrees.titulaires) {
    const p = pi(j, s, bras, kappa);
    if (p === null) return null;
    w.push(p * j.m);
    somme += p * j.m;
    minutes += j.m;
  }
  const RT = Math.max(0, MINUTES_DU_MATCH - minutes);
  somme += repBloc * RT;
  if (!(somme > 0)) return null;
  const remp = entrees.remplacants.map((j) => {
    const p = auPoste(j) ? pi(j, s, 'A', Infinity) : pi(j, s, bras, kappa);
    return p === null ? null : (p * j.mEntre) / somme;
  });
  return { tit: w.map((x) => x / somme), titPoste: entrees.titulaires.map((j) => (j.repere[s] * j.m) / somme), remp, bloc: (repBloc * RT) / somme, somme };
}

/** Les bases RECALÉES d'un camp (λ borné, S, C) depuis les bases brutes de la nuit et les recalages de la note. */
export function basesRecalees({ lambdaS, Sraw, C }, dom, p) {
  return {
    lambda: fini(lambdaS) && p ? baseRecalee(p.recalageLambda, dom, lambdaS, BORNES_LAMBDA) : null,
    S: fini(Sraw) && Sraw > 0 && p ? baseRecalee(p.recalageCadres, dom, Sraw) : null,
    C: fini(C) ? C : null
  };
}

/** Les quatre chiffres d'une part (bruts, puis recalés par les dixièmes) ; null pour une famille sans base. */
function chiffresDUnePart({ g, px, ps, pa }, base, p) {
  const out = { marque: null, cadres: null, cadres2: null, averti: null, passeur: null, mu: null };
  if (fini(base.lambda) && fini(g)) out.marque = recaler(p.dixiemes.marque, 1 - Math.exp(-base.lambda * g));
  if (fini(base.lambda) && fini(px)) out.passeur = recaler(p.dixiemes.passeur, 1 - Math.exp(-base.lambda * p.a * px));
  if (fini(base.S) && fini(ps)) {
    const mu = base.S * ps;
    const loi = loiDesTirsCadres(mu, p.bras.cadres === 'B' ? p.invK.B : p.invK.A, 3);
    const p1 = Math.max(0, 1 - loi.pmf[0]);
    out.cadres = recaler(p.dixiemes.cadres, p1);
    out.cadres2 = Math.min(out.cadres, Math.max(0, 1 - loi.pmf[0] - loi.pmf[1]));
    out.mu = mu;
  }
  if (fini(base.C) && fini(pa)) out.averti = recaler(p.dixiemes.averti, probaAverti(base.C, p.kAv, pa));
  return out;
}

/** Le mélange « s'il joue » de la dernière alignée : [p_t·P(tit) + p_e·P(entre)] / (p_t + p_e). */
export function sIlJoue(pTit, pEntre, pt = P_T, pe = P_E) {
  if (!fini(pTit)) return null;
  if (!fini(pEntre)) return pTit;
  return (pt * pTit + pe * pEntre) / (pt + pe);
}

/**
 * LES CHIFFRES D'UN CAMP. `entrees` (entreesDepuisLesFiches), `base` brute { lambdaS, Sraw, C }, `dom`, `p`
 * (parametresDeLEcran), `etat` ('publiee' | 'derniere-alignee'). Rend { base (recalée), titulaires: [{ id, poste, m,
 * apparitions, chiffres }], remplacants: [{ …, pEntre, mEntre, chiffres « s'il entre » }], attendus (Σ des nombres
 * attendus des titulaires, et la part du bloc), manque (familles sans base) }.
 */
export function chiffresDUnCamp({ entrees, base, dom, p, etat }) {
  const b = basesRecalees(base ?? {}, dom, p);
  const k = p.kappa;
  const np = partsDUnSignal(entrees, S.np, p.bras.marque, k.np);
  const pen = partsDUnSignal(entrees, S.pen, p.tireur ? 'B' : 'A', k.pen);
  const sot = partsDUnSignal(entrees, S.sot, p.bras.cadres, k.sot);
  const av = partsDUnSignal(entrees, S.av, p.bras.averti, k.av);
  const xa = partsDUnSignal(entrees, S.xa, p.bras.passeur, k.xa);
  const gDe = (a, t) => (fini(a) && fini(t) ? partDesButs(a, t, p.qCsc, p.qPen) : null);
  // Les parts d'un titulaire : celles de la normalisation du banc ; un gardien montre la part de son poste (même somme).
  const partsTit = (i, j) => {
    const de = (res) => (res ? (auPoste(j) ? res.titPoste[i] : res.tit[i]) : null);
    return { g: gDe(de(np), de(pen)), px: de(xa), ps: de(sot), pa: de(av) };
  };
  const partsRemp = (i) => ({ g: gDe(np?.remp[i], pen?.remp[i]), px: xa?.remp[i] ?? null, ps: sot?.remp[i] ?? null, pa: av?.remp[i] ?? null });
  const titulaires = entrees.titulaires.map((j, i) => {
    const parts = partsTit(i, j);
    let chiffres = chiffresDUnePart(parts, b, p);
    if (etat === 'derniere-alignee') {
      // « S'il joue » : le même joueur s'il entre en cours de jeu (ses minutes d'entrant, hors de la somme).
      const sEntre = (sig, bras, kap) => {
        const q = auPoste(j) ? pi(j, sig, 'A', Infinity) : pi(j, sig, bras, kap);
        const res = sig === S.np ? np : sig === S.pen ? pen : sig === S.sot ? sot : sig === S.av ? av : xa;
        return q === null || !res ? null : (q * j.mEntre) / res.somme;
      };
      const pE = { g: gDe(sEntre(S.np, p.bras.marque, k.np), sEntre(S.pen, p.tireur ? 'B' : 'A', k.pen)), px: sEntre(S.xa, p.bras.passeur, k.xa), ps: sEntre(S.sot, p.bras.cadres, k.sot), pa: sEntre(S.av, p.bras.averti, k.av) };
      const cE = chiffresDUnePart(pE, b, p);
      chiffres = Object.fromEntries(Object.entries(chiffres).map(([cle, v]) => [cle, cle === 'mu' ? v : sIlJoue(v, cE[cle])]));
    }
    return { id: j.id, poste: j.poste, m: j.m, apparitions: j.apparitions, parts, chiffres };
  });
  const remplacants = entrees.remplacants.map((j, i) => {
    const parts = partsRemp(i);
    return { id: j.id, poste: j.poste, pEntre: j.pEntre, mEntre: j.mEntre, apparitions: j.apparitions, parts, chiffres: chiffresDUnePart(parts, b, p) };
  });
  const somme = (f) => titulaires.reduce((s, t) => s + (fini(f(t)) ? f(t) : 0), 0);
  const attendus = {
    buts: fini(b.lambda) ? b.lambda * somme((t) => t.parts.g) : null,
    butsEquipe: b.lambda,
    butsContreSonCamp: fini(b.lambda) ? b.lambda * p.qCsc : null,
    butsDuBloc: fini(b.lambda) && np && pen ? b.lambda * gDe(np.bloc, pen.bloc) : null,
    cadres: fini(b.S) ? b.S * somme((t) => t.parts.ps) : null,
    cadresEquipe: b.S,
    avertis: fini(b.C) ? somme((t) => t.chiffres.averti) : null,
    cartonsEquipe: b.C,
    passes: fini(b.lambda) ? b.lambda * p.a * somme((t) => t.parts.px) : null
  };
  const manque = [];
  if (!fini(b.lambda)) manque.push('buts');
  if (!fini(b.S)) manque.push('cadres');
  if (!fini(b.C)) manque.push('cartons');
  return { base: b, titulaires, remplacants, attendus, manque };
}

/** Une ligne compacte de l'archive : [numéro, camp, titulaire, poste, minutes, P marque, P ≥ 1 cadré, P ≥ 2 cadrés, P averti, P passeur]. */
export function ligneDArchive(camp, j, titulaire) {
  const c = j.chiffres;
  return [j.id ?? 0, camp, titulaire ? 1 : 0, j.poste ?? 0, arrondi(titulaire ? j.m : j.mEntre, 2), arrondi(c.marque), arrondi(c.cadres), arrondi(c.cadres2), arrondi(c.averti), arrondi(c.passeur)];
}

/** La cote juste d'un chiffre (1 / P, deux décimales ; null sous 0,5 % ou au-dessus de 99,5 %). */
export { coteJuste };

export const __pourLesTests = { pi, varianteDesDixiemes, chiffresDUnePart };
