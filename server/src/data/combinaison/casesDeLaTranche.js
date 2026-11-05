/**
 * casesDeLaTranche.js — LA CASE F DE LA CONFIANCE : la calibration de la tranche, PAR VERSION DU MOTEUR × marché × dixième,
 * sur les matchs JOUÉS AVANT le jour du pronostic (étape 38, lot 1b, 04/11/2026 ; conception §2.1 « F », critique, constat 3).
 * -----------------------------------------------------------------------
 * Les pronostics gelés d'engine_picks (la révision 1, gelée avant le coup d'envoi — la « première valeur » de la calibration
 * du mois), réglés au magasin par les MÊMES règles que la calibration du mois (calibration.js : lecteurDesRencontres,
 * revisionsRetenues, issueDuPronostic) et jugés case par case par le MÊME juge (jugerLaCase : jamais sous 200 matchs,
 * « trop-haut / trop-bas / dans-le-hasard / trop-peu »). Jamais la table mensuelle des calibrations (elle mélange les
 * versions) : une case d'une version n'étiquette jamais une ligne d'une autre version (T-F11).
 * ANTI-FUITE : un pronostic gelé le jour J (jour UTC de son `recorded_at`) ne lit que les matchs datés au plus tard J − 2 —
 * finis avant J à coup sûr (un match daté J − 1 peut finir après minuit) ; jamais son propre match, jamais une clôture.
 * Lit la base de l'appelant (jamais ouverte ici) ; ni horloge (les jours viennent de l'appelant), ni hasard (la graine du
 * juge de la calibration) ; n'écrit rien. Hors de l'empreinte du moteur.
 * -----------------------------------------------------------------------
 */

