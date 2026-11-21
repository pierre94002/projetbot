/**
 * entreesDuDirect.js — LE PRONOSTIC D'AVANT-MATCH D'UN MATCH EN DIRECT : la ligne « service » de la dernière nuit complète
 * (étape 46 du plan, lot 1, partie B ; conception § 3.2, critique R9, R11 point 2, R37 point 8).
 * -----------------------------------------------------------------------
 * LECTURE SEULE : des SELECT par la clé primaire de simulation_matchs (plus simulation_state et sqlite_master) ; ni
 * écriture, ni réseau, ni horloge (le coup d'envoi vient de la boucle de E, l'heure du contrôleur).
 *
 * ligneDeService({ homeId, awayId, kickoff, database, nuit })
 *   1. la dernière nuit COMPLÈTE : `lireEtat().nuits.matchs.calculeLe` (une nuit en cours de rangement est ignorée, règle
 *      de la 28) ; `nuit` peut être passée par l'appelant (lue une fois par requête) ;
 *   2. les clés candidates, TOUJOURS par cleDeNuit() (identifiants FotMob, jamais un nom ni les colonnes home_id) : le jour
 *      UTC du coup d'envoi FotMob, puis la veille et le lendemain (le calendrier seul date parfois un match à midi d'un
 *      autre jour UTC) ;
 *   3. par clé, la dernière ligne `service` d'avant le coup d'envoi : apres_coup_d_envoi = 0, calcule_le ≤ nuit et
 *      < coup d'envoi ; jamais une ligne `candidate` ; jamais ligneDuMatch() (elle ne filtre pas l'après-coup d'envoi) ;
 *   4. le jour exact est pris d'office ; la veille ou le lendemain seulement à heure inconnue (kickoff_connu = 0) ou à
 *      moins de 3 h du coup d'envoi FotMob ;
 *   5. contrôles : λ et μ finis et > 0, ρ fini, grille connue (GRILLES) — sinon « ligne-illisible » ; `fair` relu (trois
 *      probabilités finies), sinon null.
 * Rend { trouve: true, raison: null, cle, nuit, calculeLe, grille, engineVersion, candidateHash, lambda, mu, rho, fair,
 *   oddsSource, oddsAt, kickoff, kickoffConnu, date, decalageJours, ageAuCoupDEnvoiH, coteAgeAuCoupDEnvoiH } — la
 *   provenance du pronostic d'avant-match (R9 : source et heure des cotes, âge de la ligne au coup d'envoi) —, ou
 *   { trouve: false, raison, cle, nuit } avec `raison` dans RAISONS_SANS_LIGNE (une phrase chacune dans ui/src/utils/direct.js).
 * -----------------------------------------------------------------------
 */

import { cleDeNuit } from '../simulation/simulationRead.js';
import { lireEtat } from '../simulation/etatSimulation.js';
import { GRILLES } from '../simulation/entreesSimulation.js';
import { lireLeFair } from './calculDuDirect.js';

/** Les raisons d'un pronostic d'avant-match introuvable (conception § 3.2) ; la structure de la réponse reste complète. */
export const RAISONS_SANS_LIGNE = Object.freeze(['sans-identifiant', 'sans-coup-d-envoi', 'table-absente', 'aucune-nuit', 'aucune-ligne', 'calculee-apres', 'ligne-illisible']);

const HEURE_MS = 3_600_000;
const JOUR_MS = 24 * HEURE_MS;
/** Une ligne de la veille ou du lendemain : acceptée seulement à moins de 3 h du coup d'envoi FotMob (ou à heure inconnue). */
const ECART_AUTRE_JOUR_MS = 3 * HEURE_MS;
const GRILLES_CONNUES = Object.freeze(Object.values(GRILLES));

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const idValide = (x) => typeof x === 'string' && /^(?:fotmob-)?\d+$/.test(x.trim()) && Number(x.trim().replace('fotmob-', '')) > 0;
const dateDe = (v) => (typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v) : Number.NaN);

/** La table existe-t-elle (un serveur d'avant la 28 n'a pas simulation_matchs) ? */
function tableExiste(database, nom) {
  return Boolean(database.prepare("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = ?").get(nom));
}

