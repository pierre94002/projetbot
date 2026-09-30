/**
 * valueFinder.js — quelle est la cote juste, et quand une cote vaut-elle le coup ?
 * -----------------------------------------------------------------------
 * LA COTE JUSTE vient des bookmakers dont les prix sont les plus justes,
 * mesuré le 23/09/2026 :
 *   - sur l'historique (20 914 matchs de 18 championnats, football-data) :
 *     Pinnacle est le plus juste de tous (perte logarithmique 0,9925 sur
 *     15 885 matchs), personne ne fait significativement mieux ; la bourse
 *     Betfair est la PIRE brute (prix fictifs sur carnets vides) ; moyenner
 *     tous les bookmakers sans filtre fait perdre face à la clôture ;
 *   - sur les cotes du jour (197 matchs, 22 bookmakers) : écart médian à
 *     Pinnacle de 0,18 à 0,49 point pour Suprabets, Everygame, Marathon,
 *     1xBet, Codere ; 0,58 à 0,83 pour William Hill, Coolbet, Betsson,
 *     Kambi (Unibet, LeoVegas), Tipico ; les bookmakers français sont les
 *     plus éloignés et biaisés (favori surévalué de 0,7 à 2 points).
 * D'où une règle par PALIERS : Pinnacle seul s'il cote le match ; sinon la
 * moyenne des avis du palier 2 ; sinon, au moins deux avis du palier 3.
 * Les bookmakers qui recopient le même trader (William Hill et 888sport,
 * Betsson et NordicBet, la famille Kambi…) ne comptent que pour UN avis.
 * Rejouée sur les 174 matchs cotés par Pinnacle, cette règle s'en écarte
 * de 0,32 point en médiane, contre 0,45 pour la moyenne de tous.
 *
 * UN PARI n'est recommandé que si un bookmaker AUTORISÉ paie au-dessus de
 * la cote juste d'au moins `edgeThresholdMin` — et jamais chez un
 * bookmaker qui a servi à fixer cette cote juste (juge et partie). Testé
 * sur l'historique (Pinnacle, sinon moyenne ; meilleure cote de dix
 * bookmakers grand public ; cotes d'avant-match) : seuil 0 %, 3 359 paris,
 * +5,0 % (±4,4) et +0,66 % face à la clôture (±0,23) ; seuil 2 %, 731
 * paris, +4,3 % (±10,5) et +1,75 % face à la clôture (±0,58). Seul le gain
 * face à la clôture est significatif — c'est la signature d'un avantage que
 * la chance n'explique pas. Un bookmaker limite souvent les comptes gagnants.
 *
 * Garde-fous : pas de jeu de cotes incohérent, pas d'avantage
 * invraisemblable (au-delà de `edgeThresholdMax`, c'est une cote périmée ou
 * une erreur), pas de cote au-delà de `maxValueOdds`.
 * -----------------------------------------------------------------------
 */

import { removeMargin } from '../market/marginRemoval.js';

const ISSUES = [
  { outcome: 'home', champ: 'odds1', index: 0 },
  { outcome: 'draw', champ: 'oddsDraw', index: 1 },
  { outcome: 'away', champ: 'odds2', index: 2 }
];

/**
 * Paliers par défaut. Un élément est une clé de bookmaker, ou une LISTE de
 * clés qui recopient le même trader et ne font qu'un avis. `minimum` : nombre
 * d'avis requis pour que le palier fixe la cote juste.
 */
export const PALIERS_PAR_DEFAUT = [
  { nom: 'Pinnacle', minimum: 1, avis: ['pinnacle'] },
  { nom: 'palier 2', minimum: 1, avis: ['marathonbet', 'onexbet', 'codere_it', ['suprabets', 'everygame']] },
  {
    nom: 'palier 3',
    minimum: 2,
    avis: ['tipico_de', ['williamhill', 'sport888'], 'coolbet', ['betsson', 'nordicbet'], ['unibet_nl', 'unibet_se', 'leovegas_se'], 'betfair_ex_eu']
  }
];
/** La bourse Betfair n'est retenue que si ses prix ont une marge plausible. */
const MARGE_MAX_BOURSE = 0.06;