import { lecteurDesRencontres, issueDuPronostic, revisionsRetenues, cleNumerique, jugerLaCase, JUGE as JUGE_DE_LA_CASE } from '../calibration.js';
import { TRANCHES_DIXIEMES, trancheDe } from '../../bench/metrics.js';
import { cleDeLaCaseF } from './ingredientsDUneLigne.js';

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
/** Un jour UTC (AAAA-MM-JJ) décalé de `n` jours. */
export const plusJours = (jour, n) => new Date(Date.parse(`${jour}T00:00:00.000Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** La marge : un pronostic gelé le jour J ne lit que les matchs datés au plus tard J − 2. */
export const JOURS_DE_MARGE = 2;

/** Le dernier jour de match qui entre dans les cases d'un pronostic gelé à `recordedAt` (J − 2, J = jour UTC du gel), ou null. */
export function dernierJourDesCases(recordedAt) {
  const j = String(recordedAt ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(j) ? plusJours(j, -JOURS_DE_MARGE) : null;
}

/** Le dixième d'une probabilité (0 à 9 : les tranches de la calibration), ou null. */
export function dixiemeDe(p) {
  return fini(p) && p >= 0 && p <= 1.01 ? trancheDe(p, TRANCHES_DIXIEMES) : null;
}

const COLONNES = `fixture_key AS fixtureKey, market_key AS marketKey, version, recorded_at AS recordedAt, league, date, kickoff, home_name AS homeName,
  away_name AS awayName, home_id AS homeId, away_id AS awayId, market_id AS marketId, market, params, choice, label, probability, engine_version AS engineVersion`;

/** Un générateur mené jusqu'au bout (rend sa valeur de retour). */
function jusquAuBout(gen) {
  let r = gen.next();
  while (!r.done) r = gen.next();
  return r.value;
}

/**
 * LES PRONOSTICS RÉGLÉS des matchs datés de `du` à `au` (jours UTC, compris) : pour chaque pronostic (match × marché), sa
 * révision 1 si elle a été gelée avant le coup d'envoi, réglée au magasin. Rend { lignes: [{ fixtureKey, cle, date,
 * engineVersion, marketId, p, realise, dixieme }], bilan }. Les matchs sans identifiants FotMob, sans résultat ou
 * ambigus sont comptés, jamais rapprochés.
 */
export function pronosticsRegles(database, { du, au }) {
  const bilan = { revisions: 0, pronostics: 0, regles: 0, ecartes: {} };
  const lignes = [];
  if (!du || !au || au < du) return { lignes, bilan };
  const ecarter = (raison) => {
    bilan.ecartes[raison] = (bilan.ecartes[raison] ?? 0) + 1;
  };
  const fixtures = new Map();
  for (const r of database.prepare(`SELECT ${COLONNES} FROM engine_picks WHERE date >= ? AND date <= ? ORDER BY date, fixture_key, market_key, version`).iterate(du, au)) {
    bilan.revisions++;
    let f = fixtures.get(r.fixtureKey);
    if (!f) {
      f = { fixtureKey: r.fixtureKey, date: r.date, homeId: r.homeId, awayId: r.awayId, kickoff: null, marches: new Map() };
      fixtures.set(r.fixtureKey, f);
    }
    if (r.kickoff && Number.isFinite(Date.parse(r.kickoff))) f.kickoff = r.kickoff;
    if (!f.marches.has(r.marketKey)) f.marches.set(r.marketKey, []);
    f.marches.get(r.marketKey).push({ ...r });
  }
  if (!fixtures.size) return { lignes, bilan };
  const lire = jusquAuBout(lecteurDesRencontres(database, { du, au }));
  for (const f of fixtures.values()) {
    const rencontre = !cleNumerique(f.fixtureKey) || !f.homeId || !f.awayId ? { raison: 'sansIdentifiant' } : lire(f);
    for (const [marketKey, revs] of f.marches) {
      bilan.pronostics++;
      if (rencontre.raison) {
        ecarter(rencontre.raison);
        continue;
      }
      const { premiere, raisonPremiere } = revisionsRetenues(revs, { coupDEnvoi: rencontre.coupDEnvoi ?? f.kickoff, jour: f.date });
      if (!premiere) {
        ecarter(raisonPremiere ?? 'sansPremiere');
        continue;
      }
      const d = dixiemeDe(premiere.probability);
      if (d === null) {
        ecarter('sansProbabilite');
        continue;
      }
      const issue = issueDuPronostic(premiere, rencontre.reglement);
      if (issue.raison) {
        ecarter(issue.raison);
        continue;
      }
      bilan.regles++;
      lignes.push({
        fixtureKey: f.fixtureKey,
        cle: `${f.fixtureKey}|${marketKey}`,
        date: f.date,
        engineVersion: Number.isInteger(premiere.engineVersion) ? premiere.engineVersion : null,
        marketId: premiere.marketId,
        p: premiere.probability,
        realise: issue.realise,
        dixieme: d
      });
    }
  }
  lignes.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.cle < b.cle ? -1 : a.cle > b.cle ? 1 : 0));
  return { lignes, bilan };
}

/**
 * LES VERDICTS DES CASES demandées : `besoins` = [{ jusquA, cle }] (cle = cleDeLaCaseF) ; pour chaque jour `jusquA`, les
 * cases sont faites des lignes réglées de date ≤ jusquA (pronosticsRegles, triées), et le juge prend m = le nombre de
 * cases qui ont, à ce jour-là, au moins le minimum de matchs (comme la calibration du mois). Rend Map(`${jusquA}#${cle}` →
 * { verdict, matchs }). Incrémental : les jours sont lus dans l'ordre, chaque ligne entre une fois.
 */
export function verdictsDesCases(lignes, besoins, { juge = JUGE_DE_LA_CASE } = {}) {
  const parJour = new Map();
  for (const b of besoins ?? []) {
    if (!b?.jusquA || !b?.cle) continue;
    if (!parJour.has(b.jusquA)) parJour.set(b.jusquA, new Set());
    parJour.get(b.jusquA).add(b.cle);
  }
  const sortie = new Map();
  const cases = new Map();
  let jugeables = 0;
  let i = 0;
  for (const jusquA of [...parJour.keys()].sort()) {
    while (i < lignes.length && lignes[i].date <= jusquA) {
      const l = lignes[i++];
      if (l.engineVersion === null) continue;
      const cle = cleDeLaCaseF({ engineVersion: l.engineVersion, marketId: l.marketId, dixieme: l.dixieme });
      let c = cases.get(cle);
      if (!c) {
        c = { lignes: [], matchs: new Set() };
        cases.set(cle, c);
      }
      c.lignes.push(l);
      const avant = c.matchs.size;
      c.matchs.add(l.fixtureKey);
      if (avant < juge.minBlocs && c.matchs.size >= juge.minBlocs) jugeables++;
    }
    for (const cle of parJour.get(jusquA)) {
      const c = cases.get(cle);
      if (!c || c.matchs.size < juge.minBlocs) {
        sortie.set(`${jusquA}#${cle}`, { verdict: 'trop-peu', matchs: c ? c.matchs.size : 0 });
        continue;
      }
      const j = jugerLaCase(c.lignes, { variantes: Math.max(1, jugeables), juge });
      sortie.set(`${jusquA}#${cle}`, { verdict: j.verdict, matchs: j.matchs });
    }
  }
  return sortie;
}
