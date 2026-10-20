/**
 * verdictPari.js — LE verdict du moteur sur chaque issue 1N2 d'un match (étape 8 du plan, 06/10/2026).
 * -----------------------------------------------------------------------
 * UNE SEULE SOURCE DE VERDICT. La page d'un match et l'onglet « Value bets »
 * de Mes paris (par l'analyse d'un match : oddsEngine.js, route
 * /api/analysis), le Repérage et la page « Opportunités du jour » (par un
 * état préparé : data/screener.js, data/opportunities.js) appellent ces
 * MÊMES fonctions, sur les mêmes entrées :
 *   - stakingDuMatch : la décision de pari du moteur, telle qu'analyzeMatch
 *     la prenait déjà — findValueBet (la cote juste vient des bookmakers de
 *     référence ; jamais de value chez un bookmaker qui l'a fixée, « juge et
 *     partie ») et, quand l'heure des cotes de vos bookmakers est fournie,
 *     findValueBetFraiche (étape 7 : une cote à rafraîchir n'est jamais
 *     conseillée) ;
 *   - verdictsDuMatch : ce que cette décision dit de CHACUNE des trois
 *     issues, pour un écran qui les montre toutes (une ligne par issue). Le
 *     vert (« value ») ne va qu'à l'issue que le moteur RECOMMANDE, sur une
 *     cote fraîche : exactement son verdict, rien de plus. Chaque autre issue
 *     dit pourquoi elle n'en est pas une (sous le seuil, cote trop haute,
 *     avantage invraisemblable, à rafraîchir, juge et partie, pas retenue…).
 *
 * Avant l'étape 8, le Repérage refaisait sa propre lecture (meilleure cote de
 * vos bookmakers × probabilité du moteur) : il ne savait pas quel bookmaker
 * avait fixé la cote juste et pouvait montrer en vert ce que findValueBet
 * écarte. Le verdict porte maintenant ces bookmakers (`juges`) et, quand l'un
 * d'eux paie plus que l'offre retenue, son offre écartée (`offreJuge`).
 *
 * Pur : ni disque, ni base, ni réseau. Les phrases sont en français, pour
 * Pierre ; l'écran les reprend telles quelles (ui/src/utils/langageParis.js,
 * etatVerdict), en réévaluant seulement la fraîcheur à l'horloge.
 * -----------------------------------------------------------------------
 */

import { findValueBet, fairFromBookmakers, estJouable, estAutorise, coteJouable } from './valueFinder.js';
import { findValueBetFraiche, evaluateurDeFraicheur } from './fraicheurCotes.js';
import { bornesDuMoteur, bornesDeLaRegle, regleEnPourcent } from './coteMinimale.js';
import { titreBookmaker, vosBookmakersDe } from './vosBookmakers.js';
import { plafonnerLeConseil } from '../risk/gardeFous.js';

/** Les trois issues 1N2, leur champ de cote et leur rang dans les probabilités justes. */
export const ISSUES_1N2 = Object.freeze([
  Object.freeze({ issue: 'home', champ: 'odds1', index: 0 }),
  Object.freeze({ issue: 'draw', champ: 'oddsDraw', index: 1 }),
  Object.freeze({ issue: 'away', champ: 'odds2', index: 2 })
]);

/**
 * Les états d'un verdict. `value` est le SEUL vert. Les autres, dans l'ordre
 * où le moteur les écarte, se lisent sans la couleur (cf. ValueBadge).
 */
export const ETATS_VERDICT = Object.freeze([
  'value', // recommandée par le moteur, sur une cote fraîche
  'value-secondaire', // au-dessus du seuil, mais le moteur retient une autre issue du match
  'a-rafraichir', // la cote a pu bouger (étape 7) : pas une value tant qu'elle n'est pas relevée de nouveau
  'sous-seuil',
  'sans-value',
  'trop-beau',
  'cote-haute',
  'juge', // seul un bookmaker qui a fixé la cote juste paie cette issue
  'non-cote', // aucun de vos bookmakers ne cote cette issue
  'non-jouable', // aucun de vos bookmakers ne cote ce match (cotes de référence gratuites seulement)
  'pas-de-reference', // pas assez de bookmakers de référence pour fixer la cote juste
  'incoherente', // les lignes de vos bookmakers sont incomplètes ou incohérentes
  'coupe-circuit', // le coupe-circuit de Réglages est enclenché
  'pas-de-cote' // aucune cote de marché pour ce match
]);