/** La dernière nuit COMPLÈTE des matchs (calcule_le), ou null. */
export function nuitComplete(database) {
  return lireEtat({ database }).nuits?.matchs?.calculeLe ?? null;
}

const SELECT_LIGNE =
  "SELECT fixture_key, calcule_le, grille, engine_version, candidate_hash, lambda, mu, rho, fair, odds_source, odds_at, kickoff, kickoff_connu, date FROM simulation_matchs WHERE fixture_key = ? AND role = 'service' AND apres_coup_d_envoi = 0 AND calcule_le <= ? AND calcule_le < ? ORDER BY calcule_le DESC LIMIT 1";
const SELECT_APRES = "SELECT 1 AS x FROM simulation_matchs WHERE fixture_key = ? AND role = 'service' AND (apres_coup_d_envoi = 1 OR calcule_le >= ?) LIMIT 1";

/** LA LIGNE « SERVICE » d'un match en direct (voir l'en-tête). Ne lève pas : une base illisible rend « ligne-illisible ». */
export function ligneDeService({ homeId, awayId, kickoff, database, nuit = undefined } = {}) {
  const absent = (raison, cle = null, n = null) => ({ trouve: false, raison, cle, nuit: n });
  if (!idValide(homeId) || !idValide(awayId)) return absent('sans-identifiant');
  const coup = dateDe(kickoff);
  if (!fini(coup)) return absent('sans-coup-d-envoi');
  const coupIso = new Date(coup).toISOString();
  const cles = [0, -1, 1].map((decalage) => ({ decalage, cle: cleDeNuit({ homeId, awayId, commenceTime: new Date(coup + decalage * JOUR_MS).toISOString() }) }));
  if (!cles[0].cle) return absent('sans-identifiant');
  try {
    if (!tableExiste(database, 'simulation_matchs')) return absent('table-absente', cles[0].cle);
    const n = nuit === undefined ? nuitComplete(database) : nuit;
    if (!n) return absent('aucune-nuit', cles[0].cle);
    const lire = database.prepare(SELECT_LIGNE);
    for (const { decalage, cle } of cles) {
      const r = lire.get(cle, n, coupIso);
      if (!r) continue;
      if (decalage !== 0) {
        const k = dateDe(r.kickoff);
        if (!(r.kickoff_connu === 0 || (fini(k) && Math.abs(k - coup) < ECART_AUTRE_JOUR_MS))) continue;
      }
      return lue(r, { coup, nuit: n, decalage });
    }
    const apres = database.prepare(SELECT_APRES);
    const calculeeApres = cles.some(({ cle }) => Boolean(apres.get(cle, coupIso)));
    return absent(calculeeApres ? 'calculee-apres' : 'aucune-ligne', cles[0].cle, n);
  } catch {
    return absent('ligne-illisible', cles[0].cle);
  }
}

/** Une ligne lue, contrôlée (λ, μ, ρ, grille), sa provenance (R9). */
function lue(r, { coup, nuit, decalage }) {
  if (!fini(r.lambda) || !fini(r.mu) || r.lambda <= 0 || r.mu <= 0 || !fini(r.rho) || !GRILLES_CONNUES.includes(r.grille)) return { trouve: false, raison: 'ligne-illisible', cle: r.fixture_key, nuit };
  const calcule = dateDe(r.calcule_le);
  const cotes = dateDe(r.odds_at);
  return {
    trouve: true,
    raison: null,
    cle: r.fixture_key,
    nuit,
    calculeLe: r.calcule_le,
    grille: r.grille,
    engineVersion: r.engine_version ?? null,
    candidateHash: r.candidate_hash ?? null,
    lambda: r.lambda,
    mu: r.mu,
    rho: r.rho,
    fair: lireLeFair(r.fair),
    oddsSource: r.odds_source ?? null,
    oddsAt: r.odds_at ?? null,
    kickoff: r.kickoff ?? null,
    kickoffConnu: r.kickoff_connu !== 0,
    date: r.date ?? null,
    decalageJours: decalage,
    ageAuCoupDEnvoiH: fini(calcule) ? (coup - calcule) / HEURE_MS : null,
    coteAgeAuCoupDEnvoiH: fini(cotes) ? (coup - cotes) / HEURE_MS : null
  };
}
