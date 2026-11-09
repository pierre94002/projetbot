/**
 * confrontations.js — LES CONFRONTATIONS D'UNE COUPE : doublons, unités (le match qui décide), issue, séance de tirs au
 * but, règle d'après 90 minutes, contrôles (étape 36 du plan, lot 1, 09/11/2026).
 * -----------------------------------------------------------------------
 * Pur : aucune base, aucun fichier, aucune horloge, aucun hasard. Imports : les constantes, les tours (toursDeCoupe.js) et
 * LA RÈGLE DU FORMAT DU CORRECTIF DU RÈGLEMENT EN SERVICE (settlementService.quoiDeLaProlongation — décision 3 de
 * l'orchestrateur et consigne du 05/11 : « UNE seule définition, la 36 IMPORTE sa fonction, ne la recopie jamais »).
 *
 *   - LES DOUBLONS (`dedoublonner`) : même compétition, même paire ORDONNÉE d'identifiants, dates à un jour près → une
 *     seule (celle qui a un identifiant FotMob, puis un déroulé, puis la plus récente) ; comptés, nommés.
 *   - LES UNITÉS (`unitesDeLaCoupeSaison`) : le match qui décide — le retour d'une paire d'un bloc « aller-retour » (son
 *     aller rangé avec lui), la rencontre d'un bloc « un-match », celle de la finale. L'AVANCE au cumul est vue du club
 *     qui REÇOIT le match décisif : buts de l'aller du club qui reçoit au retour − buts de l'aller de son adversaire.
 *   - L'ISSUE (`issueDeLUnite`) : qui se qualifie et comment (90 minutes, prolongation, tirs au but), ou null avec sa
 *     raison ; le vainqueur d'une séance par la carte des tirs, sinon par le tour suivant (jamais une lecture FotMob
 *     neuve au lot 1) ; un désaccord des deux → null, nommé.
 *   - LA RÈGLE D'APRÈS 90 MINUTES (`observationDuFormat`, `formatAuJourJ`) : l'observation d'un match prolongé est CELLE
 *     DU CORRECTIF (quoiDeLaProlongation sur la fin et le déroulé, comme pour le règlement des paris) ; « direct » ne se
 *     dit que sur un déroulé complet (un remplacement de chaque camp au moins), sinon « indéterminé » ; le format d'une
 *     compétition-saison-nature = la majorité d'au moins 80 % d'au moins 3 observations déterminées d'AVANT le jour J.
 *   - LES CONTRÔLES (`controlesDeLaCoupeSaison`) : le qualifié rejoue au tour suivant, l'accord carte / tour suivant, les
 *     blocs ambigus, les rencontres sans paire, les buts à l'extérieur (un contrôle seulement : critique, constat 10).
 * -----------------------------------------------------------------------
 */

import { NATURES, SEANCE, FORMAT, BUTS_EXTERIEUR } from './reglagesCoupes.js';
import { blocsDeLaCoupe, naturesDesBlocs, natureVisible, joursEntre, blocsPlusTardifs } from './toursDeCoupe.js';
import { quoiDeLaProlongation } from '../providers/settlementService.js';

const connu = (x) => x !== null && x !== undefined && x !== '';
const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const NON_JOUE = new Set(['awarded_win', 'id_reused', 'cancelled', 'abandoned', 'postponed']);
const PROLONGE = new Set(['afterextra', 'afterpenalties']);

// ======================================================= les doublons

/** Le rang d'une rencontre parmi ses doublons : un identifiant FotMob, puis un déroulé, puis la mise à jour la plus récente. */
const rangDuDoublon = (r) => [connu(r.fotmobId) ? 1 : 0, r.aDeroule ? 1 : 0, String(r.updatedAt ?? '')];
const meilleur = (a, b) => {
  const x = rangDuDoublon(a);
  const y = rangDuDoublon(b);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] > y[i] ? a : b;
  return a.matchKey <= b.matchKey ? a : b;
};

/**
 * Les rencontres DÉDOUBLONNÉES d'une compétition : { rencontres, doublons: [{ garde, ecarte }] }. Deux rencontres sont la
 * même si elles ont la même paire ORDONNÉE d'identifiants (connus) à un jour près ; un identifiant nul n'est jamais
 * rapproché (il reste, et il est compté ailleurs).
 */
