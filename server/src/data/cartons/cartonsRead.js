/**
 * cartonsRead.js — LA LECTURE DES CARTONS ATTENDUS D'UN MATCH, pour la page du match (étape 33 du plan, lot 1b, partie D,
 * 02/11/2026).
 * -----------------------------------------------------------------------
 * Ce que l'analyse d'un match reçoit APRÈS le moteur (analysis.controller.js, comme le contexte de l'étape 32) : le
 * verdict n'en sait rien, l'IA ne le reçoit jamais (elle prend des champs nommés du moteur), et une lecture qui échoue
 * n'empêche jamais l'analyse. Les mots sont faits par l'écran (ui/src/utils/cartonsABlanc.js, pur).
 *
 * LECTURE SEULE, SANS CALCUL LOURD (règle des 25 ms) : l'état de la dernière nuit et les moyennes des compétitions
 * (`cartons_etat`, une clé chacune), les deux clubs dans `cartons_equipes` (clé primaire), puis la formule pure des cartons
 * attendus (formulesDesCartons.js) avec les paramètres FIGÉS de la note du banc (noteDesCartons.js, recopiée par script) :
 * le bras « complet » avec z = 0 (sans arbitre) ; l'écran y ajoute l'effet de l'arbitre désigné (lu par l'aperçu :
 * `arbitreDesCartons`, une clé primaire de `cartons_arbitres`) — le même bras, z connu, sa propre dispersion (critique de
 * l'étape 33, constat 14 : une dispersion par cas). Les clubs par IDENTIFIANT FotMob seulement (`scoreInputs`, la
 * conversion unique numeroDuClub), jamais par un nom.
 *
 * Corners, tirs et tirs cadrés À BLANC : les attendus NEUTRES du moteur (match.statInputs, (pour + contre) / 2) × le
 * réglage du championnat appris au banc (la note) — des nombres, jamais un pourcentage (une seule place : les pourcentages
 * des corners et des tirs restent ceux du moteur). Rien n'entre dans un pourcentage (lot 1).
 * Hors de l'empreinte du moteur ; aucun fichier du moteur ne l'importe (cartonsNuit.test.mjs, T-X11).
 * -----------------------------------------------------------------------
 */

import { VERSION_CARTONS, MOTS } from './reglagesCartons.js';
import { CONSTANTES_DES_CARTONS, attendusDesCartons, attendusParChampionnat, cleDArbitre, texteStable } from './formulesDesCartons.js';
import { CARTONS_AU_BANC } from './noteDesCartons.js';
import { numeroDuClub, jourDe } from '../contexte/formulesDuContexte.js';

const fini = (x) => typeof x === 'number' && Number.isFinite(x);

/** Les états de la lecture. */
export const ETATS_DES_CARTONS = Object.freeze(['pret', 'pas-encore-calcule', 'clubs-inconnus', 'competition-sans-cartons', 'illisible']);

/** Les statistiques des réglages par championnat : la clé de la note, celle du moteur (statExpectations, statInputs), le mot. */
export const STATS_PAR_CHAMPIONNAT = Object.freeze([
  Object.freeze({ cle: 'corners', moteur: 'corners', mot: 'corners' }),
  Object.freeze({ cle: 'tirs', moteur: 'shots', mot: 'tirs' }),
  Object.freeze({ cle: 'cadres', moteur: 'shotsOnTarget', mot: 'tirs cadrés' })
]);

/** Une valeur de `cartons_etat` (JSON) ; null si absente ; LÈVE si la base ne répond pas (l'appelant dit « illisible »). */
function valeurDeLEtat(database, cle) {
  const r = database.prepare('SELECT valeur FROM cartons_etat WHERE cle = ?').get(cle);
  if (!r) return null;
  try {
    return JSON.parse(r.valeur);
  } catch {
    return null;
  }
}

/** Le statut d'écran d'une famille : 'mesure' (variante utile au banc), 'explication', 'non-mesure' (note nulle), 'dementi'. */
function statutDEcran(s, dementis) {
  if (!s) return { statut: 'non-mesure', variante: null };
  const d = s.variante ? dementis?.[s.variante] ?? null : null;
  if (s.statut === 'effet-mesure') return d ? { statut: 'dementi', variante: s.variante, dementiLe: d.le ?? d.depuis ?? null } : { statut: 'mesure', variante: s.variante };
  return { statut: 'explication', variante: s.variante ?? null, nonMesurable: s.statut === 'non-mesurable' };
}

