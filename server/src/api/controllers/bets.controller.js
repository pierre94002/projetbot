import { listBets, createBet, updateBetLegStatus, deleteBet, natureDuPari, gainAttenduDuPari } from '../../data/repositories/betsRepository.js';
import { ApiError } from '../middlewares/errorHandler.js';
import { suiviDesParis } from '../../data/suiviParis.js';
import { alertesDuPari, etatDesGardeFous, REGLAGE_GARDE_FOUS_DEFAUT } from '../../core/risk/gardeFous.js';
import { lireReglageGardeFous } from '../../data/repositories/gardeFousRepository.js';
import { lireComptes } from '../../data/repositories/comptesBookmakersRepository.js';
import { selectionReglable } from '../../data/simulation/simulationRead.js';
import { MARCHES_DE_DEROULE } from '../../data/simulation/jambes.js';

const VALID_STATUSES = new Set(['pending', 'won', 'lost', 'void']);

/**
 * Étape 10 du plan (« J'ai parié ») : d'où vient la cote prise — le relevé
 * The Odds API, une cote saisie à la main sur la page du match, ou la cote vue
 * chez le bookmaker au moment du pari, tapée par Pierre.
 */
const SOURCES_DE_COTE = new Set(['the-odds-api', 'saisie', 'au-pari']);
/** D'où le pari a été enregistré : la page du match (comparateur) ou le ticket de Mes paris. */
const ORIGINES = new Set(['page-du-match', 'mes-paris']);

/**
 * Un pari tel que l'API le rend : celui du carnet, plus son gain attendu
 * (calculé à la lecture, jamais écrit — cf. gainAttenduDuPari).
 */
const avecGainAttendu = (bet) => (bet ? { ...bet, gainAttendu: gainAttenduDuPari(bet) } : bet);

export function getAllBets(req, res) {
  res.json({ bets: listBets().map(avecGainAttendu) });
}

function texteFacultatif(valeur, champ, index, max) {
  if (valeur === undefined || valeur === null) return null;
  if (typeof valeur !== 'string') throw new ApiError(400, `Jambe ${index + 1} : « ${champ} » doit être un texte.`);
  const texte = valeur.replace(/\s+/g, ' ').trim();
  if (!texte) return null;
  if (texte.length > max) throw new ApiError(400, `Jambe ${index + 1} : « ${champ} » dépasse ${max} caractères.`);
  return texte;
}

function instantFacultatif(valeur, champ, index) {
  if (valeur === undefined || valeur === null || valeur === '') return null;
  const t = typeof valeur === 'string' ? Date.parse(valeur) : Number.NaN;
  if (!Number.isFinite(t)) throw new ApiError(400, `Jambe ${index + 1} : « ${champ} » doit être une date (ISO 8601).`);
  return new Date(t).toISOString();
}

/**
 * Ce que « J'ai parié » note en plus sur une sélection (étape 10) : le
 * bookmaker, la probabilité du moteur au moment du pari (et d'où elle vient,
 * quand il l'a calculée), l'heure et la source de la cote prise. Un champ
 * absent n'est pas écrit : un pari envoyé au format d'avant reste identique.
 */
function champsDeLaPrise(leg, index) {
  const sortie = {};
  const bookmaker = texteFacultatif(leg.bookmaker, 'bookmaker', index, 40);
  if (bookmaker !== null) {
    if (!/^[a-z0-9_]+$/.test(bookmaker)) throw new ApiError(400, `Jambe ${index + 1} : « bookmaker » est la clé du bookmaker (williamhill, unibet_nl…).`);
    sortie.bookmaker = bookmaker;
  }
  const titre = texteFacultatif(leg.bookmakerTitle, 'bookmakerTitle', index, 60);
  if (titre !== null) sortie.bookmakerTitle = titre;
  if (leg.probabiliteMoteur !== undefined && leg.probabiliteMoteur !== null) {
    const p = leg.probabiliteMoteur;
    if (typeof p !== 'number' || !Number.isFinite(p) || p <= 0 || p >= 1) {
      throw new ApiError(400, `Jambe ${index + 1} : « probabiliteMoteur » est une probabilité strictement entre 0 et 1 (0,58 pour 58 %).`);
    }
    sortie.probabiliteMoteur = p;
  }
  const source = texteFacultatif(leg.probabiliteSource, 'probabiliteSource', index, 200);
  if (source !== null) sortie.probabiliteSource = source;
  const lueA = instantFacultatif(leg.probabiliteLueA, 'probabiliteLueA', index);
  if (lueA !== null) sortie.probabiliteLueA = lueA;
  const releveeA = instantFacultatif(leg.coteReleveeA, 'coteReleveeA', index);
  if (releveeA !== null) sortie.coteReleveeA = releveeA;
  if (leg.coteSource !== undefined && leg.coteSource !== null) {
    if (!SOURCES_DE_COTE.has(leg.coteSource)) throw new ApiError(400, `Jambe ${index + 1} : « coteSource » vaut ${[...SOURCES_DE_COTE].map((s) => `« ${s} »`).join(', ')}.`);
    sortie.coteSource = leg.coteSource;
  }
  return sortie;
}

