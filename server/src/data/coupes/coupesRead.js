/**
 * coupesRead.js — LA COUPE D'UN MATCH, pour la page du match (étape 36 du plan, lot 1, 09/11/2026).
 * -----------------------------------------------------------------------
 * Ce que l'analyse d'un match de coupe reçoit APRÈS le moteur (analysis.controller.js, par un import() DYNAMIQUE) : le
 * verdict n'en sait rien, l'IA ne le reçoit jamais, et une lecture qui échoue n'empêche jamais l'analyse (« illisible »).
 * Les mots sont faits par l'écran (ui/src/utils/coupeDuMatch.js, pur).
 *
 * LECTURE SEULE, SANS CALCUL LOURD (aucune passe) : quelques lectures par clé ou par index — l'aller (coupes_rencontres),
 * la fiche de la nuit (coupes_lignes), le calendrier des matchs de coupe et l'état de la nuit (coupes_etat), l'historique
 * des tours de la coupe sur 400 jours, la règle d'après 90 minutes (coupes_formats), les stades habituels (coupes_stades),
 * l'archive d'avant-match et la page relevée — puis la formule pure sur la grille DE LA PAGE (le 1N2 affiché, le chemin
 * de l'écran de l'étape 28 : entreesDeLAnalyse, grilleDesEntrees, alignerSurLe1N2) : les deux chiffres ne se contredisent
 * jamais. Les clubs par IDENTIFIANT FotMob seulement (`scoreInputs`), jamais par un nom.
 *
 * La nature d'un match à venir (critique de l'étape 36, constat 5) : le retour d'abord (le match inversé JOUÉ sous 40 jours,
 * hors d'un groupe), puis la fiche de la nuit (le calendrier : l'aller dont le retour est prévu ; le groupe ; le tour de la
 * page), puis le code du tour dans l'historique de la coupe ; sinon « inconnue » — et jamais de chance sur « inconnue »
 * (l'écran la montre seulement s'il résout la nature avec le tour de la page : `chanceSiMatchUnique`).
 * Hors de l'empreinte du moteur ; aucun fichier du moteur ne l'importe (test coupesFrontiere).
 * -----------------------------------------------------------------------
 */

import { isCup } from '../providers/leagueCups.js';
import { seasonOf } from '../providers/seasonWindows.js';
import { entreesDeLAnalyse, grilleDesEntrees, alignerSurLe1N2 } from '../simulation/entreesSimulation.js';
import { numeroDuClub, jourDe, texteStable } from '../contexte/formulesDuContexte.js';
import { VERSION_COUPES, NUIT, FORMAT } from './reglagesCoupes.js';
import { tourNormalise, libelleDuTour, familleDeLaPhase } from './toursDeCoupe.js';
import { chanceDeQualification } from './qualification.js';
import { lieuDuMatch } from './terrainNeutre.js';
import { COUPES_AU_BANC } from './noteDesCoupes.js';

const JOUR_MS = 86_400_000;
const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const plusJours = (jour, n) => new Date(Date.parse(`${jour}T00:00:00Z`) + n * JOUR_MS).toISOString().slice(0, 10);
const json = (t) => {
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
};

/** Les états de la lecture. */
export const ETATS_DE_LA_COUPE = Object.freeze(['pret', 'pas-encore-calcule', 'clubs-inconnus', 'sans-buts-attendus', 'illisible']);

/** L'instant de la lecture (ms) : `maintenant` OBLIGATOIRE — jamais l'horloge lue ici. */
function instantDe(maintenant) {
  const v = typeof maintenant === 'function' ? maintenant() : maintenant;
  const t = v instanceof Date ? v.getTime() : typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v) : Number.NaN;
  if (!fini(t)) throw new Error('coupe du match : « maintenant » (l’heure de la lecture) est obligatoire.');
  return t;
}

/** Une valeur de `coupes_etat` (JSON) ; null si absente ; LÈVE si la base ne répond pas (l'appelant dit « illisible »). */
function valeurDeLEtat(database, cle) {
  const r = database.prepare('SELECT valeur FROM coupes_etat WHERE cle = ?').get(cle);
  return r ? json(r.valeur) : null;
}

/** La nature d'un bloc passé, vue pour un match à venir du même code. */
const natureDuCode = (n) => (n === 'un-match' ? 'match-unique' : n === 'finale' ? 'finale' : n === 'aller-retour' ? 'aller' : n === 'groupe' ? 'groupe' : null);

