/**
 * saisiesCotes.js — la saisie express d'une cote de VOS bookmakers (étape 7 du plan, 06/10/2026).
 * -----------------------------------------------------------------------
 * The Odds API ne relève que le 1N2 (marché h2h) : rien ne relève les
 * corners, les cartons, les buteurs, ni les plus/moins et « les deux
 * marquent » de vos bookmakers. Pierre voit une cote chez l'un d'eux, la tape
 * sur la page du match (bookmaker, marché, issue, cote) ; ici :
 *   - la value se calcule AUSSITÔT face à la probabilité du moteur pour ce
 *     marché, quand il en a une (probabilité = 1 / sa cote juste, telle qu'il
 *     l'affiche) : buts et « les deux marquent » par le modèle de buts, corners,
 *     tirs et tirs cadrés par la binomiale négative mesurée (statMarkets.js).
 *     Cartons (étape 33) et buteurs (étape 34) : la cote est gardée, SANS
 *     value — jamais un chiffre inventé ;
 *   - la cote part dans les archives (odds_events / odds_quotes, source
 *     « saisie ») avec l'heure de la saisie, par la file des enregistreurs :
 *     écrite par le seul serveur, jamais pendant un import ni quand une passe
 *     tient le verrou (elle attend, et la page le dit « en attente ») ;
 *   - une saisie se CORRIGE (nouvelle cote : une ligne de plus, l'archive
 *     garde l'ancienne) ou se RETIRE (une ligne sans prix) ; rien n'est
 *     jamais réécrit ni effacé ;
 *   - PUT idempotent : la même cote, déjà enregistrée, n'écrit rien.
 * La fraîcheur d'une saisie suit la règle commune (core/engine/fraicheurCotes.js) :
 * l'heure de la saisie est l'heure du relevé.
 *
 * Le 1N2 n'est PAS saisissable : The Odds API le relève, et une cote fraîche
 * jugée contre une cote juste tirée d'un relevé périmé serait une fausse value.
 * Aucun appel réseau, aucun crédit, aucun appel à Claude ; le moteur tourne
 * sans repli payant (enrichMatchWithRealAverages, sansRepliPayant).
 * -----------------------------------------------------------------------
 */

import { openDb } from './db/matchStatsDb.js';
import { clubDuMagasin } from './db/oddsProfileRead.js';
import { lireSaisies } from './db/oddsQuotesRepository.js';
import { findAdaptedMatch } from './matchSources.js';
import { enrichMatchWithRealAverages } from './providers/matchEnrichment.js';
import { lireReglageFraicheur } from './repositories/fraicheurCotesRepository.js';
import { mettreEnFile, vider, lignesEnAttente } from './enregistreurs/file.js';
import { nomCle, jourUtc, iso } from './enregistreurs/communs.js';
import { analyzeMatch } from '../core/engine/oddsEngine.js';
import { getEngineConfig } from '../core/engine/engineConfig.js';
import { getTiltState } from '../core/engine/tiltState.js';
import { fraicheurCote } from '../core/engine/fraicheurCotes.js';
import { verdictValue, regleEnPourcent, pourcentDeLaCote, bornesDeLaRegle } from '../core/engine/coteMinimale.js';
import { TITRES_BOOKMAKERS, titreBookmaker, vosBookmakersDe } from '../core/engine/vosBookmakers.js';
import { getSport } from '../sports/index.js';
import { STAT_KINDS, coteJusteLigne } from '../sports/football/statMarkets.js';
import { MARKET_LABELS } from '../sports/football/markets.js';

export const PROVENANCE_SAISIE = 'Saisie à la main dans CôteMaster (page du match)';

// Les titres de vos bookmakers et la règle de value d'une cote saisie vivent dans le moteur depuis l'étape 10
// (core/engine/vosBookmakers.js, core/engine/coteMinimale.js) : le comparateur les partage. Réexportés ici.
export { TITRES_BOOKMAKERS, titreBookmaker, verdictValue };

