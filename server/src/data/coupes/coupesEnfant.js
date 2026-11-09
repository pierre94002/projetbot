/**
 * coupesEnfant.js — LES COUPES, DANS UN PROCESSUS À PART (étape 36 du plan, lot 1, 09/11/2026).
 * -----------------------------------------------------------------------
 * UN SEUL fichier d'enfant, à modes ; lancé par scripts/coupes.mjs (comptes, calibration) et par coupesNuit.js (nuit) —
 * fork, sérialisation « avancée », argument « --enfant-coupes ». Ce n'est pas un script à lancer à la main. La base est
 * ouverte EN LECTURE SEULE avant toute lecture (openDb({ readonly: true })) ; aucune écriture, aucune horloge (seules des
 * durées ; l'instant de la nuit est REÇU), ni réseau, ni Claude. Trois modes :
 *   « comptes »     AVANT LE REGARD : l'appariement de toutes les coupes-saisons jusqu'au dernier jour lu, les contrôles, le
 *                   lieu des matchs décisifs, la couverture, et T-T1 bis (les blocs refaits = ceux de cupBracket, toutes
 *                   coupes, toutes saisons) — jamais une force, une probabilité ni une perte ;
 *   « calibration » LE PASSAGE UNIQUE : la même lecture, bornée au dernier jour lu (rien de P5) ; la base statistique au
 *                   jour J des matchs décisifs (passeDesForces), puis calibrationDesCoupes.js ;
 *   « nuit »        LA NUIT : les rencontres de coupe jusqu'à la VEILLE, rangées avec leur tour, leur nature, leur rôle et
 *                   leur issue ; les formats par (coupe, saison, nature) ; les stades habituels ; la liste du calendrier
 *                   (annuaire strict, matchs de coupe) et la FICHE de chaque match de coupe des 14 prochains jours (aller,
 *                   nature présumée, format, lieu, grille de la page de l'étape 28) — rien de daté après son coup d'envoi.
 *                   Renvoyé par morceaux ; le serveur range (coupesNuit.js).
 * `compterLesCoupes`, `passerLaCalibration` et `calculerLaNuitDesCoupes` sont aussi appelables dans le processus courant
 * (les essais, sur une copie).
 * -----------------------------------------------------------------------
 */

import { openDb } from '../db/matchStatsDb.js';
import { cupBracket } from '../db/matchStatsRead.js';
import { seasonOf, seasonBounds } from '../providers/seasonWindows.js';
import { isCup } from '../providers/leagueCups.js';
import { executerSansPause } from '../../utils/travailCooperatif.js';
import { listeDuCalendrier } from '../contexte/listeDuCalendrier.js';
import { PERIODES_DU_BANC, NUIT, VERSION_COUPES, VERSION_RENCONTRES, STADES } from './reglagesCoupes.js';
import { rencontresDeCoupe, passeDesForces, receptionsDesClubs, pagesRelevees, avantMatchs, lignesDeLaPage, COUPES } from './lectureDesCoupes.js';
import { blocsCommeCupBracket, tourNormalise, libelleDuTour, familleDeLaPhase, joursEntre } from './toursDeCoupe.js';
import { coupeSaison, controlesDeLaCoupeSaison, formatAuJourJ, observationDuFormat } from './confrontations.js';
import { stadesHabituels, lieuDuMatch } from './terrainNeutre.js';
import { comptesDesCoupes } from './comptesDesCoupes.js';
import { calibrationDesCoupes } from './calibrationDesCoupes.js';

const JOUR_MS = 86_400_000;
const plusJours = (jour, n) => new Date(Date.parse(`${jour}T00:00:00Z`) + n * JOUR_MS).toISOString().slice(0, 10);
const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const connu = (x) => x !== null && x !== undefined && x !== '';
const absente = (error) => /no such table/i.test(String(error?.message ?? ''));

// ======================================================= l'appariement de toutes les coupes-saisons

/**
 * TOUTES LES COUPES-SAISONS jusqu'à `jusqua` : les rencontres lues, rangées par (coupe, saison de seasonBounds), puis
 * l'appariement (confrontations.coupeSaison) et les contrôles de chacune. Rend [{ league, saison, terminee, cs, controles }].
 */