/** Les statuts des familles (équipes, arbitre, corners, tirs, cadrés, enjeu) : ceux de la note du banc ; sans note, « pas encore mesuré ». */
export function statutsDesCartons(note = CARTONS_AU_BANC, dementis = null) {
  const out = {};
  for (const f of ['equipes', 'arbitre', 'corners', 'tirs', 'cadres', 'enjeu']) out[f] = statutDEcran(note?.statuts?.[f] ?? null, dementis);
  return out;
}

/** Ce que l'écran dit du banc : les verdicts tels quels (le tableau « Ce que dit le banc d'essai »), sans chemin ni empreinte. */
export function bancPourLEcran(note = CARTONS_AU_BANC) {
  if (!note || typeof note !== 'object') return null;
  return {
    calculeLe: note.calculeLe ?? null,
    K: note.K ?? null,
    z: note.z ?? null,
    periodes: note.periodes ?? null,
    matchs: note.matchs ? JSON.parse(JSON.stringify(note.matchs)) : null,
    variantes: (note.variantes ?? []).map((v) => ({
      id: v.id,
      famille: v.famille ?? null,
      stat: v.stat ?? null,
      verdict: v.verdict,
      utile: v.utile === true,
      matchsJuges: v.matchsJuges ?? null,
      gainRelatif: v.gainRelatif ?? null,
      fourchetteRelative: Array.isArray(v.fourchetteRelative) ? [...v.fourchetteRelative] : null,
      ampleur: v.ampleur ? { ...v.ampleur } : null,
      calibration: v.calibration ? { ...v.calibration } : null
    })),
    placebos: note.placebos ? { ...note.placebos } : null,
    utiles: [...(note.utiles ?? [])],
    reglagesParChampionnat: reglagesPourLEcran(note)
  };
}

/** Les réglages par championnat de la note, une ligne par championnat (le second tableau replié de l'écran) ; null sans note. */
export function reglagesPourLEcran(note = CARTONS_AU_BANC) {
  const p = note?.final?.parChampionnat ?? null;
  if (!p) return null;
  const stats = ['corners', 'tirs', 'cadres'];
  const ligues = [...new Set(stats.flatMap((s) => Object.keys(p[s]?.championnats ?? {})))].sort();
  const commun = Object.fromEntries(stats.map((s) => [s, p[s]?.commun ? { dom: p[s].commun.dom, ext: p[s].commun.ext, invKEquipe: p[s].commun.invKEquipe, invKTotal: p[s].commun.invKTotal } : null]));
  const championnats = ligues.map((league) => {
    const ligne = { league, n: null, propre: false };
    for (const s of stats) {
      const c = p[s]?.championnats?.[league] ?? null;
      ligne[s] = c ? { dom: c.dom, ext: c.ext, invKEquipe: c.invKEquipe, invKTotal: c.invKTotal, propre: Boolean(c.propre) } : null;
      if (c && fini(c.n)) ligne.n = Math.max(ligne.n ?? 0, c.n);
      if (c?.propre) ligne.propre = true;
    }
    return ligne;
  });
  return { commun, championnats };
}

/** Les réglages par championnat d'une compétition pour une statistique : le sien s'il est « propre », sinon le commun (jamais une erreur). */
export function reglageDuChampionnat(note, stat, league) {
  const p = note?.final?.parChampionnat?.[stat] ?? null;
  if (!p) return null;
  const c = league ? p.championnats?.[league] ?? null : null;
  if (c && c.propre) return { dom: c.dom, ext: c.ext, invKEquipe: c.invKEquipe, invKTotal: c.invKTotal, n: c.n, propre: true };
  return { dom: p.commun.dom, ext: p.commun.ext, invKEquipe: p.commun.invKEquipe, invKTotal: p.commun.invKTotal, n: c?.n ?? 0, propre: false };
}

/** Les attendus NEUTRES d'une statistique du moteur (statInputs : (pour + contre) / 2), ou null s'il manque une équipe. */
function neutresDe(match, cle) {
  const h = match?.statInputs?.home?.[cle];
  const a = match?.statInputs?.away?.[cle];
  if (!h || !a || ![h.for, h.against, a.for, a.against].every(fini)) return null;
  return { home: (h.for + a.against) / 2, away: (a.for + h.against) / 2 };
}

/**
 * Corners, tirs et tirs cadrés à blanc : pour chacune, l'attendu du moteur (statExpectations de l'analyse), l'attendu à
 * blanc (neutres × réglage du championnat), le réglage et s'il est propre, le moteur (1,10 / 0,90 et ses dispersions).
 */