const SANS_CARTONS = 'Le moteur ne calcule pas encore les cartons (étape 33 du plan) : la cote est gardée avec son heure, sans value.';
const SANS_BUTEURS = 'Le moteur ne calcule pas encore les buteurs (étape 34 du plan) : la cote est gardée avec son heure, sans value.';

const marche = (id, libelle, archive, { sens = ['over', 'under'], ligne = true, equipe = false, joueur = false, unite = null, moteur = null, stat = null, sansMoteur = null } = {}) =>
  Object.freeze({ id, libelle, archive, sens: Object.freeze(sens), ligne, equipe, joueur, unite, moteur, stat, sansMoteur });

/**
 * Les marchés saisissables. `archive` : le nom du marché dans odds_quotes
 * (« ou » et « btts » comme les sources gratuites ; les autres à part).
 * `moteur` : d'où vient la probabilité (« buts », « stat »), null sinon.
 */
export const MARCHES_SAISIE = Object.freeze([
  marche('totalGoals', 'Total buts', 'ou', { unite: 'buts', moteur: 'buts' }),
  marche('bothTeamsScore', 'Les 2 équipes marquent', 'btts', { sens: ['yes', 'no'], ligne: false, moteur: 'buts' }),
  marche('teamGoals', 'Buts d’une équipe', 'team_total', { equipe: true, unite: 'buts', moteur: 'buts' }),
  marche('totalCorners', 'Total corners', 'corners', { unite: 'corners', moteur: 'stat', stat: 'corners' }),
  marche('teamCorners', 'Corners d’une équipe', 'team_corners', { equipe: true, unite: 'corners', moteur: 'stat', stat: 'corners' }),
  marche('totalShots', 'Total tirs', 'shots', { unite: 'tirs', moteur: 'stat', stat: 'shots' }),
  marche('teamShots', 'Tirs d’une équipe', 'team_shots', { equipe: true, unite: 'tirs', moteur: 'stat', stat: 'shots' }),
  marche('totalShotsOnTarget', 'Total tirs cadrés', 'shots_on_target', { unite: 'tirs cadrés', moteur: 'stat', stat: 'shotsOnTarget' }),
  marche('teamShotsOnTarget', 'Tirs cadrés d’une équipe', 'team_shots_on_target', { equipe: true, unite: 'tirs cadrés', moteur: 'stat', stat: 'shotsOnTarget' }),
  marche('totalCards', 'Total cartons', 'cards', { unite: 'cartons', sansMoteur: SANS_CARTONS }),
  marche('teamCards', 'Cartons d’une équipe', 'team_cards', { equipe: true, unite: 'cartons', sansMoteur: SANS_CARTONS }),
  marche('anytimeScorer', 'Buteur (à tout moment)', 'scorer', { sens: ['yes'], ligne: false, joueur: true, sansMoteur: SANS_BUTEURS })
]);
const PAR_ID = new Map(MARCHES_SAISIE.map((m) => [m.id, m]));
const PAR_ARCHIVE = new Map(MARCHES_SAISIE.map((m) => [m.archive, m]));
export const SENS = Object.freeze({ over: 'Plus de', under: 'Moins de', yes: 'Oui', no: 'Non' });
/** Les lignes acceptées : des demi-lignes de 0,5 à 60,5 (corners, tirs, cartons, buts). */
export const BORNES_LIGNE = Object.freeze({ min: 0.5, max: 60.5 });
export const BORNES_COTE = Object.freeze({ min: 1.01, max: 1000 });

/** Une demande refusée (400). */
export class SaisieInvalide extends Error {}
/** Un match ou une saisie introuvable (404). */
export class SaisieIntrouvable extends Error {}

const decimale = (x) => String(x).replace('.', ',');

/** Vos bookmakers : ceux cochés dans Réglages (valueBookmakers) ; aucun coché : ceux de la liste connue. */
export function vosBookmakers(config = getEngineConfig('football')) {
  return vosBookmakersDe(config);
}

/**
 * Contrôle une saisie. Lève SaisieInvalide (400) sinon.
 * @returns {{ bookmaker, marketId, sens, ligne: number|null, equipe: 'home'|'away'|null, joueur: string|null, cote: number }}
 */