/**
 * L'HISTORIQUE DES TOURS de la coupe (400 jours) : pour chaque code ET chaque famille de phase, la nature quand elle est
 * unique dans la saison la plus récente qui l'a, et ses mois (les blocs ambigus ne disent rien). La qualification « 1 » de
 * juillet et la 1re journée de la phase de ligue de septembre ont le même code, pas la même famille (critique, constat 5).
 * Rend { [code]: [{ nature, saison, famille, mois }] }.
 */
export function historiqueDesTours(lignes) {
  const parCode = new Map();
  for (const l of lignes) {
    const n = natureDuCode(l.nature_du_bloc);
    if (!n) continue;
    const c = parCode.get(l.tour) ?? new Map();
    const k = `${l.saison}|${l.famille}`;
    if (!c.has(k)) c.set(k, { saison: l.saison, famille: l.famille, natures: new Set(), mois: new Set() });
    c.get(k).natures.add(n);
    if (l.date) c.get(k).mois.add(String(l.date).slice(5, 7));
    parCode.set(l.tour, c);
  }
  const out = {};
  for (const [code, parSaison] of parCode) {
    const parFamille = new Map();
    for (const x of [...parSaison.values()].sort((a, b) => b.saison - a.saison)) {
      if (x.natures.size !== 1 || parFamille.has(x.famille)) continue;
      parFamille.set(x.famille, { nature: [...x.natures][0], saison: x.saison, famille: x.famille, mois: [...x.mois].sort() });
    }
    if (parFamille.size) out[code] = [...parFamille.values()];
  }
  return out;
}

/**
 * La nature d'un code du tour dans l'historique (critique, constat 5) : restreinte à la famille de la phase de la page quand
 * elle est connue ; à défaut, au même mois ; sinon seulement si toutes les familles disent la même chose. null sinon.
 */
export function natureParLHistorique(historique, code, { famille = null, mois = null } = {}) {
  const liste = historique?.[code] ?? [];
  if (!liste.length) return null;
  const choix = famille ? liste.filter((x) => x.famille === famille) : mois ? liste.filter((x) => x.mois.includes(mois)) : liste;
  const natures = [...new Set(choix.map((x) => x.nature))];
  return natures.length === 1 ? natures[0] : null;
}

/**
 * LA RÈGLE D'APRÈS 90 MINUTES au jour du match, d'après les comptes de la nuit (coupes_formats : les observations de toute
 * la saison jusqu'à la veille de la nuit — toutes d'avant ce match) : la saison en cours, sinon celle d'avant, sinon la
 * dernière saison antérieure qui en a ; au moins 3 observations déterminées ; 80 % → la règle ; sinon « mixte ».
 */
export function formatDesLignes(lignes, saison) {
  const conclure = (l, source) => {
    const n = l.prolongations + l.directs;
    if (n < FORMAT.observationsMin) return null;
    const valeur = l.prolongations / n >= FORMAT.majorite ? 'prolongation' : l.directs / n >= FORMAT.majorite ? 'direct' : 'mixte';
    return { valeur, source, saison: l.saison, prolongations: l.prolongations, directs: l.directs };
  };
  const parSaison = new Map(lignes.map((l) => [Number(l.saison), { ...l, saison: Number(l.saison), prolongations: Number(l.prolongations), directs: Number(l.directs) }]));
  const r1 = parSaison.has(saison) ? conclure(parSaison.get(saison), 'saison') : null;
  if (r1) return r1;
  const r2 = parSaison.has(saison - 1) ? conclure(parSaison.get(saison - 1), 'saison-precedente') : null;
  if (r2) return r2;
  for (const s of [...parSaison.keys()].filter((x) => x < saison - 1).sort((a, b) => b - a)) {
    const r3 = conclure(parSaison.get(s), 'saison-anterieure');
    if (r3) return r3;
  }
  return { valeur: 'inconnu', source: null, saison: null, prolongations: 0, directs: 0 };
}

