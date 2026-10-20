/**
 * marketMovement.js — ce que disent les cotes relevées d'une rencontre, à
 * trois moments : l'ouverture, un instant donné, la clôture (04/10/2026).
 * -----------------------------------------------------------------------
 * Base commune de deux mesures demandées par Pierre :
 *
 *   - les CHUTES DE COTES avant match (droppingOdds.js) : de combien le
 *     marché a bougé depuis l'ouverture ;
 *   - la VALEUR DE CLÔTURE (closingValue.js) : la cote a-t-elle baissé
 *     après un pronostic ou un pari — le marché lui a-t-il donné raison ?
 *
 * Entrée : le résultat de quotesForFixture (oddsQuotesRepository.js). Pour
 * chaque bookmaker et chaque marché complet (1N2, plus/moins à une ligne,
 * les deux équipes marquent), la marge est retirée par la méthode puissance
 * (core/market/marginRemoval.js) ; un prix d'échange (Kalshi, Smarkets) est
 * déjà une probabilité, simplement ramenée à 100 %.
 *
 * Un mouvement se mesure BOOKMAKER PAR BOOKMAKER puis se moyenne : comparer
 * la moyenne d'ouverture de deux bookmakers à celle de clôture de cinq
 * ferait passer pour un mouvement un simple changement de panier.
 * -----------------------------------------------------------------------
 */

import { removeMargin } from '../core/market/marginRemoval.js';
import { SOURCES_ECHANGE } from './db/oddsQuotesRepository.js';

/** Les issues de chaque marché mesuré, dans l'ordre où la marge se retire. */
export const ISSUES = { '1x2': ['home', 'draw', 'away'], ou: ['over', 'under'], btts: ['yes', 'no'] };

// Le « maximum du marché » (football-data) est la meilleure cote de chaque
// issue prise chez des bookmakers différents : un jeu sans marge réelle.
const MAXIMUM = 'Maximum du marché';

const ligneLisible = (line) => String(line).replace('.', ',');

/** Libellé français d'une issue, avec les noms des deux clubs. */
export function libelleIssue(market, line, issue, { home = 'Domicile', away = 'Extérieur' } = {}) {
  if (market === '1x2') return issue === 'home' ? `${home} gagne` : issue === 'away' ? `${away} gagne` : 'Match nul';
  if (market === 'ou') return `${issue === 'over' ? 'Plus' : 'Moins'} de ${ligneLisible(line)} buts`;
  if (market === 'btts') return issue === 'yes' ? 'Les deux équipes marquent' : 'Les deux équipes ne marquent pas';
  return `${market} ${issue}`;
}

/** Libellé français d'un marché. */
export function libelleMarche(market, line) {
  if (market === '1x2') return 'Résultat';
  if (market === 'ou') return `Plus/moins de ${ligneLisible(line)} buts`;
  if (market === 'btts') return 'Les deux équipes marquent';
  return market;
}

/**
 * Le prix d'une sélection à un moment :
 *   - `open`  : le premier prix connu (ouverture, sinon le premier relevé) ;
 *   - `close` : le dernier prix d'avant-match (clôture, sinon le dernier
 *               relevé) — provisoire tant que le match n'a pas commencé ;
 *   - `at`    : le dernier prix RELEVÉ avant l'instant `at`. Seuls les
 *               relevés en temps réel ont une date qui veut dire quelque
 *               chose : un historique rattrapé porte la date du rattrapage,
 *               toujours postérieure, et ne répond donc jamais ici.
 */
function prixA(sel, phase, at) {
  if (!sel) return null;
  if (phase === 'open') return sel.open ?? sel.snapshots?.[0] ?? sel.preclose ?? null;
  if (phase === 'close') return sel.close ?? sel.snapshots?.at(-1) ?? sel.preclose ?? sel.open ?? null;
  const avant = [sel.open, sel.preclose, ...(sel.snapshots ?? []), sel.close].filter((v) => v?.releveAt && v.releveAt <= at);
  return avant.sort((a, b) => (a.releveAt < b.releveAt ? -1 : a.releveAt > b.releveAt ? 1 : 0)).at(-1) ?? null;
}

/**
 * Les probabilités justes de chaque bookmaker pour chaque marché complet, à
 * un moment. Clé du résultat : « marché|ligne|source|bookmaker ».
 */
export function livresA(fq, phase, { at = null, markets = Object.keys(ISSUES) } = {}) {
  const out = new Map();
  for (const s of fq?.sources ?? []) {
    const echange = SOURCES_ECHANGE.has(s.source);
    for (const b of s.bookmakers ?? []) {
      if (b.bookmaker === MAXIMUM) continue;
      for (const m of b.markets ?? []) {
        const issues = ISSUES[m.market];
        if (!issues || !markets.includes(m.market)) continue;
        const prix = {};
        let complet = true;
        for (const i of issues) {
          const v = prixA(m.selections.find((x) => x.selection === i), phase, at);
          if (!v || !(v.price > 1 || (echange && v.prob > 0))) {
            complet = false;
            break;
          }
          prix[i] = v;
        }
        if (!complet) continue;
        let probs;
        if (echange) {
          const brutes = issues.map((i) => prix[i].prob ?? 1 / prix[i].price);
          const total = brutes.reduce((t, p) => t + p, 0);
          if (!(total > 0)) continue;
          probs = brutes.map((p) => p / total);
        } else {
          const r = removeMargin(issues.map((i) => prix[i].price));
          // Une marge impossible (négative ou au-delà de 35 %) ne mesure rien.
          if (r.anomaly) continue;
          probs = r.probabilities;
        }
        const releves = issues.map((i) => prix[i].releveAt).filter(Boolean).sort();
        out.set(`${m.market}|${m.line}|${s.source}|${b.bookmaker}`, {
          market: m.market,
          line: m.line,
          source: s.source,
          bookmaker: b.bookmaker,
          exchange: echange,
          probs: Object.fromEntries(issues.map((i, k) => [i, probs[k]])),
          odds: Object.fromEntries(issues.map((i) => [i, prix[i].price ?? null])),
          volume: echange ? issues.reduce((t, i) => t + (Number(prix[i].volume) || 0), 0) : null,
          releveAt: releves.at(-1) ?? null
        });
      }
    }
  }
  return out;
}