export function validerSaisie(corps, { config = getEngineConfig('football') } = {}) {
  if (!corps || typeof corps !== 'object' || Array.isArray(corps)) {
    throw new SaisieInvalide('Corps attendu : { matchId, bookmaker, marketId, sens, ligne, equipe, joueur, cote }.');
  }
  const m = PAR_ID.get(corps.marketId);
  if (!m) throw new SaisieInvalide(`Marché inconnu : « ${corps.marketId ?? ''} ». Marchés saisissables : ${MARCHES_SAISIE.map((x) => x.libelle).join(', ')}. Le 1N2 se relève chez The Odds API.`);
  const bookmaker = typeof corps.bookmaker === 'string' ? corps.bookmaker.trim() : '';
  if (!vosBookmakers(config).includes(bookmaker)) {
    throw new SaisieInvalide(`« ${bookmaker} » n'est pas un de vos bookmakers (Réglages › Paramètres du moteur) : seule une cote de vos bookmakers peut être saisie.`);
  }
  if (!m.sens.includes(corps.sens)) throw new SaisieInvalide(`Issue inconnue pour « ${m.libelle} » : ${m.sens.map((s) => `« ${s} »`).join(' ou ')}.`);
  let ligne = null;
  if (m.ligne) {
    const l = corps.ligne;
    if (typeof l !== 'number' || !Number.isFinite(l) || Math.abs(l - Math.floor(l) - 0.5) > 1e-9 || l < BORNES_LIGNE.min || l > BORNES_LIGNE.max) {
      throw new SaisieInvalide(`« ligne » : une demi-ligne de ${decimale(BORNES_LIGNE.min)} à ${decimale(BORNES_LIGNE.max)} (2,5 ; 9,5…).`);
    }
    ligne = l;
  }
  let equipe = null;
  if (m.equipe) {
    if (corps.equipe !== 'home' && corps.equipe !== 'away') throw new SaisieInvalide('« equipe » vaut « home » (domicile) ou « away » (extérieur).');
    equipe = corps.equipe;
  }
  let joueur = null;
  if (m.joueur) {
    joueur = typeof corps.joueur === 'string' ? corps.joueur.replace(/\s+/g, ' ').trim() : '';
    if (!joueur || joueur.length > 80) throw new SaisieInvalide('« joueur » : le nom du buteur (80 caractères au plus).');
  }
  const cote = corps.cote;
  if (typeof cote !== 'number' || !Number.isFinite(cote) || cote < BORNES_COTE.min || cote > BORNES_COTE.max) {
    throw new SaisieInvalide(`« cote » : une cote décimale de ${decimale(BORNES_COTE.min)} à ${BORNES_COTE.max.toLocaleString('fr-FR')}.`);
  }
  return { bookmaker, marketId: m.id, sens: corps.sens, ligne, equipe, joueur, cote: Math.round(cote * 1000) / 1000 };
}

/** Où une saisie se range dans l'archive : marché, sélection, ligne. */
export function cleArchive(s) {
  const m = PAR_ID.get(s.marketId);
  const selection = m.joueur ? `joueur:${s.joueur}` : m.equipe ? `${s.equipe}_${s.sens}` : s.sens;
  return { market: m.archive, selection, line: m.ligne ? s.ligne : 0 };
}
export const cleDeSaisie = (bookmaker, k) => `${bookmaker}|${k.market}|${k.selection}|${Number(k.line)}`;

/** Une ligne de l'archive relue comme une saisie (null pour un marché que ce fichier ne connaît pas). */
export function depuisArchive(l) {
  const m = PAR_ARCHIVE.get(l.market);
  if (!m) return null;
  let sens = l.selection;
  let equipe = null;
  let joueur = null;
  if (m.joueur) {
    joueur = String(l.selection).replace(/^joueur:/, '');
    sens = 'yes';
  } else if (m.equipe) {
    [equipe, sens] = String(l.selection).split('_');
  }
  return { bookmaker: l.bookmaker, marketId: m.id, sens, equipe, joueur, ligne: m.ligne ? Number(l.line) : null };
}