export function dedoublonner(rencontres) {
  const parPaire = new Map();
  const seules = [];
  for (const r of rencontres) {
    if (!connu(r.home) || !connu(r.away)) {
      seules.push(r);
      continue;
    }
    const cle = `${r.league}|${r.home}|${r.away}`;
    if (!parPaire.has(cle)) parPaire.set(cle, []);
    parPaire.get(cle).push(r);
  }
  const gardees = [...seules];
  const doublons = [];
  for (const liste of parPaire.values()) {
    const triee = [...liste].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.matchKey < b.matchKey ? -1 : 1));
    let courant = null;
    for (const r of triee) {
      if (courant && Math.abs(joursEntre(courant.date, r.date)) <= 1) {
        const garde = meilleur(courant, r);
        doublons.push({ garde: garde.matchKey, ecarte: garde === r ? courant.matchKey : r.matchKey, date: r.date });
        courant = garde;
        continue;
      }
      if (courant) gardees.push(courant);
      courant = r;
    }
    if (courant) gardees.push(courant);
  }
  gardees.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.matchKey < b.matchKey ? -1 : 1));
  return { rencontres: gardees, doublons };
}

// ======================================================= la règle d'après 90 minutes (le format)

/** Un déroulé COMPLET pour dire « direct » : au moins un remplacement de chaque camp (un déroulé de buts seuls ne prouve rien). */
export function derouleComplet(events) {
  if (!Array.isArray(events)) return false;
  const camps = { home: 0, away: 0 };
  for (const e of events) if (e?.type === 'substitution' && (e.side === 'home' || e.side === 'away')) camps[e.side]++;
  return camps.home >= FORMAT.remplacementsParCampMin && camps.away >= FORMAT.remplacementsParCampMin;
}

/**
 * L'OBSERVATION du format d'un match fini après la 90e (`fin` : afterextra ou afterpenalties ; sinon null) :
 * 'prolongation' | 'direct' | 'indetermine'. La règle est CELLE DU CORRECTIF DU RÈGLEMENT EN SERVICE, importée
 * (quoiDeLaProlongation : « prolongation » pour afterextra ; pour une séance, « prolongation et tirs au but » dès qu'un
 * événement du déroulé tombe après la 90e, sinon « tirs au but ») ; la 36 n'ajoute qu'une condition : « direct » seulement
 * sur un déroulé complet. Sans déroulé : afterextra reste une prolongation, une séance est indéterminée.
 */
export function observationDuFormat({ fin, events }) {
  if (!PROLONGE.has(fin)) return null;
  if (fin === 'afterextra') return 'prolongation';
  if (!Array.isArray(events)) return 'indetermine';
  const quoi = quoiDeLaProlongation(fin, events);
  if (quoi === 'prolongation' || quoi === 'prolongation et tirs au but') return 'prolongation';
  return derouleComplet(events) ? 'direct' : 'indetermine';
}

/**
 * La DURÉE DE JEU avant la séance (où commencent les tirs au but de la carte) : 120 si l'observation est « prolongation »,
 * 90 si « direct » ; indéterminée → d'après la carte elle-même (un penalty après la 120e : la séance est après 120).
 */
export function dureeDeJeu({ fin, events, shotmap }) {
  const o = observationDuFormat({ fin, events });
  if (o === 'prolongation') return 120;
  if (o === 'direct') return 90;
  const tirs = Array.isArray(shotmap) ? shotmap : [];
  return tirs.some((s) => s?.situation === 'penalty' && Number(s.minute) > 120) ? 120 : 90;
}

/**
 * Le FORMAT d'une compétition-saison-nature au jour J (rien du jour J ni d'après). `observations` :
 * [{ league, saison, nature, date, observation }]. Hiérarchie : (1) celles de (compétition, saison, nature) d'avant J ;
 * (2) sinon toute la saison d'avant ; (3) sinon la dernière saison ANTÉRIEURE qui en a ; (4) sinon « inconnu ». Au moins
 * 3 observations déterminées pour conclure ; 80 % de l'une → elle ; sinon « mixte ». Rend { valeur, source, saison,
 * prolongations, directs }.
 */
