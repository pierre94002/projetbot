/**
 * miseRead.js — LA MISE DU MATCH, telle que l'API la rend (étape 39 « La mise juste », lot 1a, 04/11/2026).
 * -----------------------------------------------------------------------
 * Joint par les CONTRÔLEURS seuls (analyse d'un match, liste des matchs, Repérage, Opportunités) : aucun fichier atteint
 * par les racines du gel de l'essai 27 n'importe data/mise/ (T-X2). Ce module lit, il n'écrit jamais.
 *
 * L'objet `mise` (conception §1.8) :
 *   { conseil, fraction, euros, capital, raisons, aBlanc, alerteSeriesLiees }
 *   - fraction = partDeMise(ev, cote nette), recalculée par la règle pure — JAMAIS « mise / base » ;
 *   - euros = la mise du moteur (staking.stake) calculée sur le CAPITAL de Pierre, seulement quand il est indiqué (le
 *     même centime que le moteur : une seule place) ; sans capital : null, et la réponse ne porte AUCUN euro interne
 *     (sansEurosInternes : stake, mise, misePlafonnee, bankroll retirés) ;
 *   - raisons = ce qui a réduit ou qualifie le conseil, dans l'ordre : coupe-circuit, plafond en euros (avec capital),
 *     « vos plafonds en euros ne peuvent pas s'appliquer sans votre capital », la mention d'un bookmaker français ;
 *   - aBlanc = la règle candidate entière (fractionDeMise : paris liés, livre, plafonds, plancher), en gris, JAMAIS à la
 *     place du conseil ; `differe` dit si elle diffère ;
 *   - capital = vueDuCapital (des sommes seulement, jamais un pari précis).
 * Le Repérage et les Opportunités gardent leur calcul (sur la base interne de leur passe) : ils ne rendent que `ev` et
 * `cote` du conseil ; les euros y sont refaits ICI sur le capital, par l'identité de la règle (T-M1) puis le plafond du
 * moment du moteur (plafonnerLeConseil, gardé) — le même centime que la page du match.
 * -----------------------------------------------------------------------
 */

import { getEngineConfig } from '../../core/engine/engineConfig.js';
import { getTiltState, gardeFousDuMoment } from '../../core/engine/tiltState.js';
import { plafonnerLeConseil } from '../../core/risk/gardeFous.js';
import { listBets } from '../repositories/betsRepository.js';
import { lireComptes } from '../repositories/comptesBookmakersRepository.js';
import { partDeMise, fractionDeMise, REGLE_DE_MISE_V1, MENTION_FRANCAIS, MOTS_DE_LA_MISE, LIVRES_FRANCAIS, eurosDits } from './regleDeMise.js';
import { capitalDuMomentLu, baseDeCalcul, vueDuCapital } from './capitalDePierre.js';

const fini = (x) => typeof x === 'number' && Number.isFinite(x);

/**
 * Le contexte de la mise, lu UNE fois par requête : le carnet (une lecture), le capital du moment, la base de calcul du
 * moteur, k et s_max du réglage en vigueur, les garde-fous du moment, les fiches des comptes. Ne lève jamais.
 */
export function contexteDeLaMise({ maintenant = Date.now(), sportId = 'football' } = {}) {
  let paris;
  try {
    paris = listBets();
  } catch {
    paris = null;
  }
  const capital = capitalDuMomentLu({ maintenant, paris });
  let reglageMoteur = null;
  try {
    const c = getEngineConfig(sportId);
    reglageMoteur = { kellyFraction: c.kellyFraction, maxStakePercent: c.maxStakePercent };
  } catch {
    reglageMoteur = null;
  }
  let gardeFous = null;
  try {
    const gf = gardeFousDuMoment(maintenant);
    gardeFous = gf.etat ? { miseMaxParPari: gf.etat.reglage?.miseMaxParPari ?? null, resteSemaine: gf.etat.resteSemaine ?? null } : null;
  } catch {
    gardeFous = null;
  }
  let comptes = {};
  try {
    comptes = lireComptes().comptes ?? {};
  } catch {
    comptes = {};
  }
  return { capital, base: baseDeCalcul(capital), reglageMoteur, gardeFous, comptes, paris: paris ?? [], maintenant };
}

/** Le bookmaker du conseil : { cle, titre, francais } (les quatre français de l'étape 38, recopiés dans regleDeMise.js). */
export function livreDuConseil(staking) {
  if (!staking?.bookmaker) return null;
  return { cle: staking.bookmaker, titre: staking.bookmakerTitle ?? staking.bookmaker, francais: LIVRES_FRANCAIS.includes(staking.bookmaker) };
}

const memeNom = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

