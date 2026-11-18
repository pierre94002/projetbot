/**
 * ficheApresMatch.js — LA FICHE D'APRÈS-MATCH (étape 40 du plan, lot 1b, 17/11/2026) : vert ou rouge, avec le chiffre réel.
 * -----------------------------------------------------------------------
 * Pour UNE rencontre jouée du magasin (sa clé `match_key`), ce que le match a donné et ce que deviennent :
 *   - les pronostics GELÉS du moteur (table engine_picks : la dernière valeur avant le coup d'envoi, et la première) ;
 *   - les pronostics que l'IA a commentés (le résumé du moteur gardé avec son analyse, `entry.engineSnapshot`).
 * Réglés EXACTEMENT comme au bilan de la fiabilité (data/calibration.js, importé sans retouche) : score de la 90e minute,
 * match attribué écarté, 0-0 de corners ou de tirs = non relevé, statistiques d'un match prolongé non réglables. Chaque
 * pronostic est juste, faux, ou non réglable AVEC sa raison (une clé de RAISONS_ECARTEES, et ses mots) — jamais en silence.
 *
 * LECTURE SEULE, par clé : 4 lectures (5 si le match a été prolongé : son déroulé), aucune écriture, aucune requête HTTP.
 *   1. la rencontre (matches, par sa clé primaire) ;
 *   2. les rencontres des mêmes clubs à ± 2 jours (index idx_matches_home_id) : la rencontre qu'aurait retenue le bilan ;
 *   3. ses statistiques (team_stats, par clé) ;
 *   4. le déroulé (events), SEULEMENT pour un match prolongé : lui seul donne le score de la 90e minute ;
 *   5. les pronostics gelés (engine_picks, `fixture_key IN` les trois clés possibles : la veille, le jour, le lendemain).
 * Hors du chemin de nuit : chargé par `import()` depuis matchAiAnalysis.controller.js (route libre), il n'entre dans
 * aucune fermeture d'imports du gel (contrôle : controle-gel-essai3.cjs).
 * -----------------------------------------------------------------------
 */

import { openDb } from '../db/matchStatsDb.js';
import { reglementDeLaRencontre, issueDuPronostic, revisionsRetenues, RAISONS_ECARTEES, cleNumerique, parametres } from '../calibration.js';
import { indicateursDUneRencontre } from '../db/dayTable.js';

export const VERSION_FICHE_APRES_MATCH = 1;

/** D'où viennent les chiffres de la fiche : dit sur la page, tel quel. */
export const PROVENANCE_FICHE = 'Pronostics du moteur gelés avant le coup d’envoi (table engine_picks du magasin SQLite), réglés sur le score et les statistiques du magasin FotMob (tables matches et team_stats) comme le bilan de la fiabilité : score de la 90e minute, match attribué écarté, 0-0 de corners ou de tirs = non relevé.';

/** Les phrases des états où rien ne se règle (la structure de la page reste entière). */
export const MOTS_FICHE_APRES_MATCH = Object.freeze({
  introuvable: 'Cette rencontre n’est pas (ou plus) au magasin FotMob : rien à régler.',
  sansIdentifiant: 'Les clubs de cette rencontre n’ont pas d’identifiant FotMob au magasin : ses pronostics gelés ne s’y rattachent pas.',
  aVenir: 'Le match n’a pas encore de score au magasin : les pronostics se régleront quand il sera importé.',
  sansScore: 'Rencontre au magasin sans score : rien à régler.',
  sansResultat: 'Match reporté, annulé ou arrêté (FotMob) : aucun pronostic ne se règle.',
  attribue: 'Match attribué sur tapis vert : aucun pronostic ne se règle.',
  prolongationSansScore90: 'Match prolongé dont le déroulé ne donne pas le score de la 90e minute : les buts ne se règlent pas.',
  prolongationStats: 'Match prolongé : ses corners et ses tirs couvrent 120 minutes, ils ne se règlent pas.'
});