const complet = (b) => [b.odds1, b.oddsDraw, b.odds2].every((o) => Number.isFinite(o) && o > 1);

function lecture(b) {
  if (!complet(b)) return null;
  const r = removeMargin([b.odds1, b.oddsDraw, b.odds2]);
  if (r.anomaly) return null;
  if (b.key === 'betfair_ex_eu' && r.overroundPercent / 100 > MARGE_MAX_BOURSE) return null;
  return r.probabilities;
}

const moyenne = (listes) => {
  const s = [0, 1, 2].map((k) => listes.reduce((a, p) => a + p[k], 0) / listes.length);
  const t = s[0] + s[1] + s[2];
  return s.map((p) => p / t);
};

/**
 * Probabilité juste d'un match, tirée des bookmakers les plus fiables.
 * Renvoie { probabilities, basis, books, keys } ou null si aucun palier
 * n'a assez d'avis.
 */
export function fairFromBookmakers(byBookmaker = [], config = {}) {
  const parCle = new Map(byBookmaker.map((b) => [b.key, b]));
  const paliers = config.referenceTiers ?? PALIERS_PAR_DEFAUT;
  for (const palier of paliers) {
    const avis = [];
    for (const element of palier.avis) {
      const cles = Array.isArray(element) ? element : [element];
      const lus = cles
        .map((cle) => parCle.get(cle))
        .filter(Boolean)
        .map((b) => ({ b, p: lecture(b) }))
        .filter((x) => x.p);
      if (lus.length) avis.push({ p: moyenne(lus.map((x) => x.p)), books: lus.map((x) => x.b) });
    }
    if (avis.length >= (palier.minimum ?? 1)) {
      const books = avis.flatMap((a) => a.books);
      return {
        probabilities: moyenne(avis.map((a) => a.p)),
        basis: palier.nom,
        books: books.map((b) => b.title ?? b.key),
        keys: books.map((b) => b.key)
      };
    }
  }
  return null;
}

/**
 * Probabilité juste de repli, quand aucun palier n'a assez d'avis : la
 * moyenne des seules lignes saines (ni incohérentes, ni bourse à carnet
 * vide). Sert au PRONOSTIC ; aucune value ne se calcule dessus.
 */
export function fairFromAllValid(byBookmaker = []) {
  const lus = byBookmaker.map((b) => ({ b, p: lecture(b) })).filter((x) => x.p);
  return lus.length ? { probabilities: moyenne(lus.map((x) => x.p)), keys: lus.map((x) => x.b.key) } : null;
}

/**
 * Bourses d'échange : la cote affichée ne tient pas compte de la commission
 * prélevée sur les gains. Jamais jouées en mode « tous les bookmakers » ;
 * cochées explicitement, leur cote est ramenée à la cote NETTE.
 */
const BOURSES = { betfair_ex_eu: 0.05, betfair_ex_uk: 0.05, betfair_ex_au: 0.05, matchbook: 0.02, smarkets: 0.02 };
const coteNette = (b, champ) => (b.key in BOURSES ? 1 + (b[champ] - 1) * (1 - BOURSES[b.key]) : b[champ]);

/** Une ligne n'est jouable que complète et cohérente — une cote périmée ne l'est pas. */
function ligneSaine(b) {
  if (!complet(b)) return false;
  const r = removeMargin([b.odds1, b.oddsDraw, b.odds2]);
  if (r.anomaly) return false;
  return !(b.key in BOURSES) || r.overroundPercent / 100 <= MARGE_MAX_BOURSE;
}

/**
 * @param {object} p
 * @param {Array}  p.byBookmaker   cotes par bookmaker [{ key, title, odds1, oddsDraw, odds2 }]
 * @param {number[]} p.fair        probabilités justes [domicile, nul, extérieur]
 * @param {string[]} p.referenceKeys bookmakers qui ont fixé la cote juste de ce match
 * @param {object} p.config        configuration du moteur
 * @param {object} p.tiltState     coupe-circuit
 * @param {number} p.bankroll      bankroll de référence pour la mise
 * @param {object} p.labels        libellés { home, draw, away }
 */
