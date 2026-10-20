/**
 * simulateBets.js — les PARIS SIMULÉS du banc d'essai (étape 19 du plan, 13/10/2026).
 * -----------------------------------------------------------------------
 * Ce fichier ne décide rien : un pari simulé est la décision même du moteur
 * (`staking` d'analyzeMatch — stakingDuMatch → findValueBet : paliers de
 * bookmakers, avantage > 2 %, cote ≤ 5, avantage ≤ 25 %, juge et partie,
 * bookmakers permis), prise avec le coupe-circuit NEUTRE, au prix réellement
 * disponible avant le coup d'envoi. Mise FIXE d'une unité (gainMiseFixe) ; la
 * mise Kelly du moteur est notée, jamais jugée.
 *
 * Ce que dit chaque mesure :
 *   - RENDEMENT : rapporté, jamais jugé (≈ ± 8 % pour 1 000 paris) — un gain,
 *     sa fourchette et l'« écart détectable », sans pastille ;
 *   - VALEUR DE CLÔTURE : cote prise × probabilité de clôture − 1 (Pinnacle
 *     clôture, sinon moyenne de clôture) — elle PROUVE (≈ vingt fois plus
 *     vite) : verdict de comparer face à « ne pas parier » (a = 0), sens
 *     'max', une ligne par pari, bloc = la journée d'un championnat ;
 *   - PIRE SÉRIE : seriesDuCarnet dans l'ordre de règlement (jour, puis clé),
 *     et la zone normale (zoneNormaleDesSeries, probabilité de gain = 1 / cote
 *     juste) — rien n'est recopié.
 * Les refus sont comptés par raison (`staking.reason`) : sans Pinnacle « trop
 * peu de bookmakers », sans William Hill « aucun bookmaker autorisé ».
 *
 * Deux VARIANTES DE PRIX, étiquetées, jamais « vos paris » (« pas le prix d'un
 * de vos bookmakers ») — la règle est celle du moteur, seul le prix change :
 *   v-repli-moyenne  cote juste = la moyenne d'avant-match, du 29/07/2005 au
 *                    26/07/2012 seulement (avant Pinnacle), prix William Hill ;
 *   v-proxy-bet365   prix Bet365 (continu depuis 2002), cote juste Pinnacle,
 *                    sinon la moyenne.
 * -----------------------------------------------------------------------
 */

import { stakingDuMatch } from '../core/engine/verdictPari.js';
import { fairFromBookmakers } from '../core/engine/valueFinder.js';
import { removeMargin } from '../core/market/marginRemoval.js';
import { fraicheurCote, REGLAGE_FRAICHEUR_DEFAUT } from '../core/engine/fraicheurCotes.js';
import { seriesDuCarnet, zoneNormaleDesSeries } from '../core/risk/seriesDePertes.js';
import { TRANCHES_DE_COTE, trancheDuPari } from '../data/suiviParis.js';
import { gainMiseFixe, valeurCloture } from './metrics.js';
import { comparer } from './guard.js';
import { clotureDe } from './prix.js';
import { TILT_NEUTRE } from './entrees.js';
import { BORNES_DES_LIVRES, DECISIONS_DE_PIERRE } from './periodes.js';

/** Les règles de pari du banc : celle du moteur (la seule qui entre dans la note de départ) et les deux variantes. */
export const REGLES_DE_PARI = Object.freeze({
  moteur: Object.freeze({ id: 'moteur', titre: 'Règle du moteur', vosParis: true, phrase: 'Cote juste Pinnacle, prix de vos bookmakers (William Hill dans l’historique, jusqu’au 27/03/2025).' }),
  'v-repli-moyenne': Object.freeze({
    id: 'v-repli-moyenne',
    titre: 'Variante : cote juste de repli (moyenne)',
    vosParis: false,
    de: '2005-07-29',
    a: '2012-07-26',
    phrase: 'Pas le prix d’un de vos bookmakers : la cote juste est la moyenne du marché (avant Pinnacle), le prix William Hill.'
  }),
  'v-proxy-bet365': Object.freeze({
    id: 'v-proxy-bet365',
    titre: 'Variante : prix Bet365',
    vosParis: false,
    phrase: 'Pas le prix d’un de vos bookmakers : Bet365 n’en fait pas partie ; cote juste Pinnacle, sinon la moyenne.'
  })
});

/** La cote juste « moyenne du marché » d'un jeu d'avant-match (la forme de fairFromBookmakers), ou null si sa marge est incohérente. */
function referenceDeLaMoyenne(byBookmaker) {
  const m = byBookmaker.find((b) => b.key === 'fd_moyenne');
  if (!m) return null;
  const r = removeMargin([m.odds1, m.oddsDraw, m.odds2]);
  if (r.anomaly) return null;
  return { probabilities: r.probabilities, basis: 'moyenne du marché (repli)', books: [m.title ?? 'moyenne'], keys: ['fd_moyenne'] };
}