export function apparierLesCoupes(database, { jusqua, depuis = '2000-01-01', coupes = COUPES }) {
  const parSaison = new Map();
  for (const r of rencontresDeCoupe(database, { depuis, jusqua, coupes })) {
    const saison = seasonOf(r.league, r.date);
    const cle = `${r.league}|${saison}`;
    if (!parSaison.has(cle)) parSaison.set(cle, { league: r.league, saison, rencontres: [] });
    parSaison.get(cle).rencontres.push(r);
  }
  const out = [];
  for (const s of parSaison.values()) {
    const fin = seasonBounds(s.league, s.saison)[1];
    const terminee = fin <= plusJours(jusqua, 1);
    const cs = coupeSaison(s.rencontres, { league: s.league, saison: s.saison, saisonTerminee: terminee, dernierJourLu: jusqua });
    out.push({ league: s.league, saison: s.saison, terminee, cs, controles: controlesDeLaCoupeSaison(cs) });
  }
  return out.sort((a, b) => (a.league < b.league ? -1 : a.league > b.league ? 1 : a.saison - b.saison));
}

/** Les réceptions d'un club rangées par club (pour les stades habituels au jour de chaque match). */
function receptionsParClub(receptions) {
  const m = new Map();
  for (const r of receptions) {
    if (!m.has(r.club)) m.set(r.club, []);
    m.get(r.club).push(r);
  }
  return m;
}

/** Le LIEU d'un match décisif au jour J (les stades habituels des deux clubs sur les 365 jours d'avant). */
function lieuAuJourJ(decisif, parClub) {
  const recs = [...(parClub.get(decisif.home) ?? []), ...(parClub.get(decisif.away) ?? [])];
  const h = stadesHabituels(recs, { jour: decisif.date });
  return lieuDuMatch({ stade: decisif.stade, ville: decisif.ville, lat: decisif.lat, long: decisif.long }, h.get(decisif.home) ?? null, h.get(decisif.away) ?? null);
}

/** Le premier jour de chaque club au magasin (table du jour J ; aucune issue). */
function premiersJours(database) {
  const m = new Map();
  for (const l of database.prepare('SELECT home AS club, MIN(date) AS premier FROM day_matches GROUP BY home UNION ALL SELECT away AS club, MIN(date) AS premier FROM day_matches GROUP BY away').iterate()) {
    const c = Number(l.club);
    if (!m.has(c) || l.premier < m.get(c)) m.set(c, l.premier);
  }
  return m;
}

// ======================================================= T-T1 bis : les blocs refaits = cupBracket

/**
 * Pour chaque coupe et chaque saison présente : les blocs de blocsCommeCupBracket (sur la structure seule : clé, jour,
 * intitulé — aucun score) face à ceux de cupBracket (matchStatsRead.js) sur la MÊME base. Rend { comparees, ecarts }.
 */
export function comparerACupBracket(database, { coupes = COUPES } = {}) {
  const sql = database.prepare("SELECT match_key, fotmob_id, date, json_extract(meta, '$.round') AS tour FROM matches WHERE league = ? AND date >= ? AND date < ? ORDER BY date");
  const saisons = database.prepare('SELECT DISTINCT substr(date, 1, 7) AS mois FROM matches WHERE league = ?');
  let comparees = 0;
  const ecarts = [];
  for (const league of coupes) {
    const vues = new Set();
    for (const l of saisons.iterate(league)) vues.add(seasonOf(league, `${l.mois}-15`));
    for (const saison of [...vues].sort()) {
      const [de, a] = seasonBounds(league, saison);
      const rencontres = sql.all(league, de, a).map((l) => ({ matchKey: l.match_key, fotmobId: l.fotmob_id, date: l.date, tour: l.tour === null || l.tour === undefined ? null : String(l.tour) }));
      const miens = blocsCommeCupBracket(rencontres).map((b) => ({ intitule: b.intitule, from: b.from, ids: b.rencontres.map((r) => r.fotmobId ?? r.matchKey).sort() }));
      const cb = cupBracket(league, { season: saison, database });
      const siens = (cb?.rounds ?? []).map((r) => ({ intitule: r.round, from: r.from, ids: r.matches.map((m) => m.matchId).sort() }));
      comparees++;
      const cle = (b) => `${b.from}|${b.ids.join(',')}`;
      const parCle = new Map(siens.map((b) => [cle(b), b]));
      const egal = miens.length === siens.length && miens.every((b) => {
        const s = parCle.get(cle(b));
        return s && (s.intitule === b.intitule || s.intitule.startsWith(`${b.intitule} — `));
      });
      if (!egal) ecarts.push({ league, saison, miens: miens.length, siens: siens.length });
    }
  }
  return { comparees, ecarts };
}