export function formatAuJourJ(observations, { league, saison, nature, jour }) {
  const conclure = (liste, source, s) => {
    const det = liste.filter((o) => o.observation === 'prolongation' || o.observation === 'direct');
    if (det.length < FORMAT.observationsMin) return null;
    const p = det.filter((o) => o.observation === 'prolongation').length;
    const d = det.length - p;
    const valeur = p / det.length >= FORMAT.majorite ? 'prolongation' : d / det.length >= FORMAT.majorite ? 'direct' : 'mixte';
    return { valeur, source, saison: s, prolongations: p, directs: d };
  };
  const meme = observations.filter((o) => o.league === league && o.nature === nature && o.date < jour);
  const r1 = conclure(meme.filter((o) => o.saison === saison), 'saison', saison);
  if (r1) return r1;
  const r2 = conclure(meme.filter((o) => o.saison === saison - 1), 'saison-precedente', saison - 1);
  if (r2) return r2;
  const anterieures = [...new Set(meme.filter((o) => o.saison < saison - 1).map((o) => o.saison))].sort((a, b) => b - a);
  for (const s of anterieures) {
    const r3 = conclure(meme.filter((o) => o.saison === s), 'saison-anterieure', s);
    if (r3) return r3;
  }
  return { valeur: 'inconnu', source: null, saison: null, prolongations: 0, directs: 0 };
}

// ======================================================= la séance de tirs au but

/**
 * Le vainqueur d'une séance d'après la CARTE DES TIRS : les penalties d'après la durée de jeu D, camp connu ; valide avec
 * au moins 6 tirs, 3 par camp, un écart d'un tir au plus et des buts différents. Rend 'dom' | 'ext' | null.
 */
export function vainqueurParLaCarte(shotmap, D) {
  if (!Array.isArray(shotmap)) return null;
  const tirs = shotmap.filter((s) => s?.situation === 'penalty' && Number(s.minute) > D && (s.side === 'home' || s.side === 'away'));
  const n = { home: 0, away: 0 };
  const buts = { home: 0, away: 0 };
  for (const s of tirs) {
    n[s.side]++;
    if (s.result === 'goal') buts[s.side]++;
  }
  if (tirs.length < SEANCE.tirsMin || n.home < SEANCE.parCampMin || n.away < SEANCE.parCampMin) return null;
  if (Math.abs(n.home - n.away) > SEANCE.ecartMax || buts.home === buts.away) return null;
  return buts.home > buts.away ? 'dom' : 'ext';
}

/**
 * Le vainqueur d'une confrontation d'après LE TOUR SUIVANT : exactement une des deux équipes joue un bloc PLUS TARDIF de
 * la compétition-saison (hors 3e place) sous 120 jours → elle ; sinon null (les deux, aucune, une finale). Ne sert qu'aux
 * ISSUES, jamais à une entrée (T-F2).
 */
export function vainqueurParLeTourSuivant(decisif, blocsApres) {
  const suivants = blocsApres.filter((b) => b.code !== '3e-place');
  const rejoue = (club) => connu(club) && suivants.some((b) => b.rencontres.some((s) => (s.home === club || s.away === club) && s.date > decisif.date && joursEntre(decisif.date, s.date) <= NATURES.suiteJours));
  const h = rejoue(decisif.home);
  const a = rejoue(decisif.away);
  if (h === a) return null;
  return h ? 'dom' : 'ext';
}

// ======================================================= l'issue

/** Une rencontre attribuée, annulée, abandonnée ou reportée : pas un résultat. */
export const nonJouee = (r) => Boolean(r) && (NON_JOUE.has(String(r.fin ?? '')) || r.awarded === true || r.awarded === 1 || !fini(r.hg) || !fini(r.ag));

/**
 * L'ISSUE d'une unité (le match décisif `decisif`, son aller éventuel, l'avance vue du club qui reçoit le décisif ; les
 * blocs plus tardifs pour le tour suivant). Rend { qualifie: 'dom' | 'ext' | null, comment: '90' | 'prolongation' | 'tab'
 * | null, raison, seance: { carte, suite } | null }.
 */
