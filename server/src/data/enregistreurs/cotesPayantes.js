/**
 * cotesPayantes.js — l'archive de chaque cote relevée chez The Odds API (étape E).
 * -----------------------------------------------------------------------
 * Le relevé payant se fait à la main (Réglages › Données, « Actualiser » :
 * liveDataSync.refreshLiveOdds), et RÉÉCRIT d'un bloc l'instantané
 * data/fixtures/odds/odds-snapshot.json : la cote d'hier n'existait plus nulle
 * part, ni l'heure de chaque cote. Ici, chaque relevé est archivé dans la base
 * (odds_events / odds_quotes, source « odds-api ») : chaque cote de chaque
 * bookmaker, marché et issue, avec l'heure du relevé — y compris celles qui
 * n'ont pas bougé depuis le relevé précédent (`garderChaqueReleve`).
 *
 * Rien n'est branché sur le relevé payant lui-même : le fichier est le relevé.
 * Sa date de modification (posée par saveOddsMatches au moment du relevé)
 * est l'heure de chaque cote. À chaque minute, si le fichier est plus récent
 * que le dernier relevé archivé, il est lu et mis en file ; un serveur arrêté
 * avant la fin de l'écriture le reprend au démarrage, sans rien doubler (la
 * clé de chaque cote porte l'heure du relevé). Aucun appel réseau, aucun
 * crédit consommé.
 *
 * L'étape 7 lira cette archive ; les écrans des cotes GRATUITES l'écartent
 * (SOURCES_PAYANTES, oddsQuotesRepository.js).
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import { openDb } from '../db/matchStatsDb.js';
import { clubDuMagasin } from '../db/oddsProfileRead.js';
import { getFixturePaths } from '../repositories/fixturesRepository.js';
import { readJsonFile } from '../../utils/atomicJson.js';
import { lireComptesEtEtats } from './depot.js';
import { mettreEnFile } from './file.js';
import { iso, jourUtc } from './communs.js';

export const SOURCE_PAYANTE = 'odds-api';
/** Marchés de The Odds API -> marchés de l'archive (mêmes noms que les sources gratuites). */
const MARCHES = { h2h: '1x2', totals: 'ou', spreads: 'ah' };

const etat = { enFileJusqua: null, derniere: null };

export function etatCotesPayantes() {
  return { ...etat.derniere };
}

/**
 * Les cotes d'un relevé (format The Odds API) normalisées pour l'archive.
 * `releveAt` : l'heure du relevé. Un relevé fait après le coup d'envoi d'un
 * match est du direct (`live`), sinon une série d'avant-match (`snapshot`).
 */
export function cotesDuReleve(matchs, { releveAt, fichier = null, database = null, resoudre = null } = {}) {
  const club = resoudre ?? ((nom, league) => {
    try {
      return database ? clubDuMagasin(nom, league, database) : null;
    } catch {
      return null;
    }
  });
  const cotes = [];
  const bilan = { matchs: 0, cotes: 0, ignorees: 0 };
  for (const m of matchs ?? []) {
    if (!m?.id || !m.home_team || !m.away_team || !Array.isArray(m.bookmakers)) {
      bilan.ignorees++;
      continue;
    }
    const coup = Date.parse(m.commence_time ?? '');
    if (!Number.isFinite(coup)) {
      bilan.ignorees++;
      continue;
    }
    bilan.matchs++;
    const league = m.sport_title ?? m.sport_key ?? null;
    const homeId = league ? club(m.home_team, league) : null;
    const awayId = league ? club(m.away_team, league) : null;
    const kind = Date.parse(releveAt) >= coup ? 'live' : 'snapshot';
    const provenance = `The Odds API · relevé manuel du ${releveAt}${fichier ? ` · ${fichier}` : ''}`;
    for (const b of m.bookmakers) {
      if (!b?.key) continue;
      for (const mk of b.markets ?? []) {
        const market = MARCHES[mk?.key];
        if (!market) {
          bilan.ignorees += (mk?.outcomes ?? []).length;
          continue;
        }
        for (const o of mk.outcomes ?? []) {
          let selection = null;
          if (market === '1x2') selection = o.name === m.home_team ? 'home' : o.name === m.away_team ? 'away' : /^draw$/i.test(String(o.name)) ? 'draw' : null;
          else if (market === 'ou') selection = /^over$/i.test(String(o.name)) ? 'over' : /^under$/i.test(String(o.name)) ? 'under' : null;
          else selection = o.name === m.home_team ? 'home' : o.name === m.away_team ? 'away' : null;
          if (!selection || !(Number(o.price) > 1)) {
            bilan.ignorees++;
            continue;
          }
          cotes.push({
            source: SOURCE_PAYANTE,
            sourceEvent: String(m.id),
            bookmaker: String(b.key),
            market,
            selection,
            line: market === '1x2' ? 0 : Number(o.point ?? 0),
            price: Number(o.price),
            kind,
            releveAt,
            date: jourUtc(coup),
            kickoff: m.commence_time,
            league: league ?? 'inconnue',
            homeId,
            awayId,
            homeName: m.home_team,
            awayName: m.away_team,
            provenance
          });
          bilan.cotes++;
        }
      }
    }
  }
  return { cotes, bilan };
}

/**
 * Archive l'instantané payant s'il est plus récent que le dernier relevé
 * archivé (ou mis en file). Rend ce qui a été fait ; ne lève jamais.
 */
export function archiverReleveSiNouveau({ database = openDb(), fichier = getFixturePaths().odds, maintenant = Date.now() } = {}) {
  let stat;
  try {
    stat = fs.statSync(fichier);
  } catch {
    etat.derniere = { at: iso(maintenant), fichier, statut: 'absent' };
    return etat.derniere;
  }
  const releveAt = stat.mtime.toISOString();
  let dejaArchive = null;
  try {
    dejaArchive = lireComptesEtEtats({ database }).etats.find((e) => e.recorder === 'cotes-payantes')?.sourceAt ?? null;
  } catch {
    dejaArchive = null;
  }
  const dernier = [dejaArchive, etat.enFileJusqua].filter(Boolean).sort().at(-1) ?? null;
  if (dernier && releveAt <= dernier) {
    etat.derniere = { ...(etat.derniere ?? {}), at: iso(maintenant), fichier, releveAt, statut: 'déjà archivé' };
    return etat.derniere;
  }
  const brut = readJsonFile(fichier, null);
  if (brut === null) {
    etat.derniere = { at: iso(maintenant), fichier, releveAt, statut: 'illisible' };
    return etat.derniere;
  }
  const matchs = (Array.isArray(brut) ? brut : [brut]).flatMap((b) => (Array.isArray(b?.data) ? b.data : Array.isArray(b) ? b : []));
  const { cotes, bilan } = cotesDuReleve(matchs, { releveAt, fichier, database });
  // Le marqueur part APRÈS les cotes : c'est lui qui dit « archivé ».
  mettreEnFile('cotes-payantes', [...cotes, { marqueur: { sourceAt: releveAt, detail: { fichier, releveAt, ...bilan } } }]);
  etat.enFileJusqua = releveAt;
  etat.derniere = { at: iso(maintenant), fichier, releveAt, statut: 'mis en file', ...bilan };
  return etat.derniere;
}

/** Pour les tests. */
export function __oublierCotesPayantes() {
  etat.enFileJusqua = null;
  etat.derniere = null;
}