// ======================================================= le mode « comptes »

/** LES COMPTES (avant le regard) : aucune force, aucune probabilité, aucune perte. */
export function compterLesCoupes({ database, periodes = PERIODES_DU_BANC, avecCupBracket = true }) {
  const t0 = performance.now();
  let rssMax = process.memoryUsage.rss();
  const durees = {};
  let t = performance.now();
  const saisons = apparierLesCoupes(database, { jusqua: periodes.dernierJourLu });
  durees.appariement = Math.round(performance.now() - t);
  t = performance.now();
  const parClub = receptionsParClub(receptionsDesClubs(database, { de: plusJours(periodes.miseEnRoute.de, -STADES.fenetreJours), a: periodes.dernierJourLu }));
  for (const s of saisons) {
    s.lieux = new Map();
    for (const u of s.cs.unites) if (connu(u.decisif.home) && connu(u.decisif.away)) s.lieux.set(u.cle, lieuAuJourJ(u.decisif, parClub).valeur);
  }
  durees.lieux = Math.round(performance.now() - t);
  rssMax = Math.max(rssMax, process.memoryUsage.rss());
  const premiers = premiersJours(database);
  const comptes = comptesDesCoupes(saisons, { periodes, premiers });
  t = performance.now();
  const cupBracketCompare = avecCupBracket ? comparerACupBracket(database) : null;
  durees.cupBracket = Math.round(performance.now() - t);
  rssMax = Math.max(rssMax, process.memoryUsage.rss());
  return {
    comptes,
    tT1bis: cupBracketCompare,
    coupesSaisons: saisons.length,
    durees: { ...durees, total: Math.round(performance.now() - t0) },
    aPart: { pid: process.pid, rssMaxOctets: rssMax }
  };
}

// ======================================================= le mode « calibration » (le passage unique)

const dansLesPlis = (jour, periodes) => periodes.plis.some((p) => jour >= p.juger.de && jour <= p.juger.a);
const PROLONGE = new Set(['afterextra', 'afterpenalties']);

/** Le score à la 90e du match décisif : le score final sans prolongation ; sinon celui du déroulé (bp90/bc90), ou null. */
export function butsA90DuDecisif(d) {
  if (!PROLONGE.has(d.fin)) return fini(d.hg) && fini(d.ag) ? { dom: d.hg, ext: d.ag } : null;
  return fini(d.bp90) && fini(d.bc90) ? { dom: d.bp90, ext: d.bc90 } : null;
}

/**
 * LES UNITÉS DE LA CALIBRATION : les matchs décisifs des deux plis, identifiants connus, issue connue, base calculable.
 * Rend { unites, exclusions }.
 */
export function unitesDeLaCalibration(saisons, bases, periodes = PERIODES_DU_BANC) {
  const unites = [];
  const exclusions = {};
  const exclure = (r) => {
    exclusions[r] = (exclusions[r] ?? 0) + 1;
  };
  for (const s of saisons) {
    for (const u of s.cs.unites) {
      if (!dansLesPlis(u.date, periodes)) continue;
      if (!connu(u.decisif.home) || !connu(u.decisif.away)) exclure('identifiant-inconnu');
      else if (!u.issue.qualifie) exclure(u.issue.raison ?? 'issue-inconnue');
      else if (!bases.has(u.cle)) exclure('sans-base');
      else {
        const b = bases.get(u.cle);
        unites.push({ cle: u.cle, date: u.date, league: s.league, nature: u.nature, avance: u.avance, lambdaS: b.lambdaS, muS: b.muS, qualifieDom: u.issue.qualifie === 'dom' ? 1 : 0, buts90: butsA90DuDecisif(u.decisif) });
      }
    }
  }
  return { unites, exclusions };
}