export function statsParChampionnat({ match, analyse = null, note = CARTONS_AU_BANC, statuts = statutsDesCartons(note) }) {
  const league = typeof match?.league === 'string' ? match.league : null;
  const out = { league, stats: {} };
  for (const s of STATS_PAR_CHAMPIONNAT) {
    const reglage = reglageDuChampionnat(note, s.cle, league);
    const neutres = neutresDe(match, s.moteur);
    const e = analyse?.statExpectations?.[s.moteur] ?? null;
    out.stats[s.cle] = {
      mot: s.mot,
      moteur: e && fini(e.total) ? { home: e.home, away: e.away, total: e.total } : null,
      aBlanc: reglage && neutres ? attendusParChampionnat({ neutres, reglage }) : null,
      reglage,
      constantesDuMoteur: note?.final?.parChampionnat?.[s.cle]?.moteur ?? null,
      statut: statuts[s.cle]?.statut ?? 'non-mesure'
    };
  }
  return out;
}

/** Une équipe de `cartons_equipes` (null si elle n'a aucun match relevé ou une autre version). */
function equipeDe(database, club, nuit) {
  const r = database.prepare('SELECT club, n, pris, provoques, rho, pi, dernier, league, calcule_le, version FROM cartons_equipes WHERE club = ?').get(club);
  if (!r || Number(r.version) !== VERSION_CARTONS) return null;
  return { n: r.n, pris: r.pris, provoques: r.provoques, rho: r.rho, pi: r.pi, dernier: r.dernier, league: r.league, calculeLe: r.calcule_le, deLaNuit: r.calcule_le === nuit?.calculeLe };
}

/**
 * LES CARTONS ATTENDUS D'UN MATCH (lecture seule, quelques lectures par clé). `match` : le match de l'analyse
 * (identifiants par `scoreInputs.home/away.teamId`, `league`, `statInputs`) ; `analyse` : la réponse du moteur
 * (statExpectations, pour les corners et les tirs à blanc) ; `database` : la base (openDb) ; `note` : le banc (par
 * défaut, la note recopiée). Rend { version, etat, raison, calculeLe, jourD, clubs, ligue, equipes, sansArbitre,
 * parametres, statuts, banc, statsParChampionnat, preuve, dementis, mots } — jamais une exception pour une base qui ne
 * répond pas (« illisible »).
 */
