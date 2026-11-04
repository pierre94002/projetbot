/**
 * lecteurP5.js — LES LIGNES GELÉES DE P5 POUR LE BANC DE L'ÉTAPE 38 (lot 1a, 03-04/11/2026), LECTURE SEULE.
 * -----------------------------------------------------------------------
 * Les pronostics 1N2 gelés (engine_picks) de la fenêtre P5-a, PAR ORIGINE : la révision 1 de la nuit d'un côté, la
 * dernière révision d'avant le coup d'envoi des analyses au coup d'envoi de l'autre (les analyses d'avance comptées à
 * part, jamais jugées) ; les relevés payants AU PLUS TARD à `odds_at` (palier reconstruit, ingredientsDUneLigne.js) ; la
 * présence d'une clôture gratuite (sources hors payantes et saisies, `kind = 'close'`) sur la même affiche
 * (identifiants FotMob + jour : jamais le rapprocheur souple). Au banc SEULEMENT (`avecResultats`) : la distribution
 * gelée (le pourcentage jugé), la clôture gratuite dé-margée (moyenne des livres, méthode puissance) et l'issue à la 90e
 * (table du jour J). Les lignes de buts des versions ≤ 5 (l'ancien modèle du service) ne sont PAS lues : écartées de la
 * preuve (critique, constat 3). La table de la candidate (engine_candidate_picks) n'est jamais lue ici (elle n'est lue
 * que par le dépôt des enregistreurs, gelé pendant l'essai 27).
 * Lit la base de l'appelant (jamais ouverte ici) ; ni horloge, ni réseau.
 * -----------------------------------------------------------------------
 */

import { removeMargin } from '../../core/market/marginRemoval.js';
import { ingredientsDe, origineDe } from './ingredientsDUneLigne.js';
import { PERIODES_DU_BANC } from './reglagesCombinaison.js';

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const numero = (id) => {
  const m = String(id ?? '').match(/^fotmob-(\d+)$/);
  return m ? Number(m[1]) : null;
};

/** Les colonnes lues SANS résultat (« comptes ») : jamais probability ni distribution. */
const COLONNES_SANS = 'fixture_key, market_key, version, recorded_at, origin, league, date, kickoff, home_id, away_id, market_id, odds_source, odds_at, lineup_state, lineup_at, engine_version';

/**
 * Les lignes gelées du 1N2 de P5-a. Rend { lignes, bilan } ; chaque ligne : { cle, origine, date, kickoff, recordedAt,
 * engineVersion, league, ingredients, aCloture, (banc) p, q, y }.
 */
