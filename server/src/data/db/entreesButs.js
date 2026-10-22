/**
 * entreesButs.js — ce que le modèle de buts unique lit du magasin pour un match (étape 27 du plan, 21/10/2026).
 * -----------------------------------------------------------------------
 * Le LECTEUR DU DIRECT du modèle de buts (core/engine/goalModel.js) : appelé
 * par sports/football/model.js#resolveGoalInputs seulement quand les réglages
 * portent la clé `modeleDeButs` — sans elle, jamais (zéro lecture, zéro coût).
 * Le banc d'essai ne le lit jamais : il pose `entreesButs` sur le match.
 *
 * Tout est lu « AVANT LE JOUR J » (J = jour UTC du coup d'envoi) :
 *   - les FORCES des deux clubs : la dernière ligne de forces_buts de leur
 *     empreinte (empreinteDesForces) de jour < J — l'état après leurs matchs
 *     d'avant J ; clubs par leur numéro FotMob (`scoreInputs.*.teamId`, sinon
 *     l'annuaire strict clubDuMagasin, jamais une ressemblance de noms) ;
 *   - les MOYENNES DU CHAMPIONNAT à la 90e minute : les journées de
 *     forces_buts_ligues de la saison de J et des 365 jours d'avant, J EXCLU
 *     (moyennesAvant) ;
 *   - le PLUS/MOINS 2,5 relevé : cotes `ou` gratuites des rencontres du match
 *     (identifiants FotMob et jour ± 1, ou sa clé), la moyenne football-data
 *     sinon les livres ESPN (livresDuPlusMoins, ancrageDuPlusMoins) — Smarkets,
 *     cotes payantes et saisies jamais ; open/preclose toujours, snapshot/close
 *     relevés au plus tard à la COUPURE = min(maintenant, coup d'envoi si son
 *     heure est sûre, sinon minuit UTC du jour J), live jamais.
 * `maintenant` est OBLIGATOIRE (l'appelant le passe : analyzeMatch le reçoit de
 * la passe, du gel ou de la requête) — jamais l'horloge lue ici.
 * Tables absentes, rangement en cours (`en_cours`), empreinte pas encore
 * calculée : `forces: null`, `ligue: null`, et la raison dans `manques` (la
 * provenance le montre à l'écran). Jamais une exception pour une donnée
 * absente. Lit la base de l'appelant (ou celle du magasin), n'y écrit jamais.
 * -----------------------------------------------------------------------
 */

import { openDb } from './matchStatsDb.js';
import { clubDuMagasin } from './oddsProfileRead.js';
import { seasonOf } from '../providers/seasonWindows.js';
import { empreinteDesForces, moyennesAvant, debutDes365Jours, livresDuPlusMoins, ancrageDuPlusMoins, SOURCE_FD_PLUS_MOINS, SOURCE_ESPN_PLUS_MOINS } from '../../core/engine/goalModel.js';