/** Recopié de data/calibration.js (non exporté, fichier gelé) : l'essai ficheApresMatch.test.mjs compare la copie à l'original, à l'octet. */
const instant = (x) => {
  const t = Date.parse(x ?? '');
  return Number.isFinite(t) ? t : null;
};

/** Le coup d'envoi noté au magasin (meta.kickoff), ou null. */
function coupDEnvoiDuMagasin(meta) {
  try {
    const m = typeof meta === 'string' ? JSON.parse(meta) : meta;
    return instant(m?.kickoff) !== null ? m.kickoff : null;
  } catch {
    return null;
  }
}

const plusJours = (jour, n) => new Date(Date.parse(`${jour}T00:00:00.000Z`) + n * 86_400_000).toISOString().slice(0, 10);
const jourUtc = (t) => new Date(t).toISOString().slice(0, 10);
const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const HORS_JEU = /^(cancelled|abandoned|postponed)$/;
const raisonDuMeta = (meta) => {
  try {
    return String((typeof meta === 'string' ? JSON.parse(meta) : meta)?.reason ?? '');
  } catch {
    return '';
  }
};
const mots = (raison) => (raison ? (RAISONS_ECARTEES[raison] ?? raison) : null);

const COLONNES_PRONOSTIC = `fixture_key AS fixtureKey, market_key AS marketKey, version, recorded_at AS recordedAt, origin, league, date, kickoff,
         home_name AS homeName, away_name AS awayName, home_id AS homeId, away_id AS awayId, market_id AS marketId, market, params, choice, label,
         probability, engine_version AS engineVersion`;

/** L'issue d'UN pronostic (juste, faux ou non réglable et sa raison) : la règle du bilan, rien d'autre. */
function issueDe(pick, reglement, raisonDeLaRencontre) {
  if (raisonDeLaRencontre) return { issue: null, realise: null, raison: raisonDeLaRencontre, raisonTexte: mots(raisonDeLaRencontre) };
  const r = issueDuPronostic(pick, reglement);
  if (r.raison) return { issue: null, realise: null, raison: r.raison, raisonTexte: mots(r.raison) };
  return { issue: r.issue, realise: r.realise, raison: null, raisonTexte: null };
}

/** Le pronostic tel que l'écran le lit (aucune colonne interne en plus). */
function pronosticVu(p) {
  const params = parametres(p.params);
  return {
    marketKey: p.marketKey,
    marketId: p.marketId,
    market: p.market ?? null,
    label: p.label ?? null,
    choice: p.choice ?? null,
    params: params ?? null,
    probability: fini(p.probability) && p.probability >= 0 && p.probability <= 1 ? p.probability : null,
    engineVersion: Number.isInteger(p.engineVersion) ? p.engineVersion : null,
    origin: p.origin ?? null,
    version: p.version,
    recordedAt: p.recordedAt ?? null
  };
}

/**
 * LA FICHE D'UN MATCH JOUÉ. `matchKey` : la clé de la rencontre au magasin ; `entry` : l'analyse de l'IA de la page (déjà
 * passée au masque des buts par l'appelant), ou null ; `database` : le magasin (jamais ouvert ici dans un essai).
 * Rend { version, etat, message, matchKey, date, coupDEnvoi, reel, pronostics, avis, lectures, provenance }.
 * `etat` : regle | a-venir | introuvable | sans-identifiant | sans-score | reporte | attribue.
 */