/** LE PASSAGE UNIQUE de la calibration (le serveur du script a posé le verrou AVANT). */
export function passerLaCalibration({ database, periodes = PERIODES_DU_BANC, tirages = undefined }) {
  const t0 = performance.now();
  let rssMax = process.memoryUsage.rss();
  let t = performance.now();
  const saisons = apparierLesCoupes(database, { jusqua: periodes.dernierJourLu });
  const durees = { appariement: Math.round(performance.now() - t) };
  const cles = new Set();
  for (const s of saisons) for (const u of s.cs.unites) if (dansLesPlis(u.date, periodes) && u.issue.qualifie) cles.add(u.cle);
  t = performance.now();
  const { bases, lues } = passeDesForces(database, { jusqua: periodes.dernierJourLu, cles });
  durees.passe = Math.round(performance.now() - t);
  rssMax = Math.max(rssMax, process.memoryUsage.rss());
  const { unites, exclusions } = unitesDeLaCalibration(saisons, bases, periodes);
  t = performance.now();
  const calibration = calibrationDesCoupes(unites, { periodes, ...(tirages ? { tirages } : {}) });
  durees.calibration = Math.round(performance.now() - t);
  rssMax = Math.max(rssMax, process.memoryUsage.rss());
  return {
    calibration,
    comptesDuPassage: { rencontresLuesParLaPasse: lues, unites: unites.length, parNature: unites.reduce((o, u) => ({ ...o, [u.nature]: (o[u.nature] ?? 0) + 1 }), {}), exclusions, dernierJourLu: periodes.dernierJourLu },
    durees: { ...durees, total: Math.round(performance.now() - t0) },
    aPart: { pid: process.pid, rssMaxOctets: rssMax }
  };
}

// ======================================================= le mode « nuit »

/** L'état d'une clé de coupes_etat (lecture seule) ; null sans table. */
function valeurDeLEtat(database, cle) {
  try {
    const r = database.prepare('SELECT valeur FROM coupes_etat WHERE cle = ?').get(cle);
    return r ? JSON.parse(r.valeur) : null;
  } catch (error) {
    if (absente(error)) return null;
    throw error;
  }
}

/** Une ligne de coupes_rencontres (la forme de COUPES_DDL). */
function ligneDeRencontre(x, { lieu = null } = {}) {
  const r = x.r;
  const u = x.unite ?? null;
  return {
    match_key: r.matchKey,
    league: r.league,
    saison: x.saison,
    date: r.date,
    home_id: r.home === null ? null : String(r.home),
    away_id: r.away === null ? null : String(r.away),
    tour_brut: r.tour,
    tour: x.bloc.code,
    famille: familleDeLaPhase(r.phase),
    bloc: x.bloc.id,
    nature_du_bloc: x.nature,
    role: x.role,
    aller_key: x.aller?.matchKey ?? null,
    avance: x.role === 'retour' ? x.avance : null,
    buts_dom: r.hg,
    buts_ext: r.ag,
    bp90: r.bp90,
    bc90: r.bc90,
    fin: r.fin,
    observation_format: observationDuFormat(r),
    seance_carte: u?.issue?.seance?.carte ?? null,
    seance_suite: u?.issue?.seance?.suite ?? null,
    qualifie: u?.issue?.qualifie ?? null,
    comment: u?.issue?.comment ?? null,
    raison: u?.issue?.raison ?? null,
    stade: r.stade,
    lieu,
    version: VERSION_RENCONTRES
  };
}