function validateLeg(leg, index) {
  const { homeName, awayName, market, pick, odds } = leg ?? {};
  if (!homeName || !awayName || !market || !pick) {
    throw new ApiError(400, `Jambe ${index + 1} : "homeName", "awayName", "market" et "pick" sont requis.`);
  }
  const numericOdds = Number(odds);
  if (!Number.isFinite(numericOdds) || numericOdds <= 1) {
    throw new ApiError(400, `Jambe ${index + 1} : la cote doit être un nombre supérieur à 1.`);
  }
  return {
    matchId: leg.matchId ?? null,
    homeName,
    awayName,
    league: leg.league ?? null,
    commenceTime: leg.commenceTime ?? null,
    market,
    // Identifiant de marché structuré + paramètres (cf.
    // sports/football/markets.js) — optionnels, absents pour tout pari placé
    // avant la migration.
    marketId: leg.marketId ?? null,
    params: leg.params ?? null,
    pick,
    odds: numericOdds,
    // Étape 10 : bookmaker, probabilité du moteur au moment du pari, heure de la cote — seulement s'ils sont fournis.
    ...champsDeLaPrise(leg, index)
  };
}

/**
 * Étape 28 du plan : le PRIX JUSTE d'un combiné au moment du pari (POST /api/simulation/prix-combine, rendu par le
 * ticket) — { probabilite (strictement entre 0 et 1), source (un texte, 300 caractères au plus), lueA (l'instant) }.
 * Seulement pour un combiné ; chaque sélection doit être réglable par le règlement (deriveBetLegOutcome, lu jamais
 * modifié) : une sélection de mi-temps ou de score exact se lit et se chiffre, « J'ai parié » la refuse en v1 (elle
 * resterait « en attente » pour toujours). Absent : rien ne change (le format d'avant).
 */
function prixJusteDuPari(prixJuste, jambes) {
  if (prixJuste === undefined || prixJuste === null) return null;
  if (typeof prixJuste !== 'object' || Array.isArray(prixJuste)) throw new ApiError(400, '« prixJuste » : un objet { probabilite, source, lueA }.');
  if (jambes.length < 2) throw new ApiError(400, '« prixJuste » est le prix juste d’un combiné ; un pari simple garde la probabilité du moteur de sa sélection.');
  const p = prixJuste.probabilite;
  if (typeof p !== 'number' || !Number.isFinite(p) || p <= 0 || p >= 1) throw new ApiError(400, '« prixJuste.probabilite » est une probabilité strictement entre 0 et 1 (0,244 pour 24,4 %).');
  let source = null;
  if (prixJuste.source !== undefined && prixJuste.source !== null) {
    if (typeof prixJuste.source !== 'string') throw new ApiError(400, '« prixJuste.source » doit être un texte.');
    source = prixJuste.source.replace(/\s+/g, ' ').trim() || null;
    if (source && source.length > 300) throw new ApiError(400, '« prixJuste.source » dépasse 300 caractères.');
  }
  let lueA = null;
  if (prixJuste.lueA !== undefined && prixJuste.lueA !== null && prixJuste.lueA !== '') {
    const t = typeof prixJuste.lueA === 'string' ? Date.parse(prixJuste.lueA) : Number.NaN;
    if (!Number.isFinite(t)) throw new ApiError(400, '« prixJuste.lueA » doit être une date (ISO 8601).');
    lueA = new Date(t).toISOString();
  }
  const nonReglable = jambes.find((l) => !selectionReglable(l));
  if (nonReglable) {
    throw new ApiError(400, `« J’ai parié » refusé : « ${nonReglable.pick} » se lit et se chiffre, mais ne se règle pas automatiquement — ce pari resterait en attente pour toujours (étape 28, v1).`);
  }
  return { probabilite: p, source, lueA };
}