/**
 * Les décisions des VARIANTES sur un match coté football-data d'avant-match : stakingDuMatch (la décision du
 * moteur) avec une autre cote juste ou un autre bookmaker permis. Rend { 'v-repli-moyenne': staking|null,
 * 'v-proxy-bet365': staking|null } — null quand la variante ne s'applique pas à ce match.
 */
export function decisionsDesVariantes({ match, config, date }) {
  const livres = match?.marketOdds?.byBookmaker ?? [];
  const out = { 'v-repli-moyenne': null, 'v-proxy-bet365': null };
  if (!livres.length) return out;
  const pinnacle = fairFromBookmakers(livres, config);
  const repli = REGLES_DE_PARI['v-repli-moyenne'];
  if (date >= repli.de && date <= repli.a && !livres.some((b) => b.key === 'pinnacle')) {
    const reference = referenceDeLaMoyenne(livres);
    out['v-repli-moyenne'] = reference
      ? stakingDuMatch(match, { disponible: true, reference }, config, TILT_NEUTRE)
      : { action: 'PASS', stake: null, reason: 'cotes_incoherentes', candidates: [] };
  }
  if (livres.some((b) => b.key === 'b365')) {
    const reference = pinnacle ?? referenceDeLaMoyenne(livres);
    out['v-proxy-bet365'] = reference
      ? stakingDuMatch(match, { disponible: true, reference }, { ...config, valueBookmakers: ['b365'] }, TILT_NEUTRE)
      : { action: 'PASS', stake: null, reason: 'cotes_incoherentes', candidates: [] };
  }
  return out;
}

/**
 * Le PARI (ou le refus) d'une décision sur un match. `staking` : la décision du moteur ; `issue` : le 1N2 à la
 * 90e minute (null : non réglable) ; `ligneFd` : la ligne football-data du match (pour la clôture), ou null ;
 * `fraicheur` : { releveAt, coupure } pour les prix de vos bookmakers (étiquette après coup, jamais un filtre).
 * Rend { pari, refus } — un seul des deux.
 */
export function parisDUnMatch({ staking, issue, ligneFd = null, fixtureKey, date, league, prixDuLivre = null, coupure = null, nonReglable = null }) {
  if (!staking || staking.action !== 'RECOMMENDED') return { pari: null, refus: staking?.reason ?? staking?.action ?? 'sans_decision' };
  if (issue === null || issue === undefined) return { pari: null, refus: null, nonReglable: nonReglable ?? 'nonReglable' };
  const gagne = staking.outcome === issue;
  const cloture = ligneFd ? clotureDe(ligneFd, { marche: '1x2', issue: staking.outcome }) : null;
  let fraicheur = null;
  if (coupure && prixDuLivre) {
    const f = fraicheurCote({
      releveAt: prixDuLivre.releveAt ?? null,
      maintenant: Date.parse(coupure.instant),
      coupDEnvoi: coupure.coupDEnvoi,
      heureSure: coupure.heureSure,
      reglage: { maxAgeMinutes: REGLAGE_FRAICHEUR_DEFAUT.maxAgeMinutes, avantCompos: false }
    });
    fraicheur = f.etat;
  }
  return {
    pari: {
      fixtureKey,
      date,
      league,
      bloc: `${date}|${league ?? ''}`,
      cle: `${fixtureKey}|result|${staking.outcome}`,
      issue: staking.outcome,
      bookmaker: staking.bookmaker,
      cote: staking.odds,
      coteAffichee: staking.displayedOdds,
      coteJuste: staking.fairOdds,
      avantage: staking.ev,
      miseKelly: Number.isFinite(staking.stake) ? staking.stake : null,
      gagne,
      gain: gainMiseFixe({ cote: staking.odds, gagne }),
      probaCloture: cloture?.p ?? null,
      livreCloture: cloture?.livre ?? null,
      valeurCloture: cloture ? valeurCloture({ cotePrise: staking.odds, probaCloture: cloture.p }) : null,
      fraicheur
    },
    refus: null
  };
}

/** Une fourchette et sa raison, sans verdict (le rendement rapporte, il ne prouve pas). */
const sansVerdict = (j) => ({ gain: j.gain, fourchette: j.fourchette, ecartDetectable: j.ecartType === null ? null : j.seuil.z * j.ecartType, n: j.n, variantes: j.seuil.variantes });

/**
 * Le résumé d'une liste de paris (une règle, une tranche, un jeu de prix). `variantes` : K, le nombre de cases
 * jugées du rejeu (la même correction partout). `decisions` : les matchs où la règle avait un prix ; `refus` :
 * par raison.
 */