/** Les états qui portent une offre d'un de vos bookmakers (une cote et son bookmaker). */
export const ETATS_AVEC_OFFRE = Object.freeze(['value', 'value-secondaire', 'a-rafraichir', 'sous-seuil', 'sans-value', 'trop-beau', 'cote-haute', 'juge']);

// ------------------------------------------------------------ formats

const arrondi = (x, n = 2) => Number(Number(x).toFixed(n));
const decimales = (x, n = 1) => Math.abs(x).toLocaleString('fr-FR', { minimumFractionDigits: n, maximumFractionDigits: n });
/** « +4,1 % », « −3,2 % », « 0,0 % » (même écriture que l'écran, langageParis.js). */
function pourcentSigne(x) {
  const r = Math.round(x * 10) / 10;
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${decimales(x)} %`;
}
const seuilDit = (x) => `${decimales(x, 0)} %`;
const coteDite = (x) => Number(x).toFixed(2);

// ---------------------------------------------------- la décision du moteur

/** Le match a-t-il une cote de marché complète (1N2) ? La même règle qu'analyzeMatch. */
export function coteDuMarcheDisponible(match) {
  return Number.isFinite(match?.marketOdds?.odds1) && Number.isFinite(match?.marketOdds?.oddsDraw) && Number.isFinite(match?.marketOdds?.odds2);
}

/**
 * La cote juste du match : les bookmakers de RÉFÉRENCE (Pinnacle, sinon le
 * palier 2, sinon deux avis du palier 3, cf. fairFromBookmakers).
 * @returns {{ disponible: boolean, reference: object|null }}
 */
export function referenceDuMatch(match, config) {
  const disponible = coteDuMarcheDisponible(match);
  return { disponible, reference: disponible ? fairFromBookmakers(match.marketOdds?.byBookmaker ?? [], config) : null };
}

/** Les libellés des trois issues, comme le moteur les écrit. */
export function libellesDuMatch(match) {
  return { home: `${match?.home ?? 'Domicile'} gagne`, draw: 'Match nul', away: `${match?.away ?? 'Extérieur'} gagne` };
}

function parametresDuPari(match, reference, config, tiltState) {
  return {
    byBookmaker: match.marketOdds?.byBookmaker ?? [],
    fair: reference.probabilities,
    referenceKeys: reference.keys,
    config,
    tiltState,
    bankroll: match.bankroll,
    labels: libellesDuMatch(match)
  };
}

/**
 * La décision de pari du moteur sur un match — le code qu'analyzeMatch
 * exécutait lui-même avant l'étape 8, déplacé ici tel quel pour qu'un écran
 * qui lit un état préparé (Repérage, Opportunités) prenne EXACTEMENT la même.
 * `match.fraicheurCotes` (étape 7) : l'heure de chaque cote de vos
 * bookmakers ; sans elle, aucun contrôle de fraîcheur.
 * Étape 11 : la décision passe aux GARDE-FOUS de Pierre (core/risk/gardeFous.js,
 * plafonnerLeConseil) — la mise conseillée ne dépasse jamais le plafond du
 * moment (`misePlafonnee` le dit) et un coupe-circuit enclenché dit pourquoi
 * (`coupeCircuit`). Sans garde-fou réglé, la décision est celle d'avant.
 */
export function stakingDuMatch(match, { disponible, reference }, config, tiltState) {
  if (disponible && !reference) return { action: 'PASS', stake: null, reason: 'trop_peu_de_bookmakers', candidates: [] };
  if (!disponible) return { action: 'PASS', stake: null, reason: 'no_market_odds', candidates: [] };
  const parametres = parametresDuPari(match, reference, config, tiltState);
  const decision = match.fraicheurCotes ? findValueBetFraiche(parametres, match.fraicheurCotes) : findValueBet(parametres);
  return plafonnerLeConseil(decision, tiltState);
}

/** « (perte maximale de la semaine atteinte : …) » quand un garde-fou a enclenché le coupe-circuit ; rien pour l'interrupteur manuel. */
const pourquoiLeCoupeCircuit = (cc) => (cc?.motif && cc.motif !== 'manuel' && cc.texte ? ` (${cc.texte})` : '');

// ------------------------------------------------- le verdict de chaque issue

/** Les seuils du moteur, en % (comme l'écran les lit sur /api/config). */
function limitesDe(config) {
  const pc = (x) => Number((Number(x) * 100).toFixed(6));
  return { min: pc(config?.edgeThresholdMin), max: pc(config?.edgeThresholdMax), coteMax: Number(config?.maxValueOdds ?? 5) };
}

/** La meilleure offre de vos bookmakers (règle estJouable) parmi `livres`, pour un champ : { b, coteNette } ou null. */
function meilleureOffre(livres, champ) {
  let meilleure = null;
  for (const b of livres) {
    const nette = Number(coteJouable(b, champ));
    if (nette > 1 && (!meilleure || nette > meilleure.coteNette)) meilleure = { b, coteNette: nette };
  }
  return meilleure;
}

/** « palier 3 : William Hill, Betsson » — qui a fixé la cote juste. */
function jugesDits(juges) {
  if (!juges?.livres?.length) return 'les bookmakers de référence';
  return `${juges.palier} : ${juges.livres.join(', ')}`;
}

/**
 * Le verdict de chacune des trois issues d'un match, d'après la décision du
 * moteur (`staking`, cf. stakingDuMatch) et ce qui l'a produite (la cote
 * juste `reference`, les cotes du match, leur fraîcheur).
 *
 * @returns {{ home: object, draw: object, away: object }} un verdict par issue :
 *   { issue, libelle, etat, vert, raison, pourcent, cote, coteNette, bookmaker,
 *     bookmakerTitle, coteJuste, probabilite, releveAt, origineReleve, fraicheur,
 *     exclusion, retenue, mise, juges, offreJuge, limites }
 */
export function verdictsDuMatch(match, { disponible, reference, staking }, config, tiltState) {
  const byBookmaker = match?.marketOdds?.byBookmaker ?? [];
  const libelles = libellesDuMatch(match);
  const limites = limitesDe(config);
  const juges = reference ? Object.freeze({ palier: reference.basis, livres: [...(reference.books ?? [])], cles: [...(reference.keys ?? [])] }) : null;
  const clesJuges = new Set(reference?.keys ?? []);
  const titreDe = (b) => b?.title ?? b?.key ?? null;
  // Vos bookmakers (estJouable : cochés dans Réglages, jamais une cote de référence, ligne saine), juges compris.
  const vosLivres = byBookmaker.filter((b) => estJouable(b, config));
  const fraicheur = match?.fraicheurCotes ?? null;
  const evaluer = fraicheur ? evaluateurDeFraicheur(fraicheur) : null;
  const origine = (cle) => fraicheur?.parBookmaker?.[cle]?.origine ?? null;

  // Les candidats de la décision : findValueBet juge les trois issues sur les mêmes bookmakers (des lignes 1N2
  // complètes) — sur les seules cotes fraîches quand findValueBetFraiche a recommandé sur elles, sur toutes
  // sinon, chacune avec l'heure et la fraîcheur de sa cote. Le verdict d'une issue est celui de SON candidat.
  const officiels = new Map((staking?.candidates ?? []).map((c) => [c.outcome, c]));
  const retenue = staking?.action === 'RECOMMENDED' ? staking.outcome : staking?.reason === 'a_rafraichir' ? (staking.aRafraichir?.outcome ?? null) : null;

  const verdict = ({ issue, champ, index }) => {
    const probabilite = reference ? reference.probabilities[index] : null;
    const base = {
      issue,
      libelle: libelles[issue],
      etat: null,
      vert: false,
      raison: null,
      pourcent: null,
      cote: null,
      coteNette: null,
      bookmaker: null,
      bookmakerTitle: null,
      coteJuste: probabilite ? arrondi(1 / probabilite) : null,
      probabilite,
      releveAt: null,
      origineReleve: null,
      fraicheur: null,
      exclusion: null,
      retenue,
      mise: null,
      juges,
      offreJuge: null,
      limites
    };
    const dit = (etat, raison, extra = {}) => ({ ...base, ...extra, etat, vert: etat === 'value', raison });
    // L'offre qu'un écran peut quand même montrer (meilleure cote de vos bookmakers), sans value lue dessus.
    const offreSansValeur = () => {
      const o = meilleureOffre(vosLivres, champ);
      return o ? { cote: o.b[champ], coteNette: arrondi(o.coteNette, 3), bookmaker: o.b.key ?? null, bookmakerTitle: titreDe(o.b), releveAt: evaluer ? evaluer(o.b.key).releveAt : null, origineReleve: origine(o.b.key), fraicheur: evaluer ? evaluer(o.b.key) : null } : {};
    };
    // L'offre d'un bookmaker qui a fixé la cote juste : sa cote et son avantage, pour le dire — jamais pour la conseiller.
    const offreDeJuge = () => {
      const o = meilleureOffre(vosLivres.filter((b) => clesJuges.has(b.key)), champ);
      if (!o) return null;
      return { bookmaker: o.b.key ?? null, bookmakerTitle: titreDe(o.b), cote: o.b[champ], coteNette: arrondi(o.coteNette, 3), pourcent: probabilite ? arrondi((probabilite * o.coteNette - 1) * 100) : null };
    };

    if (staking?.action === 'CIRCUIT_BREAKER_ACTIVE') {
      return dit('coupe-circuit', `Le coupe-circuit de Réglages est enclenché${pourquoiLeCoupeCircuit(staking.coupeCircuit ?? tiltState?.coupeCircuit)} : aucun pari n'est conseillé tant qu'il l'est.`, offreSansValeur());
    }
    if (!disponible || staking?.reason === 'no_market_odds') {
      return dit('pas-de-cote', "Aucune cote de marché pour ce match : ni relevé The Odds API, ni cote de référence complète.");
    }
    if (staking?.reason === 'trop_peu_de_bookmakers') {
      return dit(
        'pas-de-reference',
        "Pas assez de bookmakers de référence pour fixer la cote juste de ce match (Pinnacle, un du palier 2, ou deux avis du palier 3) : aucune value ne peut s'y lire.",
        offreSansValeur()
      );
    }
    if (staking?.reason === 'aucun_bookmaker_autorise') {
      return dit(
        'non-jouable',
        "Aucun de vos bookmakers (cochés dans Réglages) ne cote ce match : seulement des cotes de référence, qui servent à mesurer le marché et jamais à parier."
      );
    }
    const juge = offreDeJuge();
    if (staking?.reason === 'bookmakers_juges') {
      if (!juge) return dit('non-cote', "Aucun de vos bookmakers ne cote cette issue.");
      return dit(
        'juge',
        `${juge.bookmakerTitle} a servi à fixer la cote juste de ce match (${jugesDits(juges)}) : sa cote, c'est la cote juste plus sa marge — juge et partie, jamais une value. Aucun autre de vos bookmakers ne cote ce match.`,
        { cote: juge.cote, coteNette: juge.coteNette, bookmaker: juge.bookmaker, bookmakerTitle: juge.bookmakerTitle, pourcent: juge.pourcent, releveAt: evaluer ? evaluer(juge.bookmaker).releveAt : null, origineReleve: origine(juge.bookmaker), fraicheur: evaluer ? evaluer(juge.bookmaker) : null }
      );
    }
    if (staking?.reason === 'cotes_incoherentes') {
      return dit(
        'incoherente',
        "Les cotes de vos bookmakers (hors ceux qui ont fixé la cote juste) sont incomplètes ou incohérentes pour ce match : une cote périmée n'est pas une value.",
        offreSansValeur()
      );
    }

    const c = officiels.get(issue) ?? null;
    if (!c) {
      if (juge) {
        return dit(
          'juge',
          `Seul ${juge.bookmakerTitle} paie cette issue chez vos bookmakers, et il a servi à fixer la cote juste de ce match (${jugesDits(juges)}) : juge et partie, jamais une value.`,
          { cote: juge.cote, coteNette: juge.coteNette, bookmaker: juge.bookmaker, bookmakerTitle: juge.bookmakerTitle, pourcent: juge.pourcent, releveAt: evaluer ? evaluer(juge.bookmaker).releveAt : null, origineReleve: origine(juge.bookmaker), fraicheur: evaluer ? evaluer(juge.bookmaker) : null }
        );
      }
      return dit('non-cote', "Aucun de vos bookmakers ne cote cette issue.");
    }

    const offre = {
      pourcent: arrondi(c.ev * 100),
      cote: c.displayedOdds ?? c.odds,
      coteNette: c.odds,
      bookmaker: c.bookmaker ?? null,
      bookmakerTitle: c.bookmakerTitle ?? c.bookmaker ?? null,
      coteJuste: c.fairOdds ?? base.coteJuste,
      releveAt: c.releveAt ?? (evaluer ? evaluer(c.bookmaker).releveAt : null),
      origineReleve: c.origineReleve ?? origine(c.bookmaker),
      fraicheur: c.fraicheur ?? (evaluer ? evaluer(c.bookmaker) : null),
      exclusion: c.exclusion ?? null,
      // La meilleure offre d'un « juge », quand elle paie plus que celle retenue : dite, écartée.
      offreJuge: juge && juge.coteNette > c.odds ? juge : null
    };
    const chez = `chez ${offre.bookmakerTitle}`;
    const ecarte = offre.offreJuge
      ? ` ${offre.offreJuge.bookmakerTitle} paie davantage (${coteDite(offre.offreJuge.cote)}) mais a servi à fixer la cote juste (${jugesDits(juges)}) : écarté, juge et partie.`
      : '';
    const avantage = `Avantage de ${pourcentSigne(offre.pourcent)} ${chez}`;

    if (staking?.action === 'RECOMMENDED' && staking.outcome === issue && officiels.get(issue) === c) {
      return dit(
        'value',
        `Value : ${offre.bookmakerTitle} paie ${coteDite(offre.cote)} pour une cote juste de ${coteDite(offre.coteJuste)}, soit un avantage de ${pourcentSigne(offre.pourcent)}, au-dessus du seuil de ${seuilDit(limites.min)} du moteur.${ecarte}`,
        { ...offre, mise: staking.stake ?? null }
      );
    }
    if (offre.fraicheur && offre.fraicheur.etat !== 'fraiche') {
      return dit(
        'a-rafraichir',
        `Cote à rafraîchir : ${offre.fraicheur.raison} Au dernier relevé, l'avantage ${chez} était de ${pourcentSigne(offre.pourcent)} : ce n'est pas une value tant que la cote n'est pas relevée de nouveau.`,
        offre
      );
    }
    if (offre.exclusion === 'cote_trop_haute') {
      return dit('cote-haute', `${avantage}, mais la cote ${coteDite(offre.coteNette)} dépasse la cote maximale de ${limites.coteMax} : le moteur ne recommande pas ce pari.${ecarte}`, offre);
    }
    if (offre.exclusion === 'avantage_invraisemblable') {
      return dit('trop-beau', `${avantage}, au-delà du maximum de ${seuilDit(limites.max)} : cote périmée ou erreur probable, aucun pari recommandé.${ecarte}`, offre);
    }
    if (offre.exclusion === 'sous_le_seuil') {
      if (offre.pourcent <= 0) return dit('sans-value', `${avantage} : la cote est sous la cote juste, aucune value.${ecarte}`, offre);
      return dit('sous-seuil', `${avantage}, sous le seuil de ${seuilDit(limites.min)} du moteur : pas assez pour parler de value.${ecarte}`, offre);
    }
    // Au-dessus du seuil et dans les limites, mais ce n'est pas le pari du moteur : il n'en retient qu'un par match.
    const autre = retenue && retenue !== issue ? ` : le moteur ne retient qu'un pari par match, « ${libelles[retenue]} », qui paie davantage` : '';
    if (staking?.reason === 'a_rafraichir') {
      return dit('a-rafraichir', `${avantage}, mais les cotes de ce match sont à rafraîchir${autre} : ce n'est pas une value tant qu'elles ne sont pas relevées de nouveau.`, offre);
    }
    return dit('value-secondaire', `${avantage}, au-dessus du seuil de ${seuilDit(limites.min)}${autre || " : le moteur n'en retient pas le pari"}.${ecarte}`, offre);
  };

  return Object.fromEntries(ISSUES_1N2.map((x) => [x.issue, Object.freeze(verdict(x))]));
}