/** « Plus de 9,5 corners », « Arsenal — Moins de 1,5 buts », « Les 2 équipes marquent : Oui », « Saka marque ». */
export function libelleSaisie(s, { home = 'Domicile', away = 'Extérieur' } = {}) {
  const m = PAR_ID.get(s.marketId);
  if (!m) return '';
  if (m.joueur) return `${s.joueur} marque`;
  if (m.id === 'bothTeamsScore') return `Les 2 équipes marquent : ${SENS[s.sens]}`;
  const corps = `${SENS[s.sens]} ${decimale(s.ligne)} ${m.unite}`;
  return m.equipe ? `${s.equipe === 'home' ? home : away} — ${corps}` : corps;
}

const LIGNES_BUTS = { 0.5: '05', 1.5: '15', 2.5: '25', 3.5: '35' };

/**
 * La probabilité du moteur pour l'issue d'une saisie, telle qu'il l'affiche
 * (1 / sa cote juste arrondie au centième), ou la raison pour laquelle il n'en
 * a pas. `resultat` : le DTO d'analyzeMatch.
 * @returns {{ probabilite: number|null, coteJuste: number|null, origine: string|null, raison: string|null }}
 */
export function probabiliteDuMoteur(resultat, s) {
  const m = PAR_ID.get(s.marketId);
  const sans = (raison) => ({ probabilite: null, coteJuste: null, origine: null, raison });
  if (!m) return sans('Marché inconnu.');
  if (!m.moteur) return sans(m.sansMoteur);
  if (!resultat) return sans("L'analyse du moteur n'a pas pu se faire pour ce match : pas de probabilité, pas de value.");
  let cote = null;
  let origine;
  if (m.moteur === 'buts') {
    origine = 'modèle de buts du moteur';
    const t = resultat.trueOdds ?? {};
    if (m.id === 'bothTeamsScore') {
      cote = s.sens === 'yes' ? t.bothTeamsScore : t.bothTeamsScoreNo;
    } else {
      const suffixe = LIGNES_BUTS[s.ligne];
      if (!suffixe) return sans(`Le moteur ne calcule les buts que sur les lignes 0,5 à 3,5 : pas de probabilité pour ${decimale(s.ligne)}.`);
      const champ = `${s.sens}${suffixe}`;
      cote = m.id === 'totalGoals' ? t[champ] : t[s.equipe === 'home' ? 'homeTeamGoals' : 'awayTeamGoals']?.[champ];
    }
  } else {
    const e = resultat.statExpectations?.[m.stat];
    origine = `${m.unite} attendus par le moteur (binomiale négative mesurée)`;
    if (!e) return sans(`Pas assez de matchs relevés pour ces deux équipes (6 au moins chacune) : le moteur n'a pas de ${m.unite} attendus.`);
    const k = STAT_KINDS[m.stat];
    cote = m.equipe ? coteJusteLigne(e[s.equipe], k.invKTeam, s.ligne, s.sens) : coteJusteLigne(e.total, k.invKTotal, s.ligne, s.sens);
  }
  if (!(Number(cote) > 1)) return sans('Le moteur ne donne pas de probabilité pour cette issue.');
  return { probabilite: 1 / Number(cote), coteJuste: Number(cote), origine, raison: null };
}

/** Les seuils du moteur, en %, comme l'écran les lit (min, max, cote maximale). */
export function regleDuMoteur(config = getEngineConfig('football')) {
  return regleEnPourcent(config);
}

/**
 * La value d'une cote saisie face à la probabilité du moteur. Étape 10 : le
 * verdict se décide sur l'avantage ARRONDI au centième — le nombre envoyé, que
 * la pastille de l'écran relit (avant, le serveur jugeait le nombre exact : à
 * quelques millièmes du seuil, il disait « value » et la pastille « sous le
 * seuil »). `bornes` : la cote minimale et la cote maximale à prendre pour cette
 * issue (core/engine/coteMinimale.js, la même règle).
 */