/** Le bloc du banc pour l'écran : la calibration RAPPORTÉE (jamais un statut « mesuré »), ou « pas encore mesurée ». */
export function bancPourLEcran(note = COUPES_AU_BANC) {
  if (!note) return { mesure: false, calculeLe: null, chance: null, lignes: null };
  const t = note.calibration?.toutes ?? {};
  return {
    mesure: true,
    calculeLe: note.calculeLe ?? null,
    chance: { n: t.n ?? null, annonce: t.annonce ?? null, realise: t.realise ?? null, mot: t.mot ?? null, beta: t.beta ?? null, betaIc: t.betaIc ?? null, ecartMoyen: t.ecartMoyen ?? null },
    retours: note.calibration?.retours ? { n: note.calibration.retours.n, annonce: note.calibration.retours.annonce, realise: note.calibration.retours.realise } : null,
    periodes: note.periodes ?? null,
    lignes: note.lignes ?? null
  };
}

/**
 * LA COUPE D'UN MATCH (lecture seule). `match` : le match de l'analyse (identifiants par `scoreInputs.home/away.teamId`) ;
 * `analyse` : le résultat du moteur (la grille de la page) ; `config` : les réglages du moteur de ce calcul ; `database` ;
 * `maintenant` (obligatoire). Rend null pour un match qui n'est pas de coupe ; sinon { version, etat, raison, calculeLe,
 * clubs, tour, nature, aller, retourPrevu, format, lieu, chance, chanceSiMatchUnique, historique, banc, avertissements }
 * — jamais une exception pour une base qui ne répond pas (« illisible »).
 */