export function resumeDesParis(paris, { decisions = 0, refus = {}, nonReglables = 0, tirages = 1000, graine = 1, variantes = 1, minBlocs = 200 } = {}) {
  const tries = [...paris].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.cle < b.cle ? -1 : a.cle > b.cle ? 1 : 0));
  const n = tries.length;
  const gain = tries.reduce((s, p) => s + p.gain, 0);
  const options = { sens: 'max', tirages, graine, variantes, minBlocs };
  const rendement = n
    ? { mise: n, gain, parUnite: gain / n, juge: sansVerdict(comparer(tries.map((p) => ({ bloc: p.bloc, match: p.fixtureKey, cle: p.cle, date: p.date, a: 0, b: p.gain })), options)) }
    : { mise: 0, gain: 0, parUnite: null, juge: null };
  const avecCloture = tries.filter((p) => p.valeurCloture !== null);
  let valeur = { n: 0, sansCloture: n, moyenne: null, juge: null };
  if (avecCloture.length) {
    const j = comparer(avecCloture.map((p) => ({ bloc: p.bloc, match: p.fixtureKey, cle: p.cle, date: p.date, a: 0, b: p.valeurCloture })), options);
    valeur = {
      n: avecCloture.length,
      sansCloture: n - avecCloture.length,
      moyenne: avecCloture.reduce((s, p) => s + p.valeurCloture, 0) / avecCloture.length,
      parLivre: { pinnacle: avecCloture.filter((p) => p.livreCloture === 'pinnacle').length, moyenne: avecCloture.filter((p) => p.livreCloture === 'moyenne').length },
      juge: { gain: j.gain, fourchette: j.fourchette, ecartType: j.ecartType, verdict: j.verdict, raison: j.raison, n: j.n, variantes: j.seuil.variantes, ecartDetectable: j.ecartType === null ? null : j.seuil.z * j.ecartType }
    };
  }
  const issues = tries.map((p) => (p.gagne ? 'won' : 'lost'));
  const series = seriesDuCarnet(issues);
  const zone = n ? zoneNormaleDesSeries(tries.map((p) => Math.min(1, 1 / p.coteJuste))) : { jusqua: null, mediane: null };
  const parTranche = TRANCHES_DE_COTE.map((t) => {
    const dans = tries.filter((p) => trancheDuPari({ odds: p.cote }).cle === t.cle);
    const g = dans.reduce((s, p) => s + p.gain, 0);
    return { cle: t.cle, libelle: t.libelle, n: dans.length, gain: g, rendement: dans.length ? g / dans.length : null };
  });
  const parChampionnat = {};
  for (const p of tries) {
    const c = (parChampionnat[p.league ?? '?'] ??= { n: 0, gain: 0, valeurCloture: 0, nCloture: 0 });
    c.n++;
    c.gain += p.gain;
    if (p.valeurCloture !== null) {
      c.valeurCloture += p.valeurCloture;
      c.nCloture++;
    }
  }
  const kellyMise = tries.reduce((s, p) => s + (p.miseKelly ?? 0), 0);
  const kellyGain = tries.reduce((s, p) => s + (p.miseKelly ?? 0) * (p.gagne ? p.cote - 1 : -1), 0);
  const parFraicheur = {};
  for (const p of tries) {
    if (!p.fraicheur) continue;
    const f = (parFraicheur[p.fraicheur] ??= { n: 0, gain: 0 });
    f.n++;
    f.gain += p.gain;
  }
  return {
    n,
    decisions,
    refus,
    nonReglables,
    rendement,
    valeurCloture: valeur,
    pireSerie: series.plusLongue,
    zoneNormale: zone.jusqua,
    serieMediane: zone.mediane,
    parTranche,
    parChampionnat,
    kelly: { mise: kellyMise, gain: kellyGain, rendement: kellyMise > 0 ? kellyGain / kellyMise : null },
    parFraicheur
  };
}

/**
 * Les paris d'une règle qui comptent comme « vos paris » en P5 (décision 1 de Pierre) : tous les relevés
 * d'avant H−1 ('tous', étiquetés) ou seulement les frais ('frais').
 */
export function parisQuiComptent(paris, { regle = DECISIONS_DE_PIERRE.parisDeP5 } = {}) {
  return regle === 'frais' ? paris.filter((p) => p.fraicheur === 'fraiche') : paris;
}

/** Les bornes de ce que l'historique permet de parier avec la règle du moteur (pour le dire à l'écran). */
export const FENETRE_DES_PARIS_HISTORIQUES = Object.freeze({ de: BORNES_DES_LIVRES.premierPinnacle, a: BORNES_DES_LIVRES.dernierWilliamHill });