export function valueDeLaSaisie({ saisie, cote, releveAt, resultat, config, reglage, maintenant, coupDEnvoi, heureSure }) {
  const moteur = probabiliteDuMoteur(resultat, saisie);
  const fraicheur = fraicheurCote({ releveAt, maintenant, coupDEnvoi, heureSure, reglage });
  const pourcent = moteur.probabilite === null ? null : pourcentDeLaCote(moteur.probabilite, cote);
  const jouable = vosBookmakers(config).includes(saisie.bookmaker);
  const regle = regleDuMoteur(config);
  return {
    moteur,
    fraicheur,
    jouable,
    regle,
    pourcent,
    verdict: verdictValue({ pourcent, cote, regle, jouable, fraicheur }),
    bornes: moteur.probabilite === null ? null : bornesDeLaRegle(moteur.probabilite, regle)
  };
}

/**
 * Ce qu'un pari pris sur cette saisie enregistre (étape 10, « J'ai parié ») : le
 * marché et l'issue écrits comme le moteur les écrit (sports/football/markets.js),
 * pour que le règlement automatique, l'historique et la valeur de clôture les
 * lisent comme les autres paris. Cartons et buteurs n'ont pas de règle de
 * règlement automatique : ils se règlent à la main, comme avant.
 */
export function pariDeLaSaisie(s, { home = 'Domicile', away = 'Extérieur' } = {}) {
  const m = PAR_ID.get(s?.marketId);
  if (!m) return null;
  const equipe = s.equipe === 'home' ? home : s.equipe === 'away' ? away : null;
  const sens = s.sens === 'over' ? 'Plus de' : s.sens === 'under' ? 'Moins de' : null;
  if (m.joueur) return { market: m.libelle, pick: `${s.joueur} marque`, marketId: m.id, params: { joueur: s.joueur } };
  if (m.id === 'bothTeamsScore') return { market: MARKET_LABELS.bothTeamsScore, pick: s.sens === 'yes' ? 'Oui' : 'Non', marketId: m.id, params: { outcome: s.sens } };
  const libelleMarche = MARKET_LABELS[m.id];
  const marche = typeof libelleMarche === 'function' ? libelleMarche(equipe) : libelleMarche ?? (m.equipe ? `${m.libelle.replace(' d’une équipe', '')} — ${equipe}` : m.libelle);
  const corps = `${sens} ${s.ligne} ${m.unite}`;
  return {
    market: marche,
    pick: m.equipe ? `${equipe} — ${corps}` : corps,
    marketId: m.id,
    params: m.equipe ? { team: s.equipe, line: s.ligne, side: s.sens } : { line: s.ligne, side: s.sens }
  };
}

// --------------------------------------------------------- le match

const clubs = new Map();
function club(nom, league, database) {
  const cle = `${league}|${nom}`;
  if (!clubs.has(cle)) {
    let id = null;
    try {
      id = clubDuMagasin(nom, league, database);
    } catch {
      id = null;
    }
    clubs.set(cle, id);
  }
  return clubs.get(cle);
}

/**
 * Le match d'une saisie et sa clé dans l'archive : les identifiants FotMob des
 * deux clubs et le jour (le même match, venu des cotes ou du calendrier sous
 * deux identifiants d'appli, a la même clé), à défaut ses noms.
 */
export function matchDeLaSaisie(matchId, { source = 'odds-api', database = null } = {}) {
  if (typeof matchId !== 'string' || !matchId.trim()) throw new SaisieInvalide('« matchId » : l’identifiant du match (page du match).');
  if (source !== 'odds-api') throw new SaisieInvalide('Une cote ne se saisit que sur un vrai match (source « odds-api »), pas sur le jeu de test.');
  const match = findAdaptedMatch(source, matchId.trim());
  if (!match) throw new SaisieIntrouvable(`Match introuvable : ${matchId}`);
  const base = database ?? openDb();
  const homeId = club(match.home, match.league, base);
  const awayId = club(match.away, match.league, base);
  const date = jourUtc(Date.parse(match.commenceTime));
  const sourceEvent = homeId && awayId ? `fotmob:${homeId}|${awayId}|${date}` : `nom:${nomCle(match.league)}|${nomCle(match.home)}|${nomCle(match.away)}|${date}`;
  return {
    match,
    heureSure: Boolean(match.hasOdds),
    fixture: { sourceEvent, league: match.league, date, kickoff: match.hasOdds ? match.commenceTime : null, homeName: match.home, awayName: match.away, homeId, awayId }
  };
}