export function findValueBet({ byBookmaker = [], fair, referenceKeys = [], config, tiltState = {}, bankroll, labels = {} }) {
  if (tiltState.circuitBreakerActive) return { action: 'CIRCUIT_BREAKER_ACTIVE', stake: null, candidates: [] };
  const limites = {
    edgeThresholdMin: config.edgeThresholdMin,
    edgeThresholdMax: config.edgeThresholdMax,
    maxValueOdds: config.maxValueOdds ?? 5
  };
  const passe = (reason, candidates = []) => ({ action: 'PASS', stake: null, reason, candidates, limits: limites });
  if (!fair) return passe('no_market_odds');

  // Où l'on peut jouer : les bookmakers cochés ; « aucun coché » vaut tous,
  // sauf les bourses d'échange, qui doivent être cochées explicitement.
  const autorises = new Set(config.valueBookmakers ?? []);
  const permis = byBookmaker.filter((b) => (autorises.size ? autorises.has(b.key) : !(b.key in BOURSES)));
  if (!permis.length) return passe('aucun_bookmaker_autorise');
  // Jamais chez un bookmaker qui a fixé la cote juste de CE match : son prix
  // est la cote juste, marge en plus.
  const juges = new Set(referenceKeys);
  const nonJuges = permis.filter((b) => !juges.has(b.key));
  if (!nonJuges.length) return passe('bookmakers_juges');
  // Ni sur une ligne incohérente : une cote périmée n'est pas une value.
  const jouables = nonJuges.filter(ligneSaine);
  if (!jouables.length) return passe('cotes_incoherentes');

  const plausible = (odds, p) => odds <= limites.maxValueOdds && p * odds - 1 <= limites.edgeThresholdMax;
  const candidates = ISSUES.map(({ outcome, champ, index }) => {
    const offres = jouables.filter((b) => Number.isFinite(b[champ]) && b[champ] > 1);
    if (!offres.length) return null;
    const meilleure = (liste) => liste.reduce((m, b) => (!m || coteNette(b, champ) > coteNette(m, champ) ? b : m), null);
    // La meilleure offre PLAUSIBLE : une cote aberrante ou trop haute ailleurs
    // ne doit pas masquer une vraie value. À défaut, la plus haute, pour
    // l'afficher et dire pourquoi elle est écartée.
    const offre = meilleure(offres.filter((b) => plausible(coteNette(b, champ), fair[index]))) ?? meilleure(offres);
    const odds = coteNette(offre, champ);
    const ev = fair[index] * odds - 1;
    const exclusion =
      odds > limites.maxValueOdds ? 'cote_trop_haute'
      : ev > limites.edgeThresholdMax ? 'avantage_invraisemblable'
      : ev <= limites.edgeThresholdMin ? 'sous_le_seuil'
      : null;
    return {
      outcome,
      label: labels[outcome] ?? outcome,
      odds: Number(odds.toFixed(3)),
      displayedOdds: offre[champ],
      bookmaker: offre.key,
      bookmakerTitle: offre.title ?? offre.key,
      fairOdds: Number((1 / fair[index]).toFixed(2)),
      ev: Number(ev.toFixed(4)),
      exclusion
    };
  }).filter(Boolean);

  const eligibles = candidates.filter((c) => !c.exclusion);
  if (!eligibles.length) {
    // « Hors limites » seulement pour une offre qui paie VRAIMENT au-dessus
    // de la cote juste : une cote trop haute sans avantage n'est pas une value.
    const horsLimites = candidates.some(
      (c) => c.ev > limites.edgeThresholdMin && (c.exclusion === 'cote_trop_haute' || c.exclusion === 'avantage_invraisemblable')
    );
    return passe(horsLimites ? 'value_hors_limites' : 'pas_de_value', candidates);
  }
  const choix = eligibles.reduce((m, c) => (c.ev > m.ev ? c : m));

  // Kelly fractionné : fraction × avantage / (cote − 1), plafonné.
  const kelly = (config.kellyFraction * choix.ev) / (choix.odds - 1);
  const stake = Math.min(Number(bankroll) * kelly, Number(bankroll) * config.maxStakePercent);

  return { action: 'RECOMMENDED', stake: Number(Math.max(0, stake).toFixed(2)), ...choix, candidates, limits: limites };
}