/**
 * La décision ET le verdict de chaque issue, d'un coup : ce que lit un écran
 * qui part d'un état préparé (Repérage, Opportunités). `match` a la forme d'un
 * match adapté (home, away, marketOdds, bankroll) et, pour la fraîcheur,
 * `fraicheurCotes` (cf. data/cotesDeVosBookmakers.js, fraicheurDuMatch).
 */
export function decisionDePari(match, config, tiltState) {
  const ref = referenceDuMatch(match, config);
  const staking = stakingDuMatch(match, ref, config, tiltState);
  return { ...ref, staking, verdicts: verdictsDuMatch(match, { ...ref, staking }, config, tiltState) };
}

// ------------------------------------------------------ le comparateur (étape 10)

/** D'où vient la probabilité du moteur d'un marché autre que le 1 / N / 2 — les phrases de la saisie à la main (data/saisiesCotes.js). */
const ORIGINES_DES_MARCHES = Object.freeze({
  totalGoals: 'modèle de buts du moteur',
  teamGoals: 'modèle de buts du moteur',
  bothTeamsScore: 'modèle de buts du moteur',
  resultAndTotal: 'modèle de buts du moteur, calé sur le 1 / N / 2',
  totalCorners: 'corners attendus par le moteur (binomiale négative mesurée)',
  teamCorners: 'corners attendus par le moteur (binomiale négative mesurée)',
  totalShots: 'tirs attendus par le moteur (binomiale négative mesurée)',
  teamShots: 'tirs attendus par le moteur (binomiale négative mesurée)',
  totalShotsOnTarget: 'tirs cadrés attendus par le moteur (binomiale négative mesurée)',
  teamShotsOnTarget: 'tirs cadrés attendus par le moteur (binomiale négative mesurée)'
});