const CACHE_MOTEUR_MS = 120_000;
const cacheMoteur = new Map();
/** Le résultat du moteur pour ce match, sans repli payant, gardé deux minutes (une saisie en appelle souvent une autre). */
async function resultatDuMoteur(match) {
  const cle = String(match.matchId);
  const connu = cacheMoteur.get(cle);
  if (connu && Date.now() - connu.at < CACHE_MOTEUR_MS) return connu.promesse;
  const promesse = (async () => {
    const enrichi = await enrichMatchWithRealAverages(match, { sansRepliPayant: true });
    return analyzeMatch(enrichi, getEngineConfig('football'), getTiltState(), getSport('football'));
  })();
  cacheMoteur.set(cle, { at: Date.now(), promesse });
  promesse.catch(() => cacheMoteur.delete(cle));
  return promesse;
}

/** Pour les tests : oublier les résultats du moteur gardés. */
export function __oublierMoteur() {
  cacheMoteur.clear();
  clubs.clear();
}

// --------------------------------------------------------- l'archive

/**
 * Les saisies d'un match, regroupées par clé (bookmaker, marché, sélection,
 * ligne) : chaque version datée — de l'archive, puis de la file d'écriture
 * (« en attente ») —, la dernière faisant foi (prix vide = retirée).
 */
function groupesDuMatch(sourceEvent, database) {
  const ecrites = lireSaisies(sourceEvent, { database }).map((l) => ({ ...l, enAttente: false }));
  const attente = lignesEnAttente('saisies')
    .filter((l) => l.sourceEvent === sourceEvent)
    .map((l) => ({ bookmaker: l.bookmaker, market: l.market, selection: l.selection, line: Number(l.line ?? 0), releveAt: l.releveAt, price: l.price ?? null, enAttente: true }));
  const groupes = new Map();
  for (const l of [...ecrites, ...attente]) {
    const cle = cleDeSaisie(l.bookmaker, l);
    const g = groupes.get(cle) ?? { cle, bookmaker: l.bookmaker, market: l.market, selection: l.selection, line: Number(l.line), versions: [] };
    g.versions.push({ releveAt: l.releveAt, price: l.price ?? null, enAttente: l.enAttente });
    groupes.set(cle, g);
  }
  for (const g of groupes.values()) {
    g.versions.sort((a, b) => a.releveAt.localeCompare(b.releveAt));
    g.derniere = g.versions.at(-1);
  }
  return groupes;
}

/** Une saisie telle que la page l'affiche. */
function decrire(g, { match, heureSure, resultat, config, reglage, maintenant }) {
  const s = depuisArchive(g);
  if (!s) return null;
  const cote = g.derniere.price;
  const v = valueDeLaSaisie({ saisie: s, cote, releveAt: g.derniere.releveAt, resultat, config, reglage, maintenant, coupDEnvoi: match.commenceTime, heureSure });
  const prix = g.versions.filter((x) => x.price !== null);
  return {
    cle: g.cle,
    ...s,
    bookmakerTitre: titreBookmaker(s.bookmaker),
    marche: PAR_ID.get(s.marketId).libelle,
    libelle: libelleSaisie(s, { home: match.home, away: match.away }),
    cote,
    releveAt: g.derniere.releveAt,
    premiereSaisieA: g.versions[0].releveAt,
    versions: g.versions.length,
    corrigee: prix.length > 1,
    coteAvant: prix.length > 1 ? prix.at(-2).price : null,
    enAttente: g.derniere.enAttente,
    provenance: PROVENANCE_SAISIE,
    ...v,
    // Étape 10 : ce que « J'ai parié » enregistre pour cette cote (marché et issue écrits comme le moteur).
    pari: pariDeLaSaisie(s, { home: match.home, away: match.away })
  };
}