/** Les mises (€) des paris de Pierre EN ATTENTE qui portent sur ce match (combiné compris, à sa mise réelle). */
export function misesEnAttenteDuMatch(paris = [], match = null) {
  if (!match || !Array.isArray(paris)) return [];
  const jour = String(match.commenceTime ?? '').slice(0, 10);
  const surCeMatch = (leg) =>
    (leg?.matchId && match.matchId && String(leg.matchId) === String(match.matchId)) ||
    (memeNom(leg?.homeName, match.home) && memeNom(leg?.awayName, match.away) && (!jour || String(leg?.commenceTime ?? '').slice(0, 10) === jour));
  return paris.filter((b) => b?.status === 'pending' && Number(b.stake) > 0 && (b.legs ?? []).some(surCeMatch)).map((b) => Number(b.stake));
}

/**
 * LA MISE D'UN MATCH (§1.8). `staking` : la décision du moteur (staking de analyzeMatch, ou le conseil du Repérage remis
 * en forme : action, ev, odds, stake, misePlafonnee, bookmaker, bookmakerTitle). `contexte` : contexteDeLaMise().
 */
export function miseDuMatch({ staking = null, contexte, match = null } = {}) {
  const { capital, reglageMoteur, gardeFous, comptes, paris } = contexte;
  const conseil = staking?.action === 'RECOMMENDED';
  const fraction = conseil ? partDeMise({ ev: staking.ev, cote: staking.odds, reglageMoteur }) : 0;
  const C = capital?.indique && fini(capital.montant) ? capital.montant : null;
  const euros = conseil && C !== null && fini(staking.stake) ? staking.stake : null;
  const raisons = [];
  if (staking?.action === 'CIRCUIT_BREAKER_ACTIVE') raisons.push({ code: 'coupe-circuit', avant: 0, apres: 0, texte: 'coupe-circuit enclenché : relancez-le dans Réglages' });
  if (conseil && staking.misePlafonnee) {
    if (C !== null) {
      const par = staking.misePlafonnee.par === 'mise-max' ? 'mise-max' : 'perte-semaine';
      const plafond = staking.misePlafonnee.plafond;
      raisons.push({
        code: par,
        avant: fraction,
        apres: C > 0 && fini(euros) ? euros / C : 0,
        texte: par === 'mise-max' ? `ramenée par : votre mise maximale par pari (${eurosDits(plafond)})` : `ramenée par : ce qui reste avant votre perte maximale de la semaine (${eurosDits(plafond)})`
      });
    } else {
      raisons.push({ code: 'plafonds-sans-capital', avant: fraction, apres: fraction, texte: 'vos plafonds en euros ne peuvent pas s’appliquer sans votre capital' });
    }
  }
  const livre = conseil ? livreDuConseil(staking) : null;
  if (livre?.francais) raisons.push({ code: 'livre-francais', avant: fraction, apres: fraction, texte: `chez ${livre.titre} : ${MENTION_FRANCAIS}` });

  let aBlanc = null;
  if (conseil) {
    const r = fractionDeMise({
      decision: staking.action,
      ev: staking.ev,
      cote: staking.odds,
      livre,
      nature: 'simple',
      enAttenteDuMatch: misesEnAttenteDuMatch(paris, match),
      reglageMoteur,
      regle: REGLE_DE_MISE_V1,
      gardeFous,
      compte: livre ? (comptes?.[livre.cle] ?? null) : null,
      capital: C !== null ? { indique: true, montant: C, plusHaut: capital.plusHaut } : { indique: false },
      coupeCircuit: false,
      creuxDePierre: capital?.plancher ?? null
    });
    const differe = C !== null ? r.euros !== euros : Math.abs(r.f - fraction) > 1e-12;
    aBlanc = { regle: REGLE_DE_MISE_V1.id, f: r.f, euros: r.euros, raisons: r.raisons, differe };
  }
  return { version: REGLE_DE_MISE_V1.version, conseil, fraction, euros, capital: vueDuCapital(capital), raisons, aBlanc, alerteSeriesLiees: MOTS_DE_LA_MISE.seriesLiees };
}

// --------------------------------------------------------------------- les euros internes

const CLES_EUROS_INTERNES = new Set(['stake', 'mise', 'misePlafonnee']);

/** Une copie sans les montants calculés sur une base interne (stake, mise, misePlafonnee), à toute profondeur. */
function sansCles(valeur, cles = CLES_EUROS_INTERNES) {
  if (Array.isArray(valeur)) return valeur.map((v) => sansCles(v, cles));
  if (!valeur || typeof valeur !== 'object') return valeur;
  const sortie = {};
  for (const [k, v] of Object.entries(valeur)) {
    if (cles.has(k) && (v === null || typeof v !== 'object' || k === 'misePlafonnee')) continue;
    sortie[k] = sansCles(v, cles);
  }
  return sortie;
}