/** La clé d'un pronostic de marché (la même que la ligne du verdict par marché, ui/src/utils/verdictParMarche.js). */
export const cleDuPronostic = (p) => `${p.marketId}:${p.params?.team ?? ''}:${p.params?.side ?? p.params?.outcome ?? p.params?.key ?? ''}:${p.params?.line ?? ''}`;

/**
 * LE COMPARATEUR DE VOS BOOKMAKERS (étape 10 du plan, 06/10/2026) : pour chaque
 * issue du 1 / N / 2, la cote de CHACUN de vos bookmakers qui cotent le match,
 * côte à côte, avec l'heure de son relevé, son verdict, et la cote minimale à
 * prendre pour qu'il reste de la value ; pour chaque autre pronostic du moteur,
 * sa probabilité et ses bornes (les cotes de ces marchés ne se relèvent pas :
 * elles se saisissent à la main, data/saisiesCotes.js leur donne les mêmes bornes).
 *
 * Le verdict d'une case vient de findValueBet appliqué à CE SEUL bookmaker (sa
 * cote nette, son avantage, son exclusion — juge et partie et ligne incohérente
 * compris) et de la décision du moteur sur le match (`staking`) :
 *   - VERT (« value ») ⇔ le moteur conseille cette issue ET, chez ce bookmaker,
 *     la cote est elle-même une value fraîche (entre la cote minimale et la
 *     cote maximale, ni juge ni périmée). La case du pari du moteur (la
 *     meilleure cote) est `conseillee` ; une autre case verte de la même issue
 *     est le même pari, moins bien payé, mais encore une value ;
 *   - une value sur une issue que le moteur ne retient pas (un pari par match) :
 *     « pas retenue », jamais verte — comme le verdict par marché de la page ;
 *   - sinon l'état du verdict, dans l'ordre de verdictsDuMatch (à rafraîchir,
 *     cote trop haute, trop beau, sous le seuil, sans value, juge et partie,
 *     incohérente, pas de cote juste, coupe-circuit).
 * Les bookmakers du relevé qui ne sont pas à vous (Pinnacle, Betclic…) et les
 * cotes de référence gratuites vont dans `references` : jamais jouables.
 * Pur : ni disque, ni base, ni réseau.
 */