/** La NATURE PRÉSUMÉE d'un match à venir (critique, constat 5 : le calendrier d'abord, puis le code du tour). */
export function natureDUnMatchAVenir({ m, ranges, calendrier, page, saisonCourante }) {
  const { home, away, league, date } = m;
  // 1. Retour : le match inversé JOUÉ dans cette coupe sous 40 jours, hors d'un bloc de groupe.
  const aller = ranges
    .filter((x) => x.r.league === league && x.r.home === away && x.r.away === home && x.r.date < date && joursEntre(x.r.date, date) <= NUIT.allerJours && x.nature !== 'groupe' && familleDeLaPhase(x.r.phase) !== 'groupes')
    .sort((a, b) => (a.r.date < b.r.date ? 1 : -1))[0];
  if (aller) {
    const paireComplete = aller.nature === 'aller-retour' && ranges.some((x) => x.bloc.id === aller.bloc.id && x.role === 'retour');
    const avance = fini(aller.r.hg) && fini(aller.r.ag) ? aller.r.ag - aller.r.hg : null;
    return { valeur: 'retour', certitude: paireComplete ? 'confirmee' : 'probable', source: 'magasin', aller: { matchKey: aller.r.matchKey, date: aller.r.date, buts: { home: aller.r.hg, away: aller.r.ag }, avance }, tour: aller.bloc.code };
  }
  // 2. Aller : le match inversé est AU CALENDRIER dans les 40 jours.
  const retour = calendrier.find((c) => c.league === league && c.home === away && c.away === home && c.date > date && joursEntre(date, c.date) <= NUIT.allerJours);
  if (retour) return { valeur: 'aller', certitude: 'probable', source: 'calendrier', retourPrevu: { date: retour.date, chez: retour.home } };
  // 3. Groupe : chacun des deux clubs a joué, sous 40 jours, un match de cette coupe dans un bloc de groupe.
  const enGroupe = (club) => ranges.some((x) => x.r.league === league && x.nature === 'groupe' && (x.r.home === club || x.r.away === club) && x.r.date < date && joursEntre(x.r.date, date) <= NUIT.allerJours);
  if (enGroupe(home) && enGroupe(away)) return { valeur: 'groupe', certitude: 'probable', source: 'magasin' };
  // 4. Le code du tour (la page relevée), restreint à la même famille, sinon au même mois de la saison d'avant.
  if (page?.tour) {
    const code = tourNormalise(page.tour);
    const famille = page.phase ? familleDeLaPhase(page.phase) : null;
    const mois = date.slice(5, 7);
    const candidats = ranges.filter((x) => x.r.league === league && x.bloc.code === code && (x.saison === saisonCourante || x.saison === saisonCourante - 1));
    const memeFamille = famille ? candidats.filter((x) => familleDeLaPhase(x.r.phase) === famille) : [];
    const memeMois = candidats.filter((x) => x.saison === saisonCourante - 1 && x.r.date.slice(5, 7) === mois);
    const choix = memeFamille.length ? memeFamille : memeMois;
    const natures = [...new Set(choix.map((x) => x.nature))];
    if (natures.length === 1) {
      const n = natures[0];
      const valeur = n === 'un-match' ? 'match-unique' : n === 'finale' ? 'finale' : n === 'aller-retour' ? 'aller' : n === 'groupe' ? 'groupe' : 'inconnue';
      if (valeur !== 'inconnue') return { valeur, certitude: 'probable', source: 'tour-de-la-page', tour: code };
    }
  }
  return { valeur: 'inconnue', certitude: null, source: null };
}

/**
 * LA NUIT. `instant` : l'heure de la passe (reçue) ; `jourD` : son jour de Paris ; `envoyer(type, lignes)` : les morceaux.
 * Rend { bilan, controles, calendrier, sansIdentifiant, fuites }.
 */