/** Le numéro FotMob d'un identifiant (« fotmob-8456 » ou 8456) ; null sinon (un club football-data « fd:12 » n'en a pas). */
export function numeroFotmob(id) {
  if (id === null || id === undefined) return null;
  const m = /^fotmob-([1-9]\d*)$/.exec(String(id));
  const n = m ? Number(m[1]) : /^[1-9]\d*$/.test(String(id)) ? Number(id) : null;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

const instant = (x) => {
  const t = x instanceof Date ? x.getTime() : typeof x === 'number' ? x : Date.parse(String(x ?? ''));
  return Number.isFinite(t) ? t : null;
};

/** La coupure du plus/moins : min(maintenant, coup d'envoi quand son heure est sûre, sinon minuit UTC du jour J). */
export function coupureDuDirect({ jour, coupDEnvoi = null, heureSure = false, maintenant }) {
  const ko = heureSure ? instant(coupDEnvoi) : null;
  const borne = ko ?? Date.parse(`${jour}T00:00:00.000Z`);
  const t = Math.min(instant(maintenant), borne);
  return { instant: new Date(t).toISOString(), jour, heureSure: true };
}

/** L'état des tables des forces (forces_buts_state) : { absente, enCours, empreintes } ; jamais d'écriture. */
function etatDesForces(database) {
  try {
    const brut = Object.fromEntries(database.prepare('SELECT cle, valeur FROM forces_buts_state').all().map((r) => [r.cle, r.valeur]));
    let empreintes = [];
    try {
      empreintes = JSON.parse(brut.empreintes ?? '[]');
    } catch {
      empreintes = [];
    }
    return { absente: !brut.calcule_le, enCours: Boolean(brut.en_cours), empreintes: Array.isArray(empreintes) ? empreintes : [] };
  } catch (error) {
    if (/no such table/i.test(String(error?.message ?? ''))) return { absente: true, enCours: false, empreintes: [] };
    throw error;
  }
}

/**
 * LES ENTRÉES DU MODÈLE DE BUTS d'un match, lues dans le magasin. `match` : l'objet du moteur (league, home, away,
 * commenceTime, scoreInputs, hasOdds, fraicheurCotes, matchKey) ; `reglages` : reglagesDuModeleDeButs ;
 * `maintenant` : obligatoire. Rend { forces: { home, away } | null, ligue | null, plusMoins | null,
 * origine: 'magasin', manques: [...] }.
 */
export function lireEntreesButs({ match, reglages, database = openDb(), maintenant } = {}) {
  if (instant(maintenant) === null) throw new Error('lireEntreesButs : « maintenant » est obligatoire (l’heure du calcul, passée par l’appelant).');
  const manques = [];
  const ko = instant(match?.commenceTime);
  if (ko === null || !match?.league) return { forces: null, ligue: null, plusMoins: null, origine: 'magasin', manques: ['jour du match inconnu'] };
  const jour = new Date(ko).toISOString().slice(0, 10);
  const etat = etatDesForces(database);
  const empreinte = empreinteDesForces(reglages);
  const tablesLisibles = !etat.absente && !etat.enCours;
  if (etat.absente) manques.push('forces de buts jamais calculées');
  else if (etat.enCours) manques.push('forces de buts en cours de rangement');
  const club = (cote) => numeroFotmob(match.scoreInputs?.[cote]?.teamId) ?? numeroFotmob(safe(() => clubDuMagasin(cote === 'home' ? match.home : match.away, match.league, database)));
  const ids = { home: club('home'), away: club('away') };

  // 1. Les forces des deux clubs (dernière ligne de jour < J de leur empreinte).
  let forces = null;
  if (tablesLisibles && !etat.empreintes.includes(empreinte)) manques.push(`forces de buts pas encore calculées pour ces réglages (${empreinte})`);
  else if (tablesLisibles) {
    const lire = database.prepare('SELECT ligue, n, nx, sa, wa, sd, wd, sga, wga, sgd, wgd FROM forces_buts WHERE reglages = ? AND club = ? AND jour < ? ORDER BY jour DESC LIMIT 1');
    const etatDe = (cote) => {
      const id = ids[cote];
      if (id === null) {
        manques.push(`club inconnu du magasin (${cote === 'home' ? 'domicile' : 'extérieur'})`);
        return null;
      }
      const r = lire.get(empreinte, id, jour);
      if (!r) return null;
      return { sa: r.sa, wa: r.wa, sd: r.sd, wd: r.wd, sga: r.sga, wga: r.wga, sgd: r.sgd, wgd: r.wgd, n: r.n, nx: r.nx, ligue: r.ligue ?? null };
    };
    forces = { home: etatDe('home'), away: etatDe('away') };
  }

  // 2. Les moyennes du championnat avant J (la saison de J et les 365 jours d'avant ; J exclu).
  let ligue = null;
  if (tablesLisibles) {
    const saison = seasonOf(match.league, jour);
    const jours = database
      .prepare('SELECT jour, saison, n, bd, be, nx, xd, xe FROM forces_buts_ligues WHERE league = ? AND jour < ? AND (saison = ? OR jour >= ?) ORDER BY jour')
      .all(match.league, jour, saison, debutDes365Jours(jour));
    ligue = moyennesAvant(jours, { jour, saison });
  }

  // 3. Le plus/moins 2,5 relevé avant la coupure.
  const heureSure = Boolean(match.hasOdds) || match.fraicheurCotes?.heureSure === true;
  const coupure = coupureDuDirect({ jour, coupDEnvoi: match.commenceTime, heureSure, maintenant });
  const idDom = ids.home;
  const idExt = ids.away;
  const conditions = [];
  const params = [];
  if (idDom !== null && idExt !== null) {
    conditions.push("(e.home_id = ? AND e.away_id = ? AND e.date >= date(?, '-1 day') AND e.date <= date(?, '+1 day'))");
    params.push(`fotmob-${idDom}`, `fotmob-${idExt}`, jour, jour);
  }
  if (match.matchKey) {
    conditions.push('e.match_key = ?');
    params.push(match.matchKey);
  }
  let plusMoins = null;
  if (conditions.length) {
    const cotes = database
      .prepare(`SELECT e.source, q.bookmaker, q.selection, q.line, q.kind, q.releve_at AS releveAt, q.price
                FROM odds_events e JOIN odds_quotes q ON q.event_id = e.id
                WHERE (${conditions.join(' OR ')}) AND e.source IN (?, ?) AND q.market = 'ou' AND q.line = 2.5 AND q.kind <> 'live'`)
      .all(...params, SOURCE_FD_PLUS_MOINS.source, SOURCE_ESPN_PLUS_MOINS);
    plusMoins = ancrageDuPlusMoins(livresDuPlusMoins(cotes, coupure));
  }
  if (!plusMoins) manques.push('aucune cote plus/moins 2,5 relevée pour ce match');
  return { forces, ligue, plusMoins, origine: 'magasin', manques };
}

function safe(f) {
  try {
    return f();
  } catch {
    return null;
  }
}