export function coupeDuMatch({ match, analyse = null, config = null, database, maintenant, note = COUPES_AU_BANC }) {
  if (!isCup(match?.league ?? null)) return null;
  const instant = instantDe(maintenant);
  const league = match.league;
  const home = numeroDuClub(match?.scoreInputs?.home?.teamId ?? match?.homeId ?? null);
  const away = numeroDuClub(match?.scoreInputs?.away?.teamId ?? match?.awayId ?? null);
  const date = jourDe(match?.commenceTime);
  const base = {
    version: VERSION_COUPES,
    etat: 'pret',
    raison: null,
    calculeLe: null,
    league,
    date,
    saison: date ? seasonOf(league, date) : null,
    clubs: { home: { id: home, nom: match?.home ?? null }, away: { id: away, nom: match?.away ?? null } },
    tour: null,
    nature: { valeur: 'inconnue', certitude: null, source: null },
    aller: null,
    retourPrevu: null,
    format: null,
    lieu: { valeur: 'inconnu', stade: null, ville: null, distances: null, source: null, releveLe: null },
    chance: null,
    chanceSiMatchUnique: null,
    historique: {},
    banc: bancPourLEcran(note),
    avertissements: [],
    luLe: new Date(instant).toISOString()
  };
  if (!date) return { ...base, etat: 'illisible', raison: 'date-du-match-illisible' };
  if (home === null || away === null) return { ...base, etat: 'clubs-inconnus', raison: 'sans-identifiant' };
  if (!database) return { ...base, etat: 'illisible', raison: 'base-absente' };
  const saison = seasonOf(league, date);
  let nuit;
  let fiche;
  let aller;
  let historique;
  let formats;
  let stades;
  let calendrier;
  let groupes;
  let page;
  let avantMatch;
  let tailleFinale;
  try {
    nuit = valeurDeLEtat(database, 'nuit');
    calendrier = valeurDeLEtat(database, 'calendrier');
    fiche = database.prepare('SELECT date, kickoff, kickoff_connu, calcule_le, version, apres_coup_d_envoi, faits FROM coupes_lignes WHERE date IN (?, ?, ?) AND home_id = ? AND away_id = ? ORDER BY calcule_le DESC').all(plusJours(date, -1), date, plusJours(date, 1), String(home), String(away));
    aller = database
      .prepare("SELECT match_key, date, buts_dom, buts_ext, bloc, nature_du_bloc, tour FROM coupes_rencontres WHERE league = ? AND home_id = ? AND away_id = ? AND date < ? AND date >= ? AND nature_du_bloc <> 'groupe' AND famille <> 'groupes' ORDER BY date DESC LIMIT 1")
      .get(league, String(away), String(home), date, plusJours(date, -NUIT.allerJours));
    historique = historiqueDesTours(database.prepare('SELECT tour, nature_du_bloc, famille, saison, date FROM coupes_rencontres WHERE league = ? AND date >= ? AND date < ?').all(league, plusJours(date, -NUIT.historiqueJours), date));
    // La taille du bloc d'une « final » : celui de l'aller (un retour), sinon le dernier bloc « final » du même mois (la « final »
    // d'août est le dernier tour de qualification, celle de mai la finale).
    tailleFinale = database
      .prepare("SELECT bloc, COUNT(*) AS n FROM coupes_rencontres WHERE league = ? AND tour = 'final' AND date >= ? AND date < ? AND substr(date, 6, 2) = ? GROUP BY bloc ORDER BY MAX(date) DESC LIMIT 1")
      .get(league, plusJours(date, -NUIT.historiqueJours), plusJours(date, 1), date.slice(5, 7)) ?? null;
    groupes = database
      .prepare("SELECT home_id, away_id FROM coupes_rencontres WHERE league = ? AND date >= ? AND date < ? AND nature_du_bloc = 'groupe' AND (home_id IN (?, ?) OR away_id IN (?, ?))")
      .all(league, plusJours(date, -NUIT.allerJours), date, String(home), String(away), String(home), String(away));
    formats = database.prepare('SELECT saison, nature, prolongations, directs FROM coupes_formats WHERE league = ? AND saison <= ?').all(league, saison);
    stades = new Map(database.prepare('SELECT club, stade, receptions, autres, lat, long FROM coupes_stades WHERE club IN (?, ?)').all(String(home), String(away)).map((s) => [Number(s.club), { stade: s.stade, receptions: s.receptions, lat: s.lat, long: s.long, autres: json(s.autres) ?? [] }]));
    page = database
      .prepare('SELECT home_id, away_id, payload, fetched_at, kickoff FROM upcoming_lineups WHERE date >= ? AND date <= ?')
      .all(plusJours(date, -1), plusJours(date, 1))
      .map((l) => ({ ...l, p: json(l.payload) }))
      .filter((l) => numeroDuClub(l.home_id ?? l.p?.home?.teamId) === home && numeroDuClub(l.away_id ?? l.p?.away?.teamId) === away)
      .filter((l) => {
        const ko = Date.parse(l.p?.meta?.kickoff ?? l.kickoff ?? '');
        const lu = Date.parse(l.fetched_at ?? '');
        return fini(lu) && (!fini(ko) || lu < ko);
      })[0] ?? null;
    try {
      avantMatch = database.prepare('SELECT releve_le, avant_match FROM contexte_avant_match WHERE date >= ? AND date <= ? AND home_id = ? AND away_id = ? ORDER BY releve_le DESC LIMIT 1').get(plusJours(date, -1), plusJours(date, 1), home, away) ?? null;
    } catch {
      avantMatch = null;
    }
  } catch {
    return { ...base, etat: 'illisible', raison: 'base-sans-reponse' };
  }
  if (!nuit?.calculeLe) return { ...base, etat: 'pas-encore-calcule', raison: 'premiere-nuit' };
  const faits = fiche.length && Number(fiche[0].version) === VERSION_COUPES ? json(fiche[0].faits) : null;
  // L'historique pour l'écran : la nature de chaque code quand toutes ses familles disent la même chose.
  const avecEtat = { ...base, calculeLe: nuit.calculeLe, historique: Object.fromEntries(Object.keys(historique).map((k) => [k, natureParLHistorique(historique, k)]).filter(([, v]) => v)) };
  // LE TOUR : la page relevée (avant le coup d'envoi), sinon celui de l'aller.
  const meta = page?.p?.meta ?? null;
  const brut = meta?.round === null || meta?.round === undefined ? null : String(meta.round);
  const tourCode = brut ? tourNormalise(brut) : aller?.tour ?? faits?.tour?.code ?? null;
  const tour = tourCode ? { brut, code: tourCode, libelle: libelleDuTour(tourCode, { rencontres: tourCode === 'final' ? Number(tailleFinale?.n ?? 1) : null }), source: brut ? 'page' : aller ? 'aller' : 'fiche', releveLe: brut ? page.fetched_at : null } : null;
  // LA NATURE (constat 5) : le retour d'abord, puis la fiche de la nuit (calendrier, groupe, tour), puis l'historique.
  let nature;
  let allerVu = null;
  let retourPrevu = null;
  if (aller) {
    const avance = fini(aller.buts_dom) && fini(aller.buts_ext) ? aller.buts_ext - aller.buts_dom : null;
    nature = { valeur: 'retour', certitude: aller.nature_du_bloc === 'aller-retour' ? 'confirmee' : 'probable', source: 'magasin' };
    allerVu = { date: aller.date, matchKey: aller.match_key, score: { home: aller.buts_dom, away: aller.buts_ext }, avance, chez: away };
  } else if (faits?.nature && faits.nature.valeur !== 'inconnue' && faits.nature.valeur !== 'retour') {
    nature = { valeur: faits.nature.valeur, certitude: faits.nature.certitude ?? 'probable', source: `nuit:${faits.nature.source ?? '?'}` };
    if (faits.nature.retourPrevu) retourPrevu = faits.nature.retourPrevu;
  } else {
    const retour = (calendrier?.matchs ?? []).find((c) => c.league === league && c.home === away && c.away === home && c.date > date && (Date.parse(c.date) - Date.parse(date)) / JOUR_MS <= NUIT.allerJours);
    const enGroupe = (club) => groupes.some((g) => numeroDuClub(g.home_id) === club || numeroDuClub(g.away_id) === club);
    if (retour) {
      nature = { valeur: 'aller', certitude: 'probable', source: 'calendrier' };
      retourPrevu = { date: retour.date, chez: retour.home };
    } else if (enGroupe(home) && enGroupe(away)) nature = { valeur: 'groupe', certitude: 'probable', source: 'magasin' };
    else {
      const parLHistorique = tour?.code ? natureParLHistorique(historique, tour.code, { famille: meta?.leagueKey ? familleDeLaPhase(meta.leagueKey) : null, mois: date.slice(5, 7) }) : null;
      nature = parLHistorique ? { valeur: parLHistorique, certitude: 'probable', source: 'tour-de-la-page' } : { valeur: 'inconnue', certitude: null, source: null };
    }
  }
  // LA RÈGLE D'APRÈS 90 MINUTES (le format de la nature décisive).
  const natureF = nature.valeur === 'retour' ? 'retour' : nature.valeur === 'finale' ? 'finale' : 'match-unique';
  const format = { ...formatDesLignes(formats.filter((f) => f.nature === natureF), saison), nature: natureF };
  // LE LIEU : l'archive d'avant-match, sinon la page relevée (avant le coup d'envoi) ; les stades habituels de la nuit.
  const av = avantMatch ? json(avantMatch.avant_match) ?? {} : null;
  const v = av?.stadium ? { stade: av.stadium, ville: av.city ?? null, lat: av.lat ?? null, long: av.long ?? null, source: 'avant-match', releveLe: avantMatch.releve_le } : meta?.stadium ? { stade: meta.stadium, ville: meta.city ?? null, lat: meta.lat ?? null, long: meta.long ?? null, source: 'page', releveLe: page.fetched_at } : null;
  const lieu = { ...lieuDuMatch(v, stades.get(home) ?? null, stades.get(away) ?? null), source: v?.source ?? null, releveLe: v?.releveLe ?? null, stadesHabituels: { home: stades.get(home)?.stade ?? null, away: stades.get(away)?.stade ?? null } };
  const pret = { ...avecEtat, tour, nature, aller: allerVu, retourPrevu, format, lieu };
  // LA CHANCE : la grille de la page (le 1N2 affiché), le cumul, puis pile ou face.
  let e = null;
  try {
    e = analyse ? entreesDeLAnalyse(analyse, config) : null;
  } catch {
    e = null;
  }
  if (!e) return { ...pret, etat: 'sans-buts-attendus', raison: 'entrees-absentes' };
  let grille;
  try {
    grille = grilleDesEntrees(e);
    if (e.fair) grille = alignerSurLe1N2(grille, e.fair);
  } catch {
    return { ...pret, etat: 'sans-buts-attendus', raison: 'grille-illisible' };
  }
  const source = { grille: e.grille, alignee: Boolean(e.fair), engineVersion: e.engineVersion ?? null };
  const avance = nature.valeur === 'retour' ? allerVu?.avance : 0;
  if ((nature.valeur === 'retour' && fini(avance)) || nature.valeur === 'match-unique' || nature.valeur === 'finale') {
    const c = chanceDeQualification({ grille, avance, format: format.valeur });
    return { ...pret, chance: { ...c, source } };
  }
  if (nature.valeur === 'inconnue') {
    const c = chanceDeQualification({ grille, avance: 0, format: formatDesLignes(formats.filter((f) => f.nature === 'match-unique'), saison).valeur });
    return { ...pret, chanceSiMatchUnique: { ...c, source } };
  }
  return pret;
}

export const __pourLesTests = { valeurDeLEtat, natureDuCode, texteStable };