export function cartonsDuMatch({ match, analyse = null, database, note = CARTONS_AU_BANC }) {
  const home = numeroDuClub(match?.scoreInputs?.home?.teamId ?? match?.homeId ?? null);
  const away = numeroDuClub(match?.scoreInputs?.away?.teamId ?? match?.awayId ?? null);
  const statuts = statutsDesCartons(note, null);
  const complet = note?.final?.cartons?.complet ?? null;
  const equipesBras = note?.final?.cartons?.equipes ?? null;
  const base = {
    version: VERSION_CARTONS,
    etat: 'pret',
    raison: null,
    date: jourDe(match?.commenceTime),
    calculeLe: null,
    jourD: null,
    clubs: { home: { id: home, nom: match?.home ?? null }, away: { id: away, nom: match?.away ?? null } },
    ligue: null,
    equipes: null,
    sansArbitre: null,
    parametres: complet
      ? {
          beta: complet.parametres?.beta ?? null,
          avecArbitre: { invKEquipe: complet.invKEquipe, invKTotal: complet.invKTotal },
          sansArbitre: { invKEquipe: equipesBras?.invKEquipe ?? complet.invKEquipe, invKTotal: equipesBras?.invKTotal ?? complet.invKTotal },
          fenetreEquipe: CONSTANTES_DES_CARTONS.fenetreEquipe,
          kArbitre: CONSTANTES_DES_CARTONS.kArbitre
        }
      : null,
    statuts,
    banc: bancPourLEcran(note),
    statsParChampionnat: statsParChampionnat({ match, analyse, note, statuts }),
    preuve: null,
    dementis: null,
    mots: { ...MOTS }
  };
  if (home === null || away === null) return { ...base, etat: 'clubs-inconnus', raison: home === null && away === null ? 'les-deux' : home === null ? 'domicile' : 'exterieur' };
  if (!database) return { ...base, etat: 'illisible', raison: 'base-absente' };
  let nuit;
  let ligues;
  let dementis;
  let eh;
  let ea;
  try {
    nuit = valeurDeLEtat(database, 'nuit');
    ligues = valeurDeLEtat(database, 'ligues');
    dementis = valeurDeLEtat(database, 'dementis');
    eh = equipeDe(database, home, nuit);
    ea = equipeDe(database, away, nuit);
  } catch {
    return { ...base, etat: 'illisible', raison: 'base-sans-reponse' };
  }
  const avecEtat = {
    ...base,
    calculeLe: nuit?.calculeLe ?? null,
    jourD: nuit?.jourD ?? null,
    statuts: statutsDesCartons(note, dementis && typeof dementis === 'object' ? dementis : null),
    dementis: dementis && typeof dementis === 'object' ? dementis : null
  };
  if (!nuit?.calculeLe) return { ...avecEtat, etat: 'pas-encore-calcule', raison: 'premiere-nuit' };
  const league = typeof match?.league === 'string' ? match.league : null;
  const l = league ? ligues?.ligues?.[league] ?? null : null;
  const ligue = { league, dom: l?.m?.dom ?? null, ext: l?.m?.ext ?? null, n: l?.m?.n ?? 0, tendance: l?.tendance?.valeur ?? null, gardeActive: Boolean(l?.garde?.active) };
  const vide = { n: 0, pris: null, provoques: null, rho: 1, pi: 1, dernier: null, league: null, calculeLe: null, deLaNuit: false };
  const equipes = { home: { id: home, nom: match?.home ?? null, ...(eh ?? vide) }, away: { id: away, nom: match?.away ?? null, ...(ea ?? vide) } };
  if (!fini(ligue.dom) || !fini(ligue.ext)) return { ...avecEtat, ligue, equipes, etat: 'competition-sans-cartons', raison: l ? 'moins-de-30-matchs' : 'competition-inconnue' };
  if (!complet) return { ...avecEtat, ligue, equipes, etat: 'pret', raison: 'pas-encore-mesure' };
  const sansArbitre = attendusDesCartons({
    m: { dom: ligue.dom, ext: ligue.ext },
    tendance: fini(ligue.tendance) ? ligue.tendance : 1,
    equipes: { rhoH: equipes.home.rho, piH: equipes.home.pi, rhoA: equipes.away.rho, piA: equipes.away.pi },
    z: 0,
    parametres: complet.parametres,
    bras: 'complet'
  });
  return { ...avecEtat, ligue, equipes, sansArbitre };
}

/**
 * L'ARBITRE DÉSIGNÉ AU MAGASIN, pour les cartons (l'aperçu de la page du match, lineupContext.buildMatchPreview) : sa
 * ligne de la table de la nuit (`cartons_arbitres`, une clé primaire « nom|pays » : matchs relevés, cartons observés et
 * attendus par les équipes, indice) et les autres arbitres du même nom (un autre pays : pas comptés). Jamais les moyennes
 * que FotMob affiche. Pas de nom : null ; une lecture ratée ne casse jamais la page (`illisible`).
 */
export function arbitreDesCartons(referee, database) {
  const nom = texteStable(referee?.name ?? referee?.nom ?? null);
  if (!nom) return null;
  const pays = texteStable(referee?.country ?? referee?.pays ?? null) ?? '';
  const cle = cleDArbitre({ nom, pays });
  try {
    const r = database.prepare('SELECT cle, nom, pays, matchs, observes, attendus, indice, premier, dernier, ligues, calcule_le, version FROM cartons_arbitres WHERE cle = ?').get(cle);
    let ligne = null;
    if (r && Number(r.version) === VERSION_CARTONS) {
      let ligues = {};
      try {
        ligues = JSON.parse(r.ligues ?? '{}');
      } catch {
        ligues = {};
      }
      ligne = { matchs: r.matchs, observes: r.observes, attendus: r.attendus, indice: r.indice, premier: r.premier, dernier: r.dernier, ligues, calculeLe: r.calcule_le };
    }
    const homonymes = database
      .prepare('SELECT cle, pays, matchs FROM cartons_arbitres WHERE nom = ? ORDER BY matchs DESC, cle')
      .all(nom)
      .filter((x) => (x.pays ?? '') !== pays)
      .map((x) => ({ cle: x.cle, pays: x.pays ?? '', matchs: x.matchs }));
    return { nom, pays, cle, ligne, homonymes };
  } catch {
    return { nom, pays, cle, ligne: null, homonymes: [], illisible: true };
  }
}

export const __pourLesTests = { valeurDeLEtat, neutresDe, equipeDe };
