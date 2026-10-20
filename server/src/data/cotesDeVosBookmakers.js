/**
 * cotesDeVosBookmakers.js — l'heure de chaque cote payante, lue dans les archives (étape 7 du plan).
 * -----------------------------------------------------------------------
 * Le moteur lit les cotes de vos bookmakers dans l'instantané The Odds API
 * (data/fixtures/odds/odds-snapshot.json), réécrit d'un bloc à chaque relevé
 * manuel : il n'a pas l'heure de chaque cote. Les Enregistreurs (étape E)
 * archivent chaque relevé dans odds_events / odds_quotes (source
 * « odds-api ») avec l'heure du relevé : c'est là que cette heure se lit.
 *
 * Pour chaque bookmaker que le moteur voit sur un match :
 *   - « archive »     l'archive a ce match, et le dernier relevé archivé de ce
 *                     bookmaker donne EXACTEMENT les mêmes cotes 1N2 : son
 *                     heure est l'heure de la cote ;
 *   - « instantane »  l'archive est en retard sur l'instantané (relevé fait il
 *                     y a moins d'une minute, ou enregistreurs coupés) : l'heure
 *                     est celle du fichier, qui EST l'heure du relevé (c'est
 *                     elle que l'archive lui donne, cf. cotesPayantes.js) ;
 *   - sinon           heure inconnue (« archive-differente », « absente ») :
 *                     la cote est à rafraîchir.
 * Les cotes gratuites (matchs du calendrier, `oddsSource: 'gratuit'`) ne sont
 * jamais jouables : aucune heure n'est cherchée pour elles.
 *
 * Lecture seule : aucune écriture, aucun appel réseau, aucun crédit.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import { openDb } from './db/matchStatsDb.js';
import { getFixturePaths } from './repositories/fixturesRepository.js';
import { lireReglageFraicheur } from './repositories/fraicheurCotesRepository.js';
import { SOURCE_PAYANTE } from './enregistreurs/cotesPayantes.js';

const EPSILON = 1e-9;
const memeCote = (a, b) => Number.isFinite(Number(a)) && Number.isFinite(Number(b)) && Math.abs(Number(a) - Number(b)) < EPSILON;

/** Les cotes payantes du match viennent-elles de vos bookmakers (instantané The Odds API) ? */
export const coteDeLInstantanePayant = (match) => Boolean(match?.matchId) && Boolean(match?.hasOdds) && match?.oddsSource !== 'gratuit' && !String(match.matchId).startsWith('cal-');

/**
 * L'heure de chaque cote payante d'un match (cf. en-tête).
 * @returns {{ parBookmaker: Object<string, { releveAt: string|null, origine: string }>, archive: string|null, fichier: { chemin: string, releveAt: string|null }|null }}
 */
export function heuresDesCotesPayantes(match, { database = null, fichier = getFixturePaths().odds } = {}) {
  const sortie = { parBookmaker: {}, archive: null, fichier: null };
  if (!coteDeLInstantanePayant(match)) return sortie;
  let fichierAt = null;
  try {
    fichierAt = fs.statSync(fichier).mtime.toISOString();
  } catch {
    fichierAt = null;
  }
  sortie.fichier = { chemin: fichier, releveAt: fichierAt };

  let lignes = [];
  try {
    lignes = (database ?? openDb())
      .prepare(`SELECT q.bookmaker, q.selection, q.releve_at AS releveAt, q.price
                FROM odds_events e JOIN odds_quotes q ON q.event_id = e.id
                WHERE e.source = ? AND e.source_event = ? AND q.market = '1x2' AND q.kind IN ('snapshot', 'live')`)
      .all(SOURCE_PAYANTE, String(match.matchId));
  } catch {
    lignes = []; // base d'avant l'étape E, ou illisible : l'heure du fichier seule, si l'archive n'a rien
  }
  // Le dernier relevé archivé de chaque bookmaker : ses trois cotes.
  const parLivre = new Map();
  for (const l of lignes) {
    const actuel = parLivre.get(l.bookmaker);
    if (!actuel || l.releveAt > actuel.releveAt) parLivre.set(l.bookmaker, { releveAt: l.releveAt, prix: { [l.selection]: l.price } });
    else if (l.releveAt === actuel.releveAt) actuel.prix[l.selection] = l.price;
  }
  const derniereArchive = lignes.reduce((max, l) => (!max || l.releveAt > max ? l.releveAt : max), null);
  sortie.archive = derniereArchive;

  for (const b of match.marketOdds?.byBookmaker ?? []) {
    if (!b?.key || b.referenceOnly) continue;
    const a = parLivre.get(b.key);
    if (a && memeCote(a.prix.home, b.odds1) && memeCote(a.prix.draw, b.oddsDraw) && memeCote(a.prix.away, b.odds2)) {
      sortie.parBookmaker[b.key] = { releveAt: a.releveAt, origine: 'archive' };
    } else if (fichierAt && (!derniereArchive || fichierAt > derniereArchive)) {
      sortie.parBookmaker[b.key] = { releveAt: fichierAt, origine: 'instantane' };
    } else {
      sortie.parBookmaker[b.key] = { releveAt: null, origine: a ? 'archive-differente' : 'absente' };
    }
  }
  return sortie;
}

/**
 * Ce que le moteur reçoit pour juger la fraîcheur des cotes d'un match
 * (`match.fraicheurCotes`, cf. core/engine/fraicheurCotes.js) : l'heure de
 * chaque cote, le coup d'envoi, le réglage. Ne lève jamais : une archive
 * illisible donne des heures inconnues, donc « à rafraîchir », jamais du vert.
 */
export function fraicheurDuMatch(match, { database = null, maintenant = Date.now(), reglage = null, fichier = undefined } = {}) {
  let heures = { parBookmaker: {}, archive: null, fichier: null };
  try {
    heures = heuresDesCotesPayantes(match, { database, ...(fichier ? { fichier } : {}) });
  } catch {
    heures = { parBookmaker: {}, archive: null, fichier: null };
  }
  let r = reglage;
  if (!r) {
    try {
      r = lireReglageFraicheur().reglage;
    } catch {
      r = null;
    }
  }
  return {
    maintenant,
    coupDEnvoi: match?.commenceTime ?? null,
    // L'heure exacte du coup d'envoi : celle des cotes (payantes ou gratuites) ; le calendrier seul ne connaît que le jour.
    heureSure: Boolean(match?.hasOdds),
    reglage: r,
    source: coteDeLInstantanePayant(match) ? 'The Odds API (relevé manuel)' : null,
    parBookmaker: heures.parBookmaker,
    archive: heures.archive,
    fichier: heures.fichier
  };
}