/**
 * Tout ce que la page d'un match montre des saisies : les cotes saisies en
 * vigueur (avec leur value, leur heure, leur fraîcheur), celles retirées, les
 * bookmakers et marchés du formulaire, les seuils et le réglage. Si des
 * saisies attendent d'être écrites et que plus personne ne tient le verrou,
 * elles partent d'abord (écriture décidée par une saisie, faite par le serveur).
 */
export async function etatDesSaisies({ matchId, source = 'odds-api', maintenant = Date.now(), database = null } = {}) {
  const base = database ?? openDb();
  const { match, heureSure, fixture } = matchDeLaSaisie(matchId, { source, database: base });
  if (lignesEnAttente('saisies').some((l) => l.sourceEvent === fixture.sourceEvent)) {
    await vider({ database: base, seulement: 'saisies', maintenant });
  }
  const groupes = groupesDuMatch(fixture.sourceEvent, base);
  const config = getEngineConfig('football');
  const reglageLu = lireReglageFraicheur();
  let resultat = null;
  let raisonMoteur = null;
  try {
    resultat = await resultatDuMoteur(match);
  } catch (error) {
    raisonMoteur = `analyse du moteur impossible : ${String(error?.message ?? error).slice(0, 160)}`;
  }
  const contexte = { match, heureSure, resultat, config, reglage: reglageLu.reglage, maintenant };
  const liste = [...groupes.values()];
  const enVigueur = liste.filter((g) => g.derniere.price !== null).map((g) => decrire(g, contexte)).filter(Boolean);
  const retirees = liste
    .filter((g) => g.derniere.price === null)
    .map((g) => {
      const d = depuisArchive(g);
      return d ? { cle: g.cle, ...d, bookmakerTitre: titreBookmaker(d.bookmaker), libelle: libelleSaisie(d, { home: match.home, away: match.away }), retireeA: g.derniere.releveAt, enAttente: g.derniere.enAttente } : null;
    })
    .filter(Boolean);
  const tri = (a, b) => b.releveAt.localeCompare(a.releveAt);
  return {
    genereLe: iso(maintenant),
    match: { matchId: match.matchId, home: match.home, away: match.away, league: match.league, coupDEnvoi: match.commenceTime, heureSure, cleArchive: fixture.sourceEvent },
    saisies: enVigueur.sort(tri),
    retirees: retirees.sort((a, b) => b.retireeA.localeCompare(a.retireeA)),
    bookmakers: vosBookmakers(config).map((cle) => ({ cle, titre: titreBookmaker(cle) })),
    marches: MARCHES_SAISIE.map((m) => ({ id: m.id, libelle: m.libelle, sens: m.sens.map((x) => ({ valeur: x, libelle: m.joueur ? 'marque' : SENS[x] })), ligne: m.ligne, equipe: m.equipe, joueur: m.joueur, unite: m.unite, avecMoteur: Boolean(m.moteur), sansMoteur: m.sansMoteur })),
    regle: regleDuMoteur(config),
    reglage: { ...reglageLu.reglage, source: reglageLu.source },
    moteur: { disponible: Boolean(resultat), raison: raisonMoteur },
    provenance: PROVENANCE_SAISIE
  };
}

/** L'heure d'une nouvelle version : maintenant, ou juste après la précédente (la clé de l'archive porte l'heure). */
function heureSuivante(maintenant, g) {
  const t = iso(maintenant);
  if (!g?.derniere) return t;
  return g.derniere.releveAt >= t ? new Date(Date.parse(g.derniere.releveAt) + 1).toISOString() : t;
}

async function ecrireMaintenant(ligne, { database, maintenant }) {
  mettreEnFile('saisies', [ligne]);
  const r = await vider({ database, seulement: 'saisies', maintenant });
  const enAttente = lignesEnAttente('saisies').some((l) => l.sourceEvent === ligne.sourceEvent && l.releveAt === ligne.releveAt && l.bookmaker === ligne.bookmaker && l.market === ligne.market && l.selection === ligne.selection);
  return { ecrite: !enAttente, enAttente, raison: enAttente ? (r.erreur ? `écriture en échec : ${r.erreur}` : "une passe d'actualisation ou un import tient la base : la cote part dans les archives dès qu'il se termine") : null };
}