export function issueDeLUnite({ decisif, aller = null, avance = 0 }, blocsApres = []) {
  const nul = (raison, seance = null) => ({ qualifie: null, comment: null, raison, seance });
  if (nonJouee(decisif) || (aller && nonJouee(aller))) return nul('attribue-ou-non-joue');
  const cumul = avance + decisif.hg - decisif.ag;
  const signe = cumul > 0 ? 'dom' : 'ext';
  if (decisif.fin === 'afterextra') return cumul !== 0 ? { qualifie: signe, comment: 'prolongation', raison: null, seance: null } : nul('fin-incoherente');
  if (decisif.fin === 'afterpenalties') {
    if (cumul !== 0) return nul('fin-incoherente');
    const D = dureeDeJeu(decisif);
    const carte = vainqueurParLaCarte(decisif.shotmap, D);
    const suite = vainqueurParLeTourSuivant(decisif, blocsApres);
    const seance = { carte, suite, duree: D };
    if (carte && suite && carte !== suite) return nul('desaccord-carte-tour-suivant', seance);
    const qualifie = carte ?? suite;
    return qualifie ? { qualifie, comment: 'tab', raison: null, seance } : nul('seance-inconnue', seance);
  }
  return cumul !== 0 ? { qualifie: signe, comment: '90', raison: null, seance: null } : nul('cumul-egal-sans-prolongation');
}

// ======================================================= une compétition-saison entière

/**
 * L'APPARIEMENT d'une compétition-saison : doublons, blocs (couche 2), natures, paires, unités, issues et observations du
 * format. `rencontres` : celles de la compétition-saison (lectureDesCoupes) ; `saisonTerminee`, `dernierJourLu`. Rend
 * { blocs, natures, doublons, rencontres (dédoublonnées, avec bloc, nature, role, allerKey, avance), unites, observations,
 * sansPaire, rejouages }.
 */
export function coupeSaison(rencontres, { league, saison, saisonTerminee = false, dernierJourLu = null }) {
  const { rencontres: uniques, doublons } = dedoublonner(rencontres);
  const blocs = blocsDeLaCoupe(uniques);
  const natures = naturesDesBlocs(blocs, { saisonTerminee, dernierJourLu });
  const ranges = [];
  const unites = [];
  const observations = [];
  const sansPaire = [];
  let rejouages = 0;
  for (const b of blocs) {
    const n = natures.get(b.id);
    const apres = blocsPlusTardifs(blocs, b);
    const role = new Map();
    const allerDe = new Map();
    if (n.nature === 'aller-retour' || n.nature === 'un-match-rejouages') {
      for (const p of n.paires) {
        role.set(p.aller, n.nature === 'aller-retour' ? 'aller' : 'rejouage');
        role.set(p.retour, n.nature === 'aller-retour' ? 'retour' : 'rejouage');
        allerDe.set(p.retour, p.aller);
      }
      if (n.nature === 'un-match-rejouages') rejouages += n.paires.length;
      if (n.nature === 'aller-retour') for (const r of b.rencontres) if (!role.has(r)) sansPaire.push(r.matchKey);
    }
    for (const r of b.rencontres) {
      let rl = role.get(r) ?? null;
      if (!rl && n.nature === 'un-match') rl = 'match-unique';
      if (!rl && n.nature === 'finale') rl = 'finale';
      const aller = allerDe.get(r) ?? null;
      const avance = rl === 'retour' && aller && fini(aller.hg) && fini(aller.ag) ? aller.ag - aller.hg : rl === 'retour' ? null : 0;
      ranges.push({ r, bloc: b, nature: n.nature, role: rl, aller, avance });
      if (rl === 'retour' || rl === 'match-unique' || rl === 'finale') {
        const natureU = rl === 'retour' ? 'retour' : rl;
        const u = { cle: r.matchKey, league, saison, date: r.date, nature: natureU, bloc: b.id, code: b.code, decisif: r, aller, avance: avance ?? 0, avanceConnue: avance !== null };
        u.issue = avance === null ? { qualifie: null, comment: null, raison: 'attribue-ou-non-joue', seance: null } : issueDeLUnite(u, apres);
        unites.push(u);
      }
      const o = observationDuFormat(r);
      if (o) observations.push({ league, saison, nature: natureVisible(r, b), date: r.date, observation: o, matchKey: r.matchKey });
    }
  }
  return { blocs, natures, doublons, rencontres: ranges, unites, observations, sansPaire, rejouages };
}

/**
 * LES CONTRÔLES « sur plusieurs saisons » d'une compétition-saison (le « fini quand » de la fiche) — des scores et des
 * suites, jamais une force, une probabilité ni une perte. Rend { rencontres, ambigu, ambiguFin, qualifieRejoue: { ok, n,
 * ecarts }, accordCarte: { ok, n, ecarts }, seances: { n, carte, suite, lesDeux, desaccord, inconnues }, butsExterieur:
 * { cas, retoursAEgalite }, sansPaire, equipesEnDouble }.
 */