/** Un match sans sa base de calcul (le nombre que le moteur a reçu n'est jamais rendu). */
export function sansBase(match) {
  if (!match || typeof match !== 'object') return match;
  const { bankroll, ...reste } = match;
  return reste;
}

/**
 * L'analyse d'un match sans aucun euro interne : la base retirée, et dans la décision du moteur, les verdicts et le
 * comparateur, chaque mise calculée sur la base interne (stake, mise, misePlafonnee) retirée. Les autres blocs ne sont
 * pas touchés.
 */
export function sansEurosInternes(analyse) {
  if (!analyse || typeof analyse !== 'object') return analyse;
  const sortie = sansBase(analyse);
  for (const cle of ['staking', 'verdicts', 'comparateur']) if (cle in sortie) sortie[cle] = sansCles(sortie[cle]);
  return sortie;
}

/** La réponse de l'analyse d'un match : la mise jointe ; sans capital indiqué, aucun euro interne ne sort. */
export function analyseAvecLaMise(analyse, { contexte, match = null } = {}) {
  const mise = miseDuMatch({ staking: analyse?.staking ?? null, contexte, match });
  const sortie = contexte.capital?.indique ? sansBase(analyse) : sansEurosInternes(analyse);
  return { ...sortie, mise };
}

/** La décision d'un conseil du Repérage remise en forme, ses euros refaits sur le capital (identité T-M1 + plafond du moment). */
export function stakingDuConseil(conseil, contexte, { tiltState = null } = {}) {
  if (!conseil) return null;
  const fraction = partDeMise({ ev: conseil.ev, cote: conseil.cote, reglageMoteur: contexte.reglageMoteur });
  const C = contexte.capital?.indique && fini(contexte.capital.montant) ? contexte.capital.montant : null;
  const brut = { action: 'RECOMMENDED', ev: conseil.ev, odds: conseil.cote, outcome: conseil.issue ?? null, bookmaker: conseil.bookmaker ?? null, bookmakerTitle: conseil.bookmakerTitle ?? null, stake: C === null ? null : Number((fraction * C).toFixed(2)) };
  if (C === null) return brut;
  let tilt = tiltState;
  if (!tilt) {
    try {
      tilt = getTiltState();
    } catch {
      tilt = null;
    }
  }
  return plafonnerLeConseil(brut, tilt ?? {});
}

/** Le Repérage (getScreener) avec la mise de chaque match conseillé et le capital ; aucun euro interne ne sort. */
export function reperageAvecLaMise(lu, contexte, { tiltState = null } = {}) {
  if (!lu?.data?.matches) return lu?.data ? { ...lu, data: { ...lu.data, capital: vueDuCapital(contexte.capital) } } : lu;
  const matches = lu.data.matches.map((m) => {
    const sans = { ...m, markets: (m.markets ?? []).map((k) => (k.verdict ? { ...k, verdict: sansCles(k.verdict) } : k)) };
    const conseil = m.pari?.conseil ?? null;
    if (!conseil) return sans;
    return { ...sans, mise: miseDuMatch({ staking: stakingDuConseil(conseil, contexte, { tiltState }), contexte, match: m }) };
  });
  return { ...lu, data: { ...lu.data, matches, capital: vueDuCapital(contexte.capital) } };
}

/**
 * Les Opportunités (getOpportunities) avec la mise de chaque ligne conseillée (le vert du moteur : son verdict porte le
 * conseil du Repérage) et le capital ; aucun euro interne ne sort.
 */
export function opportunitesAvecLaMise(op, contexte, { tiltState = null } = {}) {
  if (!op?.data?.lignes) return op?.data ? { ...op, data: { ...op.data, capital: vueDuCapital(contexte.capital) } } : op;
  const lignes = op.data.lignes.map((l) => {
    const conseil = l.verdict?.conseil ?? null;
    const sans = l.verdict ? { ...l, verdict: sansCles(l.verdict) } : l;
    if (!conseil) return sans;
    const match = { matchId: l.matchId, home: l.home, away: l.away, commenceTime: l.commenceTime };
    return { ...sans, mise: miseDuMatch({ staking: stakingDuConseil(conseil, contexte, { tiltState }), contexte, match }) };
  });
  return { ...op, data: { ...op.data, lignes, capital: vueDuCapital(contexte.capital) } };
}

/** Les opportunités vertes (la surveillance des notifications) : sans aucun euro interne. */
export function vertesSansEuros(r) {
  if (!r || typeof r !== 'object') return r;
  if (Array.isArray(r.vertes)) return { ...r, vertes: r.vertes.map((v) => (v.verdict ? { ...v, verdict: sansCles(v.verdict) } : v)) };
  return r;
}