/**
 * La probabilité juste du marché pour une issue, à un moment : la moyenne
 * des bookmakers ; à défaut de bookmaker, les bourses pondérées par l'argent
 * échangé. `null` si personne ne cote ce marché à ce moment-là.
 */
export function probabiliteMarche(livres, market, line, issue) {
  const candidats = [...livres.values()].filter((l) => l.market === market && Math.abs(Number(l.line) - Number(line)) < 1e-9);
  const bookmakers = candidats.filter((l) => !l.exchange);
  if (bookmakers.length) {
    return { prob: bookmakers.reduce((t, l) => t + l.probs[issue], 0) / bookmakers.length, bookmakers: bookmakers.length, exchange: false };
  }
  const bourses = candidats.filter((l) => l.exchange);
  if (!bourses.length) return null;
  const poids = bourses.map((l) => Math.max(1, l.volume ?? 0));
  const total = poids.reduce((t, p) => t + p, 0);
  return { prob: bourses.reduce((t, l, k) => t + l.probs[issue] * poids[k], 0) / total, bookmakers: bourses.length, exchange: true };
}

const memePrix = (a, b) => Object.keys(a.odds).every((i) => a.odds[i] === b.odds[i]);

/**
 * Les mouvements d'une rencontre entre l'ouverture et le dernier prix connu :
 * pour chaque marché et chaque issue, la variation moyenne des bookmakers
 * qui ont bougé ET ont au moins deux prix (un seul relevé ne mesure rien).
 *
 * `dropPct` : de combien la cote juste a baissé, en pour cent (une cote juste
 * qui passe de 2,00 à 1,60 : 20 %). Positif = l'issue est davantage jouée.
 */
export function mouvements(fq, { home, away, markets } = {}) {
  const debut = livresA(fq, 'open', { markets });
  const fin = livresA(fq, 'close', { markets });
  const groupes = new Map();
  for (const [cle, d] of debut) {
    const f = fin.get(cle);
    if (!f || !d.releveAt || !f.releveAt) continue;
    // Même relevé des deux côtés : aucun temps écoulé, aucun mouvement mesurable.
    if (d.releveAt === f.releveAt && memePrix(d, f)) continue;
    const g = groupes.get(`${d.market}|${d.line}`) ?? { market: d.market, line: d.line, livres: [] };
    g.livres.push({ source: d.source, bookmaker: d.bookmaker, exchange: d.exchange, from: d, to: f });
    groupes.set(`${d.market}|${d.line}`, g);
  }

  const out = [];
  for (const g of groupes.values()) {
    const base = g.livres.some((l) => !l.exchange) ? g.livres.filter((l) => !l.exchange) : g.livres;
    for (const issue of ISSUES[g.market]) {
      const deltas = base.map((l) => l.to.probs[issue] - l.from.probs[issue]);
      const pFrom = base.reduce((t, l) => t + l.from.probs[issue], 0) / base.length;
      const pTo = base.reduce((t, l) => t + l.to.probs[issue], 0) / base.length;
      out.push({
        market: g.market,
        line: g.line,
        issue,
        label: libelleIssue(g.market, g.line, issue, { home, away }),
        marketLabel: libelleMarche(g.market, g.line),
        fromProb: pFrom,
        toProb: pTo,
        deltaPoints: (deltas.reduce((t, d) => t + d, 0) / deltas.length) * 100,
        dropPct: pTo > 0 ? (1 - pFrom / pTo) * 100 : 0,
        // Combien de bookmakers vont dans le même sens que la moyenne.
        agreeing: deltas.filter((d) => Math.sign(d) === Math.sign(pTo - pFrom) && Math.abs(d) > 1e-6).length,
        bookmakersCount: base.length,
        exchangeOnly: base.every((l) => l.exchange),
        fromAt: base.map((l) => l.from.releveAt).sort()[0] ?? null,
        toAt: base.map((l) => l.to.releveAt).sort().at(-1) ?? null,
        bookmakers: g.livres.map((l) => ({
          source: l.source,
          bookmaker: l.bookmaker,
          exchange: l.exchange,
          fromOdds: l.from.odds[issue],
          toOdds: l.to.odds[issue],
          fromProb: l.from.probs[issue],
          toProb: l.to.probs[issue],
          volume: l.to.volume,
          fromAt: l.from.releveAt,
          toAt: l.to.releveAt
        }))
      });
    }
  }
  return out.sort((a, b) => b.dropPct - a.dropPct);
}