export function controlesDeLaCoupeSaison(cs) {
  const parBloc = new Map(cs.blocs.map((b) => [b.id, b]));
  const verifications = [];
  const out = { rencontres: cs.rencontres.length, ambigu: 0, ambiguFin: 0, qualifieRejoue: { ok: 0, n: 0, ecarts: [] }, accordCarte: { ok: 0, n: 0, ecarts: [] }, seances: { n: 0, carte: 0, suite: 0, lesDeux: 0, desaccord: 0, inconnues: 0 }, butsExterieur: { cas: 0, retoursAEgalite: 0, matchs: [] }, sansPaire: cs.sansPaire.length, equipesEnDouble: 0 };
  for (const x of cs.rencontres) {
    if (x.nature === 'ambigu') out.ambigu++;
    if (x.nature === 'ambigu-fin-des-donnees') out.ambiguFin++;
  }
  for (const b of cs.blocs) {
    const n = cs.natures.get(b.id)?.nature;
    if (n !== 'un-match' && n !== 'finale') continue;
    const vus = new Map();
    for (const r of b.rencontres) for (const c of [r.home, r.away]) if (connu(c)) vus.set(c, (vus.get(c) ?? 0) + 1);
    for (const v of vus.values()) if (v > 1) out.equipesEnDouble++;
  }
  for (const u of cs.unites) {
    const i = u.issue;
    const b = parBloc.get(u.bloc);
    const v = { cle: u.cle, date: u.date, nature: u.nature, qualifieRejoue: null, accord: null, seance: null, butsExterieur: false };
    verifications.push(v);
    const apres = blocsPlusTardifs(cs.blocs, b).filter((x) => x.code !== '3e-place');
    if (i.qualifie && (i.comment === '90' || i.comment === 'prolongation') && apres.length) {
      const suite = vainqueurParLeTourSuivant(u.decisif, apres);
      if (suite !== null || apres.some((x) => x.rencontres.some((s) => joursEntre(u.date, s.date) <= NATURES.suiteJours))) {
        out.qualifieRejoue.n++;
        v.qualifieRejoue = suite === i.qualifie;
        if (suite === i.qualifie) out.qualifieRejoue.ok++;
        else out.qualifieRejoue.ecarts.push({ matchKey: u.cle, date: u.date, attendu: i.qualifie, suite });
      }
    }
    if (u.decisif.fin === 'afterpenalties' && i.raison !== 'fin-incoherente' && i.raison !== 'attribue-ou-non-joue') {
      out.seances.n++;
      const s = i.seance ?? {};
      v.seance = i.raison === 'desaccord-carte-tour-suivant' ? 'desaccord' : i.raison === 'seance-inconnue' ? 'inconnue' : s.carte && s.suite ? 'lesDeux' : s.carte ? 'carte' : 'suite';
      if (s.carte && s.suite) v.accord = s.carte === s.suite;
      if (s.carte) out.seances.carte++;
      if (s.suite) out.seances.suite++;
      if (s.carte && s.suite) {
        out.seances.lesDeux++;
        out.accordCarte.n++;
        if (s.carte === s.suite) out.accordCarte.ok++;
        else out.accordCarte.ecarts.push({ matchKey: u.cle, date: u.date, carte: s.carte, suite: s.suite });
      }
      if (i.raison === 'desaccord-carte-tour-suivant') out.seances.desaccord++;
      if (i.raison === 'seance-inconnue') out.seances.inconnues++;
    }
    if (u.nature === 'retour' && u.avanceConnue && !nonJouee(u.decisif)) {
      const cumul = u.avance + u.decisif.hg - u.decisif.ag;
      if (cumul === 0) out.butsExterieur.retoursAEgalite++;
      if (i.raison === 'cumul-egal-sans-prolongation') {
        v.butsExterieur = true;
        out.butsExterieur.cas++;
        out.butsExterieur.matchs.push(u.cle);
      }
    }
  }
  out.butsExterieur.alerte = out.butsExterieur.cas >= BUTS_EXTERIEUR.cas;
  out.verifications = verifications;
  return out;
}