/**
 * Enregistre une cote saisie (PUT idempotent). Lève SaisieInvalide (400) ou
 * SaisieIntrouvable (404).
 * @returns {Promise<{ change: boolean, correction: boolean, ecrite: boolean, enAttente: boolean, raison: string|null, cle: string, etat: object }>}
 */
export async function enregistrerSaisie(corps, { maintenant = Date.now(), database = null } = {}) {
  const config = getEngineConfig('football');
  const s = validerSaisie(corps, { config });
  const base = database ?? openDb();
  const { fixture } = matchDeLaSaisie(corps.matchId, { source: corps.source ?? 'odds-api', database: base });
  let k = cleArchive(s);
  const groupes = groupesDuMatch(fixture.sourceEvent, base);
  if (PAR_ID.get(s.marketId).joueur) {
    // Le même buteur, autrement écrit (« Mbappé », « mbappe ») : la même saisie.
    const meme = [...groupes.values()].find((g) => g.bookmaker === s.bookmaker && g.market === k.market && nomCle(String(g.selection).replace(/^joueur:/, '')) === nomCle(s.joueur));
    if (meme) k = { ...k, selection: meme.selection };
  }
  const cle = cleDeSaisie(s.bookmaker, k);
  const g = groupes.get(cle);
  if (g && g.derniere.price !== null && Math.abs(g.derniere.price - s.cote) < 1e-9) {
    return { change: false, correction: false, ecrite: !g.derniere.enAttente, enAttente: g.derniere.enAttente, raison: null, cle, etat: await etatDesSaisies({ matchId: corps.matchId, maintenant, database: base }) };
  }
  const ligne = { ...fixture, provenance: PROVENANCE_SAISIE, bookmaker: s.bookmaker, market: k.market, selection: k.selection, line: k.line, price: s.cote, releveAt: heureSuivante(maintenant, g) };
  const r = await ecrireMaintenant(ligne, { database: base, maintenant });
  return { change: true, correction: Boolean(g && g.derniere.price !== null), ...r, cle, etat: await etatDesSaisies({ matchId: corps.matchId, maintenant, database: base }) };
}

/**
 * Retire une cote saisie (PUT idempotent : une saisie déjà retirée ne
 * réécrit rien). Lève SaisieInvalide (400) ou SaisieIntrouvable (404).
 */
export async function retirerSaisie(corps, { maintenant = Date.now(), database = null } = {}) {
  if (!corps || typeof corps !== 'object' || typeof corps.cle !== 'string' || !corps.cle.trim()) {
    throw new SaisieInvalide('Corps attendu : { matchId, cle } (la clé d’une saisie de la page du match).');
  }
  const base = database ?? openDb();
  const { fixture } = matchDeLaSaisie(corps.matchId, { source: corps.source ?? 'odds-api', database: base });
  const groupes = groupesDuMatch(fixture.sourceEvent, base);
  const g = groupes.get(corps.cle.trim());
  if (!g) throw new SaisieIntrouvable(`Aucune cote saisie sous « ${corps.cle} » pour ce match.`);
  if (g.derniere.price === null) {
    return { change: false, ecrite: !g.derniere.enAttente, enAttente: g.derniere.enAttente, raison: null, cle: g.cle, etat: await etatDesSaisies({ matchId: corps.matchId, maintenant, database: base }) };
  }
  const ligne = { ...fixture, provenance: PROVENANCE_SAISIE, bookmaker: g.bookmaker, market: g.market, selection: g.selection, line: g.line, price: null, releveAt: heureSuivante(maintenant, g) };
  const r = await ecrireMaintenant(ligne, { database: base, maintenant });
  return { change: true, ...r, cle: g.cle, etat: await etatDesSaisies({ matchId: corps.matchId, maintenant, database: base }) };
}