export function comparateurDuMatch(match, { disponible, reference, staking }, config, tiltState, { marketPredictions = [] } = {}) {
  const byBookmaker = match?.marketOdds?.byBookmaker ?? [];
  const libelles = libellesDuMatch(match);
  const limites = limitesDe(config);
  const regle = regleEnPourcent(config);
  const juges = reference ? Object.freeze({ palier: reference.basis, livres: [...(reference.books ?? [])], cles: [...(reference.keys ?? [])] }) : null;
  const clesJuges = new Set(reference?.keys ?? []);
  const fraicheur = match?.fraicheurCotes ?? null;
  const evaluer = fraicheur ? evaluateurDeFraicheur(fraicheur) : null;
  const origine = (cle) => fraicheur?.parBookmaker?.[cle]?.origine ?? null;
  const titreDe = (b) => b?.title ?? titreBookmaker(b?.key);
  const coupeCircuit = staking?.action === 'CIRCUIT_BREAKER_ACTIVE' || Boolean(tiltState?.circuitBreakerActive);
  const conseil = staking?.action === 'RECOMMENDED' ? staking : null;
  const retenue = conseil ? conseil.outcome : staking?.reason === 'a_rafraichir' ? (staking.aRafraichir?.outcome ?? null) : null;
  const maintenant = Number.isFinite(fraicheur?.maintenant) ? fraicheur.maintenant : Date.now();
  const probabiliteDe = (index) => (reference ? reference.probabilities[index] : null);

  const issues = ISSUES_1N2.map(({ issue, index }) => {
    const p = probabiliteDe(index);
    return Object.freeze({
      issue,
      libelle: libelles[issue],
      probabilite: p,
      coteJuste: p ? arrondi(1 / p) : null,
      // La cote minimale (et maximale) à prendre pour qu'il reste de la value : la règle de findValueBet, au centième.
      bornes: p ? bornesDuMoteur(p, config) : Object.freeze({ coteMinimale: null, coteMaximale: null, code: disponible ? 'pas-de-reference' : 'pas-de-cote' }),
      retenue: retenue === issue,
      conseil:
        conseil && conseil.outcome === issue
          ? Object.freeze({ bookmaker: conseil.bookmaker ?? null, bookmakerTitle: conseil.bookmakerTitle ?? null, cote: conseil.displayedOdds ?? conseil.odds, mise: conseil.stake ?? null })
          : null
    });
  });

  /** La case d'un de vos bookmakers pour une issue (cf. en-tête). */
  const cellule = ({ b, titre, juge, sain, seul, f, issue, champ, index }) => {
    const p = probabiliteDe(index);
    const cote = Number.isFinite(b[champ]) && b[champ] > 1 ? b[champ] : null;
    const nette = cote === null ? null : Number(coteJouable(b, champ));
    const pourcentLu = p && nette ? arrondi((p * nette - 1) * 100) : null;
    const base = {
      issue,
      libelle: libelles[issue],
      cote,
      coteNette: nette === null ? null : arrondi(nette, 3),
      pourcent: null,
      etat: null,
      vert: false,
      raison: null,
      conseillee: false,
      mise: null,
      bookmaker: b.key,
      bookmakerTitle: titre,
      coteJuste: p ? arrondi(1 / p) : null,
      probabilite: p,
      releveAt: f?.releveAt ?? null,
      origineReleve: origine(b.key),
      fraicheur: f,
      juges,
      limites
    };
    const dit = (etat, raison, extra = {}) => ({ ...base, ...extra, etat, vert: etat === 'value', raison });
    const chez = `chez ${titre}`;
    if (coupeCircuit) return dit('coupe-circuit', `Le coupe-circuit de Réglages est enclenché${pourquoiLeCoupeCircuit(staking?.coupeCircuit ?? tiltState?.coupeCircuit)} : aucun pari n'est conseillé tant qu'il l'est.`, { pourcent: pourcentLu });
    if (!reference) {
      return dit('pas-de-reference', "Pas assez de bookmakers de référence pour fixer la cote juste de ce match (Pinnacle, un du palier 2, ou deux avis du palier 3) : aucune value ne peut s'y lire.");
    }
    if (cote === null) return dit('non-cote', `${titre} ne cote pas cette issue.`);
    if (juge) {
      return dit('juge', `${titre} a servi à fixer la cote juste de ce match (${jugesDits(juges)}) : sa cote, c'est la cote juste plus sa marge — juge et partie, jamais une value.`, { pourcent: pourcentLu });
    }
    if (!sain) return dit('incoherente', `Les cotes de ${titre} pour ce match sont incomplètes ou incohérentes : une cote périmée n'est pas une value.`, { pourcent: pourcentLu });
    const c = (seul?.candidates ?? []).find((x) => x.outcome === issue) ?? null;
    if (!c) return dit('non-cote', `${titre} ne cote pas cette issue.`);
    const pourcent = arrondi(c.ev * 100);
    const avantage = `Avantage de ${pourcentSigne(pourcent)} ${chez}`;
    const auDessus = `pour une cote juste de ${coteDite(base.coteJuste)}, soit un avantage de ${pourcentSigne(pourcent)}, au-dessus du seuil de ${seuilDit(limites.min)} du moteur`;
    if (conseil && conseil.outcome === issue && conseil.bookmaker === b.key) {
      return dit('value', `Value : ${titre} paie ${coteDite(cote)} ${auDessus} : c'est le pari du moteur, à la meilleure cote de vos bookmakers.`, {
        pourcent,
        conseillee: true,
        mise: conseil.stake ?? null
      });
    }
    if (f && f.etat !== 'fraiche') {
      return dit('a-rafraichir', `Cote à rafraîchir : ${f.raison} Au dernier relevé, l'avantage ${chez} était de ${pourcentSigne(pourcent)} : ce n'est pas une value tant que la cote n'est pas relevée de nouveau.`, { pourcent });
    }
    if (c.exclusion === 'cote_trop_haute') return dit('cote-haute', `${avantage}, mais la cote ${coteDite(c.odds)} dépasse la cote maximale de ${limites.coteMax} : le moteur ne recommande pas ce pari.`, { pourcent });
    if (c.exclusion === 'avantage_invraisemblable') return dit('trop-beau', `${avantage}, au-delà du maximum de ${seuilDit(limites.max)} : cote périmée ou erreur probable, aucun pari recommandé.`, { pourcent });
    if (c.exclusion === 'sous_le_seuil') {
      if (pourcent <= 0) return dit('sans-value', `${avantage} : la cote est sous la cote juste, aucune value.`, { pourcent });
      return dit('sous-seuil', `${avantage}, sous le seuil de ${seuilDit(limites.min)} du moteur : pas assez pour parler de value.`, { pourcent });
    }
    // Une value à CE prix, sur l'issue que le moteur conseille (chez un autre de vos bookmakers, qui paie davantage) : le même pari, encore une value ici.
    if (conseil && conseil.outcome === issue) {
      return dit(
        'value',
        `Value : ${titre} paie ${coteDite(cote)} ${auDessus}. Le moteur conseille ce pari chez ${conseil.bookmakerTitle ?? conseil.bookmaker}, qui paie davantage (${coteDite(conseil.displayedOdds ?? conseil.odds)}) : ici aussi, c'est une value.`,
        { pourcent }
      );
    }
    const autre = retenue && retenue !== issue ? ` : le moteur ne retient qu'un pari par match, « ${libelles[retenue]} », qui paie davantage` : " : le moteur n'en retient pas le pari";
    return dit('value-secondaire', `${avantage}, au-dessus du seuil de ${seuilDit(limites.min)}${autre}.`, { pourcent });
  };

  const livres = byBookmaker
    .filter((b) => b?.key && estAutorise(b, config))
    .map((b) => {
      const f = evaluer ? evaluer(b.key) : null;
      const titre = titreDe(b);
      const juge = clesJuges.has(b.key);
      const sain = estJouable(b, config);
      // findValueBet sur CE SEUL bookmaker : son jugement de chaque issue (« juge et partie », ligne incohérente compris).
      const seul =
        reference && !coupeCircuit
          ? findValueBet({ byBookmaker: [b], fair: reference.probabilities, referenceKeys: reference.keys, config, tiltState: {}, bankroll: match?.bankroll, labels: libelles })
          : null;
      const cellules = Object.fromEntries(ISSUES_1N2.map(({ issue, champ, index }) => [issue, Object.freeze(cellule({ b, titre, juge, sain, seul, f, issue, champ, index }))]));
      return Object.freeze({ cle: b.key, titre, releveAt: f?.releveAt ?? null, origineReleve: origine(b.key), fraicheur: f, juge, ligneSaine: sain, cellules: Object.freeze(cellules) });
    });

  // Les autres bookmakers du relevé (Pinnacle, Betclic…) et les cotes de référence gratuites : à part, jamais jouables.
  const references = byBookmaker
    .filter((b) => b?.key && !estAutorise(b, config))
    .map((b) =>
      Object.freeze({
        cle: b.key,
        titre: titreDe(b),
        cotes: Object.freeze({ home: Number(b.odds1) > 1 ? b.odds1 : null, draw: Number(b.oddsDraw) > 1 ? b.oddsDraw : null, away: Number(b.odds2) > 1 ? b.odds2 : null }),
        juge: clesJuges.has(b.key),
        gratuite: Boolean(b.referenceOnly),
        source: b.source ?? null,
        releveAt: fraicheur?.parBookmaker?.[b.key]?.releveAt ?? null
      })
    );

  // Les autres pronostics du moteur : probabilité = 1 / cote juste, bornes de la règle d'une cote saisie (verdictValue).
  const marches = (marketPredictions ?? [])
    .filter((p) => p?.marketId && p.marketId !== 'result' && Number(p.predictedOdds) > 1)
    .map((p) => {
      const probabilite = 1 / Number(p.predictedOdds);
      return Object.freeze({
        cle: cleDuPronostic(p),
        marketId: p.marketId,
        params: p.params ?? null,
        market: p.market,
        libelle: p.predictedLabel,
        coteJuste: Number(p.predictedOdds),
        probabilite,
        origine: ORIGINES_DES_MARCHES[p.marketId] ?? 'moteur',
        bornes: bornesDeLaRegle(probabilite, regle)
      });
    });

  return Object.freeze({
    version: 1,
    calculeLe: new Date(maintenant).toISOString(),
    disponible: Boolean(disponible),
    source: fraicheur?.source ?? null,
    limites,
    regle,
    juges,
    retenue,
    // « (Pinnacle) » quand Pinnacle seul fixe la cote juste ; « (palier 3 : William Hill, Betsson) » sinon.
    probabiliteSource: juges ? `cote juste des bookmakers de référence (${juges.livres.join(', ') === juges.palier ? juges.palier : jugesDits(juges)}), marge retirée` : null,
    issues: Object.freeze(issues),
    livres: Object.freeze(livres),
    references: Object.freeze(references),
    marches: Object.freeze(marches),
    vosBookmakers: Object.freeze(vosBookmakersDe(config).map((cle) => Object.freeze({ cle, titre: byBookmaker.find((b) => b?.key === cle)?.title ?? titreBookmaker(cle) })))
  });
}