export function postBet(req, res) {
  const { stake, legs, cotePrise, origine, prixJuste } = req.body ?? {};

  const numericStake = Number(stake);
  if (!Number.isFinite(numericStake) || numericStake <= 0) throw new ApiError(400, 'La mise doit être un nombre positif.');
  if (!Array.isArray(legs) || legs.length === 0) throw new ApiError(400, 'Au moins une sélection ("legs") est requise.');

  const jambes = legs.map(validateLeg);
  // Étape 28 (vérification du 27/10, constat 17) : une sélection d'un marché de DÉROULÉ (mi-temps, premier but, rouge…)
  // se lit et se chiffre, mais aucun règlement ne la sait régler en v1 — refusée par le serveur aussi, prix juste joint ou
  // non (elle resterait « en attente » pour toujours). Ces marchés sont nouveaux : aucun pari ancien ne les porte.
  const deDeroule = jambes.find((l) => MARCHES_DE_DEROULE.includes(l.marketId));
  if (deDeroule) throw new ApiError(400, `« J’ai parié » refusé : « ${deDeroule.pick} » se lit et se chiffre, mais ne se règle pas automatiquement — ce pari resterait en attente pour toujours (étape 28, v1).`);
  const nature = natureDuPari(jambes);
  // Un ticket se joue chez UN bookmaker : ses sélections ne peuvent pas en nommer deux.
  const livres = new Set(jambes.map((l) => l.bookmaker).filter(Boolean));
  if (livres.size > 1) throw new ApiError(400, `Un pari se joue chez un seul bookmaker : ses sélections en nomment ${livres.size} (${[...livres].join(', ')}).`);
  let cote = null;
  if (cotePrise !== undefined && cotePrise !== null) {
    if (typeof cotePrise !== 'number' || !Number.isFinite(cotePrise) || cotePrise <= 1) {
      throw new ApiError(400, '« cotePrise » : la cote du combiné chez le bookmaker, un nombre supérieur à 1.');
    }
    cote = cotePrise;
  }
  if (nature === 'combine-meme-match' && cote === null) {
    throw new ApiError(
      400,
      "Un combiné du même match se paie à la cote que donne le bookmaker : ses sélections sont liées, ce n'est pas le produit des cotes. « cotePrise » est requise."
    );
  }
  if (origine !== undefined && origine !== null && !ORIGINES.has(origine)) {
    throw new ApiError(400, `« origine » vaut ${[...ORIGINES].map((o) => `« ${o} »`).join(' ou ')}.`);
  }

  const prix = prixJusteDuPari(prixJuste, jambes);
  const bet = createBet({ stake: numericStake, legs: jambes, cotePrise: nature === 'simple' ? null : cote, nature, origine: origine ?? null, prixJuste: prix });
  // Étape 11 : les garde-fous SIGNALENT (mise maximale, mise acceptée, solde, compte fermé, perte de la semaine) — le pari est déjà écrit.
  res.status(201).json({ ...avecGainAttendu(bet), alertes: alertesApresLePari(bet) });
}

/**
 * Ce que les garde-fous et la fiche du compte disent d'un pari qu'on vient
 * d'enregistrer (étape 11). Jamais un refus : le pari est écrit avant ; une
 * lecture ratée (réglage, fiches, carnet) ne fait perdre ni le pari ni la
 * réponse — elle se dit.
 */
function alertesApresLePari(bet) {
  try {
    let reglage = REGLAGE_GARDE_FOUS_DEFAUT;
    let compte = null;
    const problemes = [];
    try {
      reglage = lireReglageGardeFous().reglage;
    } catch (error) {
      problemes.push(error.message);
    }
    try {
      compte = bet.bookmaker ? (lireComptes().comptes[bet.bookmaker] ?? null) : null;
    } catch (error) {
      problemes.push(error.message);
    }
    const etat = etatDesGardeFous({ paris: listBets(), reglage });
    const alertes = alertesDuPari({ mise: bet.stake, bookmaker: bet.bookmaker ?? null, bookmakerTitle: bet.bookmakerTitle ?? null, reglage, compte, etat });
    for (const p of problemes) alertes.push({ code: 'lecture-impossible', niveau: 'warning', texte: `Garde-fous non vérifiés pour ce pari : ${p}` });
    return alertes;
  } catch (error) {
    return [{ code: 'lecture-impossible', niveau: 'warning', texte: `Garde-fous non vérifiés pour ce pari : ${error.message}` }];
  }
}

/** GET /api/bets/suivi — le suivi des paris (étape 11) : gain réel et attendu, courbes, valeur de clôture, tableaux, séries, garde-fous. Lecture seule. */
export async function getSuivi(req, res) {
  res.json(await suiviDesParis());
}

export function patchBetLegStatus(req, res) {
  const { status } = req.body ?? {};
  if (!VALID_STATUSES.has(status)) throw new ApiError(400, `Statut invalide : "${status}".`);
  const legIndex = Number(req.params.legIndex);
  if (!Number.isInteger(legIndex) || legIndex < 0) throw new ApiError(400, `Index de sélection invalide : "${req.params.legIndex}".`);

  const bet = updateBetLegStatus(req.params.betId, legIndex, status);
  if (!bet) throw new ApiError(404, `Pari ou sélection introuvable : ${req.params.betId} / ${legIndex}`);
  res.json(avecGainAttendu(bet));
}

export function removeBet(req, res) {
  const deleted = deleteBet(req.params.betId);
  if (!deleted) throw new ApiError(404, `Pari introuvable : ${req.params.betId}`);
  res.status(204).send();
}