export function ficheDuMatchJoue({ matchKey, entry = null, database = openDb(), maintenant = Date.now() } = {}) {
  let lectures = 0;
  const lire = (sql) => {
    lectures++;
    return database.prepare(sql);
  };
  const base = { version: VERSION_FICHE_APRES_MATCH, matchKey: matchKey ?? null, provenance: PROVENANCE_FICHE };
  const vide = (etat, message, extra = {}) => ({ ...base, etat, message, date: null, coupDEnvoi: null, reel: null, pronostics: [], avis: [], ...extra, lectures });

  if (typeof matchKey !== 'string' || !matchKey.trim()) return vide('introuvable', MOTS_FICHE_APRES_MATCH.introuvable);
  // 1. La rencontre.
  const m = lire('SELECT match_key AS matchKey, date, league, home_id AS homeId, away_id AS awayId, home_goals AS hg, away_goals AS ag, meta FROM matches WHERE match_key = ?').get(matchKey);
  if (!m) return vide('introuvable', MOTS_FICHE_APRES_MATCH.introuvable);
  const coupDEnvoi = coupDEnvoiDuMagasin(m.meta);
  const lieu = { date: m.date, coupDEnvoi };
  const indicateurs = indicateursDUneRencontre(m.meta, m.league);
  const sansScore = m.hg === null || m.hg === undefined || m.ag === null || m.ag === undefined;
  const horsJeu = sansScore && HORS_JEU.test(raisonDuMeta(m.meta));
  if (sansScore && !horsJeu && m.date >= jourUtc(maintenant)) return vide('a-venir', MOTS_FICHE_APRES_MATCH.aVenir, lieu);

  // 2. et 3. Le règlement : statistiques par clé, déroulé seulement pour un match prolongé.
  let reglement = null;
  let raisonDeLaRencontre = null;
  if (sansScore) raisonDeLaRencontre = horsJeu ? 'sansResultat' : 'sansScore';
  else {
    const ts = lire('SELECT side, total_shots, shots_on_goal, corner_kicks FROM team_stats WHERE match_key = ?').all(matchKey);
    const rencontre = { ...m };
    if (indicateurs.prolongation) rencontre.events = lire('SELECT events FROM matches WHERE match_key = ?').get(matchKey)?.events ?? null;
    reglement = reglementDeLaRencontre(rencontre, { home: ts.find((s) => s.side === 'home') ?? null, away: ts.find((s) => s.side === 'away') ?? null });
    if (reglement.attribue) raisonDeLaRencontre = 'attribue';
  }
  const reel = {
    buts: reglement?.buts ?? null,
    butsFinal: sansScore ? null : { home: m.hg, away: m.ag },
    prolongation: indicateurs.prolongation === 1,
    attribue: indicateurs.attribue === 1,
    stats: reglement?.stats ?? null,
    raisonButs: reglement?.nonReglableButs ?? (sansScore ? raisonDeLaRencontre : null),
    raisonStats: reglement?.nonReglableStats ?? null
  };

  // Les avis de l'IA : les pronostics que l'IA a commentés, réglés sur la même rencontre.
  const avis = [];
  const figes = Array.isArray(entry?.engineSnapshot?.marketPredictions) ? entry.engineSnapshot.marketPredictions : [];
  for (const f of figes) {
    if (!f || typeof f !== 'object') continue;
    const pick = { choice: f.predictedOutcome ?? null, market: f.market, label: f.predictedLabel, marketId: f.marketId, params: f.params ?? null, homeName: entry.homeName ?? null, awayName: entry.awayName ?? null };
    avis.push({ market: f.market ?? null, predictedLabel: f.predictedLabel ?? null, marketId: f.marketId ?? null, ...issueDe(pick, reglement, raisonDeLaRencontre) });
  }

  const message = raisonDeLaRencontre ? MOTS_FICHE_APRES_MATCH[raisonDeLaRencontre] : null;
  const etat = { attribue: 'attribue', sansScore: 'sans-score', sansResultat: 'reporte' }[raisonDeLaRencontre] ?? 'regle';
  if (!m.homeId || !m.awayId) return { ...base, etat: etat === 'regle' ? 'sans-identifiant' : etat, message: etat === 'regle' ? MOTS_FICHE_APRES_MATCH.sansIdentifiant : message, ...lieu, reel, pronostics: [], avis, lectures };

  // 4. Les rencontres des mêmes clubs à ± 2 jours : la règle du bilan (le jour exact, sinon à un jour près, jamais deux).
  const voisines = lire("SELECT match_key AS matchKey, date, away_id AS awayId FROM matches WHERE home_id = ? AND date >= date(?, '-2 day') AND date <= date(?, '+2 day')")
    .all(m.homeId, m.date, m.date)
    .filter((v) => v.awayId === m.awayId);
  const retenuePour = (jour) => {
    const lignes = voisines.filter((v) => v.date >= plusJours(jour, -1) && v.date <= plusJours(jour, 1));
    const exactes = lignes.filter((v) => v.date === jour);
    const retenues = exactes.length ? exactes : lignes;
    if (retenues.length === 1) return retenues[0].matchKey === matchKey ? 'celle-ci' : 'une-autre';
    return retenues.some((v) => v.matchKey === matchKey) ? 'ambigue' : 'une-autre';
  };

  // 5. Les pronostics gelés des trois clés possibles.
  const jours = [plusJours(m.date, -1), m.date, plusJours(m.date, 1)];
  const cles = jours.map((j) => `fotmob:${m.homeId}|${m.awayId}|${j}`).filter(cleNumerique);
  const parFixture = new Map();
  if (cles.length) {
    for (const r of lire(`SELECT ${COLONNES_PRONOSTIC} FROM engine_picks WHERE fixture_key IN (${cles.map(() => '?').join(', ')}) ORDER BY fixture_key, market_key, version`).all(...cles)) {
      if (!parFixture.has(r.fixtureKey)) parFixture.set(r.fixtureKey, { date: r.date, kickoff: null, marches: new Map() });
      const f = parFixture.get(r.fixtureKey);
      if (r.kickoff && instant(r.kickoff) !== null) f.kickoff = r.kickoff;
      if (!f.marches.has(r.marketKey)) f.marches.set(r.marketKey, []);
      f.marches.get(r.marketKey).push(r);
    }
  }
  const pronostics = [];
  for (const [fixtureKey, f] of parFixture) {
    const jour = fixtureKey.slice(fixtureKey.lastIndexOf('|') + 1);
    const laquelle = retenuePour(jour);
    if (laquelle === 'une-autre') continue; // le bilan les rattache à une autre rencontre : pas à cette page
    const raisonFixture = laquelle === 'ambigue' ? 'rencontreAmbigue' : raisonDeLaRencontre;
    // L'ordre du bilan (lignesDuMois) : la raison de la rencontre d'abord (clé ambiguë, sans score, reportée), puis la
    // probabilité illisible (« sansProbabilite » : ni juste ni faux, écarté comme au bilan), puis le règlement du pronostic
    // (issueDuPronostic : sans choix, tapis vert, statistique non relevée…).
    const raisonDuGele = (pick) =>
      raisonFixture && raisonFixture !== 'attribue' ? raisonFixture : pronosticVu(pick).probability === null ? 'sansProbabilite' : null;
    for (const [, revs] of f.marches) {
      // Comme le bilan : une clé ambiguë n'a pas de rencontre, donc pas de coup d'envoi du magasin (celui de la clé).
      const retenues = revisionsRetenues(revs, { coupDEnvoi: laquelle === 'ambigue' ? f.kickoff : (coupDEnvoi ?? f.kickoff), jour });
      const derniere = retenues.derniere;
      const premiere = retenues.premiere;
      const vu = pronosticVu(derniere ?? premiere ?? revs.at(-1));
      const issue = derniere ? issueDe(derniere, reglement, raisonDuGele(derniere)) : { issue: null, realise: null, raison: retenues.raisonDerniere, raisonTexte: mots(retenues.raisonDerniere) };
      // La première valeur n'est dite que si elle annonçait AUTRE CHOSE (choix ou libellé) : le moteur gèle chaque nuit, une
      // simple nouvelle version du même pronostic ne se répète pas sur la page.
      const laPremiere =
        premiere && derniere && (premiere.choice !== derniere.choice || premiere.label !== derniere.label)
          ? { label: premiere.label ?? null, choice: premiere.choice ?? null, probability: pronosticVu(premiere).probability, ...issueDe(premiere, reglement, raisonDuGele(premiere)) }
          : null;
      pronostics.push({ fixtureKey, ...vu, ...issue, premiere: laPremiere });
    }
  }
  return { ...base, etat, message, ...lieu, reel, pronostics, avis, lectures };
}