export function lignesGelees(database, { de = PERIODES_DU_BANC.P5a.de, a = PERIODES_DU_BANC.P5a.a, avecResultats = false } = {}) {
  const sel = avecResultats ? `${COLONNES_SANS}, distribution` : COLONNES_SANS;
  const brutes = database.prepare(`SELECT ${sel} FROM engine_picks WHERE market_id = 'result' AND date >= ? AND date <= ? ORDER BY fixture_key, version`).all(de, a);
  const evenementsPayants = database.prepare(`SELECT id FROM odds_events WHERE source = 'odds-api' AND home_id = ? AND away_id = ? AND date = ?`);
  const relevesDe = database.prepare(`SELECT bookmaker, selection, releve_at, price FROM odds_quotes WHERE event_id = ? AND market = '1x2' AND kind = 'snapshot'`);
  const clotures = database.prepare(`SELECT e.source, q.bookmaker, q.selection, q.releve_at, q.price FROM odds_events e JOIN odds_quotes q ON q.event_id = e.id
    WHERE e.home_id = ? AND e.away_id = ? AND e.date = ? AND e.source NOT IN ('odds-api', 'saisie') AND q.market = '1x2' AND q.kind = 'close'`);
  const issue = avecResultats
    ? database.prepare(`SELECT t.attribue, t.prolongation, t.bp, t.bc, t.bp90, t.bc90 FROM day_matches d JOIN team_day t ON t.rencontre = d.rencontre AND t.camp = 1 WHERE d.home = ? AND d.away = ? AND d.date = ?`)
    : null;
  const bilan = { lues: brutes.length, parOrigine: {}, ecartees: { avance: 0, apresCoupDEnvoi: 0, sansIdentifiant: 0 } };
  // La révision 1 de la nuit ; la dernière révision du coup d'envoi d'avant le coup d'envoi.
  const retenues = new Map();
  for (const l of brutes) {
    const o = origineDe(l.origin);
    if (o === 'avance') {
      bilan.ecartees.avance++;
      continue;
    }
    if (o === 'nuit' && l.version !== 1) continue;
    if (o === 'coup-d-envoi') {
      if (l.kickoff && l.recorded_at > l.kickoff) {
        bilan.ecartees.apresCoupDEnvoi++;
        continue;
      }
    }
    if (o !== 'nuit' && o !== 'coup-d-envoi') continue;
    const k = `${l.fixture_key}|${o}`;
    const deja = retenues.get(k);
    if (!deja || l.version > deja.version) retenues.set(k, l);
  }
  const lignes = [];
  for (const l of retenues.values()) {
    const o = origineDe(l.origin);
    const h = numero(l.home_id);
    const x = numero(l.away_id);
    if (h === null || x === null) {
      bilan.ecartees.sansIdentifiant++;
      continue;
    }
    const releves = evenementsPayants.all(l.home_id, l.away_id, l.date).flatMap((e) => relevesDe.all(e.id));
    const ingredients = ingredientsDe({ ligne: l, releves });
    const cl = clotures.all(l.home_id, l.away_id, l.date);
    const ligne = {
      cle: l.fixture_key,
      origine: o,
      date: l.date,
      kickoff: l.kickoff,
      recordedAt: l.recorded_at,
      engineVersion: l.engine_version,
      league: l.league,
      ingredients,
      aCloture: cl.length > 0
    };
    if (avecResultats) {
      ligne.p = distributionDe(l.distribution);
      ligne.q = clotureGratuite(cl);
      const r = issue.get(h, x, l.date);
      ligne.y = issueA90(r);
    }
    lignes.push(ligne);
    const b = (bilan.parOrigine[o] ??= { lignes: 0, avecCloture: 0, parAncre: {} });
    b.lignes++;
    if (ligne.aCloture) b.avecCloture++;
    b.parAncre[ingredients.ancre] = (b.parAncre[ingredients.ancre] ?? 0) + 1;
  }
  lignes.sort((p, q) => (p.date < q.date ? -1 : p.date > q.date ? 1 : p.cle < q.cle ? -1 : p.cle > q.cle ? 1 : p.origine < q.origine ? -1 : 1));
  return { lignes, bilan };
}

/** La distribution 1N2 gelée ({"issues":{home,draw,away}}) en [3], ou null. */
export function distributionDe(texte) {
  try {
    const d = JSON.parse(texte ?? 'null')?.issues;
    const p = [d?.home, d?.draw, d?.away];
    return p.every((x) => fini(x) && x > 0) ? p : null;
  } catch {
    return null;
  }
}

/** La clôture gratuite dé-margée : par livre (source + bookmaker) le dernier relevé de chaque issue, méthode puissance, puis la moyenne renormalisée. */
export function clotureGratuite(lignes) {
  const parLivre = new Map();
  for (const l of lignes ?? []) {
    const k = `${l.source}|${l.bookmaker}`;
    const b = parLivre.get(k) ?? {};
    if (!b[l.selection] || l.releve_at > b[l.selection].t) b[l.selection] = { t: l.releve_at, price: l.price };
    parLivre.set(k, b);
  }
  const lus = [];
  for (const b of parLivre.values()) {
    if (!(b.home?.price > 1 && b.draw?.price > 1 && b.away?.price > 1)) continue;
    const r = removeMargin([b.home.price, b.draw.price, b.away.price]);
    if (!r.anomaly) lus.push(r.probabilities);
  }
  if (!lus.length) return null;
  const s = [0, 1, 2].map((i) => lus.reduce((t, p) => t + p[i], 0) / lus.length);
  const t = s[0] + s[1] + s[2];
  return s.map((x) => x / t);
}

/** L'issue 1N2 à la 90e (0, 1, 2) d'une ligne du camp qui reçoit ; null pour un match attribué, sans score, ou prolongé sans score de la 90e. */
export function issueA90(r) {
  if (!r || r.attribue === 1) return null;
  const d = r.prolongation === 1 ? r.bp90 : r.bp;
  const e = r.prolongation === 1 ? r.bc90 : r.bc;
  if (!fini(d) || !fini(e)) return null;
  return d > e ? 0 : d === e ? 1 : 2;
}