export function calculerLaNuitDesCoupes({ database, instant, jourD, fichierCalendrier = undefined, envoyer = () => {}, clubDe = null }) {
  const t0 = performance.now();
  let rssMax = process.memoryUsage.rss();
  const hier = plusJours(jourD, -1);
  const calculeLe = new Date(instant).toISOString();
  // La liste du calendrier d'abord (l'annuaire strict, vérifié : pas prêt → reportée).
  const liste = executerSansPause(listeDuCalendrier({ database, jourD, clubDe, ...(fichierCalendrier ? { fichierCalendrier } : {}) }));
  const calendrier = liste.items.filter((c) => isCup(c.league)).map((c) => ({ date: c.date, league: c.league, home: c.home, away: c.away, statut: c.statut, matchId: c.matchId ?? null }));
  let t = performance.now();
  const saisons = apparierLesCoupes(database, { jusqua: hier });
  const dureeAppariement = Math.round(performance.now() - t);
  rssMax = Math.max(rssMax, process.memoryUsage.rss());
  // 1. Les rencontres : tout la première nuit (ou à un changement de forme), sinon les coupes-saisons actives (120 jours).
  const precedente = valeurDeLEtat(database, 'nuit');
  const tout = !precedente || precedente.version !== VERSION_COUPES || precedente.versionRencontres !== VERSION_RENCONTRES;
  const actives = saisons.filter((s) => tout || s.cs.rencontres.some((x) => joursEntre(x.r.date, hier) <= 120));
  const ranges = [];
  let n = 0;
  for (const s of saisons) {
    const parCle = new Map(s.cs.unites.map((u) => [u.cle, u]));
    for (const x of s.cs.rencontres) ranges.push({ ...x, saison: s.saison, unite: parCle.get(x.r.matchKey) ?? null });
  }
  // Les réceptions depuis 365 jours avant la plus ancienne rencontre rangée cette nuit (le lieu au jour de chaque match).
  const plusAncienne = actives.reduce((m, s) => s.cs.rencontres.reduce((k, x) => (x.r.date < k ? x.r.date : k), m), jourD);
  const parClub = receptionsParClub(receptionsDesClubs(database, { de: plusJours(plusAncienne, -STADES.fenetreJours), a: hier }));
  const lignes = [];
  for (const s of actives) {
    for (const x of ranges.filter((y) => y.r.league === s.league && y.saison === s.saison)) {
      const lieu = x.unite && connu(x.r.home) && connu(x.r.away) ? lieuAuJourJ(x.r, parClub).valeur : null;
      lignes.push(ligneDeRencontre(x, { lieu }));
      n++;
      if (lignes.length >= NUIT.tranche) envoyer('rencontres', lignes.splice(0));
    }
  }
  if (lignes.length) envoyer('rencontres', lignes.splice(0));
  envoyer('saisons', actives.map((s) => ({ league: s.league, saison: s.saison })));
  // 2. Les formats par (coupe, saison, nature) : les observations de toute la saison (jusqu'à la veille).
  const observations = saisons.flatMap((s) => s.cs.observations);
  const formats = [];
  for (const s of saisons) {
    for (const nature of ['retour', 'match-unique', 'finale']) {
      const obs = s.cs.observations.filter((o) => o.nature === nature);
      if (!obs.length) continue;
      const f = formatAuJourJ(observations, { league: s.league, saison: s.saison, nature, jour: jourD });
      formats.push({ league: s.league, saison: s.saison, nature, format: f.source === 'saison' ? f.valeur : 'inconnu', prolongations: obs.filter((o) => o.observation === 'prolongation').length, directs: obs.filter((o) => o.observation === 'direct').length, indetermines: obs.filter((o) => o.observation === 'indetermine').length, buts_exterieur: s.controles.butsExterieur.cas, calcule_le: calculeLe, version: VERSION_COUPES });
    }
  }
  envoyer('formats', formats);
  // 3. Les stades habituels au jour de la nuit.
  const toutes = [...parClub.values()].flat();
  const habituels = stadesHabituels(toutes, { jour: jourD });
  const stades = [...habituels.entries()].map(([club, h]) => ({ club: String(club), stade: h.stade, receptions: h.receptions, autres: h.autres.length ? JSON.stringify(h.autres) : null, lat: h.lat, long: h.long, calcule_le: calculeLe, version: VERSION_COUPES }));
  for (let i = 0; i < stades.length; i += NUIT.tranche) envoyer('stades', stades.slice(i, i + NUIT.tranche));
  // 4. Les FICHES des matchs de coupe des 14 prochains jours (rien de daté après le coup d'envoi).
  const fin14 = plusJours(jourD, NUIT.fenetreJours);
  const pages = pagesRelevees(database, { de: plusJours(jourD, -1), a: plusJours(fin14, 1) });
  const avant = (() => {
    try {
      return avantMatchs(database, { de: plusJours(jourD, -1), a: plusJours(fin14, 1) });
    } catch (error) {
      if (absente(error)) return [];
      throw error;
    }
  })();
  const grilles = (() => {
    try {
      return lignesDeLaPage(database, { de: plusJours(jourD, -1), a: plusJours(fin14, 1) });
    } catch (error) {
      if (absente(error)) return [];
      throw error;
    }
  })();
  const fiches = [];
  const fuites = [];
  let avecGrille = 0;
  for (const m of calendrier) {
    if (m.statut !== 'scheduled' || m.date < jourD || m.date > fin14) continue;
    const memes = (x) => x.home === m.home && x.away === m.away && Math.abs(joursEntre(x.date, m.date)) <= 1;
    const pageLue = pages.filter(memes).sort((a, b) => (a.releveLe < b.releveLe ? 1 : -1))[0] ?? null;
    const archiveLue = avant.filter(memes).sort((a, b) => (a.releveLe < b.releveLe ? 1 : -1))[0] ?? null;
    const kickoff = archiveLue?.kickoff ?? pageLue?.kickoff ?? null;
    const koConnu = Date.parse(kickoff ?? '');
    // Le coup d’envoi EFFECTIF (connu, sinon 10 h UTC du jour) : aucune source datée après lui n’entre dans la fiche.
    const ko = fini(koConnu) ? koConnu : Date.parse(`${m.date}T10:00:00.000Z`);
    const page = pageLue && Date.parse(pageLue.releveLe) < ko ? pageLue : null;
    const archive = archiveLue && Date.parse(archiveLue.releveLe) < ko ? archiveLue : null;
    const saisonCourante = seasonOf(m.league, m.date);
    const nature = natureDUnMatchAVenir({ m, ranges, calendrier, page, saisonCourante });
    const natureF = nature.valeur === 'retour' ? 'retour' : nature.valeur === 'finale' ? 'finale' : 'match-unique';
    const format = formatAuJourJ(observations, { league: m.league, saison: saisonCourante, nature: natureF, jour: m.date });
    const lieuV = archive ?? page;
    const recs = [...(parClub.get(m.home) ?? []), ...(parClub.get(m.away) ?? [])];
    const h = stadesHabituels(recs, { jour: m.date > jourD ? jourD : m.date });
    const lieu = lieuDuMatch(lieuV ? { stade: lieuV.stade, ville: lieuV.ville, lat: lieuV.lat, long: lieuV.long } : null, h.get(m.home) ?? null, h.get(m.away) ?? null);
    const g = grilles.filter((x) => memes(x) && !x.apresCoupDEnvoi && Date.parse(x.calculeLe) < ko).sort((a, b) => (a.calculeLe < b.calculeLe ? 1 : -1))[0] ?? null;
    // La garde des fuites : une source datée après le coup d'envoi n'entre jamais dans la fiche ; elle est comptée.
    for (const [quoi, quand] of [['page', pageLue?.releveLe], ['archive', archiveLue?.releveLe]]) if (quand && Date.parse(quand) >= ko) fuites.push({ date: m.date, home: m.home, away: m.away, quoi, quand });
    if (g) avecGrille++;
    fiches.push({
      date: m.date,
      home_id: String(m.home),
      away_id: String(m.away),
      league: m.league,
      match_id: m.matchId,
      kickoff: fini(koConnu) ? new Date(koConnu).toISOString() : null,
      kickoff_connu: fini(koConnu) ? 1 : 0,
      calcule_le: calculeLe,
      version: VERSION_COUPES,
      faits: JSON.stringify({
        nature,
        format,
        lieu: { ...lieu, source: archive ? 'avant-match' : page ? 'page' : null, releveLe: lieuV?.releveLe ?? null },
        tour: page?.tour ? { brut: page.tour, code: tourNormalise(page.tour), libelle: libelleDuTour(tourNormalise(page.tour)), releveLe: page.releveLe } : null,
        sources: { page: page?.releveLe ?? null, archive: archive?.releveLe ?? null, grille: g?.calculeLe ?? null }
      }),
      grille_page: g ? JSON.stringify({ lambda: g.lambda, mu: g.mu, rho: g.rho, grille: g.grille, fair: g.fair, oddsSource: g.oddsSource, oddsAt: g.oddsAt, calculeLe: g.calculeLe }) : null
    });
  }
  envoyer('lignes', fiches);
  rssMax = Math.max(rssMax, process.memoryUsage.rss());
  // Les contrôles de la nuit (le résumé et l'alerte durable).
  const tot = { rencontres: 0, decisifs: 0, connues: 0, carte: 0, suite: 0, desaccord: 0, rejoueOk: 0, rejoueN: 0, butsExterieur: [], allerRetour: 0, rejouages: 0, brut: 0 };
  for (const s of saisons) {
    tot.rencontres += s.cs.rencontres.length;
    tot.decisifs += s.cs.unites.length;
    tot.connues += s.cs.unites.filter((u) => u.issue.qualifie).length;
    tot.carte += s.controles.seances.carte;
    tot.suite += s.controles.seances.suite - s.controles.seances.lesDeux;
    tot.desaccord += s.controles.seances.desaccord;
    tot.rejoueOk += s.controles.qualifieRejoue.ok;
    tot.rejoueN += s.controles.qualifieRejoue.n;
    tot.allerRetour += s.cs.rencontres.filter((x) => x.role === 'retour').length;
    tot.rejouages += s.cs.rejouages;
    tot.brut += s.cs.rencontres.filter((x) => x.bloc.code.startsWith('brut:')).length;
    if (s.controles.butsExterieur.alerte) tot.butsExterieur.push({ league: s.league, saison: s.saison, cas: s.controles.butsExterieur.cas });
  }
  return {
    bilan: {
      tout,
      rencontres: n,
      coupesSaisons: saisons.length,
      actives: actives.length,
      formats: formats.length,
      stades: stades.length,
      fiches: fiches.length,
      avecGrille,
      calendrier: calendrier.length,
      sansIdentifiant: liste.sansIdentifiant.filter((x) => isCup(x.league)).length,
      durees: { appariement: dureeAppariement, total: Math.round(performance.now() - t0) },
      aPart: { pid: process.pid, rssMaxOctets: Math.max(rssMax, process.memoryUsage.rss()) }
    },
    controles: tot,
    calendrier: calendrier.filter((c) => c.statut === 'scheduled'),
    fuites
  };
}

// ------------------------------------------------------------ le processus à part
if (process.argv.includes('--enfant-coupes') && typeof process.send === 'function') {
  process.once('message', (m) => {
    try {
      const database = openDb({ file: m.chemin, readonly: true });
      let r;
      if (m.mode === 'comptes') r = compterLesCoupes({ database, periodes: m.periodes ?? PERIODES_DU_BANC });
      else if (m.mode === 'calibration') r = passerLaCalibration({ database, periodes: m.periodes ?? PERIODES_DU_BANC, tirages: m.tirages });
      else if (m.mode === 'nuit') {
        const fin = calculerLaNuitDesCoupes({ ...m, database, envoyer: (type, lignes) => process.send({ morceau: { type, lignes } }) });
        process.send({ fin: true, mode: m.mode, ...fin }, () => process.exit(0));
        return;
      } else throw new Error(`mode inconnu « ${m?.mode ?? ''} »`);
      process.send({ fin: true, mode: m.mode, resultat: r }, () => process.exit(0));
    } catch (error) {
      process.send({ erreur: String(error?.stack ?? error?.message ?? error).slice(0, 4000), reporte: Boolean(error?.reporte) }, () => process.exit(0));
    }
  });
}
